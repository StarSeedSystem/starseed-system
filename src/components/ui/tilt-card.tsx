"use client";

import React, { useRef, useState, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps {
    children: ReactNode;
    className?: string;
    intensity?: number; // Max tilt angle in degrees, default 10
    glareOpacity?: number; // 0 to 1, default 0.4
    scaleOnHover?: number; // Scale factor, e.g., 1.05
    disabled?: boolean;
}

export function TiltCard({
    children,
    className,
    intensity = 10,
    glareOpacity = 0.4,
    scaleOnHover = 1.02,
    disabled = false
}: TiltCardProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [rotateX, setRotateX] = useState(0);
    const [rotateY, setRotateY] = useState(0);
    const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 });
    const [isHovering, setIsHovering] = useState(false);

    if (disabled) {
        return <div className={className}>{children}</div>;
    }

    const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;

        const rect = ref.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const xPct = (mouseX / width) * 100;
        const yPct = (mouseY / height) * 100;

        // Calculate rotation:
        // Top-left should rotate X positive, Y negative?
        // Actually: Mouse Top -> rotateX positive? No, usually Mouse Top -> Element looks up.
        // Let's standard: Mouse Top (low Y) -> Rotate X (positive to look up/back)
        // Lerp from -intensity to +intensity
        const yRotation = ((mouseX / width) - 0.5) * intensity * 2; // -Intensity to +Intensity
        const xRotation = ((mouseY / height) - 0.5) * -intensity * 2; // -Intensity to +Intensity (inverted)

        setRotateX(xRotation);
        setRotateY(yRotation);
        setGlarePosition({ x: xPct, y: yPct });
    };

    const handleMouseEnter = () => {
        setIsHovering(true);
    };

    const handleMouseLeave = () => {
        setIsHovering(false);
        // Reset to flat
        setRotateX(0);
        setRotateY(0);
        setGlarePosition({ x: 50, y: 50 });
    };

    return (
        <div
            ref={ref}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
                "relative transition-transform duration-200 ease-out will-change-transform transform-style-3d",
                className
            )}
            style={{
                transform: isHovering
                    ? `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scaleOnHover})`
                    : "perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)",
            }}
        >
            {/* Content Layer */}
            <div className="relative z-10 w-full h-full">
                {children}
            </div>

            {/* Specular Glare Layer */}
            <div
                className="absolute inset-0 z-20 pointer-events-none rounded-[inherit] mix-blend-overlay"
                style={{
                    background: isHovering
                        ? `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,${glareOpacity}) 0%, transparent 80%)`
                        : "none",
                    opacity: isHovering ? 1 : 0,
                    transition: "opacity 0.2s ease",
                }}
            />

            {/* Depth Shadow Layer (Optional dynamic shadow) */}
            <div
                className="absolute inset-0 z-0 rounded-[inherit] transition-opacity duration-300"
                style={{
                    boxShadow: isHovering
                        ? `0 20px 40px -5px rgba(0,0,0,0.3)`
                        : `0 0 0 0 rgba(0,0,0,0)`,
                    opacity: isHovering ? 1 : 0,
                }}
            />
        </div>
    );
}
