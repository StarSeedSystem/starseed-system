// ════════════════════════════════════════════════════════════════
// StarSeed OS — Snap de ventanas a mitades/cuartos (tipo macOS/Windows)
// ----------------------------------------------------------------
// Resuelve la ZONA de snap bajo el puntero mientras se arrastra una
// ventana por la cabecera, y el RECT resultante al soltarla ahí. Puro
// (sin React/DOM más allá de medidas de viewport ya resueltas por el
// llamador) para poder testear y reutilizar desde el lienzo (preview
// global) y desde el frame de ventana (deteción por puntero).
// ════════════════════════════════════════════════════════════════

import type { DesktopWindowRect } from "./desktop-store";

export type SnapZone =
    | "left" | "right" | "top"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Franja sensible al borde (px) donde empieza a sugerirse el snap. */
export const SNAP_MARGIN = 28;
/** Franja de esquina (px) — más generosa para facilitar cuartos. */
const CORNER_MARGIN = 88;

/**
 * Dado el puntero (clientX/Y) y el viewport, decide si hay una zona de
 * snap activa. `topInset` es la altura de la barra superior (zona
 * excluida arriba). Devuelve null si el puntero no está cerca de ningún
 * borde reconocido.
 */
export function resolveSnapZone(
    clientX: number,
    clientY: number,
    vw: number,
    vh: number,
    topInset: number,
): SnapZone | null {
    const nearLeft = clientX <= SNAP_MARGIN;
    const nearRight = clientX >= vw - SNAP_MARGIN;
    const nearTop = clientY <= topInset + SNAP_MARGIN;

    // Esquinas primero (radio mayor, más fácil de alcanzar en pantallas grandes).
    if (clientX <= CORNER_MARGIN && clientY <= topInset + CORNER_MARGIN) return "top-left";
    if (clientX >= vw - CORNER_MARGIN && clientY <= topInset + CORNER_MARGIN) return "top-right";
    if (clientX <= CORNER_MARGIN && clientY >= vh - CORNER_MARGIN) return "bottom-left";
    if (clientX >= vw - CORNER_MARGIN && clientY >= vh - CORNER_MARGIN) return "bottom-right";

    if (nearTop) return "top";
    if (nearLeft) return "left";
    if (nearRight) return "right";
    return null;
}

/** Rect final (en px de pantalla) para una zona de snap dada. */
export function snapZoneRect(
    zone: SnapZone,
    vw: number,
    vh: number,
    topInset: number,
): DesktopWindowRect {
    const top = topInset + 4;
    const fullH = vh - top - 12;
    const halfH = Math.round((fullH - 4) / 2);
    const halfW = Math.round((vw - 12) / 2);
    switch (zone) {
        case "left": return { x: 4, y: top, w: halfW - 2, h: fullH };
        case "right": return { x: 4 + halfW + 4, y: top, w: halfW - 2, h: fullH };
        case "top": return { x: 4, y: top, w: vw - 8, h: fullH };
        case "top-left": return { x: 4, y: top, w: halfW - 2, h: halfH };
        case "top-right": return { x: 4 + halfW + 4, y: top, w: halfW - 2, h: halfH };
        case "bottom-left": return { x: 4, y: top + halfH + 4, w: halfW - 2, h: halfH - 4 };
        case "bottom-right": return { x: 4 + halfW + 4, y: top + halfH + 4, w: halfW - 2, h: halfH - 4 };
    }
}

/** Rect de PREVIEW (overlay translúcido) — mismo cálculo que el final. */
export function snapPreviewRect(
    zone: SnapZone,
    vw: number,
    vh: number,
    topInset: number,
): DesktopWindowRect {
    return snapZoneRect(zone, vw, vh, topInset);
}
