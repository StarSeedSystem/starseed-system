"use client";

/**
 * Timbre de una llamada entrante: tarjeta de cristal con la foto de quien llama, el tipo de
 * llamada y los botones Aceptar / Rechazar. Suena un tono suave (WebAudio) salvo si el chat
 * está silenciado o restringido, vibra en el móvil y a los 45 s cuenta como perdida.
 *
 * También se retira sola si quien llama cuelga antes o si contestas desde otro dispositivo.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { BellOff, Headset, Phone, PhoneOff, ScanEye, Video } from "lucide-react";
import { aceptarTimbre, rechazarTimbre } from "@/lib/llamadas/acciones";
import { DURACION_TIMBRE_MS } from "@/lib/llamadas/adjunto";
import { TEXTO_TIPO } from "@/lib/llamadas/formato";
import { quitarTimbre, type TimbreEntrante } from "@/lib/llamadas/store";
import { crearTono, vibrar } from "@/lib/llamadas/sonido";
import { usePresentesLlamada } from "@/lib/llamadas/use-presencia";
import { uidDeClave } from "@/lib/llamadas/presencia";
import { AvatarLlamada } from "./avatar-llamada";

const ICONO_TIPO = { audio: Phone, video: Video, "sala-vr": Headset, "sala-ar": ScanEye } as const;

function tituloEntrante(t: TimbreEntrante): string {
    switch (t.tipo) {
        case "video":
            return "Videollamada entrante";
        case "sala-vr":
            return "Te invitan a una sala VR";
        case "sala-ar":
            return "Te invitan a una sala AR";
        default:
            return "Llamada de voz entrante";
    }
}

export function TimbreLlamada({ timbre, miUid }: { timbre: TimbreEntrante; miUid: string | null }) {
    const [ocupado, setOcupado] = useState(false);
    const presentes = usePresentesLlamada(timbre.sesionId, true);
    const llamanteVisto = useRef(false);
    const Icono = ICONO_TIPO[timbre.tipo] ?? Phone;

    // Tono y vibración (no en chats silenciados).
    useEffect(() => {
        if (timbre.silenciado) return;
        const tono = crearTono("entrante");
        tono.iniciar();
        vibrar([220, 140, 220, 900, 220, 140, 220]);
        return () => tono.parar();
    }, [timbre.silenciado]);

    // A los 45 s: llamada perdida.
    useEffect(() => {
        const restante = Math.max(1000, DURACION_TIMBRE_MS - (Date.now() - timbre.llegada));
        const id = window.setTimeout(() => {
            quitarTimbre(timbre.sesionId);
            toast.message(`Llamada perdida de ${timbre.llamante.nombre}`);
        }, restante);
        return () => window.clearTimeout(id);
    }, [timbre.sesionId, timbre.llegada, timbre.llamante.nombre]);

    // Quien llama colgó, o yo contesté desde otro dispositivo.
    useEffect(() => {
        if (!presentes) return;
        const llamante = presentes.some((p) => (p.uid ?? uidDeClave(p.id)) === timbre.llamante.uid);
        if (llamante) llamanteVisto.current = true;
        const yoDentro = !!miUid && presentes.some((p) => (p.uid ?? uidDeClave(p.id)) === miUid);
        if (yoDentro) {
            quitarTimbre(timbre.sesionId);
            return;
        }
        if (llamanteVisto.current && !llamante && presentes.length === 0) {
            quitarTimbre(timbre.sesionId);
            toast.message(`Llamada perdida de ${timbre.llamante.nombre}`);
        }
    }, [presentes, miUid, timbre.sesionId, timbre.llamante.uid, timbre.llamante.nombre]);

    const aceptar = async (conVideo: boolean) => {
        if (ocupado) return;
        setOcupado(true);
        await aceptarTimbre(timbre, { camara: conVideo });
    };

    const rechazar = () => {
        if (ocupado) return;
        setOcupado(true);
        void rechazarTimbre(timbre);
    };

    const esVideo = timbre.tipo === "video";
    const titulo = tituloEntrante(timbre);

    return (
        <motion.section
            layout
            role="alertdialog"
            aria-live="assertive"
            aria-label={`${titulo} de ${timbre.llamante.nombre}`}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="pointer-events-auto w-full max-w-[400px] overflow-hidden rounded-[24px] text-white"
            style={{
                background: "rgba(12,14,34,.78)",
                backdropFilter: "blur(20px) saturate(140%)",
                border: "1px solid rgba(255,255,255,.08)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 22px 60px rgba(0,0,0,.5), 0 0 0 1px rgba(124,92,255,.18)",
            }}
        >
            <div className="flex items-center gap-4 px-4 pb-3 pt-4">
                <AvatarLlamada id={timbre.llamante.uid} nombre={timbre.llamante.nombre} avatar={timbre.llamante.avatar} tam={60} ondas animado={false} />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                        <Icono className="h-3.5 w-3.5 text-[#a996ff]" aria-hidden />
                        {titulo}
                    </p>
                    <p className="truncate text-[17px] font-semibold">{timbre.llamante.nombre}</p>
                    <p className="truncate text-[13px] text-white/65">
                        {timbre.tipoHilo === "grupo" ? `en ${timbre.tituloHilo ?? "un grupo"}` : TEXTO_TIPO[timbre.tipo].ayuda}
                    </p>
                </div>
                {timbre.silenciado && (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5" title="Chat silenciado: sin sonido" aria-label="Chat silenciado: sin sonido">
                        <BellOff className="h-4 w-4 text-white/60" aria-hidden />
                    </span>
                )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-4">
                <button
                    type="button"
                    onClick={rechazar}
                    disabled={ocupado}
                    className="ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: "#DC143C" }}
                    aria-label={`Rechazar la llamada de ${timbre.llamante.nombre}`}
                >
                    <PhoneOff className="h-4 w-4" aria-hidden />
                    Rechazar
                </button>
                {esVideo && (
                    <button
                        type="button"
                        onClick={() => void aceptar(false)}
                        disabled={ocupado}
                        className="ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ background: "#10B9811f", boxShadow: "inset 0 0 0 1px #10B98166" }}
                        aria-label="Aceptar solo con voz"
                    >
                        <Phone className="h-4 w-4" aria-hidden />
                        Solo voz
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => void aceptar(esVideo)}
                    disabled={ocupado}
                    className="ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: "#10B981", boxShadow: "0 0 18px rgba(16,185,129,.45)" }}
                    aria-label={esVideo ? "Aceptar con vídeo" : "Aceptar la llamada"}
                >
                    {esVideo ? <Video className="h-4 w-4" aria-hidden /> : <Phone className="h-4 w-4" aria-hidden />}
                    Aceptar
                </button>
            </div>
        </motion.section>
    );
}
