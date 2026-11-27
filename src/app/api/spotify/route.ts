import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";

type Accion = "canjear" | "revocar-token";

function leerCredenciales(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

interface Body {
  accion?: Accion;
  code?: string;
  verifier?: string;
  redirectUri?: string;
}

async function usuarioActual(): Promise<string | null> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function obtenerAcceso(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const credenciales = leerCredenciales();
  if (!credenciales) return null;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: credenciales.clientId,
    client_secret: credenciales.clientSecret,
  });
  const r = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!r.ok) return null;
  return r.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo no válido" }, { status: 400 });
  }

  const userId = await usuarioActual();
  if (!userId) {
    return NextResponse.json({ error: "Inicia sesión para conectar Spotify." }, { status: 401 });
  }

  const rl = rateLimit(`spotify:${userId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Espera unos segundos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  if (body.accion === "revocar-token") {
    return NextResponse.json({ ok: true, message: "Conexión revocada" });
  }

  if (body.code) {
    if (!body.verifier || !body.redirectUri) {
      return NextResponse.json({ error: "code, verifier y redirectUri requeridos" }, { status: 400 });
    }
    const credenciales = leerCredenciales();
    if (!credenciales) {
      return NextResponse.json(
        { error: "Faltan credenciales Spotify en el servidor." },
        { status: 500 },
      );
    }
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: body.code,
      client_id: credenciales.clientId,
      client_secret: credenciales.clientSecret,
      redirect_uri: body.redirectUri,
      code_verifier: body.verifier,
    });
    const r = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const j = (await r.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!r.ok || !j.access_token) {
      return NextResponse.json(
        { error: j.error_description || j.error || "Spotify rechazó el canje" },
        { status: r.ok ? 502 : r.status },
      );
    }
    return NextResponse.json({
      ok: true,
      access_token: j.access_token!,
      refresh_token: j.refresh_token,
      expires_in: j.expires_in,
    });
  }

  return NextResponse.json({ error: "acción no válida" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const userId = await usuarioActual();
  if (!userId) {
    return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  }

  const url = new URL(req.url);
  const accessToken = url.searchParams.get("access_token");

  if (!accessToken) {
    return NextResponse.json({ error: "access_token requerido" }, { status: 400 });
  }

  const r = await fetch(`${SPOTIFY_API_URL}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) {
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
  }

  const datos = (await r.json()) as {
    id: string;
    display_name: string;
    product: string;
    country: string;
  };

  return NextResponse.json({
    ok: true,
    usuario: {
      id: datos.id,
      nombre: datos.display_name,
      premium: datos.product === "premium",
      pais: datos.country,
    },
  });
}