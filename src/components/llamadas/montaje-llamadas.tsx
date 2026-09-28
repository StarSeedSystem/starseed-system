"use client";

/**
 * MontajeLlamadas — capa global de las llamadas (se monta UNA vez, junto al resto de la chrome
 * del OS):
 *
 *  · Timbres: escucha (con una suscripción ligera a los INSERT de os_dm_messages, que la RLS ya
 *    limita a mis chats) los mensajes con un adjunto «llamada» de otra persona creados hace
 *    menos de 60 s, y enseña la tarjeta de llamada entrante. Chats silenciados o restringidos:
 *    la tarjeta sale, pero sin sonido.
 *  · La ventana de la llamada activa (pantalla completa o ventanita flotante).
 *
 * Sin sesión no escucha nada. Nunca lanza.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { onTableChange } from "@/lib/realtime/realtime";
import { messageFromRealtimeRow } from "@/lib/messages/dm";
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import { createClient } from "@/utils/supabase/client";
import { getCurrentUserId } from "@/lib/os-social";
import { esTimbreEntrante } from "@/lib/llamadas/adjunto";
import { prepararTimbre } from "@/lib/llamadas/acciones";
import { agregarTimbre, registrarHost, useLlamadas, type TimbreEntrante } from "@/lib/llamadas/store";
import { TimbreLlamada } from "./timbre";
import { VentanaLlamada } from "./ventana-llamada";

type FilaMensaje = Parameters<typeof messageFromRealtimeRow>[0];

function avisarSiOculta(t: TimbreEntrante) {
    try {
        if (typeof document === "undefined" || !document.hidden) return;
        if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
        const n = new Notification(t.tipo === "video" ? "Videollamada entrante" : "Llamada entrante", {
            body: t.tipoHilo === "grupo" && t.tituloHilo ? `${t.llamante.nombre} en ${t.tituloHilo}` : t.llamante.nombre,
            tag: `llamada-${t.sesionId}`,
            silent: t.silenciado,
        });
        n.onclick = () => {
            try {
                window.focus();
                n.close();
            } catch {
                /* noop */
            }
        };
    } catch {
        /* sin notificaciones del sistema */
    }
}

export function MontajeLlamadas() {
    const { timbres } = useLlamadas();
    const [uid, setUid] = useState<string | null>(null);
    const ajustes = useAjustesMensajeria();
    const ajustesRef = useRef(ajustes);
    ajustesRef.current = ajustes;

    useEffect(() => registrarHost(), []);

    // Quién soy (y si cambia la sesión).
    useEffect(() => {
        let vivo = true;
        void getCurrentUserId().then((u) => {
            if (vivo) setUid(u);
        });
        let baja: (() => void) | null = null;
        try {
            const { data } = createClient().auth.onAuthStateChange((_evento, sesion) => {
                if (vivo) setUid(sesion?.user?.id ?? null);
            });
            baja = () => data.subscription.unsubscribe();
        } catch {
            baja = null;
        }
        return () => {
            vivo = false;
            baja?.();
        };
    }, []);

    // Timbres entrantes.
    useEffect(() => {
        if (!uid) return;
        const vistos = new Set<string>();
        const baja = onTableChange<FilaMensaje>("os_dm_messages", { event: "INSERT" }, (payload) => {
            const msg = messageFromRealtimeRow((payload?.new ?? null) as FilaMensaje);
            if (!msg) return;
            const adjunto = esTimbreEntrante(msg, uid);
            if (!adjunto || vistos.has(adjunto.sesionId)) return;
            vistos.add(adjunto.sesionId);
            void prepararTimbre(msg, adjunto, (hiloId, tipoHilo) => {
                const e = ajustesRef.current.efectivos(hiloId, tipoHilo);
                return e.silenciado || e.restringido;
            }).then((t) => {
                if (!t) return;
                agregarTimbre(t);
                avisarSiOculta(t);
            });
        });
        return baja;
    }, [uid]);

    return (
        <>
            <div
                className="pointer-events-none fixed inset-x-0 top-0 z-[460] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-end sm:pr-5"
                aria-live="assertive"
            >
                <AnimatePresence>
                    {timbres.map((t) => (
                        <TimbreLlamada key={t.sesionId} timbre={t} miUid={uid} />
                    ))}
                </AnimatePresence>
            </div>
            <VentanaLlamada />
        </>
    );
}

export default MontajeLlamadas;
