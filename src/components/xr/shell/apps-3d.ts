/**
 * StarSeed XR · APPS DEL DOCK EN 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 *
 * Módulo PURO: sin React, sin DOM, sin red. Decide qué apps del dock 2D caben en el arco del
 * Anchor (el resto, bajo «Más») y qué vista tiene cada una en 3D. La tabla `APPS_3D` solo
 * contiene lo que HOY tiene vista 3D propia; lo demás se declara `solo-2d` con su motivo,
 * nunca se finge. Módulo PURO: usa únicamente tipos, sin imports de ejecución.
 */
import type { DockColor, DockItemConfig } from "@/components/layout/dock-config";
import type { Postura } from "@/lib/xr/tipos";
import type { NodoCardinal } from "@/lib/xr/tokens-3d";

export interface AppNativa {
    /** Ruta base (sin query ni hash) que tiene vista 3D propia. */
    ruta: string;
    /** Identificador del panel que abre en Horizon o Logic. */
    id: string;
    /** Si también cubre sus subrutas (`/escena/abc`, `/sala-xr/123`). */
    prefijo?: boolean;
}

/** Lo que SÍ tiene vista 3D hoy: hub XR, escenas, salas XR, Astraura y los ajustes XR. */
export const APPS_3D: readonly AppNativa[] = [
    { ruta: "/xr/os", id: "xr-os" },
    { ruta: "/xr/diagnostico", id: "ajustes-xr" },
    { ruta: "/escena", id: "escenas", prefijo: true },
    { ruta: "/sala-xr", id: "salas-xr", prefijo: true },
    { ruta: "/agent", id: "astraura", prefijo: true },
    { ruta: "/xr", id: "hub-xr" },
];

/**
 * Rutas declaradas como `UiSpec` (interfaz-como-dato) que el renderizador 3D puede pintar solas.
 * Vacía a propósito hasta que exista `uispec-uikit.tsx` (XR1010AP): mientras no haya renderizador,
 * ninguna ruta debe fingir una vista 3D. `resolverApp` acepta la lista como dato para probarla.
 */
export const RUTAS_UISPEC: readonly string[] = [];

export const MOTIVO_SIN_3D = "Esta app todavía no tiene vista 3D";

export interface ResolucionNativa { tipo: "nativa-3d"; id: string }
export interface ResolucionUispec { tipo: "uispec"; ruta: string }
export interface ResolucionSolo2D { tipo: "solo-2d"; ruta: string; motivo: string }
export type ResolucionApp = ResolucionNativa | ResolucionUispec | ResolucionSolo2D;

export const MAX_VISIBLES: Record<Postura, number> = {
    "de-pie": 7,
    sentado: 7,
    "una-mano": 5,
};

export const ETIQUETA_MAS = "Más";

export interface DockPartido {
    visibles: DockItemConfig[];
    mas: DockItemConfig[];
    maxVisibles: number;
}

/** Traduce el acento del dock 2D a un color del núcleo (`tokens-3d.ts`), sin escribir hex a mano. */
export const NODO_POR_COLOR: Record<DockColor, NodoCardinal> = {
    neutral: "logic",
    cyan: "zenith",
    crimson: "anchor",
    amber: "logic",
    emerald: "horizon",
    purple: "zenith",
};

export const nodoDelColor = (color: DockColor): NodoCardinal => NODO_POR_COLOR[color] ?? "anchor";

/** Apps encendidas, en su orden. Las que no caben en el arco van bajo «Más». */
export function itemsDelDock(config: DockItemConfig[], postura: Postura): DockPartido {
    const maxVisibles = MAX_VISIBLES[postura] ?? 7;
    const activos = config.filter((item) => item.enabled);
    return { visibles: activos.slice(0, maxVisibles), mas: activos.slice(maxVisibles), maxVisibles };
}

/** Ruta comparable: sin query, sin hash y sin barra final. */
function rutaBase(ruta: string): string {
    const sinConsulta = (ruta || "").split(/[?#]/)[0] ?? "";
    return sinConsulta.length > 1 && sinConsulta.endsWith("/") ? sinConsulta.slice(0, -1) : sinConsulta;
}

const enTabla = (ruta: string, app: AppNativa): boolean =>
    ruta === app.ruta || (app.prefijo === true && ruta.startsWith(`${app.ruta}/`));

/** Vista 3D real de una app del dock: nativa, UiSpec declarada o la salida honesta a 2D. */
export function resolverApp(item: DockItemConfig, rutasUispec: readonly string[] = RUTAS_UISPEC): ResolucionApp {
    const ruta = rutaBase(item.path);
    const nativa = APPS_3D.find((app) => enTabla(ruta, app));
    if (nativa) return { tipo: "nativa-3d", id: nativa.id };
    const uispec = rutasUispec.some((base) => enTabla(ruta, { ruta: rutaBase(base), id: base, prefijo: true }));
    if (uispec) return { tipo: "uispec", ruta: item.path };
    return { tipo: "solo-2d", ruta: item.path, motivo: MOTIVO_SIN_3D };
}
