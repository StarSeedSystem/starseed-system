/**
 * StarSeed XR · APPS 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 * Qué app del dock 2D tiene vista 3D HOY y cuál no, con honestidad: nada finge.
 * Módulo PURO (sin three, sin red, sin navegador). Pruebas: `__tests__/apps-3d.test.ts`.
 */
import type { Postura } from "../../../lib/xr/tipos";
import { COLORES_NODO, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import type { DockColor, DockItemConfig } from "../../layout/dock-config";

/**
 * Lo que SÍ tiene vista 3D hoy (contrato §3 b, escalón 1): el hub `/xr`, las escenas y las
 * salas XR siguientes, Astraura y los ajustes XR. La clave es el id del item del dock; el valor
 * es el `id` que recibe `abrir(id)` al cablear el panel en Horizon o Logic.
 */
export const APPS_3D: Readonly<Record<string, string>> = {
    "xr-hub": "xr",
    "escenas-3d": "escenas",
    "salas-xr": "salas-xr",
    "ai-studio": "astraura",
    "ajustes-xr": "ajustes-xr",
};

/**
 * Rutas declaradas como `UiSpec` (escalón 2 del §3 b). Hoy ninguna: honesty; cuando una página
 * se registre como `UiSpec`, se añade aquí y el dock la abre en 3D sin tocar el resto.
 */
export const RUTAS_UISPEC_3D: readonly string[] = [];

/** Motivo honesto, en español, de una app que aún no tiene vista 3D (nunca se finje). */
export const MOTIVO_SIN_VISTA_3D = "Esta app todavía no tiene vista 3D";

/** Máximo de botones VISIBLES del dock según la postura (§3 a): 7 de pie o sentado, 5 en una mano. */
export const MAX_DOCK: Readonly<Record<Postura, number>> = {
    "de-pie": 7,
    sentado: 7,
    "una-mano": 5,
};

export type AppResuelta =
    | { tipo: "nativa-3d"; id: string }
    | { tipo: "uispec"; ruta: string }
    | { tipo: "solo-2d"; ruta: string; motivo: string };

export interface RepartoDock {
    visibles: DockItemConfig[];
    ocultos: DockItemConfig[];
    mas: boolean;
}

/** Resuelve una app del dock: `nativa-3d` con su id, `uispec` con su ruta o `solo-2d` con el motivo. */
export function resolverApp(item: Pick<DockItemConfig, "id" | "path">): AppResuelta {
    if (item.id in APPS_3D) return { tipo: "nativa-3d", id: APPS_3D[item.id] };
    const m = /^\/(escena|sala-xr)(?:\/([A-Za-z0-9._-]+))?$/.exec(item.path);
    if (m) {
        if (!m[2]) return { tipo: "nativa-3d", id: m[1] === "escena" ? "escenas" : "salas-xr" };
        return { tipo: "nativa-3d", id: m[1] === "escena" ? `escena-${m[2]}` : `sala-${m[2]}` };
    }
    if (item.path === "/agent") return { tipo: "nativa-3d", id: "astraura" };
    if (item.path === "/xr") return { tipo: "nativa-3d", id: "xr" };
    if (RUTAS_UISPEC_3D.includes(item.path)) return { tipo: "uispec", ruta: item.path };
    return { tipo: "solo-2d", ruta: item.path, motivo: MOTIVO_SIN_VISTA_3D };
}

/** Los `enabled` del dock 2D, en su orden, repartidos por el máximo de la postura (el resto bajo «Más»). */
export function itemsDelDock(config: DockItemConfig[], postura: Postura): RepartoDock {
    const activos = (Array.isArray(config) ? config : []).filter((i) => i.enabled);
    const visibles = activos.slice(0, MAX_DOCK[postura]);
    return { visibles, ocultos: activos.slice(visibles.length), mas: activos.length > visibles.length };
}

const NODO_DE_COLOR: Readonly<Record<DockColor, NodoCardinal>> = {
    neutral: "anchor",
    cyan: "zenith",
    emerald: "horizon",
    amber: "logic",
    crimson: "anchor",
    purple: "zenith",
};

export function nodoDeColor(color: DockColor): NodoCardinal {
    return NODO_DE_COLOR[color];
}

/** Color concreto de un item: el `vivo` del nodo cardinal al que mapea su tono (tokens-3d.ts). */
export const colorDeItem = (color: DockColor): string => COLORES_NODO[nodoDeColor(color)].vivo;


