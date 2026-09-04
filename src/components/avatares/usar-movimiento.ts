"use client";

/**
 * HOOK DE MOVIMIENTO PARA AVATARES (Ola 229 · M3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Puente entre el motor único «Vida StarSeed» (M1, `moverAvatar`) y cualquier
 * avatar del OS. Pide el clip del gesto, lo reproduce con
 * `requestAnimationFrame` y expone fotograma a fotograma lo que el avatar debe
 * dibujar, para que TODO avatar —3D o no— tenga la misma vida.
 *
 * REGLAS:
 *  · `prefers-reduced-motion` manda: no se genera ni se anima nada.
 *  · `activo: false` congela la reproducción sin tirar el clip (chat en pausa);
 *    al volver a `true` se reanuda EXACTAMENTE donde estaba.
 *  · Nunca lanza: si el motor falla, el avatar simplemente queda quieto.
 *  · Al desmontar se cancela el rAF y se limpia todo el estado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    moverAvatar,
    type Gesto,
    type MovimientoClip,
} from "@/lib/avatares/movimiento/motor";
import type { NivelMovimiento } from "@/lib/avatares/movimiento/niveles";

/** Estado público del hook: lo que el avatar dibuja en cada fotograma. */
export interface EstadoMovimiento {
    /** Clip resuelto (rotaciones + raíz) o `null` si el nivel no lo produce. */
    clip: MovimientoClip | null;
    /** Nivel que finalmente generó el gesto («quieto» = sin clip). */
    nivel: NivelMovimiento | null;
    /** Índice del fotograma actual dentro del clip. */
    fotograma: number;
    /** `true` mientras el rAF esté corriendo con clip. */
    reproduciendo: boolean;
    /** Detiene la reproducción y deja el avatar en reposo. */
    parar: () => void;
}

export interface OpcionesMovimiento {
    /** Personalidad dueña del avatar (teñirá el gesto en niveles superiores). */
    personalidadId?: string;
    /** `false` = congelar sin descargar el clip (por ejemplo, chat pausado). */
    activo?: boolean;
}

/** ¿Pide el sistema reducir el movimiento? (SSR-safe: en servidor, no.) */
export function prefiereReducirMovimiento(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
}

/**
 * Reproduce el gesto con `requestAnimationFrame`. Resuelve el nivel a través de
 * `moverAvatar`, avanza el fotograma según el `fps` real del clip (el tempo es
 * fiel en pantallas de 30, 60 o 120 Hz) y hace bucle opcional. Sin clip (nivel
 * «quieto» o movimiento reducido) el avatar queda estático y `nivel` explica
 * siempre por qué. Nunca lanza.
 */
export function useMovimiento(
    gesto: Gesto | null,
    op: OpcionesMovimiento = {},
): EstadoMovimiento {
    const { personalidadId, activo = true } = op;

    const [clip, setClip] = useState<MovimientoClip | null>(null);
    const [nivel, setNivel] = useState<NivelMovimiento | null>(null);
    const [fotograma, setFotograma] = useState(0);
    const [reproduciendo, setReproduciendo] = useState(false);

    const rafRef = useRef<number | null>(null);
    /** Marca de tiempo (rAF) en la que empieza el clip; 0 = sin arrancar. */
    const inicioRef = useRef(0);
    /** Espejo sin estado del fotograma actual, para reanudar sin re-render. */
    const fotogramaRef = useRef(0);
    const clipRef = useRef<MovimientoClip | null>(null);
    const activoRef = useRef(activo);
    activoRef.current = activo;

    const pararRef = useRef<() => void>(() => undefined);
    const parar = useCallback(() => pararRef.current(), []);

    /* Generación del clip: solo cuando hay gesto y sin movimiento reducido. */
    useEffect(() => {
        let vivo = true;
        setClip(null);
        setNivel(null);
        setFotograma(0);
        setReproduciendo(false);
        fotogramaRef.current = 0;
        inicioRef.current = 0;
        clipRef.current = null;
        if (!gesto || prefiereReducirMovimiento()) return;
        moverAvatar(gesto, { personalidadId })
            .then((r) => {
                if (!vivo) return;
                setNivel(r.nivel);
                clipRef.current = r.clip;
                setClip(r.clip);
            })
            .catch(() => {
                if (vivo) setNivel("quieto");
            });
        return () => {
            vivo = false;
            clipRef.current = null;
        };
        // `gesto` es identidad: se regenera solo si cambia el prompt o sus
        // parámetros, no en cada render del llamador.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        gesto?.prompt,
        gesto?.emocion,
        gesto?.energia,
        gesto?.duracionMs,
        gesto?.bucle,
        personalidadId,
    ]);

    /* Reproducción con rAF. La pausa (`activo: false`) corta el rAF sin tirar
     * el clip; al reanudar se recalcula la marca de inicio con el fotograma
     * congelado, de modo que el gesto CONTINÚA y no vuelve a empezar. */
    useEffect(() => {
        const cancelar = () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            setReproduciendo(false);
        };

        if (!clip || !activo) {
            cancelar();
            return;
        }

        // Clip ya terminado (sin bucle): no se reanima al reactivar.
        const ultimo = clip.rotaciones.length - 1;
        if (fotogramaRef.current >= ultimo && !gesto?.bucle) {
            cancelar();
            return;
        }

        // Reanudación: colocar la marca de inicio donde está el fotograma.
        if (inicioRef.current !== 0) {
            inicioRef.current =
                performance.now() - (fotogramaRef.current / clip.fps) * 1000;
        }

        const paso = (ms: number) => {
            const c = clipRef.current;
            if (!c || !activoRef.current) {
                rafRef.current = null;
                setReproduciendo(false);
                return;
            }
            if (!inicioRef.current) inicioRef.current = ms;
            const transcurrido = ms - inicioRef.current;
            if (transcurrido >= c.duracionMs) {
                if (gesto?.bucle) {
                    inicioRef.current = ms;
                    fotogramaRef.current = 0;
                    setFotograma(0);
                } else {
                    fotogramaRef.current = c.rotaciones.length - 1;
                    setFotograma(c.rotaciones.length - 1);
                    rafRef.current = null;
                    setReproduciendo(false);
                    return;
                }
            } else {
                const indice = Math.min(
                    c.rotaciones.length - 1,
                    Math.floor((transcurrido / 1000) * c.fps),
                );
                fotogramaRef.current = indice;
                setFotograma(indice);
            }
            rafRef.current = requestAnimationFrame(paso);
        };

        inicioRef.current = inicioRef.current || 0;
        setReproduciendo(true);
        rafRef.current = requestAnimationFrame(paso);
        return cancelar;
    }, [clip, gesto?.bucle, activo]);

    /* `parar()` público: corta el rAF y congela el fotograma actual. No
     * reanuda solo: se reactiva cambiando el gesto o `activo`. */
    pararRef.current = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        setReproduciendo(false);
    };

    return { clip, nivel, fotograma, reproduciendo, parar };
}
