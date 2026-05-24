"use client";

import React, { Suspense, forwardRef, useRef, useImperativeHandle } from "react";
import Spline from "@splinetool/react-spline";
import { Application } from "@splinetool/runtime";

export interface SplineButtonProps {
    url: string;
    className?: string;
    onClick?: () => void;
    onLoad?: (splineApp: Application) => void;
    fallbackColor?: string;
}

export const SplineButton = forwardRef<Application | null, SplineButtonProps>(({
    url,
    className = "",
    onClick,
    onLoad,
    fallbackColor = "rgba(0,127,255,0.2)"
}, ref) => {
    const splineAppRef = useRef<Application | null>(null);

    useImperativeHandle(ref, () => splineAppRef.current as Application);

    const handleLoad = (splineApp: Application) => {
        splineAppRef.current = splineApp;
        if (onLoad) {
            onLoad(splineApp);
        }
    };

    return (
        <div
            className={`relative inline-flex items-center justify-center overflow-hidden cursor-pointer ${className}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.();
                }
            }}
        >
            <Suspense fallback={<div className="absolute inset-0 rounded-full animate-pulse" style={{ backgroundColor: fallbackColor }} />}>
                <Spline
                    scene={url}
                    onLoad={handleLoad}
                    className="w-full h-full pointer-events-none" // Events managed by the container
                    style={{ pointerEvents: 'none' }}
                />
            </Suspense>
        </div>
    );
});

SplineButton.displayName = "SplineButton";
