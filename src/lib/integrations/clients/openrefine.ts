/**
 * Cliente de la interfaz de órdenes de OpenRefine 3.10.1 (INV1025F · architecture/repos-libreria-1025.md §3.4).
 *
 * «limpiar» = token CSRF → crear proyecto → aplicar receta → exportar → BORRAR el proyecto
 * provisional SIEMPRE, también si algo falla. Órdenes en /command/core/ con `csrf_token`
 * (GetCSRFTokenCommand de la 3.10); el protocolo no está versionado: verifica cada ruta contra el
 * código de la 3.10 si cambia. Sin autenticación en 127.0.0.1:3333: solo loopback, salvo token de
 * pasarela. La receta es DATO validado por `validarReceta`. Sin `node:*`; fetch inyectable.
 */
import type { IntegrationConfig, IntegrationResult } from "../types";
import { validarReceta } from "../../datos/receta-limpieza";
/** Por defecto, el OpenRefine local de la propia máquina. */
export const ENDPOINT_DEFECTO = "http://127.0.0.1:3333";
/** Importador de la 3.10 para CSV por comas, y tope por llamada (ms). */
const FORMATO_IMPORT = "text/line-based/*sv";
const TIEMPO_DEFECTO = 30_000;

/** Rutas de la interfaz de órdenes de la 3.10 (verificadas contra su código fuente). */
export const RUTAS = { token: "/command/core/get-csrf-token", crear: "/command/core/create-project-from-upload", aplicar: "/command/core/apply-operations", exportar: "/command/core/export-rows", borrar: "/command/core/delete-project", version: "/command/core/get-version" } as const;
export type ClienteFetch = typeof fetch;
/** `fetch` y tiempo límite inyectables: las pruebas usan un servidor falso. */
export type OpcionesCliente = { fetch?: ClienteFetch; timeoutMs?: number };
/** csv + receta de limpieza (y formato de importación opcional). */
export type PeticionLimpieza = { csv: string; receta: unknown; formato?: string };
interface Conexión { base: string; hacer: ClienteFetch; tiempo: number; pasarela?: string }
/** ¿Habla con la propia máquina? (OpenRefine corre sin autenticación en loopback). */
function esLoopback(host: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase());
}
type Cuenta = { ok: true; con: Conexión } | { ok: false; error: string };
function conexión(cfg: IntegrationConfig, o: OpcionesCliente): Cuenta {
  const base = (cfg.endpoint?.trim() || ENDPOINT_DEFECTO).trim().replace(/\/+$/, ""); let u: URL;
  try { u = new URL(base); } catch { return { ok: false, error: "El endpoint de OpenRefine no es una URL válida." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "El endpoint de OpenRefine debe ser http(s)." };
  if (!esLoopback(u.hostname) && !cfg.apiKey)
    return { ok: false, error: "OpenRefine solo se habla en loopback («http://127.0.0.1:3333»); un host remoto exige el token de tu pasarela en la clave." };
  return { ok: true, con: { base, hacer: o.fetch ?? globalThis.fetch, tiempo: o.timeoutMs ?? TIEMPO_DEFECTO, pasarela: cfg.apiKey } };
}
/** Llamada con tiempo límite y, si hay pasarela, su Authorization. Nunca lanza por red. */
async function pedir(c: Conexión, ruta: string, init: RequestInit): Promise<{ res?: Response; error?: string }> {
  try {
    const cabeceras = new Headers(init.headers);
    if (c.pasarela) cabeceras.set("Authorization", `Bearer ${c.pasarela}`);
    return { res: await c.hacer(ruta, { ...init, headers: cabeceras, signal: AbortSignal.timeout(c.tiempo) }) };
  } catch (e) {
    const límite = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    return { error: límite ? "Se agotó el tiempo límite hablando con OpenRefine." : e instanceof Error ? e.message : "Fallo de red con OpenRefine." };
  }
}
/** Salud: GET get-version (la versión que reporta el propio servicio). */
export async function health(cfg: IntegrationConfig, o: OpcionesCliente = {}): Promise<IntegrationResult> {
  const c = conexión(cfg, o); if (!c.ok) return c;
  const r = await pedir(c.con, c.con.base + RUTAS.version, { method: "GET" });
  if (!r.res) return { ok: false, error: r.error ?? "OpenRefine no respondió." };
  try {
    const v = (await r.res.json()) as { version?: unknown };
    return typeof v.version === "string" ? { ok: true, data: { version: v.version } }
      : { ok: false, error: "OpenRefine respondió sin versión (¿no es el servicio de la 3.10?)." };
  } catch { return { ok: false, error: "No pude leer la versión de OpenRefine." }; }
}
/** Id del proyecto creado: redirect a «/project?project=<id>» (CreateProjectCommand), o JSON «projectId» si lo trae una pasarela. */
async function idDeProyecto(res: Response): Promise<string> {
  try {
    const destino = res.headers.get("location") || res.url;
    const delDestino = destino ? new URL(destino, "http://refine.local").searchParams.get("project") : null;
    if (delDestino) return delDestino;
  } catch { /* el destino no era una URL: seguimos con el cuerpo */ }
  try {
    const cuerpo = (await res.json()) as { projectId?: unknown };
    if (typeof cuerpo.projectId === "string" || typeof cuerpo.projectId === "number") return String(cuerpo.projectId);
  } catch { /* sin cuerpo JSON: no hay id */ }
  return "";
}
/** CSV + receta → CSV limpio: crea el proyecto, aplica, exporta y SIEMPRE lo borra. */
export async function limpiar(
  cfg: IntegrationConfig, petición: PeticionLimpieza, o: OpcionesCliente = {},
): Promise<IntegrationResult> {
  const entrada = petición ?? ({} as PeticionLimpieza);
  if (typeof entrada.csv !== "string" || !entrada.csv.trim()) return { ok: false, error: "Aporta el CSV a limpiar en «csv»." };
  const veredicto = validarReceta(entrada.receta);
  if (!veredicto.ok || !veredicto.receta) return { ok: false, error: `Receta rechazada: ${(veredicto.errores ?? []).join(" · ")}` };
  const c = conexión(cfg, o); if (!c.ok) return c;
  const con = c.con, formato = entrada.formato?.trim() || FORMATO_IMPORT;
  let proyecto = "", token = "";
  try {
    const rToken = await pedir(con, con.base + RUTAS.token, { method: "GET" });
    if (!rToken.res) return { ok: false, error: rToken.error ?? "OpenRefine no respondió." };
    const turno = (await rToken.res.json()) as { token?: unknown };
    token = typeof turno.token === "string" ? turno.token : "";
    if (!token) return { ok: false, error: "OpenRefine no entregó su token CSRF." };
    const subida = new FormData();
    subida.append("project-file", new Blob([entrada.csv], { type: "text/csv" }), "datos.csv");
    subida.append("project-name", "starseed-limpieza");
    subida.append("format", formato);
    subida.append("options", JSON.stringify({ separator: "," }));
    subida.append("csrf_token", token);
    const rCrear = await pedir(con, con.base + RUTAS.crear, { method: "POST", body: subida });
    if (!rCrear.res || !rCrear.res.ok)
      return { ok: false, error: rCrear.error ?? `Crear el proyecto falló con HTTP ${rCrear.res?.status}.` };
    proyecto = await idDeProyecto(rCrear.res);
    if (!proyecto) return { ok: false, error: "No pude leer el id del proyecto provisional de OpenRefine." };
    const rAplicar = await pedir(con, con.base + RUTAS.aplicar, { method: "POST", body: new URLSearchParams({ project: proyecto, csrf_token: token, operations: JSON.stringify(veredicto.receta.operaciones) }) });
    if (!rAplicar.res || !rAplicar.res.ok)
      return { ok: false, error: rAplicar.error ?? `OpenRefine rechazó la receta (HTTP ${rAplicar.res?.status}).` };
    const salida = (await rAplicar.res.json()) as { code?: unknown; message?: unknown };
    if (salida.code !== "ok")
      return { ok: false, error: typeof salida.message === "string" ? salida.message : "OpenRefine no aceptó la receta." };
    const exportar = new URLSearchParams({ project: proyecto, format: "csv", engine: JSON.stringify({ facets: [], mode: "row-based" }) });
    const rExportar = await pedir(con, con.base + RUTAS.exportar, { method: "POST", body: exportar });
    if (!rExportar.res || !rExportar.res.ok)
      return { ok: false, error: rExportar.error ?? `La exportación falló con HTTP ${rExportar.res?.status}.` };
    const csv = await rExportar.res.text();
    if (!csv.trim()) return { ok: false, error: "La exportación volvió vacía." };
    return { ok: true, data: { csv } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "La limpieza falló." };
  } finally {
    if (proyecto && token) await pedir(con, con.base + RUTAS.borrar, { method: "POST", body: new URLSearchParams({ project: proyecto, csrf_token: token }) });
  }
}
