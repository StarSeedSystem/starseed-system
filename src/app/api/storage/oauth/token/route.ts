/**
 * Canje de código y refresco de token para almacenamientos (Adenda 198).
 * ----------------------------------------------------------------------------
 * Google exige el `client_secret` para los clientes de tipo «aplicación web»,
 * incluso usando PKCE — así que ESE canje se hace aquí, en el servidor, donde
 * el secreto vive como variable de entorno y NUNCA llega al navegador.
 * Dropbox y OneDrive sí admiten cliente público con PKCE y siguen canjeando
 * directamente desde el navegador.
 *
 * No guarda nada: devuelve los tokens de ESE usuario y las credenciales siguen
 * viviendo en su neurona, como el resto de llaves del OS.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TOKEN_URLS: Record<string, string> = {
  "google-drive": "https://oauth2.googleapis.com/token",
};

const SECRET_ENV: Record<string, string> = {
  "google-drive": "GOOGLE_OAUTH_CLIENT_SECRET",
};

export async function POST(req: Request) {
  let body: {
    servicio?: string; code?: string; verifier?: string;
    refreshToken?: string; clientId?: string; redirectUri?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo no válido" }, { status: 400 });
  }

  const servicio = String(body.servicio || "");
  const tokenUrl = TOKEN_URLS[servicio];
  if (!tokenUrl) return NextResponse.json({ error: "servicio no soportado aquí" }, { status: 400 });

  const secret = process.env[SECRET_ENV[servicio]];
  if (!secret) {
    return NextResponse.json(
      { error: `Falta ${SECRET_ENV[servicio]} en el despliegue: sin él Google rechaza el canje.` },
      { status: 500 },
    );
  }
  const clientId = String(body.clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "");
  if (!clientId) return NextResponse.json({ error: "falta el ID de cliente" }, { status: 400 });

  const params = new URLSearchParams({ client_id: clientId, client_secret: secret });
  if (body.refreshToken) {
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", String(body.refreshToken));
  } else {
    params.set("grant_type", "authorization_code");
    params.set("code", String(body.code || ""));
    params.set("code_verifier", String(body.verifier || ""));
    params.set("redirect_uri", String(body.redirectUri || ""));
  }

  try {
    const r = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const j = await r.json();
    return NextResponse.json(j, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "fallo de red" }, { status: 502 });
  }
}
