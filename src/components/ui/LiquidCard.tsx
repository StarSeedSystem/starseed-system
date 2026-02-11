"use client";

import React from "react";
import { LiquidGlassWrapper } from "./LiquidGlassWrapper";
import { cn } from "@/lib/utils";

interface LiquidCardProps extends React.HTMLAttributes<HTMLDivElement> {
    liquidConfig?: {
        displacement?: number;
        blur?: number;
        saturation?: number;
    };
}

export function LiquidCard({ className, children, liquidConfig, ...props }: LiquidCardProps) {
    // Presets matching "User Info" card from repo
    // displacement: 100
    // blur: 0.5
    // saturation: 1.4

    return (
        <LiquidGlassWrapper
            displacementScale={liquidConfig?.displacement ?? 100}
            blurAmount={liquidConfig?.blur ?? 0.5}
            // saturation=1.4 needs to be supported in wrapper
            forceActive={true}
            className={cn("rounded-3xl overflow-hidden block", className)}
        >
            <div
                {...props}
                className={cn(
                    "relative z-10 p-6 bg-white/5 border border-white/20 text-white backdrop-blur-none",
                    "transition-transform duration-500 ease-out hover:scale-[1.02]",
                    className
                )}
            >
                {children}
            </div>
        </LiquidGlassWrapper>
    );
}
