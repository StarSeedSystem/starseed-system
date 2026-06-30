import { NextRequest, NextResponse } from "next/server";

// ════════════════════════════════════════════════════════════════
// POST /api/telegram/send — proxy server-side a la Bot API de Telegram
// ----------------------------------------------------------------
// Telegram es "una opción más": CADA usuario configura SU PROPIO bot
// (token de @BotFather) y SU PROPIO chat. NO hay token compartido ni
// global. Esta ruta sólo reenvía la llamada `sendMessage` desde el
// servidor (evita CORS en el navegador y mantiene la petición fuera
// del cliente). El token llega en el cuerpo de CADA petición — es del
// usuario — y NUNCA se persiste aquí.
// ════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendBody {
  botToken?: string;
  chatId?: string;
  text?: string;
  parseMode?: "MarkdownV2" | "Markdown" | "HTML" | "none";
}

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 15_000;

/** Valida superficialmente el formato de un token de bot de Telegram. */
function looksLikeToken(token: string): boolean {
  // formato típico: <digits>:<35+ alfanum/_->  — sólo una comprobación laxa.
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token.trim());
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cuerpo de la petición inválido (se esperaba JSON)." },
      { status: 400 },
    );
  }

  const botToken = (body.botToken ?? "").trim();
  const chatId = (body.chatId ?? "").trim();
  const text = body.text ?? "";

  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Falta el token del bot." }, { status: 400 });
  }
  if (!looksLikeToken(botToken)) {
    return NextResponse.json(
      { ok: false, error: "El token del bot no tiene un formato válido (123456:ABC-...)." },
      { status: 400 },
    );
  }
  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Falta el chat id (o @usuario)." }, { status: 400 });
  }
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "El mensaje está vacío." }, { status: 400 });
  }

  // Telegram limita a 4096 caracteres por mensaje.
  const safeText = text.length > 4096 ? `${text.slice(0, 4093)}...` : text;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: safeText,
    disable_web_page_preview: true,
  };
  if (body.parseMode && body.parseMode !== "none") {
    payload.parse_mode = body.parseMode;
  }

  try {
    const tgRes = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    const data = (await tgRes.json().catch(() => null)) as
      | { ok?: boolean; result?: unknown; description?: string }
      | null;

    if (!tgRes.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.description || `Telegram respondió ${tgRes.status}.` },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true, result: data.result }, { status: 200 });
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
