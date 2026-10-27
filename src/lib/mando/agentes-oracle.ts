/**
 * (2026-10-27, CAP1026O) Los trabajadores del A1 de Oracle como agentes del medidor «Agentes».
 *
 * MEDIDO el 26-10: el A1 llevaba horas con su orquestador vivo y 3 trabajadores sobre una cola
 * (`oracle_a1.py`, `TRABAJADORES = 3`), «Buscar más capacidad» y el director los contaban
 * (`contenedores_nube.vivos_oracle`), y el medidor «Agentes» de Genesis no enseñaba ninguno: sus latidos
 * solo podían llegar por el bus de medios, que es un archivo de la Mac en el que el A1 no escribe.
 *
 * Aquí se leen del estado que deja el ciclo del nodo (`oracle_nodo.py ciclo`, cada 30 min, en
 * `~/.starseed/oracle.json`, sin IPs ni claves): un agente por trabajador del orquestador mientras el nodo
 * late (`LATIDO_ORACLE_MAX_MS`) y su orquestador está vivo. Honestidad: no se sabe qué tarea lleva cada
 * trabajador (lo dice su rama al entregar), así que, como un run de GitHub, la tarjeta es `a1/<cola>` con
 * «trabajador k de n» y las tareas de su tanda; nunca más trabajadores que tareas tiene la cola.
 * Módulo puro: lo importa código de cliente (sin `node:*`).
 */

export const DONDE_ORACLE = "oracle";

export const TEXTO_ORACLE = "trabajador del orquestador del A1 de Oracle (2 OCPU · 12 GB, siempre encendido)";

/** Un latido del nodo más viejo que esto ya no dice qué hace (el ciclo lo refresca cada 30 min). */
export const LATIDO_ORACLE_MAX_MS = 45 * 60_000;

/** El latido de un trabajador del A1, con la forma de los del medidor. */
export interface AgenteOracle {
    tarea: string;
    fase: string;
    modelo: string;
    minutos: number;
    donde: string;
    cola: string;
    trabajador: number;
    trabajadores: number;
    tareasDeTanda: string[];
    latidoHaceS: number;
}

function numero(x: unknown): number {
    const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
    return Number.isFinite(n) ? n : NaN;
}

/** PURA. La cola que trabaja ahora el orquestador del A1 (`cola-….json`), o "" si no trabaja ninguna. */
export function colaDelA1(estado: unknown): string {
    const nodo = (estado as { nodo?: unknown } | null | undefined)?.nodo as
        | { orquestador?: { cola?: unknown }; cola?: unknown }
        | undefined;
    if (!nodo || typeof nodo !== "object") return "";
    const cola = nodo.orquestador?.cola ?? nodo.cola;
    return typeof cola === "string" ? cola.trim() : "";
}

/**
 * PURA. Del estado del nodo (`oracle.json`) y las tareas de su cola a un latido por trabajador vivo.
 * `tareasDeSuCola`: los ids de la cola (vacío si la cola no está en esta neurona, p. ej. una de la bandeja).
 */
export function agentesDelA1(estado: unknown, tareasDeSuCola: readonly string[], ahoraMs: number = Date.now()): AgenteOracle[] {
    const nodo = (estado as { nodo?: unknown } | null | undefined)?.nodo as
        | {
              vivo?: unknown;
              latido?: unknown;
              fase?: unknown;
              fase_desde?: unknown;
              orquestador?: { vivo?: unknown; trabajadores?: unknown };
          }
        | undefined;
    if (!nodo || typeof nodo !== "object" || nodo.vivo !== true) return [];
    const latido = numero(nodo.latido);
    if (!Number.isFinite(latido) || latido <= 0) return [];
    const haceMs = ahoraMs - latido * 1000;
    if (haceMs > LATIDO_ORACLE_MAX_MS) return [];
    const orq = nodo.orquestador;
    if (!orq || typeof orq !== "object" || orq.vivo !== true) return [];
    const trabajadores = Math.floor(numero(orq.trabajadores));
    if (!Number.isFinite(trabajadores) || trabajadores <= 0) return [];
    const ids = [...new Set(tareasDeSuCola.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()))];
    const n = ids.length ? Math.min(trabajadores, ids.length) : trabajadores;
    const cola = colaDelA1(estado);
    const corta = cola.replace(/\.json$/, "") || "cola sin nombre";
    const desde = numero(nodo.fase_desde);
    const minutos = nodo.fase === "cola" && Number.isFinite(desde) && desde > 0 ? Math.max(0, Math.floor((ahoraMs - desde * 1000) / 60_000)) : 0;
    return Array.from({ length: n }, (_, i) => ({
        tarea: `a1/${corta}`,
        fase: "trabajando en el A1",
        modelo: "orquestador del A1",
        minutos,
        donde: DONDE_ORACLE,
        cola: corta,
        trabajador: i + 1,
        trabajadores: n,
        tareasDeTanda: ids,
        latidoHaceS: Math.max(0, Math.round(haceMs / 1000)),
    }));
}
