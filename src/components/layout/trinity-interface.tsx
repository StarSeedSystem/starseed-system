"use client";

import React, { useState, useEffect } from "react";
import { usePerimeter } from "@/context/perimeter-context";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Sparkles, // Ecosistema IA
    Layout, // Horizon · Creación
    Settings2, // Logic · Control
    Home, // Inicio
    User, // Perfil
    Network, // Gráfica viva
    PenSquare, // Publicar
    Bot, // Agente IA (Zenith)
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useControlPanel } from "@/context/control-panel-context";
import { useRouter } from "next/navigation";
import { useAppearance } from "@/context/appearance-context";
import { useSidebar } from "@/context/sidebar-context";



export function TrinityFloatingInterface() {
    const { toggle: toggleControlPanel, isOpen: isControlPanelOpen, activeTab, setActiveTab, setIsOpen: setControlPanelOpen } = useControlPanel();
    const { toggle: toggleSidebar, isOpen: isSidebarOpen } = useSidebar();
    const { config } = useAppearance();

    const router = useRouter();
    const { activeEdge, setActiveEdge } = usePerimeter();

    // Configuration from Context
    const {
        mode = "floating",
        style = "glass",
        isExpanded: initialExpanded = true,
        menuCustomization
    } = config?.trinity || {};

    const { showLabels = true, iconScale = 1 } = menuCustomization || {};

    const [isExpanded, setExpanded] = useState(initialExpanded);
    const [constraints, setConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });

    // Handle Resize for Constraints
    useEffect(() => {
        if (mode !== 'floating') return;
        const updateConstraints = () => {
            setConstraints({
                left: -window.innerWidth / 2 + 50,
                right: window.innerWidth / 2 - 50,
                top: -window.innerHeight + 100,
                bottom: 0
            });
        };
        updateConstraints();
        window.addEventListener('resize', updateConstraints);
        return () => window.removeEventListener('resize', updateConstraints);
    }, [mode]);

    const handleAIAssistant = () => {
        setActiveEdge("zenith");
    };

    const handleCreation = () => {
        setActiveEdge("horizon");
    };

    const handleLogic = () => {
        setActiveEdge("logic");
    };

    // Auto-expand when non-conflicting edges are active (Left/Right)
    useEffect(() => {
        if (activeEdge === 'horizon' || activeEdge === 'logic') {
            setExpanded(true);
        }
    }, [activeEdge]);

    // --- CHROMODYNAMICS & POSITIONING ---
    const getPositionClasses = () => {
        // Standardized to Bottom Center for stability in the new layout system
        return "bottom-8 left-1/2 -translate-x-1/2 flex-row items-end gap-2";
    };

    const isVisible = (activeEdge && activeEdge !== 'anchor') || mode === 'floating';

    return (
        <>
            <svg className="hidden">
                <defs>
                    <filter id="goo">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
                        <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
                        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                    </filter>
                </defs>
            </svg>

            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        className={cn("fixed z-[60] flex pointer-events-none", getPositionClasses())}
                        initial={{ y: 200, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 200, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 25 }}
                    >
                        {/* 
                        The "Gooey" Container 
                        */}
                        <motion.div
                            drag={mode === 'floating'}
                            dragConstraints={constraints}
                            dragElastic={0.1}
                            className="relative pointer-events-auto flex flex-col items-center gap-2"
                        >
                            {/* ── Riel de las TRES FACETAS Trinity (propósito claro) ──
                                Zenith = guía IA · Horizon = creación · Logic = control.
                                Togglean el MISMO perímetro que los sensores/FAB/atajos. */}
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 14, scale: 0.92 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 14, scale: 0.92 }}
                                        transition={{ type: "spring", stiffness: 320, damping: 26 }}
                                        className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/55 backdrop-blur-xl px-2 py-1.5 shadow-xl"
                                        role="group"
                                        aria-label="Facetas Trinity: Zenith, Horizon y Logic"
                                    >
                                        <FacetChip
                                            label="Zenith"
                                            sub="Guía IA"
                                            icon={<Sparkles className="w-3.5 h-3.5" />}
                                            color="cyan"
                                            active={activeEdge === 'zenith'}
                                            onClick={handleAIAssistant}
                                            showLabel={showLabels}
                                        />
                                        <FacetChip
                                            label="Horizon"
                                            sub="Creación"
                                            icon={<Layout className="w-3.5 h-3.5" />}
                                            color="emerald"
                                            active={activeEdge === 'horizon'}
                                            onClick={handleCreation}
                                            showLabel={showLabels}
                                        />
                                        <FacetChip
                                            label="Logic"
                                            sub="Control"
                                            icon={<Settings2 className="w-3.5 h-3.5" />}
                                            color="amber"
                                            active={activeEdge === 'logic'}
                                            onClick={handleLogic}
                                            showLabel={showLabels}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Filter Layer */}
                            <div
                                className={cn(
                                    "flex items-center relative p-4 transition-all gap-3",
                                    // Make sure inner flex direction matches outter for consistency
                                    getPositionClasses().includes('flex-col') ? "flex-col-reverse" : "flex-row"
                                )}
                                style={{ filter: "url(#goo)" }}
                            >
                                {/* LEFT WING (Navigation & Creation) */}
                                <AnimatePresence mode="popLayout">
                                    {isExpanded && [
                                        <FloatingButton
                                            key="dashboard"
                                            onClick={() => router.push("/dashboard")}
                                            icon={<Home className="w-6 h-6" />}
                                            label="Inicio"
                                            color="neutral"
                                            delay={0.2}
                                            size="normal"
                                            scale={iconScale}
                                            showLabel={showLabels}
                                        />,
                                        <FloatingButton
                                            key="profile"
                                            onClick={() => router.push("/profile/starseeduser")}
                                            icon={<User className="w-6 h-6" />}
                                            label="Perfil"
                                            color="neutral"
                                            delay={0.15}
                                            size="normal"
                                            scale={iconScale}
                                            showLabel={showLabels}
                                        />,
                                        <FloatingButton
                                            key="publish"
                                            onClick={() => router.push("/publish")}
                                            icon={<PenSquare className="w-6 h-6" />}
                                            label="Publicar"
                                            color="emerald"
                                            delay={0.12}
                                            size="normal"
                                            scale={iconScale}
                                            showLabel={showLabels}
                                        />,
                                        <FloatingButton
                                            key="creation"
                                            onClick={handleCreation}
                                            icon={<Layout className="w-6 h-6" />}
                                            label="Creación"
                                            color="emerald"
                                            delay={0.1}
                                            isActive={activeEdge === 'horizon'}
                                            size="normal"
                                            scale={iconScale}
                                            showLabel={showLabels}
                                        />
                                    ]}
                                </AnimatePresence>

                                {/* CENTER (El Núcleo Trinity) — sigil cardinal como
                                    identidad del lanzador principal del OS. */}
                                <FloatingButton
                                    onClick={() => setExpanded(!isExpanded)}
                                    icon={isExpanded ? <X className="w-8 h-8" /> : <TrinitySigil />}
                                    label={isExpanded ? "Cerrar Trinity" : "Abrir Trinity"}
                                    showLabel={false}
                                    color="neutral"
                                    size="large" // Main trigger is larger
                                    className="z-50 mx-4"
                                />

                                {/* RIGHT WING (Context & Exploration) */}
                                <AnimatePresence mode="popLayout">
                                    {isExpanded && [
                                        <FloatingButton
                                            key="agent"
                                            onClick={() => router.push("/agent")}
                                            icon={<Bot className="w-6 h-6" />}
                                            label="Agente IA"
                                            color="cyan"
                                            delay={0.1}
                                            size="normal"
                                            scale={iconScale}
                                            showLabel={showLabels}
                                        />,
                                        <FloatingButton
                                            key="ai-setup"
                                            onClick={() => router.push("/ai-setup")}
                                            icon={<Sparkles className="w-6 h-6" />}
                                            label="Ecosistema IA"
                                            color="cyan"
                                            delay={0.12}
                                            size="normal"
                                            scale={iconScale}
                                            showLabel={showLabels}
                                        />,
                                        <FloatingButton
                                            key="graph"
                                            onClick={() => router.push("/network/graph")}
                                            icon={<Network className="w-6 h-6" />}
                                            label="Gráfica Viva"
                                            color="cyan"
                                            delay={0.14}
                                            size="normal"
                                            scale={iconScale}
                                            showLabel={showLabels}
                                        />,
                                    ]}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence >
        </>
    );
}

// ------------------------------------------------------------------
// Internal Helper Components
// ------------------------------------------------------------------

interface FloatingButtonProps {
    onClick: () => void;
    icon: React.ReactNode;
    label?: string;
    isActive?: boolean;
    delay?: number;
    color?: "neutral" | "cyan" | "amber" | "emerald" | "crimson";
    size?: "normal" | "large";
    className?: string;
    showLabel?: boolean;
    scale?: number;
}

function FloatingButton({ onClick, icon, label, isActive, delay = 0, color = "neutral", size = "normal", className, showLabel = true, scale = 1 }: FloatingButtonProps) {

    // Chromodynamic Map
    const colorStyles = {
        neutral: "bg-background/80 border-foreground/10 text-foreground hover:bg-foreground/10",
        cyan: "bg-cyan-500/20 border-cyan-500/30 text-cyan-200 hover:text-cyan-100 hover:bg-cyan-500/40 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]",
        amber: "bg-amber-500/20 border-amber-500/30 text-amber-200 hover:text-amber-100 hover:bg-amber-500/40 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)]",
        emerald: "bg-emerald-500/20 border-emerald-500/30 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/40 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]",
        crimson: "bg-red-600/20 border-red-600/30 text-red-200 hover:text-red-100 hover:bg-red-600/40 hover:shadow-[0_0_20px_rgba(220,38,38,0.4)]"
    };

    const sizeClasses = size === "large" ? "w-20 h-20" : "w-14 h-14";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: scale, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 10 }}
            transition={{
                delay,
                type: "spring",
                stiffness: 300,
                damping: 20,
                mass: 0.8
            }}
            className={cn("relative group", className)}
        >
            <Button
                variant="ghost"
                size="icon"
                onClick={onClick}
                className={cn(
                    "rounded-full relative backdrop-blur-md border shadow-lg transition-all duration-300",
                    sizeClasses,
                    colorStyles[color],
                    isActive && "ring-2 ring-offset-2 ring-white/20 scale-110 shadow-xl brightness-125"
                )}
            >
                {icon}
            </Button>

            {/* Tooltip Label */}
            {label && showLabel && (
                <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap backdrop-blur-md border border-white/10">
                    {label}
                </span>
            )}
        </motion.div>
    );
}

// ------------------------------------------------------------------
// FacetChip — una de las tres facetas Trinity (Zenith/Horizon/Logic).
// Pastilla compacta y legible que togglea su perímetro. Cohesiona el
// propósito del lanzador: las 3 facetas siempre visibles y etiquetadas.
// ------------------------------------------------------------------

interface FacetChipProps {
    label: string;
    sub: string;
    icon: React.ReactNode;
    color: "cyan" | "emerald" | "amber";
    active?: boolean;
    onClick: () => void;
    showLabel?: boolean;
}

function FacetChip({ label, sub, icon, color, active, onClick, showLabel = true }: FacetChipProps) {
    const palette = {
        cyan: {
            on: "bg-cyan-500/25 border-cyan-400/50 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.35)]",
            off: "border-cyan-400/15 text-cyan-200/70 hover:bg-cyan-500/15 hover:text-cyan-100",
            dot: "bg-cyan-400",
        },
        emerald: {
            on: "bg-emerald-500/25 border-emerald-400/50 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.35)]",
            off: "border-emerald-400/15 text-emerald-200/70 hover:bg-emerald-500/15 hover:text-emerald-100",
            dot: "bg-emerald-400",
        },
        amber: {
            on: "bg-amber-500/25 border-amber-400/50 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
            off: "border-amber-400/15 text-amber-200/70 hover:bg-amber-500/15 hover:text-amber-100",
            dot: "bg-amber-400",
        },
    }[color];

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={!!active}
            title={`${label} · ${sub}`}
            className={cn(
                "group/facet relative inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all duration-300 cursor-pointer",
                active ? palette.on : cn("bg-white/[0.03]", palette.off),
                active && "scale-[1.03]"
            )}
        >
            <span className="relative inline-flex">
                {icon}
                {active && (
                    <span className={cn("absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full animate-pulse", palette.dot)} />
                )}
            </span>
            {showLabel && (
                <span className="flex flex-col items-start leading-none">
                    <span className="text-[11px] font-semibold tracking-tight">{label}</span>
                    <span className="text-[8px] uppercase tracking-[0.12em] opacity-60">{sub}</span>
                </span>
            )}
        </button>
    );
}

// ------------------------------------------------------------------
// TrinitySigil — identidad del núcleo: 4 gemas cardinales en cruz.
// Coherente con el sigil del TrinityFab (mismos colores cardinales).
// ------------------------------------------------------------------

function TrinitySigil() {
    return (
        <svg className="w-8 h-8" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="4.6" r="3" fill="#007FFF" />
            <circle cx="19.4" cy="12" r="3" fill="#FFBF00" />
            <circle cx="12" cy="19.4" r="3" fill="#DC143C" />
            <circle cx="4.6" cy="12" r="3" fill="#39FF14" />
            <circle cx="12" cy="12" r="1.6" fill="rgba(255,255,255,0.9)" />
        </svg>
    );
}
