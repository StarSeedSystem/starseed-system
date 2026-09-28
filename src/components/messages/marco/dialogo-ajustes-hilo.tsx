"use client";

/**
 * Diálogo «Ajustes del chat» / «Ajustes de este correo» (2026-09-28): envuelve el formulario
 * por hilo de A3a (`AjustesHiloPanel`, contrato C2) para abrirlo desde el menú de una fila sin
 * tener el chat abierto. En móvil ocupa la pantalla entera.
 */

import { Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AjustesHiloPanel } from "@/components/messages/info/ajustes-hilo";
import type { TipoHilo } from "@/lib/mensajeria/ajustes-tipos";

export interface DialogoAjustesHiloProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    hiloId: string | null;
    tipo: TipoHilo;
    titulo: string;
}

const TEXTOS: Record<TipoHilo, { titulo: string; ayuda: string }> = {
    dm: { titulo: "Ajustes del chat", ayuda: "Solo cambian lo que ves tú. Lo que no toques sigue los ajustes generales." },
    grupo: { titulo: "Ajustes del grupo", ayuda: "Solo cambian lo que ves tú. Lo que no toques sigue los ajustes generales." },
    correo: { titulo: "Ajustes de este correo", ayuda: "Personales: silenciar, fijar, archivar o etiquetar solo cambia tu bandeja." },
};

export function DialogoAjustesHilo({ open, onOpenChange, hiloId, tipo, titulo }: DialogoAjustesHiloProps) {
    const t = TEXTOS[tipo];
    return (
        <Dialog open={open && !!hiloId} onOpenChange={onOpenChange}>
            <DialogContent className="max-md:left-0 max-md:top-0 max-md:h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none md:max-w-xl md:max-h-[86vh] border-white/10 bg-[rgba(10,12,28,0.96)] p-0 backdrop-blur-2xl sm:rounded-[24px]">
                <div className="flex h-full min-h-0 flex-col">
                    <DialogHeader className="shrink-0 border-b border-white/[0.08] px-5 pb-4 pt-5 pr-14 text-left">
                        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                            <Settings2 className="h-4 w-4 text-[#7C5CFF]" />
                            {t.titulo}
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-white/60">
                            <span className="font-medium text-white/85">{titulo}</span> · {t.ayuda}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                        {hiloId && <AjustesHiloPanel hiloId={hiloId} tipo={tipo} />}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default DialogoAjustesHilo;
