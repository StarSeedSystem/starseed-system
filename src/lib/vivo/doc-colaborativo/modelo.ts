/**
 * Modelo colaborativo por unidades (2026-09-28 · apps en vivo L2).
 *
 * Un documento es una lista de BLOQUES y una presentación una lista de DIAPOSITIVAS: a las dos
 * les llamamos «unidades». Cada unidad tiene id estable, clave de orden, sello `actualizado`,
 * autor y, si se borró, una lápida (`borrado`). La fusión es por unidad:
 *
 *   · dos personas que tocan unidades DISTINTAS a la vez → sobreviven las dos ediciones;
 *   · la MISMA unidad → gana la última escritura (sello mayor; empate: autor, lápida, contenido);
 *   · un borrado es una edición más (lápida), así que no «resucita» por llegar tarde otra copia.
 *
 * `fusionar` es conmutativa, asociativa e idempotente (se prueba): da igual en qué orden lleguen
 * las copias, todos acaban viendo lo mismo. Puro: sin red, sin React.
 */

import { claveValida, compararOrden } from "./orden";

export interface UnidadColab<P> {
    id: string;
    orden: string;
    /** Sello de la última edición (ms). Siempre > el de la versión que editó (reloj de Lamport). */
    actualizado: number;
    /** uid de quien la editó por última vez ("anon" si no se sabe). */
    autor: string;
    /** Nombre visible de ese autor (para el aviso «X también editó…»). */
    autorNombre?: string;
    borrado?: true;
    /** Contenido validado. Falta en las lápidas y en las unidades que este cliente no entiende. */
    datos?: P;
    /**
     * Contenido que este cliente NO supo validar (versión más nueva, límite distinto…). Se
     * conserva tal cual para no destruir trabajo ajeno al volver a guardar; no se pinta.
     */
    crudo?: unknown;
}

export interface RegistroLWW<M> {
    valor: M;
    actualizado: number;
    autor: string;
    autorNombre?: string;
}

export interface EstadoColab<P, M> {
    unidades: UnidadColab<P>[];
    meta: RegistroLWW<M> | null;
}

export interface CambioUnidad<P> {
    id: string;
    datos?: P;
    orden?: string;
    /** true = borrar (lápida); false = volver a la vida (restaurar una versión). */
    borrar?: boolean;
}

/** Tope del sello (año ~33600): deja margen para sumar sin perder precisión. */
export const SELLO_MAXIMO = 1e15;
/** Edad a partir de la cual una lápida se puede olvidar al guardar. */
export const EDAD_LAPIDA_MS = 30 * 24 * 60 * 60 * 1000;
const RE_ID = /^[A-Za-z0-9_-]{4,64}$/;

export function idValido(v: unknown): v is string {
    return typeof v === "string" && RE_ID.test(v);
}

let secuenciaId = 0;
/** Id nuevo de unidad (no adivinable a propósito, corto, apto para el DOM y el JSON). */
export function nuevoIdUnidad(prefijo = "u"): string {
    secuenciaId = (secuenciaId + 1) % 1_679_616;
    let azar = "";
    try {
        const b = new Uint8Array(6);
        globalThis.crypto?.getRandomValues?.(b);
        azar = Array.from(b, (x) => (x % 36).toString(36)).join("");
    } catch {
        /* sin crypto: Math.random */
    }
    if (!azar || /^0+$/.test(azar)) azar = Math.random().toString(36).slice(2, 8);
    return `${prefijo}${Date.now().toString(36)}${secuenciaId.toString(36)}${azar}`.slice(0, 40);
}

// ───────────────────────────── Comparación ─────────────────────────────

/** JSON estable (claves ordenadas): comparar contenidos sin depender del orden de las claves. */
export function jsonEstable(v: unknown): string {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    if (Array.isArray(v)) return `[${v.map(jsonEstable).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${jsonEstable(o[k])}`)
        .join(",")}}`;
}

function contenidoDe(u: UnidadColab<unknown>): unknown {
    return u.datos !== undefined ? u.datos : u.crudo;
}

/** ¿Tienen dos versiones de una unidad el mismo contenido visible (datos, orden, borrado)? */
export function mismoContenido<P>(a: UnidadColab<P> | undefined, b: UnidadColab<P> | undefined): boolean {
    if (!a || !b) return a === b;
    if (!!a.borrado !== !!b.borrado) return false;
    if (a.orden !== b.orden) return false;
    if (a.borrado) return true;
    const ca = contenidoDe(a as UnidadColab<unknown>);
    const cb = contenidoDe(b as UnidadColab<unknown>);
    return ca === cb || jsonEstable(ca) === jsonEstable(cb);
}

/**
 * ¿Gana `a` sobre `b` (dos versiones de la MISMA unidad)? Orden total y determinista:
 * sello mayor · autor mayor · la lápida · el contenido mayor (JSON estable).
 */
export function gana<P>(a: UnidadColab<P>, b: UnidadColab<P>): boolean {
    if (a === b) return false;
    if (a.actualizado !== b.actualizado) return a.actualizado > b.actualizado;
    if (a.autor !== b.autor) return a.autor > b.autor;
    if (!!a.borrado !== !!b.borrado) return !!a.borrado;
    const ja = jsonEstable({ o: a.orden, c: contenidoDe(a as UnidadColab<unknown>) });
    const jb = jsonEstable({ o: b.orden, c: contenidoDe(b as UnidadColab<unknown>) });
    return ja > jb;
}

export function ganaRegistro<M>(a: RegistroLWW<M>, b: RegistroLWW<M>): boolean {
    if (a === b) return false;
    if (a.actualizado !== b.actualizado) return a.actualizado > b.actualizado;
    if (a.autor !== b.autor) return a.autor > b.autor;
    return jsonEstable(a.valor) > jsonEstable(b.valor);
}

// ───────────────────────────── Fusión ─────────────────────────────

/** Fusiona colecciones de versiones de unidades (por id, gana la última escritura). */
export function fusionarUnidades<P>(...listas: Iterable<UnidadColab<P>>[]): UnidadColab<P>[] {
    const porId = new Map<string, UnidadColab<P>>();
    for (const lista of listas) {
        for (const u of lista) {
            const actual = porId.get(u.id);
            if (!actual || gana(u, actual)) porId.set(u.id, u);
        }
    }
    return [...porId.values()].sort(compararOrden);
}

export function fusionarMeta<M>(...registros: (RegistroLWW<M> | null | undefined)[]): RegistroLWW<M> | null {
    let ganador: RegistroLWW<M> | null = null;
    for (const r of registros) {
        if (!r) continue;
        if (!ganador || ganaRegistro(r, ganador)) ganador = r;
    }
    return ganador;
}

/** Fusión de estados completos: conmutativa, asociativa e idempotente. */
export function fusionar<P, M>(...estados: EstadoColab<P, M>[]): EstadoColab<P, M> {
    return {
        unidades: fusionarUnidades(...estados.map((e) => e.unidades)),
        meta: fusionarMeta(...estados.map((e) => e.meta)),
    };
}

/** Unidades que se pintan: vivas, con contenido entendido, en orden. */
export function visibles<P>(unidades: UnidadColab<P>[]): UnidadColab<P>[] {
    return unidades.filter((u) => !u.borrado && u.datos !== undefined).sort(compararOrden);
}

/** Olvida las lápidas muy viejas (solo al guardar; nadie debería tener ya copias tan antiguas). */
export function podarLapidas<P, M>(estado: EstadoColab<P, M>, ahora: number, edadMax = EDAD_LAPIDA_MS): EstadoColab<P, M> {
    const quedan = estado.unidades.filter((u) => !u.borrado || ahora - u.actualizado < edadMax);
    return quedan.length === estado.unidades.length ? estado : { ...estado, unidades: quedan };
}

// ───────────────────────────── Edición ─────────────────────────────

/** Sello de una edición nueva sobre `previo`: el reloj, pero siempre por encima del anterior. */
export function selloNuevo(previo: number | undefined, ahora: number): number {
    return Math.min(SELLO_MAXIMO, Math.max(Math.floor(ahora), (previo ?? 0) + 1));
}

/** Aplica un cambio sobre la versión actual de una unidad (o crea la unidad). null si no procede. */
export function aplicarCambio<P>(
    previo: UnidadColab<P> | undefined,
    cambio: CambioUnidad<P>,
    autor: { uid: string; nombre?: string },
    ahora: number,
): UnidadColab<P> | null {
    // Escribir contenido en una unidad que otra persona borró a la vez la revive (gana la última
    // escritura); mover una borrada la deja borrada.
    const borrar = cambio.borrar === true || (cambio.borrar === undefined && cambio.datos === undefined && !!previo?.borrado);
    const orden = cambio.orden ?? previo?.orden;
    if (!orden || !claveValida(orden)) return null;
    const datos = borrar ? undefined : cambio.datos !== undefined ? cambio.datos : previo?.datos;
    if (!borrar && datos === undefined) return null; // nacer o revivir exige contenido
    const u: UnidadColab<P> = {
        id: cambio.id,
        orden,
        actualizado: selloNuevo(previo?.actualizado, ahora),
        autor: autor.uid,
    };
    if (autor.nombre) u.autorNombre = autor.nombre.slice(0, 80);
    if (borrar) u.borrado = true;
    else u.datos = datos;
    return u;
}

// ───────────────────────────── Lectura / escritura ─────────────────────────────

function esObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function numeroSello(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(SELLO_MAXIMO, Math.floor(v)) : null;
}

function textoCorto(v: unknown, max: number): string | undefined {
    return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** Lee UNA unidad de fuera (servidor, otra pestaña). null si ni siquiera es una unidad. */
export function leerUnidad<P>(raw: unknown, validarDatos: (d: unknown) => P | null): UnidadColab<P> | null {
    if (!esObj(raw)) return null;
    if (!idValido(raw.id) || !claveValida(raw.orden)) return null;
    const actualizado = numeroSello(raw.actualizado);
    if (actualizado === null) return null;
    const u: UnidadColab<P> = {
        id: raw.id,
        orden: raw.orden,
        actualizado,
        autor: textoCorto(raw.autor, 64) ?? "anon",
    };
    const nombre = textoCorto(raw.autorNombre, 80);
    if (nombre) u.autorNombre = nombre;
    if (raw.borrado === true) {
        u.borrado = true;
        return u;
    }
    let datos: P | null = null;
    try {
        datos = validarDatos(raw.datos);
    } catch {
        datos = null;
    }
    if (datos !== null && datos !== undefined) u.datos = datos;
    else if (raw.datos !== undefined) u.crudo = raw.datos;
    else return null;
    return u;
}

export function leerRegistro<M>(raw: unknown, validarMeta: (m: unknown) => M | null): RegistroLWW<M> | null {
    if (!esObj(raw)) return null;
    const actualizado = numeroSello(raw.actualizado);
    if (actualizado === null) return null;
    let valor: M | null = null;
    try {
        valor = validarMeta(raw.valor);
    } catch {
        valor = null;
    }
    if (valor === null || valor === undefined) return null;
    const r: RegistroLWW<M> = { valor, actualizado, autor: textoCorto(raw.autor, 64) ?? "anon" };
    const nombre = textoCorto(raw.autorNombre, 80);
    if (nombre) r.autorNombre = nombre;
    return r;
}

/** Claves de primer nivel que son nuestras; el resto del doc (p. ej. `sharing`) se respeta. */
export const CLAVES_PROPIAS = new Set(["app", "v", "unidades", "meta"]);

export interface DocLeido<P, M> {
    app: string | null;
    estado: EstadoColab<P, M>;
    /** Claves ajenas del doc (se devuelven tal cual al guardar). */
    extras: Record<string, unknown>;
}

/** Lee el `doc` jsonb de un espacio. Nunca lanza; lo mal formado se descarta pieza a pieza. */
export function leerDoc<P, M>(
    raw: unknown,
    validarDatos: (d: unknown) => P | null,
    validarMeta: (m: unknown) => M | null,
    maxUnidades = 8000,
): DocLeido<P, M> {
    const doc = esObj(raw) ? raw : {};
    const lista = Array.isArray(doc.unidades) ? doc.unidades.slice(0, maxUnidades) : [];
    const unidades: UnidadColab<P>[] = [];
    for (const r of lista) {
        const u = leerUnidad(r, validarDatos);
        if (u) unidades.push(u);
    }
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc)) if (!CLAVES_PROPIAS.has(k)) extras[k] = v;
    return {
        app: typeof doc.app === "string" ? doc.app : null,
        estado: { unidades: fusionarUnidades(unidades), meta: leerRegistro(doc.meta, validarMeta) },
        extras,
    };
}

/** Forma persistida de una unidad (sin campos vacíos). */
export function serializarUnidad<P>(u: UnidadColab<P>): Record<string, unknown> {
    const o: Record<string, unknown> = { id: u.id, orden: u.orden, actualizado: u.actualizado, autor: u.autor };
    if (u.autorNombre) o.autorNombre = u.autorNombre;
    if (u.borrado) o.borrado = true;
    else o.datos = u.datos !== undefined ? u.datos : u.crudo;
    return o;
}

/** El `doc` completo a guardar en el espacio. */
export function serializarDoc<P, M>(app: string, estado: EstadoColab<P, M>, extras: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ...extras,
        app,
        v: 1,
        unidades: estado.unidades.map(serializarUnidad),
        meta: estado.meta
            ? {
                  valor: estado.meta.valor,
                  actualizado: estado.meta.actualizado,
                  autor: estado.meta.autor,
                  ...(estado.meta.autorNombre ? { autorNombre: estado.meta.autorNombre } : {}),
              }
            : null,
    };
}

// ───────────────────────────── Presencia ─────────────────────────────

const COLORES_PRESENCIA = ["#7C5CFF", "#007FFF", "#10B981", "#FFBF00", "#DC143C", "#14B8A6", "#EC4899", "#F97316", "#39FF14", "#38BDF8"];

/** Color estable de una persona (el mismo en todas las pantallas). */
export function colorDePersona(clave: string | null | undefined): string {
    const s = clave || "anon";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return COLORES_PRESENCIA[h % COLORES_PRESENCIA.length];
}

/** Iniciales para el avatar de presencia («Ana Ruiz» → «AR»). */
export function iniciales(nombre: string | null | undefined): string {
    const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "·";
    const a = partes[0][0] ?? "";
    const b = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : partes[0][1] ?? "";
    return `${a}${b}`.toUpperCase();
}
