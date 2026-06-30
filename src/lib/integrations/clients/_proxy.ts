// ════════════════════════════════════════════════════════════════
// Cliente del proxy — utilidades compartidas por todos los clientes
// ----------------------------------------------------------------
// Los clientes del navegador NO llaman directamente a las herramientas
// self-host (CORS). En su lugar invocan el proxy de Next
// (`/api/integrations/proxy` y `/api/integrations/upload`), que reenvía
// la petición desde el servidor. Aquí centralizamos esa llamada de forma
// defensiva: timeout propio, parseo seguro y un IntegrationResult honesto.
// ════════════════════════════════════════════════════════════════

import type { IntegrationResult } from "../types";

const PROXY_URL = "/api/integrations/proxy";
const UPLOAD_URL = "/api/integrations/upload";
const CLIENT_TIMEOUT_MS = 22_000; // un poco por encima del tope del proxy

export interface ProxyCall {
  id: string;
  endpoint: string;
  apiKey?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path?: string;
  body?: unknown;
  query?: Record<string, string>;
  auth?: "bearer" | "x-api-key" | "none";
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function ssr(): boolean {
  return typeof window === "undefined";
}

/** Llama al proxy JSON. Nunca lanza: devuelve IntegrationResult. */
export async function proxyFetch(call: ProxyCall): Promise<IntegrationResult> {
  if (ssr()) {
    return { ok: false, error: "Las integraciones se ejecutan en el navegador (no en SSR)." };
  }
  if (!call.endpoint || !call.endpoint.trim()) {
    return { ok: false, error: "no configurado" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(call),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Respuesta inválida del proxy." };
    }
    if (json.ok) return { ok: true, data: json.data };
    return { ok: false, error: String(json.error || "Error desconocido."), data: json.data };
  } catch (err: unknown) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "Tiempo de espera agotado." : `Fallo de red: ${(err as Error)?.message || "desconocido"}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Llama al proxy multipart con un FormData ya construido por el cliente. */
export async function proxyUpload(form: FormData): Promise<IntegrationResult> {
  if (ssr()) {
    return { ok: false, error: "Las integraciones se ejecutan en el navegador (no en SSR)." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(UPLOAD_URL, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!json || typeof json !== "object") {
      return { ok: false, error: "Respuesta inválida del proxy." };
    }
    if (json.ok) return { ok: true, data: json.data };
    return { ok: false, error: String(json.error || "Error desconocido."), data: json.data };
  } catch (err: unknown) {
    const aborted = (err as Error)?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "Tiempo de espera agotado." : `Fallo de red: ${(err as Error)?.message || "desconocido"}.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Normaliza un endpoint del usuario (quita barras finales). */
export function cleanEndpoint(endpoint?: string): string {
  return (endpoint || "").trim().replace(/\/+$/, "");
}

/** Lee un campo de `extra` con varios alias posibles. */
export function extra(cfg: { extra?: Record<string, string> } | undefined, ...keys: string[]): string {
  const bag = cfg?.extra;
  if (!bag) return "";
  for (const k of keys) {
    const v = bag[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Extrae texto plausible de respuestas heterogéneas (defensivo). */
export function pickText(data: any): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const cand = [
      data.text,
      data.answer,
      data.output,
      data.result,
      data.markdown,
      data.md,
      data.content,
      data?.data?.outputs?.text,
      data?.choices?.[0]?.message?.content,
      data?.choices?.[0]?.text,
    ];
    for (const c of cand) {
      if (typeof c === "string" && c.trim()) return c;
    }
    try { return JSON.stringify(data); } catch { return String(data); }
  }
  return String(data);
}
