"use client";

/**
 * IndicadorCapas — píldora compacta junto a los chats de Astraura IA (Ola 365 · CC4):
 * dice si el modo 1.58 está activo, cuántas capas hay encendidas y, con un punto por
 * capa, cuáles están sincronizadas con el chat. Al pulsarla abre el panel de ajustes.
 */

import { Layers } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CAPAS, ETIQUETA_CAPA, ETIQUETA_ESTADO } from "@/lib/astraura/capas-conciencia";
import { useEstadoCapas } from "@/lib/astraura/use-estado-capas";
import { cn } from "@/lib/utils";

import { PanelCapas, PuntoEstado } from "./panel-capas";

export function IndicadorCapas({ className }: { className?: string }) {
    const { preferencia, estados, resumen } = useEstadoCapas();
    const activo = preferencia.activo;
    const detalle = CAPAS.map((c) => `${ETIQUETA_CAPA[c].nombre}: ${ETIQUETA_ESTADO[estados[c]]}`).join(" · ");

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Capas de conciencia de Astraura 1.58"
                    title={activo ? detalle : "Modo 1.58 apagado: enrutador automático con modelos gratuitos"}
                    className={cn(
                        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-light tracking-wide transition-colors duration-200",
                        activo ? "border-[#007FFF]/40 bg-[#007FFF]/10 text-white/80 hover:bg-[#007FFF]/20" : "border-white/15 bg-white/5 text-white/45 hover:bg-white/10",
                        className,
                    )}
                >
                    <Layers className={cn("h-3 w-3", activo ? "text-[#007FFF]" : "text-white/40")} />
                    {activo ? (
                        <>
                            <span className="hidden sm:inline">{resumen.etiqueta}</span>
                            <span className="sm:hidden">1.58</span>
                        </>
                    ) : (
                        <span>{resumen.etiqueta}</span>
                    )}
                    <span className="flex items-center gap-0.5" data-testid="puntos-capas">
                        {CAPAS.map((c) => (
                            <PuntoEstado key={c} estado={estados[c]} className="h-1.5 w-1.5" />
                        ))}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="z-[10000] w-[min(92vw,22rem)] border-white/15 bg-[#070b14]/95 p-3 shadow-xl">
                <PanelCapas compacto />
            </PopoverContent>
        </Popover>
    );
}
