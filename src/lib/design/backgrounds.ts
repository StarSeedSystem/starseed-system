"use client";

import { fondoPara } from "./sombras-fondos";
import type { Contexto, Registro } from "./sombras-fondos";

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

/* ── Fondos de la marca (decisión de Alex 2026-10-19) ────────────────────────
 * Noche, vacío profundo y los degradados Claridad, Profundidad, Natural y
 * Cristal, «cada uno donde su registro lo pida» (identidades.md y §5 de
 * adn-y-tokens.md). Cada entrada deriva su token de `fondoPara` (sombras-
 * fondos.ts) para que registro y resguardo nunca discrepen; los tokens viven
 * en globals.css, aquí solo hay metadata.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface EntradaMarca {
    id: string;
    nombre: string;
    registro: Registro;
    contexto: Contexto;
    uso: string;
}

const ENTRADAS_MARCA: EntradaMarca[] = [
    { id: "vacio-profundo", nombre: "Vacío profundo", registro: "astraura", contexto: "cosmico",
        uso: "Escenas cósmicas, Astraura y XR, y explicaciones de la red y del universo." },
    { id: "degradado-claridad", nombre: "Degradado Claridad", registro: "claridad", contexto: "interfaz",
        uso: "Piezas claras de lectura y foco del sistema anterior." },
    { id: "degradado-profundidad", nombre: "Degradado Profundidad", registro: "profundidad", contexto: "interfaz",
        uso: "Escenas nocturnas de concentración del sistema anterior." },
    { id: "degradado-natural", nombre: "Degradado Natural", registro: "natural", contexto: "interfaz",
        uso: "Materia Viva, ecología y registros de terreno orgánico." },
    { id: "degradado-cristal", nombre: "Degradado Cristal", registro: "cristal", contexto: "interfaz",
        uso: "Cristal técnico de Astraura y Genesis sobre fondo oscuro." },
];

function entradaMarca(e: EntradaMarca): BackgroundDef {
    const fondo = fondoPara(e.registro, e.contexto);
    const velo = fondo.velo
        ? "con velo bajo el texto (4.5:1)"
        : "contraste directo ya medido en 4.5:1";
    return {
        id: e.id,
        name: e.nombre,
        description: `${e.uso} Usa ${fondo.background}, ${velo}.`,
    };
}

const FONDOS_MARCA: Record<string, BackgroundDef> = Object.fromEntries(
    ENTRADAS_MARCA.map((e) => [e.id, entradaMarca(e)]),
);

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
    ...FONDOS_MARCA,
};

export function listBackgrounds(): BackgroundDef[] {
    return Object.values(BACKGROUND_REGISTRY);
}

export function getBackgroundDef(id?: string | null): BackgroundDef | null {
    if (!id) return null;
    return BACKGROUND_REGISTRY[id] ?? null;
}
