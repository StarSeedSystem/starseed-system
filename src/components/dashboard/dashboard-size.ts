// ════════════════════════════════════════════════════════════════
// dashboard-size — Sistema de tamaños amigables S/M/L/XL para widgets
// ----------------------------------------------------------------
// Capa ADITIVA sobre el grid absoluto de 12 columnas (x/y/w/h) que ya usa
// react-grid-layout (ver grid-area.tsx). El layout numérico sigue siendo la
// fuente de verdad para el posicionamiento real; `size` (en
// `DashboardWidget.size`, dashboard-types.ts) es una etiqueta semántica
// opcional que impulsa:
//   1) el ciclo de tamaño del modo edición (botón S→M→L→XL→S en grid-area.tsx)
//   2) las plantillas predeterminadas (dashboard-defaults.ts), que declaran
//      la talla junto al footprint concreto para que quede documentada.
// Los widgets sin `size` (legado) siguen funcionando: se infiere la talla
// más cercana a partir de su w/h actual con `sizeFromWH`.
// ════════════════════════════════════════════════════════════════

import type { WidgetType } from "./dashboard-types";
import { getSizeConstraints } from "./widget-manifest";

/** Talla amigable de un widget. Mismo literal que `DashboardWidget["size"]`. */
export type WidgetSize = "S" | "M" | "L" | "XL";

export interface SizeDims {
    w: number;
    h: number;
}

/** Footprint canónico (grid de 12 columnas) por talla. */
export const SIZE_DIMENSIONS: Record<WidgetSize, SizeDims> = {
    S: { w: 3, h: 3 },
    M: { w: 4, h: 4 },
    L: { w: 6, h: 5 },
    XL: { w: 12, h: 6 },
};

export const SIZE_ORDER: WidgetSize[] = ["S", "M", "L", "XL"];

export const SIZE_LABELS: Record<WidgetSize, string> = {
    S: "Pequeño",
    M: "Mediano",
    L: "Grande",
    XL: "Extra grande",
};

/**
 * Footprint de una talla para un widget concreto, recortado a los mínimos
 * (y máximos, si existen) que declara su ficha en widget-manifest.ts. Así,
 * un widget con un mínimo alto (p. ej. minH:4) nunca queda por debajo de su
 * tamaño funcional aunque se le pida la talla "S".
 */
export function dimsForSize(type: WidgetType, size: WidgetSize): SizeDims {
    const base = SIZE_DIMENSIONS[size];
    const c = getSizeConstraints(type);
    let w = Math.max(base.w, c.minW);
    let h = Math.max(base.h, c.minH);
    if (c.maxW) w = Math.min(w, c.maxW);
    if (c.maxH) h = Math.min(h, c.maxH);
    return { w, h };
}

/** Infiere la talla más cercana a partir de un footprint w/h existente (legado). */
export function sizeFromWH(w: number, h: number): WidgetSize {
    const area = Math.max(1, w) * Math.max(1, h);
    let best: WidgetSize = "S";
    let bestDelta = Infinity;
    for (const s of SIZE_ORDER) {
        const d = SIZE_DIMENSIONS[s];
        const delta = Math.abs(d.w * d.h - area);
        if (delta < bestDelta) {
            bestDelta = delta;
            best = s;
        }
    }
    return best;
}

/** Siguiente talla en el ciclo S → M → L → XL → S (modo edición). */
export function nextSize(size: WidgetSize): WidgetSize {
    const idx = SIZE_ORDER.indexOf(size);
    return SIZE_ORDER[(idx + 1) % SIZE_ORDER.length];
}

/**
 * (Aditivo · sexta oleada del selector) Evento que el selector de widgets
 * dispara justo antes de `onAdd(type)` cuando el usuario eligió un tamaño
 * distinto de "M" en "Tamaño al añadir". grid-area.tsx lo escucha para
 * aplicar `dimsForSize` al widget recién creado en cuanto aparece en
 * `widgets` — sin necesitar cambiar el contrato de `onAdd`.
 */
export const ADD_WIDGET_SIZE_HINT_EVENT = "starseed:dashboard:add-widget-size-hint";
export interface AddWidgetSizeHintDetail { type: WidgetType; size: WidgetSize }
