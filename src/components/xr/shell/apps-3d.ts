/**
 * StarSeed XR · APPS DEL DOCK EN 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 *
 * Parte PURA del dock curvo de Anchor: qué apps del dock 2D se ven (y en qué orden), cuáles
 * caben antes de «Más» y qué pasa al pulsar cada una. Las apps 3D de verdad se declaran en
 * `APPS_3D`; el resto se resuelve como `solo-2d` con su motivo, sin fingir una vista que no
 * existe. Sin React, sin three, sin DOM ni almacenamiento: entra dato, sale dato.
 */
import type { DockColor, DockItemConfig } from "@/components/layout/dock-config";
import type { NodoCardinal } from "@/lib/xr/tokens-3d";
import type { EntradaEspacio } from "@/lib/xr/espacio-trinity";
import type { Mano, ModoXR, Postura } from "@/lib/xr/tipos";

/** Cuántos botones caben a la vista antes de mandar el resto a «Más» (§3 a). */
export const MAXIMO_VISIBLE: Record<Postura, number> = { "de-pie": 7, sentado: 7, "una-mano": 5 };

export interface RepartoDock {
    /** Los que se pintan ahora, en el orden del dock 2D. */
    visibles: DockItemConfig[];
    /** El resto de los habilitados, bajo el botón «Más». */
    mas: DockItemConfig[];
}

/** Solo los `enabled`, en su orden, con el tope de la postura; el resto va a `mas`. */
export function itemsDelDock(config: DockItemConfig[], postura: Postura): RepartoDock {
    const habilitados = config.filter((item) => item.enabled);
    const tope = MAXIMO_VISIBLE[postura] ?? MAXIMO_VISIBLE["de-pie"];
    return { visibles: habilitados.slice(0, tope), mas: habilitados.slice(tope) };
}

export const MOTIVO_SIN_VISTA_3D = "Esta app todavía no tiene vista 3D";

export type ResolucionApp =
    | { tipo: "nativa-3d"; id: string }
    | { tipo: "uispec"; ruta: string }
    | { tipo: "solo-2d"; ruta: string; motivo: string };

export interface AppConVista3D {
    /** Ruta ya limpia (sin `?` ni `#`); el grupo 1, si existe, es el id del recurso. */
    patron: RegExp;
    id: string | ((partes: RegExpMatchArray) => string);
}

/**
 * Lo que HOY tiene vista 3D. El hub `/xr`, el propio OS y su panel de ajustes (`/xr/os`),
 * el diagnóstico, las escenas (`/escena/:id`) y las salas XR (`/sala-xr/:id`), Astraura
 * (`/agent`) y su laboratorio. Nada más se declara aquí: lo que no está, se dice.
 */
export const APPS_3D: readonly AppConVista3D[] = [
    { patron: /^\/xr$/, id: "xr-hub" },
    { patron: /^\/xr\/os$/, id: "xr-os" },
    { patron: /^\/xr\/diagnostico$/, id: "xr-diagnostico" },
    { patron: /^\/escena$/, id: "escena" },
    { patron: /^\/escena\/([^/]+)$/, id: (partes) => `escena:${partes[1]}` },
    { patron: /^\/sala-xr$/, id: "sala-xr" },
    { patron: /^\/sala-xr\/([^/]+)$/, id: (partes) => `sala-xr:${partes[1]}` },
    { patron: /^\/agent$/, id: "astraura" },
    { patron: /^\/laboratorio$/, id: "astraura-laboratorio" },
];

/** Rutas que una página declara como `UiSpec` (§3 b, escalón 2). Hoy ninguna app del dock. */
export const RUTAS_UISPEC: readonly RegExp[] = [];

/** Quita `?consulta` y `#ancla` y la barra final; deja siempre una ruta con `/` inicial. */
export function rutaLimpia(ruta: string): string {
    const sinAncla = String(ruta ?? "").split("#")[0];
    const sinConsulta = sinAncla.split("?")[0];
    const conBarra = sinConsulta.startsWith("/") ? sinConsulta : `/${sinConsulta}`;
    return conBarra.length > 1 ? conBarra.replace(/\/+$/, "") : "/";
}

/** Resuelve una app del dock: vista 3D nativa, página `UiSpec` o, honestamente, solo 2D. */
export function resolverApp(item: Pick<DockItemConfig, "path">): ResolucionApp {
    const ruta = rutaLimpia(item.path);
    for (const app of APPS_3D) {
        const partes = ruta.match(app.patron);
        if (!partes) continue;
        return { tipo: "nativa-3d", id: typeof app.id === "string" ? app.id : app.id(partes) };
    }
    for (const patron of RUTAS_UISPEC) {
        if (patron.test(ruta)) return { tipo: "uispec", ruta };
    }
    return { tipo: "solo-2d", ruta, motivo: MOTIVO_SIN_VISTA_3D };
}

/**
 * El color del item del dock 2D → el nodo de la Trinity cuyo acento usa `tokens-3d.ts`.
 * Ningún hex se escribe aquí: quien pinta (`PanelCristal`) lee `COLORES_NODO`.
 */
const NODO_DE_COLOR: Record<DockColor, NodoCardinal> = {
    crimson: "anchor",
    emerald: "horizon",
    amber: "logic",
    cyan: "zenith",
    purple: "zenith",
    neutral: "zenith",
};

export function nodoDeColor(color: DockColor): NodoCardinal {
    return NODO_DE_COLOR[color] ?? "zenith";
}

/** Entrada espacial del dock con los valores de confort; `posicionesDock` la necesita. */
export function entradaDeDock(
    postura: Postura,
    o: { alturaOjos?: number; manoDominante?: Mano; modo?: ModoXR; yawBase?: number; escala?: number } = {},
): EntradaEspacio {
    return {
        postura,
        alturaOjos: o.alturaOjos ?? 1.65,
        manoDominante: o.manoDominante ?? "derecha",
        modo: o.modo ?? "vr-inmersivo",
        yawBase: o.yawBase,
        escala: o.escala,
    };
}
