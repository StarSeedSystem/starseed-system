// ════════════════════════════════════════════════════════════════
// OpenRefine 3.10 (BSD-3) — limpieza y deduplicación LOCAL como servicio del aparato
// ----------------------------------------------------------------
// Core en la neurona (127.0.0.1:3333, sin auth; script `refine`: -p, -i, -m, -d; Java 11–21).
// Protocolo de la 3.10 (NO versionado: cotejar ante cambios; GetCSRFTokenCommand.java y docs
// openrefine.org/docs/technical-reference/openrefine-api): get-csrf-token → { token } (los POST
// piden csrf_token) · create-project-from-upload (multipart: project-file, project-name, format,
// options) · apply-operations?project= (form: operations = array JSON) · export-rows?project=&format=
// (form: engine) · delete-project?project= · get-version → salud. El proyecto temporal SE BORRA
// SIEMPRE, incluso si un paso falla; solo loopback, otro anfitrión pide token de pasarela (cfg.apiKey).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { validarReceta, type RecetaLimpieza } from "@/lib/datos/receta-limpieza";

export const ENDPOINT_DEFECTO = "http://127.0.0.1:3333";
export const FORMATO_IMPORT = "text/line-based/csv";
const PREFIJO = "/command/core";
const MOTOR_FILAS_VACIO = '{"facets":[],"mode":"row-based"}';

export type FetchOpenRefine = (input: string, init?: RequestInit) => Promise<Response>;

export interface EntradaLimpieza { csv: string; receta: RecetaLimpieza; formato?: string; }
export interface OpcionesOpenRefine { fetch?: FetchOpenRefine; timeoutMs?: number; nombreProyecto?: string; }
export interface LimpiezaOk { csv: string; proyecto: string; borrado: boolean; }

/** Verdadero para localhost/::1/127.x (y sus formas con corchetes o prefijo IPv4-mapped). */
const esLoopback = (h: string): boolean => {
  const a = h.replace(/^\[|\]$/g, "").toLowerCase();
  return a === "localhost" || a.endsWith(".localhost") || a === "::1" || a.startsWith("127.") || a.startsWith("::ffff:127.");
};

/** Base lista (sin barra final) y token de pasarela; error si el punto de OpenRefine no es local. */
export function prepararBase(cfg: IntegrationConfig): { base: string; token: string; error?: string } {
  const base = (cfg.endpoint?.trim() || ENDPOINT_DEFECTO).replace(/\/+$/, "");
  const token = (cfg.apiKey || (cfg.extra?.pasarelaToken ?? "")).trim();
  let hostname = "";
  try { hostname = new URL(base).hostname; } catch { return { base, token, error: "Endpoint de OpenRefine inválido." }; }
  if (!esLoopback(hostname) && !token) return { base, token, error: "OpenRefine solo se habla en loopback; otro anfitrión exige el token de una pasarela." };
  return { base, token };
}

/** fetch con tiempo límite: corta si OpenRefine no responde, sin proseguir el flujo. */
async function conVence(pedir: FetchOpenRefine, ms: number, url: string, init: RequestInit, paso: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await pedir(url, { ...init, signal: ctrl.signal }); } catch {
    throw new Error(`${paso}: sin respuesta de OpenRefine (apagado o límite de ${ms} ms).`);
  } finally { clearTimeout(t); }
}

/** Token → crear proyecto → aplicar receta → exportar → BORRAR SIEMPRE (también si algo falla). */
export async function limpiar(cfg: IntegrationConfig, entrada: EntradaLimpieza, op: OpcionesOpenRefine = {}): Promise<IntegrationResult<LimpiezaOk>> {
  const { base, token, error } = prepararBase(cfg);
  if (error) return { ok: false, error };
  const v = validarReceta(entrada.receta);
  if (!v.ok) return { ok: false, error: `Receta rechazada: ${v.errores.join(" ")}` };
  if (!entrada.receta.operaciones.length) return { ok: false, error: "La receta no tiene operaciones." };
  const pedir = op.fetch ?? fetch;
  const ms = op.timeoutMs ?? 60_000; const extra: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  const ord = (c: string) => `${base}${PREFIJO}/${c}`;
  let tokenCsrf = "", proyectoId = "";
  const borrarProyecto = async (id: string): Promise<boolean> => {
    try { return (await conVence(pedir, ms, `${ord("delete-project")}?project=${encodeURIComponent(id)}`, { method: "POST", headers: extra, body: new URLSearchParams({ csrf_token: tokenCsrf }) }, "borrar")).ok; } catch { return false; }
  };

  const crear = async (): Promise<string> => {
    const f = new FormData();
    f.append("csrf_token", tokenCsrf);
    f.append("project-name", op.nombreProyecto ?? "limpieza-starseed");
    f.append("format", FORMATO_IMPORT); f.append("options", "{}");
    f.append("project-file", new Blob([entrada.csv], { type: "text/csv" }), "datos.csv");
    const r = await conVence(pedir, ms, ord("create-project-from-upload"), { method: "POST", headers: extra, body: f }, "crear");
  const j = (await r.json().catch(() => ({}))) as { status?: string; project?: string | number };
    if (!r.ok || j.status !== "ok" || j.project === undefined) throw new Error(`crear: HTTP ${r.status}.`);
    return String(j.project);
  };

  const aplicar = async (): Promise<void> => {
    const cuerpo = new URLSearchParams({ operations: JSON.stringify(entrada.receta.operaciones), csrf_token: tokenCsrf });
    const r = await conVence(pedir, ms, `${ord("apply-operations")}?project=${encodeURIComponent(proyectoId)}`, { method: "POST", headers: extra, body: cuerpo }, "aplicar");
    const j = (await r.json().catch(() => ({}))) as { status?: string; code?: string };
    if (!r.ok || !(j.code === "ok" || j.status === "ok")) throw new Error(`aplicar: HTTP ${r.status}.`);
  };

  const exportar = async (formato: string): Promise<string> => {
    const r = await conVence(pedir, ms, `${ord("export-rows")}?project=${encodeURIComponent(proyectoId)}&format=${encodeURIComponent(formato)}`, { method: "POST", headers: extra, body: new URLSearchParams({ engine: MOTOR_FILAS_VACIO, csrf_token: tokenCsrf }) }, "exportar");
    if (!r.ok) throw new Error(`exportar: HTTP ${r.status}.`);
    const csv = await r.text();
    if (!csv.trim()) throw new Error("OpenRefine exportó filas vacías.");
    return csv;
  };
  try {
    const rT = await conVence(pedir, ms, ord("get-csrf-token"), {}, "token");
    if (!rT.ok) throw new Error(`token: HTTP ${rT.status}.`);
    tokenCsrf = ((await rT.json().catch(() => ({}))) as { token?: string }).token ?? "";
    if (!tokenCsrf) throw new Error("No llegó el token CSRF de OpenRefine.");
    proyectoId = await crear();
    await aplicar();
    const csv = await exportar((entrada.formato ?? "csv").trim() || "csv");
    return { ok: true, data: { csv, proyecto: proyectoId, borrado: await borrarProyecto(proyectoId) } };
  } catch (e) {
    await borrarProyecto(proyectoId);
    return { ok: false, error: e instanceof Error ? e.message : "Fallo limpiando con OpenRefine." };
  }
}

/** Salud: GET /command/core/get-version — la versión que el propio OpenRefine declara. */
export async function health(cfg: IntegrationConfig, op: OpcionesOpenRefine = {}): Promise<IntegrationResult> {
  const { base, error } = prepararBase(cfg);
  if (error) return { ok: false, error };
  const pedir = op.fetch ?? fetch;
  try {
    const r = await conVence(pedir, op.timeoutMs ?? 8_000, `${base}${PREFIJO}/get-version`, {}, "get-version");
    const j = (await r.json().catch(() => ({}))) as { version?: string };
    return r.ok && j.version ? { ok: true, data: j } : { ok: false, error: `OpenRefine sin versión (HTTP ${r.status}).` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fallo" };
  }
}
