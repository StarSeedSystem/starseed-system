"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — VIGILANTE DE AUTO-ACTUALIZACIÓN (Adenda 69 · J-2)
 * ---------------------------------------------------------------------------
 * Componente GLOBAL sin UI. Si el usuario activó «Actualizaciones automáticas»,
 * comprueba las actualizaciones de los paquetes/repos instalados y las APLICA
 * SOLAS (refresca versión/enlace en el registro de la Biblioteca) avisando por
 * cada una vía notifyFromApp (J-1). Funciona aunque el usuario NUNCA abra
 * /notifications.
 *
 * Cadencia sobria (respeta el rate-limit anónimo de GitHub): una vez al montar
 * (tras un pequeño retardo) y cada 6 h mientras la pestaña siga abierta; además,
 * cuando cambia la Biblioteca (instalar algo nuevo) reintenta con debounce.
 * Todo defensivo y SSR-safe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect } from "react";
import { checkAndMaybeAutoUpdate, getAutoUpdateEnabled } from "@/lib/notifications/available-updates";
import { LIBRARY_EVENT } from "@/lib/library/packages";

const START_DELAY_MS = 6000;      // deja respirar al arranque
const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h (coincide con la caché de comprobación)
const LIBRARY_DEBOUNCE_MS = 4000;

export function AutoUpdateWatcher() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const run = () => {
      if (cancelled || !getAutoUpdateEnabled()) return;
      void checkAndMaybeAutoUpdate().catch(() => { /* defensivo */ });
    };

    const startTimer = window.setTimeout(run, START_DELAY_MS);
    const interval = window.setInterval(run, INTERVAL_MS);

    // Al instalar/actualizar algo en la Biblioteca, reevaluar con debounce.
    let debTimer: number | undefined;
    const onLibrary = () => {
      if (debTimer) window.clearTimeout(debTimer);
      debTimer = window.setTimeout(run, LIBRARY_DEBOUNCE_MS);
    };
    window.addEventListener(LIBRARY_EVENT, onLibrary);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
      if (debTimer) window.clearTimeout(debTimer);
      window.removeEventListener(LIBRARY_EVENT, onLibrary);
    };
  }, []);

  return null;
}

export default AutoUpdateWatcher;
