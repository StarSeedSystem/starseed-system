"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMIONE BRIDGE — personalidad de Aurora ↔ esta computadora como neurona
 * ---------------------------------------------------------------------------
 * Mecanismo de sincronización de neuronas entre los cerebros de las cuentas
 * del OS, de modo que la personalidad "Hermione" (el Hermes externo del
 * usuario) pueda operar DESDE cualquier chat de Aurora y usar ESTA computadora
 * como su servidor activo (neurona), accediendo al chat, a las memorias del
 * resto del cerebro, a la cuenta y a toda Astraura (OS + red: Biblioteca,
 * configuraciones predeterminadas, skills, sentidos, capacidades).
 *
 * Distinción de nombres (importante):
 *   · HERMIONE  = la personalidad de Aurora (lo que el usuario selecciona en
 *                 cualquier chat de Aurora). Es quien "habla" en la UI.
 *   · HERMES    = la sesión/agente vivo de ESTA computadora (Mac con Ollama +
 *                 WebGPU) a la que Hermione se puentea. Hermione es el puente;
 *                 Hermes es el cerebro local que ejecuta.
 *
 * Cómo funciona (sobre los cimientos reales del OS):
 *   · La personalidad "Hermione" vive en `aurora_personalities` (owner =
 *     maggasukha) → es seleccionable en CUALQUIER chat de Aurora y su
 *     `character` se compila al system prompt vía `buildSystemPrompt`.
 *   · Esta computadora está registrada en `neuron_devices` como neurona de
 *     kind "server" con `capabilities.bridge = { mode: "external-hermes",
 *     endpoint, personalityId }` (ver `neurons.ts`).
 *   · Cuando el usuario escribe en un chat de Aurora con Hermione activa,
 *     `conversations.ts` escribe el mensaje en `astraura_messages` (tabla
 *     unificada de Adenda 69). Este módulo detecta el mensaje y, SI la
 *     conversación pertenece a Hermione y la neurona servidora está online,
 *     lo reenvía al endpoint de la neurona (esta Mac) vía la API route
 *     `/api/neurons/hermione/bridge`, que a su vez lo entrega a la sesión
 *     Hermes viva (WebSocket local). La respuesta de Hermes se escribe de
 *     vuelta en `astraura_messages` con rol "assistant", apareciendo en el
 *     chat de Aurora en tiempo real (mismo camino que Adenda 69).
 *
 * Privacidad: el modo "open" del puente es por diseño SOLO para el dueño
 * (la neurona pertenece a la cuenta maggasukha). Para publicar Hermione en
 * la Biblioteca como personalidad de código abierto (siguiente fase) se
 * expone una variante SIN datos privados del dueño: la neurona se enlaza por
 * el usuario que instala, no por maggasukha. Ver `bridge.openForLibrary`.
 *
 * Todos los accesos son defensivos y SSR-safe: sin window/sesión, degrada a
 * no-op. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { onTableChange } from "@/lib/realtime/realtime";
import { AI_CHATS_TOPIC, emitChange } from "@/lib/sync/live-signal";

/** Id estable de la personalidad Hermione (creada en la cuenta maggasukha). */
export const HERMIONE_PERSONALITY_ID = "c9fe7030-fc68-49c6-a705-58f7900887f9";
export const HERMIONE_PERSONALITY_NAME = "Hermione";

/** Id de la neurona servidor de esta Mac (registrada en neuron_devices). */
export const HERMIONE_NEURON_ID = "c0ffee01-1234-4abc-8def-0123456789ab";

/** Endpoint local por defecto donde escucha la sesión Hermes de esta Mac. */
const DEFAULT_BRIDGE_ENDPOINT = "http://localhost:8787/api/neurons/hermione/bridge";

export interface HermioneBridgeInfo {
  endpoint: string;
  online: boolean;
  personalityId: string;
  note: string;
}

/** Lee la neurona servidor de Hermione de la cuenta (si existe y está online). */
export async function getHermioneNeuron(): Promise<HermioneBridgeInfo | null> {
  try {
    const sb = createClient();
    const { data } = await sb
      .from("neuron_devices")
      .select("id, capabilities, last_seen_at")
      .eq("id", HERMIONE_NEURON_ID)
      .maybeSingle();
    if (!data) return null;
    const caps = (data.capabilities as any) || {};
    const bridge = caps.bridge;
    if (!bridge || bridge.mode !== "external-hermes") return null;
    const seen = data.last_seen_at ? Date.parse(data.last_seen_at) : 0;
    const online = Date.now() - seen < 3 * 60_000;
    const endpoint =
      (bridge.endpoint as string) || caps.bridgeEndpoint || DEFAULT_BRIDGE_ENDPOINT;
    return {
      endpoint,
      online,
      personalityId: bridge.personalityId || HERMIONE_PERSONALITY_ID,
      note: bridge.note || "",
    };
  } catch {
    return null;
  }
}

/** ¿El usuario tiene activa la personalidad Hermione en este chat? */
export function isHermioneActive(activePersonalityId?: string | null, name?: string): boolean {
  if (activePersonalityId && activePersonalityId === HERMIONE_PERSONALITY_ID) return true;
  if (name && name.trim().toLowerCase() === HERMIONE_PERSONALITY_NAME.toLowerCase()) return true;
  return false;
}

/**
 * Reenvía un mensaje del usuario a la neurona servidor de Hermione (esta Mac),
 * que lo entrega a la sesión Hermes viva. Idempotente vía `clientId`.
 * Devuelve true si se entregó (la respuesta llegará por el camino de
 * `astraura_messages` en tiempo real).
 */
export async function forwardToHermioneNeuron(opts: {
  convId: string;
  msgId: string;
  clientId: string;
  text: string;
  userId: string;
  profileKey?: string;
}): Promise<boolean> {
  const neuron = await getHermioneNeuron();
  if (!neuron || !neuron.online) return false; // degrada a Astraura normal
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(neuron.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        convId: opts.convId,
        msgId: opts.msgId,
        clientId: opts.clientId,
        text: opts.text,
        userId: opts.userId,
        profileKey: opts.profileKey,
        personalityId: HERMIONE_PERSONALITY_ID,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false; // red caída / neurona apagada → Astraura normal toma el relevo
  }
}

/**
 * Suscribe la llegada de MENSAJES del usuario en hilos de Hermione y los
 * reenvía a la neurona servidor. `onDelivered` se invoca tras entregar con
 * éxito (para que la UI sepa que Hermes está procesando). Devuelve uncleanup.
 *
 * Se deduplica con el `client_id` determinista de `conversations.ts` para
 * no reenviar lo ya enviado por otro dispositivo.
 */
export function watchHermioneThread(opts: {
  userId: string;
  activePersonalityId?: string | null;
  activeName?: string;
  onDelivered?: (convId: string, clientId: string) => void;
}): () => void {
  if (typeof window === "undefined") return () => {};
  if (!isHermioneActive(opts.activePersonalityId, opts.activeName)) return () => {};

  const seen = new Set<string>();

  const handle = (payload: any) => {
    try {
      const row = payload?.new ?? payload;
      if (!row) return;
      const chatId: string = row.chat_id;
      const role: string = row.role;
      const clientId: string = row.client_id;
      const userId: string = row.user_id;
      const text: string = row.content;
      if (role !== "user") return;
      if (userId !== opts.userId) return;
      if (!chatId || !clientId || !text) return;
      if (seen.has(clientId)) return;
      seen.add(clientId);
      void forwardToHermioneNeuron({
        convId: chatId,
        msgId: row.id,
        clientId,
        text,
        userId,
      }).then((ok) => {
        if (ok) opts.onDelivered?.(chatId, clientId);
      });
    } catch {
      /* no-op */
    }
  };

  // Camino 1: postgres_changes sobre astraura_messages (red de seguridad).
  const unsub = onTableChange("astraura_messages", { event: "*" }, handle);
  return () => {
    try {
      unsub();
    } catch {
      /* no-op */
    }
  };
}

/**
 * Escribe la respuesta de Hermes de vuelta en el hilo de Aurora (mismo camino
 * que Adenda 69). Usado por la API route del puente al recibir la respuesta de
 * la sesión Hermes. `client_id` determinista ⇒ idempotente.
 */
export async function writeHermioneReply(opts: {
  convId: string;
  userId: string;
  text: string;
  clientId: string;
}): Promise<boolean> {
  try {
    const sb = createClient();
    const { error } = await sb.from("astraura_messages").insert({
      user_id: opts.userId,
      chat_id: opts.convId,
      role: "assistant",
      source: "hermione-bridge",
      client_id: opts.clientId,
      content: opts.text,
      meta: { hermione: true, bridge: "external-hermes" },
    });
    if (!error) {
      // Avisa a los clientes en tiempo real (mismo topic que Adenda 69).
      emitChange(AI_CHATS_TOPIC, { id: opts.convId, data: { convId: opts.convId, kind: "message" } });
    }
    return !error;
  } catch {
    return false;
  }
}

/**
 * Configuración para publicar Hermione en la Biblioteca como personalidad de
 * código abierto (fase 2, pedida por el usuario). NO incluye datos privados
 * del dueño: la neurona se enlaza por el usuario que instala (su propia
 * computadora), no por maggasukha. La personalidad es idéntica salvo el
 * `bridge.personalityId` y la nota, que quedan vacíos para que el instalador
 * los fije a su propia neurona.
 */
export const HERMIONE_LIBRARY_MANIFEST = {
  id: "personality-hermione",
  name: HERMIONE_PERSONALITY_NAME,
  kind: "personality",
  openSource: true,
  author: "maggasukha",
  description:
    "Hermione: tu Hermes externo como personalidad de Aurora. Conecta cualquier chat de Aurora con tu propia computadora (registrada como neurona servidor) para operar el OS, leer/escribir tus memorias, usar la Biblioteca y las capacidades de Astraura desde donde estés.",
  includesPrivateData: false,
  setup:
    "1) Instala la personalidad. 2) En Ajustes → Astraura → Neuronas, registra TU computadora como neurona de kind 'server' con capabilities.bridge.mode='external-hermes' apuntando a tu sesión local. 3) Activa Hermione en cualquier chat de Aurora.",
};
