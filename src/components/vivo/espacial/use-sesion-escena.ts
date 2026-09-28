"use client";

/**
 * Hook de React para una escena compartida: resuelve quién soy (cuenta o invitado), abre la
 * sesión, la cierra al salir y expone su estado con `useSyncExternalStore` (snapshots estables:
 * mismas referencias mientras nada cambie; sin sesión, las constantes `ESTADO_SESION_INICIAL`
 * y `AVATARES_INICIAL`, nunca un objeto nuevo por lectura).
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
    abrirSesionEscena,
    AVATARES_INICIAL,
    ESTADO_SESION_INICIAL,
    type EstadoAvatares,
    type EstadoSesionEscena,
    type FuenteEscena,
    type IdentidadEscena,
    type SesionEscena,
} from "@/lib/vivo/espacial/sesion";
import type { ModoAvatar } from "@/lib/vivo/espacial/avatares";
import { dependenciasReales } from "@/lib/vivo/espacial/dependencias";

async function resolverIdentidad(): Promise<IdentidadEscena> {
    try {
        const { miIdentidad, clavePestana, leerInvitado } = await import("@/lib/llamadas/identidad");
        const yo = await miIdentidad();
        if (yo) return { clave: clavePestana(yo.base), uid: yo.uid, nombre: yo.nombre };
        const inv = leerInvitado();
        return { clave: clavePestana(inv.id), uid: null, nombre: inv.nombre || "Invitado" };
    } catch {
        const azar = Math.random().toString(36).slice(2, 10);
        return { clave: `inv-${azar}:${azar.slice(0, 4)}`, uid: null, nombre: "Invitado" };
    }
}

function claveDe(f: FuenteEscena | null): string {
    if (!f) return "";
    return f.tipo === "espacio" ? `e:${f.id}` : `l:${f.sesionId}`;
}

const nada = () => () => {};

export function useSesionEscena(
    fuente: FuenteEscena | null,
    modoInicial: ModoAvatar = "3d",
): { sesion: SesionEscena | null; estado: EstadoSesionEscena; avatares: EstadoAvatares } {
    const [sesion, setSesion] = useState<SesionEscena | null>(null);
    const clave = claveDe(fuente);

    useEffect(() => {
        if (!fuente) return;
        let viva = true;
        let abierta: SesionEscena | null = null;
        void resolverIdentidad().then((identidad) => {
            if (!viva) return;
            abierta = abrirSesionEscena({ fuente, identidad, modo: modoInicial, deps: dependenciasReales() });
            setSesion(abierta);
        });
        return () => {
            viva = false;
            abierta?.cerrar();
            setSesion(null);
        };
        // La sesión depende solo de QUÉ escena es (la clave), no de la identidad del objeto `fuente`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave]);

    // Visibilidad: sin poses con la pestaña oculta, y lo pendiente se guarda al irse.
    useEffect(() => {
        if (!sesion) return;
        const alCambiar = () => sesion.visibilidad(document.visibilityState !== "hidden");
        const alIrse = () => void sesion.guardarYa();
        document.addEventListener("visibilitychange", alCambiar);
        window.addEventListener("pagehide", alIrse);
        alCambiar();
        return () => {
            document.removeEventListener("visibilitychange", alCambiar);
            window.removeEventListener("pagehide", alIrse);
        };
    }, [sesion]);

    const suscribirEstado = useCallback((cb: () => void) => (sesion ? sesion.tienda.suscribir(cb) : nada()), [sesion]);
    const leerEstado = useCallback(() => (sesion ? sesion.tienda.obtener() : ESTADO_SESION_INICIAL), [sesion]);
    const suscribirAvatares = useCallback((cb: () => void) => (sesion ? sesion.avatares.suscribir(cb) : nada()), [sesion]);
    const leerAvatares = useCallback(() => (sesion ? sesion.avatares.obtener() : AVATARES_INICIAL), [sesion]);

    const estado = useSyncExternalStore(suscribirEstado, leerEstado, leerEstado);
    const avatares = useSyncExternalStore(suscribirAvatares, leerAvatares, leerAvatares);
    return { sesion, estado, avatares };
}
