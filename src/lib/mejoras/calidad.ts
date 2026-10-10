/**
 * Prueba de humo de CALIDAD de una mejora en la neurona canaria (contrato §5).
 * ═══════════════════════════════════════════════════════════════════════════
 * «Carga y responde» no basta para un modelo: una versión nueva de un oído puede transcribir
 * peor, y una voz nueva puede tardar el doble en empezar a hablar. Aquí se mide lo que nota la
 * persona, por familia, con umbrales absolutos y de regresión frente a la versión anterior medida
 * en la MISMA neurona. El resultado alimenta la máquina de la canaria (`siguienteEstado`):
 * pasa → propagar; no pasa → volver atrás.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import type { EventoDespliegue } from "@/lib/actualizaciones/planificador";
import type { FamiliaSistema } from "./tipos";

/* ── Error de palabra (WER) ────────────────────────────────────────────────── */

export interface OpcionesWer {
  /** Ignorar tildes y diéresis («dictado» = «dictádo»). Por defecto no: en español cambian palabras. */
  ignorarTildes?: boolean;
}

/** Normaliza para comparar: minúsculas, sin puntuación, espacios simples. */
export function normalizarTexto(t: string, o: OpcionesWer = {}): string[] {
  let s = String(t ?? "").toLowerCase();
  if (o.ignorarTildes) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
  return s ? s.split(" ") : [];
}

export interface ResultadoWer {
  /** (S + D + I) / N. 0 = perfecto; puede pasar de 1 si sobran muchas palabras. */
  wer: number;
  sustituciones: number;
  borrados: number;
  inserciones: number;
  palabrasReferencia: number;
}

/** Tasa de error de palabra por distancia de edición a nivel de palabra (Levenshtein). */
export function tasaErrorPalabras(referencia: string, hipotesis: string, o: OpcionesWer = {}): ResultadoWer {
  const r = normalizarTexto(referencia, o);
  const h = normalizarTexto(hipotesis, o);
  const n = r.length;
  const m = h.length;
  if (n === 0) return { wer: m === 0 ? 0 : 1, sustituciones: 0, borrados: 0, inserciones: m, palabrasReferencia: 0 };
  // dp[i][j] = [coste, S, D, I] para r[0..i) frente a h[0..j)
  type Celda = [number, number, number, number];
  let prev: Celda[] = Array.from({ length: m + 1 }, (_, j) => [j, 0, 0, j] as Celda);
  for (let i = 1; i <= n; i++) {
    const cur: Celda[] = [[i, 0, i, 0]];
    for (let j = 1; j <= m; j++) {
      const igual = r[i - 1] === h[j - 1];
      const diag = prev[j - 1];
      const arriba = prev[j]; // borrado
      const izq = cur[j - 1]; // inserción
      const opciones: Celda[] = [
        [diag[0] + (igual ? 0 : 1), diag[1] + (igual ? 0 : 1), diag[2], diag[3]],
        [arriba[0] + 1, arriba[1], arriba[2] + 1, arriba[3]],
        [izq[0] + 1, izq[1], izq[2], izq[3] + 1],
      ];
      cur.push(opciones.reduce((a, b) => (b[0] < a[0] ? b : a)));
    }
    prev = cur;
  }
  const [coste, S, D, I] = prev[m];
  return { wer: coste / n, sustituciones: S, borrados: D, inserciones: I, palabrasReferencia: n };
}

/** Factor de tiempo real: segundos de proceso por segundo de audio/vídeo. < 1 = más rápido que real. */
export function factorTiempoReal(segundosProceso: number, segundosMedio: number): number | null {
  if (!(segundosProceso >= 0) || !(segundosMedio > 0)) return null;
  return segundosProceso / segundosMedio;
}

/** RMS de una señal (para saber que no es silencio). */
export function rms(muestras: ArrayLike<number>): number {
  const n = muestras.length;
  if (!n) return 0;
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(muestras[i]) || 0;
    suma += v * v;
  }
  return Math.sqrt(suma / n);
}

/* ── Medidas y umbrales por familia ────────────────────────────────────────── */

export interface MedidaCalidad {
  /** Factor de tiempo real (ASR, TTS, sonido). */
  rtf?: number | null;
  /** Error de palabra 0-1 (ASR), sobre las frases fijas de la prueba. */
  wer?: number | null;
  /** Milisegundos hasta el primer audio (TTS). */
  latenciaPrimerAudioMs?: number | null;
  /** El audio o la imagen salen y no están vacíos. */
  salidaValida?: boolean | null;
  /** RMS del audio generado (sonido). */
  rms?: number | null;
  /** Desvío de la duración pedida, en tanto por uno (sonido). */
  desvioDuracion?: number | null;
  /** Segundos por imagen o por segundo de vídeo (audiovisual). */
  segundosPorUnidad?: number | null;
  /** Tokens por segundo (código). */
  tokensPorSegundo?: number | null;
  /** Aciertos 0-1 en el banco fijo de pruebas (código). */
  aciertos?: number | null;
}

/**
 * Umbrales (contrato §5). Por qué estos números:
 *  · ASR RTF ≤ 0,5: el dictado en vivo procesa a trozos; con RTF 0,5 sobra la mitad del tiempo
 *    para red y cola. WER ≤ 15 %: por encima, corregir cuesta más que escribir.
 *  · TTS primer audio ≤ 1500 ms: más allá, una conversación se siente rota.
 *  · Código ≥ 5 tok/s: por debajo, una respuesta de 300 tokens tarda más de un minuto.
 *  · Regresiones: lo que una persona nota (WER +2 puntos, +25-50 % de tiempo, −5 puntos de aciertos).
 */
export const UMBRALES = {
  "voz-asr": { rtfMax: 0.5, werMax: 0.15, regresionWer: 0.02, regresionRtf: 0.25 },
  "voz-tts": { latenciaMaxMs: 1500, rtfMax: 1, regresionLatencia: 0.3 },
  sonido: { rmsMin: 0.001, desvioMax: 0.1, rtfMax: 4, regresionRtf: 0.5 },
  audiovisual: { regresionTiempo: 0.5 },
  codigo: { tpsMin: 5, regresionAciertos: 0.05, regresionTps: 0.25 },
} as const;

export interface EvaluacionCalidad {
  pasa: boolean;
  fallos: string[];
  mejoras: string[];
  /** Una frase para el panel. */
  resumen: string;
}

const pct = (x: number): string => `${Math.round(x * 1000) / 10} %`;
const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const empeora = (nuevo: number, base: number, tolerancia: number): boolean => base > 0 && nuevo > base * (1 + tolerancia);

/**
 * Evalúa la medida de la versión nueva (y, si la hay, la de la anterior en esta neurona).
 * Una métrica obligatoria que falta cuenta como fallo: sin medida no se promueve nada.
 */
export function evaluarCalidad(familia: FamiliaSistema, nueva: MedidaCalidad, anterior?: MedidaCalidad | null): EvaluacionCalidad {
  const fallos: string[] = [];
  const mejoras: string[] = [];
  const base = anterior ?? {};
  try {
    if (familia === "voz-asr") {
      const u = UMBRALES["voz-asr"];
      if (!fin(nueva.rtf) || !fin(nueva.wer)) fallos.push("Falta medir el tiempo real y el error de palabra.");
      else {
        if (nueva.rtf > u.rtfMax) fallos.push(`Tiempo real ${nueva.rtf.toFixed(2)} (máx. ${u.rtfMax}).`);
        if (nueva.wer > u.werMax) fallos.push(`Error de palabra ${pct(nueva.wer)} (máx. ${pct(u.werMax)}).`);
        if (fin(base.wer) && nueva.wer > base.wer + u.regresionWer) fallos.push(`Transcribe peor: ${pct(base.wer)} → ${pct(nueva.wer)}.`);
        if (fin(base.rtf) && empeora(nueva.rtf, base.rtf, u.regresionRtf)) fallos.push(`Más lenta: tiempo real ${base.rtf.toFixed(2)} → ${nueva.rtf.toFixed(2)}.`);
        if (fin(base.wer) && nueva.wer < base.wer) mejoras.push(`Error de palabra ${pct(base.wer)} → ${pct(nueva.wer)}.`);
      }
    } else if (familia === "voz-tts") {
      const u = UMBRALES["voz-tts"];
      if (nueva.salidaValida === false) fallos.push("El audio sale vacío.");
      if (!fin(nueva.latenciaPrimerAudioMs)) fallos.push("Falta medir la latencia al primer audio.");
      else {
        if (nueva.latenciaPrimerAudioMs > u.latenciaMaxMs) fallos.push(`Primer audio a ${Math.round(nueva.latenciaPrimerAudioMs)} ms (máx. ${u.latenciaMaxMs}).`);
        if (fin(base.latenciaPrimerAudioMs) && empeora(nueva.latenciaPrimerAudioMs, base.latenciaPrimerAudioMs, u.regresionLatencia))
          fallos.push(`Tarda más en hablar: ${Math.round(base.latenciaPrimerAudioMs)} → ${Math.round(nueva.latenciaPrimerAudioMs)} ms.`);
        if (fin(base.latenciaPrimerAudioMs) && nueva.latenciaPrimerAudioMs < base.latenciaPrimerAudioMs)
          mejoras.push(`Habla antes: ${Math.round(base.latenciaPrimerAudioMs)} → ${Math.round(nueva.latenciaPrimerAudioMs)} ms.`);
      }
      if (fin(nueva.rtf) && nueva.rtf > u.rtfMax) fallos.push(`Genera más lento que en tiempo real (${nueva.rtf.toFixed(2)}).`);
    } else if (familia === "sonido") {
      const u = UMBRALES.sonido;
      if (!fin(nueva.rms)) fallos.push("Falta medir el nivel del audio generado.");
      else if (nueva.rms <= u.rmsMin) fallos.push("El audio generado es silencio.");
      if (fin(nueva.desvioDuracion) && Math.abs(nueva.desvioDuracion) > u.desvioMax) fallos.push(`La duración se desvía ${pct(Math.abs(nueva.desvioDuracion))}.`);
      if (fin(nueva.rtf) && nueva.rtf > u.rtfMax) fallos.push(`Demasiado lenta: ${nueva.rtf.toFixed(1)} s por segundo de audio.`);
      if (fin(nueva.rtf) && fin(base.rtf) && empeora(nueva.rtf, base.rtf, u.regresionRtf)) fallos.push(`Más lenta que la anterior: ${base.rtf.toFixed(1)} → ${nueva.rtf.toFixed(1)}.`);
    } else if (familia === "audiovisual") {
      const u = UMBRALES.audiovisual;
      if (nueva.salidaValida !== true) fallos.push("No produjo una salida válida.");
      if (fin(nueva.segundosPorUnidad) && fin(base.segundosPorUnidad) && empeora(nueva.segundosPorUnidad, base.segundosPorUnidad, u.regresionTiempo))
        fallos.push(`Más lenta: ${base.segundosPorUnidad.toFixed(1)} → ${nueva.segundosPorUnidad.toFixed(1)} s por unidad.`);
      if (fin(nueva.segundosPorUnidad) && fin(base.segundosPorUnidad) && nueva.segundosPorUnidad < base.segundosPorUnidad)
        mejoras.push(`Más rápida: ${base.segundosPorUnidad.toFixed(1)} → ${nueva.segundosPorUnidad.toFixed(1)} s por unidad.`);
    } else {
      const u = UMBRALES.codigo;
      if (!fin(nueva.tokensPorSegundo)) fallos.push("Falta medir los tokens por segundo.");
      else {
        if (nueva.tokensPorSegundo < u.tpsMin) fallos.push(`${nueva.tokensPorSegundo.toFixed(1)} tok/s (mín. ${u.tpsMin}).`);
        if (fin(base.tokensPorSegundo) && nueva.tokensPorSegundo < base.tokensPorSegundo * (1 - u.regresionTps))
          fallos.push(`Más lenta: ${base.tokensPorSegundo.toFixed(1)} → ${nueva.tokensPorSegundo.toFixed(1)} tok/s.`);
        if (fin(base.tokensPorSegundo) && nueva.tokensPorSegundo > base.tokensPorSegundo)
          mejoras.push(`Más rápida: ${base.tokensPorSegundo.toFixed(1)} → ${nueva.tokensPorSegundo.toFixed(1)} tok/s.`);
      }
      if (fin(nueva.aciertos) && fin(base.aciertos) && nueva.aciertos < base.aciertos - u.regresionAciertos)
        fallos.push(`Acierta menos: ${pct(base.aciertos)} → ${pct(nueva.aciertos)}.`);
    }
  } catch {
    fallos.push("La medida no se pudo evaluar.");
  }
  const pasa = fallos.length === 0;
  const resumen = pasa ? (mejoras.length ? `Pasa la prueba. ${mejoras[0]}` : "Pasa la prueba de calidad.") : `No pasa: ${fallos[0]}`;
  return { pasa, fallos, mejoras, resumen };
}

/** El evento para la máquina de la canaria (`siguienteEstado` de actualizaciones). */
export function eventoDeCalidad(e: EvaluacionCalidad): EventoDespliegue {
  return { tipo: "humo", ok: e.pasa };
}
