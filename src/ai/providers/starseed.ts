/**
 * StarSeed · Astraura provider — la IA por DEFECTO, gratis y sin configuración.
 *
 * No requiere API key ni instalar nada: el navegador manda los mensajes con la
 * sesión StarSeed (JWT de Supabase) al Neurocortex (`/api/astraura_chat`), que
 * responde con el modelo del sistema (server-side). Así Aurora/Astraura
 * funcionan de inmediato tras iniciar sesión. El usuario sigue siendo soberano:
 * puede cambiar a Ollama local o a su propio proveedor cuando quiera.
 */

import { createClient } from "@/utils/supabase/client";
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  DecryptedProviderConfig,
  Provider,
  ProviderInfo,
} from "./types";

const DEFAULT_BASE = "https://starseed-neurocortex.vercel.app";

const info: ProviderInfo = {
  id: "starseed",
  label: "StarSeed · Astraura (gratis)",
  description:
    "La IA del sistema, lista al instante tras iniciar sesión. Sin API key, sin instalar nada — responde con el cerebro de StarSeed. Puedes cambiar a Ollama local o a tu propio proveedor cuando quieras.",
  requiresKey: false,
  local: false,
  defaultBaseUrl: DEFAULT_BASE,
  defaultModels: ["astraura", "astraura-rapida"],
};

async function getToken(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const token = await getToken();
  if (!token) {
    throw new Error("Inicia sesión en StarSeed para hablar con Astraura.");
  }
  const res = await fetch(`${baseUrl}/api/astraura_chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      temperature: options.temperature,
      fast: options.model === "astraura-rapida",
    }),
    signal: options.signal,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Astraura no disponible (${res.status}).`);
  }
  const text = String(json?.text ?? "");
  if (options.onChunk && text) options.onChunk(text);
  return { text, raw: json };
}

async function listModels(): Promise<string[]> {
  return [...info.defaultModels];
}

export const starseedProvider: Provider = { info, chat, listModels };
