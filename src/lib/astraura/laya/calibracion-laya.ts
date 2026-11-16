// Calibración de la confianza de Laya por punto y ámbito
// const: 10 cajas de confianza
// Cada caja (0-0.1), (0.1-0.2), ... (0.9-1.0) calcula la tasa de acierto (aceptadas) observadas.
// Se requiere un mínimo de MIN_CASOS_UMBRAL casos para calibrar. Si faltan, devolvemos motivo.
// La función confianzaCalibrada interpola (básicamente devuelve la tasa de la caja que contiene p) y no supera la tasa observada.

import type { RegistroAprendizaje, CasoLaya } from "./aprendizaje-laya";
import { MIN_CASOS_UMBRAL, umbralRecalibrado } from "./aprendizaje-laya";

export interface Caja {
  /** límite inferior de la caja (incluido) */
  pMin: number;
  /** límite superior (excluido, excepto en la última caja) */
  pMax: number;
  /** tasa de aciertos observada en la caja */
  tasaAc: number;
}

/** Resultados de calibrar */
export interface CalibrarResultado {
  /** cajas de confianza */
  cajas: readonly Caja[];
  /** umbral recalibrado para el punto y ámbito */
  umbralSugerido: number;
  /** número de casos usados */
  n: number;
}

export interface CalibrarFaltan {
  /** número de casos presentes */
  n: number;
  motivo: "faltan casos";
}

/**
 * Calibra la confianza de Laya para un punto y ámbito concreto.
 * 
 * @param registro Registro completo de aprendizaje.
 * @param punto Punto de decisión.
 * @param ambito Ámbito asociado.
 * @returns Si hay al menos MIN_CASOS_UMBRAL casos devuelve los datos de calibración; de lo
 *   contrario devuelve el motivo.
 */
export function calibrar(
  registro: RegistroAprendizaje,
  punto: string,
  ambito: string
): CalibrarResultado | CalibrarFaltan {
  // Filtra los casos relevantes
  const casos = registro.filter((c) => c.punto === punto && c.ambito === ambito);
  const n = casos.length;
  if (n < MIN_CASOS_UMBRAL) {
    return { n, motivo: "faltan casos" };
  }
  // 10 cajas
  const cajas: Caja[] = [];
  for (let i = 0; i < 10; i++) {
    const pMin = i / 10;
    const pMax = i === 9 ? 1 : (i + 1) / 10;
    const casosEnCaja = casos.filter((c) => c.p >= pMin && (i < 9 ? c.p < pMax : c.p <= pMax));
    const total = casosEnCaja.length;
    const aceptadas = casosEnCaja.filter((c) => c.resultado === "aceptada").length;
    const tasaAc = total === 0 ? 0 : aceptadas / total;
    cajas.push({ pMin, pMax, tasaAc });
  }
  const umbralSugerido = umbralRecalibrado(registro, punto, ambito);
  return { cajas, umbralSugerido, n };
}

/**
 * Interpola la confianza calibrada a partir de los resultados de calibrar.
 * Si no hay resultado de calibrado (motivo) devuelve 0.
 */
export function confianzaCalibrada(
  cal: CalibrarResultado | CalibrarFaltan,
  p: number
): number {
  if (!("cajas" in cal)) {
    // Motivo sin calibración
    return 0;
  }
  const idx = Math.min(9, Math.floor(p * 10));
  const caja = cal.cajas[idx];
  return caja.tasaAc;
}
