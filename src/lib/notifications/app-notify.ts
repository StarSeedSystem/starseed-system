"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — NOTIFICACIONES Y POPUPS DE LAS APPS (Adenda 69 · J-1)
 * ---------------------------------------------------------------------------
 * API única para que una app/módulo del OS (o una app instalada de la
 * Biblioteca) emita:
 *   · una NOTIFICACIÓN → entra en el Centro de Notificaciones del OS (persistida,
 *     con la app como origen) y aparece en /notifications → «Locales» + suma al
 *     contador de la campana.
 *   · un POPUP/TOAST no intrusivo (sonner) si la app tiene permiso de popups.
 *
 * PIEZAS:
 *   · `notifyFromApp(input)`      → la puerta imperativa (import directo).
 *   · evento `starseed:app-notify`→ bus del DOM que el <AppNotifyBridge/> escucha
 *      para PERSISTIR la notificación en el centro (contexto de notificaciones).
 *   · postMessage (iframe)        → el bridge acepta mensajes de apps embebidas
 *      SOLO si vienen de un <iframe> realmente montado en la página (validación
 *      por origen/frame) y usa el `data-app-id` del iframe como identidad de
 *      confianza (una app solo notifica LO SUYO).
 *
 * PERMISOS POR-APP (`starseed.apps.notify-prefs.v1`, ⚠️ reportar a SYNCED_KEYS):
 *   { [appId]: { notifications: boolean; popups: boolean } }. Default: TODO ON.
 *   El usuario lo ajusta en Ajustes → Notificaciones (AppNotificationsPanel).
 *
 * DEDUPE: se ignoran repeticiones exactas (mismo appId+dedupeKey o
 *   appId+title+body) dentro de una ventana corta, para que un bucle de una app
 *   no inunde el centro.
 *
 * HONESTIDAD: esto NO pide el permiso de notificaciones del sistema operativo
 *   nativo; es el centro PROPIO del OS + un toast en pantalla. Todo local y
 *   soberano; SSR-safe y defensivo (nunca lanza).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { toast } from "sonner";
import { findPackage } from "@/lib/library/packages";
import { getApp } from "@/components/dashboard/apps/app-catalog";

/* ─────────────────────────── Claves y eventos ─────────────────────────── */

/** Preferencias por-app de notificaciones/popups (⚠️ reportar a SYNCED_KEYS). */
export const APP_NOTIFY_PREFS_KEY = "starseed.apps.notify-prefs.v1";
/** Evento del DOM que transporta una notificación de app hacia el centro. */
export const APP_NOTIFY_EVENT = "starseed:app-notify";
/** Evento que emitimos al cambiar las preferencias por-app (refresca la UI). */
export const APP_NOTIFY_PREFS_EVENT = "starseed:app-notify-prefs";
/** `type` del postMessage que una app embebida (iframe) usa para notificar. */
export const APP_NOTIFY_MESSAGE_TYPE = "starseed:app-notify";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export type AppNotifyLevel = "info" | "success" | "warning" | "error";

export interface AppNotifyAction {
  label: string;
  /** Ruta interna o URL: al pulsar el toast, navega ahí. */
  href?: string;
}

export interface AppNotifyInput {
  /** Identidad de la app que notifica (id de paquete de Biblioteca o de app). */
  appId: string;
  title: string;
  body?: string;
  /** Nombre de icono lucide (la UI cae a Package si no existe). */
  icon?: string;
  /** Acción primaria (CTA). Solo la primera se usa en el toast. */
  actions?: AppNotifyAction[];
  level?: AppNotifyLevel;
  /** Clave de deduplicación estable (si se omite, se deriva de título+cuerpo). */
  dedupeKey?: string;
  /** Forzar/omitir el popup (por defecto: según permiso de la app). */
  popup?: boolean;
}

export interface AppNotifyResult {
  ok: boolean;
  /** Motivo si no se emitió (permiso, duplicado, sin appId…). */
  reason?: "no-app-id" | "muted" | "duplicate" | "ssr" | "error";
  /** true si entró al centro. */
  toCenter?: boolean;
  /** true si se mostró el popup/toast. */
  toPopup?: boolean;
}

export interface AppNotifyPref {
  /** ¿La app puede escribir en el centro de notificaciones? */
  notifications: boolean;
  /** ¿La app puede mostrar popups/toasts y ventanas emergentes? */
  popups: boolean;
}

export type AppNotifyPrefsMap = Record<string, Partial<AppNotifyPref>>;

/** Notificación de app normalizada que viaja por el evento del DOM. */
export interface AppNotifyPayload {
  appId: string;
  appName: string;
  title: string;
  body?: string;
  icon: string;
  level: AppNotifyLevel;
  action?: AppNotifyAction;
  at: number;
}

/* ────────────────────────── Utilidades SSR-safe ───────────────────────── */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/* ─────────────────── Resolución de nombre/icono de la app ──────────────── */

/**
 * Nombre e icono legibles de una app a partir de su id. Primero mira el catálogo
 * de paquetes de la Biblioteca; luego el catálogo de apps del launcher; si no,
 * usa el propio id. Defensivo.
 */
export function resolveAppMeta(appId: string, iconHint?: string): { name: string; icon: string } {
  let name = appId;
  let icon = iconHint || "Package";
  try {
    const pkg = findPackage(appId);
    if (pkg) {
      name = pkg.name || name;
      if (!iconHint) icon = pkg.icon || icon;
      return { name, icon };
    }
  } catch { /* noop */ }
  try {
    const app = getApp(appId);
    if (app) {
      name = app.name || name;
      // El catálogo de apps usa componentes lucide (no strings); conservamos el
      // hint o un icono genérico razonable.
      if (!iconHint) icon = "AppWindow";
    }
  } catch { /* noop */ }
  return { name, icon };
}

/* ─────────────────────── Preferencias por-app ─────────────────────────── */

/** Mapa de preferencias por-app (validado y defensivo). */
export function getAppNotifyPrefs(): AppNotifyPrefsMap {
  const raw = readJson<unknown>(APP_NOTIFY_PREFS_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: AppNotifyPrefsMap = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    out[id] = {
      notifications: e.notifications === false ? false : true,
      popups: e.popups === false ? false : true,
    };
  }
  return out;
}

/** Preferencia efectiva de una app (default: TODO permitido). */
export function getAppNotifyPref(appId: string): AppNotifyPref {
  const map = getAppNotifyPrefs();
  const e = map[appId] || {};
  return {
    notifications: e.notifications === false ? false : true,
    popups: e.popups === false ? false : true,
  };
}

function emitPrefsChanged(): void {
  if (!isClient()) return;
  try { window.dispatchEvent(new Event(APP_NOTIFY_PREFS_EVENT)); } catch { /* noop */ }
}

/** Cambia la preferencia de una app (fusión superficial). Persiste + emite. */
export function setAppNotifyPref(appId: string, patch: Partial<AppNotifyPref>): void {
  if (!isClient() || !appId) return;
  const map = getAppNotifyPrefs();
  const prev = map[appId] || {};
  map[appId] = {
    notifications: patch.notifications ?? (prev.notifications ?? true),
    popups: patch.popups ?? (prev.popups ?? true),
  };
  writeJson(APP_NOTIFY_PREFS_KEY, map);
  emitPrefsChanged();
}

/** Suscripción a cambios de preferencias (local + entre pestañas). */
export function subscribeAppNotifyPrefs(cb: () => void): () => void {
  if (!isClient()) return () => {};
  const onStorage = (e: StorageEvent) => { if (!e.key || e.key === APP_NOTIFY_PREFS_KEY) cb(); };
  window.addEventListener(APP_NOTIFY_PREFS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(APP_NOTIFY_PREFS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* ────────────────────────────── Dedupe ────────────────────────────────── */

const DEDUPE_WINDOW_MS = 4000;
const recent = new Map<string, number>();

function isDuplicate(key: string): boolean {
  const now = Date.now();
  // Poda perezosa.
  for (const [k, t] of recent) if (now - t > DEDUPE_WINDOW_MS) recent.delete(k);
  const last = recent.get(key);
  recent.set(key, now);
  return last != null && now - last < DEDUPE_WINDOW_MS;
}

/* ────────────────────────── Popup / toast ─────────────────────────────── */

function showToast(payload: AppNotifyPayload): void {
  const { title, body, level, action, appName } = payload;
  const opts: Record<string, unknown> = {
    description: body || undefined,
  };
  if (action?.href) {
    const href = action.href;
    opts.action = {
      label: action.label || "Abrir",
      onClick: () => {
        try {
          if (/^https?:\/\//i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
          else window.location.assign(href);
        } catch { /* noop */ }
      },
    };
  }
  // Etiqueta discreta del origen en la descripción cuando no hay cuerpo propio.
  if (!body) opts.description = appName;
  try {
    const fn =
      level === "success" ? toast.success
      : level === "error" ? toast.error
      : level === "warning" ? toast.warning
      : level === "info" ? toast.info
      : toast.message;
    (fn as (m: string, o?: unknown) => void)(title, opts);
  } catch {
    try { toast(title); } catch { /* noop */ }
  }
}

/* ─────────────────────────── notifyFromApp ─────────────────────────────── */

/**
 * Emite una notificación desde una app/módulo. Respeta el permiso por-app,
 * deduplica, escribe en el centro (vía evento que persiste el bridge) y muestra
 * un popup no intrusivo si procede. NUNCA lanza.
 */
export function notifyFromApp(input: AppNotifyInput): AppNotifyResult {
  if (!isClient()) return { ok: false, reason: "ssr" };
  const appId = (input?.appId || "").trim();
  if (!appId) return { ok: false, reason: "no-app-id" };

  const title = (input.title || "").trim() || "Aviso";
  const body = (input.body || "").trim() || undefined;
  const level: AppNotifyLevel = input.level || "info";

  const dedupe = `${appId}::${input.dedupeKey || `${title}::${body || ""}`}`;
  if (isDuplicate(dedupe)) return { ok: false, reason: "duplicate" };

  const pref = getAppNotifyPref(appId);
  // Si la app está TOTALMENTE silenciada, no hacemos nada (ni centro ni popup).
  if (!pref.notifications && !pref.popups) return { ok: false, reason: "muted" };

  const meta = resolveAppMeta(appId, input.icon);
  const action = Array.isArray(input.actions) && input.actions[0] ? input.actions[0] : undefined;
  const payload: AppNotifyPayload = {
    appId,
    appName: meta.name,
    title,
    body,
    icon: input.icon || meta.icon,
    level,
    action,
    at: Date.now(),
  };

  let toCenter = false;
  let toPopup = false;

  // 1) Centro de notificaciones (persistido) — vía evento que el bridge escucha.
  if (pref.notifications) {
    try {
      window.dispatchEvent(new CustomEvent(APP_NOTIFY_EVENT, { detail: payload }));
      toCenter = true;
    } catch { /* noop */ }
  }

  // 2) Popup/toast — según permiso y el flag explícito.
  const wantPopup = input.popup ?? true;
  if (pref.popups && wantPopup) {
    try {
      showToast(payload);
      toPopup = true;
    } catch { /* noop */ }
  }

  return { ok: toCenter || toPopup, toCenter, toPopup };
}

/**
 * Adaptador para apps embebidas: procesa un mensaje `postMessage` ya validado
 * (el bridge comprueba el origen/frame) y emite la notificación con el appId de
 * confianza. Devuelve el resultado de `notifyFromApp`.
 */
export function notifyFromIframeMessage(
  data: unknown,
  trustedAppId: string,
): AppNotifyResult {
  if (!data || typeof data !== "object") return { ok: false, reason: "error" };
  const d = data as Record<string, unknown>;
  const p = (d.payload && typeof d.payload === "object" ? d.payload : d) as Record<string, unknown>;
  return notifyFromApp({
    appId: trustedAppId,
    title: typeof p.title === "string" ? p.title : "",
    body: typeof p.body === "string" ? p.body : undefined,
    icon: typeof p.icon === "string" ? p.icon : undefined,
    level: (["info", "success", "warning", "error"].includes(String(p.level)) ? p.level : "info") as AppNotifyLevel,
    dedupeKey: typeof p.dedupeKey === "string" ? p.dedupeKey : undefined,
    actions: Array.isArray(p.actions)
      ? (p.actions as unknown[]).filter((a): a is AppNotifyAction => !!a && typeof (a as AppNotifyAction).label === "string")
      : undefined,
  });
}
