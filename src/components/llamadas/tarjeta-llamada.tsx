"use client";

/**
 * TarjetaLlamada — la llamada tal y como se ve en el chat: tipo, estado (sonando, en curso con
 * cuántas personas hay dentro, terminada con su duración, perdida / sin respuesta) y [Unirse]
 * mientras sigue viva.
 *
 * Solo escucha la presencia de la llamada mientras la tarjeta está a la vista y la llamada es de
 * las últimas 12 horas: un chat con cien llamadas antiguas no abre cien canales.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Headset, Loader2, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, ScanEye, Video } from "lucide-react";
import type { DmAttachment } from "@/lib/messages/dm";
import { adjuntoLlamadaDe, estadoTarjetaLlamada, VENTANA_TIMBRE_MS } from "@/lib/llamadas/adjunto";
import { TEXTO_TIPO } from "@/lib/llamadas/formato";
import { minimizarLlamada, unirseALlamada } from "@/lib/llamadas/acciones";
import { useLlamadas } from "@/lib/llamadas/store";
import { useEnPantalla, usePresentesLlamada } from "@/lib/llamadas/use-presencia";
import type { EstadoTarjeta, TipoLlamada } from "@/lib/llamadas/tipos";
import { AvatarLlamada } from "./avatar-llamada";

const COLOR_TIPO: Record<TipoLlamada, string> = {
    audio: "#10B981",
    video: "#007FFF",
    "sala-vr": "#7C5CFF",
    "sala-ar": "#14B8A6",
};

const ICONO_TIPO = { audio: Phone, video: Video, "sala-vr": Headset, "sala-ar": ScanEye } as const;

const DOCE_HORAS = 12 * 60 * 60 * 1000;

function iconoEstado(estado: EstadoTarjeta, tipo: TipoLlamada, mio: boolean) {
    if (estado === "perdida") return { Icono: PhoneMissed, color: "#ff5a78" };
    if (estado === "sin-respuesta") return { Icono: PhoneOff, color: "#ff5a78" };
    if (estado === "terminada" || estado === "finalizada") return { Icono: mio ? PhoneOutgoing : PhoneIncoming, color: "rgba(255,255,255,.75)" };
    return { Icono: ICONO_TIPO[tipo] ?? Phone, color: "#ffffff" };
}

function horaCorta(iso?: string): string | null {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return null;
    }
}

export function TarjetaLlamada({ adjunto, mio }: { adjunto: DmAttachment; mio: boolean }) {
    const adj = useMemo(() => adjuntoLlamadaDe(adjunto), [adjunto]);
    const ref = useRef<HTMLDivElement | null>(null);
    const visible = useEnPantalla(ref);
    const [ahora, setAhora] = useState(() => Date.now());
    const [entrando, setEntrando] = useState(false);
    const { activa } = useLlamadas();

    const iniciada = adj?.iniciada ? Date.parse(adj.iniciada) : NaN;
    const reciente = !Number.isFinite(iniciada) || ahora - iniciada < DOCE_HORAS;
    const presentes = usePresentesLlamada(adj?.sesionId ?? null, !!adj && visible && reciente);

    // Mientras puede estar sonando, se recalcula (pasa de «sonando» a «finalizada» sola).
    const puedeSonar = Number.isFinite(iniciada) && ahora - iniciada < VENTANA_TIMBRE_MS && !adj?.fin;
    useEffect(() => {
        if (!puedeSonar) return;
        const id = window.setInterval(() => setAhora(Date.now()), 5000);
        return () => window.clearInterval(id);
    }, [puedeSonar]);

    if (!adj) {
        return (
            <div className="inline-flex items-center gap-2 rounded-[16px] px-3 py-2 text-[13px] text-white/70" style={{ background: "rgba(255,255,255,.05)" }}>
                <Phone className="h-4 w-4" aria-hidden />
                Llamada
            </div>
        );
    }

    const vista = estadoTarjetaLlamada({ adjunto: adj, mio, presentes: presentes ? presentes.length : null, ahora });
    const enEsta = !!activa && activa.sesionId === adj.sesionId && !activa.motor.cerrada;
    const color = COLOR_TIPO[adj.tipoLlamada];
    const { Icono, color: colorIcono } = iconoEstado(vista.estado, adj.tipoLlamada, mio);
    const viva = vista.estado === "sonando" || vista.estado === "en-curso";
    const hora = horaCorta(adj.iniciada);

    const unirse = async () => {
        if (enEsta) {
            minimizarLlamada(false);
            return;
        }
        setEntrando(true);
        const error = await unirseALlamada({
            sesionId: adj.sesionId,
            tipo: adj.tipoLlamada,
            hiloId: null,
            titulo: adj.name,
            camara: adj.tipoLlamada === "video",
        });
        setEntrando(false);
        if (error) toast.error(error);
    };

    return (
        <div
            ref={ref}
            className="flex w-full min-w-[228px] max-w-[320px] flex-col gap-3 rounded-[18px] p-3 text-white"
            style={{
                background: mio ? "linear-gradient(135deg, rgba(124,92,255,.22), rgba(12,14,34,.55))" : "rgba(12,14,34,.55)",
                backdropFilter: "blur(20px) saturate(140%)",
                border: "1px solid rgba(255,255,255,.08)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
            }}
            data-estado={vista.estado}
        >
            <div className="flex items-center gap-3">
                <span
                    className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
                    style={viva ? { background: color, boxShadow: `0 0 18px ${color}88` } : { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` }}
                    aria-hidden
                >
                    <Icono className="h-5 w-5" style={{ color: viva ? "#fff" : colorIcono }} />
                    {vista.estado === "en-curso" && (
                        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#0c0e22] bg-[#39FF14]" style={{ boxShadow: "0 0 8px #39FF14" }} />
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-tight">{TEXTO_TIPO[adj.tipoLlamada].nombre}</p>
                    <p
                        className="text-[13px] leading-tight"
                        style={{ color: vista.estado === "perdida" || vista.estado === "sin-respuesta" ? "#ff8aa0" : "rgba(255,255,255,.68)" }}
                        role="status"
                    >
                        {vista.etiqueta}
                        {hora && !viva && <span className="text-white/45"> · {hora}</span>}
                    </p>
                </div>
            </div>

            {vista.estado === "en-curso" && presentes && presentes.length > 0 && (
                <div className="flex items-center gap-2" aria-label={`Dentro: ${presentes.map((p) => p.nombre).join(", ")}`}>
                    <div className="flex -space-x-2">
                        {presentes.slice(0, 4).map((p) => (
                            <span key={p.id} className="rounded-full ring-2 ring-[#0c0e22]">
                                <AvatarLlamada id={p.id} nombre={p.nombre} avatar={p.avatar} tam={26} animado={false} />
                            </span>
                        ))}
                    </div>
                    {presentes.length > 4 && <span className="text-[12px] text-white/60">+{presentes.length - 4}</span>}
                </div>
            )}

            {(vista.puedeUnirse || enEsta) && (
                <button
                    type="button"
                    onClick={() => void unirse()}
                    disabled={entrando}
                    className="ss-redondo inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02] disabled:cursor-wait disabled:opacity-70"
                    style={{ background: "#10B981", boxShadow: "0 0 16px rgba(16,185,129,.35)" }}
                    aria-label={enEsta ? "Volver a la llamada" : `Unirse a la ${TEXTO_TIPO[adj.tipoLlamada].nombre.toLowerCase()}`}
                >
                    {entrando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icono className="h-4 w-4" aria-hidden />}
                    {enEsta ? "Volver a la llamada" : entrando ? "Entrando…" : "Unirse"}
                </button>
            )}
        </div>
    );
}

export default TarjetaLlamada;
