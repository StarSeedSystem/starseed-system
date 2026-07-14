"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — VENTANAS EMERGENTES DE LAS APPS (Adenda 69 · J-1)
 * ---------------------------------------------------------------------------
 * Mecanismo portátil para que una app abra un popup / mini-ventana propia SIN
 * tocar el gestor de ventanas del escritorio (que es estado sincronizado y de
 * otro agente). Un <AppPopupHost/> global escucha el evento `starseed:app-popup`
 * y pinta un overlay ligero, cerrable y APILABLE (varias a la vez, con offset).
 *
 * Formas de contenido (elige UNA):
 *   · `route`  → ruta interna del OS embebida en un <iframe> (mismo origen).
 *   · `html`   → HTML propio de la app en un <iframe srcdoc> AISLADO
 *                (sandbox="allow-scripts", sin same-origin: no accede al padre).
 *   · `text`   → texto simple (se pinta como párrafo, sin HTML).
 *
 * Respeta el permiso por-app de popups (`getAppNotifyPref`). Apps embebidas
 * (iframe) pueden pedir un popup por `postMessage` (tipo `starseed:app-popup`),
 * validado por el host igual que las notificaciones. SSR-safe y defensivo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getAppNotifyPref, resolveAppMeta } from "./app-notify";

/** Evento del DOM que abre/cierra popups de apps. */
export const APP_POPUP_EVENT = "starseed:app-popup";
/** `type` del postMessage que una app embebida usa para abrir un popup. */
export const APP_POPUP_MESSAGE_TYPE = "starseed:app-popup";

export type AppPopupSize = "sm" | "md" | "lg";

export interface AppPopupInput {
  appId: string;
  title?: string;
  /** Ruta interna del OS a embeber (mismo origen). */
  route?: string;
  /** HTML propio de la app (se aísla en un iframe sandbox). */
  html?: string;
  /** Texto simple (sin HTML). */
  text?: string;
  size?: AppPopupSize;
  /** Icono lucide para la cabecera. */
  icon?: string;
}

/** Popup normalizado que viaja por el evento/host. */
export interface AppPopup extends AppPopupInput {
  id: string;
  appName: string;
  size: AppPopupSize;
  at: number;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* noop */ }
  return `pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Abre una ventana emergente de la app. Devuelve el id del popup (o "" si no se
 * abrió: sin permiso de popups, SSR o sin contenido). NUNCA lanza.
 */
export function openAppPopup(input: AppPopupInput): string {
  if (!isClient()) return "";
  const appId = (input?.appId || "").trim();
  if (!appId) return "";
  // Sin contenido no hay popup.
  if (!input.route && !input.html && !input.text) return "";
  // Respeta el permiso por-app de popups.
  if (!getAppNotifyPref(appId).popups) return "";

  const meta = resolveAppMeta(appId, input.icon);
  const popup: AppPopup = {
    ...input,
    appId,
    id: genId(),
    appName: meta.name,
    icon: input.icon || meta.icon,
    title: input.title || meta.name,
    size: input.size || "md",
    at: Date.now(),
  };
  try {
    window.dispatchEvent(new CustomEvent(APP_POPUP_EVENT, { detail: { action: "open", popup } }));
  } catch {
    return "";
  }
  return popup.id;
}

/** Cierra un popup por id (o todos los de una app si se pasa `appId`). */
export function closeAppPopup(opts: { id?: string; appId?: string }): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new CustomEvent(APP_POPUP_EVENT, { detail: { action: "close", ...opts } }));
  } catch { /* noop */ }
}

/**
 * Adaptador para apps embebidas: abre un popup a partir de un mensaje ya
 * validado por el host, con el appId de confianza (el `data-app-id` del iframe).
 */
export function openPopupFromIframeMessage(data: unknown, trustedAppId: string): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const p = (d.payload && typeof d.payload === "object" ? d.payload : d) as Record<string, unknown>;
  return openAppPopup({
    appId: trustedAppId,
    title: typeof p.title === "string" ? p.title : undefined,
    route: typeof p.route === "string" ? p.route : undefined,
    html: typeof p.html === "string" ? p.html : undefined,
    text: typeof p.text === "string" ? p.text : undefined,
    size: (["sm", "md", "lg"].includes(String(p.size)) ? p.size : "md") as AppPopupSize,
    icon: typeof p.icon === "string" ? p.icon : undefined,
  });
}
