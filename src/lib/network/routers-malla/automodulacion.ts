export type Medida = {
  snrDb: number;
  reintentosPct: number;
};

export type EstadoActual = {
  anchoMhz: number;
  potenciaDbm: number;
};

export type Limites = {
  anchosMhz: number[];
  pireMaxDbm: number;
};

export type Resultado = {
  anchoMhz: number;
  potenciaDbm: number;
  motivo: string;
};

export function ajustarEnlace(
  actual: EstadoActual,
  medidas: Medida[],
  limites: Limites
): Resultado {
  if (medidas.length === 0) {
    return { ...actual, motivo: 'Sin medidas para ajustar' };
  }

  const lastFive = medidas.slice(-5);
  const mediana = (arr: number[]): number => {
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };
  const medianaSnr = mediana(lastFive.map(m => m.snrDb));
  const medianaReintentos = mediana(lastFive.map(m => m.reintentosPct));

  const anchoIndex = limites.anchosMhz.indexOf(actual.anchoMhz);
  let nuevoAncho = actual.anchoMhz;
  let motivoAncho = '';

  const shouldDecreaseBySnr =
    (actual.anchoMhz === 80 && medianaSnr < 20) ||
    (actual.anchoMhz === 40 && medianaSnr < 15);
  const shouldDecreaseByReintentos = medianaReintentos > 15;

  if (shouldDecreaseBySnr || shouldDecreaseByReintentos) {
    if (anchoIndex > 0) {
      nuevoAncho = limites.anchosMhz[anchoIndex - 1];
      motivoAncho = `Se disminuye el ancho de banda a ${nuevoAncho} MHz debido a `;
      if (shouldDecreaseBySnr && shouldDecreaseByReintentos) {
        motivoAncho += `bajo SNR (${medianaSnr.toFixed(1)} dB) y alto reintentos (${medianaReintentos.toFixed(1)}%)`;
      } else if (shouldDecreaseBySnr) {
        motivoAncho += `bajo SNR (${medianaSnr.toFixed(1)} dB)`;
      } else {
        motivoAncho += `alto reintentos (${medianaReintentos.toFixed(1)}%)`;
      }
    }
  } else {
    const nextAnchoIndex = anchoIndex + 1;
    if (nextAnchoIndex < limites.anchosMhz.length) {
      const nextAncho = limites.anchosMhz[nextAnchoIndex];
      let umbralNext = 0;
      if (nextAncho === 40) umbralNext = 15;
      else if (nextAncho === 80) umbralNext = 20;
      const shouldIncreaseBySnr = medianaSnr > umbralNext + 5;
      const shouldIncreaseByReintentos = medianaReintentos < 5;
      if (shouldIncreaseBySnr && shouldIncreaseByReintentos) {
        nuevoAncho = nextAncho;
        motivoAncho = `Se aumenta el ancho de banda a ${nuevoAncho} MHz debido a buen SNR (${medianaSnr.toFixed(1)} dB) y bajo reintentos (${medianaReintentos.toFixed(1)}%)`;
      }
    }
  }

  if (nuevoAncho === actual.anchoMhz && motivoAncho === '') {
    motivoAncho = `Se mantiene el ancho de banda en ${actual.anchoMhz} MHz`;
  }

  let nuevaPotencia = actual.potenciaDbm;
  let motivoPotencia = '';
  if (medianaSnr < 15 && actual.potenciaDbm + 2 <= limites.pireMaxDbm) {
    nuevaPotencia = actual.potenciaDbm + 2;
    motivoPotencia = `Se aumenta la potencia a ${nuevaPotencia} dBm debido a bajo SNR (${medianaSnr.toFixed(1)} dB)`;
  } else if (medianaSnr > 35) {
    nuevaPotencia = actual.potenciaDbm - 2;
    motivoPotencia = `Se disminuye la potencia a ${nuevaPotencia} dBm debido a alto SNR (${medianaSnr.toFixed(1)} dB) para reducir interferencia`;
  } else {
    motivoPotencia = `Se mantiene la potencia en ${actual.potenciaDbm} dBm`;
  }

  const motivo = `${motivoAncho}. ${motivoPotencia}.`;
  return { anchoMhz: nuevoAncho, potenciaDbm: nuevaPotencia, motivo };
}