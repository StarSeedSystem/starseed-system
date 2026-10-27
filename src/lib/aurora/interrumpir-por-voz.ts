/**
 * Detector de interrupción por voz — energía con histéresis.
 * Puro: sin DOM, sin reloj propio, sin red. Todo entra por parámetros.
 */

export interface EstadoInterrupcion {
  enSilencio: boolean;
  tiempoActivoMs: number;
}

export interface OpcionesDetector {
  umbralDb: number;
  minimoMs?: number;
}

export interface MuestrasAudio {
  db: number;
  ms: number;
}

function energiaPromedio(muestras: number[], msBase: number): number {
  if (muestras.length === 0) return -Infinity;
  return muestras.reduce((a, b) => a + b, 0) / muestras.length;
}

export function decidirInterrupcion(
  muestras: MuestrasAudio[],
  estado: EstadoInterrupcion,
  opciones: OpcionesDetector,
): { interrumpir: boolean; estado: EstadoInterrupcion } {
  const { umbralDb, minimoMs = 250 } = opciones;
  const { enSilencio, tiempoActivoMs } = estado;
  const ahora = muestras.length > 0 ? muestras[muestras.length - 1].ms : 0;

  if (muestras.length === 0) {
    return { interrumpir: false, estado: { enSilencio: true, tiempoActivoMs: 0 } };
  }

  const ultimaMuestra = muestras[muestras.length - 1];
  const energia = ultimaMuestra.db;
  const porEncima = energia > umbralDb;

  if (porEncima) {
    const anterior = muestras.length > 1 ? muestras[muestras.length - 2].ms : ahora;
    const delta = ahora - anterior;
    const tiempoAcumulado = enSilencio ? 0 : tiempoActivoMs;
    const nuevaDuracion = tiempoAcumulado + delta;
    const nuevoEstado: EstadoInterrupcion = {
      enSilencio: false,
      tiempoActivoMs: nuevaDuracion,
    };
    return {
      interrumpir: nuevoEstado.tiempoActivoMs >= minimoMs,
      estado: nuevoEstado,
    };
  } else {
    return { interrumpir: false, estado: { enSilencio: true, tiempoActivoMs: 0 } };
  }
}

export function crearDetectorInterrupcion(opciones: OpcionesDetector) {
  let estado: EstadoInterrupcion = { enSilencio: true, tiempoActivoMs: 0 };
  let historial: MuestrasAudio[] = [];
  let ultimaMs = 0;

  return {
    actualizar: (db: number, ms: number) => {
      ultimaMs = ms;
      historial.push({ db, ms });
      historial = historial.filter((m) => ms - m.ms <= 1000);
      const resultado = decidirInterrupcion(historial, estado, opciones);
      estado = resultado.estado;
      return resultado.interrumpir;
    },
    reset: () => {
      estado = { enSilencio: true, tiempoActivoMs: 0 };
      historial = [];
      ultimaMs = 0;
    },
    estado: () => ({ ...estado }),
  };
}
