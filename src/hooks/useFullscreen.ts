"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hook para gestionar el modo pantalla completa de manera inteligente.
 *
 * - Detecta el estado actual incluso si el usuario sale con Esc.
 * - Solicita fullscreen al `documentElement` por defecto.
 * - Funciona en Chrome, Firefox, Safari, Edge (prefijos vendor).
 * - Inocuo en SSR (toggle es no-op si no hay document).
 *
 * Uso:
 *   const { isFullscreen, toggle, request, exit, isSupported } = useFullscreen();
 */
export function useFullscreen(target?: HTMLElement | null) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      msFullscreenElement?: Element | null;
      mozFullScreenElement?: Element | null;
    };
    setIsSupported(
      Boolean(
        document.fullscreenEnabled ||
          (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled
      )
    );

    const onChange = () => {
      setIsFullscreen(
        Boolean(
          document.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.msFullscreenElement ||
            doc.mozFullScreenElement
        )
      );
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    document.addEventListener("msfullscreenchange", onChange);
    onChange();
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("msfullscreenchange", onChange);
    };
  }, []);

  const request = useCallback(async () => {
    if (typeof document === "undefined") return;
    const el = (target ?? document.documentElement) as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
      msRequestFullscreen?: () => Promise<void>;
      mozRequestFullScreen?: () => Promise<void>;
    };
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) await el.msRequestFullscreen();
      else if (el.mozRequestFullScreen) await el.mozRequestFullScreen();
    } catch (e) {
      // Algunos navegadores rechazan si no hay user activation o si la app está en iframe.
      console.warn("Fullscreen request failed:", e);
    }
  }, [target]);

  const exit = useCallback(async () => {
    if (typeof document === "undefined") return;
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      msExitFullscreen?: () => Promise<void>;
      mozCancelFullScreen?: () => Promise<void>;
    };
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      else if (doc.msExitFullscreen) await doc.msExitFullscreen();
      else if (doc.mozCancelFullScreen) await doc.mozCancelFullScreen();
    } catch (e) {
      console.warn("Fullscreen exit failed:", e);
    }
  }, []);

  const toggle = useCallback(async () => {
    if (isFullscreen) await exit();
    else await request();
  }, [isFullscreen, request, exit]);

  return { isFullscreen, toggle, request, exit, isSupported };
}
