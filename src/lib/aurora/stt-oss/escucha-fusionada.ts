/**
 * StarSeed OS — Escucha FUSIONADA por tramos (Ola 1015V · tarea G).
 * Contrato: architecture/voz-fusionada-astraura.md (§3 reglas 1, 2 y 3; §4).
 * Corta el micrófono en TRAMOS con el detector de energía de `oss-stt.ts`
 * (silencio ~800 ms, tramo ≤ 30 s, pre-roll 300 ms, suelo de ruido adaptativo),
 * pide a `elegirOido` el motor de la fase «final» POR TRAMO y transcribe con
 * un transcriptor inyectable (`transcribirOpenAI` o el demonio, en el engine).
 * El parcial lo sigue dando el navegador cuando existe (§3); aquí solo
 * emite la señal honesta «te oigo» («…») mientras hay voz. nada lanza;
 * la fuente de audio, el elector y el transcriptor son inyectables.
 */

import {
  MOTORES_OIDO,
  type MotorOidoId,
  type OpcionesEleccionOido,
  type ResultadoOido,
} from "@/lib/aurora/stt-oss/motores-oido";

/** Parámetros del detector de energía, los mismos de `oss-stt.ts`. */
export const ESCUCHA_SILENCIO_MS = 800;
export const ESCUCHA_TRAMO_MAX_MS = 30000;
const VOZ_MIN_MS = 350;
const PRE_ROLL_MS = 300;
const CALIBRACION_MS = 850;
const SUELO_MIN = 0.004;
const SUELO_MAX = 0.08;
const VOZ_MULT = 2.4;
const MARGEN_VOZ = 0.006;
const SOLTAR_RATIO = 0.6;
const SUAVIDAD_SUELO = 0.995;

/** Transcripción de un tramo, con el idiom DETECTADO por el motor si lo da. */
export interface TramoTranscrito { texto: string; idioma?: string; }

export interface OpcionesEscuchaFusionada {
  /** Suscribe el audio: `alBloque` por cada bloque; devuelve cómo parar. */
  obtenerAudio: (alBloque: (bloque: Float32Array) => void) => (() => void) | void;
  /** El elector del oído (p. ej. `elegirOido`); aquí siempre fase «final». */
  elegir: (opciones: OpcionesEleccionOido) => ResultadoOido;
  /** Transcribe el tramo WAV con el motor dado; null = falló (sin lanzar). */
  transcribir: (tramo: Blob, motor: string, idioma: string | undefined, hotwords: string[]) => Promise<TramoTranscrito | null>;
  alParcial: (texto: string) => void;
  alFinal: (texto: string) => void;
  /** Pista de idioma de la persona: NUNCA imposición (§3 regla 2). */
  idiomaPista?: string;
  /** Palabras propias (glosario de la conciencia) en cada petición. */
  hotwords?: string[];
  /** Motores que el elector puede elegir (por defecto, todos). */
  disponibles?: MotorOidoId[];
  /** Muestras por segundo del audio entrante (por defecto 16 kHz). */
  sampleRate?: number;
  /** Silencio (ms) que cierra un tramo; por defecto 800 (VAD de `oss-stt.ts`). */
  silencioMs?: number;
  /** Tramo (ms) que se cierra aunque no haya silencio; por defecto 30 000. */
  tramoMaxMs?: number;
}

export interface EscuchaFusionada { detener: () => void; activa: () => boolean; }

/** «es-ES» → «es»; sin pista o pista ilegible → «*» (manda el AUDIO). */
function baseIdioma(v: string | undefined): string {
  const base = (v ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return /^[a-z]{2,3}$/.test(base) ? base : "*";
}

/** Convierte un tramo Float32 (−1…1) a WAV PCM16 mono de 16 bits. Nunca lanza. */
export function tramoAWav(pcm: Float32Array, sampleRate = 16000): Blob {
  const bytes = 44 + pcm.length * 2;
  const vista = new DataView(new ArrayBuffer(bytes));
  const poner = (o: number, s: string) => { for (let i = 0; i < s.length; i++) vista.setUint8(o + i, s.charCodeAt(i)); };
  poner(0, "RIFF"); vista.setUint32(4, bytes - 8, true); poner(8, "WAVE"); poner(12, "fmt ");
  vista.setUint32(16, 16, true); vista.setUint16(20, 1, true); vista.setUint16(22, 1, true);
  vista.setUint32(24, sampleRate, true); vista.setUint32(28, sampleRate * 2, true);
  vista.setUint16(32, 2, true); vista.setUint16(34, 16, true);
  poner(36, "data"); vista.setUint32(40, pcm.length * 2, true);
  const destino = new Int16Array(vista.buffer, 44);
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.min(1, Math.max(-1, pcm[i] ?? 0));
    destino[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
  }
  return new Blob([vista.buffer], { type: "audio/wav" });
}

/** RMS de un bloque: la energía que mide el detector de voz de `oss-stt.ts`. */
function rms(b: Float32Array): number {
  let suma = 0;
  for (let i = 0; i < b.length; i++) suma += b[i]! * b[i]!;
  return Math.sqrt(suma / (b.length || 1));
}

export function escucharFusionado(opciones: OpcionesEscuchaFusionada): EscuchaFusionada {
  const sr = opciones.sampleRate ?? 16000;
  const silencioMs = Math.max(50, opciones.silencioMs ?? ESCUCHA_SILENCIO_MS);
  const tramoMaxMs = Math.max(500, opciones.tramoMaxMs ?? ESCUCHA_TRAMO_MAX_MS);
  const msDeBloque = (b: Float32Array) => (b.length / sr) * 1000;
  // Estado de ESTA sesión: cada escucha tiene el suyo, nada compartido.
  let parado = false;
  let suelo = SUELO_MIN;
  let sumaCalib = 0;
  let msCalib = 0;
  let hablando = false;
  let msTramo = 0;
  let msVoz = 0; // solo el tiempo con voz: lo que decide el mínimo de 350 ms
  let msSinVoz = 0;
  let trozos: Float32Array[] = [];
  let pre: Float32Array[] = [];
  let msPre = 0;
  let idioma = baseIdioma(opciones.idiomaPista); // el AUDIO la corrige (§3)
  let cola: Promise<void> = Promise.resolve();
  const umbral = () => Math.min(SUELO_MAX * VOZ_MULT, suelo * VOZ_MULT + MARGEN_VOZ);
  const guardarPre = (b: Float32Array) => {
    pre.push(b);
    msPre += msDeBloque(b);
    while (pre.length > 1 && msPre - msDeBloque(pre[0]! as Float32Array) >= PRE_ROLL_MS) {
      msPre -= msDeBloque(pre.shift()! as Float32Array);
    }
  };
  const mezclarPre = () => {
    for (const p of pre) trozos.push(p); // el pre-roll no corta la primera sílaba
    msTramo += msPre;
    pre = [];
    msPre = 0;
  };
  const reiniciar = () => {
    trozos = []; pre = []; msPre = 0; msTramo = 0; msVoz = 0; msSinVoz = 0; hablando = false;
  };
  const cerrar = () => {
    const porJuntar = trozos;
    const msVozCerrado = msVoz;
    const idiomaTramo = idioma;
    reiniciar();
    if (parado || msVozCerrado < VOZ_MIN_MS) return;
    const disponibles = opciones.disponibles ?? MOTORES_OIDO.map((m) => m.id);
    const hotwords = opciones.hotwords ?? [];
    const pcm = new Float32Array(porJuntar.reduce((n, t) => n + t.length, 0));
    let fuera = 0;
    for (const t of porJuntar) { pcm.set(t, fuera); fuera += t.length; }
    // Transcripciones EN COLA: nunca dos motores a la vez (§5: una corriente).
    cola = cola.then(async () => {
      try {
        const eleccion = opciones.elegir({ idioma: idiomaTramo, disponibles, fase: "final" });
        const res = await opciones.transcribir(
          tramoAWav(pcm, sr), eleccion.motor, idiomaTramo === "*" ? undefined : idiomaTramo, hotwords,
        );
        if (parado || !res || !res.texto.trim()) return;
        const base = baseIdioma(res.idioma); // el idioma lo manda el AUDIO (§3 regla 2)
        if (base !== "*") idioma = base;
        opciones.alFinal(res.texto);
      } catch { /* un tramo fallido nunca tumba la escucha (nada lanza) */ }
    });
  };
  const bloqueEntra = (bloque: Float32Array) => {
    if (parado || !bloque || bloque.length === 0) return;
    const b = bloque.slice(0); // el buffer del micrófono se reutiliza: hay que copiarlo
    const ms = msDeBloque(b);
    const nivel = rms(b);
    if (msCalib < CALIBRACION_MS) {
      sumaCalib += nivel * ms; // media ponderada por el tiempo
      msCalib += ms;
      if (msCalib >= CALIBRACION_MS) {
        suelo = Math.min(SUELO_MAX, Math.max(SUELO_MIN, sumaCalib / msCalib));
      }
      guardarPre(b); // calibrando: solo se guarda pre-roll, sin detectar voz
      return;
    }
    const inicio = umbral();
    const enVoz = hablando ? nivel >= inicio * SOLTAR_RATIO : nivel >= inicio;
    if (enVoz) {
      if (!hablando) {
        hablando = true;
        mezclarPre();
        try { opciones.alParcial("…"); } catch { /* el parcial nunca tumba la escucha */ }
      }
      trozos.push(b);
      msTramo += ms;
      msVoz += ms;
      msSinVoz = 0;
      if (msTramo >= tramoMaxMs) cerrar(); // tramo ≤ 30 s aunque no calle
    } else if (hablando) {
      trozos.push(b);
      msTramo += ms;
      msSinVoz += ms;
      if (msSinVoz >= silencioMs) cerrar(); // silencio ~800 ms cierra el tramo
    } else {
      suelo = Math.min(SUELO_MAX, Math.max(SUELO_MIN, SUAVIDAD_SUELO * suelo + (1 - SUAVIDAD_SUELO) * nivel));
      guardarPre(b);
    }
  };
  const pararFuente: (() => void) = opciones.obtenerAudio((bloque) => bloqueEntra(bloque)) || (() => {});
  return {
    detener: () => {
      if (parado) return;
      parado = true;
      try { pararFuente(); } catch { /* */ }
    },
    activa: () => !parado,
  };
}
