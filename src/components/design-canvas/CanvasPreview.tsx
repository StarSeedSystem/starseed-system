"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { CanvasState, ElementFamily } from "./DesignIntegrationCanvas";
import {
    Sparkles, ArrowRight, Heart, Star, Bell, Search, User, Settings,
    X, Check, ChevronRight, Info, AlertTriangle, MessageSquare,
    Home, Compass, Layers, MoreHorizontal
} from "lucide-react";

interface Props {
    state: CanvasState;
    device: "desktop" | "mobile" | "tablet";
    selectedElement: ElementFamily;
    onSelectElement: (family: ElementFamily) => void;
}

function FamilyWrapper({
    id, label, selected, onSelect, children, palette
}: {
    id: ElementFamily;
    label: string;
    selected: boolean;
    onSelect: () => void;
    children: React.ReactNode;
    palette: CanvasState["palette"];
}) {
    return (
        <div
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={cn(
                "relative rounded-2xl p-4 transition-all cursor-pointer group border",
                selected
                    ? "ring-2 ring-cyan-400/60 border-cyan-400/30 bg-cyan-400/5"
                    : "border-white/5 hover:border-white/15 hover:bg-white/[0.02]"
            )}
        >
            <div className="flex items-center justify-between mb-3">
                <span className={cn(
                    "text-[10px] uppercase tracking-widest font-medium",
                    selected ? "text-cyan-400" : "text-white/30 group-hover:text-white/50"
                )}>
                    {label}
                </span>
                {selected && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
                        Editando
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

export function CanvasPreview({ state, device, selectedElement, onSelectElement }: Props) {
    const { palette, typography, components, effects, geometry } = state;

    const btnStyle = (variant: string): React.CSSProperties => {
        const base = { borderRadius: `${components.buttonRadius}px`, transition: "all 0.2s" };
        switch (components.buttonStyle) {
            case "glass": return { ...base, background: `${palette.primary}22`, backdropFilter: `blur(${effects.backdropBlur}px)`, border: `1px solid rgba(255,255,255,0.12)`, boxShadow: components.buttonGlow ? `0 0 15px ${palette.primary}33` : undefined };
            case "liquid": return { ...base, background: `linear-gradient(135deg, ${palette.primary}33, ${palette.accent}33)`, backdropFilter: `blur(${effects.backdropBlur * 1.5}px)`, border: `1px solid rgba(255,255,255,0.15)` };
            case "neon": return { ...base, background: "transparent", border: `2px solid ${palette.accent}`, boxShadow: `0 0 15px ${palette.accent}44` };
            case "brutal": return { ...base, background: "#fff", color: "#000", border: "2px solid #000", boxShadow: "4px 4px 0 #000", borderRadius: `${Math.min(components.buttonRadius, 8)}px` };
            default: return { ...base, background: palette.primary, border: "none", boxShadow: components.buttonGlow ? `0 0 20px ${palette.primary}66` : undefined };
        }
    };

    const cardStyle: React.CSSProperties = {
        background: palette.surface,
        backdropFilter: `blur(${effects.backdropBlur}px) saturate(${effects.glassSaturation}%)`,
        borderRadius: `${geometry.radiusLg}px`,
        border: `1px solid ${palette.glassBorder}`,
        boxShadow: state.shadows.md,
    };

    const inputBorderStyles: Record<string, React.CSSProperties> = {
        none: { border: "1px solid transparent" },
        subtle: { border: `1px solid rgba(255,255,255,0.08)` },
        solid: { border: `1px solid rgba(255,255,255,0.2)` },
        glow: { border: `1px solid ${palette.primary}66`, boxShadow: `0 0 10px ${palette.primary}22` },
    };

    const select = (family: ElementFamily) => onSelectElement(family === selectedElement ? null : family);

    return (
        <div
            className="space-y-3 transition-all duration-300"
            style={{
                fontFamily: typography.fontMain,
                fontSize: `${typography.baseSize}px`,
                color: palette.textPrimary,
                letterSpacing: `${typography.bodyTracking}em`,
            }}
        >
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ─── COLOR PALETTE STRIP ─── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div id="preview-palette">
                <FamilyWrapper id="palette" label="🎨 Paleta de Colores" selected={selectedElement === "palette"} onSelect={() => select("palette")} palette={palette}>
                    <div className="space-y-3">
                        {/* Primary row */}
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { label: "Primary", color: palette.primary },
                                { label: "Secondary", color: palette.secondary },
                                { label: "Accent", color: palette.accent },
                                { label: "Background", color: palette.background },
                                { label: "Surface", color: palette.surface },
                                { label: "Glass Border", color: palette.glassBorder },
                            ].map(swatch => (
                                <div key={swatch.label} className="flex flex-col items-center gap-1">
                                    <div
                                        className="w-10 h-10 rounded-xl border border-white/10 shadow-inner transition-all"
                                        style={{ background: swatch.color }}
                                    />
                                    <span className="text-[8px] text-white/40 font-mono">{swatch.label}</span>
                                </div>
                            ))}
                        </div>
                        {/* Text colors */}
                        <div className="flex gap-3">
                            <div className="flex-1 px-3 py-2 rounded-xl" style={{ background: palette.background, border: `1px solid ${palette.glassBorder}` }}>
                                <p className="text-[10px] font-medium" style={{ color: palette.textPrimary }}>Texto Primario</p>
                                <p className="text-[9px] mt-0.5" style={{ color: palette.textSecondary }}>Texto Secundario</p>
                            </div>
                            <div className="flex-1 px-3 py-2 rounded-xl" style={{ background: `linear-gradient(135deg, ${palette.primary}22, ${palette.accent}22)`, border: `1px solid ${palette.glassBorder}` }}>
                                <p className="text-[10px] font-medium" style={{ color: palette.primary }}>Gradiente</p>
                                <p className="text-[9px] mt-0.5" style={{ color: palette.accent }}>Primary → Accent</p>
                            </div>
                        </div>
                        {/* Trinity colors */}
                        <div className="grid grid-cols-4 gap-1.5">
                            {[
                                { label: "Zenith", color: palette.trinity.zenith.active },
                                { label: "Horizonte", color: palette.trinity.horizonte.active },
                                { label: "Lógica", color: palette.trinity.logica.active },
                                { label: "Base", color: palette.trinity.base.active },
                            ].map(t => (
                                <div key={t.label} className="flex flex-col items-center gap-1 p-1.5 rounded-lg" style={{ background: `${t.color}11`, border: `1px solid ${t.color}22` }}>
                                    <div className="w-4 h-4 rounded-full" style={{ background: t.color, boxShadow: `0 0 8px ${t.color}44` }} />
                                    <span className="text-[7px] text-white/40">{t.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </FamilyWrapper>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ─── TYPOGRAPHY SPECIMEN ─── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div id="preview-typography">
                <FamilyWrapper id="typography" label="🔤 Tipografía" selected={selectedElement === "typography"} onSelect={() => select("typography")} palette={palette}>
                    <div className="space-y-3">
                        {/* Headline */}
                        <div>
                            <h2 style={{
                                fontFamily: typography.fontHeadline,
                                fontWeight: typography.headerWeight,
                                fontSize: `${Math.round(typography.baseSize * typography.scaleRatio)}px`,
                                letterSpacing: `${typography.headerTracking}em`,
                                color: palette.textPrimary,
                                lineHeight: 1.2,
                            }}>
                                Headline Specimen
                            </h2>
                            <p className="text-[9px] text-white/30 font-mono mt-1">
                                {typography.fontHeadline} · {typography.headerWeight} · {Math.round(typography.baseSize * typography.scaleRatio)}px · {typography.headerTracking}em
                            </p>
                        </div>
                        {/* Body text */}
                        <div>
                            <p style={{
                                fontFamily: typography.fontMain,
                                fontWeight: typography.bodyWeight,
                                fontSize: `${typography.baseSize}px`,
                                letterSpacing: `${typography.bodyTracking}em`,
                                color: palette.textPrimary,
                                lineHeight: 1.6,
                            }}>
                                La red cuántica sincroniza los nodos de información en tiempo real a través del sistema.
                            </p>
                            <p className="text-[9px] text-white/30 font-mono mt-1">
                                {typography.fontMain} · {typography.bodyWeight} · {typography.baseSize}px · {typography.bodyTracking}em
                            </p>
                        </div>
                        {/* Code */}
                        <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${palette.glassBorder}` }}>
                            <code style={{
                                fontFamily: typography.fontCode,
                                fontSize: `${Math.round(typography.baseSize * 0.85)}px`,
                                color: "#A78BFA",
                            }}>
                                const quantum = await sync(nodes);
                            </code>
                            <p className="text-[9px] text-white/30 font-mono mt-1">{typography.fontCode}</p>
                        </div>
                        {/* Scale ratio */}
                        <div className="flex gap-2 items-end">
                            {[1, typography.scaleRatio, typography.scaleRatio ** 2].map((scale, i) => (
                                <div key={i} className="flex flex-col items-center gap-1">
                                    <span style={{
                                        fontSize: `${Math.round(typography.baseSize * scale * 0.7)}px`,
                                        fontFamily: typography.fontHeadline,
                                        fontWeight: typography.headerWeight,
                                        color: palette.textPrimary,
                                    }}>Aa</span>
                                    <span className="text-[7px] text-white/30 font-mono">{(scale).toFixed(2)}×</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </FamilyWrapper>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ─── EFFECTS SHOWCASE ─── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div id="preview-effects">
                <FamilyWrapper id="effects" label="✨ Efectos & Física" selected={selectedElement === "effects"} onSelect={() => select("effects")} palette={palette}>
                    <div className="space-y-3">
                        {/* Glass card */}
                        <div className="relative h-28 rounded-2xl overflow-hidden" style={{ background: `linear-gradient(${effects.gradientAngle}deg, ${palette.primary}22, ${palette.accent}22, ${palette.secondary}15)` }}>
                            {/* Colored orbs behind glass */}
                            <div className="absolute top-3 left-4 w-14 h-14 rounded-full opacity-60" style={{ background: `radial-gradient(circle, ${palette.primary}, transparent)` }} />
                            <div className="absolute bottom-2 right-6 w-10 h-10 rounded-full opacity-50" style={{ background: `radial-gradient(circle, ${palette.accent}, transparent)` }} />
                            {/* Glass overlay */}
                            <div className="absolute inset-3 rounded-xl flex items-center justify-center" style={{
                                backdropFilter: `blur(${effects.backdropBlur}px) saturate(${effects.glassSaturation}%)`,
                                WebkitBackdropFilter: `blur(${effects.backdropBlur}px) saturate(${effects.glassSaturation}%)`,
                                background: `rgba(255,255,255,0.05)`,
                                border: `1px solid rgba(255,255,255,${Math.min(effects.glowIntensity * 0.2, 0.3)})`,
                                boxShadow: `0 0 ${effects.glowIntensity * 20}px ${palette.primary}${Math.round(effects.glowIntensity * 50).toString(16).padStart(2, '0')}`,
                            }}>
                                <div className="text-center">
                                    <span className="text-xs text-white/70 font-medium">Glass Effect</span>
                                    <p className="text-[8px] text-white/40 font-mono mt-0.5">blur:{effects.backdropBlur}px · sat:{effects.glassSaturation}% · glow:{effects.glowIntensity.toFixed(1)}</p>
                                </div>
                            </div>
                        </div>
                        {/* Effect meters */}
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { label: "Refraction", value: effects.refractionIndex, max: 2.5, color: palette.primary },
                                { label: "Parallax", value: effects.parallaxDepth, max: 1, color: palette.accent },
                                { label: "Noise", value: effects.noiseOpacity, max: 0.15, color: "#F59E0B" },
                            ].map(m => (
                                <div key={m.label} className="flex flex-col items-center p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${palette.glassBorder}` }}>
                                    <div className="w-full h-1.5 rounded-full bg-white/5 mb-1.5">
                                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min((m.value / m.max) * 100, 100)}%`, background: m.color, boxShadow: `0 0 6px ${m.color}44` }} />
                                    </div>
                                    <span className="text-[7px] text-white/40">{m.label}</span>
                                    <span className="text-[8px] text-white/60 font-mono">{typeof m.value === 'number' ? (Number.isInteger(m.value) ? m.value : m.value.toFixed(2)) : m.value}</span>
                                </div>
                            ))}
                        </div>
                        {/* Shadow presets */}
                        <div className="flex gap-2">
                            {(["soft", "medium", "dramatic"] as const).map(preset => (
                                <div key={preset} className={cn("flex-1 h-8 rounded-lg flex items-center justify-center text-[8px] transition-all",
                                    effects.shadowPreset === preset ? "text-white/80" : "text-white/30"
                                )} style={{
                                    background: "rgba(255,255,255,0.03)",
                                    border: effects.shadowPreset === preset ? `1px solid ${palette.primary}40` : `1px solid ${palette.glassBorder}`,
                                    boxShadow: preset === "soft" ? "0 2px 8px rgba(0,0,0,0.15)"
                                        : preset === "medium" ? "0 4px 16px rgba(0,0,0,0.25)"
                                            : "0 8px 32px rgba(0,0,0,0.4)",
                                }}>
                                    {preset}
                                </div>
                            ))}
                        </div>
                    </div>
                </FamilyWrapper>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ─── GEOMETRY INSPECTOR ─── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div id="preview-geometry">
                <FamilyWrapper id="geometry" label="📐 Layout & Geometría" selected={selectedElement === "geometry"} onSelect={() => select("geometry")} palette={palette}>
                    <div className="space-y-3">
                        {/* Radius preview */}
                        <div className="flex gap-2 items-end">
                            {[
                                { label: "sm", r: geometry.radiusSm, size: "w-10 h-10" },
                                { label: "md", r: geometry.radiusMd, size: "w-12 h-12" },
                                { label: "lg", r: geometry.radiusLg, size: "w-14 h-14" },
                                { label: "xl", r: geometry.radiusXl, size: "w-16 h-16" },
                            ].map(item => (
                                <div key={item.label} className="flex flex-col items-center gap-1">
                                    <div className={cn(item.size, "bg-gradient-to-br from-blue-500/15 to-indigo-500/15 border border-blue-500/15 transition-all")}
                                        style={{ borderRadius: `${item.r}px` }} />
                                    <span className="text-[8px] text-white/40 font-mono">{item.label}:{item.r}px</span>
                                </div>
                            ))}
                        </div>
                        {/* Spacing scale */}
                        <div className="space-y-1">
                            <span className="text-[8px] text-white/40 font-mono">spacing: {geometry.spacingScale}×</span>
                            <div className="flex flex-col gap-0.5">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-4 rounded-md bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/8 transition-all"
                                        style={{ marginBottom: `${3 * geometry.spacingScale}px` }} />
                                ))}
                            </div>
                        </div>
                        {/* Grid + max width */}
                        <div className="flex gap-2">
                            <div className="flex-1 p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${palette.glassBorder}` }}>
                                <span className="text-[8px] text-white/40 block mb-1">Grid: {geometry.gridColumns} cols</span>
                                <div className={cn("grid gap-0.5", `grid-cols-${geometry.gridColumns}`)}>
                                    {Array.from({ length: geometry.gridColumns }).map((_, j) => (
                                        <div key={j} className="h-3 rounded-sm bg-indigo-400/20" />
                                    ))}
                                </div>
                            </div>
                            <div className="flex-1 p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${palette.glassBorder}` }}>
                                <span className="text-[8px] text-white/40 block mb-1">Max: {geometry.contentMaxWidth}px</span>
                                <div className="relative h-3 rounded-sm bg-white/3">
                                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-sm bg-indigo-400/20 transition-all"
                                        style={{ width: `${Math.round((geometry.contentMaxWidth / 1920) * 100)}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </FamilyWrapper>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ─── COMPONENT FAMILIES (existing) ─── */}
            {/* ══════════════════════════════════════════════════════════════ */}

            {/* ─── CARDS ─── */}
            <FamilyWrapper id="cards" label="Cards" selected={selectedElement === "cards"} onSelect={() => select("cards")} palette={palette}>
                <div style={cardStyle} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 style={{ fontFamily: typography.fontHeadline, fontWeight: typography.headerWeight, fontSize: `${Math.round(typography.baseSize * 1.15)}px` }}>
                                Crystal Dashboard
                            </h3>
                            <p className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>Diseño en vivo sincronizado</p>
                        </div>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${palette.primary}22` }}>
                            <Sparkles className="w-3.5 h-3.5" style={{ color: palette.primary }} />
                        </div>
                    </div>
                    {[
                        { label: "Sistemas", pct: 87, color: palette.trinity.horizonte.active },
                        { label: "Neural", pct: 63, color: palette.primary },
                    ].map(m => (
                        <div key={m.label} className="space-y-1">
                            <div className="flex justify-between text-[10px]" style={{ color: palette.textSecondary }}>
                                <span>{m.label}</span>
                                <span style={{ fontFamily: typography.fontCode }}>{m.pct}%</span>
                            </div>
                            <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                                <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: `linear-gradient(90deg, ${m.color}, ${m.color}88)`, boxShadow: `0 0 8px ${m.color}44` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </FamilyWrapper>

            {/* ─── BUTTONS ─── */}
            <FamilyWrapper id="buttons" label="Botones" selected={selectedElement === "buttons"} onSelect={() => select("buttons")} palette={palette}>
                <div className="flex gap-2 flex-wrap">
                    <button className="px-4 py-2 text-xs font-medium hover:scale-[1.02] transition-transform" style={btnStyle("primary")}>
                        <span className={components.buttonStyle === "brutal" ? "" : "text-white/90"}>Primario</span>
                    </button>
                    <button className="px-4 py-2 text-xs font-medium hover:scale-[1.02] transition-transform" style={{ ...btnStyle("secondary"), opacity: 0.6 }}>
                        <span className={components.buttonStyle === "brutal" ? "" : "text-white/70"}>Secundario</span>
                    </button>
                    <button className="px-3 py-2 text-xs transition-transform hover:scale-[1.02]" style={{ ...btnStyle("ghost"), background: "transparent", border: `1px solid ${palette.glassBorder}` }}>
                        <span className="text-white/50">Ghost</span>
                    </button>
                    <button className="w-8 h-8 flex items-center justify-center hover:scale-[1.05] transition-transform" style={{ ...btnStyle("icon"), padding: 0 }}>
                        <Star className="w-3.5 h-3.5" style={{ color: components.buttonStyle === "brutal" ? "#000" : palette.textPrimary }} />
                    </button>
                </div>
            </FamilyWrapper>

            {/* ─── INPUTS ─── */}
            <FamilyWrapper id="inputs" label="Campos de Entrada" selected={selectedElement === "inputs"} onSelect={() => select("inputs")} palette={palette}>
                <div className="space-y-2">
                    <div className="relative">
                        {components.inputFloatingLabel && (
                            <label className="absolute -top-2 left-3 px-1 text-[9px]" style={{ color: palette.primary, background: palette.background }}>
                                Búsqueda
                            </label>
                        )}
                        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", borderRadius: `${geometry.radiusMd}px`, ...inputBorderStyles[components.inputBorderStyle] }}>
                            <Search className="w-3.5 h-3.5" style={{ color: `${palette.textSecondary}` }} />
                            <span className="text-xs" style={{ color: `${palette.textSecondary}88` }}>Buscar en la red...</span>
                        </div>
                    </div>
                    <div className="px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.03)", borderRadius: `${geometry.radiusMd}px`, ...inputBorderStyles[components.inputBorderStyle], color: palette.textSecondary, minHeight: "48px" }}>
                        Área de texto...
                    </div>
                </div>
            </FamilyWrapper>

            {/* ─── BADGES ─── */}
            <FamilyWrapper id="badges" label="Badges" selected={selectedElement === "badges"} onSelect={() => select("badges")} palette={palette}>
                <div className="flex gap-2 flex-wrap items-center">
                    {[
                        { label: "Activo", color: "#10B981" },
                        { label: "Pendiente", color: palette.accent },
                        { label: "3 nuevos", color: palette.primary },
                        { label: "Urgente", color: "#EF4444" },
                    ].map(b => (
                        <span key={b.label}
                            className={cn("text-[10px] font-medium inline-flex items-center gap-1",
                                components.badgeStyle === "pill" && "px-2.5 py-1 rounded-full",
                                components.badgeStyle === "square" && "px-2 py-1 rounded-md",
                                components.badgeStyle === "dot" && "px-2 py-1 rounded-full"
                            )}
                            style={{ background: `${b.color}22`, color: b.color, border: `1px solid ${b.color}33` }}
                        >
                            {components.badgeStyle === "dot" && <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />}
                            {b.label}
                        </span>
                    ))}
                </div>
            </FamilyWrapper>

            {/* ─── TOOLTIPS ─── */}
            <FamilyWrapper id="tooltips" label="Tooltips" selected={selectedElement === "tooltips"} onSelect={() => select("tooltips")} palette={palette}>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${palette.primary}15` }}>
                            <Info className="w-4 h-4" style={{ color: palette.primary }} />
                        </div>
                        <div className={cn("absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-[10px] whitespace-nowrap",
                            components.tooltipStyle === "glass" && "rounded-lg backdrop-blur-xl",
                            components.tooltipStyle === "solid" && "rounded-md",
                            components.tooltipStyle === "minimal" && "rounded-sm"
                        )}
                            style={{
                                background: components.tooltipStyle === "glass" ? "rgba(255,255,255,0.08)" : components.tooltipStyle === "solid" ? palette.surface : "rgba(0,0,0,0.85)",
                                border: components.tooltipStyle !== "minimal" ? `1px solid ${palette.glassBorder}` : "none",
                                color: palette.textPrimary,
                                boxShadow: components.tooltipStyle === "glass" ? `0 4px 16px rgba(0,0,0,0.3)` : undefined,
                            }}
                        >
                            Información del tooltip
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45" style={{ background: components.tooltipStyle === "glass" ? "rgba(255,255,255,0.08)" : components.tooltipStyle === "solid" ? palette.surface : "rgba(0,0,0,0.85)" }} />
                        </div>
                    </div>
                    <span className="text-[10px] text-white/40">Tooltip estilo: {components.tooltipStyle}</span>
                </div>
            </FamilyWrapper>

            {/* ─── TABS ─── */}
            <FamilyWrapper id="tabs" label="Tabs / Pestañas" selected={selectedElement === "tabs"} onSelect={() => select("tabs")} palette={palette}>
                <div className="flex gap-1" style={{ gap: `${state.tabsConfig.spacing}px` }}>
                    {["General", "Avanzado", "Perfil"].map((tab, i) => (
                        <div key={tab}
                            className={cn("px-3 py-1.5 text-[11px] font-medium transition-all cursor-default",
                                state.tabsConfig.style === "pill" && "rounded-full",
                                state.tabsConfig.style === "box" && "rounded-lg",
                                state.tabsConfig.style === "underline" && "rounded-none border-b-2"
                            )}
                            style={i === 0 ? {
                                background: state.tabsConfig.style !== "underline" ? `${state.tabsConfig.activeColor}22` : "transparent",
                                color: state.tabsConfig.activeColor,
                                borderColor: state.tabsConfig.style === "underline" ? state.tabsConfig.activeColor : `${state.tabsConfig.activeColor}33`,
                                border: state.tabsConfig.style !== "underline" ? `1px solid ${state.tabsConfig.activeColor}33` : undefined,
                                borderBottom: state.tabsConfig.style === "underline" ? `2px solid ${state.tabsConfig.activeColor}` : undefined,
                            } : {
                                color: palette.textSecondary,
                                background: "transparent",
                                borderColor: "transparent",
                            }}
                        >
                            {tab}
                        </div>
                    ))}
                </div>
            </FamilyWrapper>

            {/* ─── TOGGLES ─── */}
            <FamilyWrapper id="toggles" label="Toggles / Controles" selected={selectedElement === "toggles"} onSelect={() => select("toggles")} palette={palette}>
                <div className="flex items-center gap-4">
                    {/* Switch */}
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-5 rounded-full relative" style={{ background: state.toggles.switchTrackColor }}>
                            <div className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all" />
                        </div>
                        <span className="text-[10px] text-white/50">Switch</span>
                    </div>
                    {/* Checkbox */}
                    <div className="flex items-center gap-1.5">
                        <div className={cn("w-4 h-4 flex items-center justify-center",
                            state.toggles.checkboxStyle === "round" ? "rounded-full" : "rounded-sm"
                        )} style={{ background: palette.primary, border: `1px solid ${palette.primary}` }}>
                            <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span className="text-[10px] text-white/50">Check</span>
                    </div>
                    {/* Radio */}
                    <div className="flex items-center gap-1.5">
                        <div className="rounded-full border-2 flex items-center justify-center" style={{ width: `${state.toggles.radioSize}px`, height: `${state.toggles.radioSize}px`, borderColor: palette.primary }}>
                            <div className="rounded-full" style={{ width: `${state.toggles.radioSize * 0.5}px`, height: `${state.toggles.radioSize * 0.5}px`, background: palette.primary }} />
                        </div>
                        <span className="text-[10px] text-white/50">Radio</span>
                    </div>
                </div>
            </FamilyWrapper>

            {/* ─── AVATARS ─── */}
            <FamilyWrapper id="avatars" label="Avatares" selected={selectedElement === "avatars"} onSelect={() => select("avatars")} palette={palette}>
                <div className="flex items-center gap-3">
                    {["#8B5CF6", "#10B981", "#F59E0B", "#EC4899"].map((color, i) => (
                        <div key={i} className="relative" style={{ transform: `scale(${state.avatars.sizeScale})` }}>
                            <div className={cn("w-9 h-9 flex items-center justify-center text-white text-xs font-medium",
                                state.avatars.shape === "circle" && "rounded-full",
                                state.avatars.shape === "rounded" && "rounded-xl",
                                state.avatars.shape === "square" && "rounded-md"
                            )} style={{ background: `${color}33`, border: `1px solid ${color}55` }}>
                                <User className="w-4 h-4" style={{ color }} />
                            </div>
                            {i === 0 && (
                                <div className={cn("absolute w-2.5 h-2.5 rounded-full bg-green-500 border-2",
                                    state.avatars.statusDotPosition === "top-right" ? "-top-0.5 -right-0.5" : "-bottom-0.5 -right-0.5"
                                )} style={{ borderColor: palette.background }} />
                            )}
                        </div>
                    ))}
                    <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={cn("w-7 h-7 flex items-center justify-center text-[9px] text-white/60 border-2",
                                state.avatars.shape === "circle" && "rounded-full",
                                state.avatars.shape === "rounded" && "rounded-lg",
                                state.avatars.shape === "square" && "rounded-sm"
                            )} style={{ background: "rgba(255,255,255,0.05)", borderColor: palette.background }} />
                        ))}
                        <div className={cn("w-7 h-7 flex items-center justify-center text-[9px] text-white/60 border-2",
                            state.avatars.shape === "circle" && "rounded-full",
                            state.avatars.shape === "rounded" && "rounded-lg",
                            state.avatars.shape === "square" && "rounded-sm"
                        )} style={{ background: `${palette.primary}22`, borderColor: palette.background, color: palette.primary }}>
                            +5
                        </div>
                    </div>
                </div>
            </FamilyWrapper>

            {/* ─── PROGRESS ─── */}
            <FamilyWrapper id="progress" label="Barras de Progreso" selected={selectedElement === "progress"} onSelect={() => select("progress")} palette={palette}>
                <div className="space-y-3">
                    {[
                        { label: "Carga del sistema", pct: 78 },
                        { label: "Sincronización", pct: 45 },
                    ].map(p => (
                        <div key={p.label} className="space-y-1">
                            <div className="flex justify-between text-[10px]" style={{ color: palette.textSecondary }}>
                                <span>{p.label}</span>
                                <span>{p.pct}%</span>
                            </div>
                            <div className="rounded-full overflow-hidden" style={{ height: `${state.progressBars.height}px`, background: "rgba(255,255,255,0.05)" }}>
                                <div className={cn("h-full rounded-full transition-all", state.progressBars.animated && "animate-pulse")}
                                    style={{
                                        width: `${p.pct}%`,
                                        background: state.progressBars.colorScheme === "primary" ? palette.primary
                                            : state.progressBars.colorScheme === "gradient" ? `linear-gradient(90deg, ${palette.primary}, ${palette.accent})`
                                                : `linear-gradient(90deg, #EF4444, #F59E0B, #10B981, #3B82F6, #8B5CF6)`,
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                    {/* Loading spinner */}
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${palette.primary}44`, borderTopColor: "transparent" }} />
                        <span className="text-[10px]" style={{ color: palette.textSecondary }}>Cargando...</span>
                    </div>
                </div>
            </FamilyWrapper>

            {/* ─── DIALOGS ─── */}
            <FamilyWrapper id="dialogs" label="Diálogos / Ventanas" selected={selectedElement === "dialogs"} onSelect={() => select("dialogs")} palette={palette}>
                <div className="relative rounded-xl overflow-hidden" style={{ background: `rgba(0,0,0,${state.dialogs.overlayOpacity * 0.5})`, backdropFilter: `blur(${state.dialogs.overlayBlur * 0.5}px)` }}>
                    <div className="p-3 m-3 rounded-lg" style={{ ...cardStyle, margin: 0 }}>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-medium" style={{ color: palette.textPrimary }}>¿Confirmar acción?</h4>
                            <button className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                                <X className="w-3 h-3" style={{ color: palette.textSecondary }} />
                            </button>
                        </div>
                        <p className="text-[10px] mb-3" style={{ color: palette.textSecondary }}>Esta acción no se puede deshacer.</p>
                        <div className="flex gap-2 justify-end">
                            <button className="px-3 py-1 text-[10px] rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: palette.textSecondary }}>Cancelar</button>
                            <button className="px-3 py-1 text-[10px] rounded-lg text-white font-medium" style={{ background: palette.primary }}>Confirmar</button>
                        </div>
                    </div>
                </div>
            </FamilyWrapper>

            {/* ─── TOASTS ─── */}
            <FamilyWrapper id="toasts" label="Notificaciones / Toasts" selected={selectedElement === "toasts"} onSelect={() => select("toasts")} palette={palette}>
                <div className="space-y-2">
                    {[
                        { icon: Check, label: "Cambios guardados correctamente", color: "#10B981", type: "success" },
                        { icon: AlertTriangle, label: "Conexión inestable", color: "#F59E0B", type: "warning" },
                        { icon: Info, label: "Nueva actualización disponible", color: palette.primary, type: "info" },
                    ].map(t => (
                        <div key={t.type} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl",
                            state.toasts.style === "glass" && "backdrop-blur-xl",
                            state.toasts.style === "solid" && "",
                            state.toasts.style === "minimal" && "border-l-2"
                        )} style={{
                            background: state.toasts.style === "glass" ? "rgba(255,255,255,0.06)" : state.toasts.style === "solid" ? palette.surface : "transparent",
                            border: state.toasts.style !== "minimal" ? `1px solid ${palette.glassBorder}` : "none",
                            borderLeftColor: state.toasts.style === "minimal" ? t.color : undefined,
                            borderLeftWidth: state.toasts.style === "minimal" ? "2px" : undefined,
                        }}>
                            <t.icon className="w-3.5 h-3.5 flex-none" style={{ color: t.color }} />
                            <span className="text-[10px] flex-1" style={{ color: palette.textPrimary }}>{t.label}</span>
                            <X className="w-3 h-3 flex-none" style={{ color: palette.textSecondary }} />
                        </div>
                    ))}
                </div>
            </FamilyWrapper>

            {/* ─── NAVIGATION ─── */}
            <FamilyWrapper id="navigation" label="Navegación / Dock" selected={selectedElement === "navigation"} onSelect={() => select("navigation")} palette={palette}>
                <div className="space-y-3">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1 text-[10px]">
                        <span style={{ color: palette.textSecondary }}>Inicio</span>
                        <span style={{ color: palette.textSecondary }}>
                            {state.nav.breadcrumbSeparator === "slash" ? "/" : state.nav.breadcrumbSeparator === "arrow" ? "›" : "•"}
                        </span>
                        <span style={{ color: palette.textSecondary }}>Ajustes</span>
                        <span style={{ color: palette.textSecondary }}>
                            {state.nav.breadcrumbSeparator === "slash" ? "/" : state.nav.breadcrumbSeparator === "arrow" ? "›" : "•"}
                        </span>
                        <span style={{ color: palette.primary }}>Apariencia</span>
                    </div>
                    {/* Mini Dock */}
                    <div className={cn("flex items-center justify-center gap-1.5 py-2 px-3 mx-auto",
                        state.nav.dockStyle === "floating" && "rounded-2xl",
                        state.nav.dockStyle === "attached" && "rounded-t-xl",
                        state.nav.dockStyle === "minimal" && "rounded-lg"
                    )} style={{
                        background: state.nav.dockStyle === "minimal" ? "transparent" : "rgba(255,255,255,0.04)",
                        backdropFilter: `blur(${geometry.panelBlur}px)`,
                        border: state.nav.dockStyle !== "minimal" ? `1px solid ${palette.glassBorder}` : "none",
                        maxWidth: device === "mobile" ? "260px" : "320px",
                    }}>
                        {[Home, Compass, Layers, MessageSquare, Settings].map((Icon, i) => (
                            <div key={i}
                                className="flex items-center justify-center rounded-xl transition-all hover:scale-110 cursor-pointer"
                                style={{
                                    width: `${geometry.dockIconSize + 14}px`,
                                    height: `${geometry.dockIconSize + 14}px`,
                                    background: i === 0 ? `${palette.primary}22` : "transparent",
                                    padding: `${state.nav.menuItemPadding * 0.5}px`,
                                }}
                            >
                                <Icon style={{ width: `${geometry.dockIconSize}px`, height: `${geometry.dockIconSize}px`, color: i === 0 ? palette.primary : palette.textSecondary }} />
                            </div>
                        ))}
                    </div>
                    {/* Menu Items */}
                    <div className="space-y-0.5">
                        {["Dashboard", "Red Social", "Configuración"].map((item, i) => (
                            <div key={item} className="flex items-center gap-2 rounded-lg transition-all text-[11px]"
                                style={{
                                    padding: `${state.nav.menuItemPadding}px ${state.nav.menuItemPadding * 1.5}px`,
                                    background: i === 0 ? `${palette.primary}15` : "transparent",
                                    color: i === 0 ? palette.primary : palette.textSecondary,
                                }}>
                                <ChevronRight className="w-3 h-3" />
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            </FamilyWrapper>
        </div>
    );
}
