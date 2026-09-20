/**
 * USO DE CLAUDE CODE (Ola 352 · MU1) — solo servidor
 * ─────────────────────────────────────────────────────────────────────────────
 * Suma lo que gastan las sesiones de Claude Code de esta Mac leyendo los
 * `.jsonl` de `~/.claude/projects`: cada línea es un evento y las de
 * assistant traen `message.usage` con `input_tokens`, `output_tokens`,
 * `cache_read_input_tokens` y `cache_creation_input_tokens`.
 * La «relectura de caché» es `cache_read / (input + cache_read + cache_creation)`
 * en porcentaje: cuánto del contexto se recuperó gratis en vez de reprocesarse.
 *
 * Seguridad (innegociable): NUNCA devuelve rutas absolutas del disco ni el
 * contenido de los mensajes; solo nombres de archivo recortados, la carpeta
 * de proyecto saneada y números.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface TotalesUso {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
    turnos: number;
    relectura_pct: number;
}

export interface ResumenUsoClaude {
    disponible: boolean;
    total: TotalesUso & { total: number };
    sesiones: Array<
        TotalesUso & {
            /** Nombre del archivo recortado, sin ruta. */
            archivo: string;
            /** ISO de la última modificación. */
            cuando: string;
            /** Carpeta de proyecto saneada (guiones → texto legible). */
            proyecto: string;
        }
    >;
}

interface UsoLinea {
    input: number;
    output: number;
    cache_read: number;
    cache_creation: number;
}

function numerito(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function extraerUsage(linea: string): UsoLinea | null {
    let obj: unknown;
    try {
        obj = JSON.parse(linea);
    } catch {
        return null;
    }
    if (typeof obj !== "object" || obj === null) return null;
    const usage = (obj as { message?: { usage?: Record<string, unknown> } }).message?.usage;
    if (typeof usage !== "object" || usage === null) return null;
    return {
        input: numerito(usage.input_tokens),
        output: numerito(usage.output_tokens),
        cache_read: numerito(usage.cache_read_input_tokens),
        cache_creation: numerito(usage.cache_creation_input_tokens),
    };
}

function porcentajeRelectura(input: number, cache_read: number, cache_creation: number): number {
    const total = input + cache_read + cache_creation;
    if (total <= 0) return 0;
    return Math.round((cache_read / total) * 10000) / 100;
}

/** Parte pura: suma las líneas de un .jsonl; las rotas o sin usage se saltan. */
export function sumarUso(lineas: string[]): TotalesUso {
    let input = 0;
    let output = 0;
    let cache_read = 0;
    let cache_creation = 0;
    let turnos = 0;
    for (const linea of lineas) {
        if (!linea.trim()) continue;
        const u = extraerUsage(linea);
        if (!u) continue;
        turnos += 1;
        input += u.input;
        output += u.output;
        cache_read += u.cache_read;
        cache_creation += u.cache_creation;
    }
    return { input, output, cache_read, cache_creation, turnos, relectura_pct: porcentajeRelectura(input, cache_read, cache_creation) };
}

function saneaProyecto(carpeta: string): string {
    const limpio = carpeta.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ._~-]/g, "").trim();
    return limpio.replace(/^-+|-+$/g, "").replace(/-/g, " ").slice(0, 60) || "desconocido";
}

async function listarJsonl(raiz: string): Promise<string[]> {
    const rutas: string[] = [];
    let proyectos: string[];
    try {
        proyectos = await readdir(raiz);
    } catch {
        return [];
    }
    for (const proyecto of proyectos.slice(0, 500)) {
        try {
            const dir = path.join(raiz, proyecto);
            const entradas = await readdir(dir);
            for (const e of entradas) {
                if (e.endsWith(".jsonl")) rutas.push(path.join(dir, e));
            }
        } catch {
            /* carpeta legible o no: se salta */
        }
    }
    return rutas;
}

export async function resumirSesionesClaude(
    raiz = path.join(os.homedir(), ".claude", "projects"),
    max = 10,
): Promise<ResumenUsoClaude> {
    const vacio: ResumenUsoClaude = {
        disponible: false,
        total: { input: 0, output: 0, cache_read: 0, cache_creation: 0, turnos: 0, relectura_pct: 0, total: 0 },
        sesiones: [],
    };
    try {
        if (!(await stat(raiz)).isDirectory()) return vacio;
    } catch {
        return vacio;
    }

    const rutas = await listarJsonl(raiz);
    const sesionesBrutas: Array<{ ruta: string; mtime: number }> = [];
    for (const ruta of rutas) {
        try {
            sesionesBrutas.push({ ruta, mtime: (await stat(ruta)).mtimeMs });
        } catch {
            /* desapareció entre listado y stat */
        }
    }
    sesionesBrutas.sort((a, b) => b.mtime - a.mtime);

    const sesiones: ResumenUsoClaude["sesiones"] = [];
    for (const s of sesionesBrutas.slice(0, Math.max(1, max))) {
        try {
            const contenido = await readFile(s.ruta, "utf8");
            const uso = sumarUso(contenido.split("\n"));
            sesiones.push({
                archivo: path.basename(s.ruta).slice(0, 40),
                cuando: new Date(s.mtime).toISOString(),
                proyecto: saneaProyecto(path.basename(path.dirname(s.ruta))),
                ...uso,
            });
        } catch {
            /* lectura fallida: se salta */
        }
    }

    const t = { input: 0, output: 0, cache_read: 0, cache_creation: 0, turnos: 0 };
    for (const s of sesiones) {
        t.input += s.input;
        t.output += s.output;
        t.cache_read += s.cache_read;
        t.cache_creation += s.cache_creation;
        t.turnos += s.turnos;
    }
    return {
        disponible: true,
        total: { ...t, relectura_pct: porcentajeRelectura(t.input, t.cache_read, t.cache_creation), total: t.input + t.output + t.cache_read + t.cache_creation },
        sesiones,
    };
}
