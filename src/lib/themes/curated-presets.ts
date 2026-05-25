/**
 * Biblioteca curada de temas StarSeed.
 *
 * Cada preset es un DeepPartial<AppearanceConfig> coordinado (tipografía,
 * colores, glass, fondo, botones, animaciones) pensado como una declaración
 * estética completa. Compatibles con el patrón existente en theme-utils.ts:
 * se aplican con `updateConfig(preset)` y opcionalmente `setTheme("dark"|"light")`.
 *
 * Filosofía: la diversidad estética es soberanía. Cualquiera puede empezar
 * desde un tema y modificarlo para hacerlo suyo, o crear desde cero y
 * guardarlo en `themeStore.savedThemes`.
 */

import type { AppearanceConfig, DeepPartial } from "@/context/appearance-context";

export type CuratedPresetMood =
  | "cyberdelico"
  | "solarpunk"
  | "minimal"
  | "brutalist"
  | "futurista"
  | "organico"
  | "luxury";

export interface CuratedPreset {
  id: string;
  name: string;
  tagline: string;
  /** Categoría visual para filtros / agrupación */
  mood: CuratedPresetMood;
  /** "dark" o "light" — sugerido para next-themes */
  baseTheme: "dark" | "light";
  /** 4 colores representativos para mostrar en el card */
  swatch: [string, string, string, string];
  /** Emoji o icono representativo (renderizado por lucide en la UI) */
  iconName: string;
  /** El config aplicable */
  config: DeepPartial<AppearanceConfig>;
}

export const curatedPresets: CuratedPreset[] = [
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "synthwave-horizon",
    name: "Synthwave Horizon",
    tagline: "Rosa magenta + cian sobre púrpura nocturno. Retrofuturismo 80s.",
    mood: "cyberdelico",
    baseTheme: "dark",
    swatch: ["#FF3CAC", "#784BA0", "#2B86C5", "#00F0FF"],
    iconName: "Zap",
    config: {
      styling: {
        radius: 0.5,
        glassIntensity: 18,
        opacity: 0.7,
        borderWidth: 1,
        glowIntensity: 0.9,
        chromaticAberration: 2,
        glassNoise: 0.08,
      },
      background: {
        type: "gradient",
        value:
          "linear-gradient(180deg, #1a0033 0%, #3a0066 50%, #ff006e 100%)",
        blur: 0,
        animation: "pulse",
        overlayOpacity: 0.05,
        overlayColor: "black",
        environment: { enabled: true, type: "abstract", intensity: 0.7 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 8 },
      typography: { fontFamily: "Space Grotesk", scale: 1.0, customFonts: [] },
      buttons: { style: "neon", radius: 4, glow: true, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 200, trinityEntry: "slide",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.5, scale: 1, animation: "pulse" },
      secondary: { scrollbars: "glow", selectionColor: "#FF3CAC55", selectionMode: "text", cursor: "glow" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "tokyo-midnight",
    name: "Tokyo Midnight",
    tagline: "Cyberpunk en Shibuya. Neones eléctricos en lluvia digital.",
    mood: "cyberdelico",
    baseTheme: "dark",
    swatch: ["#0d0221", "#ff206e", "#41ead4", "#fbff12"],
    iconName: "Sparkle",
    config: {
      styling: {
        radius: 0.25,
        glassIntensity: 24,
        opacity: 0.6,
        borderWidth: 2,
        glowIntensity: 0.85,
        noiseOpacity: 0.05,
        neonTicker: true,
      },
      background: {
        type: "gradient",
        value: "radial-gradient(ellipse at 50% 100%, #ff206e22 0%, #0d0221 60%, #000000 100%)",
        blur: 0, animation: "none",
        overlayOpacity: 0.1, overlayColor: "black",
        environment: { enabled: true, type: "grid", intensity: 0.5 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 4 },
      typography: { fontFamily: "Source Code Pro", scale: 0.95, customFonts: [] },
      buttons: { style: "neon", radius: 2, glow: true, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 120, trinityEntry: "slide",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "solid", strokeWidth: 2, scale: 1, animation: "none" },
      secondary: { scrollbars: "glow", selectionColor: "#41ead455", selectionMode: "block", cursor: "glow" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "solarpunk-aurora",
    name: "Solarpunk Aurora",
    tagline: "Verde solar + ámbar dorado. Naturaleza y tecnología en simbiosis.",
    mood: "solarpunk",
    baseTheme: "light",
    swatch: ["#fef9c3", "#fde047", "#65a30d", "#15803d"],
    iconName: "Sun",
    config: {
      styling: {
        radius: 1.25,
        glassIntensity: 10,
        opacity: 0.92,
        borderWidth: 1,
        glowIntensity: 0.2,
        frostOpacity: 0.5,
      },
      background: {
        type: "gradient",
        value: "linear-gradient(135deg, #fef9c3 0%, #ecfccb 50%, #d9f99d 100%)",
        blur: 0, animation: "none",
        overlayOpacity: 0, overlayColor: "white",
        environment: { enabled: true, type: "abstract", intensity: 0.3 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 28 },
      typography: { fontFamily: "Outfit", scale: 1.05, customFonts: [] },
      buttons: { style: "liquid", radius: 99, glow: false, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 280, trinityEntry: "elastic",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.5, scale: 1, animation: "pulse" },
      secondary: { scrollbars: "thin", selectionColor: "#65a30d33", selectionMode: "text", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "verdant-earth",
    name: "Verdant Earth",
    tagline: "Verde salvia profundo. Permacultura digital, jardín en código.",
    mood: "organico",
    baseTheme: "dark",
    swatch: ["#1a2e1a", "#3d5c3d", "#7d9b76", "#c8e0bf"],
    iconName: "Leaf",
    config: {
      styling: {
        radius: 1.5, glassIntensity: 12, opacity: 0.85,
        borderWidth: 1, glowIntensity: 0.15, fluidity: 0.5,
      },
      background: {
        type: "gradient",
        value: "radial-gradient(ellipse 100% 80% at 50% 100%, #1f3a1f 0%, #0c1810 70%, #060c08 100%)",
        blur: 0, animation: "none", overlayOpacity: 0, overlayColor: "black",
        environment: { enabled: true, type: "abstract", intensity: 0.4 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 32 },
      typography: { fontFamily: "Outfit", scale: 1.0, customFonts: [] },
      buttons: { style: "liquid", radius: 99, glow: false, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 320, trinityEntry: "fade",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.25, scale: 1, animation: "none" },
      secondary: { scrollbars: "thin", selectionColor: "#7d9b7655", selectionMode: "text", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "bauhaus-modular",
    name: "Bauhaus Modular",
    tagline: "Bauhaus 100. Primarios puros, geometría dura, función pura.",
    mood: "brutalist",
    baseTheme: "light",
    swatch: ["#ffffff", "#dc2626", "#facc15", "#1d4ed8"],
    iconName: "Square",
    config: {
      styling: {
        radius: 0, glassIntensity: 0, opacity: 1.0,
        borderWidth: 3, hardShadows: true,
        glowIntensity: 0, uppercase: true,
      },
      background: {
        type: "solid", value: "#fafaf9",
        blur: 0, animation: "none",
        overlayOpacity: 0, overlayColor: "white",
        environment: { enabled: false, type: "grid", intensity: 0 },
      },
      liquidGlass: { enabled: false, applyToUI: false, cornerRadius: 0 },
      typography: { fontFamily: "Space Grotesk", scale: 1.0, customFonts: [] },
      buttons: { style: "brutal", radius: 0, glow: false, animation: false },
      animations: {
        enabled: true, hover: false, click: true, micro: false,
        transitionDuration: 100, trinityEntry: "slide",
        pageTransition: false, microInteractions: false,
      },
      iconography: { style: "solid", strokeWidth: 2.5, scale: 1, animation: "none" },
      secondary: { scrollbars: "default", selectionColor: "#facc15", selectionMode: "block", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "monaco-noir",
    name: "Monaco Noir",
    tagline: "Negro absoluto con un solo acento ámbar. Lujo deportivo.",
    mood: "luxury",
    baseTheme: "dark",
    swatch: ["#0a0a0a", "#1a1a1a", "#ca8a04", "#fde047"],
    iconName: "Diamond",
    config: {
      styling: {
        radius: 0.5, glassIntensity: 6, opacity: 0.95,
        borderWidth: 1, glowIntensity: 0.1,
        frostOpacity: 0.2, glassNoise: 0,
      },
      background: {
        type: "solid", value: "#0a0a0a",
        blur: 0, animation: "none",
        overlayOpacity: 0, overlayColor: "black",
        environment: { enabled: false, type: "abstract", intensity: 0 },
      },
      liquidGlass: { enabled: false, applyToUI: false, cornerRadius: 12 },
      typography: { fontFamily: "Satoshi", scale: 1.0, customFonts: [] },
      buttons: { style: "default", radius: 8, glow: false, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 180, trinityEntry: "fade",
        pageTransition: true, microInteractions: false,
      },
      iconography: { style: "stroke", strokeWidth: 1.5, scale: 1, animation: "none" },
      secondary: { scrollbars: "thin", selectionColor: "#ca8a0444", selectionMode: "text", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "iridescent-pearl",
    name: "Iridescent Pearl",
    tagline: "Cristal irisado con aberración cromática. Madreperla cuántica.",
    mood: "futurista",
    baseTheme: "light",
    swatch: ["#fce7f3", "#ddd6fe", "#a5f3fc", "#fef9c3"],
    iconName: "Gem",
    config: {
      styling: {
        radius: 1.0, glassIntensity: 32, opacity: 0.4,
        borderWidth: 1, refraction: 0.7,
        chromaticAberration: 5, glowIntensity: 0.4,
        crystalPreset: "holographic",
      },
      background: {
        type: "gradient",
        value: "conic-gradient(from 180deg at 50% 50%, #fce7f3, #ddd6fe, #a5f3fc, #fef9c3, #fce7f3)",
        blur: 60, animation: "pulse",
        overlayOpacity: 0.4, overlayColor: "white",
        environment: { enabled: true, type: "orbs", intensity: 0.8 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 32, aberrationIntensity: 2 },
      typography: { fontFamily: "Outfit", scale: 1.0, customFonts: [] },
      buttons: { style: "glass", radius: 99, glow: true, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 350, trinityEntry: "elastic",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.25, scale: 1, animation: "pulse" },
      secondary: { scrollbars: "glow", selectionColor: "#a5f3fc55", selectionMode: "text", cursor: "glow" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "origami-paper",
    name: "Origami Paper",
    tagline: "Papel washi blanco con dobleces sutiles. Zen japonés moderno.",
    mood: "minimal",
    baseTheme: "light",
    swatch: ["#ffffff", "#f5f5f4", "#e7e5e4", "#78716c"],
    iconName: "Feather",
    config: {
      styling: {
        radius: 0.25, glassIntensity: 0, opacity: 1.0,
        borderWidth: 1, glowIntensity: 0, frostOpacity: 0,
      },
      background: {
        type: "solid", value: "#fafaf9",
        blur: 0, animation: "none",
        overlayOpacity: 0, overlayColor: "white",
        environment: { enabled: false, type: "abstract", intensity: 0 },
      },
      liquidGlass: { enabled: false, applyToUI: false, cornerRadius: 4 },
      typography: { fontFamily: "Inter", scale: 0.95, customFonts: [] },
      buttons: { style: "default", radius: 2, glow: false, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 200, trinityEntry: "fade",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.25, scale: 1, animation: "none" },
      secondary: { scrollbars: "hidden", selectionColor: "#78716c33", selectionMode: "text", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "aurora-borealis",
    name: "Aurora Borealis",
    tagline: "Verde polar + violeta cósmico bailando sobre cielo nocturno.",
    mood: "futurista",
    baseTheme: "dark",
    swatch: ["#0a0e27", "#0d4068", "#10b981", "#a855f7"],
    iconName: "Wand",
    config: {
      styling: {
        radius: 1.25, glassIntensity: 28, opacity: 0.55,
        borderWidth: 1, glowIntensity: 0.7,
        refraction: 0.4, glassNoise: 0.03,
      },
      background: {
        type: "webgl", value: "",
        blur: 0, animation: "none",
        overlayOpacity: 0.2, overlayColor: "black",
        webglVariant: "liquid", webglSpeed: 0.3, webglZoom: 1.2,
        liquidColors: ["#10b981", "#0d4068", "#a855f7", "#0a0e27", "#10b981", "#0a0e27"],
        environment: { enabled: true, type: "orbs", intensity: 0.6 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 20 },
      typography: { fontFamily: "Satoshi", scale: 1.0, customFonts: [] },
      buttons: { style: "liquid", radius: 16, glow: true, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 300, trinityEntry: "scale",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.5, scale: 1, animation: "pulse" },
      secondary: { scrollbars: "glow", selectionColor: "#10b98155", selectionMode: "text", cursor: "glow" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "terracotta-warm",
    name: "Terracotta Warm",
    tagline: "Adobe + arcilla + óxido. Calidez mediterránea, abrazo cálido.",
    mood: "organico",
    baseTheme: "light",
    swatch: ["#fef3e2", "#f4a261", "#e76f51", "#264653"],
    iconName: "Flame",
    config: {
      styling: {
        radius: 1.5, glassIntensity: 8, opacity: 0.9,
        borderWidth: 1, glowIntensity: 0.1, frostOpacity: 0.4,
      },
      background: {
        type: "gradient",
        value: "linear-gradient(160deg, #fef3e2 0%, #ffd4a3 50%, #fec89a 100%)",
        blur: 0, animation: "none",
        overlayOpacity: 0, overlayColor: "white",
        environment: { enabled: false, type: "abstract", intensity: 0.2 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 24 },
      typography: { fontFamily: "Outfit", scale: 1.05, customFonts: [] },
      buttons: { style: "default", radius: 24, glow: false, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 250, trinityEntry: "fade",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.5, scale: 1, animation: "none" },
      secondary: { scrollbars: "thin", selectionColor: "#e76f5133", selectionMode: "text", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "quantum-hex",
    name: "Quantum Hex",
    tagline: "Rejilla hexagonal sobre azul abismal. Topología cuántica.",
    mood: "futurista",
    baseTheme: "dark",
    swatch: ["#020617", "#0c4a6e", "#06b6d4", "#67e8f9"],
    iconName: "Hexagon",
    config: {
      styling: {
        radius: 0.5, glassIntensity: 16, opacity: 0.75,
        borderWidth: 1, glowIntensity: 0.45, refraction: 0.3,
      },
      background: {
        type: "webgl", value: "",
        blur: 0, animation: "none",
        overlayOpacity: 0.15, overlayColor: "black",
        webglVariant: "hex", webglSpeed: 0.3, webglZoom: 1.0,
        environment: { enabled: true, type: "grid", intensity: 0.5 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 12 },
      typography: { fontFamily: "Source Code Pro", scale: 0.95, customFonts: [] },
      buttons: { style: "default", radius: 4, glow: true, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: false,
        transitionDuration: 180, trinityEntry: "scale",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.5, scale: 1, animation: "none" },
      secondary: { scrollbars: "thin", selectionColor: "#06b6d433", selectionMode: "block", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
  {
    id: "lavender-mist",
    name: "Lavender Mist",
    tagline: "Niebla lavanda y rosa polvo. Suavidad ensoñadora.",
    mood: "minimal",
    baseTheme: "light",
    swatch: ["#faf5ff", "#e9d5ff", "#d8b4fe", "#9333ea"],
    iconName: "Cloud",
    config: {
      styling: {
        radius: 1.5, glassIntensity: 14, opacity: 0.85,
        borderWidth: 1, glowIntensity: 0.15, frostOpacity: 0.6,
      },
      background: {
        type: "gradient",
        value: "radial-gradient(ellipse 100% 100% at 30% 30%, #faf5ff 0%, #f3e8ff 50%, #fbcfe8 100%)",
        blur: 0, animation: "pulse",
        overlayOpacity: 0, overlayColor: "white",
        environment: { enabled: true, type: "orbs", intensity: 0.3 },
      },
      liquidGlass: { enabled: true, applyToUI: true, cornerRadius: 28 },
      typography: { fontFamily: "Outfit", scale: 1.0, customFonts: [] },
      buttons: { style: "glass", radius: 99, glow: false, animation: true },
      animations: {
        enabled: true, hover: true, click: true, micro: true,
        transitionDuration: 300, trinityEntry: "fade",
        pageTransition: true, microInteractions: true,
      },
      iconography: { style: "stroke", strokeWidth: 1.25, scale: 1, animation: "none" },
      secondary: { scrollbars: "thin", selectionColor: "#9333ea33", selectionMode: "text", cursor: "default" },
    },
  },
  /* ────────────────────────────────────────────────────────────────────── */
];

/** Filtros disponibles para la UI */
export const MOOD_LABELS: Record<CuratedPresetMood, string> = {
  cyberdelico: "Cyberdélico",
  solarpunk: "Solarpunk",
  minimal: "Minimal",
  brutalist: "Brutalist",
  futurista: "Futurista",
  organico: "Orgánico",
  luxury: "Luxury",
};

export function presetsByMood(mood: CuratedPresetMood | "all"): CuratedPreset[] {
  if (mood === "all") return curatedPresets;
  return curatedPresets.filter((p) => p.mood === mood);
}
