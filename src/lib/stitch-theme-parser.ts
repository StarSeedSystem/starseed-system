import { CanvasState } from "@/components/design-canvas/DesignIntegrationCanvas";

// Mock AI response for now. In the future, this will parse actual LLM JSON output.
export const generateMockTheme = (prompt: string): Partial<CanvasState> => {
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
    } as Partial<CanvasState>;
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
