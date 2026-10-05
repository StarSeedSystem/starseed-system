/**
 * Ajuste global «mantener la pantalla encendida» (Ola 1005P).
 * ─────────────────────────────────────────────────────────────────────────
 * Un único archivo `~/.starseed/pantalla.json` gobierna tanto el servicio de
 * la Mac (`com.starseed.pantalla`, caffeinate) como la Screen Wake Lock de
 * cualquier navegador con el Mando abierto. Encendido por defecto: si el
 * archivo no existe o está roto, vale `activa: true`.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AjustePantalla {
    activa: boolean;
    desde: number | null;
    quien: string;
}

export interface EstadoServicioMac {
    servicio_vivo: boolean;
    pid: number | null;
}

export const PANTALLA_POR_DEFECTO: AjustePantalla = {
    activa: true,
    desde: null,
    quien: "defecto",
};

/** Etiqueta segura del archivo (nunca la ruta absoluta del disco del usuario). */
export const ETIQUETA_PANTALLA = "~/.starseed/pantalla.json";

/** Ruta real del archivo; se puede inyectar con STARSEED_PANTALLA_JSON (pruebas). */
function rutaArchivo(): string {
    return process.env.STARSEED_PANTALLA_JSON
        ?? path.join(os.homedir(), ".starseed", "pantalla.json");
}

/** PURA: sanea lo leído del disco; cualquier cosa rara cae al valor por defecto. */
export function validarPantalla(bruto: unknown): AjustePantalla {
    if (!bruto || typeof bruto !== "object") return { ...PANTALLA_POR_DEFECTO };
    const obj = bruto as Record<string, unknown>;
    return {
        activa: typeof obj.activa === "boolean" ? obj.activa : PANTALLA_POR_DEFECTO.activa,
        desde: typeof obj.desde === "number" && Number.isFinite(obj.desde) ? obj.desde : null,
        quien: typeof obj.quien === "string" && obj.quien.length > 0
            ? obj.quien
            : PANTALLA_POR_DEFECTO.quien,
    };
}

/** Lee el ajuste del disco; si no existe o está roto, el valor por defecto (activa). */
export async function leerPantalla(ruta?: string): Promise<AjustePantalla> {
    try {
        const contenido = await readFile(ruta ?? rutaArchivo(), "utf-8");
        return validarPantalla(JSON.parse(contenido) as unknown);
    } catch {
        return { ...PANTALLA_POR_DEFECTO };
    }
}

/** Guarda el ajuste (tmp + rename para no dejar el archivo a medias). */
export async function guardarPantalla(
    activa: boolean,
    quien: string,
    ruta?: string,
): Promise<AjustePantalla> {
    const ajuste: AjustePantalla = { activa, desde: Date.now(), quien };
    const destino = ruta ?? rutaArchivo();
    await mkdir(path.dirname(destino), { recursive: true });
    const temporal = `${destino}.tmp`;
    await writeFile(temporal, `${JSON.stringify(ajuste, null, 2)}\n`, "utf-8");
    await rename(temporal, destino);
    return ajuste;
}

/** Estado del servicio `com.starseed.pantalla`; si falla `launchctl`, caído. */
export async function estadoServicioMac(): Promise<EstadoServicioMac> {
    try {
        const { stdout } = await execFileAsync(
            "launchctl",
            ["list", "com.starseed.pantalla"],
            { timeout: 3000, windowsHide: true },
        );
        const hallazgo = /"PID"\s*=\s*(\d+)/.exec(stdout);
        const pid = hallazgo ? Number.parseInt(hallazgo[1], 10) : null;
        return pid && pid > 0
            ? { servicio_vivo: true, pid }
            : { servicio_vivo: false, pid: null };
    } catch {
        return { servicio_vivo: false, pid: null };
    }
}
