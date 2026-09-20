/**
 * StarSeed OS — Utilidades puras para la detección de gestos en bordes (Edge Gestures)
 */

export type EdgeType = "zenith" | "anchor" | "horizon" | "logic";

export interface EdgeDetectionInput {
    x: number;
    y: number;
    width: number;
    height: number;
    hotZonePx?: number;
    enabledEdges?: Partial<Record<EdgeType, boolean>>;
}

/**
 * Detecta si un toque inicial ocurre dentro de la zona activa de un borde.
 * Regla de iOS: para 'horizon' (borde izquierdo), si x < 8px no bloquea
 * el gesto 'atrás' del sistema en Safari.
 */
export function detectEdgeGesture(input: EdgeDetectionInput): EdgeType | null {
    const { x, y, width, height } = input;
    const hotZone = input.hotZonePx ?? 20;
    const enabled = input.enabledEdges ?? {};

    const isEnabled = (edge: EdgeType) => enabled[edge] !== false;

    // Arriba: Zenith
    if (y <= hotZone && isEnabled("zenith")) {
        return "zenith";
    }

    // Abajo: Anchor
    if (height - y <= hotZone && isEnabled("anchor")) {
        return "anchor";
    }

    // Izquierda: Horizon (20px zone, excluyendo < 8px para el gesto del sistema iOS)
    if (x >= 8 && x <= hotZone && isEnabled("horizon")) {
        return "horizon";
    }

    // Derecha: Logic
    if (width - x <= hotZone && isEnabled("logic")) {
        return "logic";
    }

    return null;
}
