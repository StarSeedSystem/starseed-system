// OpenRefine 3.10.1 (BSD-3) — cliente de las órdenes /command/core/…
// Servicio local en 127.0.0.1:3333, sin autenticación. Protocolo verificado contra el código de
// la 3.10: las órdenes mutantes piden antes su token CSRF (get-csrf-token, campo `csrf_token`).
// limpiar(): token → crear proyecto → aplicar receta → exportar → BORRAR el proyecto SIEMPRE.
import type { IntegrationConfig, IntegrationResult } from "../types";
import type { RecetaLimpieza } from "@/lib/datos/receta-limpieza";
import { validarReceta } from "@/lib/datos/receta-limpieza";
export const ENDPOINT_DEFINIDO = "http://127.0.0.1:3333";
const RUTA = "/command/core";
/* Campo del token (GetCSRFTokenCommand de la 3.10). */
const CAMPO_CSRF = "csrf_token";
/** fetch inyectable (pruebas: servidor falso; producción: el global). */
export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>;
/** CSV íntegro + receta de operaciones (se revalida aquí) + formato de exportación opcional. */
export type PeticiónLimpieza = { csv: string; receta: RecetaLimpieza | unknown; formato?: string };
/** Red inyectable y tiempo límite por llamada (por defecto 30 s). */
export type OpcionesOpenRefine = { fetch?: FetchFn; timeoutMs?: number };
/** Solo habla con loopback, salvo que la configuración traiga el token de una pasarela. */
export function hostPermitido(endpoint: string, cfg: IntegrationConfig): boolean {
  try {
    const host = new URL(endpoint).hostname;
    const local = host === "localhost" || host === "::1" || /^127\.(\d{1,3}\.){2}\d{1,3}$/.test(host);
    return local || cfg.extra?.["tokenPasarela"] !== undefined;
  } catch {
    return false;
  }
}
/** Salud: GET get-version. */
export async function health(cfg: IntegrationConfig, opciones?: OpcionesOpenRefine): Promise<IntegrationResult> {
  const base = cfg.endpoint?.trim() || ENDPOINT_DEFINIDO;
  if (!hostPermitido(base, cfg)) return { ok: false, error: "OpenRefine solo se habla por loopback (o vía pasarela con token)." };
  const fetch = opciones?.fetch ?? globalThis.fetch;
  return llamada(fetch, base, `${RUTA}/get-version`, { method: "GET" }, opciones?.timeoutMs ?? 10_000);
}
/** Limpia un CSV aplicando la receta: sesión completa con borrado garantizado. */
export async function limpiar(cfg: IntegrationConfig, entrada: PeticiónLimpieza, opciones?: OpcionesOpenRefine): Promise<IntegrationResult> {
  const base = cfg.endpoint?.trim() || ENDPOINT_DEFINIDO;
  if (!hostPermitido(base, cfg)) return { ok: false, error: "OpenRefine solo se habla por loopback (o vía pasarela con token)." };
  const validacion = validarReceta(entrada.receta);
  if (!validacion.ok) return { ok: false, error: `Receta rechazada: ${validacion.error}` };
  const fetch = opciones?.fetch ?? globalThis.fetch;
  const tiempo = opciones?.timeoutMs ?? 30_000;
  const formato = entrada.formato || "csv";
  const token = await pedirToken(fetch, base, tiempo);
  if (!token.ok) return token;
  const csrf = String((token.data as { token?: unknown }).token ?? "");
  let id: string | null = null;
  let resultado: IntegrationResult = { ok: false, error: "OpenRefine no llegó a crear el proyecto." };
  try {
    const creado = await crearProyecto(fetch, base, csrf, entrada.csv, formato, tiempo);
    if (!creado.ok) return creado;
    id = String((creado.data as { project?: unknown }).project);
    const aplicada = await aplicar(fetch, base, csrf, id, validacion.operaciones, tiempo);
    if (!aplicada.ok) return aplicada;
    const exportado = await exportar(fetch, base, csrf, id, formato, tiempo);
    if (!exportado.ok) return exportado;
    resultado = { ok: true, data: { csv: exportado.data } };
  } finally {
    // El csv no debe quedarse en el servicio: se borra también si algo falló antes.
    if (id !== null) await borrar(fetch, base, csrf, id, tiempo);
  }
  return resultado;
}
function formulario(campos: Record<string, string>): string {
  return Object.entries(campos).map(([c, v]) => `${c}=${encodeURIComponent(v)}`).join("&");
}
async function llamada(fetch: FetchFn, base: string, url: string, init: { method?: string; headers?: Record<string, string>; body?: string }, tiempo: number): Promise<IntegrationResult<Response>> {
  try {
    const res = await fetch(`${base}${url}`, init);
    if (!res.ok) return { ok: false, error: `OpenRefine respondió HTTP ${res.status} en ${url}.` };
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: `No se alcanzó OpenRefine en ${url}: ${e instanceof Error ? e.message : "error"}.` };
  }
}
async function pedirToken(fetch: FetchFn, base: string, tiempo: number): Promise<IntegrationResult<Response>> {
  const res = await llamada(fetch, base, `${RUTA}/get-csrf-token`, { method: "GET" }, tiempo);
  if (!res.ok) return res;
  return { ok: true, data: await res.data!.json() };
}
/* Multipart manual: project-file (csv), project-name, format, options. */
async function crearProyecto(fetch: FetchFn, base: string, csrf: string, csv: string, formato: string, tiempo: number): Promise<IntegrationResult> {
  const f = `starseed-${csrf || "x"}-frontera`;
  const campo = (n: string, v: string) => `--${f}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`;
  const cuerpo = campo("project-name", "starseed-limpieza") + campo("format", formato) + campo("options", "{}")
    + `--${f}\r\nContent-Disposition: form-data; name="project-file"; filename="datos.csv"\r\n`
    + `Content-Type: text/csv\r\n\r\n${csv}\r\n--${f}--\r\n`;
  const res = await llamada(fetch, base, `${RUTA}/create-project-from-upload`, {
    method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${f}` }, body: cuerpo,
  }, tiempo);
  if (!res.ok) return res;
  const datos = (await res.data!.json()) as { status?: string; message?: string; project?: number };
  if (datos.status === "error") return { ok: false, error: datos.message ?? "OpenRefine rechazó la creación." };
  return { ok: true, data: datos };
}
async function aplicar(fetch: FetchFn, base: string, csrf: string, id: string, operaciones: unknown, tiempo: number): Promise<IntegrationResult> {
  const res = await llamada(fetch, base, `${RUTA}/apply-operations?project=${encodeURIComponent(id)}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formulario({ [CAMPO_CSRF]: csrf, operations: JSON.stringify(operaciones) }) + `&project=${encodeURIComponent(id)}`,
  }, tiempo);
  if (!res.ok) return res;
  const datos = (await res.data!.json()) as { code?: string; message?: string };
  if (datos.code === "error") return { ok: false, error: datos.message ?? "OpenRefine rechazó la receta." };
  return { ok: true, data: datos };
}
async function exportar(fetch: FetchFn, base: string, csrf: string, id: string, formato: string, tiempo: number): Promise<IntegrationResult<string>> {
  const res = await llamada(fetch, base, `${RUTA}/export-rows`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formulario({ [CAMPO_CSRF]: csrf, project: id, format: formato, engine: JSON.stringify({ facets: [], mode: "row-based" }) }),
  }, tiempo);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: await res.data!.text() };
}
async function borrar(fetch: FetchFn, base: string, csrf: string, id: string, tiempo: number): Promise<void> {
  await llamada(fetch, base, `${RUTA}/delete-project?project=${encodeURIComponent(id)}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formulario({ [CAMPO_CSRF]: csrf }),
  }, tiempo);
}
