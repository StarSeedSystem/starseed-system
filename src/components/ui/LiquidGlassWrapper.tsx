"use client";

import React from "react";
import LiquidGlass from "liquid-glass-react";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

interface LiquidGlassWrapperProps {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    // Overrides
    displacementScale?: number;
    blurAmount?: number;
    saturation?: number;
    aberrationIntensity?: number;
    elasticity?: number;
    cornerRadius?: number;
    mode?: "standard" | "polar" | "prominent" | "shader";
    overLight?: boolean; // Toggles light-mode optimizations (darker borders/shadows)
    forceActive?: boolean; // Kept for compatibility with LiquidButton/Card
}

export function LiquidGlassWrapper({
    children,
    className,
    style,
    onClick,
    displacementScale,
    blurAmount,
    saturation,
    aberrationIntensity,
    elasticity,
    cornerRadius,
    mode,
    overLight = false,
    forceActive = false
}: LiquidGlassWrapperProps) {
    const { config } = useAppearance();
    const { liquidGlass } = config;

    // Determine if we should render the effect
    // We check forceActive OR (globally enabled AND applyToUI enabled)
    const isEnabled = forceActive || (liquidGlass.enabled && liquidGlass.applyToUI);

    if (!isEnabled) {
        return (
            <div className={className} style={style} onClick={onClick}>
                {children}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "relative group isolation-auto",
                overLight && "text-black border-black/10 shadow-[0_4px_20px_rgba(0,0,0,0.1)]",
                className
            )}
            style={style}
            onClick={onClick}
            data-over-light={overLight}
        >
            {/* Liquid Distortion Layer - Absolute Background */}
            <div className="absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
                <LiquidGlass
                    displacementScale={displacementScale ?? liquidGlass.displacementScale}
                    blurAmount={blurAmount ?? liquidGlass.blurAmount}
                    saturation={saturation ?? liquidGlass.saturation}
                    aberrationIntensity={aberrationIntensity ?? liquidGlass.aberrationIntensity}
                    elasticity={elasticity ?? liquidGlass.elasticity}
                    cornerRadius={cornerRadius ?? liquidGlass.cornerRadius}
                    mode={mode ?? liquidGlass.mode}
                    // @ts-ignore - LiquidGlass might not have types for this yet, but we want to pass it if it does
                    overLight={overLight}
                    className="w-full h-full"
                >
                    {/* Empty container for the liquid effect to act upon if needed, 
                        or just to provide the surface area */}
                    <div className="w-full h-full bg-white/5 opacity-50" />
                </LiquidGlass>
            </div>

            {/* Content Layer - Protected from distortion */}
            <div className="relative z-10 pointer-events-none *:pointer-events-auto">
                {children}
            </div>
        </div>
    );
}
