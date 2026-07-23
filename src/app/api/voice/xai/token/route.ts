/**
 * POST /api/voice/xai/token — Genera un TOKEN EFÍMERO de xAI para que el
 * navegador abra el WebSocket de voz en tiempo real sin exponer la API key.
 * ============================================================================
 * Seguridad:
 *   · La API key server-side vive en process.env.XAI_API_KEY (la configura el
 *     orchestrator con la key GRATUITA de StarSeed). NUNCA se envía al cliente.
 *   · El usuario puede enviar su PROPIA key en el body (`apiKey`) y, si lo hace,
 *     se usa SOLO para esta petición (no se persiste en el servidor). Si no la
 *     envía, se usa la de StarSeed (gratuita por defecto).
 *   · El cliente recibe un token efímero de corta vida y se conecta con el
 *     protocolo `xai-client-secret.<TOKEN>`. La API key nunca viaja al bundle.
 *
 * El endpoint de tokens efímeros de xAI no está 100% documentado en la API
 * pública; este handler lo intenta contra la ruta estándar y, si la API la
 * devuelve, la reenvía. Ante cualquier fallo devuelve 502 con un mensaje
 * honesto (el cliente entonces informa y Aurora usa su cadena de respaldo).
 *
 * runtime: nodejs (necesita fetch + red server-side; NO edge para poder leer
 * process.env con la key y reintentar con backoff).
 */

import { NextRequest, NextResponse } from "next/server";

/** Endpoint estándar de tokens efímeros de xAI (voz en tiempo real). */
const XAI_EPHEMERAL_ENDPOINT = "https://api.x.ai/v1/audio/realtime/ephemeral-tokens";

export const runtime = "nodejs";
// El WebSocket del cliente se mantiene vivo en el navegador; esta ruta es corta.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  // 1) Resolver la API key: la propia del usuario (si la envió) o la de StarSeed.
  let body: { apiKey?: unknown; personaId?: unknown } = {};
  try {
    const txt = await req.text();
    if (txt) body = JSON.parse(txt) as { apiKey?: unknown; personaId?: unknown };
  } catch {
    /* body vacío o inválido: usamos la key de StarSeed */
  }

  const userKey =
    typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;
  const serverKey = process.env.XAI_API_KEY;

  const effectiveKey = userKey || serverKey;
  if (!effectiveKey) {
    return NextResponse.json(
      {
        error:
          "Falta la API key de xAI. El servidor no tiene XAI_API_KEY configurada y no enviaste tu propia key.",
      },
      { status: 503 },
    );
  }

  // 2) Pedir el token efímero a xAI usando la key server-side.
  try {
    // personaId es informativo (el cliente ya eligió voz+instrucciones); lo
    // pasamos si la API lo acepta, pero no es obligatorio.
    const payload: Record<string, unknown> = {};
    if (typeof body.personaId === "string" && body.personaId.trim()) {
      payload.persona = body.personaId.trim();
    }

    const upstream = await fetch(XAI_EPHEMERAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      // xAI responde 403 "Team is not authorized" cuando la key server-side
      // (p.ej. la compartida de StarSeed) no tiene permiso para ephemeral
      // tokens. En ese caso el navegador debe usar el PROXY WebSocket
      // server-side (/api/voice/xai/stream), que autentica con la key del
      // servidor sin exponerla.
      const notAuthorized = /not authorized|does not have permission/i.test(detail);
      if (notAuthorized) {
        return NextResponse.json(
          {
            error:
              "Esta API key no puede emitir tokens efímeros. Usa el proxy de voz xAI (requiere despliegue con proxy WebSocket, p.ej. Cloud Run).",
            mode: "proxy-needed",
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        {
          error: `xAI no pudo emitir el token efímero (${upstream.status}).`,
          detail: detail.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const data = (await upstream.json().catch(() => null)) as
      | { token?: string; expires_at?: number; expiresAt?: number }
      | null;

    const token = data?.token;
    if (!token) {
      return NextResponse.json(
        { error: "xAI devolvió una respuesta sin token efímero." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      token,
      expires_at: data?.expires_at ?? data?.expiresAt ?? undefined,
      // Informamos al cliente de qué modo usó (StarSeed gratuita vs key propia),
      // sin revelar la key.
      mode: userKey ? "user-key" : "starseed-default",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo contactar a xAI para el token de voz.", detail: String(e) },
      { status: 502 },
    );
  }
}
