"use client";

/**
 * BotonesLlamada — en la cabecera de un chat: botones redondos de llamada de voz y de vídeo y
 * un menú (lista vertical) con «Sala virtual VR» y «Sala AR». En `compacto`, un solo botón
 * «Llamar» abre el menú con las cuatro opciones. Si ya estás en una llamada de este chat, se
 * convierte en «Volver a la llamada».
 */
import { useState } from "react";
import { Ellipsis, Headset, Loader2, Phone, PhoneCall, ScanEye, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { empezarLlamada, minimizarLlamada } from "@/lib/llamadas/acciones";
import { useLlamadas } from "@/lib/llamadas/store";
import { TEXTO_TIPO } from "@/lib/llamadas/formato";
import type { TipoLlamada } from "@/lib/llamadas/tipos";

const ICONO: Record<TipoLlamada, LucideIcon> = { audio: Phone, video: Video, "sala-vr": Headset, "sala-ar": ScanEye };
const COLOR: Record<TipoLlamada, string> = { audio: "#10B981", video: "#007FFF", "sala-vr": "#7C5CFF", "sala-ar": "#14B8A6" };

const AYUDA_MENU: Record<TipoLlamada, string> = {
    audio: "Solo voz, ligera y clara",
    video: "Cámara y micro",
    "sala-vr": "Voz en directo + el espacio 3D del OS con tu visor",
    "sala-ar": "Voz en directo + el espacio 3D sobre tu entorno (móvil con AR o visor)",
};

function BotonCabecera({
    icono: Icono,
    etiqueta,
    onClick,
    cargando,
    disabled,
}: {
    icono: LucideIcon;
    etiqueta: string;
    onClick?: () => void;
    cargando?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={etiqueta}
            title={etiqueta}
            className="ss-redondo grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-white/90 transition-all duration-200 hover:scale-105 hover:bg-[#7C5CFF1f] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] disabled:cursor-wait disabled:opacity-60"
            style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
        >
            {cargando ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : <Icono className="h-[18px] w-[18px]" aria-hidden />}
        </button>
    );
}

function ElementoMenu({ tipo, onElegir, disabled }: { tipo: TipoLlamada; onElegir: (t: TipoLlamada) => void; disabled: boolean }) {
    const Icono = ICONO[tipo];
    const c = COLOR[tipo];
    return (
        <DropdownMenuItem
            disabled={disabled}
            onSelect={() => onElegir(tipo)}
            className="cursor-pointer gap-3 rounded-[14px] px-2.5 py-2.5 text-white focus:bg-white/[.08] focus:text-white"
        >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}66` }}>
                <Icono className="h-4 w-4" style={{ color: c }} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{TEXTO_TIPO[tipo].accion}</span>
                <span className="block whitespace-normal text-[12px] leading-snug text-white/60">{AYUDA_MENU[tipo]}</span>
            </span>
        </DropdownMenuItem>
    );
}

export function BotonesLlamada({ hiloId, miembros, titulo, compacto = false }: { hiloId: string; miembros: string[]; titulo: string; compacto?: boolean }) {
    const [iniciando, setIniciando] = useState<TipoLlamada | null>(null);
    const { activa } = useLlamadas();
    const enEste = !!activa && activa.hiloId === hiloId && !activa.motor.cerrada;

    const llamar = async (tipo: TipoLlamada) => {
        if (iniciando || !hiloId) return;
        setIniciando(tipo);
        try {
            await empezarLlamada({ hiloId, tipo, titulo, miembros });
        } finally {
            setIniciando(null);
        }
    };

    if (enEste) {
        return (
            <button
                type="button"
                onClick={() => minimizarLlamada(false)}
                className="ss-redondo inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold text-white transition-transform duration-200 hover:scale-[1.03]"
                style={{ background: "#10B981", boxShadow: "0 0 16px rgba(16,185,129,.4)" }}
                aria-label="Volver a la llamada en curso"
            >
                <PhoneCall className="h-4 w-4" aria-hidden />
                Volver a la llamada
            </button>
        );
    }

    const menu = (tipos: TipoLlamada[], disparador: React.ReactNode) => (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>{disparador}</DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="z-[470] w-[min(19rem,calc(100vw-1.5rem))] rounded-[20px] border-white/10 p-1.5 text-white"
                style={{ background: "rgba(12,14,34,.92)", backdropFilter: "blur(20px) saturate(140%)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 20px 50px rgba(0,0,0,.45)" }}
            >
                <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                    {compacto ? "Llamar" : "Salas inmersivas"}
                </DropdownMenuLabel>
                {tipos.map((t) => (
                    <ElementoMenu key={t} tipo={t} onElegir={(x) => void llamar(x)} disabled={!!iniciando} />
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    if (compacto) {
        return menu(
            ["audio", "video", "sala-vr", "sala-ar"],
            <button
                type="button"
                aria-label="Llamar: elegir tipo de llamada"
                title="Llamar"
                disabled={!!iniciando}
                className="ss-redondo grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-white/90 transition-all duration-200 hover:scale-105 hover:bg-[#7C5CFF1f] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] disabled:cursor-wait disabled:opacity-60"
                style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
            >
                {iniciando ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : <Phone className="h-[18px] w-[18px]" aria-hidden />}
            </button>,
        );
    }

    return (
        <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Llamadas">
            <BotonCabecera icono={Phone} etiqueta="Llamada de voz" onClick={() => void llamar("audio")} cargando={iniciando === "audio"} disabled={!!iniciando} />
            <BotonCabecera icono={Video} etiqueta="Videollamada" onClick={() => void llamar("video")} cargando={iniciando === "video"} disabled={!!iniciando} />
            {menu(
                ["sala-vr", "sala-ar"],
                <button
                    type="button"
                    aria-label="Más formas de llamar: salas VR y AR"
                    title="Salas VR y AR"
                    disabled={!!iniciando}
                    className="ss-redondo grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-white/90 transition-all duration-200 hover:scale-105 hover:bg-[#7C5CFF1f] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] disabled:cursor-wait disabled:opacity-60"
                    style={{ background: "rgba(255,255,255,.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}
                >
                    {iniciando === "sala-vr" || iniciando === "sala-ar" ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden /> : <Ellipsis className="h-[18px] w-[18px] rotate-90" aria-hidden />}
                </button>,
            )}
        </div>
    );
}

export default BotonesLlamada;
