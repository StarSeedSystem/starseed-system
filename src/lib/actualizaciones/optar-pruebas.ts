/**
 * ════════════════════════════════════════════════════════════════════════════
 * (CAN1115A · 2026-11-15) «Recibir versiones de prueba en este aparato».
 * Contrato: architecture/centro-versiones-1105.md §9 (párrafo del 14-11-2026, decidido por Alex).
 *
 * Una app OFICIAL ve el canal de pruebas solo si su dueño lo activó, en ESE aparato. Se guarda en este
 * aparato (localStorage): no viaja con la cuenta ni se fija desde otra neurona. Por defecto, apagado.
 *
 * Solo vale en Android: el actualizador de escritorio decide sus endpoints en Rust según la versión
 * instalada (canal_actualizacion_logica.rs, compilado en la app), y desde la web no se puede cambiar.
 * ════════════════════════════════════════════════════════════════════════════
 */

export const CLAVE_OPTA_PRUEBAS = "starseed.actualizacion.recibir-pruebas.v1";
export const EVENTO_OPTA_PRUEBAS = "starseed:actualizacion-recibir-pruebas";

/** ¿Este medio puede entrar al canal de pruebas por decisión de su dueño? Pura. */
export function medioPuedeOptarPruebas(medio: string | null | undefined): boolean {
  return medio === "android";
}

/** Lee el interruptor de ESTE aparato (por defecto, apagado). Nunca lanza. */
export function leerOptaPruebas(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_OPTA_PRUEBAS) === "1";
  } catch {
    return false;
  }
}

/** Guarda el interruptor en este aparato y avisa a quien escucha. Nunca lanza. */
export function guardarOptaPruebas(activa: boolean): void {
  try {
    if (activa) window.localStorage.setItem(CLAVE_OPTA_PRUEBAS, "1");
    else window.localStorage.removeItem(CLAVE_OPTA_PRUEBAS);
  } catch {
    /* sin almacenamiento: no se guarda nada y la app sigue en lo oficial */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_OPTA_PRUEBAS, { detail: leerOptaPruebas() }));
  } catch {
    /* sin window */
  }
}
