"use client";

/**
 * CARPETAS DE LA CUENTA CONECTADA (Adenda 195).
 * ----------------------------------------------------------------------------
 * La Adenda 194 dejó la cuenta del servicio conectada de verdad; faltaba lo que
 * de verdad importa: **ver y elegir sus carpetas**. Esto las lista con el token
 * del usuario (nada pasa por el servidor), deja escoger varias y las devuelve
 * como carpetas vinculadas — que el paso de Cerebros ya enlaza solo al cerebro
 * principal.
 *
 * Se listan SOLO carpetas (no archivos sueltos) y se navega por niveles, como
 * en el propio servicio. Si el token caducó, se renueva sin molestar al usuario
 * (`refresh_token`); si el proveedor lo invalidó de verdad, se dice y se ofrece
 * volver a conectar — nunca se muestra una lista vacía fingiendo que no hay nada.
 */

import type { ServicioAlmacenamiento } from "@/lib/storage/carpetas-vinculadas";
import {
  cuentaDe, clientIdDe, OAUTH_ALMACENAMIENTO, type CuentaConectada,
} from "@/lib/storage/oauth-almacenamiento";

export interface CarpetaRemota {
  id: string;
  nombre: string;
  /** Ruta legible dentro del servicio (para mostrarla y guardarla). */
  ruta: string;
  /** ¿Tiene subcarpetas navegables? (Drive/OneDrive siempre lo permiten). */
  navegable: boolean;
}

export type ResultadoCarpetas =
  | { ok: true; carpetas: CarpetaRemota[] }
  | { ok: false; motivo: "sin-cuenta" | "sesion-caducada" | "error"; detalle?: string };

const LS_TOKENS = "starseed.almacenamiento.tokens.v1";

function guardarCuenta(servicio: ServicioAlmacenamiento, cuenta: CuentaConectada): void {
  try {
    const m = JSON.parse(window.localStorage.getItem(LS_TOKENS) || "{}") as Record<string, CuentaConectada>;
    m[servicio] = cuenta;
    window.localStorage.setItem(LS_TOKENS, JSON.stringify(m));
  } catch { /* modo privado: la sesión sigue en memoria */ }
}

/**
 * Devuelve un token VÁLIDO: si el que hay caducó y tenemos `refresh_token`, lo
 * renueva en silencio (PKCE público: el canje de refresco tampoco necesita
 * secreto). Nunca lanza; null = hay que volver a conectar.
 */
export async function tokenVigente(servicio: ServicioAlmacenamiento): Promise<string | null> {
  const cuenta = cuentaDe(servicio);
  if (!cuenta) return null;
  const margen = 60_000; // renovamos un minuto antes de que expire
  if (!cuenta.expiraEn || cuenta.expiraEn - margen > Date.now()) return cuenta.accessToken;
  if (!cuenta.refreshToken) return cuenta.accessToken; // sin refresco: se usará hasta que falle
  const spec = OAUTH_ALMACENAMIENTO[servicio];
  const clientId = clientIdDe(servicio);
  if (!spec || !clientId) return cuenta.accessToken;
  try {
    // (Adenda 198) Mismo motivo que el canje: el refresco de Google necesita el
    // secreto y por eso pasa por nuestro servidor.
    const porServidor = servicio === "google-drive";
    const r = porServidor
      ? await fetch("/api/storage/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ servicio, refreshToken: cuenta.refreshToken, clientId }),
        })
      : await fetch(spec.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            refresh_token: cuenta.refreshToken,
            grant_type: "refresh_token",
          }),
        });
    const j = (await r.json()) as { access_token?: string; expires_in?: number; refresh_token?: string };
    if (!r.ok || !j.access_token) return null; // el proveedor lo invalidó: reconectar
    const nueva: CuentaConectada = {
      ...cuenta,
      accessToken: j.access_token,
      refreshToken: j.refresh_token || cuenta.refreshToken,
      expiraEn: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined,
    };
    guardarCuenta(servicio, nueva);
    return nueva.accessToken;
  } catch {
    return cuenta.accessToken;
  }
}

/**
 * Lista las CARPETAS de un nivel de la cuenta conectada.
 * `padre` vacío = raíz. Cada servicio tiene su API, pero el resultado es igual.
 */
export async function listarCarpetasRemotas(
  servicio: ServicioAlmacenamiento,
  padre = "",
  rutaPadre = "",
): Promise<ResultadoCarpetas> {
  const token = await tokenVigente(servicio);
  if (!token) return { ok: false, motivo: "sin-cuenta" };
  try {
    if (servicio === "google-drive") {
      const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and '${padre || "root"}' in parents`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=100&orderBy=name`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) return { ok: false, motivo: "sesion-caducada" };
      const j = (await r.json()) as { files?: { id: string; name: string }[]; error?: { message?: string } };
      if (!r.ok) return { ok: false, motivo: "error", detalle: j.error?.message };
      return {
        ok: true,
        carpetas: (j.files || []).map((f) => ({
          id: f.id, nombre: f.name, ruta: `${rutaPadre}/${f.name}`.replace(/^\/+/, ""), navegable: true,
        })),
      };
    }

    if (servicio === "dropbox") {
      const r = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path: padre || "", recursive: false, limit: 200 }),
      });
      if (r.status === 401) return { ok: false, motivo: "sesion-caducada" };
      const j = (await r.json()) as {
        entries?: { ".tag": string; id: string; name: string; path_lower?: string }[]; error_summary?: string;
      };
      if (!r.ok) return { ok: false, motivo: "error", detalle: j.error_summary };
      return {
        ok: true,
        carpetas: (j.entries || [])
          .filter((e) => e[".tag"] === "folder")
          .map((e) => ({ id: e.path_lower || e.id, nombre: e.name, ruta: e.path_lower || e.name, navegable: true })),
      };
    }

    if (servicio === "onedrive") {
      const base = padre
        ? `https://graph.microsoft.com/v1.0/me/drive/items/${padre}/children`
        : "https://graph.microsoft.com/v1.0/me/drive/root/children";
      const r = await fetch(`${base}?$select=id,name,folder&$top=100`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) return { ok: false, motivo: "sesion-caducada" };
      const j = (await r.json()) as { value?: { id: string; name: string; folder?: unknown }[]; error?: { message?: string } };
      if (!r.ok) return { ok: false, motivo: "error", detalle: j.error?.message };
      return {
        ok: true,
        carpetas: (j.value || [])
          .filter((e) => !!e.folder)
          .map((e) => ({ id: e.id, nombre: e.name, ruta: `${rutaPadre}/${e.name}`.replace(/^\/+/, ""), navegable: true })),
      };
    }

    return { ok: false, motivo: "error", detalle: "Ese servicio aún no lista carpetas." };
  } catch (e) {
    return { ok: false, motivo: "error", detalle: (e as Error)?.message };
  }
}
