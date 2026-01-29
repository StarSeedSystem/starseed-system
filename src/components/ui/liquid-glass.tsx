"use client";

import { useAppearance } from "@/context/appearance-context";
import { useEffect } from "react";
import React from "react";

// This component now manages Global Glass CSS Variables
// The distortion/animation logic has been removed for a premium static feel.

interface LiquidGlassProps {
    enabled?: boolean;
}

export const LiquidGlass = ({
    enabled: propEnabled,
}: LiquidGlassProps) => {
    const { config } = useAppearance();
    const { liquidGlass } = config;
    const isEnabled = propEnabled ?? liquidGlass?.enabled ?? true;

    useEffect(() => {
        if (!isEnabled) {
            document.documentElement.style.removeProperty('--glass-blur');
            document.documentElement.style.removeProperty('--glass-opacity');
            document.documentElement.style.removeProperty('--glass-saturation');
            return;
        }

        // Map "Distortion" settings to "Glass Quality" settings as a migration/fallback
        // Ideally we update the context types, but for now we re-purpose the values or set defaults.

        // Default Premium Apple-like Glass Settings
        const blur = "20px";
        const opacity = "0.6"; // Light source opacity
        const saturation = "180%";

        // If we want to allow user config later, we can read from liquidGlass.distortRadius etc.
        // For now, hardcode the "perfect" settings as requested by the user.

        document.documentElement.style.setProperty('--glass-blur', blur);
        document.documentElement.style.setProperty('--glass-opacity', opacity);
        document.documentElement.style.setProperty('--glass-saturation', saturation);

    }, [isEnabled, liquidGlass]);

    if (!isEnabled) return null;

    // No rendering of canvas/svg anymore
    return null;
};
