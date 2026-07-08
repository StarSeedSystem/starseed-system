// ════════════════════════════════════════════════════════════════
// Perplexica — buscador IA con fuentes citadas, self-host
// ----------------------------------------------------------------
// NOTA HONESTA (verificado jul-2026): el repo oficial (ItzCrazyKns/
// Perplexica) se ha RENOMBRADO a «Vane» (mismo autor, mismo proyecto,
// github.com/ItzCrazyKns/Vane). Mantenemos el id "perplexica" en el catálogo
// de StarSeed por continuidad con lo ya documentado; label/enlaces apuntan al
// repo actual.
//
// Endpoints (docs oficiales, jul-2026):
//   GET  {endpoint}/api/providers → proveedores/modelos activos en TU
//                                   instancia (los configuras en su propia
//                                   pantalla de setup: OpenAI/Ollama/Groq…).
//   POST {endpoint}/api/search    → pregunta con fuentes citadas.
//     body: { chatModel:{providerId,key}, embeddingModel:{providerId,key},
//             sources:["web"], query, optimizationMode?, stream:false }
//
// `providerId` es un UUID DE TU INSTANCIA (no hay valor universal): este
// conector exige `extra.providerId` (+ opcional `extra.embeddingProviderId`
// si usas proveedores distintos para chat/embedding) y las claves de modelo
// `extra.chatModel` / `extra.embeddingModel` — consíguelas con la acción
// "providers" (GET /api/providers) de tu propia instancia. HONESTO: sin esos
// datos no simulamos una búsqueda, pedimos que se configuren primero (API
// más compleja/menos estable que otros conectores del catálogo, por eso
// queda como endpoint configurable + capacidad en vez de un flujo de un
// solo campo).
// Auth: ninguna por defecto (self-host); si tu instancia está tras un proxy
// con clave, se envía como Bearer cuando hay `apiKey` configurada.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra } from "./_proxy";

function queryOf(input: any): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.query || input.q || input.consulta || input.text || "");
  return "";
}

function sourcesOf(input: any): string[] {
  const raw = input && typeof input === "object" ? input.sources : undefined;
  if (Array.isArray(raw) && raw.length) return raw.map(String);
  return ["web"];
}

/** Acción "providers": proveedores/modelos activos en tu instancia (también sirve de descubrimiento + salud). */
export async function providers(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return proxyFetch({
    id: "perplexica",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "GET",
    path: "/api/providers",
  });
}

/** Acción "search": pregunta con fuentes citadas. Requiere providerId/chatModel/embeddingModel en `extra` (o en el input). */
export async function search(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const query = queryOf(input);
  if (!query) return { ok: false, error: "Indica una consulta (query)." };

  const inputObj = input && typeof input === "object" ? input : {};
  const chatProviderId = String(inputObj.providerId || extra(cfg, "providerId", "chatProviderId", "provider_id") || "");
  const embeddingProviderId = String(inputObj.embeddingProviderId || extra(cfg, "embeddingProviderId") || chatProviderId);
  const chatModel = String(inputObj.chatModel || extra(cfg, "chatModel", "chat_model") || "");
  const embeddingModel = String(inputObj.embeddingModel || extra(cfg, "embeddingModel", "embedding_model") || "");

  if (!chatProviderId || !chatModel || !embeddingProviderId || !embeddingModel) {
    return {
      ok: false,
      error:
        "Configura extra.providerId, extra.chatModel y extra.embeddingModel de tu instancia de Perplexica/Vane (usa la acción «providers» — GET /api/providers — para ver los tuyos).",
    };
  }

  const res = await proxyFetch({
    id: "perplexica",
    endpoint: cfg.endpoint!,
    apiKey: cfg.apiKey,
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: "/api/search",
    body: {
      chatModel: { providerId: chatProviderId, key: chatModel },
      embeddingModel: { providerId: embeddingProviderId, key: embeddingModel },
      sources: sourcesOf(input),
      optimizationMode: extra(cfg, "optimizationMode") || "balanced",
      query,
      stream: false,
    },
  });
  if (!res.ok) return res;
  const fuentes = Array.isArray(res.data?.sources)
    ? res.data.sources.slice(0, 8).map((s: any) => ({ titulo: s?.metadata?.title, url: s?.metadata?.url }))
    : [];
  return { ok: true, data: { text: String(res.data?.message ?? ""), fuentes, raw: res.data } };
}

/** Salud: mismos proveedores/modelos (ligero; confirma endpoint). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return providers(cfg);
}
