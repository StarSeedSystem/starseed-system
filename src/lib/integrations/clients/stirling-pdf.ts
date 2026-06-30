// ════════════════════════════════════════════════════════════════
// Stirling-PDF — caja de herramientas PDF self-host
// ----------------------------------------------------------------
// Endpoints (multipart/form-data, campo de fichero = "fileInput"):
//   • POST /api/v1/general/merge-pdfs   (varios fileInput) → PDF
//   • POST /api/v1/convert/pdf/img      (fileInput + imageFormat…) → imagen/zip
//   • Texto: Stirling expone extracción; usamos /api/v1/convert/pdf/text
//     si está disponible (instancias recientes) o devolvemos honesto.
// Auth: X-API-KEY <key> (opcional). Verificado vía docs.stirlingpdf.com.
//
// Las llamadas pasan por el proxy multipart (/api/integrations/upload),
// que conserva el binario y devuelve { base64, contentType, filename }.
// Entrada admitida (defensiva): File/Blob, dataURL/base64, o URL http(s).
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyUpload, cleanEndpoint } from "./_proxy";

type FileLike = File | Blob | string; // string = URL http(s) o base64/dataURL

function isClient(): boolean {
  return typeof window !== "undefined";
}

/** Convierte una entrada heterogénea en un Blob (en navegador). */
async function toBlob(src: FileLike, fallbackType = "application/pdf"): Promise<Blob | null> {
  try {
    if (typeof Blob !== "undefined" && src instanceof Blob) return src;
    if (typeof src === "string") {
      const s = src.trim();
      if (/^https?:\/\//i.test(s)) {
        // Descarga la URL (el navegador puede; si hay CORS, fallará y lo reportamos).
        const r = await fetch(s);
        if (!r.ok) return null;
        return await r.blob();
      }
      // dataURL o base64 puro.
      let b64 = s;
      let type = fallbackType;
      const m = s.match(/^data:([^;]+);base64,(.*)$/i);
      if (m) { type = m[1]; b64 = m[2]; }
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type });
    }
  } catch { /* noop */ }
  return null;
}

function filesOf(input: any): FileLike[] {
  if (!input) return [];
  if (typeof input === "string") return [input];
  if (Array.isArray(input)) return input as FileLike[];
  if (typeof Blob !== "undefined" && input instanceof Blob) return [input];
  if (typeof input === "object") {
    if (Array.isArray(input.files)) return input.files as FileLike[];
    if (input.file) return [input.file as FileLike];
    if (input.url) return [String(input.url)];
  }
  return [];
}

/** Acción "merge": fusiona 2+ PDFs en uno. Devuelve base64 del PDF. */
export async function merge(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  if (!isClient()) return { ok: false, error: "Disponible solo en el navegador." };
  const srcs = filesOf(input);
  if (srcs.length < 2) return { ok: false, error: "Aporta al menos dos PDFs para fusionar." };

  const form = new FormData();
  form.append("__endpoint", cleanEndpoint(cfg.endpoint));
  form.append("__path", "/api/v1/general/merge-pdfs");
  if (cfg.apiKey) form.append("__apiKey", cfg.apiKey);
  form.append("__accept", "binary");

  let n = 0;
  for (const src of srcs) {
    const blob = await toBlob(src);
    if (!blob) return { ok: false, error: "No pude leer uno de los PDFs (¿URL con CORS?)." };
    form.append("fileInput", blob, `doc-${++n}.pdf`);
  }
  return proxyUpload(form);
}

/** Acción "to-image": convierte un PDF en imagen(es). Devuelve base64. */
export async function toImage(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  if (!isClient()) return { ok: false, error: "Disponible solo en el navegador." };
  const srcs = filesOf(input);
  if (srcs.length === 0) return { ok: false, error: "Aporta un PDF para convertir a imagen." };
  const blob = await toBlob(srcs[0]);
  if (!blob) return { ok: false, error: "No pude leer el PDF." };

  const form = new FormData();
  form.append("__endpoint", cleanEndpoint(cfg.endpoint));
  form.append("__path", "/api/v1/convert/pdf/img");
  if (cfg.apiKey) form.append("__apiKey", cfg.apiKey);
  form.append("__accept", "binary");
  form.append("fileInput", blob, "doc.pdf");
  form.append("imageFormat", (input?.imageFormat as string) || "png");
  form.append("singleOrMultiple", (input?.singleOrMultiple as string) || "multiple");
  form.append("colorType", (input?.colorType as string) || "color");
  form.append("dpi", String(input?.dpi || 150));
  return proxyUpload(form);
}

/** Acción "extract-text": extrae texto del PDF (instancias con convert/pdf/text). */
export async function extractText(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  if (!isClient()) return { ok: false, error: "Disponible solo en el navegador." };
  const srcs = filesOf(input);
  if (srcs.length === 0) return { ok: false, error: "Aporta un PDF para extraer texto." };
  const blob = await toBlob(srcs[0]);
  if (!blob) return { ok: false, error: "No pude leer el PDF." };

  const form = new FormData();
  form.append("__endpoint", cleanEndpoint(cfg.endpoint));
  form.append("__path", "/api/v1/convert/pdf/text");
  if (cfg.apiKey) form.append("__apiKey", cfg.apiKey);
  form.append("__accept", "json");
  form.append("fileInput", blob, "doc.pdf");
  const res = await proxyUpload(form);
  if (!res.ok) {
    return { ok: false, error: res.error || "Esta instancia de Stirling-PDF no expone extracción de texto." };
  }
  return res;
}

/** Salud: info de la API (endpoint público de Stirling). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  // Reusa el proxy JSON para un GET sencillo a la raíz de la API.
  const { proxyFetch } = await import("./_proxy");
  return proxyFetch({
    id: "stirling-pdf",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "x-api-key" : "none",
    method: "GET",
    path: "/api/v1/info/status",
    timeoutMs: 10_000,
  });
}
