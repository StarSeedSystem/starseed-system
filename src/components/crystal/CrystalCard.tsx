import React from "react";
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";
import { cn } from "@/lib/utils";

interface CrystalCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    active?: boolean; // If true, might pulse or glow
}

/**
 * CrystalCard
 * A static container with high refractive index and frosted finish.
 * Used for info panels and static widgets.
 */
export function CrystalCard({
    children,
    className,
    active = false,
    ...props
}: CrystalCardProps) {
    return (
        <LiquidGlassWrapper
            displacementScale={100}
            blurAmount={0.5}
            saturation={140}
            aberrationIntensity={2.0}
            elasticity={0.05} // Minimal elasticity for subtle touch
            cornerRadius={32}
            className={cn(
                "bg-white/5 border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)]",
                active && "shadow-[0_0_30px_rgba(0,128,255,0.3)] border-white/20",
                "rounded-[32px]",
                className
            )}
            {...props}
        >
            <div className="relative z-10 p-6 h-full">
                {children}
            </div>
        </LiquidGlassWrapper>
    );
}
