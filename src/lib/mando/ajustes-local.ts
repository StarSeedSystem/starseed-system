/**
 * Lector y escritor de `~/.starseed/enjambre.json` (Ola 233 · solo servidor)
 * ─────────────────────────────────────────────────────────────────────────
 * El orquestador del enjambre (`starseed-enjambre.py`) lee ese archivo al
 * iniciar cada ola. La ruta `GET/PUT /api/mando/ajustes` es la ÚNICA ventana
 * del OS sobre él.
 *
 * Reglas de seguridad del área:
 *  • Nunca se devuelve la ruta absoluta del archivo al cliente: solo el
 *    nombre (`~/.starseed/enjambre.json`).
 *  • El lector es tolerante: si el archivo no existe o el JSON está mal
 *    formado, devuelve los valores por defecto documentados.
 *  • El escritor valida TODO antes de tocar el disco vía `validarConfig`:
 *    rangos numéricos, lista blanca de proveedores y modelos. Un valor
 *    inválido se descarta silenciosamente y se cae al valor por defecto.
 *  • Sin claves ni rutas en el payload: solo el contrato `ConfigEnjambre`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
    AJUSTES_POR_DEFECTO,
    MODELOS_SUGERIDOS,
    validarConfig,
    type ConfigEnjambre,
    type ProveedorPermitido,
} from "@/lib/mando/ajustes-tipos";

/** Carpeta del archivo: `~/.starseed/enjambre.json`. */
function rutaArchivo(): string {
    return path.join(os.homedir(), ".starseed", "enjambre.json");
}

/** Etiqueta segura del archivo (sin ruta absoluta del disco del usuario). */
export const ETIQUETA_ARCHIVO = "~/.starseed/enjambre.json";

/** Lee la configuración real del disco (o los valores por defecto). */
export async function leerConfigEnjambre(): Promise<ConfigEnjambre> {
    try {
        const contenido = await readFile(rutaArchivo(), "utf-8");
        const bruto = JSON.parse(contenido) as unknown;
        return validarConfig(bruto);
    } catch {
        return validarConfig(AJUSTES_POR_DEFECTO);
    }
}

/** Escribe la configuración en disco creando la carpeta si hace falta. */
export async function escribirConfigEnjambre(
    config: ConfigEnjambre,
): Promise<ConfigEnjambre> {
    const saneada = validarConfig(config);
    const ruta = rutaArchivo();
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, `${JSON.stringify(saneada, null, 2)}\n`, "utf-8");
    return saneada;
}

/** Lista de modelos sugeridos expuesta al panel (para los selectores). */
export function modelosSugeridos(): Record<ProveedorPermitido, readonly string[]> {
    return MODELOS_SUGERIDOS;
}
