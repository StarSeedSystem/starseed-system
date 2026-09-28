"use client";

/**
 * Mirar quién está en una llamada sin entrar en ella (tarjeta del chat, timbre, página de
 * enlace). Comparte el canal con el motor si esta pestaña ya está dentro. Solo escucha mientras
 * `activo` (p. ej. la tarjeta está a la vista): fuera de pantalla no gasta tráfico.
 */
import { useEffect, useState, type RefObject } from "react";
import { abrirCanalLlamada } from "@/lib/llamadas/senalizacion";
import type { MetaPresencia } from "@/lib/llamadas/tipos";

/** Participantes dentro ahora; null = aún no se sabe (o inactivo). */
export function usePresentesLlamada(sesionId: string | null, activo: boolean): MetaPresencia[] | null {
    const [presentes, setPresentes] = useState<MetaPresencia[] | null>(null);
    useEffect(() => {
        if (!sesionId || !activo) {
            setPresentes(null);
            return;
        }
        const canal = abrirCanalLlamada(sesionId);
        if (!canal) {
            setPresentes(null);
            return;
        }
        const baja = canal.onPresencia((p) => setPresentes(p));
        const bajaSuscrito = canal.onSuscrito((ok) => {
            if (ok) setPresentes(canal.presencia());
        });
        if (canal.suscrito()) setPresentes(canal.presencia());
        return () => {
            baja();
            bajaSuscrito();
            canal.soltar();
        };
    }, [sesionId, activo]);
    return presentes;
}

/** ¿El elemento está (o casi está) a la vista? Sin IntersectionObserver, siempre sí. */
export function useEnPantalla(ref: RefObject<Element | null>, margen = "200px"): boolean {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === "undefined") {
            setVisible(true);
            return;
        }
        const io = new IntersectionObserver((entradas) => {
            for (const e of entradas) setVisible(e.isIntersecting);
        }, { rootMargin: margen });
        io.observe(el);
        return () => io.disconnect();
    }, [ref, margen]);
    return visible;
}
