'use client';

// ════════════════════════════════════════════════════════════════
// MediaControlWidget — Centro de Control de Medios (con salida).
// ----------------------------------------------------------------
// Un único panel de mando para el motor de audio global del OS
// (useMediaPlayer): "sonando ahora" + transporte + volumen maestro,
// lanzamiento rápido desde el catálogo (música + radio) y una sección
// de "Salida de medios":
//   1) Enviar la visualización al fondo del sistema (Audiomorphic) →
//      conmuta config.background.type entre 'audiomorphic' y el previo,
//      vía useAppearance().updateConfig (deep-merge). Restaura el fondo
//      anterior al desactivar.
//   2) Dispositivo de salida → SOLO si el navegador lo soporta
//      (mediaDevices.enumerateDevices + HTMLMediaElement.setSinkId). La
//      enumeración ocurre tras un gesto del usuario (botón), con guardas
//      SSR. Como el motor NO expone su <audio>, el selector es
//      INFORMATIVO: la salida real la decide el sistema → se rotula con
//      honestidad ("según el sistema"); si no hay soporte, "Salida:
//      sistema" deshabilitado.
//
// Adaptabilidad (render-prop `size`):
//   • micro/compact → solo sonando-ahora + transporte + volumen.
//   • regular/expanded → añade lanzamiento rápido + salida de medios.
// Accesibilidad: controles con aria-label/title + foco visible; sliders
// con <input type=range> + aria-valuetext; "sonando ahora" en role=status
// con aria-live. Animaciones respetan animations.enabled + reduced-motion.
// Tiempos en tabular-nums. "EN VIVO" para radios; barra de progreso solo
// con duración finita > 0 y no-radio. SSR-safe (nada toca window/navigator
// fuera de efectos o handlers de gesto).
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    SlidersHorizontal,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    Volume1,
    VolumeX,
    Loader2,
    Music,
    Radio,
    Disc3,
    AudioWaveform,
    Speaker,
    Headphones,
    Check,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetShell, Chip } from '@/components/dashboard/kit';
import { useAppearance } from '@/context/appearance-context';
import { audiomorphicLayer, normalizeLayers, setAudiomorphicEnabled } from '@/lib/appearance/background-layers';
import { useMediaPlayer, type MediaTrack } from '@/components/dashboard/apps/media/media-engine';
import { SAMPLE_TRACKS, RADIO_STATIONS } from '@/components/dashboard/apps/media/media-catalog';

const ACCENT = '#F472B6';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

function fmtTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Primeras pistas de cada fuente para el "lanzamiento rápido".
const QUICK_TRACKS: MediaTrack[] = SAMPLE_TRACKS.slice(0, 3);
const QUICK_RADIOS: MediaTrack[] = RADIO_STATIONS.slice(0, 3);

interface OutputDevice {
    id: string;
    label: string;
}

export function MediaControlWidget() {
    const { config, updateConfig } = useAppearance();
    const prefersReduced = useReducedMotion();
    // Anima solo si está habilitado globalmente y el usuario no pidió menos movimiento.
    const animate = config.animations.enabled && !prefersReduced;

    const { state, playTrack, toggle, next, prev, seek, setVolume } = useMediaPlayer();
    const current = state.track;
    const isRadio = current?.kind === 'radio';

    // Progreso solo con duración finita > 0 y que no sea una radio en vivo.
    const duration = Number.isFinite(state.duration) && state.duration > 0 ? state.duration : 0;
    const hasProgress = duration > 0 && !isRadio;
    const progress = hasProgress ? Math.min(1, state.currentTime / duration) : 0;
    const buffering = state.loading && !state.playing;

    const volume = state.volume;
    const muted = volume <= 0;
    const VolIcon = muted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    // ── Salida: CAPA Audiomorphic (Adenda 68 · D) ──────────────────
    // Ya no se pisa `background.type` (eso dejaba el visualizador pegado como
    // fondo exclusivo del OS y sincronizado a toda la cuenta): se enciende o se
    // apaga SU capa. El fondo base del usuario no se toca nunca.
    const bgLayers = normalizeLayers(config.background.layers);
    const bgIsAudiomorphic = !!audiomorphicLayer(bgLayers);

    const toggleAudiomorphic = useCallback(() => {
        updateConfig({
            background: { layers: setAudiomorphicEnabled(bgLayers, !bgIsAudiomorphic) },
        } as any);
    }, [bgLayers, bgIsAudiomorphic, updateConfig]);

    // ── Salida: dispositivo (feature-detect, honesto, SSR-safe) ────
    const [outputSupported, setOutputSupported] = useState(false);
    const [devices, setDevices] = useState<OutputDevice[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
    const [enumerating, setEnumerating] = useState(false);
    const [enumError, setEnumError] = useState(false);

    // Detección de soporte (solo en cliente, dentro de efecto).
    useEffect(() => {
        if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
        const canEnumerate = typeof navigator.mediaDevices?.enumerateDevices === 'function';
        const canSetSink =
            typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
        // Solo lo damos por "soportado" si ambas piezas existen; aun así, el motor
        // no expone su <audio>, por lo que aplicarlo queda "según el sistema".
        setOutputSupported(canEnumerate && canSetSink);
    }, []);

    // Enumeración bajo gesto del usuario (clic) — evita prompts no solicitados.
    const enumerateDevices = useCallback(async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
        setEnumerating(true);
        setEnumError(false);
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            const outs = all
                .filter((d) => d.kind === 'audiooutput')
                .map((d, i) => ({
                    id: d.deviceId || `out-${i}`,
                    label: d.label || `Salida ${i + 1}`,
                }));
            setDevices(outs);
            if (!outs.some((o) => o.id === selectedDeviceId)) {
                setSelectedDeviceId(outs[0]?.id ?? 'default');
            }
        } catch {
            setEnumError(true);
        } finally {
            setEnumerating(false);
        }
    }, [selectedDeviceId]);

    return (
        <WidgetShell
            title="Control de Medios"
            subtitle="Reproductor + salida"
            icon={SlidersHorizontal}
            accent={ACCENT}
            live={isRadio && state.playing}
            connections={[
                { label: 'Reproductor', color: ACCENT, icon: Music },
                { label: 'Radio en vivo', color: '#FB923C', icon: Radio },
                { label: 'Audiomorphic', color: '#A855F7', icon: AudioWaveform },
            ]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                // Secciones extra solo con espacio suficiente (regular/expanded).
                const showExtras = !micro && size.tier !== 'compact' && size.vTier !== 'compact';

                return (
                    <div className="flex h-full flex-col gap-2.5 pt-1">
                        {/* ── Sonando ahora ───────────────────────────── */}
                        <section
                            className="shrink-0 rounded-2xl border border-pink-400/25 bg-white/[0.03] p-2.5"
                            aria-label="Sonando ahora"
                        >
                            <div className="flex items-center gap-2.5">
                                {/* Arte / icono */}
                                <span
                                    className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10"
                                    style={{
                                        background: current
                                            ? `linear-gradient(135deg, ${ACCENT}, color-mix(in srgb, ${ACCENT} 35%, transparent))`
                                            : 'rgba(255,255,255,0.04)',
                                    }}
                                >
                                    {current?.art ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={current.art}
                                            alt=""
                                            aria-hidden
                                            className="h-full w-full object-cover"
                                        />
                                    ) : isRadio ? (
                                        <Radio className="size-5" style={{ color: current ? '#fff' : ACCENT }} />
                                    ) : (
                                        <motion.span
                                            animate={animate && state.playing ? { rotate: 360 } : { rotate: 0 }}
                                            transition={
                                                animate && state.playing
                                                    ? { duration: 6, repeat: Infinity, ease: 'linear' }
                                                    : undefined
                                            }
                                        >
                                            <Disc3 className="size-5" style={{ color: current ? '#fff' : ACCENT }} />
                                        </motion.span>
                                    )}
                                </span>

                                <span className="min-w-0 flex-1" role="status" aria-live="polite">
                                    <span className="flex items-center gap-1.5">
                                        <span className="block truncate text-[12px] font-bold leading-tight">
                                            {current ? current.title : 'Nada sonando'}
                                        </span>
                                        {isRadio && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-rose-300">
                                                <motion.span
                                                    aria-hidden
                                                    className="size-1 rounded-full bg-rose-400"
                                                    animate={animate ? { opacity: [0.3, 1, 0.3] } : undefined}
                                                    transition={animate ? { duration: 1.8, repeat: Infinity } : undefined}
                                                />
                                                En vivo
                                            </span>
                                        )}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted-foreground/60">
                                        {buffering ? 'Cargando…' : current?.artist ?? 'Elige una fuente abajo'}
                                    </span>
                                </span>
                            </div>

                            {/* Transporte */}
                            <div
                                className="mt-2 flex items-center justify-center gap-3"
                                role="group"
                                aria-label="Controles de transporte"
                            >
                                <button
                                    type="button"
                                    onClick={() => prev()}
                                    disabled={!current}
                                    aria-label="Pista anterior"
                                    title="Anterior"
                                    className={cn(
                                        'grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed',
                                        FOCUS_RING,
                                    )}
                                >
                                    <SkipBack className="size-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (current) toggle();
                                        else playTrack(QUICK_TRACKS[0] ?? SAMPLE_TRACKS[0], SAMPLE_TRACKS);
                                    }}
                                    aria-label={state.playing ? 'Pausar' : 'Reproducir'}
                                    title={state.playing ? 'Pausar' : 'Reproducir'}
                                    className={cn(
                                        'grid size-10 shrink-0 place-items-center rounded-full border border-white/15 text-white shadow-lg transition-transform hover:scale-105 cursor-pointer',
                                        FOCUS_RING,
                                    )}
                                    style={{
                                        background: `linear-gradient(135deg, ${ACCENT}, color-mix(in srgb, ${ACCENT} 45%, transparent))`,
                                    }}
                                >
                                    {buffering ? (
                                        <Loader2 className="size-5 animate-spin" />
                                    ) : state.playing ? (
                                        <Pause className="size-5" />
                                    ) : (
                                        <Play className="size-5 translate-x-px" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => next()}
                                    disabled={!current}
                                    aria-label="Pista siguiente"
                                    title="Siguiente"
                                    className={cn(
                                        'grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed',
                                        FOCUS_RING,
                                    )}
                                >
                                    <SkipForward className="size-4" />
                                </button>
                            </div>

                            {/* Progreso (seek) — solo con duración finita > 0 y no radio. */}
                            {hasProgress && (
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
                                            'h-1 flex-1 cursor-pointer appearance-none rounded-full accent-pink-400 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-400',
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
                        </section>

                        {/* ── Volumen maestro ─────────────────────────── */}
                        <section
                            className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-border/40 bg-white/[0.02] px-3 py-2"
                            aria-label="Volumen maestro"
                        >
                            <button
                                type="button"
                                onClick={() => setVolume(muted ? 0.8 : 0)}
                                aria-label={muted ? 'Activar sonido' : 'Silenciar'}
                                aria-pressed={muted}
                                title={muted ? 'Activar sonido' : 'Silenciar'}
                                className={cn(
                                    'grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:text-foreground cursor-pointer',
                                    FOCUS_RING,
                                )}
                            >
                                <VolIcon className="size-4" />
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={volume}
                                onChange={(e) => setVolume(Number(e.target.value))}
                                aria-label="Volumen maestro"
                                aria-valuetext={`${Math.round(volume * 100)} por ciento`}
                                className={cn(
                                    'h-1 flex-1 cursor-pointer appearance-none rounded-full accent-pink-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-300',
                                    FOCUS_RING,
                                )}
                                style={{
                                    background: `linear-gradient(90deg, ${ACCENT} ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)`,
                                }}
                            />
                            <span className="w-8 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted-foreground/70">
                                {Math.round(volume * 100)}%
                            </span>
                        </section>

                        {/* ── Lanzamiento rápido ──────────────────────── */}
                        {showExtras && (
                            <section className="shrink-0" aria-label="Lanzamiento rápido">
                                <h4 className="mb-1.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                                    <Music className="size-3" /> Lanzamiento rápido
                                </h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {QUICK_TRACKS.map((t) => {
                                        const active = current?.id === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => {
                                                    if (active) toggle();
                                                    else playTrack(t, SAMPLE_TRACKS);
                                                }}
                                                aria-pressed={active}
                                                aria-label={`Reproducir ${t.title}${t.artist ? ` de ${t.artist}` : ''}`}
                                                title={t.artist ? `${t.title} — ${t.artist}` : t.title}
                                                className={cn(
                                                    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer hover:-translate-y-px',
                                                    FOCUS_RING,
                                                    active
                                                        ? 'border-pink-400/50 bg-pink-400/15 text-pink-100'
                                                        : 'border-border/40 bg-white/[0.03] text-foreground/85 hover:border-pink-400/30',
                                                )}
                                            >
                                                {active && state.playing ? (
                                                    <Pause className="size-3 shrink-0" />
                                                ) : (
                                                    <Play className="size-3 shrink-0" />
                                                )}
                                                <span className="truncate">{t.title}</span>
                                            </button>
                                        );
                                    })}
                                    {QUICK_RADIOS.map((r) => {
                                        const active = current?.id === r.id;
                                        return (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => {
                                                    if (active) toggle();
                                                    else playTrack(r, RADIO_STATIONS);
                                                }}
                                                aria-pressed={active}
                                                aria-label={`Sintonizar radio ${r.title}`}
                                                title={r.artist ? `${r.title} — ${r.artist}` : r.title}
                                                className={cn(
                                                    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer hover:-translate-y-px',
                                                    FOCUS_RING,
                                                    active
                                                        ? 'border-orange-400/50 bg-orange-400/15 text-orange-100'
                                                        : 'border-border/40 bg-white/[0.03] text-foreground/85 hover:border-orange-400/30',
                                                )}
                                            >
                                                <Radio className="size-3 shrink-0" />
                                                <span className="truncate">{r.title}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* ── Salida de medios ────────────────────────── */}
                        {showExtras && (
                            <section
                                className="mt-auto shrink-0 space-y-2 rounded-2xl border border-purple-400/20 bg-white/[0.02] p-2.5"
                                aria-label="Salida de medios"
                            >
                                <h4 className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                                    <Speaker className="size-3" /> Salida de medios
                                </h4>

                                {/* (1) Visualización al fondo (Audiomorphic) */}
                                <button
                                    type="button"
                                    onClick={toggleAudiomorphic}
                                    role="switch"
                                    aria-checked={bgIsAudiomorphic}
                                    aria-label="Enviar la visualización al fondo del sistema (Audiomorphic)"
                                    title="Visualización en el fondo del sistema"
                                    className={cn(
                                        'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer',
                                        FOCUS_RING,
                                        bgIsAudiomorphic
                                            ? 'border-purple-400/45 bg-purple-400/[0.1]'
                                            : 'border-border/40 bg-white/[0.02] hover:border-purple-400/30',
                                    )}
                                >
                                    <AudioWaveform
                                        className="size-4 shrink-0"
                                        style={{ color: bgIsAudiomorphic ? '#C084FC' : 'currentColor' }}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[11px] font-bold leading-tight">
                                            Visualización al fondo
                                        </span>
                                        <span className="block truncate text-[9px] text-muted-foreground/60">
                                            Audiomorphic a pantalla completa
                                        </span>
                                    </span>
                                    {/* Switch visual */}
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'relative h-4 w-7 shrink-0 rounded-full border transition-colors',
                                            bgIsAudiomorphic
                                                ? 'border-purple-400/60 bg-purple-400/40'
                                                : 'border-border/60 bg-white/10',
                                        )}
                                    >
                                        <motion.span
                                            className="absolute top-0.5 size-3 rounded-full bg-white shadow"
                                            animate={{ left: bgIsAudiomorphic ? 14 : 2 }}
                                            transition={animate ? { type: 'spring', stiffness: 500, damping: 30 } : { duration: 0 }}
                                        />
                                    </span>
                                </button>

                                {/* (2) Dispositivo de salida — honesto y feature-detected */}
                                {outputSupported ? (
                                    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70">
                                                <Headphones className="size-3" /> Dispositivo
                                            </span>
                                            <button
                                                type="button"
                                                onClick={enumerateDevices}
                                                disabled={enumerating}
                                                aria-label="Detectar dispositivos de salida"
                                                title="Detectar dispositivos"
                                                className={cn(
                                                    'inline-flex items-center gap-1 rounded-full border border-border/40 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground/80 transition-colors hover:text-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
                                                    FOCUS_RING,
                                                )}
                                            >
                                                <RefreshCw className={cn('size-2.5', enumerating && 'animate-spin')} />
                                                {devices.length ? 'Actualizar' : 'Detectar'}
                                            </button>
                                        </div>
                                        {devices.length > 0 ? (
                                            <label className="sr-only" htmlFor="media-output-device">
                                                Dispositivo de salida
                                            </label>
                                        ) : null}
                                        {devices.length > 0 ? (
                                            <select
                                                id="media-output-device"
                                                value={selectedDeviceId}
                                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                                className={cn(
                                                    'w-full cursor-pointer rounded-lg border border-border/50 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-foreground/90',
                                                    FOCUS_RING,
                                                )}
                                            >
                                                {devices.map((d) => (
                                                    <option key={d.id} value={d.id} className="bg-background text-foreground">
                                                        {d.label}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p className="text-[9px] text-muted-foreground/55">
                                                {enumError
                                                    ? 'No se pudo enumerar (permiso denegado).'
                                                    : 'Pulsa “Detectar” para listar las salidas disponibles.'}
                                            </p>
                                        )}
                                        {/* Honestidad: el motor no expone su <audio>, así que el
                                            enrutado real lo decide el sistema. */}
                                        <p className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground/50">
                                            <Check className="size-2.5 text-purple-300/70" />
                                            Enrutado según el sistema
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 opacity-70">
                                        <Speaker className="size-3.5 shrink-0 text-muted-foreground/60" />
                                        <span className="min-w-0 flex-1 text-[10px] font-semibold text-muted-foreground/65">
                                            Salida: sistema
                                        </span>
                                        <Chip color="#A855F7">No configurable</Chip>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
