"use client";

/** Separador de día entre burbujas: «Hoy», «Ayer», «lunes 21 de septiembre». */
import { etiquetaDia } from "@/components/messages/dm/utilidades-hilo";

export function SeparadorDia({ fecha, ahora }: { fecha: string; ahora?: Date }) {
    const etiqueta = etiquetaDia(fecha, ahora);
    if (!etiqueta) return null;
    return (
        <div className="flex justify-center pb-1 pt-4" role="separator" aria-label={etiqueta}>
            <span
                className="rounded-full px-3 py-1 text-[11.5px] font-medium text-white/75"
                style={{
                    background: "rgba(12,14,34,.62)",
                    backdropFilter: "blur(14px) saturate(140%)",
                    WebkitBackdropFilter: "blur(14px) saturate(140%)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), 0 4px 14px rgba(0,0,0,.25)",
                }}
            >
                {etiqueta}
            </span>
        </div>
    );
}

export default SeparadorDia;
