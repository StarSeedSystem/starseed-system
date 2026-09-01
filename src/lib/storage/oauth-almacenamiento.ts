"use client";

/**
 * OAUTH REAL DE ALMACENAMIENTOS EXTERNOS (Adenda 194).
 * ----------------------------------------------------------------------------
 * Antes, «Google Drive» en las carpetas era una DECLARACIÓN: se guardaba el
 * nombre y nada más. Esto conecta de verdad la cuenta del servicio y pide los
 * permisos que hacen falta para leer (y escribir donde el servicio lo permita)
 * las carpetas del usuario.
 *
 * Flujo: **PKCE en el navegador** (RFC 7636), sin secreto de cliente y sin
 * servidor que guarde credenciales — el token vive en esta neurona, como el
 * resto de llaves del OS. Una ruta mínima (`/api/storage/oauth/callback`)
 * recoge el `code` y lo devuelve por `postMessage` a la ventana que abrió el
 * flujo; el intercambio por token lo hace el propio navegador.
 *
 * HONESTIDAD IMPORTANTE: ningún OAuth funciona sin una app registrada en el
 * proveedor. El OS usa el ID de cliente que haya configurado (variable de
 * entorno pública o el que pegue el usuario en Integraciones); si no hay
 * ninguno, se dice exactamente eso y cómo obtenerlo — nunca se finge una
 * conexión.
 */

import type { ServicioAlmacenamiento } from "@/lib/storage/carpetas-vinculadas";

export interface EspecOAuth {
  servicio: ServicioAlmacenamiento;
  label: string;
  authUrl: string;
  tokenUrl: string;
  /** Permisos mínimos para ver y usar las carpetas del usuario. */
  scopes: string[];
  /** Variable de entorno pública con el ID de cliente. */
  envClientId: string;
  /** Dónde se consigue el ID de cliente (para decirlo con claridad). */
  consola: string;
  /** ¿El proveedor admite PKCE público (sin secreto)? */
  pkce: boolean;
}

export const OAUTH_ALMACENAMIENTO: Partial<Record<ServicioAlmacenamiento, EspecOAuth>> = {
  "google-drive": {
    servicio: "google-drive",
    label: "Google Drive",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // (Adenda 196) SOLO `drive.file`: es un scope NO SENSIBLE, así que la app
    // se publica para cualquiera sin verificación de Google ni auditoría anual.
    // `drive.readonly` (leer TODO el Drive) es RESTRINGIDO: obligaba a
    // verificación + evaluación de seguridad de pago, y encima daba mucho más
    // acceso del necesario. Con `drive.file` el usuario elige las carpetas en
    // el selector de Google y la app solo ve ESAS.
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    envClientId: "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    consola: "https://console.cloud.google.com/apis/credentials",
    pkce: true,
  },
  dropbox: {
    servicio: "dropbox",
    label: "Dropbox",
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: ["files.metadata.read", "files.content.read", "files.content.write", "account_info.read"],
    envClientId: "NEXT_PUBLIC_DROPBOX_CLIENT_ID",
    consola: "https://www.dropbox.com/developers/apps",
    pkce: true,
  },
  onedrive: {
    servicio: "onedrive",
    label: "OneDrive",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["Files.ReadWrite.All", "User.Read", "offline_access"],
    envClientId: "NEXT_PUBLIC_MICROSOFT_CLIENT_ID",
    consola: "https://entra.microsoft.com (Registros de aplicaciones)",
    pkce: true,
  },
};

const LS_TOKENS = "starseed.almacenamiento.tokens.v1";
const LS_CLIENTIDS = "starseed.almacenamiento.clientids.v1";

export interface CuentaConectada {
  servicio: ServicioAlmacenamiento;
  cuenta?: string;
  accessToken: string;
  refreshToken?: string;
  expiraEn?: number;
  scopes: string[];
  conectadaEn: number;
}

function leerMapa<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(key) || "{}") as Record<string, T>; } catch { return {}; }
}

function guardarMapa<T>(key: string, v: Record<string, T>): void {
  try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* modo privado */ }
}

/** Cuentas de almacenamiento ya conectadas en esta neurona. */
export function cuentasConectadas(): Record<string, CuentaConectada> {
  return leerMapa<CuentaConectada>(LS_TOKENS);
}

export function cuentaDe(servicio: ServicioAlmacenamiento): CuentaConectada | null {
  return cuentasConectadas()[servicio] ?? null;
}

export function olvidarCuenta(servicio: ServicioAlmacenamiento): void {
  const m = cuentasConectadas();
  delete m[servicio];
  guardarMapa(LS_TOKENS, m);
}

/** ID de cliente configurado: el que pegó el usuario o el del entorno. */
export function clientIdDe(servicio: ServicioAlmacenamiento): string | null {
  const spec = OAUTH_ALMACENAMIENTO[servicio];
  if (!spec) return null;
  const propio = leerMapa<string>(LS_CLIENTIDS)[servicio];
  if (propio) return propio;
  const env = (process.env as Record<string, string | undefined>)[spec.envClientId];
  return env && env.length > 5 ? env : null;
}

/** Guarda el ID de cliente que el usuario obtuvo en la consola del proveedor. */
export function guardarClientId(servicio: ServicioAlmacenamiento, clientId: string): void {
  const m = leerMapa<string>(LS_CLIENTIDS);
  m[servicio] = clientId.trim();
  guardarMapa(LS_CLIENTIDS, m);
}

/* ── PKCE ─────────────────────────────────────────────────────────────────── */

function base64url(bytes: ArrayBuffer): string {
  const b = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generarPkce(): Promise<{ verifier: string; challenge: string }> {
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  const verifier = base64url(arr.buffer);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(hash) };
}

export type ResultadoConexion =
  | { ok: true; cuenta: CuentaConectada }
  | { ok: false; motivo: "sin-client-id" | "cancelado" | "error"; detalle?: string; consola?: string };

/**
 * Abre el consentimiento REAL del proveedor y, al volver, canjea el código por
 * un token (PKCE, sin secreto). Devuelve la cuenta conectada o el motivo exacto
 * por el que no se pudo — nunca una conexión fingida.
 */
export async function conectarAlmacenamiento(servicio: ServicioAlmacenamiento): Promise<ResultadoConexion> {
  const spec = OAUTH_ALMACENAMIENTO[servicio];
  if (!spec) return { ok: false, motivo: "error", detalle: "Ese servicio aún no tiene conexión directa." };
  const clientId = clientIdDe(servicio);
  if (!clientId) {
    return {
      ok: false, motivo: "sin-client-id", consola: spec.consola,
      detalle: `Para conectar ${spec.label} hace falta el ID de cliente de una app registrada (gratis). Créala en ${spec.consola}, añade como URI de redirección ${redirectUri()} y pégalo aquí.`,
    };
  }
  const { verifier, challenge } = await generarPkce();
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)).buffer);
  try { window.sessionStorage.setItem(`ss.oauth.${state}`, JSON.stringify({ servicio, verifier })); } catch { /* */ }

  const url = new URL(spec.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", spec.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (servicio === "google-drive") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  const code = await esperarCodigo(url.toString(), state);
  if (!code) return { ok: false, motivo: "cancelado" };
  return canjear(servicio, clientId, code, verifier);
}

/** URI de redirección de este OS (hay que declararla en la app del proveedor). */
export function redirectUri(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/storage/oauth/callback`;
}

/** Abre la ventana de consentimiento y espera el `code` por postMessage. */
function esperarCodigo(url: string, state: string): Promise<string | null> {
  return new Promise((resolve) => {
    let ventana: Window | null = null;
    try { ventana = window.open(url, "starseed-oauth", "width=520,height=680"); } catch { ventana = null; }
    if (!ventana) { resolve(null); return; }
    let cerrado = 0;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { tipo?: string; code?: string; state?: string } | null;
      if (!d || d.tipo !== "starseed:oauth" || d.state !== state) return;
      limpiar();
      resolve(d.code || null);
    };
    const vigilante = window.setInterval(() => {
      if (ventana?.closed) { cerrado += 1; if (cerrado > 1) { limpiar(); resolve(null); } }
    }, 700);
    const limpiar = () => {
      window.removeEventListener("message", onMsg);
      window.clearInterval(vigilante);
      try { ventana?.close(); } catch { /* */ }
    };
    window.addEventListener("message", onMsg);
    // Tope razonable: 3 minutos de consentimiento.
    window.setTimeout(() => { limpiar(); resolve(null); }, 180000);
  });
}

/** Canjea el código por el token (PKCE: sin secreto de cliente). */
async function canjear(
  servicio: ServicioAlmacenamiento, clientId: string, code: string, verifier: string,
): Promise<ResultadoConexion> {
  const spec = OAUTH_ALMACENAMIENTO[servicio]!;
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    });
    const r = await fetch(spec.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = (await r.json()) as {
      access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string; error?: string;
    };
    if (!r.ok || !j.access_token) {
      return { ok: false, motivo: "error", detalle: j.error_description || j.error || `El proveedor rechazó el canje (${r.status}).` };
    }
    const cuenta: CuentaConectada = {
      servicio,
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiraEn: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined,
      scopes: (j.scope || spec.scopes.join(" ")).split(" ").filter(Boolean),
      conectadaEn: Date.now(),
    };
    cuenta.cuenta = await correoDeLaCuenta(servicio, cuenta.accessToken);
    const m = cuentasConectadas();
    m[servicio] = cuenta;
    guardarMapa(LS_TOKENS, m);
    return { ok: true, cuenta };
  } catch (e) {
    return { ok: false, motivo: "error", detalle: (e as Error)?.message || "No se pudo canjear el código." };
  }
}

/** Correo/identidad de la cuenta conectada (para mostrarlo con honestidad). */
async function correoDeLaCuenta(servicio: ServicioAlmacenamiento, token: string): Promise<string | undefined> {
  try {
    if (servicio === "google-drive") {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token}` } });
      const j = (await r.json()) as { email?: string };
      return j.email;
    }
    if (servicio === "dropbox") {
      const r = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await r.json()) as { email?: string };
      return j.email;
    }
    if (servicio === "onedrive") {
      const r = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${token}` } });
      const j = (await r.json()) as { userPrincipalName?: string; mail?: string };
      return j.mail || j.userPrincipalName;
    }
  } catch { /* la conexión vale igual sin el correo */ }
  return undefined;
}
