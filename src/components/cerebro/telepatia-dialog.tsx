"use client";

/** «Telepatía» de cada cerebro (componente de partida, CB1013A). Lo sustituye la tarea CB1013E–G (§5). */

import type { Brain } from "@/lib/brains/brains";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnConstruccion } from "@/components/cerebro/en-construccion";

export interface TelepatiaDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

export default function TelepatiaDialog({ open, onOpenChange, cerebro }: TelepatiaDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Telepatía · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>Esta opción llega con la ola CB1013.</DialogDescription>
                </DialogHeader>
                <EnConstruccion titulo="Telepatía" tarea="CB1013E–G" queHara="Vinculará este cerebro con otro tuyo, con un grupo, una comunidad o una cuenta externa, sin mezclarlos: eliges qué memorias, carpetas y configuraciones se sincronizan, en qué dirección y con qué acceso." />
            </DialogContent>
        </Dialog>
    );
}
