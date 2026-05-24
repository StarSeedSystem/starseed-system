import React from "react";
import { cn } from "@/lib/utils";
import { StitchDesignTokens } from "@/styles/stitch-themes";
import { motion } from "framer-motion";

interface StitchWrapperProps {
    theme: "liquid" | "organic" | "liquid-crystal" | null;
    className?: string;
    children: React.ReactNode;
    isActive?: boolean;
    size?: number;
    hoverScale?: number;
    styleConfig?: {
        borderRadius?: number;
        glowIntensity?: number;
        glowColor?: string;
    }
}

export function StitchIconWrapper({ theme, className, children, isActive, size, hoverScale, styleConfig }: StitchWrapperProps) {
    if (!theme) {
        return <div className={cn("relative", className)} style={{ width: size, height: size }}>{children}</div>;
    }

    const isLiquid = theme === "liquid";

    const dynamicWrapperStyle: React.CSSProperties = {};
    if (size) {
        dynamicWrapperStyle.width = `${size}px`;
        dynamicWrapperStyle.height = `${size}px`;
    }
    if (styleConfig) {
        if (styleConfig.borderRadius !== undefined) dynamicWrapperStyle.borderRadius = `${styleConfig.borderRadius}px`;
        // Glow intensity could be used here to adjust the background opacity or shadow
    }


    return (
        <motion.div
            className={cn(
                "relative flex items-center justify-center transition-all duration-300 group",
                className
            )}
            style={dynamicWrapperStyle}
            whileHover={{ scale: hoverScale || (isLiquid ? 1.05 : 1.1), y: isLiquid ? 0 : -5 }}
            whileTap={{ scale: 0.95 }}
        >
            {/* Background Glow/Shape */}
            <div className={cn(
                "absolute inset-0 transition-all duration-500",
                isLiquid && "bg-cyan-500/5 rotate-45 border border-cyan-500/20 group-hover:bg-cyan-500/10 group-hover:border-cyan-400/50",
                theme === "liquid-crystal" && "bg-white/5 border border-white/20 rounded-xl backdrop-blur-sm group-hover:bg-white/10 group-hover:border-white/40",
                theme === "organic" && "bg-emerald-500/10 rounded-full blur-[2px] group-hover:bg-emerald-500/20 group-hover:blur-md",
                isActive && (isLiquid ? "bg-cyan-500/20 border-cyan-400" : theme === "liquid-crystal" ? "bg-white/20 border-white/60" : "bg-emerald-500/30 blur-lg")
            )} style={{
                borderRadius: styleConfig?.borderRadius ? `${styleConfig.borderRadius}px` : (isLiquid ? "4px" : "50%"),
                ...dynamicWrapperStyle
            }} />

            {/* Icon Render */}
            <div className={cn(
                "relative z-10 transition-colors duration-300",
                isLiquid && "text-cyan-400 group-hover:text-cyan-200 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]",
                theme === "liquid-crystal" && "text-white/80 group-hover:text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]",
                theme === "organic" && "text-emerald-400 group-hover:text-emerald-200 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]"
            )}>
                {children}
            </div>

            {/* Active Indicator */}
            {isActive && (
                <div className={cn(
                    "absolute -bottom-2 w-1 h-1",
                    isLiquid ? "bg-cyan-400 shadow-[0_0_5px_cyan]" : theme === "liquid-crystal" ? "bg-white shadow-[0_0_8px_white] rounded-full" : "bg-emerald-400 rounded-full shadow-[0_0_5px_emerald]"
                )} />
            )}
        </motion.div>
    );
}
