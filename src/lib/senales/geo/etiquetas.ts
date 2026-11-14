/**
 * etiquetas — de qué lado de su marca va la etiqueta para no cortarse con el borde del mapa (MAP1114D). Puro.
 * «fuera»: la marca no se ve, así que su etiqueta tampoco (si no, una etiqueta suelta asomaría por el borde).
 */

export type DireccionEtiqueta = "top" | "bottom" | "left" | "right" | "fuera";

export const MARGEN_ETIQUETA_X = 100;
export const MARGEN_ETIQUETA_Y = 34;

export function direccionEtiqueta(pt: { x: number; y: number }, tam: { x: number; y: number }, esYo: boolean): DireccionEtiqueta {
  if (pt.x < -8 || pt.x > tam.x + 8 || pt.y < -8 || pt.y > tam.y + 8) return "fuera";
  if (pt.x < MARGEN_ETIQUETA_X) return "right";
  if (pt.x > tam.x - MARGEN_ETIQUETA_X) return "left";
  if (pt.y < MARGEN_ETIQUETA_Y) return "bottom";
  return esYo ? "bottom" : "top";
}
