import { NextRequest, NextResponse } from "next/server";

// ════════════════════════════════════════════════════════════════
// POST /api/telegram/test — comprueba el bot del usuario (getMe) y,
// opcionalmente, lista chats recientes (getUpdates) para ayudarle a
// encontrar SU chat id. Igual que /send: el token es del usuario, va
// en el cuerpo y NO se persiste. Sirve para el botón "Probar".
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestBody {
  botToken?: string;
  /** Si true, además de getMe intenta getUpdates para descubrir chat ids. */
  withUpdates?: boolean;
}

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 15_000;

function looksLikeToken(token: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token.trim());
}

/** Chats descubiertos vía getUpdates (para sugerir un chat id al usuario). */
interface DiscoveredChat {
  id: number | string;
  type?: string;
  title?: string;
  username?: string;
  firstName?: string;
}

export async function POST(req: NextRequest) {
  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cuerpo de la petición inválido (se esperaba JSON)." },
      { status: 400 },
    );
  }

  const botToken = (body.botToken ?? "").trim();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Falta el token del bot." }, { status: 400 });
  }
  if (!looksLikeToken(botToken)) {
    return NextResponse.json(
      { ok: false, error: "El token del bot no tiene un formato válido (123456:ABC-...)." },
      { status: 400 },
    );
  }

  try {
    // ─── getMe: valida el token y devuelve el nombre del bot ───────
    const meRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    const meData = (await meRes.json().catch(() => null)) as
      | {
          ok?: boolean;
          description?: string;
          result?: { id?: number; username?: string; first_name?: string };
        }
      | null;

    if (!meRes.ok || !meData?.ok || !meData.result) {
      return NextResponse.json(
        { ok: false, error: meData?.description || `Telegram respondió ${meRes.status}.` },
        { status: 200 },
      );
    }

    const bot = {
      id: meData.result.id,
      username: meData.result.username,
      name: meData.result.first_name || meData.result.username || "bot",
    };

    // ─── getUpdates (opcional): descubre chat ids recientes ────────
    let chats: DiscoveredChat[] = [];
    if (body.withUpdates) {
      try {
        const upRes = await fetch(`${TELEGRAM_API}/bot${botToken}/getUpdates?limit=20`, {
          method: "GET",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
        const upData = (await upRes.json().catch(() => null)) as
          | { ok?: boolean; result?: Array<Record<string, any>> }
          | null;

        if (upData?.ok && Array.isArray(upData.result)) {
          const seen = new Set<string>();
          for (const update of upData.result) {
            // El chat puede venir en distintos tipos de update.
            const chat =
              update?.message?.chat ??
              update?.edited_message?.chat ??
              update?.channel_post?.chat ??
              update?.my_chat_member?.chat;
            if (!chat || chat.id === undefined) continue;
            const key = String(chat.id);
            if (seen.has(key)) continue;
            seen.add(key);
            chats.push({
              id: chat.id,
              type: chat.type,
              title: chat.title,
              username: chat.username,
              firstName: chat.first_name,
            });
          }
        }
      } catch {
        // getUpdates es best-effort: si falla, devolvemos sólo el bot.
        chats = [];
      }
    }

    return NextResponse.json({ ok: true, bot, chats }, { status: 200 });
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "TimeoutError"
        ? "Telegram no respondió a tiempo (15s)."
        : err instanceof Error
          ? err.message
          : "No se pudo contactar con Telegram.";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
