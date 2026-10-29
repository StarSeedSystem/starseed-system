/**
 * Cola local de trabajos 3D — SOLO SERVIDOR (`architecture/blender-3d.md` §7.6).
 * Misma disposición que `servicios/blender-3d/ejecutor.py`: `cola/`, `trabajos/<id>/`,
 * `estado/` y `salidas/` bajo `~/.starseed/blender-3d` (o `STARSEED_BLENDER_RAIZ`).
 * Blender es un programa aparte: lista de argumentos, sin shell. Nunca se devuelven
 * rutas absolutas ni nombres de usuario.
 */
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { necesitaConfirmacion, validarTrabajo } from "./trabajo";

export const MAX_BYTES_ENTRADAS = 50 * 1024 * 1024;
const RE_ID = /^[0-9a-f]{32}$/, MAX_RECIENTES = 20;
const TIPOS: Record<string, string> = { glb: "model/gltf-binary", png: "image/png", exr: "image/x-exr", mp4: "video/mp4" };
export const tipoDeSalida = (n: string): string => TIPOS[n.slice(n.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
export interface Entrada3D { nombre: string; bytes: Uint8Array }
export type Estado3D = { id: string; estado: string; motivo?: string; salidas: string[] };
export type Capacidades = { instalado: boolean; version: string | null; perfil: string; motores: string[]; gpu: string[]; [k: string]: unknown };
export type ResultadoEncolar = { ok: true; id: string } | { ok: false; motivos?: string[]; motivo?: string; requiereConfirmacion?: boolean };
type Ejecutar = (bin: string, args: string[], o: { timeout: number; maxBuffer: number }) => Promise<{ stdout: string; stderr: string; code: number }>;
type Lanzar = (bin: string, args: string[]) => void;

const ejecutarReal: Ejecutar = (bin, args, o) => new Promise((res) => execFile(bin, args, { ...o, windowsHide: true }, (e, out, err) => res({ stdout: String(out ?? ""), stderr: String(err ?? ""), code: e ? 1 : 0 })));
const lanzarReal: Lanzar = (bin, args) => { spawn(bin, args, { detached: true, stdio: "ignore" }).unref(); };
let ejecutar = ejecutarReal, lanzar = lanzarReal, cache: { t: number; v: Capacidades | null } | null = null;

/** Solo pruebas: sustituye los procesos (detección y arranque del ejecutor). */
export function _ponerProcesos(e?: Ejecutar | null, l?: Lanzar | null): void { ejecutar = e ?? ejecutarReal; lanzar = l ?? lanzarReal; cache = null; }
export function raizBlender(): string { return process.env.STARSEED_BLENDER_RAIZ?.trim() || path.join(os.homedir(), ".starseed", "blender-3d"); }
const en = (...p: string[]) => path.join(raizBlender(), ...p);
/** Quita rutas y usuarios de cualquier texto que vaya a salir de esta neurona. */
function limpio<T>(v: T): T {
  if (typeof v === "string") return v.split(raizBlender()).join("~/.starseed/blender-3d").split(os.homedir()).join("~").replace(/(?:\/(?:Users|home|tmp|opt|Applications|private|var|usr|etc|root)(?:\/[^\s"',;:)]*)*)/g, "[ruta]").replace(/[A-Za-z]:\\[^\s"',;:)]*/g, "[ruta]") as T;
  if (Array.isArray(v)) return v.map(limpio) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, limpio(x)])) as T;
  return v;
}
async function leerJson<T>(ruta: string): Promise<T | null> { try { return JSON.parse(await fs.readFile(ruta, "utf8")) as T } catch { return null } }
async function volcar(ruta: string, datos: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, datos, { mode: 0o600 });
  await fs.rename(tmp, ruta);
}
const escribirJson = (ruta: string, datos: unknown) => volcar(ruta, JSON.stringify(datos));
const nombreValido = (n: string) => Boolean(n) && !n.includes("..") && !/[\\/]/.test(n) && !n.startsWith(".");
/** Encola un trabajo validado. Las entradas solo pueden ser los archivos de sus operaciones `importar`. */
export async function encolarTrabajo(bruto: unknown, entradas: Entrada3D[] = [], confirmado = false): Promise<ResultadoEncolar> {
  const valido = validarTrabajo(bruto);
  if (!valido.ok) return { ok: false, motivos: valido.motivos };
  const trabajo = valido.trabajo;
  const caps = await capacidades();
  const perfil = (caps?.perfil ?? "ninguno") as "ninguno" | "ligero" | "estandar" | "estudio";
  if (necesitaConfirmacion(trabajo, perfil) && !confirmado) return { ok: false, requiereConfirmacion: true, motivo: "Este trabajo 3D necesita tu confirmación antes de encolarse." };
  const permitidas = new Set(trabajo.escena.filter((o) => o.op === "importar").map((o) => String(o.archivo)));
  let total = 0;
  for (const e of entradas) {
    total += e.bytes.byteLength;
    if (!permitidas.has(e.nombre) || !nombreValido(e.nombre)) return { ok: false, motivo: "Una entrada no corresponde a un archivo «importar» del trabajo." };
  }
  if (total > MAX_BYTES_ENTRADAS) return { ok: false, motivo: "Las entradas pasan de 50 MB en total." };
  const id = randomBytes(16).toString("hex");
  await fs.mkdir(en("trabajos", id), { recursive: true, mode: 0o700 });
  for (const e of entradas) await volcar(en("trabajos", id, "entradas", e.nombre), e.bytes);
  await escribirJson(en("trabajos", id, "trabajo.json"), trabajo);
  await escribirJson(en("cola", id + ".json"), { id, trabajo });
  await escribirJson(en("estado", id + ".json"), { id, estado: "en_cola", motivo: "encolado", salidas: [] });
  try { if (!(await cerrojoVivo())) lanzar("python3", [path.join(process.cwd(), "servicios", "blender-3d", "ejecutor.py"), "--una-vez"]); } catch { /* la cola queda para el siguiente intento */ }
  return { ok: true, id };
}
/** Estado de un trabajo. Un id que no sea 32 hex se rechaza sin mirar el disco. */
export async function estadoDe(id: string): Promise<Estado3D | null> {
  if (!RE_ID.test(id)) return null;
  const e = await leerJson<Estado3D>(en("estado", id + ".json"));
  if (!e) return null;
  return limpio({ id, estado: String(e.estado ?? "desconocido"), motivo: e.motivo ? String(e.motivo) : undefined, salidas: Array.isArray(e.salidas) ? e.salidas.map(String) : [] });
}
/** Los últimos trabajos, con su estado ya limpio de rutas. */
export async function listarRecientes(cantidad = 10): Promise<Estado3D[]> {
  const n = Math.min(MAX_RECIENTES, Math.max(0, Math.floor(Number(cantidad) || 0)));
  if (!n) return [];
  const nombres = await fs.readdir(en("estado")).catch(() => [] as string[]);
  const fechas = await Promise.all(nombres.filter((x) => x.endsWith(".json")).map(async (x) => [x, (await fs.stat(en("estado", x)).catch(() => null))?.mtimeMs ?? 0] as const));
  fechas.sort((a, b) => b[1] - a[1]);
  const lista: Estado3D[] = [];
  for (const [x] of fechas.slice(0, n)) { const e = await estadoDe(x.slice(0, -5)); if (e) lista.push(e); }
  return lista;
}

/** Bytes de una salida. Solo se sirven nombres que figuren en el estado del trabajo. */
export async function leerSalida(id: string, nombre: string): Promise<{ ok: true; bytes: Uint8Array; nombre: string } | { ok: false; motivo: string }> {
  if (!RE_ID.test(id)) return { ok: false, motivo: "Identificador de trabajo no válido." };
  if (!nombreValido(nombre)) return { ok: false, motivo: "Nombre de salida no válido." };
  const estado = await estadoDe(id);
  if (!estado) return { ok: false, motivo: "No existe ese trabajo." };
  if (!estado.salidas.includes(nombre)) return { ok: false, motivo: "Esa salida no figura en el estado del trabajo." };
  try { return { ok: true, bytes: new Uint8Array(await fs.readFile(en("salidas", id, nombre))), nombre }; } catch { return { ok: false, motivo: "La salida todavía no está lista." }; }
}
/** Qué puede hacer ESTA neurona (caché de 60 s). Null si no hay Blender: no se finge. */
export async function capacidades(fresco = false): Promise<Capacidades | null> {
  if (!fresco && cache && Date.now() - cache.t < 60_000) return cache.v;
  const r = await ejecutar("python3", [path.join(process.cwd(), "servicios", "blender-3d", "deteccion.py"), "--json"], { timeout: 40_000, maxBuffer: 512 * 1024 });
  let v: Capacidades | null = null;
  if (r.code === 0) { try { const f = JSON.parse(r.stdout) as Capacidades; if (f?.instalado) v = limpio(f); } catch { /* sin ficha */ } }
  cache = { t: Date.now(), v };
  return v;
}

async function cerrojoVivo(): Promise<boolean> {
  try {
    const texto = (await fs.readFile(en("ejecutor.lock"), "utf8")).trim();
    const pid = Number.parseInt(texto.split(/\s+/)[0] ?? "", 10);
    if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); return true; } catch { return false; } }
    const st = await fs.stat(en("ejecutor.lock"));
    return Date.now() - st.mtimeMs < 30 * 60_000;
  } catch { return false; }
}
