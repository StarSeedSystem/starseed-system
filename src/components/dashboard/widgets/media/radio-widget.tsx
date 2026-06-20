'use client';

// ════════════════════════════════════════════════════════════════
// RadioWidget — Emisoras en vivo (SomaFM) vía el motor compartido.
// ----------------------------------------------------------------
// Lista RADIO_STATIONS; al hacer clic reproduce el stream con
// useMediaPlayer. Indicador "EN VIVO" en la que suena, estado
// "cargando" mientras bufferea y un estado de error con "reintentar"
// si el stream no arranca (red caída / CORS). Los streams en vivo no
// exponen duración → NUNCA se muestra barra de progreso.
//
// Adaptabilidad (render-prop `size`): en micro se ocultan el subtítulo
// de la emisora y el slider de volumen, manteniendo play/stop por
// emisora. Accesibilidad: botones con aria-label/title + foco visible;
// el volumen es <input type=range> con aria-valuetext. Animaciones del
// punto "EN VIVO" respetan animations.enabled + prefers-reduced-motion.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Radio, Play, Square, Loader2, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetShell } from '@/components/dashboard/kit';
import { useAppearance } from '@/context/appearance-context';
import { useMediaPlayer } from '@/components/dashboard/apps/media/media-engine';
import { RADIO_STATIONS } from '@/components/dashboard/apps/media/media-catalog';

const ACCENT = '#FB923C';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

export function RadioWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { state, playTrack, pause, setVolume } = useMediaPlayer();
    const current = state.track;
    const isRadio = current?.kind === 'radio';
    const activeId = isRadio ? current?.id : undefined;

    // Detección de fallo del stream: el motor no expone un flag de error
    // explícito, así que marcamos la emisora que el usuario intentó abrir y,
    // si tras intentarlo deja de cargar y no suena, la consideramos caída.
    const [attemptedId, setAttemptedId] = useState<string | null>(null);
    const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [erroredId, setErroredId] = useState<string | null>(null);

    const tryPlay = (station: (typeof RADIO_STATIONS)[number]) => {
        setErroredId(null);
        setAttemptedId(station.id);
        playTrack(station, RADIO_STATIONS);
    };

    // Si la emisora intentada no llega a sonar (ni sigue cargando) en un
    // margen razonable, la marcamos como caída para ofrecer "reintentar".
    useEffect(() => {
        if (!attemptedId) return;
        const isAttemptActive = activeId === attemptedId;
        if (isAttemptActive && state.playing) {
            // Arrancó bien → limpiamos cualquier estado de error.
            setErroredId(null);
            if (settleRef.current) {
                clearTimeout(settleRef.current);
                settleRef.current = null;
            }
            return;
        }
        if (isAttemptActive && !state.playing && !state.loading) {
            // Ya no carga y no suena → probablemente falló (damos un respiro).
            if (settleRef.current) clearTimeout(settleRef.current);
            settleRef.current = setTimeout(() => {
                setErroredId(attemptedId);
            }, 600);
        }
        return () => {
            if (settleRef.current) {
                clearTimeout(settleRef.current);
                settleRef.current = null;
            }
        };
    }, [attemptedId, activeId, state.playing, state.loading]);

    // Limpieza del temporizador al desmontar.
    useEffect(() => {
        return () => {
            if (settleRef.current) clearTimeout(settleRef.current);
        };
    }, []);

    return (
        <WidgetShell
            title="Radio en vivo"
            subtitle="Emisoras"
            icon={Radio}
            accent={ACCENT}
            live={isRadio && state.playing}
            connections={[
                { label: 'Reproductor', color: '#F472B6' },
                { label: 'Omnifrecuencias', color: '#22D3EE' },
            ]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                return (
                    <div className="flex h-full flex-col gap-2 pt-1">
                        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
                            <ul className="flex flex-col gap-1.5" role="list">
                                {RADIO_STATIONS.map((s) => {
                                    const isActive = activeId === s.id;
                                    const isPlayingThis = isActive && state.playing;
                                    const isLoadingThis = isActive && state.loading && !state.playing;
                                    const isErroredThis = erroredId === s.id && !isPlayingThis && !isLoadingThis;
                                    return (
                                        <li key={s.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isPlayingThis) pause();
                                                    else tryPlay(s);
                                                }}
                                                aria-pressed={isActive}
                                                aria-label={
                                                    isPlayingThis
                                                        ? `Detener ${s.title}`
                                                        : isErroredThis
                                                            ? `Reintentar ${s.title}`
                                                            : `Reproducir ${s.title}`
                                                }
                                                title={s.artist ? `${s.title} — ${s.artist}` : s.title}
                                                className={cn(
                                                    'group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer',
                                                    FOCUS_RING,
                                                    isErroredThis
                                                        ? 'border-amber-400/40 bg-amber-400/[0.06]'
                                                        : isActive
                                                            ? 'border-orange-400/40 bg-orange-400/[0.08]'
                                                            : 'border-border/40 bg-white/[0.02] hover:border-orange-400/30 hover:bg-white/[0.04]',
                                                )}
                                            >
                                                <span
                                                    className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10"
                                                    style={{
                                                        background: isActive && !isErroredThis
                                                            ? `linear-gradient(135deg, ${ACCENT}, color-mix(in srgb, ${ACCENT} 40%, transparent))`
                                                            : 'rgba(255,255,255,0.04)',
                                                    }}
                                                >
                                                    {isErroredThis ? (
                                                        <RefreshCw className="size-4 text-amber-300" />
                                                    ) : isLoadingThis ? (
                                                        <Loader2 className="size-4 animate-spin text-white" />
                                                    ) : isPlayingThis ? (
                                                        <Square className="size-3.5 text-white" />
                                                    ) : (
                                                        <Play className="size-4" style={{ color: isActive ? '#fff' : ACCENT }} />
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[11px] font-bold leading-tight">{s.title}</span>
                                                    {!micro && (
                                                        <span className="block truncate text-[10px] text-muted-foreground/60">
                                                            {isErroredThis ? 'No disponible · toca para reintentar' : s.artist}
                                                        </span>
                                                    )}
                                                </span>
                                                {isPlayingThis && (
                                                    <span
                                                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-1.5 py-0.5"
                                                        role="status"
                                                        aria-label="En vivo"
                                                    >
                                                        <motion.span
                                                            className="size-1.5 rounded-full bg-red-500"
                                                            animate={animate ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
                                                            transition={animate ? { duration: 1.6, repeat: Infinity } : undefined}
                                                        />
                                                        {!micro && (
                                                            <span className="text-[8px] font-black uppercase tracking-widest text-red-400">En vivo</span>
                                                        )}
                                                    </span>
                                                )}
                                                {isLoadingThis && !micro && (
                                                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                                        Cargando…
                                                    </span>
                                                )}
                                                {isErroredThis && !micro && (
                                                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-amber-400/80">
                                                        Reintentar
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        {/* Volumen compartido */}
                        {!micro && (
                            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-orange-400/20 bg-white/[0.02] px-2.5 py-1.5">
                                <button
                                    type="button"
                                    onClick={() => setVolume(state.volume > 0 ? 0 : 0.8)}
                                    aria-label={state.volume > 0 ? 'Silenciar' : 'Activar sonido'}
                                    title={state.volume > 0 ? 'Silenciar' : 'Activar sonido'}
                                    className={cn(
                                        'grid size-5 shrink-0 place-items-center text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer rounded-full',
                                        FOCUS_RING,
                                    )}
                                >
                                    {state.volume > 0 ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={state.volume}
                                    onChange={(e) => setVolume(Number(e.target.value))}
                                    aria-label="Volumen"
                                    aria-valuetext={`${Math.round(state.volume * 100)} por ciento`}
                                    className={cn(
                                        'h-1 flex-1 cursor-pointer appearance-none rounded-full accent-orange-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-300',
                                        FOCUS_RING,
                                    )}
                                    style={{
                                        background: `linear-gradient(90deg, ${ACCENT} ${state.volume * 100}%, rgba(255,255,255,0.15) ${state.volume * 100}%)`,
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
