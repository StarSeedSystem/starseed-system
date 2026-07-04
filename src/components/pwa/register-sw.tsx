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
    let reloaded = false;

    // Cuando el SW nuevo toma el control, RECARGAMOS una vez para servir el
    // código fresco de inmediato (auto-actualización para todos los usuarios).
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      try { window.location.reload(); } catch { /* */ }
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (cancelled || !reg) return;
          // Fuerza una comprobación de versión nueva al arrancar.
          try { reg.update(); } catch { /* */ }
          // Si aparece un SW nuevo, en cuanto quede "installed" con un
          // controlador previo, pídele que se active ya (skipWaiting).
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                try { nw.postMessage("SKIP_WAITING"); } catch { /* */ }
                try { reg.waiting?.postMessage("SKIP_WAITING"); } catch { /* */ }
              }
            });
          });
          // Revisa periódicamente por si hay un despliegue nuevo (cada 30 min).
          try {
            const iv = setInterval(() => { try { reg.update(); } catch { /* */ } }, 30 * 60 * 1000);
            (reg as unknown as { __ssIv?: number }).__ssIv = iv as unknown as number;
          } catch { /* */ }
        })
        .catch(() => {
          /* registro best-effort: nunca rompe la app */
        });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

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
      try { navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange); } catch { /* */ }
    };
  }, []);

  return null;
}

export default RegisterSW;
