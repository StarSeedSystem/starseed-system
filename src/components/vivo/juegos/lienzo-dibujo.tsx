"use client";

import { useCallback, useEffect, useRef, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { ALTO_LIENZO, ANCHO_LIENZO, type Lienzo } from "@/lib/vivo/juegos/dibujo-trazos";
import { altoParaAncho, pintarLienzo } from "./dibujo-pintar";
import { estilos as s } from "./comun";

export interface PropsLienzoDibujo {
    lienzo: Lienzo;
    /** Solo quien dibuja puede pintar. */
    editable: boolean;
    alEmpezar?: (x: number, y: number) => void;
    alMover?: (x: number, y: number) => void;
    alTerminar?: () => void;
    etiqueta: string;
    /** Capas encima del lienzo (avisos, palabra revelada…). */
    children?: ReactNode;
}

/** Lienzo 4:3 con coordenadas lógicas 0..1000 × 0..750; se adapta a cualquier tamaño y densidad. */
export function LienzoDibujo({ lienzo, editable, alEmpezar, alMover, alTerminar, etiqueta, children }: PropsLienzoDibujo) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const contenedor = useRef<HTMLDivElement>(null);
    const lienzoRef = useRef(lienzo);
    lienzoRef.current = lienzo;
    const pintando = useRef(false);
    const marco = useRef<number | null>(null);

    const pintar = useCallback(() => {
        const c = canvas.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        pintarLienzo(ctx, lienzoRef.current, c.width, c.height);
    }, []);

    const pedir = useCallback(() => {
        if (marco.current !== null) return;
        const cuando = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f: FrameRequestCallback) => window.setTimeout(() => f(0), 16);
        marco.current = cuando(() => {
            marco.current = null;
            pintar();
        }) as number;
    }, [pintar]);

    // Ajusta la resolución del canvas al tamaño real (y a la densidad de píxeles).
    useEffect(() => {
        const caja = contenedor.current;
        const c = canvas.current;
        if (!caja || !c) return;
        const ajustar = () => {
            const ancho = caja.clientWidth || ANCHO_LIENZO;
            const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
            const w = Math.max(1, Math.round(ancho * dpr));
            const h = altoParaAncho(w);
            if (c.width !== w || c.height !== h) {
                c.width = w;
                c.height = h;
            }
            pintar();
        };
        ajustar();
        if (typeof ResizeObserver === "undefined") return;
        const o = new ResizeObserver(ajustar);
        o.observe(caja);
        return () => o.disconnect();
    }, [pintar]);

    useEffect(() => {
        pedir();
    }, [lienzo, pedir]);

    useEffect(
        () => () => {
            if (marco.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(marco.current);
        },
        [],
    );

    const aLogicas = (e: { clientX: number; clientY: number }): [number, number] => {
        const r = canvas.current?.getBoundingClientRect();
        if (!r || r.width === 0) return [0, 0];
        return [((e.clientX - r.left) / r.width) * ANCHO_LIENZO, ((e.clientY - r.top) / r.height) * ALTO_LIENZO];
    };

    const alBajar = (e: EventoPuntero<HTMLCanvasElement>) => {
        if (!editable || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* algunos navegadores no lo admiten en todos los casos */
        }
        pintando.current = true;
        const [x, y] = aLogicas(e);
        alEmpezar?.(x, y);
    };

    const alMoverPuntero = (e: EventoPuntero<HTMLCanvasElement>) => {
        if (!pintando.current) return;
        const nativo = e.nativeEvent;
        const eventos = typeof nativo.getCoalescedEvents === "function" ? nativo.getCoalescedEvents() : [];
        for (const ev of eventos.length > 0 ? eventos : [nativo]) {
            const [x, y] = aLogicas(ev);
            alMover?.(x, y);
        }
    };

    const alSoltar = () => {
        if (!pintando.current) return;
        pintando.current = false;
        alTerminar?.();
    };

    return (
        <div ref={contenedor} className={s.marcoLienzo}>
            <canvas
                ref={canvas}
                className={`${s.lienzo} ${editable ? "" : s.lienzoSoloVer}`}
                role="img"
                aria-label={etiqueta}
                onPointerDown={alBajar}
                onPointerMove={alMoverPuntero}
                onPointerUp={alSoltar}
                onPointerCancel={alSoltar}
                onLostPointerCapture={alSoltar}
            />
            {children}
        </div>
    );
}
