"use client";

/**
 * MESSAGING CHANNELS — Conexiones de chat de Astraura/Aurora (modelo tri-fuente).
 *
 * Para los chats de Aurora/Astraura el usuario configura TRES canales de forma
 * SIMULTÁNEA (las tres pueden estar activas a la vez), cada uno con integración
 * completa de Astraura + Aurora y sus memorias/contexto, automático e
 * inteligente, y totalmente configurable:
 *
 *   • terminal  — Chat directo local en la app/dispositivo (sin servidor).
 *   • starseed  — Chat guardado en StarSeed (Supabase `conversations`/`messages`)
 *                 con Astraura. Sincronizado y persistente.
 *   • external  — Mensajero externo: Telegram (@starseed_nexus_bot vía
 *                 deep-link + `telegram_links`), Google Chat, WhatsApp o
 *                 cualquier servicio integrable (endpoint/webhook en `config`).
 *
 * Cada canal tiene además un interruptor de MEMORIA/CONTEXTO (`memory_enabled`
 * + `context`) que define qué cerebro/memorias alimentan ese chat.
 *
 * Persistencia: tabla `messaging_channels(id, owner, scope, provider, enabled,
 * config jsonb, memory_enabled, context jsonb, updated_at)` con índice único
 * (owner, scope), RLS por owner y Realtime habilitado. Patrón calcado de
 * `lib/services/service-routes.ts`: uid() + normalize + defaults +
 * upsert(onConflict) + espejo en window.
 *
 * SEGURIDAD: NUNCA se guardan secretos en claro. Para Externo, las credenciales
 * (token de bot, clave de webhook) se guardan como REFERENCIA simbólica
 * (`config.key_ref`) a una clave que vive cifrada en la bóveda del navegador.
 * El deep-link de Telegram sólo registra la INTENCIÓN de vínculo; el vínculo
 * real se confirma en la tabla `telegram_links` por el bot.
 *
 * SSR-safe: todo acceso a window va detrás de guardas `typeof window`.
 */

import { createClient } from "@/utils/supabase/client";
import { onTableChange, type RealtimePayload } from "@/lib/realtime/realtime";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type ChannelScope = "terminal" | "starseed" | "external";

/** Proveedor externo soportado (cuando scope === "external"). */
export type ExternalProvider =
  | "none"
  | "telegram"
  | "google_chat"
  | "whatsapp"
  | "custom"
  // Ola 281 · E4 (2026-09-07): puentes a servidores de chat externos
  // (Hermes, terminal local, Telegram, WhatsApp, SMS y webhook).
  | "hermes"
  | "terminal"
  | "sms"
  | "webhook";

/** Un canal de chat para Aurora/Astraura. */
export interface MessagingChannel {
  /** Identificador de fila (lo asigna la DB; opcional en memoria). */
  id?: string;
  /** Ámbito del canal. Único por owner. */
  scope: ChannelScope;
  /**
   * Proveedor. Para terminal/starseed normalmente "none". Para external es el
   * mensajero elegido (telegram | google_chat | whatsapp | custom).
   */
  provider: ExternalProvider | string;
  /** ¿Está activo este canal? Los tres pueden estar activos a la vez. */
  enabled: boolean;
  /**
   * Configuración específica del canal. Para external:
   *   { endpoint?, webhook?, key_ref?, telegram_intent?, account_id? }
   * El secreto NUNCA viaja aquí: sólo `key_ref` (alias en la bóveda local).
   */
  config: Record<string, unknown>;
  /** ¿Este chat usa las memorias/contexto (cerebro Astraura/Aurora)? */
  memory_enabled: boolean;
  /**
   * Selección de qué memorias/contexto alimentan el chat:
   *   { scopes?: string[], brain_id?: string, vault_id?: string, notes?: string }
   */
  context: Record<string, unknown>;
  updated_at?: string;
}

// ── Defaults sensatos (terminal + starseed ON; external OFF) ─────────────────

const SCOPE_ORDER: ChannelScope[] = ["terminal", "starseed", "external"];

/** Crea un canal por defecto para un `scope`. */
export function defaultChannel(scope: ChannelScope): MessagingChannel {
  // Por defecto: terminal y starseed activos; external apagado.
  const enabled = scope === "terminal" || scope === "starseed";
  return {
    scope,
    provider: "none",
    enabled,
    config: {},
    memory_enabled: true,
    context: {},
  };
}

/** Conjunto de canales por defecto (los tres). */
export function defaultChannels(): MessagingChannel[] {
  return SCOPE_ORDER.map((s) => defaultChannel(s));
}

// ── Normalización (tolerante a datos parciales/antiguos) ─────────────────────

function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function normalizeChannel(
  raw: unknown,
  scope: ChannelScope,
): MessagingChannel {
  const base = defaultChannel(scope);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<MessagingChannel>;
  return {
    id: typeof r.id === "string" ? r.id : undefined,
    scope,
    provider:
      typeof r.provider === "string" && r.provider ? r.provider : base.provider,
    enabled: typeof r.enabled === "boolean" ? r.enabled : base.enabled,
    config: asObject(r.config),
    memory_enabled:
      typeof r.memory_enabled === "boolean"
        ? r.memory_enabled
        : base.memory_enabled,
    context: asObject(r.context),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
  };
}

/** Garantiza exactamente un canal por cada scope, en orden estable. */
export function normalizeChannels(raw: unknown): MessagingChannel[] {
  const list = Array.isArray(raw) ? raw : [];
  const byScope = new Map<ChannelScope, unknown>();
  for (const item of list) {
    const s = (item as { scope?: string } | null)?.scope;
    if (s === "terminal" || s === "starseed" || s === "external") {
      if (!byScope.has(s)) byScope.set(s, item);
    }
  }
  return SCOPE_ORDER.map((s) => normalizeChannel(byScope.get(s), s));
}

// ── Espejo en window (lectores sin DB, p.ej. el motor de chat) ───────────────

declare global {
  interface Window {
    STARSEED_messaging?: MessagingChannel[];
  }
}

function mirrorToWindow(channels: MessagingChannel[]) {
  if (typeof window === "undefined") return;
  try {
    window.STARSEED_messaging = channels;
    window.dispatchEvent(
      new CustomEvent("starseed:messaging", { detail: channels }),
    );
  } catch {
    /* noop */
  }
}

// ── Helpers Supabase ─────────────────────────────────────────────────────────

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Carga los tres canales del usuario (o defaults si no existen / sin sesión) y
 * los espeja en window para lectores sin DB.
 */
export async function loadChannels(): Promise<MessagingChannel[]> {
  try {
    const owner = await uid();
    if (!owner) {
      const def = defaultChannels();
      mirrorToWindow(def);
      return def;
    }
    const sb = createClient();
    const { data } = await sb
      .from("messaging_channels")
      .select(
        "id, scope, provider, enabled, config, memory_enabled, context, updated_at",
      )
      .eq("owner", owner);
    const channels = normalizeChannels(data ?? []);
    mirrorToWindow(channels);
    return channels;
  } catch {
    const def = defaultChannels();
    mirrorToWindow(def);
    return def;
  }
}

/**
 * Guarda (upsert por owner+scope) UN canal. Devuelve la fila normalizada (o el
 * canal en memoria si no hay sesión).
 */
export async function saveChannel(
  channel: MessagingChannel,
): Promise<MessagingChannel> {
  const normalized = normalizeChannel(channel, channel.scope);
  try {
    const owner = await uid();
    if (!owner) return normalized;
    const sb = createClient();
    const { data } = await sb
      .from("messaging_channels")
      .upsert(
        {
          owner,
          scope: normalized.scope,
          provider: normalized.provider,
          enabled: normalized.enabled,
          config: normalized.config,
          memory_enabled: normalized.memory_enabled,
          context: normalized.context,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner,scope" },
      )
      .select(
        "id, scope, provider, enabled, config, memory_enabled, context, updated_at",
      )
      .maybeSingle();
    const saved = normalizeChannel(data ?? normalized, normalized.scope);
    return saved;
  } catch {
    return normalized;
  }
}

/**
 * Guarda los TRES canales de una vez. Devuelve la lista normalizada y la espeja
 * en window.
 */
export async function saveChannels(
  channels: MessagingChannel[],
): Promise<MessagingChannel[]> {
  const normalized = normalizeChannels(channels);
  mirrorToWindow(normalized);
  try {
    const owner = await uid();
    if (!owner) return normalized;
    const sb = createClient();
    const rows = normalized.map((c) => ({
      owner,
      scope: c.scope,
      provider: c.provider,
      enabled: c.enabled,
      config: c.config,
      memory_enabled: c.memory_enabled,
      context: c.context,
      updated_at: new Date().toISOString(),
    }));
    const { data } = await sb
      .from("messaging_channels")
      .upsert(rows, { onConflict: "owner,scope" })
      .select(
        "id, scope, provider, enabled, config, memory_enabled, context, updated_at",
      );
    const saved = normalizeChannels(data ?? normalized);
    mirrorToWindow(saved);
    return saved;
  } catch {
    return normalized;
  }
}

/**
 * Suscripción Realtime a los cambios de los canales del usuario. Devuelve una
 * función de limpieza. SSR-safe (no-op en el servidor). El callback recibe la
 * lista de canales ya normalizada (recargada) cuando llega cualquier cambio.
 */
export function onChannelsChange(
  cb: (channels: MessagingChannel[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  return onTableChange(
    "messaging_channels",
    { event: "*" },
    (_payload: RealtimePayload) => {
      // Recargamos la lista completa: es barata (<=3 filas) y siempre coherente.
      void loadChannels().then((channels) => cb(channels));
    },
  );
}

// ── Telegram (deep-link + estado de vínculo) ─────────────────────────────────

/** Handle del bot de StarSeed en Telegram. */
export const TELEGRAM_BOT = "https://t.me/starseed_nexus_bot";

/**
 * Construye el deep-link de conexión de Telegram para una cuenta. El bot lee el
 * payload `start` y crea/confirma la fila en `telegram_links`.
 */
export function telegramDeepLink(accountId: string | null): string {
  return accountId
    ? `${TELEGRAM_BOT}?start=acc_${accountId}`
    : `${TELEGRAM_BOT}?start=connect`;
}

export interface TelegramLink {
  handle: string | null;
  display_name: string | null;
  telegram_id: number | null;
}

/**
 * Lee el estado de vínculo de Telegram del usuario actual desde `telegram_links`
 * (RLS aplica). Devuelve `null` si no hay vínculo / sin sesión.
 */
export async function getTelegramLink(): Promise<TelegramLink | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("telegram_links")
      .select("handle, display_name, telegram_id")
      .eq("user_id", owner)
      .maybeSingle();
    return (data as TelegramLink) ?? null;
  } catch {
    return null;
  }
}

// ── Puentes a servidores de chat externos (Ola 281 · E4) ─────────────────────

/** Un campo del formulario de un puente (generado desde el catálogo). */
export interface CampoPuente {
  /** Clave del campo dentro de `config` del canal external. */
  clave: string;
  /** Etiqueta legible en español para la UI. */
  etiqueta: string;
  /** Tipo de campo: afecta al input y a si se muestra con máscara. */
  tipo: "texto" | "secreto" | "url" | "numero";
  /** Ayuda corta mostrada bajo el input. */
  ayuda: string;
}

/** Descripción de un puente a un servidor de chat externo. */
export interface ProveedorPuente {
  id: ExternalProvider;
  nombre: string;
  descripcion: string;
  /** Campos del formulario de configuración (los `secreto` van enmascarados). */
  campos: CampoPuente[];
  /** Enlace a la documentación del proveedor (se abre en otra pestaña). */
  docs: string;
}

/**
 * Catálogo de puentes disponibles. Es la fuente de verdad de la UI: cada
 * puente define sus propios campos de configuración. Los valores que se
 * escriben aquí se guardan en `config` del canal external (servidor); los de
 * tipo `secreto` nunca se reenvían completos al cliente (ver `enmascarar`).
 */
export const PROVEEDORES_PUENTE: ProveedorPuente[] = [
  {
    id: "hermes",
    nombre: "Hermes",
    descripcion:
      "Conecta este chat con un servidor Hermes mediante un vínculo `ssk_…` y su URL.",
    campos: [
      { clave: "url", etiqueta: "URL del servidor Hermes", tipo: "url", ayuda: "Ej: https://hermes.local:8080" },
      { clave: "vinculo", etiqueta: "Vínculo de acceso (ssk_…)", tipo: "secreto", ayuda: "Token de acceso generado en Externos." },
    ],
    docs: "https://github.com/anomalyco/opencode",
  },
  {
    id: "terminal",
    nombre: "Terminal local",
    descripcion:
      "Puente al chat local del dispositivo: comando o puerto del daemon que sirve la conversación.",
    campos: [
      { clave: "comando", etiqueta: "Comando", tipo: "texto", ayuda: "Ej: hermes chat" },
      { clave: "puerto", etiqueta: "Puerto local", tipo: "numero", ayuda: "Ej: 4500" },
    ],
    docs: "https://opencode.ai",
  },
  {
    id: "telegram",
    nombre: "Telegram",
    descripcion:
      "Un bot de Telegram que reenvía los mensajes de este chat (o usa el bot oficial de StarSeed).",
    campos: [
      { clave: "bot_token", etiqueta: "Token del bot", tipo: "secreto", ayuda: "O deja en blanco para usar el bot oficial de StarSeed." },
      { clave: "chat_id", etiqueta: "Chat ID", tipo: "texto", ayuda: "ID del chat/grupo destino (o tu ID personal)." },
    ],
    docs: "https://t.me/starseed_nexus_bot",
  },
  {
    id: "whatsapp",
    nombre: "WhatsApp",
    descripcion:
      "Puente a WhatsApp vía proveedor (Twilio o Meta Cloud API): número emisor + token.",
    campos: [
      { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto", ayuda: "twilio | meta" },
      { clave: "numero", etiqueta: "Número de WhatsApp", tipo: "texto", ayuda: "Formato internacional, ej: +34600000000" },
      { clave: "token", etiqueta: "Token de acceso", tipo: "secreto", ayuda: "Credencial del proveedor." },
    ],
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    id: "sms",
    nombre: "SMS",
    descripcion:
      "Envía y recibe mensajes SMS a través de Twilio (SID + token + número).",
    campos: [
      { clave: "twilio_sid", etiqueta: "Account SID (Twilio)", tipo: "secreto", ayuda: "Comienza por AC…" },
      { clave: "twilio_token", etiqueta: "Auth Token (Twilio)", tipo: "secreto", ayuda: "Secreto del proyecto Twilio." },
      { clave: "numero", etiqueta: "Número Twilio", tipo: "texto", ayuda: "Ej: +34600000000" },
    ],
    docs: "https://www.twilio.com/docs/sms",
  },
  {
    id: "webhook",
    nombre: "Webhook",
    descripcion:
      "Recibe los mensajes de este chat en un endpoint HTTP propio, firmado con HMAC.",
    campos: [
      { clave: "url", etiqueta: "URL del webhook", tipo: "url", ayuda: "Endpoint que recibirá los POST." },
      { clave: "secreto", etiqueta: "Secreto HMAC", tipo: "secreto", ayuda: "Clave compartida para firmar el cuerpo." },
    ],
    docs: "https://opencode.ai",
  },
];

/**
 * Devuelve una representación ENMASCARADA de la config de un canal external,
 * para mostrarla en el cliente sin exponer los secretos. Los valores de
 * longitud suficiente se muestran como `••••` + últimos 4 caracteres; los
 * booleanos/números se dejan tal cual; null/undefined como cadena vacía.
 */
export function enmascarar(config: Record<string, unknown>): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(config)) {
    if (typeof valor === "string") {
      // Nunca revelamos el valor completo: solo el final, como indicador.
      salida[clave] = valor.length > 4 ? `••••${valor.slice(-4)}` : "••••";
    } else if (valor === null || valor === undefined) {
      salida[clave] = "";
    } else {
      salida[clave] = String(valor);
    }
  }
  return salida;
}
