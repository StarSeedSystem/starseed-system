import { CanvasState } from "@/components/design-canvas/state-types";

/**
 * Forma del "tema" que devuelve el generador simulado. NO es un `CanvasState`:
 * es un formato intermedio propio (colors/typography con nombres de alto nivel)
 * que los consumidores mapean al estado del canvas (ver StitchGeneratorTab).
 * Antes se anunciaba como `Partial<CanvasState>` mediante un cast, lo cual era
 * falso y ocultaba el mapeo real.
 */
export interface MockTheme {
    iconography: { collection: string; style: string };
    positioning: {
        density: string;
        gridSystem: { columns: number; gutter: number; visible: boolean };
        containerFlex: string;
    };
    typography: { headingFamily: string; bodyFamily: string; scale: number };
    colors: {
        primary: string;
        secondary: string;
        background: string;
        surface: string;
        accent: string;
    };
    widgets: {
        shape: string;
        borderStyle: string;
        glassOpacity: number;
        blur: number;
        noiseTexture: boolean;
        reflection: number;
    };
    backgrounds: {
        mode: string;
        meshColors: string[];
        noiseIntensity: number;
        pattern: string;
    };
    secondary: {
        cursor: string;
        scrollbars: string;
        selectionMode: string;
        selectionColor: string;
    };
}

// Mock AI response for now. In the future, this will parse actual LLM JSON output.
export const generateMockTheme = (prompt: string): MockTheme => {
    // Deterministic-ish random based on prompt length for variety
    const seed = prompt.length;

    const isDark = seed % 2 === 0;
    const isNeon = prompt.includes("neon") || prompt.includes("cyber");
    const isNatural = prompt.includes("nature") || prompt.includes("organic");

    return {
        // Iconography: Randomize between available sets
        iconography: {
            collection: isNatural ? "lucide" : "trinity-custom",
            style: isNeon ? "glow" : "standard",
        },

        // Positioning: Adjust layout density
        positioning: {
            density: isNatural ? "comfortable" : "compact",
            gridSystem: {
                columns: isNatural ? 8 : 12,
                gutter: isNatural ? 24 : 16,
                visible: false
            },
            containerFlex: "fluid"
        },

        // Typography: Select font families (mapped to keys in TypographyTab)
        typography: {
            headingFamily: isNeon ? "Orbitron" : isNatural ? "Inter" : "Geist",
            bodyFamily: "Inter",
            scale: 1.0
        },

        // Color Palette: Generate a palette based on keywords
        colors: {
            primary: isNeon ? "#00ffcc" : isNatural ? "#4ade80" : "#3b82f6",
            secondary: isNeon ? "#ff00ff" : isNatural ? "#facc15" : "#64748b",
            background: isDark ? "#0f172a" : "#f8fafc",
            surface: isDark ? "rgba(30, 41, 59, 0.7)" : "rgba(255, 255, 255, 0.8)",
            accent: isNeon ? "#f0abfc" : "#f472b6"
        },

        // Widget Style: Glass and shape
        widgets: {
            shape: isNatural ? "curved" : "sharp",
            borderStyle: isNeon ? "glow" : "hairline",
            glassOpacity: 0.6,
            blur: 16,
            noiseTexture: isNatural,
            reflection: 0.2
        },

        // Filters: Atmospheric effects
        backgrounds: {
            mode: isNeon ? "mesh" : "solid",
            meshColors: isNeon ? ["#1a103c", "#4c1d95", "#2e1065", "#000000"] : ["#f0f9ff", "#e0f2fe", "#bae6fd", "#7dd3fc"],
            noiseIntensity: 0.05,
            pattern: isNatural ? "dots" : "noise"
        },

        // Secondary: Accents
        secondary: {
            cursor: "default",
            scrollbars: "thin",
            selectionMode: "precise",
            selectionColor: isNeon ? "#ff00ff" : "#3b82f6"
        }
    };
};

export const parseAIResponse = (response: string): Partial<CanvasState> => {
    try {
        // In real implementation, we'd look for a JSON block ```json ... ```
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || [null, response];
        return JSON.parse(jsonMatch[1] || response);
    } catch (e) {
        console.error("Failed to parse AI theme response", e);
        return {};
    }
}
