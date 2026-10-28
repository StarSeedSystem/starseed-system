// Medidas de rendimiento por neurona (CLB1027G · Colibri en las capas de Astraura).
// Módulo PURO: sin node:*, sin red, sin disco. El almacenamiento se inyecta.

import type { Capa } from "./catalogo";

export interface MedidaNeurona {
  neurona: string;
  modelo: string;
  capa: Capa;
  latenciaMs: number;
  tokPorS?: number;
  acierto?: number;
  timestamp: number;
}

export interface MedidasAlmacen {
  leer(clave: string): Promise<MedidaNeurona[] | null>;
  escribir(clave: string, datos: MedidaNeurona[]): Promise<void>;
  borrar(clave: string): Promise<void>;
}

const CLAVE_MEDIDAS = "medidas-neuronas-v1";
const MAX_MUESTRAS = 20;

function claveMedidas(neurona: string): string {
  return `${CLAVE_MEDIDAS}/${neurona}`;
}

/** Registra una medida y mantiene la media móvil de las últimas 20. */
export async function registrarMedida(
  almacen: MedidasAlmacen,
  medida: Omit<MedidaNeurona, "timestamp">,
): Promise<void> {
  const clave = claveMedidas(medida.neurona);
  const existentes = (await almacen.leer(clave)) ?? [];
  const nueva: MedidaNeurona = { ...medida, timestamp: Date.now() };
  const actualizadas = [...existentes, nueva].slice(-MAX_MUESTRAS);
  await almacen.escribir(clave, actualizadas);
}

/** Calcula la media de las últimas 20 medidas dadas (la media móvil que se mide). */
export function mediaMedidas(medidas: readonly MedidaNeurona[]): {
  latenciaMs: number;
  tokPorS?: number;
  acierto?: number;
  muestras: number;
} {
  const ultimas = medidas.slice(-MAX_MUESTRAS);
  if (!ultimas.length) return { latenciaMs: 0, muestras: 0 };
  let sumaLat = 0, sumaTok = 0, sumaAci = 0, nTok = 0, nAci = 0;
  for (const m of ultimas) {
    sumaLat += m.latenciaMs;
    if (m.tokPorS != null) { sumaTok += m.tokPorS; nTok++; }
    if (m.acierto != null) { sumaAci += m.acierto; nAci++; }
  }
  return {
    latenciaMs: Math.round(sumaLat / ultimas.length),
    tokPorS: nTok ? Math.round(sumaTok / nTok) : undefined,
    acierto: nAci ? Number((sumaAci / nAci).toFixed(3)) : undefined,
    muestras: ultimas.length,
  };
}

/** Candidato del planificador: basta su modelo y sus puntos del catálogo para ordenarlo. */
export interface CandidatoConMedida {
  modelo: string;
  donde: "local" | "par" | "servidor-starseed" | "servidor-propio" | "api-gratis";
  nodo?: string;
  puntos: number;
  capa?: { id: string; capa: Capa; sha256: string; ramMinMb?: number; profundidad?: number };
}

interface CandidatoOrdenable {
  modelo: string;
  puntos: number;
}

/**
 * Reordena los candidatos de una capa con lo medido en la neurona.
 * Más rápido (menor latencia media) y más acertado (mayor acierto) primero;
 * sin medida para el modelo, conserva sus puntos de catálogo y así su orden.
 * Puro: recibe las medidas ya leídas, no las va a buscar.
 */
export function ordenarPorMedidas<T extends CandidatoOrdenable>(
  candidatos: readonly T[],
  medidas: readonly MedidaNeurona[],
  neurona: string,
): T[] {
  const deNeurona = medidas.filter((m) => m.neurona === neurona);
  if (deNeurona.length === 0) return [...candidatos];
  const porModelo = new Map<string, MedidaNeurona[]>();
  for (const m of deNeurona) {
    const lista = porModelo.get(m.modelo) ?? [];
    lista.push(m);
    porModelo.set(m.modelo, lista);
  }
  if (!candidatos.some((c) => porModelo.has(c.modelo))) return [...candidatos];
  const conScore = candidatos.map((c) => {
    const lista = porModelo.get(c.modelo);
    if (!lista?.length) return { candidato: c, score: c.puntos };
    const { latenciaMs, acierto } = mediaMedidas(lista);
    const scoreLat = Math.max(0, 100 - Math.min(100, latenciaMs / 50));
    const scoreAci = acierto != null ? Math.round(acierto * 100) : 0;
    const score = Math.round(c.puntos + 0.7 * scoreLat + 0.3 * scoreAci);
    return { candidato: c, score };
  });
  conScore.sort((a, b) => b.score - a.score || a.candidato.modelo.localeCompare(b.candidato.modelo));
  return conScore.map((s) => s.candidato);
}

export function almacenamientoEnMemoriaMedidas(): MedidasAlmacen {
  const mapa = new Map<string, MedidaNeurona[]>();
  return {
    leer: async (c) => mapa.get(c)?.map((m) => ({ ...m })) ?? null,
    escribir: async (c, d) => void mapa.set(c, d.map((m) => ({ ...m }))),
    borrar: async (c) => void mapa.delete(c),
  };
}