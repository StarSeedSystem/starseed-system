"use client";

/**
 * TransicionRutas — entrada fluida en 3D de cada página y coreografía del cromo.
 * ─────────────────────────────────────────────────────────────────────────────
 * Al cambiar de ruta (nunca en la primera carga ni en la hidratación):
 *
 *   1. La página nueva entra con profundidad: sube un poco desde atrás
 *      (translateZ negativo), enderezando una inclinación sutil en X, con curva
 *      de resorte. En equipos modestos, solo sube; con menos movimiento, solo
 *      funde. Lo hace con la Web Animations API sobre los elementos raíz de la
 *      página: sin envoltorio nuevo en el árbol de React (el layout de (app)
 *      documenta que envolver `{children}` rompió el prerender en su día) y
 *      SIN transform residual al terminar (un transform fijo convertiría la
 *      página en bloque contenedor de sus piezas `position: fixed`).
 *   2. Marca `html[data-ss-navegando]` unos instantes: globals.css hace girar
 *      en 3D los logos (`data-ss-coreo="logo"`), asentar el dock y latir el
 *      icono activo, con las propiedades individuales `rotate`/`scale`, que se
 *      suman al transform que ya tengan (no pelean con framer-motion).
 *
 * Nada de esto oculta contenido si el JavaScript tarda: el HTML del servidor se
 * pinta tal cual y la animación solo existe tras una navegación en el cliente.
 * Las rutas de consola (/mando, /voces) no se animan.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { esRutaConsola } from "@/components/layout/solo-fuera-de-consola";
import { leerNivelMovimiento } from "@/lib/movimiento/nivel";
import { CURVA_RESORTE, CURVA_RESPALDO, entradaPagina } from "@/lib/movimiento/transiciones";

const useEfectoDeMaquetacion = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Cuánto dura la marca de coreografía (el giro del logo es el más largo). */
export const DURACION_COREOGRAFIA_MS = 620;
const MAX_OBJETIVOS = 4;

function curvaDisponible(): string {
    try {
        return typeof CSS !== "undefined" && CSS.supports("animation-timing-function", CURVA_RESORTE)
            ? CURVA_RESORTE
            : CURVA_RESPALDO;
    } catch {
        return CURVA_RESPALDO;
    }
}

/**
 * Raíces visibles de la página dentro de `#main-content` (que es `display:
 * contents`). Se baja un nivel más si una raíz también es `contents`.
 */
export function objetivosDeTransicion(raiz: Element): HTMLElement[] {
    const salida: HTMLElement[] = [];
    const visitar = (padre: Element, profundidad: number) => {
        for (const hijo of Array.from(padre.children)) {
            if (salida.length >= MAX_OBJETIVOS) return;
            if (!(hijo instanceof HTMLElement)) continue;
            if (hijo.hasAttribute("data-sin-transicion") || hijo.hidden) continue;
            const estilo = getComputedStyle(hijo);
            if (estilo.display === "contents") {
                if (profundidad < 1) visitar(hijo, profundidad + 1);
                continue;
            }
            if (estilo.display === "none" || estilo.visibility === "hidden") continue;
            salida.push(hijo);
        }
    };
    visitar(raiz, 0);
    return salida;
}

export function TransicionRutas() {
    const ruta = usePathname();
    const anteriorRef = useRef<string | null>(null);

    useEfectoDeMaquetacion(() => {
        const anterior = anteriorRef.current;
        anteriorRef.current = ruta;
        // Primera carga / hidratación: la página ya está pintada, no se toca.
        if (anterior === null || anterior === ruta) return;
        if (esRutaConsola(ruta)) return;
        if (typeof document === "undefined") return;

        const html = document.documentElement;
        html.setAttribute("data-ss-navegando", "");
        const temporizador = window.setTimeout(() => html.removeAttribute("data-ss-navegando"), DURACION_COREOGRAFIA_MS);

        const nivel = leerNivelMovimiento();
        const raiz = document.getElementById("main-content");
        const animaciones: Animation[] = [];
        if (raiz) {
            const vw = window.innerWidth || 1;
            const vh = window.innerHeight || 1;
            const curva = curvaDisponible();
            for (const el of objetivosDeTransicion(raiz)) {
                if (typeof el.animate !== "function") continue;
                // Una raíz pequeña suele envolver piezas `fixed`: cualquier transform
                // las movería durante la animación. Ahí solo se funde.
                const r = el.getBoundingClientRect();
                const seguro = r.width * r.height < vw * vh * 0.25;
                const entrada = entradaPagina(nivel, seguro);
                try {
                    animaciones.push(el.animate(entrada.fotogramas, {
                        duration: entrada.duracion,
                        easing: entrada.resorte ? curva : "cubic-bezier(0.25, 0.8, 0.3, 1)",
                        fill: "none", // al terminar no queda NADA puesto
                    }));
                } catch {
                    /* navegador sin WAAPI completa: la página aparece sin animar */
                }
            }
        }

        return () => {
            window.clearTimeout(temporizador);
            html.removeAttribute("data-ss-navegando");
            // Navegar otra vez a mitad: la entrada anterior se corta, sin quedarse a medias.
            animaciones.forEach((a) => {
                try {
                    a.cancel();
                } catch {
                    /* ya terminada */
                }
            });
        };
    }, [ruta]);

    return null;
}

export default TransicionRutas;
