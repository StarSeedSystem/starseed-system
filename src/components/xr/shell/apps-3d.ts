/**
 * StarSeed XR · APPS DEL DOCK 3D (XR1010M · contrato §3 a y b).
 * Módulo PURO: las MISMAS apps del dock 2D, el límite visible de cada postura y la resolución
 * honesta de qué tiene vista 3D hoy. Lo que no la tiene se dice con su motivo; nunca se finge.
 */
import type { DockItemConfig } from "@/components/layout/dock-config";
import type { Postura } from "@/lib/xr/tipos";

export type ResolucionApp =
    | { tipo: "nativa-3d"; id: string }
    | { tipo: "uispec"; ruta: string }
    | { tipo: "solo-2d"; ruta: string; motivo: string };

export interface EntradaApp3D {
    ruta: string;
    id: string;
    /** `true` también resuelve sus subrutas (`/escena/abc`). */
    prefijo: boolean;
}

export const MOTIVO_SIN_VISTA_3D = "Esta app todavía no tiene vista 3D";

/** Lo que SÍ tiene vista 3D nativa hoy. Se amplía aquí cuando una tarea añade otra. */
export const APPS_3D: readonly EntradaApp3D[] = [
    { ruta: "/xr", id: "hub-xr", prefijo: true },
    { ruta: "/escena", id: "escena", prefijo: true },
    { ruta: "/sala-xr", id: "sala-xr", prefijo: true },
    { ruta: "/agent", id: "astraura", prefijo: false },
    { ruta: "/settings", id: "ajustes-xr", prefijo: false },
];

/** Botones a la vista antes de plegar el resto bajo «Más». */
export const MAX_VISIBLES_DOCK: Record<Postura, number> = {
    "de-pie": 7,
    sentado: 7,
    "una-mano": 5,
};

export interface ItemsDock3D {
    visibles: DockItemConfig[];
    mas: DockItemConfig[];
    /** Cuántos quedaron bajo «Más» (0 = el botón no se pinta). */
    ocultos: number;
}

export function itemsDelDock(config: DockItemConfig[], postura: Postura): ItemsDock3D {
    const habilitados = (Array.isArray(config) ? config : []).filter((item) => item && item.enabled);
    const maximo = MAX_VISIBLES_DOCK[postura] ?? MAX_VISIBLES_DOCK["de-pie"];
    return {
        visibles: habilitados.slice(0, maximo),
        mas: habilitados.slice(maximo),
        ocultos: Math.max(0, habilitados.length - maximo),
    };
}

/** Ruta sin query, hash ni barras finales (el dock 2D guarda rutas con `?tab=…`). */
export function normalizarRuta(ruta: string): string {
    const limpia = String(ruta ?? "").split(/[?#]/)[0].trim();
    const conBarra = limpia.startsWith("/") ? limpia : `/${limpia}`;
    return conBarra.length > 1 ? conBarra.replace(/\/+$/, "") : conBarra;
}

function coincide(entrada: EntradaApp3D, ruta: string): boolean {
    return ruta === entrada.ruta || (entrada.prefijo && ruta.startsWith(`${entrada.ruta}/`));
}

/** Resuelve una app del dock sin inventar: nativa 3D, `UiSpec` o tarjeta honesta de «solo 2D». */
export function resolverApp(item: Pick<DockItemConfig, "path">): ResolucionApp {
    const ruta = normalizarRuta(item?.path ?? "");
    const app = APPS_3D.find((candidata) => coincide(candidata, ruta));
    if (app) return { tipo: "nativa-3d", id: app.id };
    return { tipo: "solo-2d", ruta, motivo: MOTIVO_SIN_VISTA_3D };
}
