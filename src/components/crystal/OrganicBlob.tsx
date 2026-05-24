import React from 'react';
import { cn } from '@/lib/utils';
import { GlassCard } from './GlassCard';

interface OrganicBlobProps {
    children?: React.ReactNode;
    className?: string;
    /**
     * Base size (width/height) in pixels or rem.
     * @default "300px"
     */
    size?: string | number;
    /**
     * Animation speed in seconds for the blob morphing. 0 to disable.
     * @default 20
     */
    animate?: number;
    /**
     * Primary accent color for the inner glow.
     * @default "#00f3ff"
     */
    accentColor?: string;
}

export function OrganicBlob({
    children,
    className,
    size = "300px",
    animate = 20,
    accentColor = "#00f3ff"
}: OrganicBlobProps) {
    return (
        <div
            className={cn("relative flex items-center justify-center", className)}
            style={{ width: size, height: size }}
        >
            {/* Animating Background Blob Layer */}
            <div
                className={cn(
                    "absolute inset-0 bg-gradient-to-br from-white/10 to-transparent",
                    animate > 0 && "animate-organic-morph"
                )}
                style={{
                    borderRadius: "60% 40% 30% 70% / 60% 30% 70% 40%",
                    animationDuration: `${animate}s`,
                    boxShadow: `inset 0 0 50px ${accentColor}20`
                }}
            />

            {/* Glass Adapter - Using 'organic' variant */}
            <GlassCard
                variant="organic"
                intensity={1.2}
                specular
                interactive
                cornerRadius={9999} // High radius for pill/circle approximation
                className={cn(
                    "w-[90%] h-[90%]",
                    animate > 0 && "animate-organic-morph-reverse"
                )}
                style={{
                    animationDuration: `${animate * 1.5}s`
                }}
            >
                <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                    {children}
                </div>
            </GlassCard>

            {/* Inner Glow center */}
            <div
                className="absolute inset-0 -z-10 blur-3xl opacity-30 pointer-events-none"
                style={{ background: `radial-gradient(circle at center, ${accentColor}, transparent 70%)` }}
            />
        </div>
    );
}
