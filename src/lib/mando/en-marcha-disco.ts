/**
 * (2026-11-11, MED1111E) Lectura en disco del carril de Claude y de la puerta de integración (solo servidor).
 * Las carpetas entran como parámetro para probarlo con carpetas temporales; la ruta de medidores pasa las reales.
 * Nunca lanza: lo que no se puede leer es `null`, y la vista lo dice como «sin datos».
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { leerRegistroCarril, type LecturaCarril } from "./carril-claude";
import { elegirEstadoPuerta, parsearEstadoPuerta, parsearLogPuerta, type EstadoPuerta } from "./puerta-integracion";

/** El registro del carril (`<raíz>/starseed_memory_root/olas/carril-claude/registro.json`), sin prompts ni archivos. */
export async function leerCarrilDeDisco(raiz: string): Promise<LecturaCarril | null> {
    try {
        const crudo = await readFile(path.join(raiz, "starseed_memory_root", "olas", "carril-claude", "registro.json"), "utf8");
        return leerRegistroCarril(JSON.parse(crudo));
    } catch {
        return null;
    }
}

/** El `aplicar-*.log` más nuevo de la carpeta de la puerta, hecho estado. */
export async function leerUltimoLogDeLaPuerta(carpetaLogs: string): Promise<EstadoPuerta | null> {
    try {
        const nombres = (await readdir(carpetaLogs)).filter((n) => /^aplicar-[\w.-]+\.log$/.test(n));
        const fichas = await Promise.all(nombres.map(async (n) => ({ n, e: await stat(path.join(carpetaLogs, n)).catch(() => null) })));
        const nuevo = fichas.filter((f) => f.e).sort((a, b) => (b.e?.mtimeMs ?? 0) - (a.e?.mtimeMs ?? 0))[0];
        if (!nuevo?.e) return null;
        const crudo = await readFile(path.join(carpetaLogs, nuevo.n), "utf8");
        // Un log con la salida de vitest entera puede pesar; el principio (picks) y el final (resultado) bastan.
        const texto = crudo.length > 600_000 ? `${crudo.slice(0, 200_000)}\n${crudo.slice(-400_000)}` : crudo;
        return parsearLogPuerta(texto, nuevo.e.mtimeMs, nuevo.n, nuevo.e.birthtimeMs);
    } catch {
        return null;
    }
}

/**
 * La puerta: el estado que escribe `scripts/puente/puerta_estado.py` y, de respaldo (la puerta que ya corre no lo
 * escribe), el log más nuevo. Gana el de rastro más nuevo.
 */
export async function leerPuertaDeDisco(archivoEstado: string, carpetaLogs: string): Promise<EstadoPuerta | null> {
    const delEstado = await readFile(archivoEstado, "utf8")
        .then((t) => parsearEstadoPuerta(JSON.parse(t)))
        .catch(() => null);
    return elegirEstadoPuerta(delEstado, await leerUltimoLogDeLaPuerta(carpetaLogs));
}
