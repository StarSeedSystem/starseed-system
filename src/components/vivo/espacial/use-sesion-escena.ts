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
import { ejecutarGuardia } from "@/components/xr/shell/guardia-privacidad";
import { abrirCanalEscenaElegido, type ConexionEscena } from "@/lib/vivo/espacial/canal";
import type { Alcanzabilidad, Sala } from "@/lib/salas/sala";

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

/** Sala mínima de la escena para que `elegirTransporte` pueda decidir el camino (§3 h). */
function salaDeEscena(clave: string): Sala {
    return { id: clave, tipo: "escena3d", titulo: "Escena compartida", visibilidad: "grupo", transporte: "malla-p2p", miembros: {}, creadaEn: 0 };
}

/**
 * Lo que hay disponible AHORA: internet sí, servidor privado no y malla aún no (falta la lista de
 * pares y la señalización del grupo). Con `malla:false` la elección sigue cayendo en el canal de
 * Supabase de siempre; cuando la malla esté cableada, `elegirTransporte` pedirá `malla-p2p` sola.
 */
function alcanzabilidadDeEscena(): Alcanzabilidad {
    const internet = typeof navigator === "undefined" ? true : navigator.onLine;
    return { internet, servidorPrivado: false, malla: false };
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
            const depsBase = dependenciasReales();
            const protegerCanal = (c: ConexionEscena | null): ConexionEscena | null =>
                c
                    ? ejecutarGuardia(c, {
                          destino: "sala-publica" as any,
                          consentimientos: () => [],
                          ahora: () => Date.now(),
                          alBloquear: (v) => {
                              // Nunca se registra el contenido bloqueado; solo se notifica por nombre de variable.
                              console.warn(`[XR guardia] bloqueado ${v.clase}: ${v.motivo}`);
                          },
                      })
                    : null;
            const depsConGuardia: typeof depsBase = {
                ...depsBase,
                // La escena se abre por donde toca: `abrirCanalEscenaElegido` decide con `elegirTransporte`
                // (malla P2P si procede) y cae en el canal de siempre cuando aún no hay malla.
                abrirCanal: (tema: string, clave: string, filaId: string | null) =>
                    protegerCanal(
                        abrirCanalEscenaElegido(salaDeEscena(clave), alcanzabilidadDeEscena(), {
                            tema,
                            clave,
                            filaId,
                            abrirCanal: (t, k, f) => depsBase.abrirCanal?.(t, k, f) ?? null,
                        }),
                    ),
            };
            abierta = abrirSesionEscena({ fuente, identidad, modo: modoInicial, deps: depsConGuardia });
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
