"use client";

/**
 * Contador de no leídos del icono de Mensajes del dock (NOT1108A · 2026-11-08).
 * Contrato: architecture/avisos-mensajes.md. Ligero a propósito (el dock lo carga siempre): nada del
 * centro de notificaciones ni del catálogo de apps. Suma:
 *   · los no leídos de las conversaciones con las NEURONAS (exactos: la bandeja de la malla, `leidoHasta`);
 *   · los mensajes de CHATS del servidor que llegaron en esta sesión sin abrir su chat (los apunta
 *     avisos-mensajes.ts; abrir el chat los quita). Los exactos de los chats los sigue dando la lista de
 *     Mensajes (pastilla «Mensajes»), que lee el servidor.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

const noLeidosDm = new Map<string, number>();
const oyentes = new Set<() => void>();
let version = 0;

function avisar(): void {
    version++;
    for (const cb of Array.from(oyentes)) {
        try {
            cb();
        } catch {
            /* un oyente roto no tumba a los demás */
        }
    }
}

/** Un mensaje nuevo de un chat que no está abierto. */
export function sumarNoLeidoChat(clave: string): void {
    noLeidosDm.set(clave, (noLeidosDm.get(clave) ?? 0) + 1);
    avisar();
}

/** Se abrió ese chat: deja de contar. */
export function quitarNoLeidoChat(clave: string | null): void {
    if (clave && noLeidosDm.delete(clave)) avisar();
}

export function noLeidosChatsSesion(): number {
    let n = 0;
    for (const v of noLeidosDm.values()) n += v;
    return n;
}

/** Solo pruebas. */
export function _reiniciarNoLeidos(): void {
    noLeidosDm.clear();
    avisar();
}

/** No leídos de las neuronas (buzón, perezoso) + chats de esta sesión. */
export function useNoLeidosMensajes(): number {
    useSyncExternalStore(
        (cb) => {
            oyentes.add(cb);
            return () => oyentes.delete(cb);
        },
        () => version,
        () => 0,
    );
    const [neuronas, setNeuronas] = useState(0);
    useEffect(() => {
        let vivo = true;
        let baja: (() => void) | null = null;
        void Promise.all([import("@/lib/mensajeria/neuronas/buzon"), import("@/lib/mensajeria/neuronas/bandeja")])
            .then(([b, { noLeidosNeuronas }]) => {
                if (!vivo) return;
                const leer = () => setNeuronas(noLeidosNeuronas(b.bandejaMalla()));
                leer();
                baja = b.suscribirBandejaMalla(leer);
            })
            .catch(() => undefined);
        return () => {
            vivo = false;
            baja?.();
        };
    }, []);
    return neuronas + noLeidosChatsSesion();
}
