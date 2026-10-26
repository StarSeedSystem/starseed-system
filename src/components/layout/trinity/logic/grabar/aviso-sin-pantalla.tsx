"use client";

/**
 * Lo que se enseña cuando este navegador NO puede grabar la pantalla: el motivo en una frase, qué hacer
 * en este aparato (pasos) y los caminos que sí funcionan desde aquí. Nada de botones que no hacen nada.
 */
import { Camera, Info } from "lucide-react";
import { consejoSinPantalla, type MotivoSinPantalla } from "@/lib/grabacion/soporte";
import { BotonLogic } from "../boton-logic";

interface Props {
  motivo: MotivoSinPantalla;
  /** ¿Se puede grabar al menos con la cámara? Entonces se ofrece abajo. */
  puedeCamara: boolean;
  onAbrirCamara: () => void;
}

export function AvisoSinPantalla({ motivo, puedeCamara, onAbrirCamara }: Props) {
  const c = consejoSinPantalla(motivo);
  return (
    <div role="note" data-testid="aviso-sin-pantalla" className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.08] p-3.5">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold leading-snug text-amber-50">{c.titulo}</h4>
          <p className="mt-1 text-[12px] leading-snug text-amber-100/70">{c.motivo}</p>
        </div>
      </div>
      <ol className="mt-3 list-decimal space-y-1.5 pl-9 pr-1 text-[12px] leading-snug text-amber-50/85 marker:text-amber-300/80">
        {c.pasos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      {puedeCamara && (
        <div className="mt-3">
          <BotonLogic icono={Camera} onClick={onAbrirCamara} bloque>
            Abrir la app Cámara
          </BotonLogic>
        </div>
      )}
    </div>
  );
}
