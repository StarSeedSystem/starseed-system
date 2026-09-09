/**
 * Salud de las colas del enjambre (Ola 298 · LT1 · 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Detecta colas huérfanas: colas con tareas pendientes cuyo orquestador ya no
 * late (murió con el reciclado del contenedor, por ejemplo). El Mando usaba la
 * cabecera «0 en curso · 18 pendientes» sin decir que NO HAY NADIE trabajando.
 *
 * Cada ola viva reescribe `olas/latidos-<cola>.json` cada ~2 min; si el archivo
 * lleva más de `umbralMin` minutos sin tocarse y aún quedan pendientes, la cola
 * está huérfana. Las funciones puras de abajo se pueden probar sin disco; la
 * lectura real (async) va al final, reusando los lectores de `lector-local`.
 */

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { leerColas, leerProgreso } from "@/lib/mando/lector-local";
import { raizDelProyecto } from "@/lib/mando/raiz";

/** Estado de vida de una cola respecto a su orquestador. */
export type EstadoCola = "viva" | "huerfana" | "terminada" | "sin_latido";

/** Salud de una cola: qué queda por hacer y si alguien está viviendo para hacerlo. */
export interface SaludCola {
    cola: string;
    estado: EstadoCola;
    pendientes: number;
    integradas: number;
    ultimoLatidoMs: number | null;
    paradaHaceMin: number | null;
    motivo: string;
}

/** Progreso por tarea como lo lee `lector-local.leerProgreso` (objetos sueltos). */
type Progreso = Record<string, { estado?: string }>;

/** Estados que cuentan como «tarea integrada / cerrada con éxito». */
const TERMINADAS = new Set(["commit", "bloqueante", "sin_cambios", "sustituida", "reasignada", "rechazada"]);

/** Interpreta la salud de UNA cola a partir de sus tareas, progreso y latido. */
export function interpretarSalud(
    cola: string,
    tareas: { id: string }[],
    progreso: Progreso,
    latidoMtimeMs: number | null,
    ahoraMs: number,
    umbralMin = 6,
): SaludCola {
    let integradas = 0;
    let pendientes = 0;
    for (const t of tareas) {
        const estado = progreso[t.id]?.estado ?? "";
        if (TERMINADAS.has(estado)) integradas += 1;
        else pendientes += 1;
    }

    // Toda la cola cerrada: no importa si el latido es viejo.
    if (pendientes === 0) {
        return {
            cola,
            estado: "terminada",
            pendientes: 0,
            integradas,
            ultimoLatidoMs: latidoMtimeMs,
            paradaHaceMin: latidoMtimeMs === null ? null : Math.round((ahoraMs - latidoMtimeMs) / 60000),
            motivo: "todas las tareas están integradas",
        };
    }

    // Nunca hubo latido.
    if (latidoMtimeMs === null) {
        const motivo =
            integradas > 0
                ? `${pendientes} tarea${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"} y nunca hubo latido, pese a que ya se empezó a integrar`
                : `${pendientes} tarea${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"} y nunca hubo latido`;
        return { cola, estado: "sin_latido", pendientes, integradas, ultimoLatidoMs: null, paradaHaceMin: null, motivo };
    }

    const paradaHaceMin = Math.round((ahoraMs - latidoMtimeMs) / 60000);
    if (paradaHaceMin > umbralMin) {
        return {
            cola,
            estado: "huerfana",
            pendientes,
            integradas,
            ultimoLatidoMs: latidoMtimeMs,
            paradaHaceMin,
            motivo: `${pendientes} tarea${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"} y el último latido fue hace ${paradaHaceMin} min: no hay ningún orquestador vivo`,
        };
    }

    return {
        cola,
        estado: "viva",
        pendientes,
        integradas,
        ultimoLatidoMs: latidoMtimeMs,
        paradaHaceMin,
        motivo: `${pendientes} tarea${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"} y el último latido fue hace ${paradaHaceMin} min: hay un orquestador trabajando`,
    };
}

/** Ordena las colas por urgencia: huérfanas primero (más pendientes, más tiempo paradas). */
export function ordenarPorUrgencia(saludes: SaludCola[]): SaludCola[] {
    const peso = (s: SaludCola): number => {
        if (s.estado === "huerfana") return 0;
        if (s.estado === "sin_latido") return 1;
        if (s.estado === "viva") return 2;
        return 3; // terminada al final
    };
    return [...saludes].sort(
        (a, b) =>
            peso(a) - peso(b) ||
            b.pendientes - a.pendientes ||
            (b.paradaHaceMin ?? 0) - (a.paradaHaceMin ?? 0) ||
            a.cola.localeCompare(b.cola),
    );
}

/** Resumen numérico y una frase de titular para la cabecera del Mando. */
export function resumen(saludes: SaludCola[]): { vivas: number; huerfanas: number; pendientesHuerfanas: number; frase: string } {
    const vivas = saludes.filter((s) => s.estado === "viva").length;
    const huerfanas = saludes.filter((s) => s.estado === "huerfana").length;
    const pendientesHuerfanas = saludes
        .filter((s) => s.estado === "huerfana")
        .reduce((suma, s) => suma + s.pendientes, 0);

    let frase: string;
    if (huerfanas > 0) {
        frase = `${huerfanas} cola${huerfanas === 1 ? "" : "s"} huérfana${huerfanas === 1 ? "" : "s"} con ${pendientesHuerfanas} tarea${pendientesHuerfanas === 1 ? "" : "s"} pendiente${pendientesHuerfanas === 1 ? "" : "s"} sin orquestador`;
    } else if (vivas > 0) {
        frase = `${vivas} cola${vivas === 1 ? "" : "s"} viva${vivas === 1 ? "" : "s"} · hay orquestadores trabajando`;
    } else {
        frase = "no hay colas pendientes";
    }

    return { vivas, huerfanas, pendientesHuerfanas, frase };
}

const RAÍZ = raizDelProyecto();

/** Carpeta de olas, como la resuelve el lector: `starseed_memory_root/olas` o `olas`. */
async function directorioOlas(): Promise<string> {
    for (const candidata of ["starseed_memory_root/olas", "olas"]) {
        try {
            await readdir(path.join(RAÍZ, candidata));
            return candidata;
        } catch {
            // se prueba la siguiente
        }
    }
    return "starseed_memory_root/olas";
}

/**
 * `mtime` de `olas/latidos-<cola>.json` (ms), o `null` si el archivo no existe.
 * Es el reloj que delata a un orquestador muerto: mientras vive lo reescribe cada ~2 min.
 */
async function latidoMtime(cola: string, dirOlas: string): Promise<number | null> {
    try {
        const info = await stat(path.join(RAÍZ, dirOlas, `latidos-${cola}.json`));
        return info.mtimeMs;
    } catch {
        return null;
    }
}

/**
 * Salud de TODAS las colas del disco. Reusa `leerColas`/`leerProgreso` de `lector-local`
 * y solo añade el reloj de los latidos. Nunca lanza: si algo falla devuelve lo que pueda.
 */
export async function saludDeLasColas(umbralMin = 6): Promise<SaludCola[]> {
    const ahora = Date.now();
    const dirOlas = await directorioOlas();

    // `leerColas` y `leerProgreso` ya son tolerantes a la ausencia de archivos,
    // pero una sola cola en mal estado no debe tumbar el resto.
    let tareas: Awaited<ReturnType<typeof leerColas>> = [];
    let progreso: Record<string, unknown> = {};
    try {
        [tareas, progreso] = await Promise.all([leerColas(), leerProgreso()]);
    } catch {
        return [];
    }

    // Agrupa las tareas por cola para interpretar cada una por separado.
    const porCola = new Map<string, { id: string }[]>();
    for (const t of tareas) {
        const cola = t.cola || t.ola || t.id;
        const lista = porCola.get(cola) ?? [];
        lista.push({ id: t.id });
        porCola.set(cola, lista);
    }

    const salidas: SaludCola[] = [];
    for (const [cola, lista] of porCola) {
        const mtime = await latidoMtime(cola, dirOlas);
        salidas.push(
            interpretarSalud(
                cola,
                lista,
                progreso as Progreso,
                mtime,
                ahora,
                umbralMin,
            ),
        );
    }

    return ordenarPorUrgencia(salidas);
}