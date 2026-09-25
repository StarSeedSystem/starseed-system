"use client";

/**
 * useArrastreDesdeBorde — abrir una cortina tirando de su borde con ratón o lápiz.
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo usan los sensores de borde de escritorio y las asas visibles. Un clic sin
 * movimiento sigue siendo un clic (abre/cierra como siempre); un arrastre hacia
 * dentro que demuestra intención abre la cortina y la publica como «sesión de
 * borde», de modo que el panel aparece bajo el puntero y lo sigue 1:1 hasta
 * soltar (src/lib/gestos/sesion-borde.ts).
 *
 * El dedo NO pasa por aquí por defecto: en pantallas táctiles lo gestiona
 * TrinityEdgeAccess con Touch Events pasivos (no bloquean el scroll de la
 * página). Así nunca hay dos sesiones para un mismo gesto.
 */

import { useCallback, useRef } from "react";
import {
    cancelarSesionBorde,
    ejeDe,
    evaluarIntencion,
    iniciarSesionBorde,
    instanteDeEvento,
    ladoDeBorde,
    moverSesionBorde,
    signoCierre,
    soltarSesionBorde,
    umbralParaPuntero,
    type BordeTrinity,
    type Muestra,
} from "@/lib/gestos";

interface Gesto {
    borde: BordeTrinity;
    id: number;
    tipo: string;
    inicio: Muestra;
    activo: boolean;
    elemento: Element;
}

export interface OpcionesArrastreDesdeBorde {
    /** Abre la cortina (normalmente `setActiveEdge`). */
    abrir: (borde: BordeTrinity) => void;
    /** Recorrido (px) que abre al soltar despacio: la «sensibilidad» de Ajustes → Trinity. */
    umbralAperturaPx?: number;
    /** Aceptar también el dedo (solo si nadie más gestiona el táctil en ese elemento). */
    aceptarTactil?: boolean;
    /** Aviso al empezar/terminar (para no desactivar el sensor a mitad de gesto). */
    alCambiar?: (arrastrando: boolean) => void;
}

const ahora = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
/** Instante real del evento (su `timeStamp`), no el de cuando se atiende. */
const instante = (e: { timeStamp?: number }): number => instanteDeEvento(e.timeStamp, ahora());

export function useArrastreDesdeBorde(o: OpcionesArrastreDesdeBorde) {
    const gestoRef = useRef<Gesto | null>(null);
    const suprimirClicRef = useRef(false);
    const opcionesRef = useRef(o);
    opcionesRef.current = o;

    const terminar = useCallback((g: Gesto) => {
        try {
            if (g.elemento.hasPointerCapture?.(g.id)) g.elemento.releasePointerCapture(g.id);
        } catch {
            /* ya liberada */
        }
        opcionesRef.current.alCambiar?.(false);
    }, []);

    const manejadoresPara = useCallback((borde: BordeTrinity) => ({
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
            const { aceptarTactil = false } = opcionesRef.current;
            if (e.pointerType === "touch" && !aceptarTactil) return;
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (gestoRef.current) return;
            suprimirClicRef.current = false;
            // Captura YA en el pointerdown: el sensor mide 20 px y el ratón sale de él
            // en el primer movimiento; sin captura el gesto se perdía. Aquí es seguro
            // porque el sensor/asa no tiene botones hijos: el clic sigue siendo suyo.
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
                /* navegador sin captura: el gesto vale mientras el puntero siga encima */
            }
            gestoRef.current = {
                borde,
                id: e.pointerId,
                tipo: e.pointerType,
                inicio: { x: e.clientX, y: e.clientY, t: instante(e) },
                activo: false,
                elemento: e.currentTarget,
            };
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
            const g = gestoRef.current;
            if (!g || g.id !== e.pointerId) return;
            const m: Muestra = { x: e.clientX, y: e.clientY, t: instante(e) };
            if (!g.activo) {
                const lado = ladoDeBorde(g.borde);
                const hacia = (-signoCierre(lado)) as 1 | -1; // hacia dentro de la pantalla
                const r = evaluarIntencion(ejeDe(lado), m.x - g.inicio.x, m.y - g.inicio.y, {
                    umbralPx: umbralParaPuntero(g.tipo),
                    anguloMaxGrados: 40,
                    soloHacia: hacia,
                });
                if (r === "pendiente") return;
                if (r === "rechazada") {
                    gestoRef.current = null;
                    return;
                }
                g.activo = true;
                opcionesRef.current.alCambiar?.(true);
                iniciarSesionBorde(g.borde, m, opcionesRef.current.umbralAperturaPx);
                opcionesRef.current.abrir(g.borde);
                return;
            }
            moverSesionBorde(m);
        },
        onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
            const g = gestoRef.current;
            if (!g || g.id !== e.pointerId) return;
            gestoRef.current = null;
            if (!g.activo) {
                terminar(g); // fue un clic: lo resuelve onClick (la captura no lo desvía: es el mismo elemento)
                return;
            }
            suprimirClicRef.current = true;
            window.setTimeout(() => {
                suprimirClicRef.current = false;
            }, 400);
            soltarSesionBorde({ x: e.clientX, y: e.clientY, t: instante(e) });
            terminar(g);
        },
        onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
            const g = gestoRef.current;
            if (!g || g.id !== e.pointerId) return;
            gestoRef.current = null;
            if (g.activo) cancelarSesionBorde();
            terminar(g);
        },
        onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
            if (!suprimirClicRef.current) return;
            suprimirClicRef.current = false;
            e.preventDefault();
            e.stopPropagation();
        },
    }), [terminar]);

    return { manejadoresPara };
}
