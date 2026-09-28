"use client";

/**
 * Deshacer/rehacer del editor de mensajes (al menos 30 pasos; guardamos 80).
 *
 * Los cambios continuos se agrupan en un solo paso: escribir (mientras no pase más de `ventana` ms
 * entre pulsaciones) o arrastrar un elemento (misma clave durante todo el gesto).
 */
import { useCallback, useMemo, useRef, useState } from "react";

export const PASOS_HISTORIAL = 80;

export interface OpcionesCambio {
    /** Clave de agrupación: cambios seguidos con la misma clave cuentan como un paso. */
    agrupar?: string;
    /** Si se indica, la agrupación caduca tras estos ms sin cambios. */
    ventana?: number;
}

export interface Historial<T> {
    valor: T;
    fijar: (v: T | ((previo: T) => T), opciones?: OpcionesCambio) => void;
    deshacer: () => void;
    rehacer: () => void;
    reiniciar: (v: T) => void;
    /** Corrección automática (p. ej. el alto de un texto): cambia el presente sin crear un paso. */
    ajustar: (v: (previo: T) => T) => void;
    puedeDeshacer: boolean;
    puedeRehacer: boolean;
}

interface Estado<T> {
    pasado: T[];
    presente: T;
    futuro: T[];
    grupo: { clave: string; t: number } | null;
}

export function useHistorial<T>(inicial: T | (() => T)): Historial<T> {
    const ref = useRef<Estado<T> | null>(null);
    if (ref.current === null) {
        const v = typeof inicial === "function" ? (inicial as () => T)() : inicial;
        ref.current = { pasado: [], presente: v, futuro: [], grupo: null };
    }
    const [, setTic] = useState(0);
    const repintar = useCallback(() => setTic((n) => (n + 1) % 1_000_000), []);

    const fijar = useCallback(
        (v: T | ((previo: T) => T), opciones?: OpcionesCambio) => {
            const e = ref.current!;
            const nuevo = typeof v === "function" ? (v as (p: T) => T)(e.presente) : v;
            if (Object.is(nuevo, e.presente)) return;
            const ahora = Date.now();
            const clave = opciones?.agrupar;
            const agrupa =
                !!clave &&
                e.grupo?.clave === clave &&
                (opciones?.ventana === undefined || ahora - e.grupo.t <= opciones.ventana);
            if (agrupa) {
                ref.current = { ...e, presente: nuevo, futuro: [], grupo: { clave: clave!, t: ahora } };
            } else {
                ref.current = {
                    pasado: [...e.pasado, e.presente].slice(-PASOS_HISTORIAL),
                    presente: nuevo,
                    futuro: [],
                    grupo: clave ? { clave, t: ahora } : null,
                };
            }
            repintar();
        },
        [repintar],
    );

    const deshacer = useCallback(() => {
        const e = ref.current!;
        if (!e.pasado.length) return;
        const previo = e.pasado[e.pasado.length - 1];
        ref.current = { pasado: e.pasado.slice(0, -1), presente: previo, futuro: [e.presente, ...e.futuro], grupo: null };
        repintar();
    }, [repintar]);

    const rehacer = useCallback(() => {
        const e = ref.current!;
        if (!e.futuro.length) return;
        const [siguiente, ...resto] = e.futuro;
        ref.current = { pasado: [...e.pasado, e.presente].slice(-PASOS_HISTORIAL), presente: siguiente, futuro: resto, grupo: null };
        repintar();
    }, [repintar]);

    const ajustar = useCallback(
        (v: (previo: T) => T) => {
            const e = ref.current!;
            const nuevo = v(e.presente);
            if (Object.is(nuevo, e.presente)) return;
            ref.current = { ...e, presente: nuevo };
            repintar();
        },
        [repintar],
    );

    const reiniciar = useCallback(
        (v: T) => {
            ref.current = { pasado: [], presente: v, futuro: [], grupo: null };
            repintar();
        },
        [repintar],
    );

    const e = ref.current;
    return useMemo(
        () => ({
            valor: e.presente,
            fijar,
            deshacer,
            rehacer,
            reiniciar,
            ajustar,
            puedeDeshacer: e.pasado.length > 0,
            puedeRehacer: e.futuro.length > 0,
        }),
        [e.presente, e.pasado.length, e.futuro.length, fijar, deshacer, rehacer, reiniciar, ajustar],
    );
}
