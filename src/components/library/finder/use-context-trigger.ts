"use client";

/*
 * useContextTrigger — abre un menú contextual con clic derecho (ratón) o
 * long-press (táctil, ~550ms sin desplazamiento) en la posición exacta del
 * puntero. Genérico y ligero: no depende de react-grid-layout ni de ningún
 * otro subsistema — construido específicamente para el Finder de Bibliotecas
 * (no existe un ContextMenu de Radix instalado en el repo; ver
 * architecture/libreria-biblioteca-sync.md §6).
 *
 * Uso:
 *   const { bind, menu, close } = useContextTrigger<string>();
 *   <div {...bind(itemId)}>…</div>
 *   {menu && <FinderContextMenu x={menu.x} y={menu.y} payload={menu.payload} onClose={close} .../>}
 */

import { useCallback, useRef, useState } from "react";

const LONG_PRESS_MS = 500;
const MOVE_SLOP_PX = 10;

export interface ContextMenuState<T> {
    x: number;
    y: number;
    payload: T;
}

export interface UseContextTrigger<T> {
    /** Estado del menú abierto (null = cerrado). */
    menu: ContextMenuState<T> | null;
    /** Props a esparcir sobre el elemento que dispara el menú (contiene el payload). */
    bind: (payload: T) => {
        onContextMenu: (e: React.MouseEvent) => void;
        onTouchStart: (e: React.TouchEvent) => void;
        onTouchMove: (e: React.TouchEvent) => void;
        onTouchEnd: () => void;
        onTouchCancel: () => void;
    };
    /** Abre el menú programáticamente (p.ej. desde un botón "···"). */
    openAt: (x: number, y: number, payload: T) => void;
    close: () => void;
}

export function useContextTrigger<T>(): UseContextTrigger<T> {
    const [menu, setMenu] = useState<ContextMenuState<T> | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const close = useCallback(() => {
        clearTimer();
        setMenu(null);
    }, [clearTimer]);

    const openAt = useCallback((x: number, y: number, payload: T) => {
        setMenu({ x, y, payload });
    }, []);

    const bind = useCallback(
        (payload: T) => ({
            onContextMenu: (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                openAt(e.clientX, e.clientY, payload);
            },
            onTouchStart: (e: React.TouchEvent) => {
                if (e.touches.length !== 1) return;
                const t = e.touches[0];
                startRef.current = { x: t.clientX, y: t.clientY };
                clearTimer();
                timerRef.current = setTimeout(() => {
                    try {
                        navigator.vibrate?.(12);
                    } catch {
                        /* opcional */
                    }
                    openAt(t.clientX, t.clientY, payload);
                }, LONG_PRESS_MS);
            },
            onTouchMove: (e: React.TouchEvent) => {
                const start = startRef.current;
                if (!start || e.touches.length !== 1) return;
                const t = e.touches[0];
                const dx = t.clientX - start.x;
                const dy = t.clientY - start.y;
                if (Math.hypot(dx, dy) > MOVE_SLOP_PX) clearTimer();
            },
            onTouchEnd: () => clearTimer(),
            onTouchCancel: () => clearTimer(),
        }),
        [clearTimer, openAt],
    );

    return { menu, bind, openAt, close };
}
