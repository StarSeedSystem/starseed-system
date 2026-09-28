"use client";

/**
 * PreLlamada — la antesala de /llamada/[id]: quién está dentro, tu nombre si entras como
 * invitado, y una vista previa de cámara y micro que SOLO se enciende al pulsar «Probar cámara
 * y micro». Desde aquí se entra con el micro y la cámara como los dejes.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Loader2, LogIn, Mic, MicOff, Users, Video, VideoOff } from "lucide-react";
import { nivelRms } from "@/lib/llamadas/hablante";
import { obtenerMedios, obtenerPista, pararStream } from "@/lib/llamadas/medios";
import { TEXTO_TIPO } from "@/lib/llamadas/formato";
import { usePresentesLlamada } from "@/lib/llamadas/use-presencia";
import { MAX_PARTICIPANTES, type TipoLlamada } from "@/lib/llamadas/tipos";
import { AvatarLlamada } from "./avatar-llamada";
import { BotonRedondo } from "./controles";
import { VideoStream } from "./mosaico";

export interface EleccionEntrada {
    stream: MediaStream | null;
    microActivo: boolean;
    camara: boolean;
    nombreInvitado: string | null;
}

function useNivelMicro(stream: MediaStream | null, activo: boolean): number {
    const [nivel, setNivel] = useState(0);
    useEffect(() => {
        const pista = stream?.getAudioTracks()[0];
        if (!pista || !activo || typeof window === "undefined") {
            setNivel(0);
            return;
        }
        const C = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!C) return;
        let ctx: AudioContext | null = null;
        let id: number | null = null;
        try {
            ctx = new C();
            const fuente = ctx.createMediaStreamSource(new MediaStream([pista]));
            const an = ctx.createAnalyser();
            an.fftSize = 512;
            fuente.connect(an);
            const datos = new Uint8Array(new ArrayBuffer(an.fftSize));
            id = window.setInterval(() => {
                an.getByteTimeDomainData(datos);
                setNivel(Math.min(1, nivelRms(datos) * 3.2));
            }, 100);
        } catch {
            /* sin medidor */
        }
        return () => {
            if (id) window.clearInterval(id);
            void ctx?.close().catch(() => undefined);
        };
    }, [stream, activo]);
    return nivel;
}

export function PreLlamada({
    sesionId,
    tipo,
    titulo,
    miNombre,
    miAvatar,
    miId,
    invitado,
    nombreInicial,
    onUnirse,
}: {
    sesionId: string;
    tipo: TipoLlamada;
    titulo: string;
    miNombre: string;
    miAvatar: string | null;
    miId: string;
    invitado: boolean;
    nombreInicial?: string;
    onUnirse: (e: EleccionEntrada) => Promise<string | null>;
}) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [probando, setProbando] = useState(false);
    const [micro, setMicro] = useState(true);
    const [camara, setCamara] = useState(tipo === "video");
    const [error, setError] = useState<string | null>(null);
    const [nombre, setNombre] = useState(nombreInicial ?? "");
    const [entrando, setEntrando] = useState(false);
    const entregado = useRef(false);
    const streamRef = useRef<MediaStream | null>(null);
    streamRef.current = stream;
    const presentes = usePresentesLlamada(sesionId, true);
    const nivel = useNivelMicro(stream, micro);
    const llena = !!presentes && presentes.length >= MAX_PARTICIPANTES;
    const nombreValido = !invitado || nombre.trim().length > 0;

    // Al salir sin entrar, se apagan micro y cámara de la vista previa.
    useEffect(
        () => () => {
            if (!entregado.current) pararStream(streamRef.current);
        },
        [],
    );

    const probar = async () => {
        setProbando(true);
        setError(null);
        const r = await obtenerMedios({ audio: true, video: camara });
        setProbando(false);
        if (!r.stream) {
            setError(r.error);
            return;
        }
        if (r.aviso) {
            setError(r.aviso);
            setCamara(false);
        }
        const a = r.stream.getAudioTracks()[0];
        if (a) a.enabled = micro;
        setStream(r.stream);
    };

    const alternarMicro = () => {
        const v = !micro;
        setMicro(v);
        const a = stream?.getAudioTracks()[0];
        if (a) a.enabled = v;
    };

    const alternarCamara = async () => {
        const v = !camara;
        if (!stream) {
            setCamara(v);
            return;
        }
        if (!v) {
            for (const t of stream.getVideoTracks()) {
                stream.removeTrack(t);
                t.stop();
            }
            setCamara(false);
            setStream(new MediaStream(stream.getTracks()));
            return;
        }
        const r = await obtenerPista("video");
        if (!r.pista) {
            setError(r.error);
            return;
        }
        stream.addTrack(r.pista);
        setCamara(true);
        setStream(new MediaStream(stream.getTracks()));
    };

    const unirse = async () => {
        if (entrando || !nombreValido || llena) return;
        setEntrando(true);
        setError(null);
        entregado.current = true;
        const e = await onUnirse({ stream, microActivo: micro, camara, nombreInvitado: invitado ? nombre.trim() : null });
        if (e) {
            entregado.current = false;
            setError(e);
            setEntrando(false);
        }
    };

    const conVideo = !!stream && camara && stream.getVideoTracks().length > 0;

    return (
        <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="mx-auto grid w-full max-w-4xl gap-5 rounded-[24px] p-4 text-white sm:p-6 md:grid-cols-[1.25fr_1fr]"
            style={{ background: "rgba(12,14,34,.55)", backdropFilter: "blur(20px) saturate(140%)", border: "1px solid rgba(255,255,255,.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 24px 60px rgba(0,0,0,.35)" }}
            aria-label="Antes de entrar en la llamada"
        >
            {/* Vista previa */}
            <div className="flex flex-col gap-3">
                <div className="relative aspect-video w-full overflow-hidden rounded-[20px]" style={{ background: "radial-gradient(120% 120% at 20% 0%, rgba(124,92,255,.2), rgba(8,10,24,.9) 65%)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}>
                    {conVideo ? (
                        <VideoStream stream={stream} espejo etiqueta="Vista previa de tu cámara" />
                    ) : (
                        <div className="grid h-full place-items-center">
                            <AvatarLlamada id={miId} nombre={invitado ? nombre || "Invitado" : miNombre} avatar={miAvatar} tam={96} nivel={nivel} hablando={!!stream && micro && nivel > 0.06} animado={!stream} />
                        </div>
                    )}
                    {!stream && (
                        <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
                            <button
                                type="button"
                                onClick={() => void probar()}
                                disabled={probando}
                                className="ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03] disabled:cursor-wait disabled:opacity-70"
                                style={{ background: "#7C5CFF1f", boxShadow: "inset 0 0 0 1px #7C5CFF66", backdropFilter: "blur(12px)" }}
                            >
                                {probando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                                Probar cámara y micro
                            </button>
                        </div>
                    )}
                </div>
                {stream && (
                    <div className="flex items-center gap-3 px-1" aria-label="Nivel de tu micrófono">
                        <Mic className="h-4 w-4 shrink-0 text-white/60" aria-hidden />
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(nivel * 100)} aria-label="Nivel del micrófono">
                            <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.round(nivel * 100)}%`, background: "linear-gradient(90deg,#10B981,#39FF14)" }} />
                        </div>
                    </div>
                )}
                <div className="flex items-start justify-center gap-5">
                    <BotonRedondo icono={micro ? Mic : MicOff} etiqueta={micro ? "Micro encendido" : "Micro apagado"} aria={micro ? "Entrar con el micrófono apagado" : "Entrar con el micrófono encendido"} variante={micro ? "normal" : "apagado"} onClick={alternarMicro} tam={50} />
                    <BotonRedondo icono={camara ? Video : VideoOff} etiqueta={camara ? "Cámara encendida" : "Cámara apagada"} aria={camara ? "Entrar con la cámara apagada" : "Entrar con la cámara encendida"} variante={camara ? "normal" : "apagado"} onClick={() => void alternarCamara()} tam={50} />
                </div>
            </div>

            {/* Datos y entrada */}
            <div className="flex flex-col justify-center gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{TEXTO_TIPO[tipo].nombre}</p>
                    <h1 className="text-[22px] font-semibold leading-tight">{titulo}</h1>
                </div>

                <div className="flex items-center gap-3" aria-live="polite">
                    {presentes && presentes.length > 0 ? (
                        <>
                            <div className="flex -space-x-2">
                                {presentes.slice(0, 4).map((p) => (
                                    <span key={p.id} className="rounded-full ring-2 ring-[#0c0e22]">
                                        <AvatarLlamada id={p.id} nombre={p.nombre} avatar={p.avatar} tam={30} animado={false} />
                                    </span>
                                ))}
                            </div>
                            <p className="min-w-0 text-[13px] text-white/70">
                                Dentro: {presentes.slice(0, 3).map((p) => p.nombre).join(", ")}
                                {presentes.length > 3 ? ` y ${presentes.length - 3} más` : ""}
                            </p>
                        </>
                    ) : (
                        <p className="flex items-center gap-2 text-[13px] text-white/60">
                            <Users className="h-4 w-4" aria-hidden />
                            {presentes ? "Aún no hay nadie dentro." : "Mirando quién está dentro…"}
                        </p>
                    )}
                </div>

                {invitado && (
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Tu nombre</span>
                        <input
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value.slice(0, 40))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void unirse();
                            }}
                            placeholder="Cómo quieres que te vean"
                            maxLength={40}
                            autoComplete="nickname"
                            className="h-11 rounded-[14px] bg-white/[.06] px-3.5 text-[15px] text-white outline-none ring-1 ring-white/10 transition-shadow duration-200 placeholder:text-white/35 focus:ring-2 focus:ring-[#7C5CFF]"
                        />
                        <span className="text-[12px] text-white/50">Entras como invitado. Solo se guarda este nombre en esta pestaña.</span>
                    </label>
                )}

                {llena && <p className="rounded-[14px] px-3 py-2 text-[13px] text-amber-50" style={{ background: "rgba(255,191,0,.12)", boxShadow: "inset 0 0 0 1px rgba(255,191,0,.35)" }}>La llamada ya tiene {MAX_PARTICIPANTES} personas, el máximo. Prueba en un rato.</p>}
                {error && (
                    <p className="rounded-[14px] px-3 py-2 text-[13px] text-rose-50" role="alert" style={{ background: "rgba(220,20,60,.12)", boxShadow: "inset 0 0 0 1px rgba(220,20,60,.35)" }}>
                        {error}
                    </p>
                )}

                <button
                    type="button"
                    onClick={() => void unirse()}
                    disabled={entrando || !nombreValido || llena}
                    className="ss-redondo inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-55"
                    style={{ background: "#10B981", boxShadow: "0 0 22px rgba(16,185,129,.4)" }}
                >
                    {entrando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <LogIn className="h-5 w-5" aria-hidden />}
                    {entrando ? "Entrando…" : "Unirse a la llamada"}
                </button>
            </div>
        </motion.section>
    );
}
