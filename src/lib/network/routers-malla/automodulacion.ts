export interface AnchoMhzActual {
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
 * Ajusta el ancho de banda y potencia de un enlace basado en las medidas de SNR y reintentos.
 * @param actual Estado actual del enlace (ancho de banda y potencia)
 * @param medidas Array de medidas históricas (SNR y porcentaje de reintentos)
 * @param límites Límites de ancho de banda disponibles y potencia máxima permitida
 * @return Nuevo estado del enlace con motivo del ajuste
 */
export function ajustarEnlace(
  actual: AnchoMhzActual,
  medidas: Medida[],
  límites: Limites
): ResultadoAjuste {
  const ultimasMedidas = medidas.slice(-5);
  const snrValues = ultimasMedidas.map(m => m.snrDb);
  const reintentosValues = ultimasMedidas.map(m => m.reintentosPct);
  
  const mediana = (valores: number[]): number => {
    if (valores.length === 0) return 0;
    const sorted = [...valores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  };
  
  const snrMediana = mediana(snrValues);
  const reintentosMediana = mediana(reintentosValues);
  
  const anchoActualIndex = límites.anchosMhz.indexOf(actual.anchoMhz);
  let nuevoAncho = actual.anchoMhz;
  let nuevaPotencia = actual.potenciaDbm;
  let motivo = 'Sin cambios';
  
  // Disminuir ancho: snr < 20 (80MHz) / 15 (40MHz) o reintentos > 15%
  let debeDisminuir = false;
  if (actual.anchoMhz === 80 && snrMediana < 20) {
    debeDisminuir = true;
    motivo = 'SNR bajo para 80 MHz';
  } else if (actual.anchoMhz === 40 && snrMediana < 15) {
    debeDisminuir = true;
    motivo = 'SNR bajo para 40 MHz';
  } else if (reintentosMediana > 15) {
    debeDisminuir = true;
    motivo = 'Demasiados reintentos';
  }
  
  // Aumentar ancho (con histéresis): snr > umbral_superior + 5 y reintentos < 5%
  let debeAumentar = false;
  if (!debeDisminuir && reintentosMediana < 5) {
    if (actual.anchoMhz === 20 && snrMediana > 20) { // 15+5
      debeAumentar = true;
      motivo = 'SNR suficiente para aumentar a 40 MHz';
    } else if (actual.anchoMhz === 40 && snrMediana > 25) { // 20+5
      debeAumentar = true;
      motivo = 'SNR suficiente para aumentar a 80 MHz';
    }
  }
  
  // Aplicar cambio de ancho
  if (debeDisminuir && anchoActualIndex > 0) {
    nuevoAncho = límites.anchosMhz[anchoActualIndex - 1];
  } else if (debeAumentar && anchoActualIndex < límites.anchosMhz.length - 1) {
    nuevoAncho = límites.anchosMhz[anchoActualIndex + 1];
  }
  
  // Ajuste de potencia
   if (snrMediana < 15) {
     if (nuevaPotencia < límites.pireMaxDbm) {
       nuevaPotencia = Math.min(nuevaPotencia + 2, límites.pireMaxDbm);
       if (nuevaPotencia > actual.potenciaDbm) motivo += '; Potencia aumentada';
     } else {
       motivo += '; Potencia limitada al máximo legal';
     }
   } else if (snrMediana > 35) {
    nuevaPotencia = Math.max(nuevaPotencia - 2, 0);
    if (nuevaPotencia < actual.potenciaDbm) motivo += '; Potencia disminuida por interferencia';
  }
  
   // Límite máximo de potencia
   if (nuevaPotencia > límites.pireMaxDbm) {
     nuevaPotencia = límites.pireMaxDbm;
     motivo += '; Potencia limitada al máximo legal';
   }
  
  return {
    anchoMhz: nuevoAncho,
    potenciaDbm: nuevaPotencia,
    motivo: motivo.trim()
  };
}