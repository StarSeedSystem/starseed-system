// Calibración de la confianza de Laya por punto y ámbito (architecture/jev-entrena-laya.md §3.2).
// Pura: sin red, sin disco, sin reloj. 10 cajas de confianza, tasa de acierto por caja, exige ≥ MIN_CASOS_UMBRAL.
import { MIN_CASOS_UMBRAL, type CasoLaya } from "./aprendizaje-laya";

export interface CajaConfianza {
  readonly rango: [number, number];
  readonly centro: number;
  readonly total: number;
  readonly aciertos: number;
  readonly tasa: number;
}

export interface CalibracionLaya {
  readonly punto: string;
  readonly ambito: string;
  readonly cajas: readonly CajaConfianza[];
  readonly umbralSugerido: number;
  readonly n: number;
}

export interface CalibracionInsuficiente {
  readonly n: number;
  readonly motivo: "faltan casos";
}

/** Índice de caja (0-9) para una confianza p, evitando problemas de punto flotante. */
function indiceCaja(p: number): number {
  if (p >= 1) return 9;
  return Math.min(9, Math.floor(p * 10));
}

/** Agrupa los casos en 10 cajas de confianza [0, 0.1), [0.1, 0.2), ..., [0.9, 1.0] y calcula la tasa de acierto. */
export function calibrar(casos: readonly CasoLaya[], punto: string, ambito: string): CalibracionLaya | CalibracionInsuficiente {
  const casosPunto = casos.filter((c) => c.punto === punto && c.ambito === ambito);
  if (casosPunto.length < MIN_CASOS_UMBRAL) {
    return { n: casosPunto.length, motivo: "faltan casos" };
  }

  const conteos = new Array(10).fill(0).map(() => ({ total: 0, aciertos: 0 }));
  for (const c of casosPunto) {
    const idx = indiceCaja(c.p);
    conteos[idx].total++;
    if (c.resultado === "aceptada") conteos[idx].aciertos++;
  }

  const cajas: CajaConfianza[] = [];
  for (let i = 0; i < 10; i++) {
    const min = i * 0.1;
    const max = (i + 1) * 0.1;
    const centro = (min + max) / 2;
    const { total, aciertos } = conteos[i];
    const tasa = total > 0 ? aciertos / total : 0;
    cajas.push({ rango: [min, max], centro, total, aciertos, tasa });
  }

  // Umbral sugerido: centro de la caja con mayor tasa entre las que tienen ≥ 3 casos.
  let umbralSugerido = 0.6;
  let mejorTasa = -1;
  for (const caja of cajas) {
    if (caja.total >= 3 && caja.tasa > mejorTasa) {
      mejorTasa = caja.tasa;
      umbralSugerido = caja.centro;
    }
  }

  return { punto, ambito, cajas: Object.freeze(cajas), umbralSugerido, n: casosPunto.length };
}

/** Interpola la confianza calibrada: nunca sube por encima de la tasa observada en la caja correspondiente. */
export function confianzaCalibrada(cal: CalibracionLaya, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const idx = indiceCaja(p);
  const caja = cal.cajas[idx];
  if (caja.total === 0) {
    // Caja vacía: buscar la caja más cercana con datos hacia abajo
    for (let i = idx - 1; i >= 0; i--) {
      if (cal.cajas[i].total > 0) return Math.min(p, cal.cajas[i].tasa);
    }
    return p; // sin datos, no sube
  }
  return Math.min(p, caja.tasa);
}