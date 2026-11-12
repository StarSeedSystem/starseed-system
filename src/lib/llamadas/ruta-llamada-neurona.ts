/**
 * ruta-llamada-neurona — con qué motor se llama a una neurona cuando hay más de un camino (LLA1112A · 2026-11-12).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Caso real (prueba 39, 04:28:40–04:29:50 UTC): llamada Mac ↔ tableta con el Wi-Fi de las dos encendido; la tableta apagó
 * su Wi-Fi y la ventana dijo «La llamada falló… Se perdió el enlace directo», con el Bluetooth `b3` abierto todo el rato. La
 * llamada iba por la llamada DIRECTA (`malla/llamada-directa.ts`): `planLlamada` elige «enlace-local» en cuanto hay un enlace
 * WebRTC local con esa neurona, y la llamada directa solo tiene ESE enlace (no lleva voz por Bluetooth). El motor de llamadas
 * (`motor.ts`) sí tiene carriles por flujo: WebRTC por la red y voz/vídeo ligero por el enlace de datos, con paso de carril en
 * ≤ 2 s (banco `paso-ip`, `paso-ip-silencioso`) y vuelta a WebRTC cuando vuelve la red (`corte-ip`).
 *
 * Regla: si además del enlace WebRTC local hay un enlace de datos SIN IP con esa neurona (Bluetooth), la llamada va por el
 * motor de llamadas (con el servidor si hay internet y sesión; si no, sin servidor, por el enlace directo). Sin Bluetooth, la
 * llamada directa sigue como siempre (y desde LLA1112A espera a que su enlace vuelva antes de colgar). Pura.
 */
export interface EntradaRutaLlamada {
  /** Lo que eligió `planLlamada`. */
  via: "enlace-local" | "sistema-llamadas" | null;
  /** Enlaces de datos vivos con esa neurona que NO llevan IP (Bluetooth). */
  enlacesSinIp: number;
  /** ¿El chat permite el enlace local? (si no, `planLlamada` ya no lo eligió). */
  permiteLocal: boolean;
}

export interface RutaLlamada {
  motor: "directa" | "sistema-llamadas" | null;
  /** true: se cambió la elección de `planLlamada` por esta regla. */
  cambiada: boolean;
  motivo: string;
}

export const MOTIVO_CARRILES = "llamada con carriles: WebRTC por la red y la voz por Bluetooth si la red se va (sin colgar)";

export function rutaLlamadaNeurona(e: EntradaRutaLlamada): RutaLlamada {
  if (e.via === "enlace-local" && e.permiteLocal && e.enlacesSinIp > 0) return { motor: "sistema-llamadas", cambiada: true, motivo: MOTIVO_CARRILES };
  if (e.via === "enlace-local") return { motor: "directa", cambiada: false, motivo: "llamada directa por el enlace local" };
  if (e.via === "sistema-llamadas") return { motor: "sistema-llamadas", cambiada: false, motivo: "sistema de llamadas" };
  return { motor: null, cambiada: false, motivo: "sin vía" };
}
