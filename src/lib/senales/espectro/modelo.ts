/**
 * modelo — el modelo ÚNICO del «espectrómetro inteligente» (MRA2/MAP1116).
 * ══════════════════════════════════════════════════════════════════════════════
 * Re-exporta todos los tipos y funciones del espectrómetro.
 * Puro: sin React, sin red, sin `node:*`.
 */

export * from "./tipos";
export * from "./validadores";
export * from "./utilidades";
export * from "./bandas";
export * from "./leer-senales";
export {
  MOTIVO_SIN_DATOS,
  compatiblesDe,
  type EquipoCompat,
} from "./compatibilidad";
export * from "./espectrometro";
