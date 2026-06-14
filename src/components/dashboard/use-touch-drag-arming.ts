'use client';

/*
 * Trinity Móvil · Bloque 1 — arrastre táctil por pulsación mantenida para el
 * grid del dashboard (react-grid-layout v2 + react-draggable).
 *
 * Mecánica (documentada primero en architecture/integracion-portal-starseed-os.md):
 *  - DraggableCore escucha `touchstart` NATIVO sobre cada `.react-grid-item` y,
 *    si el target casa con el handle, hace `preventDefault()` → mata el scroll.
 *  - Este hook intercepta los touchstart en FASE DE CAPTURA sobre el contenedor
 *    del grid y los detiene (`stopPropagation`) antes de que lleguen a
 *    DraggableCore → el navegador scrollea libre.
 *  - Si el dedo se mantiene ~320 ms sin moverse >10 px, el widget se ARMA:
 *    vibración háptica, elevación visual y re-despacho de un TouchEvent
 *    sintético con el Touch vivo para que react-grid-layout inicie su drag
 *    normal EN EL MISMO GESTO. Mientras dura el armado, un listener global
 *    `touchmove {passive:false}` evita que el navegador convierta el gesto
 *    en scroll.
 *  - El ratón nunca pasa por aquí (solo eventos touch): escritorio intacto.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const DEFAULT_HOLD_MS = 3000; // pulsación mantenida por defecto (configurable en Ajustes → Trinity)
const SLOP_PX = 10;           // movimiento que cancela el armado (gana el scroll)
const FALLBACK_ARMED_MS = 4000; // gracia si el navegador no soporta new TouchEvent()

/** Selectores que conservan su comportamiento táctil inmediato.
 * IMPORTANTE: el `.drag-handle` NO se incluye aquí — en táctil incluso el asa
 * de arrastre requiere la pulsación mantenida, para que deslizar sobre la
 * cabecera de un widget haga SCROLL y no lo arrastre. Solo el handle de
 * redimensionar conserva su gesto inmediato. */
const PASSTHROUGH_SELECTOR = ".react-resizable-handle";
/** Controles cuyo tap no debe armar un drag. */
const INTERACTIVE_SELECTOR =
    'button, a, input, textarea, select, [role="button"], [role="slider"], [contenteditable="true"]';

interface PendingHold {
    timer: ReturnType<typeof setTimeout>;
    itemEl: HTMLElement;
    itemKey: string;
    startX: number;
    startY: number;
    touchId: number;
    lastTouch: Touch;
}

export interface TouchDragArming {
    /** id (layout.i) del widget armado, o null */
    armedId: string | null;
    /** true si el dispositivo es de puntero grueso (táctil) */
    isCoarsePointer: boolean;
    /** handlers para el contenedor del grid */
    containerTouchProps: {
        onTouchStartCapture: (e: React.TouchEvent) => void;
        onTouchMoveCapture: (e: React.TouchEvent) => void;
        onTouchEndCapture: (e: React.TouchEvent) => void;
        onTouchCancelCapture: (e: React.TouchEvent) => void;
    };
    /** avisar desde onDragStart de react-grid-layout */
    notifyDragStart: () => void;
    /** avisar desde onDragStop de react-grid-layout (desarma y asienta) */
    notifyDragStop: () => void;
}

export interface TouchDragOptions {
    /** ms de pulsación mantenida para armar (por defecto 3000). */
    holdMs?: number;
    /** vibración háptica al armar (por defecto true). */
    haptics?: boolean;
}

export function useTouchDragArming(enabled: boolean, options: TouchDragOptions = {}): TouchDragArming {
    const holdMs = Number.isFinite(options.holdMs as number) ? Math.max(150, options.holdMs as number) : DEFAULT_HOLD_MS;
    const haptics = options.haptics !== false;
    // Refs vivas para que los callbacks memoizados lean siempre el valor actual
    // sin recrearse (evita re-suscribir listeners al cambiar el ajuste en vivo).
    const holdMsRef = useRef(holdMs);
    const hapticsRef = useRef(haptics);
    useEffect(() => { holdMsRef.current = holdMs; hapticsRef.current = haptics; }, [holdMs, haptics]);

    const [armedId, setArmedId] = useState<string | null>(null);
    const [isCoarsePointer, setIsCoarsePointer] = useState(false);

    const armedRef = useRef<string | null>(null);
    const pendingRef = useRef<PendingHold | null>(null);
    const draggingRef = useRef(false);
    const scrollBlockCleanupRef = useRef<(() => void) | null>(null);
    const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(pointer: coarse)");
        const update = () => setIsCoarsePointer(mq.matches || "ontouchstart" in window);
        update();
        try { mq.addEventListener("change", update); } catch { /* Safari viejo */ }
        return () => { try { mq.removeEventListener("change", update); } catch { } };
    }, []);

    const clearPending = useCallback(() => {
        if (pendingRef.current) {
            clearTimeout(pendingRef.current.timer);
            pendingRef.current = null;
        }
    }, []);

    const releaseScrollBlock = useCallback(() => {
        scrollBlockCleanupRef.current?.();
        scrollBlockCleanupRef.current = null;
    }, []);

    const blockScroll = useCallback(() => {
        if (scrollBlockCleanupRef.current) return;
        const prevent = (ev: TouchEvent) => {
            if (ev.cancelable) ev.preventDefault();
        };
        document.addEventListener("touchmove", prevent, { passive: false });
        scrollBlockCleanupRef.current = () =>
            document.removeEventListener("touchmove", prevent);
    }, []);

    const disarm = useCallback(() => {
        if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
        }
        releaseScrollBlock();
        draggingRef.current = false;
        if (armedRef.current !== null) {
            armedRef.current = null;
            setArmedId(null);
        }
    }, [releaseScrollBlock]);

    // limpieza si el componente se desmonta con un gesto a medias
    useEffect(() => () => { clearPending(); disarm(); }, [clearPending, disarm]);
    // al salir del modo edición, suelta todo
    useEffect(() => { if (!enabled) { clearPending(); disarm(); } }, [enabled, clearPending, disarm]);

    const arm = useCallback((hold: PendingHold) => {
        armedRef.current = hold.itemKey;
        if (hapticsRef.current) { try { (navigator as any).vibrate?.(10); } catch { /* opcional */ } }
        blockScroll();
        // Aplica de forma síncrona el estado armado para que GridArea retire el
        // draggableHandle ANTES del re-despacho (DraggableCore debe aceptar el
        // touchstart desde cualquier punto del widget).
        flushSync(() => setArmedId(hold.itemKey));

        let handedOff = false;
        try {
            const touch = hold.lastTouch;
            const synthetic = new TouchEvent("touchstart", {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                touches: [touch],
                targetTouches: [touch],
                changedTouches: [touch],
            });
            hold.itemEl.dispatchEvent(synthetic);
            handedOff = true;
        } catch {
            handedOff = false;
        }
        if (!handedOff && !fallbackTimerRef.current) {
            // WebKit antiguo sin constructor TouchEvent: el widget queda armado
            // unos segundos; el siguiente toque sobre él arrastra directamente.
            fallbackTimerRef.current = setTimeout(() => disarm(), FALLBACK_ARMED_MS);
        }
    }, [blockScroll, disarm]);

    const onTouchStartCapture = useCallback((e: React.TouchEvent) => {
        if (!enabled) return;
        if (draggingRef.current) return; // RGL ya está arrastrando: no interferir
        const target = e.target as HTMLElement | null;
        if (!target || typeof target.closest !== "function") return;
        // Los handles explícitos (✋ drag y resize) conservan su flujo inmediato.
        if (target.closest(PASSTHROUGH_SELECTOR)) return;
        const itemEl = target.closest(".react-grid-item") as HTMLElement | null;
        if (!itemEl) return;
        const itemKey = itemEl.getAttribute("data-widget-key") ?? "";

        if (armedRef.current) {
            // Ya hay un widget armado (modo fallback): su propio touchstart debe
            // llegar a DraggableCore; toques sobre OTROS widgets se silencian.
            if (armedRef.current === itemKey) return;
            e.stopPropagation();
            return;
        }

        // Oculta este touchstart a DraggableCore → el scroll del navegador queda libre.
        e.stopPropagation();

        if (e.touches.length !== 1) return; // multitouch = scroll/zoom, jamás armar
        if (target.closest(INTERACTIVE_SELECTOR)) return; // taps en controles intactos
        if (!itemKey) return;

        const t = e.touches[0];
        clearPending();
        const hold: PendingHold = {
            itemEl,
            itemKey,
            startX: t.clientX,
            startY: t.clientY,
            touchId: t.identifier,
            lastTouch: t as unknown as Touch,
            timer: setTimeout(() => {
                pendingRef.current = null;
                arm(hold);
            }, holdMsRef.current),
        };
        pendingRef.current = hold;
    }, [enabled, arm, clearPending]);

    const onTouchMoveCapture = useCallback((e: React.TouchEvent) => {
        const hold = pendingRef.current;
        if (!hold) return;
        const touches = e.touches;
        let t: React.Touch | null = null;
        for (let i = 0; i < touches.length; i++) {
            if (touches[i].identifier === hold.touchId) { t = touches[i]; break; }
        }
        if (!t) return;
        hold.lastTouch = t as unknown as Touch;
        const dx = t.clientX - hold.startX;
        const dy = t.clientY - hold.startY;
        if (Math.hypot(dx, dy) > SLOP_PX) {
            // El usuario está scrolleando: cancela el armado, gana el scroll.
            clearPending();
        }
    }, [clearPending]);

    const endGesture = useCallback(() => {
        clearPending();
        if (armedRef.current && !draggingRef.current) {
            // Armado sin drag iniciado (fallback): periodo de gracia y desarme.
            releaseScrollBlock();
            if (!fallbackTimerRef.current) {
                fallbackTimerRef.current = setTimeout(() => disarm(), FALLBACK_ARMED_MS);
            }
        }
    }, [clearPending, disarm, releaseScrollBlock]);

    const notifyDragStart = useCallback(() => {
        if (armedRef.current) draggingRef.current = true;
    }, []);

    const notifyDragStop = useCallback(() => {
        disarm();
    }, [disarm]);

    return {
        armedId,
        isCoarsePointer,
        containerTouchProps: {
            onTouchStartCapture,
            onTouchMoveCapture,
            onTouchEndCapture: endGesture,
            onTouchCancelCapture: endGesture,
        },
        notifyDragStart,
        notifyDragStop,
    };
}
