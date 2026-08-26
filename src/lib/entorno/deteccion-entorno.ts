"use client";
/**
 * deteccion-entorno.ts — Detección AUTOMÁTICA del entorno al abrir el OS desde
 * CUALQUIER medio (navegador, PWA, app, terminal vía backend local).
 *
 * Qué hace al arrancar (todo best-effort, NUNCA lanza, nunca bloquea la carga):
 *  1. Sesión actual: ¿hay cuenta ya iniciada en ESTA ventana?
 *  2. Cuentas que usaron este dispositivo: lee el registro de sesiones por
 *     dispositivo (`device_sessions`, clave = deviceId estable local) y ofrece
 *     reanudar la más reciente (magic link OTP — sin pedir credenciales).
 *  3. Medios disponibles: backend local (127.0.0.1:8000), Cloudflare Tunnel,
 *     nube (Vercel). Cada medio responde o no; nada se asume.
 *  4. Almacenamiento para cerebros/memorias: volúmenes que ve el backend
 *     (/api/starseed/storage/devices) + estado de sincronización.
 *  5. Publica un snapshot en window.STARSEED.entorno + evento
 *     `starseed:entorno` para que cualquier panel lo muestre, y guarda el
 *     "último entorno visto" en localStorage (arranque siguiente más rápido).
 *
 * Privacidad: el registro solo contiene {deviceId, userId, ts, medio} por
 * cuenta propia (service_role solo dentro de /api); no hay datos biométricos
 * ni contenido de memorias aquí — solo punteros.
 */
import { deviceId } from "@/lib/sync/entity-state";

export type MedioEntorno = "local" | "tunel" | "nube";

export interface MedioInfo {
  readonly medio: MedioEntorno;
  readonly url: string;
  readonly ok: boolean;
  readonly ms: number;
  readonly detalle?: string;
}

export interface SesionDispositivo {
  readonly user_id: string;
  readonly email?: string | null;
  readonly ts: number;
  readonly medio: MedioEntorno;
}

export interface SnapshotEntorno {
  readonly deviceId: string;
  readonly medioActual: MedioEntorno;
  /** Sesión viva en esta ventana (si la hay). */
  readonly sesionActual: { user_id: string; email?: string | null } | null;
  /** Otras cuentas que usaron este dispositivo, más reciente primero (excluye la actual). */
  readonly otrasCuentas: SesionDispositivo[];
  /** Medios sondeados con su latencia. */
  readonly medios: MedioInfo[];
  /** Almacenamiento visible para cerebros/memorias. */
  readonly almacenamiento: {
    ok: boolean;
    dispositivos: number;
    nombres: string[];
    error?: string;
  };
  readonly ts: number;
}

const LS_ULTIMO = "starseed.entorno.ultimo.v1";

function timeoutFetch(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

/** Sondea un medio del backend 1.58 y devuelve su estado real. */
async function sondearMedio(medio: MedioEntorno, url: string): Promise<MedioInfo> {
  const t0 = Date.now();
  try {
    const r = await timeoutFetch(`${url.replace(/\/$/, "")}/api/status`, medio === "local" ? 2500 : 6000);
    const ms = Date.now() - t0;
    // La nube (nuestro propio origen) está "viva" si responde ALGO de nuestro
    // servidor — un 401/404 de una ruta protegida sigue demostrando que el
    // medio existe y sirve el OS.
    if (!r.ok && !(medio === "nube" && r.status < 500)) {
      return { medio, url, ok: false, ms, detalle: `HTTP ${r.status}` };
    }
    return { medio, url, ok: true, ms };
  } catch (e) {
    return { medio, url, ok: false, ms: Date.now() - t0, detalle: (e as Error)?.name === "AbortError" ? "timeout" : "sin respuesta" };
  }
}

/** Endpoint local candidato: mismo criterio que astraura-158-client (default 8000). */
function urlLocal(): string {
  try {
    // Reutiliza la resolución por dispositivo si existe (mismo contrato).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = (window as any).__STARSEED_LOCAL_ENDPOINT__;
    if (typeof mod === "string" && mod.startsWith("http")) return mod;
  } catch { /* noop */ }
  return "http://127.0.0.1:8000";
}

function urlTunel(): string {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.includes("gateway") && !k.includes("tunnel")) continue;
      const v = localStorage.getItem(k);
      if (v && v.startsWith("https://trycloudflare.com")) return v.trim();
    }
  } catch { /* noop */ }
  return "";
}

/**
 * Registra ESTA sesión (cuenta+dispositivo+medio) para que otra ventana/medio
 * pueda detectarla después. Server-side escribe con service_role; si no hay
 * sesión, no registra nada (invitados no dejan huella).
 */
export async function registrarSesionDispositivo(medio: MedioEntorno): Promise<void> {
  try {
    await timeoutFetch("/api/dispositivo/sesion", 5000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId(), medio }),
    });
  } catch { /* silencioso: la detección jamás estorba */ }
}

/** Lee las cuentas que usaron este dispositivo (excluye opcionalmente la actual). */
async function leerCuentasDelDispositivo(excluirUserId: string | null): Promise<SesionDispositivo[]> {
  try {
    const r = await timeoutFetch(`/api/dispositivo/sesion?device_id=${encodeURIComponent(deviceId())}`, 5000);
    if (!r.ok) return [];
    const j = await r.json();
    const rows: SesionDispositivo[] = Array.isArray(j.sesiones) ? j.sesiones : [];
    return rows.filter((s) => !excluirUserId || s.user_id !== excluirUserId);
  } catch {
    return [];
  }
}

/** Almacenamiento visible desde el backend local (volúmenes reales). */
async function sondearAlmacenamiento(medios: MedioInfo[]): Promise<SnapshotEntorno["almacenamiento"]> {
  const vivo = medios.find((m) => m.ok);
  if (!vivo) return { ok: false, dispositivos: 0, nombres: [], error: "ningún medio del backend responde" };
  try {
    const r = await timeoutFetch(`${vivo.url.replace(/\/$/, "")}/api/storage/devices`, 8000);
    if (!r.ok) return { ok: false, dispositivos: 0, nombres: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    // Forma REAL verificada en vivo: {devices:[{device, mountpoint, fstype,...}]}
    const lista: Array<{ name?: string; device?: string; mountpoint?: string }> =
      Array.isArray(j?.devices) ? j.devices : Array.isArray(j) ? j : [];
    const nombreDe = (d: { name?: string; device?: string; mountpoint?: string }) =>
      String(d.mountpoint || d.name || d.device || "volumen").split("/").pop() ||
      String(d.mountpoint || d.device || "volumen");
    return {
      ok: true,
      dispositivos: lista.length,
      // Volumes reales del sistema: filtramos pseudo-sistemas sin montaje útil.
      nombres: lista
        .filter((d) => d.mountpoint && d.mountpoint !== "/dev")
        .slice(0, 8)
        .map(nombreDe),
    };
  } catch (e) {
    return { ok: false, dispositivos: 0, nombres: [], error: (e as Error)?.message ?? "sin respuesta" };
  }
}

/** Sesión viva en esta ventana (según cookies Supabase del OS). */
async function leerSesionActual(): Promise<{ user_id: string; email?: string | null } | null> {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data.user ? { user_id: data.user.id, email: data.user.email ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Detección completa. Devuelve el snapshot y LO PUBLICA en
 * window.STARSEED.entorno + evento `starseed:entorno`.
 */
export async function detectarEntorno(opts?: { registrar?: boolean }): Promise<SnapshotEntorno> {
  const [sesionActual, tunel] = await Promise.all([leerSesionActual(), Promise.resolve(urlTunel())]);
  const candidatos: Array<[MedioEntorno, string]> = [["local", urlLocal()]];
  if (tunel) candidatos.push(["tunel", tunel]);
  // La nube siempre: es el propio origen cuando se abre por navegador.
  candidatos.push(["nube", typeof window !== "undefined" ? window.location.origin : ""]);

  const medios = await Promise.all(candidatos.map(([m, u]) => sondearMedio(m, u)));
  const medioActual: MedioEntorno = medios.find((m) => m.ok)?.medio ?? "nube";

  // Registro (después de saber el medio) y lectura de otras cuentas.
  if (opts?.registrar !== false && sesionActual) await registrarSesionDispositivo(medioActual);
  const otrasCuentas = await leerCuentasDelDispositivo(sesionActual?.user_id ?? null);
  const almacenamiento = await sondearAlmacenamiento(medios);

  const snap: SnapshotEntorno = {
    deviceId: deviceId(),
    medioActual,
    sesionActual,
    otrasCuentas,
    medios,
    almacenamiento,
    ts: Date.now(),
  };

  // Publicación global para cualquier panel.
  try {
    (window as any).STARSEED = (window as any).STARSEED || {};
    (window as any).STARSEED.entorno = snap;
    window.dispatchEvent(new CustomEvent("starseed:entorno", { detail: snap }));
    localStorage.setItem(LS_ULTIMO, JSON.stringify({ medioActual: snap.medioActual, ts: snap.ts }));
  } catch { /* noop */ }
  return snap;
}

/** Último snapshot publicado (para pintar sin esperar red). */
export function ultimoEntorno(): SnapshotEntorno | null {
  try {
    return ((window as any).STARSEED?.entorno as SnapshotEntorno) ?? null;
  } catch {
    return null;
  }
}

/**
 * Preselección de cuenta: deja guardado el email para que auth-form lo
 * ofrezca al abrir el login (la verificación sigue siendo SIEMPRE por OTP —
 * aquí no hay credenciales, solo una conveniencia visual).
 */
const LS_EMAIL_SUGERIDO = "starseed.entorno.email-sugerido.v1";

export function sugerirEmail(email: string): void {
  try { localStorage.setItem(LS_EMAIL_SUGERIDO, email); } catch { /* noop */ }
}

export function emailSugerido(): string | null {
  try { return localStorage.getItem(LS_EMAIL_SUGERIDO); } catch { return null; }
}
