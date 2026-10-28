/** Puerta local de trabajos 3D (contrato `architecture/blender-3d.md` §7.6) — SOLO SERVIDOR.
 *  Misma disposición que `servicios/blender-3d/ejecutor.py`: `~/.starseed/blender-3d/` o `STARSEED_BLENDER_RAIZ`.
 *  La lógica de disco vive aquí; la ruta `/api/3d/trabajos` solo delega. Nunca rutas absolutas ni usuario. */
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { necesitaConfirmacion, validarTrabajo, type Trabajo3D } from "./trabajo";
export const MAX_BYTES_ENTRADAS = 50 * 1024 * 1024;
const MAX_LISTA = 20, RE_ID = /^[0-9a-f]{32}$/, RE_RUTA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
export type Entradas = Record<string, Uint8Array>;
export type ResultadoEncolar = { ok: true; id: string } | { ok: false; motivo: string; motivos?: string[]; requiereConfirmacion?: boolean };
export interface EstadoVisible { estado: string; motivo: string; id: string; salidas: string[] }
export type Capacidades = { instalado?: boolean; perfil?: string; [k: string]: unknown };
export type Ejecutar = (bin: string, args: string[], o: { timeout: number; cwd: string; env: NodeJS.ProcessEnv }) => Promise<{ stdout: string; stderr: string; code: number }>;
export type Lanzar = (bin: string, args: string[], o: { cwd: string; detached: boolean; stdio: "ignore"; env: NodeJS.ProcessEnv }) => { unref(): void };
const ejecutarReal: Ejecutar = (bin, args, o) => new Promise((resolve) => execFile(bin, args, { ...o, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (e, stdout, stderr) => resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code: e ? (typeof (e as { code?: unknown }).code === "number" ? Number((e as { code: number }).code) : 1) : 0 })));
const lanzarReal: Lanzar = (bin, args, o) => spawn(bin, args, o);
let ejecutar: Ejecutar = ejecutarReal, lanzar: Lanzar = lanzarReal, cacheCap: { t: number; v: Capacidades | null } | null = null, arrancando = false;
/** Solo pruebas: sustituye procesos y olvida la caché. */
export function _ponerDependencias(d: { ejecutar?: Ejecutar; lanzar?: Lanzar } | null = null): void { ejecutar = d?.ejecutar ?? ejecutarReal; lanzar = d?.lanzar ?? lanzarReal; cacheCap = null; arrancando = false; }
export function raiz(): string { return process.env.STARSEED_BLENDER_RAIZ?.trim() || path.join(os.homedir(), ".starseed", "blender-3d"); }
const entorno = () => ({ ...process.env, STARSEED_BLENDER_RAIZ: raiz() });
const SIN_CACHE = { "Cache-Control": "no-store" };
const responder = (datos: unknown, status = 200) => Response.json(datos, { status, headers: SIN_CACHE });
/** Detección real por neurona (`deteccion.py --json`), con caché de 60 s. `null` si no hay Blender. */
export async function capacidades(): Promise<Capacidades | null> {
    if (cacheCap && Date.now() - cacheCap.t < 60_000) return cacheCap.v;
    const r = await ejecutar("python3", ["servicios/blender-3d/deteccion.py", "--json"], { timeout: 40_000, cwd: process.cwd(), env: entorno() });
    let v: Capacidades | null = null;
    if (r.code === 0) { try { const j = JSON.parse(r.stdout) as Capacidades; if (j && j.instalado) v = j; } catch { /* JSON roto = sin Blender */ } }
    cacheCap = { t: Date.now(), v }; return v;
}
function nombreSeguro(nombre: string): string { return String(nombre ?? "").split(/[\\/]/).pop()!.normalize("NFC").replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "").slice(-180).trim(); }
async function escribirJson(ruta: string, datos: unknown): Promise<void> { const tmp = `${ruta}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(datos), { encoding: "utf8", mode: 0o600 }); await fs.rename(tmp, ruta); }
function revisarEntradas(t: Trabajo3D, e?: Entradas): string | null {
    const pedidas = t.escena.filter((o) => o.op === "importar").map((o) => String(o.archivo)); let total = 0;
    for (const [n, b] of Object.entries(e ?? {})) { if (!pedidas.includes(n)) return `La entrada «${n}» no figura en ninguna operación importar.`; if (!RE_RUTA.test(n) || n.includes("..") || n.startsWith("/")) return `Nombre de entrada no seguro: ${n}`; total += b.byteLength; }
    if (pedidas.some((p) => !Object.prototype.hasOwnProperty.call(e ?? {}, p))) return "Falta el archivo de una operación importar.";
    return total > MAX_BYTES_ENTRADAS ? `Las entradas pasan de ${MAX_BYTES_ENTRADAS / 1024 / 1024} MB.` : null;
}
async function cerrojoVivo(r: string): Promise<boolean> {
    const p = path.join(r, "ejecutor.lock");
    try { const pid = Number((await fs.readFile(p, "utf8")).match(/\d+/)?.[0]); if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } } return Date.now() - (await fs.stat(p)).mtimeMs < 30 * 60_000; } catch { return false; }
}
async function arrancarEjecutor(r: string): Promise<void> {
    if (arrancando) return; arrancando = true;
    try { if (await cerrojoVivo(r)) return; lanzar("python3", ["servicios/blender-3d/ejecutor.py", "--una-vez"], { cwd: process.cwd(), detached: true, stdio: "ignore", env: { ...process.env, STARSEED_BLENDER_RAIZ: r } }).unref(); } finally { arrancando = false; }
}
/** Valida, pide confirmación si toca, copia entradas y deja el trabajo en `cola/<id>.json` (atómico). */
export async function encolarTrabajo(bruto: unknown, entradas?: Entradas, confirmado = false): Promise<ResultadoEncolar> {
    const v = validarTrabajo(bruto);
    if (!v.ok) return { ok: false, motivo: "El trabajo no cumple el vocabulario 3D.", motivos: v.motivos };
    const trabajo = v.trabajo, perfil = ((await capacidades())?.perfil ?? "ninguno") as "ninguno" | "ligero" | "estandar" | "estudio";
    if (necesitaConfirmacion(trabajo, perfil) && !confirmado) return { ok: false, requiereConfirmacion: true, motivo: "Este trabajo necesita confirmación humana antes de encolarse." };
    const error = revisarEntradas(trabajo, entradas); if (error) return { ok: false, motivo: error, motivos: [error] };
    const id = randomBytes(16).toString("hex"), r = raiz(), dir = path.join(r, "trabajos", id);
    try {
        await fs.mkdir(dir, { recursive: true, mode: 0o700 }); await fs.mkdir(path.join(r, "cola"), { recursive: true }); await fs.mkdir(path.join(r, "estado"), { recursive: true });
        if (entradas && Object.keys(entradas).length) { const e = path.join(dir, "entradas"); await fs.mkdir(e, { recursive: true }); for (const [n, b] of Object.entries(entradas)) await fs.writeFile(path.join(e, n), b); }
        await escribirJson(path.join(r, "cola", `${id}.json`), { id, trabajo }); await escribirJson(path.join(dir, "trabajo.json"), trabajo);
        await escribirJson(path.join(r, "estado", `${id}.json`), { estado: "en_cola", motivo: "encolado", id, salidas: [] });
        await arrancarEjecutor(r); return { ok: true, id };
    } catch { return { ok: false, motivo: "No se pudo guardar el trabajo en el disco de esta neurona." }; }
}
function visible(j: Record<string, unknown>, id: string): EstadoVisible {
    const salidas = Array.isArray(j.salidas) ? j.salidas.filter((s): s is string => typeof s === "string").map(nombreSeguro).filter((s) => s && !s.includes("..")) : [];
    return { estado: typeof j.estado === "string" ? j.estado : "desconocido", motivo: typeof j.motivo === "string" ? j.motivo : "", id, salidas };
}
async function leerEstado(r: string, id: string): Promise<EstadoVisible | null> {
    if (!RE_ID.test(id)) return null;
    try { return visible(JSON.parse(await fs.readFile(path.join(r, "estado", `${id}.json`), "utf8")) as Record<string, unknown>, id); } catch { return null; }
}
/** Estado de un trabajo por su id de 32 hex. `null` si no existe o el id no es válido. */
export async function estadoDe(id: string): Promise<EstadoVisible | null> { return leerEstado(raiz(), id); }
/** Los últimos `n` trabajos (máximo 20), sin rutas absolutas. */
export async function listarRecientes(n = 10): Promise<EstadoVisible[]> {
    const cuantos = Math.max(0, Math.min(MAX_LISTA, Math.trunc(n) || 0));
    try { const dir = path.join(raiz(), "estado"), fichas = await Promise.all((await fs.readdir(dir)).filter((x) => x.endsWith(".json")).map(async (x) => ({ x, t: (await fs.stat(path.join(dir, x)).catch(() => null))?.mtimeMs ?? 0 }))); return (await Promise.all(fichas.sort((a, b) => b.t - a.t).slice(0, cuantos).map((f) => leerEstado(raiz(), f.x.slice(0, -5))))).filter((e): e is EstadoVisible => e !== null); } catch { return []; }
}
export type Salida = { ok: true; nombre: string; bytes: Uint8Array } | { ok: false; motivo: string };
/** Lee una salida SOLO si su nombre figura en el estado del trabajo; nunca sale de la carpeta del trabajo. */
export async function leerSalida(id: string, nombre: string): Promise<Salida> {
    const limpio = nombreSeguro(nombre);
    if (!RE_ID.test(id) || !limpio || limpio.includes("..") || limpio !== String(nombre).replace(/^.*[\\/]/, "")) return { ok: false, motivo: "Nombre de salida no válido." };
    const estado = await estadoDe(id);
    if (!estado) return { ok: false, motivo: "Ese trabajo no existe." };
    if (!estado.salidas.includes(limpio) && !estado.salidas.includes(limpio.replace(/\.[^.]+$/, ""))) return { ok: false, motivo: "Esa salida no figura en el estado del trabajo." };
    for (const base of [path.join(raiz(), "trabajos", id, "salidas"), path.join(raiz(), "salidas", id)]) {
        const ruta = path.resolve(base, limpio); if (!ruta.startsWith(base + path.sep)) continue;
        try { return { ok: true, nombre: limpio, bytes: new Uint8Array(await fs.readFile(ruta)) }; } catch { /* siguiente carpeta */ }
    }
    return { ok: false, motivo: "La salida aún no está en el disco." };
}
/** Puerta común: si el guardián veta, se devuelve el veto TAL CUAL y no se toca el disco. */
export async function conGuardia(request: Request, guardia: (r: Request) => Promise<Response | null>): Promise<Response | null> {
    return guardia(request);
}
export { SIN_CACHE, responder };
