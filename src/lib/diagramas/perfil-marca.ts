import type { ThemeTokens } from "@/lib/design/theme-engine";
import { hslTripletToHex } from "@/components/estudio/color-utils";

// Función pura: convierte ThemeTokens a tokens para Diagram Design
export function perfilDesdeTema(
  tokens: ThemeTokens,
  modo: "light" | "dark",
  paletaFondo?: string
): DiagramDesignTokens {
  // Extraer valores HSL de las variables CSS
  // Usamos background-hsl para el color de fondo (paper)
  // Usamos foreground-hsl para el color de texto (ink)
  // Usamos primary-hsl para el color de acento (accent)
  const backgroundHsl = tokens.vars["background-hsl"] || "0 0% 100%";
  const foregroundHsl = tokens.vars["foreground-hsl"] || "0 0% 0%";
  const primaryHsl = tokens.vars["primary-hsl"] || "0 0% 50%";
  
  // Convertir a hex para Diagram Design
  const paper = hslTripletToHex(backgroundHsl);
  const ink = hslTripletToHex(foregroundHsl);
  const accent = hslTripletToHex(primaryHsl);
  
  // Tipografía fija basada en el diseño de StarSeed OS
  // Estos valores coinciden con la guía de estilo de Diagram Design
  const tipografias = {
    title: "Instrument Serif",
    nodeName: "Geist",
    sublabel: "Geist Mono",
    eyebrow: "Geist Mono",
    arrowLabel: "Geist Mono",
    callout: "Instrument Serif italic"
  };
  
  // Trazos fijos basados en el sistema de 4px grid del OS
  // Estos valores coinciden con la guía de estilo de Diagram Design
  const trazos = {
    strokeThin: 0.8,
    strokeDefault: 1,
    strokeStrong: 1.2,
    radiusSm: 4,
    radiusMd: 6,
    radiusLg: 8,
    grid: 4
  };
  
  return {
    paper,
    ink,
    accent,
    tipografias,
    trazos
  };
}

// Tipo para los tokens que espera Diagram Design
export interface DiagramDesignTokens {
  paper: string;      // color de fondo (hex)
  ink: string;        // color de texto (hex)
  accent: string;     // color de acento (hex)
  tipografias: {
    title: string;
    nodeName: string;
    sublabel: string;
    eyebrow: string;
    arrowLabel: string;
    callout: string;
  };
  trazos: {
    strokeThin: number;
    strokeDefault: number;
    strokeStrong: number;
    radiusSm: number;
    radiusMd: number;
    radiusLg: number;
    grid: number;
  };
}

// Función pura: crea el bloque de perfil en formato de cabecera activa
// Siguiendo el formato descrito en references/profiles.md
export function bloquePerfil(perfil: DiagramDesignTokens): string {
  return (
    "<!-- diagram-design-profile\n" +
    "name: Perfil desde tema\n" +
    "slug: perfil-dinamico\n" +
    "source-url: none\n" +
    "created: 2026-10-18\n" +
    "updated: 2026-10-18\n" +
    "notes: Perfil generado automáticamente desde tokens de tema\n" +
    "-->\n" +
    "# Style Guide\n\n" +
    "## Tokens\n\n" +
    "### Semantic roles\n\n" +
    "| Role | Purpose | Default (light) | Default (dark) |\n" +
    "|---|---|---|---|\n" +
    `| \`paper\` | Page background, default node fill | ${perfil.paper} | ${perfil.paper} |\n` +
    `| \`ink\` | Primary text, primary stroke | ${perfil.ink} | ${perfil.ink} |\n` +
    `| \`accent\` | Focal / 1–2 max per diagram | ${perfil.accent} | ${perfil.accent} |\n`
  );
}