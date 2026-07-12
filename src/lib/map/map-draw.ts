// src/lib/map/map-draw.ts
// ─────────────────────────────────────────────────────────────────────────────
// DIBUJO LIBRE de zonas sobre Leaflet (Adenda 63 · P-5) — SIN plugins externos:
// todo se construye con la API BASE de Leaflet (Polyline, Polygon, Marker,
// LayerGroup) más eventos DOM nativos en el contenedor del mapa.
//
// Dos formas de trazar, la misma herramienta:
//
//   · CLIC A CLIC  → cada pulsación añade un vértice; una polilínea "viva"
//     sigue al cursor (mousemove) y una guía discontinua insinúa el cierre.
//     Doble clic (o doble toque) cierra la zona.
//   · A MANO ALZADA → mantener pulsado y arrastrar: se muestrea el trazo cada
//     ~15 px y al soltar se cierra y se SIMPLIFICA (distancia mínima +
//     Douglas-Peucker), evitando anillos con miles de vértices.
//
// Teclado: Backspace = deshacer vértice · Enter = cerrar · Escape = cancelar.
// Tras cerrar, el trazador pasa a modo EDICIÓN: marcadores de vértice
// arrastrables (clic derecho / pulsación larga sobre uno lo elimina).
//
// Touch-safe (touchstart/move/end además de mouse) y SSR-safe (solo se
// construye dentro de efectos, nunca en render).
// ─────────────────────────────────────────────────────────────────────────────

import type { LeafletNS } from "./leaflet-loader";
import {
    isValidRing,
    ringAreaM2,
    simplifyRing,
    type LatLngTuple,
} from "./map-geometry";

// ── Parámetros del trazo ─────────────────────────────────────────────────────

/** Umbral (px) a partir del cual un arrastre se considera trazo a mano alzada. */
const FREEHAND_START_PX = 8;
/** Muestreo del trazo a mano alzada (px entre puntos capturados). */
const FREEHAND_SAMPLE_PX = 15;
/** Ventana (ms) y radio (px) para detectar el doble clic / doble toque. */
const DBL_MS = 380;
const DBL_PX = 16;
/** Máximo de marcadores de vértice arrastrables (más allá, sería inmanejable). */
export const MAX_EDITABLE_VERTICES = 80;

export type DrawMode = "idle" | "drawing" | "editing";

export interface DrawSnapshot {
    mode: DrawMode;
    /** Anillo actual (vértices confirmados). */
    ring: LatLngTuple[];
    /** Área aproximada en m² (0 con menos de 3 vértices). */
    areaM2: number;
    /** true mientras el usuario está trazando a mano alzada. */
    freehand: boolean;
    /** true si el anillo actual ya es una zona válida (≥3 vértices, área > 0). */
    valid: boolean;
}

export interface ZoneDrawerOptions {
    /** Color del trazo (por defecto, el ámbar de zona en votación). */
    color?: string;
    /** Se llama en CADA cambio (añadir/quitar/arrastrar vértice, cambio de modo). */
    onChange?: (snapshot: DrawSnapshot) => void;
    /** Se llama al CERRAR una zona válida. El trazador queda en modo edición. */
    onFinish?: (ring: LatLngTuple[]) => void;
    /** Se llama al cancelar (Escape o botón). */
    onCancel?: () => void;
}

export interface ZoneDrawer {
    /** Entra en modo dibujo (limpia lo anterior). */
    start(): void;
    /** Deshace el último vértice (solo en modo dibujo). */
    undo(): void;
    /** Cierra la zona si es válida (≥3 vértices). Devuelve el anillo o null. */
    finish(): LatLngTuple[] | null;
    /** Cancela y limpia todo (vuelve a idle). */
    cancel(): void;
    /** Limpia la geometría del mapa sin disparar onCancel (vuelve a idle). */
    clear(): void;
    /** Anillo actual (copia). */
    getRing(): LatLngTuple[];
    mode(): DrawMode;
    /** Desmonta listeners y capas. Idempotente. */
    destroy(): void;
}

// ── Utilidades internas ──────────────────────────────────────────────────────

interface Pt { x: number; y: number }

function distPx(a: Pt, b: Pt): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Metros por píxel en el zoom/latitud actuales (para simplificar en metros). */
function metersPerPixel(map: any): number {
    try {
        const lat = map.getCenter().lat as number;
        const zoom = map.getZoom() as number;
        return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
    } catch {
        return 1;
    }
}

/** true si hay ≥2 dedos: es un pinch-zoom, NO un trazo (lo maneja Leaflet). */
function isMultiTouch(ev: MouseEvent | TouchEvent): boolean {
    const t = (ev as TouchEvent).touches;
    return !!t && t.length > 1;
}

/** Extrae clientX/clientY de un evento de ratón o táctil. */
function clientPoint(ev: MouseEvent | TouchEvent): Pt | null {
    const touch = (ev as TouchEvent).touches?.[0] ?? (ev as TouchEvent).changedTouches?.[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
    const me = ev as MouseEvent;
    if (typeof me.clientX === "number") return { x: me.clientX, y: me.clientY };
    return null;
}

// ── Fábrica ──────────────────────────────────────────────────────────────────

/**
 * Crea el trazador de zonas sobre un mapa Leaflet ya inicializado.
 * No engancha NADA hasta que se llama a `start()`.
 */
export function createZoneDrawer(
    L: LeafletNS,
    map: any,
    opts: ZoneDrawerOptions = {},
): ZoneDrawer {
    const color = opts.color ?? "#fbbf24";
    const container: HTMLElement = map.getContainer();

    let mode: DrawMode = "idle";
    let vertices: LatLngTuple[] = [];
    let destroyed = false;

    // Gesto en curso
    let pressing = false;
    let freehand = false;
    let downPt: Pt | null = null;
    let lastSamplePt: Pt | null = null;
    let lastTap: { t: number; p: Pt } | null = null;

    // Capas
    const layerGroup = L.layerGroup().addTo(map);
    const fillLayer = L.polygon([], {
        color,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.12,
        interactive: false,
    });
    const traceLayer = L.polyline([], {
        color,
        weight: 2.5,
        opacity: 0.95,
        interactive: false,
    });
    const rubberLayer = L.polyline([], {
        color,
        weight: 1.5,
        opacity: 0.75,
        dashArray: "5 7",
        interactive: false,
    });
    const vertexGroup = L.layerGroup();
    try {
        layerGroup.addLayer(fillLayer);
        layerGroup.addLayer(traceLayer);
        layerGroup.addLayer(rubberLayer);
        layerGroup.addLayer(vertexGroup);
    } catch { /* noop */ }

    // ── Estado observable ──
    function snapshot(): DrawSnapshot {
        return {
            mode,
            ring: [...vertices],
            areaM2: vertices.length >= 3 ? ringAreaM2(vertices) : 0,
            freehand,
            valid: isValidRing(vertices),
        };
    }
    function emit(): void {
        try { opts.onChange?.(snapshot()); } catch { /* noop */ }
    }

    // ── Render ──
    function redraw(cursor?: LatLngTuple | null): void {
        if (destroyed) return;
        try {
            traceLayer.setLatLngs(vertices);
            fillLayer.setLatLngs(vertices.length >= 3 ? vertices : []);

            // Goma elástica: último vértice → cursor → primer vértice.
            if (mode === "drawing" && cursor && vertices.length > 0) {
                const guide: LatLngTuple[] = [vertices[vertices.length - 1], cursor];
                if (vertices.length >= 2) guide.push(vertices[0]);
                rubberLayer.setLatLngs(guide);
            } else if (mode === "editing" && vertices.length >= 3) {
                // En edición el anillo está cerrado: el polígono ya lo dibuja.
                rubberLayer.setLatLngs([]);
            } else {
                rubberLayer.setLatLngs([]);
            }

            renderVertices();
        } catch { /* noop */ }
    }

    // Los marcadores de vértice solo se reconstruyen cuando cambia algo que los
    // afecta (modo · nº de vértices · a mano alzada). Sin esto, el `mousemove`
    // de la goma elástica los repintaría en cada frame.
    let renderedKey = "";

    function renderVertices(): void {
        if (destroyed) return;
        const key = `${mode}:${vertices.length}:${freehand}`;
        if (key === renderedKey) return;
        renderedKey = key;
        try { vertexGroup.clearLayers(); } catch { /* noop */ }
        // Durante el trazo a mano alzada no pintamos vértices (serían cientos).
        if (mode === "drawing" && (freehand || vertices.length > MAX_EDITABLE_VERTICES)) return;
        if (mode === "editing" && vertices.length > MAX_EDITABLE_VERTICES) return;
        if (mode === "idle") return;

        vertices.forEach((v, i) => {
            try {
                if (mode === "editing") {
                    const marker = L.marker(v, {
                        draggable: true,
                        keyboard: false,
                        icon: L.divIcon({
                            className: "ss-divicon",
                            html: '<span class="ss-vertex"></span>',
                            iconSize: [14, 14],
                            iconAnchor: [7, 7],
                        }),
                        zIndexOffset: 700,
                        title: "Arrastra para mover · clic derecho o pulsación larga para eliminar",
                    });
                    marker.on("drag", (e: any) => {
                        const ll = e.target.getLatLng();
                        vertices[i] = [ll.lat, ll.lng];
                        try {
                            traceLayer.setLatLngs(vertices);
                            fillLayer.setLatLngs(vertices);
                        } catch { /* noop */ }
                    });
                    marker.on("dragend", () => emit());
                    marker.on("contextmenu", (e: any) => {
                        try { e.originalEvent?.preventDefault?.(); } catch { /* noop */ }
                        if (vertices.length <= 3) return; // un polígono necesita 3
                        vertices.splice(i, 1);
                        redraw();
                        emit();
                    });
                    vertexGroup.addLayer(marker);
                } else {
                    const dot = L.circleMarker(v, {
                        radius: i === 0 ? 6 : 4,
                        color: "#ffffff",
                        weight: 2,
                        fillColor: color,
                        fillOpacity: 1,
                        interactive: false,
                    });
                    vertexGroup.addLayer(dot);
                }
            } catch { /* noop */ }
        });
    }

    // ── Conversión de evento → latlng ──
    function latLngFromEvent(ev: MouseEvent | TouchEvent): { latlng: LatLngTuple; point: Pt } | null {
        const cp = clientPoint(ev);
        if (!cp) return null;
        try {
            const rect = container.getBoundingClientRect();
            const point = { x: cp.x - rect.left, y: cp.y - rect.top };
            const ll = map.containerPointToLatLng(L.point(point.x, point.y));
            return { latlng: [ll.lat, ll.lng], point };
        } catch {
            return null;
        }
    }

    // ── Gestos ──
    function addVertex(v: LatLngTuple): void {
        vertices.push(v);
        redraw();
        emit();
    }

    function onDown(ev: MouseEvent | TouchEvent): void {
        if (mode !== "drawing") return;
        // Pinch-zoom (2 dedos): que lo maneje Leaflet, no es un trazo.
        if (isMultiTouch(ev)) { pressing = false; freehand = false; return; }
        // Solo botón principal del ratón.
        if ("button" in ev && (ev as MouseEvent).button !== 0) return;
        const hit = latLngFromEvent(ev);
        if (!hit) return;
        pressing = true;
        freehand = false;
        downPt = hit.point;
        lastSamplePt = hit.point;
        try { ev.preventDefault(); } catch { /* noop */ }
    }

    function onMove(ev: MouseEvent | TouchEvent): void {
        if (mode !== "drawing") return;
        if (isMultiTouch(ev)) { pressing = false; freehand = false; return; }
        const hit = latLngFromEvent(ev);
        if (!hit) return;

        if (!pressing) {
            // Goma elástica siguiendo el cursor.
            redraw(hit.latlng);
            return;
        }

        if (!freehand && downPt && distPx(hit.point, downPt) > FREEHAND_START_PX) {
            // El arrastre se convierte en TRAZO A MANO ALZADA.
            freehand = true;
            const start = latLngFromEventPoint(downPt);
            if (start) vertices.push(start);
            lastSamplePt = downPt;
            emit();
        }

        if (freehand) {
            try { ev.preventDefault(); } catch { /* noop */ }
            if (!lastSamplePt || distPx(hit.point, lastSamplePt) >= FREEHAND_SAMPLE_PX) {
                lastSamplePt = hit.point;
                vertices.push(hit.latlng);
                redraw();
            }
        }
    }

    function latLngFromEventPoint(p: Pt): LatLngTuple | null {
        try {
            const ll = map.containerPointToLatLng(L.point(p.x, p.y));
            return [ll.lat, ll.lng];
        } catch {
            return null;
        }
    }

    function onUp(ev: MouseEvent | TouchEvent): void {
        if (mode !== "drawing") return;
        // El `mouseup` se escucha en window (para no perder el final de un
        // arrastre fuera del mapa), así que hay que descartar los que NO
        // empezaron sobre el lienzo: p. ej. pulsar un botón de la barra de
        // herramientas no debe añadir un vértice.
        if (!pressing) return;
        const hit = latLngFromEvent(ev);
        const wasFreehand = freehand;
        pressing = false;
        freehand = false;
        downPt = null;
        lastSamplePt = null;

        if (wasFreehand) {
            // Cierra automáticamente: el trazo a mano alzada ES la zona.
            if (hit) vertices.push(hit.latlng);
            const mpp = metersPerPixel(map);
            vertices = simplifyRing(vertices, {
                minDistanceM: mpp * 12,
                toleranceM: mpp * 5,
            });
            redraw();
            emit();
            finish();
            return;
        }

        if (!hit) return;

        // Doble clic / doble toque → cerrar (sin duplicar el vértice).
        const now = Date.now();
        if (lastTap && now - lastTap.t < DBL_MS && distPx(hit.point, lastTap.p) < DBL_PX) {
            lastTap = null;
            finish();
            return;
        }
        lastTap = { t: now, p: hit.point };
        addVertex(hit.latlng);
    }

    function onKeyDown(ev: KeyboardEvent): void {
        if (mode === "idle") return;
        // Si hay un diálogo modal abierto (p. ej. el de la propuesta), las teclas
        // son SUYAS: Escape debe cerrar el diálogo, no borrar la zona dibujada.
        try {
            if (document.querySelector('[role="dialog"][data-state="open"]')) return;
        } catch { /* noop */ }
        // No robar teclas si el foco está en un campo de texto (buscador, etc.).
        const el = document.activeElement as HTMLElement | null;
        const tag = el?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;

        if (ev.key === "Escape") {
            ev.preventDefault();
            cancel();
        } else if (ev.key === "Backspace" || ev.key === "Delete") {
            if (mode !== "drawing") return;
            ev.preventDefault();
            undo();
        } else if (ev.key === "Enter") {
            if (mode !== "drawing") return;
            ev.preventDefault();
            finish();
        }
    }

    // ── Enganche / desenganche de listeners y del mapa ──
    // `drawBound`: punteros + handlers del mapa (solo en modo dibujo).
    // `keysBound`: teclado (dibujo Y edición — Escape debe seguir cancelando).
    let drawBound = false;
    let keysBound = false;

    function bindKeys(): void {
        if (keysBound || destroyed) return;
        keysBound = true;
        window.addEventListener("keydown", onKeyDown);
    }

    function unbindKeys(): void {
        if (!keysBound) return;
        keysBound = false;
        window.removeEventListener("keydown", onKeyDown);
    }

    function bindDraw(): void {
        if (drawBound || destroyed) return;
        drawBound = true;
        try {
            // El mapa NO debe panear ni hacer zoom por doble clic mientras se dibuja.
            map.dragging?.disable?.();
            map.doubleClickZoom?.disable?.();
            map.boxZoom?.disable?.();
            container.classList.add("ss-drawing");
        } catch { /* noop */ }
        container.addEventListener("mousedown", onDown);
        container.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        container.addEventListener("touchstart", onDown, { passive: false });
        container.addEventListener("touchmove", onMove, { passive: false });
        container.addEventListener("touchend", onUp);
    }

    function unbindDraw(): void {
        if (!drawBound) return;
        drawBound = false;
        container.removeEventListener("mousedown", onDown);
        container.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        container.removeEventListener("touchstart", onDown);
        container.removeEventListener("touchmove", onMove);
        container.removeEventListener("touchend", onUp);
        try {
            // Devuelve el paneo/zoom al mapa: en edición los vértices se
            // arrastran con sus propios marcadores.
            map.dragging?.enable?.();
            map.doubleClickZoom?.enable?.();
            map.boxZoom?.enable?.();
            container.classList.remove("ss-drawing");
        } catch { /* noop */ }
    }

    // ── API pública ──
    function start(): void {
        if (destroyed) return;
        vertices = [];
        pressing = false;
        freehand = false;
        downPt = null;
        lastSamplePt = null;
        lastTap = null;
        mode = "drawing";
        bindKeys();
        bindDraw();
        redraw();
        emit();
    }

    function undo(): void {
        if (mode !== "drawing" || vertices.length === 0) return;
        vertices.pop();
        redraw();
        emit();
    }

    function finish(): LatLngTuple[] | null {
        if (mode !== "drawing") return null;
        if (!isValidRing(vertices)) {
            emit(); // la UI avisa: hacen falta ≥3 vértices
            return null;
        }
        mode = "editing";
        unbindDraw();   // el mapa vuelve a panear; el teclado sigue vivo (Escape)
        redraw();
        emit();
        const ring = [...vertices];
        try { opts.onFinish?.(ring); } catch { /* noop */ }
        return ring;
    }

    function clear(): void {
        unbindDraw();
        unbindKeys();
        vertices = [];
        pressing = false;
        freehand = false;
        downPt = null;
        lastSamplePt = null;
        lastTap = null;
        mode = "idle";
        redraw();
        emit();
    }

    function cancel(): void {
        clear();
        try { opts.onCancel?.(); } catch { /* noop */ }
    }

    function destroy(): void {
        if (destroyed) return;
        unbindDraw();
        unbindKeys();
        destroyed = true;
        try { map.removeLayer(layerGroup); } catch { /* noop */ }
    }

    return {
        start,
        undo,
        finish,
        cancel,
        clear,
        getRing: () => [...vertices],
        mode: () => mode,
        destroy,
    };
}
