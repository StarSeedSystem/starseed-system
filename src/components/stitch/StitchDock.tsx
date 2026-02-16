import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { getElementsByCategory } from "@/config/system-elements";
import { StitchIconWrapper } from "./StitchIconWrapper";

interface StitchDockProps {
    theme: "liquid" | "organic";
    className?: string;
    iconSize?: number;
    magnification?: number;
    styleConfig?: {
        borderColor?: string;
        borderWidth?: number;
        borderRadius?: number;
        backgroundColor?: string;
        blurAmount?: number;
        glowIntensity?: number;
        glowColor?: string;
    };
}

export function StitchDock({ theme, className, iconSize = 48, magnification = 1.1, styleConfig }: StitchDockProps) {
    // Determine styles based on theme
    const isLiquid = theme === "liquid";

    // Get real navigation items from Master List
    const navItems = getElementsByCategory("navigation");

    // Dynamic Style Construction
    const dynamicStyle: React.CSSProperties = {};
    if (styleConfig) {
        if (styleConfig.borderColor) dynamicStyle.borderColor = styleConfig.borderColor;
        if (styleConfig.borderWidth !== undefined) dynamicStyle.borderWidth = `${styleConfig.borderWidth}px`;
        if (styleConfig.borderRadius !== undefined) dynamicStyle.borderRadius = `${styleConfig.borderRadius}px`;
        if (styleConfig.backgroundColor) dynamicStyle.backgroundColor = styleConfig.backgroundColor;
        if (styleConfig.blurAmount !== undefined) dynamicStyle.backdropFilter = `blur(${styleConfig.blurAmount}px)`;
        if (styleConfig.glowIntensity && styleConfig.glowColor) {
            dynamicStyle.boxShadow = `0 0 ${styleConfig.glowIntensity * 10}px ${styleConfig.glowColor}`;
        }
    }


    return (
        <div
            className={cn(
                "relative flex items-center justify-center gap-4 px-6 py-4 transition-all duration-500",
                // Container Shape & Style (Defaults if no styleConfig)
                !styleConfig && (isLiquid
                    ? "rounded-xl border border-cyan-500/30 bg-slate-900/60 backdrop-blur-xl shadow-[0_0_30px_rgba(6,182,212,0.15)]"
                    : "rounded-full border border-emerald-500/20 bg-emerald-950/40 backdrop-blur-lg shadow-[0_0_30px_rgba(16,185,129,0.15)]"),
                className
            )}
            style={dynamicStyle}
        >
            {/* Ambient Background Glow */}
            <div className={cn(
                "absolute inset-0 -z-10 opacity-50",
                isLiquid
                    ? "bg-gradient-to-t from-cyan-900/20 to-transparent"
                    : "bg-gradient-to-b from-emerald-900/20 to-transparent rounded-full"
            )} style={{ borderRadius: styleConfig?.borderRadius ? `${styleConfig.borderRadius}px` : undefined }} />

            {/* Docker Items */}
            {navItems.map((item) => (
                <StitchIconWrapper
                    key={item.id}
                    theme={theme}
                    size={iconSize}
                    hoverScale={magnification}
                    isActive={item.id === "nav-dashboard"} // Example active state
                >
                    <item.icon className="w-1/2 h-1/2" />
                </StitchIconWrapper>
            ))}
        </div>
    );
}
