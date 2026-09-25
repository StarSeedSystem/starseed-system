"use client";

/**
 * useDeslizarPasos — pasar de paso deslizando en horizontal (dedo, ratón o lápiz).
 * ─────────────────────────────────────────────────────────────────────────────
 * Para tarjetas de guías y asistentes: deslizar hacia la izquierda avanza y
 * hacia la derecha retrocede, como pasar páginas. Usa el mismo umbral de
 * intención que las cortinas, así que tocar un botón de la tarjeta sigue siendo
 * un clic y desplazar en vertical sigue siendo scroll. Nunca nace dentro de
 * `[data-sin-arrastre]` (zonas de práctica con gestos propios, la X…).
 * La tarjeta debería llevar `touch-action: pan-y` para que el navegador no se
 * quede el gesto horizontal.
 */

import { useCallback, useRef } from "react";
import {
    evaluarIntencion,
    instanteDeEvento,
    registrarMuestra,
    umbralParaPuntero,
    velocidad,
    type Intencion,
    type Muestra,
} from "@/lib/gestos";
import { SELECTOR_SIN_ARRASTRE } from "./use-arrastre-panel";

/** Recorrido (px) o velocidad (px/ms) que cuentan como «pasar la página». */
export const DISTANCIA_PASO_PX = 64;
export const LATIGAZO_PASO_PX_MS = 0.4;

export type DecisionPaso = "siguiente" | "anterior" | null;

/** Pura: ¿el gesto soltado pide cambiar de paso? */
export function decidirPaso(dx: number, v: number): DecisionPaso {
    if (dx <= -DISTANCIA_PASO_PX || v <= -LATIGAZO_PASO_PX_MS) return dx < 0 ? "siguiente" : null;
    if (dx >= DISTANCIA_PASO_PX || v >= LATIGAZO_PASO_PX_MS) return dx > 0 ? "anterior" : null;
    return null;
}

interface Gesto {
    id: number;
    tipo: string;
    inicio: Muestra;
    muestras: Muestra[];
    intencion: Intencion;
}

export function useDeslizarPasos(o: { alSiguiente: () => void; alAnterior: () => void; habilitado?: boolean }) {
    const opcionesRef = useRef(o);
    opcionesRef.current = o;
    const gestoRef = useRef<Gesto | null>(null);
    const suprimirClicRef = useRef(false);
    const ahora = (e: { timeStamp?: number }) => instanteDeEvento(e.timeStamp, performance.now());

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
        // Una pulsación nueva nunca hereda la supresión del clic del deslizamiento anterior.
        suprimirClicRef.current = false;
        if (opcionesRef.current.habilitado === false) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const objetivo = e.target instanceof Element ? e.target : null;
        if (!objetivo || objetivo.closest(SELECTOR_SIN_ARRASTRE)) return;
        const m = { x: e.clientX, y: e.clientY, t: ahora(e) };
        gestoRef.current = { id: e.pointerId, tipo: e.pointerType, inicio: m, muestras: [m], intencion: "pendiente" };
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const g = gestoRef.current;
        if (!g || g.id !== e.pointerId) return;
        const m = { x: e.clientX, y: e.clientY, t: ahora(e) };
        if (g.intencion === "pendiente") {
            g.intencion = evaluarIntencion("x", m.x - g.inicio.x, m.y - g.inicio.y, { umbralPx: umbralParaPuntero(g.tipo) });
            if (g.intencion === "rechazada") {
                gestoRef.current = null;
                return;
            }
        }
        g.muestras = registrarMuestra(g.muestras, m);
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const g = gestoRef.current;
        gestoRef.current = null;
        if (!g || g.id !== e.pointerId || g.intencion !== "aceptada") return;
        const t = ahora(e);
        const muestras = registrarMuestra(g.muestras, { x: e.clientX, y: e.clientY, t });
        const decision = decidirPaso(e.clientX - g.inicio.x, velocidad(muestras, "x", 100, t));
        if (!decision) return;
        // Tras deslizar, el clic que emite el navegador no debe pulsar un botón de la tarjeta.
        suprimirClicRef.current = true;
        window.setTimeout(() => {
            suprimirClicRef.current = false;
        }, 400);
        if (decision === "siguiente") opcionesRef.current.alSiguiente();
        else opcionesRef.current.alAnterior();
    }, []);

    const onPointerCancel = useCallback(() => {
        gestoRef.current = null;
    }, []);

    const onClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
        if (!suprimirClicRef.current) return;
        suprimirClicRef.current = false;
        e.preventDefault();
        e.stopPropagation();
    }, []);

    return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture };
}
