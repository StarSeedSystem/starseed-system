"use client";

/** «Fusionar» de cada cerebro (componente de partida, CB1013A). Lo sustituye la tarea CB1013B–D (§4). */

import type { Brain } from "@/lib/brains/brains";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnConstruccion } from "@/components/cerebro/en-construccion";

export interface FusionarDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

export default function FusionarDialog({ open, onOpenChange, cerebro }: FusionarDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Fusionar · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>Esta opción llega con la ola CB1013.</DialogDescription>
                </DialogHeader>
                <EnConstruccion titulo="Fusionar" tarea="CB1013B–D" queHara="Mezclará en este cerebro todas las memorias y configuraciones de los cerebros que elijas, con vista previa, copia de seguridad descargada antes de escribir y la opción de quitar los fusionados." />
            </DialogContent>
        </Dialog>
    );
}
