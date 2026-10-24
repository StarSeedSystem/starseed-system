"use client";

import { fondoPara } from "./sombras-fondos";

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
    /** Token CSS del fondo según sombras-fondos.ts (solo fondos de marca). */
    token?: string;
    /** Si el fondo necesita velo bajo el texto para sostener 4.5:1. */
    velo?: boolean;
}

/** Resuelve token y velo de un fondo de marca con la regla de sombras-fondos. */
function fondoDeMarca(registro: string): Pick<BackgroundDef, "token" | "velo"> {
    const r = fondoPara(registro, registro === "vacio-profundo" ? "cosmico" : "interfaz");
    return { token: r.background, velo: r.velo };
}

export const BACKGROUND_REGISTRY: Record<string, BackgroundDef> = {
    "vacio-profundo": {
        id: "vacio-profundo",
        name: "Vacío profundo",
        description: "Azul vacío profundo para lo cósmico, Astraura y XR — la escena donde la malla respira. Con velo para sostener el contraste.",
        ...fondoDeMarca("vacio-profundo"),
    },
    "degradado-claridad": {
        id: "degradado-claridad",
        name: "Degradado Claridad",
        description: "Degradado radial claro para lectura y trabajo diurno — nieve con un matiz de indigo y azul. Sin velo: ya es claro.",
        ...fondoDeMarca("degradado-claridad"),
    },
    "degradado-profundidad": {
        id: "degradado-profundidad",
        name: "Degradado Profundidad",
        description: "Degradado diagonal de violetas y azules casi negros para piezas de fondo con texto encima. Con velo.",
        ...fondoDeMarca("degradado-profundidad"),
    },
    "degradado-natural": {
        id: "degradado-natural",
        name: "Degradado Natural",
        description: "Degradado radial verde bosque para Materia Viva y contextos de naturaleza — oscuro a propósito. Con velo.",
        ...fondoDeMarca("degradado-natural"),
    },
    "degradado-cristal": {
        id: "degradado-cristal",
        name: "Degradado Cristal",
        description: "Degradado azul-violeta frío como base del cristal líquido — noche con reflejas. Con velo.",
        ...fondoDeMarca("degradado-cristal"),
    },
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
