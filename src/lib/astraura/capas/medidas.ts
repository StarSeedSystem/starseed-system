// Medidas de rendimiento por neurona (CLB1027Gb · Colibri en las capas de Astraura),
// parte 1 de 3: lo medido en cada neurona reordena los candidatos.
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
  escribir(clave: string, medidas: readonly MedidaNeurona[]): Promise<void>;
}

/** Máximo de muestras que se guardan por neurona (media móvil de las últimas 20). */
export const MAX_MUESTRAS = 20;
const CLAVE_MEDIDAS = "medidas-neuronas-v1";

/** Candidato que el planificador evalúa; basta con que lo describan estos campos. */
export interface CandidatoConMedida {
  modelo: string;
  donde: "local" | "par" | "servidor-starseed" | "servidor-propio" | "api-gratis";
  nodo?: string;
  puntos: number;
  capa?: { id: string; capa: Capa; sha256: string; ramMinMb?: number; profundidad?: number };
}

/** Registra una medida y guarda solo las últimas MAX_MUESTRAS por neurona. */
function claveDe(neurona: string): string {
  return `${CLAVE_MEDIDAS}/${neurona}`;
}

export async function registrarMedida(
  almacen: MedidasAlmacen,
  medida: Omit<MedidaNeurona, "timestamp">,
): Promise<MedidaNeurona[]> {
  const existentes = (await almacen.leer(claveDe(medida.neurona))) ?? [];
  const nueva: MedidaNeurona = { ...medida, timestamp: Date.now() };
  const actualizadas = [...existentes, nueva].slice(-MAX_MUESTRAS);
  await almacen.escribir(claveDe(medida.neurona), actualizadas);
  return actualizadas;
}

/** Media de latencia, tokens/s y acierto de las medidas dadas. */
export function mediaMedidas(medidas: readonly MedidaNeurona[]): {
  latenciaMs: number; tokPorS?: number; acierto?: number; muestras: number;
} {
  if (!medidas.length) return { latenciaMs: 0, muestras: 0 };
  let sumaLat = 0; let sumaTok = 0; let sumaAci = 0; let nTok = 0; let nAci = 0;
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

/**
 * Reordena los candidatos según lo medido en la neurona:
 * más rápido (menor latencia) y más acertado antes; sin medida para ninguno,
 * se conserva el orden del catálogo (el de la entrada). No muta la entrada.
 */
export function ordenarPorMedidas<T extends CandidatoConMedida>(
  candidatos: readonly T[],
  medidas: readonly MedidaNeurona[],
  neurona: string,
): T[] {
  const delNeurona = medidas.filter((m) => m.neurona === neurona);
  const porModelo = new Map<string, MedidaNeurona[]>();
  for (const m of delNeurona) {
    const acumuladas = porModelo.get(m.modelo) ?? [];
    acumuladas.push(m);
    porModelo.set(m.modelo, acumuladas);
  }
  const medidos = candidatos.some((c) => porModelo.has(c.modelo));
  if (!medidos) return [...candidatos];
  const conPuntaje = candidatos.map((c) => {
    const delModelo = porModelo.get(c.modelo);
    if (!delModelo?.length) return { c, puntaje: c.puntos };
    const { latenciaMs, acierto } = mediaMedidas(delModelo);
    // Más rápido y más acertado puntúa más; sin acierto medido, se mantiene neutral (50).
    const puntosLat = Math.max(0, 100 - Math.min(100, Math.round(latenciaMs / 50)));
    const puntosAci = acierto != null ? Math.round(acierto * 100) : 50;
    return { c, puntaje: c.puntos + 0.7 * puntosLat + 0.3 * puntosAci };
  });
  conPuntaje.sort((a, b) => b.puntaje - a.puntaje);
  return conPuntaje.map(({ c }) => c);
}

/** Almacenamiento de medidas en memoria, sin disco ni red; útil en pruebas y como búfer. */
export function almacenamientoEnMemoriaMedidas(): MedidasAlmacen {
  const mapa = new Map<string, MedidaNeurona[]>();
  return {
    leer: async (clave) => mapa.get(clave)?.map((m) => ({ ...m })) ?? null,
    escribir: async (clave, medidas) => void mapa.set(clave, medidas.map((m) => ({ ...m }))),
  };
}
