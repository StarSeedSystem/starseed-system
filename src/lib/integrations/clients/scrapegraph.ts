// ScrapeGraphAI — cliente TS del extractor local (INV1025D).
// Servicio de INV1025C en 127.0.0.1:8793: POST /extraer {url|html, prompt,
// esquema?} y GET /salud. La librería Python no mira robots.txt (R4): nunca
// le pedimos que toque la red con sigilo — entra el HTML ya leído con
// cortesía (recibo `html`, ≤ 400 KB) o una URL que `lector_cortes` leerá
// respetando robots y `noai`. Si el sitio no lo permite el servicio responde
// motivo:"robots"|"noai" y esto es un resultado correcto, no un fallo.
// R3: la clave solo viaja al proxy de integraciones (lado servidor).

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch } from "./_proxy";

/** Tope de HTML ya leído que se acepta como entrada. */
export const MAX_HTML_BYTES = 400 * 1024;
/** Tope de la instrucción (prompt) hacia el extractor. */
export const MAX_PROMPT = 1000;

/** Lo que el llamador entrega: instrucción + un único origen. */
export type EntradaExtraer = { url?: string; html?: string; prompt: string; esquema?: unknown };

type CuerpoExtraer = { url?: string; html?: string; prompt: string; esquema?: Record<string, unknown> };

/** True si el host es loopback, LAN, link-local o nombre interno: no se lee. */
export function urlEsInterna(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true;
  if (h.includes(":")) return h === "::1" || /^fe[89ab]|^f[cd]/.test(h);
  return false;
}

/** Valida la entrada y arma el cuerpo del POST; nunca toca la red. */
export function validarEntrada(input: unknown): { ok: true; cuerpo: CuerpoExtraer; fuente: string } | { ok: false; error: string } {
  const e = (typeof input === "object" && input !== null ? input : {}) as EntradaExtraer;
  const prompt = typeof e.prompt === "string" ? e.prompt.trim() : "";
  if (!prompt) return { ok: false, error: "Falta la instrucción (prompt) para el extractor." };
  if (prompt.length > MAX_PROMPT) return { ok: false, error: "La instrucción supera 1.000 caracteres; acórtala." };
  const html = typeof e.html === "string" ? e.html : "";
  const urlTxt = typeof e.url === "string" ? e.url.trim() : "";
  if (!html && !urlTxt) return { ok: false, error: "Falta el origen: una URL pública o el HTML ya leído." };
  if (e.esquema != null && (typeof e.esquema !== "object" || Array.isArray(e.esquema))) {
    return { ok: false, error: "El esquema debe ser un objeto JSON." };
  }
  const cuerpo: CuerpoExtraer = { prompt };
  if (e.esquema && typeof e.esquema === "object") cuerpo.esquema = e.esquema as Record<string, unknown>;
  if (urlTxt) {
    let url: URL;
    try {
      url = new URL(urlTxt);
    } catch {
      return { ok: false, error: "La URL no es válida." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Solo se aceptan URLs http o https." };
    }
    if (urlEsInterna(url.hostname)) {
      return { ok: false, error: "La URL apunta a una dirección interna y no se permite leerla." };
    }
    return { ok: true, cuerpo: { ...cuerpo, url: url.toString() }, fuente: urlTxt };
  }
  if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
    return { ok: false, error: "El HTML supera el límite de 400 KB permitido." };
  }
  return { ok: true, cuerpo: { ...cuerpo, html }, fuente: "html" };
}

/** Acción «extraer»: instrucción + un único origen, vía el proxy. */
export async function extraer(cfg: IntegrationConfig, input: unknown): Promise<IntegrationResult> {
  const val = validarEntrada(input);
  if (!val.ok) return { ok: false, error: val.error };
  const res = await proxyFetch({
    id: "scrapegraph",
    endpoint: cfg.endpoint ?? "",
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/extraer",
    body: val.cuerpo,
  });
  return respuestaDelServicio(res, val.fuente);
}

/** Normaliza lo que el proxy trajo del servicio a {datos, fuente, bytes}. */
function respuestaDelServicio(res: IntegrationResult, fuente: string): IntegrationResult {
  const cuerpo = res.data != null && typeof res.data === "object" ? (res.data as Record<string, unknown>) : null;
  const motivo = typeof cuerpo?.motivo === "string" ? cuerpo.motivo : "";
  if (motivo === "robots" || motivo === "noai") {
    // Resultado correcto: la lectura cortés fue rechazada por el propio sitio.
    return { ok: true, data: { datos: null, fuente, bytes: 0, motivo, aviso: "el sitio no permite esta lectura" } };
  }
  if (!res.ok || cuerpo?.ok === false) return { ok: false, error: mensajeDeError(cuerpo, res.error) };
  const datos: unknown = cuerpo ? (cuerpo.dato ?? cuerpo.datos ?? cuerpo.data) : null;
  if (datos == null) return { ok: false, error: "El extractor respondió sin datos." };
  let bytes = 0;
  try { bytes = JSON.stringify(datos).length; } catch { bytes = 0; }
  return { ok: true, data: { datos, fuente, bytes } };
}

/** Error del servicio en español, sin trazas ni rutas del sistema. */
function mensajeDeError(cuerpo: Record<string, unknown> | null, errorProx: string | undefined): string {
  const delServicio = typeof cuerpo?.error === "string" ? cuerpo.error.trim() : "";
  if (/token|bearer/i.test(delServicio)) return "El extractor no aceptó la clave de acceso; revísala en la configuración.";
  const limpio = delServicio.slice(0, 200);
  if (limpio) return limpio;
  return errorProx || "El extractor local no respondió correctamente.";
}

/** Salud del servicio local: GET /salud por el proxy. */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "scrapegraph",
    endpoint: cfg.endpoint ?? "",
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/salud",
  });
}
