'use client';

// ════════════════════════════════════════════════════════════════
// OmnifrecuenciasApp — App COMPLETA de frecuencias funcionales
// ----------------------------------------------------------------
// Estudio de síntesis multi-tono construido sobre `omni-engine`:
//   • Selector de presets (built-in + Biblioteca del usuario).
//   • Editor de tonos: añadir/quitar, freq/gain/pan, forma de onda,
//     toggles binaural / isocrónico con sus Hz.
//   • Visualizador reactivo (anillos + barras del analyser) que respeta
//     reduced-motion y config.animations.enabled.
//   • Control maestro play/stop + volumen + temporizador (auto-stop).
//   • Guardar preset en Biblioteca / Cargar / Eliminar.
//   • Recall inteligente: ofrece "continuar donde lo dejaste".
//
// Adaptativo (móvil → escritorio) vía contenedores fluidos. Estética
// cristal StarSeed (acento cian #22D3EE / lavanda). Accesible (aria,
// foco visible, tabular-nums en Hz). SSR-safe (audio/localStorage solo
// tras montar + gesto).
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Waves,
    Play,
    Square,
    Volume2,
    VolumeX,
    Plus,
    Trash2,
    Save,
    Star,
    Timer,
    Sparkles,
    RotateCcw,
    Library as LibraryIcon,
    Sliders,
    Headphones,
    Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppearance } from '@/context/appearance-context';
import {
    useOmniEngine,
    defaultTone,
    emptyConfig,
    type OmniConfig,
    type OmniTone,
    type OmniWaveform,
} from './omni-engine';
import {
    BUILTIN_PRESETS,
    listLibraryPresets,
    savePresetToLibrary,
    deletePreset,
    rememberLastConfig,
    getLastConfig,
    getFavorites,
    toggleFavorite,
    type LibraryPreset,
} from './omni-presets';

const ACCENT = '#22D3EE'; // cian StarSeed
const LAVENDER = '#A78BFA';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

const WAVEFORMS: { id: OmniWaveform; label: string }[] = [
    { id: 'sine', label: 'Senoidal' },
    { id: 'triangle', label: 'Triangular' },
    { id: 'square', label: 'Cuadrada' },
    { id: 'sawtooth', label: 'Sierra' },
];

const TIMER_OPTIONS = [0, 5, 10, 15, 30, 45, 60]; // minutos (0 = sin temporizador)

// ── Clonado profundo defensivo de una config (cada sesión es mutable) ──
function cloneConfig(c: OmniConfig): OmniConfig {
    return {
        name: c.name,
        desc: c.desc,
        masterVolume: c.masterVolume,
        tones: c.tones.map((t) => ({ ...t })),
    };
}

// ════════════════════════════════════════════════════════════════
// Visualizador — anillos + barras alimentadas por el analyser.
// ════════════════════════════════════════════════════════════════
interface VizProps {
    getAnalyser: () => AnalyserNode | null;
    playing: boolean;
    animate: boolean;
    label: string;
}

function Visualizer({ getAnalyser, playing, animate, label }: VizProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        // Si no animamos o no suena, no arrancamos el bucle (pinta estático).
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return;

        const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width * dpr));
            canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        };
        resize();

        const drawStatic = () => {
            const w = canvas.width;
            const h = canvas.height;
            ctx2d.clearRect(0, 0, w, h);
            // Línea base tenue centrada.
            ctx2d.strokeStyle = 'rgba(34,211,238,0.18)';
            ctx2d.lineWidth = dpr;
            ctx2d.beginPath();
            ctx2d.moveTo(0, h / 2);
            ctx2d.lineTo(w, h / 2);
            ctx2d.stroke();
        };

        if (!playing || !animate) {
            drawStatic();
            return () => {
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
            };
        }

        const analyser = getAnalyser();
        if (!analyser) {
            drawStatic();
            return () => {
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
            };
        }

        const buffer = new Uint8Array(analyser.frequencyBinCount);

        const render = () => {
            const w = canvas.width;
            const h = canvas.height;
            analyser.getByteFrequencyData(buffer);
            ctx2d.clearRect(0, 0, w, h);

            const bars = Math.min(48, buffer.length);
            const step = Math.floor(buffer.length / bars) || 1;
            const gap = dpr * 2;
            const barW = (w - gap * (bars - 1)) / bars;

            for (let i = 0; i < bars; i++) {
                const v = buffer[i * step] / 255;
                const barH = Math.max(dpr * 1.5, v * h * 0.92);
                const x = i * (barW + gap);
                const y = (h - barH) / 2;
                const grad = ctx2d.createLinearGradient(0, y, 0, y + barH);
                grad.addColorStop(0, 'rgba(167,139,250,0.95)');
                grad.addColorStop(1, 'rgba(34,211,238,0.85)');
                ctx2d.fillStyle = grad;
                const r = Math.min(barW / 2, dpr * 2);
                // Barra redondeada (rect simple si no hay roundRect).
                if (typeof ctx2d.roundRect === 'function') {
                    ctx2d.beginPath();
                    ctx2d.roundRect(x, y, barW, barH, r);
                    ctx2d.fill();
                } else {
                    ctx2d.fillRect(x, y, barW, barH);
                }
            }
            rafRef.current = requestAnimationFrame(render);
        };

        rafRef.current = requestAnimationFrame(render);

        const onResize = () => resize();
        window.addEventListener('resize', onResize);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', onResize);
        };
    }, [getAnalyser, playing, animate]);

    return (
        <div
            className="relative w-full overflow-hidden rounded-2xl border border-cyan-400/20 bg-black/30"
            role="img"
            aria-label={label}
        >
            {/* Anillos pulsantes detrás del canvas */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
                {playing &&
                    [0, 1, 2].map((i) => (
                        <motion.span
                            key={i}
                            aria-hidden
                            className="absolute size-24 rounded-full border"
                            style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)` }}
                            animate={
                                animate
                                    ? { scale: [0.7, 1.8], opacity: [0.5, 0] }
                                    : { scale: 1.1, opacity: 0.15 }
                            }
                            transition={
                                animate
                                    ? { duration: 3, repeat: Infinity, delay: i * 1, ease: 'easeOut' }
                                    : undefined
                            }
                        />
                    ))}
            </div>
            <canvas ref={canvasRef} className="relative block h-24 w-full sm:h-28" />
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// Slider reutilizable (cristal, accesible).
// ════════════════════════════════════════════════════════════════
interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    valueText: string;
    accent?: string;
}

function Slider({ label, value, min, max, step, onChange, valueText, accent = ACCENT }: SliderProps) {
    const pct = ((value - min) / (max - min)) * 100;
    return (
        <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                <span>{label}</span>
                <span className="tabular-nums text-foreground/80">{valueText}</span>
            </span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label={label}
                aria-valuetext={valueText}
                className={cn(
                    'h-1.5 w-full cursor-pointer appearance-none rounded-full',
                    '[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow',
                    '[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white',
                    FOCUS_RING,
                )}
                style={{
                    background: `linear-gradient(90deg, ${accent} ${pct}%, rgba(255,255,255,0.14) ${pct}%)`,
                }}
            />
        </label>
    );
}

// ════════════════════════════════════════════════════════════════
// Editor de un tono.
// ════════════════════════════════════════════════════════════════
interface ToneEditorProps {
    tone: OmniTone;
    index: number;
    canRemove: boolean;
    onChange: (patch: Partial<OmniTone>) => void;
    onRemove: () => void;
}

function ToneEditor({ tone, index, canRemove, onChange, onRemove }: ToneEditorProps) {
    const binaural = !!(tone.binauralBeat && tone.binauralBeat > 0);
    const isochronic = !!(tone.pulseHz && tone.pulseHz > 0);

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                    <span
                        className="grid size-6 place-items-center rounded-lg text-[10px] font-black text-white"
                        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${LAVENDER})` }}
                    >
                        {index + 1}
                    </span>
                    <span className="text-xs font-bold tabular-nums">
                        {tone.freq.toFixed(tone.freq % 1 === 0 ? 0 : 2)} Hz
                    </span>
                </span>
                {canRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label={`Quitar tono ${index + 1}`}
                        title="Quitar tono"
                        className={cn(
                            'grid size-7 place-items-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-red-500/10 hover:text-red-400 cursor-pointer',
                            FOCUS_RING,
                        )}
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Slider
                    label="Frecuencia"
                    value={tone.freq}
                    min={20}
                    max={1200}
                    step={1}
                    onChange={(v) => onChange({ freq: v })}
                    valueText={`${Math.round(tone.freq)} Hz`}
                />
                <Slider
                    label="Volumen del tono"
                    value={tone.gain}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => onChange({ gain: v })}
                    valueText={`${Math.round(tone.gain * 100)}%`}
                    accent={LAVENDER}
                />
                <Slider
                    label="Paneo"
                    value={tone.pan}
                    min={-1}
                    max={1}
                    step={0.05}
                    onChange={(v) => onChange({ pan: v })}
                    valueText={
                        Math.abs(tone.pan) < 0.05
                            ? 'Centro'
                            : tone.pan < 0
                              ? `Izq ${Math.round(Math.abs(tone.pan) * 100)}%`
                              : `Der ${Math.round(tone.pan * 100)}%`
                    }
                />
                {/* Selector de forma de onda */}
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Forma de onda
                    </span>
                    <div className="flex flex-wrap gap-1">
                        {WAVEFORMS.map((w) => {
                            const active = tone.waveform === w.id;
                            return (
                                <button
                                    key={w.id}
                                    type="button"
                                    onClick={() => onChange({ waveform: w.id })}
                                    aria-pressed={active}
                                    title={w.label}
                                    className={cn(
                                        'rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all cursor-pointer',
                                        FOCUS_RING,
                                        active
                                            ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                                            : 'border-white/10 bg-white/[0.02] text-muted-foreground/70 hover:border-cyan-400/30',
                                    )}
                                >
                                    {w.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Toggles binaural / isocrónico */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                    <label className="flex cursor-pointer items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold">
                            <Headphones className="size-3.5" style={{ color: ACCENT }} />
                            Binaural
                        </span>
                        <input
                            type="checkbox"
                            checked={binaural}
                            onChange={(e) =>
                                onChange({ binauralBeat: e.target.checked ? 7.83 : undefined })
                            }
                            aria-label="Activar latido binaural"
                            className={cn('size-4 cursor-pointer accent-cyan-400', FOCUS_RING)}
                        />
                    </label>
                    {binaural && (
                        <div className="mt-2">
                            <Slider
                                label="Latido"
                                value={tone.binauralBeat ?? 7.83}
                                min={0.5}
                                max={40}
                                step={0.01}
                                onChange={(v) => onChange({ binauralBeat: v })}
                                valueText={`${(tone.binauralBeat ?? 7.83).toFixed(2)} Hz`}
                            />
                        </div>
                    )}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
                    <label className="flex cursor-pointer items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold">
                            <Activity className="size-3.5" style={{ color: LAVENDER }} />
                            Isocrónico
                        </span>
                        <input
                            type="checkbox"
                            checked={isochronic}
                            onChange={(e) =>
                                onChange({ pulseHz: e.target.checked ? 10 : undefined })
                            }
                            aria-label="Activar pulsos isocrónicos"
                            className={cn('size-4 cursor-pointer accent-violet-400', FOCUS_RING)}
                        />
                    </label>
                    {isochronic && (
                        <div className="mt-2">
                            <Slider
                                label="Pulsos"
                                value={tone.pulseHz ?? 10}
                                min={0.5}
                                max={40}
                                step={0.1}
                                onChange={(v) => onChange({ pulseHz: v })}
                                valueText={`${(tone.pulseHz ?? 10).toFixed(1)} Hz`}
                                accent={LAVENDER}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// App principal.
// ════════════════════════════════════════════════════════════════
export function OmnifrecuenciasApp() {
    const { config: appearance } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = appearance.animations.enabled && !prefersReduced;

    const engine = useOmniEngine();

    // Config de trabajo (sesión editable). Arranca con el primer built-in.
    const [config, setConfig] = useState<OmniConfig>(() =>
        cloneConfig(BUILTIN_PRESETS[0].config),
    );
    // Id del preset activo (built-in o lib) para resaltar en la lista.
    const [activePresetId, setActivePresetId] = useState<string | null>(BUILTIN_PRESETS[0].id);

    // Presets de biblioteca + favoritos (hidratados tras montar → SSR-safe).
    const [libPresets, setLibPresets] = useState<LibraryPreset[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [mounted, setMounted] = useState(false);

    // Recall: oferta de "continuar donde lo dejaste".
    const [resumeConfig, setResumeConfig] = useState<OmniConfig | null>(null);

    // Temporizador de auto-stop.
    const [timerMin, setTimerMin] = useState(0);
    const [remaining, setRemaining] = useState<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Estado de guardado.
    const [savingName, setSavingName] = useState('');
    const [showSave, setShowSave] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    const refreshLibrary = useCallback(() => {
        setLibPresets(listLibraryPresets());
        setFavorites(getFavorites());
    }, []);

    // Hidratación en cliente: biblioteca, favoritos y oferta de continuar.
    useEffect(() => {
        setMounted(true);
        refreshLibrary();
        const last = getLastConfig();
        if (last) setResumeConfig(last);
        // Re-sincroniza si cambia la Biblioteca (otra pestaña / Supabase sync).
        const onLib = () => refreshLibrary();
        window.addEventListener('starseed:library', onLib);
        window.addEventListener('storage', onLib);
        return () => {
            window.removeEventListener('starseed:library', onLib);
            window.removeEventListener('storage', onLib);
        };
    }, [refreshLibrary]);

    // Limpia el temporizador al desmontar.
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // ── Reproducción ─────────────────────────────────────────────
    const startTimer = useCallback((minutes: number) => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (minutes <= 0) {
            setRemaining(null);
            return;
        }
        let secs = minutes * 60;
        setRemaining(secs);
        timerRef.current = setInterval(() => {
            secs -= 1;
            setRemaining(secs);
            if (secs <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                setRemaining(null);
                engine.stop();
            }
        }, 1000);
    }, [engine]);

    const handlePlay = useCallback(() => {
        engine.play(config);
        rememberLastConfig(config);
        startTimer(timerMin);
    }, [engine, config, timerMin, startTimer]);

    const handleStop = useCallback(() => {
        engine.stop();
        if (timerRef.current) clearInterval(timerRef.current);
        setRemaining(null);
    }, [engine]);

    // Si está sonando y cambia la config, re-aplica en vivo (sin glitch fuerte).
    const playingRef = useRef(engine.playing);
    playingRef.current = engine.playing;
    useEffect(() => {
        if (playingRef.current) {
            engine.play(config);
            rememberLastConfig(config);
        }
        // Solo re-disparamos cuando cambia la config (no en cada render).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    // ── Mutadores de config ──────────────────────────────────────
    const patchTone = useCallback((id: string, patch: Partial<OmniTone>) => {
        setConfig((c) => ({
            ...c,
            tones: c.tones.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
    }, []);

    const addTone = useCallback(() => {
        setConfig((c) =>
            c.tones.length >= 8 ? c : { ...c, tones: [...c.tones, defaultTone(528)] },
        );
    }, []);

    const removeTone = useCallback((id: string) => {
        setConfig((c) =>
            c.tones.length <= 1 ? c : { ...c, tones: c.tones.filter((t) => t.id !== id) },
        );
    }, []);

    const setMasterVolume = useCallback(
        (v: number) => {
            setConfig((c) => ({ ...c, masterVolume: v }));
            engine.setMasterVolume(v);
        },
        [engine],
    );

    // ── Presets ──────────────────────────────────────────────────
    const loadConfigInto = useCallback(
        (next: OmniConfig, presetId: string | null) => {
            const cloned = cloneConfig(next);
            setConfig(cloned);
            setActivePresetId(presetId);
            setSavingName(cloned.name);
            if (playingRef.current) {
                engine.play(cloned);
                rememberLastConfig(cloned);
            }
        },
        [engine],
    );

    const handleSave = useCallback(() => {
        const name = savingName.trim() || config.name || 'Mi frecuencia';
        const toSave: OmniConfig = { ...cloneConfig(config), name };
        savePresetToLibrary(toSave);
        rememberLastConfig(toSave);
        refreshLibrary();
        setConfig((c) => ({ ...c, name }));
        setShowSave(false);
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 2200);
    }, [savingName, config, refreshLibrary]);

    const handleDelete = useCallback(
        (id: string) => {
            deletePreset(id);
            refreshLibrary();
            if (activePresetId === id) setActivePresetId(null);
        },
        [refreshLibrary, activePresetId],
    );

    const handleToggleFav = useCallback((id: string) => {
        setFavorites(toggleFavorite(id));
    }, []);

    const handleNewSession = useCallback(() => {
        const fresh = emptyConfig('Sesión nueva');
        loadConfigInto(fresh, null);
    }, [loadConfigInto]);

    // ── Datos derivados ──────────────────────────────────────────
    const favSet = useMemo(() => new Set(favorites), [favorites]);
    const primaryFreq = config.tones[0]?.freq ?? 0;
    const vizLabel = engine.playing
        ? `Visualizador activo · ${Math.round(primaryFreq)} hercios`
        : 'Visualizador en reposo';

    const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="omni-app flex h-full min-h-0 w-full flex-col bg-gradient-to-br from-[#0a0e1a] via-[#0c1322] to-[#0a0e1a] text-foreground">
            {/* Cabecera de la app */}
            <header className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                    <span
                        className="grid size-10 place-items-center rounded-2xl border border-white/15 shadow-lg"
                        style={{ background: `linear-gradient(135deg, ${ACCENT}, ${LAVENDER})` }}
                    >
                        <Waves className="size-5 text-white drop-shadow" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-base font-black leading-tight tracking-tight sm:text-lg">
                            Omnifrecuencias
                        </h1>
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                            Estudio de frecuencias funcionales
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleNewSession}
                        title="Empezar una sesión nueva"
                        className={cn(
                            'hidden items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-muted-foreground/80 transition-all hover:border-cyan-400/30 hover:text-foreground sm:inline-flex cursor-pointer',
                            FOCUS_RING,
                        )}
                    >
                        <Sparkles className="size-3.5" />
                        Nueva sesión
                    </button>
                </div>

                {/* Oferta de continuar donde lo dejaste */}
                {mounted && resumeConfig && !engine.playing && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-1.5">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
                            <RotateCcw className="size-3.5 shrink-0" style={{ color: ACCENT }} />
                            <span className="truncate">
                                Continúa donde lo dejaste:{' '}
                                <strong className="font-bold">{resumeConfig.name}</strong>
                            </span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    loadConfigInto(resumeConfig, null);
                                    setResumeConfig(null);
                                }}
                                className={cn(
                                    'rounded-lg bg-cyan-400/20 px-2 py-1 text-[10px] font-bold text-cyan-200 transition-colors hover:bg-cyan-400/30 cursor-pointer',
                                    FOCUS_RING,
                                )}
                            >
                                Reanudar
                            </button>
                            <button
                                type="button"
                                onClick={() => setResumeConfig(null)}
                                aria-label="Descartar"
                                className={cn(
                                    'rounded-lg px-2 py-1 text-[10px] font-semibold text-muted-foreground/60 transition-colors hover:text-foreground cursor-pointer',
                                    FOCUS_RING,
                                )}
                            >
                                Descartar
                            </button>
                        </div>
                    </div>
                )}
            </header>

            {/* Cuerpo: paneles adaptativos (1 col móvil → 2 col escritorio) */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[300px_1fr]">
                {/* Panel de presets */}
                <aside className="flex min-h-0 flex-col overflow-auto custom-scrollbar border-b border-white/10 px-3 py-3 lg:border-b-0 lg:border-r">
                    <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                        <Sparkles className="size-3.5" style={{ color: ACCENT }} />
                        Presets de fábrica
                    </h2>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                        {BUILTIN_PRESETS.map((p) => {
                            const active = activePresetId === p.id;
                            const fav = favSet.has(p.id);
                            return (
                                <div
                                    key={p.id}
                                    className={cn(
                                        'group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all',
                                        active
                                            ? 'border-cyan-400/50 bg-cyan-400/[0.08]'
                                            : 'border-white/10 bg-white/[0.02] hover:border-cyan-400/30 hover:bg-white/[0.04]',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => loadConfigInto(p.config, p.id)}
                                        className={cn(
                                            'min-w-0 flex-1 text-left cursor-pointer',
                                            FOCUS_RING,
                                        )}
                                        title={p.desc}
                                    >
                                        <span className="block truncate text-xs font-bold leading-tight">
                                            {p.name}
                                        </span>
                                        <span className="block truncate text-[10px] text-muted-foreground/60">
                                            {p.desc}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleFav(p.id)}
                                        aria-pressed={fav}
                                        aria-label={fav ? 'Quitar de favoritos' : 'Marcar favorito'}
                                        title={fav ? 'Quitar de favoritos' : 'Marcar favorito'}
                                        className={cn(
                                            'grid size-6 shrink-0 place-items-center rounded-lg transition-colors cursor-pointer',
                                            fav
                                                ? 'text-amber-300'
                                                : 'text-muted-foreground/40 hover:text-amber-300',
                                            FOCUS_RING,
                                        )}
                                    >
                                        <Star className={cn('size-3.5', fav && 'fill-current')} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Presets de la biblioteca del usuario */}
                    <h2 className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                        <LibraryIcon className="size-3.5" style={{ color: LAVENDER }} />
                        Mi biblioteca
                    </h2>
                    {!mounted ? null : libPresets.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-[10px] text-muted-foreground/50">
                            Aún no has guardado frecuencias. Crea una y pulsa «Guardar en
                            biblioteca».
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 gap-1.5">
                            {libPresets.map((p) => {
                                const active = activePresetId === p.id;
                                const fav = favSet.has(p.id);
                                return (
                                    <div
                                        key={p.id}
                                        className={cn(
                                            'group flex items-center gap-1.5 rounded-xl border px-2.5 py-2 transition-all',
                                            active
                                                ? 'border-violet-400/50 bg-violet-400/[0.08]'
                                                : 'border-white/10 bg-white/[0.02] hover:border-violet-400/30 hover:bg-white/[0.04]',
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => loadConfigInto(p.config, p.id)}
                                            className={cn(
                                                'min-w-0 flex-1 text-left cursor-pointer',
                                                FOCUS_RING,
                                            )}
                                            title={`Cargar ${p.name}`}
                                        >
                                            <span className="block truncate text-xs font-bold leading-tight">
                                                {p.name}
                                            </span>
                                            <span className="block truncate text-[10px] text-muted-foreground/60">
                                                {p.config.tones.length} tono
                                                {p.config.tones.length !== 1 ? 's' : ''} · archivo
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleFav(p.id)}
                                            aria-pressed={fav}
                                            aria-label={fav ? 'Quitar de favoritos' : 'Marcar favorito'}
                                            title={fav ? 'Quitar de favoritos' : 'Marcar favorito'}
                                            className={cn(
                                                'grid size-6 shrink-0 place-items-center rounded-lg transition-colors cursor-pointer',
                                                fav
                                                    ? 'text-amber-300'
                                                    : 'text-muted-foreground/40 hover:text-amber-300',
                                                FOCUS_RING,
                                            )}
                                        >
                                            <Star className={cn('size-3.5', fav && 'fill-current')} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(p.id)}
                                            aria-label={`Eliminar ${p.name}`}
                                            title="Eliminar de la biblioteca"
                                            className={cn(
                                                'grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-red-500/10 hover:text-red-400 cursor-pointer',
                                                FOCUS_RING,
                                            )}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </aside>

                {/* Panel principal: visualizador + transporte + editor */}
                <main className="flex min-h-0 flex-col overflow-auto custom-scrollbar px-3 py-3 sm:px-4">
                    {/* Visualizador */}
                    <Visualizer
                        getAnalyser={engine.getAnalyser}
                        playing={engine.playing}
                        animate={animate}
                        label={vizLabel}
                    />

                    {/* Lectura de frecuencia principal */}
                    <div className="mt-2 flex items-center justify-center gap-2 text-center">
                        <span
                            className="text-2xl font-black tabular-nums sm:text-3xl"
                            style={{ color: engine.playing ? ACCENT : 'rgba(255,255,255,0.5)' }}
                        >
                            {Math.round(primaryFreq)}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                            Hz {config.tones.length > 1 ? `· +${config.tones.length - 1}` : ''}
                        </span>
                    </div>

                    {/* Transporte: play/stop + volumen + temporizador */}
                    <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-cyan-400/20 bg-white/[0.02] p-3">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={engine.playing ? handleStop : handlePlay}
                                aria-pressed={engine.playing}
                                aria-label={engine.playing ? 'Detener' : 'Reproducir'}
                                className={cn(
                                    'grid size-12 shrink-0 place-items-center rounded-full text-white shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer',
                                    FOCUS_RING,
                                )}
                                style={{
                                    background: engine.playing
                                        ? `linear-gradient(135deg, #f43f5e, #fb7185)`
                                        : `linear-gradient(135deg, ${ACCENT}, ${LAVENDER})`,
                                }}
                            >
                                {engine.playing ? (
                                    <Square className="size-5 fill-current" />
                                ) : (
                                    <Play className="size-5 fill-current" />
                                )}
                            </button>

                            {/* Volumen maestro */}
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setMasterVolume(config.masterVolume > 0 ? 0 : 0.5)
                                    }
                                    aria-label={config.masterVolume > 0 ? 'Silenciar' : 'Activar sonido'}
                                    title={config.masterVolume > 0 ? 'Silenciar' : 'Activar sonido'}
                                    className={cn(
                                        'grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground cursor-pointer',
                                        FOCUS_RING,
                                    )}
                                >
                                    {config.masterVolume > 0 ? (
                                        <Volume2 className="size-4" />
                                    ) : (
                                        <VolumeX className="size-4" />
                                    )}
                                </button>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={config.masterVolume}
                                    onChange={(e) => setMasterVolume(Number(e.target.value))}
                                    aria-label="Volumen maestro"
                                    aria-valuetext={`${Math.round(config.masterVolume * 100)} por ciento`}
                                    className={cn(
                                        'h-1.5 flex-1 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
                                        FOCUS_RING,
                                    )}
                                    style={{
                                        background: `linear-gradient(90deg, ${ACCENT} ${config.masterVolume * 100}%, rgba(255,255,255,0.14) ${config.masterVolume * 100}%)`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Temporizador */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                <Timer className="size-3.5" />
                                Temporizador
                            </span>
                            {TIMER_OPTIONS.map((m) => {
                                const active = timerMin === m;
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => {
                                            setTimerMin(m);
                                            if (engine.playing) startTimer(m);
                                        }}
                                        aria-pressed={active}
                                        className={cn(
                                            'rounded-lg border px-2 py-0.5 text-[10px] font-bold tabular-nums transition-all cursor-pointer',
                                            FOCUS_RING,
                                            active
                                                ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                                                : 'border-white/10 bg-white/[0.02] text-muted-foreground/70 hover:border-cyan-400/30',
                                        )}
                                    >
                                        {m === 0 ? 'Off' : `${m}m`}
                                    </button>
                                );
                            })}
                            {remaining !== null && (
                                <span className="ml-auto rounded-lg bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black tabular-nums text-cyan-200">
                                    {fmtTime(remaining)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Editor de tonos */}
                    <div className="mt-3 flex items-center justify-between">
                        <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                            <Sliders className="size-3.5" style={{ color: ACCENT }} />
                            Tonos ({config.tones.length}/8)
                        </h2>
                        <button
                            type="button"
                            onClick={addTone}
                            disabled={config.tones.length >= 8}
                            aria-label="Añadir tono"
                            className={cn(
                                'inline-flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-400/[0.06] px-2.5 py-1 text-[11px] font-bold text-cyan-200 transition-all hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer',
                                FOCUS_RING,
                            )}
                        >
                            <Plus className="size-3.5" />
                            Añadir tono
                        </button>
                    </div>

                    <div className="mt-2 flex flex-col gap-2">
                        {config.tones.map((t, i) => (
                            <ToneEditor
                                key={t.id}
                                tone={t}
                                index={i}
                                canRemove={config.tones.length > 1}
                                onChange={(patch) => patchTone(t.id, patch)}
                                onRemove={() => removeTone(t.id)}
                            />
                        ))}
                    </div>

                    {/* Acciones de guardado */}
                    <div className="mt-3 rounded-2xl border border-violet-400/20 bg-white/[0.02] p-3">
                        {!showSave ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSavingName(config.name);
                                    setShowSave(true);
                                }}
                                className={cn(
                                    'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/[0.08] px-3 py-2 text-sm font-bold text-violet-100 transition-all hover:bg-violet-400/15 cursor-pointer',
                                    FOCUS_RING,
                                )}
                            >
                                <Save className="size-4" />
                                {justSaved ? 'Guardado en tu biblioteca ✓' : 'Guardar en biblioteca'}
                            </button>
                        ) : (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    type="text"
                                    value={savingName}
                                    onChange={(e) => setSavingName(e.target.value)}
                                    placeholder="Nombre del preset"
                                    aria-label="Nombre del preset"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSave();
                                        if (e.key === 'Escape') setShowSave(false);
                                    }}
                                    className={cn(
                                        'min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm font-semibold outline-none placeholder:text-muted-foreground/40',
                                        FOCUS_RING,
                                    )}
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 rounded-xl bg-violet-500/80 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 cursor-pointer',
                                            FOCUS_RING,
                                        )}
                                    >
                                        <Save className="size-4" />
                                        Guardar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowSave(false)}
                                        className={cn(
                                            'rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-muted-foreground/70 transition-colors hover:text-foreground cursor-pointer',
                                            FOCUS_RING,
                                        )}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                        <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
                            Se guarda como archivo en tu Biblioteca soberana y se sincroniza con tu
                            cuenta.
                        </p>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default OmnifrecuenciasApp;
