/**
 * StarSeed XR · DOCK 3D, parte PURA (XR1010M · contrato `architecture/starseed-xr.md` §3 a/b).
 * Decide qué apps del dock 2D se ven en 3D y qué pasa al pulsarlas, SIN React ni three: entra
 * config, sale dato. HONESTIDAD (§3 b): solo se declara nativa 3D lo que SÍ la tiene hoy; el
 * resto es «solo-2d» con un motivo en español — nunca finge que existe una vista 3D.
 */

import type { DockItemConfig } from "@/components/layout/dock-config";
import type { Postura } from "@/lib/xr/tipos";

export type { DockItemConfig };

export type AppResuelta =
    | { tipo: "nativa-3d"; id: string }
    | { tipo: "uispec"; ruta: string }
    | { tipo: "solo-2d"; ruta: string; motivo: string };

/** Máximo de botones directos en el arco del dock, por postura (contrato §3 a). */
export const MAX_DOCK: Record<Postura, number> = { "de-pie": 7, sentado: 7, "una-mano": 5 };

/** Etiqueta del botón que abre el resto; también cierra lo que deja fuera el límite. */
export const ETIQUETA_MAS = "Más";

/** Motivo honesto de una app sin vista 3D todavía (texto visible, con acentos). */
export const MOTIVO_SIN_3D = "Esta app todavía no tiene vista 3D";

/** Lo que SÍ tiene vista 3D HOY: el hub `/xr`, las escenas `/escena/*` y `/sala-xr/*`, Astraura y los ajustes. */
export const APPS_3D: readonly { id: string; rutas: readonly string[] }[] = [
    { id: "xr-hub", rutas: ["/xr"] },
    { id: "escenas-3d", rutas: ["/escena"] },
    { id: "salas-xr", rutas: ["/sala-xr"] },
    { id: "ai-studio", rutas: ["/agent"] },
    { id: "settings", rutas: ["/settings"] },
];

/** ¿La ruta de un item cae dentro de una app con vista 3D? Coincidencia exacta o-recursiva. */
function esNativa(ruta: string): boolean {
    return APPS_3D.some((app) =>
        app.rutas.some((r) => ruta === r || ruta.startsWith(`${r}/`) || ruta.startsWith(`${r}?`)),
    );
}

/**
 * Resuelve qué pasa al pulsar un item del dock en 3D. Un item es nativa 3D si su id o su ruta
 * vive en `APPS_3D`; cualquier otra cosa es «solo-2d» con el motivo honesto — el usuario nunca
 * se queda en un bucle: siempre hay un botón con efecto real (abrir la tarjeta o salir a 2D).
 */
export function resolverApp(item: DockItemConfig): AppResuelta {
    if (APPS_3D.some((app) => app.id === item.id) || esNativa(item.path)) {
        return { tipo: "nativa-3d", id: item.id };
    }
    return { tipo: "solo-2d", ruta: item.path, motivo: MOTIVO_SIN_3D };
}

export interface DockPartido {
    /** Botones directos del arco (≤ MAX_DOCK), en el orden de la config. */
    visibles: DockItemConfig[];
    /** Lo que queda, bajo el botón «Más». */
    ocultas: DockItemConfig[];
}

/** Solo los `enabled`, en su orden, con un máximo visible según la postura. */
export function itemsDelDock(config: DockItemConfig[], postura: Postura): DockPartido {
    const habilitadas = config.filter((item) => item.enabled);
    const maximo = Math.max(0, MAX_DOCK[postura]);
    return {
        visibles: habilitadas.slice(0, maximo),
        ocultas: habilitadas.slice(maximo),
    };
}
