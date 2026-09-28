"use client";

/**
 * Mosaico de un participante: su vídeo (o su avatar si no hay cámara), su nombre, si tiene el
 * micro apagado, si comparte pantalla, cómo va su conexión y un halo verde cuando habla.
 *
 * El SONIDO no va aquí: lo pone `AudiosRemotos`, siempre montado, para que se siga oyendo a
 * todo el mundo aunque su mosaico no esté a la vista (ventanita, tira, foco).
 */
import { memo, useEffect, useRef } from "react";
import { Loader2, MicOff, MonitorUp, Pin, PinOff, WifiOff } from "lucide-react";
import { aplicarAltavoz } from "@/lib/llamadas/medios";
import { ETIQUETA_CALIDAD } from "@/lib/llamadas/calidad";
import type { ParticipanteLlamada } from "@/lib/llamadas/tipos";
import { AvatarLlamada } from "./avatar-llamada";
import estilos from "./llamadas.module.css";

function tieneVideo(p: ParticipanteLlamada): boolean {
    if (!(p.camara || p.pantalla) || !p.stream) return false;
    try {
        return p.stream.getVideoTracks().some((t) => t.readyState === "live" && (p.yo || !t.muted));
    } catch {
        return false;
    }
}

/** Cambia cuando cambia la pista de vídeo: el <video> se remonta y nunca se queda congelado. */
function claveVideo(s: MediaStream | null): string {
    try {
        return s ? `${s.id}:${s.getVideoTracks().map((t) => t.id).join(",")}` : "sin-video";
    } catch {
        return "sin-video";
    }
}

export function VideoStream({
    stream,
    espejo = false,
    ajuste = "cover",
    className = "",
    etiqueta,
}: {
    stream: MediaStream | null;
    espejo?: boolean;
    ajuste?: "cover" | "contain";
    className?: string;
    etiqueta?: string;
}) {
    const ref = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (el.srcObject !== stream) {
            try {
                el.srcObject = stream;
            } catch {
                /* navegador antiguo */
            }
        }
        if (stream) void el.play().catch(() => undefined);
    }, [stream]);
    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            muted
            aria-label={etiqueta}
            className={`h-full w-full ${ajuste === "contain" ? "object-contain" : "object-cover"} ${className}`}
            style={espejo ? { transform: "scaleX(-1)" } : undefined}
        />
    );
}

function AudioRemoto({ stream, altavozId }: { stream: MediaStream; altavozId: string | null }) {
    const ref = useRef<HTMLAudioElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (el.srcObject !== stream) {
            try {
                el.srcObject = stream;
            } catch {
                /* noop */
            }
        }
        void el.play().catch(() => undefined);
    }, [stream]);
    useEffect(() => {
        void aplicarAltavoz(ref.current, altavozId);
    }, [altavozId, stream]);
    return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

/** Reproduce la voz de todos los demás (con el altavoz elegido). */
export function AudiosRemotos({ participantes, altavozId }: { participantes: ParticipanteLlamada[]; altavozId: string | null }) {
    return (
        <>
            {participantes
                .filter((p) => !p.yo && p.stream)
                .map((p) => (
                    <AudioRemoto key={`${p.id}:${p.stream!.id}`} stream={p.stream!} altavozId={altavozId} />
                ))}
        </>
    );
}

const COLOR_CALIDAD: Record<string, string> = { regular: "#FFBF00", mala: "#DC143C" };

export type TamMosaico = "grande" | "normal" | "mini";

export const MosaicoParticipante = memo(function MosaicoParticipante({
    p,
    hablando,
    tam = "normal",
    audioSolo = false,
    fijado = false,
    onFijar,
    className = "",
    style,
}: {
    p: ParticipanteLlamada;
    hablando: boolean;
    tam?: TamMosaico;
    audioSolo?: boolean;
    fijado?: boolean;
    onFijar?: (id: string | null) => void;
    className?: string;
    style?: React.CSSProperties;
}) {
    const video = tieneVideo(p);
    const nombre = p.yo ? "Tú" : p.nombre;
    const tamAvatar = tam === "grande" ? 132 : tam === "mini" ? 44 : 84;
    const estadoConexion =
        !p.yo && p.conexion !== "conectado"
            ? p.conexion === "fallida"
                ? "Sin conexión"
                : p.conexion === "reconectando"
                  ? "Reconectando…"
                  : "Conectando…"
            : null;
    const colorCalidad = COLOR_CALIDAD[p.calidad];
    const etiquetaAccesible = `${nombre}${p.micro ? "" : ", micrófono apagado"}${p.pantalla ? ", compartiendo pantalla" : ""}${hablando ? ", hablando" : ""}`;

    return (
        <div
            role="group"
            aria-label={etiquetaAccesible}
            className={`group relative overflow-hidden ${tam === "mini" ? "rounded-[14px]" : "rounded-[20px]"} ${estilos.halo} ${className}`}
            style={{
                background: "radial-gradient(120% 120% at 20% 0%, rgba(124,92,255,.16), rgba(12,14,34,.78) 60%)",
                boxShadow: hablando
                    ? "0 0 0 2px #10B981, 0 0 28px rgba(16,185,129,.35), inset 0 1px 0 rgba(255,255,255,.06)"
                    : "0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.06)",
                ...style,
            }}
        >
            {video ? (
                <VideoStream
                    key={claveVideo(p.stream)}
                    stream={p.stream}
                    espejo={p.yo && p.camara && !p.pantalla}
                    ajuste={p.pantalla ? "contain" : "cover"}
                    etiqueta={p.pantalla ? `Pantalla de ${nombre}` : `Vídeo de ${nombre}`}
                    className={p.pantalla ? "bg-black" : ""}
                />
            ) : (
                <div className="grid h-full w-full place-items-center p-2">
                    <AvatarLlamada id={p.id} nombre={p.nombre} avatar={p.avatar} tam={tamAvatar} nivel={p.nivel} hablando={hablando} animado={audioSolo && tam !== "mini"} />
                </div>
            )}

            {estadoConexion && (
                <div className="absolute inset-0 grid place-items-center bg-black/35" role="status">
                    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium text-white/90" style={{ background: "rgba(12,14,34,.72)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }}>
                        {p.conexion === "fallida" ? <WifiOff className="h-3.5 w-3.5 text-[#DC143C]" aria-hidden /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {tam !== "mini" && estadoConexion}
                    </span>
                </div>
            )}

            {tam !== "mini" && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
                    <span
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white"
                        style={{ background: "rgba(8,10,24,.62)", backdropFilter: "blur(12px)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
                    >
                        {!p.micro && <MicOff className="h-3.5 w-3.5 shrink-0 text-[#ff5a78]" aria-hidden />}
                        {p.pantalla && <MonitorUp className="h-3.5 w-3.5 shrink-0 text-[#7dd3fc]" aria-hidden />}
                        <span className="truncate">{nombre}</span>
                        {p.invitado && <span className="shrink-0 font-normal text-white/60">· invitado</span>}
                    </span>
                    {colorCalidad && (
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: colorCalidad, boxShadow: `0 0 8px ${colorCalidad}` }}
                            title={ETIQUETA_CALIDAD[p.calidad]}
                            aria-label={ETIQUETA_CALIDAD[p.calidad]}
                        />
                    )}
                </div>
            )}

            {tam === "mini" && !p.micro && (
                <span className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-black/60" aria-hidden>
                    <MicOff className="h-3 w-3 text-[#ff5a78]" />
                </span>
            )}

            {onFijar && tam !== "mini" && (
                <button
                    type="button"
                    onClick={() => onFijar(fijado ? null : p.id)}
                    className="ss-redondo absolute left-2 top-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white opacity-0 transition-opacity duration-200 focus-visible:opacity-100 group-hover:opacity-100"
                    style={{ background: "rgba(8,10,24,.62)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }}
                    aria-label={fijado ? `Dejar de fijar a ${nombre}` : `Fijar a ${nombre} en grande`}
                    title={fijado ? "Dejar de fijar" : "Fijar en grande"}
                >
                    {fijado ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
            )}
        </div>
    );
});
