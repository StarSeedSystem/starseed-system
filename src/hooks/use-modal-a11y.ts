"use client";

import { useEffect, useRef } from "react";

/**
 * useModalA11y — accesibilidad mínima para overlays modales "propios"
 * (`fixed inset-0 …` hechos a mano, sin Radix Dialog).
 *
 * Adenda 137. Pensado para envolver modales ya existentes SIN reestructurarlos:
 * conserva su JSX, estilos y lógica de negocio tal cual; este hook solo añade
 * el comportamiento de teclado/foco que un `<div>` no tiene por defecto.
 *
 * Mientras `open` es `true`:
 * - Enfoca el primer elemento enfocable dentro de `containerRef` al abrir (o,
 *   si no hay ninguno, el propio contenedor con `tabIndex={-1}`).
 * - Atrapa `Tab` / `Shift+Tab` dentro del contenedor (ciclo: del último
 *   vuelve al primero y viceversa), para que el foco no se escape al resto
 *   de la página mientras el modal está abierto.
 * - Cierra con `Escape`, llamando a `onClose` — desactivable con
 *   `closeOnEscape: false` cuando el propio modal ya gestiona Escape por su
 *   cuenta (p.ej. combinado con navegación por flechas ← →), para no
 *   duplicar el listener ni el cierre.
 * - Al cerrar (o desmontar estando abierto), devuelve el foco al elemento
 *   que estaba activo justo antes de abrirse.
 *
 * Este hook NO añade `role`, `aria-modal` ni `aria-label`/`aria-labelledby`
 * por sí mismo — eso es responsabilidad del consumidor, directamente en el
 * JSX del contenedor:
 *
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useModalA11y({ open, onClose, containerRef });
 *   return (
 *     <div
 *       ref={containerRef}
 *       className="fixed inset-0 …"           // estilos intactos
 *       role="dialog"
 *       aria-modal="true"
 *       aria-label="Descripción del modal"    // o aria-labelledby="id-del-titulo"
 *     >
 *       …
 *     </div>
 *   );
 *
 * SSR-safe: toda la lógica vive dentro de `useEffect` (nunca se ejecuta en el
 * render del servidor) y comprueba `typeof document === "undefined"` antes
 * de tocar el DOM.
 */

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
].join(",");

export interface UseModalA11yOptions {
    /** Si el modal está abierto/montado. Cuando pasa a `false` no se hace nada. */
    open: boolean;
    /** Se invoca al pulsar Escape (solo si `closeOnEscape` no es `false`). */
    onClose: () => void;
    /** Ref al elemento contenedor raíz del modal (el `fixed inset-0 …`). */
    containerRef: React.RefObject<HTMLElement | null>;
    /**
     * Pon `false` si el propio modal ya cierra con Escape por su cuenta
     * (revisa antes de aplicar el hook para no duplicar el manejo).
     * Por defecto `true`.
     */
    closeOnEscape?: boolean;
}

/**
 * Hook de accesibilidad reutilizable para overlays modales propios: el
 * consumidor mantiene su rol/estado ARIA y visuales; este hook aporta solo
 * el comportamiento de teclado y foco (foco inicial, trampa de Tab, cierre
 * con Escape y devolución de foco al cerrar).
 */
export function useModalA11y({ open, onClose, containerRef, closeOnEscape = true }: UseModalA11yOptions): void {
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);

    // Foco inicial al abrir + devolución de foco al cerrar/desmontar.
    useEffect(() => {
        if (!open) return;
        if (typeof document === "undefined") return;

        previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;

        const container = containerRef.current;
        if (container) {
            const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            if (firstFocusable) {
                firstFocusable.focus();
            } else {
                if (!container.hasAttribute("tabindex")) container.tabIndex = -1;
                container.focus();
            }
        }

        return () => {
            const toRestore = previouslyFocusedRef.current;
            previouslyFocusedRef.current = null;
            if (toRestore && typeof toRestore.focus === "function" && document.contains(toRestore)) {
                toRestore.focus();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Trampa de Tab/Shift+Tab + cierre con Escape.
    useEffect(() => {
        if (!open) return;
        if (typeof document === "undefined") return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (closeOnEscape && e.key === "Escape") {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key !== "Tab") return;

            const container = containerRef.current;
            if (!container) return;

            const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
                (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0,
            );
            if (focusables.length === 0) {
                e.preventDefault();
                container.focus();
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (e.shiftKey) {
                if (active === first || !container.contains(active)) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (active === last || !container.contains(active)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, onClose, closeOnEscape, containerRef]);
}

export default useModalA11y;
