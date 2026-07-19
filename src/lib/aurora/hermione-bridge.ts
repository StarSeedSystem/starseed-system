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
import { listPersonalityProfiles, resolvePersonalityForContext } from "@/lib/aurora/personalities";
// Carpetas de chat (Adenda 74): puerta ÚNICA a `aurora_chat_folders`. Se IMPORTA
// (no se edita) para crear/asegurar la carpeta "Hermione" de forma idempotente.
import { createFolder, refreshFolders, cachedFolders } from "@/lib/aurora/chat-folders-store";
// Memorias de cerebro (Adenda 74): upsert idempotente por (owner, brain_id, name)
// para reflejar el índice y los resúmenes de los chats de Hermione en el cerebro.
import { listMemoryFiles, saveMemoryFile } from "@/lib/cerebro/memory-files";
import type { ChatMessage } from "@/ai/providers/types";

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

/* ═══════════════════════════════════════════════════════════════════════════
 * WATCHER ROBUSTO · ESTADO · COLA · FALLBACK · CARPETA · CEREBRO (Adenda 74)
 * ---------------------------------------------------------------------------
 * Sincronización funcional de Hermione desde CUALQUIER neurona de la cuenta que
 * tenga Hermes en línea. Todo es defensivo y SSR-safe: nunca lanza.
 *
 *   1. ESTADO visible ("en línea / sin neurona / reintentando / inactivo") con
 *      store en memoria + evento de ventana, consumible por la UI (badge).
 *   2. COLA de mensajes pendientes (memoria + localStorage) que se vacía cuando
 *      la neurona vuelve a estar en línea.
 *   3. SALVAGUARDA anti-mudo: si la neurona figura online pero Hermes NO responde
 *      en N s, el bridge escribe él mismo la respuesta con el router gratis-primero
 *      (`astrauraChat`), marcada `source="fallback-sin-neurona"` (idempotente por
 *      client_id, de modo que múltiples pestañas/dispositivos no dupliquen).
 *   4. CARPETA "Hermione" idempotente y asignación de las conversaciones.
 *   5. Reflejo del índice + resumen incremental de chats en `brain_memory_files`.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type HermioneBridgeStatus = "online" | "sin-neurona" | "reintentando" | "inactivo";

export const HERMIONE_STATUS_EVENT = "starseed:hermione-status";
const HERMIONE_QUEUE_KEY = "starseed.hermione.queue.v1";
/** Ventana anti-mudo antes de que el bridge conteste por el router. */
const FALLBACK_MS = 45_000;
/** Extensión única si la neurona sigue viva (deja que Hermes termine, > timeout WS). */
const FALLBACK_EXTEND_MS = 32_000;
/** TTL de la caché de la neurona descubierta (evita spamear a Supabase). */
const NEURON_TTL_MS = 12_000;

let currentStatus: HermioneBridgeStatus = "inactivo";

/** Estado actual del puente Hermione (para la UI/badge). */
export function getHermioneStatus(): HermioneBridgeStatus {
  return currentStatus;
}

/** Etiqueta legible en español del estado (para el badge exportable). */
export function hermioneStatusLabel(s: HermioneBridgeStatus = currentStatus): string {
  switch (s) {
    case "online": return "Hermione: en línea";
    case "reintentando": return "Hermione: reintentando";
    case "sin-neurona": return "Hermione: sin neurona";
    default: return "Hermione: inactiva";
  }
}

/** ¿El puente está sano (neurona Hermes online y respondiendo)? */
export function isHermioneBridgeHealthy(): boolean {
  return currentStatus === "online";
}

function setHermioneStatus(s: HermioneBridgeStatus): void {
  if (s === currentStatus) return;
  currentStatus = s;
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(HERMIONE_STATUS_EVENT, { detail: { status: s } }));
    }
  } catch { /* noop */ }
}

/** Suscríbete a los cambios de estado del puente. Devuelve la función de baja. */
export function onHermioneStatus(cb: (s: HermioneBridgeStatus) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const on = () => cb(currentStatus);
  window.addEventListener(HERMIONE_STATUS_EVENT, on);
  return () => window.removeEventListener(HERMIONE_STATUS_EVENT, on);
}

/* ── Cola de pendientes (memoria + localStorage) ───────────────────────────── */

export interface HermionePending {
  convId: string;
  clientId: string;
  text: string;
  userId: string;
  profileKey?: string;
  ts: number;
}

function readQueue(): HermionePending[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HERMIONE_QUEUE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as HermionePending[]) : [];
  } catch { return []; }
}

function writeQueue(q: HermionePending[]): void {
  if (typeof window === "undefined") return;
  try {
    // Acota tamaño (50) y antigüedad (24 h) para no crecer sin límite.
    const cutoff = Date.now() - 24 * 3600_000;
    const trimmed = q.filter((i) => i.ts >= cutoff).slice(-50);
    window.localStorage.setItem(HERMIONE_QUEUE_KEY, JSON.stringify(trimmed));
  } catch { /* noop */ }
}

/** Nº de mensajes pendientes de entregar a Hermes (para la UI). */
export function pendingHermioneCount(): number {
  return readQueue().length;
}

/** Encola un mensaje que no pudo llegar a Hermes (se reintenta al volver la neurona). */
export function enqueueHermione(item: HermionePending): void {
  const q = readQueue();
  if (q.some((i) => i.clientId === item.clientId)) return; // idempotente
  q.push(item);
  writeQueue(q);
}

/**
 * Vacía la cola contra la neurona (si está online). Cada mensaje entregado se
 * retira. Devuelve el nº de mensajes entregados. Idempotente y seguro.
 */
export async function drainHermioneQueue(): Promise<number> {
  const q = readQueue();
  if (!q.length) return 0;
  const neuron = await getHermioneNeuron();
  if (!neuron || !neuron.online) return 0;
  let delivered = 0;
  const remaining: HermionePending[] = [];
  for (const item of q) {
    const r = await forwardToHermioneNeuronDetailed({
      convId: item.convId,
      msgId: "",
      clientId: item.clientId,
      text: item.text,
      userId: item.userId,
      profileKey: item.profileKey,
    });
    if (r.reachable) delivered++; // llegó a la neurona → catch-up de Hermes
    else remaining.push(item);
  }
  writeQueue(remaining);
  return delivered;
}

/* ── Forward con resultado detallado (llega / entregado a Hermes) ───────────── */

export interface HermioneForwardResult {
  /** La petición HTTP devolvió 200. */
  ok: boolean;
  /** La sesión Hermes viva procesó el mensaje (la ruta escribió la respuesta). */
  delivered: boolean;
  /** La neurona era alcanzable (online + endpoint respondió). */
  reachable: boolean;
}

/**
 * Variante de `forwardToHermioneNeuron` que informa si Hermes ENTREGÓ la
 * respuesta (la ruta responde `{ delivered }`). No sustituye a la función
 * booleana (que usa `conversations.ts`): la añade para el watcher/cola.
 */
export async function forwardToHermioneNeuronDetailed(opts: {
  convId: string;
  msgId: string;
  clientId: string;
  text: string;
  userId: string;
  profileKey?: string;
}): Promise<HermioneForwardResult> {
  const neuron = await getHermioneNeuron();
  if (!neuron || !neuron.online) return { ok: false, delivered: false, reachable: false };
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
    let delivered = false;
    try {
      const json = await res.json();
      delivered = json?.delivered === true;
    } catch { /* respuesta no-JSON */ }
    return { ok: res.ok, delivered, reachable: res.ok };
  } catch {
    return { ok: false, delivered: false, reachable: false };
  }
}

/* ── Salvaguarda anti-mudo: responde por el router gratis-primero ───────────── */

/**
 * Escribe una respuesta de RESPALDO en el hilo cuando la neurona Hermes NO
 * contesta (se quedó "online" pero muda). Usa el router gratis-primero de
 * Astraura (`astrauraChat`, import dinámico para no cargar el router de más ni
 * arriesgar ciclos) y marca `source="fallback-sin-neurona"`. Idempotente por
 * client_id (índice único user_id,client_id) → múltiples pestañas no duplican.
 */
export async function writeHermioneFallbackReply(opts: {
  convId: string;
  userId: string;
  text: string;
  clientId: string;
}): Promise<boolean> {
  try {
    let reply = "";
    try {
      const { astrauraChat } = await import("@/ai/astraura/router");
      const messages: ChatMessage[] = [{ role: "user", content: opts.text }];
      const res = await astrauraChat({ messages, chatId: opts.convId, temperature: 0.5 });
      reply = (res?.text || "").trim();
    } catch { reply = ""; }
    if (!reply) {
      reply =
        "Tu neurona con Hermes no respondió a tiempo, así que te contesto con la inteligencia de Astraura (modelos gratuitos). Cuando la neurona vuelva a estar en línea, Hermione retomará el mando. ¿Seguimos?";
    }
    const sb = createClient();
    const { error } = await sb.from("astraura_messages").upsert(
      {
        user_id: opts.userId,
        chat_id: opts.convId,
        role: "assistant",
        source: "fallback-sin-neurona",
        client_id: `hermione-fallback-${opts.clientId}`,
        content: reply,
        meta: { hermione: true, fallback: true, source: "fallback-sin-neurona", bridge: "external-hermes" },
      },
      { onConflict: "user_id,client_id", ignoreDuplicates: true },
    );
    if (!error) {
      emitChange(AI_CHATS_TOPIC, { id: opts.convId, data: { convId: opts.convId, kind: "message" } });
    }
    return !error;
  } catch {
    return false;
  }
}

/* ── Carpeta "Hermione" (idempotente) + asignación de conversaciones ────────── */

export const HERMIONE_FOLDER_NAME = "Hermione";

/** Asegura la carpeta de chats "Hermione" (crea si falta). Idempotente. */
export async function ensureHermioneFolder(): Promise<boolean> {
  try {
    let folders = cachedFolders();
    if (!folders.some((f) => f.name === HERMIONE_FOLDER_NAME)) {
      folders = await refreshFolders();
    }
    if (folders.some((f) => f.name === HERMIONE_FOLDER_NAME)) return true;
    const created = await createFolder(HERMIONE_FOLDER_NAME);
    return !!created;
  } catch {
    return false;
  }
}

/**
 * Asigna una conversación a la carpeta "Hermione" (columna `aurora_conversations.folder`
 * = nombre de carpeta, misma convención que la UI). No re-asigna si ya lo está.
 */
export async function assignConvToHermioneFolder(convId: string): Promise<boolean> {
  if (!convId) return false;
  try {
    await ensureHermioneFolder();
    const sb = createClient();
    const { data } = await sb
      .from("aurora_conversations")
      .select("folder")
      .eq("id", convId)
      .maybeSingle();
    if ((data as { folder?: string } | null)?.folder === HERMIONE_FOLDER_NAME) return true;
    const { error } = await sb
      .from("aurora_conversations")
      .update({ folder: HERMIONE_FOLDER_NAME })
      .eq("id", convId);
    return !error;
  } catch {
    return false;
  }
}

/* ── Reflejo en las memorias del cerebro (índice + resumen incremental) ─────── */

async function resolveActiveBrainId(explicit?: string | null): Promise<string | null> {
  if (explicit !== undefined && explicit !== null) return explicit;
  try {
    const mod = await import("@/lib/brains/brains");
    const sel = (await mod.getSelection?.("aurora", "")) as { brain_id?: string } | null;
    return sel?.brain_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Refleja en `brain_memory_files` del cerebro del contexto activo:
 *   (a) el ÍNDICE de chats de Hermione (nombre + id), y
 *   (b) un RESUMEN incremental de las últimas conversaciones (últimos mensajes).
 * Fichero "hermione-chats.md", upsert idempotente por (owner, brain_id, name).
 * Exportada para uso MANUAL y programada (debounce) al recibir respuestas.
 */
export async function syncHermioneToBrainMemories(brainId?: string | null): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: userData } = await sb.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return false;

    // Índice de chats de Hermione (source hermione-bridge/fallback o meta.hermione).
    const { data: msgs } = await sb
      .from("astraura_messages")
      .select("chat_id, role, content, created_at")
      .or("source.eq.hermione-bridge,source.eq.fallback-sin-neurona,meta->>hermione.eq.true")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = ((msgs as Array<{ chat_id: string; role: string; content: string; created_at: string }>) || []);
    const convIds = Array.from(new Set(rows.map((m) => m.chat_id).filter(Boolean)));

    const { data: convs } = await sb
      .from("aurora_conversations")
      .select("id, title, updated_at")
      .in("id", convIds.length ? convIds : ["_none_"]);
    const byId = new Map<string, { title: string; updated_at?: string }>();
    for (const c of ((convs as Array<{ id: string; title?: string; updated_at?: string }>) || [])) {
      byId.set(c.id, { title: c.title || c.id, updated_at: c.updated_at });
    }

    // Construye el markdown: índice + resumen incremental (últimos intercambios).
    const now = new Date().toISOString();
    const lines: string[] = [
      "# hermione-chats.md — Índice y resumen de los chats de Hermione",
      "",
      `> Generado automáticamente por el puente Hermione. Última actualización: ${now}.`,
      `> Estado del puente: ${hermioneStatusLabel()}. Chats: ${convIds.length}.`,
      "",
      "## Índice de chats",
      "",
    ];
    if (!convIds.length) {
      lines.push("_Aún no hay conversaciones con Hermione._", "");
    } else {
      for (const id of convIds) {
        const meta = byId.get(id);
        lines.push(`- **${meta?.title || id}** (\`${id}\`)`);
      }
      lines.push("", "## Resumen reciente", "");
      // Últimos 5 chats con sus 4 últimos mensajes (resumen incremental).
      for (const id of convIds.slice(0, 5)) {
        const meta = byId.get(id);
        lines.push(`### ${meta?.title || id}`, "");
        const chatMsgs = rows
          .filter((m) => m.chat_id === id)
          .slice(0, 4)
          .reverse();
        for (const m of chatMsgs) {
          const who = m.role === "user" ? "Tú" : "Hermione";
          const txt = (m.content || "").replace(/\s+/g, " ").slice(0, 240);
          lines.push(`- **${who}:** ${txt}`);
        }
        lines.push("");
      }
    }
    const content = lines.join("\n");

    const resolvedBrain = await resolveActiveBrainId(brainId);
    // Upsert idempotente por (owner, brain_id, name): busca el fichero existente
    // y reutiliza su id para ACTUALIZAR (no duplicar).
    const existing = await listMemoryFiles(resolvedBrain);
    const prev = existing.find((f) => f.name === "hermione-chats.md");
    const saved = await saveMemoryFile({
      id: prev?.id,
      brain_id: resolvedBrain,
      name: "hermione-chats.md",
      content,
      source: "starseed",
      meta: { type: "logs", kind: "hermione", chats: convIds.length, updatedAt: now },
      sync: true,
    });
    return !!saved;
  } catch {
    return false;
  }
}

/* ── Watcher robusto (salvaguarda + estado + cola + carpeta + cerebro) ──────── */

let neuronCache: { at: number; info: HermioneBridgeInfo | null } | null = null;
async function cachedNeuron(): Promise<HermioneBridgeInfo | null> {
  const now = Date.now();
  if (neuronCache && now - neuronCache.at < NEURON_TTL_MS) return neuronCache.info;
  const info = await getHermioneNeuron();
  neuronCache = { at: now, info };
  return info;
}

/** ¿La conversación resuelve a la personalidad Hermione (chat > … > global)? */
function chatUsesHermione(chatId: string): boolean {
  try {
    const p = resolvePersonalityForContext({ chatId });
    return isHermioneActive(p?.id, p?.name);
  } catch {
    return false;
  }
}

let brainSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBrainSync(): void {
  if (brainSyncTimer) clearTimeout(brainSyncTimer);
  brainSyncTimer = setTimeout(() => {
    brainSyncTimer = null;
    void syncHermioneToBrainMemories();
  }, 6_000);
}

/**
 * Watcher robusto del puente. NO reenvía (de eso ya se encarga `conversations.ts`
 * en el dispositivo origen): actúa como SALVAGUARDA — vigila que cada mensaje de
 * usuario en un chat de Hermione reciba respuesta; si la neurona figura online
 * pero Hermes calla, contesta por el router; mantiene el ESTADO, la CARPETA y el
 * reflejo al CEREBRO, y vacía la COLA cuando la neurona vuelve. Idempotente por
 * pestaña (flag) y coordinado entre pestañas por `leaderGate` (opcional).
 * Devuelve una función de baja.
 */
export function watchHermioneBridge(opts: {
  userId: string;
  /** Gate de líder entre pestañas: si devuelve false, esta pestaña no escribe fallback. */
  leaderGate?: () => boolean;
}): () => void {
  if (typeof window === "undefined") return () => {};
  const seenUser = new Set<string>();
  const watchdogs = new Map<string, { timer: ReturnType<typeof setTimeout>; extended: boolean }>();
  const isLeader = () => (opts.leaderGate ? opts.leaderGate() : true);

  const clearWatchdog = (convId: string) => {
    const w = watchdogs.get(convId);
    if (w) { clearTimeout(w.timer); watchdogs.delete(convId); }
  };

  const armWatchdog = (convId: string, clientId: string, text: string) => {
    clearWatchdog(convId);
    const fire = async () => {
      watchdogs.delete(convId);
      // ¿Llegó ya una respuesta del asistente para este chat tras el user msg?
      try {
        const sb = createClient();
        const { data } = await sb
          .from("astraura_messages")
          .select("id")
          .eq("chat_id", convId)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(1);
        if (Array.isArray(data) && data.length) { setHermioneStatus("online"); return; }
      } catch { /* seguimos al fallback */ }
      const neuron = await cachedNeuron();
      const w = watchdogs.get(convId);
      // Si la neurona sigue viva y aún no extendimos, damos más margen a Hermes.
      if (neuron?.online && !(w?.extended)) {
        const timer = setTimeout(() => void fire(), FALLBACK_EXTEND_MS);
        watchdogs.set(convId, { timer, extended: true });
        setHermioneStatus("reintentando");
        return;
      }
      // Sin respuesta y sin (o con) neurona → contestamos por el router (solo líder).
      if (isLeader()) {
        setHermioneStatus("reintentando");
        await writeHermioneFallbackReply({ convId, userId: opts.userId, text, clientId });
      }
      void recomputeStatus();
    };
    const timer = setTimeout(() => void fire(), FALLBACK_MS);
    watchdogs.set(convId, { timer, extended: false });
  };

  const onUser = async (row: { id: string; chat_id: string; client_id: string; content: string }) => {
    const convId = row.chat_id;
    const clientId = row.client_id;
    if (!convId || !clientId || seenUser.has(clientId)) return;
    seenUser.add(clientId);
    // Carpeta + reflejo al cerebro (idempotentes, solo líder para no duplicar trabajo).
    if (isLeader()) {
      void assignConvToHermioneFolder(convId);
      scheduleBrainSync();
    }
    const neuron = await cachedNeuron();
    if (!neuron || !neuron.online) {
      // Neurona apagada: el engine ya degrada a Astraura (no queda mudo). Encolamos
      // para que Hermes se ponga al día cuando vuelva; no armamos watchdog.
      enqueueHermione({ convId, clientId, text: row.content, userId: opts.userId, ts: Date.now() });
      setHermioneStatus("sin-neurona");
      return;
    }
    // Neurona online: el engine cortocircuita (no responde). Armamos la salvaguarda.
    setHermioneStatus("online");
    armWatchdog(convId, clientId, row.content);
  };

  const onAssistant = (row: { chat_id: string }) => {
    clearWatchdog(row.chat_id);
    setHermioneStatus("online");
    if (isLeader()) scheduleBrainSync();
  };

  const unsub = onTableChange("astraura_messages", { event: "*" }, (payload) => {
    try {
      const row = payload?.new ?? payload;
      if (!row) return;
      if (row.user_id !== opts.userId) return;
      if (!row.chat_id || !chatUsesHermione(row.chat_id)) return;
      if (row.role === "user") void onUser(row);
      else if (row.role === "assistant") onAssistant(row);
    } catch { /* noop */ }
  });

  // Heartbeat: recomputa estado y vacía la cola cuando la neurona vuelve.
  const hb = setInterval(() => { void recomputeStatus(); void drainHermioneQueue(); }, 20_000);
  void recomputeStatus();

  return () => {
    try { unsub(); } catch { /* noop */ }
    clearInterval(hb);
    watchdogs.forEach((w) => clearTimeout(w.timer));
    watchdogs.clear();
    if (brainSyncTimer) { clearTimeout(brainSyncTimer); brainSyncTimer = null; }
    setHermioneStatus("inactivo");
  };
}

/** Recalcula el estado del puente a partir de la neurona y la cola. */
export async function recomputeStatus(): Promise<HermioneBridgeStatus> {
  const neuron = await cachedNeuron();
  let s: HermioneBridgeStatus;
  if (neuron?.online) s = "online";
  else if (pendingHermioneCount() > 0) s = "reintentando";
  else s = "sin-neurona";
  setHermioneStatus(s);
  return s;
}
