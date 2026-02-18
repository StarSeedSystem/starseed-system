"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface TabItem {
    id: string;
    label: string | React.ReactNode;
    icon?: React.ElementType;
}

interface StitchTabsProps {
    tabs: (TabItem | string)[];
    activeTab?: string;
    onChange?: (id: string) => void;
    className?: string;
    config: {
        style: "pill" | "underline" | "box" | "ghost";
        activeColor: string;
        inactiveColor?: string;
        spacing: number;
        indicatorStyle: "glow" | "line" | "pill" | "dot" | "neon";
        animationType: "smooth" | "elastic" | "bounce";
        tabPadding: number;
        activeBgOpacity: number;
        indicatorThickness: number;
    };
    theme?: "default" | "liquid" | "organic" | "glass" | "neon" | "brutal";
}

export function StitchTabs({
    tabs,
    activeTab: activeTabProp,
    onChange: onChangeProp,
    className,
    config,
    theme = "glass"
}: StitchTabsProps) {
    // Robust tab transformation
    const normalizedTabs = tabs.map((t, i) =>
        typeof t === 'string' ? { id: t, label: t } : t
    );

    const [internalActiveTab, setInternalActiveTab] = React.useState(
        normalizedTabs[0]?.id || ""
    );

    const activeTab = activeTabProp !== undefined ? activeTabProp : internalActiveTab;

    const handleTabChange = (id: string) => {
        if (activeTabProp === undefined) {
            setInternalActiveTab(id);
        }
        onChangeProp?.(id);
    };

    const {
        style,
        activeColor,
        inactiveColor = "rgba(255,255,255,0.4)",
        spacing,
        indicatorStyle,
        animationType,
        tabPadding,
        activeBgOpacity,
        indicatorThickness
    } = config;

    const springConfig = {
        smooth: { type: "spring", stiffness: 400, damping: 30 },
        elastic: { type: "spring", stiffness: 500, damping: 15, mass: 1 },
        bounce: { type: "spring", stiffness: 600, damping: 10, mass: 1.2 }
    }[animationType] || { type: "spring", stiffness: 400, damping: 30 };

    const getIndicatorClass = () => {
        switch (indicatorStyle) {
            case "glow": return "bg-white/20 blur-md";
            case "neon": return "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]";
            case "line": return ""; // Handled by activeColor
            default: return "";
        }
    };

    return (
        <div
            className={cn(
                "flex items-center",
                className
            )}
            style={{ gap: `${spacing}px` }}
        >
            {normalizedTabs.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={cn(
                            "relative flex items-center gap-2 transition-colors duration-300 isolate",
                            style === "pill" && "rounded-full",
                            style === "box" && "rounded-lg",
                            style === "underline" && "rounded-none",
                            style === "ghost" && "rounded-md"
                        )}
                        style={{
                            padding: `${tabPadding / 2}px ${tabPadding}px`,
                            color: isActive
                                ? (style !== "underline" && activeBgOpacity > 0.6 ? "#FFFFFF" : activeColor)
                                : inactiveColor,
                            textShadow: (isActive && style !== "underline" && activeBgOpacity > 0.6)
                                ? `0 0 8px ${activeColor}88`
                                : "none"
                        }}
                    >
                        {/* Tab Content */}
                        <span className="relative z-30 font-medium text-xs tracking-wide">
                            {tab.icon && <tab.icon className="w-3.5 h-3.5 inline-block mr-1.5 opacity-70" />}
                            {tab.label}
                        </span>

                        {/* Active Background Mapping */}
                        {isActive && style !== "underline" && (
                            <motion.div
                                layoutId={`bg-${indicatorStyle}`}
                                className={cn(
                                    "absolute inset-0 z-0",
                                    style === "pill" && "rounded-full",
                                    style === "box" && "rounded-lg",
                                    style === "ghost" && "rounded-md"
                                )}
                                style={{
                                    backgroundColor: activeColor,
                                    opacity: activeBgOpacity
                                }}
                                transition={springConfig as any}
                            />
                        )}

                        {/* Indicator Mapping */}
                        {isActive && (
                            <>
                                {indicatorStyle === "line" && style === "underline" && (
                                    <motion.div
                                        layoutId="line-indicator"
                                        className="absolute bottom-0 left-0 right-0 z-20"
                                        style={{
                                            height: `${indicatorThickness}px`,
                                            backgroundColor: activeColor,
                                            boxShadow: `0 0 10px ${activeColor}66`
                                        }}
                                        transition={springConfig as any}
                                    />
                                )}

                                {indicatorStyle === "neon" && style === "underline" && (
                                    <motion.div
                                        layoutId="neon-line"
                                        className="absolute bottom-0 left-0 right-0 z-20 h-[2px] bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,1)]"
                                        transition={springConfig as any}
                                    >
                                        <div className="absolute inset-0 bg-white blur-[1px] opacity-50" />
                                    </motion.div>
                                )}

                                {indicatorStyle === "dot" && (
                                    <motion.div
                                        layoutId="dot-indicator"
                                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full z-20"
                                        style={{ backgroundColor: activeColor }}
                                        transition={springConfig as any}
                                    />
                                )}

                                {indicatorStyle === "pill" && style === "pill" && (
                                    <motion.div
                                        layoutId="pill-glow"
                                        className="absolute inset-0 z-[-1] rounded-full blur-sm opacity-30"
                                        style={{ backgroundColor: activeColor }}
                                        transition={springConfig as any}
                                    />
                                )}
                            </>
                        )}

                        {/* Liquid Effect (Overlay) */}
                        {theme === "liquid" && isActive && (
                            <motion.div
                                className="absolute inset-0 bg-white/5 overflow-hidden z-[-1] rounded-inherit"
                                animate={{
                                    opacity: [0.3, 0.5, 0.3]
                                }}
                                transition={{ duration: 3, repeat: Infinity }}
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_70%)] animate-pulse" />
                            </motion.div>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
