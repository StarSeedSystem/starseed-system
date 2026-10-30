/**
 * StarSeed XR · APPS DEL DOCK 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a-b).
 *
 * Misma FUENTE de verdad que el dock 2D (`src/components/layout/dock-config.ts`): el dock curvo del
 * Anchor enseña LAS MISMAS apps. Módulo PURO (sin React, sin red, sin disco); el honesto §3 b-4:
 * lo que aún no tiene vista 3D se dice con motivo y oferta salir a 2D, nunca se finge.
 */
import type { DockItemConfig } from "../../layout/dock-config";
import type { Postura } from "../../../lib/xr/tipos";

/** Máximo de botones visibles a la vez según la postura (el resto va bajo «Más»). */
export const MAX_DOCK_POR_POSTURA: Record<Postura, number> = {
  "de-pie": 7,
  sentado: 7,
  "una-mano": 5,
};

/** Motivo honesto del contrato (§3 b, escalón 4). */
export const MOTIVO_SIN_VISTA_3D = "Esta app todavía no tiene vista 3D.";

/** Lo que SÍ tiene vista 3D hoy. `prefijo` = coincide con la ruta y con `ruta/…`. */
export interface EntradaApps3D {
  ruta: string;
  id: string;
  prefijo?: boolean;
  /** `nativa-3d` por defecto; `uispec` cuando la página llegue como UiSpec (vía XR1010AQ). */
  via?: "nativa-3d" | "uispec";
}

export const APPS_3D: EntradaApps3D[] = [
  { ruta: "/xr", id: "hub-xr" },
  { ruta: "/escena", id: "escena-3d", prefijo: true },
  { ruta: "/sala-xr", id: "sala-xr", prefijo: true },
  { ruta: "/agent", id: "astraura" },
  { ruta: "/settings", id: "ajustes-xr" },
];

export type ResolucionApp =
  | { tipo: "nativa-3d"; id: string }
  | { tipo: "uispec"; ruta: string }
  | { tipo: "solo-2d"; ruta: string; motivo: string };

/** Parte el dock en los botones visibles y los que quedan bajo el botón «Más». */
export interface DockPartido {
  visibles: DockItemConfig[];
  ocultos: DockItemConfig[];
}

export function itemsDelDock(config: DockItemConfig[], postura: Postura): DockPartido {
  const limite = MAX_DOCK_POR_POSTURA[postura];
  const habilitados = config.filter((item) => item.enabled);
  return { visibles: habilitados.slice(0, limite), ocultos: habilitados.slice(limite) };
}

/**
 * Resuelve QUÉ pasa al pulsar un item del dock. Nativa 3D solo para lo de `APPS_3D`;
 * lo demás es `solo-2d` con su motivo en español. Nunca inventa una vista 3D que no existe.
 */
export function resolverApp(item: Pick<DockItemConfig, "id" | "label" | "path">): ResolucionApp {
  for (const entrada of APPS_3D) {
    const exacta = item.path === entrada.ruta;
    const conPrefijo = entrada.prefijo === true && item.path.startsWith(entrada.ruta + "/");
    if (!exacta && !conPrefijo) continue;
    if (entrada.via === "uispec") return { tipo: "uispec", ruta: item.path };
    return { tipo: "nativa-3d", id: entrada.id };
  }
  return { tipo: "solo-2d", ruta: item.path, motivo: MOTIVO_SIN_VISTA_3D };
}
