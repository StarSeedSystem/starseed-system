/**
 * StarSeed OS — Paleta y parámetros de la Orbe Cuántica de Voz
 * ----------------------------------------------------------------------------
 * Puerto TIPADO de `getPersonaColors()` dentro de
 * `/tmp/orig/components/QuantumVoiceOrbWidget.jsx` (el `QuantumVoiceOrbWidget`
 * del Astraura 1.58-bit original, líneas 154-294): el mapa de las 10
 * personalidades con su firma visual (colores, estilo de geometría, título de
 * la insignia). Los valores hexadecimales/rgba son LITERALES copiados del
 * original — no se han "mejorado" ni redondeado, para que la identidad visual
 * de cada personalidad se mantenga reconocible.
 *
 * Añade, respecto al original, dos cosas que el JSX no tenía:
 *   1. `QuantumOrbParams` — el vector de parámetros EXPRESIVOS que el sistema
 *      Astraura 1.58-bit puede generar en vivo (turbulencia, filo, simetría,
 *      desplazamiento de matiz, respiración) para modular la geometría de
 *      `quantum-orb.tsx` más allá de audio/energía puros.
 *   2. Utilidades de color (hex↔rgb↔hsl, mezcla lineal, parseo de `rgba(...)`)
 *      que `quantum-orb.tsx` y `quantum-orb-avatar.tsx` comparten para el
 *      crossfade suave de paleta al cambiar de personalidad.
 */

// ── Tipos de color y utilidades básicas ──────────────────────────────────────

export type RGB = readonly [number, number, number];

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
export const clampUnit = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** "#rrggbb" → [r,g,b] (0..255). Degrada a blanco ante un formato inesperado. */
export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Parsea `"rgba(r, g, b, a)"` / `"rgb(r, g, b)"` → { rgb, a }. Defensivo. */
export function parseRgbaString(css: string): { rgb: RGB; a: number } {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(css);
  if (!m) return { rgb: [255, 255, 255], a: 1 };
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

export const rgbaCss = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${clampUnit(a)})`;
export const rgbCss = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Mezcla lineal RGB (crossfade de paleta). `k` se recorta a 0..1. */
export function mixRgb(a: RGB, b: RGB, k: number): RGB {
  const t = clampUnit(k);
  return [clamp255(lerp(a[0], b[0], t)), clamp255(lerp(a[1], b[1], t)), clamp255(lerp(a[2], b[2], t))];
}

/** RGB (0..255) → HSL (h en grados 0..360, s/l en 0..1). */
export function rgbToHsl(c: RGB): [number, number, number] {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

function hueToRgbChannel(p: number, q: number, t0: number): number {
  let t = t0;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** HSL (h grados, s/l 0..1) → RGB (0..255). */
export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s <= 0) {
    const v = clamp255(l * 255);
    return [v, v, v];
  }
  const hn = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp255(hueToRgbChannel(p, q, hn + 1 / 3) * 255),
    clamp255(hueToRgbChannel(p, q, hn) * 255),
    clamp255(hueToRgbChannel(p, q, hn - 1 / 3) * 255),
  ];
}

/** Gira el matiz de un color `degrees` grados conservando saturación/luz. */
export function shiftHueRgb(c: RGB, degrees: number): RGB {
  if (!degrees) return c;
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb(h + degrees, s, l);
}

// ── Firma visual por personalidad ────────────────────────────────────────────

/**
 * Los 9 shaders/geometrías reales del original + su corrección: en el JSX,
 * `quantum_toroid` (astraura_prime) y `aurora_heart_petals` (aurora, la que
 * usa el `default`) caían en la MISMA rama `else` final (comentario literal:
 * "AURORA & ASTRAURA PRIME (Default Harmonic Fluid Wave Ribbons)") — dos
 * identidades visuales degeneradas en una sola. `quantum-orb.tsx` les da a
 * ambas geometría propia y distinta (ver `drawGeometry`).
 */
export type QuantumOrbStyleType =
  | "forge_plasma_sparks"
  | "crystal_geometric_lattice"
  | "aegis_shield_harmonic"
  | "dream_nebula_lissajous"
  | "tachyon_orbital_velocity"
  | "binary_ternary_matrix"
  | "synaptic_dendrite_nexus"
  | "chromatic_prismatic_flare"
  | "quantum_toroid"
  | "aurora_heart_petals";

export interface QuantumOrbTheme {
  id: string;
  name: string;
  shortName: string;
  primary: string;
  secondary: string;
  core: string;
  /** `rgba(r, g, b, a)` literal, tal cual el original (glow del halo exterior). */
  glow: string;
  accent: string;
  styleType: QuantumOrbStyleType;
  badgeTitle: string;
}

/** Paleta RGB ya parseada de una `QuantumOrbTheme` — lista para mezclar/pintar. */
export interface QuantumOrbThemeRGB {
  primary: RGB;
  secondary: RGB;
  core: RGB;
  accent: RGB;
  glow: RGB;
  glowAlpha: number;
}

export function themeToRgb(theme: QuantumOrbTheme): QuantumOrbThemeRGB {
  const g = parseRgbaString(theme.glow);
  return {
    primary: hexToRgb(theme.primary),
    secondary: hexToRgb(theme.secondary),
    core: hexToRgb(theme.core),
    accent: hexToRgb(theme.accent),
    glow: g.rgb,
    glowAlpha: g.a,
  };
}

export function mixThemeRgb(a: QuantumOrbThemeRGB, b: QuantumOrbThemeRGB, k: number): QuantumOrbThemeRGB {
  const t = clampUnit(k);
  return {
    primary: mixRgb(a.primary, b.primary, t),
    secondary: mixRgb(a.secondary, b.secondary, t),
    core: mixRgb(a.core, b.core, t),
    accent: mixRgb(a.accent, b.accent, t),
    glow: mixRgb(a.glow, b.glow, t),
    glowAlpha: lerp(a.glowAlpha, b.glowAlpha, t),
  };
}

/** Aplica `hueShift` (0..1 → ±48°, sutil a propósito) a una paleta ya mezclada. */
export function shiftThemeRgbHue(t: QuantumOrbThemeRGB, hueShift01: number): QuantumOrbThemeRGB {
  const deg = (clampUnit(hueShift01) - 0.5) * 96; // 0..1 → -48°..+48°
  if (Math.abs(deg) < 0.5) return t;
  return {
    primary: shiftHueRgb(t.primary, deg),
    secondary: shiftHueRgb(t.secondary, deg),
    core: shiftHueRgb(t.core, deg),
    accent: shiftHueRgb(t.accent, deg),
    glow: shiftHueRgb(t.glow, deg),
    glowAlpha: t.glowAlpha,
  };
}

export const QUANTUM_ORB_THEMES: Record<string, QuantumOrbTheme> = {
  hephaestus: {
    id: "hephaestus",
    name: "Hephaestus (El Forjador)",
    shortName: "Hephaestus",
    primary: "#f59e0b",
    secondary: "#ef4444",
    core: "#fbbf24",
    glow: "rgba(245, 158, 11, 0.75)",
    accent: "#fed7aa",
    styleType: "forge_plasma_sparks",
    badgeTitle: "HEPHAESTUS RESPONDIENDO",
  },
  hermione: {
    id: "hermione",
    name: "Hermione (Intelecto Cristalino)",
    shortName: "Hermione",
    primary: "#38bdf8",
    secondary: "#818cf8",
    core: "#e0f2fe",
    glow: "rgba(56, 189, 248, 0.75)",
    accent: "#bae6fd",
    styleType: "crystal_geometric_lattice",
    badgeTitle: "HERMIONE RESPONDIENDO",
  },
  atenea: {
    id: "atenea",
    name: "Atenea (Soberana Estratégica)",
    shortName: "Atenea",
    primary: "#8b5cf6",
    secondary: "#3b82f6",
    core: "#c084fc",
    glow: "rgba(139, 92, 246, 0.75)",
    accent: "#ddd6fe",
    styleType: "aegis_shield_harmonic",
    badgeTitle: "ATENEA RESPONDIENDO",
  },
  oneiros: {
    id: "oneiros",
    name: "Oneiros (Laboratorio Onírico)",
    shortName: "Oneiros",
    primary: "#d946ef",
    secondary: "#a855f7",
    core: "#f472b6",
    glow: "rgba(217, 70, 239, 0.75)",
    accent: "#f5d0fe",
    styleType: "dream_nebula_lissajous",
    badgeTitle: "ONEIROS RESPONDIENDO",
  },
  hermes: {
    id: "hermes",
    name: "Hermes (Chispa Dinámica & Red)",
    shortName: "Hermes",
    primary: "#10b981",
    secondary: "#06b6d4",
    core: "#6ee7b7",
    glow: "rgba(16, 185, 129, 0.75)",
    accent: "#a7f3d0",
    styleType: "tachyon_orbital_velocity",
    badgeTitle: "HERMES RESPONDIENDO",
  },
  logos: {
    id: "logos",
    name: "Logos (Razón Pura & 1.58b)",
    shortName: "Logos",
    primary: "#3b82f6",
    secondary: "#00f0ff",
    core: "#93c5fd",
    glow: "rgba(59, 130, 246, 0.75)",
    accent: "#bfdbfe",
    styleType: "binary_ternary_matrix",
    badgeTitle: "LOGOS RESPONDIENDO",
  },
  mnemosyne: {
    id: "mnemosyne",
    name: "Mnemosyne (La Tejedora de Recuerdos)",
    shortName: "Mnemosyne",
    primary: "#a855f7",
    secondary: "#6366f1",
    core: "#e9d5ff",
    glow: "rgba(168, 85, 247, 0.75)",
    accent: "#f3e8ff",
    styleType: "synaptic_dendrite_nexus",
    badgeTitle: "MNEMOSYNE RESPONDIENDO",
  },
  kallisti: {
    id: "kallisti",
    name: "Kallisti (Ciberdelia & Armonía)",
    shortName: "Kallisti",
    primary: "#f43f5e",
    secondary: "#e879f9",
    core: "#fde047",
    glow: "rgba(244, 63, 94, 0.75)",
    accent: "#fecdd3",
    styleType: "chromatic_prismatic_flare",
    badgeTitle: "KALLISTI RESPONDIENDO",
  },
  astraura_prime: {
    id: "astraura_prime",
    name: "Astraura Prime (Quantum Core)",
    shortName: "Astraura",
    primary: "#00f0ff",
    secondary: "#6366f1",
    core: "#ffffff",
    glow: "rgba(0, 240, 255, 0.7)",
    accent: "#a5f3fc",
    styleType: "quantum_toroid",
    badgeTitle: "ASTRAURA RESPONDIENDO",
  },
  aurora: {
    id: "aurora",
    name: "Aurora (Alma Viva)",
    shortName: "Aurora",
    primary: "#ec4899",
    secondary: "#00f0ff",
    core: "#f43f5e",
    glow: "rgba(236, 72, 153, 0.7)",
    accent: "#fbcfe8",
    styleType: "aurora_heart_petals",
    badgeTitle: "AURORA RESPONDIENDO",
  },
};

/** Alias → id canónico, igual que el `switch` de `getPersonaColors` original. */
const QUANTUM_ORB_ALIASES: Record<string, string> = {
  hefestos: "hephaestus",
  athena: "atenea",
  quantum: "astraura_prime",
  genesis: "aurora",
  "génesis": "aurora",
};

const normalizeId = (id?: string | null): string => (id ?? "").toLowerCase().trim();

/** Resuelve un `personaId` (con alias) a su tema; cae a "aurora" por defecto. */
export function resolveQuantumOrbTheme(personaId?: string | null): QuantumOrbTheme {
  const key = normalizeId(personaId);
  const canonical = QUANTUM_ORB_ALIASES[key] ?? key;
  return QUANTUM_ORB_THEMES[canonical] ?? QUANTUM_ORB_THEMES.aurora;
}

// ── Parámetros expresivos generables por Astraura 1.58-bit en vivo ──────────

/**
 * Vector de parámetros que el motor 1.58-bit puede ir emitiendo mientras
 * genera la respuesta (vía `quantum-orb-bus.ts`, evento `params`) para que la
 * geometría de la orbe exprese matices que el audio solo no transmite:
 * cuánto "ruido"/imperfección tiene el momento, cuán afilada/angular se ve la
 * forma, cuán regular/simétrica es, un giro de matiz sobre la paleta base y la
 * amplitud de la respiración de fondo. Todos 0..1.
 */
export interface QuantumOrbParams {
  turbulence: number;
  spikiness: number;
  symmetry: number;
  hueShift: number;
  breath: number;
}

export const DEFAULT_QUANTUM_ORB_PARAMS: QuantumOrbParams = {
  turbulence: 0.35,
  spikiness: 0.4,
  symmetry: 0.6,
  hueShift: 0.5,
  breath: 0.5,
};

/** Completa un `Partial<QuantumOrbParams>` con los valores por defecto, recortados a 0..1. */
export function mergeQuantumOrbParams(partial?: Partial<QuantumOrbParams> | null): QuantumOrbParams {
  if (!partial) return { ...DEFAULT_QUANTUM_ORB_PARAMS };
  return {
    turbulence: clampUnit(partial.turbulence ?? DEFAULT_QUANTUM_ORB_PARAMS.turbulence),
    spikiness: clampUnit(partial.spikiness ?? DEFAULT_QUANTUM_ORB_PARAMS.spikiness),
    symmetry: clampUnit(partial.symmetry ?? DEFAULT_QUANTUM_ORB_PARAMS.symmetry),
    hueShift: clampUnit(partial.hueShift ?? DEFAULT_QUANTUM_ORB_PARAMS.hueShift),
    breath: clampUnit(partial.breath ?? DEFAULT_QUANTUM_ORB_PARAMS.breath),
  };
}

/** Interpolación lineal entre dos vectores de parámetros (`k` 0..1). */
export function lerpQuantumOrbParams(a: QuantumOrbParams, b: QuantumOrbParams, k: number): QuantumOrbParams {
  const t = clampUnit(k);
  const L = (x: number, y: number): number => x + (y - x) * t;
  return {
    turbulence: L(a.turbulence, b.turbulence),
    spikiness: L(a.spikiness, b.spikiness),
    symmetry: L(a.symmetry, b.symmetry),
    hueShift: L(a.hueShift, b.hueShift),
    breath: L(a.breath, b.breath),
  };
}
