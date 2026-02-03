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
        // Advanced / Theme Specific
        borderWidth: number; // 0 to 4px
        refraction: number; // 0 to 1 (Crystal)
        chromaticAberration: number; // 0 to 10px (Crystal)
        noiseOpacity: number; // 0 to 1 (Crystal)
        glowIntensity: number; // 0 to 1 (Neon)
        hardShadows: boolean; // (Brutalist)
        uppercase: boolean; // (Brutalist)
        neonTicker: boolean; // (Neon)
        fluidity: number; // (Liquid)
        surfaceTension: number; // (Liquid)
        frostOpacity: number; // (Glass)
        glassNoise: number; // (Glass)
    };
    background: {
        type: "solid" | "gradient" | "image" | "video" | "webgl";
        value: string; // url or css value
        blur: number; // background blur
        animation: "none" | "pan" | "zoom" | "pulse" | "scroll";
        overlayOpacity: number; // 0 to 1
        overlayColor: "black" | "white";
        // WebGL specific
        webglVariant?: "nebula" | "grid" | "waves" | "hex";
        webglSpeed?: number;
        webglZoom?: number;
    };
    buttons: {
        style: "default" | "glass" | "liquid" | "neon" | "brutal";
        radius: number;
        glow: boolean;
        animation: boolean; // Legacy: Maps to animations.hover
    };
    animations: {
        enabled: boolean; // Global toggle
        hover: boolean; // Scale/Lift on hover
        click: boolean; // Ripple/Press effect
        trinityEntry: "fade" | "slide" | "scale" | "elastic";
        pageTransition: boolean;
        microInteractions: boolean; // Smooth icon movements etc
    };
    liquidGlass: {
        enabled: boolean;
        applyToUI: boolean; // New: Apply similar effect to buttons/cards
        distortWidth: number;
        distortHeight: number;
        distortRadius: number;
        smoothStepEdge: number;
        distanceOffset: number;
    },
    mobile: {
        // FAB (Floating Action Button) Settings
        fabPosition: "fixed" | "draggable";
        fabSide: "left" | "right";
        fabOffsetX: number;
        fabOffsetY: number;
        fabVerticalPosition: "top" | "center" | "bottom";
        // Menu Behavior
        menuType: "sheet" | "dropdown" | "fullscreen" | "sidebar";
        menuBehavior: "push" | "overlay" | "slide";
        menuAnimation: "slide" | "fade" | "scale" | "morph";
        menuPosition: "left" | "right" | "bottom";
        // Per-Screen Adjustments
        autoHideOnScroll: boolean;
        showOnDesktop: boolean;
        compactMode: boolean;
        hapticFeedback: boolean;
        swipeToOpen: boolean;
        gestureThreshold: number; // 20-100px

        // Control Panel Specific Settings
        controlPanel: {
            fabPosition: "fixed" | "draggable";
            fabSide: "left" | "right";
            fabVerticalPosition: "top" | "center" | "bottom";
            menuPosition: "left" | "right" | "bottom";
            fabOffsetX: number;
            fabOffsetY: number;
        };
    };
    trinity: {
        mode: "floating" | "docked";
        style: "glass" | "solid" | "minimal";
        isExpanded: boolean;
        dockBehavior: "always-visible" | "auto-hide" | "anchor-only";
        edgeSensitivity: number; // 0-100
        menuCustomization: {
            showLabels: boolean;
            iconScale: number;
            animationSpeed: "slow" | "normal" | "fast";
        };
    };
    display: {
        mode: "standard" | "vr" | "ar" | "spatial";
        fov: number; // Field of View (60-180)
        depthScale: number; // For 3D elements (0.5-2)
        immersiveUI: boolean;
        curvedUI: boolean; // Curved panels for VR
        eyeComfort: boolean; // Reduce eye strain
    };
    responsive: {
        // Device-specific layouts
        smartphone: {
            orientation: "auto" | "portrait" | "landscape";
            contentDensity: "compact" | "comfortable" | "spacious";
            bottomNavigation: boolean;
            gestureNavigation: boolean;
            pullToRefresh: boolean;
        };
        tablet: {
            orientation: "auto" | "portrait" | "landscape";
            splitView: boolean;
            sidebarCollapsible: boolean;
            contentWidth: "full" | "centered" | "narrow";
        };
        desktop: {
            sidebarWidth: number; // 200-400px
            contentMaxWidth: number; // 1200-1920px
            multiColumn: boolean;
            stickyHeader: boolean;
        };
        largeScreen: {
            ultraWideLayout: "centered" | "expanded" | "split";
            columnCount: 2 | 3 | 4;
            panelSpacing: number; // 16-48px
            cinematicMode: boolean;
        };
        // Global responsive options
        breakpoints: {
            sm: number;
            md: number;
            lg: number;
            xl: number;
            xxl: number;
        };
        adaptiveUI: boolean;
        reducedMotion: boolean;
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
        borderWidth: 1,
        refraction: 0,
        chromaticAberration: 0,
        noiseOpacity: 0,
        glowIntensity: 0,
        hardShadows: false,
        uppercase: false,
        neonTicker: false,
        fluidity: 50,
        surfaceTension: 50,
        frostOpacity: 0.5,
        glassNoise: 0.05,
    },
    background: {
        type: "solid",
        value: "",
        blur: 0,
        animation: "none",
        overlayOpacity: 0.2, // Default light overlay
        overlayColor: "black",
        webglVariant: "hex",
        webglSpeed: 0.5,
        webglZoom: 1.0,
    },
    buttons: {
        style: "default",
        radius: 0.5,
        glow: false,
        animation: true,
    },
    animations: {
        enabled: true,
        hover: true,
        click: true,
        trinityEntry: "scale",
        pageTransition: true,
        microInteractions: true,
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
    mobile: {
        // FAB Settings
        fabPosition: "fixed",
        fabSide: "left",
        fabOffsetX: 16,
        fabOffsetY: 16,
        fabVerticalPosition: "bottom",
        // Menu Behavior
        menuType: "sheet",
        menuBehavior: "overlay",
        menuAnimation: "slide",
        menuPosition: "left",
        // Per-Screen Adjustments
        autoHideOnScroll: false,
        showOnDesktop: false,
        compactMode: false,
        hapticFeedback: true,
        swipeToOpen: true,
        gestureThreshold: 50,

        // Control Panel Defaults
        controlPanel: {
            fabPosition: "fixed",
            fabSide: "right", // Default right to avoid collision with nav (left)
            fabVerticalPosition: "bottom",
            menuPosition: "right",
            fabOffsetX: 16,
            fabOffsetY: 80, // Slightly higher to avoid collision if both are bottom
        }
    },
    trinity: {
        mode: "floating",
        style: "glass",
        isExpanded: true,
        dockBehavior: "anchor-only",
        edgeSensitivity: 20,
        menuCustomization: {
            showLabels: true,
            iconScale: 1,
            animationSpeed: "normal"
        }
    },
    display: {
        mode: "standard",
        fov: 110,
        depthScale: 1,
        immersiveUI: false,
        curvedUI: false,
        eyeComfort: false,
    },
    responsive: {
        smartphone: {
            orientation: "auto",
            contentDensity: "comfortable",
            bottomNavigation: true,
            gestureNavigation: true,
            pullToRefresh: true,
        },
        tablet: {
            orientation: "auto",
            splitView: false,
            sidebarCollapsible: true,
            contentWidth: "centered",
        },
        desktop: {
            sidebarWidth: 280,
            contentMaxWidth: 1400,
            multiColumn: true,
            stickyHeader: true,
        },
        largeScreen: {
            ultraWideLayout: "centered",
            columnCount: 3,
            panelSpacing: 24,
            cinematicMode: false,
        },
        breakpoints: {
            sm: 640,
            md: 768,
            lg: 1024,
            xl: 1280,
            xxl: 1536,
        },
        adaptiveUI: true,
        reducedMotion: false,
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

        // Advanced Styling Vars
        root.style.setProperty("--border-width", `${styling.borderWidth ?? 1}px`);
        root.style.setProperty("--glass-refraction", String(styling.refraction ?? 0));
        root.style.setProperty("--glass-aberration", `${styling.chromaticAberration ?? 0}px`);
        root.style.setProperty("--glass-noise", String(styling.noiseOpacity ?? 0));
        root.style.setProperty("--neon-glow", String(styling.glowIntensity ?? 0));

        if (styling.hardShadows) root.classList.add('theme-hard-shadows');
        else root.classList.remove('theme-hard-shadows');

        if (styling.uppercase) root.classList.add('theme-uppercase');
        else root.classList.remove('theme-uppercase');

        // Theme Specific Variables
        root.style.setProperty("--neon-ticker", styling.neonTicker ? "1" : "0");
        root.style.setProperty("--liquid-fluidity", `${styling.fluidity ?? 50}s`); // Duration inverse? Or raw value
        root.style.setProperty("--liquid-tension", String(styling.surfaceTension ?? 50));
        root.style.setProperty("--glass-frost", String(styling.frostOpacity ?? 0.5));
        root.style.setProperty("--glass-noise-amt", String(styling.glassNoise ?? 0.05));

        if (styling.neonTicker) document.body.classList.add('neon-flicker-enabled');
        else document.body.classList.remove('neon-flicker-enabled');

        if (currentConfig.buttons) {
            root.style.setProperty("--radius", `${currentConfig.buttons.radius}rem`);

            if (currentConfig.buttons.glow) {
                document.body.classList.add('buttons-glow-enabled');
            } else {
                document.body.classList.remove('buttons-glow-enabled');
            }

            // Legacy button animation + Global Hover
            const anims = currentConfig.animations || defaultConfig.animations;

            // Toggle global animation class
            if (anims.enabled) document.body.classList.remove('animations-disabled');
            else document.body.classList.add('animations-disabled');

            // Button/Hover Scale
            if (anims.hover || currentConfig.buttons.animation) {
                document.body.classList.add('buttons-animation-enabled');
            } else {
                document.body.classList.remove('buttons-animation-enabled');
            }

            // Click Effects
            if (anims.click) document.body.classList.add('click-effects-enabled');
            else document.body.classList.remove('click-effects-enabled');

            // Trinity Animation Type
            root.style.setProperty("--trinity-entry", anims.trinityEntry);
        }

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
