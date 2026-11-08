"use client";

/**
 * AvisosMensajesMount — montaje GLOBAL (sin UI) de los avisos de mensajes nuevos (NOT1108A · 2026-11-08).
 * Contrato: architecture/avisos-mensajes.md. Engancha `iniciarAvisosMensajes` (abrir el chat de una
 * notificación pulsada, chats del servidor, respaldo nativo de la app) y le da la navegación de Next para
 * abrir un chat sin recargar la página. Los mensajes de la malla los avisa el buzón (siempre montado).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AvisosMensajesMount() {
    const router = useRouter();
    useEffect(() => {
        let parar: (() => void) | null = null;
        let vivo = true;
        void import("@/lib/notifications/avisos-mensajes")
            .then((a) => {
                if (!vivo) return;
                a.fijarNavegador((ruta) => router.push(ruta));
                parar = a.iniciarAvisosMensajes();
            })
            .catch(() => undefined);
        return () => {
            vivo = false;
            parar?.();
        };
    }, [router]);
    return null;
}

export default AvisosMensajesMount;
