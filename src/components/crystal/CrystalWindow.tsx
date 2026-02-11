import React from "react";
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";
import { CrystalConfig } from "./CrystalConfigurator";
import { cn } from "@/lib/utils";
import { Minus, Square, X } from "lucide-react";

interface CrystalWindowProps extends React.HTMLAttributes<HTMLDivElement> {
    config: CrystalConfig;
    title?: string;
    children: React.ReactNode;
}

export function CrystalWindow({
    config,
    title = "Untitled",
    children,
    className,
    ...props
}: CrystalWindowProps) {
    return (
        <LiquidGlassWrapper
            displacementScale={config.displacementScale}
            blurAmount={config.blurAmount}
            saturation={config.saturation}
            aberrationIntensity={config.aberrationIntensity}
            elasticity={config.elasticity}
            cornerRadius={config.cornerRadius}
            mode={config.mode}
            overLight={config.overLight}
            className={cn(
                "shadow-2xl transition-all duration-300",
                // We use a safe minimum rounding to ensure it looks like a window
                className
            )}
            {...props}
        >
            <div className="flex flex-col h-full bg-white/5">
                {/* Traffic Light Header */}
                <div className="h-10 px-4 flex items-center justify-between border-b border-white/5 shrink-0">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.6)] hover:bg-red-500 transition-colors flex items-center justify-center group">
                            <X className="w-2 h-2 text-black/50 opacity-0 group-hover:opacity-100" />
                        </div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[0_0_8px_rgba(234,179,8,0.6)] hover:bg-yellow-500 transition-colors flex items-center justify-center group">
                            <Minus className="w-2 h-2 text-black/50 opacity-0 group-hover:opacity-100" />
                        </div>
                        <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.6)] hover:bg-green-500 transition-colors flex items-center justify-center group">
                            <Square className="w-2 h-2 text-black/50 opacity-0 group-hover:opacity-100 fill-current" />
                        </div>
                    </div>

                    <div className="text-xs font-medium text-white/40 tracking-wide uppercase pointer-events-none select-none">
                        {title}
                    </div>

                    <div className="w-12"></div> {/* Spacer for balance */}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-auto p-0 relative">
                    {children}
                </div>
            </div>
        </LiquidGlassWrapper>
    );
}
