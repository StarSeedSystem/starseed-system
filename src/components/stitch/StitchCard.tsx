import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { motion, useMotionValue, useSpring, useTransform, HTMLMotionProps } from "framer-motion";

interface StitchCardProps extends Omit<HTMLMotionProps<"div">, "ref"> {
    theme?: "liquid" | "organic" | "glass" | "neon" | "brutal" | "mesh" | "holographic" | "cyber";
    variant?: "default" | "hoverable";
    interactive?: {
        tilt?: boolean;
        glow?: boolean;
    };
    styleConfig?: {
        cornerRadius?: number;
        blur?: number;
        borderColor?: string;
        backgroundColor?: string;
        boxShadow?: string;
        borderWidth?: number;
        primaryColor?: string;
        secondaryColor?: string;
    };
    children?: React.ReactNode;
}

export function StitchCard({
    className,
    theme = "glass",
    variant = "default",
    interactive = { tilt: true, glow: true },
    styleConfig,
    children,
    ...props
}: StitchCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    // Mouse Tracking for Tilt & Glow
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 150, damping: 20 });
    const mouseY = useSpring(y, { stiffness: 150, damping: 20 });

    // 3D Tilt transforms
    const rotateX = useTransform(mouseY, [-50, 50], [10, -10]);
    const rotateY = useTransform(mouseX, [-50, 50], [-10, 10]);

    const primaryColor = styleConfig?.primaryColor || (theme === "liquid" ? "#22d3ee" : theme === "organic" ? "#10b981" : "#ffffff");

    // Interactive Glow Pointer - Moved to top level to comply with Rules of Hooks
    const glowBackground = useTransform(
        [mouseX, mouseY],
        (vals) => `radial-gradient(600px circle at ${((vals[0] as number) + 50)}% ${((vals[1] as number) + 50)}%, ${primaryColor}15, transparent 40%)`
    );

    // Handle mouse move
    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseXLocal = event.clientX - rect.left;
        const mouseYLocal = event.clientY - rect.top;

        // Normalize to -50 to 50
        const xPct = ((mouseXLocal / width) - 0.5) * 100;
        const yPct = ((mouseYLocal / height) - 0.5) * 100;

        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        x.set(0);
        y.set(0);
    };

    // Theme Styles Implementation
    const getThemeStyles = () => {
        switch (theme) {
            case "mesh":
                return "bg-slate-900/40 border-white/5 shadow-2xl";
            case "holographic":
                return "bg-white/5 border-white/10 shadow-xl";
            case "cyber":
                return "bg-black/60 border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]";
            case "brutal":
                return "bg-white text-black border-2 border-black shadow-[8px_8px_0_rgba(0,0,0,1)]";
            case "neon":
                return "bg-black/80 border-fuchsia-500/50 shadow-[0_0_15px_rgba(217,70,239,0.1)]";
            case "liquid":
                return "bg-cyan-950/30 border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.05)]";
            case "organic":
                return "bg-emerald-950/30 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]";
            default: // glass
                return "bg-white/5 border-white/10 backdrop-blur-xl";
        }
    };

    return (
        <motion.div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
            style={{
                perspective: 1000,
                rotateX: interactive.tilt ? rotateX : 0,
                rotateY: interactive.tilt ? rotateY : 0,
                borderRadius: styleConfig?.cornerRadius ? `${styleConfig.cornerRadius}px` : undefined,
                borderWidth: styleConfig?.borderWidth ? `${styleConfig.borderWidth}px` : undefined,
                borderColor: styleConfig?.borderColor,
                backgroundColor: styleConfig?.backgroundColor,
            }}
            className={cn(
                "relative overflow-hidden group transition-colors duration-500",
                getThemeStyles(),
                theme === "cyber" && "before:absolute before:inset-0 before:bg-[linear-gradient(transparent_0%,rgba(6,182,212,0.05)_50%,transparent_100%)] before:bg-[length:100%_4px] before:pointer-events-none",
                className
            )}
            {...props}
        >
            {/* Mesh Theme Visuals */}
            {theme === "mesh" && (
                <div className="absolute inset-0 z-0 opacity-30 pointer-events-none overflow-hidden">
                    <motion.div
                        animate={{
                            scale: [1, 1.2, 1],
                            rotate: [0, 90, 0],
                        }}
                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                        className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 blur-[100px] rounded-full"
                    />
                    <motion.div
                        animate={{
                            scale: [1.2, 1, 1.2],
                            rotate: [0, -90, 0],
                        }}
                        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                        className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 blur-[100px] rounded-full"
                    />
                </div>
            )}

            {/* Holographic Prismatic Overlay */}
            {theme === "holographic" && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none mix-blend-color-dodge"
                    style={{
                        background: `linear-gradient(${135}deg, #ff0000 0%, #00ff00 25%, #0000ff 50%, #ff00ff 75%, #ff0000 100%)`,
                        backgroundSize: '400% 400%',
                        filter: 'blur(40px) saturate(2)'
                    }}
                />
            )}

            {/* Interactive Glow Pointer */}
            {interactive.glow && isHovered && (
                <motion.div
                    className="absolute inset-0 pointer-events-none z-10"
                    style={{
                        background: glowBackground
                    }}
                />
            )}

            {/* Content Wrapper */}
            <div className="relative z-20 h-full w-full">
                {children}
            </div>

            {/* Hover Shine / Reflection */}
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700 z-30">
                <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-25deg] group-hover:left-[100%] transition-all duration-1000 ease-in-out" />
            </div>

            {/* Neon Pulse Border Hook */}
            {theme === "neon" && (
                <div className="absolute inset-0 border border-fuchsia-500/50 rounded-inherit pointer-events-none z-40 group-hover:border-fuchsia-400 group-hover:shadow-[0_0_20px_rgba(217,70,239,0.4)] transition-all duration-300" />
            )}
        </motion.div>
    );
}
