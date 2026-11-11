/**
 * (2026-11-11, MED1111E) El carril de Claude como fuente del medidor «Agentes».
 *
 * Alex: «reporta los procesos activos, ya que en MetaGenesis siguen sin aparecer». Durante seis horas
 * un director de Claude repartió cuatro agentes y Genesis marcó cero procesos: leía el enjambre, las
 * nubes y el A1, pero no el registro donde Claude anota lo que reparte
 * (`starseed_memory_root/olas/carril-claude/registro.json`, que escribe `relevo_carril_claude.py`).
 *
 * Honestidad («basta de ilusiones»): una tarea `en_curso` es un agente SOLO mientras el latido del
 * carril sea reciente (45 min, el mismo umbral con el que Python lo da por muerto y lo releva).
 * Con el latido viejo se enseña «sin latido desde hace N min» y no se cuenta. Las `pendiente` son
 * cola, nunca agentes. Módulo puro (lo importa código de cliente) y sin `prompt` ni rutas: lo que
 * sale de aquí viaja a otras neuronas.
 */
import { instanteDe } from "./agentes-claude-nube";

export const DONDE_CARRIL_CLAUDE = "carril-claude";
export const TEXTO_CARRIL_CLAUDE = "carril del director de Claude (sus agentes en la sesión de Claude Code)";
/** Mismo umbral que `UMBRAL_LATIDO_MIN` de `relevo_carril_claude_logica.py`. */
export const VIDA_LATIDO_CARRIL_MIN = 45;
/** Cuántas tareas ya cerradas se guardan para «qué acaba de terminar». */
const CERRADAS_MAX = 3;
const TOPE_TAREAS = 40;

export type EstadoTareaCarril = "en_curso" | "pendiente" | "hecha" | "relevada" | "cancelada";
const ESTADOS: readonly EstadoTareaCarril[] = ["en_curso", "pendiente", "hecha", "relevada", "cancelada"];

/** Una tarea del carril, SIN prompt ni archivos. Tiempos en ms de época (`null` si el registro no los trae). */
export interface TareaCarril {
    id: string;
    titulo: string;
    estado: EstadoTareaCarril;
    ola?: string;
    desdeMs: number | null;
    cerradaMs: number | null;
}

export interface LecturaCarril {
    latidoMs: number | null;
    tareas: TareaCarril[];
}

/** Quita rutas absolutas y recorta: ningún título saca una ruta del disco. */
export function limpiarTexto(valor: unknown, tope: number): string {
    const t = typeof valor === "string" ? valor : "";
    return t
        .replace(/(?:[A-Za-z]:\\|\/(?:Users|home|tmp|var|private|mnt|opt|root)\/)[^\s"')\]]*/g, "[ruta]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, tope);
}

/**
 * PURA. Del JSON del registro a lo que se puede enseñar y enviar: ids con forma de id, títulos limpios,
 * estados conocidos. Conserva todas las abiertas y las últimas cerradas. `null` si no es un registro.
 */
export function leerRegistroCarril(crudo: unknown): LecturaCarril | null {
    if (!crudo || typeof crudo !== "object") return null;
    const r = crudo as { latido?: unknown; tareas?: unknown };
    const latido = instanteDe(r.latido);
    const lista = Array.isArray(r.tareas) ? r.tareas : [];
    const tareas: TareaCarril[] = [];
    for (const t of lista) {
        if (!t || typeof t !== "object") continue;
        const x = t as Record<string, unknown>;
        const id = typeof x.id === "string" ? x.id.trim() : "";
        if (!/^[A-Za-z0-9_.-]{1,40}$/.test(id)) continue;
        // Sin `estado` la lógica de Python lo da por `en_curso`.
        const estado = (typeof x.estado === "string" ? x.estado : "en_curso") as EstadoTareaCarril;
        if (!ESTADOS.includes(estado)) continue;
        const desde = instanteDe(x.desde);
        const cerrada = instanteDe(x.cerrada);
        tareas.push({
            id,
            titulo: limpiarTexto(x.titulo, 160) || id,
            estado,
            ...(typeof x.ola === "string" && x.ola.trim() ? { ola: limpiarTexto(x.ola, 20) } : {}),
            desdeMs: Number.isFinite(desde) ? desde : null,
            cerradaMs: Number.isFinite(cerrada) ? cerrada : null,
        });
    }
    const abiertas = tareas.filter((t) => t.estado === "en_curso" || t.estado === "pendiente");
    const cerradas = tareas.filter((t) => t.estado !== "en_curso" && t.estado !== "pendiente").slice(-CERRADAS_MAX);
    return {
        latidoMs: Number.isFinite(latido) ? latido : null,
        tareas: [...abiertas, ...cerradas].slice(0, TOPE_TAREAS),
    };
}

export interface VistaCarril {
    /** `vivo`: latido fresco; `sin-latido`: hay abiertas pero el latido es viejo o no existe; `vacio`: nada abierto; `sin-registro`. */
    estado: "vivo" | "sin-latido" | "vacio" | "sin-registro";
    latidoHaceMin: number | null;
    agentes: { id: string; titulo: string; ola?: string; minutos: number | null }[];
    /** En el registro como `en_curso`, pero sin latido: NO cuentan como vivas. */
    sinLatido: { id: string; titulo: string; ola?: string }[];
    enCola: { id: string; titulo: string; ola?: string }[];
    /** La última cerrada (hecha), con su hora si el registro la trae. */
    ultimaCerrada: { id: string; titulo: string; estado: string; cerradaMs: number | null } | null;
    texto: string;
}

const minutosEntre = (ahora: number, desde: number): number => Math.max(0, Math.floor((ahora - desde) / 60_000));

/** PURA. Minutos legibles: «45 min», «3 h 05 min». */
export function duracionCorta(min: number): string {
    if (!Number.isFinite(min) || min < 0) return "—";
    if (min < 60) return `${Math.floor(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.floor(min % 60);
    if (h >= 48) return `${Math.floor(h / 24)} d`;
    return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** PURA. Lo que se enseña del carril ahora mismo. */
export function vistaCarril(l: LecturaCarril | null | undefined, ahora: number = Date.now()): VistaCarril {
    if (!l) {
        return {
            estado: "sin-registro",
            latidoHaceMin: null,
            agentes: [],
            sinLatido: [],
            enCola: [],
            ultimaCerrada: null,
            texto: "el carril de Claude no tiene registro en esta neurona",
        };
    }
    const enCurso = l.tareas.filter((t) => t.estado === "en_curso");
    const pendientes = l.tareas.filter((t) => t.estado === "pendiente");
    const cerradas = l.tareas.filter((t) => t.estado === "hecha");
    const ultima = cerradas.length ? cerradas[cerradas.length - 1] : null;
    const latidoHaceMin = l.latidoMs === null ? null : minutosEntre(ahora, l.latidoMs);
    const fresco = latidoHaceMin !== null && latidoHaceMin <= VIDA_LATIDO_CARRIL_MIN;
    const filaCola = pendientes.map((t) => ({ id: t.id, titulo: t.titulo, ...(t.ola ? { ola: t.ola } : {}) }));
    const comun = {
        latidoHaceMin,
        enCola: filaCola,
        ultimaCerrada: ultima ? { id: ultima.id, titulo: ultima.titulo, estado: ultima.estado, cerradaMs: ultima.cerradaMs } : null,
    };
    if (!enCurso.length && !pendientes.length) {
        return { estado: "vacio", agentes: [], sinLatido: [], ...comun, texto: "el carril de Claude no tiene nada abierto" };
    }
    const cola = pendientes.length ? ` · ${pendientes.length} en cola` : "";
    if (!fresco) {
        const desde = latidoHaceMin === null ? "sin latido registrado" : `sin latido desde hace ${duracionCorta(latidoHaceMin)}`;
        return {
            estado: "sin-latido",
            agentes: [],
            sinLatido: enCurso.map((t) => ({ id: t.id, titulo: t.titulo, ...(t.ola ? { ola: t.ola } : {}) })),
            ...comun,
            texto: `${desde}: ${enCurso.length} en curso ${enCurso.length === 1 ? "no cuenta" : "no cuentan"} como ${enCurso.length === 1 ? "viva" : "vivas"}${cola} (a los ${VIDA_LATIDO_CARRIL_MIN} min el relevo las pasa al enjambre)`,
        };
    }
    return {
        estado: "vivo",
        agentes: enCurso.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            ...(t.ola ? { ola: t.ola } : {}),
            minutos: t.desdeMs === null ? null : minutosEntre(ahora, t.desdeMs),
        })),
        sinLatido: [],
        ...comun,
        texto: `${enCurso.length} ${enCurso.length === 1 ? "agente" : "agentes"} en curso${cola} · latido hace ${duracionCorta(latidoHaceMin ?? 0)}`,
    };
}

/** El latido de un agente del carril, con la forma de `DatosMedidores["latidos"]` (solo si el carril está vivo). */
export interface AgenteCarrilClaude {
    tarea: string;
    fase: string;
    modelo: string;
    minutos: number;
    donde: string;
    titulo: string;
}

/** PURA. Un latido por tarea `en_curso`, y SOLO con el latido del carril fresco: es lo que cuenta el medidor «Agentes». */
export function agentesDeCarrilClaude(l: LecturaCarril | null | undefined, ahora: number = Date.now()): AgenteCarrilClaude[] {
    const v = vistaCarril(l, ahora);
    if (v.estado !== "vivo") return [];
    return v.agentes.map((a) => ({
        tarea: a.id,
        fase: "escribiendo",
        modelo: "claude",
        minutos: a.minutos ?? 0,
        donde: DONDE_CARRIL_CLAUDE,
        titulo: a.titulo,
    }));
}
