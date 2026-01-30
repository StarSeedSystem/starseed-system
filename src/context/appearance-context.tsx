"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useTheme } from "next-themes";

export interface CustomFont {
    name: string;
    url: string;
    family: string;
}

export interface AppearanceConfig {
    typography: {
        fontFamily: string;
        scale: number; // 0.8 to 1.2, default 1
        customFonts: CustomFont[];
    };
    layout: {
        menuPosition: "left" | "top" | "right" | "bottom";
        menuStyle: "sidebar" | "dock" | "minimal";
        menuBehavior: "sticky" | "static" | "smart";
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
        overlayOpacity: number; // 0 to 1
        overlayColor: "black" | "white";
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
        scale: 1,
        customFonts: [],
    },
    layout: {
        menuPosition: "left",
        menuStyle: "sidebar",
        menuBehavior: "sticky",
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
        overlayOpacity: 0.2, // Default light overlay
        overlayColor: "black",
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
    updateSection: <K extends keyof AppearanceConfig>(section: K, data: Partial<AppearanceConfig[K]>) => void;
    addCustomFont: (font: CustomFont) => void;
    removeCustomFont: (name: string) => void;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<AppearanceConfig>(defaultConfig);
    const [mounted, setMounted] = useState(false);

    // Deep merge helper
    const deepMerge = (target: any, source: any) => {
        const result = { ...target };
        for (const key in source) {
            // Check if source[key] is an array - if so, take it directly (don't merge arrays as objects)
            if (Array.isArray(source[key])) {
                result[key] = source[key];
            }
            // Check if it's an object (and not null)
            else if (source[key] instanceof Object && key in target && source[key] !== null) {
                result[key] = deepMerge(target[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    };

    // Load from local storage on mount
    useEffect(() => {
        const saved = localStorage.getItem("appearance-config");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Deep merge with default config to ensure no missing keys
                const merged = deepMerge(defaultConfig, parsed);

                // Specific migration: Ensure customFonts exists and is an array
                if (!Array.isArray(merged.typography.customFonts)) {
                    merged.typography.customFonts = [];
                }

                setConfig(merged);
            } catch (e) {
                console.error("Failed to parse appearance config", e);
                setConfig(defaultConfig); // Fallback to default on error
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

    const applyStyles = (currentConfig: AppearanceConfig) => {
        if (!currentConfig) return; // Safety check
        const root = document.documentElement;

        // Typography
        // Defensive destructuring with defaults
        const typography = currentConfig.typography || defaultConfig.typography;
        const fontFamily = typography.fontFamily || defaultConfig.typography.fontFamily;
        const scale = typography.scale ?? defaultConfig.typography.scale;
        const customFonts = Array.isArray(typography.customFonts) ? typography.customFonts : [];

        // Base Font Map
        const fontMap: Record<string, string> = {
            "Inter": "var(--font-inter)",
            "Satoshi": "'Satoshi', sans-serif",
            "Roboto": "var(--font-roboto)",
            "Outfit": "var(--font-outfit)",
            "Space Grotesk": "var(--font-headline)",
            "Source Code Pro": "var(--font-code)",
            "System": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        };

        // Add custom fonts to map
        customFonts.forEach(font => {
            if (font && font.name) {
                fontMap[font.name] = font.family;
            }
        });

        const fontVar = fontMap[fontFamily] || "var(--font-inter)";
        root.style.setProperty("--font-body", fontVar);

        // Inject Custom Font CSS if needed
        const customFont = customFonts.find(f => f.name === fontFamily);
        if (customFont) {
            const linkId = `custom-font-${customFont.name.replace(/\s+/g, '-')}`;
            if (!document.getElementById(linkId)) {
                const link = document.createElement('link');
                link.id = linkId;
                link.rel = 'stylesheet';
                link.href = customFont.url;
                document.head.appendChild(link);
            }
        }

        // Safe toString()
        root.style.setProperty("--font-scale", String(scale));

        // Styling
        const styling = currentConfig.styling || defaultConfig.styling;
        root.style.setProperty("--radius", `${styling.radius ?? defaultConfig.styling.radius}rem`);

        // Update Glass Blur variable
        const glassIntensity = styling.glassIntensity ?? defaultConfig.styling.glassIntensity;
        const opacity = styling.opacity ?? defaultConfig.styling.opacity;

        root.style.setProperty("--glass-blur", `${glassIntensity}px`);
        root.style.setProperty("--glass-opacity", String(opacity));

        // Background (Custom handling needed for complex types)
        const background = currentConfig.background || defaultConfig.background;
        const overlayOpacity = background.overlayOpacity ?? defaultConfig.background.overlayOpacity;
        const overlayRgb = background.overlayColor === 'white' ? '255, 255, 255' : '0, 0, 0';
        const overlay = `linear-gradient(rgba(${overlayRgb}, ${overlayOpacity}), rgba(${overlayRgb}, ${overlayOpacity}))`;

        if (background.type === 'image' && background.value) {
            document.body.style.backgroundImage = `${overlay}, url('${background.value}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundAttachment = "fixed";
        } else if (background.type === 'solid' && background.value) {
            document.body.style.background = background.value;
        } else if (background.type === 'gradient' && background.value) {
            document.body.style.background = background.value;
            document.body.style.backgroundAttachment = "fixed";
        } else {
            document.body.style.background = "";
        }

        // Apply Background Animation
        // Remove existing animation classes first
        document.body.classList.remove('animate-bg-pan', 'animate-bg-zoom', 'animate-bg-pulse', 'animate-bg-scroll');
        if (background.animation && background.animation !== 'none') {
            document.body.classList.add(`animate-bg-${background.animation}`);
        }

        // Liquid Glass UI Mode
        if (currentConfig.liquidGlass?.applyToUI) {
            document.body.classList.add('liquid-ui-enabled');
        } else {
            document.body.classList.remove('liquid-ui-enabled');
        }
    };

    const updateConfig = (updates: Partial<AppearanceConfig>) => {
        setConfig((prev) => deepMerge(prev, updates));
    };

    const updateSection = <K extends keyof AppearanceConfig>(section: K, data: Partial<AppearanceConfig[K]>) => {
        setConfig(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                ...data
            }
        }))
    }

    const addCustomFont = (font: CustomFont) => {
        setConfig(prev => ({
            ...prev,
            typography: {
                ...prev.typography,
                customFonts: [...prev.typography.customFonts.filter(f => f.name !== font.name), font]
            }
        }));
    };

    const removeCustomFont = (name: string) => {
        setConfig(prev => ({
            ...prev,
            typography: {
                ...prev.typography,
                customFonts: prev.typography.customFonts.filter(f => f.name !== name)
            }
        }));
    };

    const resetConfig = () => {
        setConfig(defaultConfig);
    };

    return (
        <AppearanceContext.Provider value={{ config, updateConfig, resetConfig, updateSection, addCustomFont, removeCustomFont }}>
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
