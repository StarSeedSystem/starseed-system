
export type ThemeColors = {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
};

export const cssVariables = [
    "--background-hsl",
    "--foreground-hsl",
    "--card-hsl",
    "--card-foreground-hsl",
    "--popover-hsl",
    "--popover-foreground-hsl",
    "--primary-hsl",
    "--primary-foreground-hsl",
    "--secondary-hsl",
    "--secondary-foreground-hsl",
    "--muted-hsl",
    "--muted-foreground-hsl",
    "--accent-hsl",
    "--accent-foreground-hsl",
    "--destructive-hsl",
    "--destructive-foreground-hsl",
    "--border-hsl",
    "--input-hsl",
    "--ring-hsl",
];

export const exportTheme = () => {
    const themeData: Record<string, string> = {};
    const styles = getComputedStyle(document.documentElement);

    cssVariables.forEach((variable) => {
        themeData[variable] = styles.getPropertyValue(variable).trim();
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(themeData, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "theme-starseed.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

export const importTheme = (file: File): Promise<Record<string, string>> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                // Basic validation: Check if at least one expected variable exists
                if (json["--background-hsl"]) {
                    resolve(json);
                } else {
                    reject(new Error("Invalid theme file"));
                }
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsText(file);
    });
};

export const applyTheme = (themeData: Record<string, string>) => {
    const root = document.documentElement;
    Object.entries(themeData).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    // Persist custom theme data
    localStorage.setItem("custom-theme-data", JSON.stringify(themeData));
};

export const loadCustomTheme = () => {
    if (typeof window === "undefined") return;
    const storedTheme = localStorage.getItem("custom-theme-data");
    if (storedTheme) {
        try {
            const themeData = JSON.parse(storedTheme);
            applyTheme(themeData);
        } catch (e) {
            console.error("Failed to load custom theme", e);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  RADICAL THEME PRESETS — Each with a completely unique visual identity
// ═══════════════════════════════════════════════════════════════════════
import { AppearanceConfig, DeepPartial } from "@/context/appearance-context";

export const themePresets: Record<string, DeepPartial<AppearanceConfig>> = {

    // ─────────────────────────────────────────────────────────────────
    //  CLARO — Aurora Blanca
    //  Luminous white glass. Daylight refracted through frosted crystal.
    //  Premium, airy, high-contrast. Light mode done right.
    // ─────────────────────────────────────────────────────────────────
    light: {
        styling: {
            radius: 1.25,
            glassIntensity: 8,
            opacity: 0.95,
            borderWidth: 1,
            glowIntensity: 0.08,
            frostOpacity: 0.6,
            glassNoise: 0.04,
        },
        background: {
            type: 'gradient',
            value: 'radial-gradient(ellipse 100% 80% at 15% 0%, #f0ebff 0%, #fafafa 45%, #eff6ff 100%)',
            blur: 0,
            animation: 'none',
            overlayOpacity: 0,
            overlayColor: 'white',
            filter: { enabled: false, type: 'none', settings: {} },
            environment: { enabled: true, type: 'orbs', intensity: 0.3 },
        },
        liquidGlass: {
            enabled: true,
            applyToUI: true,
            cornerRadius: 20,
            distortWidth: 0.06,
        },
        layout: {
            menuPosition: 'left',
            menuStyle: 'minimal',
            menuBehavior: 'smart',
            iconStyle: 'outline',
        },
        typography: { fontFamily: 'Inter', scale: 1, customFonts: [] },
        buttons: { style: 'glass', radius: 99, glow: false, animation: true },
        animations: {
            enabled: true,
            hover: true,
            click: true,
            micro: true,
            transitionDuration: 180,
            trinityEntry: 'fade',
            pageTransition: true,
            microInteractions: true,
        },
        iconography: { style: 'stroke', strokeWidth: 1.5, scale: 1, animation: 'none' },
        secondary: {
            scrollbars: 'thin',
            selectionColor: '#7c3aed33',
            selectionMode: 'text',
            cursor: 'default',
        },
    },

    // ─────────────────────────────────────────────────────────────────
    //  OSCURO — Nebula Profunda
    //  Deep space immersion. Translucent glass panels over a midnight
    //  indigo-violet cosmos. Bioluminescent purple + cyan glows.
    // ─────────────────────────────────────────────────────────────────
    dark: {
        styling: {
            radius: 1.0,
            glassIntensity: 22,
            opacity: 0.72,
            borderWidth: 1,
            glowIntensity: 0.5,
            noiseOpacity: 0.03,
            glassNoise: 0.05,
        },
        background: {
            type: 'gradient',
            value: 'linear-gradient(135deg, #0a0118 0%, #0f0a2e 45%, #04091e 75%, #000810 100%)',
            blur: 0,
            animation: 'none',
            overlayOpacity: 0.08,
            overlayColor: 'black',
            filter: { enabled: false, type: 'none', settings: {} },
            environment: { enabled: true, type: 'orbs', intensity: 0.6 },
        },
        liquidGlass: {
            enabled: true,
            applyToUI: true,
            cornerRadius: 16,
            distortWidth: 0.28,
        },
        layout: {
            menuPosition: 'left',
            menuStyle: 'sidebar',
            menuBehavior: 'smart',
            iconStyle: 'outline',
        },
        typography: { fontFamily: 'Satoshi', scale: 1, customFonts: [] },
        buttons: { style: 'glass', radius: 12, glow: true, animation: true },
        animations: {
            enabled: true,
            hover: true,
            click: true,
            micro: true,
            transitionDuration: 250,
            trinityEntry: 'scale',
            pageTransition: true,
            microInteractions: true,
        },
        iconography: { style: 'stroke', strokeWidth: 1.5, scale: 1, animation: 'pulse' },
        secondary: {
            scrollbars: 'glow',
            selectionColor: '#a855f733',
            selectionMode: 'text',
            cursor: 'glow',
        },
    },

    // ─────────────────────────────────────────────────────────────────
    //  GRIS — Acero Cuántico
    //  Industrial titanium precision. Surgical clarity with a single
    //  brilliant sky-blue accent peeking through slate. Minimalist power.
    // ─────────────────────────────────────────────────────────────────
    grey: {
        styling: {
            radius: 0.5,
            glassIntensity: 2,
            opacity: 1.0,
            borderWidth: 2,
            hardShadows: true,
            glowIntensity: 0,
            uppercase: false,
        },
        background: {
            type: 'gradient',
            value: 'linear-gradient(160deg, #f4f6f9 0%, #eef0f5 50%, #f0f4f8 100%)',
            blur: 0,
            animation: 'none',
            overlayOpacity: 0,
            overlayColor: 'white',
            filter: { enabled: false, type: 'none', settings: {} },
            environment: { enabled: false, type: 'grid', intensity: 0.1 },
        },
        liquidGlass: {
            enabled: false,
            applyToUI: false,
            cornerRadius: 8,
            distortWidth: 0,
        },
        layout: {
            menuPosition: 'top',
            menuStyle: 'minimal',
            menuBehavior: 'sticky',
            iconStyle: 'solid',
        },
        typography: { fontFamily: 'Space Grotesk', scale: 1.05, customFonts: [] },
        buttons: { style: 'brutal', radius: 8, glow: false, animation: false },
        animations: {
            enabled: true,
            hover: true,
            click: true,
            micro: false,
            transitionDuration: 120,
            trinityEntry: 'slide',
            pageTransition: false,
            microInteractions: false,
        },
        iconography: { style: 'solid', strokeWidth: 2, scale: 1, animation: 'none' },
        secondary: {
            scrollbars: 'thin',
            selectionColor: '#0ea5e933',
            selectionMode: 'block',
            cursor: 'default',
        },
    },

    // ─────────────────────────────────────────────────────────────────
    //  NATURAL — Biopunk Orgánico
    //  A living membrane of deep forest geometry. Dark emerald base
    //  with phosphorescent gold highlights. Organic, breathing, alive.
    // ─────────────────────────────────────────────────────────────────
    natural: {
        styling: {
            radius: 1.5,
            glassIntensity: 14,
            opacity: 0.78,
            borderWidth: 1,
            glowIntensity: 0.35,
            fluidity: 0.7,
            surfaceTension: 0.6,
            noiseOpacity: 0.06,
        },
        background: {
            type: 'gradient',
            value: 'radial-gradient(ellipse 80% 60% at 25% 80%, #0a2210 0%, #0d1a0e 50%, #050c06 100%)',
            blur: 0,
            animation: 'none',
            overlayOpacity: 0,
            overlayColor: 'black',
            filter: { enabled: false, type: 'none', settings: {} },
            environment: { enabled: true, type: 'abstract', intensity: 0.4 },
        },
        liquidGlass: {
            enabled: true,
            applyToUI: true,
            cornerRadius: 28,
            distortWidth: 0.14,
        },
        layout: {
            menuPosition: 'left',
            menuStyle: 'dock',
            menuBehavior: 'smart',
            iconStyle: 'outline',
        },
        typography: { fontFamily: 'Outfit', scale: 1.05, customFonts: [] },
        buttons: { style: 'liquid', radius: 99, glow: true, animation: true },
        animations: {
            enabled: true,
            hover: true,
            click: true,
            micro: true,
            transitionDuration: 350,
            trinityEntry: 'elastic',
            pageTransition: true,
            microInteractions: true,
        },
        iconography: { style: 'stroke', strokeWidth: 1.25, scale: 1.05, animation: 'pulse' },
        secondary: {
            scrollbars: 'thin',
            selectionColor: '#4ade8033',
            selectionMode: 'text',
            cursor: 'default',
        },
    },

    // ─────────────────────────────────────────────────────────────────
    //  CRISTAL — Hiper-Cristal Cuántico
    //  Maximum translucency. Prismatic refractions, chromatic aberration.
    //  Like gazing through a high-dimensional gem. Sky + fuchsia prismatic.
    // ─────────────────────────────────────────────────────────────────
    glass: {
        styling: {
            radius: 1.0,
            glassIntensity: 38,
            opacity: 0.5,
            borderWidth: 1,
            refraction: 0.75,
            chromaticAberration: 4,
            glassNoise: 0.08,
            frostOpacity: 0.15,
            glowIntensity: 0.6,
            crystalPreset: 'holographic',
        },
        background: {
            type: 'gradient',
            value: 'linear-gradient(135deg, #020618 0%, #0a1628 35%, #080420 65%, #060220 100%)',
            blur: 0,
            animation: 'none',
            overlayOpacity: 0,
            overlayColor: 'black',
            filter: { enabled: false, type: 'none', settings: {} },
            environment: { enabled: true, type: 'orbs', intensity: 0.8 },
        },
        liquidGlass: {
            enabled: true,
            applyToUI: true,
            cornerRadius: 24,
            distortWidth: 0.45,
        },
        layout: {
            menuPosition: 'bottom',
            menuStyle: 'dock',
            menuBehavior: 'smart',
            iconStyle: 'outline',
        },
        typography: { fontFamily: 'Inter', scale: 0.98, customFonts: [] },
        buttons: { style: 'glass', radius: 99, glow: true, animation: true },
        animations: {
            enabled: true,
            hover: true,
            click: true,
            micro: true,
            transitionDuration: 300,
            trinityEntry: 'fade',
            pageTransition: true,
            microInteractions: true,
        },
        iconography: { style: 'stroke', strokeWidth: 1.25, scale: 1, animation: 'none' },
        secondary: {
            scrollbars: 'glow',
            selectionColor: '#38bdf833',
            selectionMode: 'text',
            cursor: 'glow',
        },
    },
};
