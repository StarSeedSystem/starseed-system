"use client";

/**
 * BotonCompartirVivo (contrato C6) — el acceso del compositor a las apps en vivo.
 *   · modo "boton"     → botón redondo con el icono Radio (junto al clip de adjuntar).
 *   · modo "item-menu" → fila completa para un menú vertical de adjuntar.
 * Abre el `SelectorVivoDialog` (cargado a demanda: el chat no paga su peso hasta que se usa).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Radio } from "lucide-react";
import type { DmAttachment } from "@/lib/messages/dm";

const SelectorVivoDialog = dynamic(
    () => import("@/components/messages/vivo/selector-vivo").then((m) => m.SelectorVivoDialog),
    { ssr: false },
);

export interface BotonCompartirVivoProps {
    hiloId: string;
    onEnviar: (r: { body: string; attachments: DmAttachment[] }) => void | Promise<void>;
    modo?: "boton" | "item-menu";
}

export function BotonCompartirVivo({ hiloId, onEnviar, modo = "boton" }: BotonCompartirVivoProps) {
    const [abierto, setAbierto] = useState(false);
    const [usado, setUsado] = useState(false);

    const abrir = () => {
        setUsado(true);
        setAbierto(true);
    };

    return (
        <>
            {modo === "item-menu" ? (
                <button
                    type="button"
                    onClick={abrir}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                >
                    <span
                        aria-hidden="true"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#B7A6FF]"
                        style={{ background: "#7C5CFF1f", boxShadow: "inset 0 0 0 1px #7C5CFF66" }}
                    >
                        <Radio className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-white">App en vivo</span>
                        <span className="block text-[12px] text-white/60">Pizarra, escritorio, sala o web para usar juntos</span>
                    </span>
                </button>
            ) : (
                <button
                    type="button"
                    onClick={abrir}
                    title="Compartir una app en vivo"
                    aria-label="Compartir una app en vivo"
                    className="ss-redondo grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-[#B7A6FF] transition-[background-color,transform] duration-200 hover:scale-105 hover:bg-[#7C5CFF]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] motion-reduce:hover:scale-100"
                    style={{ background: "#7C5CFF14", boxShadow: "inset 0 0 0 1px #7C5CFF55" }}
                >
                    <Radio className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
            )}
            {usado && (
                <SelectorVivoDialog open={abierto} onOpenChange={setAbierto} hiloId={hiloId} onEnviar={onEnviar} />
            )}
        </>
    );
}

export default BotonCompartirVivo;
