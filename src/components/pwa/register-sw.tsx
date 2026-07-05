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
      const CUR = "v3-2026-07-03";
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

    // ¿El usuario está en medio de algo? (Aurora hablando/escuchando, un campo
    // enfocado, o escribiendo). Si es así, NO recargamos de golpe: mostramos un
    // banner "Actualización lista · Aplicar" y aplicamos cuando quiera o cuando
    // quede inactivo. Así la actualización es SIEMPRE dentro de la app, sin
    // reinstalar, sin interrumpir. Defensivo.
    const userIsBusy = (): boolean => {
      try {
        const ss = typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking;
        const ae = document.activeElement as HTMLElement | null;
        const typing = !!ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable);
        const listening = document.documentElement.getAttribute("data-aurora-listening") === "1";
        return !!ss || typing || listening;
      } catch { return false; }
    };

    const applyUpdate = () => {
      if (reloaded) return;
      reloaded = true;
      try { window.location.reload(); } catch { /* */ }
    };
    // Expuesto para que el banner / Ajustes puedan aplicar la actualización.
    try { (window as any).STARSEED_APPLY_UPDATE = applyUpdate; } catch { /* */ }

    // Cuando el SW nuevo toma el control: si el usuario está libre, aplicamos ya
    // (auto-actualización, solo el código nuevo); si está ocupado, avisamos y
    // aplicamos al quedar inactivo (o cuando pulse "Aplicar").
    const onControllerChange = () => {
      if (reloaded) return;
      if (!userIsBusy()) { applyUpdate(); return; }
      // Ocupado: avisa dentro de la app y reintenta al quedar libre/oculto.
      try { window.dispatchEvent(new CustomEvent("starseed:update-ready")); } catch { /* */ }
      try { import("@/lib/notifications/update-notifications").then((m) => m.notifyUpdateAvailable?.()).catch(() => {}); } catch { /* */ }
      const tryLater = () => { if (!userIsBusy()) applyUpdate(); };
      try {
        const iv = setInterval(tryLater, 8000);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") applyUpdate(); }, { once: true });
        setTimeout(() => { try { clearInterval(iv); } catch { /* */ } }, 5 * 60 * 1000);
      } catch { /* */ }
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
