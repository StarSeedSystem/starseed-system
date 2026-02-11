"use client";

import React from "react";
import { LiquidGlassWrapper } from "./LiquidGlassWrapper";
import { Button, ButtonProps } from "./button";
import { cn } from "@/lib/utils";

interface LiquidButtonProps extends ButtonProps {
    liquidConfig?: {
        displacement?: number;
        blur?: number;
        saturation?: number;
        elasticity?: number;
    };
}

export function LiquidButton({ className, children, liquidConfig, ...props }: LiquidButtonProps) {
    // Presets matching the "Log Out" button from liquid-glass-react example
    // The example had:
    // displacement: variable (high interaction)
    // blur: 0.1 (very clear)
    // saturation: 1.3 (vibrant)
    // elasticity: 0.35 (bouncy)

    // We override styles to remove default backgrounds so LiquidGlass is the primary visual
    const glassStyle: React.CSSProperties = {
        background: "transparent",
        border: "none",
        boxShadow: "none"
    };

    return (
        <div className={cn("relative inline-block liquid-button-reflection", className)}>
            <LiquidGlassWrapper
                // High displacement for that "blob" feel, specific blur for clarity
                displacementScale={liquidConfig?.displacement ?? 64}
                blurAmount={liquidConfig?.blur ?? 0.1}
                saturation={liquidConfig?.saturation ?? 1.3} // Explicit saturation for vibrancy
                elasticity={liquidConfig?.elasticity ?? 0.35}
                forceActive={true}
                className="rounded-full overflow-hidden" // Pill shape like repo
            >
                {/* Background glow for 3D effect */}
                <div className="absolute inset-0 bg-white/5 opacity-50 z-0 pointer-events-none mix-blend-overlay" />

                <Button
                    {...props}
                    className={cn(
                        "relative z-10 bg-transparent hover:bg-transparent shadow-none border-0 text-white font-semibold tracking-wide backdrop-blur-none",
                        className
                    )}
                    style={glassStyle}
                >
                    {children}
                </Button>
            </LiquidGlassWrapper>
        </div>
    );
}
