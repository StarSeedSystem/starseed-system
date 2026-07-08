"use client";

/* ═══════════════════════════════════════════════════════════════════════════
 * backgrounds — Registro de FONDOS ANIMADOS opcionales que un ThemePack puede
 * activar vía `ThemeTokens.background` (contrato: theme-engine.ts).
 * ---------------------------------------------------------------------------
 * Este archivo es solo METADATA (id/nombre/descripción) — a propósito sin
 * dependencias de React, igual que theme-engine.ts. El RENDER real vive en
 * src/components/backgrounds/theme-live-background.tsx (`ThemeBackgroundHost`),
 * montado una vez en el layout raíz: lee `document.documentElement.dataset
 * .ssBackground` (lo escribe `applyThemeTokens`) y monta la capa que toque.
 *
 * 4 fondos builtin, cada uno usado por defecto por UN tema del catálogo
 * (theme-catalog.ts) — el resto de temas no toca `background` y por tanto no
 * activa ninguno (cero regresión sobre el fondo global existente del OS):
 *   · matrix-rain      → tema "matrix"
 *   · estrellas        → tema "astrologico"
 *   · gradiente-aurora → tema "visionario"
 *   · weather-live     → tema "climatico" (clima LOCAL real del usuario)
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface BackgroundDef {
    id: string;
    name: string;
    description: string;
}

export const BACKGROUND_REGISTRY: Record<string, BackgroundDef> = {
    "matrix-rain": {
        id: "matrix-rain",
        name: "Lluvia Matrix",
        description: "Columnas de caracteres cayendo en verde fósforo sobre negro — CSS puro, ligero.",
    },
    "estrellas": {
        id: "estrellas",
        name: "Campo estelar",
        description: "Estrellas que titilan lentamente en un cielo índigo profundo.",
    },
    "gradiente-aurora": {
        id: "gradiente-aurora",
        name: "Aurora iridiscente",
        description: "Manchas de gradiente psicodélico suave en movimiento perpetuo, con deriva de matiz.",
    },
    "weather-live": {
        id: "weather-live",
        name: "Clima en vivo",
        description: "Refleja el clima REAL de tu ubicación (lluvia, nieve, niebla o sol) y la hora del día.",
    },
};

export function listBackgrounds(): BackgroundDef[] {
    return Object.values(BACKGROUND_REGISTRY);
}

export function getBackgroundDef(id?: string | null): BackgroundDef | null {
    if (!id) return null;
    return BACKGROUND_REGISTRY[id] ?? null;
}
