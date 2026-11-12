/**
 * LLA1112B · la ventana de llamada es una zona que el dock y los sensores de borde respetan.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Prueba 39: el sensor del borde inferior (Anchor, `z-[9999]`, 20–100 px de alto) quedaba POR ENCIMA de la ventana de la
 * llamada (`z-[465]`). Un clic en «Silenciar micrófono», cerca del borde, lo recibía el sensor: abría el dock en vez de
 * pulsar el botón. Ahora:
 *   · cada `SuperficieLlamada` montada se REGISTRA aquí (`registrarVentanaLlamada`) y se marca con `data-ventana-llamada`;
 *   · los sensores de borde bajan por debajo de la ventana (`Z_SENSOR_CON_LLAMADA`) mientras haya una: donde se solapan
 *     manda la ventana, y en el resto del borde el sensor y el dock funcionan como siempre;
 *   · el gesto táctil de deslizar desde la orilla no nace sobre la ventana (`puntoSobreVentanaLlamada`).
 * Sin llamada abierta nada cambia.
 */
import { useSyncExternalStore } from "react";

export const ATRIBUTO_VENTANA_LLAMADA = "data-ventana-llamada";
/** La ventana es `z-[465]`; con una llamada abierta los sensores quedan justo debajo (siguen sobre el dock `z-70` y las cortinas `z-90`). */
export const Z_VENTANA_LLAMADA = 465;
export const Z_SENSOR_CON_LLAMADA = Z_VENTANA_LLAMADA - 1;

let abiertas = 0;
const oyentes = new Set<() => void>();

/** Una ventana de llamada se monta; devuelve la baja. */
export function registrarVentanaLlamada(): () => void {
  abiertas += 1;
  oyentes.forEach((f) => f());
  let baja = false;
  return () => {
    if (baja) return;
    baja = true;
    abiertas = Math.max(0, abiertas - 1);
    oyentes.forEach((f) => f());
  };
}

export function hayVentanaLlamada(): boolean {
  return abiertas > 0;
}

/** ¿Hay una ventana de llamada abierta? (reactivo) */
export function useHayVentanaLlamada(): boolean {
  return useSyncExternalStore(
    (cb) => {
      oyentes.add(cb);
      return () => void oyentes.delete(cb);
    },
    () => abiertas > 0,
    () => false,
  );
}

/** ¿El punto (en píxeles de ventana) cae dentro de alguna ventana de llamada, con `margen` de holgura? Pura salvo por leer el documento. */
export function puntoSobreVentanaLlamada(x: number, y: number, margen = 0, doc: Pick<Document, "querySelectorAll"> | null = typeof document !== "undefined" ? document : null): boolean {
  if (!doc) return false;
  try {
    for (const el of Array.from(doc.querySelectorAll(`[${ATRIBUTO_VENTANA_LLAMADA}]`))) {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (x >= r.left - margen && x <= r.right + margen && y >= r.top - margen && y <= r.bottom + margen) return true;
    }
  } catch {
    /* sin DOM */
  }
  return false;
}

/** Solo pruebas. */
export function _reiniciarZonaLlamadaParaPruebas(): void {
  abiertas = 0;
  oyentes.clear();
}
