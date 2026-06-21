'use client';

// ════════════════════════════════════════════════════════════════
// omni-engine — Motor WebAudio soberano de OMNIFRECUENCIAS
// ----------------------------------------------------------------
// Síntesis multi-tono robusta y SSR-safe para frecuencias funcionales.
//
// Cada `OmniTone` produce:
//   • Un oscilador simple (sine/square/triangle/sawtooth) ruteado a un
//     panner estéreo y a un gain de canal, o…
//   • Modo BINAURAL: dos osciladores L (freq) / R (freq + binauralBeat)
//     paneados a -1 / +1 → el cerebro percibe el latido (beat) en Hz.
//   • Modo ISOCRÓNICO: el tono se modula on/off por un LFO (oscilador a
//     `pulseHz`) que ataca la ganancia del canal vía un GainNode de
//     profundidad, creando pulsos audibles discretos.
//   (binaural + isocrónico pueden combinarse: el latido binaural pulsa.)
//
// Anti-click: el master usa rampas (~80ms) en play/stop; los osciladores
// arrancan/paran con un pequeño margen tras la rampa.
//
// SSR-safety: NADA toca window/AudioContext hasta llamar a `play()` (que
// el consumidor invoca SOLO tras un gesto del usuario). Limpieza total al
// `stop()` y al desmontar el hook.
//
// El analyser opcional alimenta el visualizador (getByteFrequencyData).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Tipos públicos ───────────────────────────────────────────────

export type OmniWaveform = 'sine' | 'square' | 'triangle' | 'sawtooth';

export interface OmniTone {
    /** Identificador estable dentro de la config (para keys de UI). */
    id: string;
    /** Frecuencia portadora en Hz. */
    freq: number;
    /** Forma de onda del oscilador. */
    waveform: OmniWaveform;
    /** Ganancia del tono 0..1 (relativa; el master escala el conjunto). */
    gain: number;
    /** Paneo estéreo -1 (izq) .. 0 (centro) .. 1 (der). */
    pan: number;
    /** Latido binaural en Hz. Si > 0, se generan dos osciladores L/R. */
    binauralBeat?: number;
    /** Modulación isocrónica: pulsos por segundo (Hz). Si > 0, activo. */
    pulseHz?: number;
    /** Etiqueta opcional para mostrar en la UI. */
    label?: string;
}

export interface OmniConfig {
    /** Nombre del preset / sesión. */
    name: string;
    /** Descripción opcional. */
    desc?: string;
    /** Lista de tonos simultáneos. */
    tones: OmniTone[];
    /** Volumen maestro 0..1. */
    masterVolume: number;
}

export type OmniEngineState = 'idle' | 'playing' | 'suspended';

// ── Constantes internas ──────────────────────────────────────────

const FADE = 0.08; // 80ms de rampa anti-click en master
const MAX_TONES = 8; // límite sano de osciladores simultáneos
const CHANNEL_HEADROOM = 0.85; // margen para evitar saturación al sumar tonos

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

// Nodos vivos de un tono concreto (para limpieza determinista).
interface LiveTone {
    oscillators: OscillatorNode[];
    panners: StereoPannerNode[];
    lfo?: OscillatorNode;
    lfoGain?: GainNode;
    channel: GainNode;
}

// ── Utilidades ───────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

let _seq = 0;
/** Id estable para un tono nuevo (no aleatorio en SSR: se genera en cliente). */
export function makeToneId(): string {
    try {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return `tone-${crypto.randomUUID()}`;
        }
    } catch {
        /* noop */
    }
    return `tone-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

/** Tono por defecto razonable para "añadir tono" en el editor. */
export function defaultTone(freq = 432): OmniTone {
    return { id: makeToneId(), freq, waveform: 'sine', gain: 0.6, pan: 0 };
}

/** Config vacía base para empezar una sesión nueva. */
export function emptyConfig(name = 'Sesión sin título'): OmniConfig {
    return { name, tones: [defaultTone()], masterVolume: 0.5 };
}

// ════════════════════════════════════════════════════════════════
// OmniEngine — controlador imperativo (sin React). Reutilizable como
// utilidad pura; el hook `useOmniEngine` lo envuelve con estado React.
// ════════════════════════════════════════════════════════════════

export class OmniEngine {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private analyser: AnalyserNode | null = null;
    private live: LiveTone[] = [];
    private masterVolume = 0.5;
    private _state: OmniEngineState = 'idle';

    get state(): OmniEngineState {
        return this._state;
    }

    get playing(): boolean {
        return this._state === 'playing';
    }

    /** Devuelve el analyser para el visualizador (o null si aún no hay audio). */
    getAnalyser(): AnalyserNode | null {
        return this.analyser;
    }

    /** Crea (perezosamente) el AudioContext + master + analyser. Solo en cliente. */
    private ensureContext(): boolean {
        if (typeof window === 'undefined') return false;
        if (this.ctx && this.master) return true;
        const Ctor = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!Ctor) return false;
        const ctx = new Ctor();
        const master = ctx.createGain();
        master.gain.value = 0;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;
        master.connect(analyser);
        analyser.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
        this.analyser = analyser;
        return true;
    }

    /** Desconecta y para todos los nodos vivos (sin tocar el master). */
    private teardownTones(immediate: boolean): void {
        const ctx = this.ctx;
        const stopAt = ctx ? ctx.currentTime + (immediate ? 0 : FADE + 0.03) : 0;
        const live = this.live;
        this.live = [];
        for (const t of live) {
            try {
                t.lfo?.stop(stopAt);
            } catch {
                /* noop */
            }
            for (const osc of t.oscillators) {
                try {
                    osc.stop(stopAt);
                } catch {
                    /* ya detenido */
                }
            }
            // Desconexión diferida tras el stop para liberar el grafo sin clicks.
            const cleanup = () => {
                for (const osc of t.oscillators) {
                    try {
                        osc.disconnect();
                    } catch {
                        /* noop */
                    }
                }
                for (const p of t.panners) {
                    try {
                        p.disconnect();
                    } catch {
                        /* noop */
                    }
                }
                try {
                    t.lfoGain?.disconnect();
                } catch {
                    /* noop */
                }
                try {
                    t.channel.disconnect();
                } catch {
                    /* noop */
                }
            };
            if (immediate) cleanup();
            else window.setTimeout(cleanup, (FADE + 0.06) * 1000);
        }
    }

    /** Construye el grafo de un tono y lo conecta al master. */
    private buildTone(tone: OmniTone): LiveTone | null {
        const ctx = this.ctx;
        const master = this.master;
        if (!ctx || !master) return null;
        const now = ctx.currentTime;

        const channel = ctx.createGain();
        channel.gain.value = clamp(tone.gain, 0, 1) * CHANNEL_HEADROOM;
        channel.connect(master);

        const oscillators: OscillatorNode[] = [];
        const panners: StereoPannerNode[] = [];

        const supportsPanner = typeof ctx.createStereoPanner === 'function';

        const makeOsc = (freq: number, pan: number) => {
            const osc = ctx.createOscillator();
            osc.type = tone.waveform;
            osc.frequency.setValueAtTime(Math.max(1, freq), now);
            if (supportsPanner) {
                const panner = ctx.createStereoPanner();
                panner.pan.setValueAtTime(clamp(pan, -1, 1), now);
                osc.connect(panner);
                panner.connect(channel);
                panners.push(panner);
            } else {
                osc.connect(channel);
            }
            oscillators.push(osc);
        };

        if (tone.binauralBeat && tone.binauralBeat > 0) {
            // L = freq, R = freq + beat. La diferencia se percibe como latido.
            makeOsc(tone.freq, -1);
            makeOsc(tone.freq + tone.binauralBeat, 1);
        } else {
            makeOsc(tone.freq, tone.pan);
        }

        // Modulación isocrónica: LFO → lfoGain (profundidad) → channel.gain.
        let lfo: OscillatorNode | undefined;
        let lfoGain: GainNode | undefined;
        if (tone.pulseHz && tone.pulseHz > 0) {
            lfo = ctx.createOscillator();
            lfo.type = 'square'; // onda cuadrada → pulsos on/off marcados
            lfo.frequency.setValueAtTime(clamp(tone.pulseHz, 0.5, 40), now);
            lfoGain = ctx.createGain();
            // El LFO cuadrado va de -1..1; con depth 0.5 modula el gain del canal
            // entre ~0 y el valor base, produciendo pulsos audibles.
            const base = clamp(tone.gain, 0, 1) * CHANNEL_HEADROOM;
            channel.gain.value = base * 0.5;
            lfoGain.gain.value = base * 0.5;
            lfo.connect(lfoGain);
            lfoGain.connect(channel.gain);
            lfo.start(now);
        }

        const start = now;
        for (const osc of oscillators) {
            osc.start(start);
        }

        return { oscillators, panners, lfo, lfoGain, channel };
    }

    /** Reproduce una configuración (corta lo anterior con fade anti-click). */
    play(config: OmniConfig): void {
        if (!this.ensureContext()) return;
        const ctx = this.ctx!;
        const master = this.master!;
        void ctx.resume();

        // Corta lo anterior de forma instantánea (cambiamos de config).
        this.teardownTones(true);

        const tones = config.tones.slice(0, MAX_TONES);
        for (const tone of tones) {
            const built = this.buildTone(tone);
            if (built) this.live.push(built);
        }

        this.masterVolume = clamp(config.masterVolume, 0, 1);
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(0, now);
        master.gain.linearRampToValueAtTime(this.masterVolume, now + FADE);

        this._state = 'playing';
    }

    /** Detiene la reproducción con fade-out anti-click. */
    stop(): void {
        const ctx = this.ctx;
        const master = this.master;
        if (ctx && master) {
            const now = ctx.currentTime;
            master.gain.cancelScheduledValues(now);
            master.gain.setValueAtTime(master.gain.value, now);
            master.gain.linearRampToValueAtTime(0, now + FADE);
        }
        this.teardownTones(false);
        this._state = 'idle';
    }

    /** Ajusta el volumen maestro en vivo (suavizado corto). */
    setMasterVolume(v: number): void {
        const clamped = clamp(v, 0, 1);
        this.masterVolume = clamped;
        const ctx = this.ctx;
        const master = this.master;
        if (ctx && master && this._state === 'playing') {
            const now = ctx.currentTime;
            master.gain.cancelScheduledValues(now);
            master.gain.setValueAtTime(master.gain.value, now);
            master.gain.linearRampToValueAtTime(clamped, now + 0.05);
        }
    }

    /** Limpieza total: para todo y cierra el contexto. Idempotente. */
    dispose(): void {
        this.teardownTones(true);
        const ctx = this.ctx;
        this.ctx = null;
        this.master = null;
        this.analyser = null;
        this._state = 'idle';
        if (ctx && ctx.state !== 'closed') {
            void ctx.close().catch(() => undefined);
        }
    }
}

// ════════════════════════════════════════════════════════════════
// useOmniEngine — hook React. Crea un OmniEngine por instancia, expone
// estado reactivo (`playing`/`state`) y acciones, y limpia al desmontar.
// El analyser se obtiene vía getAnalyser() para el visualizador.
// ════════════════════════════════════════════════════════════════

export interface UseOmniEngine {
    playing: boolean;
    state: OmniEngineState;
    play: (config: OmniConfig) => void;
    stop: () => void;
    setMasterVolume: (v: number) => void;
    /** Acceso al analyser (para el visualizador). Null hasta el primer play. */
    getAnalyser: () => AnalyserNode | null;
    /** Referencia imperativa al motor (uso avanzado). */
    engine: OmniEngine;
}

export function useOmniEngine(): UseOmniEngine {
    const engineRef = useRef<OmniEngine | null>(null);
    if (engineRef.current === null) {
        engineRef.current = new OmniEngine();
    }
    const engine = engineRef.current;

    const [playing, setPlaying] = useState(false);
    const [state, setState] = useState<OmniEngineState>('idle');

    const play = useCallback(
        (config: OmniConfig) => {
            engine.play(config);
            setPlaying(engine.playing);
            setState(engine.state);
        },
        [engine],
    );

    const stop = useCallback(() => {
        engine.stop();
        setPlaying(engine.playing);
        setState(engine.state);
    }, [engine]);

    const setMasterVolume = useCallback(
        (v: number) => {
            engine.setMasterVolume(v);
        },
        [engine],
    );

    const getAnalyser = useCallback(() => engine.getAnalyser(), [engine]);

    // Limpieza total al desmontar (cierra contexto, libera osciladores).
    useEffect(() => {
        return () => {
            engine.dispose();
        };
    }, [engine]);

    return { playing, state, play, stop, setMasterVolume, getAnalyser, engine };
}
