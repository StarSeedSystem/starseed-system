/**
 * StarSeed XR · APPS DEL DOCK EN 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 * Módulo PURO: decide qué apps del dock 2D caben en el arco y cuáles tienen vista 3D de verdad.
 * Ninguna app finge: lo que no tiene vista 3D hoy se abre en 2D con su motivo escrito.
 */
import type { DockColor, DockItemConfig } from "@/components/layout/dock-config";
import type { Postura } from "@/lib/xr/tipos";
import { COLORES_NODO, type NodoCardinal } from "@/lib/xr/tokens-3d";

export interface AppNativa3D {
    /** Identificador estable que recibe el callback `abrir(id)` de la escena. */
    id: string;
    /** Prefijos de ruta que esta app pinta en 3D. */
    rutas: readonly string[];
}

export type ResueltoApp =
    | { tipo: "nativa-3d"; id: string }
    | { tipo: "uispec"; ruta: string }
    | { tipo: "solo-2d"; ruta: string; motivo: string };

export interface RepartoDock {
    visibles: DockItemConfig[];
    mas: DockItemConfig[];
}

export const MOTIVO_SIN_VISTA_3D = "Esta app todavía no tiene vista 3D";

/** Apps que YA tienen vista 3D. Las más específicas van primero (`/xr/os` antes que `/xr`). */
export const APPS_3D: readonly AppNativa3D[] = [
    { id: "ajustes-xr", rutas: ["/xr/os", "/xr/diagnostico"] },
    { id: "xr-hub", rutas: ["/xr"] },
    { id: "escenas-3d", rutas: ["/escena"] },
    { id: "salas-xr", rutas: ["/sala-xr"] },
    { id: "ai-studio", rutas: ["/agent"] },
];

/** Hoy ninguna página del dock está declarada como `UiSpec`; la tabla queda lista para añadirlas. */
export const UISPEC_3D: Readonly<Record<string, string>> = {};

export const MAX_VISIBLES: Record<Postura, number> = {
    "de-pie": 7,
    sentado: 7,
    "una-mano": 5,
};

/** No hay tokens neutro ni violeta: se reutiliza el nodo más próximo de `tokens-3d.ts`. */
export const NODO_POR_COLOR: Record<DockColor, NodoCardinal> = {
    neutral: "logic",
    cyan: "zenith",
    crimson: "anchor",
    amber: "logic",
    emerald: "horizon",
    purple: "zenith",
};

/** Ruta sin `?` ni `#`, con barra inicial; vacía cuenta como `/`. */
export function rutaNormalizada(path: string): string {
    const limpia = (path ?? "").trim();
    if (limpia === "") return "/";
    const sinConsulta = limpia.split(/[?#]/)[0];
    return sinConsulta.startsWith("/") ? sinConsulta : `/${sinConsulta}`;
}

/** `/escena` coincide con `/escena/abc`, pero `/escena-otra` NO coincide. */
const coincide = (ruta: string, base: string): boolean =>
    ruta === base || ruta.startsWith(`${base}/`);

/** Solo las `enabled`, en su orden: las primeras caben en el arco y el resto va bajo «Más». */
export function itemsDelDock(config: DockItemConfig[], postura: Postura): RepartoDock {
    const limite = MAX_VISIBLES[postura] ?? MAX_VISIBLES["de-pie"];
    const habilitadas = config.filter((i) => i.enabled);
    return { visibles: habilitadas.slice(0, limite), mas: habilitadas.slice(limite) };
}

/** Páginas de como máximo `MAX_VISIBLES[postura]`: la primera son las visibles y «Más» reparte el resto. */
export function paginasDelDock(config: DockItemConfig[], postura: Postura): DockItemConfig[][] {
    const { visibles, mas } = itemsDelDock(config, postura);
    const limite = Math.max(1, MAX_VISIBLES[postura] ?? MAX_VISIBLES["de-pie"]);
    const paginas = [visibles];
    for (let i = 0; i < mas.length; i += limite) paginas.push(mas.slice(i, i + limite));
    return paginas;
}

/** Inicial del nombre para el círculo del dock (uikit no pinta el SVG DOM de lucide). */
export const inicialDe = (label: string): string => label.trim().charAt(0).toUpperCase() || "?";

/** Motivo honesto cuando no se puede abrir el panel 3D todavía. */
export function motivoDeApertura(r: ResueltoApp): string {
    if (r.tipo === "nativa-3d") return "Próximamente: la escena 3D de esta app se cablea en XR1010AS.";
    if (r.tipo === "uispec") return "Esta página se pinta en 3D cuando esté declarada como UiSpec.";
    return r.motivo;
}

/** Vista 3D real, página `UiSpec` o, si no hay ninguna, 2D con el motivo escrito. Nunca finge. */
export function resolverApp(item: Pick<DockItemConfig, "path">): ResueltoApp {
    const ruta = rutaNormalizada(item.path);
    const app = APPS_3D.find((a) => a.rutas.some((base) => coincide(ruta, base)));
    if (app) return { tipo: "nativa-3d", id: app.id };
    if (Object.prototype.hasOwnProperty.call(UISPEC_3D, ruta)) return { tipo: "uispec", ruta: item.path };
    return { tipo: "solo-2d", ruta: item.path, motivo: MOTIVO_SIN_VISTA_3D };
}

export function nodoDeColor(color: DockColor): NodoCardinal {
    return NODO_POR_COLOR[color] ?? "zenith";
}

export const colorDeColor = (color: DockColor): string => COLORES_NODO[nodoDeColor(color)].vivo;
