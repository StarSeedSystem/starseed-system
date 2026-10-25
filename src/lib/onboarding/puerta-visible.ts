/**
 * Puerta de sesión visible — quién está pintando la «puerta» en este momento.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025B) Una página que pide cuenta y no la hay pinta la PUERTA: la vista previa
 * difuminada con «Te damos la bienvenida a StarSeed OS» en el centro (`puerta-sesion.tsx`). Esa misma
 * tarjeta existía abajo, como aviso discreto del primer arranque (`primer-arranque.tsx`); mientras la
 * puerta está a la vista, el aviso NO debe salir (Alex: «que desaparezca de la ventana y aparezca en el
 * centro»). Este contador es el único punto de contacto entre las dos piezas.
 *
 * Módulo sin `node:*`; el contador es del módulo (una pestaña = un contador) y se lee con
 * `useSyncExternalStore` (el snapshot de servidor es `false`: SSR-safe).
 */

import { useSyncExternalStore } from "react";

let puertas = 0;
const oyentes = new Set<() => void>();

function avisar(): void {
  oyentes.forEach((f) => {
    try {
      f();
    } catch {
      /* un oyente roto no puede tumbar a los demás */
    }
  });
}

/** Marca una puerta a la vista. Devuelve la función que la libera (idempotente). */
export function registrarPuerta(): () => void {
  puertas += 1;
  avisar();
  let liberada = false;
  return () => {
    if (liberada) return;
    liberada = true;
    puertas = Math.max(0, puertas - 1);
    avisar();
  };
}

export function hayPuertaVisible(): boolean {
  return puertas > 0;
}

export function suscribirPuerta(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/** `true` mientras alguna página pinta la puerta de sesión. */
export function usePuertaVisible(): boolean {
  return useSyncExternalStore(suscribirPuerta, hayPuertaVisible, () => false);
}

/** Solo para pruebas: deja el contador en cero. */
export function _reiniciarPuertasParaPruebas(): void {
  puertas = 0;
  avisar();
}
