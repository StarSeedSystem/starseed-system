'use client';

// ════════════════════════════════════════════════════════════════
// Widget Style Override — variante de estilo POR WIDGET (panel de config)
// ----------------------------------------------------------------
// El tema global (config.widgets.bgStyle/borderStyle en appearance-context)
// sigue mandando por defecto. Este contexto permite que UN widget concreto
// anule ese estilo (cristal / sólido / transparente / tinte por nodo Trinity),
// elegido desde su panel de config (engranaje) y persistido en
// `widget.settings.styleVariant` / `widget.settings.trinityNode`.
//
// WidgetRegistry envuelve cada widget con un Provider leyendo esos campos;
// WidgetShell lo consulta (useWidgetStyleOverride) y, si hay override, pinta
// por encima del tema global — SOLO para ese widget. Aditivo: sin Provider
// (valor null), todo se comporta exactamente igual que antes.
// ════════════════════════════════════════════════════════════════

import { createContext, useContext } from "react";

/** Variantes de estilo elegibles desde el panel de config del widget. */
export type WidgetStyleVariant = "cristal" | "solido" | "transparente" | "trinity";

/** Nodo cardinal de la Trinity (StarSeed) usado como tinte forzado. */
export type TrinityNode = "zenith" | "horizon" | "logic" | "anchor";

export interface WidgetStyleOverride {
    variant?: WidgetStyleVariant;
    trinityNode?: TrinityNode;
}

/** Colores oficiales de los 4 nodos Trinity (ver CLAUDE.md §7). */
export const TRINITY_TINTS: Record<TrinityNode, string> = {
    zenith: "#007FFF",   // Norte — Guía IA contextual
    horizon: "#39FF14",  // Oeste — Lienzo de creación
    logic: "#FFBF00",    // Este — Control del sistema
    anchor: "#DC143C",   // Sur — Dock principal / acceso raíz
};

export const TRINITY_LABELS: Record<TrinityNode, string> = {
    zenith: "Zenith · Guía",
    horizon: "Horizon · Creación",
    logic: "Logic · Sistema",
    anchor: "Anchor · Raíz",
};

const WidgetStyleOverrideContext = createContext<WidgetStyleOverride | null>(null);

export const WidgetStyleOverrideProvider = WidgetStyleOverrideContext.Provider;

/** Lee el override de estilo activo para el widget actual (o null si no hay). */
export function useWidgetStyleOverride(): WidgetStyleOverride | null {
    return useContext(WidgetStyleOverrideContext);
}
