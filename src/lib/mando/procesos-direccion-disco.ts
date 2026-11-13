/**
 * (2026-11-13, MED1113A) La medida de los procesos de la dirección (solo servidor).
 *
 * No se mide aquí por segunda vez: se pide al MISMO script que usan la dirección y la comprobación
 * (`scripts/puente/procesos_direccion.py estado --json`), así pastilla, ventana y «Comprobar ahora»
 * salen de una sola regla. Nunca lanza: si el script no contesta, `null` y la vista dice «no se pudo medir».
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { leerEstadoDireccion, type LecturaDireccion } from "./procesos-direccion";

const correr = promisify(execFile);

export async function leerProcesosDireccion(raiz: string, python = "python3"): Promise<LecturaDireccion | null> {
    try {
        const { stdout } = await correr(python, [path.join(raiz, "scripts", "puente", "procesos_direccion.py"), "estado", "--json"], {
            cwd: raiz,
            timeout: 25_000,
            maxBuffer: 2_000_000,
        });
        const linea = stdout.trim().split("\n").pop() ?? "";
        return leerEstadoDireccion(JSON.parse(linea));
    } catch {
        return null;
    }
}
