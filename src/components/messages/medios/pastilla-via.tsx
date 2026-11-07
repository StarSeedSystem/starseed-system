"use client";

/**
 * PastillaVia — por dónde viajó un mensaje (MSJ1107A · 2026-11-07).
 * Pastilla discreta en la burbuja («Mesh · Wi-Fi local · 12 ms ✓», «Mesh · Red local (app nativa)»,
 * «Servidor StarSeed», «LoRa»…)
 * que abre el detalle completo: medio, enlace, servidor, ruta medida, latencia (o «Sin medir»),
 * entrega, intentos y por qué se descartó cada medio. Nada se inventa.
 */

import type { CSSProperties } from "react";
import { AlertTriangle, Clock, Globe, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ACENTO, CLASE_ROTULO } from "@/components/messages/marco/estilos";
import { ICONOS_MEDIO, type IconoMedio } from "@/components/messages/medios/iconos-medio";
import { detalleVia, etiquetaVia, familiaDe, nombreDeVia } from "@/lib/mensajeria/medios/medios";
import { INFO_MEDIOS, type DescarteMedio, type ViaMensaje } from "@/lib/mensajeria/medios/tipos";

export type PendienteVia = { estado: "enviando" | "en-espera" | "fallido"; aviso?: string; descartados?: DescarteMedio[] };

export interface PastillaViaProps {
    via?: ViaMensaje | null;
    pendiente?: PendienteVia | null;
    /** En mi burbuja (fondo de color): tinta clara u oscura según el color. */
    mio?: boolean;
    claro?: boolean;
    className?: string;
}

function colorDe(via: ViaMensaje | null | undefined, pendiente: PendienteVia | null | undefined): string {
    if (pendiente) return pendiente.estado === "fallido" ? ACENTO.carmesi : ACENTO.ambar;
    if (!via) return "#ffffff";
    if (via.medio === "servidor" || via.medio === "correo") return "#ffffff";
    return familiaDe(via.medio) === "malla" ? ACENTO.esmeralda : ACENTO.aurora;
}

function textoPendiente(p: PendienteVia): string {
    if (p.estado === "enviando") return "Enviando…";
    if (p.estado === "en-espera") return "En espera de un medio";
    return "Sin enviar";
}

export function PastillaVia({ via, pendiente, mio = false, claro = false, className }: PastillaViaProps) {
    if (!via && !pendiente) return null;
    const texto = pendiente ? textoPendiente(pendiente) : etiquetaVia(via as ViaMensaje);
    const color = colorDe(via, pendiente);
    const Icono: IconoMedio = pendiente
        ? pendiente.estado === "enviando"
            ? Loader2
            : pendiente.estado === "en-espera"
                ? Clock
                : AlertTriangle
        : ICONOS_MEDIO[(via as ViaMensaje).medio] ?? Globe;
    const estilo: CSSProperties = mio
        ? { background: claro ? "rgba(0,0,0,.10)" : "rgba(255,255,255,.16)", boxShadow: claro ? "inset 0 0 0 1px rgba(0,0,0,.14)" : "inset 0 0 0 1px rgba(255,255,255,.22)" }
        : { background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}40` };
    const lineas = via ? detalleVia(via) : [];
    const descartes = (via?.descartados ?? pendiente?.descartados ?? []).slice(0, 8);
    const intentos = (via?.intentos ?? []).slice(0, 8);
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`Por dónde viajó: ${texto}. Ver el detalle`}
                    title="Por dónde viajó este mensaje"
                    data-testid="pastilla-via"
                    className={cn(
                        "ss-redondo inline-flex max-w-[190px] cursor-pointer items-center gap-1 rounded-full px-1.5 text-[10px] font-medium leading-[15px] transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7C5CFF]",
                        mio ? (claro ? "text-black/70 opacity-90" : "text-white/85 opacity-90") : "text-white/70 opacity-90",
                        className,
                    )}
                    style={estilo}
                >
                    <Icono className={cn("h-2.5 w-2.5 shrink-0", pendiente?.estado === "enviando" && "animate-spin")} />
                    <span className="truncate">{texto}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                collisionPadding={12}
                className="w-[min(320px,calc(100vw-24px))] space-y-3 border-white/10 bg-[rgba(12,14,34,0.97)] p-3.5 text-white backdrop-blur-xl"
            >
                <div>
                    <p className={CLASE_ROTULO}>Por dónde viajó</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold">
                        <Icono className="h-4 w-4 shrink-0" style={{ color }} />
                        {pendiente ? textoPendiente(pendiente) : nombreDeVia(via as ViaMensaje)}
                    </p>
                    {pendiente?.aviso && <p className="mt-1 text-[12px] leading-relaxed text-white/65">{pendiente.aviso}</p>}
                </div>
                {lineas.length > 0 && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                        {lineas.map((l) => (
                            <div key={l.etiqueta} className="contents">
                                <dt className="text-white/50">{l.etiqueta}</dt>
                                <dd className="min-w-0 break-words text-white/85">{l.valor}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {intentos.length > 1 && (
                    <div>
                        <p className={cn(CLASE_ROTULO, "mb-1")}>Intentos</p>
                        <ul className="space-y-1 text-[12px]">
                            {intentos.map((i, n) => (
                                <li key={`${i.medio}-${n}`} className="flex gap-1.5 text-white/75">
                                    <span className={i.ok ? "text-[#10B981]" : "text-[#fda4af]"}>{i.ok ? "✓" : "✕"}</span>
                                    <span className="min-w-0">
                                        {INFO_MEDIOS[i.medio]?.corto ?? i.medio} · {i.etiqueta}: {i.detalle}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {descartes.length > 0 && (
                    <div>
                        <p className={cn(CLASE_ROTULO, "mb-1")}>Medios descartados</p>
                        <ul className="space-y-1 text-[12px] text-white/65">
                            {descartes.map((d, n) => (
                                <li key={`${d.medio}-${d.enlaceId ?? ""}-${n}`}>
                                    <span className="text-white/80">{INFO_MEDIOS[d.medio]?.corto ?? d.medio}</span>
                                    {d.etiqueta && d.etiqueta !== INFO_MEDIOS[d.medio]?.corto ? ` (${d.etiqueta})` : ""}: {d.motivo}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

export default PastillaVia;
