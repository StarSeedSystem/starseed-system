/**
 * StarSeed XR · APPS 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b). Lógica PURA del
 * dock curvo de Anchor: qué apps del dock 2D se ven, en qué orden, cuántas caben según la postura y
 * a qué abre cada una. No hay aquí una lista nueva: las apps SON LAS MISMAS del dock 2D
 * (`loadDockConfig()`). Honestidad (§3 b): lo que todavía no tiene vista 3D se dice (`solo-2d`
 * con el motivo), nunca se finge. Los colores salen de `tokens-3d.ts`, ninguno escrito a mano.
 */
import type { DockColor, DockItemConfig } from "@/components/layout/dock-config";
import type { Postura } from "@/lib/xr/tipos";
import { COLORES_NODO, CRISTAL, mezclar } from "@/lib/xr/tokens-3d";

/** Cuántas celdas del dock se ven de un tirón según la postura; el resto queda bajo «Más». */
export const MAX_CELDAS_DOCK: Record<Postura, number> = { "de-pie": 7, sentado: 7, "una-mano": 5 };

/** El ÚNICO motivo válido hoy para una app sin vista 3D (contrato §3 b). */
export const MOTIVO_SIN_3D = "Esta app todavía no tiene vista 3D";

/** Color DEL TOKEN (`tokens-3d.ts`) para cada tono del dock 2D; ninguno escrito a mano. El violeta
 * no existe aún en el design system 3D: se funde Zenith (azul) con Anchor (carmín) con `mezclar`. */
export const TINTE_CELDA: Record<DockColor, string> = {
    neutral: CRISTAL.textoSecundario,
    cyan: COLORES_NODO.zenith.base,
    crimson: COLORES_NODO.anchor.base,
    amber: COLORES_NODO.logic.vivo,
    emerald: COLORES_NODO.horizon.base,
    purple: mezclar(COLORES_NODO.zenith.vivo, 0.5, COLORES_NODO.anchor.base),
};

/** A qué abre una app del dock dentro de la sesión (§3 b, los cuatro escalones). */
export type ResolucionApp =
    | { tipo: "nativa-3d"; id: string }
    | { tipo: "uispec"; ruta: string }
    | { tipo: "solo-2d"; ruta: string; motivo: string };

/** Lo que SÍ tiene vista 3D nativa hoy (contrato §3 b): el hub `/xr`, el panel de ajustes XR de
 * Logic (allí vive de verdad, no en una página 2D), Astraura y las escenas/salas XR. `<seg>` se
 * sustituye por el tramo de la ruta (p. ej. `/escena/abc` → `escena:abc`); sin tramo queda limpio. */
export const APPS_3D: readonly { id: string; rutas: readonly string[]; ids?: readonly string[] }[] = [
    { id: "xr-hub", rutas: ["/xr"] },
    { id: "ajustes-xr", rutas: [], ids: ["ajustes-xr"] },
    { id: "astraura", rutas: ["/agent"] },
    { id: "escena:<seg>", rutas: ["/escena"] },
    { id: "sala-xr:<seg>", rutas: ["/sala-xr"] },
];

/** Reparto de las apps del dock 2D: las que se ven de un tirón y las que quedan bajo «Más». */
export interface DockReparto { visibles: DockItemConfig[]; mas: DockItemConfig[] }

/** Solo las `enabled`, EN SU ORDEN del dock 2D, con el tope de la postura y el resto bajo «Más». */
export function itemsDelDock(config: DockItemConfig[], postura: Postura): DockReparto {
    const enabled = config.filter((i) => i.enabled);
    return { visibles: enabled.slice(0, MAX_CELDAS_DOCK[postura]), mas: enabled.slice(MAX_CELDAS_DOCK[postura]) };
}

/** Id nativo que llamará `abrir(id)` (`<seg>` repone el tramo de ruta; sin tramo, id limpio). */
function idDe(base: string, ruta: string, seg: string): string {
    if (!base.includes("<seg>")) return base;
    return seg === "" ? base.replace(":<seg>", "") : base.replace("<seg>", seg.split("/")[0] ?? "");
}

/**
 * Resuelve UN item del dock 2D a su forma honesta de verse en la sesión (§3 b). Ruta exacta o dentro
 * de la app (prefijo + "/"), sin pisar rutas hermanas (`/agent?tab=skills` NO es Astraura). Las
 * rutas declaradas `UiSpec` (vocabulario cerrado del núcleo) se resuelven a `uispec`; el resto,
 * `solo-2d` con el motivo en español: esos escalones los cablea `uispec-uikit` en su tarea.
 */
export function resolverApp(
    item: Pick<DockItemConfig, "id" | "path">,
    rutasUiSpec: readonly string[] = [],
): ResolucionApp {
    if (rutasUiSpec.includes(item.path)) return { tipo: "uispec", ruta: item.path };
    for (const a of APPS_3D) {
        if (a.ids?.includes(item.id)) return { tipo: "nativa-3d", id: a.id };
        for (const r of a.rutas) {
            if (item.path !== r && !item.path.startsWith(`${r}/`)) continue;
            const seg = item.path === r ? "" : item.path.slice(r.length + 1);
            return { tipo: "nativa-3d", id: idDe(a.id, r, seg) };
        }
    }
    return { tipo: "solo-2d", ruta: item.path, motivo: MOTIVO_SIN_3D };
}

