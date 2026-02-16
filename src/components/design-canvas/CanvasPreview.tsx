import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { CanvasState, ElementFamily } from "./state-types";
import { defaultCanvasState } from "./state-types";
import { motion, AnimatePresence } from "framer-motion";
import {
    Sparkles, ArrowRight, Heart, Star, Bell, Search, User, Settings,
    X, Check, ChevronRight, Info, AlertTriangle, MessageSquare,
    Home, Compass, Layers, MoreHorizontal, MousePointer2, Scan, Circle,
    Zap, Mail, Lock, CircleDot, Shield, LayoutGrid, Bot, Palette, Type, ToggleLeft,
    BarChart3, Users
} from "lucide-react";

interface Props {
    state: CanvasState;
    device: "desktop" | "mobile" | "tablet";
    selectedElement: ElementFamily;
    onSelectElement: (family: ElementFamily) => void;
    onClose?: () => void;
    onApplyToContext?: (mapped: any) => void;
    onSaveTheme?: (name: string, config: any) => void;
    onImport?: (loadedState: any) => void;
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
            id={id ? `family-wrapper-${id}` : undefined}
            data-family={id}
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
    const {
        palette,
        typography,
        components,
        effects,
        geometry,
        layoutConfig = defaultCanvasState.layoutConfig,
        widgets = defaultCanvasState.widgets
    } = state;

    const btnStyle = (variant: string): React.CSSProperties => {
        const base = { borderRadius: `${geometry.radiusButtons}px`, transition: "all 0.2s" };
        switch (components.buttonStyle) {
            case "glass": return { ...base, background: `${palette.primary}22`, backdropFilter: `blur(${effects.backdropBlur}px)`, border: `1px solid rgba(255,255,255,0.12)`, boxShadow: components.buttonGlow ? `0 0 15px ${palette.primary}33` : undefined };
            case "liquid": return { ...base, background: `linear-gradient(135deg, ${palette.primary}33, ${palette.accent}33)`, backdropFilter: `blur(${effects.backdropBlur * 1.5}px)`, border: `1px solid rgba(255,255,255,0.15)` };
            case "neon": return { ...base, background: "transparent", border: `2px solid ${palette.accent}`, boxShadow: `0 0 15px ${palette.accent}44` };
            case "brutal": return { ...base, background: "#fff", color: "#000", border: "2px solid #000", boxShadow: "4px 4px 0 #000", borderRadius: `${Math.min(geometry.radiusButtons, 8)}px` };
            default: return { ...base, background: palette.primary, border: "none", boxShadow: components.buttonGlow ? `0 0 20px ${palette.primary}66` : undefined };
        }
    };

    const widgetStyle = (isHeader: boolean = false): React.CSSProperties => {
        const style: React.CSSProperties = {
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            position: "relative",
            overflow: "hidden",
        };

        // Base background
        switch (widgets.bgStyle) {
            case "solid":
                style.background = palette.surface;
                break;
            case "cyber":
                style.background = "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)";
                style.boxShadow = "inset 0 0 20px rgba(0,255,255,0.05)";
                break;
            case "mesh":
                style.background = `radial-gradient(at 0% 0%, ${palette.primary}15 0%, transparent 50%), radial-gradient(at 100% 100%, ${palette.accent}15 0%, transparent 50%)`;
                style.backgroundColor = palette.surface;
                break;
            default: // glass
                style.background = `rgba(255,255,255,${widgets.glassOpacity || 0.05})`;
                style.backdropFilter = `blur(${effects.backdropBlur}px)`;
                break;
        }

        // Borders
        switch (widgets.borderStyle) {
            case "thin":
                style.border = `1px solid ${palette.glassBorder}`;
                break;
            case "glow":
                style.border = `1px solid ${palette.primary}44`;
                style.boxShadow = `0 0 10px ${palette.primary}22`;
                break;
            case "neon":
                style.border = `1px solid ${palette.accent}`;
                style.boxShadow = `0 0 15px ${palette.accent}33`;
                break;
            default:
                style.border = "none";
        }

        // Shadows
        if (widgets.shadows !== "none") {
            const shadowMap: Record<string, string> = {
                sm: "0 2px 8px rgba(0,0,0,0.2)",
                md: "0 8px 24px rgba(0,0,0,0.3)",
                lg: "0 20px 48px rgba(0,0,0,0.4)",
                neon: `0 0 30px ${palette.primary}33`,
            };
            style.boxShadow = (style.boxShadow ? style.boxShadow + ", " : "") + shadowMap[widgets.shadows];
        }

        // Radius & Smoothing
        style.borderRadius = `${geometry.radiusWidgets}px`;
        // Corner smoothing is hard to do in CSS without clips, but we can simulate by increasing radius
        if (widgets.cornerSmoothing > 0.5) {
            style.borderRadius = `${geometry.radiusWidgets * 1.5}px`;
        }

        return style;
    };

    const cardStyle = (preset?: string): React.CSSProperties => {
        const base = widgetStyle();
        if (!preset || preset === "crystal") return base;

        switch (preset) {
            case "liquid-action":
                return { ...base, background: `linear-gradient(135deg, ${palette.primary}11, ${palette.accent}11)`, backdropFilter: "blur(20px) saturate(180%)" };
            case "holographic":
                return { ...base, background: `linear-gradient(135deg, ${palette.primary}15 0%, transparent 50%, ${palette.accent}15 100%)`, border: "1px solid rgba(255,255,255,0.25)" };
            case "hyper-crystal":
                return { ...base, background: "rgba(255,255,255,0.03)", backdropFilter: "blur(40px) contrast(110%)", border: "1px solid rgba(255,255,255,0.3)" };
            default: return base;
        }
    };

    const inputBorderStyles: Record<string, React.CSSProperties> = {
        none: { border: "1px solid transparent" },
        subtle: { border: `1px solid rgba(255,255,255,0.08)` },
        solid: { border: `1px solid rgba(255,255,255,0.2)` },
        glow: { border: `1px solid ${palette.primary}66`, boxShadow: `0 0 10px ${palette.primary}22` },
    };

    const [animActive, setAnimActive] = useState(false);

    useEffect(() => {
        if (state.ui.lastAnimTrigger > 0) {
            setAnimActive(true);
            const timer = setTimeout(() => setAnimActive(false), state.components.transitionSpeed * 3);
            return () => clearTimeout(timer);
        }
    }, [state.ui.lastAnimTrigger, state.components.transitionSpeed]);

    const select = (id: ElementFamily) => onSelectElement(id);

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

            {/* ─── WIDGETS & LAYOUTS ─── */}
            <FamilyWrapper id="widgets" label="Widgets & Layouts" selected={selectedElement === "widgets"} onSelect={() => select("widgets")} palette={palette}>

                <div className="space-y-4">
                    {/* Header Specimen */}
                    <div className="p-3 mb-2 rounded-xl" style={widgetStyle()}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ background: palette.primary }} />
                                <span className="text-[10px] font-bold uppercase tracking-wider"
                                    style={{
                                        color: state.widgets.headerStyle === 'accented' ? palette.primary : palette.textPrimary,
                                        borderBottom: state.widgets.headerStyle === 'underlined' ? `1px solid ${palette.primary}44` : 'none'
                                    }}>
                                    Global Status
                                </span>
                            </div>
                            <MoreHorizontal className="w-3 h-3 text-white/30" />
                        </div>
                    </div>

                    {/* Layout Mockup */}
                    <div className="grid grid-cols-12 gap-2 min-h-[140px]">
                        {state.widgets.dashboardTemplate === 'standard' && (
                            <>
                                <div className="col-span-8 p-3" style={cardStyle(components.cardPreset)}>
                                    <div className="h-2 w-1/3 rounded-full mb-3" style={{ background: palette.primary, opacity: 0.3 }} />
                                    <div className="space-y-2">
                                        <div className="h-1.5 w-full rounded-full bg-white/5" />
                                        <div className="h-1.5 w-5/6 rounded-full bg-white/5" />
                                        <div className="h-1.5 w-4/6 rounded-full bg-white/5" />
                                    </div>
                                </div>
                                <div className="col-span-4 flex flex-col gap-2">
                                    <div className="flex-1 p-3 flex items-center justify-center" style={cardStyle()}>
                                        <Bot className="w-5 h-5 text-cyan-400/50" />
                                    </div>
                                    <div className="flex-1 p-3 flex items-center justify-center" style={cardStyle()}>
                                        <Zap className="w-5 h-5 text-amber-400/50" />
                                    </div>
                                </div>
                            </>
                        )}

                        {state.widgets.dashboardTemplate === 'analyst' && (
                            <>
                                <div className="col-span-4 p-3" style={cardStyle()}>
                                    <BarChart3 className="w-4 h-4 mb-2 text-emerald-400" />
                                    <div className="h-1 w-full bg-white/10 rounded-full" />
                                </div>
                                <div className="col-span-4 p-3" style={cardStyle()}>
                                    <Users className="w-4 h-4 mb-2 text-purple-400" />
                                    <div className="h-1 w-full bg-white/10 rounded-full" />
                                </div>
                                <div className="col-span-4 p-3" style={cardStyle()}>
                                    <Shield className="w-4 h-4 mb-2 text-rose-400" />
                                    <div className="h-1 w-full bg-white/10 rounded-full" />
                                </div>
                                <div className="col-span-12 p-3 mt-1" style={cardStyle(components.cardPreset)}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[9px] uppercase tracking-tighter opacity-50">Trend Analysis</span>
                                        <span className="text-[10px] text-emerald-400">+12%</span>
                                    </div>
                                    <div className="h-8 w-full flex items-end gap-1">
                                        {[4, 7, 5, 9, 6, 8, 10, 7].map((h, i) => (
                                            <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h * 10}%`, background: palette.primary, opacity: 0.4 + (i * 0.05) }} />
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {state.widgets.dashboardTemplate === 'creative' && (
                            <div className="col-span-12 grid grid-cols-3 gap-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="aspect-square p-2 flex flex-col items-center justify-center group" style={cardStyle(components.cardPreset)}>
                                        <div className="w-8 h-8 rounded-lg mb-2 flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${palette.primary}${i * 22}` }}>
                                            <Palette className="w-4 h-4 text-white/50" />
                                        </div>
                                        <span className="text-[9px] opacity-40">Asset 0{i}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {state.widgets.dashboardTemplate === 'strategic' && (
                            <>
                                <div className="col-span-12 p-4 flex items-center gap-4" style={cardStyle(components.cardPreset)}>
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20">
                                        <LayoutGrid className="w-5 h-5 text-cyan-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="h-2 w-32 rounded-full" style={{ background: palette.primary }} />
                                        <div className="h-1.5 w-20 rounded-full bg-white/10" />
                                    </div>
                                </div>
                                <div className="col-span-6 p-3" style={cardStyle()}>
                                    <div className="h-full w-full border-l-2 border-white/5 pl-2">
                                        <div className="text-[11px] font-bold">ALPHA</div>
                                        <div className="text-[9px] opacity-40 italic">Active Node</div>
                                    </div>
                                </div>
                                <div className="col-span-6 p-3" style={cardStyle()}>
                                    <div className="h-full w-full border-l-2 border-white/5 pl-2">
                                        <div className="text-[11px] font-bold">BETA</div>
                                        <div className="text-[9px] opacity-40 italic">Standby</div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* ASHost / Players Section (New) */}
                    <div className="mt-4 p-4 rounded-2xl bg-black/40 border border-white/5 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">ASHost Metrics</span>
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[8px] text-emerald-500 font-mono">LIVE</span>
                            </div>
                        </div>

                        {/* Dynamic Graph Render */}
                        <div className="min-h-[100px] flex items-center justify-center p-3 rounded-xl bg-white/5 border border-white/10 relative overflow-hidden">
                            {widgets.ashostGraphType === 'bar' && (
                                <div className="flex items-end gap-1.5 w-full h-20">
                                    {[40, 70, 50, 90, 65, 80, 45].map((h, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${h}%` }}
                                            transition={{ duration: 1 / widgets.ashostSpeed, delay: i * 0.1 }}
                                            className="flex-1 rounded-t-sm"
                                            style={{ background: `linear-gradient(to top, ${widgets.ashostColor}aa, ${widgets.ashostColor})` }}
                                        />
                                    ))}
                                </div>
                            )}

                            {widgets.ashostGraphType === 'line' && (
                                <svg className="w-full h-20 overflow-visible">
                                    <motion.path
                                        d="M0 60 Q 30 10, 60 40 T 120 20 T 180 50 T 240 30"
                                        fill="none"
                                        stroke={widgets.ashostColor}
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: 1 }}
                                        transition={{ duration: 2 / widgets.ashostSpeed, repeat: Infinity, repeatType: "reverse" }}
                                    />
                                    <motion.path
                                        d="M0 60 Q 30 10, 60 40 T 120 20 T 180 50 T 240 30"
                                        fill="none"
                                        stroke={widgets.ashostColor}
                                        strokeWidth="6"
                                        className="opacity-10"
                                    />
                                </svg>
                            )}

                            {widgets.ashostGraphType === 'dot' && (
                                <div className="relative w-full h-20 overflow-hidden">
                                    <div className="absolute inset-0 grid grid-cols-6 gap-2 opacity-20">
                                        {Array.from({ length: 18 }).map((_, i) => (
                                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white" />
                                        ))}
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        {[1, 2, 3].map(i => (
                                            <motion.div
                                                key={i}
                                                animate={{
                                                    scale: [1, 1.5, 1],
                                                    opacity: [0.3, 0.6, 0.3],
                                                }}
                                                transition={{
                                                    duration: (2 + i) / widgets.ashostSpeed,
                                                    repeat: Infinity,
                                                }}
                                                className="absolute rounded-full border"
                                                style={{
                                                    width: `${i * 30}px`,
                                                    height: `${i * 30}px`,
                                                    borderColor: widgets.ashostColor,
                                                }}
                                            />
                                        ))}
                                        <div className="w-2 h-2 rounded-full shadow-[0_0_15px]" style={{ background: widgets.ashostColor }} />
                                    </div>
                                </div>
                            )}

                            {widgets.ashostGraphType === 'radar' && (
                                <div className="relative w-24 h-24">
                                    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                                        <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
                                        <circle cx="50" cy="50" r="25" fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
                                        <path d="M50 10 L50 90 M10 50 L90 50" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />
                                        <motion.polygon
                                            points="50,20 80,50 50,80 20,50"
                                            fill={widgets.ashostColor}
                                            fillOpacity="0.2"
                                            stroke={widgets.ashostColor}
                                            strokeWidth="1.5"
                                            animate={{
                                                points: [
                                                    "50,20 80,50 50,80 20,50",
                                                    "50,10 90,50 50,90 10,50",
                                                    "50,20 80,50 50,80 20,50"
                                                ]
                                            }}
                                            transition={{ duration: 3 / widgets.ashostSpeed, repeat: Infinity }}
                                        />
                                    </svg>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center px-1">
                            <span className="text-[9px] text-white/30 uppercase tracking-tighter">Current Load: 42%</span>
                            <span className="text-[9px] font-mono" style={{ color: widgets.ashostColor }}>Nodes Active: 12</span>
                        </div>
                    </div>

                    {/* Dialog Specimen */}
                    <div className="relative mt-4 h-24 flex items-center justify-center overflow-hidden rounded-xl border border-white/5 bg-black/40">
                        {/* Overlay Mockup */}
                        <div className="absolute inset-0 bg-black/20" style={{ backdropFilter: `blur(${state.dialogs.overlayBlur}px)`, opacity: state.dialogs.overlayOpacity }} />

                        {/* Modal Mockup */}
                        <div className="relative p-3 w-4/5 shadow-2xl" style={{ ...widgetStyle(), borderRadius: `${geometry.radiusWindows}px`, zIndex: 10 }}>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-bold">System Dialog</span>
                                {state.dialogs.closeButtonStyle === 'pill' ? (
                                    <div className="px-2 py-0.5 rounded-full bg-white/5 text-[8px]">Close</div>
                                ) : state.dialogs.closeButtonStyle === 'icon' ? (
                                    <Settings className="w-2.5 h-2.5 opacity-40" />
                                ) : (
                                    <X className="w-2.5 h-2.5 opacity-40" />
                                )}
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full" />
                        </div>
                    </div>
                </div>
            </FamilyWrapper >

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ─── UI COMPONENTS ─── */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div id="preview-components" className="py-4 border-y border-white/10 my-8">
                <h3 className="text-[11px] uppercase tracking-[0.3em] text-white/50 font-bold px-4 flex items-center gap-3">
                    <LayoutGrid className="w-4 h-4 text-cyan-500/50" />
                    Interacción & UI
                </h3>
            </div>

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
                        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", borderRadius: `${geometry.radiusInputs}px`, ...inputBorderStyles[components.inputBorderStyle] }}>
                            <Search className="w-3.5 h-3.5" style={{ color: `${palette.textSecondary}` }} />
                            <span className="text-xs" style={{ color: `${palette.textSecondary}88` }}>Buscar en la red...</span>
                        </div>
                    </div>
                    <div className="px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.03)", borderRadius: `${geometry.radiusInputs}px`, ...inputBorderStyles[components.inputBorderStyle], color: palette.textSecondary, minHeight: "48px" }}>
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
                            className={cn("text-[10px] font-medium inline-flex items-center gap-1 px-3 py-1 border")}
                            style={{
                                background: `${b.color}22`,
                                color: b.color,
                                border: `1px solid ${b.color}33`,
                                borderRadius: components.badgeStyle === "pill" ? "9999px" : `${geometry.radiusBadges}px`
                            }}
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
                            components.tooltipStyle === "glass" && "backdrop-blur-xl",
                        )}
                            style={{
                                background: components.tooltipStyle === "glass" ? "rgba(255,255,255,0.08)" : components.tooltipStyle === "solid" ? palette.surface : "rgba(0,0,0,0.85)",
                                border: components.tooltipStyle !== "minimal" ? `1px solid ${palette.glassBorder}` : "none",
                                borderRadius: `${geometry.radiusDropdowns}px`,
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
                            className={cn("px-3 py-1.5 text-[11px] font-medium transition-all cursor-default")}
                            style={i === 0 ? {
                                background: state.tabsConfig.style !== "underline" ? `${state.tabsConfig.activeColor}22` : "transparent",
                                color: state.tabsConfig.activeColor,
                                borderRadius: state.tabsConfig.style === "pill" ? "9999px" : state.tabsConfig.style === "box" ? `${geometry.radiusTabs}px` : "0",
                                borderBottom: state.tabsConfig.style === "underline" ? `2px solid ${state.tabsConfig.activeColor}` : "none",
                                borderLeft: state.tabsConfig.style !== "underline" ? `1px solid ${state.tabsConfig.activeColor}33` : "none",
                                borderRight: state.tabsConfig.style !== "underline" ? `1px solid ${state.tabsConfig.activeColor}33` : "none",
                                borderTop: state.tabsConfig.style !== "underline" ? `1px solid ${state.tabsConfig.activeColor}33` : "none",
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
                <div className="grid grid-cols-2 gap-4">
                    {/* Switch Selection & Design Variety */}
                    <div className="space-y-3">
                        <p className="text-[9px] text-white/30 uppercase tracking-tighter mb-1">Configuración Activa</p>

                        {/* Dynamic Active Switch */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
                            <span className="text-[10px] text-white font-medium">Switch {state.toggles.switchStyle}</span>

                            {state.toggles.switchStyle === "standard" && (
                                <div className="w-9 h-5 rounded-full relative transition-all" style={{ background: state.toggles.switchTrackColor }}>
                                    <div className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-md" />
                                </div>
                            )}

                            {state.toggles.switchStyle === "cyber" && (
                                <div className="w-10 h-6 rounded-md relative flex items-center p-1 border" style={{ background: "#000", borderColor: state.toggles.switchTrackColor }}>
                                    <div className="w-4 h-4 rounded-sm shadow-[0_0_10px_white]" style={{ background: state.toggles.switchTrackColor, marginLeft: 'auto' }} />
                                </div>
                            )}

                            {state.toggles.switchStyle === "fluid" && (
                                <div className="w-10 h-5 rounded-full relative overflow-hidden bg-white/10">
                                    <div className="absolute inset-0 transition-all opacity-40" style={{ background: state.toggles.switchTrackColor, width: '100%' }} />
                                    <div className="absolute right-1 top-1 w-3 h-3 rounded-full bg-white shadow-[0_0_8px_white]" />
                                </div>
                            )}
                        </div>

                        <p className="text-[9px] text-white/30 uppercase tracking-tighter mt-4 mb-1">Galería de Estilos</p>
                        <div className="grid grid-cols-1 gap-2">
                            <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 opacity-50">
                                <span className="text-[9px] text-white/40">Slim Line</span>
                                <div className="w-6 h-1 rounded-full bg-white/20 relative">
                                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white shadow-sm" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 opacity-50">
                                <span className="text-[9px] text-white/40">Brutal Square</span>
                                <div className="w-8 h-4 border-2 border-white bg-white/10 relative">
                                    <div className="absolute top-0 right-0 w-3 h-full bg-white" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Check / Radio */}
                    <div className="space-y-3">
                        <p className="text-[9px] text-white/30 uppercase tracking-tighter mb-1">Entradas de Estado</p>

                        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/3 border border-white/5">
                            <div className={cn("w-5 h-5 flex items-center justify-center transition-all",
                                state.toggles.checkboxStyle === "round" ? "rounded-full" : "rounded-lg"
                            )} style={{ background: palette.primary, border: `1px solid ${palette.primary}44`, boxShadow: `0 0 12px ${palette.primary}33` }}>
                                <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-white/80 font-medium">Checkbox</span>
                                <span className="text-[8px] text-white/30 uppercase">{state.toggles.checkboxStyle}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/3 border border-white/5">
                            <div className="rounded-full border-2 flex items-center justify-center transition-all" style={{ width: `${state.toggles.radioSize}px`, height: `${state.toggles.radioSize}px`, borderColor: palette.primary, boxShadow: `0 0 12px ${palette.primary}22` }}>
                                <div className="rounded-full scale-75" style={{ width: '100%', height: '100%', background: palette.primary }} />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-white/80 font-medium">Radio Button</span>
                                <span className="text-[8px] text-white/30 uppercase">Size: {state.toggles.radioSize}px</span>
                            </div>
                        </div>
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
                        <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{
                            borderTopColor: palette.primary,
                            borderRightColor: 'rgba(255,255,255,0.1)',
                            borderBottomColor: 'rgba(255,255,255,0.1)',
                            borderLeftColor: 'rgba(255,255,255,0.1)'
                        }} />
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
                <div className="space-y-2 relative min-h-[100px] flex flex-col justify-center">
                    {[
                        { icon: Check, label: "Estilo seleccionado aplicado", color: "#10B981", type: "success" },
                        { icon: Info, label: "Prueba los estilos Neón y Blast", color: palette.primary, type: "info" },
                    ].map(t => (
                        <div key={t.type} className={cn("flex items-center gap-2.5 px-3 py-2 rounded-xl",
                            state.toasts.style === "glass" && "backdrop-blur-xl bg-white/5 border border-white/10",
                            state.toasts.style === "solid" && "bg-zinc-900 border border-zinc-800",
                            state.toasts.style === "minimal" && "border-l-2 bg-white/5",
                            state.toasts.style === "neon" && "bg-black/40 border border-primary/40 shadow-[0_0_10px_rgba(var(--primary-rgb),0.2)]",
                            state.toasts.style === "cyber" && "bg-black border border-primary rounded-none",
                            state.toasts.style === "blast" && "bg-gradient-to-r from-primary/20 to-secondary/20 border border-white/10"
                        )} style={{
                            borderLeftColor: state.toasts.style === "minimal" ? t.color : undefined,
                            borderLeftWidth: state.toasts.style === "minimal" ? "2px" : undefined,
                        }}>
                            <t.icon className="w-3.5 h-3.5 flex-none" style={{ color: t.color }} />
                            <span className="text-[10px] flex-1 text-white/70">{t.label}</span>
                        </div>
                    ))}
                    <p className="text-[8px] text-center text-white/20 mt-2 italic uppercase tracking-widest">
                        Vista Estática • Usa el botón 'Probar' para live view
                    </p>
                </div>
            </FamilyWrapper>

            {/* ─── ANIMATIONS PREVIEW ─── */}
            <FamilyWrapper id="animations" label="Animaciones Globales" selected={selectedElement === "animations"} onSelect={() => select("animations")} palette={palette}>
                <div className="flex items-center justify-between p-4 bg-white/3 rounded-xl border border-white/5 relative overflow-hidden group">
                    <div className="space-y-1 relative z-10">
                        <p className="text-[10px] font-bold text-white/90">Preview de Movimiento</p>
                        <p className="text-[9px] text-white/40">Velocidad: {state.components.transitionSpeed}ms</p>
                    </div>

                    <motion.div
                        animate={animActive ? {
                            x: [0, 50, 0, -50, 0],
                            rotate: [0, 90, 180, 270, 360],
                            scale: [1, 1.2, 0.8, 1.1, 1]
                        } : {}}
                        transition={{ duration: state.components.transitionSpeed / 100, ease: "easeInOut" }}
                        className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10"
                        style={{ background: palette.primary, boxShadow: `0 0 20px ${palette.primary}44` }}
                    >
                        <Zap className="w-5 h-5 text-white fill-current" />
                    </motion.div>

                    {/* Animated background lines */}
                    <AnimatePresence>
                        {animActive && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.2 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 pointer-events-none"
                            >
                                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.1)_50%,transparent_100%)] animate-shimmer"
                                    style={{ animationDuration: `${state.components.transitionSpeed}ms` }} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Hover effect demonstration */}
                    <div className={cn("absolute inset-0 transition-opacity duration-300",
                        state.components.animateHover ? "opacity-100" : "opacity-0"
                    )}>
                        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-transparent group-hover:from-cyan-500/10" />
                    </div>
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
                </div>
            </FamilyWrapper>

            {/* ─── LAYOUTS ─── */}
            <FamilyWrapper id="layouts" label="Sistemas de Layout" selected={selectedElement === "layouts"} onSelect={() => select("layouts")} palette={palette}>
                <div className="relative p-2 bg-black/20 rounded-2xl min-h-[160px] flex items-center justify-center overflow-hidden">
                    {/* Abstract Window representation */}
                    <div
                        style={{
                            padding: `${layoutConfig.windowPadding}px`,
                            backdropFilter: `blur(${layoutConfig.windowBlur}px)`,
                            background: 'rgba(255,255,255,0.05)',
                            transition: 'all 0.4s ease',
                            width: '90%',
                            position: 'relative',
                            ...(layoutConfig.windowStyle === 'cyber' ? {
                                clipPath: 'polygon(0% 15px, 15px 0%, 100% 0%, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0% 100%)',
                                border: 'none',
                                background: 'rgba(255,255,255,0.08)',
                            } : layoutConfig.windowStyle === 'floating' ? {
                                border: 'none',
                                boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 0 20px ${palette.primary}33`,
                                borderRadius: '24px',
                            } : {
                                border: layoutConfig.frameType === 'minimal' ? '1px solid rgba(255,255,255,0.1)' :
                                    layoutConfig.frameType === 'thick' ? '4px solid rgba(255,255,255,0.2)' :
                                        `2px solid ${palette.glassBorder}`,
                                borderRadius: '16px',
                            })
                        }}
                    >
                        {/* Title Bar Mask */}
                        {layoutConfig.showTitleBar && (
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5 text-[9px] uppercase tracking-tighter opacity-60">
                                <span>StarSeed Interface v2.0</span>
                                <div className="flex gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-white/20" />
                                    <div className="w-2 h-2 rounded-full bg-white/20" />
                                    <div className="w-2 h-2 rounded-full bg-white/20" />
                                </div>
                            </div>
                        )}

                        {/* Tab Layout Mask */}
                        <div className={cn(
                            "flex gap-3",
                            layoutConfig.tabLayout === "side" ? "flex-row" :
                                layoutConfig.tabLayout === "bottom" ? "flex-col-reverse" : "flex-col"
                        )}>
                            <div className={cn(
                                "flex gap-2",
                                layoutConfig.tabLayout === "side" ? "flex-col border-r border-white/10 pr-3" : "flex-row"
                            )}>
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="w-6 h-1.5 rounded-full bg-white/20" />
                                ))}
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="h-3 w-1/2 rounded bg-white/10" />
                                <div className="h-10 w-full rounded bg-white/5 border border-white/5" />
                                <div className="h-3 w-5/6 rounded bg-white/5" />
                            </div>
                        </div>
                    </div>
                </div>
            </FamilyWrapper>
        </div>
    );
}

