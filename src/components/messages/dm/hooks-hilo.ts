"use client";

/**
 * Ganchos pequeños del panel de chat: tamaño de pantalla, movimiento reducido (sistema o
 * `html[data-perf="eco"]`) y pulsación larga en pantallas táctiles.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent as EventoRaton, type PointerEvent as EventoPuntero } from "react";
import { useReducedMotion } from "framer-motion";

/** true por debajo de 768 px (cambia en vivo al girar o redimensionar). */
export function useEsMovil(maxAncho = 767): boolean {
    const [movil, setMovil] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia(`(max-width: ${maxAncho}px)`);
        const aplicar = () => setMovil(mq.matches);
        aplicar();
        mq.addEventListener?.("change", aplicar);
        return () => mq.removeEventListener?.("change", aplicar);
    }, [maxAncho]);
    return movil;
}

/** Movimiento reducido: preferencia del sistema o modo de rendimiento «eco». */
export function useMovimientoReducido(): boolean {
    const sistema = useReducedMotion();
    const [eco, setEco] = useState(false);
    useEffect(() => {
        if (typeof document === "undefined") return;
        const html = document.documentElement;
        const leer = () => setEco(html.dataset.perf === "eco");
        leer();
        if (typeof MutationObserver === "undefined") return;
        const obs = new MutationObserver(leer);
        obs.observe(html, { attributes: true, attributeFilter: ["data-perf"] });
        return () => obs.disconnect();
    }, []);
    return !!sistema || eco;
}

/** Transición de paneles/hojas (muelle suave, o instantánea si hay movimiento reducido). */
export function transicionPanel(reducido: boolean) {
    return reducido ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 32 };
}

/**
 * Pulsación larga táctil (450 ms) — abre el menú de acciones de una burbuja sin tapar el
 * desplazamiento: si el dedo se mueve, se cancela.
 */
export function usePulsacionLarga(accion: () => void, ms = 450) {
    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
    const origen = useRef<{ x: number; y: number } | null>(null);
    const disparada = useRef(false);

    const cancelar = useCallback(() => {
        if (temporizador.current) clearTimeout(temporizador.current);
        temporizador.current = null;
        origen.current = null;
    }, []);

    useEffect(() => cancelar, [cancelar]);

    return {
        onPointerDown: (e: EventoPuntero) => {
            if (e.pointerType === "mouse") return;
            disparada.current = false;
            origen.current = { x: e.clientX, y: e.clientY };
            temporizador.current = setTimeout(() => {
                disparada.current = true;
                accion();
            }, ms);
        },
        onPointerMove: (e: EventoPuntero) => {
            if (!origen.current) return;
            if (Math.abs(e.clientX - origen.current.x) > 8 || Math.abs(e.clientY - origen.current.y) > 8) cancelar();
        },
        onPointerUp: cancelar,
        onPointerCancel: cancelar,
        onPointerLeave: cancelar,
        /** Tras una pulsación larga, el clic que la sigue no debe abrir nada más. */
        onClickCapture: (e: EventoRaton) => {
            if (disparada.current) {
                e.preventDefault();
                e.stopPropagation();
                disparada.current = false;
            }
        },
    };
}
