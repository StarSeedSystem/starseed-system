export interface Medida {
  tokensPorSeg: number | null;
  aciertos: number | null;
  intentos: number;
  latenciaMs: number | null;
  capa: string | null;
}

export interface ResultadoPuntuacion {
  puntuacion: number;
  motivo: string;
  confianza: number;
}

/** Normaliza un valor a [0,1] entre min y max, o null si la entrada es null */
function normalize(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  const clamped = Math.max(min, Math.min(value, max));
  return (clamped - min) / (max - min);
}

/** Calcula precisión a partir de aciertos y intentos, o null si no se puede */
function calculateAccuracy(aciertos: number | null, intentos: number): number | null {
  if (aciertos === null || intentos === 0) return null;
  return aciertos / intentos;
}

/** Calcula la puntuación de potencia basada en las medidas proporcionadas. */
export function puntuarPotencia(medidas: Medida[], papel: string): ResultadoPuntuacion {
  if (medidas.length === 0) {
    return { puntuacion: 0, motivo: 'Sin medidas', confianza: 0 };
  }

  // Pesos para cada medida (por ahora iguales para todos los papeles)
  const weights = { tokensPorSeg: 1, accuracy: 1, latency: 1 };

  let totalScore = 0;
  let totalWeight = 0;
  const reasons: string[] = [];

  for (const medida of medidas) {
    // tokensPorSeg: rango asumido 0-200
    const tokensNorm = normalize(medida.tokensPorSeg, 0, 200);
    if (tokensNorm !== null) {
      totalScore += tokensNorm * weights.tokensPorSeg;
      totalWeight += weights.tokensPorSeg;
    }

    // accuracy: aciertos / intentos
    const accuracy = calculateAccuracy(medida.aciertos, medida.intentos);
    if (accuracy !== null) {
      totalScore += accuracy * weights.accuracy;
      totalWeight += weights.accuracy;
    }

    // latencyMs: rango asumido 0-2000, pero invertido (menor latency es mejor)
    const latencyNorm = normalize(medida.latenciaMs, 0, 2000);
    if (latencyNorm !== null) {
      const inverseLatency = 1 - latencyNorm;
      totalScore += inverseLatency * weights.latency;
      totalWeight += weights.latency;
    }

    // capa: no se usa en la puntuación, pero se menciona en el motivo
    if (medida.capa !== null) {
      reasons.push(`capa: ${medida.capa}`);
    }
  }

  let puntuacion: number;
  let confianza: number;
  let motivo: string;

  if (totalWeight === 0) {
    puntuacion = 0;
    confianza = 0;
    motivo = 'No se pudieron calcular puntuaciones válidas';
  } else {
    puntuacion = totalScore / totalWeight;
    const maxPossibleWeight = medidas.length * (weights.tokensPorSeg + weights.accuracy + weights.latency);
    confianza = totalWeight / maxPossibleWeight;
    motivo = `Puntuación basada en ${medidas.length} medida${medidas.length > 1 ? 's' : ''}. `;
    if (reasons.length > 0) {
      motivo += `Detalles: ${reasons.join(', ')}.`;
    }
  }

  return { puntuacion, motivo, confianza };
}

/** Ordena un array de medidas por potencia de mayor a menor. */
export function ordenarPorPotencia(medidas: Medida[], papel: string): Medida[] {
  const copia = [...medidas];
  copia.sort((a, b) => {
    const scoreA = puntuarPotencia([a], papel).puntuacion;
    const scoreB = puntuarPotencia([b], papel).puntuacion;
    return scoreB - scoreA;
  });
  return copia;
}