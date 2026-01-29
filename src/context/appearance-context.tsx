"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useTheme } from "next-themes";

export interface AppearanceConfig {
    typography: {
        fontFamily: string;
        fontSizeScale: number; // 0.8 to 1.2, default 1
    };
    layout: {
        menuPosition: "left" | "top" | "right" | "bottom";
        menuStyle: "sidebar" | "dock" | "minimal";
        iconStyle: "outline" | "solid" | "thin";
    };
    styling: {
        radius: number; // 0 to 1.5rem
        glassIntensity: number; // blur amount in px
        opacity: number; // 0 to 1
    };
    background: {
        type: "solid" | "gradient" | "image" | "video";
        value: string; // url or css value
        blur: number; // background blur
        animation: "none" | "pan" | "zoom" | "pulse" | "scroll";
    };
    liquidGlass: {
        enabled: boolean;
        applyToUI: boolean; // New: Apply similar effect to buttons/cards
        distortWidth: number;
        distortHeight: number;
        distortRadius: number;
        smoothStepEdge: number;
        distanceOffset: number;
    };
    themeStore: {
        activeTemplateId?: string;
    };
}

const defaultConfig: AppearanceConfig = {
    typography: {
        fontFamily: "Inter",
        fontSizeScale: 1,
    },
    layout: {
        menuPosition: "left",
        menuStyle: "sidebar",
        iconStyle: "outline",
    },
    styling: {
        radius: 0.5,
        glassIntensity: 10,
        opacity: 0.8,
    },
    background: {
        type: "solid",
        value: "",
        blur: 0,
        animation: "none",
    },
    liquidGlass: {
        enabled: true,
        applyToUI: false,
        distortWidth: 0.3,
        distortHeight: 0.2,
        distortRadius: 0.6,
        smoothStepEdge: 0.8,
        distanceOffset: 0.15,
    },
    themeStore: {},
};

interface AppearanceContextType {
    config: AppearanceConfig;
    updateConfig: (updates: Partial<AppearanceConfig>) => void;
    resetConfig: () => void;
    updateSection: <K extends keyof AppearanceConfig>(section: K, updates: Partial<AppearanceConfig[K]>) => void;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<AppearanceConfig>(defaultConfig);
    const [mounted, setMounted] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        const saved = localStorage.getItem("appearance-config");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setConfig({ ...defaultConfig, ...parsed });
            } catch (e) {
                console.error("Failed to parse appearance config", e);
            }
        }
        setMounted(true);
    }, []);

    // Save to local storage on change
    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem("appearance-config", JSON.stringify(config));
        applyStyles(config);
    }, [config, mounted]);

    const applyStyles = (cfg: AppearanceConfig) => {
        const root = document.documentElement;

        // Typography
        const fontMap: Record<string, string> = {
            "Inter": "var(--font-inter)",
            "Roboto": "var(--font-roboto)",
            "Outfit": "var(--font-outfit)",
            "Space Grotesk": "var(--font-headline)",
            "Source Code Pro": "var(--font-code)",
            "System": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        };

        if (cfg.typography.fontFamily) {
            const fontVar = fontMap[cfg.typography.fontFamily] || cfg.typography.fontFamily;
            // We set the variable on the body/root. Since layout.tsx sets it on body style, we can override it on root or body.
            // Setting on :root usually wins if variables are used.
            root.style.setProperty("--font-body", fontVar);
        }

        root.style.setProperty("--font-scale", cfg.typography.fontSizeScale.toString());

        // Styling
        root.style.setProperty("--radius", `${cfg.styling.radius}rem`);

        // Update Glass Blur variable
        // We need to ensure globals.css uses this variable for glass effect
        root.style.setProperty("--glass-blur", `${cfg.styling.glassIntensity}px`);
        root.style.setProperty("--glass-opacity", cfg.styling.opacity.toString());

        // Background (Custom handling needed for complex types)
        if (cfg.background.type === 'image' && cfg.background.value) {
            document.body.style.backgroundImage = `url('${cfg.background.value}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundAttachment = "fixed";
        } else if (cfg.background.type === 'solid' && cfg.background.value) {
            document.body.style.background = cfg.background.value;
        } else if (cfg.background.type === 'gradient' && cfg.background.value) {
            document.body.style.background = cfg.background.value;
            document.body.style.backgroundAttachment = "fixed";
        } else {
            document.body.style.background = "";
        }

        // Apply Background Animation
        // Remove existing animation classes first
        document.body.classList.remove('animate-bg-pan', 'animate-bg-zoom', 'animate-bg-pulse', 'animate-bg-scroll');
        if (cfg.background.animation && cfg.background.animation !== 'none') {
            document.body.classList.add(`animate-bg-${cfg.background.animation}`);
        }

        // Liquid Glass UI Mode
        if (cfg.liquidGlass?.applyToUI) {
            document.body.classList.add('liquid-ui-enabled');
        } else {
            document.body.classList.remove('liquid-ui-enabled');
        }
    };
    const updateConfig = (updates: Partial<AppearanceConfig>) => {
        setConfig((prev) => ({ ...prev, ...updates }));
    };

    const updateSection = <K extends keyof AppearanceConfig>(section: K, updates: Partial<AppearanceConfig[K]>) => {
        setConfig(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                ...updates
            }
        }))
    }

    const resetConfig = () => {
        setConfig(defaultConfig);
    };

    return (
        <AppearanceContext.Provider value={{ config, updateConfig, resetConfig, updateSection }}>
            {children}
        </AppearanceContext.Provider>
    );
}

export const useAppearance = () => {
    const context = useContext(AppearanceContext);
    if (context === undefined) {
        throw new Error("useAppearance must be used within an AppearanceProvider");
    }
    return context;
};
