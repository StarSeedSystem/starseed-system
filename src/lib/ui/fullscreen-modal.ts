"use client";

/**
 * Registro global de ventanas emergentes (modales a pantalla completa).
 * ============================================================================
 * Arregla el bug donde el dock Trinity (z 70-85) quedaba ENCIMA de los
 * diálogos (z 50) y no se podía ocultar. Ahora:
 *   · Los diálogos compartidos (ui/dialog, ui/sheet) se registran aquí al
 *     abrirse: ponen `body[data-ss-modal="1"]` y suben a z 120+.
 *   · globals.css repliega las capas Trinity (FAB, accesos de borde,
 *     cortinas) y el botón flotante de la guía mientras el atributo exista,
 *     devolviendo la pantalla completa a la ventana emergente.
 * SSR-safe: sin acceso a document en import; useSyncExternalStore con
 * snapshot de servidor `false`.
 */

import { useSyncExternalStore } from "react";

let count = 0;
const subs = new Set<() => void>();

function emit() {
  subs.forEach((f) => {
    try { f(); } catch { /* nunca romper por un suscriptor */ }
  });
}

/** Marca un modal abierto. Devuelve la función de liberación (idempotente). */
export function acquireFullscreenModal(): () => void {
  count += 1;
  if (count === 1) {
    try { document.body.dataset.ssModal = "1"; } catch { /* SSR */ }
  }
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) {
      try { delete document.body.dataset.ssModal; } catch { /* SSR */ }
    } else {
      // Saneo de huérfanos: si el contador dice que quedan modales pero el DOM
      // ya no tiene ninguno (doble-montaje de StrictMode, un unmount perdido…),
      // el dock NO debe quedar secuestrado: se resetea solo.
      setTimeout(() => {
        try {
          if (count > 0 && !document.querySelector("[data-ss-modal-content]")) {
            count = 0;
            delete document.body.dataset.ssModal;
            emit();
          }
        } catch { /* defensivo */ }
      }, 350);
    }
    emit();
  };
}

export function fullscreenModalActive(): boolean {
  return count > 0;
}

export function subscribeFullscreenModal(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/** Hook: ¿hay algún modal a pantalla completa abierto ahora mismo? */
export function useFullscreenModalActive(): boolean {
  return useSyncExternalStore(subscribeFullscreenModal, fullscreenModalActive, () => false);
}

// ════════════════════════════════════════════════════════════════════════════
// (Adenda 192) Primer plano del RITO y la GUÍA — cortesía de los popups
// ----------------------------------------------------------------------------
// Los diálogos de primera ejecución (OmniVoice, sistemas de Astraura…) se
// auto-abrían ENCIMA del rito/guía de bienvenida: la enterraban y, con un modal
// abierto, `router.push` de los vínculos de la guía se cancelaba EN SILENCIO
// (visto en vivo con «Ir a Cerebros»). Regla nueva: quien quiera auto-abrirse
// espera a que el primer plano quede libre.

/** ¿Está el primer plano ocupado por un modal a pantalla completa o la guía? */
export function primerPlanoOcupado(): boolean {
  if (typeof document === "undefined") return false;
  try {
    if (document.body.dataset.ssModal === "1") return true; // wizard/diálogos
    if (document.body.dataset.ssGuia === "1") return true;  // guía del sistema
  } catch { /* defensivo */ }
  return false;
}

/** Espera (sondeo suave) a que el primer plano quede libre y llama cb UNA vez.
 * Devuelve un cancelador. Aunque esté libre ya, siempre hay un asentamiento de
 * ~2 lecturas para no colarse en los huecos entre registro→rito→guía. */
export function alLiberarsePrimerPlano(
  cb: () => void,
  opts?: { intervaloMs?: number; maxMs?: number },
): () => void {
  if (typeof window === "undefined") return () => {};
  const cada = opts?.intervaloMs ?? 1200;
  const tope = Date.now() + (opts?.maxMs ?? 10 * 60 * 1000);
  // SIEMPRE con asentamiento: DOS lecturas libres seguidas. El rito encadena la
  // guía ~650 ms después de cerrarse, y el propio rito puede abrirse ~1-2 s tras
  // el registro — un único instante libre NUNCA debe colar el popup en medio.
  let libresSeguidos = 0;
  const id = window.setInterval(() => {
    if (!primerPlanoOcupado()) {
      libresSeguidos += 1;
      if (libresSeguidos >= 2) { window.clearInterval(id); cb(); }
    } else {
      libresSeguidos = 0;
      if (Date.now() > tope) window.clearInterval(id);
    }
  }, cada);
  return () => window.clearInterval(id);
}
