/**
 * Interrupción por voz (Ola 1015V · `architecture/voz-fusionada-astraura.md` §4):
 * «Si la persona habla más de 250 ms mientras Astraura habla, Astraura calla al
 * instante».
 *
 * Dos piezas:
 *  1. Un detector PURO por energía con histéresis (`decidirInterrupcion`): las
 *     muestras del micro en dBFS, el estado y el umbral entran por parámetro;
 *     sin reloj propio (determinista, testeable con muestras sintéticas).
 *  2. Un montaje de navegador (`activarInterrupcionPorVoz`) que abre el micro
 *     con `echoCancellation` y `noiseSuppression` MIENTRAS Astraura habla y
 *     llama a `interrupt()` del motor. No puede cortarse con su propio eco:
 *     respeta `esEcoPropio`/`ventanaEcoMs` de `anti-bucle-voz.ts`.
 *
 * Regla de la capa: nada de esto lanza excepciones; si el micro no está
 * disponible, la interrupción por voz simplemente no llega y Aurora sigue
 * hablando igual (el toque en la orbe siempre queda).
 */

import { esEcoPropio, ventanaEcoMs } from "@/lib/aurora/anti-bucle-voz";

// ── Constantes del detector ─────────────────────────────────────────────────

/** Umbral de arranque por defecto, en dBFS (pico máximo). */
export const UMBRAL_DB_DEFECTO = -30;
/** Mínimo de habla seguida para interrumpir, en ms (contrato §4). */
export const MINIMO_MS_DEFECTO = 250;
/** Histéresis: para SOSTENER el tramo hace falta menos que para arrancar. */
export const HISTERESIS_DB = 6;
/** Piso para el silencio absoluto (amplitud cero). */
export const DB_SILENCIO = -100;

/** Estado del detector entre llamadas: entra por parámetro, sin reloj propio. */
export interface EstadoDetector {
  /** Instante (ms) donde empezó el tramo de voz, o null si calla. */
  registroMs: number | null;
  /** Ya disparó en este tramo: no repite sin silencio de por medio. */
  disparado: boolean;
  /** Instante actual en ms (el llamador lo trae). */
  ahora: number;
  /** Hasta este ms rige la ventana anti-eco: no se interrumpe. */
  guardiaHastaMs?: number;
}

// ── Detector puro ───────────────────────────────────────────────────────────

export interface OpcionesDetector {
  /** Umbral de ARRANQUE en dBFS (por defecto `UMBRAL_DB_DEFECTO`). */
  umbralDb?: number;
  /** Umbral para CONSIDERAR silencio (por defecto `umbralDb - HISTERESIS_DB`). */
  umbralCallaDb?: number;
  /** Mínimo de habla seguida en ms (por defecto 250). */
  minimoMs?: number;
}

export interface VeredictoDetector {
  /** Confirmar la interrupción: la persona lleva ≥ minimoMs hablando. */
  interrumpir: boolean;
  /** Energía usada para decidir, en dBFS (útil para medidas y depuración). */
  energiaDb: number;
  /** Estado nuevo para la llamada siguiente (el llamador debe conservarlo). */
  estado: EstadoDetector;
}

/** Amplitud pico → dBFS. Silencio absoluto = `DB_SILENCIO`. */
export function dbDesdeMuestras(muestras: number[]): number {
  let maximo = 0;
  for (const m of muestras) {
    const a = Math.abs(m);
    if (a > maximo) maximo = a;
  }
  if (maximo <= 0 || !Number.isFinite(maximo)) return DB_SILENCIO;
  return Math.max(DB_SILENCIO, 20 * Math.log10(maximo));
}

/** Umbral para callar: histéresis bajo el de arranque. */
export function umbralDeCalla(umbralDb: number): number {
  return umbralDb - HISTERESIS_DB;
}

/**
 * Decide si hay que interrumpir a Astraura. Histéresis en tres bandas:
 *  · por ENCIMA del umbral: arranca (o mantiene) el registro;
 *  · en la zona ENTRE el de arranque y el de callar: sostiene el registro sin
 *    reabrirlo (una pausa breve de la persona no rompe el tramo);
 *  · por DEBAJO del de callar: se cae el registro.
 * Dispara UNA vez sin tramo; repetir exige silencio primero.
 */
export function decidirInterrupcion(
  muestras: number[],
  estado: EstadoDetector,
  opciones: OpcionesDetector = {},
): VeredictoDetector {
  const energiaDb = dbDesdeMuestras(muestras);
  const umbralArranque = opciones.umbralDb ?? UMBRAL_DB_DEFECTO;
  const umbralSuelo = opciones.umbralCallaDb ?? umbralDeCalla(umbralArranque);
  const minimoMs = opciones.minimoMs ?? MINIMO_MS_DEFECTO;
  const base: EstadoDetector = {
    registroMs: estado.registroMs,
    disparado: estado.disparado,
    ahora: estado.ahora,
    guardiaHastaMs: estado.guardiaHastaMs,
  };
  // Ventana de eco propio (arranque del TTS o eco anotado): no se interrumpe.
  if (base.guardiaHastaMs !== undefined && base.ahora < base.guardiaHastaMs) {
    return { interrumpir: false, energiaDb, estado: { ...base, registroMs: null, disparado: false } };
  }
  let registroMs = base.registroMs;
  let disparado = base.disparado;
  let interrumpir = false;
  if (energiaDb >= umbralArranque) {
    if (registroMs === null) registroMs = base.ahora;
    if (!disparado && base.ahora - registroMs >= minimoMs) {
      interrumpir = true;
      disparado = true;
    }
  } else if (energiaDb < umbralSuelo) {
    registroMs = null;
    disparado = false;
  }
  return {
    interrumpir,
    energiaDb,
    estado: { registroMs, disparado, ahora: base.ahora, guardiaHastaMs: base.guardiaHastaMs },
  };
}

/** Ventana anti-eco desde un instante: `ventanaEcoMs` de anti-bucle-voz. */
export function guardiaEcoDesde(opciones: { movil?: boolean; latenciaSalidaMs?: number }, ahora: number): number {
  return ahora + ventanaEcoMs({ movil: opciones.movil ?? false, latenciaSalidaMs: opciones.latenciaSalidaMs });
}

// ── Montaje de navegador (export) ───────────────────────────────────────────

/** Intervalo entre lecturas de energía del analizador. */
const SONDEO_MS = 50;

export interface OpcionesMontaje {
  /** Umbral del detector en dBFS (por defecto el del detector). */
  umbralDb?: number;
  /** ¿Dispositivo móvil? Alarga la ventana anti-eco (`ventanaEcoMs`). */
  movil?: boolean;
  /** Latencia de salida medida, si se conoce. */
  latenciaSalidaMs?: number;
  /** Canal de captura inyectable; por defecto `getUserMedia` del navegador. */
  pedirMicro?: (restriccion: MediaStreamConstraints) => Promise<MediaStream>;
  /** Qué hacer al confirmar la interrupción: `interrupt()` del motor. */
  alInterrumpir: () => void;
  /** ¿El texto entrante es eco de la propia voz? Por defecto `esEcoPropio`. */
  esEco?: (texto: string, ahora: number) => boolean;
}

export interface MontajeInterrupcion {
  /** Deja de oír: cierra pista, contexto y bucle. Nunca lanza. */
  soltar: () => Promise<void>;
  /**
   * Si el reconocimiento en curso trae TEXTO y es la propia voz de Astraura
   * (`esEcoPropio`), renueva la ventana anti-eco y calma el registro.
   */
  anotarEco: (texto: string) => void;
}

const MONTAJE_VACIO: MontajeInterrupcion = {
  soltar: async () => {},
  anotarEco: () => {},
};

/**
 * Abre el micro SOLO mientras Astraura habla y decide con el detector puro.
 * Devuelve un montaje que nunca lanza (regla de la capa: Aurora SIEMPRE habla).
 */
export async function activarInterrupcionPorVoz(opciones: OpcionesMontaje): Promise<MontajeInterrupcion> {
  try {
    return await montar(opciones);
  } catch {
    return MONTAJE_VACIO;
  }
}

async function montar(opciones: OpcionesMontaje): Promise<MontajeInterrupcion> {
  if (typeof window === "undefined") return MONTAJE_VACIO;
  const pedir = opciones.pedirMicro ?? ((r) => navigator.mediaDevices.getUserMedia(r));
  const pista = await pedir({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  } as MediaStreamConstraints);
  const ctx = new AudioContext();
  const fuente = ctx.createMediaStreamSource(pista);
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 1024;
  fuente.connect(analizador);
  const buf = new Float32Array(analizador.fftSize);
  // Ventana anti-eco de ARRANQUE: mientras el AEC se asienta y la salida
  // empieza a sonar, la energía entrante es eco propio y NO interrumpe.
  let guardiaHasta = guardiaEcoDesde(opciones, Date.now());
  let estado: EstadoDetector = { registroMs: null, disparado: false, ahora: Date.now(), guardiaHastaMs: guardiaHasta };
  let vivo = true;
  let temporizador: ReturnType<typeof setTimeout> | null = null;

  const bucle = () => {
    if (!vivo) return;
    try {
      analizador.getFloatTimeDomainData(buf);
      estado = { ...estado, ahora: Date.now(), guardiaHastaMs: guardiaHasta };
      const veredicto = decidirInterrupcion(Array.from(buf), estado, { umbralDb: opciones.umbralDb });
      estado = veredicto.estado;
      if (veredicto.interrumpir) {
        try { opciones.alInterrumpir(); } catch { /* Aurora SIEMPRE habla: la interrupción es un extra */ }
      }
    } catch { /* una trama perdida no deja a Aurora sorda */ }
    temporizador = setTimeout(bucle, SONDEO_MS);
  };

  const soltar = async () => {
    vivo = false;
    if (temporizador !== null) { clearTimeout(temporizador); temporizador = null; }
    try { fuente.disconnect(); } catch { /* */ }
    try { analizador.disconnect(); } catch { /* */ }
    try { void ctx.close(); } catch { /* */ }
    try { pista.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  };

  const anotarEco = (texto: string) => {
    const ahora = Date.now();
    let esEcoActual = false;
    try { esEcoActual = (opciones.esEco ?? ((t, a) => esEcoPropio(t, a)))(texto, ahora); } catch { /* */ }
    if (!esEcoActual) return;
    // Es la propia voz de Astraura: renueva la ventana anti-eco y calma el tramo.
    guardiaHasta = guardiaEcoDesde(opciones, ahora);
    estado = { registroMs: null, disparado: false, ahora, guardiaHastaMs: guardiaHasta };
  };

  bucle();
  return { soltar, anotarEco };
}
