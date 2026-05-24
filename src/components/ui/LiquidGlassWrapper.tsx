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
    // Overrides — all map to liquid-glass-react LiquidGlassProps
    displacementScale?: number;
    blurAmount?: number;
    saturation?: number;
    aberrationIntensity?: number;
    elasticity?: number;
    refraction?: number;

    cornerRadius?: number;
    noiseOpacity?: number;
    padding?: string;
    mode?: "standard" | "polar" | "prominent" | "shader";
    overLight?: boolean;
    forceActive?: boolean;
    mouseContainer?: React.RefObject<HTMLElement | null> | null;
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
    refraction,

    cornerRadius,
    noiseOpacity,
    padding,
    mode,
    overLight = false,
    forceActive = false,
    mouseContainer
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
                "relative group isolation-auto rounded-[inherit]",
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
                    // @ts-ignore
                    refraction={refraction ?? 0.5} // Default if not provided
                    // @ts-ignore
                    ior={refraction ?? 0.5} // Alias for Index of Refraction
                    cornerRadius={cornerRadius ?? liquidGlass.cornerRadius}
                    // @ts-ignore - noiseOpacity might not be in the types yet but is often supported
                    noiseOpacity={noiseOpacity ?? liquidGlass.noiseOpacity}
                    padding={padding}
                    mode={mode ?? liquidGlass.mode}
                    overLight={overLight}
                    mouseContainer={mouseContainer}
                    className="w-full h-full rounded-[inherit]"
                >
                    {/* Empty container for the liquid effect to act upon if needed, 
                        or just to provide the surface area */}
                    <div className="w-full h-full bg-white/5 opacity-50 rounded-[inherit]" />
                </LiquidGlass>
            </div>

            {/* Content Layer - Protected from distortion */}
            <div className="relative z-10 pointer-events-none *:pointer-events-auto rounded-[inherit]">
                {children}
            </div>
        </div>
    );
}
