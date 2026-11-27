import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { extraerColaDeRespuesta, validarUriSpotify } from "@/lib/sala-sonido/spotify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";

type Accion = "canjear" | "revocar-token" | "dispositivos" | "estado" | "play" | "pausa" | "siguiente" | "anterior" | "seek" | "volumen" | "cola-anadir";

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
  deviceId?: string;
  uris?: string[];
  positionMs?: number;
  volumePercent?: number;
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

async function spotifyFetch(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const r = await fetch(`${SPOTIFY_API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (r.status === 204) {
    return { ok: true, status: 204 };
  }

  const contentType = r.headers.get("content-type");
  const data = contentType?.includes("application/json") ? await r.json() : await r.text();

  if (!r.ok) {
    const errorMsg = typeof data === "object" && data !== null && "error" in data
      ? (data as { error?: { message?: string } }).error?.message ?? "Error de Spotify"
      : String(data);
    return { ok: false, status: r.status, error: errorMsg };
  }

  return { ok: true, status: r.status, data };
}

async function verificarPremium(accessToken: string): Promise<boolean> {
  const resultado = await spotifyFetch(accessToken, "/me");
  if (!resultado.ok || !resultado.data) return false;
  const usuario = resultado.data as { product?: string };
  return usuario.product === "premium";
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

  const authHeader = req.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : body.code ? null : req.headers.get("x-spotify-token");

  if (body.accion === "dispositivos" || body.accion === "estado" || body.accion === "play" || body.accion === "pausa" || body.accion === "siguiente" || body.accion === "anterior" || body.accion === "seek" || body.accion === "volumen" || body.accion === "cola-anadir") {
    if (!accessToken) {
      return NextResponse.json({ error: "Token de acceso requerido" }, { status: 401 });
    }

    if (body.accion !== "dispositivos" && body.accion !== "estado") {
      const esPremium = await verificarPremium(accessToken);
      if (!esPremium) {
        return NextResponse.json(
          {
            error: "Control de reproducción requiere cuenta Spotify Premium. Se ofrecen solo enlaces públicos.",
            premiumRequerido: false,
          },
          { status: 403 }
        );
      }
    }

    if (body.accion === "dispositivos") {
      const res = await spotifyFetch(accessToken, "/me/player/devices");
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json(res.data);
    }

    if (body.accion === "estado") {
      const res = await spotifyFetch(accessToken, "/me/player");
      if (res.status === 204 || !res.data) {
        return NextResponse.json({ reproduciendo: false, enCola: [] });
      }
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      const data = res.data as { queue?: { items: unknown[] } };
      const cola = data.queue ? extraerColaDeRespuesta(data.queue) : [];
      return NextResponse.json({ ...res.data, enCola: cola });
    }

    if (body.accion === "play") {
      const payload: Record<string, unknown> = {};
      if (body.uris) payload.uris = body.uris;
      const res = await spotifyFetch(accessToken, "/me/player/play" + (body.deviceId ? `?device_id=${body.deviceId}` : ""), {
        method: "PUT",
        body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
      });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "pausa") {
      const res = await spotifyFetch(accessToken, "/me/player/pause" + (body.deviceId ? `?device_id=${body.deviceId}` : ""), {
        method: "PUT",
      });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "siguiente") {
      const res = await spotifyFetch(accessToken, "/me/player/next", { method: "POST" });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "anterior") {
      const res = await spotifyFetch(accessToken, "/me/player/previous", { method: "POST" });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "seek") {
      if (body.positionMs === undefined) {
        return NextResponse.json({ error: "positionMs requerido" }, { status: 400 });
      }
      const res = await spotifyFetch(accessToken, `/me/player/seek?position_ms=${body.positionMs}` + (body.deviceId ? `&device_id=${body.deviceId}` : ""), {
        method: "PUT",
      });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "volumen") {
      if (body.volumePercent === undefined) {
        return NextResponse.json({ error: "volumePercent requerido" }, { status: 400 });
      }
      const res = await spotifyFetch(accessToken, `/me/player/volume?volume_percent=${body.volumePercent}` + (body.deviceId ? `&device_id=${body.deviceId}` : ""), {
        method: "PUT",
      });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.accion === "cola-anadir") {
      if (!body.uris || body.uris.length === 0) {
        return NextResponse.json({ error: "uris requerido" }, { status: 400 });
      }
      for (const uri of body.uris) {
        if (!validarUriSpotify(uri)) {
          return NextResponse.json({ error: `URI de Spotify inválida: ${uri}` }, { status: 400 });
        }
        const res = await spotifyFetch(accessToken, `/me/player/queue?uri=${encodeURIComponent(uri)}` + (body.deviceId ? `&device_id=${body.deviceId}` : ""), {
          method: "POST",
        });
        if (!res.ok) {
          return NextResponse.json({ error: res.error }, { status: res.status });
        }
      }
      return NextResponse.json({ ok: true });
    }
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