/**
 * StarSeed OS — CAMR · MÉTRICA HÍBRIDA (Ola 1005C · CAMR1005A).
 * ============================================================================
 * Puntuación 0..1 por enlace (§3 del contrato CAMR): latencia, ancho de banda
 * disponible, resiliencia histórica (media móvil exponencial) y coste de tiempo
 * de aire, con pesos distintos por clase de tráfico.
 *
 * Módulo PURO y determinista. Nunca lanza.
 */

import type { ClaseTrafico, Medicion } from "./tipos";

/* ── Pesos por clase de tráfico (suman 1,0) ───────────────────────────────── */

export interface PesosMetrica {
  latencia: number;
  anchoBanda: number;
  resiliencia: number;
  tiempoAire: number;
}

export const PESOS_POR_CLASE: Record<ClaseTrafico, PesosMetrica> = {
  "control-critico": { latencia: 0.15, anchoBanda: 0.05, resiliencia: 0.55, tiempoAire: 0.25 },
  mensajes: { latencia: 0.3, anchoBanda: 0.2, resiliencia: 0.3, tiempoAire: 0.2 },
  "tiempo-real": { latencia: 0.5, anchoBanda: 0.25, resiliencia: 0.2, tiempoAire: 0.05 },
  masivo: { latencia: 0.05, anchoBanda: 0.55, resiliencia: 0.15, tiempoAire: 0.25 },
};

/* ── Puntuadores parciales (0 = pésimo, 1 = ideal) ────────────────────────── */

/** 1 en ≤ 20 ms → 0 en ≥ 2 000 ms (lineal). */
export function puntuaLatencia(latenciaMs: number | null): number {
  if (latenciaMs === null || !Number.isFinite(latenciaMs)) return 0.5;
  return recorta01(1 - (latenciaMs - 20) / (2000 - 20));
}

/** Lineal respecto a la capacidad nominal. */
export function puntuaAnchoBanda(disponibleKbps: number | null, capacidadKbps: number): number {
  if (disponibleKbps === null || !Number.isFinite(disponibleKbps)) return 0.5;
  if (capacidadKbps <= 0) return 0;
  return recorta01(disponibleKbps / capacidadKbps);
}

/** Coste de compartir el canal: 1 = aire libre, 0 = saturado. */
export function puntuaTiempoAire(tiempoAireUsado: number | null): number {
  if (tiempoAireUsado === null || !Number.isFinite(tiempoAireUsado)) return 0.5;
  return recorta01(1 - tiempoAireUsado);
}

/* ── Resiliencia histórica (EMA sobre observaciones crudas 0..1) ────────── */

/** Estado de la media móvil exponencial de un enlace. */
export interface EstadoResiliencia {
  /** Valor EMA 0..1 (1 = histórico perfecto). */
  ema: number;
  /** Medidas incorporadas. */
  n: number;
}

/** Alfa de la EMA: ~10 medidas recientes dominan. */
export const ALFA_RESILIENCIA = 0.2;

/** Deriva una observación 0..1 a partir de pérdida y SNR de una medición. */
export function observacionResiliencia(m: Medicion): number {
  const porPerdida = m.perdida === null ? 0.7 : 1 - recorta01(m.perdida);
  const porSnr =
    m.snrDb === null || !Number.isFinite(m.snrDb) ? 0.7 : recorta01((m.snrDb + 20) / 30);
  return recorta01(0.6 * porPerdida + 0.4 * porSnr);
}

/** Incorpora una medición al histórico. Devuelve un estado NUEVO (inmutable). */
export function actualizaResiliencia(estado: EstadoResiliencia, m: Medicion): EstadoResiliencia {
  const obs = observacionResiliencia(m);
  if (estado.n === 0) return { ema: obs, n: 1 };
  return { ema: estado.ema + ALFA_RESILIENCIA * (obs - estado.ema), n: estado.n + 1 };
}

/* ── Puntuación híbrida ───────────────────────────────────────────────────── */

export function puntuacionHibrida(
  m: Medicion,
  capacidadKbps: number,
  clase: ClaseTrafico,
  resiliencia: EstadoResiliencia,
): number {
  const w = PESOS_POR_CLASE[clase];
  const suma =
    w.latencia * puntuaLatencia(m.latenciaMs) +
    w.anchoBanda * puntuaAnchoBanda(m.anchoBandaKbps, capacidadKbps) +
    w.resiliencia * (resiliencia.n === 0 ? observacionResiliencia(m) : resiliencia.ema) +
    w.tiempoAire * puntuaTiempoAire(m.tiempoAireUsado);
  return recorta01(suma);
}

function recorta01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
