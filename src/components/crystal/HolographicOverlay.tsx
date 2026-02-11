import React from "react";
import { LiquidGlassWrapper } from "@/components/ui/LiquidGlassWrapper";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface HolographicOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
}

/**
 * HolographicOverlay
 * A high-intensity, refractive overlay used for critical alerts or detailed views.
 * Simulates a holographic projection field.
 */
export function HolographicOverlay({
    isOpen,
    onClose,
    title,
    children,
    className,
    ...props
}: HolographicOverlayProps) {

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop Dimmer */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Holographic Container */}
            <div className="relative w-full max-w-2xl animate-in fade-in zoom-in-95 duration-300">
                <LiquidGlassWrapper
                    displacementScale={150} // High distortion
                    blurAmount={0} // Clear glass
                    saturation={200} // High saturation
                    aberrationIntensity={5.0} // Strong prismatic edges
                    mode="polar"
                    elasticity={0.1}
                    cornerRadius={24}
                    className={cn(
                        "border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.1)]",
                        "bg-gradient-to-br from-white/10 to-white/5",
                        className
                    )}
                    {...props}
                >
                    <div className="relative z-10 p-1">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <h2 className="text-xl font-light tracking-[0.2em] text-white uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                                {title || "System Alert"}
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 text-white/90 font-light">
                            {children}
                        </div>

                        {/* Holographic Footer Scanline */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50"></div>
                    </div>
                </LiquidGlassWrapper>
            </div>
        </div>
    );
}
