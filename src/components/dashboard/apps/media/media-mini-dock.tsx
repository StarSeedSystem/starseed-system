'use client';

// ════════════════════════════════════════════════════════════════
// MediaMiniDock — Mini-reproductor global flotante (estilo dock Trinity)
// ----------------------------------------------------------------
// Barra de cristal compacta, fixed, centrada abajo, que se cuelga del
// motor de medios compartido (useMediaPlayer / media-engine). Es un
// reproductor "ambiente": aparece SOLO cuando hay algo cargado y permite
// controlar la pista/radio en curso desde cualquier punto del OS sin
// tener que volver al widget de Reproductor o Radio.
//
// No es un widget (no usa WidgetShell): es un overlay de sistema, por eso
// vive en z-[90] — por encima del contenido, por debajo de las ventanas
// modales (z-[120]). Cuando no hay track no renderiza nada y no intercepta
// punteros.
//
// SSR-safety: el estado `mounted` evita leer del navegador (o renderizar
// portales/anim dependientes del cliente) hasta después del primer effect.
// El motor ya es SSR-safe por su cuenta.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    Music,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Volume1,
    Loader2,
    X,
    Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaPlayer } from '@/components/dashboard/apps/media/media-engine';
import { useAppearance } from '@/context/appearance-context';

// ── Utilidad: segundos → mm:ss (defensiva ante NaN/∞/negativos) ──
function formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MediaMiniDock() {
    const { state, toggle, next, prev, seek, setVolume, pause } = useMediaPlayer();
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();

    const [mounted, setMounted] = useState(false);
    // El usuario puede ocultar el dock (botón cerrar). El motor no tiene un
    // método "stop/clear", así que cerramos = pausar + ocultar localmente. Si
    // se carga una pista nueva, volvemos a mostrarlo (efecto sobre track.id).
    const [hidden, setHidden] = useState(false);
    const [showVolume, setShowVolume] = useState(false);
    const volumeWrapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const track = state.track;
    const trackId = track?.id ?? null;

    // Reaparecer cuando cambia la pista cargada (nueva reproducción explícita).
    useEffect(() => {
        if (trackId) setHidden(false);
    }, [trackId]);

    // Cerrar el popover de volumen al hacer clic fuera.
    useEffect(() => {
        if (!showVolume) return;
        const onPointerDown = (e: PointerEvent) => {
            if (
                volumeWrapRef.current &&
                e.target instanceof Node &&
                !volumeWrapRef.current.contains(e.target)
            ) {
                setShowVolume(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [showVolume]);

    const animationsOn = (config.animations?.enabled ?? true) && !prefersReduced;

    const isRadio = track?.kind === 'radio';
    const hasProgress = Number.isFinite(state.duration) && state.duration > 0 && !isRadio;
    const progressPct = hasProgress
        ? Math.max(0, Math.min(100, (state.currentTime / state.duration) * 100))
        : 0;

    const VolumeIcon = useMemo(() => {
        if (state.volume <= 0.001) return VolumeX;
        if (state.volume < 0.5) return Volume1;
        return Volume2;
    }, [state.volume]);

    // No renderizamos NADA (ni interceptamos punteros) hasta montar, sin track
    // o si el usuario lo ocultó.
    if (!mounted || !track || hidden) return null;

    const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!hasProgress) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seek(ratio * state.duration);
    };

    const playLabel = state.playing ? 'Pausar' : 'Reproducir';

    return (
        <AnimatePresence>
            <motion.div
                key="media-mini-dock"
                role="region"
                aria-label="Mini-reproductor de medios"
                initial={animationsOn ? { opacity: 0, y: 24, scale: 0.96 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={animationsOn ? { opacity: 0, y: 24, scale: 0.96 } : { opacity: 0 }}
                transition={
                    animationsOn
                        ? { type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }
                        : { duration: 0 }
                }
                className={cn(
                    'fixed bottom-4 left-1/2 -translate-x-1/2 z-[90]',
                    'w-[min(480px,calc(100vw-1.5rem))]',
                    'rounded-2xl border border-border/60 bg-card/80 backdrop-blur-2xl',
                    'shadow-2xl text-foreground isolate overflow-hidden',
                )}
            >
                {/* Hairline de acento superior (identidad StarSeed). En radio usa el
                    crimson de "Anchor"/en vivo; en música, el primary del tema. */}
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px] z-10 opacity-80"
                    style={{
                        background: isRadio
                            ? 'linear-gradient(90deg, transparent, #DC143C, transparent)'
                            : 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)',
                    }}
                />

                <div className="relative z-[1] flex items-center gap-3 px-3 py-2.5">
                    {/* Arte / icono */}
                    <div className="relative shrink-0 size-11 rounded-xl overflow-hidden border border-white/15 shadow-lg grid place-items-center bg-gradient-to-br from-primary/30 to-primary/5">
                        {track.art ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={track.art}
                                alt=""
                                className="absolute inset-0 size-full object-cover"
                            />
                        ) : isRadio ? (
                            <Radio className="size-5 text-foreground/80" strokeWidth={2} />
                        ) : (
                            <Music className="size-5 text-foreground/80" strokeWidth={2} />
                        )}
                        {state.loading && (
                            <span className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[1px]">
                                <Loader2 className="size-4 animate-spin text-white" />
                            </span>
                        )}
                    </div>

                    {/* Título + artista */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-semibold leading-tight">
                                {track.title}
                            </p>
                            {isRadio && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#DC143C]/40 bg-[#DC143C]/15 px-1.5 py-0.5">
                                    <motion.span
                                        animate={animationsOn ? { opacity: [0.4, 1, 0.4] } : undefined}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="size-1.5 rounded-full bg-[#DC143C] shadow-[0_0_6px_#DC143C]"
                                    />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-[#DC143C]">
                                        En vivo
                                    </span>
                                </span>
                            )}
                        </div>
                        {track.artist && (
                            <p className="truncate text-[11px] text-muted-foreground/80 leading-tight">
                                {track.artist}
                            </p>
                        )}
                    </div>

                    {/* Controles de transporte */}
                    <div className="shrink-0 flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={prev}
                            aria-label="Pista anterior"
                            title="Anterior"
                            className="grid place-items-center size-8 rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <SkipBack className="size-4" />
                        </button>

                        <button
                            type="button"
                            onClick={toggle}
                            aria-label={playLabel}
                            title={playLabel}
                            className="grid place-items-center size-9 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                        >
                            {state.playing ? (
                                <Pause className="size-4" />
                            ) : (
                                <Play className="size-4 translate-x-px" />
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={next}
                            aria-label="Pista siguiente"
                            title="Siguiente"
                            className="grid place-items-center size-8 rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <SkipForward className="size-4" />
                        </button>
                    </div>

                    {/* Volumen (popover compacto) */}
                    <div ref={volumeWrapRef} className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setShowVolume((v) => !v)}
                            aria-label="Control de volumen"
                            aria-expanded={showVolume}
                            title="Volumen"
                            className="grid place-items-center size-8 rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <VolumeIcon className="size-4" />
                        </button>

                        <AnimatePresence>
                            {showVolume && (
                                <motion.div
                                    initial={animationsOn ? { opacity: 0, y: 6, scale: 0.96 } : false}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={animationsOn ? { opacity: 0, y: 6, scale: 0.96 } : { opacity: 0 }}
                                    transition={animationsOn ? { duration: 0.16 } : { duration: 0 }}
                                    className="absolute bottom-full right-0 mb-2 rounded-xl border border-border/60 bg-card/90 backdrop-blur-2xl shadow-2xl px-3 py-2.5"
                                >
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={state.volume}
                                        onChange={(e) => setVolume(Number(e.target.value))}
                                        aria-label="Nivel de volumen"
                                        className="h-1.5 w-28 cursor-pointer accent-primary"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Cerrar (pausa + oculta) */}
                    <button
                        type="button"
                        onClick={() => {
                            pause();
                            setShowVolume(false);
                            setHidden(true);
                        }}
                        aria-label="Cerrar reproductor"
                        title="Cerrar reproductor"
                        className="grid place-items-center size-8 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Barra de progreso + tiempos — solo si hay duración fiable
                    (las radios en vivo no exponen duración → se omite). */}
                {hasProgress ? (
                    <div className="relative z-[1] flex items-center gap-2 px-3 pb-2.5 -mt-0.5">
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70 w-9 text-right">
                            {formatTime(state.currentTime)}
                        </span>
                        <div
                            role="slider"
                            aria-label="Posición de reproducción"
                            aria-valuemin={0}
                            aria-valuemax={Math.floor(state.duration)}
                            aria-valuenow={Math.floor(state.currentTime)}
                            tabIndex={0}
                            onClick={handleSeekClick}
                            className="group relative h-3 flex-1 flex items-center cursor-pointer"
                        >
                            <span className="absolute inset-x-0 h-1 rounded-full bg-white/15" />
                            <span
                                className="absolute left-0 h-1 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                                style={{ width: `${progressPct}%` }}
                            />
                            <span
                                className="absolute size-2.5 -translate-x-1/2 rounded-full bg-primary shadow opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ left: `${progressPct}%` }}
                            />
                        </div>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70 w-9">
                            {formatTime(state.duration)}
                        </span>
                    </div>
                ) : (
                    isRadio && (
                        <div className="relative z-[1] flex items-center gap-2 px-3 pb-2.5 -mt-0.5">
                            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60">
                                {state.loading ? 'Conectando…' : state.playing ? 'Transmisión en directo' : 'En pausa'}
                            </span>
                        </div>
                    )
                )}
            </motion.div>
        </AnimatePresence>
    );
}
