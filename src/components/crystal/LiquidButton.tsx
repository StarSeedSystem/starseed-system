import React from "react";
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";
import { cn } from "@/lib/utils";

interface LiquidButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    variant?: "primary" | "secondary" | "danger" | "ghost";
}

/**
 * LiquidButton
 * An interactive element that behaves like a fluid bubble.
 * Warp towards the cursor and has a high elasticity.
 */
export function LiquidButton({
    children,
    className,
    variant = "primary",
    onClick,
    ...props
}: LiquidButtonProps) {

    // Define variant styles mainly for the inner content/glow
    const variantStyles = {
        primary: "bg-electric-azure/20 text-electric-azure shadow-[0_0_20px_rgba(0,127,255,0.4)]",
        secondary: "bg-emerald-green/20 text-emerald-green shadow-[0_0_20px_rgba(16,185,129,0.4)]",
        danger: "bg-red-500/20 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]",
        ghost: "bg-white/5 text-white/80 hover:bg-white/10"
    };

    return (
        <LiquidGlassWrapper
            displacementScale={64}
            blurAmount={0.1}
            saturation={130}
            aberrationIntensity={2.0}
            elasticity={0.35} // High elasticity for "jiggle"
            cornerRadius={100}
            onClick={onClick}
            className={cn(
                "rounded-full cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95",
                "flex items-center justify-center", // Centering
                className
            )}
        >
            <button
                className={cn(
                    "px-8 py-3 rounded-full font-bold tracking-wider uppercase text-sm w-full h-full",
                    variantStyles[variant],
                    "backdrop-blur-sm border border-white/10"
                )}
                {...props}
            >
                {children}
            </button>
        </LiquidGlassWrapper>
    );
}
