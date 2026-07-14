'use client';

// ════════════════════════════════════════════════════════════════
// AudiomorphicBgWidget — Control de la CAPA de fondo "Audiomorphic".
// ----------------------------------------------------------------
// Adenda 68 · D: Audiomorphic ya NO secuestra el fondo del OS. Este widget
// enciende/apaga su CAPA (config.background.layers) y ajusta su opacidad. La
// pinta <BackgroundLayerStack/> con mezcla "screen" (el negro opaco de la app
// desaparece y solo se ve el espiral sobre el fondo elegido).
// Antes escribía config.background.type = "audiomorphic": eso es lo que dejaba
// el visualizador pegado como fondo exclusivo y sincronizado a toda la cuenta.
//
// Adaptabilidad (render-prop `size`): en micro se ocultan el control de
// overlay y la nota inferior; los botones activar/quitar mantienen su
// retícula. Accesibilidad: estado anunciado con role="status"/aria-live,
// botones con aria-label/aria-pressed + foco visible, overlay con
// aria-valuetext. Animaciones respetan animations.enabled + reduced-motion.
//
// "Gratis y completo dentro de StarSeed OS."
// ════════════════════════════════════════════════════════════════

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AudioWaveform, Power, X, ExternalLink, Check, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WidgetShell } from '@/components/dashboard/kit';
import { useAppearance } from '@/context/appearance-context';
import {
    audiomorphicLayer,
    normalizeLayers,
    patchLayer,
    setAudiomorphicEnabled,
} from '@/lib/appearance/background-layers';

// Acento por defecto (violeta Audiomorphic). Si el OS corre con un tema
// holográfico afín, el widget adopta su acento para integrarse sin romper
// el resto de su estética. Cambio aditivo y seguro: solo afecta a este color.
const ACCENT_DEFAULT = '#A855F7';
const ACCENT_BY_OS_THEME: Partial<Record<string, string>> = {
    audiomorphic: '#A855F7', // violeta místico
    omnifrecuencias: '#22D3EE', // cian holográfico
};
const AUDIOMORPHIC_URL = 'https://audiomorphic.vercel.app';

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

export function AudiomorphicBgWidget() {
    const { config, updateConfig } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    // Acento del widget: sigue al tema del OS si es uno afín; si no, violeta.
    const ACCENT = ACCENT_BY_OS_THEME[config.themeStore?.osTheme ?? 'default'] ?? ACCENT_DEFAULT;

    // Audiomorphic es una CAPA (Adenda 68 · D), ya no un `background.type`.
    // Encenderlo/apagarlo NUNCA toca el fondo base del usuario: se limita a su
    // propia capa, así que no puede volver a "secuestrar" el fondo del OS.
    const layers = normalizeLayers(config.background.layers);
    const layer = audiomorphicLayer(layers);
    const isActive = !!layer;
    const opacity = layer?.opacity ?? 0.9;

    const activate = () => {
        updateConfig({ background: { layers: setAudiomorphicEnabled(layers, true) } } as any);
    };

    const deactivate = () => {
        updateConfig({ background: { layers: setAudiomorphicEnabled(layers, false) } } as any);
    };

    /** Opacidad de la capa (antes era el "overlay" negro que la oscurecía). */
    const setOpacity = (v: number) => {
        if (!layer) return;
        updateConfig({ background: { layers: patchLayer(layers, layer.id, { opacity: v }) } } as any);
    };

    const openTab = () => {
        if (typeof window !== 'undefined') {
            window.open(AUDIOMORPHIC_URL, '_blank', 'noopener,noreferrer');
        }
    };

    // Abre la ventana de configuración del fondo (modos, micrófono/cámara, preset…).
    const openConfig = () => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('starseed:open-audiomorphic-config'));
        }
    };

    return (
        <WidgetShell
            title="Audiomorphic"
            subtitle="Fondo del sistema"
            icon={AudioWaveform}
            accent={ACCENT}
            live={isActive}
            connections={[{ label: 'Apariencia', href: '/settings', color: ACCENT }]}
        >
            {(size) => {
                const micro = size.tier === 'micro' || size.vTier === 'micro';
                return (
                    <div className="flex h-full flex-col gap-2.5 pt-1">
                        {/* Estado */}
                        <div
                            role="status"
                            aria-live="polite"
                            className={cn(
                                'flex shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-colors',
                                isActive
                                    ? 'border-purple-400/40 bg-purple-400/[0.1]'
                                    : 'border-border/40 bg-white/[0.02]',
                            )}
                        >
                            <span
                                className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-white/10"
                                style={{
                                    background: isActive
                                        ? `linear-gradient(135deg, ${ACCENT}, color-mix(in srgb, ${ACCENT} 40%, transparent))`
                                        : 'rgba(255,255,255,0.04)',
                                }}
                            >
                                <AudioWaveform className="size-4" style={{ color: isActive ? '#fff' : ACCENT }} />
                                {isActive && (
                                    <motion.span
                                        aria-hidden
                                        className="absolute inset-0 rounded-xl border border-purple-300/60"
                                        animate={animate ? { opacity: [0.6, 0], scale: [1, 1.35] } : { opacity: 0 }}
                                        transition={animate ? { duration: 2, repeat: Infinity, ease: 'easeOut' } : undefined}
                                    />
                                )}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold leading-tight">
                                    {isActive ? 'Fondo activo' : 'Fondo inactivo'}
                                    {isActive && <Check className="size-3.5 text-purple-300" />}
                                </span>
                                <span className="block truncate text-[10px] text-muted-foreground/60">
                                    {isActive ? 'Capa sobre tu fondo (mezcla screen)' : 'Añádelo como capa del fondo'}
                                </span>
                            </span>
                        </div>

                        {/* Acciones activar/quitar */}
                        <div className="grid shrink-0 grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={activate}
                                disabled={isActive}
                                aria-pressed={isActive}
                                aria-label="Activar Audiomorphic como fondo del sistema"
                                title="Activar fondo"
                                className={cn(
                                    'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-bold transition-all cursor-pointer disabled:cursor-not-allowed',
                                    FOCUS_RING,
                                    isActive
                                        ? 'border-purple-400/30 bg-purple-400/10 text-purple-300/60 opacity-60'
                                        : 'border-purple-400/40 bg-purple-400/[0.08] text-purple-200 hover:bg-purple-400/15',
                                )}
                            >
                                <Power className="size-3.5" />
                                Activar fondo
                            </button>
                            <button
                                type="button"
                                onClick={deactivate}
                                disabled={!isActive}
                                aria-label="Quitar el fondo Audiomorphic"
                                title="Quitar fondo"
                                className={cn(
                                    'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-bold transition-all cursor-pointer disabled:cursor-not-allowed',
                                    FOCUS_RING,
                                    !isActive
                                        ? 'border-border/40 bg-white/[0.02] text-muted-foreground/50 opacity-60'
                                        : 'border-border/50 bg-white/[0.03] text-foreground hover:border-rose-400/40 hover:bg-rose-400/[0.06]',
                                )}
                            >
                                <X className="size-3.5" />
                                Quitar fondo
                            </button>
                        </div>

                        {/* Opacidad de la capa */}
                        {!micro && isActive && (
                            <div className="shrink-0 rounded-xl border border-purple-400/20 bg-white/[0.02] px-3 py-2">
                                <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold">
                                    <span className="text-muted-foreground/70">Opacidad de la capa</span>
                                    <span className="tabular-nums" style={{ color: ACCENT }}>
                                        {Math.round(opacity * 100)}%
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={opacity}
                                    onChange={(e) => setOpacity(Number(e.target.value))}
                                    aria-label="Opacidad de la capa Audiomorphic"
                                    aria-valuetext={`${Math.round(opacity * 100)} por ciento`}
                                    className={cn(
                                        'h-1 w-full cursor-pointer appearance-none rounded-full accent-purple-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-300',
                                        FOCUS_RING,
                                    )}
                                    style={{
                                        background: `linear-gradient(90deg, ${ACCENT} ${opacity * 100}%, rgba(255,255,255,0.15) ${opacity * 100}%)`,
                                    }}
                                />
                            </div>
                        )}

                        <div className="mt-auto shrink-0 space-y-2">
                            <button
                                type="button"
                                onClick={openConfig}
                                aria-label="Configurar el fondo Audiomorphic (modos, micrófono, cámara, preset)"
                                title="Configurar fondo"
                                className={cn(
                                    'flex w-full items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors cursor-pointer',
                                    'border-purple-400/40 bg-purple-400/[0.1] text-purple-100 hover:bg-purple-400/20',
                                    FOCUS_RING,
                                )}
                            >
                                <Wand2 className="size-3.5" />
                                Configurar fondo
                            </button>
                            <button
                                type="button"
                                onClick={openTab}
                                aria-label="Abrir Audiomorphic en una pestaña nueva"
                                title="Abrir en pestaña"
                                className={cn(
                                    'flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/40 bg-white/[0.03] px-2 py-2 text-[11px] font-bold text-muted-foreground/80 transition-colors hover:border-purple-400/30 hover:text-foreground cursor-pointer',
                                    FOCUS_RING,
                                )}
                            >
                                <ExternalLink className="size-3.5" />
                                Abrir en pestaña
                            </button>
                            {!micro && (
                                <p className="text-center text-[10px] font-semibold text-muted-foreground/60">
                                    Gratis y completo dentro de StarSeed OS.
                                </p>
                            )}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
