'use client';

// ════════════════════════════════════════════════════════════════
// MusicPlayerWidget — Reproductor de la biblioteca de muestra.
// ----------------------------------------------------------------
// Lista SAMPLE_TRACKS; al hacer clic reproduce con la lista entera como
// cola (next/prev). Barra "sonando ahora" con play/pause, prev/next,
// slider de progreso (seek) y slider de volumen. Comparte el motor
// global (useMediaPlayer) con la Radio → una sola fuente de audio.
//
// Adaptabilidad (render-prop `size`): en micro/compact se compacta la
// lista (sin artista) y la barra de transporte mantiene solo los
// controles esenciales; el seek/volumen aparecen al haber altura.
// Accesibilidad: controles con aria-label/title + foco visible; el seek
// usa <input type=range> con aria-valuetext legible; "sonando ahora" se
// anuncia con role="status". Animaciones: el ecualizador respeta
// `animations.enabled` y prefers-reduced-motion. Tiempos en tabular-nums.
// ════════════════════════════════════════════════════════════════

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetShell } from '@/components/dashboard/kit';
import { useAppearance } from '@/context/appearance-context';
import { useMediaPlayer } from '@/components/dashboard/apps/media/media-engine';
import { SAMPLE_TRACKS } from '@/components/dashboard/apps/media/media-catalog';

const ACCENT = '#F472B6';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

function fmtTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicPlayerWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    // Anima solo si está habilitado globalmente y el usuario no pidió menos movimiento.
    const animate = config.animations.enabled && !prefersReduced;

    const { state, playTrack, toggle, next, prev, seek, setVolume } = useMediaPlayer();
    const current = state.track;
    const isMusic = current?.kind === 'music';
    const activeId = isMusic ? current?.id : undefined;

    const duration = state.duration > 0 ? state.duration : 0;
    const hasProgress = duration > 0; // pistas con duración (no streams en vivo)
    const progress = hasProgress ? state.currentTime / duration : 0;
    const buffering = state.loading && !state.playing;

    return (
        <WidgetShell
            title="Reproductor"
            subtitle="Tu biblioteca"
            icon={Music}
            accent={ACCENT}
            connections={[
                { label: 'Radio en vivo', color: '#FB923C' },
                { label: 'Omnifrecuencias', color: '#22D3EE' },
            ]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                // Con poca altura colapsamos seek/volumen para no desbordar.
                const showSliders = !micro && size.vTier !== 'compact';
                return (
                    <div className="flex h-full flex-col gap-2 pt-1">
                        {/* Lista de pistas */}
                        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
                            <ul className="flex flex-col gap-1.5" role="list">
                                {SAMPLE_TRACKS.map((t) => {
                                    const isActive = activeId === t.id;
                                    const isPlayingThis = isActive && state.playing;
                                    const isBufferingThis = isActive && buffering;
                                    return (
                                        <li key={t.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isActive) toggle();
                                                    else playTrack(t, SAMPLE_TRACKS);
                                                }}
                                                aria-pressed={isActive}
                                                aria-label={
                                                    isPlayingThis
                                                        ? `Pausar ${t.title}`
                                                        : `Reproducir ${t.title}${t.artist ? ` de ${t.artist}` : ''}`
                                                }
                                                title={t.artist ? `${t.title} — ${t.artist}` : t.title}
                                                className={cn(
                                                    'group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-all cursor-pointer',
                                                    FOCUS_RING,
                                                    isActive
                                                        ? 'border-pink-400/40 bg-pink-400/[0.08]'
                                                        : 'border-border/40 bg-white/[0.02] hover:border-pink-400/30 hover:bg-white/[0.04]',
                                                )}
                                            >
                                                <span
                                                    className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/10"
                                                    style={{
                                                        background: isActive
                                                            ? `linear-gradient(135deg, ${ACCENT}, color-mix(in srgb, ${ACCENT} 40%, transparent))`
                                                            : 'rgba(255,255,255,0.04)',
                                                    }}
                                                >
                                                    {isBufferingThis ? (
                                                        <Loader2 className="size-3.5 animate-spin text-white" />
                                                    ) : isPlayingThis ? (
                                                        <Pause className="size-3.5 text-white" />
                                                    ) : (
                                                        <Play className="size-3.5" style={{ color: isActive ? '#fff' : ACCENT }} />
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[11px] font-bold leading-tight">{t.title}</span>
                                                    {!micro && t.artist && (
                                                        <span className="block truncate text-[10px] text-muted-foreground/60">{t.artist}</span>
                                                    )}
                                                </span>
                                                {isPlayingThis && (
                                                    <span className="flex shrink-0 items-end gap-0.5" aria-hidden>
                                                        {[0, 1, 2].map((i) => (
                                                            <motion.span
                                                                key={i}
                                                                className="w-0.5 rounded-full"
                                                                style={{ background: ACCENT, height: 10 }}
                                                                animate={animate ? { scaleY: [0.4, 1, 0.5, 0.9, 0.4] } : { scaleY: 0.7 }}
                                                                transition={
                                                                    animate
                                                                        ? { duration: 0.9, repeat: Infinity, delay: i * 0.15 }
                                                                        : undefined
                                                                }
                                                            />
                                                        ))}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        {/* Sonando ahora */}
                        <div
                            className="shrink-0 rounded-2xl border border-pink-400/25 bg-white/[0.03] p-2.5"
                            role="group"
                            aria-label="Controles de reproducción"
                        >
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => prev()}
                                    disabled={!current}
                                    aria-label="Pista anterior"
                                    title="Anterior"
                                    className={cn(
                                        'grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed',
                                        FOCUS_RING,
                                    )}
                                >
                                    <SkipBack className="size-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (current) toggle();
                                        else playTrack(SAMPLE_TRACKS[0], SAMPLE_TRACKS);
                                    }}
                                    aria-label={state.playing ? 'Pausar' : 'Reproducir'}
                                    title={state.playing ? 'Pausar' : 'Reproducir'}
                                    className={cn(
                                        'grid size-9 shrink-0 place-items-center rounded-full border border-white/15 text-white shadow-lg transition-transform hover:scale-105 cursor-pointer',
                                        FOCUS_RING,
                                    )}
                                    style={{ background: `linear-gradient(135deg, ${ACCENT}, color-mix(in srgb, ${ACCENT} 45%, transparent))` }}
                                >
                                    {buffering ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : state.playing ? (
                                        <Pause className="size-4" />
                                    ) : (
                                        <Play className="size-4 translate-x-px" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => next()}
                                    disabled={!current}
                                    aria-label="Pista siguiente"
                                    title="Siguiente"
                                    className={cn(
                                        'grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed',
                                        FOCUS_RING,
                                    )}
                                >
                                    <SkipForward className="size-4" />
                                </button>

                                <span className="min-w-0 flex-1" role="status" aria-live="polite">
                                    <span className="block truncate text-[11px] font-bold leading-tight">
                                        {current ? current.title : 'Nada sonando'}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted-foreground/60">
                                        {buffering ? 'Cargando…' : current?.artist ?? 'Elige una pista'}
                                    </span>
                                </span>
                            </div>

                            {/* Progreso (seek) — solo si la pista expone duración. */}
                            {showSliders && hasProgress && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="w-8 shrink-0 text-right text-[9px] tabular-nums text-muted-foreground/60">
                                        {fmtTime(state.currentTime)}
                                    </span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={duration}
                                        step={0.5}
                                        value={Math.min(state.currentTime, duration)}
                                        onChange={(e) => seek(Number(e.target.value))}
                                        aria-label="Posición de reproducción"
                                        aria-valuetext={`${fmtTime(state.currentTime)} de ${fmtTime(duration)}`}
                                        className={cn(
                                            'h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-pink-400 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-400',
                                            FOCUS_RING,
                                        )}
                                        style={{
                                            background: `linear-gradient(90deg, ${ACCENT} ${progress * 100}%, rgba(255,255,255,0.15) ${progress * 100}%)`,
                                        }}
                                    />
                                    <span className="w-8 shrink-0 text-[9px] tabular-nums text-muted-foreground/60">
                                        {fmtTime(duration)}
                                    </span>
                                </div>
                            )}

                            {/* Volumen */}
                            {showSliders && (
                                <div className="mt-2 flex items-center gap-2">
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
                                            'h-1 flex-1 cursor-pointer appearance-none rounded-full accent-pink-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-300',
                                            FOCUS_RING,
                                        )}
                                        style={{
                                            background: `linear-gradient(90deg, ${ACCENT} ${state.volume * 100}%, rgba(255,255,255,0.15) ${state.volume * 100}%)`,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
