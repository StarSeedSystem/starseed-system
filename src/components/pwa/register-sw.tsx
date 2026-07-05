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

    // AUTO-SANADO DE CACHÉ: si el dispositivo tiene cachés de una versión anterior
    // (causa de "no se actualiza / Aurora sigue igual / se reinicia"), las borra y
    // recarga UNA vez por sesión (sessionStorage → anti-bucle). Complementa al SW
    // network-first para garantizar que el código fresco llega a todos.
    try {
      const CUR = "v5-2026-07-05";
      const G = "ssheal:" + CUR;
      if ("caches" in window && !sessionStorage.getItem(G)) {
        caches.keys().then((ks) => {
          const stale = ks.filter((k) => /^starseed-(precache|runtime)-/.test(k) && k.indexOf(CUR) === -1);
          if (stale.length) {
            sessionStorage.setItem(G, "1");
            Promise.all(stale.map((k) => caches.delete(k))).then(() => {
              try { window.location.reload(); } catch { /* */ }
            });
          }
        }).catch(() => { /* */ });
      }
    } catch { /* */ }

    let cancelled = false;
    let reloaded = false;

    // Aplica la actualización recargando UNA vez. Con TOPE ANTI-BUCLE por sesión
    // (máx 2 recargas): si por cualquier causa el controllerchange se disparara
    // en cadena, NUNCA entra en bucle de recargas (era una de las causas de
    // "se reinicia en loop"). El código es network-first en el SW, así que la
    // recarga trae solo lo nuevo, sin reinstalar.
    const applyUpdate = () => {
      if (reloaded) return;
      reloaded = true;
      try {
        const k = "ss:swreloads";
        const n = parseInt(sessionStorage.getItem(k) || "0", 10);
        if (n >= 2) return; // ya recargamos 2 veces esta sesión: no insistir
        sessionStorage.setItem(k, String(n + 1));
      } catch { /* */ }
      try { window.location.reload(); } catch { /* */ }
    };
    // Expuesto para que Ajustes / el banner puedan aplicar la actualización.
    try { (window as any).STARSEED_APPLY_UPDATE = applyUpdate; } catch { /* */ }

    // Cuando el SW nuevo toma el control, recargamos una vez (con el tope anti
    // bucle). Simple y probado; sin lógicas de "ocupado" que puedan realimentarse.
    const onControllerChange = () => { applyUpdate(); };

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
