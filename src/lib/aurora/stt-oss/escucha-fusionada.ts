/**
 * ESCUCHA FUSIONADA — Aurora escucha por el elector (Ola 1015V · tarea G).
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato: architecture/voz-fusionada-astraura.md (§3, reglas del oído).
 * El texto PARCIAL no lo produce nunca un tramo (regla 1 del §3): si lo hay,
 * es del motor más rápido que ya está escuchando (navegador, flujo Phonon).
 * Aquí el audio del micrófono se corta en TRAMOS con el detector de energía de
 * `oss-stt.ts` (silencio 800 ms, tramo ≤ 30 s, histéresis 0,6), se pide al
 * elector el motor de la fase «final» por tramo y se transcribe con lo que el
 * llamante inyecte (`transcribirOpenAI` sobre un servidor Whisper-compatible
 * o `transcribirLocal` contra el demonio VibeASR). Regla del área: nada de esta
 * capa lanza; los fallos van por `onError` y la escucha sigue.
 */

import type { OpcionesEleccionOido, ResultadoOido } from "./motores-oido";

/** Parámetros del detector, espejo de las constantes del VAD de `oss-stt.ts`. */
export interface OpcionesDetectorTramos {
  /** RMS por encima del cual hay voz (por defecto 0,012). */
  umbralRms?: number;
  /** Para SEGUIR en voz basta superar umbral × histeresis (0,6 en `oss-stt.ts`). */
  histeresis?: number;
  /** Silencio que cierra el tramo (VAD_SILENCE_MS = 800). */
  silencioMs?: number;
  /** Tramo máximo (VAD_MAX_SEGMENT_MS = 30 s). */
  tramoMaxMs?: number;
  /** Mínimo de audio con voz para molestar a un motor (VAD_MIN_SPEECH_MS = 350). */
  vozMinimaMs?: number;
}

/** Fragmento del micrófono que entrega `obtenerAudio` (conSUMO tirando, como el VAD por bloques). */
export interface FragmentoAudio {
  /** Muestras PCM Float32 mono. */
  muestras: Float32Array;
  /** Frecuencia de muestreo del fragmento, en Hz. */
  tasa: number;
}

/** Tramo cerrado con voz, listo para transcribir. */
export interface TramoAudio {
  muestras: Float32Array;
  tasa: number;
  duracionMs: number;
}

/** RMS de un fragmento (misma media cuadrática que usa el VAD de `oss-stt.ts`). */
export function rmsDe(muestras: Float32Array): number {
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) {
    const s = muestras[i];
    suma += s * s;
  }
  return Math.sqrt(suma / (muestras.length || 1));
}

/** API del detector por tramos. Puro: nada de reloj, red, disco ni DOM. */
export interface DetectorTramos {
  /** Da un fragmento y, si se CIERRA un tramo, lo devuelve (null en otro caso). */
  encolar: (f: FragmentoAudio) => TramoAudio | null;
  /** Cierra lo que quedara (se acabó el audio). Ignora tramos por debajo del mínimo. */
  cerrar: () => TramoAudio | null;
  /** ¿Hay voz en el tramo en formación? */
  hayVoz: () => boolean;
}

/** Crea el detector de energía que corta el audio en tramos (parámetros de `oss-stt.ts`). */
export function crearDetectorTramos(opciones: OpcionesDetectorTramos = {}): DetectorTramos {
  const umbral = opciones.umbralRms ?? 0.012;
  const liberacion = opciones.histeresis ?? 0.6; // VAD_RELEASE_RATIO de `oss-stt.ts`
  const silencio = opciones.silencioMs ?? 800;
  const tramoMax = opciones.tramoMaxMs ?? 30_000;
  const vozMinima = opciones.vozMinimaMs ?? 350;
  let trozos: Float32Array[] = [];
  let longitud = 0;
  let tasa = 16_000;
  let hablando = false;
  let silencioTramoMs = 0;

  const fusionar = (): TramoAudio => {
    const muestras = new Float32Array(longitud);
    let offset = 0;
    for (const t of trozos) {
      muestras.set(t, offset);
      offset += t.length;
    }
    const tramo: TramoAudio = { muestras, tasa, duracionMs: (longitud / (tasa || 16_000)) * 1000 };
    trozos = [];
    longitud = 0;
    hablando = false;
    silencioTramoMs = 0;
    return tramo;
  };

  return {
    hayVoz: () => hablando,
    cerrar: () => {
      if (longitud === 0) return null;
      const tramo = fusionar();
      return tramo.duracionMs >= vozMinima ? tramo : null;
    },
    encolar: (f) => {
      if (!f || !f.muestras || f.muestras.length === 0) return null;
      if (f.tasa) tasa = f.tasa;
      const energia = rmsDe(f.muestras);
      if (!(hablando ? energia >= umbral * liberacion : energia >= umbral)) {
        if (!hablando) return null; // silencio sin tramo abierto: no se guarda
        // Cola del cierre: el silencio también viaja (así cierra la frase).
        trozos.push(new Float32Array(f.muestras));
        longitud += f.muestras.length;
        silencioTramoMs += (f.muestras.length / (tasa || 16_000)) * 1000;
        if (silencioTramoMs >= silencio) {
          const tramo = fusionar();
          return tramo.duracionMs >= vozMinima ? tramo : null;
        }
        return null;
      }
      if (!hablando) {
        hablando = true;
        silencioTramoMs = 0;
      }
      trozos.push(new Float32Array(f.muestras));
      longitud += f.muestras.length;
      // Tramo demasiado largo: se cierra aunque siga hablando (30 s).
      if (((longitud / (tasa || 16_000)) * 1000) >= tramoMax) return fusionar();
      return null;
    },
  };
}

/** Divide una lista completa de fragmentos en tramos (ayuda para fichas y pruebas). */
export function dividirEnTramos(
  fragmentos: FragmentoAudio[],
  opciones?: OpcionesDetectorTramos,
): TramoAudio[] {
  const detector = crearDetectorTramos(opciones);
  const tramos: TramoAudio[] = [];
  for (const f of fragmentos) {
    const tramo = detector.encolar(f);
    if (tramo) tramos.push(tramo);
  }
  const ultimo = detector.cerrar();
  if (ultimo) tramos.push(ultimo);
  return tramos;
}

/** WAV PCM16 mono (cabecera RIFF de 44 bytes) a partir de las muestras de un tramo. */
export function blobWavDe(muestras: Float32Array, tasa: number): Blob {
  const pcm = new Int16Array(muestras.length);
  for (let i = 0; i < muestras.length; i++) {
    const s = Math.max(-1, Math.min(1, muestras[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const cabecera = new ArrayBuffer(44);
  const v = new DataView(cabecera);
  const texto = (desde: number, t: string) => {
    for (let i = 0; i < t.length; i++) v.setUint8(desde + i, t.charCodeAt(i));
  };
  texto(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  v.setUint32(16, 16, true); // tamaño del trozo fmt
  v.setUint16(20, 1, true); // PCM sin compresión
  v.setUint16(22, 1, true); // un canal (mono)
  v.setUint32(24, tasa, true);
  v.setUint32(28, tasa * 2, true); // tasa de bytes (PCM16 mono)
  v.setUint16(32, 2, true); // alineación de bloque
  v.setUint16(34, 16, true); // bits por muestra
  texto(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  return new Blob([cabecera, pcm.buffer], { type: "audio/wav" });
}

/** Resultado de la transcripción inyectada (nunca lanza: ok + texto/motivo). */
export interface SalidaTranscripcion {
  ok: boolean;
  texto?: string;
  motivo?: string;
}

export interface OpcionesEscuchaFusionada {
  /** Da el SIGUIENTE fragmento del micrófono; null = se acabó (cierre limpio). */
  obtenerAudio: () => Promise<FragmentoAudio | null>;
  /** El elector (`elegirOido`); este módulo solo aporta idioma y fase «final». */
  elegir: (opciones: OpcionesEleccionOido) => ResultadoOido;
  /** Transcribe un tramo: `transcribirOpenAI`, el demonio (`/asr`)… inyectable. */
  transcribir: (
    audio: Blob,
    motor: string,
    opciones: { idioma?: string; hotwords: string[] },
  ) => Promise<SalidaTranscripcion>;
  /** Señal «te oigo» del tramo en curso. Nunca texto parcial (regla 1 del §3). */
  alParcial?: (texto: string) => void;
  /** Texto FINAL del tramo y el motor que lo escribió. */
  alFinal?: (texto: string, motor: string) => void;
  onError?: (motivo: string) => void;
  /** Pista de idioma del AUDIO para el elector (nunca imposición, regla 2). */
  idiomaPista?: string;
  /** Palabras propias («Astraura», «StarSeed»…): se enseñan al motor (regla 3). */
  hotwords?: string[];
  /** Ajustes del detector (por defecto: silencio 800 ms, tramo ≤ 30 s). */
  detector?: OpcionesDetectorTramos;
}

export interface EscuchaFusionada {
  /** ¿Sigue consumiendo fragmentos? */
  activa: () => boolean;
  /** Deja de consumir; el tramo en formación se pierde (micro soltado). Idempotente. */
  detener: () => void;
}
