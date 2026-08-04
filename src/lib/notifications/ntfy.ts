"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — CLIENTE ntfy (notificaciones push por dispositivo)
 * ---------------------------------------------------------------------------
 * ntfy (https://ntfy.sh · FOSS, Apache-2.0/GPLv2) es un servicio pub-sub sobre
 * HTTP simple: se publica con POST/PUT a un tópico y cualquier suscriptor de
 * ese tópico (app Android/iOS, navegador, curl…) recibe el mensaje al vuelo.
 * Su CORS está TOTALMENTE abierto (`access-control-allow-origin: *`, verificado
 * contra `ntfy.sh`), así que este cliente publica y se suscribe DIRECTO desde
 * el navegador — sin backend propio ni proxy.
 *
 * PIEZAS:
 *   · `getNtfySettings()/setNtfySettings()` — ajustes locales (servidor, token,
 *     tópicos derivados, interruptores), clave `starseed.ntfy.settings.v1`.
 *   · `deriveTopic()/accountTopicFor()/deviceTopicFor()` — tópicos NO
 *     adivinables. En ntfy sin ACL el nombre del tópico ES la contraseña de
 *     lectura/escritura ("the topic is essentially a password" — doc oficial).
 *   · `resolveNtfyTopics()` — resuelve y CACHEA en los ajustes el tópico de
 *     cuenta y el de esta neurona (evita recalcular el hash en cada uso).
 *   · `publish()` — publica por POST JSON a la RAÍZ del servidor (el modo JSON
 *     de ntfy exige postear a `<server>`, NUNCA a `<server>/<topic>`).
 *   · `subscribe()` — se suscribe por SSE (`EventSource`) a uno o varios
 *     tópicos; si `mirrorToInApp` está activo, espeja cada mensaje al Centro de
 *     Notificaciones del OS vía `notifyFromApp()` (app-notify.ts). ntfy se
 *     INTEGRA en el sistema in-app existente, no lo sustituye.
 *   · `startNtfyBridge()` — arranca (idempotente) el puente cuenta+neurona;
 *     pensado para montarse una vez en el layout raíz (cableado pendiente,
 *     fuera del alcance de este archivo).
 *   · `testNtfy()` — publica un mensaje de prueba para verificar la conexión.
 *
 * HONESTIDAD (ver `claude/investigacion-tecnica-ntfy-2026-08-04.md` del
 * proyecto — investigación verificada contra `docs.ntfy.sh` + comprobación
 * empírica de CORS):
 *   · `ntfy.sh` público CACHEA los mensajes en texto plano en su servidor
 *     (12h por defecto) y sus logs incluyen tópico + IP. NO es privado. Para
 *     avisos sensibles usa un servidor propio (self-host) con
 *     `auth-default-access: deny-all` — ver el SOP `architecture/notificaciones-ntfy.md`.
 *   · Los tópicos aquí se derivan con SHA-256 PLANO en el cliente (no un HMAC
 *     con secreto de servidor que nunca llega al navegador) — ver el aviso en
 *     `deriveTopic()`. Suficiente para no ser adivinado a simple vista; no es
 *     la derivación ideal (documentada como mejora futura en el SOP).
 *   · Este archivo NUNCA lanza: toda función pública devuelve un resultado
 *     defensivo (`{ok:false,...}` / `null` / limpieza no-op) ante cualquier
 *     fallo, y es SSR-safe (`typeof window`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { thisDeviceId } from "@/lib/neurons/neurons";
import { notifyFromApp, type AppNotifyLevel } from "@/lib/notifications/app-notify";

/* ─────────────────────────── Claves y eventos ─────────────────────────── */

/** Ajustes locales de ntfy (⚠️ para viajar con la cuenta, añadir a SYNCED_KEYS
 *  en `settings-sync.ts` — ver nota en el SOP; este archivo NO lo edita). */
export const NTFY_SETTINGS_KEY = "starseed.ntfy.settings.v1";
/** Evento del DOM emitido al cambiar los ajustes de ntfy (refresca la UI). */
export const NTFY_EVENT = "starseed:ntfy";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

/** Mismos 4 niveles que `notifyFromApp` (reexport de conveniencia: mantiene
 *  el «espejo» hacia el sistema in-app sincronizado por construcción). */
export type NtfyLevel = AppNotifyLevel;

export type NtfyPriority = 1 | 2 | 3 | 4 | 5;

export interface NtfySettings {
  enabled: boolean;
  /** Servidor ntfy (propio o público). Por defecto "https://ntfy.sh". */
  server: string;
  /** Tópico de cuenta, cacheado tras la primera derivación. */
  accountTopic?: string;
  /** deviceId → tópico de esa neurona, cacheados tras derivarse. */
  deviceTopics?: Record<string, string>;
  /** Token de acceso opcional (`tk_...`), solo para servidores propios con auth. */
  token?: string;
  /** Permite publicar directamente desde este navegador (además de suscribirse). */
  publishFromBrowser: boolean;
  /** Espeja cada mensaje recibido al Centro de Notificaciones del OS. */
  mirrorToInApp: boolean;
}

/** `event` de un mensaje de ntfy (lista oficial completa). */
export type NtfyEventType =
  | "open"
  | "keepalive"
  | "message"
  | "message_delete"
  | "message_clear"
  | "poll_request"
  | string;

export interface NtfyAction {
  action: string;
  label: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  intent?: string;
  extras?: Record<string, string>;
  clear?: boolean;
}

export interface NtfyAttachment {
  name: string;
  url: string;
  type?: string;
  size?: number;
  expires?: number;
}

/** Mensaje tal como lo entrega ntfy por SSE/JSON/WS (formato oficial). */
export interface NtfyMessage {
  id: string;
  time: number;
  expires?: number;
  event: NtfyEventType;
  /** Tópico(s); lista separada por comas solo en el evento "open". */
  topic: string;
  message?: string;
  title?: string;
  tags?: string[];
  priority?: NtfyPriority;
  click?: string;
  actions?: NtfyAction[];
  attachment?: NtfyAttachment;
}

export interface NtfyPublishInput {
  /** Tópico destino. Si se omite, se usa el derivado de `scope`. */
  topic?: string;
  title: string;
  message?: string;
  priority?: NtfyPriority;
  tags?: string[];
  click?: string;
  /** Nivel → prioridad/etiqueta por defecto si no se fijan a mano. */
  level?: NtfyLevel;
  /** Con qué tópico derivado publicar si no se pasa `topic`. Por defecto "account". */
  scope?: "account" | "device";
}

export interface NtfyPublishResult {
  ok: boolean;
  error?: string;
}

export interface NtfySubscribeOptions {
  /** Filtro `since` de ntfy: duración ("10m"), timestamp Unix, id, "all"/"latest". */
  since?: string;
}

export interface NtfyTopics {
  accountId: string | null;
  deviceId: string;
  accountTopic: string | null;
  deviceTopic: string | null;
}

/* ────────────────────────── Utilidades SSR-safe ───────────────────────── */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/* ─────────────────────────── Ajustes (settings) ────────────────────────── */

const DEFAULT_NTFY_SETTINGS: NtfySettings = {
  enabled: false, // opt-in explícito: no publica ni se suscribe a nada sin que el usuario lo active
  server: "https://ntfy.sh",
  publishFromBrowser: true,
  mirrorToInApp: true,
};

function normalizeServer(raw: string): string {
  const trimmed = (raw || "").trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_NTFY_SETTINGS.server;
}

function sanitizeDeviceTopics(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" && val) out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

function emitChanged(): void {
  if (!isClient()) return;
  try { window.dispatchEvent(new Event(NTFY_EVENT)); } catch { /* noop */ }
}

/** Ajustes de ntfy con los DEFAULTS aplicados (nunca lanza). */
export function getNtfySettings(): NtfySettings {
  const raw = readJson<Record<string, unknown>>(NTFY_SETTINGS_KEY);
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NTFY_SETTINGS };
  return {
    enabled: raw.enabled === true,
    server: typeof raw.server === "string" && raw.server.trim() ? normalizeServer(raw.server) : DEFAULT_NTFY_SETTINGS.server,
    accountTopic: typeof raw.accountTopic === "string" && raw.accountTopic ? raw.accountTopic : undefined,
    deviceTopics: sanitizeDeviceTopics(raw.deviceTopics),
    token: typeof raw.token === "string" && raw.token ? raw.token : undefined,
    publishFromBrowser: raw.publishFromBrowser === false ? false : true,
    mirrorToInApp: raw.mirrorToInApp === false ? false : true,
  };
}

/**
 * Mezcla (merge no destructivo) un parche de ajustes de ntfy y lo persiste.
 * `deviceTopics` se funde en profundidad (no borra tópicos de otras neuronas).
 * Emite `NTFY_EVENT`. Devuelve los ajustes ya fusionados. Nunca lanza.
 */
export function setNtfySettings(patch: Partial<NtfySettings>): NtfySettings {
  const prev = getNtfySettings();
  const merged: NtfySettings = { ...prev, ...patch };
  if (patch.server !== undefined) merged.server = normalizeServer(patch.server);
  if (patch.token !== undefined) {
    const t = (patch.token || "").trim();
    merged.token = t ? t : undefined;
  }
  if (patch.accountTopic !== undefined) merged.accountTopic = patch.accountTopic || undefined;
  if (patch.deviceTopics !== undefined) {
    merged.deviceTopics = { ...(prev.deviceTopics || {}), ...patch.deviceTopics };
  }
  writeJson(NTFY_SETTINGS_KEY, merged);
  emitChanged();
  return merged;
}

/** Suscripción a cambios de ajustes (local + entre pestañas). */
export function subscribeNtfySettings(cb: () => void): () => void {
  if (!isClient()) return () => {};
  const onStorage = (e: StorageEvent) => { if (!e.key || e.key === NTFY_SETTINGS_KEY) cb(); };
  window.addEventListener(NTFY_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(NTFY_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* ───────────────────── Derivación de tópicos (hash) ────────────────────── */

const TOPIC_PREFIX = "ss-";
const TOPIC_HASH_CHARS = 16; // ~64 bits recortados: no adivinable a simple vista, y dentro del límite de 64 chars de ntfy

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/**
 * Hash NO criptográfico de reserva (variante de cyrb53), SOLO para cuando
 * `crypto.subtle` no está disponible: navegador muy antiguo o, sobre todo, un
 * *contexto no seguro* (http:// que no sea localhost — Web Crypto exige un
 * "secure context", y este OS puede correr en LAN casera por http://). Es
 * determinista y suficiente para que el tópico no sea obvio a simple vista,
 * pero es MÁS DÉBIL que SHA-256 — por eso es solo el plan B, nunca la vía normal.
 */
function fallbackHash(str: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Deriva un tópico de ntfy NO adivinable a partir de una semilla (p. ej. el id
 * de cuenta) y una sal (p. ej. "account" o "device:<id>"): SHA-256(seed·salt) →
 * hex, recortado a ~16 caracteres, con el prefijo legible "ss-" (StarSeed).
 *
 * ⚠️ HONESTIDAD (ver `claude/investigacion-tecnica-ntfy-2026-08-04.md` del
 * proyecto y `architecture/notificaciones-ntfy.md` §"Límites honestos"): esto es
 * SHA-256 PLANO en el cliente, NO un HMAC con secreto de servidor. Quien conozca
 * el id de cuenta (uuid interno) Y este algoritmo podría recalcular el mismo
 * tópico. El id de cuenta (uuid v4, ~122 bits) no es trivial de adivinar, así
 * que esto no es tan débil como elegir un nombre de tópico a mano — pero la
 * derivación ideal (HMAC-SHA256 con un secreto que NUNCA llega al navegador,
 * resuelto por un Route Handler que valida la sesión) queda como mejora futura,
 * no implementada aquí. Nunca lanza: si Web Crypto no está disponible, cae a un
 * hash NO criptográfico determinista (más débil, pero el tópico nunca queda sin
 * definir).
 */
export async function deriveTopic(seed: string, salt: string): Promise<string> {
  const input = `starseed::ntfy::${seed || "anon"}::${salt || ""}`;
  let hex: string;
  try {
    if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest("SHA-256", data);
      hex = bytesToHex(new Uint8Array(digest));
    } else {
      hex = fallbackHash(input);
    }
  } catch {
    hex = fallbackHash(input);
  }
  return `${TOPIC_PREFIX}${hex.slice(0, TOPIC_HASH_CHARS)}`;
}

/** Tópico de la CUENTA (recibe todos los avisos, de cualquier neurona). */
export async function accountTopicFor(accountId: string): Promise<string> {
  return deriveTopic(accountId, "account");
}

/** Tópico de UNA neurona concreta de la cuenta (namespaced por cuenta+dispositivo). */
export async function deviceTopicFor(accountId: string, deviceId: string): Promise<string> {
  return deriveTopic(accountId, `device:${deviceId || "unknown"}`);
}

/* ──────────────────── Resolución de cuenta + tópicos ───────────────────── */

/**
 * Id de la cuenta StarSeed activa, o null sin sesión. Sesión primero (lectura
 * de cookie, sin red), `getUser()` de respaldo — mismo camino rápido que
 * `settings-sync.ts` (`getUserId`). Nunca lanza.
 */
async function getAccountId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const fromSession = sessionData?.session?.user?.id ?? null;
    if (fromSession) return fromSession;
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resuelve el tópico de cuenta y el de ESTA neurona, derivándolos (y
 * cacheándolos en `NtfySettings`) solo si todavía no existían. Sin sesión
 * StarSeed no hay tópico de cuenta ni de dispositivo (ambos se derivan a partir
 * del id de cuenta). Nunca lanza.
 */
export async function resolveNtfyTopics(): Promise<NtfyTopics> {
  const deviceId = thisDeviceId();
  const accountId = await getAccountId();
  if (!accountId) return { accountId: null, deviceId, accountTopic: null, deviceTopic: null };

  try {
    const settings = getNtfySettings();
    let accountTopic = settings.accountTopic || null;
    let deviceTopic = deviceId ? settings.deviceTopics?.[deviceId] || null : null;
    const patch: Partial<NtfySettings> = {};

    if (!accountTopic) {
      accountTopic = await accountTopicFor(accountId);
      patch.accountTopic = accountTopic;
    }
    if (deviceId && !deviceTopic) {
      deviceTopic = await deviceTopicFor(accountId, deviceId);
      patch.deviceTopics = { [deviceId]: deviceTopic };
    }
    if (Object.keys(patch).length > 0) setNtfySettings(patch);

    return { accountId, deviceId, accountTopic, deviceTopic };
  } catch {
    return { accountId, deviceId, accountTopic: null, deviceTopic: null };
  }
}

/* ──────────────────────────────── Publicar ─────────────────────────────── */

function levelToPriorityAndTags(
  level: NtfyLevel | undefined,
  explicitPriority: NtfyPriority | undefined,
  explicitTags: string[] | undefined,
): { priority?: NtfyPriority; tags?: string[] } {
  if (explicitPriority != null || (explicitTags && explicitTags.length > 0)) {
    return { priority: explicitPriority, tags: explicitTags };
  }
  switch (level) {
    case "error": return { priority: 5, tags: ["rotating_light"] };
    case "warning": return { priority: 4, tags: ["warning"] };
    case "success": return { priority: 3, tags: ["white_check_mark"] };
    default: return { priority: 3, tags: ["bell"] };
  }
}

/**
 * Publica un mensaje en ntfy por POST JSON a la RAÍZ del servidor configurado
 * (el modo JSON de ntfy exige postear a `<server>`, nunca a `<server>/<topic>`).
 * Respeta `enabled`/`publishFromBrowser`. Si no se pasa `topic`, deriva el de
 * `scope` (cuenta o este dispositivo). Nunca lanza: cualquier fallo vuelve como
 * `{ok:false, error}`.
 */
export async function publish(input: NtfyPublishInput): Promise<NtfyPublishResult> {
  if (!isClient()) return { ok: false, error: "No disponible durante el renderizado en servidor." };
  try {
    const settings = getNtfySettings();
    if (!settings.enabled) return { ok: false, error: "ntfy está desactivado (actívalo en Ajustes → Notificaciones)." };
    if (!settings.publishFromBrowser) return { ok: false, error: "Publicar desde el navegador está desactivado en los ajustes de ntfy." };

    let topic = (input.topic || "").trim();
    if (!topic) {
      const scope = input.scope || "account";
      const resolved = await resolveNtfyTopics();
      topic = (scope === "device" ? resolved.deviceTopic : resolved.accountTopic) || "";
    }
    if (!topic) return { ok: false, error: "No hay tópico disponible (¿sesión StarSeed iniciada?)." };

    const { priority, tags } = levelToPriorityAndTags(input.level, input.priority, input.tags);
    const body: Record<string, unknown> = { topic, title: input.title || "StarSeed" };
    if (input.message) body.message = input.message;
    if (priority != null) body.priority = priority;
    if (tags && tags.length > 0) body.tags = tags;
    if (input.click) body.click = input.click;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.token) headers.Authorization = `Bearer ${settings.token}`;

    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl?.abort(), 8000) : null;
    let res: Response;
    try {
      res = await fetch(settings.server, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctrl?.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (!res.ok) return { ok: false, error: `El servidor ntfy respondió ${res.status}.` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red al publicar en ntfy." };
  }
}

/* ────────────────────────────── Suscribirse ────────────────────────────── */

function priorityToLevel(priority?: number): NtfyLevel {
  if (priority == null) return "info";
  if (priority >= 5) return "error";
  if (priority === 4) return "warning";
  return "info"; // ntfy no distingue "success" en su prioridad — se trata como info
}

/**
 * Se suscribe por SSE (`EventSource`) a uno o varios tópicos del servidor
 * configurado (`GET <server>/<t1>,<t2>/sse`). Filtra solo `event==="message"`;
 * si `mirrorToInApp` está activo, cada mensaje se espeja también al Centro de
 * Notificaciones del OS vía `notifyFromApp()`. Reconecta con backoff
 * exponencial (máx. 30 s) si la conexión se corta. Devuelve una función para
 * cerrar la suscripción. Nunca lanza.
 */
export function subscribe(
  topics: string[],
  onMessage: (m: NtfyMessage) => void,
  opts?: NtfySubscribeOptions,
): () => void {
  if (!isClient() || typeof EventSource === "undefined") return () => {};
  const cleanTopics = (topics || []).map((t) => (t || "").trim()).filter(Boolean);
  if (cleanTopics.length === 0) return () => {};

  let closed = false;
  let es: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function scheduleRetry() {
    if (closed) return;
    attempt += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    retryTimer = setTimeout(open, delay);
  }

  function open() {
    if (closed) return;
    try {
      const settings = getNtfySettings();
      const server = normalizeServer(settings.server);
      const topicsSegment = cleanTopics.map(encodeURIComponent).join(",");
      const params = new URLSearchParams();
      if (opts?.since) params.set("since", opts.since);
      if (settings.token) {
        // EventSource no permite fijar cabeceras: el valor completo de
        // Authorization viaja en base64 "raw" (sin '=' de relleno) por query.
        try { params.set("auth", btoa(`Bearer ${settings.token}`).replace(/=+$/, "")); }
        catch { /* token con caracteres no soportados por btoa: se omite auth por query */ }
      }
      const qs = params.toString();
      const url = `${server}/${topicsSegment}/sse${qs ? `?${qs}` : ""}`;

      const source = new EventSource(url);
      es = source;

      source.onopen = () => { attempt = 0; };

      source.onmessage = (ev: MessageEvent) => {
        let data: NtfyMessage | null = null;
        try { data = JSON.parse(ev.data) as NtfyMessage; } catch { data = null; }
        if (!data || data.event !== "message") return; // ignora open/keepalive/otros eventos

        try {
          if (getNtfySettings().mirrorToInApp) {
            notifyFromApp({
              appId: "ntfy",
              title: data.title || "ntfy",
              body: data.message,
              icon: "BellRing",
              level: priorityToLevel(data.priority),
              dedupeKey: data.id,
              popup: true,
            });
          }
        } catch { /* el espejo nunca debe romper la suscripción */ }

        try { onMessage(data); } catch { /* el callback del llamador no debe tumbar la suscripción */ }
      };

      source.onerror = () => {
        try { source.close(); } catch { /* noop */ }
        if (es === source) es = null;
        scheduleRetry();
      };
    } catch {
      scheduleRetry();
    }
  }

  open();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    try { es?.close(); } catch { /* noop */ }
    es = null;
  };
}

/* ────────────────────────── Puente cuenta+neurona ───────────────────────── */

let activeBridgeStop: (() => void) | null = null;

/**
 * Arranca (idempotente) el puente de ntfy: si `enabled`, se suscribe al tópico
 * de cuenta + al de esta neurona y espeja al sistema in-app (vía `subscribe()`).
 * Reacciona a cambios de ajustes (reabre si cambia servidor/token/activación).
 * Pensado para montarse una vez en el layout raíz. Devuelve una función para
 * detener el puente. Llamar de nuevo mientras ya hay uno activo en esta pestaña
 * devuelve un cierre no-op (solo quien arrancó el puente puede detenerlo).
 * Nunca lanza.
 */
export function startNtfyBridge(): () => void {
  if (!isClient()) return () => {};
  if (activeBridgeStop) return () => {};

  let stopped = false;
  let unsubSSE: (() => void) | null = null;
  // Guarda de reentrancia: resolveNtfyTopics() puede, la primera vez, escribir
  // el tópico recién derivado con setNtfySettings() → eso emite NTFY_EVENT →
  // nuestro propio listener (más abajo) vuelve a llamar a applyState() DE
  // FORMA ANIDADA mientras la primera llamada sigue esperando su propio
  // await. Sin este contador, la llamada más VIEJA podría resolver después y
  // pisar el `unsubSSE` de la más nueva (conexión SSE duplicada/perdida). Solo
  // la invocación cuyo `myEpoch` sigue siendo el vigente al terminar de
  // esperar tiene permiso para tocar `unsubSSE`.
  let epoch = 0;

  const applyState = async () => {
    const myEpoch = ++epoch;
    try { unsubSSE?.(); } catch { /* noop */ }
    unsubSSE = null;
    if (stopped) return;

    const settings = getNtfySettings();
    if (!settings.enabled) return;

    try {
      const { accountTopic, deviceTopic } = await resolveNtfyTopics();
      if (myEpoch !== epoch) return; // una llamada más nueva ya tomó el relevo mientras esperábamos
      const topics = [accountTopic, deviceTopic].filter((t): t is string => !!t);
      if (stopped || topics.length === 0) return;
      // El espejo a notifyFromApp ya ocurre dentro de subscribe(); aquí no
      // necesitamos hacer nada más con cada mensaje.
      unsubSSE = subscribe(topics, () => { /* noop: el mirror lo hace subscribe() */ });
    } catch { /* noop */ }
  };

  void applyState();
  const unsubSettings = subscribeNtfySettings(() => { void applyState(); });

  const stop = () => {
    stopped = true;
    activeBridgeStop = null;
    try { unsubSSE?.(); } catch { /* noop */ }
    try { unsubSettings(); } catch { /* noop */ }
  };
  activeBridgeStop = stop;
  return stop;
}

/* ───────────────────────────────── Prueba ───────────────────────────────── */

/**
 * Publica un mensaje de prueba (al tópico de cuenta si hay sesión; si no, al de
 * esta neurona) para verificar que la configuración de ntfy funciona.
 */
export async function testNtfy(): Promise<NtfyPublishResult> {
  if (!isClient()) return { ok: false, error: "No disponible durante el renderizado en servidor." };
  const settings = getNtfySettings();
  if (!settings.enabled) return { ok: false, error: "Activa ntfy antes de enviar una prueba." };

  const { accountTopic, deviceTopic } = await resolveNtfyTopics();
  if (!accountTopic && !deviceTopic) {
    return { ok: false, error: "No se pudo derivar ningún tópico todavía (¿sesión StarSeed iniciada?)." };
  }
  const scope: "account" | "device" = accountTopic ? "account" : "device";
  return publish({
    title: "StarSeed — prueba de ntfy",
    message: "Si ves este aviso (aquí o en tu móvil), la conexión con ntfy funciona correctamente.",
    level: "success",
    scope,
  });
}
