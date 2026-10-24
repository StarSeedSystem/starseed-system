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

// ────────────────────────────────────────────────────────────────
// Operaciones PDF con detección honesta.
// Verificado el 2026-10-20 en la instancia del A1 (Stirling-PDF 3.2.0,
// 319 rutas en /v1/api-docs; rotar un PDF de 2 páginas, 0,29 s). Aun así
// cada operación se ofrece SOLO si la api-docs de la instancia la tiene.
// ────────────────────────────────────────────────────────────────

export interface OperacionPdf {
  id: string;
  label: string;
  description: string;
  path: string;
  campos: string[];
  accept?: "binary" | "json";
  multiple?: boolean;
  porDefecto?: Record<string, string>;
}

export const OPERACIONES_PDF: OperacionPdf[] = [
  // Las que ya existían en este cliente, también a catálogo.
  { id: "merge", label: "Fusionar", description: "Une dos o más PDFs en un solo documento.", path: "/api/v1/general/merge-pdfs", campos: [], multiple: true },
  { id: "to-image", label: "A imagen", description: "Convierte el PDF en imágenes (formato, dpi y color elegibles).", path: "/api/v1/convert/pdf/img", campos: ["imageFormat", "singleOrMultiple", "colorType", "dpi"], porDefecto: { imageFormat: "png", singleOrMultiple: "multiple", colorType: "color", dpi: "150" } },
  { id: "extract-text", label: "Extraer texto", description: "Extrae el texto del PDF (si la instancia lo permite).", path: "/api/v1/convert/pdf/text", campos: [], accept: "json" },
  // Nuevas (7), verificadas en la instancia del A1 el 2026-10-20.
  { id: "rotar", label: "Rotar", description: "Rota todas las páginas del PDF.", path: "/api/v1/general/rotate-pdf", campos: ["angle"], porDefecto: { angle: "90" } },
  { id: "dividir", label: "Dividir", description: "Divide el PDF por números de página.", path: "/api/v1/general/split-pages", campos: ["pageNumbers"] },
  { id: "quitar-paginas", label: "Quitar páginas", description: "Elimina las páginas indicadas del PDF.", path: "/api/v1/general/remove-pages", campos: ["pageNumbers"] },
  { id: "reordenar", label: "Reordenar", description: "Reordena las páginas con el orden indicado.", path: "/api/v1/general/rearrange-pages", campos: ["pageOrder"] },
  { id: "comprimir", label: "Comprimir", description: "Reduce el tamaño del PDF según el nivel de optimización.", path: "/api/v1/misc/compress-pdf", campos: ["optimizeLevel"] },
  { id: "ocr", label: "OCR", description: "Reconoce texto en las páginas del PDF.", path: "/api/v1/misc/ocr-pdf", campos: ["languages"] },
  { id: "marca-agua", label: "Marca de agua", description: "Añade una marca de agua (texto o imagen) al PDF.", path: "/api/v1/security/add-watermark", campos: ["watermarkType", "watermarkText"], porDefecto: { watermarkType: "text" } },
];

/** Extrae de forma defensiva la lista de rutas de un JSON de api-docs (OpenAPI). */
export function rutasDeApiDocs(doc: unknown): string[] {
  let raiz: unknown = doc;
  if (raiz && typeof raiz === "object" && "data" in (raiz as Record<string, unknown>)) {
    const dentro = (raiz as Record<string, unknown>).data;
    if (dentro && typeof dentro === "object" && "paths" in (dentro as Record<string, unknown>)) raiz = dentro;
  }
  const paths = raiz && typeof raiz === "object" ? (raiz as Record<string, unknown>).paths : undefined;
  if (!paths || typeof paths !== "object") return [];
  return Object.keys(paths as Record<string, unknown>).sort();
}

/** Filtra el catálogo a las operaciones cuya ruta existe de verdad en la instancia. */
export function disponiblesDeRutas(rutas: readonly string[]): OperacionPdf[] {
  const set = new Set(rutas);
  return OPERACIONES_PDF.filter((op) => set.has(op.path));
}

/** Lee la api-docs de la instancia y devuelve solo las operaciones que tiene. */
export async function operacionesDisponibles(
  cfg: IntegrationConfig,
): Promise<IntegrationResult<{ total: number; operaciones: OperacionPdf[] }>> {
  if (!isClient()) return { ok: false, error: "Disponible solo en el navegador." };
  if (!cleanEndpoint(cfg.endpoint)) return { ok: false, error: "Sin endpoint configurado." };
  const { proxyFetch } = await import("./_proxy");
  const res = await proxyFetch({
    id: "stirling-pdf",
    endpoint: cleanEndpoint(cfg.endpoint),
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "x-api-key" : "none",
    method: "GET",
    path: "/v1/api-docs",
    timeoutMs: 12_000,
  });
  if (!res.ok) return { ok: false, error: res.error || "No pude leer la descripción de API de la instancia." };
  const rutas = rutasDeApiDocs(res.data);
  const operaciones = disponiblesDeRutas(rutas);
  return { ok: true, data: { total: rutas.length, operaciones } };
}

/** Valor final de un campo: el parámetro que aporta quien lanza, o el defecto del catálogo. */
function valorDeCampo(op: OperacionPdf, campo: string, parametros: Record<string, unknown>): string | null {
  const dado = parametros[campo] ?? (op.porDefecto as Record<string, unknown> | undefined)?.[campo];
  if (dado === undefined || dado === null || typeof dado === "object") return null;
  return String(dado).trim();
}

/** Ejecuta una operación del catálogo sobre un PDF, vía el proxy multipart. */
export async function ejecutarOperacion(
  cfg: IntegrationConfig,
  id: string,
  archivos: FileLike | readonly FileLike[] | Record<string, unknown> | null | undefined,
  parametros: Record<string, unknown> = {},
): Promise<IntegrationResult> {
  if (!isClient()) return { ok: false, error: "Disponible solo en el navegador." };
  const op = OPERACIONES_PDF.find((o) => o.id === id);
  if (!op) return { ok: false, error: `Operación desconocida: ${id}.` };
  const srcs = filesOf(archivos);
  if (srcs.length === 0) return { ok: false, error: "Aporta un PDF para esta operación." };
  if (!op.multiple && srcs.length > 1) {
    return { ok: false, error: "Esta operación admite un único PDF." };
  }

  const form = new FormData();
  form.append("__endpoint", cleanEndpoint(cfg.endpoint));
  form.append("__path", op.path);
  if (cfg.apiKey) form.append("__apiKey", cfg.apiKey);
  form.append("__accept", op.accept === "json" ? "json" : "binary");
  let n = 0;
  for (const src of srcs) {
    const blob = await toBlob(src);
    if (!blob) return { ok: false, error: "No pude leer uno de los PDFs (¿URL con CORS?)." };
    form.append("fileInput", blob, `doc-${++n}.pdf`);
  }
  for (const campo of op.campos) {
    const valor = valorDeCampo(op, campo, parametros);
    if (valor !== null && valor !== "") form.append(campo, valor);
  }
  return proxyUpload(form);
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
