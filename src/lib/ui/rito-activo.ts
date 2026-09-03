/**
 * rito-activo.ts — «primer plano ritual» del OS (Ola 227).
 * ============================================================================
 * Mientras una ventana del rito de verdad está abierta (bienvenida
 * OnboardingWizard, sistemas de Astraura `StartupUpdatesModal` o ventana de
 * perfil inicial `VentanaPerfilInicial`), el resto de accesos Trinity NO debe
 * poder salir: ni OmniDock, ni cortinas (Zenith/Horizon/Logic), ni bordes,
 * ni el Control Center, ni la paleta de comandos.
 *
 * Modelo: un Set<string> con los ids de los ritos abiertos. Cuando el Set deja
 * de estar vacío se pone `data-rito="1"` en <html> (cinturón CSS en globals.css
 * apaga pointer-events/opacidad del dock y de los bordes) y se avisa a un
 * pequeño emisor interno que alimenta `useRitoActivo()` vía
 * useSyncExternalStore (sin MutationObserver).
 *
 * SSR-safe: leer fuera del navegador devuelve false y no toca el DOM.
 */

import { useSyncExternalStore } from "react";

const ritos = new Set<string>();
const oyentes = new Set<() => void>();
let avisados = false;

function aplicarAlDom(): void {
  if (typeof document === "undefined") return;
  try {
    if (ritos.size > 0) document.documentElement.setAttribute("data-rito", "1");
    else document.documentElement.removeAttribute("data-rito");
  } catch { /* defensivo: nunca rompe el rito */ }
}

function emitir(): void {
  for (const fn of oyentes) {
    try { fn(); } catch { /* un oyente roto no frena al resto */ }
  }
}

/**
 * Marca/desmarca un primer plano ritual. Llámala con el estado de apertura
 * REAL del componente (y desmárcala al desmontar). Idempotente.
 */
export function marcarRitoActivo(id: string, activo: boolean): void {
  const antes = ritos.size;
  if (activo) ritos.add(id);
  else ritos.delete(id);
  if (ritos.size === antes && ritos.has(id) === activo) return; // sin cambio real
  aplicarAlDom();
  emitir();
}

/** ¿Hay algún rito en primer plano ahora mismo? (fuera de React). */
export function ritoActivo(): boolean {
  return ritos.size > 0;
}

function suscribir(onStoreChange: () => void): () => void {
  oyentes.add(onStoreChange);
  // Si al suscribirse el DOM aún no reflejaba el estado (p.ej. HMR), se aplica.
  if (!avisados) { avisados = true; aplicarAlDom(); }
  return () => { oyentes.delete(onStoreChange); };
}

function leer(): boolean {
  return ritos.size > 0;
}

function leerServidor(): boolean {
  return false;
}

/** Hook: true mientras haya algún primer plano ritual activo. */
export function useRitoActivo(): boolean {
  return useSyncExternalStore(suscribir, leer, leerServidor);
}
