/**
 * OpenRefine 3.10.1 (BSD-3) · cliente de su interfaz de órdenes (INV1025F, repos-libreria-1025.md §3.4).
 * Corre en local, 127.0.0.1:3333, SIN autenticación; toda orden POST exige token CSRF: se pide a
 * `/command/core/get-csrf-token` ({token}) y se manda como campo «csrf_token». Protocolo NO versionado:
 * cada ruta se fijó tras verificarla en el código de la 3.10 (GetCSRFTokenCommand, CreateProjectCommand,
 * ApplyOperationsCommand, ExportRowsCommand, DeleteProjectCommand, GetVersionCommand). Solo habla con
 * loopback salvo que la configuración traiga el token de una pasarela; `fetch` y el temporizador son
 * INYECTABLES: las pruebas usan un servidor falso y nada toca la red real.
 */
import type { IntegrationConfig, IntegrationResult } from "../types";
import type { RecetaLimpieza } from "@/lib/datos/receta-limpieza";
import { validarReceta } from "@/lib/datos/receta-limpieza";

export const ENDPOINT_POR_DEFECTO = "http://127.0.0.1:3333";
export const TIEMPO_MS = 30_000;

export interface RespuestaOpenRefine { ok: boolean; status: number; text(): Promise<string> }
export interface SolicitudOpenRefine { method: "GET" | "POST"; headers: Record<string, string>; body: FormData | string; signal: AbortSignal }
export type FetchOpenRefine = (url: string, init: SolicitudOpenRefine) => Promise<RespuestaOpenRefine>;
export interface OpcionesOpenRefine { fetch?: FetchOpenRefine; tiempoMs?: number; despues?: (ms: number, fn: () => void) => { cancelar(): void } }
export interface EntradaLimpieza { csv: string; receta: RecetaLimpieza; formato?: string; nombre?: string }

/** Crea el proyecto con el CSV como multipart (campos exactos de la 3.10: project-file, project-name, format, options). */
function crearForm(entrada: EntradaLimpieza, t: string): FormData {
  const f = new FormData();
  f.append("csrf_token", t);
  f.append("project-name", entrada.nombre || "starseed-limpieza");
  f.append("format", entrada.formato || "text/csv");
  f.append("options", JSON.stringify({ separator: ",", headerLines: 1 }));
  f.append("project-file", new Blob([entrada.csv], { type: "text/csv" }), "datos.csv");
  return f;
}

const LOOPBACK = ["127.0.0.1", "localhost", "::1", "[::1]"];
const FORM_URL = "application/x-www-form-urlencoded";
/** Motor de facetas vacío: factura sin faceta = todas las filas (JSON en el campo «engine»). */
const MOTOR_VACIO = JSON.stringify({ mode: "row-based", facets: [] });

/** Completa la ruta de una orden («/command/core/…», sin versionar: fijada contra el código 3.10). */
const orden = (base: string, s: string, query = ""): string => `${base}/command/core/${s}${query}`;
/** Cuerpo urlencoded con los campos pedidos y SIEMPRE el token CSRF (nombre exacto: «csrf_token»). */
const form = (t: string, campos: [string, string][]): string =>
  new URLSearchParams([...campos, ["csrf_token", t]]).toString();

/** Valida el endpoint: http(s), y loopback salvo pasarela (el token va en cfg.apiKey). */
function baseDe(cfg: IntegrationConfig): string {
  const base = (cfg.endpoint || ENDPOINT_POR_DEFECTO).trim().replace(/\/+$/, "");
  const url = new URL(base);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`El endpoint de OpenRefine no es http(s): ${base}`);
  const interna = LOOPBACK.includes(url.hostname) || url.hostname.endsWith(".localhost");
  if (!interna && !(cfg.apiKey ?? "").trim())
    throw new Error("OpenRefine solo se habla por loopback (127.0.0.1); un host externo exige el token de una pasarela.");
  return base;
}

/** Una llamada con tiempo límite (AbortController + temporizador inyectable); el texto o un error con la orden. */
async function pedir(url: string, init: SolicitudOpenRefine, o: OpcionesOpenRefine, ms: number): Promise<string> {
  const ctl = new AbortController();
  const tras = o.despues ?? ((d: number, fn: () => void) => {
    const t = setTimeout(fn, d);
    return { cancelar: () => clearTimeout(t) };
  });
  const plazo = tras(ms, () => ctl.abort());
  try {
    const r = await (o.fetch ?? (globalThis.fetch as FetchOpenRefine))(url, { ...init, signal: ctl.signal });
    const texto = await r.text();
    if (!r.ok) throw new Error(`OpenRefine respondió ${r.status} en ${init.method} ${url.slice(-60)}: ${texto.slice(0, 160)}`);
    return texto;
  } finally {
    plazo.cancelar();
  }
}

async function jsonDe(texto: string, ordenTexto: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(texto) as Record<string, unknown>; } catch { throw new Error(`${ordenTexto} no devolvió JSON: ${texto.slice(0, 160)}`); }
}

/**
 * limpiar = validar la receta → token → crear proyecto → aplicar → exportar → BORRAR el proyecto
 * SIEMPRE (también si algo falla, en el finally). La receta no va sin valer: se rechaza ANTES de
 * tocar la red (Jython, clojure, column-addition-by-fetching-urls, host no loopback…).
 */
export async function limpiar(cfg: IntegrationConfig, entrada: EntradaLimpieza, opciones: OpcionesOpenRefine = {}): Promise<IntegrationResult> {
  const v = validarReceta(entrada.receta);
  if (!v.ok) return { ok: false, error: v.motivo };
  const ms = opciones.tiempoMs ?? TIEMPO_MS;
  let base = "", token = "", idProyecto: string | undefined;
  try {
    base = baseDe(cfg);
    token = String((await jsonDe(await pedir(orden(base, "get-csrf-token"), { method: "GET", headers: { accept: "application/json" }, body: "" }, opciones, ms), "get-csrf-token")).token ?? "");
    if (!token) throw new Error("OpenRefine no dio un token CSRF: ¿es una 3.x con CSRF activado?");
    const creado = await jsonDe(await pedir(orden(base, "create-project-from-upload"), { method: "POST", headers: { accept: "application/json" }, body: crearForm(entrada, token) }, opciones, ms), "create-project-from-upload");
    if (creado.status !== "ok" || creado.projectId === undefined) throw new Error(`No se creó el proyecto: ${JSON.stringify(creado).slice(0, 160)}`);
    idProyecto = String(creado.projectId);
    const query = `?project=${encodeURIComponent(idProyecto)}`;
    const aplicar = await jsonDe(await pedir(orden(base, "apply-operations", query), { method: "POST", headers: { "content-type": FORM_URL }, body: form(token, [["operations", JSON.stringify(entrada.receta.operaciones)]]) }, opciones, ms), "apply-operations");
    if (aplicar.code !== "ok") throw new Error(`apply-operations devolvió «${String(aplicar.code)}»: ${String(aplicar.error ?? "sin detalle").slice(0, 160)}`);
    const cuerpoExport = form(token, [["project", idProyecto], ["format", entrada.formato || "csv"], ["engine", MOTOR_VACIO]]);
    const csv = await pedir(orden(base, "export-rows"), { method: "POST", headers: { "content-type": FORM_URL }, body: cuerpoExport }, opciones, ms);
    return { ok: true, data: { csv } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e).slice(0, 200) };
  } finally {
    if (base && idProyecto && token) {
      const q = `?project=${encodeURIComponent(idProyecto)}`;
      await pedir(orden(base, "delete-project", q), { method: "POST", headers: { "content-type": FORM_URL }, body: form(token, [["project", idProyecto]]) }, { fetch: opciones.fetch, despues: opciones.despues }, Math.min(ms, 10_000)).catch(() => undefined);
    }
  }
}

/** Salud = GET /command/core/get-version (única orden GET sin token; captura su propio error). */
export async function health(cfg: IntegrationConfig, opciones: OpcionesOpenRefine = {}): Promise<IntegrationResult> {
  try {
    const base = baseDe(cfg);
    const ver = await jsonDe(await pedir(orden(base, "get-version"), { method: "GET", headers: { accept: "application/json" }, body: "" }, opciones, opciones.tiempoMs ?? 5_000), "get-version");
    return { ok: true, data: { version: String(ver.version ?? ""), revision: String(ver.revision ?? "") } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e).slice(0, 200) };
  }
}
