/**
 * MetaGenesis autónoma vista desde CUALQUIER neurona (OPA1011, 2026-10-10).
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ: los nodos de MetaGenesis (scripts/puente/nodo_metagenesis.py: Mac, A1 de Oracle, nube,
 * otra neurona) laten, eligen un líder y publican su FOTO en Supabase. Esta página lo lee de ahí
 * —ya no de `/api/mando/*` de la Mac ni de su túnel— y manda ÓRDENES que ejecuta el líder.
 *
 * Dos modos, el mismo resultado (`EstadoAutonomo`):
 *   · bus (hoy): eventos `mg_*` de la tabla pública `relevo_eventos`. Las órdenes van FIRMADAS
 *     por el servidor (`/api/metagenesis/orden`, HMAC) porque esa tabla la puede escribir
 *     cualquiera con la clave anónima.
 *   · tablas (al aplicar 20261011100000_metagenesis_nodos.sql): `metagenesis_*` con RLS solo
 *     para miembros; la orden se inserta directamente a nombre de la cuenta.
 *
 * Este módulo es PURO (sin Supabase, sin `window`, sin Node): resume filas, valida órdenes y
 * produce el texto canónico que se firma —el MISMO que `nodo_metagenesis_logica.texto_a_firmar`
 * en Python (vector compartido en las pruebas de ambos lados).
 * SOP: architecture/metagenesis-autonoma.md
 */

import type { ContenedorNodo } from "@/lib/metagenesis/colmena";
import { neuronaTallerDeLatido, type NeuronaTaller } from "@/lib/avatares/adaptadores/reparto-taller";

/** Sin latir este tiempo, un nodo no cuenta como vivo (igual que `TTL_LIDER_S` del nodo). */
export const TTL_NODO_MS = 900_000;
/** Una orden sin respuesta en 15 min caducó (el nodo la rechaza por vieja). */
export const ORDEN_CADUCA_MS = 15 * 60_000;

export const TIPOS_BUS = ["mg_latido", "mg_lider", "mg_baja", "mg_foto", "mg_orden", "mg_orden_hecha", "mg_decision"] as const;
export type TipoBus = (typeof TIPOS_BUS)[number];

export type AccionOrden =
    | "continuar"
    | "revisar_bloqueadas"
    | "buscar_capacidad"
    | "reactivar"
    | "buscar_trabajo"
    | "lanzar_cola"
    | "detener_cola"
    | "pausar"
    | "reanudar"
    | "ceder"
    | "desconectar"
    | "contenedor"
    | "instalar_trabajador";

export interface FichaAccion {
    etiqueta: string;
    /** Qué hace, en una frase sin jerga. */
    explica: string;
    /** Pide confirmación antes de mandarla. */
    confirmar?: boolean;
    args: readonly string[];
}

/** Lista blanca (la misma que `ACCIONES_ORDEN` del nodo y el CHECK de la tabla). */
export const ACCIONES: Record<AccionOrden, FichaAccion> = {
    continuar: { etiqueta: "Seguir ahora", explica: "Si hay trabajo listo y nadie lo coge, los directores lo arrancan ya.", args: [] },
    revisar_bloqueadas: {
        etiqueta: "Revisar bloqueadas",
        explica: "El revisor automático pasa por cada tarea quieta y la reencola, la adapta o la reasigna.",
        args: [],
    },
    buscar_capacidad: { etiqueta: "Buscar capacidad", explica: "Mide todos los medios y enciende los que pueden trabajar.", args: [] },
    reactivar: { etiqueta: "Reactivar directores", explica: "Revive los servicios caídos del medio y repasa todo.", args: [] },
    buscar_trabajo: {
        etiqueta: "Buscar trabajo",
        explica: "Si no queda nada en cola, rescata lo que se quedó sin hacer en las colas archivadas.",
        args: [],
    },
    lanzar_cola: { etiqueta: "Lanzar cola", explica: "Pone una cola a trabajar en un medio.", args: ["cola", "trabajadores", "tareas_sha"] },
    detener_cola: { etiqueta: "Detener cola", explica: "Para el orquestador de una cola.", confirmar: true, args: ["cola"] },
    pausar: { etiqueta: "Pausar autonomía", explica: "El líder deja de decidir solo hasta que la reanudes.", confirmar: true, args: [] },
    reanudar: { etiqueta: "Reanudar autonomía", explica: "El líder vuelve a decidir solo.", args: [] },
    ceder: { etiqueta: "Cambiar de líder", explica: "El líder cede el mando 30 min y lo toma el siguiente medio.", confirmar: true, args: [] },
    // Colmena (COL1012): van a un ID de nodo concreto, nunca a «lider»/«todos» (igual que el nodo Python).
    desconectar: { etiqueta: "Desconectar", explica: "Quita al nodo del enjambre de MetaGenesis.", confirmar: true, args: [] },
    contenedor: { etiqueta: "Usar como contenedor", explica: "El nodo actúa como contenedor para otros mediadores.", args: ["activo", "trabajadores"] },
    instalar_trabajador: {
        etiqueta: "Instalar trabajador",
        explica: "Instala un trabajador (agente) en este contenedor.",
        args: [],
    },
};

/** Las acciones del nodo NO se ofrecen en «Pedir algo al que dirige»: van en la tarjeta de cada neurona. */
export const ACCIONES_DEL_LIDER: Record<Exclude<AccionOrden, "desconectar" | "contenedor">, FichaAccion> = {
    continuar: ACCIONES.continuar,
    revisar_bloqueadas: ACCIONES.revisar_bloqueadas,
    buscar_capacidad: ACCIONES.buscar_capacidad,
    reactivar: ACCIONES.reactivar,
    buscar_trabajo: ACCIONES.buscar_trabajo,
    lanzar_cola: ACCIONES.lanzar_cola,
    detener_cola: ACCIONES.detener_cola,
    pausar: ACCIONES.pausar,
    reanudar: ACCIONES.reanudar,
    ceder: ACCIONES.ceder,
    instalar_trabajador: ACCIONES.instalar_trabajador,
};

/** PURA. true si `para` puede recibir esta acción: desconectar/contenedor solo a un id de nodo concreto. */
export function esDestinoPara(accion: AccionOrden, para: unknown): boolean {
    if (!esDestino(para)) return false;
    if (accion === "desconectar" || accion === "contenedor") {
        return para !== "lider" && para !== "todos" && !(para in MEDIOS);
    }
    return true;
}

export const MEDIOS: Record<string, string> = {
    mac: "Mac de desarrollo",
    "oracle-a1": "Oracle A1 (24/7)",
    neurona: "Otra neurona",
    "nube-cowork": "Nube (contenedor de Claude)",
    "gh-actions": "GitHub Actions",
};

const RE_COLA = /^cola-[A-Za-z0-9._-]{1,80}$/;
const RE_VALOR = /^[\p{L}\p{N}_ .:/@+,()-]{0,200}$/u;
const RE_NODO = /^[a-z0-9][a-z0-9-]{1,38}$/;
const RE_NONCE = /^[A-Za-z0-9_-]{8,64}$/;

export type ValorArg = string | number | boolean;
export type ArgsOrden = Record<string, ValorArg>;

export function esAccion(x: unknown): x is AccionOrden {
    return typeof x === "string" && Object.prototype.hasOwnProperty.call(ACCIONES, x);
}

export function esDestino(x: unknown): x is string {
    return typeof x === "string" && (x === "lider" || x === "todos" || x in MEDIOS || RE_NODO.test(x));
}

/** PURA. null si los argumentos encajan con la acción; si no, el motivo (igual que en Python). */
export function validarArgs(accion: AccionOrden, args: unknown): string | null {
    const a = (args ?? {}) as Record<string, unknown>;
    if (typeof a !== "object" || Array.isArray(a)) return "argumentos no válidos";
    const permitidos = new Set(ACCIONES[accion].args);
    for (const [k, v] of Object.entries(a)) {
        if (!permitidos.has(k)) return `argumento no admitido: ${k}`;
        if (typeof v === "boolean" || (Number.isInteger(v) && Math.abs(v as number) < 1e6)) continue;
        if (typeof v !== "string" || !RE_VALOR.test(v)) return `valor no admitido en ${k}`;
    }
    if ((accion === "lanzar_cola" || accion === "detener_cola") && !(typeof a.cola === "string" && RE_COLA.test(a.cola))) {
        return "nombre de cola no válido";
    }
    if ("trabajadores" in a && !(Number.isInteger(a.trabajadores) && (a.trabajadores as number) >= 1 && (a.trabajadores as number) <= 4)) {
        return "trabajadores fuera de 1–4";
    }
    // MISMAS reglas que `args_validos` del nodo Python: activo booleano obligatorio; trabajadores
    // 1–4 SOLO con activo true (con activo false el nodo apaga el contenedor y no quiere ese dato).
    if (accion === "contenedor") {
        if (!("activo" in a)) return "falta argumento: activo";
        if (typeof a.activo !== "boolean") return "activo debe ser booleano";
        if (a.activo && !("trabajadores" in a)) return "falta argumento: trabajadores";
        if (!a.activo && "trabajadores" in a) return "trabajadores solo se permite si activo es True";
    }
    return null;
}

/** PURA. JSON con claves ordenadas y sin espacios (el `json.dumps(sort_keys, separators)` de Python). */
export function canonico(args: ArgsOrden | undefined | null): string {
    const a = args ?? {};
    const ordenado: Record<string, ValorArg> = {};
    for (const k of Object.keys(a).sort()) ordenado[k] = a[k];
    return JSON.stringify(ordenado);
}

export interface OrdenSinFirma {
    v: "1";
    accion: AccionOrden;
    para: string;
    /** ISO UTC con «Z», sin milisegundos. */
    t: string;
    nonce: string;
    por: string;
    args: ArgsOrden;
}

export interface OrdenFirmada extends OrdenSinFirma {
    firma: string;
}

/** PURA. El texto que se firma con HMAC-SHA256. */
export function textoAFirmar(o: Pick<OrdenSinFirma, "accion" | "para" | "t" | "nonce" | "args">): string {
    return `${o.accion}|${o.para}|${o.t}|${o.nonce}|${canonico(o.args)}`;
}

/** PURA. `2026-10-10T12:00:00Z` (sin milisegundos, como `iso()` del nodo). */
export function isoSinMs(ms: number): string {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function nonceValido(n: unknown): n is string {
    return typeof n === "string" && RE_NONCE.test(n);
}

// ─── lo que se ve ────────────────────────────────────────────────────────────

/** Una tarea en curso del latido (`en_curso`, contrato §3): sin rutas ni nombres de máquina. */
export interface TareaEnCurso {
    id: string;
    fase: string;
    /** Punto desde el que otra neurona podría seguirla (rama/sha/t del último salvavidas). */
    punto: { rama: string; sha: string; t: number } | null;
}

export interface NodoVista {
    nodo: string;
    medio: string;
    etiqueta: string;
    modo: "real" | "seco" | string;
    vivo: boolean;
    /**
     * (G3D1011D · contrato avatares-3d §11) El `NeuronaTaller` de esta neurona, leído del
     * `capacidades_taller` de su último latido con `capacidadesDeRegistro`; null si aún no publicó.
     */
    taller?: NeuronaTaller | null;
    lider: boolean;
    hace_ms: number | null;
    puntos: number | null;
    orquestadores: string[];
    caidos: string[];
    disco_gb: number | null;
    ram_libre_mb: number | null;
    trabajo: Record<string, number | null>;
    /** ≤ 8 tareas con agente trabajando en este aparato; [] si el latido no las trajo. */
    enCurso: TareaEnCurso[];
    /** Estado de contenedor del latido (`trabajadores` pasa a llamarse `agentes`, como en colmena.ts); null si no lo apuntó. */
    contenedor: ContenedorNodo | null;
}

const boolDe = (x: unknown): boolean => x === true;

/** PURA. Un `en_curso` del latido a lo que se pinta, sin fiarse de lo que venga. */
function enCursoDe(d: Record<string, unknown>): TareaEnCurso[] {
    const lista = Array.isArray(d.en_curso) ? (d.en_curso as Array<Record<string, unknown>>) : [];
    return lista
        .map((t) => {
            const p = (t?.punto ?? null) as Record<string, unknown> | null;
            const id = txt(t?.id, 80);
            if (!id) return null;
            return {
                id,
                fase: txt(t?.fase, 40),
                punto: p ? { rama: txt(p.rama, 120), sha: txt(p.sha, 60), t: num(p.t) ?? 0 } : null,
            };
        })
        .filter((t): t is TareaEnCurso => t !== null)
        .slice(0, 8);
}

/** PURA. El `contenedor` del latido (§3: {activo, trabajadores, apto, motivo}), o null si falta. */
function contenedorDe(d: Record<string, unknown>): ContenedorNodo | null {
    const c = d.contenedor as Record<string, unknown> | null;
    if (!c || typeof c !== "object") return null;
    // El latido dice `trabajadores`; la pantalla y colmena.ts lo llaman `agentes`. Se aceptan ambos.
    return { activo: boolDe(c.activo), agentes: num(c.trabajadores) ?? num(c.agentes) ?? 0, apto: boolDe(c.apto), motivo: txt(c.motivo, 160) };
}

export interface DecisionVista {
    ts: number;
    accion: string;
    nodo: string;
    motivo: string;
    resultado: string;
    seco: boolean;
}

export interface OrdenVista {
    clave: string;
    accion: string;
    para: string;
    t: number;
    estado: "pendiente" | "tomada" | "hecha" | "en_marcha" | "seca" | "nada" | "rechazada" | "fallo" | "caducada" | string;
    resultado: string;
    nodo: string | null;
}

export interface EstadoAutonomo {
    modo: "bus" | "tablas";
    lider: string | null;
    termino: number;
    autonomia: boolean | null;
    nodos: NodoVista[];
    medidores: Record<string, string>;
    decisiones: DecisionVista[];
    ordenes: OrdenVista[];
    fotoHaceMs: number | null;
    /** El líder trabaja en seco (decide pero no lanza). */
    liderSeco: boolean;
}

export interface FilaBus {
    id: number;
    t: string;
    tipo: string;
    datos: Record<string, unknown> | null;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const txt = (x: unknown, max = 200): string => (typeof x === "string" ? x.slice(0, max) : "");

function tsDe(f: FilaBus): number {
    const d = f.datos ?? {};
    const ts = num((d as Record<string, unknown>).ts);
    if (ts !== null) return ts * 1000;
    const t = Date.parse(f.t);
    return Number.isFinite(t) ? t : 0;
}

function nodoDeLatido(d: Record<string, unknown>, ts: number, ahora: number, lider: string | null, baja: number): NodoVista {
    const salud = (d.salud ?? {}) as Record<string, unknown>;
    const medio = txt(d.medio, 40) || "neurona";
    const hace = ts ? Math.max(0, ahora - ts) : null;
    const orqs = Array.isArray(salud.orquestadores) ? (salud.orquestadores as Array<Record<string, unknown>>) : [];
    const trabajo = (salud.trabajo ?? {}) as Record<string, unknown>;
    const vivo = hace !== null && hace <= TTL_NODO_MS && baja < ts;
    return {
        nodo: txt(d.nodo, 40),
        medio,
        etiqueta: MEDIOS[medio] ?? "Neurona",
        modo: txt(d.modo, 10) || "real",
        vivo,
        taller: neuronaTallerDeLatido(d, { viva: vivo, carga: num(trabajo.en_curso) ?? 0 }),
        lider: !!lider && d.nodo === lider,
        hace_ms: hace,
        puntos: num(d.puntos),
        orquestadores: orqs.map((o) => txt(o?.cola, 80)).filter(Boolean).slice(0, 4),
        caidos: (Array.isArray(salud.servicios_caidos) ? salud.servicios_caidos : []).map((c) => txt(c, 60)).filter(Boolean).slice(0, 6),
        disco_gb: num(salud.disco_gb),
        ram_libre_mb: num(salud.ram_libre_mb),
        trabajo: Object.fromEntries(Object.entries(trabajo).map(([k, v]) => [k, num(v)])),
        enCurso: enCursoDe(d),
        contenedor: contenedorDe(d),
    };
}

/** PURA. Del bus (`relevo_eventos`, tipos `mg_*`) a lo que se pinta. */
export function resumirBus(filas: FilaBus[], ahora: number): EstadoAutonomo {
    const ordenadas = [...filas].sort((a, b) => a.id - b.id);
    const latidos = new Map<string, { d: Record<string, unknown>; ts: number }>();
    const bajas = new Map<string, number>();
    let foto: { d: Record<string, unknown>; ts: number } | null = null;
    let reclamo: { nodo: string; termino: number; puntos: number } | null = null;
    const ordenes = new Map<string, OrdenVista>();
    const decisiones: DecisionVista[] = [];

    for (const f of ordenadas) {
        const d = (f.datos ?? {}) as Record<string, unknown>;
        const ts = tsDe(f);
        switch (f.tipo) {
            case "mg_latido": {
                const n = txt(d.nodo, 40);
                if (RE_NODO.test(n)) latidos.set(n, { d, ts });
                const visto = txt(d.lider_visto, 40);
                const term = num(d.termino_visto);
                if (RE_NODO.test(visto) && term !== null && (!reclamo || term > reclamo.termino)) {
                    reclamo = { nodo: visto, termino: term, puntos: num(d.puntos_lider) ?? 0 };
                }
                break;
            }
            case "mg_lider": {
                const n = txt(d.nodo, 40);
                const term = num(d.termino);
                const p = num(d.puntos) ?? 0;
                if (RE_NODO.test(n) && term !== null) {
                    if (!reclamo || term > reclamo.termino || (term === reclamo.termino && (p > reclamo.puntos || (p === reclamo.puntos && n < reclamo.nodo)))) {
                        reclamo = { nodo: n, termino: term, puntos: p };
                    }
                }
                break;
            }
            case "mg_baja": {
                const n = txt(d.nodo, 40);
                if (n) bajas.set(n, Math.max(bajas.get(n) ?? 0, ts));
                break;
            }
            case "mg_foto":
                foto = { d, ts };
                break;
            case "mg_orden": {
                const nonce = txt(d.nonce, 64);
                if (!nonceValido(nonce)) break;
                ordenes.set(nonce, {
                    clave: nonce,
                    accion: txt(d.accion, 40),
                    para: txt(d.para, 40),
                    t: ts,
                    estado: ahora - ts > ORDEN_CADUCA_MS ? "caducada" : "pendiente",
                    resultado: "",
                    nodo: null,
                });
                break;
            }
            case "mg_orden_hecha": {
                const nonce = txt(d.nonce, 64);
                const o = ordenes.get(nonce);
                if (o) {
                    o.estado = txt(d.estado, 20) || "hecha";
                    o.resultado = txt(d.resultado, 300);
                    o.nodo = txt(d.nodo, 40) || null;
                }
                break;
            }
            case "mg_decision":
                decisiones.push({
                    ts,
                    accion: txt(d.accion, 40),
                    nodo: txt(d.nodo, 40),
                    motivo: txt(d.motivo),
                    resultado: txt(d.resultado),
                    seco: d.seco === true,
                });
                break;
        }
    }

    const r = reclamo as { nodo: string; termino: number; puntos: number } | null;
    const f = foto as { d: Record<string, unknown>; ts: number } | null;
    const liderFoto = f ? txt(f.d.lider, 40) : "";
    const terminoFoto = f ? num(f.d.termino) ?? 0 : 0;
    // Manda el término más alto entre los reclamos/latidos y la foto.
    const lider = r && r.termino >= terminoFoto ? r.nodo : liderFoto || null;
    const termino = Math.max(r?.termino ?? 0, terminoFoto);
    const nodos = [...latidos.entries()]
        .map(([, v]) => nodoDeLatido(v.d, v.ts, ahora, lider, bajas.get(txt(v.d.nodo, 40)) ?? 0))
        .sort((a, b) => Number(b.lider) - Number(a.lider) || Number(b.vivo) - Number(a.vivo) || a.nodo.localeCompare(b.nodo));
    const liderVivo = nodos.find((n) => n.lider && n.vivo) ?? null;
    const fotoDecisiones = Array.isArray(f?.d.decisiones) ? (f!.d.decisiones as Array<Record<string, unknown>>) : [];
    const todas = [
        ...fotoDecisiones.map((d) => ({
            ts: (num(d.ts) ?? 0) * 1000,
            accion: txt(d.accion, 40),
            nodo: txt(d.nodo, 40),
            motivo: txt(d.motivo),
            resultado: txt(d.resultado),
            seco: d.seco === true,
        })),
        ...decisiones,
    ];
    const vistas = new Set<string>();
    const unicas = todas
        .sort((a, b) => b.ts - a.ts)
        .filter((d) => {
            const k = `${Math.round(d.ts / 1000)}|${d.accion}|${d.nodo}`;
            if (vistas.has(k)) return false;
            vistas.add(k);
            return true;
        })
        .slice(0, 10);
    const medidores = (f?.d.medidores ?? {}) as Record<string, unknown>;
    return {
        modo: "bus",
        lider: liderVivo ? liderVivo.nodo : null,
        termino,
        autonomia: f ? f.d.autonomia !== false : null,
        nodos,
        medidores: Object.fromEntries(Object.entries(medidores).map(([k, v]) => [k, txt(v, 160)])),
        decisiones: unicas,
        ordenes: [...ordenes.values()].sort((a, b) => b.t - a.t).slice(0, 12),
        fotoHaceMs: f ? Math.max(0, ahora - f.ts) : null,
        liderSeco: liderVivo?.modo === "seco",
    };
}

export interface FilasTablas {
    nodos: Array<{ nodo: string; medio: string; modo: string | null; puntos: number | null; datos: Record<string, unknown> | null; ultimo_latido: string | null }>;
    arriendo: { lider: string | null; termino: number; expira: string; foto: Record<string, unknown> | null; foto_en: string | null } | null;
    ordenes: Array<{ id: number; creada_en: string; accion: string; para: string; estado: string; resultado: string | null; tomada_por: string | null }>;
}

/** PURA. De las tablas con RLS (modo tablas) a lo mismo que el bus. */
export function resumirTablas(t: FilasTablas, ahora: number): EstadoAutonomo {
    const arr = t.arriendo;
    const expira = arr ? Date.parse(arr.expira) : NaN;
    const lider = arr?.lider && Number.isFinite(expira) && expira > ahora ? arr.lider : null;
    const nodos = t.nodos
        .map((n) => {
            const ts = n.ultimo_latido ? Date.parse(n.ultimo_latido) : 0;
            return nodoDeLatido({ ...(n.datos ?? {}), nodo: n.nodo, medio: n.medio, modo: n.modo ?? "real", puntos: n.puntos }, ts, ahora, lider, 0);
        })
        .sort((a, b) => Number(b.lider) - Number(a.lider) || Number(b.vivo) - Number(a.vivo) || a.nodo.localeCompare(b.nodo));
    const foto = (arr?.foto ?? null) as Record<string, unknown> | null;
    const fotoEn = arr?.foto_en ? Date.parse(arr.foto_en) : NaN;
    const decisiones = (Array.isArray(foto?.decisiones) ? (foto!.decisiones as Array<Record<string, unknown>>) : [])
        .map((d) => ({ ts: (num(d.ts) ?? 0) * 1000, accion: txt(d.accion, 40), nodo: txt(d.nodo, 40), motivo: txt(d.motivo), resultado: txt(d.resultado), seco: d.seco === true }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 10);
    const liderNodo = nodos.find((n) => n.lider) ?? null;
    return {
        modo: "tablas",
        lider,
        termino: arr?.termino ?? 0,
        autonomia: foto ? foto.autonomia !== false : null,
        nodos,
        medidores: Object.fromEntries(Object.entries((foto?.medidores ?? {}) as Record<string, unknown>).map(([k, v]) => [k, txt(v, 160)])),
        decisiones,
        ordenes: t.ordenes
            .map((o) => ({
                clave: String(o.id),
                accion: o.accion,
                para: o.para,
                t: Date.parse(o.creada_en) || 0,
                estado: o.estado,
                resultado: o.resultado ?? "",
                nodo: o.tomada_por,
            }))
            .sort((a, b) => b.t - a.t)
            .slice(0, 12),
        fotoHaceMs: Number.isFinite(fotoEn) ? Math.max(0, ahora - fotoEn) : null,
        liderSeco: liderNodo?.modo === "seco",
    };
}

/**
 * PURA. ¿Se lee MetaGenesis de las tablas o del bus? (2026-10-13, medido)
 *
 * Con la migración de nodos aplicada, la vista leía las tablas y decía «Ningún medio de
 * MetaGenesis está latiendo» con la Mac y el A1 vivos: los dos van por la PUERTA DE DATOS del A1
 * (`EnlacePuerta`), que deja su latido como espejo en el BUS y nunca en `metagenesis_nodos`
 * (`ultimo_latido` vacío). Y las órdenes se guardaban en una tabla que ningún nodo lee. Manda la
 * fuente donde hay más nodos vivos; a igualdad, las tablas; sin vivos en ninguna, como hoy.
 */
export function elegirFuente(tablas: EstadoAutonomo | null, bus: EstadoAutonomo | null): "tablas" | "bus" {
    const viveTablas = tablas ? tablas.nodos.some(n => n.vivo) : false;
    const viveBus = bus ? bus.nodos.some(n => n.vivo) : false;

    if (viveTablas && !viveBus) return "tablas";
    if (viveBus && !viveTablas) return "bus";

    // Ambos tienen nodos vivos o ninguno tiene nodos vivos
    if (viveTablas && viveBus) {
        const numTablas = tablas!.nodos.filter(n => n.vivo).length;
        const numBus = bus!.nodos.filter(n => n.vivo).length;
        return numTablas >= numBus ? "tablas" : "bus";
    }

    // Ninguno tiene nodos vivos: comportamiento actual
    return tablas ? "tablas" : "bus";
}

/** PURA. Una frase para la cabecera: quién dirige y desde dónde, sin jerga. */
export function fraseDelMando(e: EstadoAutonomo): string {
    const vivos = e.nodos.filter((n) => n.vivo).length;
    if (!vivos) return "Ningún medio de MetaGenesis está latiendo ahora mismo.";
    const l = e.nodos.find((n) => n.lider && n.vivo);
    if (!l) return `${vivos} medio(s) vivos y eligiendo quién dirige.`;
    const pausa = e.autonomia === false ? " La autonomía está en pausa." : "";
    const seco = l.modo === "seco" ? " Trabaja en modo de prueba: decide y lo dice, pero no lanza nada." : "";
    return `Dirige ${l.etiqueta} · ${vivos} medio(s) vivo(s).${pausa}${seco}`;
}

/** PURA. Texto del estado de una orden. */
export function textoEstadoOrden(estado: string): string {
    const t: Record<string, string> = {
        pendiente: "esperando a un nodo",
        tomada: "la tiene un nodo",
        hecha: "hecha",
        en_marcha: "en marcha",
        seca: "solo simulada (nodo en prueba)",
        nada: "no hacía falta",
        rechazada: "rechazada",
        fallo: "falló",
        caducada: "nadie la recogió a tiempo",
    };
    return t[estado] ?? estado;
}
