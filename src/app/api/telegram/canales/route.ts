import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

// ════════════════════════════════════════════════════════════════
// POST /api/telegram/canales — lista los canales y grupos de Telegram
// de la cuenta (Adenda 281 · E7). El Hub de Conexiones los muestra en la
// pestaña «Canales», cada uno con su enlace t.me y los últimos mensajes.
//
// Fuentes, en orden de prioridad de detalle:
//   (a) `astraura_messages` del usuario agrupados por chat_id (últimos 5
//       por chat). Siempre disponible si hay sesión.
//   (b) si llega un `botToken` válido, `getUpdates` (limit 100) para
//       descubrir grupos/canales y sus últimos mensajes.
//   (c) para canales públicos con `username`, `GET https://t.me/s/<u>`
//       (timeout 6 s) y se extraen los últimos mensajes del HTML. En
//       `try`, nunca rompe la lista.
//
// NUNCA devuelve el token del bot. Rate-limit 60/10min (mismo patrón
// que /api/telegram/test). Fuente de verdad de la tarea: memoria de la
// Ola 281 · E7.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_BOT = "https://t.me/starseed_nexus_bot";
const TIMEOUT_MS = 15_000;
const TME_S_TIMEOUT_MS = 6_000;
const MAX_ULTIMOS = 5;
const MAX_TME_FETCHES = 5;

interface CanalesBody {
  botToken?: string;
}

/** Tipo con el nombre real del bot (getMe) — nunca su token. */
interface BotInfo {
  username?: string;
}

/** Un canal/grupo de Telegram tal y como se devuelve al cliente. */
interface CanalTelegram {
  id: string;
  tipo: "dm" | "grupo" | "canal" | "chat";
  titulo: string;
  username?: string;
  enlace: string;
  ultimos: Array<{ de: string; texto: string; t: string }>;
}

function looksLikeToken(token: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token.trim());
}

// ─── Tipado de getUpdates (sin `any`) ────────────────────────────────

interface TGchat {
  id?: number | string;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
}
interface TGmessage {
  chat?: TGchat;
  text?: string;
  caption?: string;
}
interface TGupdate {
  message?: TGmessage;
  edited_message?: TGmessage;
  channel_post?: TGmessage;
  my_chat_member?: { chat?: TGchat };
}

/** Extrae hasta `max` mensajes de texto plano del HTML de t.me/s/<canal>. */
function extraerMensajesTMe(html: string, max = MAX_ULTIMOS): string[] {
  const out: string[] = [];
  const re = /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    if (t) out.push(t);
  }
  return out.slice(-max);
}

export async function POST(req: NextRequest) {
  // Rate-limit por usuario (si hay sesión) o por IP. Se aplica ANTES de leer
  // el cuerpo (mismo patrón que /api/telegram/test).
  let rlKey = `telegram-canales:ip:${clientIp(req)}`;
  try {
    const supabase = await createClient();
    const { data: u } = await supabase.auth.getUser();
    if (u?.user?.id) rlKey = `telegram-canales:user:${u.user.id}`;
  } catch {
    // Sin sesión usable: se mantiene la clave por IP.
  }
  const rl = rateLimit(rlKey, 60, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Demasiadas solicitudes. Inténtalo más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: CanalesBody;
  try {
    body = (await req.json()) as CanalesBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cuerpo de la petición inválido (se esperaba JSON)." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: au } = await supabase.auth.getUser();
  const uid = au?.user?.id ?? null;
  const botToken = (body.botToken ?? "").trim();
  const tokenValido = looksLikeToken(botToken);

  // ─── Estado del bot (getMe, solo si hay token) ────────────────────
  let bot: BotInfo = {};
  if (tokenValido) {
    try {
      const meRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      const meData = (await meRes.json().catch(() => null)) as
        | { ok?: boolean; result?: { username?: string } }
        | null;
      if (meRes.ok && meData?.ok && meData.result) {
        bot = { username: meData.result.username };
      }
    } catch {
      // getMe es best-effort; si falla seguimos con lo que hay.
    }
  }

  // ─── (a) astraura_messages del usuario agrupados por chat_id ──────
  const porChat = new Map<string, Array<{ role: string; content: string; t: string }>>();
  if (uid) {
    try {
      const { data: msgs } = await supabase
        .from("astraura_messages")
        .select("chat_id,role,content,created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(300);
      const filas = (msgs ?? []) as Array<{
        chat_id: string | null;
        role: string | null;
        content: string | null;
        created_at: string | null;
      }>;
      for (const m of filas) {
        const k = m.chat_id || "dm";
        const lista = porChat.get(k) ?? [];
        if (lista.length < MAX_ULTIMOS) {
          lista.push({
            role: m.role ?? "assistant",
            content: m.content ?? "",
            t: m.created_at ?? "",
          });
        }
        porChat.set(k, lista);
      }
    } catch {
      // Sin permisos/red: la lista queda solo con lo descubierto por getUpdates.
    }
  }

  // ─── (b) getUpdates: descubre grupos/canales y sus últimos mensajes ─
  const descubierto = new Map<string, { tipo: string; titulo: string; username?: string }>();
  const ultimoTexto = new Map<string, string>();
  if (tokenValido) {
    try {
      const upRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getUpdates?limit=100`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      const upData = (await upRes.json().catch(() => null)) as
        | { ok?: boolean; result?: Array<Record<string, unknown>> }
        | null;
      if (upData?.ok && Array.isArray(upData.result)) {
        for (const raw of upData.result) {
          const u = raw as TGupdate;
          const msg = u.message ?? u.edited_message ?? u.channel_post;
          const chat = msg?.chat ?? u.my_chat_member?.chat;
          if (!chat || chat.id === undefined) continue;
          const key = String(chat.id);
          if (!descubierto.has(key)) {
            descubierto.set(key, {
              tipo: chat.type ?? "chat",
              titulo: chat.title ?? chat.username ?? chat.first_name ?? key,
              username: chat.username,
            });
          }
          const texto = (msg?.text ?? msg?.caption ?? "").trim();
          if (texto) ultimoTexto.set(key, texto);
        }
      }
    } catch {
      // getUpdates es best-effort; no rompe la lista.
    }
  }

  // ─── Ensamblado de la lista de canales ────────────────────────────
  const canales: CanalTelegram[] = [];
  const vistos = new Set<string>();
  const autor = bot.username ? `@${bot.username}` : "Aurora";

  const addCanal = (c: CanalTelegram) => {
    if (vistos.has(c.id)) return;
    vistos.add(c.id);
    canales.push(c);
  };

  // De astraura_messages: un canal por chat_id conocido localmente.
  for (const [chatKey, msgs] of porChat) {
    const disc = descubierto.get(chatKey);
    const username = disc?.username;
    let tipo: CanalTelegram["tipo"] = "chat";
    let titulo = chatKey;
    if (chatKey === "dm") {
      tipo = "dm";
      titulo = "Chatbot personal";
    }
    if (disc) {
      tipo = disc.tipo === "channel" ? "canal" : disc.tipo === "group" || disc.tipo === "supergroup" ? "grupo" : disc.tipo === "private" ? "dm" : "chat";
      titulo = disc.titulo || titulo;
    }
    const enlace = username ? `https://t.me/${username}` : chatKey === "dm" ? TELEGRAM_BOT : `https://t.me/c/${chatKey}`;
    addCanal({
      id: chatKey,
      tipo,
      titulo,
      username,
      enlace,
      ultimos: msgs.map((m) => ({
        de: m.role === "user" ? "Tú" : autor,
        texto: m.content,
        t: m.t,
      })),
    });
  }

  // De getUpdates: canales/grupos que el bot conoce pero sin mensajes locales.
  for (const [chatKey, disc] of descubierto) {
    if (vistos.has(chatKey)) continue;
    const tipo: CanalTelegram["tipo"] = disc.tipo === "channel" ? "canal" : disc.tipo === "group" || disc.tipo === "supergroup" ? "grupo" : disc.tipo === "private" ? "dm" : "chat";
    const texto = ultimoTexto.get(chatKey);
    const enlace = disc.username ? `https://t.me/${disc.username}` : `https://t.me/c/${chatKey}`;
    addCanal({
      id: chatKey,
      tipo,
      titulo: disc.titulo,
      username: disc.username,
      enlace,
      ultimos: texto ? [{ de: autor, texto, t: "" }] : [],
    });
  }

  // ─── (c) Vista previa t.me/s para canales públicos (best-effort) ──
  const publicos = canales.filter((c) => c.tipo === "canal" && c.username).slice(0, MAX_TME_FETCHES);
  await Promise.all(
    publicos.map(async (c) => {
      try {
        const sRes = await fetch(`https://t.me/s/${c.username}`, {
          signal: AbortSignal.timeout(TME_S_TIMEOUT_MS),
          cache: "no-store",
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!sRes.ok) return;
        const html = await sRes.text();
        const textos = extraerMensajesTMe(html);
        if (textos.length) {
          c.ultimos = textos.map((t) => ({ de: c.username ?? c.titulo, texto: t, t: "" }));
        }
      } catch {
        // La vista previa pública es opcional; nunca rompe la lista.
      }
    }),
  );

  return NextResponse.json({ ok: true, canales, bot }, { status: 200 });
}