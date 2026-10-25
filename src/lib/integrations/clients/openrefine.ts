// src/lib/integrations/clients/openrefine.ts
// Cliente de la interfaz de órdenes de OpenRefine 3.10 (BSD-3) en 127.0.0.1:3333,
// verificado contra el código de la 3.10 (GetCSRFTokenCommand, CreateProjectFromUpload…).
// El POST pide token CSRF por GET /command/core/get-csrf-token y lo devuelve como
// csrf_token; crear proyecto = multipart (project-file, project-name, format, options);
// aplicar = operations (array JSON); exportar = project/format/engine; borrar proyecto;
// versión = get-version. Protocolo sin versionado oficial: si una orden cambia, se ajusta aquí.
// limpieza = token → crear → aplicar → exportar → BORRAR SIEMPRE el proyecto, también si
// algo falla. Sin node:*: fetch/FormData/URLSearchParams son globales; servicio sin
// autenticación: solo loopback, salvo token de pasarela configurado.

import { validarReceta, type RecetaLimpieza } from "@/lib/datos/receta-limpieza";

export type FetchAbierto = (input: string, init?: RequestInit) => Promise<Response>;

export interface ConfigOpenRefine { endpoint?: string; fetchInyectado?: FetchAbierto; tiempoLimiteMs?: number; tokenPasarela?: string; }

export interface EntradaLimpieza { csv: string; receta: RecetaLimpieza; formato?: string; opciones?: Record<string, string>; }

export interface ResultadoLimpieza { ok: boolean; csv?: string; proyectoId?: string; error?: string; }

export interface ResultadoVersion { ok: boolean; version?: string; error?: string; }

export const ENDPOINT_DEFECTO = "http://127.0.0.1:3333";
const FORMATO_IMPORTACION = "csv/line-based";

// Rutas de /command/core de la 3.10.
const RUTAS = {
  token: "/command/core/get-csrf-token", crear: "/command/core/create-project-from-upload",
  aplicar: "/command/core/apply-operations", exportar: "/command/core/export-rows",
  borrar: "/command/core/delete-project", version: "/command/core/get-version",
} as const;

/** ¿Es un host de bucle local? Solo por ahí se habla con OpenRefine por defecto. */
export function esLoopback(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "[::1]" || /^127(\.\d+){3}$/.test(h);
}
/** Motivo del rechazo en español, o null si el host está permitido (R3/R9). */
export function verificarHost(hostname: string, tokenPasarela?: string): string | null {
  if (esLoopback(hostname) || tokenPasarela) return null;
  return "OpenRefine corre sin autenticación: solo se habla con loopback, o con el token de una pasarela.";
}

function urlDe(ruta: string, origen: URL): string {
  return new URL(ruta, origen).toString();
}

/** Llamada con tiempo límite: AbortController abortado pasado el plazo configurado. */
async function pedir(cfg: ConfigOpenRefine, fetchAbierto: FetchAbierto, url: string, init: RequestInit): Promise<Response> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), cfg.tiempoLimiteMs ?? 30_000);
  try {
    const res = await fetchAbierto(url, { ...init, signal: control.signal });
    if (!res.ok) throw new Error(`OpenRefine respondió ${res.status} en ${new URL(url).pathname}`);
    return res;
  } finally {
    clearTimeout(temporizador);
  }
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : "Error al hablar con OpenRefine.";
}

/** Token → crear proyecto → aplicar la receta → exportar → borrar SIEMPRE el proyecto. */
export async function limpiar(cfg: ConfigOpenRefine, entrada: EntradaLimpieza): Promise<ResultadoLimpieza> {
  const fetchAbierto = cfg.fetchInyectado ?? fetch;
  let origen: URL;
  try { origen = new URL(cfg.endpoint ?? ENDPOINT_DEFECTO); }
  catch { return { ok: false, error: "El endpoint no es una URL válida." }; }
  const rechazo = verificarHost(origen.hostname, cfg.tokenPasarela);
  if (rechazo) return { ok: false, error: rechazo };
  if (!entrada.csv) return { ok: false, error: "Falta el CSV de entrada." };
  const validacion = validarReceta(entrada.receta);
  if (!validacion.valida) return { ok: false, error: validacion.motivo ?? "Receta no válida." };
  const tokenResp = (await (await pedir(cfg, fetchAbierto, urlDe(RUTAS.token, origen), { method: "GET" })).json()) as { token?: string };
  const token = tokenResp.token;
  if (!token) return { ok: false, error: "OpenRefine no entregó token CSRF." };
  const datos = new FormData();
  datos.append("csrf_token", token);
  datos.append("project-file", new Blob([entrada.csv], { type: "text/csv" }), "entrada.csv");
  datos.append("project-name", "limpieza-starseed");
  datos.append("format", FORMATO_IMPORTACION);
  if (entrada.opciones) datos.append("options", JSON.stringify(entrada.opciones));
  const creado = (await (await pedir(cfg, fetchAbierto, urlDe(RUTAS.crear, origen), { method: "POST", body: datos })).json()) as { "project-id"?: string | number; message?: string };
  const proyectoId = creado?.["project-id"] != null ? String(creado["project-id"]) : "";
  if (!proyectoId) return { ok: false, error: creado?.message || "OpenRefine no devolvió el id del proyecto." };
  try {
    const aplicar = new URLSearchParams({ csrf_token: token, operations: JSON.stringify(entrada.receta.operaciones) });
    const aplicarUrl = urlDe(RUTAS.aplicar + "?project=" + proyectoId, origen);
    const aplicado = (await (await pedir(cfg, fetchAbierto, aplicarUrl, { method: "POST", body: aplicar })).json()) as { status?: string; message?: string };
    if (aplicado?.status !== "ok")
      return { ok: false, proyectoId, error: aplicado?.message || "No se pudo aplicar la receta." };
    const exportar = new URLSearchParams({ csrf_token: token, project: proyectoId, format: entrada.formato || "csv", engine: "{}" });
    const csv = await (await pedir(cfg, fetchAbierto, urlDe(RUTAS.exportar, origen), { method: "POST", body: exportar })).text();
    return { ok: true, csv, proyectoId };
  } catch (e) { return { ok: false, proyectoId, error: mensajeDe(e) }; } finally {
    // Borrado incondicional: el servicio local no conserva datos de nadie.
    try {
      const borrar = new URLSearchParams({ csrf_token: token, project: proyectoId });
      await pedir(cfg, fetchAbierto, urlDe(RUTAS.borrar, origen), { method: "POST", body: borrar });
    } catch { /* un borrado fallido no tapa el resultado real del trabajo */ }
  }
}

/** Salud: get-version del servicio local (solo loopback, salvo token de pasarela). */
export async function health(cfg: ConfigOpenRefine): Promise<ResultadoVersion> {
  const fetchAbierto = cfg.fetchInyectado ?? fetch;
  let origen: URL;
  try { origen = new URL(cfg.endpoint ?? ENDPOINT_DEFECTO); }
  catch { return { ok: false, error: "El endpoint no es una URL válida." }; }
  const rechazo = verificarHost(origen.hostname, cfg.tokenPasarela);
  if (rechazo) return { ok: false, error: rechazo };
  try {
    const datos = (await (await pedir(cfg, fetchAbierto, urlDe(RUTAS.version, origen), { method: "GET" })).json()) as { version?: string };
    return { ok: true, version: datos.version };
  } catch (e) { return { ok: false, error: mensajeDe(e) }; }
}
