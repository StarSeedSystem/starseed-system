/**
 * StarSeed XR · APPS DEL DOCK EN 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a–b),
 * parte PURA del dock curvo (probada en node). Decide qué apps del dock 2D se ven en 3D, en qué
 * orden, con qué límite por postura y qué pasa al pulsar cada una. Nada finge (§0.4): lo que
 * todavía no tiene vista 3D se resuelve `solo-2d` con el motivo en español.
 */
import type { DockColor, DockItemConfig } from "@/components/layout/dock-config";
import type { Postura } from "@/lib/xr/tipos";
import { CRISTAL, COLORES_NODO, type NodoCardinal } from "@/lib/xr/tokens-3d";

/** Motivo exacto que ve la persona cuando la app aún no tiene vista 3D (§3 b, escalón 4). */
export const MOTIVO_SOLO2D = "Esta app todavía no tiene vista 3D";

/** Lo que pasa al pulsar un botón del dock. */
export type ResolucionApp =
    | { tipo: "nativa-3d"; id: string }
    | { tipo: "uispec"; ruta: string }
    | { tipo: "solo-2d"; ruta: string; motivo: string };

/** App con vista 3D REAL hoy: la ruta exacta o la de la sección desplegará a sus páginas. */
export interface AppConVista3D {
    id: string;
    rutas: string[];
}

/** Tabla de lo que SÍ tiene vista 3D hoy; el resto es `solo-2d` con `MOTIVO_SOLO2D`. */
export const APPS_3D: readonly AppConVista3D[] = [
    { id: "hub-xr", rutas: ["/xr"] },
    { id: "os-xr", rutas: ["/xr/os"] },
    { id: "escenas-3d", rutas: ["/escena"] },
    { id: "salas-xr", rutas: ["/sala-xr"] },
    { id: "astraura", rutas: ["/agent"] },
];

/** Páginas declaradas como `UiSpec` (§3 b, escalón 2). Hoy NINGUNA: se declara vacía y honesta. */
export const UISPEC_RUTAS: readonly string[] = [];

/** Resuelve un item del dock a lo que pasa al pulsarlo: nativa 3D, UiSpec o solo-2d con motivo. */
export function resolverApp(item: Pick<DockItemConfig, "id" | "path" | "label">): ResolucionApp {
    const ruta = item.path;
    const con3d = APPS_3D.find((a) => a.rutas.some((r) => ruta === r || ruta.startsWith(r + "/")));
    if (con3d) return { tipo: "nativa-3d", id: con3d.id };
    if (UISPEC_RUTAS.includes(ruta)) return { tipo: "uispec", ruta };
    return { tipo: "solo-2d", ruta, motivo: MOTIVO_SOLO2D };
}

export interface ItemsDock3D {
    visibles: DockItemConfig[];
    /** El resto, debajo de «Más»: mismos datos, mismo orden, no caben a la vista. */
    mas: DockItemConfig[];
}

/** Máximo de botones a la vista por postura (contrato §3 a; en una mano el dock es menor). */
export const MAX_DOCK: Record<Postura, number> = { "de-pie": 7, sentado: 7, "una-mano": 5 };

/** Solo los `enabled`, en su orden de SIEMPRE, con tope por postura y el resto bajo «Más». */
export function itemsDelDock(config: DockItemConfig[], postura: Postura): ItemsDock3D {
    const habiles = config.filter((i) => i.enabled);
    const max = MAX_DOCK[postura];
    return { visibles: habiles.slice(0, max), mas: max >= habiles.length ? [] : habiles.slice(max) };
}

/*
 * DockColor → nodo y color del cristal, SIEMPRE desde `tokens-3d.ts` (ningún color a mano):
 * el cian es Zenith, el esmeralda Horizon, el ámbar Logic vivo y el carmesí Anchor. Nota
 * honesta: tokens-3d no trae morado ni gris propios; el morado es CREACIÓN (Horizon vivo)
 * y el neutro queda en el texto del cristal.
 */
export const NODO_DE_COLOR: Record<DockColor, NodoCardinal> = {
    neutral: "zenith",
    cyan: "zenith",
    purple: "horizon",
    emerald: "horizon",
    amber: "logic",
    crimson: "anchor",
};

export const COLOR_DE_ITEM: Record<DockColor, string> = {
    neutral: CRISTAL.texto,
    cyan: COLORES_NODO.zenith.base,
    purple: COLORES_NODO.horizon.vivo,
    emerald: COLORES_NODO.horizon.base,
    amber: COLORES_NODO.logic.vivo,
    crimson: COLORES_NODO.anchor.base,
};

/** Acento de la tarjeta honesta de «solo-2d» (nodo Anchor, también token). */
export const COLOR_TARJETA: string = COLORES_NODO.anchor.vivo;

