// ════════════════════════════════════════════════════════════════
// ScrapeGraphAI — cliente TS del extractor local de INV1025C (127.0.0.1:8793:
// POST /extraer, GET /salud). La página se lee antes con cortesía: aquí solo
// entra HTML ya leído, el extractor no toca la red (R4/R6). Sin claves de
// modelo (viven en el servicio, R3); errores en español, sin trazas ni rutas.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch } from "./_proxy";

export const LIMITE_HTML = 400 * 1024; // tope de HTML aceptado por el servicio
export const PROMPT_MAXIMO = 1000; // instrucción de extracción: 1–1000 caracteres
/** Entrada del extractor: una URL pública o un HTML ya leído, más la instrucción. */
export interface EntradaExtraccion {
  url?: string;
  html?: string;
  prompt: string;
  esquema?: Record<string, unknown>;
}
/** ¿Es una URL pública (http/https de internet, sin redes internas)? */
export function esUrlPublica(valor: string): boolean {
  let u: URL;
  try { u = new URL(valor); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host === "0.0.0.0" || /\.(local|internal|lan|intranet|home)$/.test(host)) return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octetos = ipv4.slice(1).map(Number);
    const [a, b] = octetos;
    const privada = octetos.some((n) => n > 255) || a === 10 || a === 127 || a === 169
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    if (privada) return false;
  }
  if (host.includes(":") && (host === "::1" || /^(fc|fd|fe80)/.test(host))) return false;
  return host.includes(".");
}

/** Mensaje de error de la entrada en español, o "" si es válida. */
export function validarEntrada(entrada: EntradaExtraccion): string {
  const url = typeof entrada?.url === "string" ? entrada.url.trim() : "";
  const html = typeof entrada?.html === "string" ? entrada.html : "";
  const prompt = typeof entrada?.prompt === "string" ? entrada.prompt.trim() : "";
  const esquema = entrada?.esquema;
  if (!url && !html) return "Indica una URL o un HTML ya leído: extraer necesita una fuente.";
  if (url && html) return "Usa una sola fuente: URL o HTML, no ambas.";
  if (url && !esUrlPublica(url)) return "La URL debe ser pública (http/https de internet); no se extrae de redes internas.";
  if (html && html.length > LIMITE_HTML) return "El HTML es demasiado grande (tope de 400 KB). Usa el lector cortés y entrégale un recorte.";
  if (!prompt) return "Escribe la instrucción de extracción (de 1 a 1000 caracteres).";
  if (prompt.length > PROMPT_MAXIMO) return "La instrucción de extracción supera los 1000 caracteres.";
  if (esquema !== undefined && (typeof esquema !== "object" || esquema === null || Array.isArray(esquema))) return "El esquema debe ser un objeto JSON (por ejemplo { \"titulo\": \"string\" }).";
  return "";
}

/** Limpia un error del servicio: sin trazas, rutas ni direcciones internas. */
export function errorAmable(mensaje: string): string {
  const texto = String(mensaje || "");
  if (/\b(401|403)\b/.test(texto)) return "El extractor local rechazó la clave del servicio.";
  if (/fallo de red|no se pudo contactar/i.test(texto)) return "No se pudo contactar el extractor local. Comprueba que el servicio esté arrancado en esta máquina.";
  const limpio = texto.replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/gi, "el servicio local")
    .replace(/(?:[A-Za-z]:\\|\/)[\w.\-\\]+(?:[\\/][\w.\-\\]+)+/g, "…").slice(0, 200).trim();
  return limpio || "El extractor local devolvió un error desconocido.";
}

/** Envuelve la respuesta del servicio (el nivel superior manda sobre el anidado). */
function cuerpoDe(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const j = json as Record<string, unknown>;
  const anidado = j.data && typeof j.data === "object" && !Array.isArray(j.data) ? (j.data as Record<string, unknown>) : {};
  return { ...anidado, ...j };
}

/** Detecta robots/noai en la respuesta: es cortesía del sitio, no un fallo. */
function motivoCortesia(res: IntegrationResult): "robots" | "noai" | null {
  const c = res.data as Record<string, unknown> | undefined;
  const campo = c && !Array.isArray(c) ? c.motivo : undefined;
  if (typeof campo === "string") {
    const s = campo.toLowerCase();
    return s.includes("noai") || s.includes("no-ai") ? "noai" : s.includes("robots") ? "robots" : null;
  }
  let texto = "";
  try { texto = `${res.error || ""} ${JSON.stringify(res.data ?? "")}`; } catch { texto = res.error || ""; }
  return /noai|no-ai/i.test(texto) ? "noai" : /robots/i.test(texto) ? "robots" : null;
}
function mapearResultado(res: IntegrationResult): IntegrationResult {
  if (!res.ok) {
    const cortesia = motivoCortesia(res);
    if (cortesia) return { ok: true, data: { datos: null, motivo: cortesia } };
    return { ok: false, error: res.error ? errorAmable(res.error) : "El extractor local devolvió un error desconocido." };
  }
  const c = cuerpoDe(res.data);
  const bytes = Number(c.bytes);
  const datos = c.datos !== undefined ? c.datos : c.data !== undefined ? c.data : null;
  const data: Record<string, unknown> = { datos, fuente: typeof c.fuente === "string" ? c.fuente : undefined, bytes: Number.isFinite(bytes) ? bytes : 0 };
  if (c.motivo === "robots" || c.motivo === "noai") data.motivo = c.motivo;
  return { ok: true, data };
}

const SIN_ENDPOINT = "Configura la dirección del extractor local (por defecto 127.0.0.1:8793, INV1025C).";
function llamadaDe(cfg: IntegrationConfig, metodo: "GET" | "POST", path: string, body?: unknown): Promise<IntegrationResult> {
  const endpoint = (cfg?.endpoint || "").trim().replace(/\/+$/, "");
  if (!endpoint) return Promise.resolve({ ok: false, error: SIN_ENDPOINT });
  return proxyFetch({ id: "scrapegraph", endpoint, apiKey: cfg.apiKey, auth: cfg.apiKey ? "bearer" : "none", method: metodo, path, body });
}

/** Extrae datos estructurados con el extractor local (POST /extraer); nunca lanza. */
export async function extraer(cfg: IntegrationConfig, entrada: EntradaExtraccion): Promise<IntegrationResult> {
  const invalidez = validarEntrada(entrada);
  if (invalidez) return { ok: false, error: invalidez };
  const cuerpo: Record<string, unknown> = { prompt: entrada.prompt.trim() };
  if (entrada.url) cuerpo.url = entrada.url.trim();
  else cuerpo.html = entrada.html;
  if (entrada.esquema !== undefined) cuerpo.esquema = entrada.esquema;
  return llamadaDe(cfg, "POST", "/extraer", cuerpo).then(mapearResultado);
}

/** Salud del servicio local: GET /salud con el mismo Bearer opcional. */
export function salud(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return llamadaDe(cfg, "GET", "/salud");
}
