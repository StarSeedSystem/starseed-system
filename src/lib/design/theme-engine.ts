"use client";

/*
 * theme-engine — Contrato del sistema de TEMAS/ESTILOS de StarSeed OS.
 * Los temas son PAQUETES DE TOKENS (CSS variables + material + fondo animado
 * opcional) que se aplican por encima del sistema SIN alterar su estructura base.
 * Compartibles como archivos (.starseed-theme.json) en Biblioteca/Librería.
 * SOP: design-system/starseed-system/MASTER.md + architecture/libreria-biblioteca-sync.md.
 */

export interface ThemeTokens {
    /** Variables CSS (sin el prefijo --): p.ej. { "primary": "270 80% 60%", "radius": "1rem" } */
    vars: Record<string, string>;
    /** Clase de material global opcional (p.ej. "ss-crystal", "ss-metal", "ss-wood") */
    materialClass?: string;
    /** Fondo animado opcional: id de un fondo registrado (p.ej. "weather-live", "matrix-rain") */
    background?: string;
    /** Fuente opcional (familia ya cargada en el sistema) */
    fontFamily?: string;
    /** Intensidad de animación 0-2 (respeta prefers-reduced-motion y data-perf="eco") */
    motion?: number;
}

export interface ThemePack {
    id: string;            // kebab-case único, p.ej. "solarpunk"
    name: string;          // nombre en español
    description: string;
    /** Estilo/corriente: art-nouveau, art-deco, pop, solarpunk, retro, futurista,
     * retrofuturista, matrix, naturaleza, cyberpunk, visionario, arcoiris, hippie,
     * punk, cristal, climatico, astrologico, infantil, profesional, equilibrado,
     * neon, metalico, madera, material-3d… */
    style: string;
    /** Variantes claro/oscuro; "auto" usa la del sistema */
    modes: { light?: ThemeTokens; dark?: ThemeTokens; auto?: ThemeTokens };
    preview?: { colors: string[]; emojiFree?: true };
    author?: string;
    version?: number;
}

const APPLIED_KEY = "starseed.theme.applied.v1";
const CUSTOM_KEY = "starseed.theme.custom.v1";

/** Registro vivo de temas builtin (lo llena theme-catalog.ts). */
export const THEME_REGISTRY: Map<string, ThemePack> = (globalThis as { __ssThemes?: Map<string, ThemePack> }).__ssThemes
    ?? ((globalThis as { __ssThemes?: Map<string, ThemePack> }).__ssThemes = new Map());

export function registerTheme(pack: ThemePack): void {
    THEME_REGISTRY.set(pack.id, pack);
}

export function listThemes(): ThemePack[] {
    return [...THEME_REGISTRY.values()].concat(listCustomThemes());
}

export function listCustomThemes(): ThemePack[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]") as ThemePack[]; } catch { return []; }
}

export function saveCustomTheme(pack: ThemePack): void {
    if (typeof window === "undefined") return;
    const list = listCustomThemes().filter((t) => t.id !== pack.id);
    list.push(pack);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* lleno */ }
    window.dispatchEvent(new CustomEvent("starseed:themes"));
}

/** Aplica los tokens al documento (scoped a :root vía style vars; reversible). */
export function applyThemeTokens(tokens: ThemeTokens): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(tokens.vars || {})) root.style.setProperty(`--${k}`, v);
    if (tokens.materialClass) {
        root.dataset.ssMaterial = tokens.materialClass;
    }
    if (tokens.background !== undefined) root.dataset.ssBackground = tokens.background || "";
    if (tokens.motion !== undefined) root.style.setProperty("--ss-motion", String(tokens.motion));
    // --font-body es la MISMA variable que appearance-context.tsx ya escribe
    // desde su selector de tipografía (y que font-body/font-sans de Tailwind
    // consumen) — reusarla aquí es lo único que faltaba para que
    // ThemeTokens.fontFamily (documentado arriba) tenga efecto real.
    if (tokens.fontFamily) root.style.setProperty("--font-body", tokens.fontFamily);
    window.dispatchEvent(new CustomEvent("starseed:theme-applied"));
}

export function applyTheme(id: string, mode: "light" | "dark" | "auto" = "auto"): boolean {
    const pack = listThemes().find((t) => t.id === id);
    if (!pack) return false;
    const tokens = pack.modes[mode] ?? pack.modes.auto ?? pack.modes.dark ?? pack.modes.light;
    if (!tokens) return false;
    applyThemeTokens(tokens);
    try { localStorage.setItem(APPLIED_KEY, JSON.stringify({ id, mode })); } catch { /* noop */ }
    return true;
}

export function appliedTheme(): { id: string; mode: string } | null {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(APPLIED_KEY) || "null"); } catch { return null; }
}

/** Exporta un tema como archivo compartible (.starseed-theme.json). */
export function exportThemeFile(pack: ThemePack): Blob {
    return new Blob([JSON.stringify({ kind: "starseed-theme", v: 1, pack }, null, 2)], { type: "application/json" });
}

export function importThemeFile(json: string): ThemePack | null {
    try {
        const data = JSON.parse(json) as { kind?: string; pack?: ThemePack };
        if (data.kind !== "starseed-theme" || !data.pack?.id) return null;
        saveCustomTheme(data.pack);
        return data.pack;
    } catch { return null; }
}
