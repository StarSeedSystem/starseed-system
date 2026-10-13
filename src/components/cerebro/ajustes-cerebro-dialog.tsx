"use client";

/** «Ajustes del cerebro» de cada cerebro (componente de partida, CB1013A). Lo sustituye la tarea CB1013R–T (§8). */

import type { Brain } from "@/lib/brains/brains";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnConstruccion } from "@/components/cerebro/en-construccion";

export interface AjustesCerebroDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    onHecho?: () => void;
}

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro }: AjustesCerebroDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>Esta opción llega con la ola CB1013.</DialogDescription>
                </DialogHeader>
                <EnConstruccion titulo="Ajustes del cerebro" tarea="CB1013R–T" queHara="Configurará los medios (qué servidor hace cada capacidad y dónde se guarda), la seguridad, la privacidad, la vinculación y la sincronización del cerebro entero o de una memoria o carpeta concreta." />
            </DialogContent>
        </Dialog>
    );
}
