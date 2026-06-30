// ════════════════════════════════════════════════════════════════
// Cliente de canal Telegram — POR USUARIO ("una opción más")
// ----------------------------------------------------------------
// Telegram NO es un bot compartido del sistema: cada usuario crea SU
// bot con @BotFather, pega SU token y SU chat id, lo prueba y lo
// activa. A partir de ahí, las salidas de Aurora/cerebro y (opcional)
// las novedades de memoria pueden publicarse en SU Telegram.
//
// Este módulo:
//   · sendTelegram / testTelegram → llaman a las rutas proxy server-side
//     (/api/telegram/send y /api/telegram/test) para evitar CORS y no
//     exponer el token en llamadas cross-origin del navegador.
//   · Persiste la config del usuario en localStorage bajo
//     `starseed.telegram.user.v1` (companion de `starseed.aurora.channels.v1`,
//     que NO debe contener secretos en claro).
//   · notifyTelegram(text) → helper que el sistema de memoria /
//     notificaciones puede llamar; sólo publica si el usuario lo activó.
//
// Defensivo: guards SSR, try/catch, sin secretos hardcodeados, off por
// defecto.
// ════════════════════════════════════════════════════════════════

export type TelegramParseMode = "MarkdownV2" | "Markdown" | "HTML" | "none";

export interface SendTelegramArgs {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: TelegramParseMode;
}

export interface TelegramResult {
  ok: boolean;
  error?: string;
  /** Payload de Telegram cuando ok === true (p.ej. el message enviado). */
  result?: unknown;
}

/** Bot devuelto por getMe (vía /api/telegram/test). */
export interface TelegramBotInfo {
  id?: number;
  username?: string;
  name?: string;
}

/** Chat descubierto vía getUpdates (para ayudar a hallar el chat id). */
export interface TelegramDiscoveredChat {
  id: number | string;
  type?: string;
  title?: string;
  username?: string;
  firstName?: string;
}

export interface TestTelegramResult {
  ok: boolean;
  error?: string;
  bot?: TelegramBotInfo;
  chats?: TelegramDiscoveredChat[];
}

// ─── Persistencia por usuario ──────────────────────────────────────

/** Config de Telegram del usuario. Off por defecto; sin secretos compartidos. */
export interface TelegramUserConfig {
  /** Token del bot del usuario (de @BotFather). */
  botToken: string;
  /** Chat id numérico o @usuario donde publicar. */
  chatId: string;
  /** El usuario activó este canal de Telegram. */
  enabled: boolean;
  /** Enviar novedades de memoria/notificaciones a Telegram (opcional). */
  notifyMemory: boolean;
}

export const TELEGRAM_USER_KEY = "starseed.telegram.user.v1";

export const DEFAULT_TELEGRAM_USER_CONFIG: TelegramUserConfig = {
  botToken: "",
  chatId: "",
  enabled: false,
  notifyMemory: false,
};

export function loadTelegramUserConfig(): TelegramUserConfig {
  if (typeof window === "undefined") return { ...DEFAULT_TELEGRAM_USER_CONFIG };
  try {
    const raw = window.localStorage.getItem(TELEGRAM_USER_KEY);
    if (!raw) return { ...DEFAULT_TELEGRAM_USER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<TelegramUserConfig>;
    return {
      botToken: typeof parsed.botToken === "string" ? parsed.botToken : "",
      chatId: typeof parsed.chatId === "string" ? parsed.chatId : "",
      enabled: parsed.enabled === true,
      notifyMemory: parsed.notifyMemory === true,
    };
  } catch {
    return { ...DEFAULT_TELEGRAM_USER_CONFIG };
  }
}

export function saveTelegramUserConfig(cfg: TelegramUserConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TELEGRAM_USER_KEY, JSON.stringify(cfg));
  } catch {
    /* noop */
  }
}

/** ¿El usuario tiene Telegram activado y mínimamente configurado? */
export function isTelegramConfigured(cfg: TelegramUserConfig = loadTelegramUserConfig()): boolean {
  return Boolean(cfg.enabled && cfg.botToken.trim() && cfg.chatId.trim());
}

// ─── Llamadas a las rutas proxy ────────────────────────────────────

/**
 * Envía un mensaje al Telegram indicado vía la ruta proxy server-side.
 * Defensivo: nunca lanza; devuelve { ok, error? }.
 */
export async function sendTelegram(args: SendTelegramArgs): Promise<TelegramResult> {
  const botToken = (args.botToken ?? "").trim();
  const chatId = (args.chatId ?? "").trim();
  const text = args.text ?? "";

  if (!botToken) return { ok: false, error: "Falta el token del bot." };
  if (!chatId) return { ok: false, error: "Falta el chat id." };
  if (!text.trim()) return { ok: false, error: "El mensaje está vacío." };

  try {
    const res = await fetch("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken, chatId, text, parseMode: args.parseMode }),
    });
    const data = (await res.json().catch(() => null)) as TelegramResult | null;
    if (!data) return { ok: false, error: `Respuesta inválida (${res.status}).` };
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de red al contactar el proxy." };
  }
}

/**
 * Comprueba el bot del usuario (getMe) y opcionalmente descubre chat ids
 * (getUpdates) vía la ruta proxy. Defensivo: nunca lanza.
 */
export async function testTelegram(botToken: string, withUpdates = true): Promise<TestTelegramResult> {
  const token = (botToken ?? "").trim();
  if (!token) return { ok: false, error: "Falta el token del bot." };

  try {
    const res = await fetch("/api/telegram/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken: token, withUpdates }),
    });
    const data = (await res.json().catch(() => null)) as TestTelegramResult | null;
    if (!data) return { ok: false, error: `Respuesta inválida (${res.status}).` };
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error de red al contactar el proxy." };
  }
}

// ─── Helper de notificación (memoria / novedades → #98) ─────────────

/**
 * Publica `text` en el Telegram del usuario SI lo tiene activado y
 * configurado (y, para novedades, si activó `notifyMemory`). Pensado para
 * que el sistema de memoria/notificaciones lo invoque sin acoplarse a la UI.
 *
 * @param text  El texto a publicar.
 * @param opts.requireMemoryOptIn  Si true (default), sólo publica cuando el
 *   usuario marcó "enviar novedades a mi Telegram". Pon false para mensajes
 *   de Aurora/cerebro que no dependen de ese opt-in concreto.
 * @returns { ok, error? } — ok:false con motivo si está desactivado/sin config.
 */
export async function notifyTelegram(
  text: string,
  opts: { requireMemoryOptIn?: boolean; parseMode?: TelegramParseMode } = {},
): Promise<TelegramResult> {
  const requireMemoryOptIn = opts.requireMemoryOptIn ?? true;
  const cfg = loadTelegramUserConfig();

  if (!isTelegramConfigured(cfg)) {
    return { ok: false, error: "Telegram no está activado o configurado." };
  }
  if (requireMemoryOptIn && !cfg.notifyMemory) {
    return { ok: false, error: "El envío de novedades a Telegram está desactivado." };
  }

  return sendTelegram({
    botToken: cfg.botToken,
    chatId: cfg.chatId,
    text,
    parseMode: opts.parseMode,
  });
}
