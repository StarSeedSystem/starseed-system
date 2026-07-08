"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * theme-mixer — MEZCLADOR DE DISEÑOS: fusión POR CAPAS/SLOTS de StarSeed OS.
 * ---------------------------------------------------------------------------
 * Combina hasta 7 SLOTS independientes — paleta, material, fondo, tipografía,
 * animaciones, densidad, efectos — cada uno tomado de un ThemePack completo
 * (theme-catalog.ts + temas personalizados) o de un elemento suelto
 * (design-elements.ts), en un único ThemePack final coherente.
 *
 * SOLO CONSUME el contrato congelado `theme-engine.ts` (ThemeTokens/ThemePack)
 * — nunca lo modifica. Determinista: la MISMA selección de slots produce
 * SIEMPRE el mismo resultado (sin aleatoriedad oculta) — la única función con
 * azar es `randomMixSlots()`, pensada para "Sorpréndeme" en la UI.
 *
 * ── Separación de slots (qué campo de ThemeTokens pertenece a cada uno) ────
 *   paleta      → vars de rol: *-hsl, *-rgb (paleta de color completa)
 *   material    → materialClass + vars de superficie: glass-blur/-opacity/
 *                 -refraction/-saturation/-frost/border-width
 *   fondo       → vars.background (id de backgrounds.ts)
 *   tipografia  → vars.fontFamily
 *   animaciones → vars.motion + vars["dur-base"] (ms, ya leído por globals.css)
 *   densidad    → vars.radius
 *   efectos     → vars: neon-glow/glass-aberration/glass-noise
 * Cada slot solo puede escribir SUS claves (SLOT_VAR_KEYS/SLOT_TOP_FIELD) —
 * así ningún slot pisa a otro aunque su fuente sea un ThemePack completo.
 *
 * ── Armonización automática (determinista, ver funciones abajo) ────────────
 *   1) Contraste AA real (WCAG, luminancia relativa) en los 8 pares fg/bg de
 *      la paleta resultante — ajusta la LIGHTNESS del foreground (conserva H/S)
 *      hasta alcanzar 4.5:1 o el límite del rango.
 *   2) Saturación equilibrada entre acentos (primary/secondary/accent): si el
 *      rango de saturación es grande, atenúa los extremos hacia la media.
 *   3) Radio/borde/glow escalados coherentemente: el grosor de borde y el
 *      resplandor neón se reescalan en función del radio y de la intensidad
 *      de movimiento resultantes (un radio muy afilado admite bordes más
 *      gruesos; un motion bajo pide un glow más discreto).
 * El VALIDADOR (separado de la armonización automática) añade avisos que NO
 * se corrigen solos: contraste que sigue por debajo de AA tras el ajuste, o
 * choque de saturación que persiste tras el equilibrado.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { listThemes, type ThemePack, type ThemeTokens } from "./theme-engine";
import { BUILTIN_THEMES, hslToRgb, hs, rgbStr, type H } from "./theme-catalog";
import { listDesignElements, getDesignElement, type DesignElementKind } from "./design-elements";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export type MixSlotId = "paleta" | "material" | "fondo" | "tipografia" | "animaciones" | "densidad" | "efectos";

export const SLOT_ORDER: MixSlotId[] = ["paleta", "material", "fondo", "tipografia", "animaciones", "densidad", "efectos"];

export const SLOT_LABELS: Record<MixSlotId, string> = {
    paleta: "Paleta", material: "Material", fondo: "Fondo", tipografia: "Tipografía",
    animaciones: "Animaciones", densidad: "Densidad", efectos: "Efectos",
};

export const SLOT_DESCRIPTIONS: Record<MixSlotId, string> = {
    paleta: "Colores de fondo, texto y acentos.",
    material: "Cristal, metal, madera… la superficie de las tarjetas y paneles.",
    fondo: "Fondo animado opcional (matrix, estrellas, aurora, clima en vivo).",
    tipografia: "Familia tipográfica del cuerpo del sistema.",
    animaciones: "Intensidad de movimiento y velocidad de transición.",
    densidad: "Radio de esquinas — de afilado a orgánico.",
    efectos: "Resplandor neón, aberración cromática y grano.",
};

/** "none" = sin elección propia → usa el slot equivalente del tema "Equilibrado".
 *  "theme" toma el slot de un ThemePack (builtin o personalizado) por su id.
 *  "element" toma el slot de un DesignElement suelto (design-elements.ts). */
export interface MixSource {
    kind: "none" | "theme" | "element";
    id?: string;
    /** Solo relevante si kind==="theme". "auto" (defecto): claro→claro, oscuro→oscuro.
     *  Fijar "light"/"dark" congela ESA variante para ambos modos del resultado
     *  (p.ej. "quiero el Cyberpunk oscuro incluso en mi tema claro"). */
    mode?: "auto" | "light" | "dark";
}

export type MixSlots = Record<MixSlotId, MixSource>;

export function emptyMixSlots(): MixSlots {
    const out = {} as MixSlots;
    for (const s of SLOT_ORDER) out[s] = { kind: "none" };
    return out;
}

export interface MixWarning {
    slot: MixSlotId | "global";
    level: "info" | "warn";
    message: string;
}

export interface MixResult {
    pack: ThemePack;
    warnings: MixWarning[];
    /** Slots que no tenían elección propia y cayeron al valor de "Equilibrado". */
    usedBaseline: MixSlotId[];
}

export interface MixOption {
    source: MixSource;
    label: string;
    sublabel?: string;
    preview: string[];
}

/* ──────────────────────── Reparto de claves por slot ───────────────────── */

const PALETTE_VAR_KEYS = [
    "background-hsl", "foreground-hsl", "card-hsl", "card-foreground-hsl",
    "popover-hsl", "popover-foreground-hsl", "primary-hsl", "primary-foreground-hsl", "primary-rgb",
    "secondary-hsl", "secondary-foreground-hsl", "accent-hsl", "accent-foreground-hsl",
    "muted-hsl", "muted-foreground-hsl", "destructive-hsl", "destructive-foreground-hsl",
    "border-hsl", "input-hsl", "ring-hsl",
];
const MATERIAL_VAR_KEYS = ["glass-blur", "glass-opacity", "glass-refraction", "glass-saturation", "glass-frost", "border-width"];
const DENSITY_VAR_KEYS = ["radius"];
const EFFECTS_VAR_KEYS = ["neon-glow", "glass-aberration", "glass-noise"];
const MOTION_VAR_KEYS = ["dur-base"];

const SLOT_VAR_KEYS: Record<MixSlotId, string[]> = {
    paleta: PALETTE_VAR_KEYS, material: MATERIAL_VAR_KEYS, fondo: [], tipografia: [],
    animaciones: MOTION_VAR_KEYS, densidad: DENSITY_VAR_KEYS, efectos: EFFECTS_VAR_KEYS,
};

const SLOT_TOP_FIELD: Partial<Record<MixSlotId, "materialClass" | "background" | "fontFamily" | "motion">> = {
    material: "materialClass", fondo: "background", tipografia: "fontFamily", animaciones: "motion",
};

/** Extrae SOLO las claves que pertenecen a `slot` de un ThemeTokens (parcial). */
function extractSlot(slot: MixSlotId, tokens: Partial<ThemeTokens> | null | undefined): Partial<ThemeTokens> {
    if (!tokens) return {};
    const out: Partial<ThemeTokens> = {};
    const keys = SLOT_VAR_KEYS[slot];
    if (keys.length && tokens.vars) {
        const vars: Record<string, string> = {};
        for (const k of keys) if (tokens.vars[k] !== undefined) vars[k] = tokens.vars[k];
        if (Object.keys(vars).length) out.vars = vars;
    }
    const topField = SLOT_TOP_FIELD[slot];
    if (topField) {
        const v = tokens[topField];
        if (v !== undefined) (out as Record<string, unknown>)[topField] = v;
    }
    return out;
}

function isEmptyTokens(t: Partial<ThemeTokens>): boolean {
    return !t.vars && t.materialClass === undefined && t.background === undefined && t.fontFamily === undefined && t.motion === undefined;
}

/* ───────────────────────── Resolución de fuentes ────────────────────────── */

function resolveSourceTokens(slot: MixSlotId, source: MixSource | undefined): { light: Partial<ThemeTokens>; dark: Partial<ThemeTokens> } {
    if (!source || source.kind === "none" || !source.id) return { light: {}, dark: {} };

    if (source.kind === "theme") {
        const pack = listThemes().find((t) => t.id === source.id);
        if (!pack) return { light: {}, dark: {} };
        if (source.mode === "light") {
            const t = pack.modes.light ?? pack.modes.dark;
            return { light: extractSlot(slot, t), dark: extractSlot(slot, t) };
        }
        if (source.mode === "dark") {
            const t = pack.modes.dark ?? pack.modes.light;
            return { light: extractSlot(slot, t), dark: extractSlot(slot, t) };
        }
        const lt = pack.modes.light ?? pack.modes.dark;
        const dt = pack.modes.dark ?? pack.modes.light;
        return { light: extractSlot(slot, lt), dark: extractSlot(slot, dt) };
    }

    // element
    const el = getDesignElement(source.id);
    if (!el) return { light: {}, dark: {} };
    return { light: extractSlot(slot, el.light), dark: extractSlot(slot, el.dark ?? el.light) };
}

/* ───────────────────────────── Línea base ───────────────────────────────── */
/** "Equilibrado" (theme-catalog.ts) es el respaldo honesto para slots sin
 *  elección propia — así una mezcla parcial SIEMPRE produce un ThemePack
 *  completo y accesible, nunca variables a medias. */
function baselinePack(): ThemePack {
    return BUILTIN_THEMES.find((t) => t.id === "equilibrado") ?? BUILTIN_THEMES[0];
}

/* ═══════════════════════ Armonización — contraste AA real ═══════════════════ */

function parseHsl(str: string | undefined): { h: number; s: number; l: number } | null {
    if (!str) return null;
    const m = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(str);
    if (!m) return null;
    return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function relLuminance(h: number, s: number, l: number): number {
    const [r, g, b] = hslToRgb(h, s, l).map((v) => v / 255);
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(l1: number, l2: number): number {
    const a = Math.max(l1, l2);
    const b = Math.min(l1, l2);
    return (a + 0.05) / (b + 0.05);
}

function contrastOf(bg: string, fg: string): number {
    const b = parseHsl(bg);
    const f = parseHsl(fg);
    if (!b || !f) return 21;
    return contrastRatio(relLuminance(b.h, b.s, b.l), relLuminance(f.h, f.s, f.l));
}

/** Ajusta la LIGHTNESS del foreground (conserva H/S) empujándola hacia el
 *  extremo que MÁS contraste da contra `bg`, paso a paso, hasta `target` o
 *  hasta agotar el rango [0,100]. En el límite, además recorta la saturación
 *  (evita un color "sucio" a extremos de negro/blanco casi puro). */
function adjustForegroundForAA(bg: string, fg: string, target = 4.5): { value: string; ratio: number; changed: boolean } {
    const b = parseHsl(bg);
    const f = parseHsl(fg);
    if (!b || !f) return { value: fg, ratio: 21, changed: false };
    const bgLum = relLuminance(b.h, b.s, b.l);
    let l = f.l;
    let ratio = contrastRatio(bgLum, relLuminance(f.h, f.s, l));
    if (ratio >= target) return { value: fg, ratio, changed: false };

    // Qué dirección da MÁS contraste de verdad: comparamos el contraste
    // MÁXIMO alcanzable hacia cada extremo (L=0 vs L=100) y empujamos hacia
    // el que gane. Importante: NO se puede decidir esto con "¿el fondo es
    // claro?" a partir de su lightness HSL — el cruce real en la fórmula
    // WCAG ((Lclaro+0.05)/(Loscuro+0.05)) NO está en luminancia 0.5, está en
    // ≈0.179 (el punto donde el contraste contra negro puro iguala al
    // contraste contra blanco puro). Un color saturado con L=55% suele tener
    // luminancia relativa MUY por debajo de 0.5, así que un umbral de 0.5
    // elige la dirección equivocada justo en los casos donde más falta hace
    // (probado con el color "destructivo" por defecto del catálogo: L=0 da
    // 5.2:1 pero L=100 solo 4.0:1 — un umbral de 0.5 habría empujado hacia
    // blanco, el lado peor).
    const towardBlack = contrastRatio(bgLum, relLuminance(f.h, f.s, 0));
    const towardWhite = contrastRatio(bgLum, relLuminance(f.h, f.s, 100));
    const goingDark = towardBlack >= towardWhite;
    const step = goingDark ? -1 : 1;
    let guard = 0;
    while (ratio < target && guard < 100 && l > 0 && l < 100) {
        l = Math.max(0, Math.min(100, l + step));
        ratio = contrastRatio(bgLum, relLuminance(f.h, f.s, l));
        guard++;
    }
    const s = l <= 4 || l >= 96 ? Math.min(f.s, 18) : f.s;
    return { value: hs([f.h, s, l] as H), ratio, changed: true };
}

/* ═══════════════════════ Armonización — saturación de acentos ═══════════════ */

/** Si primary/secondary/accent tienen saturaciones muy dispares, atenúa los
 *  extremos un 40% hacia la media (nunca los iguala del todo — conserva
 *  carácter). Solo actúa si el rango supera 38 puntos (evita tocar paletas
 *  ya coherentes). Devuelve un mensaje si tocó algo (para el validador). */
function equilibrateAccentSaturation(vars: Record<string, string>): string | null {
    const keys = ["primary-hsl", "secondary-hsl", "accent-hsl"] as const;
    const parsed = keys.map((k) => ({ k, v: parseHsl(vars[k]) })).filter((x) => x.v);
    if (parsed.length < 2) return null;
    const sats = parsed.map((x) => x.v!.s);
    const mean = sats.reduce((a, b) => a + b, 0) / sats.length;
    const spread = Math.max(...sats) - Math.min(...sats);
    if (spread <= 38) return null;
    const damping = 0.4;
    for (const { k, v } of parsed) {
        if (!v) continue;
        const next = v.s + (mean - v.s) * damping;
        const adjustedH: H = [v.h, Math.round(next), v.l];
        vars[k] = hs(adjustedH);
        // `primary-rgb` es un DERIVADO de `primary-hsl` (roleVars() lo genera
        // para rgba(var(--primary-rgb),…) en sombras/glows) — si tocamos el
        // hue/saturación de primary aquí, el rgb tiene que seguirlo o queda
        // desincronizado (glow del color viejo, paleta del nuevo).
        if (k === "primary-hsl" && vars["primary-rgb"] !== undefined) {
            vars["primary-rgb"] = rgbStr(adjustedH);
        }
    }
    return `Saturación de los acentos equilibrada (rango original de ${Math.round(spread)} puntos)`;
}

/* ═══════════════════ Armonización — radio/borde/glow coherentes ═══════════════ */

/** El radio de theme-catalog.ts es un `clamp(min, vw, REM)` — el valor de
 *  autoría es el ÚLTIMO número "Xrem" del string. Funciona igual para un
 *  valor plano ("1.25rem"), que solo tiene una coincidencia. */
function authorRem(radius: string | undefined): number | null {
    if (!radius) return null;
    const matches = radius.match(/(\d+(?:\.\d+)?)rem/g);
    if (!matches || !matches.length) return null;
    const n = parseFloat(matches[matches.length - 1]);
    return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

/** Grosor de borde reescalado según el radio resultante: un radio afilado
 *  admite (y pide) un borde más presente; uno muy redondeado pide uno más
 *  fino para no verse pesado. Cambio proporcional acotado — nunca dispara el
 *  valor de autoría del material a un extremo irreconocible. */
function coherentRadiusBorder(vars: Record<string, string>): void {
    const rem = authorRem(vars["radius"]);
    const bwStr = vars["border-width"];
    if (rem == null || !bwStr) return;
    const bw = parseFloat(bwStr);
    if (!Number.isFinite(bw)) return;
    const norm = clamp(rem / 1.25, 0.4, 2.2); // 1.25rem = referencia "equilibrado"
    const scaled = clamp(bw * Math.pow(1 / norm, 0.4), 0.5, 4);
    vars["border-width"] = `${Math.round(scaled * 10) / 10}px`;
}

/** El glow neón se acopla suavemente a la intensidad de movimiento resultante:
 *  motion bajo (calma) atenúa el glow; motion alto lo deja pleno o lo realza
 *  ligeramente. Rango de acoplamiento modesto (±25%) — nunca apaga ni dispara
 *  un glow que el usuario eligió explícitamente. */
function coherentGlowMotion(vars: Record<string, string>, motion: number | undefined): void {
    if (motion === undefined) return;
    const glowStr = vars["neon-glow"];
    if (glowStr === undefined) return;
    const glow = parseFloat(glowStr);
    if (!Number.isFinite(glow) || glow <= 0) return;
    const factor = 0.75 + 0.25 * clamp(motion, 0, 2);
    vars["neon-glow"] = String(Math.round(clamp(glow * factor, 0, 1.4) * 100) / 100);
}

/* ══════════════════════════════ mixThemes() ═══════════════════════════════ */

export interface MixThemesOptions {
    id?: string;
    name?: string;
    description?: string;
}

function hexFromHslStr(str: string | undefined): string | null {
    const p = parseHsl(str);
    if (!p) return null;
    const [r, g, b] = hslToRgb(p.h, p.s, p.l);
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

const CONTRAST_PAIRS: Array<[string, string, string]> = [
    ["background-hsl", "foreground-hsl", "fondo general"],
    ["card-hsl", "card-foreground-hsl", "tarjetas"],
    ["popover-hsl", "popover-foreground-hsl", "menús"],
    ["primary-hsl", "primary-foreground-hsl", "botón primario"],
    ["secondary-hsl", "secondary-foreground-hsl", "botón secundario"],
    ["accent-hsl", "accent-foreground-hsl", "acento"],
    ["muted-hsl", "muted-foreground-hsl", "texto atenuado"],
    ["destructive-hsl", "destructive-foreground-hsl", "destructivo"],
];

interface ModeAcc { vars: Record<string, string>; materialClass?: string; background?: string; fontFamily?: string; motion?: number }

function mergeInto(acc: ModeAcc, part: Partial<ThemeTokens>): void {
    if (part.vars) Object.assign(acc.vars, part.vars);
    if (part.materialClass !== undefined) acc.materialClass = part.materialClass;
    if (part.background !== undefined) acc.background = part.background;
    if (part.fontFamily !== undefined) acc.fontFamily = part.fontFamily;
    if (part.motion !== undefined) acc.motion = part.motion;
}

function harmonizeMode(acc: ModeAcc, warnings: MixWarning[], modeLabel: "claro" | "oscuro"): void {
    const v = acc.vars;

    // Orden importa: el equilibrado de saturación MUTA primary/secondary/
    // accent-hsl (cambia su luminancia relativa, aunque conserve la
    // lightness) — tiene que correr ANTES del paso de contraste AA, para que
    // este último reaccione a los colores DEFINITIVOS y no a unos que luego
    // cambian por debajo. Con el orden inverso, un ajuste de contraste podría
    // quedar ligeramente desactualizado tras el equilibrado de saturación.
    const satMsg = equilibrateAccentSaturation(v);
    if (satMsg) warnings.push({ slot: "paleta", level: "info", message: `${satMsg} (modo ${modeLabel}).` });

    for (const [bgKey, fgKey, label] of CONTRAST_PAIRS) {
        const bg = v[bgKey];
        const fg = v[fgKey];
        if (!bg || !fg) continue;
        const { value, ratio, changed } = adjustForegroundForAA(bg, fg, 4.5);
        if (changed) v[fgKey] = value;
        const finalRatio = changed ? ratio : contrastOf(bg, fg);
        if (finalRatio < 4.5) {
            warnings.push({
                slot: "paleta", level: "warn",
                message: `Contraste bajo en ${label} (modo ${modeLabel}): ${finalRatio.toFixed(1)}:1 tras el ajuste — objetivo AA 4.5:1.`,
            });
        }
    }

    coherentRadiusBorder(v);
    coherentGlowMotion(v, acc.motion);
}

/**
 * Fusiona los 7 slots en un único ThemePack — determinista: la misma entrada
 * produce siempre la misma salida. Slots sin elección propia caen al valor
 * equivalente de "Equilibrado" (nunca deja variables a medias).
 */
export function mixThemes(slots: MixSlots, opts?: MixThemesOptions): MixResult {
    const baseline = baselinePack();
    const warnings: MixWarning[] = [];
    const usedBaseline: MixSlotId[] = [];
    const lightAcc: ModeAcc = { vars: {} };
    const darkAcc: ModeAcc = { vars: {} };

    for (const slot of SLOT_ORDER) {
        let resolved = resolveSourceTokens(slot, slots[slot]);
        if (isEmptyTokens(resolved.light) && isEmptyTokens(resolved.dark)) {
            usedBaseline.push(slot);
            resolved = { light: extractSlot(slot, baseline.modes.light), dark: extractSlot(slot, baseline.modes.dark) };
        }
        mergeInto(lightAcc, resolved.light);
        mergeInto(darkAcc, resolved.dark);
    }

    harmonizeMode(lightAcc, warnings, "claro");
    harmonizeMode(darkAcc, warnings, "oscuro");

    if (usedBaseline.length) {
        warnings.push({
            slot: "global", level: "info",
            message: `Sin elección propia en: ${usedBaseline.map((s) => SLOT_LABELS[s]).join(", ")} — se usó "Equilibrado" como base.`,
        });
    }

    const id = opts?.id || `mix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const toTokens = (acc: ModeAcc): ThemeTokens => ({
        vars: acc.vars,
        ...(acc.materialClass ? { materialClass: acc.materialClass } : {}),
        ...(acc.background !== undefined ? { background: acc.background } : {}),
        ...(acc.fontFamily ? { fontFamily: acc.fontFamily } : {}),
        ...(acc.motion !== undefined ? { motion: acc.motion } : {}),
    });

    const previewColors = [lightAcc.vars["primary-hsl"], lightAcc.vars["secondary-hsl"], lightAcc.vars["accent-hsl"]]
        .map(hexFromHslStr)
        .filter((x): x is string => !!x);

    const pack: ThemePack = {
        id,
        name: opts?.name || "Mi mezcla",
        description: opts?.description || "Creado en el Mezclador de Diseños de StarSeed OS.",
        style: "mezcla",
        modes: { light: toTokens(lightAcc), dark: toTokens(darkAcc) },
        preview: { colors: previewColors.length ? previewColors : ["#8B5CF6", "#F5A623", "#1F9D6B"] },
        author: "Mezclador StarSeed",
        version: 1,
    };

    return { pack, warnings, usedBaseline };
}

/* ═══════════════════════ Codificación de fuentes (UI + Aurora) ═══════════════
 * Un único formato de texto compacto ("theme:<id>:<mode>" | "element:<id>" |
 * "none") que usan TANTO los <Select> de la UI (theme-mixer-panel.tsx) COMO
 * el JSON que le pedimos a Aurora — así ambos caminos comparten el mismo
 * parser/validador y nunca divergen. */

export function encodeMixSource(s: MixSource | undefined): string {
    if (!s || s.kind === "none") return "none";
    return s.kind === "theme" ? `theme:${s.id}:${s.mode ?? "auto"}` : `element:${s.id}`;
}

export function decodeMixSource(v: string): MixSource {
    if (!v || v === "none") return { kind: "none" };
    const [kind, id, mode] = v.split(":");
    if (kind === "theme" && id) return { kind: "theme", id, mode: (mode as MixSource["mode"]) || "auto" };
    if (kind === "element" && id) return { kind: "element", id };
    return { kind: "none" };
}

/** ¿Esta fuente referencia algo que EXISTE de verdad? Nunca confía a ciegas en
 *  un id que venga de fuera (Aurora, un archivo importado…). */
export function isValidMixSource(source: MixSource): boolean {
    if (source.kind === "none") return true;
    if (!source.id) return false;
    if (source.kind === "theme") return listThemes().some((t) => t.id === source.id);
    return !!getDesignElement(source.id);
}

/* ══════════════════════════ Opciones de UI por slot ═══════════════════════ */

export function listSlotOptions(slot: MixSlotId): MixOption[] {
    const out: MixOption[] = [];
    for (const el of listDesignElements(slot as DesignElementKind)) {
        out.push({ source: { kind: "element", id: el.id }, label: el.name, sublabel: el.description, preview: el.preview });
    }
    for (const pack of listThemes()) {
        out.push({
            source: { kind: "theme", id: pack.id, mode: "auto" },
            label: `Tema: ${pack.name}`,
            sublabel: pack.description,
            preview: pack.preview?.colors ?? [],
        });
    }
    return out;
}

/** Etiqueta corta de la fuente elegida en un slot (para chips/resúmenes en la UI). */
export function describeSource(slot: MixSlotId, source: MixSource | undefined): string {
    if (!source || source.kind === "none") return "Equilibrado (por defecto)";
    if (source.kind === "element") return getDesignElement(source.id ?? "")?.name ?? "Elemento";
    const pack = listThemes().find((t) => t.id === source.id);
    return pack ? `Tema: ${pack.name}` : "Tema";
}

/* ══════════════════════════════ Aleatorio armónico ═════════════════════════
 * "Sorpréndeme": elige UN tema al azar y lo usa como base para paleta+material
 * (mantiene esos dos slots coherentes entre sí, que es lo que más se nota
 * visualmente), y randomiza el resto de slots de forma independiente entre
 * temas/elementos disponibles — variado, pero nunca una paleta de un mundo
 * con un material de otro completamente ajeno. */
export function randomMixSlots(): MixSlots {
    const packs = listThemes();
    const pick = <T,>(arr: T[]): T | null => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

    const anchor = pick(packs);
    const slots = emptyMixSlots();
    if (anchor) {
        slots.paleta = { kind: "theme", id: anchor.id, mode: "auto" };
        slots.material = { kind: "theme", id: anchor.id, mode: "auto" };
    }

    for (const slot of ["fondo", "tipografia", "animaciones", "densidad", "efectos"] as MixSlotId[]) {
        const opts = listSlotOptions(slot);
        // Para "fondo" dejamos algo de probabilidad de "ninguno" (no todo tema
        // necesita fondo animado) — el resto de slots siempre eligen algo.
        if (slot === "fondo" && Math.random() < 0.5) continue;
        const choice = pick(opts);
        if (choice) slots[slot] = choice.source;
    }
    return slots;
}

/* ═══════════════════════════ Integración con Aurora ════════════════════════
 * "Afinar con Aurora": le pedimos un JSON de fuentes por slot usando el MISMO
 * formato compacto de encodeMixSource/decodeMixSource. Tolerancia TOTAL al
 * parsear — igual que AuroraDesignerPanel del Estudio: nunca lanza, y
 * descarta cualquier slot con id inexistente o mal formado. */

export interface MixAuroraSuggestion {
    slots: Partial<Record<MixSlotId, MixSource>>;
    notes: string;
}

export function buildAuroraMixerPrompt(current: MixSlots): string {
    const themeIds = listThemes().map((t) => t.id).join(", ");
    const elementLines = SLOT_ORDER
        .map((s) => `  ${s}: ${listDesignElements(s as DesignElementKind).map((e) => e.id).join(", ") || "—"}`)
        .join("\n");
    const currentDesc = SLOT_ORDER.map((s) => `${s}=${encodeMixSource(current[s])}`).join(", ");
    return [
        "Eres la Diseñadora del Mezclador de Diseños de StarSeed OS (Aurora), estética 'Crystal Liquid Glass'.",
        "El Mezclador combina 7 slots INDEPENDIENTES (paleta/material/fondo/tipografia/animaciones/densidad/efectos) en un único tema.",
        "Responde ÚNICAMENTE con un bloque ```json con este esquema (incluye solo los slots que quieras cambiar; el resto se deja como está):",
        "```json",
        '{ "slots": { "paleta": "theme:<id>:auto" | "element:<id>" | "none", "material": "...", "fondo": "...", "tipografia": "...", "animaciones": "...", "densidad": "...", "efectos": "..." }, "notes": "breve explicación en español, una frase" }',
        "```",
        `Ids de TEMA completo válidos (usa el prefijo "theme:", cualquiera sirve para cualquier slot): ${themeIds}`,
        `Ids de ELEMENTO suelto válidos por slot (prefijo "element:", SOLO sirven para su propio slot):\n${elementLines}`,
        `Selección actual: ${currentDesc}`,
        "Nunca inventes ids que no estén en estas listas exactas — cualquier id desconocido se ignora silenciosamente y ese slot no cambia.",
    ].join("\n");
}

/** Parsea con tolerancia TOTAL la respuesta de Aurora (objeto ya extraído del
 *  bloque ```json — el parseo de texto→JSON lo hace la UI, igual que
 *  AuroraDesignerPanel). Nunca lanza; descarta slots inválidos uno a uno. */
export function sanitizeMixAuroraResponse(raw: unknown): MixAuroraSuggestion {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const rawSlots = (obj.slots && typeof obj.slots === "object" ? obj.slots : {}) as Record<string, unknown>;
    const slots: Partial<Record<MixSlotId, MixSource>> = {};
    for (const slot of SLOT_ORDER) {
        const v = rawSlots[slot];
        if (typeof v !== "string") continue;
        const source = decodeMixSource(v);
        if (isValidMixSource(source)) slots[slot] = source;
    }
    const notes = typeof obj.notes === "string" ? obj.notes.slice(0, 400) : "";
    return { slots, notes };
}
