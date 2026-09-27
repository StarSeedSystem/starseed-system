"use client";

/**
 * ia-malla — IA de CUALQUIER modelo servida por OTRA neurona de la MISMA
 * cuenta a través del canal WebRTC de la malla de neuronas (Ola 368), sin
 * pasar por el túnel de Cloudflare ni por ningún servidor de terceros. Ver
 * `src/lib/network/ia-por-malla.ts` (protocolo + rol cliente/servidor) y
 * `architecture/astraura-158-sistema-primario.md` §18.
 *
 * El `model` que recibe `chat()` es SIEMPRE uno de los dos que construye el
 * enrutador (`router.ts`, casos "a"/"b" — nunca aparece en el catálogo
 * normal, ver `free-catalog.ts` · `IA_MALLA_SOURCE_ID`):
 *   · `"auto"`                    — sin pin: el peer usa su propio enrutador libre-primero.
 *   · `codificarModeloIaMalla(f,m)` — pin: el peer intenta fijar la fuente/modelo `f`/`m`.
 */

import type { ChatMessage, ChatOptions, ChatResponse, DecryptedProviderConfig, Provider, ProviderInfo } from "./types";
import type { IaMallaError } from "@/lib/network/ia-por-malla";

/**
 * (2026-09-27) El relé se carga PEREZOSO: `providers/index.ts` lo importa todo el OS y
 * una importación estática metía la pila de red (malla, WebRTC, fichas) en el ciclo
 * providers ↔ enrutador. Medido: la compilación de Vercel pasó de ~3 a 27,6 min.
 * Mismo valor que `IA_MALLA_MODEL_AUTO` de `ia-por-malla.ts`.
 */
const MODELO_AUTO = "auto";
const cargarRele = () => import("@/lib/network/ia-por-malla");

const info: ProviderInfo = {
  id: "ia-malla",
  label: "IA de tu malla P2P",
  description:
    "Cualquier modelo configurado en tu cuenta, servido por otra neurona a través del canal WebRTC de la malla — sin túnel ni servidor externo.",
  requiresKey: false,
  local: true,
  defaultBaseUrl: "malla://ia",
  defaultModels: [MODELO_AUTO],
};

async function chat(_config: DecryptedProviderConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
  const { pedirIaPorMalla, decodificarModeloIaMalla } = await cargarRele();
  const pin = decodificarModeloIaMalla(options.model);
  const text = await pedirIaPorMalla({
    cuerpo: {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      fuente: pin.fuente,
      modelo: pin.modelo,
    },
    signal: options.signal,
    onTexto: options.onChunk,
  })
    .then((res) => ({ text: res.text, raw: { via: "malla" as const, peer: res.peer, fuente: res.fuente, modelo: res.modelo } }))
    .catch((e: unknown) => {
      const err = e as IaMallaError;
      // Mismo formato ("ocupado" + "retry after Ns") que el resto de fuentes:
      // el enrutador (`router.ts`) enfría esta fuente con la misma regla que
      // a cualquier otra, sin necesitar ningún caso especial para la malla.
      throw new Error(err?.message || "IA por la malla error desconocido.");
    });
  return text;
}

async function listModels(): Promise<string[]> {
  return [...info.defaultModels];
}

export const iaMallaProvider: Provider = { info, chat, listModels };
