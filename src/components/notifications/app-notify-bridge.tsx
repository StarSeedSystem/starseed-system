"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — PUENTE DE NOTIFICACIONES/POPUPS DE APPS (Adenda 69 · J-1)
 * ---------------------------------------------------------------------------
 * Componente GLOBAL sin UI, montado en el layout raíz. Hace dos cosas:
 *
 *   1) PERSISTE en el Centro de Notificaciones (contexto `useNotifications`)
 *      cada notificación de app que llega por el evento `starseed:app-notify`.
 *      La app queda como ORIGEN (`appId`/`appName`) y suma al contador/campana.
 *
 *   2) Recibe `postMessage` de apps EMBEBIDAS (iframe) y las valida por ORIGEN/
 *      FRAME: solo se aceptan mensajes cuyo `event.source` sea un <iframe>
 *      realmente montado en ESTA página; el `appId` de confianza sale del
 *      atributo `data-app-id` del iframe (no del payload), así una app solo
 *      notifica LO SUYO. Traduce el mensaje a `notifyFromApp` / `openAppPopup`.
 *
 * Defensivo y SSR-safe. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef } from "react";
import { useNotifications, type NotificationCategory, type NotificationPriority } from "@/context/notifications-context";
import {
  APP_NOTIFY_EVENT,
  APP_NOTIFY_MESSAGE_TYPE,
  notifyFromIframeMessage,
  type AppNotifyPayload,
  type AppNotifyLevel,
} from "@/lib/notifications/app-notify";
import { APP_POPUP_MESSAGE_TYPE, openPopupFromIframeMessage } from "@/lib/notifications/app-popups";

/** Nivel → prioridad del centro. */
function levelToPriority(level: AppNotifyLevel): NotificationPriority {
  switch (level) {
    case "error": return "critical";
    case "warning": return "high";
    case "success": return "normal";
    default: return "normal";
  }
}

/** Nivel → categoría del centro (las apps son eventos de «sistema»). */
function levelToCategory(_level: AppNotifyLevel): NotificationCategory {
  return "system";
}

/**
 * Localiza el <iframe> cuyo contentWindow es `src`. Devuelve el elemento (para
 * leer su `data-app-id`) o null si el mensaje NO viene de un iframe embebido.
 */
function findFrameFor(src: unknown): HTMLIFrameElement | null {
  if (!src || typeof document === "undefined") return null;
  try {
    const frames = document.querySelectorAll("iframe");
    for (const f of Array.from(frames)) {
      if ((f as HTMLIFrameElement).contentWindow === src) return f as HTMLIFrameElement;
    }
  } catch { /* noop */ }
  return null;
}

export function AppNotifyBridge() {
  const { add } = useNotifications();
  // `add` es estable (useCallback), pero lo guardamos en ref por robustez ante
  // remontajes del provider.
  const addRef = useRef(add);
  addRef.current = add;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // (1) Persistir en el centro las notificaciones de app.
    const onNotify = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppNotifyPayload | undefined;
      if (!detail || !detail.title) return;
      try {
        addRef.current({
          title: detail.title,
          body: detail.body,
          category: levelToCategory(detail.level),
          priority: levelToPriority(detail.level),
          iconName: detail.icon,
          appId: detail.appId,
          appName: detail.appName,
          action: detail.action?.href
            ? { label: detail.action.label || "Abrir", href: detail.action.href }
            : undefined,
        });
      } catch { /* noop */ }
    };

    // (2) postMessage de apps embebidas (iframe), validado por frame/origen.
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      const type = (data as { type?: unknown }).type;
      if (type !== APP_NOTIFY_MESSAGE_TYPE && type !== APP_POPUP_MESSAGE_TYPE) return;

      // Solo aceptamos mensajes de un <iframe> realmente montado en la página.
      const frame = findFrameFor(e.source);
      if (!frame) return;
      // Identidad de confianza: el data-app-id del iframe (no el payload).
      const trustedAppId = (frame.getAttribute("data-app-id") || "").trim();
      if (!trustedAppId) return;

      try {
        if (type === APP_NOTIFY_MESSAGE_TYPE) notifyFromIframeMessage(data, trustedAppId);
        else openPopupFromIframeMessage(data, trustedAppId);
      } catch { /* noop */ }
    };

    window.addEventListener(APP_NOTIFY_EVENT, onNotify as EventListener);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener(APP_NOTIFY_EVENT, onNotify as EventListener);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}

export default AppNotifyBridge;
