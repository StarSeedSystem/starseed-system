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

export interface MediaMedidas {
  latenciaMs: number;
  tokPorS?: number;
  acierto?: number;
  muestras: number;
}

/** Lo mínimo que un candidato debe exponer para poder reordenarse (el de planificador vale). */
export interface CandidatoConMedida {
  modelo: string;
  puntos?: number;
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
  const existentes = (await almacen.leer(claveMedidas(medida.neurona))) ?? [];
  const nueva: MedidaNeurona = { ...medida, timestamp: Date.now() };
  await almacen.escribir(claveMedidas(medida.neurona), [...existentes, nueva].slice(-MAX_MUESTRAS));
}

/** Media de latencia, tokens/s y acierto de las medidas guardadas de un modelo. */
export function mediaMedidas(medidas: readonly MedidaNeurona[]): MediaMedidas {
  if (!medidas.length) return { latenciaMs: 0, muestras: 0 };
  let sumaLat = 0, sumaTok = 0, sumaAci = 0, nTok = 0, nAci = 0;
  for (const m of medidas) {
    sumaLat += m.latenciaMs;
    if (m.tokPorS != null) { sumaTok += m.tokPorS; nTok++; }
    if (m.acierto != null) { sumaAci += m.acierto; nAci++; }
  }
  return {
    latenciaMs: Math.round(sumaLat / medidas.length),
    tokPorS: nTok ? Math.round(sumaTok / nTok) : undefined,
    acierto: nAci ? Number((sumaAci / nAci).toFixed(3)) : undefined,
    muestras: medidas.length,
  };
}

/** Puntos que añade lo medido (0–100): 70 % latencia (menos es más) y 30 % acierto. */
function puntosMedida(medias: MediaMedidas): number {
  const porLatencia = Math.max(0, 100 - Math.min(100, medias.latenciaMs / 50));
  const porAcierto = medias.acierto != null ? medias.acierto * 100 : 0;
  return 0.7 * porLatencia + 0.3 * porAcierto;
}

/**
 * Reordena los candidatos con lo medido en ESA neurona: más rápido y más acertado
 * primero, sumando a los puntos del catálogo. Sin medida, el orden del catálogo.
 * Nunca muta la entrada; devuelve una copia nueva.
 */
export function ordenarPorMedidas<T extends CandidatoConMedida>(
  candidatos: readonly T[],
  medidas: readonly MedidaNeurona[],
  neurona: string,
): T[] {
  const deLaNeurona = medidas.filter((m) => m.neurona === neurona);
  if (!deLaNeurona.length) return [...candidatos];
  const porModelo = new Map<string, MediaMedidas>();
  const agrupadas = new Map<string, MedidaNeurona[]>();
  for (const m of deLaNeurona) {
    const lista = agrupadas.get(m.modelo) ?? [];
    lista.push(m);
    agrupadas.set(m.modelo, lista);
  }
  for (const [modelo, lista] of agrupadas) porModelo.set(modelo, mediaMedidas(lista));
  const conlleva = candidatos.some((c) => porModelo.has(c.modelo));
  if (!conlleva) return [...candidatos];
  const puntuar = (c: T): number =>
    (c.puntos ?? 0) + (porModelo.has(c.modelo) ? puntosMedida(porModelo.get(c.modelo)!) : 0);
  // Desempate por índice original: empate de puntos conserva el orden del catálogo.
  return candidatos
    .map((c, indice) => ({ c, indice }))
    .sort((x, y) => puntuar(y.c) - puntuar(x.c) || x.indice - y.indice)
    .map(({ c }) => c);
}

export function almacenamientoEnMemoriaMedidas(): MedidasAlmacen {
  const mapa = new Map<string, MedidaNeurona[]>();
  return {
    leer: async (c) => mapa.get(c)?.map((m) => ({ ...m })) ?? null,
    escribir: async (c, d) => void mapa.set(c, d.map((m) => ({ ...m }))),
    borrar: async (c) => void mapa.delete(c),
  };
}
