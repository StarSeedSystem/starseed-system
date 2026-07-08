"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * theme-catalog — CATÁLOGO de ~24 ThemePacks builtin de StarSeed OS.
 * ---------------------------------------------------------------------------
 * Cada tema es un ThemePack (contrato: theme-engine.ts) con variantes
 * claro/oscuro COMPLETAS:
 *   · Paleta HSL con los MISMOS nombres de variable que tailwind.config.ts ya
 *     consume (--background-hsl, --primary-hsl, --card-hsl…) → el tema tiñe
 *     TODA la UI Tailwind del OS, no solo unos acentos.
 *   · Los knobs de cristal YA leídos por globals.css (--glass-blur/-opacity/
 *     -refraction/-saturation/-frost/-noise/-aberration, --neon-glow,
 *     --border-width) para que cada tema se sienta MATERIALMENTE distinto
 *     (más o menos vidrio, más o menos neón), no solo recoloreado.
 *   · `materialClass` conecta con el "puente de materiales" de
 *     starseed-themes.css (tiñe .glass-card/.card-glass/.liquid-glass-panel
 *     hacia ss-crystal/ss-neon/ss-metal/ss-wood/ss-nature).
 *   · `background` activa un fondo animado del registro backgrounds.ts
 *     (matrix-rain/estrellas/gradiente-aurora/weather-live) — SOLO en los 4
 *     temas que lo piden; el resto no toca el fondo global del OS.
 *
 * Se registran en THEME_REGISTRY como efecto de CARGA del módulo (igual que
 * cualquier "paquete de tokens" del contrato). Importa este archivo una vez
 * (appearance-context.tsx lo hace) para que el catálogo exista.
 *
 * Contrato INMUTABLE: src/lib/design/theme-engine.ts. Este archivo solo
 * CONSUME registerTheme()/tipos — no altera el contrato.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { registerTheme, type ThemePack, type ThemeTokens } from "./theme-engine";

/* ─────────────────────────── Generador de tokens ───────────────────────────
 * Autoría CREATIVA por tema: solo hace falta elegir bg/fg/primary/secondary/
 * accent (y opcionalmente card/muted/border/destructive/ring). El resto —
 * foreground legible sobre cada color, card elevada, border sutil, RGB del
 * primario para sombras/glows— se DERIVA, así cada tema queda accesible y
 * consistente sin repetir 20 líneas de variables a mano. */

/** Tupla HSL: [hue 0-360, saturation %, lightness %]. Exportada: theme-mixer.ts
 *  y design-elements.ts la reusan para autoría de paletas/materiales sueltos
 *  con la MISMA convención de derivación (cero divergencia de estilo). */
export type H = [number, number, number];

export function hs(h: H): string {
    return `${h[0]} ${h[1]}% ${h[2]}%`;
}

/** HSL → "r, g, b" (para --primary-rgb, usado en sombras/glows rgba(var(...))). */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 360) + 360) % 360;
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let rgb: [number, number, number];
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
}

export function rgbStr(h: H): string {
    const [r, g, b] = hslToRgb(h[0], h[1], h[2]);
    return `${r}, ${g}, ${b}`;
}

/** Texto legible SOBRE un color H: casi negro si es claro, casi blanco si es oscuro/medio.
 *  Heurística rápida de AUTORÍA (no WCAG real) — theme-mixer.ts hace su propio
 *  paso de contraste AA real por luminancia relativa sobre el resultado final
 *  de la mezcla; esta función solo sirve para diseñar specs a mano aquí y en
 *  design-elements.ts. */
export function onColor(h: H): H {
    return h[2] > 64 ? [h[0], Math.min(h[1], 25), 11] : [h[0], Math.min(h[1], 12), 97];
}

export interface RoleSet {
    bg: H; fg: H;
    /** Superficie elevada (tarjetas/popover). Por defecto, bg ligeramente más claro (misma convención que globals.css). */
    card?: H;
    primary: H; secondary: H; accent: H;
    /** Fondo de superficies "muted". Por defecto, igual a card. */
    muted?: H;
    /** Por defecto, versión sutil de fg sobre bg (borde apenas visible). */
    border?: H;
    destructive?: H;
    /** Por defecto, igual a primary. */
    ring?: H;
}

export interface GlassSpec {
    blur?: number; opacity?: number; refraction?: number; saturation?: number;
    frost?: number; noise?: number; neon?: number; aberration?: number; borderWidth?: number;
}

export function roleVars(r: RoleSet): Record<string, string> {
    const card = r.card ?? ([r.bg[0], r.bg[1], r.bg[2] < 50 ? Math.min(r.bg[2] + 3, 100) : Math.min(r.bg[2] + 2, 100)] as H);
    const muted = r.muted ?? card;
    const border = r.border ?? ([r.fg[0], Math.min(r.fg[1], 20), r.bg[2] > 50 ? 82 : 22] as H);
    const destructive = r.destructive ?? ([4, 78, 56] as H);
    const mutedFg: H = [r.fg[0], Math.min(r.fg[1], 18), r.bg[2] > 50 ? 42 : 66];
    return {
        "background-hsl": hs(r.bg), "foreground-hsl": hs(r.fg),
        "card-hsl": hs(card), "card-foreground-hsl": hs(r.fg),
        "popover-hsl": hs(card), "popover-foreground-hsl": hs(r.fg),
        "primary-hsl": hs(r.primary), "primary-foreground-hsl": hs(onColor(r.primary)), "primary-rgb": rgbStr(r.primary),
        "secondary-hsl": hs(r.secondary), "secondary-foreground-hsl": hs(onColor(r.secondary)),
        "accent-hsl": hs(r.accent), "accent-foreground-hsl": hs(onColor(r.accent)),
        "muted-hsl": hs(muted), "muted-foreground-hsl": hs(mutedFg),
        "destructive-hsl": hs(destructive), "destructive-foreground-hsl": hs(onColor(destructive)),
        "border-hsl": hs(border), "input-hsl": hs(border),
        "ring-hsl": hs(r.ring ?? r.primary),
    };
}

export function glassVars(g?: GlassSpec): Record<string, string> {
    if (!g) return {};
    const out: Record<string, string> = {};
    if (g.blur !== undefined) out["glass-blur"] = `${g.blur}px`;
    if (g.opacity !== undefined) out["glass-opacity"] = String(g.opacity);
    if (g.refraction !== undefined) out["glass-refraction"] = String(g.refraction);
    if (g.saturation !== undefined) out["glass-saturation"] = `${g.saturation}%`;
    if (g.frost !== undefined) out["glass-frost"] = String(g.frost);
    if (g.noise !== undefined) out["glass-noise"] = String(g.noise);
    if (g.neon !== undefined) out["neon-glow"] = String(g.neon);
    if (g.aberration !== undefined) out["glass-aberration"] = `${g.aberration}px`;
    if (g.borderWidth !== undefined) out["border-width"] = `${g.borderWidth}px`;
    return out;
}

interface ThemeSpec {
    id: string; name: string; description: string; style: string;
    light: RoleSet; dark: RoleSet;
    /** rem */
    radius: number;
    materialClass?: string;
    /** id de backgrounds.ts */
    background?: string;
    fontFamily?: string;
    /** 0-2 */
    motion?: number;
    glass?: GlassSpec;
    /** Si el modo oscuro pide otro ajuste de cristal; si no, reusa `glass`. */
    glassDark?: GlassSpec;
    /** 3 hex para la tarjeta de preview del catálogo. */
    colors: string[];
}

/**
 * OPTIMIZACIÓN POR DISPOSITIVO — radius RESPONSIVO: clamp() entre un mínimo
 * más denso (pantallas estrechas, ~55% del valor de autor) y el valor de
 * autor completo (pantallas anchas), interpolando por vw. Sustituye el rem
 * fijo SOLO dentro de --radius de ESTE ThemePack: no toca --radius del
 * sistema de Apariencia clásico salvo que este tema esté aplicado. El resto
 * de la densidad (spacing) ya es fluida a nivel de OS vía --space-fluid-*
 * (globals.css), así que no hace falta duplicarla aquí.
 */
export function radiusToken(rem: number): string {
    const min = Math.max(rem * 0.55, 0.125);
    const vwPart = (rem * 0.4).toFixed(2);
    return `clamp(${min.toFixed(2)}rem, ${vwPart}rem + 2vw, ${rem}rem)`;
}

function makePack(s: ThemeSpec): ThemePack {
    const radiusVar = { radius: radiusToken(s.radius) };
    const lightVars: Record<string, string> = { ...roleVars(s.light), ...radiusVar, ...glassVars(s.glass) };
    const darkVars: Record<string, string> = { ...roleVars(s.dark), ...radiusVar, ...glassVars(s.glassDark ?? s.glass) };
    const common: Partial<ThemeTokens> = {};
    if (s.materialClass) common.materialClass = s.materialClass;
    if (s.background) common.background = s.background;
    if (s.fontFamily) common.fontFamily = s.fontFamily;
    if (s.motion !== undefined) common.motion = s.motion;
    return {
        id: s.id,
        name: s.name,
        description: s.description,
        style: s.style,
        modes: {
            light: { vars: lightVars, ...common },
            dark: { vars: darkVars, ...common },
        },
        preview: { colors: s.colors },
        author: "StarSeed Core",
        version: 1,
    };
}

/* ─────────────────────────────── Catálogo ─────────────────────────────── */

const THEME_SPECS: ThemeSpec[] = [
    {
        id: "art-nouveau", name: "Art Nouveau", style: "art-nouveau",
        description: "Curvas orgánicas, oro viejo y esmeralda — el modernismo que convierte cada borde en enredadera.",
        light: { bg: [42, 35, 96], fg: [150, 30, 14], primary: [42, 55, 48], secondary: [152, 45, 32], accent: [150, 50, 30], border: [42, 25, 84] },
        dark: { bg: [150, 30, 8], fg: [45, 30, 92], primary: [42, 60, 55], secondary: [152, 50, 45], accent: [150, 55, 45], border: [150, 25, 20] },
        radius: 1.75, materialClass: "ss-nature", motion: 1.1,
        glass: { blur: 22, opacity: 0.7, refraction: 0.5, saturation: 150, frost: 0.55 },
        colors: ["#C99A3B", "#1F6E4F", "#F3ECD9"],
    },
    {
        id: "art-deco", name: "Art Déco", style: "art-deco",
        description: "Simetría geométrica, oro bruñido sobre negro absoluto — el lujo vertical de los rascacielos de los 20.",
        light: { bg: [40, 30, 95], fg: [40, 20, 10], card: [40, 25, 99], primary: [45, 70, 48], secondary: [35, 20, 25], accent: [30, 55, 35], border: [40, 25, 80] },
        dark: { bg: [40, 20, 6], fg: [42, 35, 92], primary: [45, 75, 58], secondary: [35, 15, 30], accent: [30, 60, 45], border: [42, 25, 18] },
        radius: 0.3, materialClass: "ss-metal", fontFamily: "var(--font-headline)", motion: 0.8,
        glass: { blur: 8, opacity: 0.85, refraction: 0.2, saturation: 120, borderWidth: 1.5 },
        colors: ["#D4AF37", "#14110D", "#F2E9D5"],
    },
    {
        id: "pop", name: "Pop", style: "pop",
        description: "Bloques de color saturado y contorno grueso — el cómic vuelto interfaz.",
        light: { bg: [0, 0, 98], fg: [0, 0, 8], card: [0, 0, 100], primary: [340, 85, 55], secondary: [205, 90, 52], accent: [50, 95, 52], border: [0, 0, 10] },
        dark: { bg: [240, 15, 7], fg: [0, 0, 96], primary: [340, 90, 60], secondary: [205, 95, 58], accent: [50, 95, 58], border: [0, 0, 90] },
        radius: 1.1, fontFamily: "'Satoshi', sans-serif", motion: 1.3,
        glass: { blur: 6, opacity: 0.9, refraction: 0, saturation: 160 },
        colors: ["#FF2D6B", "#2D8CFF", "#FFD400"],
    },
    {
        id: "solarpunk", name: "Solarpunk", style: "solarpunk",
        description: "Verde vivo, energía solar y biofilia — tecnología que abraza a la selva en vez de sustituirla.",
        light: { bg: [110, 35, 96], fg: [145, 45, 12], primary: [135, 65, 40], secondary: [45, 90, 52], accent: [170, 55, 35], border: [120, 30, 82] },
        dark: { bg: [145, 40, 8], fg: [110, 35, 92], primary: [135, 60, 52], secondary: [45, 90, 58], accent: [170, 55, 45], border: [145, 30, 20] },
        radius: 1.5, materialClass: "ss-nature", fontFamily: "var(--font-outfit)", motion: 1.3,
        glass: { blur: 18, opacity: 0.65, refraction: 0.4, saturation: 150, frost: 0.6 },
        colors: ["#22C55E", "#FBBF24", "#0EA5A4"],
    },
    {
        id: "retro", name: "Retro 70s", style: "retro",
        description: "Crema y naranja quemado — la calidez analógica de un salón de los años 70.",
        light: { bg: [40, 45, 94], fg: [20, 35, 16], primary: [20, 75, 52], secondary: [42, 70, 52], accent: [15, 40, 30], border: [35, 35, 80] },
        dark: { bg: [22, 35, 10], fg: [40, 40, 92], primary: [20, 80, 58], secondary: [42, 75, 58], accent: [15, 45, 40], border: [22, 30, 22] },
        radius: 1.1, materialClass: "ss-wood", motion: 1,
        glass: { blur: 14, opacity: 0.75, refraction: 0.3, saturation: 130, frost: 0.55 },
        colors: ["#E8734A", "#E0A93E", "#3B2314"],
    },
    {
        id: "futurista", name: "Futurista", style: "futurista",
        description: "Blanco y azur minimal — superficies limpias, luz fría, cero ruido visual.",
        light: { bg: [210, 20, 98], fg: [220, 35, 12], card: [210, 25, 100], primary: [205, 90, 52], secondary: [195, 70, 55], accent: [210, 15, 85], border: [210, 20, 88] },
        dark: { bg: [222, 45, 6], fg: [205, 30, 94], primary: [205, 90, 60], secondary: [195, 75, 62], accent: [210, 20, 80], border: [220, 30, 18] },
        radius: 0.5, materialClass: "ss-crystal", fontFamily: "var(--font-headline)", motion: 0.8,
        glass: { blur: 26, opacity: 0.5, refraction: 0.6, saturation: 170 },
        colors: ["#38BDF8", "#E0F2FE", "#0A0E1A"],
    },
    {
        id: "retrofuturista", name: "Retrofuturista", style: "retrofuturista",
        description: "Synthwave: violeta y cian sobre la carretera infinita del atardecer digital.",
        light: { bg: [280, 40, 95], fg: [265, 55, 14], primary: [290, 80, 58], secondary: [185, 85, 50], accent: [320, 80, 60], border: [280, 30, 82] },
        dark: { bg: [265, 55, 8], fg: [280, 40, 94], primary: [290, 85, 65], secondary: [185, 90, 58], accent: [320, 85, 65], border: [265, 40, 20] },
        radius: 0.85, materialClass: "ss-neon", fontFamily: "var(--font-headline)", motion: 1.2,
        glass: { blur: 20, opacity: 0.6, refraction: 1.1, saturation: 170, neon: 0.8 },
        colors: ["#C026D3", "#22D3EE", "#1A0B2E"],
    },
    {
        id: "matrix", name: "Matrix", style: "matrix",
        description: "Verde fósforo sobre negro absoluto — el código que cae y revela la estructura real.",
        light: { bg: [130, 20, 11], fg: [125, 90, 68], card: [130, 22, 14], primary: [125, 90, 52], secondary: [130, 70, 35], accent: [110, 85, 60], border: [130, 40, 25] },
        dark: { bg: [130, 25, 4], fg: [125, 95, 72], primary: [125, 95, 55], secondary: [130, 75, 38], accent: [110, 90, 62], border: [130, 45, 16] },
        radius: 0.4, materialClass: "ss-neon", background: "matrix-rain", fontFamily: "var(--font-code)", motion: 1,
        glass: { blur: 12, opacity: 0.55, refraction: 0.3, saturation: 140, neon: 0.9 },
        colors: ["#00FF41", "#003B00", "#0D0D0D"],
    },
    {
        id: "naturaleza", name: "Naturaleza", style: "naturaleza",
        description: "Bosque y tierra húmeda — musgo, corteza y luz filtrada entre las hojas.",
        light: { bg: [90, 25, 95], fg: [145, 40, 14], primary: [145, 45, 35], secondary: [30, 40, 35], accent: [50, 55, 42], border: [100, 25, 80] },
        dark: { bg: [150, 35, 8], fg: [90, 25, 92], primary: [145, 45, 48], secondary: [30, 45, 42], accent: [50, 55, 52], border: [150, 25, 20] },
        radius: 1.4, materialClass: "ss-nature", fontFamily: "var(--font-outfit)", motion: 1,
        glass: { blur: 18, opacity: 0.68, refraction: 0.35, saturation: 140, frost: 0.6 },
        colors: ["#4ADE80", "#7A4E2A", "#F5F0E1"],
    },
    {
        id: "cyberpunk", name: "Cyberpunk", style: "cyberpunk",
        description: "Magenta y cian a máxima tensión sobre la noche urbana — el neón como única ley.",
        light: { bg: [250, 25, 12], fg: [190, 70, 88], card: [250, 28, 15], primary: [320, 90, 55], secondary: [187, 90, 55], accent: [55, 90, 55], border: [250, 30, 25] },
        dark: { bg: [260, 35, 5], fg: [190, 80, 92], primary: [320, 95, 60], secondary: [187, 95, 60], accent: [55, 95, 60], border: [260, 35, 15] },
        radius: 0.5, materialClass: "ss-neon", fontFamily: "var(--font-code)", motion: 1.2,
        glass: { blur: 16, opacity: 0.55, refraction: 1.3, saturation: 180, neon: 1, aberration: 3 },
        colors: ["#FF00C8", "#00E5FF", "#0A0A12"],
    },
    {
        id: "visionario", name: "Visionario", style: "visionario",
        description: "Iridiscencia suave y psicodelia serena — el gradiente como estado de conciencia expandida.",
        light: { bg: [260, 45, 97], fg: [265, 45, 16], primary: [275, 65, 66], secondary: [190, 65, 66], accent: [330, 65, 72], border: [265, 35, 86] },
        dark: { bg: [260, 45, 10], fg: [260, 40, 94], primary: [275, 70, 70], secondary: [190, 70, 68], accent: [330, 70, 75], border: [260, 35, 22] },
        radius: 1.6, materialClass: "ss-crystal--deep", background: "gradiente-aurora", motion: 1.4,
        glass: { blur: 26, opacity: 0.55, refraction: 1.4, saturation: 180, frost: 0.4 },
        colors: ["#A78BFA", "#67E8F9", "#F5D0E8"],
    },
    {
        id: "arcoiris", name: "Arcoíris", style: "arcoiris",
        description: "Todo el espectro en equilibrio — ningún color domina, todos conviven.",
        light: { bg: [0, 0, 98], fg: [260, 20, 12], card: [0, 0, 100], primary: [275, 70, 58], secondary: [175, 60, 40], accent: [20, 85, 55], border: [0, 0, 86] },
        dark: { bg: [255, 25, 8], fg: [0, 0, 95], primary: [275, 75, 68], secondary: [175, 65, 50], accent: [20, 90, 62], border: [255, 25, 20] },
        radius: 1.25, fontFamily: "var(--font-headline)", motion: 1.2,
        glass: { blur: 18, opacity: 0.68, refraction: 0.5, saturation: 165 },
        colors: ["#8B5CF6", "#14B8A6", "#FB923C"],
    },
    {
        id: "hippie", name: "Hippie", style: "hippie",
        description: "Tie-dye cálido — espirales de color como los años 60 los soñaron, otra vez posibles.",
        light: { bg: [45, 50, 95], fg: [330, 35, 16], primary: [335, 65, 58], secondary: [48, 85, 55], accent: [175, 55, 45], border: [42, 35, 82] },
        dark: { bg: [320, 35, 12], fg: [45, 40, 92], primary: [335, 70, 62], secondary: [48, 85, 60], accent: [175, 55, 52], border: [320, 30, 24] },
        radius: 1.75, fontFamily: "var(--font-outfit)", motion: 1.3,
        glass: { blur: 16, opacity: 0.72, refraction: 0.4, saturation: 150, frost: 0.6 },
        colors: ["#EC4899", "#FACC15", "#2DD4BF"],
    },
    {
        id: "punk", name: "Punk", style: "punk",
        description: "Negro crudo y rosa chillón, sin pulir — hazlo tú mismo, rómpelo si hace falta.",
        light: { bg: [0, 0, 97], fg: [0, 0, 5], card: [0, 0, 100], primary: [328, 90, 52], secondary: [0, 0, 10], accent: [60, 95, 52], border: [0, 0, 8] },
        dark: { bg: [0, 0, 4], fg: [0, 0, 97], primary: [328, 95, 58], secondary: [0, 0, 92], accent: [60, 95, 58], border: [0, 0, 85] },
        radius: 0.15, fontFamily: "'Satoshi', sans-serif", motion: 0.6,
        glass: { blur: 4, opacity: 0.95, refraction: 0, saturation: 100, borderWidth: 3, noise: 0.15 },
        colors: ["#FF1478", "#0A0A0A", "#F5F5F0"],
    },
    {
        id: "cristal-realista", name: "Cristal Realista", style: "cristal",
        description: "Cristal líquido llevado al máximo: refracción, profundidad y luz atrapada en el borde.",
        light: { bg: [240, 30, 97], fg: [250, 35, 14], card: [240, 30, 99], primary: [255, 55, 62], secondary: [195, 55, 60], accent: [240, 20, 85], border: [240, 25, 86] },
        dark: { bg: [250, 40, 7], fg: [240, 30, 94], primary: [255, 60, 68], secondary: [195, 60, 66], accent: [240, 25, 78], border: [250, 35, 18] },
        radius: 1.5, materialClass: "ss-crystal--deep", motion: 1,
        glass: { blur: 32, opacity: 0.55, refraction: 1.6, saturation: 190, frost: 0.35 },
        colors: ["#93C5FD", "#E0F2FE", "#0B1020"],
    },
    {
        id: "climatico", name: "Climático", style: "climatico",
        description: "El cielo real sobre tu cabeza, dentro del sistema — lluvia, sol o niebla según toque afuera.",
        light: { bg: [205, 45, 96], fg: [220, 40, 14], primary: [205, 80, 52], secondary: [215, 25, 45], accent: [45, 85, 55], border: [205, 30, 84] },
        dark: { bg: [225, 45, 9], fg: [205, 35, 92], primary: [205, 85, 58], secondary: [215, 25, 55], accent: [45, 85, 60], border: [225, 35, 20] },
        radius: 1.25, materialClass: "ss-crystal", background: "weather-live", motion: 1,
        glass: { blur: 22, opacity: 0.6, refraction: 0.9, saturation: 155, frost: 0.5 },
        colors: ["#38BDF8", "#64748B", "#FDE68A"],
    },
    {
        id: "astrologico", name: "Astrológico", style: "astrologico",
        description: "Índigo profundo y oro estelar — la carta natal convertida en interfaz.",
        light: { bg: [250, 35, 95], fg: [250, 45, 14], primary: [45, 80, 55], secondary: [245, 50, 42], accent: [265, 45, 52], border: [250, 30, 84] },
        dark: { bg: [250, 55, 7], fg: [45, 35, 90], primary: [45, 85, 62], secondary: [245, 55, 55], accent: [265, 50, 62], border: [250, 40, 18] },
        radius: 1.25, materialClass: "ss-crystal", background: "estrellas", motion: 1.1,
        glass: { blur: 20, opacity: 0.62, refraction: 1, saturation: 170 },
        colors: ["#FBBF24", "#4338CA", "#1E1B4B"],
    },
    {
        id: "infantil", name: "Infantil", style: "infantil",
        description: "Pastel grande y redondo — un mundo sin esquinas donde todo invita a tocarlo.",
        light: { bg: [340, 55, 97], fg: [280, 25, 20], card: [340, 55, 99], primary: [340, 75, 75], secondary: [200, 75, 78], accent: [150, 55, 75], border: [340, 40, 88] },
        dark: { bg: [280, 25, 14], fg: [340, 40, 92], primary: [340, 75, 72], secondary: [200, 70, 72], accent: [150, 50, 68], border: [280, 25, 26] },
        radius: 2, fontFamily: "var(--font-outfit)", motion: 1.5,
        glass: { blur: 14, opacity: 0.8, refraction: 0.3, saturation: 140, borderWidth: 2 },
        colors: ["#FB7185", "#7DD3FC", "#86EFAC"],
    },
    {
        id: "profesional", name: "Profesional", style: "profesional",
        description: "Gris y azul sobrios — densidad de información sin distracción, para trabajar en serio.",
        light: { bg: [220, 15, 97], fg: [220, 25, 14], card: [220, 18, 99], primary: [215, 45, 42], secondary: [220, 12, 40], accent: [190, 35, 38], border: [220, 15, 86] },
        dark: { bg: [220, 18, 9], fg: [220, 15, 92], primary: [215, 50, 55], secondary: [220, 12, 55], accent: [190, 40, 50], border: [220, 18, 20] },
        radius: 0.5, fontFamily: "var(--font-inter)", motion: 0.7,
        glass: { blur: 14, opacity: 0.78, refraction: 0.2, saturation: 115, borderWidth: 1 },
        colors: ["#3B6EA5", "#64748B", "#0F172A"],
    },
    {
        id: "equilibrado", name: "Equilibrado", style: "equilibrado",
        description: "El equilibrio pulido del sistema: violeta, ámbar y esmeralda en calma — el default, pero cuidado.",
        light: { bg: [270, 20, 97], fg: [265, 25, 12], card: [270, 25, 99], muted: [270, 15, 93], primary: [276, 85, 55], secondary: [39, 95, 52], accent: [150, 70, 35], border: [270, 18, 88] },
        dark: { bg: [258, 45, 5], fg: [220, 30, 96], card: [260, 40, 8], muted: [258, 30, 14], primary: [280, 90, 72], secondary: [190, 90, 55], accent: [190, 80, 50], border: [258, 30, 16] },
        radius: 1.25, motion: 1,
        glass: { blur: 20, opacity: 0.65, refraction: 0.3, saturation: 150 },
        colors: ["#8B2AEE", "#F5A623", "#1F9D6B"],
    },
    {
        id: "neon", name: "Neón", style: "neon",
        description: "El neón puro: bordes que respiran luz y saturación llevada al límite del confort.",
        light: { bg: [260, 25, 14], fg: [185, 70, 90], card: [260, 28, 17], primary: [292, 85, 60], secondary: [185, 85, 55], accent: [100, 80, 55], border: [260, 30, 26] },
        dark: { bg: [260, 35, 6], fg: [185, 80, 92], primary: [292, 90, 65], secondary: [185, 90, 60], accent: [100, 85, 60], border: [260, 35, 16] },
        radius: 1, materialClass: "ss-neon", fontFamily: "var(--font-headline)", motion: 1.2,
        glass: { blur: 14, opacity: 0.6, refraction: 0.8, saturation: 175, neon: 1, borderWidth: 1.5 },
        colors: ["#D946EF", "#22D3EE", "#A3E635"],
    },
    {
        id: "metalico", name: "Metálico", style: "metalico",
        description: "Titanio cepillado y latón bruñido — la precisión fría de la maquinaria bien hecha.",
        light: { bg: [220, 10, 92], fg: [220, 25, 14], card: [220, 10, 95], primary: [42, 55, 50], secondary: [220, 10, 45], accent: [20, 55, 42], border: [220, 12, 78] },
        dark: { bg: [220, 18, 10], fg: [220, 10, 92], primary: [42, 60, 58], secondary: [220, 10, 58], accent: [20, 55, 52], border: [220, 15, 22] },
        radius: 0.75, materialClass: "ss-metal", motion: 0.9,
        glass: { blur: 10, opacity: 0.85, refraction: 0.15, saturation: 130, borderWidth: 1.5 },
        colors: ["#D4AF37", "#8B8F98", "#B36A3C"],
    },
    {
        id: "madera", name: "Madera", style: "madera",
        description: "Vetas cálidas y nudos naturales — la calidez de un taller de carpintero al atardecer.",
        light: { bg: [35, 40, 93], fg: [25, 45, 16], card: [35, 42, 96], primary: [28, 45, 40], secondary: [38, 60, 50], accent: [110, 30, 32], border: [32, 35, 78] },
        dark: { bg: [25, 35, 12], fg: [35, 35, 90], primary: [28, 50, 48], secondary: [38, 60, 55], accent: [110, 30, 42], border: [25, 30, 22] },
        radius: 1, materialClass: "ss-wood", motion: 0.9,
        glass: { blur: 12, opacity: 0.85, refraction: 0.1, saturation: 120, frost: 0.55 },
        colors: ["#7A4E2A", "#C8873A", "#4B6B3A"],
    },
    {
        id: "material-3d", name: "Material 3D", style: "material-3d",
        description: "Vidrio, metal y madera fundidos en una sola superficie realista y táctil.",
        light: { bg: [40, 25, 95], fg: [230, 25, 14], card: [40, 25, 98], primary: [40, 55, 52], secondary: [222, 10, 45], accent: [25, 40, 38], border: [40, 20, 82] },
        dark: { bg: [230, 25, 8], fg: [40, 20, 92], primary: [40, 60, 58], secondary: [222, 10, 58], accent: [25, 40, 48], border: [230, 25, 18] },
        radius: 1.25, materialClass: "ss-crystal--deep", fontFamily: "var(--font-headline)", motion: 1,
        glass: { blur: 24, opacity: 0.62, refraction: 1.3, saturation: 175, borderWidth: 1.25 },
        colors: ["#D9A54A", "#9AA0A6", "#7A4E2A"],
    },
];

/** Los ~24 ThemePacks builtin, ya construidos. */
export const BUILTIN_THEMES: ThemePack[] = THEME_SPECS.map(makePack);

/** Efecto de carga: registra el catálogo en THEME_REGISTRY (theme-engine.ts). */
for (const pack of BUILTIN_THEMES) registerTheme(pack);

/** Ids del catálogo builtin (útil para packages.ts / exclusión de RECOMMENDED). */
export const BUILTIN_THEME_IDS: string[] = BUILTIN_THEMES.map((t) => t.id);
