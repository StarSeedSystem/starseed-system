"use client";

/** Fila con un interruptor: toda la fila es la diana (≥ 48 px) y el texto explica qué pasa al encenderlo. */
import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props {
  etiqueta: string;
  descripcion?: ReactNode;
  marcado: boolean;
  onCambio: (v: boolean) => void;
  deshabilitado?: boolean;
  testId?: string;
}

export function FilaInterruptor({ etiqueta, descripcion, marcado, onCambio, deshabilitado, testId }: Props) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors duration-150 hover:border-amber-300/30",
        deshabilitado && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight text-amber-50">{etiqueta}</span>
        {descripcion && <span className="mt-0.5 block text-[11px] leading-snug text-amber-100/60">{descripcion}</span>}
      </span>
      <Switch
        id={id}
        checked={marcado}
        onCheckedChange={onCambio}
        disabled={deshabilitado}
        data-testid={testId}
        className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-white/20 focus-visible:ring-amber-300/70 focus-visible:ring-offset-black"
      />
    </label>
  );
}
