"use client";

/**
 * Hooks del lienzo del Dibujo-adivina:
 *   · `useLienzoRemoto`     → quien MIRA: aplica los mensajes de difusión y adopta la foto guardada
 *                              cuando se perdió algo, recargó o llegó tarde.
 *   · `useLienzoDibujante`  → quien DIBUJA: trazos locales, lotes por difusión cada ~90 ms y una
 *                              foto en `extras.lienzo` como mucho cada 4 s (presupuesto de tráfico).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Controlador } from "@/lib/vivo/juegos/controlador";
import {
    MAX_NUMEROS_TRAZO,
    adoptarFoto,
    aplicarMensajeLienzo,
    añadirPunto,
    lienzoAJson,
    lienzoDesdeJson,
    lienzoVacio,
    loteDe,
    nuevoTrazoLocal,
    quitarUltimoTrazo,
    sanearMensajeLienzo,
    type Lienzo,
    type LoteTrazo,
    type MensajeLienzo,
} from "@/lib/vivo/juegos/dibujo-trazos";
import type { Extra } from "@/lib/vivo/juegos/tipos";

export const LOTE_CADA_MS = 90;
export const FOTO_CADA_MS = 4000;
const MAX_NUMEROS_LOTE = 380;

/** La foto guardada en la sala (o null). Estable mientras el extra no cambie. */
export function useFotoGuardada(extra: Extra | undefined): Lienzo | null {
    return useMemo(() => (extra ? lienzoDesdeJson(extra.d) : null), [extra]);
}

export function useLienzoRemoto(controlador: Controlador | null, rondaKey: string, foto: Lienzo | null): Lienzo {
    const [lienzo, setLienzo] = useState<Lienzo>(() => (foto && foto.r === rondaKey ? foto : lienzoVacio(rondaKey)));

    useEffect(() => {
        setLienzo((l) => (l.r === rondaKey ? l : foto && foto.r === rondaKey ? foto : lienzoVacio(rondaKey)));
        // solo al cambiar de ronda
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rondaKey]);

    useEffect(() => {
        if (!controlador) return;
        return controlador.alEfimero("lienzo", (carga) => {
            const m = sanearMensajeLienzo(carga);
            if (!m || m.r !== rondaKey) return;
            setLienzo((l) => aplicarMensajeLienzo(l, m));
        });
    }, [controlador, rondaKey]);

    useEffect(() => {
        if (foto && foto.r === rondaKey) setLienzo((l) => adoptarFoto(l, foto));
    }, [foto, rondaKey]);

    return lienzo.r === rondaKey ? lienzo : lienzoVacio(rondaKey);
}

export interface Dibujante {
    lienzo: Lienzo;
    empezar(x: number, y: number, color: number, grosor: number): boolean;
    punto(x: number, y: number): void;
    terminar(): void;
    deshacer(): void;
    borrar(): void;
    /** Envía lo pendiente y guarda la foto ya (fin de ronda). */
    cerrar(): void;
}

export function useLienzoDibujante(controlador: Controlador | null, rondaKey: string, foto: Lienzo | null): Dibujante {
    const ref = useRef<Lienzo>(lienzoVacio(rondaKey));
    const enviados = useRef(new Map<number, number>());
    const rev = useRef(0);
    const actual = useRef(-1);
    const temporizadorLote = useRef<ReturnType<typeof setTimeout> | null>(null);
    const temporizadorFoto = useRef<ReturnType<typeof setTimeout> | null>(null);
    const claveActual = useRef("");
    const [, repintar] = useReducer((n: number) => n + 1, 0);
    const marco = useRef<number | null>(null);
    const controladorRef = useRef(controlador);
    controladorRef.current = controlador;

    // Al cambiar de ronda: lienzo nuevo (o la foto guardada, si recargué a mitad de mi ronda).
    if (claveActual.current !== rondaKey) {
        claveActual.current = rondaKey;
        const inicial = foto && foto.r === rondaKey ? foto : lienzoVacio(rondaKey);
        ref.current = inicial;
        rev.current = inicial.rev;
        actual.current = -1;
        enviados.current = new Map(inicial.trazos.map((t) => [t.i, t.p.length]));
    }

    const pedirPintado = useCallback(() => {
        if (marco.current !== null) return;
        const cuando = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f: FrameRequestCallback) => window.setTimeout(() => f(0), 16);
        marco.current = cuando(() => {
            marco.current = null;
            repintar();
        }) as number;
    }, []);

    const enviar = useCallback((m: Omit<MensajeLienzo, "r" | "rev">) => {
        rev.current += 1;
        ref.current = { ...ref.current, rev: rev.current };
        controladorRef.current?.enviarEfimero("lienzo", { r: claveActual.current, rev: rev.current, ...m });
    }, []);

    const vaciarLotes = useCallback(() => {
        if (temporizadorLote.current) {
            clearTimeout(temporizadorLote.current);
            temporizadorLote.current = null;
        }
        const lotes: LoteTrazo[] = [];
        for (const t of ref.current.trazos) {
            let desde = enviados.current.get(t.i) ?? 0;
            while (desde < t.p.length) {
                const hasta = Math.min(t.p.length, desde + MAX_NUMEROS_LOTE);
                const trozo = { ...t, p: t.p.slice(0, hasta) };
                const lote = loteDe(trozo, desde);
                if (!lote) break;
                lotes.push(lote);
                desde = hasta;
            }
            enviados.current.set(t.i, t.p.length);
        }
        if (lotes.length === 0) return;
        for (let i = 0; i < lotes.length; i += 30) enviar({ l: lotes.slice(i, i + 30) });
    }, [enviar]);

    const guardarFoto = useCallback(() => {
        if (temporizadorFoto.current) {
            clearTimeout(temporizadorFoto.current);
            temporizadorFoto.current = null;
        }
        controladorRef.current?.guardarExtra("lienzo", lienzoAJson({ ...ref.current, rev: rev.current }));
    }, []);

    const programarLote = useCallback(() => {
        if (!temporizadorLote.current) temporizadorLote.current = setTimeout(vaciarLotes, LOTE_CADA_MS);
    }, [vaciarLotes]);

    const programarFoto = useCallback(() => {
        if (!temporizadorFoto.current) temporizadorFoto.current = setTimeout(guardarFoto, FOTO_CADA_MS);
    }, [guardarFoto]);

    const empezar = useCallback(
        (x: number, y: number, color: number, grosor: number) => {
            const n = nuevoTrazoLocal(ref.current, color, grosor, x, y);
            if (!n) return false;
            ref.current = n.lienzo;
            actual.current = n.trazo.i;
            programarLote();
            programarFoto();
            pedirPintado();
            return true;
        },
        [pedirPintado, programarFoto, programarLote],
    );

    const punto = useCallback(
        (x: number, y: number) => {
            if (actual.current < 0) return;
            const t = ref.current.trazos.find((z) => z.i === actual.current);
            if (t && t.p.length >= MAX_NUMEROS_TRAZO) return;
            const nuevo = añadirPunto(ref.current, actual.current, x, y, 2);
            if (nuevo === ref.current) return;
            ref.current = nuevo;
            programarLote();
            programarFoto();
            pedirPintado();
        },
        [pedirPintado, programarFoto, programarLote],
    );

    const terminar = useCallback(() => {
        actual.current = -1;
        vaciarLotes();
        pedirPintado();
    }, [pedirPintado, vaciarLotes]);

    const deshacer = useCallback(() => {
        vaciarLotes();
        const r = quitarUltimoTrazo(ref.current);
        if (!r) return;
        ref.current = r.lienzo;
        enviados.current.delete(r.quitado);
        enviar({ quitar: r.quitado });
        programarFoto();
        pedirPintado();
    }, [enviar, pedirPintado, programarFoto, vaciarLotes]);

    const borrar = useCallback(() => {
        vaciarLotes();
        if (ref.current.trazos.length === 0) return;
        ref.current = { ...ref.current, trazos: [] };
        enviados.current.clear();
        enviar({ borrar: true });
        programarFoto();
        pedirPintado();
    }, [enviar, pedirPintado, programarFoto, vaciarLotes]);

    const cerrar = useCallback(() => {
        vaciarLotes();
        guardarFoto();
    }, [guardarFoto, vaciarLotes]);

    // Al desmontar: envía lo pendiente y guarda la foto (mejor esfuerzo), y suelta los temporizadores.
    useEffect(
        () => () => {
            if (temporizadorLote.current || temporizadorFoto.current) {
                vaciarLotes();
                guardarFoto();
            }
            if (marco.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(marco.current);
        },
        [guardarFoto, vaciarLotes],
    );

    return { lienzo: ref.current, empezar, punto, terminar, deshacer, borrar, cerrar };
}
