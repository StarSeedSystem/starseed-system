/**
 * MOTORES DE VOZ (Ola 240 · Estudio de voces — tarea VZ2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo SOLO SERVIDOR: lee el estado del motor de máxima calidad (demonio
 * local OmniVoice en 127.0.0.1:4500) y de los modelos GGUF instalados en
 * `~/.starseed/astraura-voice/omnivoice.cpp/models/`, y permite REINICIAR el
 * demonio con otro tamaño de modelo (Q4_K_M ↔ Q8_0).
 *
 * Invariantes de seguridad:
 *  · NUNCA devuelve rutas absolutas del disco del usuario: solo nombres de
 *    archivo y datos agregados.
 *  · El demonio se habla siempre por `127.0.0.1`, jamás con una URL externa.
 *  · El reinicio solo acepta tamaños de la lista blanca y el candado de la
 *    ruta (`404` fuera de local) lo aplica quien llama.
 */

import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { openSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NIVELES, type InfoNivel } from "@/lib/aurora/voz-starseed/niveles";
import { PUERTO_VOZ, saludDaemon } from "@/lib/aurora/voz-starseed/daemon";

/** Tamaños de modelo OmniVoice que el OS sabe arrancar. */
export type TamanoModelo = "Q4_K_M" | "Q8_0";

/** Lista blanca de tamaños admitidos por el reinicio del demonio. */
export const TAMANOS_VALIDOS: readonly TamanoModelo[] = ["Q4_K_M", "Q8_0"];

/** Clasificación del tamaño de un archivo de modelo. */
export type ClaseModelo = TamanoModelo | "otro";

/** Un archivo `omnivoice-base-*.gguf` encontrado en la carpeta de modelos. */
export interface ModeloDisco {
    /** Nombre del archivo (jamás la ruta completa). */
    archivo: string;
    /** Tamaño inferido por el nombre; "otro" si el patrón no encaja. */
    tamano: ClaseModelo;
    /** Tamaño en bytes. */
    bytes: number;
    /** True si existe `omnivoice-tokenizer-<tamano>.gguf` junto al modelo. */
    tokenizer: boolean;
}

/** Estado del demonio local de voz. */
export interface EstadoDemonio {
    vivo: boolean;
    latenciaMs: number | null;
    modeloCargado: string | null;
    puerto: number;
}

/** Respuesta completa del lector de motores. */
export interface EstadoMotores {
    demonio: EstadoDemonio;
    modelos: ModeloDisco[];
    niveles: InfoNivel[];
}

/** Base de la instalación de voz en esta neurona (solo servidor). */
const BASE_VOZ = path.join(homedir(), ".starseed", "astraura-voice");

/** Carpeta donde viven los modelos GGUF (modelos y tokenizers). */
const CARPETA_MODELOS = path.join(BASE_VOZ, "omnivoice.cpp", "models");

/** Binario del servidor TTS que se reinicia. */
const BINARIO_TTS = path.join(BASE_VOZ, "omnivoice.cpp", "build", "tts-server");

/** Archivo de configuración del motor (puede anunciar el modelo en uso). */
const CONFIG_JSON = path.join(BASE_VOZ, "config.json");

/** Registro de salida del proceso del demonio. */
const REGISTRO_TTS = path.join(BASE_VOZ, "logs", "tts-server.out");

/** Patrón de nombre de los modelos principales: omnivoice-base-<tamano>.gguf */
const PATRON_MODELO = /^omnivoice-base-([A-Za-z0-9_]+)\.gguf$/;

const execFileAsync = promisify(execFile);

/** Clasifica un nombre de archivo de modelo en su tamaño conocido. */
function clasificar(nombre: string): ClaseModelo {
    const m = PATRON_MODELO.exec(nombre);
    if (!m) return "otro";
    return m[1] === "Q4_K_M" || m[1] === "Q8_0" ? m[1] as TamanoModelo : "otro";
}

/** Comprueba si un archivo existe (sin lanzar). */
async function existe(ruta: string): Promise<boolean> {
    try {
        await fs.access(ruta);
        return true;
    } catch {
        return false;
    }
}

/**
 * Enumera los modelos OmniVoice instalados en la carpeta de modelos.
 * No lanza: si la carpeta no existe (demonio no instalado) devuelve [].
 */
async function listarModelos(): Promise<ModeloDisco[]> {
    let nombres: string[];
    try {
        nombres = await fs.readdir(CARPETA_MODELOS);
    } catch {
        return [];
    }
    const modelos: ModeloDisco[] = [];
    for (const nombre of nombres) {
        if (!PATRON_MODELO.test(nombre)) continue;
        let bytes = 0;
        try {
            bytes = (await fs.stat(path.join(CARPETA_MODELOS, nombre))).size;
        } catch {
            continue;
        }
        const tamano = clasificar(nombre);
        // El tokenizer solo tiene sentido para los tamaños conocidos.
        const tokenizer = tamano !== "otro"
            ? await existe(path.join(CARPETA_MODELOS, `omnivoice-tokenizer-${tamano}.gguf`))
            : false;
        modelos.push({ archivo: nombre, tamano, bytes, tokenizer });
    }
    // Orden estable: Q8_0 primero, luego Q4_K_M; al resto, alfabético.
    const peso = (t: ClaseModelo): number => (t === "Q8_0" ? 0 : t === "Q4_K_M" ? 1 : 2);
    modelos.sort((a, b) => peso(a.tamano) - peso(b.tamano) || a.archivo.localeCompare(b.archivo));
    return modelos;
}

/**
 * Lee `config.json` de la instalación de voz y devuelve solo el nombre del
 * modelo declarado (si consta). Nunca lanza ni expone rutas.
 */
async function modeloDeclaradoEnConfig(): Promise<string | null> {
    try {
        const bruto = await fs.readFile(CONFIG_JSON, "utf8");
        const cfg = JSON.parse(bruto) as { model?: unknown; modelo?: unknown };
        const m = cfg.model ?? cfg.modelo;
        if (typeof m === "string" && m.trim()) return path.basename(m.trim());
    } catch {
        // Sin config o JSON ilegible: se informa como desconocido.
    }
    return null;
}

/**
 * Estado completo de los motores de voz de esta neurona: salud del demonio
 * (sondeo real a `/health`), modelos instalados en disco y los cuatro niveles
 * del motor único «Voz StarSeed». Nunca lanza.
 */
export async function leerMotores(): Promise<EstadoMotores> {
    const [salud, modelos, modeloConfig] = await Promise.all([
        saludDaemon(),
        listarModelos(),
        modeloDeclaradoEnConfig(),
    ]);
    return {
        demonio: {
            vivo: salud.vivo,
            latenciaMs: salud.latenciaMs,
            // Prioridad: lo que declara el demonio vivo; si no, la config.
            modeloCargado: salud.modelo ?? modeloConfig,
            puerto: PUERTO_VOZ,
        },
        modelos,
        niveles: Object.values(NIVELES),
    };
}

/**
 * REINICIA el demonio local con el modelo del tamaño pedido:
 *   1. Mata el `tts-server` actual (si lo hay).
 *   2. Lanza `tts-server` detached con modelo y tokenizer de ese tamaño,
 *      escribiendo su salida en `logs/tts-server.out`.
 *   3. Espera hasta `esperaMs` (40 s por defecto) a que `/health` responda.
 *
 * Devuelve `{ ok, modelo, segundos }`. Si el modelo o el tokenizer no existen
 * en disco, devuelve `{ ok: false }` sin tocar el proceso actual.
 */
export async function reiniciarConModelo(
    tamano: TamanoModelo,
    esperaMs = 40_000,
): Promise<{ ok: boolean; modelo: string; segundos: number }> {
    const modelo = `omnivoice-base-${tamano}.gguf`;
    const tokenizer = `omnivoice-tokenizer-${tamano}.gguf`;
    // Sin archivos, no hay reinicio: el demonio actual sigue como está.
    if (!(await existe(path.join(CARPETA_MODELOS, modelo)))) return { ok: false, modelo, segundos: 0 };
    if (!(await existe(path.join(CARPETA_MODELOS, tokenizer)))) return { ok: false, modelo, segundos: 0 };

    // 1) Parar el servidor actual (pkill devuelve 1 si no había proceso: está bien).
    try {
        await execFileAsync("pkill", ["-f", "tts-server"], { timeout: 5000, windowsHide: true });
    } catch {
        // No había proceso anterior, o no se pudo matar: se intenta arrancar igual.
    }

    // 2) Lanzar el nuevo demonio, desacoplado de este proceso de Node.
    await fs.mkdir(path.dirname(REGISTRO_TTS), { recursive: true });
    const registro = openSync(REGISTRO_TTS, "a");
    const hijo = spawn(BINARIO_TTS, [
        "--model", path.join("models", modelo),
        "--codec", path.join("models", tokenizer),
        "--host", "127.0.0.1",
        "--port", String(PUERTO_VOZ),
        "--lang", "Spanish",
    ], {
        cwd: BASE_VOZ,
        detached: true,
        stdio: ["ignore", registro, registro],
        env: process.env,
    });
    hijo.unref();

    // 3) Esperar a que /health responda (sondeo de 1 segundo entre intentos).
    const inicio = Date.now();
    let vivo = false;
    while (Date.now() - inicio < esperaMs) {
        await new Promise((r) => setTimeout(r, 1000));
        const salud = await saludDaemon(1500);
        if (salud.vivo) {
            vivo = true;
            break;
        }
    }
    return { ok: vivo, modelo, segundos: Math.round((Date.now() - inicio) / 1000) };
}
