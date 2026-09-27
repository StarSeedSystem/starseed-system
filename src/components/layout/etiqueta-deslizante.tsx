"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pausa antes de empezar a deslizar (segundos): da tiempo a leer el inicio.
 */
const PAUSA_INICIAL_S = 0.35;
/** Velocidad de deslizamiento (px por segundo) y duración mínima. */
const VELOCIDAD_PX_S = 40;
const DURACION_MIN_S = 1.2;

/** Lee una media query de forma segura (jsdom y navegadores antiguos). */
function mediaCoincide(query: string): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }
    return window.matchMedia(query).matches;
}

export function EtiquetaDeslizante({ texto, className, activo }: {
    texto: string;
    className?: string;
    /** Estado activo del dock (solo semántico; los colores llegan por className). */
    activo?: boolean;
}) {
    const caja = React.useRef<HTMLSpanElement>(null);
    const interior = React.useRef<HTMLSpanElement>(null);
    const [desborde, setDesborde] = React.useState(0);
    const [deslizando, setDeslizando] = React.useState(false);

    // Mide si el texto desborda su celda; se re-mide al cambiar el ancho
    // disponible (rotación, apertura del dock, cambio de densidad…).
    React.useLayoutEffect(() => {
        const medir = () => {
            const c = caja.current;
            const i = interior.current;
            if (!c || !i) return;
            setDesborde(Math.max(0, i.scrollWidth - c.clientWidth));
        };
        medir();
        const c = caja.current;
        if (!c || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(medir);
        ro.observe(c);
        return () => ro.disconnect();
    }, [texto]);

    const empezar = React.useCallback(() => {
        const c = caja.current;
        const i = interior.current;
        if (!c || !i) return;
        const exceso = Math.max(0, i.scrollWidth - c.clientWidth);
        if (exceso <= 0) return;
        if (!mediaCoincide("(hover: hover)")) return;
        if (mediaCoincide("(prefers-reduced-motion: reduce)")) return;
        setDesborde(exceso);
        setDeslizando(true);
    }, []);
    const terminar = React.useCallback(() => setDeslizando(false), []);

    // El cursor y el foco de teclado viven sobre todo en el botón hermano (grupo
    // `.group`), no en la etiqueta: se escucha al ancestro grupo. (2026-09-27, el
    // supervisor: antes solo deslizaba si el cursor pisaba el texto diminuto.)
    React.useEffect(() => {
        const grupo = caja.current?.closest(".group");
        if (!grupo) return;
        grupo.addEventListener("mouseenter", empezar);
        grupo.addEventListener("mouseleave", terminar);
        grupo.addEventListener("focusin", empezar);
        grupo.addEventListener("focusout", terminar);
        return () => {
            grupo.removeEventListener("mouseenter", empezar);
            grupo.removeEventListener("mouseleave", terminar);
            grupo.removeEventListener("focusin", empezar);
            grupo.removeEventListener("focusout", terminar);
        };
    }, [empezar, terminar]);

    const duracion = Math.max(DURACION_MIN_S, desborde / VELOCIDAD_PX_S);

    return (
        <span
            ref={caja}
            data-activo={activo || undefined}
            onMouseEnter={empezar}
            onMouseLeave={terminar}
            onFocusCapture={empezar}
            onBlurCapture={terminar}
            className={cn("block overflow-hidden whitespace-nowrap", className)}
        >
            {/* En reposo: bloque del ancho de la celda con «…». Deslizando: del ancho
                de su TEXTO (inline-block, sin recorte propio), así al moverse enseña el
                resto; lo recorta la caja de fuera. Con overflow:hidden en el interior el
                texto oculto se movía junto con su recorte y nunca aparecía. */}
            <span
                ref={interior}
                className="whitespace-nowrap"
                style={{
                    display: deslizando ? "inline-block" : "block",
                    transform: deslizando ? `translateX(${-desborde}px)` : "translateX(0px)",
                    textOverflow: deslizando ? "clip" : "ellipsis",
                    overflow: deslizando ? "visible" : "hidden",
                    transition: deslizando
                        ? `transform ${duracion}s linear ${PAUSA_INICIAL_S}s`
                        : "transform 200ms ease-out",
                    willChange: deslizando ? "transform" : undefined,
                }}
            >
                {texto}
            </span>
        </span>
    );
}

export default EtiquetaDeslizante;
