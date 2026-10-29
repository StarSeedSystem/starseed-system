export interface EstadoInterrupcion {
  /** Tiempo en ms desde que acabó el último habla de Astraura */
  ultimoFinHablaGlobal: number | null;
}

export interface ParpadeoEnergia {
  tiempo: number;
  energia: number;
}

/**
 * Decide si el micrófono debe llamar a interrupt().
 * @param muestras  Array de lecturas de energía con timestamps ascendentales.
 * @param estado   Estado del motor (último fin de habla).
 * @param params   Umbral en dB y tiempo mínimo.
 */
export function decidirInterrupcion(
  muestras: ParpadeoEnergia[],
  estado: EstadoInterrupcion,
  params: { umbralDb: number; minimoMs: number }
): boolean {
  if (!muestras.length) return false;
  const { minimoMs, umbralDb } = params;
  const ventana = muestras.filter((m) => {
    const tiempoDesdeUltimo = estado.ultimoFinHablaGlobal !== null
      ? m.tiempo - estado.ultimoFinHablaGlobal
      : 0;
    return tiempoDesdeUltimo >= 0;
  });
  if (!ventana.length) return false;
  let inicio = ventana[0].tiempo;
  let suma = 0;
  let count = 0;
  for (const m of ventana) {
    suma += m.energia;
    count++;
    const dur = m.tiempo - inicio;
    if (dur >= minimoMs) {
      const media = suma / count;
      if (media >= umbralDb) return true;
      // reset window
      inicio = m.tiempo;
      suma = m.energia;
      count = 1;
    }
  }
  return false;
}
