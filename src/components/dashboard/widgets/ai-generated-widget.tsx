'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardWidget, AiWidgetSettings } from '../dashboard-types';
import { Sparkles, Pencil, Wand2, Bot, Layers, Code2, Image as ImageIcon, Music } from 'lucide-react';

// ════════════════════════════════════════════════════════════════
// AiGeneratedWidget v2 — vitrina de outputs de La Fragua.
// ----------------------------------------------------------------
// MEJORAS v2:
//   • Estado vacío mejorado: tres chips de tipo de output IA con íconos
//     animados + descripción de capacidades (texto en español).
//   • Overlay de hover con badge del tipo + nombre del widget.
//   • Halo de color dinámico según themeColor del ontology.
//   • Partículas sutiles flotando en el fondo del estado vacío.
//   • Botón de editar con tooltip accesible y animación suave.
//   • "modo showcase": cuando hay customHtml, anima la entrada del frame.
// ════════════════════════════════════════════════════════════════

const OUTPUT_KINDS = [
    { icon: Code2,      label: "Código vivo",   color: "#38bdf8", desc: "Widgets interactivos generados por IA" },
    { icon: ImageIcon,  label: "Visualización", color: "#a855f7", desc: "Gráficos, dashboards y mapas en tiempo real" },
    { icon: Music,      label: "Audiomórfico",  color: "#10b981", desc: "Interfaces reactivas al sonido y ritmo" },
];

// Floating particle — purely CSS + framer (SSR-safe, no window/random)
function FloatParticle({ x, y, delay, color }: { x: number; y: number; delay: number; color: string }) {
    return (
        <motion.span
            className="absolute size-1 rounded-full pointer-events-none"
            style={{ left: `${x}%`, top: `${y}%`, background: color, opacity: 0.5 }}
            animate={{ y: [0, -12, 0], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 3 + delay, repeat: Infinity, delay, ease: [0.16, 1, 0.3, 1] }}
        />
    );
}

// Deterministic "pseudo-random" positions to avoid SSR mismatch
const PARTICLES = [
    { x: 12, y: 30, delay: 0,   color: "#8b5cf6" },
    { x: 78, y: 20, delay: 0.8, color: "#38bdf8" },
    { x: 55, y: 65, delay: 1.4, color: "#10b981" },
    { x: 25, y: 78, delay: 0.4, color: "#f59e0b" },
    { x: 90, y: 55, delay: 1.9, color: "#ec4899" },
    { x: 42, y: 12, delay: 2.3, color: "#a855f7" },
];

interface AiGeneratedWidgetProps {
    widget: DashboardWidget;
    onEditRequest?: (widget: DashboardWidget) => void;
}

export function AiGeneratedWidget({ widget, onEditRequest }: AiGeneratedWidgetProps) {
    const [hovered, setHovered] = useState(false);
    const settings = widget.settings as Partial<AiWidgetSettings>;

    const config = settings?.widgetConfig || {
        opacity: 0.4, blur: 16, borderRadius: 32, glowIntensity: 20,
        scale: 1, rotateX: 0, rotateY: 0,
        animationStiffness: 100, animationDamping: 20,
    };

    const ontology = settings?.ontology || {
        title: 'Widget IA',
        description: 'Widget generado por La Fragua',
        themeColor: '#8b5cf6',
    };

    const customHtml = settings?.customHtml || '';

    // ── Empty state ───────────────────────────────────────────────
    if (!customHtml) {
        return (
            <div className="relative flex h-full flex-col items-center justify-center gap-5 p-5 overflow-hidden rounded-3xl bg-card/60 backdrop-blur-sm">
                {/* Ambient glow */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: `radial-gradient(ellipse at 50% 50%, ${ontology.themeColor}18 0%, transparent 70%)`,
                    }}
                />
                {/* Floating particles */}
                {PARTICLES.map((p, i) => <FloatParticle key={i} {...p} />)}

                {/* Icon */}
                <motion.div
                    animate={{ rotate: [0, 6, -6, 0], scale: [1, 1.06, 0.97, 1] }}
                    transition={{ duration: 5, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-10 grid place-items-center size-14 rounded-2xl"
                    style={{
                        background: `linear-gradient(135deg, ${ontology.themeColor}30, ${ontology.themeColor}10)`,
                        border: `1px solid ${ontology.themeColor}40`,
                        boxShadow: `0 0 24px -4px ${ontology.themeColor}55`,
                    }}
                >
                    <Wand2 className="size-7" style={{ color: ontology.themeColor }} />
                </motion.div>

                {/* Title */}
                <div className="relative z-10 text-center space-y-1.5">
                    <h3 className="font-bold text-sm text-foreground/85">La Fragua IA</h3>
                    <p className="text-xs text-muted-foreground/70 leading-snug max-w-[160px]">
                        Diseña widgets personalizados con inteligencia artificial
                    </p>
                </div>

                {/* Output type chips */}
                <div className="relative z-10 flex flex-col gap-1.5 w-full max-w-[200px]">
                    {OUTPUT_KINDS.map((k, i) => {
                        const Icon = k.icon;
                        return (
                            <motion.div
                                key={k.label}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08 + 0.1, ease: [0.16, 1, 0.3, 1] }}
                                className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
                                style={{ borderColor: `${k.color}35`, background: `${k.color}0d` }}
                            >
                                <Icon className="size-3.5 shrink-0" style={{ color: k.color }} />
                                <div className="min-w-0">
                                    <div className="text-[10px] font-bold truncate" style={{ color: k.color }}>{k.label}</div>
                                    <div className="text-[9px] text-muted-foreground/60 leading-tight truncate">{k.desc}</div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* CTA */}
                {onEditRequest && (
                    <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 18 }}
                        onClick={() => onEditRequest(widget)}
                        className="relative z-10 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold cursor-pointer transition-colors"
                        style={{
                            background: `${ontology.themeColor}20`,
                            border: `1px solid ${ontology.themeColor}50`,
                            color: ontology.themeColor,
                            boxShadow: `0 0 14px -4px ${ontology.themeColor}55`,
                        }}
                    >
                        <Sparkles className="size-3.5" /> Abrir La Fragua
                    </motion.button>
                )}
            </div>
        );
    }

    // ── Filled state: render customHtml ──────────────────────────
    return (
        <motion.div
            className="relative h-full w-full overflow-hidden group rounded-3xl"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            style={{
                filter: `drop-shadow(0 0 ${config.glowIntensity}px ${ontology.themeColor}40)`,
                transform: `scale(${config.scale}) rotateX(${config.rotateX}deg) rotateY(${config.rotateY}deg)`,
                transition: 'transform 0.3s ease, filter 0.3s ease',
                perspective: '1200px',
            } as React.CSSProperties}
        >
            {/* Content */}
            <div
                className="h-full w-full text-white overflow-auto"
                dangerouslySetInnerHTML={{ __html: customHtml }}
            />

            {/* Title badge overlay */}
            <AnimatePresence>
                {hovered && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18 }}
                        className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full z-20"
                        style={{
                            background: `${ontology.themeColor}25`,
                            border: `1px solid ${ontology.themeColor}45`,
                            color: ontology.themeColor,
                        }}
                    >
                        <Sparkles className="size-3" />
                        <span className="text-[10px] font-bold font-mono uppercase tracking-wider">{ontology.title}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit button */}
            <AnimatePresence>
                {hovered && onEditRequest && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.18 }}
                        className="absolute bottom-2 right-2 z-20"
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); onEditRequest(widget); }}
                            className="grid place-items-center size-7 rounded-lg bg-black/60 backdrop-blur-sm border border-white/15 text-white/70 hover:text-white hover:bg-black/80 transition-colors cursor-pointer"
                            title="Editar con IA"
                            aria-label="Editar con IA"
                        >
                            <Pencil className="size-3.5" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
