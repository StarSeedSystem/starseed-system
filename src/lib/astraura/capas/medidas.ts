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

/** Calcula la media de latencia, tokens/s y acierto de las medidas guardadas. */
export function mediaMedidas(medidas: MedidaNeurona[]): {
  latenciaMs: number;
  tokPorS?: number;
  acierto?: number;
  muestras: number;
} {
  if (medidas.length === 0) return { latenciaMs: 0, muestras: 0 };
  let sumaLat = 0;
  let sumaTok = 0;
  let sumaAci = 0;
  let nTok = 0;
  let nAci = 0;
  for (const m of medidas) {
    sumaLat += m.latenciaMs;
    if (m.tokPorS != null) { sumaTok += m.tokPorS; nTok++; }
    if (m.acierto != null) { sumaAci += m.acierto; nAci++; }
  }
  return {
    latenciaMs: Math.round(sumaLat / medidas.length),
    tokPorS: nTok > 0 ? Math.round(sumaTok / nTok) : undefined,
    acierto: nAci > 0 ? Number((sumaAci / nAci).toFixed(3)) : undefined,
    muestras: medidas.length,
  };
}

/** Candidato que el planificador evalúa (simplificado para ordenación). */
export interface CandidatoConMedida {
  modelo: string;
  donde: "local" | "par" | "servidor-starseed" | "servidor-propio" | "api-gratis";
  nodo?: string;
  puntos: number;
  capa?: { id: string; capa: Capa; sha256: string; ramMinMb?: number; profundidad?: number };
}

/**
 * Reordena candidatos según lo medido en la neurona.
 * Más rápido (menor latencia) y más acertado (mayor acierto) primero.
 * Sin medida: se respeta el orden del catálogo (puntos originales).
 */
export function ordenarPorMedidas(
  candidatos: CandidatoConMedida[],
  almacen: MedidasAlmacen,
  neurona: string,
): Promise<CandidatoConMedida[]> {
  return (async () => {
    const medidasGuardadas = (await almacen.leer(claveMedidas(neurona))) ?? [];
    if (medidasGuardadas.length === 0) return candidatos;

    const porModelo = new Map<string, MedidaNeurona[]>();
    for (const m of medidasGuardadas) {
      const arr = porModelo.get(m.modelo) ?? [];
      arr.push(m);
      porModelo.set(m.modelo, arr);
    }

    // Verificar si hay medidas para alguno de los candidatos
    const tieneMedidas = candidatos.some((c) => porModelo.has(c.modelo));
    if (!tieneMedidas) return candidatos;

    const conScore = candidatos.map((c) => {
      const medias = porModelo.get(c.modelo);
      if (!medias?.length) return { ...c, score: c.puntos };
      const { latenciaMs, acierto } = mediaMedidas(medias);
      const scoreLat = Math.max(0, 100 - Math.min(100, latenciaMs / 50));
      const scoreAci = acierto != null ? Math.round(acierto * 100) : 0;
      const score = Math.round(c.puntos + 0.7 * scoreLat + 0.3 * scoreAci);
      return { ...c, score };
    });

    conScore.sort((a, b) => b.score - a.score || a.modelo.localeCompare(b.modelo));
    return conScore.map(({ score, ...r }) => r);
  })();
}

export function almacenamientoEnMemoriaMedidas(): MedidasAlmacen {
  const mapa = new Map<string, MedidaNeurona[]>();
  return {
    leer: async (c) => mapa.get(c)?.map((m) => ({ ...m })) ?? null,
    escribir: async (c, d) => void mapa.set(c, d.map((m) => ({ ...m }))),
    borrar: async (c) => void mapa.delete(c),
  };
}