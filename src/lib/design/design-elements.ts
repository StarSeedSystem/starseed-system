"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * design-elements — Catálogo de ELEMENTOS DE DISEÑO SUELTOS (paleta, material,
 * fondo, tipografía, animaciones, efectos) — la unidad "de un solo slot" que
 * el Mezclador (theme-mixer.ts) combina junto a ThemePacks completos.
 * ---------------------------------------------------------------------------
 * Igual que theme-catalog.ts, este archivo SOLO CONSUME el contrato congelado
 * `theme-engine.ts` (tipo `ThemeTokens`) — nunca lo modifica. Reutiliza los
 * helpers de autoría de theme-catalog.ts (roleVars/hs/glassVars/H/RoleSet/
 * GlassSpec) para que paletas y materiales sueltos deriven foreground legible,
 * card elevada, border sutil, etc. con la MISMA convención que los 24 temas
 * del catálogo — cero divergencia de estilo.
 *
 * Cada `DesignElementDef` cubre EXCLUSIVAMENTE los campos de su `kind` (nunca
 * mezcla paleta+material en un mismo elemento) — así el Mezclador puede
 * tratarlos como fuente de UN slot sin ambigüedad:
 *   · paleta       → vars de rol (background/foreground/primary/secondary/…)
 *   · material     → materialClass + knobs de cristal (blur/opacity/refraction/…)
 *   · fondo        → `background` (id de backgrounds.ts) — derivado 1:1 del
 *                     registro real, nunca duplicado a mano.
 *   · tipografia   → `fontFamily` (mismas variables ya cargadas que usa
 *                     appearance-context.tsx en su selector de fuente).
 *   · animaciones  → `motion` + `vars["dur-base"]` (ms) — el mismo par que
 *                     appearance-context.tsx sincroniza con --dur-base.
 *   · efectos      → vars de glow/grano/aberración (neon-glow/glass-aberration/
 *                     glass-noise) — las sombras MULTI-CAPA por elemento viven
 *                     en el Estudio (ElementOverride.shadow), no aquí: esto es
 *                     el knob GLOBAL de brillo/aberración ya leído por
 *                     globals.css.
 *   · densidad     → `vars.radius` (mismo `radiusToken()` responsivo que usan
 *                     los 24 temas builtin). No estaba en la lista original de
 *                     categorías de Librería pero se añade por consistencia:
 *                     así los 7 slots del Mezclador tienen SIEMPRE fuentes
 *                     propias, no solo temas completos.
 *
 * `light`/`dark` son ambos `Partial<ThemeTokens>`. Para paleta/material (que
 * SÍ cambian de forma significativa entre modos) se autoran ambos a mano; el
 * resto de kinds son mode-agnósticos → `dark` se omite y el Mezclador reusa
 * `light` para ambos modos (documentado en theme-mixer.ts).
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { ThemeTokens } from "./theme-engine";
import { type H, type RoleSet, type GlassSpec, roleVars, glassVars, hslToRgb, radiusToken } from "./theme-catalog";
import { listBackgrounds } from "./backgrounds";

export type DesignElementKind = "paleta" | "material" | "fondo" | "tipografia" | "animaciones" | "efectos" | "densidad";

export interface DesignElementDef {
    id: string;
    kind: DesignElementKind;
    name: string;
    description: string;
    light: Partial<ThemeTokens>;
    /** Si se omite, el Mezclador reusa `light` (kinds mode-agnósticos). */
    dark?: Partial<ThemeTokens>;
    /** 1-3 hex para preview de catálogo. */
    preview: string[];
}

function hex(h: H): string {
    const [r, g, b] = hslToRgb(h[0], h[1], h[2]);
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/* ═══════════════════════════════ Paletas sueltas ═══════════════════════════ */

interface PaletteSpec { id: string; name: string; description: string; light: RoleSet; dark: RoleSet; }

const PALETTE_SPECS: PaletteSpec[] = [
    {
        id: "ambar-solar", name: "Ámbar Solar",
        description: "Dorado cálido y terracota — energía de mediodía.",
        light: { bg: [38, 45, 96], fg: [22, 40, 14], primary: [38, 80, 50], secondary: [16, 55, 42], accent: [46, 85, 55], border: [38, 30, 82] },
        dark: { bg: [24, 30, 8], fg: [38, 35, 92], primary: [38, 85, 58], secondary: [16, 55, 52], accent: [46, 90, 60], border: [24, 25, 20] },
    },
    {
        id: "esmeralda-profunda", name: "Esmeralda Profunda",
        description: "Verde esmeralda con acentos de oro viejo.",
        light: { bg: [150, 25, 96], fg: [155, 45, 12], primary: [155, 55, 34], secondary: [42, 55, 48], accent: [170, 45, 38], border: [150, 22, 82] },
        dark: { bg: [155, 35, 7], fg: [140, 30, 92], primary: [155, 55, 48], secondary: [42, 60, 55], accent: [170, 50, 48], border: [155, 28, 18] },
    },
    {
        id: "magenta-acido", name: "Magenta Ácido",
        description: "Fucsia eléctrico y lima — máxima energía visual.",
        light: { bg: [0, 0, 98], fg: [320, 20, 10], card: [0, 0, 100], primary: [320, 90, 55], secondary: [80, 70, 42], accent: [190, 85, 50], border: [0, 0, 88] },
        dark: { bg: [320, 30, 7], fg: [80, 20, 94], primary: [320, 95, 62], secondary: [80, 75, 55], accent: [190, 90, 58], border: [320, 25, 18] },
    },
    {
        id: "indigo-real", name: "Índigo Real",
        description: "Índigo profundo con destellos de oro estelar.",
        light: { bg: [245, 35, 96], fg: [245, 45, 14], primary: [245, 55, 46], secondary: [45, 75, 52], accent: [265, 45, 55], border: [245, 25, 84] },
        dark: { bg: [245, 50, 8], fg: [45, 30, 90], primary: [245, 60, 62], secondary: [45, 80, 60], accent: [265, 55, 65], border: [245, 35, 18] },
    },
    {
        id: "coral-vivo", name: "Coral Vivo",
        description: "Coral cálido y turquesa — mar tropical.",
        light: { bg: [15, 55, 96], fg: [10, 40, 16], primary: [8, 78, 58], secondary: [185, 60, 42], accent: [40, 80, 55], border: [15, 35, 84] },
        dark: { bg: [10, 35, 9], fg: [15, 35, 92], primary: [8, 82, 62], secondary: [185, 65, 52], accent: [40, 85, 60], border: [10, 28, 20] },
    },
    {
        id: "grafito-puro", name: "Grafito Puro",
        description: "Grises neutros con un único acento azul contenido.",
        light: { bg: [220, 8, 96], fg: [220, 20, 14], card: [220, 10, 99], primary: [212, 40, 44], secondary: [220, 8, 42], accent: [200, 30, 40], border: [220, 10, 86] },
        dark: { bg: [220, 15, 8], fg: [220, 10, 92], primary: [212, 45, 58], secondary: [220, 8, 58], accent: [200, 35, 55], border: [220, 15, 20] },
    },
    {
        id: "menta-fria", name: "Menta Fría",
        description: "Verde agua sereno con violeta suave.",
        light: { bg: [165, 35, 96], fg: [170, 35, 14], primary: [165, 55, 42], secondary: [265, 40, 55], accent: [180, 45, 45], border: [165, 22, 82] },
        dark: { bg: [170, 30, 8], fg: [165, 25, 92], primary: [165, 55, 55], secondary: [265, 45, 65], accent: [180, 50, 55], border: [170, 24, 18] },
    },
    {
        id: "cuarzo-rosa", name: "Cuarzo Rosa",
        description: "Rosa cuarzo y lavanda — dulzura mineral.",
        light: { bg: [335, 45, 97], fg: [300, 25, 18], card: [335, 45, 99], primary: [335, 60, 68], secondary: [260, 40, 62], accent: [20, 55, 65], border: [335, 30, 88] },
        dark: { bg: [300, 25, 12], fg: [335, 30, 92], primary: [335, 65, 68], secondary: [260, 45, 68], accent: [20, 60, 65], border: [300, 20, 24] },
    },
];

function buildPaletteElements(): DesignElementDef[] {
    return PALETTE_SPECS.map((s) => ({
        id: `paleta-${s.id}`,
        kind: "paleta" as const,
        name: s.name,
        description: s.description,
        light: { vars: roleVars(s.light) },
        dark: { vars: roleVars(s.dark) },
        preview: [hex(s.light.primary), hex(s.light.secondary), hex(s.light.accent)],
    }));
}

/* ═══════════════════════════════ Materiales sueltos ════════════════════════ */

interface MaterialSpec {
    id: string; name: string; description: string; materialClass: string;
    glass: GlassSpec; glassDark?: GlassSpec; preview: string[];
}

const MATERIAL_SPECS: MaterialSpec[] = [
    {
        id: "cristal-templado", name: "Cristal Templado", materialClass: "ss-crystal",
        description: "Vidrio limpio de blur alto y refracción media — la superficie Zenith clásica.",
        glass: { blur: 24, opacity: 0.55, refraction: 0.7, saturation: 165, frost: 0.4 },
        preview: ["#BFDBFE", "#F8FAFC", "#0B1020"],
    },
    {
        id: "cristal-profundo", name: "Cristal Profundo", materialClass: "ss-crystal--deep",
        description: "El máximo de refracción y profundidad — luz atrapada en cada borde.",
        glass: { blur: 30, opacity: 0.5, refraction: 1.5, saturation: 185, frost: 0.35 },
        preview: ["#93C5FD", "#E0F2FE", "#0B1020"],
    },
    {
        id: "metal-brunido", name: "Metal Bruñido", materialClass: "ss-metal",
        description: "Titanio y latón — precisión fría de la maquinaria bien hecha.",
        glass: { blur: 9, opacity: 0.86, refraction: 0.12, saturation: 125, borderWidth: 1.5 },
        preview: ["#D4AF37", "#8B8F98", "#3A3A3E"],
    },
    {
        id: "madera-antigua", name: "Madera Antigua", materialClass: "ss-wood",
        description: "Vetas cálidas y nudos naturales de un taller al atardecer.",
        glass: { blur: 11, opacity: 0.85, refraction: 0.1, saturation: 118, frost: 0.55 },
        preview: ["#7A4E2A", "#C8873A", "#3B2314"],
    },
    {
        id: "neon-callejero", name: "Neón Callejero", materialClass: "ss-neon",
        description: "Bordes que respiran luz y aberración cromática al límite.",
        glass: { blur: 14, opacity: 0.55, refraction: 1, saturation: 180, neon: 1, aberration: 3 },
        preview: ["#D946EF", "#22D3EE", "#0A0A12"],
    },
    {
        id: "naturaleza-viva", name: "Naturaleza Viva", materialClass: "ss-nature",
        description: "Biofilia: frost alto, saturación de bosque filtrado por hojas.",
        glass: { blur: 19, opacity: 0.66, refraction: 0.4, saturation: 145, frost: 0.62 },
        preview: ["#4ADE80", "#166534", "#F5F0E1"],
    },
];

function buildMaterialElements(): DesignElementDef[] {
    return MATERIAL_SPECS.map((s) => ({
        id: `material-${s.id}`,
        kind: "material" as const,
        name: s.name,
        description: s.description,
        light: { materialClass: s.materialClass, vars: glassVars(s.glass) },
        dark: { materialClass: s.materialClass, vars: glassVars(s.glassDark ?? s.glass) },
        preview: s.preview,
    }));
}

/* ═══════════════════════════════ Fondos animados ═══════════════════════════ */
/** Derivados 1:1 de backgrounds.ts — fuente única de verdad, cero duplicado. */
function buildBackgroundElements(): DesignElementDef[] {
    return listBackgrounds().map((b) => ({
        id: `fondo-${b.id}`,
        kind: "fondo" as const,
        name: b.name,
        description: b.description,
        light: { background: b.id },
        preview: ["#0F172A", "#1E293B", "#38BDF8"],
    }));
}

/* ═══════════════════════════════ Tipografías ═══════════════════════════════ */
/** Mismas variables/valores YA cargados que usa el fontMap de
 *  appearance-context.tsx — nunca se inventa una familia nueva. */
interface TypeSpec { id: string; name: string; description: string; fontFamily: string; }
const TYPE_SPECS: TypeSpec[] = [
    { id: "inter-limpia", name: "Inter · Limpia", description: "Sans neutra de alta legibilidad — el cuerpo de texto por defecto del OS.", fontFamily: "var(--font-inter)" },
    { id: "outfit-redondeada", name: "Outfit · Redondeada", description: "Geométrica y amable, terminales suaves.", fontFamily: "var(--font-outfit)" },
    { id: "editorial-headline", name: "Editorial", description: "Space Grotesk — carácter tipográfico para titulares con peso.", fontFamily: "var(--font-headline)" },
    { id: "tecnica-code", name: "Técnica", description: "Source Code Pro — monoespaciada, estética terminal/matrix.", fontFamily: "var(--font-code)" },
    { id: "satoshi-moderna", name: "Satoshi · Moderna", description: "Sans contemporánea de trazo firme, ideal para pop/punk.", fontFamily: "'Satoshi', sans-serif" },
    { id: "roboto-neutra", name: "Roboto · Neutra", description: "Sans funcional, muy legible en pantalla a cualquier tamaño.", fontFamily: "var(--font-roboto)" },
    { id: "sistema-nativa", name: "Sistema · Nativa", description: "La tipografía nativa del dispositivo — cero descarga, máxima velocidad.", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
];

function buildTypographyElements(): DesignElementDef[] {
    return TYPE_SPECS.map((s) => ({
        id: `tipografia-${s.id}`,
        kind: "tipografia" as const,
        name: s.name,
        description: s.description,
        light: { fontFamily: s.fontFamily },
        preview: ["#E2E8F0", "#94A3B8", "#0F172A"],
    }));
}

/* ═══════════════════════════════ Animaciones (motion+transición) ═══════════ */
interface MotionSpec { id: string; name: string; description: string; motion: number; durMs: number; }
const MOTION_SPECS: MotionSpec[] = [
    { id: "quieta", name: "Quieta", description: "Movimiento mínimo, transiciones pausadas — foco sin distracción.", motion: 0.5, durMs: 340 },
    { id: "suave", name: "Suave", description: "Un paso por debajo del equilibrio: calma sin ser estática.", motion: 0.8, durMs: 260 },
    { id: "equilibrada", name: "Equilibrada", description: "El ritmo estándar del OS.", motion: 1, durMs: 220 },
    { id: "viva", name: "Viva", description: "Más energía y rapidez en cada transición.", motion: 1.3, durMs: 180 },
    { id: "frenetica", name: "Frenética", description: "Máxima intensidad de movimiento — cyberpunk/pop puro.", motion: 1.6, durMs: 130 },
];

function buildMotionElements(): DesignElementDef[] {
    return MOTION_SPECS.map((s) => ({
        id: `animaciones-${s.id}`,
        kind: "animaciones" as const,
        name: s.name,
        description: s.description,
        light: { motion: s.motion, vars: { "dur-base": `${s.durMs}ms` } },
        preview: ["#8B5CF6", "#F5A623", "#1F9D6B"],
    }));
}

/* ═══════════════════════════════ Efectos (glow/grano/aberración) ═══════════ */
interface EffectSpec { id: string; name: string; description: string; neon: number; aberration: number; noise: number; }
const EFFECT_SPECS: EffectSpec[] = [
    { id: "cristal-puro", name: "Cristal Puro", description: "Sin glow ni grano — claridad total, cero efectos añadidos.", neon: 0, aberration: 0, noise: 0 },
    { id: "resplandor-sutil", name: "Resplandor Sutil", description: "Un glow discreto en bordes activos, nada más.", neon: 0.3, aberration: 0, noise: 0 },
    { id: "neon-total", name: "Neón Total", description: "Glow al máximo con aberración cromática visible.", neon: 1, aberration: 2, noise: 0 },
    { id: "aberracion-cromatica", name: "Aberración Cromática", description: "Fantasma RGB pronunciado en los bordes — synthwave/glitch.", neon: 0.4, aberration: 4, noise: 0 },
    { id: "grano-fino", name: "Grano Fino", description: "Textura de grano sutil + glow mínimo — analógico, imperfecto.", neon: 0.1, aberration: 0, noise: 0.12 },
];

function buildEffectElements(): DesignElementDef[] {
    return EFFECT_SPECS.map((s) => ({
        id: `efectos-${s.id}`,
        kind: "efectos" as const,
        name: s.name,
        description: s.description,
        light: { vars: { "neon-glow": String(s.neon), "glass-aberration": `${s.aberration}px`, "glass-noise": String(s.noise) } },
        preview: ["#D946EF", "#22D3EE", "#0A0A12"],
    }));
}

/* ═══════════════════════════════ Densidad (radio) ══════════════════════════
 * No pedida explícitamente como categoría de Librería en la especificación,
 * pero necesaria para que el slot "densidad" del Mezclador tenga fuentes
 * propias además de los ~24 temas — se añade por consistencia (mismo patrón
 * exacto que el resto, cero coste). Usa `radiusToken()` de theme-catalog.ts
 * para heredar el MISMO comportamiento responsivo (clamp por vw) que ya usan
 * los 24 temas builtin — nunca un rem fijo suelto. */
interface DensitySpec { id: string; name: string; description: string; rem: number; }
const DENSITY_SPECS: DensitySpec[] = [
    { id: "afilada", name: "Afilada", description: "Esquinas casi rectas — art-déco/punk.", rem: 0.2 },
    { id: "contenida", name: "Contenida", description: "Redondeo discreto — profesional.", rem: 0.6 },
    { id: "equilibrada", name: "Equilibrada", description: "El redondeo estándar del OS.", rem: 1.25 },
    { id: "suave", name: "Suave", description: "Curvas amables — infantil/hippie.", rem: 1.75 },
    { id: "organica", name: "Orgánica", description: "Máximo redondeo — cápsulas y burbujas.", rem: 2.25 },
];

function buildDensityElements(): DesignElementDef[] {
    return DENSITY_SPECS.map((s) => ({
        id: `densidad-${s.id}`,
        kind: "densidad" as const,
        name: s.name,
        description: s.description,
        light: { vars: { radius: radiusToken(s.rem) } },
        preview: ["#8B5CF6", "#F5A623", "#1F9D6B"],
    }));
}

/* ═══════════════════════════════ Registro ══════════════════════════════════ */

export const DESIGN_ELEMENTS: DesignElementDef[] = [
    ...buildPaletteElements(),
    ...buildMaterialElements(),
    ...buildBackgroundElements(),
    ...buildTypographyElements(),
    ...buildMotionElements(),
    ...buildEffectElements(),
    ...buildDensityElements(),
];

export function listDesignElements(kind?: DesignElementKind): DesignElementDef[] {
    return kind ? DESIGN_ELEMENTS.filter((e) => e.kind === kind) : DESIGN_ELEMENTS;
}

export function getDesignElement(id: string): DesignElementDef | null {
    return DESIGN_ELEMENTS.find((e) => e.id === id) ?? null;
}
