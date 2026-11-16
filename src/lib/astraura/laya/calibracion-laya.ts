// Calibración de la confianza de Laya por punto y ámbito (JLA1116A).
// 10 cajas de confianza, tasa de acierto por caja, exige ≥ MIN_CASOS_UMBRAL (30).
// PURA: sin red, sin disco, sin reloj.
import { MIN_CASOS_UMBRAL, type CasoLaya } from "./aprendizaje-laya";

export interface CajaConfianza {
  readonly inicio: number;
  readonly fin: number;
  readonly total: number;
  readonly aciertos: number;
  readonly tasa: number;
}

export type CalibracionLaya =
  | { readonly cajas: readonly CajaConfianza[]; readonly umbralSugerido: number; readonly n: number }
  | { readonly n: number; readonly motivo: "faltan casos" };

/** Calcula la calibración: 10 cajas [0,0.1), [0.1,0.2), ..., [0.9,1.0]. */
export function calibrar(
  casos: readonly CasoLaya[],
  punto: string,
  ambito: string
): CalibracionLaya {
  const relevantes = casos.filter((c) => c.punto === punto && c.ambito === ambito);
  if (relevantes.length < MIN_CASOS_UMBRAL) {
    return { n: relevantes.length, motivo: "faltan casos" };
  }

  const cajas: CajaConfianza[] = [];
  for (let i = 0; i < 10; i++) {
    const inicio = i * 0.1;
    const fin = (i + 1) * 0.1;
    const enCaja = relevantes.filter((c) => c.p >= inicio && (i === 9 ? c.p <= fin : c.p < fin));
    const total = enCaja.length;
    const aciertos = enCaja.filter((c) => c.resultado === "aceptada").length;
    const tasa = total > 0 ? aciertos / total : 0;
    cajas.push({ inicio, fin, total, aciertos, tasa });
  }

  // Umbral sugerido: el inicio de la primera caja con tasa ≥ 0.5, o 1.0 si ninguna
  let umbralSugerido = 1.0;
  for (const caja of cajas) {
    if (caja.tasa >= 0.5 && caja.total > 0) {
      umbralSugerido = caja.inicio;
      break;
    }
  }

  return { cajas, umbralSugerido, n: relevantes.length };
}

/** Interpola la confianza calibrada; nunca sube por encima de la tasa observada. */
export function confianzaCalibrada(cal: CalibracionLaya, p: number): number {
  if ("motivo" in cal) return 0;
  if (p < 0) return 0;
  if (p > 1) return 1;

  // Encontrar la caja que contiene p
  let indiceCaja = -1;
  for (let i = 0; i < cal.cajas.length; i++) {
    const caja = cal.cajas[i];
    if (p >= caja.inicio && (i === 9 ? p <= caja.fin : p < caja.fin)) {
      indiceCaja = i;
      break;
    }
  }

  if (indiceCaja === -1) return 0;

  const caja = cal.cajas[indiceCaja];

  // Si la caja tiene datos, la tasa observada es el techo: nunca subimos por encima
  if (caja.total > 0) {
    return caja.tasa;
  }

  // Caja vacía (total=0): devolvemos 0, no interpolamos
  return 0;
}