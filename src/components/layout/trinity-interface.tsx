"use client";

import React, { useState, useEffect } from "react";
import { usePerimeter } from "@/context/perimeter-context";
import { motion, AnimatePresence } from "framer-motion";
import {
    Menu,
    X,
    Sparkles, // AI
    Layout, // Creation
    Settings2, // Logic
    Home, // Dashboard
    User, // Profile
    Users, // Hub
    Network, // Network
    MessageSquare, // Messages
    Globe, // Explorer
    Info, // Info
    PenSquare, // Publish
    LogOut, // Logout/Back
    LayoutDashboard // Dashboard alt
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
    const { position = "bottom-center", mode = "floating", style = "glass", isExpanded: initialExpanded = true } = config?.trinity || {};

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
    // We removed 'anchor' from here so OmniDock takes over for the bottom edge.
    useEffect(() => {
        if (activeEdge === 'horizon' || activeEdge === 'logic') {
            setExpanded(true);
        }
    }, [activeEdge]);

    // --- CHROMODYNAMICS & POSITIONING ---
    const getPositionClasses = () => {
        if (mode === 'docked' || mode === 'floating') {
            switch (position) {
                case 'bottom-center': return "bottom-8 left-1/2 -translate-x-1/2 flex-row items-end gap-2";
                case 'bottom-right': return "bottom-8 right-8 flex-col-reverse items-end gap-2";
                case 'top-right': return "top-24 right-8 flex-col items-end gap-2";
                case 'left-center': return "top-1/2 left-8 -translate-y-1/2 flex-row items-center gap-2";
                case 'right-center': return "top-1/2 right-8 -translate-y-1/2 flex-row-reverse items-center gap-2";
                default: return "bottom-8 left-1/2 -translate-x-1/2 flex-row items-end gap-2";
            }
        }
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
                            className="relative pointer-events-auto"
                        >
                            {/* Filter Layer */}
                            <div
                                className={cn(
                                    "flex items-center relative p-4 transition-all gap-3",
                                    // Make sure inner flex direction matches outter for consistency
                                    position.includes('flex-col') ? "flex-col-reverse" : "flex-row"
                                )}
                                style={{ filter: "url(#goo)" }}
                            >
                                {/* LEFT WING (Navigation & Creation) */}
                                <AnimatePresence mode="popLayout">
                                    {isExpanded && [
                                        <FloatingButton
                                            key="dashboard"
                                            onClick={() => router.push("/dashboard")}
                                            icon={<Home className="w-5 h-5" />}
                                            label="Inicio"
                                            color="neutral"
                                            delay={0.2}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="profile"
                                            onClick={() => router.push("/profile/starseeduser")}
                                            icon={<User className="w-5 h-5" />}
                                            label="Perfil"
                                            color="neutral"
                                            delay={0.15}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="publish"
                                            onClick={() => router.push("/publish")}
                                            icon={<PenSquare className="w-5 h-5" />}
                                            label="Publicar"
                                            color="emerald"
                                            delay={0.12}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="creation"
                                            onClick={handleCreation}
                                            icon={<Layout className="w-5 h-5" />}
                                            label="Creación"
                                            color="emerald"
                                            delay={0.1}
                                            isActive={activeEdge === 'horizon'}
                                            size="normal"
                                        />
                                    ]}
                                </AnimatePresence>

                                {/* CENTER (The Anchor/Nucleus) */}
                                <FloatingButton
                                    onClick={() => setExpanded(!isExpanded)}
                                    icon={isExpanded ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                                    color="neutral"
                                    size="large" // Main trigger is larger
                                    className="z-50 mx-2"
                                />

                                {/* RIGHT WING (Context & Exploration) */}
                                <AnimatePresence mode="popLayout">
                                    {isExpanded && [
                                        <FloatingButton
                                            key="ai"
                                            onClick={handleAIAssistant}
                                            icon={<Sparkles className="w-5 h-5" />}
                                            label="IA Nexus"
                                            color="cyan"
                                            delay={0.1}
                                            isActive={activeEdge === 'zenith'}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="logic"
                                            onClick={handleLogic}
                                            icon={<Settings2 className="w-5 h-5" />}
                                            label="Panel de Control"
                                            color="amber"
                                            delay={0.12}
                                            isActive={activeEdge === 'logic'}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="messages"
                                            onClick={() => router.push("/messages")}
                                            icon={<MessageSquare className="w-5 h-5" />}
                                            label="Mensajes"
                                            color="crimson"
                                            delay={0.15}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="network"
                                            onClick={() => router.push("/network")}
                                            icon={<Network className="w-5 h-5" />}
                                            label="Red"
                                            color="crimson"
                                            delay={0.2}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="hub"
                                            onClick={() => router.push("/hub")}
                                            icon={<Users className="w-5 h-5" />}
                                            label="Hub"
                                            color="crimson"
                                            delay={0.25}
                                            size="normal"
                                        />,
                                        <FloatingButton
                                            key="explorer"
                                            onClick={() => router.push("/explorer")}
                                            icon={<Globe className="w-5 h-5" />}
                                            label="Explorador"
                                            color="crimson"
                                            delay={0.3}
                                            size="normal"
                                        />
                                    ]}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
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
}

function FloatingButton({ onClick, icon, label, isActive, delay = 0, color = "neutral", size = "normal", className }: FloatingButtonProps) {

    // Chromodynamic Map
    const colorStyles = {
        neutral: "bg-background/80 border-white/10 text-foreground hover:bg-white/20",
        cyan: "bg-cyan-500/20 border-cyan-500/30 text-cyan-200 hover:text-cyan-100 hover:bg-cyan-500/40 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]",
        amber: "bg-amber-500/20 border-amber-500/30 text-amber-200 hover:text-amber-100 hover:bg-amber-500/40 hover:shadow-[0_0_20px_rgba(251,191,36,0.4)]",
        emerald: "bg-emerald-500/20 border-emerald-500/30 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/40 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]",
        crimson: "bg-red-600/20 border-red-600/30 text-red-200 hover:text-red-100 hover:bg-red-600/40 hover:shadow-[0_0_20px_rgba(220,38,38,0.4)]"
    };

    const sizeClasses = size === "large" ? "w-16 h-16" : "w-12 h-12";

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
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
            {label && (
                <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap backdrop-blur-md border border-white/10">
                    {label}
                </span>
            )}
        </motion.div>
    );
}
