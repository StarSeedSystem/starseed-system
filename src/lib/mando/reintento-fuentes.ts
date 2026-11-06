/**
 * Fuentes del cambio automático de `POST /api/mando/reintentar`, leídas sin llenar la memoria de Genesis
 * (SUP0511H, 05-11).
 *
 * Medido el 05-11 en la Mac: el montón de Genesis tenía 600–880 MB en `large_object_space` (cadenas y arrays
 * grandes) y con `lsof` se veían abiertos a la vez, durante minutos, cientos de `olas/logs/*.log` y varias
 * copias de `progreso.json`. Venía de esa ruta: para CADA llamada —también con una sola tarea pedida, como
 * hacen el medidor («Reparar») y `desatascar.py`— leía entero `eventos.jsonl` (32 MB) y el log y los pasos de
 * TODAS las tareas del progreso y de las colas (≈4 200 ids; 1 800 logs, 305 MB) en un solo `Promise.all`.
 * Al acabar, el montón bajó de 1 157 a 425 MB (18:04).
 *
 * Ahora: solo las tareas cuya fuente puede usar `ejecutarReintentoInteligente` (las pedidas y su cadena), el
 * final de cada log y de sus pasos, y de `eventos.jsonl` solo las líneas que `eventoDe` usaría, leídas por trozos.
 */
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

import { obtenerBaseId, type FuentesCambio } from "@/lib/mando/reintento-inteligente";

/** Lo que se lee del final de cada log y de cada `pasos/<id>.jsonl`: los fallos están al final. */
export const BYTES_FINAL = 256 * 1024;

/** PURA: los ids cuyas fuentes puede pedir `ejecutarReintentoInteligente`. Su `ultimoId` sale de la cadena del
 *  pedido (`idsCadena`: los del universo con el mismo `obtenerBaseId`), así que basta con esos. */
export function idsConFuentes(pedidos: readonly string[], universo: readonly string[]): string[] {
    const bases = new Set(pedidos.map(obtenerBaseId));
    return [...new Set([...pedidos, ...universo])].filter((id) => bases.has(obtenerBaseId(id)));
}

/** PURA: ¿le sirve esta línea de `eventos.jsonl` a `eventoDe` para alguna de estas tareas? (misma regla). */
export function lineaDeEventoUtil(linea: string, ids: readonly string[]): boolean {
    return /revisi|bloque|rechaz/i.test(linea) && ids.some((id) => linea.includes(id));
}

/** El final de un archivo (como mucho `bytes`) sin leerlo entero; sin la primera línea a medias. "" si no está. */
export async function finalDe(ruta: string, bytes = BYTES_FINAL): Promise<string> {
    let archivo: Awaited<ReturnType<typeof open>> | null = null;
    try {
        archivo = await open(ruta, "r");
        const { size } = await archivo.stat();
        const largo = Math.max(0, Math.min(size, bytes));
        const trozo = Buffer.alloc(largo);
        if (largo > 0) await archivo.read(trozo, 0, largo, size - largo);
        const texto = trozo.toString("utf8");
        return largo < size ? texto.slice(texto.indexOf("\n") + 1) : texto;
    } catch {
        return "";
    } finally {
        await archivo?.close().catch(() => undefined);
    }
}

/** Solo las líneas de `eventos.jsonl` que `eventoDe` usaría para estas tareas, leídas por trozos. */
export async function eventosDe(ruta: string, ids: readonly string[]): Promise<string> {
    if (ids.length === 0) return "";
    const utiles: string[] = [];
    try {
        const lineas = createInterface({ input: createReadStream(ruta, { encoding: "utf8" }), crlfDelay: Infinity });
        for await (const linea of lineas) {
            if (lineaDeEventoUtil(linea, ids)) utiles.push(linea);
        }
    } catch {
        return utiles.join("\n");
    }
    return utiles.join("\n");
}

function cadenas(valor: unknown): string[] {
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

/** Las fuentes de cada tarea: de una en una (nunca cientos de archivos abiertos a la vez). */
export async function fuentesPorId(dir: string, ids: readonly string[], revisionesMd: string,
    progreso: unknown): Promise<Record<string, FuentesCambio>> {
    const eventos = await eventosDe(path.join(dir, "eventos.jsonl"), ids);
    const salida: Record<string, FuentesCambio> = {};
    for (const id of ids) {
        const pasos = await finalDe(path.join(dir, "pasos", `${id}.jsonl`));
        const log = await finalDe(path.join(dir, "logs", `${id}.log`));
        const entrada = progreso && typeof progreso === "object" && !Array.isArray(progreso)
            ? (progreso as Record<string, unknown>)[id] : null;
        const datos = entrada && typeof entrada === "object" ? entrada as Record<string, unknown> : {};
        const faltantes = cadenas(datos.faltantes ?? datos.archivos_faltantes);
        salida[id] = { revisionesMd, eventos, pasos, log, faltantes };
    }
    return salida;
}
