'use client';

// ════════════════════════════════════════════════════════════════
// OmnifrecuenciasWidget — Controlador compacto de frecuencias funcionales
// ----------------------------------------------------------------
// Versión ligera del Estudio de Omnifrecuencias para el dashboard:
//   • Reusa `omni-engine` (motor WebAudio robusto, SSR-safe, multi-tono,
//     binaural + isocrónico, fades anti-click) → MISMO motor que la app.
//   • Quick-presets: una selección de BUILTIN_PRESETS (Solfeggio +
//     ondas cerebrales) que suenan al instante.
//   • Visualizador (anillo pulsante) + control de volumen maestro.
//   • Botón «Abrir app completa» → emite el evento global
//     `starseed:open-omnifrecuencias` (el orquestador lo engancha para
//     abrir `OmnifrecuenciasApp` en una ventana del OS) y, como respaldo
//     navegable, enlaza a la ruta `/omnifrecuencias`.
//   • Recall: recuerda el último preset usado (rememberLastConfig) para
//     que la app completa pueda ofrecer "continuar donde lo dejaste".
//
// Adaptabilidad (render-prop `size`): en micro se oculta el visualizador
// y el slider de volumen; el grid de presets pasa a 1 columna. Respeta
// `config.animations.enabled` + prefers-reduced-motion. AudioContext y
// localStorage solo se tocan tras un gesto del usuario (Play).
// ════════════════════════════════════════════════════════════════

import React, { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Waves, Play, Square, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetShell } from '@/components/dashboard/kit';
import { useAppearance } from '@/context/appearance-context';
import { useOmniEngine, type OmniConfig } from '@/components/dashboard/apps/omnifrecuencias/omni-engine';
import {
    BUILTIN_PRESETS,
    rememberLastConfig,
} from '@/components/dashboard/apps/omnifrecuencias/omni-presets';

const ACCENT = '#22D3EE';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

// Selección compacta de presets para el dashboard (los más usados).
const QUICK_IDS = [
    'solf-528',
    'solf-396',
    'tune-432',
    'schumann-783',
    'alpha-calm',
    'beta-focus',
    'delta-sleep',
    'theta-meditate',
] as const;

const QUICK_PRESETS = QUICK_IDS.map((id) => BUILTIN_PRESETS.find((p) => p.id === id)).filter(
    (p): p is (typeof BUILTIN_PRESETS)[number] => Boolean(p),
);

/** Abre la app completa: evento para el orquestador (o navegación de respaldo). */
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

    const engine = useOmniEngine();

    const [activeId, setActiveId] = useState<string | null>(null);
    const [volume, setVolume] = useState(0.4);

    const playPreset = useCallback(
        (preset: (typeof BUILTIN_PRESETS)[number]) => {
            // Reproduce con el volumen maestro actual del widget.
            const cfg: OmniConfig = { ...preset.config, masterVolume: volume };
            engine.play(cfg);
            rememberLastConfig(cfg); // recall para la app completa
            setActiveId(preset.id);
        },
        [engine, volume],
    );

    const stop = useCallback(() => {
        engine.stop();
        setActiveId(null);
    }, [engine]);

    const changeVolume = useCallback(
        (v: number) => {
            setVolume(v);
            engine.setMasterVolume(v);
        },
        [engine],
    );

    const active = QUICK_PRESETS.find((p) => p.id === activeId) ?? null;
    const activeFreq = active?.config.tones[0]?.freq ?? 0;

    return (
        <WidgetShell
            title="Omnifrecuencias"
            subtitle="Frecuencias funcionales"
            icon={Waves}
            accent={ACCENT}
            live={!!activeId}
            onExpand={openFullApp}
            connections={[
                { label: 'Reproductor', color: '#F472B6' },
                { label: 'Radio en vivo', color: '#FB923C' },
            ]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                const oneCol = size.tier === 'micro' || size.tier === 'compact';
                return (
                    <div className="flex h-full flex-col gap-2 pt-1">
                        {/* Visualizador / anillo pulsante */}
                        {!micro && (
                            <div
                                className="relative grid shrink-0 place-items-center py-2"
                                role="status"
                                aria-live="polite"
                                aria-label={
                                    active
                                        ? `Sonando ${Math.round(activeFreq)} hercios — ${active.desc}`
                                        : 'Sin frecuencia activa'
                                }
                            >
                                <div className="relative grid size-20 place-items-center">
                                    {active && (
                                        <>
                                            {[0, 1, 2].map((i) => (
                                                <motion.span
                                                    key={i}
                                                    aria-hidden
                                                    className="absolute inset-0 rounded-full border"
                                                    style={{
                                                        borderColor: `color-mix(in srgb, ${ACCENT} 50%, transparent)`,
                                                    }}
                                                    animate={
                                                        animate
                                                            ? { scale: [1, 1.6], opacity: [0.6, 0] }
                                                            : { scale: 1.2, opacity: 0.2 }
                                                    }
                                                    transition={
                                                        animate
                                                            ? {
                                                                  duration: 2.4,
                                                                  repeat: Infinity,
                                                                  delay: i * 0.8,
                                                                  ease: 'easeOut',
                                                              }
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
                                        transition={
                                            active && animate ? { duration: 1.6, repeat: Infinity } : undefined
                                        }
                                    >
                                        <span className="text-center leading-none">
                                            <span
                                                className="block text-sm font-black tabular-nums"
                                                style={{ color: active ? '#fff' : ACCENT }}
                                            >
                                                {active ? Math.round(activeFreq) : '—'}
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
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Quick-presets */}
                        <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
                            <div
                                className={cn('grid gap-1.5', oneCol ? 'grid-cols-1' : 'grid-cols-2')}
                                role="group"
                                aria-label="Frecuencias rápidas"
                            >
                                {QUICK_PRESETS.map((p) => {
                                    const isActive = activeId === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => (isActive ? stop() : playPreset(p))}
                                            aria-pressed={isActive}
                                            aria-label={
                                                isActive
                                                    ? `Detener ${p.name}`
                                                    : `Reproducir ${p.name} — ${p.desc}`
                                            }
                                            title={`${p.name} — ${p.desc}`}
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
                                                <span className="block truncate text-[11px] font-bold leading-tight">
                                                    {p.name}
                                                </span>
                                                {!micro && (
                                                    <span className="block truncate text-[9px] text-muted-foreground/60">
                                                        {p.desc}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Volumen + abrir app completa */}
                        {!micro && (
                            <div className="flex shrink-0 flex-col gap-1.5">
                                <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-white/[0.02] px-2.5 py-1.5">
                                    <button
                                        type="button"
                                        onClick={() => changeVolume(volume > 0 ? 0 : 0.4)}
                                        aria-label={volume > 0 ? 'Silenciar' : 'Activar sonido'}
                                        title={volume > 0 ? 'Silenciar' : 'Activar sonido'}
                                        className={cn(
                                            'grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground cursor-pointer',
                                            FOCUS_RING,
                                        )}
                                    >
                                        {volume > 0 ? (
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
                                        value={volume}
                                        onChange={(e) => changeVolume(Number(e.target.value))}
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
                                <a
                                    href="/omnifrecuencias"
                                    onClick={(e) => {
                                        // Preferimos abrir en ventana del OS (evento). Si el
                                        // orquestador no lo intercepta, el href navega de todos modos.
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
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
