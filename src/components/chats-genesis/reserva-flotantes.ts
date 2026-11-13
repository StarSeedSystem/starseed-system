"use client";

/**
 * Chats de Genesis · el carril de los botones flotantes (GEN1114F · 2026-11-13)
 * ─────────────────────────────────────────────────────────────────────────────
 * La orbe de Aurora, la orbe de la Protomolécula y otros botones redondos viven en `position: fixed`
 * y el usuario los arrastra a donde quiere: no tienen un sitio fijo que se pueda reservar con una
 * clase. Revisión visual del 13-11: tapaban el botón de enviar, el cuadro de texto, la primera fila
 * de una hoja, el interruptor de Terminal y las notas de Conexiones de chat.
 *
 * Aquí no se mueve ni se esconde ninguno (siguen igual en el resto de la app). Lo que se hace es
 * MIRAR qué hay encima de una zona de esta página y devolver cuánto margen a la derecha necesita para
 * que sus controles queden libres. Se mira tocando puntos de la zona con `elementsFromPoint`: lo que
 * esté por encima y cuelgue de un elemento `fixed` pequeño (≤ 160 px) es un flotante. Lo grande (una
 * hoja abierta, el dock, un aviso ancho) no cuenta: eso no es un botón que tape un control.
 *
 * Sin `elementsFromPoint` (servidor, jsdom) la reserva es 0: no se inventa nada.
 */

import { useEffect, useState, type RefObject } from "react";

export interface Caja {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Lado máximo de un flotante: una orbe o un botón redondo, no un panel. */
export const LADO_MAX_FLOTANTE = 160;
/** Aire entre el flotante y los controles. */
export const MARGEN_FLOTANTE = 8;
/** La reserva nunca pasa de esta fracción del ancho de la zona (si hiciera falta más, no es un botón). */
export const FRACCION_MAX = 0.4;
/** Cada cuánto se vuelve a mirar (las orbes se arrastran). */
export const CADA_MS = 1500;
/** Puntos por lado de la rejilla de muestreo. */
const PASOS = 12;

function cortan(a: Caja, b: Caja): boolean {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Cuántos píxeles hay que dejar libres a la derecha de `zona` para que ningún flotante tape lo que
 * hay dentro (puro). Solo cuentan los flotantes que cortan la zona, son pequeños y están en su mitad
 * derecha: uno en la mitad izquierda no se esquiva con un margen derecho.
 */
export function reservaDerecha(zona: Caja, flotantes: readonly Caja[], margen = MARGEN_FLOTANTE): number {
    const ancho = zona.right - zona.left;
    if (!(ancho > 0)) return 0;
    let reserva = 0;
    for (const f of flotantes) {
        const w = f.right - f.left;
        const h = f.bottom - f.top;
        if (!(w > 0 && h > 0) || w > LADO_MAX_FLOTANTE || h > LADO_MAX_FLOTANTE) continue;
        if (!cortan(zona, f)) continue;
        if (f.left < zona.left + ancho / 2) continue;
        reserva = Math.max(reserva, zona.right - f.left + margen);
    }
    if (reserva > ancho * FRACCION_MAX) return 0;
    return Math.ceil(reserva);
}

function antepasadoFijo(el: Element | null, tope: Element): Element | null {
    let n: Element | null = el;
    for (let i = 0; n && n !== document.body && n !== document.documentElement && i < 12; i += 1) {
        if (n === tope || n.contains(tope)) return null; // la propia zona o algo que la contiene (una hoja)
        try {
            if (window.getComputedStyle(n).position === "fixed") return n;
        } catch {
            return null;
        }
        n = n.parentElement;
    }
    return null;
}

/** Los flotantes que hay por encima de `zona` (se mira la parte visible de su mitad derecha). */
export function flotantesSobre(zona: Element): Caja[] {
    if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return [];
    const r = zona.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const x0 = Math.max(r.left + (r.right - r.left) / 2, 0);
    const x1 = Math.min(r.right, vw) - 1;
    const y0 = Math.max(r.top, 0);
    const y1 = Math.min(r.bottom, vh) - 1;
    if (!(x1 > x0 && y1 > y0)) return [];
    const vistos = new Set<Element>();
    const cajas: Caja[] = [];
    for (let i = 0; i <= PASOS; i += 1) {
        for (let j = 0; j <= PASOS; j += 1) {
            const x = x0 + ((x1 - x0) * i) / PASOS;
            const y = y0 + ((y1 - y0) * j) / PASOS;
            for (const el of document.elementsFromPoint(x, y)) {
                if (el === zona || zona.contains(el)) break; // lo de la zona ya está arriba en este punto
                const fijo = antepasadoFijo(el, zona);
                if (!fijo || vistos.has(fijo)) continue;
                vistos.add(fijo);
                const c = fijo.getBoundingClientRect();
                cajas.push({ left: c.left, top: c.top, right: c.right, bottom: c.bottom });
            }
        }
    }
    return cajas;
}

/**
 * Margen derecho (px) que necesita el elemento de `ref` para que ningún flotante tape sus controles.
 * Se recalcula al cambiar el tamaño de la ventana, al soltar el dedo o el ratón (fin de un arrastre)
 * y cada 1,5 s. Solo cambia de valor si difiere en más de 4 px (no tiembla).
 */
export function useReservaFlotantes(ref: RefObject<Element | null>, activo = true): number {
    const [reserva, setReserva] = useState(0);
    useEffect(() => {
        if (!activo || typeof window === "undefined") {
            setReserva(0);
            return;
        }
        let vivo = true;
        const medir = () => {
            const zona = ref.current;
            if (!vivo || !zona) return;
            const r = zona.getBoundingClientRect();
            const nueva = reservaDerecha({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, flotantesSobre(zona));
            setReserva((vieja) => (Math.abs(vieja - nueva) > 4 || (nueva === 0) !== (vieja === 0) ? nueva : vieja));
        };
        medir();
        const id = window.setInterval(medir, CADA_MS);
        const tarde = () => window.setTimeout(medir, 120);
        window.addEventListener("resize", medir);
        window.addEventListener("pointerup", tarde);
        return () => {
            vivo = false;
            window.clearInterval(id);
            window.removeEventListener("resize", medir);
            window.removeEventListener("pointerup", tarde);
        };
    }, [ref, activo]);
    return reserva;
}
