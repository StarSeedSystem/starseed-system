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
