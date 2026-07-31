"use client";

/**
 * StarSeed OS — ADMINISTRACIÓN DE TOKENS DEL SERVIDOR PROPIO (Adenda 117).
 * ============================================================================
 * Cliente del ciclo de vida de tokens del servidor de referencia
 * (docs/examples/starseed-mesh-server): EMISIÓN, RENOVACIÓN, REVOCACIÓN y
 * ROTACIÓN de la clave de firma — todo desde el OS, sin tocar el servidor.
 *
 * El token de ADMIN se pasa de forma TRANSITORIA (nunca se persiste en el OS):
 * quien administra lo teclea en el momento y se descarta al terminar. Los
 * tokens emitidos son auto-verificables (firma HMAC) y una rotación de clave
 * con `dropPrev` los invalida a todos de golpe (palanca de revocación masiva).
 *
 * Best-effort: si el endpoint no responde o CORS lo bloquea, se devuelve un
 * resultado con detalle legible. NUNCA lanza.
 */

import { getMeshServer } from "./servers";

export interface TokenAdminResult<T = unknown> {
  ok: boolean;
  data?: T;
  detail: string;
}

/** Token emitido por el servidor de referencia (`/tokens/issue`). */
export interface IssuedToken {
  token: string;
  ids: string[];
  exp: number;
  kid?: string;
}

function endpointOf(serverId: string): string | null {
  try {
    const srv = getMeshServer(serverId);
    const ep = srv?.endpoint?.trim();
    return ep ? ep.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

async function callAdmin<T>(
  serverId: string,
  path: string,
  auth: string,
  body: Record<string, unknown>,
): Promise<TokenAdminResult<T>> {
  const ep = endpointOf(serverId);
  if (!ep) return { ok: false, detail: "el servidor no tiene endpoint (el servidor StarSeed no admite administración de tokens)" };
  try {
    const res = await fetch(`${ep}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify(body),
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, detail: res.status === 401 ? "clave de admin inválida o sin permiso" : msg };
    }
    return { ok: true, data: data as T, detail: "ok" };
  } catch {
    return { ok: false, detail: "servidor inalcanzable (endpoint/CORS)" };
  }
}

/** Emite un token nuevo para unas identidades (ids) con TTL opcional. Requiere admin. */
export async function issueServerToken(
  serverId: string,
  adminToken: string,
  ids: string[],
  ttlMs?: number,
): Promise<TokenAdminResult<IssuedToken>> {
  const clean = ids.map((s) => s.trim()).filter(Boolean);
  return callAdmin<IssuedToken>(serverId, "/tokens/issue", adminToken, {
    ids: clean,
    ...(ttlMs && ttlMs > 0 ? { ttlMs } : {}),
  });
}

/**
 * Renueva la caducidad de un token (autenticando con el PROPIO token, no admin).
 * El servidor devuelve un token nuevo re-firmado con caducidad extendida.
 */
export async function refreshServerToken(
  serverId: string,
  token: string,
  ttlMs?: number,
): Promise<TokenAdminResult<IssuedToken>> {
  return callAdmin<IssuedToken>(serverId, "/tokens/refresh", token, { ...(ttlMs && ttlMs > 0 ? { ttlMs } : {}) });
}

/** Revoca un token (lo añade a la lista de revocación del servidor). Requiere admin. */
export async function revokeServerToken(
  serverId: string,
  adminToken: string,
  token: string,
): Promise<TokenAdminResult<{ revoked: string }>> {
  return callAdmin<{ revoked: string }>(serverId, "/tokens/revoke", adminToken, { token: token.trim() });
}

/**
 * Rota la clave de firma de tokens. Con `dropPrev` descarta la clave previa al
 * instante → invalida DE GOLPE todos los tokens firmados con ella (revocación
 * masiva ante compromiso). Sin `dropPrev` mantiene una gracia (los tokens ya
 * emitidos siguen valiendo hasta caducar). Requiere admin.
 */
export async function rotateServerTokenKey(
  serverId: string,
  adminToken: string,
  dropPrev?: boolean,
): Promise<TokenAdminResult<{ kid: string; gracePrev: boolean }>> {
  return callAdmin<{ kid: string; gracePrev: boolean }>(serverId, "/tokens/rotate-key", adminToken, {
    dropPrev: !!dropPrev,
  });
}
