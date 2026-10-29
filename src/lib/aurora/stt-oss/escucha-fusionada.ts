/**
 * ESCUCHA FUSIONADA — Ola 1015V · Voz fusionada de Astraura.
 * Corta el micrófono en tramos con el detector de energía de `oss-stt.ts`
 * (silencio 800 ms, tramo ≤ 30 s), pide al elector el motor «final» de cada
 * tramo y lo transcribe. El parcial real lo sigue dando el navegador; aquí solo
 * se limpia al cerrar el tramo. Todo es inyectable (audio y motores falsos en
 * pruebas) y ninguna función lanza: un tramo roto no tumba la escucha.
 */
import { MOTORES_OIDO, elegirOido, type MotorOidoId } from "./motores-oido";
import type { ResultadoTranscripcion } from "./oido-openai";

export interface BloqueAudio { muestras: Float32Array; frecuencia: number; }
export type TramoAudio = BloqueAudio;
export interface PeticionOido { motor: string; idioma: string; hotwords: string[]; }
export type ElegirOidoFn = typeof elegirOido;
export type TranscribirFn = (tramo: TramoAudio, peticion: PeticionOido) => Promise<ResultadoTranscripcion>;

export interface OpcionesEscuchaFusionada {
  /** Fuente de bloques del micrófono; termina al dejar de escuchar. */
  obtenerAudio: () => AsyncIterable<BloqueAudio> | Iterable<BloqueAudio>;
  elegir?: ElegirOidoFn;
  transcribir: TranscribirFn;
  /** Limpia el parcial del navegador al cerrar un tramo. */
  alParcial?: (texto: string) => void;
  alFinal: (texto: string, motor: string) => void;
  /** Idioma de la persona como PISTA, nunca como imposición. */
  idiomaPista?: string;
  hotwords?: string[];
  disponibles?: MotorOidoId[];
  medidas?: Record<string, number>;
}

/** Silencio (ms) que cierra un tramo, igual que el VAD de `oss-stt.ts`. */
export const SILENCIO_TRAMO_MS = 800;
/** Duración máxima (ms) de un tramo. */
export const TRAMO_MAX_MS = 30_000;

const SUELO_MIN = 0.004, SUELO_MAX = 0.08, MULT_VOZ = 2.4, MARGEN_VOZ = 0.006;
const SUELTA = 0.6, CALIBRACION = 10, VOZ_MIN_MS = 350, PREROLL_MS = 300;

function rms(muestras: Float32Array): number {
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
  return Math.sqrt(suma / (muestras.length || 1));
}

function juntar(trozos: Float32Array[]): Float32Array {
  const salida = new Float32Array(trozos.reduce((n, t) => n + t.length, 0));
  let pos = 0;
  for (const t of trozos) { salida.set(t, pos); pos += t.length; }
  return salida;
}

function proteger(fn: () => void): void {
  try { fn(); } catch { /* la interfaz nunca tumba la escucha */ }
}

/**
 * Escucha el micrófono por tramos y entrega cada final al mejor motor medido.
 * Devuelve cuando la fuente de audio termina. NUNCA lanza.
 */
export async function escucharFusionado(opciones: OpcionesEscuchaFusionada): Promise<void> {
  const elegir = opciones.elegir ?? elegirOido;
  const disponibles = opciones.disponibles ?? MOTORES_OIDO.map((m) => m.id);
  const hotwords = opciones.hotwords ?? [];
  const idioma = (opciones.idiomaPista || "").trim().toLowerCase().split(/[-_]/)[0];
  let hz = 16000, suelo = SUELO_MIN, calibrados = 0, sumaSuelo = 0;
  let hablando = false, inicio = 0, ultimaVoz = 0, ahora = 0;
  let trozos: Float32Array[] = [], preroll: Float32Array[] = [], prerollMs = 0;
  let cola: Promise<void> = Promise.resolve();

  const cerrar = () => {
    const tramo: TramoAudio = { muestras: juntar(trozos), frecuencia: hz };
    const durMs = hz > 0 ? (tramo.muestras.length / hz) * 1000 : 0;
    hablando = false;
    trozos = [];
    if (durMs < VOZ_MIN_MS) return;
    let motor = "navegador";
    try {
      motor = elegir({ idioma, disponibles, fase: "final", medidas: opciones.medidas }).motor;
    } catch {
      return;
    }
    cola = cola.then(async () => {
      try {
        const r = await opciones.transcribir(tramo, { motor, idioma, hotwords });
        const texto = r.ok ? r.texto.trim() : "";
        if (!texto) return;
        proteger(() => opciones.alParcial?.(""));
        proteger(() => opciones.alFinal(texto, motor));
      } catch { /* un tramo roto no tumba la escucha */ }
    });
  };

  const guardarPreroll = (muestras: Float32Array, durMs: number) => {
    preroll.push(muestras);
    prerollMs += durMs;
    while (preroll.length > 1 && prerollMs > PREROLL_MS) {
      const fuera = preroll.shift();
      prerollMs -= fuera ? (fuera.length / hz) * 1000 : 0;
    }
  };

  try {
    for await (const bloque of opciones.obtenerAudio()) {
      hz = bloque.frecuencia > 0 ? bloque.frecuencia : hz;
      const durMs = (bloque.muestras.length / hz) * 1000;
      ahora += durMs;
      const energia = rms(bloque.muestras);
      if (calibrados < CALIBRACION) {
        calibrados += 1;
        sumaSuelo += energia;
        if (calibrados === CALIBRACION) {
          suelo = Math.min(SUELO_MAX, Math.max(SUELO_MIN, sumaSuelo / CALIBRACION));
        }
        guardarPreroll(bloque.muestras, durMs);
        continue;
      }
      const umbral = Math.min(SUELO_MAX * MULT_VOZ, suelo * MULT_VOZ + MARGEN_VOZ);
      const esVoz = hablando ? energia >= umbral * SUELTA : energia >= umbral;
      if (esVoz) {
        if (!hablando) {
          hablando = true;
          inicio = ahora;
          trozos = [...preroll];
          preroll = [];
          prerollMs = 0;
        }
        ultimaVoz = ahora;
        trozos.push(bloque.muestras);
        if (ahora - inicio >= TRAMO_MAX_MS) cerrar();
      } else if (hablando) {
        trozos.push(bloque.muestras);
        if (ahora - ultimaVoz >= SILENCIO_TRAMO_MS) cerrar();
      } else {
        suelo = Math.min(SUELO_MAX, Math.max(SUELO_MIN, suelo * 0.995 + energia * 0.005));
        guardarPreroll(bloque.muestras, durMs);
      }
    }
  } catch { /* la fuente de audio puede morir: nunca se propaga */ }
  if (hablando) cerrar();
  await cola;
}
