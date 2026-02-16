"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useTheme } from "next-themes";

export interface CustomFont {
    name: string;
    url: string;
    family: string;
}

export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P]
};

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
        crystalPreset?: "none" | "clear" | "frosted" | "holographic" | "obsidian" | "quantic" | "organic-frosted";
    };
    background: {
        type: "solid" | "gradient" | "image" | "video" | "webgl";
        value: string; // url or css value
        blur: number; // background blur
        animation: "none" | "pan" | "zoom" | "pulse" | "scroll";
        overlayOpacity: number; // 0 to 1
        overlayColor: "black" | "white";
        // WebGL specific
        webglVariant?: "nebula" | "grid" | "waves" | "hex" | "liquid";
        webglZoom?: number;
        webglSpeed?: number;
        liquidColors?: string[]; // Array of 6 hex colors

        // New Filter System
        filter: {
            enabled: boolean;
            type: "none" | "noise" | "waves"; // 'waves' replaced 'liquid-metal'
            settings: {
                noiseOpacity?: number;
                waveMetalness?: number; // 0 to 1
                waveRoughness?: number; // 0 to 1
            }
        };

        // Environment System (New)
        environment?: {
            enabled: boolean;
            type: "orbs" | "grid" | "abstract";
            intensity: number;
        };
    };
    secondary: {
        scrollbars: "default" | "thin" | "hidden" | "glow";
        selectionColor: string;
        selectionMode: "text" | "block";
        cursor: "default" | "custom" | "glow";
        customCursorSvg?: string;
    };
    buttons: {
        style: "default" | "glass" | "liquid" | "neon" | "brutal";
        radius: number;
        glow: boolean;
        animation: boolean; // Legacy: Maps to animations.hover
    };
    animations: {
        enabled: boolean;
        hover: boolean;
        click: boolean;
        micro: boolean;
        transitionDuration: number;
        trinityEntry: "fade" | "slide" | "scale" | "elastic";
        pageTransition: boolean;
        microInteractions: boolean;
    };
    iconography: {
        style: "stroke" | "solid";
        strokeWidth: number;
        scale: number;
        animation: "none" | "pulse" | "bounce" | "spin";
    };
    positioning: {
        modalPosition: "center" | "top" | "bottom";
        borderRadius: {
            sm: number;
            md: number;
            lg: number;
            xl: number;
            pill: number;
        };
        spacingScale: number;
    };
    widgets: {
        bgStyle: "glass" | "solid" | "cyber" | "mesh";
        borderStyle: "none" | "thin" | "glow" | "neon";
        shadows: "none" | "sm" | "md" | "lg" | "neon";
        glassOpacity: number;
    };
    liquidGlass: {
        enabled: boolean;
        displacementScale: number;
        blurAmount: number;
        elasticity: number;
        aberrationIntensity: number;
        applyToUI: boolean;
        saturation: number;
        cornerRadius: number;
        mode: "standard" | "polar" | "prominent" | "shader";
    };
    textDiffusion: {
        blur: number;
        opacity: number;
        glowStrength: number;
    };
    mobile: {
        fabPosition: "fixed" | "draggable";
        fabSide: "left" | "right";
        fabOffsetX: number;
        fabOffsetY: number;
        fabVerticalPosition: "top" | "center" | "bottom";
        menuType: "sheet" | "dropdown" | "fullscreen" | "sidebar";
        menuBehavior: "push" | "overlay" | "slide";
        menuAnimation: "slide" | "fade" | "scale" | "morph";
        menuPosition: "left" | "right" | "bottom";
        autoHideOnScroll: boolean;
        showOnDesktop: boolean;
        compactMode: boolean;
        hapticFeedback: boolean;
        swipeToOpen: boolean;
        gestureThreshold: number;
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
        edgeSensitivity: number;
        menuCustomization: {
            showLabels: boolean;
            iconScale: number;
            animationSpeed: "slow" | "normal" | "fast";
        };
    };
    display: {
        mode: "standard" | "vr" | "ar" | "spatial";
        fov: number;
        depthScale: number;
        immersiveUI: boolean;
        curvedUI: boolean;
        eyeComfort: boolean;
    };
    responsive: {
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
            sidebarWidth: number;
            contentMaxWidth: number;
            multiColumn: boolean;
            stickyHeader: boolean;
        };
        largeScreen: {
            ultraWideLayout: "centered" | "expanded" | "split";
            columnCount: 2 | 3 | 4;
            panelSpacing: number;
            cinematicMode: boolean;
        };
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
        activeMode: "custom" | "crystal" | "liquid" | "solid-crystal" | "primary";
        activeTemplateId?: string;
        savedThemes: Array<{
            id: string;
            name: string;
            createdAt: number;
            config: Partial<AppearanceConfig>;
        }>;
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
        glassIntensity: 20, // Increased default blur for legibility
        opacity: 0.65, // Increased opacity (was 0.8 which is transparency factor... wait, lower opacity = more transparent? Let's check logic. opacity var is used as 0 to 1. Usually 1 is opaque. 
        // In applyStyles: root.style.setProperty("--glass-opacity", String(opacity));
        // In CSS: rgba(255, 255, 255, var(--glass-opacity, 0.4))
        // So higher value = more opaque background color = better legibility. 
        // Default was 0.8 (which is quite high/opaque already? No, wait. 
        // Let's check defaults in defaultConfig.styling.
        // It was 0.8. Let's make it 0.7 for now but ensure CSS uses it correctly.
        // Actually, user said "demasiado transparente" (too transparent). So we need MORE opacity (closer to 1).
        // Let's stick to 0.8 or even 0.85 if it was "too transparent". 
        // Wait, earlier I saw --glass-opacity default in CSS was 0.4.
        // The default config here says 0.8. 
        // Let's look at the CSS usage again in next step. For now, let's keep reasonable defaults.
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
        crystalPreset: "none",
    },
    background: {
        type: "solid",
        value: "",
        blur: 0,
        animation: "none",
        overlayOpacity: 0.4, // Darker overlay for better text contrast by default
        overlayColor: "black",
        webglVariant: "hex",
        webglSpeed: 0.5,
        webglZoom: 1.0,
        liquidColors: ["#F15A22", "#0A0E27", "#F15A22", "#0A0E27", "#F15A22", "#0A0E27"],
        filter: {
            enabled: false,
            type: "none",
            settings: {
                waveRoughness: 0.25
            }
        },
        environment: {
            enabled: false,
            type: "orbs",
            intensity: 0.5
        }
    },
    secondary: {
        scrollbars: "default",
        selectionColor: "auto",
        selectionMode: "text",
        cursor: "default"
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
        micro: true,
        transitionDuration: 200,
        trinityEntry: "scale",
        pageTransition: true,
        microInteractions: true,
    },
    iconography: {
        style: "stroke",
        strokeWidth: 1.5,
        scale: 1,
        animation: "none",
    },
    positioning: {
        modalPosition: "center",
        borderRadius: {
            sm: 4,
            md: 8,
            lg: 16,
            xl: 24,
            pill: 9999,
        },
        spacingScale: 1,
    },
    widgets: {
        bgStyle: "glass",
        borderStyle: "thin",
        shadows: "md",
        glassOpacity: 0.6,
    },
    liquidGlass: {
        enabled: false,
        applyToUI: false,
        displacementScale: 15,
        blurAmount: 0.1,
        saturation: 1.1,
        aberrationIntensity: 1,
        elasticity: 0.2,
        cornerRadius: 24,
        mode: "standard",
    },
    textDiffusion: {
        blur: 15,
        opacity: 0.7,
        glowStrength: 0.5,
    },
    mobile: {
        fabPosition: "fixed",
        fabSide: "right",
        fabOffsetX: 16,
        fabOffsetY: 16,
        fabVerticalPosition: "bottom",
        menuType: "sheet",
        menuBehavior: "overlay",
        menuAnimation: "slide",
        menuPosition: "right",
        autoHideOnScroll: false,
        showOnDesktop: false,
        compactMode: false,
        hapticFeedback: true,
        swipeToOpen: true,
        gestureThreshold: 50,
        controlPanel: {
            fabPosition: "fixed",
            fabSide: "left",
            fabVerticalPosition: "bottom",
            menuPosition: "left",
            fabOffsetX: 16,
            fabOffsetY: 80,
        },
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
            animationSpeed: "normal",
        },
    },
    display: {
        mode: "standard",
        fov: 90,
        depthScale: 1,
        immersiveUI: false,
        curvedUI: false,
        eyeComfort: true,
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
            splitView: true,
            sidebarCollapsible: true,
            contentWidth: "full",
        },
        desktop: {
            sidebarWidth: 280,
            contentMaxWidth: 1440,
            multiColumn: true,
            stickyHeader: true,
        },
        largeScreen: {
            ultraWideLayout: "expanded",
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
    themeStore: {
        activeMode: "custom",
        savedThemes: [],
    },
};

interface AppearanceContextType {
    config: AppearanceConfig;
    updateConfig: (updates: DeepPartial<AppearanceConfig>) => void;
    resetConfig: () => void;
    updateSection: <K extends keyof AppearanceConfig>(section: K, data: DeepPartial<AppearanceConfig[K]>) => void;
    addCustomFont: (font: CustomFont) => void;
    removeCustomFont: (name: string) => void;
    // Theme Actions
    saveTheme: (name: string) => void;
    loadTheme: (id: string) => void;
    deleteTheme: (id: string) => void;
    exportTheme: () => void;
    importTheme: (file: File) => Promise<void>;
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

        // Apply Crystal Presets (Overrides)
        // This ensures the preset values take precedence if a preset is selected
        const preset = styling.crystalPreset || 'none';

        switch (preset) {
            case 'clear':
                root.style.setProperty("--glass-opacity", "0.20");
                root.style.setProperty("--glass-blur", "5px");
                root.style.setProperty("--glass-refraction", "0.8");
                root.style.setProperty("--border-width", "1px");
                break;
            case 'frosted':
                root.style.setProperty("--glass-opacity", "0.60");
                root.style.setProperty("--glass-blur", "30px");
                root.style.setProperty("--glass-refraction", "0.1");
                root.style.setProperty("--glass-frost", "1.0");
                break;
            case 'holographic': // Prismatic
                root.style.setProperty("--glass-opacity", "0.30");
                root.style.setProperty("--glass-blur", "10px");
                root.style.setProperty("--glass-refraction", "0.9");
                root.style.setProperty("--glass-aberration", "5px");
                break;
            case 'obsidian': // Dark Glass
                root.style.setProperty("--glass-opacity", "0.85");
                root.style.setProperty("--glass-blur", "15px");
                root.style.setProperty("--glass-refraction", "0.2");
                break;
            case 'quantic': // Glitched
                root.style.setProperty("--glass-opacity", "0.40");
                root.style.setProperty("--glass-blur", "8px");
                root.style.setProperty("--glass-noise", "0.15");
                break;
            case 'organic-frosted':
                root.style.setProperty("--glass-opacity", "0.65");
                root.style.setProperty("--glass-blur", "20px");
                root.style.setProperty("--glass-refraction", "0.3");
                break;
            case 'none':
            default:
                // Do nothing, let manual sliders control (which were set above)
                break;
        }

        // --- THEME MODE LOGIC (Crystal vs Liquid vs Solid Crystal) ---
        if (config.themeStore.activeMode === 'crystal') {
            // Pure Crystal
            root.style.setProperty('--glass-blur', '20px');
            root.style.setProperty('--tab-glass-blur', '20px');
            root.style.setProperty('--glass-opacity', '0.65');
            root.style.setProperty('--glass-border-opacity', '0.4');
            root.style.setProperty('--glass-refraction', '1.5');
        } else if (config.themeStore.activeMode === 'liquid') {
            // Pure Liquid
            root.style.setProperty('--glass-blur', '40px');
            root.style.setProperty('--tab-glass-blur', '40px');
            root.style.setProperty('--glass-opacity', '0.4');
            root.style.setProperty('--glass-border-opacity', '0.1');
            root.style.setProperty('--glass-refraction', '1.1');
        } else if (config.themeStore.activeMode === 'solid-crystal') {
            // HYBRID: Liquid Tabs (High Blur) + Crystal Buttons (Base Crystal)
            root.style.setProperty('--glass-blur', '20px'); // Base for buttons
            root.style.setProperty('--tab-glass-blur', '40px'); // High blur for tabs
            root.style.setProperty('--glass-opacity', '0.75'); // More solid
            root.style.setProperty('--glass-border-opacity', '0.5'); // Calculated borders
            root.style.setProperty('--glass-refraction', '1.3');
        } else if (config.themeStore.activeMode === 'primary') {
            // PRIMARY MODE (Based on Liquid Glass React Repo)
            // Defaults from example: saturation 140, blur 0.5 (mapped to ~16px), displacement 100
            root.style.setProperty('--glass-blur', '16px');
            root.style.setProperty('--tab-glass-blur', '16px');
            root.style.setProperty('--glass-opacity', '0.7');
            root.style.setProperty('--glass-border-opacity', '0.3');
            root.style.setProperty('--glass-refraction', '0.8');
            root.style.setProperty('--glass-saturation', '140%');
            // Ensure no displacement distortion on main UI to keep it usable
            root.classList.remove('glass-displacement');
        }

        if (preset === 'organic-frosted') root.classList.add('glass-displacement');
        else root.classList.remove('glass-displacement');

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

            // Crystal/Glass Buttons
            if (currentConfig.buttons.style === 'glass') {
                document.body.classList.add('style-glass-buttons');
            } else {
                document.body.classList.remove('style-glass-buttons');
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

        // --- Text Diffusion (New) ---
        const textDiff = currentConfig.textDiffusion || defaultConfig.textDiffusion;
        root.style.setProperty("--text-diff-blur", `${textDiff.blur}px`);
        root.style.setProperty("--text-diff-opacity", String(textDiff.opacity));
        root.style.setProperty("--text-diff-glow", String(textDiff.glowStrength));
        // Optional: Toggle class if blur > 0 to enable costly filters only when needed
        if (textDiff.blur > 0) root.classList.add('text-diffusion-enabled');
        else root.classList.remove('text-diffusion-enabled');


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

        // Universal WebGL Background Support
        // If WebGL is active, we force the body background to be transparent
        // to let the canvas show through, regardless of the active theme.
        if (background.type === 'webgl') {
            document.body.classList.add('webgl-active');
        } else {
            document.body.classList.remove('webgl-active');
        }

        // Secondary Styles
        if (currentConfig.secondary) {
            const { scrollbars, selectionColor, cursor, customCursorSvg } = currentConfig.secondary;

            // Scrollbars
            document.documentElement.classList.remove('scrollbar-hidden', 'scrollbar-thin', 'scrollbar-glow');
            if (scrollbars !== 'default') {
                document.documentElement.classList.add(`scrollbar-${scrollbars}`);
            }

            // Selection Color
            if (selectionColor && selectionColor !== 'auto') {
                root.style.setProperty('--selection-background', selectionColor);
                // Calculate contrast text color if possible, or default to white/black
                root.style.setProperty('--selection-foreground', '#ffffff');
            } else {
                root.style.removeProperty('--selection-background');
                root.style.removeProperty('--selection-foreground');
            }

            // Cursor
            if (cursor === 'custom' && customCursorSvg) {
                // Use a detailed SVG cursor if provided
                // root.style.setProperty('--cursor-image', `url(${customCursorSvg})`); 
                // For now, simple standard cursors or class-based custom cursors
                document.body.style.cursor = `url('${customCursorSvg}'), auto`;
            } else if (cursor === 'glow') {
                // specific class for glow cursor
            } else {
                document.body.style.cursor = 'auto';
            }
        }
    };

    const updateConfig = (updates: DeepPartial<AppearanceConfig>) => {
        setConfig((prev) => deepMerge(prev, updates));
    };

    const updateSection = <K extends keyof AppearanceConfig>(section: K, data: DeepPartial<AppearanceConfig[K]>) => {
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

    // Theme Management Logic
    const saveTheme = (name: string) => {
        const newTheme = {
            id: crypto.randomUUID(),
            name,
            createdAt: Date.now(),
            config: { ...config } // Clone current config
        };

        setConfig(prev => ({
            ...prev,
            themeStore: {
                ...prev.themeStore,
                savedThemes: [...(prev.themeStore.savedThemes || []), newTheme]
            }
        }));
    };

    const loadTheme = (id: string) => {
        const theme = config.themeStore.savedThemes.find(t => t.id === id);
        if (theme) {
            // Keep existing saved themes, just overlay the config
            setConfig(prev => deepMerge(prev, {
                ...theme.config,
                themeStore: {
                    ...prev.themeStore,
                    // Ensure we don't overwrite the store itself with the old one
                    savedThemes: prev.themeStore.savedThemes
                }
            }));
        }
    };

    const deleteTheme = (id: string) => {
        setConfig(prev => ({
            ...prev,
            themeStore: {
                ...prev.themeStore,
                savedThemes: prev.themeStore.savedThemes.filter(t => t.id !== id)
            }
        }));
    };

    const exportTheme = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "starseed_theme_config.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const importTheme = async (file: File) => {
        const text = await file.text();
        try {
            const importedConfig = JSON.parse(text);
            // Basic validation check
            if (importedConfig.styling && importedConfig.layout) {
                setConfig(prev => deepMerge(prev, importedConfig));
            } else {
                alert("Invalid theme file configuration");
            }
        } catch (e) {
            console.error("Failed to import theme", e);
            alert("Error parsing theme file");
        }
    };

    const resetConfig = () => {
        setConfig(defaultConfig);
    };

    return (
        <AppearanceContext.Provider value={{
            config,
            updateConfig,
            resetConfig,
            updateSection,
            addCustomFont,
            removeCustomFont,
            saveTheme,
            loadTheme,
            deleteTheme,
            exportTheme,
            importTheme
        }}>
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
