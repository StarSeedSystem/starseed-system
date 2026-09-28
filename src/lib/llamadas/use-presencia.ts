"use client";

/**
 * Mirar quién está en una llamada sin entrar en ella (tarjeta del chat, timbre, página de
 * enlace). Comparte el canal privado con el motor si esta pestaña ya está dentro. Solo escucha
 * mientras `activo` (p. ej. la tarjeta está a la vista): fuera de pantalla no gasta tráfico.
 * Si el servidor no deja entrar en el canal, devuelve null (no se sabe) y no insiste en bucle.
 */
import { useEffect, useState, type RefObject } from "react";
import { abrirCanalLlamada, type ConexionCanal } from "@/lib/llamadas/senalizacion";
import { resolverTemaSesion, temaDenegadoReciente } from "@/lib/llamadas/resolver-tema";
import type { MetaPresencia } from "@/lib/llamadas/tipos";

/**
 * Participantes dentro ahora; null = aún no se sabe (o inactivo, o sin permiso).
 * `token`: el del enlace público si se llegó por él (página `/llamada/<id>?t=…`).
 */
export function usePresentesLlamada(sesionId: string | null, activo: boolean, token?: string | null): MetaPresencia[] | null {
    const [presentes, setPresentes] = useState<MetaPresencia[] | null>(null);
    useEffect(() => {
        if (!sesionId || !activo) {
            setPresentes(null);
            return;
        }
        let vivo = true;
        let canal: ConexionCanal | null = null;
        const bajas: (() => void)[] = [];
        void resolverTemaSesion("llamada", sesionId, { token }).then((tema) => {
            if (!vivo) return;
            if (!tema || temaDenegadoReciente(tema)) {
                setPresentes(null);
                return;
            }
            const c = abrirCanalLlamada(sesionId, { tema });
            if (!c) {
                setPresentes(null);
                return;
            }
            canal = c;
            bajas.push(c.onPresencia((p) => setPresentes(p)));
            bajas.push(
                c.onSuscrito((ok) => {
                    if (ok) setPresentes(c.presencia());
                }),
            );
            bajas.push(
                c.onEstado((e) => {
                    if (e === "denegado") setPresentes(null);
                }),
            );
            if (c.suscrito()) setPresentes(c.presencia());
        });
        return () => {
            vivo = false;
            for (const b of bajas.splice(0)) b();
            canal?.soltar();
            canal = null;
        };
    }, [sesionId, activo, token]);
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
