/**
 * Ajuste global «mantener la pantalla encendida» (Ola 1005P).
 * ─────────────────────────────────────────────────────────────────────────
 * Un único archivo `~/.starseed/pantalla.json` gobierna tanto el servicio de
 * la Mac (`com.starseed.pantalla`, caffeinate) como la Screen Wake Lock de
 * cualquier navegador con Genesis abierto. Encendido por defecto: si el
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
    /** Modo keepalive (KAL1101C): "pantalla" todo despierto; "sistema" solo el sistema. */
    modo?: "pantalla" | "sistema";
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
    const activa = typeof obj.activa === "boolean" ? obj.activa : PANTALLA_POR_DEFECTO.activa;
    const modo = obj.modo === "pantalla" || obj.modo === "sistema" ? obj.modo : undefined;
    return {
        activa,
        // (KAL1101C) El modo declarado solo cuenta con el ajuste encendido:
        // así lo lee `scripts/puente/mantener_pantalla.py`, y
        // {"activa": false, "modo": "sistema"} NO puede dejar el servicio despierto.
        ...(activa && modo ? { modo } : {}),
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
    modo?: string,
): Promise<AjustePantalla> {
    const modoValido = activa && (modo === "pantalla" || modo === "sistema")
        ? modo
        : undefined;
    const ajuste: AjustePantalla = {
        activa,
        ...(modoValido ? { modo: modoValido } : {}),
        desde: Date.now(),
        quien,
    };
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

/* ════════ KAL1101C · el estado del latido local, leído tal cual ════════ */

/** Archivo de estado que escribe el latido local (`mantener_pantalla.py`, KAL1101B). */
function rutaDespierto(): string {
    return process.env.STARSEED_DESPIERTO_JSON
        ?? path.join(os.homedir(), ".starseed", "despierto.json");
}

/** Lee crudo `~/.starseed/despierto.json`; null = sin dato (no se inventa estado). */
export async function leerDespierto(ruta?: string): Promise<Record<string, unknown> | null> {
    try {
        const bruto: unknown = JSON.parse(await readFile(ruta ?? rutaDespierto(), "utf-8"));
        return bruto && typeof bruto === "object" && !Array.isArray(bruto)
            ? (bruto as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

/** La forma que leen las neuronas del latido (`estadoKeepaliveDeLatido`). */
export interface SenalesKeepalive {
    keepalive: { activo: boolean; modo?: string };
}

/**
 * PURA: el estado del latido mapeado al contrato keepalive, con fechas reales del
 * archivo: `activo` solo si la herramienta del latido ES keepalive. Sin archivo o
 * sin campo reconocible devuelve null («sin dato», nunca apagado de invención).
 */
export function senalesDespierto(despierto: unknown): SenalesKeepalive | null {
    if (!despierto || typeof despierto !== "object") return null;
    const d = despierto as Record<string, unknown>;
    if (typeof d.herramienta !== "string" && d.modo === undefined) return null;
    return {
        keepalive: {
            activo: d.herramienta === "keepalive",
            ...(d.modo === "pantalla" || d.modo === "sistema" ? { modo: d.modo } : {}),
        },
    };
}
