import React from 'react';
import { motion } from 'framer-motion';
import {
    Zap, Home, User, MessageSquare, Settings, Search, Star, Heart, Bell, Bot,
    Shield, CircleDot, Sparkles, Layers, Compass, Plus, Activity, PenSquare, Layout, X, Network,
    Brain, FlaskConical, Map, Building, Music, Paintbrush, Users,
    Cpu, Globe, Terminal, Wifi, TreePine, Flower2, Sun, Droplets, Mountain, Wind,
    PenTool, Workflow, BarChart2, Anchor, Fingerprint, Magnet, MousePointer2,
    PanelLeft, PanelRight, CheckCircle, AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { CanvasState, ElementFamily } from './state-types';
import { StitchButton } from '../stitch/StitchButton';
import { StitchInput } from '../stitch/StitchInput';
import { StitchCard } from '../stitch/StitchCard';
import { StitchBadge } from '../stitch/StitchBadge';
import { StitchTooltip } from '../stitch/StitchTooltip';
import { StitchTabs } from '../stitch/StitchTabs';
import { StitchToggle } from '../stitch/StitchToggle';
import { StitchCheckbox } from '../stitch/StitchCheckbox';
import { StitchRadio } from '../stitch/StitchRadio';

interface CanvasPreviewProps {
    state: CanvasState;
    selectedElement: ElementFamily | null;
    onSelectElement: (id: ElementFamily) => void;
}

// ─── FUNCTIONAL SYSTEM ICONS ─────────────────────────────────
// Primary: core network/app icons (always visible as main row)
const PRIMARY_ICONS: { icon: any; label: string }[] = [
    { icon: Home, label: 'Inicio' },
    { icon: Search, label: 'Buscar' },
    { icon: Bell, label: 'Alertas' },
    { icon: User, label: 'Perfil' },
    { icon: MessageSquare, label: 'Chat' },
    { icon: Settings, label: 'Config' },
    { icon: Network, label: 'Red' },
    { icon: Bot, label: 'IA' },
    { icon: Compass, label: 'Explorar' },
    { icon: Activity, label: 'Estado' },
];

// Secondary: menus, actions, tools
const SECONDARY_ICONS: { icon: any; label: string }[] = [
    { icon: Plus, label: 'Crear' },
    { icon: Star, label: 'Favorito' },
    { icon: Heart, label: 'Like' },
    { icon: Shield, label: 'Seguro' },
    { icon: Layers, label: 'Capas' },
    { icon: Layout, label: 'Layout' },
    { icon: Zap, label: 'Acción' },
    { icon: PenSquare, label: 'Editar' },
    { icon: Globe, label: 'Global' },
    { icon: Terminal, label: 'Terminal' },
];

// ─── FAMILY WRAPPER with Trinity + Layout integration ────────
function FamilyWrapper({ id, label, selected, onSelect, palette, state, children }: {
    id: ElementFamily;
    label: string;
    selected: boolean;
    onSelect: () => void;
    palette: CanvasState["palette"];
    state: CanvasState;
    children: React.ReactNode;
}) {
    const { layoutConfig, nav } = state;
    const trinityColor = selected
        ? (palette.trinity?.zenith?.active || "#06B6D4")
        : (palette.trinity?.base?.active || "#8B5CF6");

    return (
        <motion.div
            id={id ? `family-wrapper-${id}` : undefined}
            data-family={id}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={cn(
                "relative transition-all cursor-pointer group overflow-hidden",
                // Frame type
                layoutConfig.frameType === 'minimal' ? 'border rounded-xl' :
                    layoutConfig.frameType === 'thick' ? 'border-2 rounded-xl' : 'border rounded-2xl',
                // Selected state with Trinity awareness
                selected
                    ? "ring-2 ring-cyan-400/60 border-cyan-400/30 bg-cyan-400/5"
                    : "border-white/5 hover:border-white/15 hover:bg-white/[0.02]"
            )}
            style={{
                padding: `${Math.max(layoutConfig.windowPadding / 3, 12)}px`,
                backdropFilter: layoutConfig.frameType === 'glass' ? `blur(${layoutConfig.windowBlur}px)` : undefined,
                boxShadow: selected && nav.trinityColorShadow
                    ? `0 4px 20px ${trinityColor}22, 0 0 40px ${trinityColor}08`
                    : selected && nav.trinityGlow
                        ? `0 0 20px ${palette.trinity?.zenith?.glow || "#06B6D425"}`
                        : undefined,
            }}
        >
            {/* Title bar (from Layout config) */}
            {layoutConfig.showTitleBar && (
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400/50" />
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-400/50" />
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400/50" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 group-hover:text-white/60 transition-colors flex-1">
                        {label}
                    </span>
                    {selected && (
                        <motion.div
                            layoutId="active-indicator"
                            className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                        />
                    )}
                </div>
            )}
            {/* Standard header (when no title bar) */}
            {!layoutConfig.showTitleBar && (
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 group-hover:text-white/60 transition-colors">
                        {label}
                    </span>
                    {selected && (
                        <motion.div
                            layoutId="active-indicator"
                            className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                        />
                    )}
                </div>
            )}
            {/* Trinity corner blend effect */}
            {nav.trinityCornerBlend && selected && (
                <>
                    <div className="absolute top-0 left-0 w-12 h-12 rounded-tl-2xl pointer-events-none"
                        style={{ background: `radial-gradient(circle at 0 0, ${palette.trinity?.zenith?.active || "#06B6D4"}15, transparent 70%)` }} />
                    <div className="absolute bottom-0 right-0 w-12 h-12 rounded-br-2xl pointer-events-none"
                        style={{ background: `radial-gradient(circle at 100% 100%, ${palette.trinity?.horizonte?.active || "#EF4444"}15, transparent 70%)` }} />
                </>
            )}
            {children}
        </motion.div>
    );
}

// ─── TRINITY PREVIEW SECTION ─────────────────────────────────────────────────
function TrinityPreviewSection({ state }: { state: CanvasState }) {
    const [hoveredPanel, setHoveredPanel] = React.useState<'left' | 'right' | null>(null);

    const tc = state.trinityConfig;
    const nav = state.nav;
    const trinity = state.palette.trinity;

    const zenithColor = trinity?.zenith?.active || "#06B6D4";
    const creationColor = trinity?.nucleo?.creation || "#10B981";
    const logicColor = trinity?.nucleo?.logic || "#F59E0B";
    const horizonColor = trinity?.horizonte?.active || "#EF4444";
    const baseColor = trinity?.base?.active || "#8B5CF6";

    const energyLevel = tc?.energyLevel ?? 0.5;
    const panelOpacity = tc?.panelOpacity ?? 0.85;
    const panelBlur = tc?.panelBlur ?? 20;
    const showZenith = tc?.showZenith ?? true;
    const showCreation = tc?.showCreation ?? true;
    const showLogic = tc?.showLogic ?? true;
    const showAura = tc?.showAura ?? true;
    const auraIntensity = tc?.auraIntensity ?? 0.7;
    const fluidTension = tc?.fluidTension ?? 0.7;
    const morphState = tc?.morphState || "liquid";
    const dockPosition = nav?.dockPosition || "bottom";
    const interactionMode = tc?.interactionMode || "magnetic";
    const physicsMode = nav?.trinityPhysics || "spring";

    // Physics Config
    const physicsConfig = physicsMode === 'elastic' ? { type: "spring", stiffness: 400, damping: 15 }
        : physicsMode === 'smooth' ? { duration: 0.5, ease: "easeInOut" }
            : { type: "spring", stiffness: 300, damping: 25 }; // spring default

    // Interaction Config
    const hoverEffect = interactionMode === 'magnetic' ? { scale: 1.05, rotate: 0.5 }
        : interactionMode === 'touch' ? { scale: 0.96 }
            : {}; // static

    const clickEffect = interactionMode === 'touch' ? { scale: 0.9 } : { scale: 0.95 };
    const showGlow = nav?.trinityGlow ?? true;
    const zenithPos = tc?.absolutePosition || "bottom"; // Default to bottom as per state, or top? State says bottom.
    const isVertical = zenithPos === 'left' || zenithPos === 'right';

    // Peek distances — how much of each panel is hidden when inactive
    const creationPeek = tc?.creationPeek ?? 67;  // % hidden
    const logicPeek = tc?.logicPeek ?? 80;         // % hidden

    // Morph state → border radius
    const morphRadius = morphState === "solid" ? "6px" : morphState === "ethereal" ? "20px" : "12px";
    const morphBlur = morphState === "ethereal" ? panelBlur * 1.5 : panelBlur;

    // Goo filter stdDeviation based on fluidTension
    const gooStd = 3 + fluidTension * 8;

    // Animation duration based on energy level
    const animDuration = 0.3 + (1 - energyLevel) * 0.7;

    // Real panel slide behavior from TrinityInterface.tsx
    const creationActive = hoveredPanel === 'left';
    const logicActive = hoveredPanel === 'right';

    const dockIcons = [
        { icon: Home, label: 'Inicio', color: horizonColor },
        { icon: Network, label: 'Red', color: creationColor },
        { icon: FlaskConical, label: 'Lab', color: logicColor },
        { icon: Brain, label: 'IA', color: zenithColor },
        { icon: Settings, label: 'Config', color: baseColor },
    ];

    const creationTools = [
        { icon: PenTool, label: 'DRAFT', color: creationColor },
        { icon: Droplets, label: 'MORPH', color: creationColor },
        { icon: Workflow, label: 'FLOW', color: creationColor },
        { icon: Layers, label: 'CAPAS', color: creationColor },
    ];

    return (
        <div className="relative w-full rounded-2xl overflow-hidden border border-white/8"
            style={{ background: "#080814", minHeight: "480px" }}
        >
            {/* SVG Goo Filter */}
            <svg className="absolute w-0 h-0" aria-hidden="true">
                <defs>
                    <filter id="trinity-goo-preview">
                        <feGaussianBlur in="SourceGraphic" stdDeviation={gooStd} result="blur" />
                        <feColorMatrix in="blur" mode="matrix"
                            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo" />
                        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                    </filter>
                </defs>
            </svg>

            {/* ── BACKGROUND NEBULA (matches real TrinityInterface) ── */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full"
                    style={{ background: `${zenithColor}18`, filter: "blur(60px)" }} />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full"
                    style={{ background: `${horizonColor}18`, filter: "blur(60px)" }} />
            </div>

            {/* ── EDGE GLOWS (4 color axes, matches real component) ── */}
            {showGlow && (<>
                {showZenith && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-0.5 rounded-b-full opacity-60"
                    style={{ background: zenithColor, boxShadow: `0 0 12px ${zenithColor}` }} />}
                {showCreation && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-20 rounded-r-full opacity-60"
                    style={{ background: creationColor, boxShadow: `0 0 12px ${creationColor}` }} />}
                {showLogic && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-20 rounded-l-full opacity-60"
                    style={{ background: logicColor, boxShadow: `0 0 12px ${logicColor}` }} />}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-0.5 rounded-t-full opacity-60"
                    style={{ background: horizonColor, boxShadow: `0 0 12px ${horizonColor}` }} />
            </>)}

            {/* ── ZENITH PANEL (Top) — matches: absolute top-0, full-width header ── */}
            {/* ── ZENITH PANEL (Dynamic Position) ── */}
            {showZenith && (
                <header className={cn(
                    "absolute z-30 flex justify-center pointer-events-none transition-all duration-300",
                    // Position
                    zenithPos === 'top' && "top-0 left-0 right-0 pt-2 px-4",
                    zenithPos === 'bottom' && "bottom-0 left-0 right-0 pb-2 px-4",
                    zenithPos === 'left' && "top-0 bottom-0 left-0 pl-2 py-12 flex-col",
                    zenithPos === 'right' && "top-0 bottom-0 right-0 pr-2 py-12 flex-col"
                )}>
                    <motion.div
                        className={cn(
                            "pointer-events-auto flex gap-2 p-2 transition-all duration-300",
                            isVertical ? "flex-col items-center w-10 h-full py-4" : "flex-row items-center w-full h-10 px-3"
                        )}
                        style={{
                            background: `rgba(6,182,212,${panelOpacity * 0.1})`,
                            backdropFilter: `blur(${morphBlur}px)`,
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: `${zenithColor}25`,
                            borderTopWidth: zenithPos === 'top' ? 0 : '1px',
                            borderBottomWidth: zenithPos === 'bottom' ? 0 : '1px',
                            borderLeftWidth: zenithPos === 'left' ? 0 : '1px',
                            borderRightWidth: zenithPos === 'right' ? 0 : '1px',

                            // Dynamic radius based on position
                            ...(zenithPos === 'top' ? { borderRadius: `0 0 ${morphRadius} ${morphRadius}` } : {}),
                            ...(zenithPos === 'bottom' ? { borderRadius: `${morphRadius} ${morphRadius} 0 0` } : {}),
                            ...(zenithPos === 'left' ? { borderRadius: `0 ${morphRadius} ${morphRadius} 0` } : {}),
                            ...(zenithPos === 'right' ? { borderRadius: `${morphRadius} 0 0 ${morphRadius}` } : {}),
                            boxShadow: showAura
                                ? `0 0 ${16 + auraIntensity * 30}px ${zenithColor}${Math.round(auraIntensity * 45).toString(16).padStart(2, '0')}`
                                : undefined,
                        }}
                        initial={{ opacity: 0, [isVertical ? 'x' : 'y']: -10 }}
                        animate={{ opacity: 1, [isVertical ? 'x' : 'y']: 0 }}
                        transition={physicsConfig}
                    >
                        <Brain className={cn("shrink-0", isVertical ? "w-4 h-4" : "w-3.5 h-3.5")} style={{ color: zenithColor }} />

                        {/* Label - rotate or hide if vertical */}
                        {!isVertical && (
                            <span className="text-[8px] font-bold tracking-[0.2em] uppercase shrink-0"
                                style={{ color: `${zenithColor}CC` }}>Zenith AI</span>
                        )}

                        {/* Search bar */}
                        <div className={cn(
                            "flex items-center rounded-full transition-all",
                            isVertical ? "flex-col justify-center w-6 h-auto flex-1 gap-2 py-2" : "flex-row w-full flex-1 gap-1 px-2 py-1"
                        )}
                            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${zenithColor}15` }}>
                            <Search className="w-2.5 h-2.5 text-white/30" />
                            {!isVertical && (
                                <>
                                    <span className="text-[7px] text-white/25">Iniciar consulta neural...</span>
                                    <span className="text-[7px] text-white/20 font-mono ml-auto">⌘K</span>
                                </>
                            )}
                        </div>
                        <Bell className={cn("text-white/40 shrink-0", isVertical ? "w-3.5 h-3.5 mt-auto" : "w-3 h-3")} />
                        {/* Aura inner glow */}
                        {showAura && (
                            <div className={cn("absolute inset-0 pointer-events-none",
                                zenithPos === 'top' && "rounded-b-xl",
                                zenithPos === 'bottom' && "rounded-t-xl",
                                zenithPos === 'left' && "rounded-r-xl",
                                zenithPos === 'right' && "rounded-l-xl"
                            )}
                                style={{ boxShadow: `inset 0 0 ${auraIntensity * 16}px ${zenithColor}18` }} />
                        )}
                    </motion.div>
                </header>
            )}

            {/* ── CREATION SIDEBAR (Left) — matches: absolute left-0, w-20, -translate-x-2/3 when inactive ── */}
            {showCreation && (
                <aside
                    className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center pl-1"
                    style={{ width: "52px" }}
                    onMouseEnter={() => setHoveredPanel('left')}
                    onMouseLeave={() => setHoveredPanel(null)}
                >
                    <motion.div
                        className="h-[70%] w-full flex flex-col items-center py-4 gap-3"
                        style={{
                            background: `rgba(16,185,129,${panelOpacity * 0.1})`,
                            backdropFilter: `blur(${morphBlur}px)`,
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: `${creationColor}20`,
                            borderLeftWidth: 0,
                            borderRadius: `0 ${morphRadius} ${morphRadius} 0`,
                            boxShadow: `0 0 16px rgba(16,185,129,0.2)`,
                        }}
                        animate={{
                            x: creationActive ? 0 : `-${creationPeek}%`,
                            opacity: creationActive ? 1 : 0.55,
                        }}
                        transition={physicsConfig}
                    >
                        {/* Header icon */}
                        <div className="p-1.5 rounded-full mb-1"
                            style={{ background: `${creationColor}20` }}>
                            <PenTool className="w-3 h-3" style={{ color: creationColor }} />
                        </div>
                        {/* Tool buttons */}
                        {[
                            { icon: PenTool, label: 'DRAFT' },
                            { icon: Droplets, label: 'MORPH' },
                            { icon: Workflow, label: 'FLOW' },
                            { icon: Layers, label: 'CAPAS' },
                        ].map((tool, i) => (
                            <motion.button
                                key={i}
                                className="w-7 h-7 rounded-lg flex items-center justify-center"
                                style={{ color: `${creationColor}66` }}
                                whileHover={{ backgroundColor: `${creationColor}20`, color: creationColor, scale: 1.1, ...hoverEffect }}
                                whileTap={clickEffect}
                                title={tool.label}
                                transition={physicsConfig}
                            >
                                <tool.icon className="w-3.5 h-3.5" />
                            </motion.button>
                        ))}
                        {/* Plus at bottom */}
                        <div className="mt-auto">
                            <motion.button className="w-6 h-6 rounded-lg flex items-center justify-center"
                                style={{ color: "rgba(255,255,255,0.2)" }}
                                whileHover={{ color: creationColor }}>
                                <Plus className="w-3.5 h-3.5" />
                            </motion.button>
                        </div>
                    </motion.div>
                </aside>
            )}

            {/* ── LOGIC SIDEBAR (Right) — matches: absolute right-0, w-80, translate-x-[80%] when inactive ── */}
            {showLogic && (
                <aside
                    className="absolute right-0 top-0 bottom-0 z-20 flex items-center justify-center pr-1"
                    style={{ width: "110px" }}
                    onMouseEnter={() => setHoveredPanel('right')}
                    onMouseLeave={() => setHoveredPanel(null)}
                >
                    <motion.div
                        className="h-[85%] w-full flex flex-col gap-2 p-3 overflow-hidden"
                        style={{
                            background: `rgba(245,158,11,${panelOpacity * 0.08})`,
                            backdropFilter: `blur(${morphBlur}px)`,
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor: `${logicColor}20`,
                            borderRightWidth: 0,
                            borderRadius: `${morphRadius} 0 0 ${morphRadius}`,
                            boxShadow: `0 0 16px rgba(245,158,11,0.2)`,
                        }}
                        animate={{
                            x: logicActive ? 0 : `${logicPeek}%`,
                            opacity: logicActive ? 1 : 0.55,
                        }}
                        transition={physicsConfig}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b pb-1.5"
                            style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                            <span className="text-[7px] font-bold tracking-[0.2em] uppercase"
                                style={{ color: logicColor }}>Logic Core</span>
                            <Cpu className="w-2.5 h-2.5 animate-pulse" style={{ color: logicColor }} />
                        </div>
                        {/* Entropy bar */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-[6px] text-white/40 uppercase tracking-widest">
                                <span>Entropy</span><span>88%</span>
                            </div>
                            <div className="h-0.5 w-full rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                <div className="h-full rounded-full w-[88%]"
                                    style={{ background: logicColor, boxShadow: `0 0 6px ${logicColor}` }} />
                            </div>
                        </div>
                        {/* Node Activity bar chart */}
                        <div className="rounded-lg p-2 space-y-1"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <div className="flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full" style={{ background: logicColor }} />
                                <span className="text-[6px] font-bold uppercase" style={{ color: `${logicColor}CC` }}>Node Activity</span>
                            </div>
                            <div className="h-8 flex items-end justify-between gap-0.5">
                                {[0.4, 0.7, 0.5, 0.9, 0.6, 0.3].map((h, i) => (
                                    <motion.div key={i} className="flex-1 rounded-t-sm"
                                        style={{ background: `${logicColor}${Math.round(20 + h * 60).toString(16)}` }}
                                        animate={{ height: [`${h * 100}%`, `${Math.min((h + 0.2) * 100, 100)}%`, `${h * 100}%`] }}
                                        transition={{ duration: 1.5 + i * 0.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 / (energyLevel + 0.1) }}
                                    />
                                ))}
                            </div>
                        </div>
                        {/* System log */}
                        <div className="space-y-1">
                            <span className="text-[6px] text-white/30 uppercase tracking-widest font-bold">System Log</span>
                            <div className="text-[6px] font-mono space-y-1 text-white/50">
                                <div className="flex gap-1">
                                    <span style={{ color: logicColor }}>[OK]</span>
                                    <span>Neural link OK</span>
                                </div>
                                <div className="flex gap-1">
                                    <span style={{ color: logicColor }}>[OK]</span>
                                    <span>Buffer 2ms</span>
                                </div>
                                <div className="flex gap-1">
                                    <span style={{ color: horizonColor }}>[WARN]</span>
                                    <span>Sector 7</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </aside>
            )}

            {/* ── CENTRAL CONTENT (Masonry-style, matches real main content area) ── */}
            <main
                className="absolute inset-0 flex flex-col gap-2 overflow-hidden"
                style={{
                    paddingTop: showZenith ? "52px" : "8px",
                    paddingLeft: showCreation ? "20px" : "8px",
                    paddingRight: showLogic ? "20px" : "8px",
                    paddingBottom: dockPosition === "bottom" ? "52px" : "8px",
                    margin: "8px",
                }}
            >
                {/* Widget: Live Feed */}
                <div className="flex-1 rounded-xl p-3 border"
                    style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)", backdropFilter: "blur(8px)" }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-white/50">Ontocratic News</span>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: horizonColor }} />
                    </div>
                    <p className="text-[8px] font-light text-white/70 leading-relaxed mb-2">
                        Hyper-reality integration V2.4 deployed in Tokyo-Berlin corridor.
                    </p>
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold"
                            style={{ background: `linear-gradient(135deg, ${horizonColor}, ${zenithColor})` }}>OZ</div>
                        <span className="text-[6px] text-white/35">Nexus Network · 2m ago</span>
                    </div>
                </div>

                {/* Widget: Quick Actions */}
                <div className="grid grid-cols-4 gap-1.5">
                    {[
                        { label: 'Sync', icon: Network, color: creationColor },
                        { label: 'Deploy', icon: Zap, color: logicColor },
                        { label: 'Boost', icon: Activity, color: zenithColor },
                        { label: 'Guard', icon: Shield, color: baseColor },
                    ].map((action, i) => (
                        <motion.button key={i}
                            className="flex flex-col items-center justify-center py-2 rounded-xl gap-1"
                            style={{ background: `${action.color}10`, border: `1px solid ${action.color}25` }}
                            whileHover={{ scale: 1.05, backgroundColor: `${action.color}20`, ...hoverEffect }}
                            whileTap={clickEffect}
                            transition={physicsConfig}
                        >
                            <action.icon className="w-3 h-3" style={{ color: action.color }} />
                            <span className="text-[6px] font-bold uppercase text-white/50">{action.label}</span>
                        </motion.button>
                    ))}
                </div>

                {/* Widget: Stats */}
                <div className="rounded-xl p-3 border"
                    style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 rounded-lg" style={{ background: `${zenithColor}20` }}>
                            <BarChart2 className="w-2.5 h-2.5" style={{ color: zenithColor }} />
                        </div>
                        <div>
                            <p className="text-[6px] uppercase text-white/40 font-bold tracking-widest">Network Flow</p>
                            <p className="text-[11px] font-bold text-white">1.42 Pb/s</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-0.5 h-6">
                        {[0.2, 0.4, 0.6, 0.3, 0.8, 0.5, 0.7, 0.4, 0.9, 0.6].map((h, i) => (
                            <div key={i} className="flex-1 rounded-t-sm"
                                style={{ height: `${h * 100}%`, background: `${zenithColor}40` }} />
                        ))}
                    </div>
                </div>
            </main>

            {/* ── NAVIGATION DOCK — matches: fixed bottom-8, floating glass pill ── */}
            <motion.div
                className="absolute z-30 flex items-center gap-1 px-3 py-2"
                style={{
                    ...(dockPosition === "bottom"
                        ? { bottom: "10px", left: "50%", transform: "translateX(-50%)", flexDirection: "row" as const }
                        : dockPosition === "top"
                            ? { top: showZenith ? "52px" : "10px", left: "50%", transform: "translateX(-50%)", flexDirection: "row" as const }
                            : dockPosition === "left"
                                ? { left: "8px", top: "50%", transform: "translateY(-50%)", flexDirection: "column" as const }
                                : { right: "8px", top: "50%", transform: "translateY(-50%)", flexDirection: "column" as const }),
                    background: `rgba(255,255,255,0.06)`,
                    backdropFilter: `blur(${morphBlur}px)`,
                    border: `1px solid rgba(255,255,255,0.1)`,
                    borderRadius: "9999px",
                    boxShadow: showGlow ? `0 4px 24px rgba(0,0,0,0.4), 0 0 16px ${horizonColor}20` : "0 4px 24px rgba(0,0,0,0.4)",
                }}
                initial={{ opacity: 0, y: dockPosition === "bottom" ? 10 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...physicsConfig, delay: 0.2 }}
            >
                {dockIcons.map((item, i) => (
                    <motion.button
                        key={i}
                        className="relative w-7 h-7 rounded-full flex items-center justify-center"
                        whileHover={{ scale: 1.2, y: dockPosition === "bottom" ? -4 : 0, ...hoverEffect }}
                        whileTap={clickEffect}
                        transition={physicsConfig}
                        title={item.label}
                    >
                        <item.icon className="w-3.5 h-3.5 relative z-10 transition-colors duration-300"
                            style={{ color: i === 0 ? item.color : "rgba(255,255,255,0.45)" }} />
                        {i === 0 && (
                            <motion.div className="absolute inset-0 rounded-full blur-sm -z-0"
                                style={{ background: item.color }}
                                animate={{ opacity: [0.15, 0.25, 0.15] }}
                                transition={{ duration: 2, repeat: Infinity }} />
                        )}
                    </motion.button>
                ))}
                {/* Divider + grid button */}
                <div className="w-px h-5 mx-1" style={{ background: "rgba(255,255,255,0.1)" }} />
                <motion.button className="w-7 h-7 rounded-full flex items-center justify-center text-white/30"
                    whileHover={{ rotate: 90, color: "white" }}>
                    <Layout className="w-3.5 h-3.5" />
                </motion.button>
            </motion.div>

            {/* ── HOVER HINT ── */}
            <div className="absolute bottom-2 right-3 flex items-center gap-1 pointer-events-none">
                <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: zenithColor }} />
                <span className="text-[6px] font-mono uppercase tracking-widest text-white/15">Hover paneles</span>
            </div>
        </div>
    );
}



export function CanvasPreview({ state, selectedElement, onSelectElement }: CanvasPreviewProps) {
    const { palette, typography, effects, geometry, iconography, widgets, layoutConfig, nav, animations, ui } = state;
    const [activeTab, setActiveTab] = React.useState("GENESIS");

    // 🎬 ANIMATION LOGIC
    const getAnimationProps = (index: number = 0) => {
        const { hover, click, entrance, duration, delay, stagger, easing, microInteractions } = animations;

        // Easing mapping
        const easingMap: Record<string, any> = {
            "ease-out": "easeOut",
            "elastic": [0.175, 0.885, 0.32, 1.275],
            "spring": { type: "spring", stiffness: 300, damping: 20 },
            "back-out": "backOut",
            "linear": "linear"
        };

        const transition = {
            duration: duration / 1000,
            delay: (delay / 1000) + (index * stagger / 1000),
            ease: typeof easingMap[easing] === 'string' ? easingMap[easing] : undefined,
            ...(typeof easingMap[easing] === 'object' ? easingMap[easing] : {})
        };

        // Entrance Variants
        const entranceVariants: Record<string, any> = {
            none: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
            fade: { opacity: 0 },
            "slide-up": { opacity: 0, y: 20 },
            "scale-in": { opacity: 0, scale: 0.9 },
            "blur-in": { opacity: 0, filter: "blur(10px)" },
            "flip-in": { opacity: 0, rotateX: 90 }
        };

        const activeEntrance = entranceVariants[entrance] || entranceVariants.none;

        // Hover Effect
        const hoverEffects: Record<string, any> = {
            lift: { y: -5, scale: 1.02 },
            glow: { boxShadow: `0 0 20px ${palette.primary}44`, borderColor: palette.primary + '66' },
            scale: { scale: 1.05 },
            liquid: { borderRadius: "40% 60% 70% 30% / 40% 50% 60% 40%", scale: 1.02 },
            glitch: { x: [0, -2, 2, 0], transition: { duration: 0.2, repeat: Infinity } }
        };

        const hoverProps = microInteractions ? (hoverEffects[hover] || {}) : {};

        // Click Effect
        const clickEffects: Record<string, any> = {
            ripple: { scale: 0.98, opacity: 0.9 },
            press: { scale: 0.95, y: 2 },
            bounce: { scale: [1, 0.9, 1.1, 1], transition: { duration: 0.3 } },
            confetti: { scale: 1.1, filter: "brightness(1.5)" }
        };

        const clickProps = microInteractions ? (clickEffects[click] || {}) : {};

        return {
            initial: activeEntrance,
            animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", rotateX: 0 },
            whileHover: hoverProps,
            whileTap: clickProps,
            transition
        };
    };

    const select = (id: ElementFamily) => onSelectElement(id);

    return (
        <div className="w-full min-h-full p-8 md:p-12 space-y-12 bg-[#020204]/80 backdrop-blur-3xl rounded-3xl border border-white/5 shadow-2xl overflow-hidden relative">
            {/* Background Texture/Grid */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />

            {/* TRINITY FLUID FILTER DEFINITION */}
            <svg style={{ visibility: 'hidden', position: 'absolute' }} width="0" height="0">
                <defs>
                    <filter id="trinity-goo">
                        <feGaussianBlur in="SourceGraphic" stdDeviation={state.trinityConfig?.fluidTension ? (12 * (1 - state.trinityConfig.fluidTension)) + 2 : 6} result="blur" />
                        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
                        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                    </filter>
                </defs>
            </svg>

            {/* TRINITY ZONES OVERLAY (Visible when filtering for Trinity) */}
            {selectedElement === "trinity" && (
                <div className="absolute inset-0 pointer-events-none z-0">
                    {/* Zenith (Top) */}
                    <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyan-500/10 to-transparent flex items-start justify-center pt-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400/40">Zenith (IA)</span>
                    </div>
                    {/* Horizonte (Bottom) */}
                    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-red-500/10 to-transparent flex items-end justify-center pb-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-500/40">Horizonte (Nav)</span>
                    </div>
                    {/* Nucleo Left (Creation) */}
                    <div className="absolute top-0 bottom-0 left-0 w-32 bg-gradient-to-r from-emerald-500/10 to-transparent flex items-center justify-start pl-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-500/40 rotate-180" style={{ writingMode: 'vertical-rl' }}>Creation</span>
                    </div>
                    {/* Nucleo Right (Logic) */}
                    <div className="absolute top-0 bottom-0 right-0 w-32 bg-gradient-to-l from-amber-500/10 to-transparent flex items-center justify-end pr-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500/40" style={{ writingMode: 'vertical-rl' }}>Logic</span>
                    </div>
                </div>
            )}

            <div className="relative z-10 space-y-12">
                {/* ─── PALETTE & TYPOGRAPHY ─── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div key={`${ui.lastAnimTrigger}-0`} {...getAnimationProps(0)} className="contents">
                        <FamilyWrapper id="palette" label="🎨 Paleta de Colores" selected={selectedElement === "palette"} onSelect={() => select("palette")} palette={palette} state={state}>
                            <div className="space-y-4">
                                <div className="grid grid-cols-4 gap-2">
                                    {[palette.primary, palette.secondary, palette.accent, palette.surface].map((color, i) => (
                                        <div key={i} className="group/color relative">
                                            <div
                                                className="h-12 w-full rounded-lg border border-white/10 transition-transform active:scale-95 shadow-inner"
                                                style={{ backgroundColor: color }}
                                            />
                                            <span className="mt-1 block text-[8px] text-center opacity-40 font-mono tracking-tighter uppercase">{color}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-4 pt-2 border-t border-white/5">
                                    <div className="flex-1 space-y-2">
                                        <span className="text-[10px] opacity-40 uppercase tracking-tighter">Trinity Zenith</span>
                                        <div className="flex gap-1.5 items-center">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.trinity?.zenith?.active || "#06B6D4", boxShadow: `0 0 8px ${palette.trinity?.zenith?.glow || "rgba(6,182,212,0.6)"}` }} />
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.trinity?.nucleo?.creation || "#10B981" }} />
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.trinity?.nucleo?.logic || "#F59E0B" }} />
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.trinity?.horizonte?.active || "#EF4444" }} />
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col items-end gap-1.5">
                                        <span className="text-[10px] opacity-40 uppercase tracking-tighter">Surface Density</span>
                                        <div className="h-4 w-20 rounded-full bg-white/5 overflow-hidden border border-white/5">
                                            <div className="h-full w-2/3 bg-white/20" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>

                    <motion.div key={`${ui.lastAnimTrigger}-1`} {...getAnimationProps(1)} className="contents">
                        <FamilyWrapper id="typography" label="✍️ Tipografía" selected={selectedElement === "typography"} onSelect={() => select("typography")} palette={palette} state={state}>
                            <div className="space-y-5">
                                <div className="space-y-1">
                                    <h2 style={{
                                        fontFamily: typography.fontHeadline,
                                        fontWeight: typography.headerWeight,
                                        fontSize: "1.25rem",
                                        letterSpacing: `${typography.headerTracking}em`,
                                        textTransform: typography.headerWeight >= 700 ? 'uppercase' : 'none'
                                    }}>
                                        El Futuro es Líquido
                                    </h2>
                                    <p className="text-[10px] opacity-40" style={{ letterSpacing: "0.2em" }}>SYSTEM MANIFESTO V4.0</p>
                                </div>
                                <p className="text-xs leading-relaxed opacity-80" style={{ fontWeight: typography.bodyWeight }}>
                                    La interfaz se adapta a la forma del pensamiento. Una red neuronal visualmente coherente que fluye entre estados.
                                </p>
                                <div className="flex gap-4 pt-2 border-t border-white/5">
                                    <div className="space-y-1">
                                        <span className="block text-[8px] opacity-30">MAIN FONT</span>
                                        <span className="text-[10px] font-mono">{(typography.fontMain || "Inter").split(',')[0]}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="block text-[8px] opacity-30">HEADING FONT</span>
                                        <span className="text-[10px] font-mono">{(typography.fontHeadline || "Inter").split(',')[0]}</span>
                                    </div>
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>
                </div>

                {/* ─── ICONOGRAPHY ─── */}
                <motion.div key={`${ui.lastAnimTrigger}-2`} {...getAnimationProps(2)} className="contents">
                    <FamilyWrapper id="iconography" label="✨ Iconografía" selected={selectedElement === "iconography"} onSelect={() => select("iconography")} palette={palette} state={state}>
                        <div className="space-y-5">
                            {/* Primary System Icons */}
                            <div>
                                <span className="text-[8px] uppercase tracking-widest text-white/25 mb-2 block">Sistema Principal</span>
                                <div className="grid grid-cols-5 gap-3">
                                    {PRIMARY_ICONS.map(({ icon: Icon, label: iconLabel }, i) => {
                                        const preset = iconography.iconPreset || 'outline';
                                        const isNeon = preset === 'neon';
                                        const isGlass = preset === 'glass';
                                        const isSolid = preset === 'solid';
                                        const isDuotone = preset === 'duotone';
                                        const isMinimal = preset === 'minimal';
                                        const iconColor = i < 3 ? palette.primary : i < 6 ? palette.secondary : palette.accent;
                                        return (
                                            <div key={iconLabel} className="flex flex-col items-center gap-1.5 group/icon">
                                                <div
                                                    className={cn(
                                                        "p-2.5 rounded-xl transition-all duration-300",
                                                        isGlass && 'backdrop-blur-md border border-white/10 bg-white/5',
                                                        isSolid && 'border border-transparent',
                                                        isDuotone && 'border border-white/5',
                                                        isMinimal && 'border-none',
                                                        isNeon && 'border border-transparent',
                                                        !isSolid && !isGlass && !isDuotone && !isMinimal && !isNeon && 'border border-white/10'
                                                    )}
                                                    style={{
                                                        backgroundColor: isSolid ? iconColor + '18' : isDuotone ? iconColor + '08' : isGlass ? 'rgba(255,255,255,0.03)' : 'transparent',
                                                        boxShadow: isNeon ? `0 0 10px ${iconColor}33, inset 0 0 10px ${iconColor}11` : undefined,
                                                        borderColor: isNeon ? iconColor + '55' : undefined,
                                                    }}
                                                >
                                                    <Icon
                                                        className={cn(
                                                            "w-5 h-5 transition-all duration-500",
                                                            iconography.animation === 'pulse' && 'animate-pulse',
                                                            iconography.animation === 'bounce' && 'hover:scale-125',
                                                            iconography.animation === 'spin' && 'animate-spin',
                                                            isMinimal && 'opacity-50'
                                                        )}
                                                        style={{
                                                            color: isSolid || isNeon || isDuotone ? iconColor : 'currentColor',
                                                            strokeWidth: isMinimal ? Math.max(iconography.strokeWidth - 0.5, 1) : iconography.strokeWidth,
                                                            filter: isNeon ? `drop-shadow(0 0 6px ${iconColor}88)` : undefined,
                                                            fill: isSolid ? iconColor + '22' : 'none',
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[7px] text-white/30 group-hover/icon:text-white/50 transition-colors">{iconLabel}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Secondary System Icons */}
                            <div>
                                <span className="text-[8px] uppercase tracking-widest text-white/25 mb-2 block">Menús y Acciones</span>
                                <div className="grid grid-cols-5 gap-3">
                                    {SECONDARY_ICONS.map(({ icon: Icon, label: iconLabel }, i) => {
                                        const preset = iconography.iconPreset || 'outline';
                                        const isNeon = preset === 'neon';
                                        const isSolid = preset === 'solid';
                                        const isMinimal = preset === 'minimal';
                                        const iconColor = palette.secondary;
                                        return (
                                            <div key={iconLabel} className="flex flex-col items-center gap-1.5">
                                                <div className={cn(
                                                    "p-2 rounded-lg transition-all duration-300",
                                                    preset === 'glass' && 'backdrop-blur-md border border-white/10 bg-white/3',
                                                    preset === 'outline' && 'border border-white/8',
                                                )}
                                                    style={{
                                                        backgroundColor: isSolid ? iconColor + '12' : 'transparent',
                                                        boxShadow: isNeon ? `0 0 8px ${iconColor}25` : undefined,
                                                        borderColor: isNeon ? iconColor + '40' : undefined,
                                                    }}
                                                >
                                                    <Icon className={cn("w-4 h-4", isMinimal && 'opacity-40')}
                                                        style={{
                                                            color: isSolid || isNeon ? iconColor : 'currentColor',
                                                            strokeWidth: isMinimal ? 1 : iconography.strokeWidth,
                                                            filter: isNeon ? `drop-shadow(0 0 4px ${iconColor}66)` : undefined,
                                                            fill: isSolid ? iconColor + '15' : 'none',
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[6px] text-white/20">{iconLabel}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 pt-2">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                <span className="text-[7px] uppercase tracking-[0.3em] text-white/20 font-mono">{iconography.iconPreset || 'outline'}</span>
                                <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/10 to-transparent" />
                            </div>
                        </div>
                    </FamilyWrapper>
                </motion.div>

                {/* ─── COMPONENTS GRID ─── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div key={`${ui.lastAnimTrigger}-3`} {...getAnimationProps(3)} className="contents">
                        <FamilyWrapper id="buttons" label="🔘 Botones & Interactivos" selected={selectedElement === "buttons"} onSelect={() => select("buttons")} palette={palette} state={state}>
                            <div className="flex flex-col gap-6 items-center w-full">
                                <StitchButton
                                    theme={state.components.buttonStyle}
                                    glow={state.components.buttonGlow}
                                    size="lg"
                                    className="w-full"
                                    styleConfig={{
                                        cornerRadius: geometry.radiusButtons,
                                        blur: effects.backdropBlur,
                                        primaryColor: palette.primary,
                                        secondaryColor: palette.secondary,
                                        glowIntensity: effects.glowIntensity,
                                        fontFamily: typography.fontHeadline,
                                        borderWidth: geometry.borderWidth,
                                        focusRingColor: state.components.focusRingColor
                                    }}
                                >
                                    <Zap className="w-3.5 h-3.5" />
                                    Interactive Call
                                </StitchButton>
                                <div className="flex gap-3 w-full">
                                    <StitchButton
                                        variant="secondary"
                                        size="sm"
                                        className="flex-1"
                                        theme={state.components.buttonStyle}
                                        styleConfig={{
                                            cornerRadius: geometry.radiusButtons * 0.8,
                                            fontFamily: typography.fontMain,
                                            primaryColor: palette.primary,
                                            secondaryColor: palette.secondary,
                                            focusRingColor: state.components.focusRingColor
                                        }}
                                    >
                                        SECONDARY
                                    </StitchButton>
                                    <StitchButton
                                        variant="ghost"
                                        size="sm"
                                        className="flex-1"
                                        theme={state.components.buttonStyle}
                                        styleConfig={{
                                            cornerRadius: geometry.radiusButtons * 0.8,
                                            fontFamily: typography.fontMain,
                                            primaryColor: palette.primary,
                                            secondaryColor: palette.secondary,
                                            focusRingColor: state.components.focusRingColor
                                        }}
                                    >
                                        GHOST
                                    </StitchButton>
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>

                    <motion.div key={`${ui.lastAnimTrigger}-4`} {...getAnimationProps(4)} className="contents">
                        <FamilyWrapper id="inputs" label="🎚️ Inputs" selected={selectedElement === "inputs"} onSelect={() => select("inputs")} palette={palette} state={state}>
                            <div className="space-y-5">
                                <StitchInput
                                    label="Search Neural Link"
                                    placeholder="Quantum query..."
                                    icon={<Search className="w-3.5 h-3.5" />}
                                    theme={state.components.inputBorderStyle}
                                    floatingLabel={state.components.inputFloatingLabel}
                                    styleConfig={{
                                        cornerRadius: geometry.radiusInputs,
                                        primaryColor: palette.primary,
                                        secondaryColor: palette.secondary,
                                        blur: effects.backdropBlur,
                                        glowIntensity: effects.glowIntensity,
                                        fontFamily: typography.fontMain,
                                        borderWidth: geometry.borderWidth,
                                        focusRingColor: state.components.focusRingColor
                                    }}
                                />
                            </div>
                        </FamilyWrapper>
                    </motion.div>

                    {/* ─── TOGGLES (separate for auto-scroll) ─── */}
                    <motion.div key={`${ui.lastAnimTrigger}-4b`} {...getAnimationProps(4)} className="contents">
                        <FamilyWrapper id="toggles" label="🎛️ Controles" selected={selectedElement === "toggles"} onSelect={() => select("toggles")} palette={palette} state={state}>
                            <div className="space-y-3 w-full">
                                <StitchToggle
                                    label="NEURAL LINK"
                                    checked={true}
                                    onChange={() => { }}
                                    style={state.toggles.switchStyle as any}
                                    activeColor={state.toggles.switchTrackColor}
                                    size="sm"
                                />
                                <StitchToggle
                                    label="SYNC MODE"
                                    checked={false}
                                    onChange={() => { }}
                                    style={state.toggles.switchStyle as any}
                                    activeColor={state.toggles.switchTrackColor}
                                    size="sm"
                                />
                                <div className="flex gap-4 pt-1">
                                    <StitchCheckbox
                                        label="PROTOCOL"
                                        checked={true}
                                        onChange={() => { }}
                                        style={state.toggles.checkboxStyle as any}
                                        activeColor={state.toggles.switchTrackColor}
                                    />
                                    <StitchCheckbox
                                        label="MATRIX"
                                        checked={false}
                                        onChange={() => { }}
                                        style={state.toggles.checkboxStyle as any}
                                        activeColor={state.toggles.switchTrackColor}
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <StitchRadio
                                        label="AUTO"
                                        checked={true}
                                        onChange={() => { }}
                                        size={state.toggles.radioSize}
                                        activeColor={state.toggles.switchTrackColor}
                                    />
                                    <StitchRadio
                                        label="MANUAL"
                                        checked={false}
                                        onChange={() => { }}
                                        size={state.toggles.radioSize}
                                        activeColor={state.toggles.switchTrackColor}
                                    />
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>

                    <motion.div key={`${ui.lastAnimTrigger}-5`} {...getAnimationProps(5)} className="contents">
                        <FamilyWrapper id="tooltips" label="💬 Badges & Feedback" selected={selectedElement === "badges"} onSelect={() => select("badges")} palette={palette} state={state}>
                            <div className="flex flex-col gap-6 py-2 min-h-[140px] items-center">
                                <div className="flex flex-wrap gap-2 justify-center items-center">
                                    <StitchBadge style={state.components.badgeStyle} variant="primary">PRIMARY</StitchBadge>
                                    <StitchBadge style={state.components.badgeStyle} variant="accent">ACCENT</StitchBadge>
                                </div>
                                <div className="px-4 py-2 rounded-xl text-[10px] font-medium flex items-center gap-3 backdrop-blur-md border shadow-lg"
                                    style={{
                                        backgroundColor: palette.secondary + '22',
                                        borderColor: palette.secondary + '44',
                                        color: palette.secondary
                                    }}
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span>Signal Optimized</span>
                                </div>
                                <StitchTooltip
                                    style={state.components.tooltipStyle}
                                    content="Quantum Overlay Active"
                                    visible={true}
                                    styleConfig={{
                                        primaryColor: palette.primary,
                                        blur: effects.backdropBlur
                                    }}
                                />
                            </div>
                        </FamilyWrapper>
                    </motion.div>
                </div>

                {/* ─── WIDGETS & EFFECTS ─── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <motion.div key={`${ui.lastAnimTrigger}-6`} {...getAnimationProps(6)} className="contents">
                        <FamilyWrapper id="widgets" label="🖼️ Widgets & Paneles" selected={selectedElement === "widgets"} onSelect={() => select("widgets")} palette={palette} state={state}>
                            <div className="flex gap-4">
                                <StitchCard
                                    theme={state.components.cardPreset as any}
                                    interactive={{
                                        tilt: state.components.cardTilt,
                                        glow: state.components.cardGlowPointer
                                    }}
                                    styleConfig={{
                                        cornerRadius: widgets.cornerSmoothing,
                                        primaryColor: palette.primary,
                                        secondaryColor: palette.secondary,
                                    }}
                                    className="flex-1 p-4"
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <Activity className="w-3.5 h-3.5 text-cyan-400" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Neural Link</span>
                                    </div>
                                    <div className="h-16 w-full rounded-lg bg-black/20 relative overflow-hidden">
                                        <div className="absolute inset-0 flex items-center justify-around px-2">
                                            {[1, 2, 3, 4, 5, 2].map((h, i) => (
                                                <div key={i} className="w-1.5 bg-cyan-400/40 rounded-t-sm" style={{ height: `${h * 20}%` }} />
                                            ))}
                                        </div>
                                    </div>
                                </StitchCard>
                                <div className="w-1/3 space-y-3">
                                    <StitchCard
                                        theme={state.components.cardPreset as any}
                                        interactive={{ tilt: state.components.cardTilt }}
                                        className="h-12 w-full flex items-center justify-center"
                                    >
                                        <Plus className="w-4 h-4 opacity-20" />
                                    </StitchCard>
                                    <StitchCard theme={state.components.cardPreset as any} className="h-12 w-full" />
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>

                    <motion.div key={`${ui.lastAnimTrigger}-7`} {...getAnimationProps(7)} className="contents">
                        <FamilyWrapper id="effects" label="✨ Efectos & Materia" selected={selectedElement === "effects"} onSelect={() => select("effects")} palette={palette} state={state}>
                            <div className="grid grid-cols-2 gap-4">
                                <StitchCard theme={state.components.cardPreset as any} className="p-3 space-y-2">
                                    <div className="flex justify-between items-center text-[9px] opacity-40 uppercase">
                                        <span>Glow</span>
                                        <span className="text-cyan-400">{Math.round(effects.glowIntensity * 100)}%</span>
                                    </div>
                                    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-cyan-400 shadow-[0_0_8px_cyan]" style={{ width: `${effects.glowIntensity * 100}%` }} />
                                    </div>
                                </StitchCard>
                                <StitchCard theme={state.components.cardPreset as any} className="p-3 space-y-2">
                                    <div className="flex justify-between items-center text-[9px] opacity-40 uppercase">
                                        <span>Blur</span>
                                        <span className="text-cyan-400">{effects.backdropBlur}px</span>
                                    </div>
                                    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-cyan-400" style={{ width: `${(effects.backdropBlur / 40) * 100}%` }} />
                                    </div>
                                </StitchCard>
                                <StitchCard theme={state.components.cardPreset as any} className="col-span-2 relative h-16 overflow-hidden flex items-center justify-center">
                                    <motion.div
                                        className="absolute w-8 h-8 rounded-full bg-cyan-400/40 blur-xl"
                                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
                                        transition={{ duration: 4, repeat: Infinity }}
                                    />
                                    <Bot className="w-4 h-4 relative z-10" />
                                </StitchCard>
                            </div>
                        </FamilyWrapper>
                    </motion.div>
                </div>

                {/* ─── NAVIGATION & PROGRESS ─── */}
                <div className="grid grid-cols-1 gap-8">
                    <motion.div key={`${ui.lastAnimTrigger}-8`} {...getAnimationProps(8)} className="contents">
                        <FamilyWrapper id="navigation" label="🚀 Navegación / Dock" selected={selectedElement === "navigation"} onSelect={() => select("navigation")} palette={palette} state={state}>
                            <div className="space-y-6">
                                {/* Trinity Menu Buttons */}
                                {nav.trinityStyle !== 'minimal' && (
                                    <div className="flex items-center justify-center gap-2" style={{ filter: state.trinityConfig?.morphState === 'liquid' ? 'url(#trinity-goo)' : 'none' }}>
                                        {[
                                            { label: 'IA', color: palette.trinity?.zenith?.active || "#06B6D4", glow: palette.trinity?.zenith?.glow || "rgba(6,182,212,0.6)" },
                                            { label: 'Control', color: palette.trinity?.nucleo?.creation || "#10B981", glow: (palette.trinity?.nucleo?.creation || "#10B981") + '66' }, // Green side
                                            { label: 'Logic', color: palette.trinity?.nucleo?.logic || "#F59E0B", glow: (palette.trinity?.nucleo?.logic || "#F59E0B") + '66' }, // Yellow side
                                            { label: 'Menú', color: palette.trinity?.horizonte?.active || "#EF4444", glow: (palette.trinity?.horizonte?.active || "#EF4444") + '66' },
                                        ].map((btn, i) => (
                                            <motion.div
                                                key={btn.label}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border backdrop-blur-md cursor-pointer",
                                                    nav.trinityLayout === 'arc' && (i === 1 || i === 2) ? '-mt-3' : '',
                                                )}
                                                style={{
                                                    borderColor: btn.color + '40',
                                                    backgroundColor: btn.color + (state.trinityConfig?.morphState === 'liquid' ? '99' : '15'), // More opacity for liquid
                                                    color: state.trinityConfig?.morphState === 'liquid' ? '#fff' : btn.color,
                                                    boxShadow: nav.trinityGlow ? `0 0 12px ${btn.glow}40` : 'none',
                                                    width: state.trinityConfig?.morphState === 'liquid' ? '48px' : 'auto', // Circles for liquid
                                                    height: state.trinityConfig?.morphState === 'liquid' ? '48px' : 'auto',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                whileHover={{ scale: 1.15, y: -2 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                {state.trinityConfig?.morphState === 'liquid' ? (
                                                    <div className="w-2 h-2 rounded-full bg-white" />
                                                ) : btn.label}
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                {/* Breadcrumb */}
                                <div className="flex items-center justify-center gap-1.5 text-[9px] text-white/30">
                                    <span className="text-white/50">Home</span>
                                    <span>{nav.breadcrumbSeparator === 'slash' ? '/' : nav.breadcrumbSeparator === 'arrow' ? '›' : '•'}</span>
                                    <span className="text-white/50">Network</span>
                                    <span>{nav.breadcrumbSeparator === 'slash' ? '/' : nav.breadcrumbSeparator === 'arrow' ? '›' : '•'}</span>
                                    <span className="text-cyan-400">Neural Hub</span>
                                </div>

                                {/* Dock */}
                                <div className={cn(
                                    "flex items-center justify-center p-4 transition-all",
                                    nav.dockStyle === "attached" ? "bg-black/40 border-t border-b border-white/5" : ""
                                )}>
                                    <motion.div
                                        className={cn(
                                            "flex items-end gap-2 backdrop-blur-xl border border-white/10 transition-all",
                                            nav.dockBg === 'glass' ? 'bg-black/40' : nav.dockBg === 'solid' ? 'bg-black/80' : 'bg-transparent',
                                            nav.dockStyle === "floating" ? "rounded-2xl p-3" :
                                                nav.dockStyle === "attached" ? "w-full justify-center bg-transparent border-none p-3" : "rounded-xl scale-90 p-2"
                                        )}
                                        style={{ boxShadow: `0 ${nav.dockElevation}px ${nav.dockElevation * 2}px rgba(0,0,0,0.3)` }}
                                    >
                                        {[Home, User, MessageSquare, Network, Settings].map((Icon, i) => (
                                            <div key={i} className="flex flex-col items-center gap-1" style={{ padding: `0 ${nav.menuItemPadding / 2}px` }}>
                                                <motion.div
                                                    className="flex items-center justify-center rounded-xl bg-white/5 border border-white/5"
                                                    style={{
                                                        width: `${36 * nav.iconScale}px`,
                                                        height: `${36 * nav.iconScale}px`,
                                                    }}
                                                    whileHover={{ scale: 1.15, y: -3 }}
                                                >
                                                    <Icon className="w-4 h-4 text-cyan-400" />
                                                </motion.div>
                                                {nav.showLabels && (
                                                    <span className="text-[7px] text-white/30 font-medium uppercase tracking-wider">
                                                        {['Home', 'User', 'Chat', 'Net', 'Sys'][i]}
                                                    </span>
                                                )}
                                                <div className={cn("w-1 h-1 rounded-full", i === 0 ? "bg-cyan-400" : "bg-white/20")} />
                                            </div>
                                        ))}
                                    </motion.div>
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>

                    <motion.div key={`${ui.lastAnimTrigger}-9`} {...getAnimationProps(9)} className="contents">
                        <FamilyWrapper id="progress" label="📊 Barras de Progreso" selected={selectedElement === "progress"} onSelect={() => select("progress")} palette={palette} state={state}>
                            <div className="space-y-6 py-4">
                                {[
                                    { label: 'Core Neural Uplink', value: 82, color: palette.primary },
                                    { label: 'Quantum Sync', value: 65, color: palette.secondary },
                                    { label: 'Data Integrity', value: 94, color: palette.accent },
                                ].map((bar, idx) => (
                                    <div key={idx} className="space-y-2">
                                        {state.progressBars.labelPosition !== 'hidden' && (
                                            <div className={cn(
                                                "flex text-[9px] uppercase tracking-widest font-bold",
                                                state.progressBars.labelPosition === 'top' ? 'justify-between' : 'items-center gap-2'
                                            )} style={{ color: bar.color + '99' }}>
                                                <span>{bar.label}</span>
                                                <span>{bar.value}%</span>
                                            </div>
                                        )}
                                        <div className="w-full bg-white/5 overflow-hidden" style={{
                                            height: `${state.progressBars.height}px`,
                                            borderRadius: state.progressBars.barStyle === 'flat' ? '0px' :
                                                state.progressBars.barStyle === 'cyber' ? '2px' : '9999px'
                                        }}>
                                            <motion.div
                                                className={cn(
                                                    "h-full",
                                                    state.progressBars.barStyle === 'flat' ? '' : state.progressBars.barStyle === 'cyber' ? 'rounded-sm' : 'rounded-full',
                                                    state.progressBars.colorScheme === "gradient" ? "bg-gradient-to-r from-cyan-400 to-purple-500" :
                                                        state.progressBars.colorScheme === "rainbow" ? "bg-gradient-to-r from-red-500 via-yellow-400 via-green-400 via-cyan-400 to-purple-500" : ""
                                                )}
                                                style={{
                                                    width: `${bar.value}%`,
                                                    backgroundColor: state.progressBars.colorScheme === "primary" ? bar.color : undefined,
                                                    boxShadow: state.progressBars.barStyle === 'neon' ? `0 0 8px ${bar.color}, 0 0 16px ${bar.color}44` : undefined,
                                                }}
                                                animate={state.progressBars.animated ? { opacity: [0.8, 1, 0.8] } : {}}
                                                transition={{ duration: state.progressBars.pulseSpeed, repeat: Infinity }}
                                            />
                                        </div>
                                    </div>
                                ))}
                                {/* Circular progress */}
                                <div className="flex items-center justify-center gap-6 pt-2">
                                    <div className="relative w-16 h-16">
                                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                            <motion.circle
                                                cx="18" cy="18" r="15.5" fill="none"
                                                stroke={palette.primary}
                                                strokeWidth="3"
                                                strokeDasharray="97.4"
                                                strokeDashoffset={97.4 * 0.25}
                                                strokeLinecap="round"
                                                animate={state.progressBars.animated ? { strokeDashoffset: [97.4 * 0.35, 97.4 * 0.25, 97.4 * 0.35] } : {}}
                                                transition={{ duration: state.progressBars.pulseSpeed * 2, repeat: Infinity }}
                                                style={{
                                                    filter: state.progressBars.barStyle === 'neon' ? `drop-shadow(0 0 4px ${palette.primary})` : 'none'
                                                }}
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-[10px] font-bold" style={{ color: palette.primary }}>75%</span>
                                        </div>
                                    </div>
                                    <div className="text-[9px] text-white/40 space-y-1">
                                        <div className="font-bold uppercase tracking-widest">Coherencia Global</div>
                                        <div>Sistema optimizado</div>
                                    </div>
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>
                </div>

                {/* ─── TABS & AVATARS ─── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <motion.div key={`${ui.lastAnimTrigger}-10`} {...getAnimationProps(10)} className="contents">
                        <FamilyWrapper id="tabs" label="📑 Tabs" selected={selectedElement === "tabs"} onSelect={() => select("tabs")} palette={palette} state={state}>
                            <div className="space-y-4">
                                <div className="overflow-x-auto scrollbar-hide">
                                    <StitchTabs
                                        tabs={['Zenith', 'Horizonte', 'Lógica']}
                                        config={{
                                            style: state.tabsConfig.style,
                                            activeColor: state.tabsConfig.activeColor,
                                            inactiveColor: state.tabsConfig.inactiveColor,
                                            spacing: state.tabsConfig.spacing,
                                            indicatorStyle: state.tabsConfig.indicatorStyle,
                                            animationType: state.tabsConfig.animationType,
                                            tabPadding: state.tabsConfig.tabPadding,
                                            activeBgOpacity: state.tabsConfig.activeBgOpacity,
                                            indicatorThickness: state.tabsConfig.indicatorThickness,
                                        }}
                                    />
                                </div>
                                <div className="mt-3 p-3 rounded-xl bg-white/3 border border-white/5 overflow-x-auto scrollbar-hide">
                                    <StitchTabs
                                        tabs={['Feed', 'Explorar', 'Lab', 'Config']}
                                        config={{
                                            style: state.tabsConfig.style,
                                            activeColor: palette.secondary,
                                            inactiveColor: state.tabsConfig.inactiveColor,
                                            spacing: state.tabsConfig.spacing,
                                            indicatorStyle: state.tabsConfig.indicatorStyle,
                                            animationType: state.tabsConfig.animationType,
                                            tabPadding: state.tabsConfig.tabPadding,
                                            activeBgOpacity: state.tabsConfig.activeBgOpacity,
                                            indicatorThickness: state.tabsConfig.indicatorThickness,
                                        }}
                                    />
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>

                    <motion.div key={`${ui.lastAnimTrigger}-11`} {...getAnimationProps(11)} className="contents">
                        <FamilyWrapper id="avatars" label="👥 Avatares" selected={selectedElement === "avatars"} onSelect={() => select("avatars")} palette={palette} state={state}>
                            <div className="space-y-4">
                                <div className="flex items-center justify-center gap-3">
                                    {[
                                        { initials: 'ZN', color: palette.trinity?.zenith?.active || "#06B6D4", status: 'online' as const },
                                        { initials: 'HR', color: palette.trinity?.horizonte?.active || "#EF4444", status: 'away' as const },
                                        { initials: 'LG', color: palette.trinity?.nucleo?.logic || "#F59E0B", status: 'offline' as const },
                                        { initials: 'AI', color: palette.primary, status: 'online' as const },
                                        { initials: '+3', color: palette.surface, status: null },
                                    ].map((avatar, i) => (
                                        <div key={i} className="relative group">
                                            <motion.div
                                                className={cn(
                                                    "flex items-center justify-center text-[10px] font-bold border border-white/10 cursor-pointer",
                                                    state.avatars.shape === 'circle' ? 'rounded-full' : 'rounded-lg'
                                                )}
                                                style={{
                                                    width: `${32 * state.avatars.sizeScale}px`,
                                                    height: `${32 * state.avatars.sizeScale}px`,
                                                    backgroundColor: avatar.color + '22',
                                                    color: avatar.color,
                                                }}
                                                whileHover={{ scale: 1.1, y: -2 }}
                                            >
                                                {avatar.initials}
                                            </motion.div>
                                            {avatar.status && (
                                                <div className={cn(
                                                    "absolute w-2.5 h-2.5 rounded-full border-2 border-[#020204]",
                                                    avatar.status === 'online' ? 'bg-emerald-400' : avatar.status === 'away' ? 'bg-amber-400' : 'bg-white/20',
                                                    state.avatars.statusDotPosition === 'bottom-right' ? 'bottom-0 right-0' : 'top-0 right-0'
                                                )} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-center -space-x-2 pt-2">
                                    {['ZN', 'HR', 'LG', 'AI'].map((init, i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "flex items-center justify-center text-[8px] font-bold border-2 border-[#020204]",
                                                state.avatars.shape === 'circle' ? 'rounded-full' : 'rounded-md'
                                            )}
                                            style={{
                                                width: `${28 * state.avatars.sizeScale}px`,
                                                height: `${28 * state.avatars.sizeScale}px`,
                                                backgroundColor: [palette.primary, palette.secondary, palette.accent, palette.surface][i] + '33',
                                                color: [palette.primary, palette.secondary, palette.accent, palette.surface][i],
                                                zIndex: 10 - i,
                                            }}
                                        >
                                            {init}
                                        </div>
                                    ))}
                                    <div className="ml-3 text-[9px] text-white/40 font-medium">+12 en red</div>
                                </div>
                            </div>
                        </FamilyWrapper>
                    </motion.div>
                </div>

                {/* ─── SEPARATORS & LAYOUTS ─── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <motion.div key={`${ui.lastAnimTrigger}-12`} {...getAnimationProps(12)} className="contents">
                        <FamilyWrapper id="separators" label="✂️ Separadores" selected={selectedElement === "separators"} onSelect={() => select("separators")} palette={palette} state={state}>
                            <div className="space-y-4 py-2">
                                {(['line', 'gradient', 'dotted', 'glow'] as const).map((type) => (
                                    <div key={type} className="space-y-1">
                                        <span className="text-[8px] uppercase tracking-widest text-white/25 font-mono">{type}</span>
                                        <div
                                            className={cn(type === 'glow' ? 'shadow-[0_0_6px_rgba(255,255,255,0.15)]' : '')}
                                            style={{
                                                height: `${state.secondary.dividerThickness}px`,
                                                background: type === 'gradient' || type === 'glow'
                                                    ? `linear-gradient(to right, transparent, ${state.secondary.dividerColor || palette.primary + '33'}, transparent)`
                                                    : type === 'dotted' ? 'none' : (state.secondary.dividerColor || 'rgba(255,255,255,0.1)'),
                                                borderStyle: type === 'dotted' ? 'dotted' : undefined,
                                                borderWidth: type === 'dotted' ? `${state.secondary.dividerThickness}px 0 0 0` : undefined,
                                                borderColor: type === 'dotted' ? (state.secondary.dividerColor || 'rgba(255,255,255,0.15)') : undefined,
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </FamilyWrapper>
                    </motion.div>
                </div>

                {/* ─── TRINITY LIVE PREVIEW ─── */}
                <motion.div key={`${ui.lastAnimTrigger}-trinity`} {...getAnimationProps(14)} className="contents">
                    <FamilyWrapper id="trinity" label="✦ Interfaz Trinidad" selected={selectedElement === "trinity"} onSelect={() => select("trinity")} palette={palette} state={state}>
                        <div className="space-y-3">
                            <p className="text-[9px] text-white/40 leading-relaxed">
                                Vista previa interactiva del sistema Trinity. Los ajustes del panel izquierdo se reflejan aquí en tiempo real.
                            </p>
                            <TrinityPreviewSection state={state} />
                        </div>
                    </FamilyWrapper>
                </motion.div>

                {/* ─── LAYOUT CONFIG INDICATOR ─── */}
                <div className="flex items-center justify-center gap-3 py-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    <span className="text-[7px] uppercase tracking-[0.3em] text-white/15 font-mono">
                        Layout: {state.layoutConfig.windowStyle} • {state.layoutConfig.frameType} • {state.layoutConfig.tabLayout}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/5 to-transparent" />
                </div>
            </div>
        </div>
    );
}
