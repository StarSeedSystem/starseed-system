import type { CasoLaya } from "./aprendizaje-laya";
import { MIN_CASOS_UMBRAL } from "./aprendizaje-laya";

export interface CajaConfianza {
  readonly rango: readonly [number, number];
  readonly total: number;
  readonly aciertos: number;
  readonly tasa: number;
}

export interface CalibracionLaya {
  readonly cajas: readonly CajaConfianza[];
  readonly umbralSugerido: number;
  readonly n: number;
}

export type ResultadoCalibracion = CalibracionLaya | { readonly n: number; readonly motivo: "faltan casos" };

export function calibrar(casos: readonly CasoLaya[], punto: string, ambito: string): ResultadoCalibracion {
  const relevantes = casos.filter((c) => c.punto === punto && c.ambito === ambito);
  if (relevantes.length < MIN_CASOS_UMBRAL) {
    return { n: relevantes.length, motivo: "faltan casos" };
  }

  const cajas: CajaConfianza[] = [];
  for (let i = 0; i < 10; i++) {
    const bajo = i * 0.1;
    const alto = (i + 1) * 0.1;
    const enCaja = relevantes.filter((c) => c.p >= bajo && (i === 9 ? c.p <= alto : c.p < alto));
    const total = enCaja.length;
    const aciertos = enCaja.filter((c) => c.resultado === "aceptada").length;
    const tasa = total > 0 ? aciertos / total : 0;
    cajas.push({ rango: [bajo, alto] as const, total, aciertos, tasa });
  }

  const umbralSugerido = sugerirUmbral(cajas);
  return { cajas, umbralSugerido, n: relevantes.length };
}

function sugerirUmbral(cajas: readonly CajaConfianza[]): number {
  let mejor = 0.5;
  let mejorPuntaje = -1;
  for (const caja of cajas) {
    if (caja.total === 0) continue;
    const puntaje = caja.tasa * (1 - Math.abs(caja.rango[0] - 0.5));
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = Math.max(caja.rango[0], caja.tasa);
    }
  }
  return Math.min(1, Math.max(0, mejor));
}

export function confianzaCalibrada(cal: CalibracionLaya, p: number): number {
  const clamped = Math.max(0, Math.min(1, p));
  if (clamped === 1) return cal.cajas[9]!.tasa;
  const indice = Math.floor(clamped * 10);
  const caja = cal.cajas[indice]!;
  if (indice === 9) return caja.tasa;
  const siguiente = cal.cajas[indice + 1]!;
  if (caja.total === 0) return caja.tasa;
  const posicion = (clamped - caja.rango[0]) / (siguiente.rango[0] - caja.rango[0]);
  const interpolada = caja.tasa + posicion * (siguiente.tasa - caja.tasa);
  return Math.min(interpolada, Math.max(caja.tasa, siguiente.tasa));
}