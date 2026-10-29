// ════════════════════════════════════════════════════════════════
// ScrapeGraphAI — cliente del extractor LOCAL (INV1025C)
// ----------------------------------------------------------------
// El servicio local (típico http://127.0.0.1:8793) corre ScrapeGraphAI
// con telemetría apagada (R9) y SOLO acepta url o HTML ya leído con
// cortesía (R4): el extractor nunca toca la red por su cuenta.
//   • POST /extraer { url? | html?, prompt, esquema? } → datos
//   • GET  /salud                                     → latido
// Auth: Bearer SOLO si hay clave; viaja solo servidor (R3).
// Contrato: architecture/repos-libreria-1025.md §3.2 (grupo investigación).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch } from "./_proxy";

export interface EntradaExtraccion {
  /** URL pública http/https de la página (exclusiva con `html`). */
  url?: string;
  /** HTML ya leído con cortesía (≤ 400 KB). */
  html?: string;
  /** Qué extraer, en lenguaje natural (1–1000 caracteres). */
  prompt: string;
  /** Esquema JSON (objeto) que deben cumplir los datos. */
  esquema?: unknown;
}

const HTML_TOPE = 400_000; // caracteres ≈ 400 KB
const MENSAJE_NO_PERMITIDO = "el sitio no permite esta lectura";

/** Llamada al servicio por el proxy, con Bearer solo si hay clave. */
function llamada(cfg: IntegrationConfig, method: "GET" | "POST", path: string, body?: unknown): Parameters<typeof proxyFetch>[0] {
  return {
    id: "scrapegraph",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method,
    path,
    body,
  };
}

/** ¿URL pública http/https? Rechaza relativas, file:// e internas (R1). */
export function esUrlPublica(valor: string): boolean {
  let u: URL | null = null;
  try {
    u = new URL(valor);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "" || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return false;
  if (h === "::1" || h.startsWith("127.") || h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return false;
  const tercera = h.match(/^172\.(\d+)\./);
  if (tercera && Number(tercera[1]) >= 16 && Number(tercera[1]) <= 31) return false;
  return h.includes(".");
}

/** Valida la entrada. Devuelve null si es válida o el mensaje de error. */
export function validarEntrada(input: EntradaExtraccion): string | null {
  const tieneUrl = typeof input?.url === "string" && input.url.trim() !== "";
  const html = typeof input?.html === "string" ? input.html : "";
  if (!tieneUrl && !html) return "Indica la URL o el HTML de la página a extraer.";
  if (tieneUrl && html) return "Indica o la URL o el HTML, no los dos a la vez.";
  if (tieneUrl && !esUrlPublica(input.url!.trim())) return "Solo se extrae de URLs públicas http/https.";
  if (html.length > HTML_TOPE) return "El HTML pasa del tope de 400 KB.";
  const prompt = typeof input?.prompt === "string" ? input.prompt : "";
  if (prompt.length < 1) return "Escribe qué extraer (1–1000 caracteres).";
  if (prompt.length > 1000) return "El prompt no puede pasar de 1000 caracteres.";
  const es = input?.esquema;
  if (es != null && (typeof es !== "object" || Array.isArray(es))) {
    return "El esquema debe ser un objeto JSON.";
  }
  return null;
}

/** Error del servicio → mensaje humano sin trazas, rutas ni host. */
export function mensajeHumano(error?: string): string {
  const t = (error || "").toLowerCase();
  if (t.includes("401") || t.includes("unauthorized")) return "Clave incorrecta o ausente: el extractor local rechazó la petición.";
  if (t.includes("tiempo de espera")) return "El extractor local tardó demasiado en responder.";
  if (t.includes("fallo de red") || t.includes("econnrefused") || t.includes("respuesta inválida")) {
    return "No se pudo conectar con el extractor local (¿está arrancado?).";
  }
  return error && error.trim() ? error.trim() : "El extractor local no pudo procesar la petición.";
}

/** Acción "extraer": url|html + prompt (+ esquema) → datos estructurados. */
export async function extraer(cfg: IntegrationConfig, input: EntradaExtraccion): Promise<IntegrationResult> {
  const fallo = validarEntrada(input);
  if (fallo) return { ok: false, error: fallo };
  const body: Record<string, unknown> = { prompt: input.prompt };
  if (input.url?.trim()) body.url = input.url.trim();
  if (input.html) body.html = input.html;
  if (input.esquema != null) body.esquema = input.esquema;
  const res = await proxyFetch(llamada(cfg, "POST", "/extraer", body));
  if (!res.ok) {
    const data = (res.data && typeof res.data === "object" ? res.data : {}) as Record<string, unknown>;
    const motivo = typeof data.motivo === "string" ? data.motivo.toLowerCase() : "";
    if (motivo === "robots" || motivo === "noai" || /robots|noai/i.test(res.error || "")) {
      // Resultado correcto: la lectura cortés lo bloquea, no es un fallo.
      return { ok: true, data: { datos: null, aviso: MENSAJE_NO_PERMITIDO } };
    }
    return { ok: false, error: mensajeHumano(res.error) };
  }
  const obj = (res.data && typeof res.data === "object" ? res.data : {}) as Record<string, unknown>;
  const d = (obj.data && typeof obj.data === "object" ? obj.data : obj) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      datos: d.datos ?? null,
      fuente: typeof d.fuente === "string" ? d.fuente : "",
      bytes: typeof d.bytes === "number" ? d.bytes : 0,
    },
  };}

/** Salud: latido del servicio local (GET /salud). */
export function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch(llamada(cfg, "GET", "/salud"));
}
