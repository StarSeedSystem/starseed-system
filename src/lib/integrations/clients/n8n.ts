// ════════════════════════════════════════════════════════════════
// n8n — automatización de workflows (disparo por webhook)
// ----------------------------------------------------------------
// La forma robusta de invocar n8n desde fuera es un nodo "Webhook":
//   POST {endpoint}/webhook/<path>      (producción)
//   POST {endpoint}/webhook-test/<path> (modo test)
// El usuario configura su URL de webhook completa como `endpoint`, o el
// host como `endpoint` + la ruta del webhook en `extra.webhookPath`.
// El cuerpo se reenvía tal cual al workflow. La autenticación, si la hay,
// suele ir como cabecera personalizada (extra.headerName/headerValue) o
// como query/token según cómo el usuario configure el nodo Webhook.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, cleanEndpoint, extra } from "./_proxy";

/**
 * Resuelve a dónde apuntar:
 *  - Si el endpoint YA contiene "/webhook" lo usamos como URL completa.
 *  - Si no, concatenamos /webhook/<extra.webhookPath>.
 */
function resolveTarget(cfg: IntegrationConfig): { base: string; path?: string } | null {
  const ep = cleanEndpoint(cfg.endpoint);
  if (!ep) return null;
  if (/\/webhook(-test)?\//i.test(ep) || /\/webhook(-test)?$/i.test(ep)) {
    return { base: ep }; // URL de webhook completa
  }
  const wp = extra(cfg, "webhookPath", "path", "webhook");
  if (!wp) return { base: ep, path: "/webhook" }; // mejor esfuerzo
  return { base: ep, path: `/webhook/${wp.replace(/^\/+/, "")}` };
}

/** Acción "trigger": dispara el workflow vía webhook con un payload. */
export async function trigger(cfg: IntegrationConfig, input: any): Promise<IntegrationResult> {
  const t = resolveTarget(cfg);
  if (!t) return { ok: false, error: "Configura la URL del webhook de n8n." };

  const headers: Record<string, string> = {};
  const hn = extra(cfg, "headerName");
  const hv = extra(cfg, "headerValue");
  if (hn && hv) headers[hn] = hv;

  const body = (input && typeof input === "object") ? input : { data: input };

  return proxyFetch({
    id: "n8n",
    endpoint: t.base,
    apiKey: cfg.apiKey,
    // n8n acepta el token de webhook como header personalizado; por defecto Bearer si hay apiKey.
    auth: cfg.apiKey ? "bearer" : "none",
    method: "POST",
    path: t.path,
    headers,
    body,
  });
}

/** Salud: hace un POST mínimo al webhook (un 200 = activo). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  return trigger(cfg, { __starseed_ping: true });
}
