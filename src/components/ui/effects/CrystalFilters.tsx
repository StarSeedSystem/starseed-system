"use client";

import React, { useEffect, useState } from "react";

export function CrystalFilters() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <svg
            className="pointer-events-none fixed inset-0 z-0 h-0 w-0 opacity-0"
            aria-hidden="true"
        >
            <defs>
                {/* 
          Organic Frosted Displacement Filter 
          Uses procedural noise instead of static image for better performance and resolution independence.
        */}
                <filter id="frosted-displacement" x="-20%" y="-20%" width="140%" height="140%">
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.003" // Low frequency for large, organic warps
                        numOctaves="3"
                        seed="5"
                        result="noise"
                    />
                    <feGaussianBlur stdDeviation="1.5" in="noise" result="smoothNoise" />
                    <feDisplacementMap
                        in="SourceGraphic"
                        in2="smoothNoise"
                        scale="30" // How strong the distortion is
                        xChannelSelector="R"
                        yChannelSelector="G"
                    />
                </filter>

                {/* 
          Fine Grain Frost
          High frequency noise for texture
        */}
                <filter id="fine-frost">
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.8"
                        numOctaves="4"
                        stitchTiles="stitch"
                        result="noise"
                    />
                    <feColorMatrix type="saturate" values="0" in="noise" result="monoNoise" />
                    <feBlend mode="overlay" in="monoNoise" in2="SourceGraphic" result="grain" opacity="0.5" />
                </filter>
            </defs>
        </svg>
    );
}
