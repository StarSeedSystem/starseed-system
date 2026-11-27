"use client";

/**
 * Ajustes del cerebro (CB1013S, contrato §8).
 *
 * Se conserva el diálogo para quien lo abra desde fuera del hub, pero por dentro
 * usa el mismo contenido que el panel lateral común de los pilares
 * (`panel-ajustes-pilar`): General, Privacidad y permisos, Sincronía y Avanzado.
 * Así no se pierde ninguna opción de los ajustes que ya existían.
 */

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContenidoAjustesPilar } from "@/components/cerebro/panel-ajustes-pilar";
import type { Brain } from "@/lib/brains/brains";

export interface AjustesCerebroDialogProps {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  cerebro: Brain;
  /** Compatibilidad con quien ya lo abría desde el hub; el panel común no lo necesita. */
  cerebros?: Brain[];
  onHecho?: () => void;
}

export default function AjustesCerebroDialog({ open, onOpenChange, cerebro, onHecho }: AjustesCerebroDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ajustes del cerebro · «{cerebro.name}»</DialogTitle>
          <DialogDescription>
            Los mismos apartados que el panel de cada pilar: General, Privacidad y permisos, Sincronía y Avanzado.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <ContenidoAjustesPilar cerebro={cerebro} onHecho={onHecho} onCerrar={() => onOpenChange(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
