import "server-only";

/**
 * Canje/renuevo/estado/desconexión de la conexión Google Drive (Ola 374).
 * ----------------------------------------------------------------------------
 * Adenda 198: Google exige `client_secret` para clientes «aplicación web»,
 * incluso con PKCE — ese canje se hacía aquí, pero el refresh token volvía
 * completo al navegador y se quedaba en `localStorage` (una custodia POR
 * DISPOSITIVO, no por cuenta, y sin sesión verificada: cualquiera podía llamar
 * a esta ruta con el `code`/`refreshToken` de otro).
 *
 * Ola 374 — CUSTODIA EN SERVIDOR:
 *   · Toda petición exige SESIÓN Supabase válida (cookie); el usuario sale
 *     SIEMPRE de esa sesión, nunca del cuerpo.
 *   · `clientId` SOLO desde variable de entorno — ya no se acepta del cuerpo.
 *   · El refresh token se guarda cifrado en `storage_credentials`
 *     (`src/lib/storage/credenciales-servidor.ts`) y JAMÁS vuelve al navegador,
 *     ni en el canje ni en la renovación.
 *   · Cuatro acciones (`accion`): `canjear` · `renovar` · `estado` · `desconectar`.
 *   · Migración de dispositivos ya conectados (Adendas 194-198): si el
 *     navegador todavía guarda un refresh token viejo en localStorage, lo
 *     manda UNA VEZ como `legacyRefreshToken` en `renovar`; si no hay fila en
 *     servidor, esta ruta lo adopta (lo guarda cifrado) y a partir de ahí el
 *     navegador ya no lo necesita — el cliente lo borra de localStorage tras
 *     la respuesta.
 *
 * Dropbox/OneDrive siguen siendo cliente público (PKCE sin secreto) y NO pasan
 * por aquí: siguen canjeando directo desde el navegador, como antes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  borrarCredencial,
  estadoCredencial,
  guardarCredencial,
  leerCredencial,
  type ProveedorAlmacenamiento,
} from "@/lib/storage/credenciales-servidor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_URLS: Record<string, string> = {
  "google-drive": "https://oauth2.googleapis.com/token",
};

const REVOKE_URLS: Record<string, string> = {
  "google-drive": "https://oauth2.googleapis.com/revoke",
};

const SECRET_ENV: Record<string, string> = {
  "google-drive": "GOOGLE_OAUTH_CLIENT_SECRET",
};

const CLIENT_ID_ENV: Record<string, string> = {
  "google-drive": "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
};

type Accion = "canjear" | "renovar" | "estado" | "desconectar";

interface Body {
  accion?: Accion;
  servicio?: string;
  code?: string;
  verifier?: string;
  redirectUri?: string;
  /** Solo `renovar`: refresh token que aún vive en localStorage del navegador (migración). */
  legacyRefreshToken?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** Usuario autenticado (Supabase). null si no hay sesión válida. */
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

async function correoDeGoogle(accessToken: string): Promise<string | undefined> {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { email?: string };
    return j.email;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo no válido" }, { status: 400 });
  }

  const servicio = String(body.servicio || "") as ProveedorAlmacenamiento;
  const tokenUrl = TOKEN_URLS[servicio];
  if (!tokenUrl) return NextResponse.json({ error: "servicio no soportado aquí" }, { status: 400 });

  // Toda acción exige sesión Supabase — el userId SIEMPRE sale de ahí.
  const userId = await usuarioActual();
  if (!userId) {
    return NextResponse.json({ error: "Inicia sesión para conectar un almacenamiento externo." }, { status: 401 });
  }

  const rl = rateLimit(`storage-oauth:${userId}:${servicio}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiadas peticiones. Espera unos segundos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const secret = process.env[SECRET_ENV[servicio]];
  if (!secret) {
    return NextResponse.json(
      { error: `Falta ${SECRET_ENV[servicio]} en el despliegue: sin él Google rechaza el canje.` },
      { status: 500 },
    );
  }
  // (Ola 374) El ID de cliente SOLO sale del entorno del servidor — ya no se
  // confía en el que mande el navegador (podía suplantar la app registrada).
  const clientId = process.env[CLIENT_ID_ENV[servicio]] || "";
  if (!clientId) return NextResponse.json({ error: `Falta ${CLIENT_ID_ENV[servicio]} en el despliegue.` }, { status: 500 });

  // Acción implícita por compatibilidad con clientes viejos (sin `accion`):
  // `code` presente → canjear; si no, renovar. Los clientes nuevos mandan `accion`.
  const accion: Accion = body.accion || (body.code ? "canjear" : "renovar");

  if (accion === "estado") {
    const st = await estadoCredencial(userId, servicio);
    return NextResponse.json({ conectado: st.conectado, cuenta_email: st.cuentaEmail });
  }

  if (accion === "desconectar") {
    const cred = await leerCredencial(userId, servicio);
    if (cred?.refreshToken && REVOKE_URLS[servicio]) {
      try {
        await fetch(REVOKE_URLS[servicio], {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: cred.refreshToken }),
        });
      } catch {
        /* revocar es best-effort: el borrado de la fila es lo que de verdad desconecta */
      }
    }
    await borrarCredencial(userId, servicio);
    return NextResponse.json({ ok: true });
  }

  if (accion === "canjear") {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      grant_type: "authorization_code",
      code: String(body.code || ""),
      code_verifier: String(body.verifier || ""),
      redirect_uri: String(body.redirectUri || ""),
    });
    try {
      const r = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      const j = (await r.json()) as GoogleTokenResponse;
      if (!r.ok || !j.access_token) {
        return NextResponse.json(
          { error: j.error_description || j.error || `El proveedor rechazó el canje (${r.status}).` },
          { status: r.ok ? 502 : r.status },
        );
      }
      const cuentaEmail = await correoDeGoogle(j.access_token);
      if (j.refresh_token) {
        const guardado = await guardarCredencial({
          userId,
          proveedor: servicio,
          refreshToken: j.refresh_token,
          cuentaEmail,
          alcance: j.scope,
        });
        if (!guardado.ok) {
          return NextResponse.json(
            { error: `No se pudo guardar la conexión en el servidor: ${guardado.error ?? "error desconocido"}.` },
            { status: 500 },
          );
        }
      }
      // NUNCA se devuelve refresh_token: solo lo que el navegador necesita YA.
      return NextResponse.json({ access_token: j.access_token, expires_in: j.expires_in, cuenta_email: cuentaEmail });
    } catch (e) {
      return NextResponse.json({ error: (e as Error)?.message || "fallo de red" }, { status: 502 });
    }
  }

  // accion === "renovar"
  let refreshToken: string | null = null;
  let cuentaEmailGuardado: string | null = null;
  const cred = await leerCredencial(userId, servicio);
  if (cred) {
    refreshToken = cred.refreshToken;
    cuentaEmailGuardado = cred.cuentaEmail;
  } else if (body.legacyRefreshToken) {
    // Migración (Adendas 194-198 → Ola 374): primer dispositivo que trae un
    // refresh token viejo de localStorage lo adopta como custodia de servidor.
    refreshToken = body.legacyRefreshToken;
  }
  if (!refreshToken) {
    return NextResponse.json(
      { error: "No hay ninguna conexión de Google Drive guardada para esta cuenta. Conéctala de nuevo.", code: "no-conectado" },
      { status: 404 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  try {
    const r = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const j = (await r.json()) as GoogleTokenResponse;
    if (!r.ok || !j.access_token) {
      // Google invalidó el refresh token (revocado por el usuario, contraseña
      // cambiada, etc.): la fila ya no sirve — se borra y se pide reconectar.
      if (r.status === 400 || r.status === 401) await borrarCredencial(userId, servicio);
      return NextResponse.json(
        {
          error: j.error_description || j.error || `Google rechazó la renovación (${r.status}). Reconecta Google Drive.`,
          code: "reconectar",
        },
        { status: r.status === 400 || r.status === 401 ? 401 : 502 },
      );
    }
    const cuentaEmail = cuentaEmailGuardado || (await correoDeGoogle(j.access_token));
    // Adopta el legacy o rota el refresh token si Google emitió uno nuevo.
    if (body.legacyRefreshToken && !cred) {
      await guardarCredencial({ userId, proveedor: servicio, refreshToken: j.refresh_token || refreshToken, cuentaEmail, alcance: j.scope });
    } else if (j.refresh_token && j.refresh_token !== refreshToken) {
      await guardarCredencial({ userId, proveedor: servicio, refreshToken: j.refresh_token, cuentaEmail: cuentaEmail ?? cuentaEmailGuardado, alcance: j.scope });
    }
    return NextResponse.json({ access_token: j.access_token, expires_in: j.expires_in, cuenta_email: cuentaEmail });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "fallo de red" }, { status: 502 });
  }
}
