"use client";

/**
 * StarSeed OS — OmniVoice MIXER (Adenda 97 · SOP §7.3).
 * ============================================================================
 * Salida de audio ÚNICA del sistema de voz OmniVoice, sobre WebAudio:
 *
 *   · CROSSFADE equal-power (160 ms por defecto) entre locuciones — al cambiar
 *     de frase, de motor, de voz o de PERSONALIDAD en caliente, el audio se
 *     funde en vez de cortarse (adiós clicks y silencios duros).
 *   · Cola PCM16 continua (para motores de streaming como xAI grok-voice):
 *     los deltas se agendan pegados al sample — cero huecos.
 *   · Ganancia por NEURONA/personalidad (mezcla y prioridad audibles).
 *   · Modulación emocional (rate/volumen) equivalente a la de neural-tts
 *     (playbackRate de WebAudio ≈ HTMLAudio con preservesPitch=false).
 *
 * DISEÑO ADITIVO (regla de oro: Aurora SIEMPRE habla): si WebAudio no está
 * disponible o decodeAudioData falla, `mixerPlayBlob` devuelve false y el
 * llamador usa su camino clásico (HTMLAudioElement). Ningún eslabón depende
 * del mixer para sonar.
 *
 * SSR-safe y defensivo: nada toca AudioContext hasta la primera reproducción
 * (post-gesto). NUNCA lanza.
 */

/* ── Estado del mixer (módulo singleton) ───────────────────────────────────── */

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  neuronId: string | null;
  startedAt: number;
  /** Marca de "ya está en fade-out" para no fundir dos veces. */
  fading: boolean;
  onEnd?: () => void;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const neuronGains = new Map<string, number>();
let active: ActiveVoice | null = null;

/** Cola PCM continua (streaming): tiempo de agenda del próximo trozo. */
let pcmNextTime = 0;
let pcmStream: { gain: GainNode; neuronId: string | null } | null = null;
/** Fuentes PCM ya agendadas (para poder CORTARLAS de verdad al detener). */
let pcmSources: AudioBufferSourceNode[] = [];

export const MIXER_DEFAULT_CROSSFADE_MS = 160;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => null);
    }
    return ctx;
  } catch {
    return null;
  }
}

/** ¿Puede el mixer sonar en este dispositivo? (informativo para la UI). */
export function mixerSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!(
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
    );
  } catch {
    return false;
  }
}

/** Ganancia 0..1 de una neurona/personalidad (1 por defecto). */
export function setNeuronMixGain(neuronId: string, gain: number): void {
  try {
    neuronGains.set(neuronId, Math.max(0, Math.min(1, gain)));
  } catch {
    /* */
  }
}

function gainFor(neuronId: string | null | undefined): number {
  if (!neuronId) return 1;
  return neuronGains.get(neuronId) ?? 1;
}

/* ── Crossfade equal-power ─────────────────────────────────────────────────── */

function fadeOutActive(at: number, seconds: number): void {
  const c = ctx;
  if (!c || !active || active.fading) return;
  const v = active;
  v.fading = true;
  try {
    const g = v.gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    // Curva equal-power (coseno) aproximada con setTargetAtTime (suave, sin zipper).
    g.setTargetAtTime(0.0001, at, Math.max(0.02, seconds / 3));
    v.source.stop(at + seconds + 0.05);
  } catch {
    try {
      v.source.stop();
    } catch {
      /* */
    }
  }
}

/* ── Reproducción de BLOBS (locuciones completas) ──────────────────────────── */

export interface MixerPlayOptions {
  /** Neurona/personalidad dueña de la voz (ganancia propia). */
  neuronId?: string | null;
  /** Duración del crossfade con la locución anterior (ms). */
  crossfadeMs?: number;
  /** Multiplicador de velocidad (modulación emocional; ≈ playbackRate). */
  rate?: number;
  /** Volumen 0..1 (modulación emocional). */
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * Reproduce un blob de audio por el mixer con crossfade sobre lo que suene.
 * Devuelve true si el mixer se hizo cargo; false → el llamador usa su camino
 * clásico (HTMLAudio). NUNCA lanza.
 */
export async function mixerPlayBlob(blob: Blob, opts: MixerPlayOptions = {}): Promise<boolean> {
  const c = getCtx();
  if (!c || !master) return false;
  let buffer: AudioBuffer;
  try {
    const bytes = await blob.arrayBuffer();
    buffer = await c.decodeAudioData(bytes);
  } catch {
    return false; // formato no decodificable → camino clásico
  }
  try {
    const now = c.currentTime;
    const fade = Math.max(0, (opts.crossfadeMs ?? MIXER_DEFAULT_CROSSFADE_MS) / 1000);

    const gain = c.createGain();
    const target = gainFor(opts.neuronId) * Math.max(0, Math.min(1, opts.volume ?? 1));
    // Entrada en fade-in solo si hay algo sonando (si no, ataque directo).
    if (active && !active.fading) {
      fadeOutActive(now, fade);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setTargetAtTime(target, now, Math.max(0.02, fade / 3));
    } else {
      gain.gain.setValueAtTime(target, now);
    }
    gain.connect(master);

    const source = c.createBufferSource();
    source.buffer = buffer;
    if (opts.rate && opts.rate > 0) source.playbackRate.value = opts.rate;
    source.connect(gain);

    const voice: ActiveVoice = {
      source,
      gain,
      neuronId: opts.neuronId ?? null,
      startedAt: now,
      fading: false,
      onEnd: opts.onEnd,
    };
    source.onended = () => {
      try {
        gain.disconnect();
      } catch {
        /* */
      }
      if (active === voice) active = null;
      try {
        voice.onEnd?.();
      } catch {
        /* */
      }
    };
    active = voice;
    source.start(now);
    try {
      opts.onStart?.();
    } catch {
      /* */
    }
    return true;
  } catch (e) {
    try {
      opts.onError?.(e instanceof Error ? e.message : "mixer: fallo de reproducción");
    } catch {
      /* */
    }
    return false;
  }
}

/**
 * Como `mixerPlayBlob` pero devuelve además la DURACIÓN del audio (segundos),
 * para que un reproductor troceado pueda agendar el siguiente trozo justo
 * antes de que este termine (crossfade encadenado sin huecos). Devuelve
 * `{ ok:false, durationSec:0 }` si no se pudo (→ el llamador usa HTMLAudio).
 */
export async function mixerPlayBlobInfo(
  blob: Blob,
  opts: MixerPlayOptions = {},
): Promise<{ ok: boolean; durationSec: number }> {
  const c = getCtx();
  if (!c || !master) return { ok: false, durationSec: 0 };
  let buffer: AudioBuffer;
  try {
    const bytes = await blob.arrayBuffer();
    buffer = await c.decodeAudioData(bytes);
  } catch {
    return { ok: false, durationSec: 0 };
  }
  try {
    const now = c.currentTime;
    const fade = Math.max(0, (opts.crossfadeMs ?? MIXER_DEFAULT_CROSSFADE_MS) / 1000);
    const gain = c.createGain();
    const target = gainFor(opts.neuronId) * Math.max(0, Math.min(1, opts.volume ?? 1));
    if (active && !active.fading) {
      fadeOutActive(now, fade);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.setTargetAtTime(target, now, Math.max(0.02, fade / 3));
    } else {
      gain.gain.setValueAtTime(target, now);
    }
    gain.connect(master);
    const source = c.createBufferSource();
    source.buffer = buffer;
    if (opts.rate && opts.rate > 0) source.playbackRate.value = opts.rate;
    source.connect(gain);
    const voice: ActiveVoice = { source, gain, neuronId: opts.neuronId ?? null, startedAt: now, fading: false, onEnd: opts.onEnd };
    source.onended = () => {
      try { gain.disconnect(); } catch { /* */ }
      if (active === voice) active = null;
      try { voice.onEnd?.(); } catch { /* */ }
    };
    active = voice;
    source.start(now);
    try { opts.onStart?.(); } catch { /* */ }
    const rate = opts.rate && opts.rate > 0 ? opts.rate : 1;
    return { ok: true, durationSec: buffer.duration / rate };
  } catch {
    return { ok: false, durationSec: 0 };
  }
}

/* ── Streaming PCM16 (xAI y motores realtime) ──────────────────────────────── */

/**
 * Agenda un trozo PCM16 mono en la cola continua (sin huecos). `sampleRate`
 * suele ser 24000 (xAI). Devuelve false si WebAudio no está disponible.
 */
export function mixerPlayPcm16Chunk(
  pcm: Int16Array,
  sampleRate: number,
  opts: { neuronId?: string | null; volume?: number } = {},
): boolean {
  const c = getCtx();
  if (!c || !master || !pcm.length) return false;
  try {
    if (!pcmStream) {
      const gain = c.createGain();
      gain.gain.value = gainFor(opts.neuronId) * Math.max(0, Math.min(1, opts.volume ?? 1));
      gain.connect(master);
      pcmStream = { gain, neuronId: opts.neuronId ?? null };
      // Al abrir un stream, fundimos lo que estuviera sonando (cambio de turno).
      fadeOutActive(c.currentTime, MIXER_DEFAULT_CROSSFADE_MS / 1000);
      pcmNextTime = 0;
    }
    const buffer = c.createBuffer(1, pcm.length, sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(pcmStream.gain);
    const now = c.currentTime;
    // Pegado al sample: si nos quedamos atrás, re-anclamos con 40 ms de colchón.
    if (pcmNextTime < now + 0.02) pcmNextTime = now + 0.04;
    source.start(pcmNextTime);
    pcmNextTime += buffer.duration;
    // Guardar la fuente para poder CORTARLA de verdad al detener (no basta con
    // bajar la ganancia si hay varios segundos ya agendados por delante).
    pcmSources.push(source);
    source.onended = () => {
      const i = pcmSources.indexOf(source);
      if (i >= 0) pcmSources.splice(i, 1);
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Cierra la cola PCM. `hard=false` (fin natural del turno): deja terminar lo ya
 * agendado y funde al final. `hard=true` (stop del usuario): CORTA de verdad —
 * para cada BufferSource agendada ~120 ms tras ahora, sin esperar a que suene
 * el colchón pendiente (antes el fade se anclaba a `pcmNextTime`, que es cuando
 * TERMINA el buffer futuro → "stop" no cortaba nada audible).
 */
export function mixerEndPcmStream(hard = false): void {
  const c = ctx;
  if (!c || !pcmStream) return;
  const now = c.currentTime;
  try {
    const g = pcmStream.gain.gain;
    const fadeAt = hard ? now : Math.max(now, pcmNextTime);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, fadeAt);
    g.setTargetAtTime(0.0001, fadeAt, 0.05);
    if (hard) {
      // Parar cada fuente ya agendada justo tras el fade (corte real inmediato).
      for (const src of pcmSources) {
        try {
          src.stop(now + 0.14);
        } catch {
          /* ya parada */
        }
      }
    }
    const dead = pcmStream.gain;
    const ms = hard ? 250 : Math.ceil((fadeAt - now + 0.4) * 1000);
    setTimeout(() => {
      try {
        dead.disconnect();
      } catch {
        /* */
      }
    }, ms);
  } catch {
    /* */
  }
  pcmSources = [];
  pcmStream = null;
  pcmNextTime = 0;
}

/** ¿Cuánto falta (s) para que termine la cola PCM agendada? (para esperar el fin). */
export function mixerPcmRemainingSeconds(): number {
  const c = ctx;
  if (!c || !pcmStream) return 0;
  return Math.max(0, pcmNextTime - c.currentTime);
}

/* ── Parada global ─────────────────────────────────────────────────────────── */

/** Corta TODO lo que suene en el mixer con un fade corto y digno (120 ms). */
export function stopMixer(): void {
  const c = ctx;
  if (!c) return;
  try {
    fadeOutActive(c.currentTime, 0.12);
  } catch {
    /* */
  }
  mixerEndPcmStream(true); // hard: corta de verdad las fuentes PCM agendadas
}

/** ¿Está sonando algo por el mixer? */
export function mixerBusy(): boolean {
  return !!active || !!pcmStream;
}
