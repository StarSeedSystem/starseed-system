
export interface SettingItem {
    id: string;
    label: string;
    description: string;
    tab: string;
    sectionId?: string;
    keywords: string[];
}

export const SETTINGS_INDEX: SettingItem[] = [
    // Effects & Physics
    { id: "displacementScale", label: "Displacement Scale", description: "Scale of the liquid displacement effect", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["liquid", "distort", "scale"] },
    { id: "blurAmount", label: "Blur Amount", description: "Amount of blur applied to the liquid refraction", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["blur", "liquid", "softness"] },
    { id: "glassSaturation", label: "Glass Saturation", description: "Color saturation within the glass", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["color", "vivid", "glass"] },
    { id: "chromaticAberration", label: "Chromatic Aberration", description: "Color fringing effect on edges", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["rgb", "split", "fringe", "prism"] },
    { id: "elasticity", label: "Elasticity", description: "Bounciness of the liquid movement", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["physics", "bounce", "spring"] },
    { id: "cornerRadius", label: "Corner Radius", description: "Roundness of the liquid container corners", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["border", "round", "shape"] },
    { id: "backdropBlur", label: "Backdrop Blur", description: "Blur strength of the background behind the glass", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["frost", "background", "blur"] },
    { id: "refractionIndex", label: "Refraction Index", description: "Intensity of light bending (IOR)", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["ior", "bend", "light", "glass"] },
    { id: "glowIntensity", label: "Glow Intensity", description: "Strength of the inner/outer glow", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["light", "shine", "bloom"] },
    { id: "noiseOpacity", label: "Noise Opacity", description: "Texture grain visibility", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["grain", "texture", "film"] },
    { id: "scanlineOpacity", label: "Scanline Opacity", description: "Retro CRT scanline visibility", tab: "effects", sectionId: "family-wrapper-liquid-examples", keywords: ["crt", "retro", "lines"] },

    // UI Components
    { id: "buttonStyle", label: "Button Style", description: "Visual preset for buttons", tab: "components", sectionId: "family-buttons", keywords: ["btn", "ui", "preset"] },
    { id: "buttonRadius", label: "Button Radius", description: "Corner roundness for buttons", tab: "components", sectionId: "family-buttons", keywords: ["btn", "border", "round"] },
    { id: "cardPreset", label: "Card Preset", description: "Visual preset for cards", tab: "components", sectionId: "family-cards", keywords: ["container", "box", "style"] },

    // Stitch / Generative
    { id: "stitch-prompt", label: "Stitch Prompt", description: "AI generation prompt input", tab: "generative", keywords: ["ai", "generate", "text"] },
    { id: "start-generation", label: "Start Generation", description: "Trigger AI generation", tab: "generative", keywords: ["run", "make", "create"] },

    // Colors
    { id: "primary-color", label: "Primary Color", description: "Main brand color", tab: "colors", keywords: ["brand", "main", "hex"] },
    { id: "accent-color", label: "Accent Color", description: "Highlight color", tab: "colors", keywords: ["highlight", "secondary"] },

    // Typography
    { id: "fontMain", label: "Main Font", description: "Primary font family", tab: "typography", keywords: ["text", "family", "typeface"] },
    { id: "baseSize", label: "Base Size", description: "Root font size", tab: "typography", keywords: ["text", "scale", "px"] },
];
