"use client";

/**
 * StarSeed OS — CONVERSACIONES UNIFICADAS de IA (Adenda 69 · I-1)
 * ============================================================================
 * UNA SOLA conversación/historial para las DOS superficies que hasta ahora eran
 * dos mundos separados:
 *
 *   · **Aurora** (orbe · mini-reproductor · Exocórtex) — hablaba/escribía y su
 *     historial acababa SOLO en `localStorage` (`starseed.aurora.chatlog.v1`,
 *     agrupado por día). Viajaba entre dispositivos como una clave más dentro
 *     del blob `user_settings.prefs`.
 *   · **Astraura AI** (`/agent`, pestaña «Chat») — su chat era `useState` EN
 *     MEMORIA: no persistía nada. Al recargar, se perdía. Y no veía ni una sola
 *     palabra de lo hablado con Aurora.
 *
 * Fuente de verdad ÚNICA (nube, con RLS por dueño):
 *   · `aurora_conversations` — la conversación.
 *   · `astraura_messages`    — sus mensajes (`chat_id` = id de la conversación).
 *
 * Este módulo es la ÚNICA puerta a ese modelo. Reglas:
 *   · **Optimista**: la UI ve el mensaje al instante (caché local) y la nube se
 *     escribe detrás. Si no hay sesión o falla la red, NADA se pierde: la caché
 *     local sigue siendo válida y el `chatlog` legado sigue existiendo.
 *   · **Dedupe por `client_id` determinista**: el mismo mensaje jamás se duplica,
 *     aunque lo inserten dos dispositivos o dos migraciones a la vez.
 *   · **Tiempo real por dos caminos** (se deduplican entre sí):
 *       1. `live-signal` (broadcast en el canal de cuenta) → inmediato.
 *       2. `postgres_changes` sobre las dos tablas → red de seguridad.
 *   · **NO se escribe en `user_settings.prefs`**: los chats crecen y esa columna
 *     ya causó el «lost update» de la Adenda 69/F. Tabla propia, siempre.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { onTableChange } from "@/lib/realtime/realtime";
import { AI_CHATS_TOPIC, emitChange, onChange } from "@/lib/sync/live-signal";
import { activeProfileId } from "@/lib/profiles/profiles";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";
import { isHermioneActive, forwardToHermioneNeuron } from "@/lib/aurora/hermione-bridge";
import { safeGet, safeSet, safeRemove } from "@/lib/safe-storage";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

// ── Claves y eventos ─────────────────────────────────────────────────────────
/** Caché local (offline / arranque instantáneo). NO se sincroniza por prefs. */
export const AI_CONV_CACHE_KEY = "starseed.aurora.conv.cache.v1";
/** Conversación activa en ESTE dispositivo (per-device, deliberadamente). */
export const AI_CONV_ACTIVE_KEY = "starseed.aurora.conv.active.v1";
/** Marca de la migración del `chatlog` legado (informativa: el dedupe es real). */
export const AI_CONV_MIGRATED_KEY = "starseed.aurora.conv.migrated.v1";
/** Evento del DOM: cambió la LISTA de conversaciones. */
export const AI_CONV_CHANGE_EVENT = "starseed:ai-conversations";
/** Evento del DOM: cambiaron los MENSAJES (detail: `{ convId }`). */
export const AI_MSG_CHANGE_EVENT = "starseed:ai-messages";
/** Tope defensivo de conversaciones y mensajes en caché. */
const CONV_CAP = 200;
const MSG_CAP = 600;
/** Horas de inactividad tras las que una conversación «rueda» a una nueva. */
const ROLLOVER_HOURS = 12;

// ── Tipos ────────────────────────────────────────────────────────────────────
/** Rol unificado. Aurora usa "aurora"; en la nube se guarda como "assistant". */
export type AiRole = "user" | "assistant" | "system";

/** Superficie desde la que se habló (transparencia, no gobierna nada). */
export type AiSurface = "orb" | "mini" | "exocortex" | "agent" | "desktop" | "publish" | "other";

export interface AiConversation {
  id: string;
  title: string;
  kind: string;
  persona?: string | null;
  source?: string | null;
  model?: string | null;
  surface?: string | null;
  profileKey?: string | null;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  /** Carpeta de chat (Adenda 71-bis): los chats se adjuntan a folders. */
  folder?: string | null;
  /** meta jsonb: contiene config del menú unificado (meta.config). */
  meta?: any | null;
}

export interface AiMessage {
  id: string;
  convId: string;
  role: AiRole;
  text: string;
  ts: number;
  /** Metadatos de proceso (proveedor/modelo/coste/herramientas) — solo assistant. */
  meta?: AuroraMessageMeta | null;
  attachments?: unknown[] | null;
  source?: string | null;
  /** Id determinista de dedupe. */
  clientId?: string | null;
}

interface CacheShape {
  v: 1;
  convs: AiConversation[];
  msgs: Record<string, AiMessage[]>;
}

// ── Utilidades ───────────────────────────────────────────────────────────────
const isClient = () => typeof window !== "undefined";

/** Rol del chatlog de Aurora ("aurora") → rol unificado. */
export function normalizeRole(role: string | null | undefined): AiRole {
  if (role === "user") return "user";
  if (role === "system") return "system";
  return "assistant"; // aurora | agent | assistant | null
}

/** Hash corto y estable de un texto (para el `client_id` determinista). */
function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * `client_id` DETERMINISTA: mismo mensaje ⇒ misma clave, en cualquier
 * dispositivo. Es lo que hace la migración (y cualquier reintento) idempotente.
 */
export function clientIdFor(role: string, ts: number, text: string): string {
  return `${normalizeRole(role)}:${ts}:${shortHash(text)}`;
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emit(event: string, detail?: unknown): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new CustomEvent(event, detail ? { detail } : undefined));
  } catch {
    /* defensivo */
  }
}

/** Título derivado del primer mensaje del usuario (mismo criterio en todas las UIs). */
export function titleFromText(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "Conversación";
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

// ── Caché local ──────────────────────────────────────────────────────────────
function readCache(): CacheShape {
  if (!isClient()) return { v: 1, convs: [], msgs: {} };
  try {
    const raw = safeGet(AI_CONV_CACHE_KEY);
    if (!raw) return { v: 1, convs: [], msgs: {} };
    const p = JSON.parse(raw) as Partial<CacheShape> | null;
    return {
      v: 1,
      convs: Array.isArray(p?.convs) ? (p!.convs as AiConversation[]) : [],
      msgs: p?.msgs && typeof p.msgs === "object" ? (p.msgs as Record<string, AiMessage[]>) : {},
    };
  } catch {
    return { v: 1, convs: [], msgs: {} };
  }
}

function writeCache(next: CacheShape): void {
  if (!isClient()) return;
  // safeSet NUNCA lanza: ante cuota llena poda y, si no cabe, degrada a memoria.
  // La nube sigue siendo la fuente de verdad; la UI nunca se rompe por el caché.
  try {
    const convs = [...next.convs]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CONV_CAP);
    const keep = new Set(convs.map((c) => c.id));
    const msgs: Record<string, AiMessage[]> = {};
    for (const [k, list] of Object.entries(next.msgs)) {
      if (!keep.has(k)) continue;
      msgs[k] = list.slice(-MSG_CAP);
    }
    safeSet(AI_CONV_CACHE_KEY, JSON.stringify({ v: 1, convs, msgs }));
  } catch {
    /* serialización rara → la nube sigue siendo la fuente de verdad */
  }
}

/** Conversaciones en caché (más reciente primero). Instantáneo, SSR-safe. */
export function cachedConversations(): AiConversation[] {
  return readCache().convs.filter((c) => !c.archived).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Mensajes en caché de una conversación (orden temporal). */
export function cachedMessages(convId: string): AiMessage[] {
  if (!convId) return [];
  const list = readCache().msgs[convId] ?? [];
  return [...list].sort((a, b) => a.ts - b.ts);
}

function upsertConvCache(conv: AiConversation): void {
  const cache = readCache();
  const i = cache.convs.findIndex((c) => c.id === conv.id);
  if (i >= 0) cache.convs[i] = { ...cache.convs[i], ...conv };
  else cache.convs.push(conv);
  writeCache(cache);
  emit(AI_CONV_CHANGE_EVENT);
}

function removeConvCache(convId: string): void {
  const cache = readCache();
  cache.convs = cache.convs.filter((c) => c.id !== convId);
  delete cache.msgs[convId];
  writeCache(cache);
  emit(AI_CONV_CHANGE_EVENT);
}

/** Inserta un mensaje en la caché con DEDUPE por id y por `client_id`. */
function upsertMsgCache(msg: AiMessage): boolean {
  const cache = readCache();
  const list = cache.msgs[msg.convId] ?? [];
  const already = list.some(
    (m) =>
      m.id === msg.id ||
      (!!msg.clientId && m.clientId === msg.clientId) ||
      (m.role === msg.role && m.text === msg.text && Math.abs(m.ts - msg.ts) < 1500),
  );
  if (already) {
    // Puede venir de la nube con id real tras haberse guardado optimista: lo
    // reconciliamos (id definitivo) sin duplicar la burbuja.
    const i = list.findIndex((m) => !!msg.clientId && m.clientId === msg.clientId);
    if (i >= 0 && list[i].id !== msg.id) {
      list[i] = { ...list[i], id: msg.id };
      cache.msgs[msg.convId] = list;
      writeCache(cache);
      emit(AI_MSG_CHANGE_EVENT, { convId: msg.convId });
    }
    return false;
  }
  list.push(msg);
  cache.msgs[msg.convId] = list.sort((a, b) => a.ts - b.ts);
  // Toca la conversación (para el orden de la lista).
  const ci = cache.convs.findIndex((c) => c.id === msg.convId);
  if (ci >= 0) cache.convs[ci] = { ...cache.convs[ci], updatedAt: Math.max(cache.convs[ci].updatedAt, msg.ts) };
  writeCache(cache);
  emit(AI_MSG_CHANGE_EVENT, { convId: msg.convId });
  emit(AI_CONV_CHANGE_EVENT);
  return true;
}

// ── Conversación activa (compartida por TODAS las superficies) ───────────────
/**
 * Espejo EN MEMORIA del id activo. Si el `localStorage` está degradado (cuota
 * llena), el `setItem` no persiste, pero la sesión actual DEBE seguir sabiendo
 * cuál es el chat activo para que la UI cambie de vista al crear/abrir un chat.
 */
let memoryActiveId: string | null = null;

/** Id de la conversación activa en este dispositivo (o null). */
export function getActiveConversationId(): string | null {
  if (!isClient()) return null;
  // El espejo en memoria gana: refleja la última intención de esta sesión aunque
  // el disco no la haya podido persistir (safeGet ya superpone su propio overlay).
  const stored = safeGet(AI_CONV_ACTIVE_KEY);
  if (stored) return stored;
  return memoryActiveId;
}

/**
 * Flag de "Registro" por chat del menú unificado (Adenda 71-bis). El chat UI
 * lo actualiza al cambiar de chat activo; el grabador del Registro lo consulta
 * para no guardar cuando este chat lo tiene desactivado.
 */
let activeChatLogEnabled = true;
export function setActiveChatLogEnabled(v: boolean): void {
  activeChatLogEnabled = v;
}
export function isActiveChatLogEnabled(): boolean {
  return activeChatLogEnabled;
}

/**
 * Fija la conversación activa. **Es la clave de la unificación**: el orbe, el
 * mini-reproductor, el Exocórtex y `/agent` escriben TODOS en la conversación
 * activa, así que hablar por voz y escribir en `/agent` es la MISMA conversación.
 */
export function setActiveConversationId(id: string | null): void {
  if (!isClient()) return;
  // 1) Memoria SIEMPRE (fuente de verdad de la sesión aunque el disco esté lleno).
  memoryActiveId = id;
  // 2) Disco best-effort (safeSet/safeRemove nunca lanzan; degradan a memoria).
  if (id) safeSet(AI_CONV_ACTIVE_KEY, id);
  else safeRemove(AI_CONV_ACTIVE_KEY);
  // 3) Evento para que TODAS las superficies reaccionen aunque el storage falle.
  emit(AI_CONV_CHANGE_EVENT);
}

// ── Sesión ───────────────────────────────────────────────────────────────────
/** uid de la sesión (cookie, instantáneo — nunca `getUser()`, que es red). */
async function currentUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ── Mapeo fila ↔ modelo ──────────────────────────────────────────────────────
interface ConvRow {
  id: string;
  title: string | null;
  kind: string | null;
  persona: string | null;
  source: string | null;
  model: string | null;
  surface: string | null;
  profile_key: string | null;
  archived: boolean | null;
  folder: string | null;
  meta: any | null;
  created_at: string | null;
  updated_at: string | null;
}

interface MsgRow {
  id: string;
  chat_id: string | null;
  role: string | null;
  content: string | null;
  source: string | null;
  meta: unknown;
  attachments: unknown;
  client_id: string | null;
  created_at: string | null;
}

function toConv(r: ConvRow): AiConversation {
  const created = r.created_at ? Date.parse(r.created_at) : Date.now();
  const updated = r.updated_at ? Date.parse(r.updated_at) : created;
  return {
    id: r.id,
    title: r.title || "Conversación",
    kind: r.kind || "aurora",
    persona: r.persona,
    source: r.source,
    model: r.model,
    surface: r.surface,
    profileKey: r.profile_key,
    archived: !!r.archived,
    folder: r.folder ?? null,
    meta: r.meta ?? null,
    createdAt: Number.isFinite(created) ? created : Date.now(),
    updatedAt: Number.isFinite(updated) ? updated : Date.now(),
  };
}

function toMsg(r: MsgRow): AiMessage {
  const ts = r.created_at ? Date.parse(r.created_at) : Date.now();
  return {
    id: r.id,
    convId: r.chat_id || "",
    role: normalizeRole(r.role),
    text: r.content ?? "",
    ts: Number.isFinite(ts) ? ts : Date.now(),
    meta: (r.meta as AuroraMessageMeta | null) ?? null,
    attachments: Array.isArray(r.attachments) ? (r.attachments as unknown[]) : null,
    source: r.source,
    clientId: r.client_id,
  };
}

// ── Lectura desde la nube (SINGLE-FLIGHT anti-tormenta) ───────────────────────
/**
 * (Agente B1) Antes, N suscriptores (sidebar de /agent, Portal Nexus, Exocórtex,
 * orbe…) montaban a la vez y cada uno llamaba a `refreshConversations`, y CADA
 * `postgres_changes`/`live-signal` disparaba otra — de ahí los ~6 GET idénticos
 * a `aurora_conversations` por carga. Ahora:
 *   · SINGLE-FLIGHT: si hay una petición en vuelo, todos comparten ESA promesa.
 *   · TTL corto: dentro de la ventana, una llamada no forzada devuelve la caché
 *     sin volver a pegar a la red (colapsa ráfagas de montaje).
 *   · Los caminos de tiempo real usan `scheduleRefreshConversations()`, que hace
 *     UN refresco forzado con debounce (una ráfaga de cambios ⇒ 1 GET).
 */
const REFRESH_TTL_MS = 4000;
let refreshInflight: Promise<AiConversation[]> | null = null;
let lastRefreshAt = 0;
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchConversationsFromCloud(): Promise<AiConversation[]> {
  const uid = await currentUserId();
  if (!uid) return cachedConversations();
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("aurora_conversations")
      .select("id,title,kind,persona,source,model,surface,profile_key,archived,folder,meta,created_at,updated_at")
      .eq("user_id", uid)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(CONV_CAP);
    if (error || !data) return cachedConversations();
    const convs = (data as unknown as ConvRow[]).map(toConv);
    const cache = readCache();
    // (Adenda 71-bis · 2026-07-17) FUSIONAR nube + caché local, NO reemplazar.
    // Si un conv se creó en local y su insert en la nube aún no se confirmó
    // (o falló), debe seguir visible hasta que la nube lo confirme. El conv
    // en la nube gana en updatedAt; el local que no está en la nube se conserva.
    const cloudIds = new Set(convs.map((c) => c.id));
    const localOnly = cache.convs.filter((c) => !cloudIds.has(c.id));
    // Conserva el surface/kind local si la nube no lo trajo (p.ej. por gating de columnas).
    const merged = convs.map((c) => {
      const loc = cache.convs.find((x) => x.id === c.id);
      return loc ? { ...loc, ...c } : c;
    }).concat(localOnly);
    cache.convs = merged;
    writeCache(cache);
    emit(AI_CONV_CHANGE_EVENT);
    return merged;
  } catch {
    return cachedConversations();
  }
}

/**
 * Baja la lista de conversaciones y refresca la caché. Devuelve la lista.
 * @param force  Ignora el TTL (pero NO el single-flight): úsalo tras un cambio
 *               real (arranque, pull manual del usuario, ráfaga de realtime).
 */
export async function refreshConversations(force = false): Promise<AiConversation[]> {
  // Single-flight: cualquier llamada concurrente comparte la petición en vuelo.
  if (refreshInflight) return refreshInflight;
  // TTL: dentro de la ventana, una llamada no forzada no vuelve a pegar a la red.
  if (!force && Date.now() - lastRefreshAt < REFRESH_TTL_MS) {
    return cachedConversations();
  }
  refreshInflight = fetchConversationsFromCloud();
  try {
    return await refreshInflight;
  } finally {
    lastRefreshAt = Date.now();
    refreshInflight = null;
  }
}

/**
 * Refresco forzado con DEBOUNCE, para los caminos de tiempo real. Una ráfaga de
 * `postgres_changes`/`live-signal`/`BroadcastChannel` (p.ej. varios upserts
 * seguidos) colapsa en UN solo GET tras ~500 ms de calma.
 */
export function scheduleRefreshConversations(): void {
  if (!isClient()) return;
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    void refreshConversations(true);
  }, 500);
}

/** Baja los mensajes de una conversación y refresca la caché. */
export async function loadMessages(convId: string): Promise<AiMessage[]> {
  if (!convId) return [];
  const uid = await currentUserId();
  if (!uid) return cachedMessages(convId);
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("astraura_messages")
      .select("id,chat_id,role,content,source,meta,attachments,client_id,created_at")
      .eq("user_id", uid)
      .eq("chat_id", convId)
      .order("created_at", { ascending: true })
      .limit(MSG_CAP);
    if (error || !data) return cachedMessages(convId);
    const msgs = (data as unknown as MsgRow[]).map(toMsg);
    const cache = readCache();
    cache.msgs[convId] = msgs;
    writeCache(cache);
    emit(AI_MSG_CHANGE_EVENT, { convId });
    return msgs;
  } catch {
    return cachedMessages(convId);
  }
}

// ── Escritura ────────────────────────────────────────────────────────────────
export interface CreateConversationOptions {
  title?: string;
  kind?: string;
  persona?: string | null;
  surface?: AiSurface;
  source?: string | null;
  model?: string | null;
  /** Carpeta de chat destino (Adenda 71-ter). null/undefined = sin carpeta ("Todos"). */
  folder?: string | null;
}

/**
 * Crea una conversación (nube + caché) y la deja ACTIVA. Sin sesión, crea una
 * conversación **solo local** (misma forma, id uuid): al iniciar sesión, sus
 * mensajes se subirán igual porque `appendMessage` reintenta contra la nube.
 */
export async function createConversation(opts: CreateConversationOptions = {}): Promise<AiConversation> {
  const now = Date.now();
  const profileKey = activeProfileId();
  const local: AiConversation = {
    id: uuid(),
    title: opts.title || "Conversación",
    kind: opts.kind || "aurora",
    persona: opts.persona ?? null,
    source: opts.source ?? null,
    model: opts.model ?? null,
    surface: opts.surface ?? "orb",
    profileKey,
    folder: opts.folder ?? null,
    createdAt: now,
    updatedAt: now,
  };

  // (Agente B1 · createConversation IMPARABLE) Orden a prueba de storage lleno:
  //   1) caché local OPTIMISTA (safe: nunca lanza, degrada a memoria),
  //   2) activa YA (memoria + evento) → la UI cambia de vista al instante aunque
  //      el disco esté lleno y aunque la nube tarde o falle,
  //   3) insert en la nube SIEMPRE (await, con manejo de error real),
  //   4) al confirmar, reconcilia (mismo id) enriqueciendo fechas/meta.
  // La creación NUNCA vuelve a reventar por el caché local.
  upsertConvCache(local);
  setActiveConversationId(local.id);

  const uid = await currentUserId();
  if (uid) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("aurora_conversations")
        .insert({
          id: local.id,
          user_id: uid,
          // `profile_id` es uuid en la BD; los perfiles del OS usan ids libres.
          profile_id: profileKey && UUID_RE.test(profileKey) ? profileKey : null,
          profile_key: profileKey,
          title: local.title,
          kind: local.kind,
          persona: local.persona,
          source: local.source,
          model: local.model,
          surface: local.surface,
          folder: local.folder ?? null,
        })
        .select("id,title,kind,persona,source,model,surface,profile_key,archived,folder,meta,created_at,updated_at")
        .single();
      if (!error && data) {
        const conv = toConv(data as unknown as ConvRow);
        // El id es el MISMO que el local → reconcilia sin duplicar ni cambiar el activo.
        upsertConvCache(conv);
        void emitChange(AI_CHATS_TOPIC, {
          id: conv.id,
          updatedAt: new Date(conv.updatedAt).toISOString(),
          data: { convId: conv.id, kind: "conversation" },
        });
        return conv;
      }
      if (error) {
        // Error real de la nube: se registra (una vez es suficiente para diagnóstico)
        // pero NO se propaga — la conversación local ya está activa y usable.
        // eslint-disable-next-line no-console
        console.warn("[conversations] insert en nube falló; se conserva local", error.message ?? error);
      }
    } catch (e) {
      // Red caída / permisos: la conversación local sigue activa. Nunca lanzamos.
      // eslint-disable-next-line no-console
      console.warn("[conversations] insert en nube lanzó; se conserva local", (e as Error)?.message ?? e);
    }
  }

  return local;
}

/**
 * Devuelve la conversación en la que deben caer los mensajes nuevos:
 *   1. la ACTIVA, si existe y sigue viva;
 *   2. si no, la última usada, si es reciente (< ROLLOVER_HOURS de inactividad);
 *   3. si no, crea una nueva.
 * Es la función que hace que el orbe y `/agent` compartan hilo sin coordinarse.
 */
export async function ensureActiveConversation(opts: CreateConversationOptions = {}): Promise<AiConversation> {
  const activeId = getActiveConversationId();
  const cached = readCache().convs;
  if (activeId) {
    const found = cached.find((c) => c.id === activeId);
    if (found) return found;
    // Puede existir en la nube y no en esta caché (otro dispositivo): forzamos
    // (saltamos el TTL) porque buscamos un id concreto ya conocido.
    const cloud = await refreshConversations(true);
    const hit = cloud.find((c) => c.id === activeId);
    if (hit) return hit;
  }
  const last = [...cached].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (last && Date.now() - last.updatedAt < ROLLOVER_HOURS * 3600_000) {
    setActiveConversationId(last.id);
    return last;
  }
  return createConversation(opts);
}

export interface AppendMessageInput {
  role: AiRole | "aurora" | "agent";
  text: string;
  ts?: number;
  meta?: AuroraMessageMeta | null;
  source?: string | null;
  attachments?: unknown[] | null;
  /** Conversación destino. Por defecto, la ACTIVA (creándola si hace falta). */
  convId?: string;
  /** Superficie de origen (solo para la conversación nueva, si se crea). */
  surface?: AiSurface;
  /** Personalidad usada (solo para la conversación nueva, si se crea). */
  persona?: string | null;
  /** Tipo de conversación si hay que crearla ("aurora" | "astraura"). */
  kind?: string;
}

/**
 * Añade un mensaje a la conversación unificada. **Punto único de escritura.**
 * Optimista (caché primero) + nube detrás + señal en vivo. Nunca lanza.
 */
export async function appendMessage(input: AppendMessageInput): Promise<AiMessage | null> {
  if (!isClient()) return null;
  const text = (input.text ?? "").trim();
  if (!text) return null;

  const role = normalizeRole(input.role);
  const ts = Number.isFinite(input.ts) ? (input.ts as number) : Date.now();
  const clientId = clientIdFor(role, ts, text);

  // 1) Conversación destino (crea la primera si no hay ninguna).
  let convId = input.convId || getActiveConversationId();
  let conv: AiConversation | null = convId ? readCache().convs.find((c) => c.id === convId) ?? null : null;
  if (!convId || !conv) {
    conv = await ensureActiveConversation({
      title: role === "user" ? titleFromText(text) : "Conversación",
      kind: input.kind || "aurora",
      surface: input.surface,
      persona: input.persona ?? null,
    });
    convId = conv.id;
  }

  // 2) Optimista: la UI lo ve YA (id provisional = clientId).
  const optimistic: AiMessage = {
    id: `local:${clientId}`,
    convId,
    role,
    text,
    ts,
    meta: input.meta ?? null,
    attachments: input.attachments ?? null,
    source: input.source ?? input.meta?.provider ?? null,
    clientId,
  };
  const isNew = upsertMsgCache(optimistic);
  if (!isNew) return optimistic; // ya estaba (dedupe local) → no repetimos la nube

  // 3) Nube (best-effort, idempotente por client_id).
  const uid = await currentUserId();
  if (!uid) return optimistic;

  try {
    const supabase = createClient();
    // La conversación puede ser solo-local (creada sin sesión): la subimos ahora.
    const { data: existing } = await supabase
      .from("aurora_conversations")
      .select("id")
      .eq("id", convId)
      .maybeSingle();
    if (!existing) {
      const profileKey = conv?.profileKey ?? activeProfileId();
      await supabase.from("aurora_conversations").insert({
        id: convId,
        user_id: uid,
        profile_id: profileKey && UUID_RE.test(profileKey) ? profileKey : null,
        profile_key: profileKey,
        title: conv?.title ?? titleFromText(text),
        kind: conv?.kind ?? input.kind ?? "aurora",
        persona: conv?.persona ?? input.persona ?? null,
        surface: conv?.surface ?? input.surface ?? "orb",
      });
    }

    const { data, error } = await supabase
      .from("astraura_messages")
      .upsert(
        {
          user_id: uid,
          chat_id: convId,
          role,
          content: text,
          source: optimistic.source,
          meta: input.meta ?? null,
          attachments: input.attachments ?? null,
          client_id: clientId,
          created_at: new Date(ts).toISOString(),
        },
        { onConflict: "user_id,client_id", ignoreDuplicates: true },
      )
      .select("id,chat_id,role,content,source,meta,attachments,client_id,created_at")
      .maybeSingle();

    if (!error && data) {
      const saved = toMsg(data as unknown as MsgRow);
      upsertMsgCache(saved); // reconcilia el id definitivo (no duplica)
      void emitChange(AI_CHATS_TOPIC, {
        id: saved.id,
        updatedAt: new Date(saved.ts).toISOString(),
        data: { convId, kind: "message" },
      });
      // ── Adenda 70 · Puente Hermione ──
      // Si el mensaje es del usuario y la personalidad activa es Hermione, lo
      // reenviamos a la neurona servidor (esta Mac) que lo entrega a la sesión
      // Hermes viva. Degrada en silencio si la neurona no está online (Astraura
      // normal responde). Idempotente vía clientId.
      if (role === "user" && data.client_id) {
        const activeId = (() => {
          try {
            const raw = window.localStorage.getItem("starseed.aurora.personality.active.v1");
            const a = raw ? JSON.parse(raw) : null;
            return (a && (a.global ?? null)) || null;
          } catch { return null; }
        })();
        if (isHermioneActive(activeId)) {
          void forwardToHermioneNeuron({
            convId,
            msgId: saved.id,
            clientId: data.client_id as string,
            text,
            userId: uid,
            profileKey: conv?.profileKey ?? activeProfileId() ?? undefined,
          });
          // Sincronización por chat (Adenda 70): cada chat que usa Hermione se
          // registra con su MISMO nombre en TODAS las neuronas con Hermes, en
          // tiempo real. Se hace vía la RUTA SERVER (service role) porque el
          // cliente anónimo no puede escribir neuron_devices (RLS lo bloquea).
          const chatName = conv?.title ?? titleFromText(text);
          void fetch("/api/neurons/hermione/sync-chats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ convId, name: chatName }),
          }).catch(() => {});
        }
      }

      // ── Semantic Memory Categorization ──
      // Extraemos la memoria en segundo plano, sin bloquear el hilo.
      void import("@/lib/aurora/semantic-memory")
        .then(({ extractSemanticMemory }) => extractSemanticMemory(convId, cachedMessages(convId)))
        .catch(() => {});

      return saved;
    }
    // `ignoreDuplicates` con conflicto devuelve 0 filas: el mensaje YA estaba.
    void emitChange(AI_CHATS_TOPIC, { id: clientId, data: { convId, kind: "message" } });
  } catch {
    /* offline / sin permisos → la caché local ya lo tiene; nada se pierde */
  }
  return optimistic;
}

/** Renombra una conversación (nube + caché + señal). */
export async function renameConversation(convId: string, title: string): Promise<void> {
  const clean = (title ?? "").trim();
  if (!convId || !clean) return;
  const cache = readCache();
  const i = cache.convs.findIndex((c) => c.id === convId);
  if (i >= 0) {
    cache.convs[i] = { ...cache.convs[i], title: clean, updatedAt: Date.now() };
    writeCache(cache);
    emit(AI_CONV_CHANGE_EVENT);
  }
  const uid = await currentUserId();
  if (!uid) return;
  try {
    const supabase = createClient();
    await supabase
      .from("aurora_conversations")
      .update({ title: clean, updated_at: new Date().toISOString() })
      .eq("id", convId)
      .eq("user_id", uid);
    void emitChange(AI_CHATS_TOPIC, { id: convId, data: { convId, kind: "conversation" } });
  } catch {
    /* best-effort */
  }
}

/**
 * Parchea `meta.config` de una conversación SOLO en la caché local (optimista y
 * síncrono), para que `getChatConfig` y las superficies reflejen un cambio de
 * ajustes al instante mientras la nube lo confirma por realtime. Best-effort;
 * no toca `updatedAt` (un cambio de ajustes no reordena la lista). Nunca lanza.
 */
export function patchCachedConversationConfig(
  convId: string,
  config: Record<string, unknown>,
): void {
  if (!convId) return;
  try {
    const cache = readCache();
    const i = cache.convs.findIndex((c) => c.id === convId);
    if (i < 0) return;
    const prevMeta = (cache.convs[i].meta as Record<string, unknown> | null) ?? {};
    cache.convs[i] = { ...cache.convs[i], meta: { ...prevMeta, config } };
    writeCache(cache);
    emit(AI_CONV_CHANGE_EVENT);
  } catch {
    /* defensivo */
  }
}

/** Borra una conversación y sus mensajes (nube + caché + señal). */
export async function deleteConversation(convId: string): Promise<void> {
  if (!convId) return;
  removeConvCache(convId);
  if (getActiveConversationId() === convId) setActiveConversationId(null);
  const uid = await currentUserId();
  if (!uid) return;
  try {
    const supabase = createClient();
    await supabase.from("astraura_messages").delete().eq("user_id", uid).eq("chat_id", convId);
    await supabase.from("aurora_conversations").delete().eq("id", convId).eq("user_id", uid);
    void emitChange(AI_CHATS_TOPIC, { id: convId, data: { convId, kind: "conversation" } });
  } catch {
    /* best-effort */
  }
}

/** Abre una conversación NUEVA y la deja activa (botón «Nuevo chat»). */
export async function newConversation(opts: CreateConversationOptions = {}): Promise<AiConversation> {
  return createConversation({ title: "Nueva conversación", ...opts });
}

// ── Helpers de menú contextual (Adenda 76 · duplicar/ramificar/mover/fijar) ───

/** ¿Está fijada la conversación? (meta.config.pinned). Síncrono. */
export function isConversationPinned(conv: AiConversation | null | undefined): boolean {
  const cfg = (conv?.meta as { config?: { pinned?: boolean } } | null | undefined)?.config;
  return !!cfg?.pinned;
}

/** Compara para ordenar: fijadas arriba, luego por updatedAt desc. */
export function pinnedThenRecent(a: AiConversation, b: AiConversation): number {
  const pa = isConversationPinned(a) ? 1 : 0;
  const pb = isConversationPinned(b) ? 1 : 0;
  if (pa !== pb) return pb - pa;
  return b.updatedAt - a.updatedAt;
}

/** Escribe `meta.config` de una conversación (nube + caché + señal). Best-effort. */
async function writeConversationConfig(convId: string, config: Record<string, unknown>): Promise<void> {
  patchCachedConversationConfig(convId, config); // optimista, síncrono
  const uid = await currentUserId();
  if (!uid) return;
  try {
    const supabase = createClient();
    const { data } = await supabase.from("aurora_conversations").select("meta").eq("id", convId).maybeSingle();
    const meta = ((data?.meta as Record<string, unknown>) || {}) as Record<string, unknown>;
    meta.config = config;
    await supabase.from("aurora_conversations").update({ meta }).eq("id", convId).eq("user_id", uid);
    void emitChange(AI_CHATS_TOPIC, { id: convId, data: { convId, kind: "conversation" } });
  } catch {
    /* best-effort */
  }
}

/** Fija/desfija una conversación (meta.config.pinned) — ordena arriba en su folder. */
export async function setConversationPinned(convId: string, pinned: boolean): Promise<void> {
  if (!convId) return;
  const conv = readCache().convs.find((c) => c.id === convId);
  const prevCfg = ((conv?.meta as { config?: Record<string, unknown> } | null)?.config) || {};
  await writeConversationConfig(convId, { ...prevCfg, pinned });
}

/** Mueve una conversación a una carpeta (o null = sin carpeta). Nube + caché + señal. */
export async function moveConversationToFolder(convId: string, folder: string | null): Promise<void> {
  if (!convId) return;
  const cache = readCache();
  const i = cache.convs.findIndex((c) => c.id === convId);
  if (i >= 0) {
    cache.convs[i] = { ...cache.convs[i], folder: folder ?? null };
    writeCache(cache);
    emit(AI_CONV_CHANGE_EVENT);
  }
  const uid = await currentUserId();
  if (!uid) return;
  try {
    const supabase = createClient();
    await supabase.from("aurora_conversations").update({ folder: folder ?? null }).eq("id", convId).eq("user_id", uid);
    void emitChange(AI_CHATS_TOPIC, { id: convId, data: { convId, kind: "conversation" } });
  } catch {
    /* best-effort */
  }
}

/** Exporta una conversación a Markdown (para "Copiar" al portapapeles). */
export function conversationMarkdown(convId: string): string {
  try {
    const conv = readCache().convs.find((c) => c.id === convId);
    const msgs = cachedMessages(convId).filter((m) => m.role !== "system" && m.text?.trim());
    const lines: string[] = [`# ${conv?.title ?? "Conversación"}`, ""];
    for (const m of msgs) {
      const who = m.role === "user" ? "Tú" : "Astraura";
      lines.push(`**${who}:** ${m.text.trim()}`, "");
    }
    return lines.join("\n").trim();
  } catch {
    return "";
  }
}

/**
 * Duplica o RAMIFICA una conversación: crea una nueva copiando el historial
 * hasta ahora (mensajes no-system). `branch` solo cambia el título por defecto y
 * mantiene la referencia al origen en meta.config.branchedFrom.
 */
export async function forkConversation(
  convId: string,
  opts: { branch?: boolean; title?: string; surface?: AiSurface } = {},
): Promise<AiConversation | null> {
  if (!convId) return null;
  const src = readCache().convs.find((c) => c.id === convId);
  if (!src) return null;
  const baseTitle = src.title || "Conversación";
  const title = opts.title || (opts.branch ? `Rama de ${baseTitle}` : `Copia de ${baseTitle}`);
  const created = await createConversation({
    title,
    kind: src.kind || "aurora",
    surface: opts.surface ?? (src.surface as AiSurface) ?? "agent",
    persona: src.persona ?? null,
    folder: src.folder ?? null,
  });
  // Copia el historial (respeta el orden temporal). Idempotente por client_id.
  const history = cachedMessages(convId).filter((m) => m.role !== "system" && m.text?.trim());
  for (const m of history) {
    // eslint-disable-next-line no-await-in-loop
    await appendMessage({ role: m.role, text: m.text, ts: m.ts, convId: created.id, meta: m.meta ?? null });
  }
  // Hereda la config del chat (personalidad/proveedor/sentidos…) + marca de origen.
  const srcCfg = ((src.meta as { config?: Record<string, unknown> } | null)?.config) || {};
  await writeConversationConfig(created.id, {
    ...srcCfg,
    pinned: false,
    sharedWith: undefined,
    sharedSpaceId: undefined,
    branchedFrom: opts.branch ? convId : undefined,
  });
  return created;
}

/** Duplica una conversación (copia completa del historial). */
export async function duplicateConversation(convId: string, surface?: AiSurface): Promise<AiConversation | null> {
  return forkConversation(convId, { branch: false, surface });
}

/** Ramifica una conversación (nueva rama a partir del historial actual). */
export async function branchConversation(convId: string, surface?: AiSurface): Promise<AiConversation | null> {
  return forkConversation(convId, { branch: true, surface });
}

// ── Migración del historial legado (`starseed.aurora.chatlog.v1`) ────────────
/**
 * Sube UNA VEZ el registro local de Aurora a la nube, agrupado por día (que es
 * exactamente como se guardaba). Idempotente de verdad: cada mensaje lleva un
 * `client_id` DETERMINISTA, así que reejecutarla —o migrar desde dos
 * dispositivos a la vez— no duplica ni un solo mensaje.
 *
 * No borra nada del registro local: sigue siendo la caché/offline.
 */
export async function migrateLegacyChatLog(): Promise<{ conversations: number; messages: number }> {
  if (!isClient()) return { conversations: 0, messages: 0 };
  const uid = await currentUserId();
  if (!uid) return { conversations: 0, messages: 0 };

  // Import diferido: `aurora-chat-log` importa a su vez este módulo (ciclo).
  const { readAuroraChatSessions } = await import("@/lib/aurora/aurora-chat-log");
  const sessions = readAuroraChatSessions();
  if (sessions.length === 0) return { conversations: 0, messages: 0 };

  const supabase = createClient();
  const profileKey = activeProfileId();
  let convCount = 0;
  let msgCount = 0;

  for (const s of sessions) {
    if (!s.entries.length) continue;
    // Id DETERMINISTA por día → dos dispositivos migran a la MISMA conversación.
    const convId = dayConversationUuid(uid, s.day);
    const first = s.entries[0];
    const firstUser = s.entries.find((e) => e.role === "user");
    const title = firstUser ? titleFromText(firstUser.text) : `Aurora · ${s.day}`;

    try {
      const { error: convErr } = await supabase.from("aurora_conversations").upsert(
        {
          id: convId,
          user_id: uid,
          profile_id: profileKey && UUID_RE.test(profileKey) ? profileKey : null,
          profile_key: profileKey,
          title,
          kind: "aurora",
          surface: "orb",
          created_at: new Date(first.ts).toISOString(),
          updated_at: new Date(s.entries[s.entries.length - 1].ts).toISOString(),
          meta: { migratedFrom: "starseed.aurora.chatlog.v1", day: s.day },
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (convErr) continue;
      convCount++;

      const rows = s.entries
        .filter((e) => (e.text ?? "").trim())
        .map((e) => ({
          user_id: uid,
          chat_id: convId,
          role: normalizeRole(e.role),
          content: e.text,
          source: e.meta?.provider ?? null,
          meta: e.meta ?? null,
          client_id: clientIdFor(e.role, e.ts, e.text),
          created_at: new Date(e.ts).toISOString(),
        }));

      // Bloques de 100: el `ON CONFLICT DO NOTHING` hace que reintentar sea gratis.
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { data, error } = await supabase
          .from("astraura_messages")
          .upsert(chunk, { onConflict: "user_id,client_id", ignoreDuplicates: true })
          .select("id");
        if (!error && data) msgCount += data.length;
      }
    } catch {
      /* un día que falle no debe abortar la migración entera */
    }
  }

  // Flag LOCAL (best-effort; puede degradar a memoria si el disco está lleno).
  safeSet(
    AI_CONV_MIGRATED_KEY,
    JSON.stringify({ at: Date.now(), conversations: convCount, messages: msgCount }),
  );
  // Flag EN NUBE: el backfill del chatlog v1 no se vuelve a intentar en NINGÚN
  // dispositivo (guard real, persistido, no dependiente del localStorage local).
  await setChatlogMigratedInCloud();
  migrationDone = true;
  if (convCount) {
    await refreshConversations(true);
    void emitChange(AI_CHATS_TOPIC, { data: { kind: "conversation" } });
  }
  return { conversations: convCount, messages: msgCount };
}

// ── Guard REAL del backfill (memoria + nube) ─────────────────────────────────
/**
 * (Agente B1 · fin de la tormenta) El backfill del chatlog legado se re-ejecutaba
 * EN CADA CARGA (9-10 upserts a `aurora_conversations` sin que el usuario tocara
 * nada) porque su único flag era un `localStorage.setItem` que, con el disco
 * lleno, NUNCA persistía. Ahora el flag vive EN LA NUBE (`user_settings.prefs`),
 * más un guard en memoria por sesión, así que la migración corre COMO MUCHO una
 * vez por cuenta.
 */
let migrationChecked = false;
let migrationDone = false;

/** ¿Dice la nube que el chatlog v1 ya se migró? (best-effort; false si no se sabe). */
async function isChatlogMigratedInCloud(): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("user_settings")
      .select("prefs")
      .eq("user_id", uid)
      .maybeSingle();
    const prefs = (data?.prefs ?? {}) as { migrations?: { chatlogV1?: boolean } };
    return prefs.migrations?.chatlogV1 === true;
  } catch {
    return false;
  }
}

/** Marca en la nube que el chatlog v1 ya se migró (parche atómico, sin pisar nada). */
async function setChatlogMigratedInCloud(): Promise<void> {
  try {
    await mergeUserPrefs({ migrations: { chatlogV1: true } });
  } catch {
    /* best-effort: el guard en memoria evita re-subir en esta sesión igualmente */
  }
}

/**
 * Ejecuta la migración del chatlog legado COMO MUCHO una vez:
 *   · guard en memoria por sesión (varias superficies arrancan el sync),
 *   · flag LOCAL rápido (si persistió),
 *   · flag EN NUBE (verdad compartida entre dispositivos).
 * Si ya está hecha, no sube ni un solo upsert. Nunca lanza.
 */
export async function maybeMigrateLegacyChatLog(): Promise<void> {
  if (migrationDone || migrationChecked) return;
  migrationChecked = true;
  try {
    // Camino rápido: flag local presente (barato, síncrono).
    if (safeGet(AI_CONV_MIGRATED_KEY)) {
      migrationDone = true;
      return;
    }
    // Verdad compartida: ¿la nube ya lo marcó (otro dispositivo)?
    if (await isChatlogMigratedInCloud()) {
      migrationDone = true;
      safeSet(AI_CONV_MIGRATED_KEY, JSON.stringify({ cloud: true, at: Date.now() }));
      return;
    }
    // No consta hecho en ningún sitio → migra (idempotente por client_id) UNA vez.
    await migrateLegacyChatLog();
  } catch {
    // Si falla, permitimos reintento en la próxima sesión (no marcamos done).
    migrationChecked = false;
  }
}

/**
 * uuid v5-like DETERMINISTA (uid + día) — no criptográfico, solo estable: dos
 * dispositivos que migran el mismo día producen el MISMO id de conversación, y
 * el `upsert ... ignoreDuplicates` hace el resto.
 */
function dayConversationUuid(uid: string, day: string): string {
  const seed = `${uid}|${day}`;
  // 4 hashes de 32 bits → 128 bits.
  const h: number[] = [];
  for (let k = 0; k < 4; k++) {
    let x = 2166136261 ^ (k * 0x9e3779b9);
    for (let i = 0; i < seed.length; i++) {
      x ^= seed.charCodeAt(i);
      x = Math.imul(x, 16777619) >>> 0;
    }
    h.push(x >>> 0);
  }
  const hex = h.map((n) => n.toString(16).padStart(8, "0")).join("");
  // Sellamos versión 8 (custom) y variante RFC-4122 → uuid válido para Postgres.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ── Motor de sincronización (singleton por pestaña + cross-tab) ───────────────
const SYNC_FLAG = "__STARSEED_AI_CHATS_SYNC__";
// BroadcastChannel nativo: propaga cambios ENTRE PESTAÑAS del mismo origen (el
// postgres_changes llega por dispositivo, no por pestaña; sin esto, escribir en
// la pestaña A no aparecía en la pestaña B hasta recargar).
const TAB_SYNC = "starseed:ai-chats-tab";

function tabChannel(): BroadcastChannel | null {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
    try {
        return new BroadcastChannel(TAB_SYNC);
    } catch {
        return null;
    }
}

/**
 * Arranca (una sola vez) la sincronización en vivo de las conversaciones:
 *   · pull de arranque (lista + mensajes de la conversación activa),
 *   · migración del `chatlog` legado (idempotente),
 *   · `postgres_changes` sobre `astraura_messages` y `aurora_conversations`,
 *   · `live-signal` (broadcast del canal de cuenta) — camino rápido entre dispositivos,
 *   · `BroadcastChannel` — camino rápido ENTRE PESTAÑAS del mismo navegador.
 * Idempotente y SSR-safe.
 */
export function startAiChatSync(): void {
    if (!isClient()) return;
    const w = window as unknown as Record<string, unknown>;
    if (w[SYNC_FLAG]) return;
    w[SYNC_FLAG] = true;

    let bc: BroadcastChannel | null = null;
    try {
        bc = tabChannel();
    } catch {
        bc = null;
    }

    const boot = async () => {
        const uid = await currentUserId();
        if (!uid) return;

        // (Adenda 71 · 2026-07-17) Catálogo VIVO de OpenRouter (:free):
        // arranca el refresco automático (enganche al sistema de auto-update del
        // OS) y aplica el override sobre FREE_CATALOG. Así Aurora, Hermione y
        // CUALQUIER personalidad que use `openrouter-free` ven los modelos
        // reales de hoy — y los ajustes de personalidad POR ÁREA (intelligence
        // → porSentido) se rellenan solos con el catálogo vivo. Best-effort.
        try {
            const live = await import("@/ai/astraura/openrouter-live-catalog");
            live.startLiveCatalog();
            const { applyLiveOpenRouter } = await import("@/ai/astraura/free-catalog");
            await applyLiveOpenRouter();
            // (Adenda 71-bis) Sistema UNIFICADO adaptativo: registra las
            // fuentes instaladas desde la Biblioteca y resuelve el pin "auto"
            // de personalidad por área con el mejor :free del ecosistema.
            const { startUnifiedIntelligence } = await import("@/ai/astraura/unified-intelligence");
            startUnifiedIntelligence();
        } catch {
            /* sin red: el catálogo estático ya es válido */
        }

        await refreshConversations(true);
        const active = getActiveConversationId();
        if (active) await loadMessages(active);
        // Migración del historial legado: COMO MUCHO una vez por cuenta (guard en
        // nube + memoria). Ya no re-sube upserts en cada carga.
        try {
            await maybeMigrateLegacyChatLog();
        } catch {
            /* nunca bloquea el arranque */
        }

        // Camino 1 — postgres_changes (red de seguridad, entre dispositivos).
        onTableChange<MsgRow>("astraura_messages", { filter: `user_id=eq.${uid}`, event: "INSERT" }, (p) => {
            const row = p.new;
            if (!row?.chat_id) return;
            upsertMsgCache(toMsg(row));
            // Reflejar también en las otras pestañas de este navegador.
            bc?.postMessage({ kind: "message", convId: row.chat_id });
        });
        onTableChange<ConvRow>("aurora_conversations", { filter: `user_id=eq.${uid}`, event: "*" }, () => {
            // Debounce forzado: una ráfaga de cambios ⇒ 1 GET (no una tormenta).
            scheduleRefreshConversations();
            bc?.postMessage({ kind: "conversation" });
        });

        // Camino 2 — live-signal (broadcast inmediato en el canal de cuenta).
        onChange(AI_CHATS_TOPIC, (change) => {
            const data = (change.data ?? {}) as { convId?: string; kind?: string };
            if (data.kind === "conversation" || !data.convId) {
                scheduleRefreshConversations();
                return;
            }
            void loadMessages(data.convId);
        });

        // Camino 3 — BroadcastChannel (entre pestañas del mismo navegador).
        if (bc) {
            bc.onmessage = (ev: MessageEvent) => {
                const d = ev.data as { kind?: string; convId?: string } | null;
                if (!d) return;
                if (d.kind === "conversation" || !d.convId) {
                    scheduleRefreshConversations();
                    return;
                }
                void loadMessages(d.convId);
            };
        }
    };

    void boot();

    // Al iniciar/cerrar sesión, rehacemos el arranque.
    try {
        const supabase = createClient();
        supabase.auth.onAuthStateChange(() => {
            void boot();
        });
    } catch {
        /* defensivo */
    }
}

// ── Hooks ────────────────────────────────────────────────────────────────────
export interface UseAiConversations {
  conversations: AiConversation[];
  activeId: string | null;
  setActive: (id: string | null) => void;
  create: (opts?: CreateConversationOptions) => Promise<AiConversation>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Lista de conversaciones (nube + caché), en vivo. */
export function useAiConversations(): UseAiConversations {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!isClient()) return;
    startAiChatSync();
    const refresh = () => {
      setConversations(cachedConversations());
      // Solo actualizamos activeId si localStorage tiene un id válido DIFERENTE al actual.
      // Nunca reseteamos a null si ya teníamos un activeId (evita "reinicio" durante respuesta).
      const stored = getActiveConversationId();
      if (stored) {
        setActiveId((current) => current !== stored ? stored : current);
      }
    };
    refresh();
    void refreshConversations().then(refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === AI_CONV_CACHE_KEY || e.key === AI_CONV_ACTIVE_KEY) refresh();
    };
    window.addEventListener(AI_CONV_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AI_CONV_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setActive = useCallback((id: string | null) => {
    setActiveConversationId(id);
    setActiveId(id);
    if (id) void loadMessages(id);
  }, []);

  const create = useCallback(async (opts?: CreateConversationOptions) => {
    const conv = await newConversation(opts);
    setActiveId(conv.id);
    setConversations(cachedConversations());
    return conv;
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    await renameConversation(id, title);
    setConversations(cachedConversations());
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations(cachedConversations());
    setActiveId(getActiveConversationId());
  }, []);

  const refresh = useCallback(async () => {
    await refreshConversations(true); // pull manual del usuario: salta el TTL
    setConversations(cachedConversations());
  }, []);

  return { conversations, activeId, setActive, create, rename, remove, refresh };
}

/** Mensajes de una conversación (nube + caché), en vivo. */
export function useAiMessages(convId: string | null): AiMessage[] {
  const [messages, setMessages] = useState<AiMessage[]>([]);

  useEffect(() => {
    if (!isClient() || !convId) {
      setMessages([]);
      return;
    }
    startAiChatSync();
    const refresh = () => setMessages(cachedMessages(convId));
    refresh();
    void loadMessages(convId).then(refresh);
    const onMsg = (e: Event) => {
      const d = (e as CustomEvent<{ convId?: string }>).detail;
      if (!d?.convId || d.convId === convId) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === AI_CONV_CACHE_KEY) refresh();
    };
    window.addEventListener(AI_MSG_CHANGE_EVENT, onMsg);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AI_MSG_CHANGE_EVENT, onMsg);
      window.removeEventListener("storage", onStorage);
    };
  }, [convId]);

  return useMemo(() => messages, [messages]);
}

export default useAiConversations;
