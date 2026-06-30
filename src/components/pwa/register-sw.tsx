"use client";

import { useEffect } from "react";

/**
 * RegisterSW — registra el Service Worker `/sw.js` para habilitar la instalación
 * (PWA) y un shell offline básico.
 *
 * Es completamente defensivo: si el navegador no soporta service workers, o el
 * registro falla, no interrumpe el render ni la app. No renderiza nada.
 *
 * Notas:
 *  - Solo se ejecuta en el navegador (no en SSR).
 *  - Por defecto se omite en desarrollo para no interferir con el HMR de Next.
 *    (Se puede forzar en dev con NEXT_PUBLIC_ENABLE_SW=1).
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isProd = process.env.NODE_ENV === "production";
    const forced = process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    if (!isProd && !forced) return;

    let cancelled = false;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* registro best-effort: nunca rompe la app */
        });
    };

    const onLoad = () => {
      if (!cancelled) register();
    };

    // Espera a 'load' para no competir con recursos críticos del arranque.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}

export default RegisterSW;
