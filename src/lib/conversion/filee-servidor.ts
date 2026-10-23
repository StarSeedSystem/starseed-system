// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión de archivos con Filee (SOLO SERVIDOR)
// ----------------------------------------------------------------------------
// Llama a la orden `filee` de ESTA neurona (KnifeLemon/Filee, MIT): nunca por
// una shell (execFile con lista de argumentos), en una carpeta temporal propia
// que se borra siempre, con tope de tamaño, de tiempo y de trabajos a la vez.
// `filee convert <archivo> --to <formato> -o <carpeta> --json` devuelve:
//   { converted, failed, files: [{ state: "done"|"failed", outputs: [...], error? }] }
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { execFile } from "node:child_process";
import { promises as fs, constants as fsc } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildZipBlob } from "@/lib/files/simple-zip";
import { esFormatoValido, formatoDe, leerDestinos, nombreDeSalida, type DestinosFormato } from "./formatos";

/** 500 MB: lo que cabe holgado en la memoria del servidor de una neurona de 8 GB. */
export const MAX_BYTES_CONVERSION = 500 * 1024 * 1024;
/** Vídeo largo a AV1 puede tardar; más de 15 min es que algo se colgó. */
export const TIEMPO_CONVERSION_MS = 15 * 60 * 1000;
/** Conversiones a la vez en esta neurona (Filee ya paraleliza por dentro). */
export const MAX_SIMULTANEAS = 2;

export interface EstadoFilee {
    instalado: boolean;
    version: string | null;
    /** Solo el nombre del sitio («~/.local/bin»), nunca el home real. */
    donde: string | null;
}

export interface ResultadoConversion {
    ok: boolean;
    nombre?: string;
    bytes?: Uint8Array;
    tipo?: string;
    /** Cuántos archivos salieron (una página por PNG, por ejemplo). Más de uno → ZIP. */
    salidas?: number;
    motivo?: string;
    /** 400 entrada mala · 413 enorme · 422 Filee no pudo · 429 ocupado · 503 sin Filee · 504 tiempo. */
    status?: number;
    ms?: number;
}

type Ejecutar = (bin: string, args: string[], opciones: { timeout: number; maxBuffer: number; cwd?: string }) => Promise<{ stdout: string; stderr: string; code: number }>;

const ejecutarReal: Ejecutar = (bin, args, opciones) =>
    new Promise((resolve) => {
        execFile(bin, args, { ...opciones, windowsHide: true, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => {
            const code = err && typeof (err as { code?: unknown }).code === "number" ? Number((err as { code: number }).code) : err ? 1 : 0;
            resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code });
        });
    });

let ejecutar: Ejecutar = ejecutarReal;
/** Solo pruebas: sustituye la ejecución de procesos. */
export function _ponerEjecutor(e: Ejecutar | null): void {
    ejecutar = e ?? ejecutarReal;
    cacheEstado = null;
    cacheDestinos.clear();
}

function candidatos(): string[] {
    const home = os.homedir();
    const env = process.env.FILEE_BIN?.trim();
    const enPath = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, "filee"));
    return [
        ...(env ? [env] : []),
        path.join(home, ".local", "bin", "filee"),
        "/opt/homebrew/bin/filee",
        "/usr/local/bin/filee",
        path.join(home, "Applications", "Filee.app", "Contents", "MacOS", "filee-cli"),
        "/Applications/Filee.app/Contents/MacOS/filee-cli",
        ...enPath,
    ];
}

async function rutaFilee(): Promise<string | null> {
    for (const c of candidatos()) {
        try {
            await fs.access(c, fsc.X_OK);
            return c;
        } catch { /* siguiente */ }
    }
    return null;
}

function dondeLegible(ruta: string): string {
    const home = os.homedir();
    const dir = path.dirname(ruta);
    return dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir;
}

let cacheEstado: { t: number; v: EstadoFilee & { ruta: string | null } } | null = null;

/** ¿Hay Filee en esta neurona? (caché 60 s). */
export async function estadoFilee(fresco = false): Promise<EstadoFilee & { ruta: string | null }> {
    if (!fresco && cacheEstado && Date.now() - cacheEstado.t < 60_000) return cacheEstado.v;
    const ruta = await rutaFilee();
    let version: string | null = null;
    if (ruta) {
        const r = await ejecutar(ruta, ["version"], { timeout: 15_000, maxBuffer: 64 * 1024 });
        const m = r.stdout.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
        version = r.code === 0 && m ? m[1] : null;
    }
    const v = { instalado: Boolean(ruta && version), version, donde: ruta ? dondeLegible(ruta) : null, ruta: ruta && version ? ruta : null };
    cacheEstado = { t: Date.now(), v };
    return v;
}

const cacheDestinos = new Map<string, { t: number; v: DestinosFormato | null }>();

/** A qué convierte un formato en ESTA neurona (`filee formats <f>`, caché 10 min). */
export async function destinosFilee(formatoOArchivo: string): Promise<DestinosFormato | null> {
    const f = formatoDe(formatoOArchivo);
    if (!f) return null;
    const hit = cacheDestinos.get(f);
    if (hit && Date.now() - hit.t < 10 * 60_000) return hit.v;
    const est = await estadoFilee();
    if (!est.ruta) return null;
    const r = await ejecutar(est.ruta, ["formats", f], { timeout: 20_000, maxBuffer: 256 * 1024 });
    const v = r.code === 0 ? leerDestinos(r.stdout) : null;
    cacheDestinos.set(f, { t: Date.now(), v });
    return v;
}

let enCurso = 0;

/** Nombre seguro para el disco: sin rutas, sin caracteres raros, con su extensión. */
export function nombreSeguro(nombre: string): string {
    const base = (String(nombre ?? "").split(/[\\/]/).pop() ?? "").normalize("NFC");
    const limpio = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "").slice(-180).trim();
    return limpio || "archivo";
}

const TIPOS: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
    svg: "image/svg+xml", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", html: "text/html; charset=utf-8",
    json: "application/json", csv: "text/csv; charset=utf-8", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
    m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", zip: "application/zip", glb: "model/gltf-binary",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    epub: "application/epub+zip",
};
export function tipoDe(nombre: string): string {
    return TIPOS[formatoDe(nombre)] ?? "application/octet-stream";
}

interface InformeFilee {
    converted?: number;
    failed?: number;
    files?: { state?: string; outputs?: string[]; error?: string }[];
}

function leerInforme(stdout: string): InformeFilee | null {
    const i = stdout.indexOf("{");
    if (i < 0) return null;
    try {
        return JSON.parse(stdout.slice(i)) as InformeFilee;
    } catch {
        return null;
    }
}

/**
 * Convierte unos bytes con Filee. Nunca lanza: devuelve un resultado honesto.
 * Si salen varios archivos (un PDF de 12 páginas a PNG) se devuelven en un ZIP.
 */
export async function convertirConFilee(entrada: {
    bytes: Uint8Array;
    nombre: string;
    a: string;
    calidad?: number | null;
}): Promise<ResultadoConversion> {
    const t0 = Date.now();
    const a = formatoDe(entrada.a);
    if (!esFormatoValido(a)) return { ok: false, status: 400, motivo: "Formato de destino no válido." };
    if (!entrada.bytes?.byteLength) return { ok: false, status: 400, motivo: "El archivo está vacío." };
    if (entrada.bytes.byteLength > MAX_BYTES_CONVERSION) {
        return { ok: false, status: 413, motivo: `El archivo pasa de ${Math.round(MAX_BYTES_CONVERSION / 1024 / 1024)} MB.` };
    }
    const est = await estadoFilee();
    if (!est.ruta) return { ok: false, status: 503, motivo: "Filee no está instalado en esta neurona." };
    if (enCurso >= MAX_SIMULTANEAS) return { ok: false, status: 429, motivo: "Hay otras conversiones en curso; prueba en unos segundos." };
    enCurso++;
    // realpath: en macOS /var/… es /private/var/… y Filee devuelve la ruta real.
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "starseed-filee-")));
    try {
        const nombre = nombreSeguro(entrada.nombre);
        const origen = path.join(dir, "entrada", nombre);
        const salida = path.join(dir, "salida");
        await fs.mkdir(path.dirname(origen), { recursive: true });
        await fs.mkdir(salida, { recursive: true });
        await fs.writeFile(origen, entrada.bytes);
        const args = ["convert", origen, "--to", a, "-o", salida, "--json", "--overwrite"];
        const q = Number(entrada.calidad);
        if (Number.isInteger(q) && q >= 1 && q <= 100) args.push("--quality", String(q));
        const r = await ejecutar(est.ruta, args, { timeout: TIEMPO_CONVERSION_MS, maxBuffer: 4 * 1024 * 1024, cwd: dir });
        const inf = leerInforme(r.stdout);
        const fila = inf?.files?.[0];
        if (!inf || !fila) {
            const tiempo = Date.now() - t0 >= TIEMPO_CONVERSION_MS - 1000;
            return { ok: false, status: tiempo ? 504 : 422, motivo: tiempo ? "La conversión tardó demasiado." : (r.stderr.trim().split("\n").pop() || "Filee no devolvió resultado."), ms: Date.now() - t0 };
        }
        if (fila.state !== "done" || !fila.outputs?.length) {
            return { ok: false, status: 422, motivo: fila.error || "Filee no pudo convertir este archivo.", ms: Date.now() - t0 };
        }
        // Solo se aceptan salidas DENTRO de la carpeta de salida (nada de rutas ajenas).
        const raiz = path.resolve(salida) + path.sep;
        const salidas = fila.outputs.map((p) => path.resolve(p)).filter((p) => p.startsWith(raiz));
        if (!salidas.length) return { ok: false, status: 422, motivo: "Filee dejó el resultado fuera de su carpeta.", ms: Date.now() - t0 };
        if (salidas.length === 1) {
            const bytes = new Uint8Array(await fs.readFile(salidas[0]));
            const nombreFinal = nombreDeSalida(entrada.nombre, path.extname(salidas[0]).slice(1) || a);
            return { ok: true, nombre: nombreFinal, bytes, tipo: tipoDe(nombreFinal), salidas: 1, ms: Date.now() - t0 };
        }
        const entradas = await Promise.all(
            salidas.map(async (p) => ({ path: path.basename(p), data: new Uint8Array(await fs.readFile(p)) })),
        );
        const zip = new Uint8Array(await buildZipBlob(entradas).arrayBuffer());
        const nombreZip = nombreDeSalida(entrada.nombre, "zip").replace(/\.zip$/, `-${a}.zip`);
        return { ok: true, nombre: nombreZip, bytes: zip, tipo: "application/zip", salidas: salidas.length, ms: Date.now() - t0 };
    } catch (e) {
        return { ok: false, status: 500, motivo: e instanceof Error ? e.message.slice(0, 200) : "Error al convertir.", ms: Date.now() - t0 };
    } finally {
        enCurso--;
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}
