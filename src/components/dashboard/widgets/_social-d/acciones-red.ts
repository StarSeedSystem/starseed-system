"use client";
/**
 * Acciones REALES sobre publicaciones del Lienzo (Ola 0929 · D): resonar (`os_post_likes`, el
 * mismo corazón de /network, con recuento exacto de vuelta) y guardar en tu biblioteca (una
 * referencia, nunca una copia). Optimista y con marcha atrás si falla; nada de contadores locales
 * que no existan en la Red.
 */
import * as React from "react";
import { toast } from "sonner";
import { toggleLike } from "@/lib/os-social";
import type { Fuente } from "./fuente-compartida";
import type { FeedRed } from "./feed-red-datos";
import { guardarEnBiblioteca } from "./guardar";
import { textoDe, type PublicacionVista } from "./publicaciones";

export function useAccionesRed(fuente: Fuente<FeedRed>) {
    const [guardadas, setGuardadas] = React.useState<Set<string>>(() => new Set());
    const { mutar } = fuente;

    const resonar = React.useCallback(async (p: PublicacionVista) => {
        const antes = { meGusta: !!p.meGusta, n: p.reacciones };
        const aplicar = (meGusta: boolean, n: number) =>
            mutar((prev) => (prev ? { ...prev, publicaciones: prev.publicaciones.map((x) => (x.id === p.id ? { ...x, meGusta, reacciones: n } : x)) } : prev));
        aplicar(!antes.meGusta, Math.max(0, antes.n + (antes.meGusta ? -1 : 1)));
        const r = await toggleLike(p.id);
        if (r.ok) aplicar(r.active, r.count);
        else {
            aplicar(antes.meGusta, antes.n);
            toast.error(r.needsAuth ? "Entra en tu cuenta para resonar con una publicación." : "No se pudo guardar tu resonancia. Inténtalo de nuevo.");
        }
    }, [mutar]);

    const guardar = React.useCallback(async (p: PublicacionVista) => {
        const r = await guardarEnBiblioteca({ tipo: "post", refId: p.id, ruta: p.href, titulo: textoDe(p), miniatura: p.media });
        if (r === "ok") {
            setGuardadas((s) => new Set(s).add(p.id));
            toast.success("Guardada en tu biblioteca.");
        } else {
            toast.error(r === "sin-sesion" ? "Entra en tu cuenta para guardar en tu biblioteca." : "No se pudo guardar. Inténtalo de nuevo.");
        }
    }, []);

    return { resonar, guardar, guardadas };
}
