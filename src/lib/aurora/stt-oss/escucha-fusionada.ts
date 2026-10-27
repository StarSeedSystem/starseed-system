"use client";

/**
 * ESCUCHA FUSIONADA — Aurora escucha por tramos y el elector decide el motor.
 * Contrato: `architecture/voz-fusionada-astraura.md` §3 y §4.
 *
 * El navegador sigue siendo el suelo y quien da parciales inmediatos cuando
 * está. Este camino es el FINAL: corta el audio del micrófono con el mismo
 * detector de energía de `oss-stt.ts` (silencio 800 ms, tramo ≤ 30 s), pide a
 * `elegirOido` el motor de la fase «final» para cada tramo y lo transcribe con
 * `transcribirOpenAI` o con el demonio local. Nada lanza: un motor roto deja
 * el tramo sin texto, nunca tumba la escucha.
 *
 * Todo es inyectable (audio, elector, transcriptor, reloj) para probar el
 * camino completo con audio y motores falsos, sin red, micrófono ni procesos.
 */

import {
  MOTORES_OIDO,
  elegirOido,
  type MotorOidoId,
  type OpcionesEleccionOido,
  type ResultadoOido,
} from "./motores-oido";
import { transcribirOpenAI, urlOidoLocal, type ResultadoTranscripcion } from "./oido-openai";
import { transcribirLocal } from "./vibeasr-local";

/** Silencio que cierra un tramo (ms). Mismo valor que `oss-stt.ts`. */
export const SILENCIO_MS = 800;
/** Duración máxima de un tramo (ms): se cierra aunque no haya silencio. */
export const TRAMO_MAX_MS = 30000;
/** Voz mínima (ms) para molestarse en transcribir un tramo. */
export const VOZ_MIN_MS = 350;
/** Pre-roll (ms) que se conserva antes de detectar voz (no corta la 1.ª sílaba). */
export const PREROLL_MS = 300;
/** Bloques de calibración inicial del suelo de ruido. */
export const BLOQUES_CALIBRACION = 10;
/** Suelo de ruido mínimo y máximo asumidos (RMS). */
export const SUELO_RUIDO_MIN = 0.004;
export const SUELO_RUIDO_MAX = 0.08;
/** Cuánto por encima del suelo tiene que estar el RMS para ser voz. */
export const MULT_VOZ = 2.4;
/** Margen absoluto extra sobre el suelo. */
export const MARGEN_VOZ = 0.006;
/** Histéresis: para seguir hablando basta con ~60 % del umbral de inicio. */
export const LIBERACION_VOZ = 0.6;
/** Suavizado exponencial del suelo de ruido durante el silencio. */
export const SUAVIZADO_RUIDO = 0.995;

/** Un tramo de audio listo para transcribir. */
export interface TramoAudio {
  /** PCM mono en coma flotante (−1…1) a `sampleRate`. */
  pcm: Float32Array;
  /** Tasa de muestreo del PCM. */
  sampleRate: number;
  /** Duración real del tramo, en milisegundos. */
  duracionMs: number;
  /** Por qué se cerró el tramo (informativo, para medidas y pruebas). */
  motivo: "silencio" | "maximo" | "cierre";
}

/** Respuesta tolerante de un transcriptor inyectado. */
export type RespuestaTranscripcion =
  | ResultadoTranscripcion
  | { ok: true; texto: string; idioma?: string; motor?: string; ms?: number }
  | string
  | null;

/** Firma del transcriptor inyectable: tramo + motor + idioma + palabras propias. */
export type TranscribirTramo = (
  tramo: TramoAudio,
  motor: string,
  idioma: string,
  hotwords: string[],
) => Promise<RespuestaTranscripcion> | RespuestaTranscripcion;

/** Opciones del elector inyectable (por defecto `elegirOido`). */
export type ElegirMotor = (opciones: OpcionesEleccionOido) => ResultadoOido;

/** Opciones de `escucharFusionado`. */
export interface OpcionesEscuchaFusionada {
  /** Bloques de audio del micrófono (mono, Float32); puede ser un flujo async. */
  obtenerAudio: () => AsyncIterable<Float32Array> | Iterable<Float32Array>;
  /** Elector de motor; por defecto, `elegirOido`. */
  elegir?: ElegirMotor;
  /** Transcriptor; por defecto, `transcribirOpenAI` o el demonio local. */
  transcribir?: TranscribirTramo;
  /** Aviso de voz oída (NO texto parcial: el parcial real lo da el navegador). */
  alParcial?: (texto: string) => void;
  /** Texto final de cada tramo, con el motor que lo oyó. */
  alFinal: (texto: string, info: { motor: string; idioma: string; duracionMs: number; ms?: number }) => void;
  /** Idioma de la persona como pista, nunca como imposición. */
  idiomaPista?: string;
  /** Palabras propias que se enseñan al motor. */
  hotwords?: string[];
  /** Motores que esta neurona tiene disponibles (por defecto, todos). */
  disponibles?: MotorOidoId[];
  /** Latencia medida por motor (menor = mejor). */
  medidas?: Record<string, number>;
  /** Tasa de muestreo de los bloques (por defecto 16000). */
  sampleRate?: number;
  /** Reloj inyectable para el aviso de voz (por defecto, `Date.now`). */
  ahora?: () => number;
  /** Señal para detener la escucha entre bloques. */
  señal?: AbortSignal;
}

type MotivoTramo = TramoAudio["motivo"];

/** Energía RMS de un bloque (0 si está vacío). Pura. */
export function energiaRms(bloque: Float32Array): number {
  if (bloque.length === 0) return 0;
  let suma = 0;
  for (let i = 0; i < bloque.length; i++) {
    const s = bloque[i];
    suma += s * s;
  }
  return Math.sqrt(suma / bloque.length);
}

/** Umbral de INICIO de voz derivado del suelo de ruido actual. Pura. */
export function umbralVoz(suelo: number): number {
  return Math.min(SUELO_RUIDO_MAX * MULT_VOZ, suelo * MULT_VOZ + MARGEN_VOZ);
}

/** Opciones del segmentador por energía. */
export interface OpcionesSegmentador {
  sampleRate?: number;
  silencioMs?: number;
  tramoMaxMs?: number;
  vozMinMs?: number;
  prerollMs?: number;
  bloquesCalibracion?: number;
}

/** Segmentador incremental: entra audio, salen tramos cerrados. */
export interface SegmentadorEnergia {
  /** Añade un bloque y devuelve los tramos que se cerraron con él (0 o 1). */
  anadir: (bloque: Float32Array) => TramoAudio[];
  /** Cierra el tramo en curso (si lo hay) al terminar la escucha. */
  cerrar: () => TramoAudio | null;
  /** ¿Hay voz acumulándose ahora mismo? */
  estaHablando: () => boolean;
}

function concatenar(chunks: Float32Array[], total: number): Float32Array {
  const pcm = new Float32Array(total);
  let pos = 0;
  for (const c of chunks) {
    pcm.set(c, pos);
    pos += c.length;
  }
  return pcm;
}

/**
 * Crea el detector por energía con la MISMA fórmula que `oss-stt.ts`: calibra
 * el suelo de ruido al arrancar, sube el umbral por encima de él y usa
 * histéresis para no cortar las frases. Puro y determinista (sin relojes).
 */
export function crearSegmentadorEnergia(opciones: OpcionesSegmentador = {}): SegmentadorEnergia {
  const sampleRate = opciones.sampleRate && opciones.sampleRate > 0 ? opciones.sampleRate : 16000;
  const silencioMs = opciones.silencioMs ?? SILENCIO_MS;
  const tramoMaxMs = opciones.tramoMaxMs ?? TRAMO_MAX_MS;
  const vozMinMs = opciones.vozMinMs ?? VOZ_MIN_MS;
  const prerollMs = opciones.prerollMs ?? PREROLL_MS;
  const bloquesCalibracion = Math.max(0, opciones.bloquesCalibracion ?? BLOQUES_CALIBRACION);

  const silencioMuestras = (silencioMs / 1000) * sampleRate;
  const tramoMaxMuestras = (tramoMaxMs / 1000) * sampleRate;
  const prerollMaxMuestras = Math.max(1, Math.ceil((prerollMs / 1000) * sampleRate));

  let suelo = SUELO_RUIDO_MIN;
  let calibracionRestante = bloquesCalibracion;
  let calibracionSuma = 0;
  let hablando = false;
  let chunks: Float32Array[] = [];
  let totalMuestras = 0;
  let silencioAcumulado = 0;
  let preroll: Float32Array[] = [];
  let prerollMuestras = 0;

  const guardarPreroll = (bloque: Float32Array) => {
    if (prerollMs <= 0) return;
    preroll.push(bloque);
    prerollMuestras += bloque.length;
    while (prerollMuestras > prerollMaxMuestras && preroll.length > 1) {
      const fuera = preroll.shift();
      if (fuera) prerollMuestras -= fuera.length;
    }
  };

  const resetSegmento = () => {
    chunks = [];
    totalMuestras = 0;
    silencioAcumulado = 0;
    hablando = false;
  };

  const cerrarTramo = (motivo: MotivoTramo): TramoAudio | null => {
    if (totalMuestras === 0) return null;
    const duracionMs = (totalMuestras / sampleRate) * 1000;
    const pcm = concatenar(chunks, totalMuestras);
    resetSegmento();
    if (duracionMs < vozMinMs) return null;
    return { pcm, sampleRate, duracionMs, motivo };
  };

  const anadir = (bloque: Float32Array): TramoAudio[] => {
    if (bloque.length === 0) return [];
    const rms = energiaRms(bloque);

    if (calibracionRestante > 0) {
      calibracionSuma += rms;
      calibracionRestante -= 1;
      if (calibracionRestante === 0) {
        const media = calibracionSuma / bloquesCalibracion;
        suelo = Math.min(SUELO_RUIDO_MAX, Math.max(SUELO_RUIDO_MIN, media));
      }
      guardarPreroll(bloque);
      return [];
    }

    const inicio = umbralVoz(suelo);
    const seguir = inicio * LIBERACION_VOZ;
    const esVoz = hablando ? rms >= seguir : rms >= inicio;

    if (esVoz) {
      if (!hablando) {
        hablando = true;
        for (const b of preroll) {
          chunks.push(b);
          totalMuestras += b.length;
        }
        preroll = [];
        prerollMuestras = 0;
        silencioAcumulado = 0;
      }
      chunks.push(bloque);
      totalMuestras += bloque.length;
      silencioAcumulado = 0;
      if (totalMuestras >= tramoMaxMuestras) {
        const tramo = cerrarTramo("maximo");
        return tramo ? [tramo] : [];
      }
      return [];
    }

    if (hablando) {
      chunks.push(bloque);
      totalMuestras += bloque.length;
      silencioAcumulado += bloque.length;
      if (silencioAcumulado >= silencioMuestras) {
        const tramo = cerrarTramo("silencio");
        return tramo ? [tramo] : [];
      }
      return [];
    }

    suelo = SUAVIZADO_RUIDO * suelo + (1 - SUAVIZADO_RUIDO) * rms;
    if (suelo < SUELO_RUIDO_MIN) suelo = SUELO_RUIDO_MIN;
    if (suelo > SUELO_RUIDO_MAX) suelo = SUELO_RUIDO_MAX;
    guardarPreroll(bloque);
    return [];
  };

  return {
    anadir,
    cerrar: () => (hablando ? cerrarTramo("cierre") : null),
    estaHablando: () => hablando,
  };
}

/** Convierte PCM Float32 mono a un WAV PCM16 (lo que esperan los oídos HTTP). */
export function wavDesdePcm(pcm: Float32Array, sampleRate: number): Blob {
  const muestras = pcm.length;
  const buffer = new ArrayBuffer(44 + muestras * 2);
  const vista = new DataView(buffer);
  const texto = (pos: number, valor: string) => {
    for (let i = 0; i < valor.length; i++) vista.setUint8(pos + i, valor.charCodeAt(i));
  };
  const ritmo = sampleRate > 0 ? sampleRate : 16000;
  texto(0, "RIFF");
  vista.setUint32(4, 36 + muestras * 2, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);
  vista.setUint16(22, 1, true);
  vista.setUint32(24, ritmo, true);
  vista.setUint32(28, ritmo * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  texto(36, "data");
  vista.setUint32(40, muestras * 2, true);
  for (let i = 0; i < muestras; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    vista.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Transcriptor por defecto: el demonio local para el oído 1.58 y el cliente
 * OpenAI-compatible para Phonon-2, Parakeet y los demás endpoints.
 */
export async function transcribirTramoPredeterminado(
  tramo: TramoAudio,
  motor: string,
  idioma: string,
  hotwords: string[],
): Promise<ResultadoTranscripcion> {
  try {
    const audio = wavDesdePcm(tramo.pcm, tramo.sampleRate);
    if (motor === "vibeasr-158") {
      const r = await transcribirLocal(audio);
      return {
        ok: true,
        texto: r.texto,
        idioma,
        motor: r.motor || motor,
        ms: Math.max(0, Math.round((r.segundos || 0) * 1000)),
      };
    }
    return await transcribirOpenAI(audio, {
      base: urlOidoLocal(motor),
      modelo: motor,
      idioma,
      hotwords,
    });
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "Error de red" };
  }
}

/** Normaliza el idioma a dos letras («es-MX» → «es»); vacío → español. */
export function normalizarIdioma(pista: string | undefined): string {
  const limpio = (pista || "").trim().toLowerCase().split(/[-_]/)[0];
  return limpio || "es";
}

/** Extrae el texto de una respuesta tolerante; null si no hay nada que decir. */
function textoTranscrito(respuesta: RespuestaTranscripcion): string | null {
  if (typeof respuesta === "string") return respuesta.trim() || null;
  if (!respuesta || typeof respuesta !== "object") return null;
  if (respuesta.ok === false) return null;
  if (typeof respuesta.texto !== "string") return null;
  return respuesta.texto.trim() || null;
}

const IDIOMA_HABLA = 400;

/**
 * Escucha fusionada: consume el audio del micrófono, lo corta por energía y
 * transcribe cada tramo con el motor FINAL que elija el elector. Nunca lanza.
 */
export async function escucharFusionado(opciones: OpcionesEscuchaFusionada): Promise<void> {
  const {
    obtenerAudio,
    elegir = elegirOido,
    transcribir = transcribirTramoPredeterminado,
    alParcial,
    alFinal,
    idiomaPista,
    hotwords = [],
    disponibles = MOTORES_OIDO.map((m) => m.id),
    medidas = {},
    sampleRate = 16000,
    ahora = () => Date.now(),
    señal,
  } = opciones;

  const idioma = normalizarIdioma(idiomaPista);
  const segmentador = crearSegmentadorEnergia({ sampleRate });
  let ultimoAviso = -IDIOMA_HABLA;

  const avisarVoz = () => {
    if (!alParcial || !segmentador.estaHablando()) return;
    const t = ahora();
    if (t - ultimoAviso < IDIOMA_HABLA) return;
    ultimoAviso = t;
    try {
      alParcial("…");
    } catch {
      /* el consumidor puede fallar; la escucha no */
    }
  };

  const procesarTramo = async (tramo: TramoAudio) => {
    try {
      const eleccion = elegir({ idioma, disponibles, medidas, fase: "final" });
      const motor = eleccion?.motor || "navegador";
      if (motor === "navegador") return; // el navegador no transcribe aquí
      const respuesta = await transcribir(tramo, motor, idioma, hotwords);
      const texto = textoTranscrito(respuesta);
      if (!texto) return;
      const idiomaFinal =
        respuesta && typeof respuesta === "object" && "idioma" in respuesta && typeof respuesta.idioma === "string"
          ? respuesta.idioma
          : idioma;
      const ms =
        respuesta && typeof respuesta === "object" && "ms" in respuesta && typeof respuesta.ms === "number"
          ? respuesta.ms
          : undefined;
      try {
        alFinal(texto, { motor, idioma: idiomaFinal, duracionMs: tramo.duracionMs, ms });
      } catch {
        /* igual que arriba: el fallo es de quien escucha, no del oído */
      }
    } catch {
      /* un tramo roto no detiene los siguientes */
    }
  };

  try {
    for await (const bloque of obtenerAudio()) {
      if (señal?.aborted) break;
      if (!(bloque instanceof Float32Array)) continue;
      const tramos = segmentador.anadir(bloque);
      avisarVoz();
      for (const tramo of tramos) {
        if (señal?.aborted) break;
        await procesarTramo(tramo);
      }
    }
    if (!señal?.aborted) {
      const ultimo = segmentador.cerrar();
      if (ultimo) await procesarTramo(ultimo);
    }
  } catch {
    /* la escucha termina en silencio; nunca se propaga a la interfaz */
  }
}
