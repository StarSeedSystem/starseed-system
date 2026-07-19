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
import {
  scoreModelForTask,
  keylessCloudSources,
  isFreeModelId,
  type CatalogSource,
  type CatalogModel,
  type TaskKind,
} from "@/ai/astraura/free-catalog";
import { listOpenRouterFreeModels } from "@/ai/providers/openrouter";
import { DEFAULT_INTELLIGENCE, type IntelligenceSettings } from "@/ai/astraura/router";
import { skillsSystemPrompt, skillsRoutingBias } from "@/ai/astraura/skills";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";

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
  /** Id de la neurona servidor descubierta (la que tiene Hermes instalado). */
  neuronId?: string;
}

/** Lee la neurona servidor de Hermione de la cuenta.
 *
 * AUTO-DESCUBRIMIENTO (Adenda 70): en lugar de fijarse a UN id de neurona,
 * busca en TODAS las neuronas de la cuenta (RLS por owner) aquella que tenga
 * Hermes instalado y esté ONLINE, y devuelve la primera encontrada. Así, al
 * instalar/usar la personalidad Hermione desde CUALQUIER chat de Aurora, el
 * sistema localiza automáticamente el servidor Hermes activo (esta computadora
 * u otra neurona de la cuenta/perfiles) y sincroniza el chat en tiempo real,
 * sin configuración manual.
 *
 * Una neurona "tiene Hermes instalado" si:
 *   · capabilities.bridge.mode === "external-hermes", O
 *   · capabilities.hermesInstalled === true, O
 *   · capabilities.servesPersonalities incluye "hermione".
 */
export async function getHermioneNeuron(): Promise<HermioneBridgeInfo | null> {
  try {
    const sb = createClient();
    const { data } = await sb
      .from("neuron_devices")
      .select("id, capabilities, permissions, last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(50);
    const rows = (data as Array<{ id: string; capabilities?: any; permissions?: any; last_seen_at?: string }>) || [];
    const now = Date.now();
    let fallback: HermioneBridgeInfo | null = null;
    for (const row of rows) {
      const caps = row.capabilities || {};
      const perms = row.permissions || {};
      const bridge = caps.bridge;
      const hasHermes =
        (bridge && bridge.mode === "external-hermes") ||
        caps.hermesInstalled === true ||
        (Array.isArray(caps.servesPersonalities) && caps.servesPersonalities.includes("hermione")) ||
        (Array.isArray(caps.servesPersonalities) && caps.servesPersonalities.includes("Hermione"));
      if (!hasHermes) continue;
      // Permisos vinculados (requisito del usuario): la neurona debe aceptar
      // órdenes de agente (control del dispositivo). DEFAULT del OS = agent=true;
      // solo se bloquea si el dueño lo puso explícitamente en false.
      if (perms.agent === false) continue;
      const seen = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
      const online = now - seen < 3 * 60_000;
      const endpoint =
        (bridge?.endpoint as string) ||
        caps.bridgeEndpoint ||
        (caps.hermesBridge ? DEFAULT_BRIDGE_ENDPOINT : null);
      if (!endpoint) continue;
      const info: HermioneBridgeInfo = {
        endpoint,
        online,
        personalityId: bridge?.personalityId || HERMIONE_PERSONALITY_ID,
        note: bridge?.note || caps.note || "Neurona con Hermes instalado.",
        neuronId: row.id,
      };
      // Preferimos la neurona ONLINE (la más recientemente vista); si ninguna
      // está online guardamos la más reciente como respaldo (Astraura asume).
      if (online) return info;
      if (!fallback) fallback = info;
    }
    return fallback;
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

/* ═══════════════════════════════════════════════════════════════════════════
 * SELECCIÓN DINÁMICA DEL MEJOR MODELO GRATUITO (Adenda 70)
 * ---------------------------------------------------------------------------
 * Hermione elige el mejor modelo :free disponible combinando:
 *   · la librería de modelos gratuitos del OS (free-catalog + OpenRouter :free
 *     vivos vía listOpenRouterFreeModels),
 *   · las predeterminadas de Astraura (DEFAULT_INTELLIGENCE),
 *   · las opciones gratuitas de la CUENTA (user_settings.intelligence),
 *   · el pin de inteligencia de la propia Hermione (su bloque `intelligence`),
 *   · y las fuentes SIN CLAVE del OS como red de seguridad universal.
 * Nunca gasta créditos de pago salvo que el usuario lo fuerce explícitamente.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type HermioneModelTask = TaskKind;

export interface HermioneModelChoice {
  /** id para la API (p.ej. "openrouter/qwen3-coder:free"). */
  id: string;
  /** fuente que lo sirve (id del catálogo: "openrouter-free", "pollinations"…). */
  source: string;
  /** etiqueta legible. */
  label: string;
  /** ¿es gratuito? (siempre true salvo override de pago explícito). */
  free: boolean;
}

/** Lee el bloque `intelligence` de la personalidad Hermione (su pin de créditos). */
function getHermioneIntelligencePin(): { modo?: string; global?: { fuente?: string; modelo?: string }; porSentido?: Record<string, { fuente?: string; modelo?: string }>; permitirPago?: boolean } | null {
  try {
    const list = listPersonalityProfiles();
    const p = list.find((x) => x.id === HERMIONE_PERSONALITY_ID);
    return (p as any)?.intelligence ?? null;
  } catch { return null; }
}

/** Lee la inteligencia configurada en la CUENTA (user_settings.intelligence). */
async function getAccountIntelligence(): Promise<IntelligenceSettings | null> {
  try {
    const sb = createClient();
    const { data } = await sb
      .from("user_settings")
      .select("intelligence")
      .maybeSingle();
    return (data?.intelligence as IntelligenceSettings) ?? null;
  } catch { return null; }
}

/**
 * Elige el mejor modelo :free para una tarea. Si la cuenta o el pin de Hermione
 * fijan un override (por tarea o global) y ese override es gratuito, se respeta.
 */
export async function selectBestFreeModelForHermione(
  task: HermioneModelTask = "chat",
  needsVision = false,
): Promise<HermioneModelChoice | null> {
  try {
    // 1) Modelos :free VIVOS de OpenRouter (librería de APIs/modelos gratuitos del OS).
    const freeOrIds = await listOpenRouterFreeModels();
    const openrouterSource: CatalogSource = {
      id: "openrouter-free",
      label: "OpenRouter (gratis)",
      tier: "free-key",
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      requiresKey: false,
      limits: "Modelos con sufijo :free · límites por modelo/día.",
      why: "Amplio catálogo de modelos :free vivos, ideal para Hermione sin gastar créditos.",
      privacy: "cloud",
      preferFreeModels: true,
      weight: 1.2,
      models: (freeOrIds.length ? freeOrIds : ["openrouter/free"]).map((id) => ({
        id,
        label: id,
        strengths: ["chat", "code", "reasoning", "vision", "fast", "long"],
        quality: 7,
        vision: true,
      })),
    };
    // 2) Fuentes SIN CLAVE del OS (red de seguridad universal de Astraura).
    const keyless = keylessCloudSources();
    const sources: CatalogSource[] = [openrouterSource, ...keyless];

    // 3) Mejor por scoreModelForTask (calidad + fortaleza + visión + peso fuente).
    let best: { score: number; m: CatalogModel; s: CatalogSource } | null = null;
    for (const s of sources) {
      for (const m of s.models) {
        const sc = scoreModelForTask(s, m, task, needsVision);
        if (sc < 0) continue;
        if (!best || sc > best.score) best = { score: sc, m, s };
      }
    }

    // 4) Override por tarea de la CUENTA y del PIN de Hermione (gratis siempre).
    const account = await getAccountIntelligence();
    const pin = getHermioneIntelligencePin();
    const overrideId =
      account?.perTask?.[task] ||
      pin?.porSentido?.[task]?.modelo ||
      pin?.global?.modelo ||
      DEFAULT_INTELLIGENCE.perTask?.[task];
    if (overrideId) {
      const isFree = isFreeModelId(overrideId) || overrideId === "openrouter/free";
      const allowPaid = pin?.permitirPago === true || account?.allowConfiguredPaid === true;
      if (isFree || allowPaid) {
        return { id: overrideId, source: "override", label: overrideId, free: isFree };
      }
    }

    if (best) {
      return { id: best.m.id, source: best.s.id, label: best.m.label, free: isFreeModelId(best.m.id) };
    }
    return null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SINCRONIZACIÓN DE CAPACIDADES A CADA HERMES / NEURONA (Adenda 70)
 * ---------------------------------------------------------------------------
 * Reúne TODAS las habilidades y conexiones de Aurora (system prompt de
 * capacidades activas + sesgo de routing + sentidos + conexiones de la cuenta)
 * y las "instala" en cada neurona con Hermes, para que tenga las MISMAS
 * capacidades de toda Astraura del OS y las cuentas, sincronizadas.
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface HermioneCapabilities {
  /** Bloque de system prompt con TODAS las habilidades activas de Aurora. */
  skillsSystemPrompt: string;
  /** Sesgo de routing agregado de las capacidades activas. */
  routingBias: { preferStrong: boolean; web: boolean; vision: boolean; planning: boolean };
  /** Sentidos activos de la cuenta (si están disponibles). */
  senses: string[];
  /** Conexiones activas de la cuenta (si están disponibles). */
  connections: string[];
  /** Momento de generación (para saber si está fresco). */
  generatedAt: string;
}

/** Reúne las capacidades de Astraura que se instalarán en cada Hermes/neurona. */
export function gatherAuroraCapabilitiesForHermes(): HermioneCapabilities {
  try {
    const bias = skillsRoutingBias();
    return {
      skillsSystemPrompt: skillsSystemPrompt(),
      routingBias: bias,
      senses: [],
      connections: [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      skillsSystemPrompt: "",
      routingBias: { preferStrong: false, web: false, vision: false, planning: false },
      senses: [],
      connections: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Instala las capacidades de Astraura en la neurona (capabilities.hermesCapabilities). */
export async function installCapabilitiesOnNeuron(
  neuronId: string,
  caps: HermioneCapabilities,
): Promise<boolean> {
  try {
    const sb = createClient();
    const { data } = await sb.from("neuron_devices").select("capabilities").eq("id", neuronId).maybeSingle();
    const cur = ((data?.capabilities as object) || {}) as Record<string, unknown>;
    cur.hermesCapabilities = caps;
    cur.hermesInstalled = true;
    const { error } = await sb.from("neuron_devices").update({ capabilities: cur }).eq("id", neuronId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Atajo: sincroniza las capacidades de Astraura con TODAS las neuronas de la
 * cuenta que tienen Hermes instalado (auto-descubrimiento). Devuelve el número
 * de neuronas actualizadas.
 */
export async function syncCapabilitiesToAllHermesNeurons(): Promise<number> {
  try {
    const caps = gatherAuroraCapabilitiesForHermes();
    const sb = createClient();
    const { data } = await sb
      .from("neuron_devices")
      .select("id, capabilities")
      .limit(50);
    const rows = (data as Array<{ id: string; capabilities?: any }>) || [];
    let updated = 0;
    for (const row of rows) {
      const capsRow = row.capabilities || {};
      const bridge = capsRow.bridge;
      const hasHermes =
        (bridge && bridge.mode === "external-hermes") ||
        capsRow.hermesInstalled === true ||
        (Array.isArray(capsRow.servesPersonalities) && capsRow.servesPersonalities.includes("hermione"));
      if (!hasHermes) continue;
      const ok = await installCapabilitiesOnNeuron(row.id, caps);
      if (ok) updated++;
    }
    return updated;
  } catch {
    return 0;
  }
}
