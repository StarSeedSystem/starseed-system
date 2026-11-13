/**
 * (2026-11-13, MED1113A) Los procesos de la dirección: los agentes de Claude que lanza la dirección, con
 * su sitio propio en los medidores y sin depender del relevo del carril.
 *
 * Alex: «en metagenesis no aparecen todos los procesos y agentes activos en los medidores aparecen en 0
 * cuando hay varios procesos activos». Quince agentes de la dirección trabajaron horas en sus árboles y
 * «Agentes» decía 0: la única vía para verlos era el carril de Claude, y el carril los entrega al enjambre
 * si el latido envejece, así que la dirección dejó de anotarlos. Ver y relevar iban atados.
 *
 * Aquí solo se lee lo que mide `scripts/puente/procesos_direccion.py estado --json` (ficha en
 * `~/.starseed/direccion/procesos/`, señal medida en el árbol, marcador `.listo`) y se recalcula con la
 * hora del que mira, con el MISMO umbral que el script (una prueba compara los dos números):
 *   · activo: alguna señal en los últimos `VIDA_DIRECCION_MIN` minutos;
 *   · en silencio desde <hora>: ni activo ni desaparecido;
 *   · terminado: marcador `.listo` o cierre explícito (se enseña unas horas como «acaba de terminar»).
 * Módulo puro (lo importa código de cliente) y con lista blanca: lo que sale de aquí viaja a otras neuronas.
 */
import { limpiarTexto } from "./carril-claude";

export const DONDE_DIRECCION = "direccion";
export const TEXTO_DIRECCION = "proceso de la dirección (agente de Claude en su propio árbol)";
/** Igual que `VIDA_MIN` de `scripts/puente/procesos_direccion.py`. */
export const VIDA_DIRECCION_MIN = 30;
const TOPE = 60;

export type EstadoProcesoDireccion = "activo" | "en-silencio" | "terminado" | "cancelado";
const ESTADOS: readonly EstadoProcesoDireccion[] = ["activo", "en-silencio", "terminado", "cancelado"];

export interface ProcesoDireccion {
    id: string;
    titulo: string;
    modelo: string;
    tipo: "agente" | "puerta" | "servicio";
    /** Su árbol, siempre con «~» (nunca la ruta entera del disco). */
    donde: string;
    rama: string | null;
    fase: string | null;
    desdeMs: number | null;
    estado: EstadoProcesoDireccion;
    /** De dónde salió la última señal: «latido», «cambios en su árbol», «commits en su árbol»… */
    senal: string | null;
    ultimaSenalMs: number | null;
    cerradoMs: number | null;
    /** Por qué está en su estado («marcador .listo», «cierre explícito», la fuente de la señal). */
    porque: string;
    relevable: boolean;
}

export interface LecturaDireccion {
    generadoMs: number;
    procesos: ProcesoDireccion[];
}

const ms = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const texto = (v: unknown, tope: number): string | null => limpiarTexto(v, tope) || null;

/** PURA. Lo que devuelve el script (o llega de otra neurona) pasado por la lista blanca. `null` si no es eso. */
export function leerEstadoDireccion(crudo: unknown): LecturaDireccion | null {
    if (!crudo || typeof crudo !== "object") return null;
    const x = crudo as { generadoMs?: unknown; procesos?: unknown };
    if (!Array.isArray(x.procesos)) return null;
    const procesos: ProcesoDireccion[] = [];
    for (const p of x.procesos.slice(0, TOPE)) {
        if (!p || typeof p !== "object") continue;
        const r = p as Record<string, unknown>;
        const id = typeof r.id === "string" ? r.id.trim() : "";
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(id)) continue;
        const estado = r.estado as EstadoProcesoDireccion;
        if (!ESTADOS.includes(estado)) continue;
        const donde = typeof r.donde === "string" && r.donde.startsWith("~/") ? texto(r.donde, 120) : null;
        procesos.push({
            id,
            titulo: texto(r.titulo, 160) ?? id,
            modelo: texto(r.modelo, 60) ?? "sin declarar",
            tipo: r.tipo === "puerta" || r.tipo === "servicio" ? r.tipo : "agente",
            donde: donde ?? "sin árbol declarado",
            rama: texto(r.rama, 80),
            fase: texto(r.fase, 80),
            desdeMs: ms(r.desdeMs),
            estado,
            senal: texto(r.senal, 40),
            ultimaSenalMs: ms(r.ultimaSenalMs),
            cerradoMs: ms(r.cerradoMs),
            porque: texto(r.porque, 80) ?? "",
            relevable: r.relevable === true,
        });
    }
    return { generadoMs: ms(x.generadoMs) ?? 0, procesos };
}

/**
 * PURA. El estado a la hora de `ahora` (la lectura puede tener unos segundos o la foto de otra neurona
 * minutos): lo cerrado sigue cerrado; lo abierto es activo solo si su última señal cae dentro de la vida.
 */
export function estadoAhora(p: ProcesoDireccion, ahora: number): { estado: EstadoProcesoDireccion; silencioDesdeMs: number | null } {
    if (p.estado === "terminado" || p.estado === "cancelado") return { estado: p.estado, silencioDesdeMs: null };
    if (p.ultimaSenalMs !== null && ahora - p.ultimaSenalMs <= VIDA_DIRECCION_MIN * 60_000) return { estado: "activo", silencioDesdeMs: null };
    return { estado: "en-silencio", silencioDesdeMs: p.ultimaSenalMs };
}

/** PURA. «22:41» en la hora local del que calcula. */
export function horaCorta(msEpoca: number): string {
    const d = new Date(msEpoca);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const minutos = (ahora: number, desde: number | null): number | null => (desde === null ? null : Math.max(0, Math.floor((ahora - desde) / 60_000)));

export interface FilaDireccion extends ProcesoDireccion {
    /** Estado recalculado a la hora de mirar. */
    ahora: EstadoProcesoDireccion;
    minutosEnMarcha: number | null;
    senalHaceMin: number | null;
    silencioDesdeMs: number | null;
    /** Una línea para personas: «activo · cambios en su árbol hace 3 min», «en silencio desde 22:41»… */
    linea: string;
}

export interface VistaDireccion {
    estado: "sin-datos" | "vacio" | "con-procesos";
    activos: FilaDireccion[];
    enSilencio: FilaDireccion[];
    terminados: FilaDireccion[];
    texto: string;
}

/** PURA. Lo que se pinta de los procesos de la dirección. */
export function vistaDireccion(l: LecturaDireccion | null | undefined, ahora: number = Date.now()): VistaDireccion {
    if (!l) {
        return {
            estado: "sin-datos",
            activos: [],
            enSilencio: [],
            terminados: [],
            texto: "no se pudo medir los procesos de la dirección en esta neurona",
        };
    }
    const filas: FilaDireccion[] = l.procesos.map((p) => {
        const e = estadoAhora(p, ahora);
        const senalHaceMin = minutos(ahora, p.ultimaSenalMs);
        const linea =
            e.estado === "activo"
                ? `activo · ${p.senal ?? "señal"} hace ${senalHaceMin ?? 0} min${p.fase ? ` · ${p.fase}` : ""}`
                : e.estado === "en-silencio"
                  ? e.silencioDesdeMs !== null
                      ? `en silencio desde las ${horaCorta(e.silencioDesdeMs)} (hace ${minutos(ahora, e.silencioDesdeMs)} min; última señal: ${p.senal ?? "?"}) · no cuenta como activo`
                      : "en silencio: ninguna señal medida · no cuenta como activo"
                  : `${e.estado === "cancelado" ? "cancelado" : "terminado"}${p.cerradoMs ? ` a las ${horaCorta(p.cerradoMs)}` : ""} (${p.porque || "cerrado"})`;
        return { ...p, ahora: e.estado, minutosEnMarcha: minutos(ahora, p.desdeMs), senalHaceMin, silencioDesdeMs: e.silencioDesdeMs, linea };
    });
    const activos = filas.filter((f) => f.ahora === "activo");
    const enSilencio = filas.filter((f) => f.ahora === "en-silencio");
    const terminados = filas
        .filter((f) => f.ahora === "terminado" || f.ahora === "cancelado")
        .sort((a, b) => (b.cerradoMs ?? 0) - (a.cerradoMs ?? 0));
    if (!activos.length && !enSilencio.length) {
        const ultimo = terminados[0];
        return {
            estado: "vacio",
            activos,
            enSilencio,
            terminados,
            texto: ultimo
                ? `ningún proceso de la dirección abierto · el último en terminar fue ${ultimo.id}${ultimo.cerradoMs ? ` a las ${horaCorta(ultimo.cerradoMs)}` : ""}`
                : "ningún proceso de la dirección registrado en las últimas horas",
        };
    }
    const partes = [
        activos.length ? `${activos.length} ${activos.length === 1 ? "activo" : "activos"}` : "",
        enSilencio.length ? `${enSilencio.length} en silencio` : "",
        terminados.length ? `${terminados.length} ${terminados.length === 1 ? "terminado" : "terminados"} hace poco` : "",
    ].filter(Boolean);
    return { estado: "con-procesos", activos, enSilencio, terminados, texto: `${partes.join(" · ")} (activo = señal en los últimos ${VIDA_DIRECCION_MIN} min)` };
}

/** El latido de un proceso activo, con la forma de `DatosMedidores["latidos"]`. */
export interface AgenteDireccion {
    tarea: string;
    fase: string;
    modelo: string;
    minutos: number;
    donde: string;
    titulo: string;
    quietoSegundos?: number;
    senal?: string;
    arbol?: string;
    rama?: string;
}

/** PURA. Un latido por proceso ACTIVO (solo agentes): es lo que cuentan «Agentes» y «En curso». */
export function agentesDeDireccion(l: LecturaDireccion | null | undefined, ahora: number = Date.now()): AgenteDireccion[] {
    return vistaDireccion(l, ahora)
        .activos.filter((p) => p.tipo === "agente")
        .map((p) => ({
            tarea: p.id,
            fase: p.fase ?? "trabajando",
            modelo: p.modelo,
            minutos: p.minutosEnMarcha ?? 0,
            donde: DONDE_DIRECCION,
            titulo: p.titulo,
            ...(p.senalHaceMin !== null ? { quietoSegundos: p.senalHaceMin * 60 } : {}),
            ...(p.senal ? { senal: p.senal } : {}),
            arbol: p.donde,
            ...(p.rama ? { rama: p.rama } : {}),
        }));
}
