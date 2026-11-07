"use client";

import { useEffect } from "react";

import { puedeRecargarSuave, suscribirseAvisoVersion } from "@/lib/pwa/aviso-version";
import { EVENTO_PRECARGA, estadoDeMensaje, pedirAlmacenPersistente, pedirPrecarga } from "@/lib/pwa/precarga-cliente";

/** (SW1107A) Primera pasada de precarga: cuando el arranque ya terminó, para no competir con él. */
const PRECARGA_TRAS_ARRANQUE_MS = 20_000;
/** Con la pestaña visible, se le recuerda al SW cada 15 min (él decide si toca: build nueva, a medias…). */
const PRECARGA_CADA_MS = 15 * 60 * 1000;

/**
 * RegisterSW — registra el Service Worker `/sw-v8.js` para habilitar la instalación (PWA) y la app
 * entera sin conexión (SW1107A: precarga en segundo plano de las páginas principales y su código;
 * contrato en architecture/apps-autonomas-sin-internet.md §9.1).
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
      // Bump en CADA ola que deba forzar limpieza: cambia la clave de sesión →
      // el saneado se ejecuta UNA vez por dispositivo (borra cachés viejas +
      // recarga). Estaba clavado en "v5-2026-07-05" (inerte hace semanas): por eso
      // los dispositivos no se limpiaban solos.
      // (SW1107A) v9 = public/sw-v8.js. Solo toca `starseed-precache-*` y `starseed-runtime-*`: la precarga
      // sin conexión vive en `starseed-build-*` y no se borra aquí (la retira el SW al completar otra build).
      const CUR = "v9-2026-11-07";
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
        // updateViaCache:'none' → el SCRIPT del SW nunca sale de la caché HTTP;
        // el navegador lo revalida siempre y detecta la versión nueva al instante.
        .register("/sw-v8.js", { scope: "/", updateViaCache: "none" })
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

    // DETECCIÓN DE DESPLIEGUE NUEVO por /version.json (id único por build,
    // servido SIN caché): aunque el SW no cambie entre despliegues, si el build
    // en producción difiere del que arrancó esta pestaña hay versión nueva →
    // aplica la actualización (recarga, con el tope anti-bucle). Así una pestaña o
    // PWA ABIERTA recibe CADA despliegue sin depender de bumps manuales del SW.
    // Además del sondeo de 5 min, el director de producción avisa por ntfy
    // (puerta 7): el aviso NO se cree, solo dispara aquí la misma comprobación.
    let checkBuild: () => Promise<void> = async () => {};
    let buildIv: ReturnType<typeof setInterval> | null = null;
    try {
      let initial: string | null = null;
      checkBuild = async () => {
        if (cancelled || document.visibilityState !== "visible") return;
        try {
          const res = await fetch("/version.json", { cache: "no-store" });
          if (!res.ok) return;
          const v = (await res.json())?.build as string | undefined;
          if (!v) return;
          if (initial === null) {
            initial = v;
            // (2026-10-10) El panel de Actualizaciones compara con el build con el que arrancó la pestaña.
            try { (window as unknown as { STARSEED_BUILD_INICIAL?: string }).STARSEED_BUILD_INICIAL = v; } catch { /* */ }
            return;
          } // primera lectura: ancla
          if (v === initial) return;
          // Si la persona está escribiendo o hay algo sin guardar, no recargamos:
          // avisamos al banner «Nueva versión» y ella decide cuándo aplicar.
          if (!puedeRecargarSuave()) {
            try { window.dispatchEvent(new Event("starseed:update-ready")); } catch { /* */ }
            return;
          }
          // (2026-10-10) Actualizaciones por capas: la política de la capa «interfaz» de esta
          // neurona (por defecto automática, como antes) y el momento (llamada, directo, batería)
          // deciden si se recarga sola o se avisa. Carga perezosa: no pesa en el arranque.
          try {
            const { decidirCapaLocal } = await import("@/lib/actualizaciones/decision-local");
            if ((await decidirCapaLocal("interfaz")).decision !== "aplicar") {
              try { window.dispatchEvent(new Event("starseed:update-ready")); } catch { /* */ }
              return;
            }
          } catch { /* sin módulo: comportamiento de siempre */ }
          applyUpdate();
        } catch { /* */ }
      };
      void checkBuild(); // fija el build inicial al arrancar
      buildIv = setInterval(() => { void checkBuild(); }, 5 * 60 * 1000);
    } catch { /* */ }

    // Aviso en tiempo real por ntfy (tema fijo; sin confiar en su contenido).
    let cierraAviso: () => void = () => {};
    try { cierraAviso = suscribirseAvisoVersion(() => { void checkBuild(); }); } catch { /* */ }

    // (SW1107A) PRECARGA SIN CONEXIÓN. El SW guarda en segundo plano las páginas principales, su código y
    // public/ (manifiesto del build: /precarga.json). Aquí solo se le pide: a los 20 s del arranque, cada
    // 15 min con la pestaña visible y al volver la red. El SW decide si toca (datos móviles, ahorro de
    // datos, espacio, servidor local de la app de escritorio). Su estado llega por mensaje y se publica en
    // `window.STARSEED_PRECARGA` + el evento `starseed:precarga` (para Ajustes o un aviso).
    // `window.STARSEED_PRECARGAR(true)` = «Descargar para usar sin internet» aunque haya datos móviles.
    const win = window as unknown as { STARSEED_PRECARGA?: unknown; STARSEED_PRECARGAR?: (forzar?: boolean) => boolean };
    const onMensajeSW = (ev: MessageEvent) => {
      const estado = estadoDeMensaje(ev.data);
      if (!estado) return;
      try {
        win.STARSEED_PRECARGA = estado;
        window.dispatchEvent(new CustomEvent(EVENTO_PRECARGA, { detail: estado }));
      } catch { /* */ }
    };
    const precargarSiVisible = () => {
      if (!cancelled && document.visibilityState === "visible") pedirPrecarga(false);
    };
    let precargaT0: ReturnType<typeof setTimeout> | null = null;
    let precargaIv: ReturnType<typeof setInterval> | null = null;
    let precargaOnline: ReturnType<typeof setTimeout> | null = null;
    const onOnline = () => {
      if (precargaOnline) clearTimeout(precargaOnline);
      precargaOnline = setTimeout(precargarSiVisible, 3000);
    };
    try {
      win.STARSEED_PRECARGAR = (forzar?: boolean) => pedirPrecarga(!!forzar);
      navigator.serviceWorker.addEventListener("message", onMensajeSW);
      precargaT0 = setTimeout(precargarSiVisible, PRECARGA_TRAS_ARRANQUE_MS);
      precargaIv = setInterval(precargarSiVisible, PRECARGA_CADA_MS);
      window.addEventListener("online", onOnline);
      // App instalada (PWA o nativa): que el navegador no borre lo guardado cuando falte espacio.
      const instalada =
        (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
        "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
      void pedirAlmacenPersistente(instalada);
    } catch { /* */ }

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
      if (buildIv) clearInterval(buildIv);
      if (precargaT0) clearTimeout(precargaT0);
      if (precargaIv) clearInterval(precargaIv);
      if (precargaOnline) clearTimeout(precargaOnline);
      window.removeEventListener("online", onOnline);
      try { navigator.serviceWorker.removeEventListener("message", onMensajeSW); } catch { /* */ }
      try { cierraAviso(); } catch { /* */ }
      try { navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange); } catch { /* */ }
    };
  }, []);

  return null;
}

export default RegisterSW;
