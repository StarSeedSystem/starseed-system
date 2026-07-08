"use client";

/*
 * Estudio Universal de Diseño — tipos compartidos.
 * -----------------------------------------------------------------------
 * Capa de edición POR ELEMENTO construida ENCIMA del contrato congelado
 * `src/lib/design/theme-engine.ts` (ThemeTokens/ThemePack) — nunca lo
 * modifica, solo lo usa.
 *
 * Un `ElementOverride` es un superconjunto local:
 *  · `tokens` es 1:1 compatible con `ThemeTokens` (vars/materialClass/
 *    background/fontFamily/motion) — lo que el sistema YA lee vía
 *    variables CSS (--primary-hsl, --radius, --glass-blur…).
 *  · El resto de campos son OPCIONALES a propósito: `undefined` = "hereda
 *    el valor real del sistema" (el panel de vista previa no fuerza nada
 *    hasta que el usuario toca un control). Cubren propiedades que los
 *    componentes base aplican hoy vía CLASES ESTÁTICAS, no variables
 *    (sombra compuesta, blur, borde/glow, tipografía, padding, transición)
 *    — se aplican desde fuera, vía `style` inline en el nodo previsualizado
 *    (ver property-defaults.ts), nunca editando el componente base.
 */

import type { ThemeTokens } from "@/lib/design/theme-engine";

export type ElementFamily =
    | "button"
    | "tabs"
    | "window"
    | "icon"
    | "widget"
    | "card"
    | "background"
    | "theme";

export interface ShadowLayer {
    id: string;
    x: number; // px
    y: number; // px
    blur: number; // px
    spread: number; // px
    color: string; // rgba(...)
    inset?: boolean;
}

export interface GradientStop {
    id: string;
    color: string; // hex/rgba
    offset: number; // 0-100
}

export type HoverEffect = "none" | "sheen" | "lift" | "pulse" | "glow";
export type EntryEffect = "none" | "fade" | "scale" | "slide";
export type EasingPreset = "linear" | "ease" | "ease-in-out" | "glide" | "spring";

export interface AnimationOverride {
    durationMs?: number;
    easing?: EasingPreset;
    hover?: HoverEffect;
    entry?: EntryEffect;
}

export interface BorderOverride {
    widthPx?: number;
    color?: string;
    /** Intensidad de resplandor añadido 0-1 (además del borde). */
    glow?: number;
}

export interface TypographyOverride {
    sizePx?: number;
    weight?: number;
    trackingEm?: number;
}

export interface PaddingOverride {
    xPx?: number;
    yPx?: number;
}

/** Override local de UN elemento (o del tema completo, cuando family === "theme"). */
export interface ElementOverride {
    /** SIEMPRE presente; `vars` puede estar vacío (sin overrides de color/radio/material aún). */
    tokens: ThemeTokens;
    radiusPx?: number;
    shadow?: ShadowLayer[];
    blurPx?: number;
    opacity?: number;
    border?: BorderOverride;
    typography?: TypographyOverride;
    padding?: PaddingOverride;
    animation?: AnimationOverride;
    gradient?: GradientStop[];
    /** URL de fondo personalizado: PNG exportado del editor 2D o foto subida/editada. */
    customBackgroundUrl?: string;
}

export interface ThemeDraftMeta {
    id: string;
    name: string;
    description: string;
    style: string;
}

export function makeId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
