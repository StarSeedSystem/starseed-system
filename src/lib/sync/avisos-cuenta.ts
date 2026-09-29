"use client";

/*
 * avisos-cuenta — UN solo almacén, con la cuenta, de «esto ya lo vi / lo hice / me lo
 * recuerdas luego» de todas las ventanas que se abren solas.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Por qué existe (Alex, 2026-09-29): «hay algunas ventanas que reaparecen de las
 * configuraciones de las neuronas al reiniciar, como la de configuración de sistemas de
 * Astraura; asegura que todos los datos sean recordados en los dispositivos desde
 * cualquier medio».
 *
 * Cada MEDIO (localhost:9002, starseed-os.vercel.app, la PWA instalada, la app Tauri) tiene
 * su propio localStorage. Las ventanas de arranque guardaban su «visto» en una clave local
 * suelta —algunas con un comentario que decía «viaja con la cuenta» y no era verdad—, así
 * que cada medio nuevo, y cada reinstalación, las volvía a abrir como si nunca se hubieran
 * visto. Aquí vive el «visto» de todas, en UNA clave que SÍ viaja con la cuenta
 * (`starseed.avisos.vistos.v1`, en SYNCED_KEYS), con estas garantías:
 *
 *  · FORMA `{ v:1, ids, porNeurona }`. `ids` vale para toda la cuenta; `porNeurona[neuronId]`
 *    para lo que solo atañe a esa neurona («Neurona nueva», por ejemplo). Cada registro es
 *    `{ estado: 'visto'|'hecho'|'luego', ts, hasta? }`: `hasta` es el instante (epoch ms) hasta
 *    el que un «luego» pospone la ventana.
 *  · FUSIÓN, NO PISADO. El motor de sync resuelve cada clave entera por última escritura; con
 *    un almacén compartido eso perdería lo que otro medio marcó a la vez. Aquí la fusión es
 *    por identificador y por registro (gana el `ts` mayor; empate: hecho › visto › luego, y el
 *    `hasta` mayor): conmutativa, asociativa e idempotente, así que todos los medios convergen
 *    al mismo estado se mezclen en el orden que se mezclen. `settings-sync` la aplica al bajar
 *    (`fusionarAvisosCrudo`) y, si lo local aporta algo que la nube no tenía, lo vuelve a subir.
 *  · UN «LUEGO» NO DEGRADA UN «HECHO»: pulsar «más tarde» en una ventana que otro medio ya dio
 *    por hecha no la resucita (salvo `forzar`, que usa `olvidarAviso`).
 *  · REINICIO EXPLÍCITO: `olvidarAviso` deja un «luego» con `hasta: 0` (= pendiente ya), que al
 *    ser un registro más nuevo gana a un «hecho» viejo en TODOS los medios. Un borrado físico
 *    resucitaría con la fusión.
 *  · SNAPSHOTS ESTABLES. `useAviso` usa `useSyncExternalStore`: `getSnapshot` DEBE devolver el
 *    mismo objeto mientras nada cambie. Un snapshot nuevo en cada lectura provocó el bucle de
 *    React #185 en producción la semana pasada. Aquí el snapshot se cachea por (neurona, id) y
 *    solo se sustituye cuando el registro cambia de verdad; no incluye nada que dependa del
 *    reloj (la caducidad de un «luego» se calcula fuera, con `avisoPendiente`).
 *
 * Módulo HOJA (solo `safe-storage`): lo importan `settings-sync`, el motor de sync y las
 * ventanas sin crear ciclos. SSR-safe y nunca lanza.
 */

import { useSyncExternalStore } from "react";
import { safeGet, safeSet } from "@/lib/safe-storage";

/** Clave de localStorage (sincronizada con la cuenta: ver SYNCED_KEYS). */
export const AVISOS_KEY = "starseed.avisos.vistos.v1";
/** Evento del DOM: el almacén cambió (escritura local o llegada de la cuenta). */
export const AVISOS_EVENT = "starseed:avisos";

export type EstadoAviso = "visto" | "hecho" | "luego";

export interface RegistroAviso {
    estado: EstadoAviso;
    /** Epoch ms de la última escritura de este registro (manda la fusión). */
    ts: number;
    /** Solo en «luego»: no volver a mostrar antes de este instante (epoch ms). 0 = ya pendiente. */
    hasta?: number;
}

export interface AvisosVistos {
    v: 1;
    ids: Record<string, RegistroAviso>;
    porNeurona: Record<string, Record<string, RegistroAviso>>;
}

/** Un «luego» sin plazo explícito pospone 24 h. */
export const LUEGO_POR_DEFECTO_MS = 24 * 60 * 60 * 1000;

/** Topes: el almacén viaja en cada subida, no puede crecer sin límite. */
const MAX_IDS = 400;
const MAX_NEURONAS = 40;
const MAX_POR_NEURONA = 200;

export const AVISOS_VACIOS: AvisosVistos = Object.freeze({
    v: 1 as const,
    ids: Object.freeze({}) as Record<string, RegistroAviso>,
    porNeurona: Object.freeze({}) as Record<string, Record<string, RegistroAviso>>,
});

/* ────────────────────────────── Normalización ────────────────────────────── */

function esObjeto(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

function esEstado(x: unknown): x is EstadoAviso {
    return x === "visto" || x === "hecho" || x === "luego";
}

function registroValido(x: unknown): RegistroAviso | null {
    if (!esObjeto(x) || !esEstado(x.estado)) return null;
    const ts = typeof x.ts === "number" && Number.isFinite(x.ts) && x.ts >= 0 ? x.ts : null;
    if (ts === null) return null;
    if (x.estado === "luego") {
        const hasta = typeof x.hasta === "number" && Number.isFinite(x.hasta) && x.hasta >= 0 ? x.hasta : 0;
        return { estado: "luego", ts, hasta };
    }
    return { estado: x.estado, ts };
}

function mapaValido(x: unknown): Record<string, RegistroAviso> {
    const out: Record<string, RegistroAviso> = {};
    if (!esObjeto(x)) return out;
    for (const [id, reg] of Object.entries(x)) {
        if (!id || id === "__proto__") continue;
        const r = registroValido(reg);
        if (r) out[id] = r;
    }
    return out;
}

/** Sanea CUALQUIER valor (de la nube, de otra versión, corrupto) a un `AvisosVistos` válido. */
export function normalizarAvisos(x: unknown): AvisosVistos {
    if (!esObjeto(x)) return { v: 1, ids: {}, porNeurona: {} };
    const porNeurona: Record<string, Record<string, RegistroAviso>> = {};
    if (esObjeto(x.porNeurona)) {
        for (const [neurona, mapa] of Object.entries(x.porNeurona)) {
            if (!neurona || neurona === "__proto__") continue;
            const m = mapaValido(mapa);
            if (Object.keys(m).length > 0) porNeurona[neurona] = m;
        }
    }
    return { v: 1, ids: mapaValido(x.ids), porNeurona };
}

/* ────────────────────────────────── Fusión ────────────────────────────────── */

const RANGO: Record<EstadoAviso, number> = { hecho: 2, visto: 1, luego: 0 };

/** El registro que gana entre dos (orden total: ts, luego estado, luego hasta). */
function ganador(a: RegistroAviso, b: RegistroAviso): RegistroAviso {
    if (a.ts !== b.ts) return a.ts > b.ts ? a : b;
    if (a.estado !== b.estado) return RANGO[a.estado] > RANGO[b.estado] ? a : b;
    return (a.hasta ?? 0) >= (b.hasta ?? 0) ? a : b;
}

function fusionarMapas(a: Record<string, RegistroAviso>, b: Record<string, RegistroAviso>): Record<string, RegistroAviso> {
    const out: Record<string, RegistroAviso> = { ...a };
    for (const [id, reg] of Object.entries(b)) {
        const previo = out[id];
        out[id] = previo ? ganador(previo, reg) : reg;
    }
    return out;
}

/** Quita lo más antiguo hasta respetar el tope (nunca sacrifica un «hecho» si sobra otra cosa). */
function podarMapa(m: Record<string, RegistroAviso>, tope: number): Record<string, RegistroAviso> {
    const ids = Object.keys(m);
    if (ids.length <= tope) return m;
    const importa = (r: RegistroAviso) => (r.estado === "hecho" ? 2 : r.estado === "visto" ? 1 : 0);
    const orden = ids.sort((x, y) => importa(m[y]) - importa(m[x]) || m[y].ts - m[x].ts || (x < y ? -1 : 1));
    const out: Record<string, RegistroAviso> = {};
    for (const id of orden.slice(0, tope)) out[id] = m[id];
    return out;
}

function podar(a: AvisosVistos): AvisosVistos {
    const ids = podarMapa(a.ids, MAX_IDS);
    let porNeurona = a.porNeurona;
    const neuronas = Object.keys(porNeurona);
    const ultimo = (n: string) => Object.values(porNeurona[n]).reduce((mx, r) => Math.max(mx, r.ts), 0);
    if (neuronas.length > MAX_NEURONAS) {
        const orden = neuronas.sort((x, y) => ultimo(y) - ultimo(x) || (x < y ? -1 : 1)).slice(0, MAX_NEURONAS);
        porNeurona = Object.fromEntries(orden.map((n) => [n, porNeurona[n]]));
    }
    const recortada: Record<string, Record<string, RegistroAviso>> = {};
    for (const [n, m] of Object.entries(porNeurona)) recortada[n] = podarMapa(m, MAX_POR_NEURONA);
    return { v: 1, ids, porNeurona: recortada };
}

/**
 * Fusiona dos almacenes de avisos (saneando ambos). Conmutativa, asociativa e idempotente:
 * `fusionar(a, b)` y `fusionar(b, a)` son iguales; `fusionar(a, a)` es `a`.
 */
export function fusionarAvisos(a: unknown, b: unknown): AvisosVistos {
    const x = normalizarAvisos(a);
    const y = normalizarAvisos(b);
    const porNeurona: Record<string, Record<string, RegistroAviso>> = {};
    for (const n of new Set([...Object.keys(x.porNeurona), ...Object.keys(y.porNeurona)])) {
        porNeurona[n] = fusionarMapas(x.porNeurona[n] ?? {}, y.porNeurona[n] ?? {});
    }
    return podar({ v: 1, ids: fusionarMapas(x.ids, y.ids), porNeurona });
}

/** JSON con las claves ordenadas (jsonb reordena: la comparación no debe depender del orden). */
function estable(v: unknown): string {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${estable(o[k])}`)
        .join(",")}}`;
}

export function avisosIguales(a: unknown, b: unknown): boolean {
    return estable(normalizarAvisos(a)) === estable(normalizarAvisos(b));
}

/**
 * Gancho del motor de sync: mezcla el valor que llega de la cuenta con lo que hay en este
 * medio. `difiereDeRemoto` = lo local aportaba algo que la cuenta no tiene → hay que subirlo.
 */
export function fusionarAvisosCrudo(remoto: unknown, localRaw: string | null): { valor: AvisosVistos; difiereDeRemoto: boolean } {
    let local: unknown = null;
    if (localRaw) {
        try {
            local = JSON.parse(localRaw);
        } catch {
            local = null;
        }
    }
    const valor = fusionarAvisos(remoto, local);
    return { valor, difiereDeRemoto: !avisosIguales(valor, remoto) };
}

/* ─────────────────────────── Lectura (cacheada y estable) ─────────────────────────── */

export interface InstantaneaAviso {
    /** `null` = nunca se marcó nada. */
    estado: EstadoAviso | null;
    ts: number;
    /** Solo con «luego»; 0 si no aplica. */
    hasta: number;
}

/** Instantánea de «nunca marcado»: UNA sola, compartida (estabilidad de referencia). */
export const SIN_REGISTRO: InstantaneaAviso = Object.freeze({ estado: null, ts: 0, hasta: 0 });

let crudoCacheado: string | null | undefined;
let parseadoCacheado: AvisosVistos = AVISOS_VACIOS;
const instantaneas = new Map<string, InstantaneaAviso>();

function leerCrudo(): string | null {
    try {
        return safeGet(AVISOS_KEY);
    } catch {
        return null;
    }
}

/** El almacén ya parseado; MISMO objeto mientras el texto guardado no cambie. Nunca lanza. */
export function leerAvisos(): AvisosVistos {
    const crudo = leerCrudo();
    if (crudo === crudoCacheado) return parseadoCacheado;
    crudoCacheado = crudo;
    if (!crudo) {
        parseadoCacheado = AVISOS_VACIOS;
    } else {
        try {
            parseadoCacheado = normalizarAvisos(JSON.parse(crudo));
        } catch {
            parseadoCacheado = AVISOS_VACIOS;
        }
    }
    return parseadoCacheado;
}

export interface OpcionesAviso {
    /** Ámbito de una neurona concreta (id de `starseed.neuron.device-id`). Sin él, toda la cuenta. */
    neurona?: string;
}

function registroDe(av: AvisosVistos, id: string, neurona?: string): RegistroAviso | undefined {
    return neurona ? av.porNeurona[neurona]?.[id] : av.ids[id];
}

/**
 * Estado de un aviso. Devuelve una instantánea ESTABLE: la misma referencia mientras el
 * registro no cambie (por eso es válida como `getSnapshot` de `useSyncExternalStore`).
 */
export function estadoAviso(id: string, opts: OpcionesAviso = {}): InstantaneaAviso {
    const reg = registroDe(leerAvisos(), id, opts.neurona);
    const clave = `${opts.neurona ?? ""}\u0000${id}`;
    const previa = instantaneas.get(clave);
    if (!reg) {
        if (previa && previa.estado === null) return previa;
        instantaneas.set(clave, SIN_REGISTRO);
        return SIN_REGISTRO;
    }
    const hasta = reg.hasta ?? 0;
    if (previa && previa.estado === reg.estado && previa.ts === reg.ts && previa.hasta === hasta) return previa;
    const nueva: InstantaneaAviso = Object.freeze({ estado: reg.estado, ts: reg.ts, hasta });
    instantaneas.set(clave, nueva);
    return nueva;
}

/**
 * ¿Hay que mostrar la ventana? Sí si nunca se marcó, o si el «luego» ya venció. «Visto» y
 * «hecho» la dan por resuelta. El reloj entra aquí, no en la instantánea.
 */
export function avisoPendiente(s: InstantaneaAviso, ahora: number = Date.now()): boolean {
    if (s.estado === null) return true;
    if (s.estado === "luego") return s.hasta <= ahora;
    return false;
}

/** ¿Un «luego» sigue vigente (pospuesto y sin vencer)? */
export function avisoPospuesto(s: InstantaneaAviso, ahora: number = Date.now()): boolean {
    return s.estado === "luego" && s.hasta > ahora;
}

/** ¿Está resuelto del todo (visto o hecho)? */
export function avisoResuelto(s: InstantaneaAviso): boolean {
    return s.estado === "visto" || s.estado === "hecho";
}

/* ─────────────────────────────────── Escritura ─────────────────────────────────── */

export interface OpcionesMarca extends OpcionesAviso {
    /** Solo con «luego»: instante (epoch ms) hasta el que se pospone. Sin él, 24 h. 0 = reinicio. */
    hastaMs?: number;
    /** Permite que un «luego» sustituya a un «visto»/«hecho» (lo usa `olvidarAviso`). */
    forzar?: boolean;
    /** Solo pruebas: el «ahora» de la marca. */
    ahora?: number;
}

function avisarCambio(): void {
    try {
        if (typeof window !== "undefined") window.dispatchEvent(new Event(AVISOS_EVENT));
    } catch {
        /* sin window */
    }
}

/**
 * Marca un aviso (nunca lanza). La escritura pasa por `localStorage.setItem`, que el motor de
 * sync ya vigila: sube con su debounce, sin peticiones propias. Escribir el mismo estado otra
 * vez no cambia nada (no marca de tiempo nueva, no subida, no evento).
 */
export function marcarAviso(id: string, estado: EstadoAviso, opts: OpcionesMarca = {}): void {
    try {
        if (!id || typeof window === "undefined") return;
        const actual = leerAvisos();
        const previo = registroDe(actual, id, opts.neurona);

        if (previo && estado === "luego" && !opts.forzar && (previo.estado === "hecho" || previo.estado === "visto")) {
            return; // «más tarde» no des-hace lo ya resuelto
        }
        const ahora = opts.ahora ?? Date.now();
        let nuevo: RegistroAviso;
        if (estado === "luego") {
            const hasta = typeof opts.hastaMs === "number" && Number.isFinite(opts.hastaMs) ? Math.max(0, opts.hastaMs) : ahora + LUEGO_POR_DEFECTO_MS;
            if (previo && previo.estado === "luego" && (previo.hasta ?? 0) === hasta) return;
            nuevo = { estado, ts: 0, hasta };
        } else {
            if (previo && previo.estado === estado) return;
            nuevo = { estado, ts: 0 };
        }
        // Reloj adelantado en otro medio: la escritura nueva debe ganar siempre a la que ya vimos.
        nuevo.ts = Math.max(ahora, (previo?.ts ?? 0) + 1);

        let siguiente: AvisosVistos;
        if (opts.neurona) {
            siguiente = {
                v: 1,
                ids: actual.ids,
                porNeurona: { ...actual.porNeurona, [opts.neurona]: { ...(actual.porNeurona[opts.neurona] ?? {}), [id]: nuevo } },
            };
        } else {
            siguiente = { v: 1, ids: { ...actual.ids, [id]: nuevo }, porNeurona: actual.porNeurona };
        }
        safeSet(AVISOS_KEY, JSON.stringify(podar(siguiente)));
        avisarCambio();
    } catch {
        /* una marca de «visto» nunca debe romper la ventana */
    }
}

/**
 * Vuelve a dejar un aviso pendiente (p. ej. «reconfigurar desde cero»). Es un registro NUEVO
 * —un «luego» ya vencido—, no un borrado: así gana a un «hecho» anterior en todos los medios.
 */
export function olvidarAviso(id: string, opts: OpcionesAviso & { ahora?: number } = {}): void {
    if (estadoAviso(id, opts).estado === null) return;
    marcarAviso(id, "luego", { ...opts, hastaMs: 0, forzar: true });
}

/* ────────────────────────────────── React ────────────────────────────────── */

function suscribirAvisos(cb: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const alCambiar = () => cb();
    const alAlmacen = (e: StorageEvent) => {
        if (e.key === null || e.key === AVISOS_KEY) cb();
    };
    window.addEventListener(AVISOS_EVENT, alCambiar);
    window.addEventListener("storage", alAlmacen);
    return () => {
        window.removeEventListener(AVISOS_EVENT, alCambiar);
        window.removeEventListener("storage", alAlmacen);
    };
}

/**
 * Estado de un aviso, vivo: se actualiza al marcarlo aquí, en otra pestaña o al llegar de la
 * cuenta. La instantánea es estable (misma referencia mientras no cambie el registro).
 */
export function useAviso(id: string, opts: OpcionesAviso = {}): InstantaneaAviso {
    const neurona = opts.neurona;
    return useSyncExternalStore(
        suscribirAvisos,
        () => estadoAviso(id, { neurona }),
        () => SIN_REGISTRO,
    );
}

/** Solo pruebas: olvida las cachés (cada prueba empieza de cero). */
export function _reiniciarCacheAvisosParaPruebas(): void {
    crudoCacheado = undefined;
    parseadoCacheado = AVISOS_VACIOS;
    instantaneas.clear();
}
