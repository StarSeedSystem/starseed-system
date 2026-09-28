"use client";

/**
 * BotonEstiloRapido (contrato C4) — estilo de un mensaje BÁSICO de texto desde el compositor:
 * fuente, tamaño, color, marco, fondo y animación de letras, con vista previa en miniatura y
 * «Quitar estilo». El botón muestra un punto violeta cuando hay un estilo puesto.
 */
import { useState } from "react";
import { Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { MensajeFormateado } from "./mensaje-formateado";
import { limpiarEstilo, PanelEstilo } from "./panel-estilo";
import { Rotulo } from "@/components/widgets-libres/familias/comun";

export interface BotonEstiloRapidoProps {
    estilo: EstiloMensaje | null;
    onChange: (e: EstiloMensaje | null) => void;
}

export function BotonEstiloRapido({ estilo, onChange }: BotonEstiloRapidoProps) {
    const [abierto, setAbierto] = useState(false);
    const activo = !!limpiarEstilo(estilo);

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={activo ? "Estilo del mensaje (activo)" : "Estilo del mensaje"}
                    title="Estilo del mensaje"
                    className={cn(
                        "ss-redondo relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full transition-[background-color,transform] duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] motion-reduce:hover:scale-100",
                        activo ? "text-white" : "text-[#B7A6FF]",
                    )}
                    style={{ background: activo ? "#7C5CFF33" : "#7C5CFF14", boxShadow: `inset 0 0 0 1px ${activo ? "#7C5CFF" : "#7C5CFF55"}` }}
                >
                    <Palette className="h-[18px] w-[18px]" aria-hidden="true" />
                    {activo && (
                        <span
                            className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#7C5CFF] shadow-[0_0_0_2px_#0c0e22,0_0_8px_#7C5CFF]"
                            aria-hidden="true"
                            data-testid="punto-estilo"
                        />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="top"
                sideOffset={10}
                collisionPadding={12}
                className="z-[130] w-[min(360px,calc(100vw-24px))] rounded-[22px] border border-white/[0.08] bg-[rgba(12,14,34,.92)] p-0 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_24px_60px_rgba(0,0,0,.5)] backdrop-blur-[20px]"
            >
                <div className="flex max-h-[min(72vh,640px)] flex-col">
                    <div className="border-b border-white/[0.06] px-4 pb-3 pt-4">
                        <p className="text-[15px] font-semibold">Estilo del mensaje</p>
                        <p className="text-[12px] text-white/60">Se aplica al próximo mensaje que envíes.</p>
                        <div className="mt-3 rounded-[16px] bg-[radial-gradient(120%_120%_at_0%_0%,#1a1440,#0b0d1a_70%)] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
                            <Rotulo>Vista previa</Rotulo>
                            <div className="mt-2 flex justify-end">
                                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#7C5CFF] px-3.5 py-2.5 text-white">
                                    <MensajeFormateado formato={{ v: 1, estilo: estilo ?? undefined }} textoPlano="Así se verá tu mensaje" mio />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                        <PanelEstilo
                            compacto
                            estilo={estilo}
                            onChange={onChange}
                            secciones={["fuente", "tamano", "color", "marco", "fondo", "animacionTexto"]}
                        />
                    </div>
                    <div className="flex gap-2 border-t border-white/[0.06] p-3">
                        <button
                            type="button"
                            onClick={() => onChange(null)}
                            disabled={!activo}
                            className="ss-redondo min-h-10 flex-1 cursor-pointer rounded-full px-4 text-[13px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] transition-colors duration-200 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            Quitar estilo
                        </button>
                        <button
                            type="button"
                            onClick={() => setAbierto(false)}
                            className="ss-redondo min-h-10 flex-1 cursor-pointer rounded-full px-4 text-[13px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
                            style={{ background: "#7C5CFF", boxShadow: "0 6px 18px #7C5CFF55" }}
                        >
                            Listo
                        </button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default BotonEstiloRapido;
