import type { CasoLaya } from "./aprendizaje-laya";
import { MIN_CASOS_UMBRAL } from "./aprendizaje-laya";

export interface Calibracion {
  readonly cajas: readonly { readonly tasa: number; readonly n: number }[];
  readonly umbralSugerido: number;
  readonly n: number;
}

export type ResultadoCalibracion = Calibracion | { readonly n: number; readonly motivo: string };

/** Calibra la confianza de Laya para un punto y ámbito dados. */
export function calibrar(casos: readonly CasoLaya[], punto: string, ambito: string): ResultadoCalibracion {
  const filtrados = casos.filter(c => c.punto === punto && c.ambito === ambito);
  if (filtrados.length < MIN_CASOS_UMBRAL) {
    return { n: filtrados.length, motivo: "faltan casos" };
  }
  
  const cajas = Array.from({ length: 10 }, (_, i) => {
    const min = i * 0.1;
    const max = i === 9 ? 1.01 : (i + 1) * 0.1;
    const binCasos = filtrados.filter(c => c.p >= min && c.p < max);
    const aciertos = binCasos.filter(c => c.resultado === "aceptada").length;
    const tasa = binCasos.length === 0 ? 0 : aciertos / binCasos.length;
    return { tasa, n: binCasos.length };
  });

  // Umbral sugerido: la caja más alta con tasa de acierto >= 0.75 (ejemplo)
  let umbralSugerido = 0.5;
  for (let i = 9; i >= 0; i--) {
    if (cajas[i].tasa >= 0.75) {
      umbralSugerido = i * 0.1;
      break;
    }
  }

  return { cajas, umbralSugerido, n: filtrados.length };
}

/** Ajusta una confianza observada según la calibración. */
export function confianzaCalibrada(cal: Calibracion, p: number): number {
  if (p < 0) return 0;
  if (p >= 1) return cal.cajas[9].tasa;

  const i = Math.floor(p * 10);
  const cajaActual = cal.cajas[i];
  
  // Interpolación simple: p * tasa
  return p * cajaActual.tasa;
}
