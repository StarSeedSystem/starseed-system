"use client";

// ════════════════════════════════════════════════════════════════
// Aurora Multichat — sesiones de chat PARALELAS e INDEPENDIENTES.
// ----------------------------------------------------------------
// Cada sesión tiene su PROPIO proveedor de IA, su contexto, sus
// memorias enlazadas y su historial. Las sesiones son independientes
// (historiales separados) y pueden INTERCONECTARSE: una sesión puede
// referenciar la salida/contexto de otra (`contextRefs`).
//
// Modelo de datos persistido en localStorage:
//   · `starseed.aurora.chats.v1`     → { version, chats: AuroraChat[] }
//   · `starseed.aurora.activeChatId` → id de la sesión activa
//
// Es ADITIVO: el chat único de Aurora (motor de voz) sigue intacto.
// Esta capa es el "rail" de chats múltiples del panel de control.
//
// Framework-light: un store en módulo + hook de React (useSyncExternal
// Store) + localStorage. Sin dependencias nuevas (no zustand). SSR-safe:
// todo acceso a window/localStorage va con guardas typeof.
// ════════════════════════════════════════════════════════════════

import { useCallback, useSyncExternalStore } from "react";
import type { ChatProviderOverride } from "@/ai/client/chat";
import type { ProviderId } from "@/ai/providers/types";
import { safeGet, safeSet } from "@/lib/safe-storage";

// ── Tipos del proveedor por chat (#95) ───────────────────────────

/**
 * Modo de proveedor de una sesión:
 *   · "auto"   → Aurora elige por cada solicitud (MoA router / chatSmart).
 *   · "catalog"→ un modelo/runtime concreto del catálogo OSS (id de oss-library).
 *   · "ollama" → endpoint Ollama local (base URL configurable).
 *   · "custom" → cualquier API/servicio compatible (base URL + modelo + clave).
 *   · "provider" → uno de los proveedores ya configurados del usuario (providerId).
 */
export type AuroraProviderMode = "auto" | "catalog" | "ollama" | "custom" | "provider";

export interface AuroraChatProviderConfig {
  mode: AuroraProviderMode;
  /** id de @/lib/oss-library cuando mode === "catalog" (informativo + modelo sugerido). */
  catalogId?: string;
  /** providerId (@/ai/providers) cuando mode === "provider". */
  providerId?: string;
  /** Base URL para "ollama" y "custom". */
  baseUrl?: string;
  /** Modelo a solicitar (todos los modos no-auto). */
  model?: string;
  /** Clave API (solo "custom"; en claro en memoria/localStorage local del usuario). */
  apiKey?: string;
  /** Etiqueta legible opcional. */
  label?: string;
}

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

/** Por defecto: Auto — Aurora elige (defiere al router MoA / chatSmart). */
export function defaultProviderConfig(): AuroraChatProviderConfig {
  return { mode: "auto", label: "Auto · Aurora elige" };
}

// ── Mensajes e interconexión ─────────────────────────────────────

export interface AuroraChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
  at: number;
  /** Marca si este mensaje fue inyectado desde otra sesión (interconexión). */
  fromChatId?: string;
}

/**
 * Referencia a OTRA sesión (interconexión). Permite que una sesión vea
 * el contexto/última salida de otra. `mode` decide cuánto se comparte.
 */
export interface AuroraChatRef {
  chatId: string;
  /** "last" = última respuesta; "summary" = nota breve; "full" = historial. */
  mode: "last" | "summary" | "full";
}

export interface AuroraChat {
  id: string;
  title: string;
  /** Proveedor de IA de ESTA sesión (#95). */
  providerConfig: AuroraChatProviderConfig;
  /** Referencias a otras sesiones (interconexión / @-mención). */
  contextRefs: AuroraChatRef[];
  /** Ids de raíces de memoria enlazadas (reutiliza el catálogo de memorias). */
  memoryRootIds: string[];
  /** Historial independiente de la sesión. */
  messages: AuroraChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface MultichatState {
  version: 1;
  chats: AuroraChat[];
}

const CHATS_KEY = "starseed.aurora.chats.v1";
const ACTIVE_KEY = "starseed.aurora.activeChatId";

// ── Utilidades ───────────────────────────────────────────────────

function uid(prefix = "chat"): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch { /* noop */ }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): number {
  return Date.now();
}

/** Crea la primera sesión por defecto (espeja el chat único existente). */
function makeDefaultChat(): AuroraChat {
  const t = now();
  return {
    id: uid(),
    title: "Chat principal",
    providerConfig: defaultProviderConfig(),
    contextRefs: [],
    memoryRootIds: [],
    messages: [],
    createdAt: t,
    updatedAt: t,
  };
}

/** Normaliza/valida un chat leído de localStorage de forma defensiva. */
function coerceChat(raw: unknown): AuroraChat | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<AuroraChat>;
  if (typeof c.id !== "string" || !c.id) return null;
  const pc = (c.providerConfig && typeof c.providerConfig === "object"
    ? c.providerConfig
    : defaultProviderConfig()) as AuroraChatProviderConfig;
  const validModes: AuroraProviderMode[] = ["auto", "catalog", "ollama", "custom", "provider"];
  const mode: AuroraProviderMode = validModes.includes(pc.mode) ? pc.mode : "auto";
  return {
    id: c.id,
    title: typeof c.title === "string" && c.title.trim() ? c.title : "Chat",
    providerConfig: { ...pc, mode },
    contextRefs: Array.isArray(c.contextRefs)
      ? c.contextRefs.filter((r): r is AuroraChatRef => !!r && typeof (r as AuroraChatRef).chatId === "string")
      : [],
    memoryRootIds: Array.isArray(c.memoryRootIds)
      ? c.memoryRootIds.filter((x): x is string => typeof x === "string")
      : [],
    messages: Array.isArray(c.messages)
      ? c.messages
          .filter((m): m is AuroraChatMessage => !!m && typeof (m as AuroraChatMessage).text === "string")
          .map((m) => ({
            role: m.role === "user" || m.role === "assistant" || m.role === "system" ? m.role : "assistant",
            text: m.text,
            at: typeof m.at === "number" ? m.at : now(),
            fromChatId: typeof m.fromChatId === "string" ? m.fromChatId : undefined,
          }))
      : [],
    createdAt: typeof c.createdAt === "number" ? c.createdAt : now(),
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : now(),
  };
}

// ── Estado en memoria + suscripción (useSyncExternalStore) ───────

let state: MultichatState | null = null;
let activeId: string | null = null;
const listeners = new Set<() => void>();

function readState(): MultichatState {
  if (typeof window === "undefined") {
    return { version: 1, chats: [makeDefaultChat()] };
  }
  try {
    const raw = safeGet(CHATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MultichatState>;
      const chats = Array.isArray(parsed?.chats)
        ? parsed!.chats!.map(coerceChat).filter((c): c is AuroraChat => !!c)
        : [];
      if (chats.length > 0) return { version: 1, chats };
    }
  } catch { /* noop */ }
  // Sin datos válidos → una sesión por defecto.
  return { version: 1, chats: [makeDefaultChat()] };
}

function readActiveId(chats: AuroraChat[]): string {
  let id: string | null = null;
  if (typeof window !== "undefined") {
    try { id = safeGet(ACTIVE_KEY); } catch { /* noop */ }
  }
  if (id && chats.some((c) => c.id === id)) return id;
  return chats[0]?.id ?? "";
}

function ensureLoaded(): MultichatState {
  if (state) return state;
  state = readState();
  activeId = readActiveId(state.chats);
  return state;
}

function persist() {
  if (typeof window === "undefined" || !state) return;
  // safeSet nunca lanza: ante cuota llena poda y, si no cabe, degrada a memoria.
  safeSet(CHATS_KEY, JSON.stringify(state));
  if (activeId) safeSet(ACTIVE_KEY, activeId);
}

function emit() {
  for (const l of listeners) {
    try { l(); } catch { /* noop */ }
  }
}

function setState(next: MultichatState, nextActive?: string) {
  state = next;
  if (nextActive !== undefined) activeId = nextActive;
  // Garantía: siempre al menos una sesión y un activo válido.
  if (state.chats.length === 0) state.chats = [makeDefaultChat()];
  if (!activeId || !state.chats.some((c) => c.id === activeId)) {
    activeId = state.chats[0].id;
  }
  persist();
  emit();
}

function subscribe(cb: () => void): () => void {
  ensureLoaded();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Snapshot estable: useSyncExternalStore exige referencias estables entre
// renders sin cambios. Guardamos el último snapshot y solo lo recreamos cuando
// el estado o el activo cambian de referencia.
let lastSnapshot: { chats: AuroraChat[]; activeChatId: string } | null = null;
function getSnapshot(): { chats: AuroraChat[]; activeChatId: string } {
  const s = ensureLoaded();
  if (!lastSnapshot || lastSnapshot.chats !== s.chats || lastSnapshot.activeChatId !== activeId) {
    lastSnapshot = { chats: s.chats, activeChatId: activeId ?? (s.chats[0]?.id ?? "") };
  }
  return lastSnapshot;
}

const SERVER_SNAPSHOT = { chats: [] as AuroraChat[], activeChatId: "" };
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

// ── Mutaciones (API del store) ───────────────────────────────────

export function createChat(partial?: Partial<AuroraChat>): AuroraChat {
  const s = ensureLoaded();
  const t = now();
  const chat: AuroraChat = {
    id: uid(),
    title: partial?.title?.trim() || `Chat ${s.chats.length + 1}`,
    providerConfig: partial?.providerConfig || defaultProviderConfig(),
    contextRefs: partial?.contextRefs || [],
    memoryRootIds: partial?.memoryRootIds || [],
    messages: partial?.messages || [],
    createdAt: t,
    updatedAt: t,
  };
  setState({ version: 1, chats: [...s.chats, chat] }, chat.id);
  return chat;
}

export function setActiveChat(id: string) {
  const s = ensureLoaded();
  if (!s.chats.some((c) => c.id === id)) return;
  setState(s, id);
}

export function renameChat(id: string, title: string) {
  const s = ensureLoaded();
  const next = s.chats.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title, updatedAt: now() } : c));
  setState({ version: 1, chats: next });
}

export function closeChat(id: string) {
  const s = ensureLoaded();
  const remaining = s.chats.filter((c) => c.id !== id);
  // Nunca dejamos cero sesiones: si era la última, creamos una nueva limpia.
  const chats = remaining.length > 0 ? remaining : [makeDefaultChat()];
  // Limpia referencias colgantes a la sesión cerrada.
  const cleaned = chats.map((c) => ({
    ...c,
    contextRefs: c.contextRefs.filter((r) => r.chatId !== id),
  }));
  const nextActive = activeId === id ? cleaned[0].id : (activeId ?? cleaned[0].id);
  setState({ version: 1, chats: cleaned }, nextActive);
}

export function updateProviderConfig(id: string, patch: Partial<AuroraChatProviderConfig>) {
  const s = ensureLoaded();
  const next = s.chats.map((c) =>
    c.id === id
      ? { ...c, providerConfig: { ...c.providerConfig, ...patch }, updatedAt: now() }
      : c,
  );
  setState({ version: 1, chats: next });
}

export function setMemoryRootIds(id: string, ids: string[]) {
  const s = ensureLoaded();
  const next = s.chats.map((c) => (c.id === id ? { ...c, memoryRootIds: [...ids], updatedAt: now() } : c));
  setState({ version: 1, chats: next });
}

export function setContextRefs(id: string, refs: AuroraChatRef[]) {
  const s = ensureLoaded();
  // No se permite auto-referencia.
  const clean = refs.filter((r) => r.chatId !== id);
  const next = s.chats.map((c) => (c.id === id ? { ...c, contextRefs: clean, updatedAt: now() } : c));
  setState({ version: 1, chats: next });
}

export function toggleContextRef(id: string, refChatId: string, mode: AuroraChatRef["mode"] = "last") {
  const s = ensureLoaded();
  if (refChatId === id) return; // sin auto-referencia
  const chat = s.chats.find((c) => c.id === id);
  if (!chat) return;
  const exists = chat.contextRefs.some((r) => r.chatId === refChatId);
  const refs = exists
    ? chat.contextRefs.filter((r) => r.chatId !== refChatId)
    : [...chat.contextRefs, { chatId: refChatId, mode }];
  setContextRefs(id, refs);
}

export function appendMessage(id: string, msg: AuroraChatMessage) {
  const s = ensureLoaded();
  const next = s.chats.map((c) =>
    c.id === id ? { ...c, messages: [...c.messages, msg], updatedAt: now() } : c,
  );
  setState({ version: 1, chats: next });
}

/**
 * Reemplaza el texto del ÚLTIMO mensaje de un rol concreto (para streaming:
 * se crea un assistant vacío y se va rellenando). Si no existe, no hace nada.
 */
export function updateLastMessage(id: string, role: AuroraChatMessage["role"], text: string) {
  const s = ensureLoaded();
  const next = s.chats.map((c) => {
    if (c.id !== id) return c;
    const msgs = [...c.messages];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === role) {
        msgs[i] = { ...msgs[i], text };
        break;
      }
    }
    return { ...c, messages: msgs, updatedAt: now() };
  });
  setState({ version: 1, chats: next });
}

export function clearMessages(id: string) {
  const s = ensureLoaded();
  const next = s.chats.map((c) => (c.id === id ? { ...c, messages: [], updatedAt: now() } : c));
  setState({ version: 1, chats: next });
}

// ── Helpers de lectura puros (sin estado de React) ───────────────

export function getChat(id: string): AuroraChat | undefined {
  return ensureLoaded().chats.find((c) => c.id === id);
}

export function listChats(): AuroraChat[] {
  return ensureLoaded().chats;
}

/**
 * Construye un bloque de contexto (string) con las salidas de las sesiones
 * referenciadas por `chat`. Para INTERCONEXIÓN: el caller lo inyecta como
 * mensaje system al enviar. Vacío si no hay referencias o salidas. Defensivo.
 */
export function buildInterconnectContext(chat: AuroraChat, allChats: AuroraChat[]): string {
  try {
    if (!chat.contextRefs || chat.contextRefs.length === 0) return "";
    const lines: string[] = [];
    for (const ref of chat.contextRefs) {
      const other = allChats.find((c) => c.id === ref.chatId);
      if (!other) continue;
      const assistantMsgs = other.messages.filter((m) => m.role === "assistant");
      if (assistantMsgs.length === 0 && other.messages.length === 0) continue;
      if (ref.mode === "full") {
        const transcript = other.messages
          .slice(-10)
          .map((m) => `${m.role === "user" ? "Usuario" : "IA"}: ${m.text}`)
          .join("\n");
        if (transcript) lines.push(`### Sesión «${other.title}» (historial):\n${transcript}`);
      } else {
        // "last" o "summary": la última respuesta de la otra sesión.
        const last = assistantMsgs[assistantMsgs.length - 1];
        if (last?.text) {
          const text = ref.mode === "summary" ? last.text.slice(0, 500) : last.text;
          lines.push(`### Sesión «${other.title}» (última respuesta):\n${text}`);
        }
      }
    }
    if (lines.length === 0) return "";
    return (
      "CONTEXTO DE OTRAS SESIONES INTERCONECTADAS (úsalo si es relevante):\n\n" +
      lines.join("\n\n")
    );
  } catch {
    return "";
  }
}

/**
 * Traduce el `providerConfig` de una sesión a los campos que entiende
 * chatSmart(): `moaMode` + `providerOverride`. Esta es la cola que une el
 * selector por chat (#95) con el runtime MoA (auto-selección reutilizada).
 *
 *   · "auto"    → moaMode undefined (deja que Aurora resuelva su config MoA).
 *   · resto     → moaMode "single" + un providerOverride concreto.
 */
export function providerConfigToRequest(pc: AuroraChatProviderConfig): {
  moaMode?: "single" | "router" | "moa" | "crew";
  providerOverride?: ChatProviderOverride;
} {
  try {
    if (!pc || pc.mode === "auto") {
      // Auto: NO forzamos modo → runMoA usa la config global/cerebro (router por
      // defecto), de modo que Aurora elige por cada solicitud.
      return {};
    }
    if (pc.mode === "ollama") {
      return {
        moaMode: "single",
        providerOverride: {
          providerId: "ollama",
          baseUrl: pc.baseUrl || DEFAULT_OLLAMA_BASE_URL,
          model: pc.model,
          label: pc.label,
        },
      };
    }
    if (pc.mode === "custom") {
      return {
        moaMode: "single",
        providerOverride: {
          // API compatible OpenAI por defecto cuando hay baseUrl.
          providerId: "openai-compatible",
          baseUrl: pc.baseUrl,
          model: pc.model,
          apiKey: pc.apiKey,
          label: pc.label,
        },
      };
    }
    if (pc.mode === "provider") {
      // Un proveedor ya configurado del usuario: usamos su config almacenada
      // (no override), solo fijamos modelo y modo single.
      return {
        moaMode: "single",
        providerOverride: pc.model
          ? { providerId: pc.providerId as ProviderId | undefined, model: pc.model, label: pc.label }
          : undefined,
      };
    }
    if (pc.mode === "catalog") {
      // Catálogo OSS: tratamos el modelo elegido como un modelo Ollama local
      // por defecto (runtime local), salvo que el usuario fije base/clave.
      return {
        moaMode: "single",
        providerOverride: {
          providerId: "ollama",
          baseUrl: pc.baseUrl || DEFAULT_OLLAMA_BASE_URL,
          model: pc.model || pc.catalogId,
          label: pc.label,
        },
      };
    }
    return {};
  } catch {
    return {};
  }
}

// ── Hook de React ────────────────────────────────────────────────

export interface UseAuroraMultichat {
  chats: AuroraChat[];
  activeChatId: string;
  activeChat: AuroraChat | undefined;
  createChat: (partial?: Partial<AuroraChat>) => AuroraChat;
  setActiveChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  closeChat: (id: string) => void;
  updateProviderConfig: (id: string, patch: Partial<AuroraChatProviderConfig>) => void;
  setMemoryRootIds: (id: string, ids: string[]) => void;
  setContextRefs: (id: string, refs: AuroraChatRef[]) => void;
  toggleContextRef: (id: string, refChatId: string, mode?: AuroraChatRef["mode"]) => void;
  appendMessage: (id: string, msg: AuroraChatMessage) => void;
  updateLastMessage: (id: string, role: AuroraChatMessage["role"], text: string) => void;
  clearMessages: (id: string) => void;
}

export function useAuroraMultichat(): UseAuroraMultichat {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const activeChat = snap.chats.find((c) => c.id === snap.activeChatId);

  return {
    chats: snap.chats,
    activeChatId: snap.activeChatId,
    activeChat,
    createChat: useCallback((p?: Partial<AuroraChat>) => createChat(p), []),
    setActiveChat: useCallback((id: string) => setActiveChat(id), []),
    renameChat: useCallback((id: string, t: string) => renameChat(id, t), []),
    closeChat: useCallback((id: string) => closeChat(id), []),
    updateProviderConfig: useCallback(
      (id: string, patch: Partial<AuroraChatProviderConfig>) => updateProviderConfig(id, patch),
      [],
    ),
    setMemoryRootIds: useCallback((id: string, ids: string[]) => setMemoryRootIds(id, ids), []),
    setContextRefs: useCallback((id: string, refs: AuroraChatRef[]) => setContextRefs(id, refs), []),
    toggleContextRef: useCallback(
      (id: string, refChatId: string, mode?: AuroraChatRef["mode"]) => toggleContextRef(id, refChatId, mode),
      [],
    ),
    appendMessage: useCallback((id: string, msg: AuroraChatMessage) => appendMessage(id, msg), []),
    updateLastMessage: useCallback(
      (id: string, role: AuroraChatMessage["role"], text: string) => updateLastMessage(id, role, text),
      [],
    ),
    clearMessages: useCallback((id: string) => clearMessages(id), []),
  };
}
