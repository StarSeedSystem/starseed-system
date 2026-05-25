/**
 * Catálogo curado de Google Fonts para el picker.
 * Categorizado por uso y rasgo. Cada entrada es lo necesario para construir
 * la URL de Google Fonts y registrarla en typography.customFonts.
 */

export type FontCategory = "sans" | "serif" | "display" | "mono" | "handwriting";

export interface GoogleFont {
  family: string;
  category: FontCategory;
  /** Pesos sugeridos (separados por ;) — Google Fonts CSS2 syntax */
  weights: string;
  /** Tags para búsqueda */
  tags: string[];
}

/** Lista curada (~50 fuentes) — privilegia legibilidad y carácter. */
export const GOOGLE_FONTS: GoogleFont[] = [
  // ── Sans modernas ────────────────────────────────────────
  { family: "Inter", category: "sans", weights: "400;500;600;700", tags: ["clean", "ui", "neutral"] },
  { family: "Outfit", category: "sans", weights: "400;500;600;700", tags: ["modern", "geometric"] },
  { family: "Space Grotesk", category: "sans", weights: "400;500;700", tags: ["techy", "futuristic"] },
  { family: "DM Sans", category: "sans", weights: "400;500;700", tags: ["neutral", "premium"] },
  { family: "Manrope", category: "sans", weights: "400;500;600;700", tags: ["clean", "rounded"] },
  { family: "Plus Jakarta Sans", category: "sans", weights: "400;500;600;700", tags: ["humanist", "warm"] },
  { family: "Onest", category: "sans", weights: "400;500;600;700", tags: ["geometric", "open"] },
  { family: "Geist", category: "sans", weights: "400;500;700", tags: ["vercel", "minimal"] },
  { family: "Albert Sans", category: "sans", weights: "400;500;700", tags: ["humanist"] },
  { family: "Public Sans", category: "sans", weights: "400;500;600;700", tags: ["government", "clean"] },
  { family: "Figtree", category: "sans", weights: "400;500;600;700", tags: ["friendly"] },
  { family: "Lexend", category: "sans", weights: "400;500;600;700", tags: ["accessibility", "reading"] },
  { family: "Sora", category: "sans", weights: "400;500;600;700", tags: ["techy", "geometric"] },
  { family: "Be Vietnam Pro", category: "sans", weights: "400;500;600;700", tags: ["modern"] },
  { family: "Hanken Grotesk", category: "sans", weights: "400;500;700", tags: ["editorial"] },

  // ── Display / personalidad ───────────────────────────────
  { family: "Unbounded", category: "display", weights: "400;500;700", tags: ["bold", "modern"] },
  { family: "Syne", category: "display", weights: "400;500;700;800", tags: ["expressive"] },
  { family: "Fraunces", category: "display", weights: "400;500;600;700", tags: ["expressive", "soft"] },
  { family: "Bricolage Grotesque", category: "display", weights: "400;500;700", tags: ["editorial", "modern"] },
  { family: "Major Mono Display", category: "display", weights: "400", tags: ["mono", "uppercase"] },
  { family: "Orbitron", category: "display", weights: "400;500;700;900", tags: ["futuristic", "sci-fi"] },
  { family: "Audiowide", category: "display", weights: "400", tags: ["retro", "techy"] },
  { family: "Press Start 2P", category: "display", weights: "400", tags: ["pixel", "retro", "gaming"] },
  { family: "VT323", category: "display", weights: "400", tags: ["terminal", "retro"] },
  { family: "Rubik", category: "display", weights: "400;500;700", tags: ["geometric", "friendly"] },

  // ── Serif elegantes ──────────────────────────────────────
  { family: "Inter Tight", category: "sans", weights: "400;500;700", tags: ["compact"] },
  { family: "Playfair Display", category: "serif", weights: "400;500;700", tags: ["elegant", "editorial"] },
  { family: "Cormorant", category: "serif", weights: "400;500;700", tags: ["luxury", "thin"] },
  { family: "EB Garamond", category: "serif", weights: "400;500;700", tags: ["classic", "book"] },
  { family: "Crimson Text", category: "serif", weights: "400;600;700", tags: ["academic"] },
  { family: "Lora", category: "serif", weights: "400;500;700", tags: ["readable"] },
  { family: "Merriweather", category: "serif", weights: "400;700", tags: ["readable", "screen"] },
  { family: "DM Serif Display", category: "serif", weights: "400", tags: ["headline", "elegant"] },
  { family: "Spectral", category: "serif", weights: "400;500;700", tags: ["editorial"] },
  { family: "Newsreader", category: "serif", weights: "400;500;700", tags: ["news", "readable"] },

  // ── Monospace para código ────────────────────────────────
  { family: "JetBrains Mono", category: "mono", weights: "400;500;700", tags: ["code", "premium"] },
  { family: "Fira Code", category: "mono", weights: "400;500;700", tags: ["code", "ligatures"] },
  { family: "IBM Plex Mono", category: "mono", weights: "400;500;700", tags: ["code", "ibm"] },
  { family: "Source Code Pro", category: "mono", weights: "400;500;700", tags: ["code"] },
  { family: "Space Mono", category: "mono", weights: "400;700", tags: ["techy"] },
  { family: "Cousine", category: "mono", weights: "400;700", tags: ["code"] },
  { family: "Geist Mono", category: "mono", weights: "400;500;700", tags: ["vercel"] },

  // ── Handwriting / experimentales ────────────────────────
  { family: "Caveat", category: "handwriting", weights: "400;500;700", tags: ["handwritten"] },
  { family: "Architects Daughter", category: "handwriting", weights: "400", tags: ["sketch"] },
  { family: "Shadows Into Light", category: "handwriting", weights: "400", tags: ["handwritten"] },
];

export function fontCssUrl(family: string, weights: string): string {
  const param = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${param}:wght@${weights}&display=swap`;
}

export function fontCssFamily(family: string): string {
  return `'${family}', system-ui, -apple-system, sans-serif`;
}

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: "Sans-serif",
  serif: "Serif",
  display: "Display",
  mono: "Monoespaciada",
  handwriting: "Manuscrita",
};
