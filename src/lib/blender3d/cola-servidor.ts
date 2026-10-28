/**
 * Cola local de trabajos 3D (SOLO SERVIDOR) — `architecture/blender-3d.md` §7.6. Mismas carpetas que el
 * ejecutor Python (`cola/`, `trabajos/<id>/`, `estado/`), raíz `STARSEED_BLENDER_RAIZ` o `~/.starseed/blender-3d`.
 * Blender es PROGRAMA APARTE: el ejecutor arranca DESACOPLADO, por lista de argumentos, sin shell.
 */
import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { validarTrabajo, necesitaConfirmacion } from "./trabajo";
import type { Trabajo3D } from "./trabajo";
export interface Entrada { nombre: string; bytes: Uint8Array } export interface RespuestaEncolar { ok: boolean; id?: string; requiereConfirmacion?: boolean; motivo?: string }
export interface EstadoTrabajo { id: string; estado: string; motivo: string; salidas: string[] } export interface SalidaLeida { ok: boolean; bytes?: Uint8Array; tipo?: string; motivo?: string }
export const RE_ID_TRABAJO = /^[0-9a-f]{32}$/, MAX_BYTES_ENTRADAS = 50 * 1024 * 1024;
const CERROJO_MS = 5 * 60_000, ARGS_EJECUTOR = ["python3", "servicios/blender-3d/ejecutor.py", "--una-vez"];
const TIPO_EXT: Record<string, string> = { render_png: "png", render_mp4: "mp4", render_exr: "exr", exportar_glb: "glb" }, TIPOS_HTTP: Record<string, string> = { glb: "model/gltf-binary", png: "image/png", mp4: "video/mp4", exr: "image/x-exr" };
type Ejecutar = (bin: string, args: string[], opciones: { timeout: number }) => Promise<{ stdout: string }>;
const lanzarReal = (args: string[]): void => { spawn(args[0], args.slice(1), { stdio: "ignore", detached: true }).unref(); };
const ejecutarReal: Ejecutar = (bin, args, o) => new Promise((res, rej) => execFile(bin, args, { timeout: o.timeout, windowsHide: true }, (error, stdout) => (error ? rej(error) : res({ stdout: String(stdout) }))));
let ejecutar: Ejecutar = ejecutarReal, lanzar: (args: string[]) => void = lanzarReal;
export function _ponerEjecucion(e: Ejecutar | null): void { ejecutar = e ?? ejecutarReal; cacheCaps = null; }
export function _ponerLanzador(l: ((args: string[]) => void) | null): void { lanzar = l ?? lanzarReal; }
let cacheCaps: { t: number; v: unknown } | null = null;
const raiz = (): string => process.env.STARSEED_BLENDER_RAIZ?.trim() || path.join(os.homedir(), ".starseed", "blender-3d");
/** Capacidades de Blender en ESTA neurona (`deteccion.py --json`, plazo 40 s, caché de 60 s). Sin Blender → null. */
export async function capacidades(): Promise<unknown> {
  if (cacheCaps && Date.now() - cacheCaps.t < 60_000) return cacheCaps.v;
  let v: unknown = null;
  try {
    const ficha = JSON.parse((await ejecutar("python3", ["servicios/blender-3d/deteccion.py", "--json"], { timeout: 40_000 })).stdout) as { instalado?: unknown };
    if (ficha.instalado === true) v = ficha;
  } catch { v = null; } // sin Blender (o sin Python): ficha null y perfil «ninguno»
  cacheCaps = { t: Date.now(), v };
  return v;
}
/** Escritura atómica: archivo temporal + rename (nunca un JSON a medias). */
async function escribirAtomico(ruta: string, texto: string): Promise<void> { const tmp = `${ruta}.tmp`; await fs.writeFile(tmp, texto, "utf-8"); await fs.rename(tmp, ruta); }
/** Cada entrada: el `archivo` de una operación `importar`, ruta segura, y ≤ 50 MB las sumadas. */
function validarEntradas(trabajo: Trabajo3D, entradas?: Entrada[]): string | null {
  const pedidas = new Set(trabajo.escena.filter((o) => o.op === "importar").map((o) => String(o.archivo)));
  if (!pedidas.size) return entradas?.length ? "el trabajo no pide entradas" : null;
  if (!entradas?.length) return "el trabajo pide entradas que no llegaron";
  let bytes = 0;
  for (const e of entradas) {
    bytes += e.bytes.byteLength;
    if (!pedidas.has(e.nombre) || e.nombre.includes("..") || /[\\/]/.test(e.nombre) || e.nombre.startsWith("/"))
      return `entrada que el trabajo no pide: ${e.nombre.slice(0, 60)}`;
  }
  for (const p of pedidas) if (!entradas.some((e) => e.nombre === p)) return `falta la entrada: ${p}`;
  return bytes > MAX_BYTES_ENTRADAS ? "las entradas pasan de 50 MB en total" : null;
}
/** Encola: id de 32 hex, entradas copiadas, `cola/` y `estado/` atómicos, ejecutor DESACOPLADO si no hay cerrojo vivo. */
export async function encolarTrabajo(bruto: unknown, entradas?: Entrada[], confirmado?: boolean): Promise<RespuestaEncolar> {
  const v = validarTrabajo(bruto);
  if (!v.ok) return { ok: false, motivo: v.motivos.join("; ") };
  // Sin Blender: perfil «ninguno», lo conservador (pide confirmación de más, nunca de menos).
  const ficha = (await capacidades()) as { perfil?: unknown } | null;
  const perfil = (["ligero", "estandar", "estudio"].includes(String(ficha?.perfil)) ? String(ficha?.perfil) : "ninguno") as "ninguno";
  if (necesitaConfirmacion(v.trabajo, perfil) && confirmado !== true) return { ok: false, requiereConfirmacion: true, motivo: "Este trabajo es pesado o compartido: necesita tu confirmación humana." };
  const errorEntradas = validarEntradas(v.trabajo, entradas);
  if (errorEntradas) return { ok: false, motivo: errorEntradas };
  const id = randomBytes(16).toString("hex"), r = raiz();
  for (const d of ["", "cola", "estado", `trabajos/${id}`, `trabajos/${id}/entradas`, `trabajos/${id}/salidas`, `salidas/${id}`]) await fs.mkdir(path.join(r, d), { recursive: true, mode: 0o700 });
  for (const e of entradas ?? []) await fs.writeFile(path.join(r, "trabajos", id, "entradas", e.nombre), e.bytes, { mode: 0o600 });
  await escribirAtomico(path.join(r, "cola", `${id}.json`), JSON.stringify({ id, encolado: new Date().toISOString() }));
  await escribirAtomico(path.join(r, "trabajos", id, "trabajo.json"), JSON.stringify(v.trabajo));
  await escribirAtomico(path.join(r, "estado", `${id}.json`), JSON.stringify({ estado: "en_cola", motivo: "encolado", id, salidas: [] }));
  await arrancarEjecutor(r);
  return { ok: true, id };
}
/** Ejecutor vivo = `ejecutor.lock` con fecha de menos de 5 min (el Python lo refresca; hoy es pendiente suyo). */
async function arrancarEjecutor(r: string): Promise<void> {
  const cerrojo = path.join(r, "ejecutor.lock");
  try { if (Date.now() - (await fs.stat(cerrojo)).mtimeMs < CERROJO_MS) return; } catch { /* no estaba */ }
  await fs.writeFile(cerrojo, "x", { mode: 0o600 }); lanzar(ARGS_EJECUTOR);
}
/** Estado de un trabajo; el id debe casar el hex de 32, y si no hay nada en disco, null. */
export async function estadoDe(id: string): Promise<EstadoTrabajo | null> {
  if (!RE_ID_TRABAJO.test(id)) return null;
  try {
    const datos = JSON.parse(await fs.readFile(path.join(raiz(), "estado", `${id}.json`), "utf-8")) as Record<string, unknown>;
    return { id, estado: String(datos.estado ?? "desconocido"), motivo: String(datos.motivo ?? ""), salidas: Array.isArray(datos.salidas) ? datos.salidas.filter((s): s is string => typeof s === "string") : [] };
  } catch { return null; }
}
/** Los últimos trabajos con su estado (por mtime); `n` recortado a 1–20. */
export async function listarRecientes(n = 10): Promise<EstadoTrabajo[]> {
  const tope = Math.min(Math.max(1, n), 20);
  let archivos: string[] = [];
  try { archivos = (await fs.readdir(path.join(raiz(), "estado"))).filter((f) => f.endsWith(".json")); } catch { return []; }
  const conFecha = await Promise.all(archivos.slice(0, 200).map(async (f) => ({ f, m: (await fs.stat(path.join(raiz(), "estado", f)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
  conFecha.sort((a, b) => b.m - a.m);
  return (await Promise.all(conFecha.slice(0, tope).map((x) => estadoDe(x.f.slice(0, 32))))).filter((e): e is EstadoTrabajo => e !== null);
}
/** Bytes de una salida: el nombre debe FIGURAR en el estado del trabajo (tipo o `salida-N.ext`); solo se lee dentro del trabajo. */
export async function leerSalida(id: string, nombre: string): Promise<SalidaLeida> {
  if (!RE_ID_TRABAJO.test(id) || !/^[A-Za-z0-9._-]{1,64}$/.test(nombre) || nombre.includes("..")) return { ok: false, motivo: "petición de salida inválida" };
  const estado = await estadoDe(id);
  if (!estado) return { ok: false, motivo: "no existe ese trabajo" };
  if (!estado.salidas.includes(nombre)) return { ok: false, motivo: "esa salida no figura en el estado del trabajo" };
  let archivo = nombre; const ext = TIPO_EXT[nombre];
  if (ext) {
    try {
      const trabajo = JSON.parse(await fs.readFile(path.join(raiz(), "trabajos", id, "trabajo.json"), "utf-8")) as Trabajo3D;
      const indice = trabajo.salidas.findIndex((s) => String(s.tipo) === nombre);
      if (indice < 0) return { ok: false, motivo: "esa salida no está declarada en el trabajo" };
      archivo = `salida-${indice + 1}.${ext}`; // el ejecutor guarda cada salida como `salidas/salida-N.ext` según su orden
    } catch { return { ok: false, motivo: "no hay trabajo guardado" }; }
  } else if (!/^salida-\d+\.(png|glb|exr|mp4)$/.test(archivo)) {
    return { ok: false, motivo: "nombre de archivo de salida inválido" };
  }
  // Solo entradas por debajo de la raíz: Blender escribe en `trabajos/<id>/salidas/` y la otra ubicación respalda la disposición antigua.
  for (const dir of [`trabajos/${id}/salidas`, `salidas/${id}`]) {
    try {
      const bytes = new Uint8Array(await fs.readFile(path.join(raiz(), dir, archivo)));
      return { ok: true, bytes, tipo: TIPOS_HTTP[archivo.split(".").pop() ?? ""] ?? "application/octet-stream" };
    } catch { /* siguiente ubicación */ }
  }
  return { ok: false, motivo: "la salida aún no está en disco" };
}
