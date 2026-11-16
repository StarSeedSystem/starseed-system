// Calibración de confianza de Laya por punto y ámbito (architecture/jev-entrena-laya.md §3).
// Módulo puro: sin red, sin disco, sin reloj.
// Con casos (`CasoLaya`) y su desenlace correcto/incorrecto, `calibrar(casos, punto, ambito)`:
// - Requiere ≥ `MIN_CASOS_UMBRAL` (30) casos por punto y ámbito.
// - Devuelve `{cajas, umbralSugerido, n}` o `{n, motivo: "faltan casos"}`.
// - `confianzaCalibrada(cal, p)` interpola y nunca sube la confianza por encima de la tasa observada.
import type { CasoLaya, RegistroAprendizaje } from "./aprendizaje-laya";
import { casosDe, MIN_CASOS_UMBRAL } from "./aprendizaje-laya";

export interface CajaCalibracion {
  readonly rango: [number, number];
  readonly tasaAcierto: number;
  readonly n: number;
}

export interface ResultadoCalibracionExitoso {
  readonly cajas: readonly CajaCalibracion[];
  readonly umbralSugerido: number;
  readonly n: number;
}

export interface ResultadoCalibracionFallido {
  readonly n: number;
  readonly motivo: "faltan casos";
}

export type ResultadoCalibracion = ResultadoCalibracionExitoso | ResultadoCalibracionFallido;

const NUM_CAJAS = 10;

export function esExitoso(r: ResultadoCalibracion): r is ResultadoCalibracionExitoso {
  return "cajas" in r;
}

export function calibrar(
  registro: RegistroAprendizaje,
  punto: string,
  ambito: string
): ResultadoCalibracion {
  const casos = casosDe(registro, punto, ambito);
  const n = casos.length;

  if (n < MIN_CASOS_UMBRAL) {
    return { n, motivo: "faltan casos" };
  }

  const cajas = construirCajas(casos);
  const umbralSugerido = cajas.length > 0 ? Math.min(...cajas.map((c) => c.tasaAcierto)) : 0;

  return { cajas, umbralSugerido, n };
}

function construirCajas(casos: readonly CasoLaya[]): readonly CajaCalibracion[] {
  const cajaTam = Math.ceil(casos.length / NUM_CAJAS);
  const cajas: CajaCalibracion[] = [];

  for (let i = 0; i < NUM_CAJAS; i++) {
    const desde = i * cajaTam;
    const hasta = Math.min(desde + cajaTam, casos.length);
    const lote = casos.slice(desde, hasta);

    if (lote.length === 0) break;

    const tasaAcierto = calcularTasaAcierto(lote);
    cajas.push({
      rango: [desde / casos.length, hasta / casos.length],
      tasaAcierto,
      n: lote.length,
    });
  }

  return cajas;
}

function calcularTasaAcierto(casos: readonly CasoLaya[]): number {
  const aciertos = casos.filter((c) => c.resultado === "aceptada").length;
  return aciertos / casos.length;
}

export function confianzaCalibrada(
  cal: ResultadoCalibracionExitoso,
  p: number
): number {
  return Math.min(p, cal.umbralSugerido);
}