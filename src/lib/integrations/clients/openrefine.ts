// OpenRefine 3.10.1 local — cliente de su interfaz de órdenes (INV1025F).
// Protocolo verificado contra el código y la documentación de la 3.10 (NO
// versionado): `/command/core/*` con token CSRF (orden exacta «get-csrf-token»,
// GetCSRFTokenCommand.java; campo `csrf_token` en los POST). Corre en loopback
// y SIN autenticación: nunca se habla fuera sin pasarela con token
// (`cfg.extra.pasarelaToken` → Authorization Bearer). `limpiar`: token → crear
// → aplicar → exportar → BORRAR el proyecto SIEMPRE, también al fallar.
// `fetch` inyectable y tiempo límite por llamada.漂流 sin node:*.

import type { IntegrationConfig, IntegrationResult } from "../types";
import { validarReceta, type RecetaLimpieza } from "../../datos/receta-limpieza";

export const ENDPOINT_DEFECTO = "http://127.0.0.1:3333"; export const LIMITE_MS_DEFECTO = 30_000;
export const RUTA_TOKEN = "/command/core/get-csrf-token"; export const RUTA_CREAR = "/command/core/create-project-from-upload";
export const RUTA_APLICAR = "/command/core/apply-operations"; export const RUTA_EXPORTAR = "/command/core/export-rows";
export const RUTA_BORRAR = "/command/core/delete-project"; export const RUTA_VERSION = "/command/core/get-version";
export type FormatoExport = "text/csv" | "tsv" | "csv/semi-colon" | "xlsx" | "ods" | "html";

export interface EntradaLimpieza {
  csv: string;             // CSV crudo (se sube como proyecto efímero)
  receta: RecetaLimpieza;  // receta validada (ver receta-limpieza.ts)
  formato?: FormatoExport; // formato de exportación (por defecto text/csv)
}

export interface OpcionesRefine {
  fetchFn?: typeof fetch; // fetch inyectable (pruebas con servidor falso)
  limiteMs?: number;      // tiempo límite por llamada (AbortController)
}

/** ¿Es loopback (localhost, 127.0.0.0/8 o ::1)? */
export function esLoopback(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "[::1]" || u.hostname === "::1" || /^127\./.test(u.hostname);
  } catch { return false; }
}

/** URL válida para hablar con OpenRefine, o null (host remoto sin pasarela). */
export function escudarEndpoint(cfg: IntegrationConfig): string | null {
  const url = cfg.endpoint?.trim() || ENDPOINT_DEFECTO;
  if (esLoopback(url)) return url;
  return typeof cfg.extra?.["pasarelaToken"] === "string" && cfg.extra["pasarelaToken"].trim() !== "" ? url : null;
}

/** Cabeceras de la pasarela (Authorization: Bearer) cuando hay token. */
export function cabecerasPasarela(cfg: IntegrationConfig): Record<string, string> {
  const t = cfg.extra?.["pasarelaToken"];
  return typeof t === "string" && t.trim() !== "" ? { Authorization: `Bearer ${t.trim()}` } : {};
}

/** fetch con tiempo límite (AbortController; no deja temporizadores colgados). */
async function pedir(url: string, init: RequestInit, fetchFn: typeof fetch, limiteMs: number): Promise<Response> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), limiteMs);
  try { return await fetchFn(url, { ...init, signal: control.signal }); }
  finally { clearTimeout(temporizador); }
}

/** Multipart con los campos dados (un Blob puede llevar su nombre). */
function form(...campos: Array<readonly [string, string] | readonly [string, Blob, string]>): FormData {
  const f = new FormData();
  for (const c of campos) if (c.length === 3) f.append(c[0], c[1] as Blob, c[2]); else f.append(c[0], c[1] as string);
  return f;
}

/** JSON defensivo de una Response (cualquier fallo de análisis → {}). */
async function jsonDe(r: Response): Promise<Record<string, unknown>> {
  try { return (await r.json()) as Record<string, unknown>; } catch { return {}; }
}

/** token → crear → aplicar → exportar → borrar (SIEMPRE, incluso al fallar). */
export async function limpiar(cfg: IntegrationConfig, entrada: EntradaLimpieza, opcs: OpcionesRefine = {}): Promise<IntegrationResult> {
  const vn = validarReceta(entrada.receta);
  if (!vn.ok) return { ok: false, error: `Receta rechazada: ${vn.errores.join(" ")}` };
  const urlBase = escudarEndpoint(cfg);
  if (!urlBase) return { ok: false, error: "OpenRefine solo se habla en loopback salvo con token de pasarela." };
  const fetchFn = opcs.fetchFn ?? fetch;
  const limiteMs = opcs.limiteMs ?? LIMITE_MS_DEFECTO;
  let token = "";
  let idProyecto = "";
  /* Borrado del proyecto efímero: devuelve "" si quedó confirmado. */
  const borrarProyecto = async (): Promise<string> => {
    if (!idProyecto) return "";
    try {
      const r = await pedir(urlBase + RUTA_BORRAR, { method: "POST", body: form(["project", idProyecto], ["csrf_token", token]) }, fetchFn, limiteMs);
      return (await jsonDe(r))["status"] === "ok" ? "" : "OpenRefine no confirmó el borrado del proyecto.";
    } catch {
      return "No se pudo pedir el borrado del proyecto.";
    }
  };
  const fallo = async (mensaje: string): Promise<IntegrationResult> => {
    if (!idProyecto) return { ok: false, error: mensaje };
    const aviso = await borrarProyecto();
    return { ok: false, error: aviso ? `${mensaje} (aviso: ${aviso})` : mensaje };
  };
  try {
    const rT = await pedir(urlBase + RUTA_TOKEN, { headers: { Accept: "application/json", ...cabecerasPasarela(cfg) } }, fetchFn, limiteMs);
    if (!rT.ok) return { ok: false, error: `OpenRefine sin token CSRF (HTTP ${rT.status}).` };
    token = String((await jsonDe(rT))["token"] ?? "");
    if (!token) return { ok: false, error: "OpenRefine no devolvió token CSRF." };
    const fC = form(["project-file", new Blob([entrada.csv], { type: "text/csv" }), "entrada.csv"],
      ["project-name", entrada.receta.nombre || `starseed-${entrada.receta.id}`],
      ["format", "text/csv"], ["options", JSON.stringify({ separator: "," })], ["csrf_token", token]);
    const rC = await pedir(urlBase + RUTA_CREAR, { method: "POST", body: fC }, fetchFn, limiteMs);
    if (!rC.ok) return { ok: false, error: `No pude crear el proyecto (HTTP ${rC.status}).` };
    const crear = await jsonDe(rC);
    idProyecto = String(crear["project_id"] ?? "");
    if (crear["status"] !== "ok" || !idProyecto) return { ok: false, error: "OpenRefine no creó el proyecto." };
    const fA = form(["operations", JSON.stringify(vn.receta.operaciones)], ["csrf_token", token]);
    const rA = await pedir(`${urlBase}${RUTA_APLICAR}?project=${idProyecto}`, { method: "POST", body: fA }, fetchFn, limiteMs);
    if (!rA.ok) return fallo(`Fallo al aplicar la receta (HTTP ${rA.status}).`);
    const aplicar = await jsonDe(rA);
    if (aplicar["status"] !== "ok") return fallo(`OpenRefine rechazó la receta: ${JSON.stringify(aplicar)}.`);
    const fE = form(["project", idProyecto], ["format", entrada.formato ?? "text/csv"],
      ["engine", JSON.stringify({ mode: "row-based", facets: [] })], ["csrf_token", token]);
    const rE = await pedir(urlBase + RUTA_EXPORTAR, { method: "POST", body: fE }, fetchFn, limiteMs);
    if (!rE.ok) return fallo(`Fallo al exportar las filas (HTTP ${rE.status}).`);
    const csv = await rE.text();
    const aviso = await borrarProyecto();
    return { ok: true, data: aviso ? { csv, aviso, proyectoCerrado: false } : { csv, proyectoCerrado: true } };
  } catch (e) {
    return fallo(e instanceof Error ? e.message : "Sin conexión con OpenRefine.");
  }
}

/** Salud: GET /command/core/get-version (con escudo de loopback/pasarela). */
export async function health(cfg: IntegrationConfig, opcs: OpcionesRefine = {}): Promise<IntegrationResult> {
  const urlBase = escudarEndpoint(cfg);
  if (!urlBase) return { ok: false, error: "OpenRefine solo se habla en loopback salvo con token de pasarela." };
  try {
    const r = await pedir(urlBase + RUTA_VERSION, { headers: { Accept: "application/json", ...cabecerasPasarela(cfg) } },
      opcs.fetchFn ?? fetch, opcs.limiteMs ?? LIMITE_MS_DEFECTO);
    if (!r.ok) return { ok: false, error: `OpenRefine /get-version respondió HTTP ${r.status}.` };
    return { ok: true, data: { version: (await jsonDe(r))["version"] ?? "", endpoint: urlBase } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sin conexión con OpenRefine." };
  }
}
