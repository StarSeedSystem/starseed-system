// OpenRefine 3.10.1 · cliente del servicio local sin autenticación. Protocolo verificado
// contra el CÓDIGO de la 3.10 (las rutas de /command/core no están versionadas en los docs):
// GET get-csrf-token → {"token"} y los POST piden el parámetro «csrf_token» (Command.java);
// POST create-project-from-upload (multipart: project-file, project-name, format, options)
// REDIRIGE a /project?project=<id>; POST apply-operations?project=<id> con «operations»
// (array JSON; Recipe usa @JsonUnwrapped); POST export-rows (project, format, engine) →
// CSV; POST delete-project (project); GET get-version. Solo loopback (127.0.0.1:3333); un
// host remoto exige el token de una pasarela en cfg.apiKey. La receta es DATO validado por
// validarReceta y el proyecto se borra SIEMPRE, también si algo falla antes.

import type { IntegrationConfig, IntegrationResult } from "../types";
import { validarReceta } from "../../datos/receta-limpieza";

/** Endpoint por defecto (solo loopback), formato CSV del importador y tope por llamada (ms). */
export const OPENREFINE_DEFECTO = "http://127.0.0.1:3333";
const FORMATO_CSV = "text/line-based/*sv";
const TOPE_MS = 15_000;

/** Red y reloj inyectables para las pruebas y para el servidor. */
export interface OpcionesOpenRefine {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
/** ¿El endpoint habla con la propia máquina? */
export function esLoopback(endpoint: string): boolean {
  try { return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(endpoint).hostname.toLowerCase()); } catch { return false; }
}

/** Guardia común: URL válida y, si no es loopback, token de pasarela. */
function entradaValida(cfg: IntegrationConfig): { ok: true; base: string } | { ok: false; error: string } {
  const base = (cfg.endpoint || OPENREFINE_DEFECTO).replace(/\/+$/, "");
  const host = new URL(base, "http://refine.local").hostname.toLowerCase();
  if (!host || host === "refine.local") return { ok: false, error: "el endpoint de OpenRefine no es una URL válida." };
  if (!esLoopback(base) && !cfg.apiKey) return { ok: false, error: "OpenRefine solo se habla en loopback («http://127.0.0.1:3333»); un host remoto exige el token de tu pasarela en la clave." };
  return { ok: true, base };
}

/** fetch con tiempo límite (AbortSignal.timeout) y errores en español. */
async function pedir(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<{ res?: Response; error?: string }> {
  try {
    return { res: await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) }) };
  } catch (e) {
    return { error: `no hubo respuesta de OpenRefine: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Salud: versión de OpenRefine (GET /command/core/get-version). */
export async function health(cfg: IntegrationConfig, deps: OpcionesOpenRefine = {}): Promise<IntegrationResult<{ version?: string; revision?: string }>> {
  const guard = entradaValida(cfg);
  if (!guard.ok) return guard;
  const r = await pedir(deps.fetchImpl ?? fetch, `${guard.base}/command/core/get-version`, { method: "GET" }, deps.timeoutMs ?? TOPE_MS);
  if (!r.res) return { ok: false, error: r.error };
  try {
    const v = (await r.res.json()) as { version?: unknown; revision?: unknown };
    if (typeof v.version !== "string") return { ok: false, error: "OpenRefine respondió sin versión (¿no es el servicio de la 3.10?)." };
    return { ok: true, data: { version: v.version, revision: typeof v.revision === "string" ? v.revision : undefined } };
  } catch { return { ok: false, error: "no pude leer la versión de OpenRefine." }; }
}

/** Borra el proyecto creado: SIEMPRE, también si algo falló antes. */
async function borrar(base: string, id: string, csr: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<void> {
  try {
    const form = new FormData();
    form.append("csrf_token", csr);
    await fetchImpl(`${base}/command/core/delete-project?project=${id}`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch { /* el borrado de salida es best-effort y no interrumpe el resultado */ }
}

/** csv + receta → csv limpio: crea el proyecto, aplica, exporta y SIEMPRE lo borra. */
export async function limpiar(
  cfg: IntegrationConfig,
  entrada: { csv: string; receta: unknown; formato?: string; opcionesCsv?: string; formatoSalida?: string },
  deps: OpcionesOpenRefine = {},
): Promise<IntegrationResult<{ csv: string }>> {
  if (typeof entrada?.csv !== "string" || !entrada.csv.trim()) return { ok: false, error: "Aporta el CSV a limpiar." };
  const veredicto = validarReceta(entrada.receta);
  if (!veredicto.ok || !veredicto.receta) return { ok: false, error: `receta rechazada: ${(veredicto.errores ?? []).join(" · ")}` };
  const guard = entradaValida(cfg);
  if (!guard.ok) return guard;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? TOPE_MS;
  const base = `${guard.base}/command/core`;
  const rTok = await pedir(fetchImpl, `${base}/get-csrf-token`, { method: "GET" }, timeoutMs);
  if (!rTok.res) return { ok: false, error: rTok.error };
  let csr: string;
  try {
    const cuerpo = (await rTok.res.json()) as { token?: unknown };
    if (typeof cuerpo.token !== "string") return { ok: false, error: "OpenRefine no entregó su token CSRF." };
    csr = cuerpo.token;
  } catch { return { ok: false, error: "no pude leer la respuesta del token CSRF de OpenRefine." }; }
  let id = "";
  try {
    const subida = new FormData();
    subida.append("project-name", "starseed-limpieza");
    subida.append("project-file", new Blob([entrada.csv]), "entrada.csv");
    subida.append("format", entrada.formato || FORMATO_CSV);
    subida.append("csrf_token", csr);
    if (entrada.opcionesCsv) subida.append("options", entrada.opcionesCsv);
    const r = await pedir(fetchImpl, `${base}/create-project-from-upload`, { method: "POST", body: subida }, timeoutMs);
    if (!r.res) return { ok: false, error: r.error };
    id = new URL(r.res.url, `${base}/…`).searchParams.get("project") ?? "";
    if (!id) return { ok: false, error: "no pude crear el proyecto en OpenRefine (¿la instancia no es la 3.10?)." };
    const aplicar = new FormData();
    aplicar.append("operations", JSON.stringify(veredicto.receta.operaciones));
    aplicar.append("csrf_token", csr);
    const r2 = await pedir(fetchImpl, `${base}/apply-operations?project=${id}`, { method: "POST", body: aplicar }, timeoutMs);
    if (!r2.res || !r2.res.ok) return { ok: false, error: r2.error ?? `OpenRefine rechazó la receta (HTTP ${r2.res?.status}).` };
    const exportar = new FormData();
    exportar.append("project", id);
    exportar.append("format", entrada.formatoSalida || "csv");
    exportar.append("engine", JSON.stringify({ mode: "row-based", facets: [] }));
    exportar.append("csrf_token", csr);
    const r3 = await pedir(fetchImpl, `${base}/export-rows`, { method: "POST", body: exportar }, timeoutMs);
    if (!r3.res || !r3.res.ok) return { ok: false, error: r3.error ?? `la exportación falló (HTTP ${r3.res?.status}).` };
    const csv = await r3.res.text();
    return csv.trim() ? { ok: true, data: { csv } } : { ok: false, error: "la exportación volvió vacía." };
  } finally {
    if (id) await borrar(guard.base, id, csr, fetchImpl, timeoutMs);
  }
}
