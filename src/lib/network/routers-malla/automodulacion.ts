// Función auxiliar para calcular la mediana (no exportada)
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export interface AnchoActual {
  anchoMhz: number;
  potenciaDbm: number;
}

export interface Medida {
  snrDb: number;
  reintentosPct: number;
}

export interface Limites {
  anchosMhz: number[];
  pireMaxDbm: number;
}

export interface ResultadoAjuste {
  anchoMhz: number;
  potenciaDbm: number;
  motivo: string;
}

/**
 * Ajusta el ancho de banda y potencia de enlace basado en las medidas de SNR y reintentos.
 * Usa la mediana de las últimas 5 medidas.
 * Baja un escalón de ancho si snr < umbralDescendente(anchoActual) o reintentos > 15%.
 * Sube un escalón solo si snr > umbralDescendente(anchoSuperior) + 5 dB y reintentos < 5%.
 * Ajusta potencia: +2 dBm si snr < 15 y hay margen legal, -2 dBm si snr > 35.
 * Nunca supera pireMaxDbm.
 * @param actual Estado actual del enlace
 * @param medidas Array de medidas históricas
 * @param límites Límites de ancho y potencia máxima
 * @returns Nuevo ancho, potencia y motivo del ajuste
 */
export function ajustarEnlace(
  actual: AnchoActual,
  medidas: Medida[],
  limites: Limites
): ResultadoAjuste {
  // Tomar las últimas 5 medidas (o menos si no hay suficientes)
  const ultimas5 = medidas.slice(-5);
  
  // Calcular medianas de SNR y reintentos
  const snrMedian = median(ultimas5.map(m => m.snrDb));
  const reintentosMedian = median(ultimas5.map(m => m.reintentosPct));
  
  // Encontrar índice del ancho actual en el array de límites (asumimos orden ascendente)
  const anchoIndex = limites.anchosMhz.indexOf(actual.anchoMhz);
  let nuevoAnchoIndex = anchoIndex;
  
  // Función para calcular umbral descendente dado un ancho
  const umbralDescendente = (ancho: number): number => 0.125 * ancho + 10;
  
  let motivo = '';
  
  // Verificar si se debe bajar de ancho (solo si no está en el mínimo)
  if (anchoIndex > 0) {
    const anchoActual = limites.anchosMhz[anchoIndex];
    const umbral = umbralDescendente(anchoActual);
    if (snrMedian < umbral || reintentosMedian > 15) {
      nuevoAnchoIndex = anchoIndex - 1;
      motivo = `Bajando ancho de ${anchoActual}MHz a ${limites.anchosMhz[nuevoAnchoIndex]}MHz por SNR bajo (${snrMedian.toFixed(1)} < ${umbral.toFixed(1)}) o reintentos altos (${reintentosMedian.toFixed(1)}% > 15%)`;
    }
  }
  
  // Verificar si se debe subir de ancho (solo si no bajamos y no está en el máximo)
  if (motivo === '' && anchoIndex < limites.anchosMhz.length - 1) {
    const anchoSuperior = limites.anchosMhz[anchoIndex + 1];
    const umbralSuperior = umbralDescendente(anchoSuperior);
    if (snrMedian > umbralSuperior + 5 && reintentosMedian < 5) {
      nuevoAnchoIndex = anchoIndex + 1;
      motivo = `Subiendo ancho de ${limites.anchosMhz[anchoIndex]}MHz a ${anchoSuperior}MHz por SNR alto (${snrMedian.toFixed(1)} > ${(umbralSuperior + 5).toFixed(1)}) y reintentos bajos (${reintentosMedian.toFixed(1)}% < 5%)`;
    }
  }
  
  // Determinar nuevo ancho
  const nuevoAnchoMhz = limites.anchosMhz[nuevoAnchoIndex] ?? actual.anchoMhz;
  
  // Ajustar potencia
  let nuevaPotenciaDbm = actual.potenciaDbm;
  if (snrMedian < 15) {
    // Siempre añadimos el intento de aumento al motivo
    const potenciaObjetivo = Math.min(nuevaPotenciaDbm + 2, limites.pireMaxDbm);
    motivo += motivo ? `; aumentando potencia a ${potenciaObjetivo}dBm por SNR bajo (<15)` : `Aumentando potencia a ${potenciaObjetivo}dBm por SNR bajo (<15)`;
    // Ahora ajustamos la potencia si podemos
    if (nuevaPotenciaDbm < limites.pireMaxDbm) {
      nuevaPotenciaDbm = Math.min(nuevaPotenciaDbm + 2, limites.pireMaxDbm);
    }
    // Si ya estamos en el límite, no cambiamos la potencia, pero ya añadimos el motivo
  } else if (snrMedian > 35) {
    // Siempre añadimos el intento de disminución al motivo
    const potenciaObjetivo = Math.max(nuevaPotenciaDbm - 2, 0); // Asumimos mínimo 0
    motivo += motivo ? `; disminuyendo potencia a ${potenciaObjetivo}dBm por alto SNR (>35) para reducir interferencia` : `Disminuyendo potencia a ${potenciaObjetivo}dBm por alto SNR (>35) para reducir interferencia`;
    // Ahora ajustamos la potencia si podemos
    if (nuevaPotenciaDbm > 0) {
      nuevaPotenciaDbm = Math.max(nuevaPotenciaDbm - 2, 0);
    }
  }
  
  // Si no hubo ajustes, establecer motivo por defecto
  if (motivo === '') {
    motivo = 'Manteniendo ancho y potencia por estabilidad';
  }
  
  return {
    anchoMhz: nuevoAnchoMhz,
    potenciaDbm: nuevaPotenciaDbm,
    motivo
   };
}