// Cliente PDF REAL (PDF1020B) — la red del panel «Editar PDF», aparte del componente.
// Limpio de `node:*` (lo importa un componente de cliente) y sin lógica de UI. Orden del
// endpoint: prop `cfg` → Conectores (config del conector) → malla (bolsa de recursos).

import {
  MENSAJE_SIN_SERVIDOR,
  MENSAJE_DESCRIPCION_INDISPONIBLE,
  RUTA_API_DESCRIPCION,
  camposFormularioPdf,
  operacionesDesdeDescripcion,
  type ArchivoPdf,
  type ClientePdf,
  type ConfigStirlingPdf,
  type OperacionPdf,
  type ResOperacion,
  type ValoresPdf,
} from "@/lib/pdf/operaciones-pdf";
import { proxyFetch, proxyUpload } from "@/lib/integrations/clients/_proxy";

export function clientePdfReal(): ClientePdf {
  return {
    preparar: async (cfg) => {
      const endpoint = await endpointEfectivo(cfg);
      if (!endpoint) return { ok: false, error: "sin-servidor" };
      const res = await proxyFetch({
        id: "stirling-pdf", endpoint, apiKey: cfg.apiKey, auth: cfg.apiKey ? "x-api-key" : "none",
        method: "GET", path: RUTA_API_DESCRIPCION, timeoutMs: 10_000,
      });
      const { disponibles, leida } = operacionesDesdeDescripcion(res.ok ? res.data : null);
      return { ok: true, endpoint, operaciones: disponibles, aviso: leida ? "" : MENSAJE_DESCRIPCION_INDISPONIBLE };
    },
    ejecutar: async (op, archivo, valores, cfg) => await ejecutarReal(op, archivo, valores, cfg),
  };
}

/** endpoint: prop `cfg` → Conectores (config del conector) → malla (bolsa de recursos). */
async function endpointEfectivo(cfg: ConfigStirlingPdf): Promise<string | null> {
  if (cfg.endpoint?.trim()) return cfg.endpoint.trim();
  try {
    const { loadIntegrationConfig } = await import("@/lib/integrations/registry");
    const conectado = (loadIntegrationConfig("stirling-pdf").endpoint ?? "").trim();
    if (conectado) return conectado;
    const { resolverEndpointServicio } = await import("@/lib/integrations/run");
    return resolverEndpointServicio("stirling-pdf", [], { cuentaId: "" }).endpoint;
  } catch {
    return null;
  }
}

async function ejecutarReal(op: OperacionPdf, archivo: ArchivoPdf, valores: ValoresPdf, cfg: ConfigStirlingPdf): Promise<ResOperacion> {
  const endpoint = await endpointEfectivo(cfg);
  if (!endpoint) return { ok: false, error: MENSAJE_SIN_SERVIDOR };
  if (!archivo.url) return { ok: false, error: "El PDF no tiene URL: no puedo enviarlo al servidor." };
  let entrada: Blob | null = null;
  try {
    const r = await fetch(String(archivo.url));
    entrada = r.ok ? await r.blob() : null;
  } catch { entrada = null; }
  if (!entrada) return { ok: false, error: "No pude leer el PDF original (¿la URL bloquea la descarga?)." };
  const form = new FormData();
  form.append("__endpoint", endpoint);
  form.append("__path", op.ruta);
  form.append("__accept", "binary");
  form.append("fileInput", entrada, archivo.nombre?.trim() || "documento.pdf");
  for (const [campo, valor] of camposFormularioPdf(op, valores)) form.append(campo, valor);
  const res = await proxyUpload(form);
  const datos = (res.data ?? {}) as { base64?: string; contentType?: string };
  if (!res.ok || !datos.base64) return { ok: false, error: res.error || "El servidor no devolvió un PDF legible." };
  const bytes = Uint8Array.from(atob(datos.base64), (c) => c.charCodeAt(0));
  const tipo = datos.contentType || "application/pdf";
  return { ok: true, blob: new Blob([bytes], { type: tipo }), contentType: tipo };
}
