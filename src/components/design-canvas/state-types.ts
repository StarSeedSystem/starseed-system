"use client";

// Define the ElementFamily type
export type ElementFamily =
    | "buttons" | "cards" | "inputs" | "dialogs" | "tooltips"
    | "badges" | "tabs" | "toggles" | "avatars" | "progress"
    | "toasts" | "navigation" | "animations"
    | "palette" | "typography" | "effects" | "geometry"
    | "iconography" | "secondary" | "widgets" | "backgrounds" | "positioning"
    | "layouts" | "liquid-examples"
    | null;

// Define the CanvasState interface
export interface CanvasState {
    palette: {
        primary: string;
        secondary: string;
        accent: string;
        background: string;
        surface: string;
        textPrimary: string;
        textSecondary: string;
        glassBorder: string;
        trinity: {
            zenith: { active: string; glow: string };
            horizonte: { active: string; panel: string };
            logica: { active: string; panel: string };
            base: { active: string; neutral: string };
        };
    };
    typography: {
        fontMain: string;
        fontHeadline: string;
        fontCode: string;
        baseSize: number;
        scaleRatio: number;
        headerWeight: number;
        bodyWeight: number;
        headerTracking: number;
        bodyTracking: number;
    };
    components: {
        buttonStyle: "default" | "glass" | "liquid" | "neon" | "brutal";
        buttonGlow: boolean;
        cardPreset: "crystal" | "liquid-action" | "holographic" | "hyper-crystal";
        inputBorderStyle: "none" | "subtle" | "solid" | "glow";
        inputFloatingLabel: boolean;
        animateHover: boolean;
        animateClick: boolean;
        microInteractions: boolean;
        transitionSpeed: number;
        tooltipStyle: "glass" | "solid" | "minimal";
        badgeStyle: "pill" | "square" | "dot";
        focusRingColor: string;
    };
    effects: {
        backdropBlur: number;
        glassSaturation: number;
        glowIntensity: number;
        noiseOpacity: number;
        refractionIndex: number;
        chromaticAberration: number;
        displacementScale: number;
        blurAmount: number;
        elasticity: number;
        scanlineOpacity: number;
        textDiffusionBlur: number;
        textDiffusionGlow: number;
        textDiffusionOpacity: number;
        liquidGlassUI: boolean;
        parallaxDepth: number;
        gradientAngle: number;
        shadowPreset: "soft" | "medium" | "dramatic";
        mode: "standard" | "polar" | "prominent" | "shader";
        overLight: boolean;
        cornerRadius: number;
        padding: string;
    };
    environment: {
        show: boolean;
        type: "orbs" | "grid" | "abstract";
        intensity: number;
    };
    geometry: {
        radiusSm: number;
        radiusMd: number;
        radiusLg: number;
        radiusXl: number;
        radiusPill: number;
        radiusButtons: number;
        radiusInputs: number;
        radiusWidgets: number;
        radiusWindows: number;
        radiusTabs: number;
        radiusBadges: number;
        radiusDropdowns: number;
        goldenRatio: number;
        dockMargin: number;
        dockMagnification: number;
        dockIconSize: number;
        windowTitleBarHeight: number;
        tabCurvature: number;
        panelBlur: number;
        spacingScale: number;
        contentMaxWidth: number;
        gridColumns: number;
        borderWidth: number;
    };
    shadows: {
        sm: string;
        md: string;
        lg: string;
        glowPrimary: string;
    };
    iconography: {
        style: "stroke" | "solid";
        strokeWidth: number;
        scale: number;
        animation: "none" | "pulse" | "bounce" | "spin";
        activeCollection: "lucide" | "custom" | "ai-generated" | "stitch-liquid" | "stitch-organic";
        navigationIcons: "default" | "minimal" | "filled";
        widgetIcons: "default" | "colorful" | "glass";
        customIcons: Array<{ name: string; svg: string }>;
    };
    positioning: {
        modalPosition: "center" | "top" | "bottom";
        popoverOffset: number;
        tooltipPlacement: "top" | "bottom" | "left" | "right";
        density: "comfortable" | "compact" | "spacious";
        zIndexLayering: "standard" | "flat" | "deep";
        gridSystem: {
            columns: number;
            gap: number;
            visible: boolean;
            gutter: number;
            maxWidth: number;
        };
        containerFlex: "fluid" | "fixed" | "elastic";
    };
    widgets: {
        dashboardTemplate: "standard" | "analyst" | "creative" | "strategic";
        bgStyle: "glass" | "solid" | "cyber" | "mesh";
        borderStyle: "none" | "thin" | "glow" | "neon";
        headerStyle: "simple" | "accented" | "underlined";
        shadows: "none" | "sm" | "md" | "lg" | "neon";
        glassOpacity: number;
        noiseTexture: boolean;
        cornerSmoothing: number;
        innerGlow: "none" | "subtle" | "strong";
        reflection: number;
        ashostGraphType: "bar" | "line" | "radar" | "dot";
        ashostColor: string;
        ashostSpeed: number;
    };
    backgrounds: {
        type: "solid" | "gradient" | "mesh" | "image" | "video";
        pattern: "none" | "grid" | "dots" | "noise";
        opacity: number;
        blur: number;
        meshColors: [string, string, string, string];
        meshSpeed: number;
        videoUrl: string;
        blendingMode: "normal" | "overlay" | "multiply" | "screen";
        noiseIntensity: number;
        patternOpacity?: number;
        patternScale?: number;
    };
    secondary: {
        scrollbars: "thin";
        selectionColor: string;
        selectionMode: "precise" | "block";
        cursor: "default" | "custom" | "glow";
        dividers: "none" | "line" | "gradient";
        customCursorSvg: string;
        mask: "none" | "hex" | "circle";
    };
    aiConfig: {
        lastPrompt: string;
        generationHistory: Array<{ id: string; prompt: string; type: "component" | "icon" | "layout" | "theme"; timestamp: number }>;
        creativityLevel: number;
        model: "gemini-pro" | "gemini-ultra";
    };
    dialogs: {
        overlayOpacity: number;
        overlayBlur: number;
        animation: "fade" | "scale" | "slide";
        closeButtonStyle: "x" | "pill" | "icon";
    };
    tabsConfig: {
        style: "underline" | "pill" | "box";
        activeColor: string;
        spacing: number;
    };
    toggles: {
        switchTrackColor: string;
        checkboxStyle: "round" | "square";
        radioSize: number;
        switchStyle: "standard" | "cyber" | "fluid";
    };
    avatars: {
        shape: "circle" | "rounded" | "square";
        sizeScale: number;
        statusDotPosition: "top-right" | "bottom-right";
    };
    progressBars: {
        height: number;
        colorScheme: "primary" | "gradient" | "rainbow";
        animated: boolean;
    };
    toasts: {
        position: "top-right" | "top-center" | "bottom-right" | "bottom-center";
        duration: number;
        style: "glass" | "solid" | "minimal" | "neon" | "cyber" | "blast";
        lastTrigger: number;
    };
    nav: {
        dockStyle: "floating" | "attached" | "minimal";
        breadcrumbSeparator: "slash" | "arrow" | "dot";
        menuItemPadding: number;
    };
    ui: {
        activeHighlight: string | null;
        settingsOpen: boolean;
        lastAnimTrigger: number;
    };
    layoutConfig: {
        windowStyle: "standard" | "cyber" | "floating";
        frameType: "minimal" | "thick" | "glass";
        tabLayout: "top" | "side" | "bottom";
        windowPadding: number;
        windowBlur: number;
        showTitleBar: boolean;
    };
    stitchCode: string;
    stitchScreenId: string;
}

export const defaultCanvasState: CanvasState = {
    palette: {
        primary: "#8B5CF6",
        secondary: "#A78BFA",
        accent: "#FBBF24",
        background: "#0F0F23",
        surface: "rgba(15, 15, 35, 0.65)",
        textPrimary: "#F8FAFC",
        textSecondary: "rgba(248, 250, 252, 0.7)",
        glassBorder: "rgba(255, 255, 255, 0.12)",
        trinity: {
            zenith: { active: "#10B981", glow: "rgba(16, 185, 129, 0.4)" },
            horizonte: { active: "#3B82F6", panel: "rgba(59, 130, 246, 0.1)" },
            logica: { active: "#F59E0B", panel: "rgba(245, 158, 11, 0.1)" },
            base: { active: "#8B5CF6", neutral: "rgba(139, 92, 246, 0.05)" },
        },
    },
    typography: {
        fontMain: "'Inter', sans-serif",
        fontHeadline: "'Outfit', sans-serif",
        fontCode: "'Fira Code', monospace",
        baseSize: 16,
        scaleRatio: 1.25,
        headerWeight: 700,
        bodyWeight: 400,
        headerTracking: -0.02,
        bodyTracking: 0,
    },
    components: {
        buttonStyle: "glass",
        buttonGlow: true,
        cardPreset: "crystal",
        inputBorderStyle: "subtle",
        inputFloatingLabel: true,
        animateHover: true,
        animateClick: true,
        microInteractions: true,
        transitionSpeed: 300,
        tooltipStyle: "glass",
        badgeStyle: "pill",
        focusRingColor: "#8B5CF6",
    },
    effects: {
        backdropBlur: 12,
        glassSaturation: 1.2,
        glowIntensity: 0.8,
        noiseOpacity: 0.05,
        refractionIndex: 1.05,
        chromaticAberration: 0.2,
        displacementScale: 0.3,
        blurAmount: 0.5,
        elasticity: 0.4,
        scanlineOpacity: 0.1,
        textDiffusionBlur: 0.4,
        textDiffusionGlow: 0.3,
        textDiffusionOpacity: 0.6,
        liquidGlassUI: true,
        parallaxDepth: 0.5,
        gradientAngle: 135,
        shadowPreset: "soft",
        mode: "standard",
        overLight: true,
        cornerRadius: 16,
        padding: "1rem",
    },
    environment: {
        show: true,
        type: "orbs",
        intensity: 0.5,
    },
    geometry: {
        radiusSm: 4,
        radiusMd: 8,
        radiusLg: 16,
        radiusXl: 24,
        radiusPill: 9999,
        radiusButtons: 12,
        radiusInputs: 8,
        radiusWidgets: 20,
        radiusWindows: 24,
        radiusTabs: 8,
        radiusBadges: 20,
        radiusDropdowns: 12,
        goldenRatio: 1.618,
        dockMargin: 20,
        dockMagnification: 1.2,
        dockIconSize: 24,
        windowTitleBarHeight: 32,
        tabCurvature: 8,
        panelBlur: 20,
        spacingScale: 1,
        contentMaxWidth: 1200,
        gridColumns: 12,
        borderWidth: 1,
    },
    shadows: {
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
        glowPrimary: "0 0 20px rgba(139, 92, 246, 0.2)",
    },
    iconography: {
        style: "stroke",
        strokeWidth: 2,
        scale: 1,
        animation: "none",
        activeCollection: "lucide",
        navigationIcons: "default",
        widgetIcons: "default",
        customIcons: [],
    },
    positioning: {
        modalPosition: "center",
        popoverOffset: 8,
        tooltipPlacement: "top",
        density: "comfortable",
        zIndexLayering: "standard",
        gridSystem: {
            columns: 12,
            gap: 24,
            visible: true,
            gutter: 16,
            maxWidth: 1440,
        },
        containerFlex: "fluid",
    },
    widgets: {
        dashboardTemplate: "standard",
        bgStyle: "glass",
        borderStyle: "thin",
        headerStyle: "simple",
        shadows: "md",
        glassOpacity: 0.05,
        noiseTexture: true,
        cornerSmoothing: 0.2,
        innerGlow: "none",
        reflection: 0.5,
        ashostGraphType: "line",
        ashostColor: "#8B5CF6",
        ashostSpeed: 1,
    },
    backgrounds: {
        type: "gradient",
        pattern: "none",
        opacity: 1,
        blur: 0,
        meshColors: ["#8B5CF6", "#3B82F6", "#EC4899", "#10B981"],
        meshSpeed: 0.5,
        videoUrl: "",
        blendingMode: "normal",
        noiseIntensity: 0.05,
    },
    secondary: {
        scrollbars: "thin",
        selectionColor: "#8B5CF6",
        selectionMode: "block",
        cursor: "default",
        dividers: "line",
        customCursorSvg: "",
        mask: "none",
    },
    aiConfig: {
        lastPrompt: "",
        generationHistory: [],
        creativityLevel: 0.7,
        model: "gemini-pro",
    },
    dialogs: {
        overlayOpacity: 0.6,
        overlayBlur: 8,
        animation: "scale",
        closeButtonStyle: "x",
    },
    tabsConfig: {
        style: "pill",
        activeColor: "#8B5CF6",
        spacing: 4,
    },
    toggles: {
        switchTrackColor: "#8B5CF6",
        checkboxStyle: "round",
        radioSize: 16,
        switchStyle: "standard",
    },
    avatars: {
        shape: "circle",
        sizeScale: 1,
        statusDotPosition: "bottom-right",
    },
    progressBars: {
        height: 6,
        colorScheme: "primary",
        animated: true,
    },
    toasts: {
        position: "bottom-right",
        duration: 4000,
        style: "glass",
        lastTrigger: 0,
    },
    nav: {
        dockStyle: "floating",
        breadcrumbSeparator: "slash",
        menuItemPadding: 8,
    },
    ui: {
        activeHighlight: null,
        settingsOpen: false,
        lastAnimTrigger: 0,
    },
    layoutConfig: {
        windowStyle: "standard",
        frameType: "glass",
        tabLayout: "top",
        windowPadding: 16,
        windowBlur: 20,
        showTitleBar: true,
    },
    stitchCode: "",
    stitchScreenId: "",
};
