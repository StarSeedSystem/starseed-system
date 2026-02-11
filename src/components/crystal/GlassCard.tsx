import React from 'react';
import { cn } from '@/lib/utils';
import { LiquidGlassWrapper } from '@/components/ui/LiquidGlassWrapper';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    /**
     * Presets for the glass effect style.
     * - `intense`: High refraction, noticeable distortion.
     * - `subtle`: Low refraction, clean look.
     * - `organic`: Softer edges, higher blur, suited for fluid shapes.
     * @default "subtle"
     */
    variant?: 'intense' | 'subtle' | 'organic';
    /**
     * scalar 0-1 to adjust the base intensity of the chosen variant.
     * @default 1
     */
    intensity?: number;
    /**
     * If true, adds hover scale and brightness effects.
     */
    interactive?: boolean;
    /**
     * If true, adds a specular highlight gradient overlay.
     */
    specular?: boolean;
    /**
     * Overall corner radius.
     */
    cornerRadius?: number;
    /**
     * If true, optimized for light backgrounds.
     */
    overLight?: boolean;
    /**
     * If true, adds a grainy noise texture for a frosted glass look.
     */
    frost?: boolean;
}

export function GlassCard({
    children,
    className,
    variant = 'subtle',
    intensity = 1,
    interactive = false,
    specular = false,
    frost = false,
    cornerRadius = 24,
    overLight = false,
    ...props
}: GlassCardProps) {

    // Base configuration map
    const configMap = {
        intense: {
            displacement: 150,
            blur: 10,
            saturation: 1.2
        },
        organic: {
            displacement: 80,
            blur: 20,
            saturation: 1.1
        },
        subtle: {
            displacement: 30,
            blur: 5,
            saturation: 1.05
        }
    };

    const config = configMap[variant];

    // Apply intensity scaling
    const finalDisplacement = config.displacement * intensity;
    const finalBlur = config.blur * intensity;

    return (
        <div
            className={cn(
                "relative transition-all duration-300 group",
                interactive && "hover:scale-[1.02] active:scale-[0.98] cursor-pointer",
                className
            )}
            {...props}
        >
            <LiquidGlassWrapper
                displacementScale={finalDisplacement}
                blurAmount={finalBlur}
                saturation={config.saturation}
                cornerRadius={cornerRadius}
                overLight={overLight}
                className={cn(
                    "w-full h-full",
                    // Interactive glow on hover
                    interactive && "transition-shadow duration-500 hover:shadow-[0_0_40px_rgba(0,243,255,0.3)]"
                )}
            >
                {/* Specular Highlight Layer */}
                {specular && (
                    <div
                        className="absolute inset-0 pointer-events-none z-10 opacity-30 mix-blend-overlay"
                        style={{
                            background: 'linear-gradient(125deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.4) 100%)',
                            borderRadius: cornerRadius
                        }}
                    />
                )}

                {/* Frost / Noise Layer */}
                {frost && (
                    <div
                        className="absolute inset-0 pointer-events-none z-0 opacity-10 mix-blend-overlay"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                            borderRadius: cornerRadius
                        }}
                    />
                )}

                {/* Content Container */}
                <div className="relative z-20 h-full">
                    {children}
                </div>
            </LiquidGlassWrapper>
        </div>
    );
}
