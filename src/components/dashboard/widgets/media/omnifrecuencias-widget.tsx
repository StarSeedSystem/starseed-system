'use client';

// ════════════════════════════════════════════════════════════════
// OmnifrecuenciasWidget — Estudio de frecuencias funcionales (compacto)
// ----------------------------------------------------------------
// Versión widget de la app REAL "Omni-Frecuencias" ya portada al OS. NO
// reimplementa nada: usa EL MISMO motor WebAudio (`useAudio`), los MISMOS
// datos (`data/frequencies`) y las MISMAS recetas de sinergia
// (`data/synergy-recipes`) que la app completa, más los presets de la
// Biblioteca SOBERANA (`useFileSystem` → `@/lib/library-store`,
// sincronizada con Supabase). Tres facetas adaptativas:
//
//   • Reproductor — frecuencias destacadas (curado de la biblioteca real)
//     + filtro por categoría. Tocar una añade su(s) oscilador(es) al motor
//     (sinergias = stack multi-oscilador); "Detener" para por completo.
//     Volumen maestro + sonando-ahora.
//   • Generador compacto — 1..N osciladores (freq · onda · volumen ·
//     binaural) reusando la lógica de OscillatorControls condensada en
//     `CompactOscillator`. Añadir / quitar / silenciar por capa.
//   • Presets — cargar/guardar en la Biblioteca soberana (useFileSystem):
//     quick-presets del usuario + "Guardar actual".
//
// Interconexión con la app: botón "Abrir app completa" emite
// `window` → 'starseed:open-omnifrecuencias' (el OmniAppHost la abre en
// ventana del OS). El motor de la app es un hook con refs (no singleton),
// así que el widget usa su PROPIA instancia de `useAudio` (mismo código)
// y, para coherencia, persiste la mezcla como "última sesión"
// (`useOmniLastSession`) en el MISMO modelo `OscillatorState[]`, de modo
// que la app completa puede continuarla y los presets son intercambiables.
//
// Adaptatividad (WidgetShell render-prop `size`): micro = reproductor
// mínimo (sin pestañas, sin visualizador); compact+ = pestañas y dos
// columnas donde quepa. Estética cristal, acento cian #22D3EE, respeta
// `config.animations` + prefers-reduced-motion, accesible. AudioContext y
// localStorage solo se tocan tras un gesto del usuario.
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Waves,
    Play,
    Square,
    Volume2,
    VolumeX,
    Maximize2,
    Plus,
    Save,
    FolderOpen,
    Sliders,
    ListMusic,
    Trash2,
    Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetShell } from '@/components/dashboard/kit';
import { useAppearance } from '@/context/appearance-context';
import { useAudio } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useAudio';
import { useFileSystem } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useFileSystem';
import {
    rememberLastSession,
} from '@/components/dashboard/apps/omnifrecuencias/frecuencias/hooks/useOmniLastSession';
import { FEATURED_FREQUENCIES } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/data/featured-frequencies';
import {
    frequencyToOscillators,
    resolveFrequency,
} from '@/components/dashboard/apps/omnifrecuencias/frecuencias/data/synergy-recipes';
import { CATEGORIES, type CategoryId, type PresetContent } from '@/components/dashboard/apps/omnifrecuencias/frecuencias/types';
import CompactOscillator from '@/components/dashboard/apps/omnifrecuencias/frecuencias/components/CompactOscillator';
import Visualizer from '@/components/dashboard/apps/omnifrecuencias/frecuencias/components/Visualizer';

const ACCENT = '#22D3EE';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

type Tab = 'play' | 'gen' | 'presets';

// Categorías ofrecidas como filtro rápido en el reproductor (las más usadas
// para el set destacado). 'all' siempre primero.
const FILTER_CATEGORIES: CategoryId[] = ['all', 'solfeggio', 'brain', 'planetary', 'synergy'];

/** Abre la app completa: evento para el OmniAppHost (ventana del OS). */
function openFullApp(): void {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent('starseed:open-omnifrecuencias'));
    } catch {
        /* noop */
    }
}

export function OmnifrecuenciasWidget() {
    const { config: appearance } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = appearance.animations.enabled && !prefersReduced;

    // ── Motor real (misma instancia/código que la app completa) ──────
    const audio = useAudio();
    const {
        isPlaying,
        oscillators,
        masterVolume,
        toggleMasterPlay,
        updateMasterVolume,
        addOscillator,
        removeOscillator,
        updateOscillator,
        getMasterAnalyser,
        getOscillatorAnalyser,
    } = audio;

    // ── Presets en la Biblioteca soberana (Supabase-sync) ────────────
    const fs = useFileSystem();

    const [tab, setTab] = useState<Tab>('play');
    const [filter, setFilter] = useState<CategoryId>('all');
    const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
    const [presetName, setPresetName] = useState('');
    const [mutedVol, setMutedVol] = useState(0.4); // recuerda el volumen antes de silenciar

    const activeCount = oscillators.filter((o) => o.isPlaying).length;
    const hasMix = oscillators.length > 0;

    // Persistencia "última sesión" (modelo real) para recall por la app.
    useEffect(() => {
        if (oscillators.length > 0) rememberLastSession(oscillators);
    }, [oscillators]);

    /** Asegura que el contexto suena (sin pausarlo si ya está en marcha). */
    const ensurePlaying = useCallback(() => {
        if (!isPlaying) {
            // toggleMasterPlay alterna; solo lo llamamos cuando NO suena.
            void toggleMasterPlay();
        }
    }, [isPlaying, toggleMasterPlay]);

    /** Detiene TODO: elimina todos los osciladores del motor. */
    const stopAll = useCallback(() => {
        oscillators.forEach((o) => removeOscillator(o.id));
        setLastPlayedId(null);
    }, [oscillators, removeOscillator]);

    /** Reproduce una frecuencia destacada (replace): limpia y añade su receta. */
    const playFeatured = useCallback(
        (id: string) => {
            const item = FEATURED_FREQUENCIES.find((f) => f.id === id);
            if (!item) return;
            // Toggle: si ya es la activa, parar.
            if (lastPlayedId === id) {
                stopAll();
                return;
            }
            // Replace: limpia la mezcla previa y añade la nueva.
            oscillators.forEach((o) => removeOscillator(o.id));
            const recipe = frequencyToOscillators(item);
            recipe.forEach((params) => addOscillator(params));
            ensurePlaying();
            setLastPlayedId(id);
        },
        [lastPlayedId, oscillators, removeOscillator, addOscillator, ensurePlaying, stopAll],
    );

    /** Añade una frecuencia a la mezcla SIN limpiar (capa extra → generador). */
    const addFeatured = useCallback(
        (id: string) => {
            const item = FEATURED_FREQUENCIES.find((f) => f.id === id);
            if (!item) return;
            frequencyToOscillators(item).forEach((params) => addOscillator(params));
            ensurePlaying();
            setLastPlayedId(null); // ya es una mezcla, no una sola destacada
            setTab('gen');
        },
        [addOscillator, ensurePlaying],
    );

    const changeMasterVolume = useCallback(
        (v: number) => {
            updateMasterVolume(v);
            if (v > 0) setMutedVol(v);
        },
        [updateMasterVolume],
    );

    const toggleMute = useCallback(() => {
        if (masterVolume > 0) {
            setMutedVol(masterVolume);
            updateMasterVolume(0);
        } else {
            updateMasterVolume(mutedVol > 0 ? mutedVol : 0.4);
        }
    }, [masterVolume, mutedVol, updateMasterVolume]);

    // ── Presets ──────────────────────────────────────────────────────
    const saveCurrent = useCallback(() => {
        if (!hasMix) return;
        const name = presetName.trim() || `Preset ${new Date().toLocaleTimeString().slice(0, 5)}`;
        const content: PresetContent = {
            oscillators,
            dateCreated: Date.now(),
            description: 'Guardado desde el widget',
        };
        fs.savePreset(name, content);
        setPresetName('');
    }, [hasMix, presetName, oscillators, fs]);

    const loadPreset = useCallback(
        (content: PresetContent) => {
            // Replace: limpia y carga las capas del preset (ids nuevos).
            oscillators.forEach((o) => removeOscillator(o.id));
            content.oscillators.forEach((osc) => {
                const { id: _id, ...props } = osc;
                void _id;
                addOscillator(props);
            });
            ensurePlaying();
            setLastPlayedId(null);
        },
        [oscillators, removeOscillator, addOscillator, ensurePlaying],
    );

    // Datos derivados del reproductor (filtro por categoría).
    const visibleFeatured = useMemo(
        () =>
            filter === 'all'
                ? FEATURED_FREQUENCIES
                : FEATURED_FREQUENCIES.filter((f) => f.category === filter),
        [filter],
    );

    const nowPlayingLabel = useMemo(() => {
        if (!hasMix) return null;
        if (activeCount === 1) {
            return oscillators.find((o) => o.isPlaying)?.name ?? 'Frecuencia';
        }
        if (activeCount === 0) return 'Silencio';
        return `${activeCount} capas en mezcla`;
    }, [hasMix, activeCount, oscillators]);

    return (
        <WidgetShell
            title="Omnifrecuencias"
            subtitle="Estudio de frecuencias"
            icon={Waves}
            accent={ACCENT}
            live={isPlaying && activeCount > 0}
            onExpand={openFullApp}
            connections={[
                { label: 'Biblioteca', color: '#A78BFA' },
                { label: 'Reproductor', color: '#F472B6' },
            ]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                const twoCol = size.tier === 'expanded';
                // En micro forzamos siempre la faceta reproductor.
                const activeTab: Tab = micro ? 'play' : tab;

                return (
                    <div className="flex h-full flex-col gap-2 pt-1">
                        {/* ── Tabs (no en micro) ───────────────────────────── */}
                        {!micro && (
                            <div
                                role="tablist"
                                aria-label="Modo del estudio de frecuencias"
                                className="flex shrink-0 items-center gap-1 rounded-xl border border-border/40 bg-black/20 p-1"
                            >
                                <TabButton
                                    active={activeTab === 'play'}
                                    icon={ListMusic}
                                    label="Reproductor"
                                    onClick={() => setTab('play')}
                                />
                                <TabButton
                                    active={activeTab === 'gen'}
                                    icon={Sliders}
                                    label="Generador"
                                    badge={hasMix ? oscillators.length : undefined}
                                    onClick={() => setTab('gen')}
                                />
                                <TabButton
                                    active={activeTab === 'presets'}
                                    icon={FolderOpen}
                                    label="Presets"
                                    badge={fs.presets.length || undefined}
                                    onClick={() => setTab('presets')}
                                />
                            </div>
                        )}

                        {/* ── Now playing / master visualizer (no en micro) ── */}
                        {!micro && (
                            <div
                                className="relative flex shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border border-cyan-400/20 bg-white/[0.02] px-2.5 py-2"
                                role="status"
                                aria-live="polite"
                            >
                                <div className="relative grid size-9 shrink-0 place-items-center">
                                    {isPlaying && activeCount > 0 && animate && (
                                        <motion.span
                                            aria-hidden
                                            className="absolute inset-0 rounded-full border"
                                            style={{
                                                borderColor: `color-mix(in srgb, ${ACCENT} 50%, transparent)`,
                                            }}
                                            animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                                            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                                        />
                                    )}
                                    <span
                                        className="grid size-9 place-items-center rounded-full border border-white/15"
                                        style={{
                                            background:
                                                isPlaying && activeCount > 0
                                                    ? `radial-gradient(circle, ${ACCENT}, color-mix(in srgb, ${ACCENT} 25%, transparent))`
                                                    : 'rgba(255,255,255,0.04)',
                                        }}
                                    >
                                        <Waves
                                            className="size-4"
                                            style={{
                                                color: isPlaying && activeCount > 0 ? '#fff' : ACCENT,
                                            }}
                                        />
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-bold leading-tight text-foreground/90">
                                        {nowPlayingLabel ?? 'Sin frecuencia activa'}
                                    </p>
                                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                        {hasMix ? (isPlaying ? 'Reproduciendo' : 'En pausa') : 'Listo'}
                                    </p>
                                </div>
                                {/* mini master visualizer */}
                                {size.tier !== 'compact' && (
                                    <div className="hidden h-8 w-20 overflow-hidden rounded-lg border border-white/10 bg-black/40 @[15rem]:block">
                                        <Visualizer
                                            analyser={getMasterAnalyser()}
                                            height={32}
                                            color={isPlaying ? ACCENT : '#475569'}
                                            type="fill"
                                        />
                                    </div>
                                )}
                                {hasMix && (
                                    <button
                                        type="button"
                                        onClick={hasMix ? () => void toggleMasterPlay() : undefined}
                                        aria-label={isPlaying ? 'Pausar' : 'Reanudar'}
                                        title={isPlaying ? 'Pausar' : 'Reanudar'}
                                        className={cn(
                                            'grid size-7 shrink-0 place-items-center rounded-full border border-cyan-400/40 text-cyan-200 transition-colors hover:bg-cyan-400/15 cursor-pointer',
                                            FOCUS_RING,
                                        )}
                                    >
                                        {isPlaying ? (
                                            <Square className="size-3.5" />
                                        ) : (
                                            <Play className="size-3.5" />
                                        )}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* ── Body por pestaña ─────────────────────────────── */}
                        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
                            {activeTab === 'play' && (
                                <PlayPanel
                                    micro={micro}
                                    twoCol={twoCol}
                                    items={visibleFeatured}
                                    filter={filter}
                                    setFilter={setFilter}
                                    lastPlayedId={lastPlayedId}
                                    onPlay={playFeatured}
                                    onAdd={micro ? undefined : addFeatured}
                                />
                            )}

                            {activeTab === 'gen' && !micro && (
                                <GeneratorPanel
                                    oscillators={oscillators}
                                    update={updateOscillator}
                                    remove={removeOscillator}
                                    getOscillatorAnalyser={getOscillatorAnalyser}
                                    onAdd={() => {
                                        addOscillator();
                                        ensurePlaying();
                                        setLastPlayedId(null);
                                    }}
                                    onClear={stopAll}
                                    twoCol={twoCol}
                                />
                            )}

                            {activeTab === 'presets' && !micro && (
                                <PresetsPanel
                                    presets={fs.presets}
                                    presetName={presetName}
                                    setPresetName={setPresetName}
                                    canSave={hasMix}
                                    onSave={saveCurrent}
                                    onLoad={loadPreset}
                                    onDelete={fs.deletePreset}
                                />
                            )}
                        </div>

                        {/* ── Footer: volumen maestro + abrir app ──────────── */}
                        <div className="flex shrink-0 flex-col gap-1.5">
                            {!micro && (
                                <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-white/[0.02] px-2.5 py-1.5">
                                    <button
                                        type="button"
                                        onClick={toggleMute}
                                        aria-label={masterVolume > 0 ? 'Silenciar' : 'Activar sonido'}
                                        title={masterVolume > 0 ? 'Silenciar' : 'Activar sonido'}
                                        className={cn(
                                            'grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground cursor-pointer',
                                            FOCUS_RING,
                                        )}
                                    >
                                        {masterVolume > 0 ? (
                                            <Volume2 className="size-3.5" />
                                        ) : (
                                            <VolumeX className="size-3.5" />
                                        )}
                                    </button>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={masterVolume}
                                        onChange={(e) => changeMasterVolume(Number(e.target.value))}
                                        aria-label="Volumen maestro"
                                        aria-valuetext={`${Math.round(masterVolume * 100)} por ciento`}
                                        className={cn(
                                            'h-1 flex-1 cursor-pointer appearance-none rounded-full accent-cyan-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-300',
                                            FOCUS_RING,
                                        )}
                                        style={{
                                            background: `linear-gradient(90deg, ${ACCENT} ${masterVolume * 100}%, rgba(255,255,255,0.15) ${masterVolume * 100}%)`,
                                        }}
                                    />
                                    {hasMix && (
                                        <button
                                            type="button"
                                            onClick={stopAll}
                                            aria-label="Detener todo"
                                            title="Detener todo"
                                            className={cn(
                                                'grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-red-400 cursor-pointer',
                                                FOCUS_RING,
                                            )}
                                        >
                                            <Square className="size-3" />
                                        </button>
                                    )}
                                </div>
                            )}

                            <a
                                href="/omnifrecuencias"
                                onClick={(e) => {
                                    // Preferimos abrir en ventana del OS (evento). Si nadie lo
                                    // intercepta, el href navega de todos modos.
                                    e.preventDefault();
                                    openFullApp();
                                }}
                                className={cn(
                                    'inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.06] px-3 py-1.5 text-[11px] font-bold text-cyan-200 transition-all hover:bg-cyan-400/15 cursor-pointer',
                                    FOCUS_RING,
                                )}
                            >
                                <Maximize2 className="size-3.5" />
                                Abrir app completa
                            </a>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}

// ─────────────────────────────────────────────────────────────────
// Subcomponentes internos del widget (privados)
// ─────────────────────────────────────────────────────────────────

interface TabButtonProps {
    active: boolean;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    badge?: number;
    onClick: () => void;
}

function TabButton({ active, icon: Icon, label, badge, onClick }: TabButtonProps) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            title={label}
            className={cn(
                'group relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer',
                FOCUS_RING,
                active
                    ? 'bg-cyan-400/[0.12] text-cyan-200'
                    : 'text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]',
            )}
        >
            <Icon className="size-3.5 shrink-0" />
            <span className="hidden truncate @[16rem]:inline">{label}</span>
            {badge !== undefined && (
                <span className="grid min-w-[1rem] place-items-center rounded-full bg-cyan-400/20 px-1 text-[8px] font-black text-cyan-200">
                    {badge}
                </span>
            )}
        </button>
    );
}

interface PlayPanelProps {
    micro: boolean;
    twoCol: boolean;
    items: typeof FEATURED_FREQUENCIES;
    filter: CategoryId;
    setFilter: (c: CategoryId) => void;
    lastPlayedId: string | null;
    onPlay: (id: string) => void;
    onAdd?: (id: string) => void;
}

function PlayPanel({
    micro,
    twoCol,
    items,
    filter,
    setFilter,
    lastPlayedId,
    onPlay,
    onAdd,
}: PlayPanelProps) {
    return (
        <div className="flex flex-col gap-2">
            {/* Filtro por categoría (no en micro) */}
            {!micro && (
                <div
                    className="flex flex-wrap gap-1"
                    role="group"
                    aria-label="Filtrar por categoría"
                >
                    {FILTER_CATEGORIES.map((id) => {
                        const cat = CATEGORIES.find((c) => c.id === id);
                        if (!cat) return null;
                        const isActive = filter === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setFilter(id)}
                                aria-pressed={isActive}
                                className={cn(
                                    'rounded-lg border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer',
                                    FOCUS_RING,
                                    isActive
                                        ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                                        : 'border-border/40 text-muted-foreground/60 hover:text-foreground',
                                )}
                            >
                                {cat.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Lista de frecuencias destacadas */}
            <div
                className={cn('grid gap-1.5', twoCol ? 'grid-cols-2' : 'grid-cols-1')}
                role="group"
                aria-label="Frecuencias destacadas"
            >
                {items.map((item) => {
                    const isActive = lastPlayedId === item.id;
                    const cat = CATEGORIES.find((c) => c.id === item.category);
                    const hz = Math.round(resolveFrequency(item) * 100) / 100;
                    return (
                        <div
                            key={item.id}
                            className={cn(
                                'group flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-all',
                                isActive
                                    ? 'border-cyan-400/50 bg-cyan-400/[0.1]'
                                    : 'border-border/40 bg-white/[0.02] hover:border-cyan-400/30 hover:bg-white/[0.04]',
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => onPlay(item.id)}
                                aria-pressed={isActive}
                                aria-label={
                                    isActive ? `Detener ${item.name}` : `Reproducir ${item.name}`
                                }
                                title={`${item.name} — ${item.description}`}
                                className={cn(
                                    'flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer',
                                    FOCUS_RING,
                                    'rounded-lg',
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
                                    <span className="block truncate text-[11px] font-bold leading-tight">
                                        {item.name}
                                    </span>
                                    {!micro && (
                                        <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground/60">
                                            <span className="font-mono tabular-nums text-cyan-300/80">
                                                {hz} Hz
                                            </span>
                                            {item.category === 'synergy' && (
                                                <span className="inline-flex items-center gap-0.5 text-[8px] uppercase tracking-wider text-purple-300/70">
                                                    <Layers className="size-2.5" /> sinergia
                                                </span>
                                            )}
                                            <span className="truncate">{cat?.label}</span>
                                        </span>
                                    )}
                                </span>
                            </button>
                            {/* Añadir como capa extra (a la mezcla / generador) */}
                            {onAdd && (
                                <button
                                    type="button"
                                    onClick={() => onAdd(item.id)}
                                    aria-label={`Añadir ${item.name} a la mezcla`}
                                    title="Añadir a la mezcla (capa)"
                                    className={cn(
                                        'grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground/50 transition-colors hover:text-cyan-300 hover:bg-cyan-400/10 cursor-pointer',
                                        FOCUS_RING,
                                    )}
                                >
                                    <Plus className="size-3.5" />
                                </button>
                            )}
                        </div>
                    );
                })}
                {items.length === 0 && (
                    <p className="col-span-full py-6 text-center text-[10px] text-muted-foreground/60">
                        Sin frecuencias en esta categoría.
                    </p>
                )}
            </div>
        </div>
    );
}

interface GeneratorPanelProps {
    oscillators: ReturnType<typeof useAudio>['oscillators'];
    update: ReturnType<typeof useAudio>['updateOscillator'];
    remove: ReturnType<typeof useAudio>['removeOscillator'];
    getOscillatorAnalyser: ReturnType<typeof useAudio>['getOscillatorAnalyser'];
    onAdd: () => void;
    onClear: () => void;
    twoCol: boolean;
}

function GeneratorPanel({
    oscillators,
    update,
    remove,
    getOscillatorAnalyser,
    onAdd,
    onClear,
    twoCol,
}: GeneratorPanelProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={onAdd}
                    className={cn(
                        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.06] px-3 py-1.5 text-[11px] font-bold text-cyan-200 transition-all hover:bg-cyan-400/15 cursor-pointer',
                        FOCUS_RING,
                    )}
                >
                    <Plus className="size-3.5" />
                    Añadir oscilador
                </button>
                {oscillators.length > 0 && (
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label="Vaciar todos los osciladores"
                        title="Vaciar"
                        className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-xl border border-border/40 text-muted-foreground/60 transition-colors hover:border-red-400/40 hover:text-red-400 cursor-pointer',
                            FOCUS_RING,
                        )}
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                )}
            </div>

            {oscillators.length === 0 ? (
                <div className="grid place-items-center gap-1 rounded-xl border border-dashed border-border/50 py-8 text-center">
                    <Sliders className="size-5 text-muted-foreground/40" />
                    <p className="text-[10px] font-semibold text-muted-foreground/60">
                        Añade un oscilador o toca una frecuencia del reproductor.
                    </p>
                </div>
            ) : (
                <div className={cn('grid gap-1.5', twoCol ? 'grid-cols-2' : 'grid-cols-1')}>
                    {oscillators.map((osc) => (
                        <CompactOscillator
                            key={osc.id}
                            osc={osc}
                            update={update}
                            remove={remove}
                            analyser={getOscillatorAnalyser(osc.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface PresetsPanelProps {
    presets: ReturnType<typeof useFileSystem>['presets'];
    presetName: string;
    setPresetName: (s: string) => void;
    canSave: boolean;
    onSave: () => void;
    onLoad: (content: PresetContent) => void;
    onDelete: (id: string) => void;
}

function PresetsPanel({
    presets,
    presetName,
    setPresetName,
    canSave,
    onSave,
    onLoad,
    onDelete,
}: PresetsPanelProps) {
    return (
        <div className="flex flex-col gap-2">
            {/* Guardar actual */}
            <div className="flex items-center gap-1.5 rounded-xl border border-cyan-400/20 bg-white/[0.02] p-1.5">
                <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder={canSave ? 'Nombre del preset…' : 'Sin mezcla activa'}
                    aria-label="Nombre del preset a guardar"
                    disabled={!canSave}
                    className={cn(
                        'min-w-0 flex-1 bg-transparent px-1.5 text-[11px] text-foreground/90 placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50',
                        FOCUS_RING,
                        'rounded',
                    )}
                />
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!canSave}
                    aria-label="Guardar preset actual"
                    title={canSave ? 'Guardar preset actual' : 'Añade frecuencias primero'}
                    className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-400/[0.08] px-2.5 py-1 text-[10px] font-bold text-cyan-200 transition-all hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer',
                        FOCUS_RING,
                    )}
                >
                    <Save className="size-3" />
                    Guardar
                </button>
            </div>

            {/* Lista de presets del usuario (Biblioteca soberana) */}
            {presets.length === 0 ? (
                <div className="grid place-items-center gap-1 rounded-xl border border-dashed border-border/50 py-8 text-center">
                    <FolderOpen className="size-5 text-muted-foreground/40" />
                    <p className="text-[10px] font-semibold text-muted-foreground/60">
                        Aún no has guardado presets.
                    </p>
                    <p className="text-[9px] text-muted-foreground/50">
                        Se guardan en tu Biblioteca soberana.
                    </p>
                </div>
            ) : (
                <div className="grid gap-1.5">
                    {presets.map((p) => (
                        <div
                            key={p.id}
                            className="group flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2 py-1.5 transition-all hover:border-cyan-400/30 hover:bg-white/[0.04]"
                        >
                            <button
                                type="button"
                                onClick={() => onLoad(p.content)}
                                aria-label={`Cargar preset ${p.name}`}
                                title={`Cargar ${p.name}`}
                                className={cn(
                                    'flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer rounded-lg',
                                    FOCUS_RING,
                                )}
                            >
                                <span
                                    className="grid size-6 shrink-0 place-items-center rounded-lg border border-white/10"
                                    style={{ background: 'rgba(255,255,255,0.04)' }}
                                >
                                    <Play className="size-3" style={{ color: ACCENT }} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[11px] font-bold leading-tight">
                                        {p.name}
                                    </span>
                                    <span className="block text-[9px] text-muted-foreground/60">
                                        {p.content.oscillators.length} capa
                                        {p.content.oscillators.length === 1 ? '' : 's'}
                                    </span>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(p.id)}
                                aria-label={`Eliminar preset ${p.name}`}
                                title="Eliminar"
                                className={cn(
                                    'grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground/50 transition-colors hover:text-red-400 hover:bg-red-400/10 cursor-pointer',
                                    FOCUS_RING,
                                )}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
