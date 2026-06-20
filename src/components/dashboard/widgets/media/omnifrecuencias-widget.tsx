'use client';

// ════════════════════════════════════════════════════════════════
// OmnifrecuenciasWidget — Generador de tonos funcionales (Web Audio).
// ----------------------------------------------------------------
// Sintetiza frecuencias (Solfeggio + Schumann) con OscillatorNode (sine).
// • Solo un preset suena a la vez.
// • Entradas con `binauralBeat` → dos osciladores (hz y hz+beat) ruteados
//   a L/R con StereoPannerNode (-1 / +1) → latido binaural percibido.
// • Fade-in/out (~80ms) con GainNode para evitar clicks.
// • Volumen ajustable (GainNode maestro).
// • El AudioContext se crea SOLO tras un gesto del usuario (clic Play).
// • Anillo/onda que pulsa mientras suena (respeta animations.enabled +
//   prefers-reduced-motion: sin bucles intensos si el usuario lo pide).
// • Limpieza total de osciladores/panners/contexto al desmontar y al
//   cambiar de preset (corte instantáneo con fade para no producir clics).
//
// Adaptabilidad (render-prop `size`): en micro se oculta el visualizador
// y el slider de volumen; el grid de presets pasa a 1 columna para no
// truncar etiquetas. Accesibilidad: aria-pressed por preset, role="status"
// en el visualizador, aria-valuetext en el volumen, foco visible.
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Waves, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetShell } from '@/components/dashboard/kit';
import { useAppearance } from '@/context/appearance-context';
import { FREQUENCY_PRESETS, type FrequencyPreset } from '@/components/dashboard/apps/media/media-catalog';

const ACCENT = '#22D3EE';
const FADE = 0.08; // 80ms fade in/out

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

export function OmnifrecuenciasWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    // Anima solo si está habilitado globalmente y el usuario no pidió menos movimiento.
    const animate = config.animations.enabled && !prefersReduced;

    const [activeId, setActiveId] = useState<string | null>(null);
    const [volume, setVolume] = useState(0.4);

    // Refs de audio (no provocan re-render).
    const ctxRef = useRef<AudioContext | null>(null);
    const masterRef = useRef<GainNode | null>(null);
    const oscsRef = useRef<OscillatorNode[]>([]);
    // Guardamos también los panners para desconectarlos explícitamente al limpiar.
    const pannersRef = useRef<StereoPannerNode[]>([]);
    const volumeRef = useRef(volume);
    volumeRef.current = volume;

    const stopOscillators = useCallback((immediate = false) => {
        const ctx = ctxRef.current;
        const master = masterRef.current;
        if (ctx && master) {
            const now = ctx.currentTime;
            if (immediate) {
                master.gain.cancelScheduledValues(now);
                master.gain.setValueAtTime(0, now);
            } else {
                master.gain.cancelScheduledValues(now);
                master.gain.setValueAtTime(master.gain.value, now);
                master.gain.linearRampToValueAtTime(0, now + FADE);
            }
        }
        const oscs = oscsRef.current;
        const panners = pannersRef.current;
        oscsRef.current = [];
        pannersRef.current = [];
        const stopAt = ctx ? ctx.currentTime + (immediate ? 0 : FADE + 0.02) : 0;
        oscs.forEach((osc) => {
            try {
                osc.stop(stopAt);
            } catch {
                /* ya detenido */
            }
        });
        // Desconectamos los panners para liberar el grafo de audio sin esperar al GC.
        panners.forEach((p) => {
            try {
                p.disconnect();
            } catch {
                /* noop */
            }
        });
    }, []);

    const playPreset = useCallback(
        (preset: FrequencyPreset) => {
            if (typeof window === 'undefined') return;

            // Crear/reanudar el AudioContext SOLO tras gesto del usuario.
            if (!ctxRef.current) {
                const Ctor =
                    window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
                if (!Ctor) return;
                const ctx = new Ctor();
                const master = ctx.createGain();
                master.gain.value = 0;
                master.connect(ctx.destination);
                ctxRef.current = ctx;
                masterRef.current = master;
            }
            const ctx = ctxRef.current;
            const master = masterRef.current;
            if (!ctx || !master) return;
            void ctx.resume();

            // Cortar lo anterior de forma instantánea (cambiamos de preset).
            stopOscillators(true);

            const now = ctx.currentTime;
            const made: OscillatorNode[] = [];
            const madePanners: StereoPannerNode[] = [];

            const makeOsc = (freq: number, pan?: number) => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now);
                if (typeof pan === 'number' && typeof ctx.createStereoPanner === 'function') {
                    const panner = ctx.createStereoPanner();
                    panner.pan.setValueAtTime(pan, now);
                    osc.connect(panner);
                    panner.connect(master);
                    madePanners.push(panner);
                } else {
                    osc.connect(master);
                }
                osc.start(now);
                made.push(osc);
            };

            if (preset.binauralBeat) {
                // Dos portadoras: L = hz, R = hz + beat. La diferencia es el latido.
                makeOsc(preset.hz, -1);
                makeOsc(preset.hz + preset.binauralBeat, 1);
            } else {
                makeOsc(preset.hz);
            }

            oscsRef.current = made;
            pannersRef.current = madePanners;

            // Fade-in al volumen actual.
            master.gain.cancelScheduledValues(now);
            master.gain.setValueAtTime(0, now);
            master.gain.linearRampToValueAtTime(volumeRef.current, now + FADE);

            setActiveId(preset.id);
        },
        [stopOscillators],
    );

    const stop = useCallback(() => {
        stopOscillators(false);
        setActiveId(null);
    }, [stopOscillators]);

    // Aplicar cambios de volumen en vivo al master (con suavizado corto).
    useEffect(() => {
        const ctx = ctxRef.current;
        const master = masterRef.current;
        if (ctx && master && activeId) {
            const now = ctx.currentTime;
            master.gain.cancelScheduledValues(now);
            master.gain.setValueAtTime(master.gain.value, now);
            master.gain.linearRampToValueAtTime(volume, now + 0.05);
        }
    }, [volume, activeId]);

    // Limpieza total al desmontar.
    useEffect(() => {
        return () => {
            const oscs = oscsRef.current;
            const panners = pannersRef.current;
            oscsRef.current = [];
            pannersRef.current = [];
            oscs.forEach((osc) => {
                try {
                    osc.stop();
                } catch {
                    /* noop */
                }
            });
            panners.forEach((p) => {
                try {
                    p.disconnect();
                } catch {
                    /* noop */
                }
            });
            const ctx = ctxRef.current;
            ctxRef.current = null;
            masterRef.current = null;
            if (ctx && ctx.state !== 'closed') {
                void ctx.close().catch(() => undefined);
            }
        };
    }, []);

    const active = FREQUENCY_PRESETS.find((p) => p.id === activeId) ?? null;

    return (
        <WidgetShell
            title="Omnifrecuencias"
            subtitle="Frecuencias funcionales"
            icon={Waves}
            accent={ACCENT}
            live={!!activeId}
            connections={[
                { label: 'Reproductor', color: '#F472B6' },
                { label: 'Radio en vivo', color: '#FB923C' },
            ]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                // Con poca anchura, una sola columna evita truncar etiquetas de presets.
                const oneCol = size.tier === 'micro' || size.tier === 'compact';
                return (
                    <div className="flex h-full flex-col gap-2 pt-1">
                        {/* Visualizador / anillo pulsante */}
                        {!micro && (
                            <div
                                className="relative grid shrink-0 place-items-center py-2"
                                role="status"
                                aria-live="polite"
                                aria-label={active ? `Sonando ${active.hz} hercios — ${active.desc}` : 'Sin frecuencia activa'}
                            >
                                <div className="relative grid size-20 place-items-center">
                                    {active && (
                                        <>
                                            {[0, 1, 2].map((i) => (
                                                <motion.span
                                                    key={i}
                                                    aria-hidden
                                                    className="absolute inset-0 rounded-full border"
                                                    style={{ borderColor: `color-mix(in srgb, ${ACCENT} 50%, transparent)` }}
                                                    animate={
                                                        animate
                                                            ? { scale: [1, 1.6], opacity: [0.6, 0] }
                                                            : { scale: 1.2, opacity: 0.2 }
                                                    }
                                                    transition={
                                                        animate
                                                            ? { duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }
                                                            : undefined
                                                    }
                                                />
                                            ))}
                                        </>
                                    )}
                                    <motion.div
                                        className="grid size-14 place-items-center rounded-full border border-white/15"
                                        style={{
                                            background: active
                                                ? `radial-gradient(circle, ${ACCENT}, color-mix(in srgb, ${ACCENT} 25%, transparent))`
                                                : 'rgba(255,255,255,0.04)',
                                        }}
                                        animate={active && animate ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                                        transition={active && animate ? { duration: 1.6, repeat: Infinity } : undefined}
                                    >
                                        <span className="text-center leading-none">
                                            <span className="block text-sm font-black tabular-nums" style={{ color: active ? '#fff' : ACCENT }}>
                                                {active ? active.hz : '—'}
                                            </span>
                                            <span className="block text-[8px] font-bold uppercase tracking-wider text-white/70">
                                                {active ? 'Hz' : 'off'}
                                            </span>
                                        </span>
                                    </motion.div>
                                </div>
                                {active && (
                                    <p className="mt-1 text-center text-[10px] font-semibold text-muted-foreground/70">
                                        {active.desc}
                                        {active.binauralBeat ? ` · binaural ${active.binauralBeat} Hz` : ''}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Presets */}
                        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
                            <div className={cn('grid gap-1.5', oneCol ? 'grid-cols-1' : 'grid-cols-2')} role="group" aria-label="Frecuencias">
                                {FREQUENCY_PRESETS.map((p) => {
                                    const isActive = activeId === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => (isActive ? stop() : playPreset(p))}
                                            aria-pressed={isActive}
                                            aria-label={isActive ? `Detener ${p.label}` : `Reproducir ${p.label} — ${p.desc}`}
                                            title={`${p.label} — ${p.desc}`}
                                            className={cn(
                                                'group flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-all cursor-pointer',
                                                FOCUS_RING,
                                                isActive
                                                    ? 'border-cyan-400/50 bg-cyan-400/[0.1]'
                                                    : 'border-border/40 bg-white/[0.02] hover:border-cyan-400/30 hover:bg-white/[0.04]',
                                            )}
                                        >
                                            <span
                                                className="grid size-6 shrink-0 place-items-center rounded-lg border border-white/10"
                                                style={{
                                                    background: isActive
                                                        ? `linear-gradient(135deg, ${ACCENT}, color-mix(in srgb, ${ACCENT} 40%, transparent))`
                                                        : 'rgba(255,255,255,0.04)',
                                                }}
                                            >
                                                {isActive ? (
                                                    <Square className="size-3 text-white" />
                                                ) : (
                                                    <Play className="size-3" style={{ color: ACCENT }} />
                                                )}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[11px] font-bold leading-tight tabular-nums">{p.label}</span>
                                                {!micro && (
                                                    <span className="block truncate text-[9px] text-muted-foreground/60">{p.desc}</span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Volumen */}
                        {!micro && (
                            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-cyan-400/20 bg-white/[0.02] px-2.5 py-1.5">
                                <button
                                    type="button"
                                    onClick={() => setVolume((v) => (v > 0 ? 0 : 0.4))}
                                    aria-label={volume > 0 ? 'Silenciar' : 'Activar sonido'}
                                    title={volume > 0 ? 'Silenciar' : 'Activar sonido'}
                                    className={cn(
                                        'grid size-5 shrink-0 place-items-center text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer rounded-full',
                                        FOCUS_RING,
                                    )}
                                >
                                    {volume > 0 ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={volume}
                                    onChange={(e) => setVolume(Number(e.target.value))}
                                    aria-label="Volumen"
                                    aria-valuetext={`${Math.round(volume * 100)} por ciento`}
                                    className={cn(
                                        'h-1 flex-1 cursor-pointer appearance-none rounded-full accent-cyan-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-300',
                                        FOCUS_RING,
                                    )}
                                    style={{
                                        background: `linear-gradient(90deg, ${ACCENT} ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)`,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
