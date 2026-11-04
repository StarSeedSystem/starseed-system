/**
 * StarSeed OS — FORMATEO DE CIFRAS DE MODELO (CTR1104D).
 * ============================================================================
 * Módulo PURO: convierte números brutos (GB, tok/s) en texto legible para la UI.
 * Sin React, sin `window`, sin I/O. Funciones totales y defensivas.
 * ============================================================================
 */

/** Texto que se muestra cuando falta el dato. */
export const SIN_DATO = "sin dato";

/**
 * Formatea gigabytes con una decimal y separador decimal español (coma).
 * `undefined`/`null`/NaN ⇒ "sin dato".
 */
export function formatearGb(gb: number | undefined | null): string {
  if (typeof gb !== "number" || !Number.isFinite(gb)) return SIN_DATO;
  return `${gb.toFixed(1).replace(".", ",")} GB`;
}

/**
 * Formatea tokens/segundo como número entero redondeado con prefijo "~".
 * `undefined`/`null`/NaN ⇒ "sin dato".
 */
export function formatearTokS(tps: number | undefined | null): string {
  if (typeof tps !== "number" || !Number.isFinite(tps) || tps < 0) return SIN_DATO;
  return `~${Math.round(tps)} tok/s`;
}

/**
 * Combina GB y tok/s en una sola cadena: "3,2 GB · ~18 tok/s".
 * Si falta uno, muestra solo el que hay. Si faltan los dos, "sin dato".
 */
export function formatearCifrasModelo(opts: {
  gb?: number | null;
  tokS?: number | null;
}): string {
  const partes: string[] = [];
  const gbTxt = formatearGb(opts.gb);
  const tokTxt = formatearTokS(opts.tokS);
  if (gbTxt !== SIN_DATO) partes.push(gbTxt);
  if (tokTxt !== SIN_DATO) partes.push(tokTxt);
  return partes.length ? partes.join(" · ") : SIN_DATO;
}

/**
 * Formatea la cuantización (p.ej. "Q4_K_M") o devuelve "sin dato".
 */
export function formatearQuant(q: string | undefined | null): string {
  if (typeof q !== "string" || !q.trim()) return SIN_DATO;
  return q.trim();
}