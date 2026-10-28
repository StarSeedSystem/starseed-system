import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn, execFile } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { validarTrabajo, necesitaConfirmacion, type Trabajo3D } from "./trabajo";

const RAIZ = process.env.STARSEED_BLENDER_RAIZ ?? path.join(os.homedir(), ".starseed", "blender-3d");
const ID_RE = /^[0-9a-f]{32}$/;

async function escribirAtomico(ruta: string, datos: unknown) {
  const tmp = ruta + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(datos), "utf-8");
  await fs.rename(tmp, ruta);
}

export async function encolarTrabajo(bruto: unknown, entradas?: Record<string, Uint8Array>, confirmado = false) {
  const v = validarTrabajo(bruto);
  if (!v.ok) return { ok: false as const, motivo: v.motivos.join("; ") };
  const trabajo = v.trabajo;
  const perfil = "ligero";
  if (necesitaConfirmacion(trabajo, perfil as any) && !confirmado) {
    return { ok: false as const, requiereConfirmacion: true, motivo: "El trabajo necesita confirmación humana" };
  }
  const id = randomBytes(16).toString("hex");
  const raiz = RAIZ;
  const colaDir = path.join(raiz, "cola");
  const trabajoDir = path.join(raiz, "trabajos", id);
  await fs.mkdir(colaDir, { recursive: true });
  await fs.mkdir(trabajoDir, { recursive: true });
  await fs.mkdir(path.join(raiz, "estado"), { recursive: true });
  if (entradas) {
    const entradaDir = path.join(trabajoDir, "entradas");
    await fs.mkdir(entradaDir, { recursive: true });
    let total = 0;
    for (const [nombre, datos] of Object.entries(entradas)) {
      if (nombre.includes("..") || path.isAbsolute(nombre)) return { ok: false as const, motivo: "Nombre de entrada no seguro" };
      total += datos.byteLength;
      await fs.writeFile(path.join(entradaDir, nombre), Buffer.from(datos));
    }
    if (total > 50 * 1024 * 1024) return { ok: false as const, motivo: "Entradas superan 50 MB" };
  }
  await escribirAtomico(path.join(colaDir, id + ".json"), { id, trabajo });
  await escribirAtomico(path.join(trabajoDir, "trabajo.json"), trabajo);
  await escribirAtomico(path.join(raiz, "estado", id + ".json"), { estado: "en_cola", motivo: "encolado", id, salidas: [] });
  const lock = path.join(raiz, "ejecutor.lock");
  try { await fs.access(lock); } catch {
    const child = spawn(process.env.PYTHON ?? "python3", ["servicios/blender-3d/ejecutor.py", "--una-vez"], { stdio: "ignore", detached: true });
    child.unref();
  }
  return { ok: true as const, id };
}

export async function estadoDe(id: string) {
  if (!ID_RE.test(id)) return null;
  const p = path.join(RAIZ, "estado", id + ".json");
  try { return JSON.parse(await fs.readFile(p, "utf-8")); } catch { return null; }
}

export async function listarRecientes(n = 20) {
  const max = Math.min(Math.max(1, n), 20);
  const colaDir = path.join(RAIZ, "cola");
  try {
    const files = await fs.readdir(colaDir);
    files.sort((a, b) => b.localeCompare(a));
    return files.slice(0, max).map(f => f.replace(/\.json$/, ""));
  } catch { return []; }
}

export async function leerSalida(id: string, nombre: string) {
  if (!ID_RE.test(id) || nombre.includes("..") || path.isAbsolute(nombre)) return null;
  const estado = await estadoDe(id);
  if (!estado || !("salidas" in estado)) return null;
  if (!Array.isArray((estado as any).salidas) || !((estado as any).salidas as string[]).includes(nombre)) return null;
  const p = path.join(RAIZ, "trabajos", id, "salidas", nombre);
  try { return new Uint8Array(await fs.readFile(p)); } catch { return null; }
}

let cacheCap: { t: number; v: unknown } | null = null;
export async function capacidades() {
  const ahora = Date.now();
  if (cacheCap && ahora - cacheCap.t < 60_000) return cacheCap.v;
  try {
    const { stdout } = await new Promise<{ stdout: string }>((res, rej) => {
      execFile("python3", ["servicios/blender-3d/deteccion.py", "--json"], { timeout: 40_000 }, (e, out) => e ? rej(e) : res({ stdout: out }));
    });
    const v = JSON.parse(stdout);
    if (!v || (v as any).instalado === false) return null;
    cacheCap = { t: ahora, v };
    return v;
  } catch { return null; }
}
