"use client";

/** Deslizador con icono, nombre y valor; el área táctil mide 44 px de alto aunque el riel sea fino. */
import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface Props {
  icono: LucideIcon;
  etiqueta: string;
  valor: number;
  onCambio: (v: number) => void;
  testId?: string;
}

export function DeslizadorLogic({ icono: Icono, etiqueta, valor, onCambio, testId }: Props) {
  const id = useId();
  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between gap-2 px-0.5 text-[12px] font-medium text-amber-50/85">
        <span id={id} className="flex min-w-0 items-center gap-2">
          <Icono className="h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />
          <span className="truncate">{etiqueta}</span>
        </span>
        <span className="shrink-0 tabular-nums text-amber-100/70">{valor}%</span>
      </div>
      <div className="flex min-h-[44px] items-center">
        <Slider
          value={[valor]}
          max={100}
          step={1}
          onValueChange={(v: number[]) => onCambio(v[0])}
          aria-label={etiqueta}
          className="cursor-pointer [&>.relative]:bg-white/15 [&>.relative>.absolute]:bg-amber-400 [&_[role=slider]]:border-amber-300 [&_[role=slider]]:bg-amber-50"
        />
      </div>
    </div>
  );
}
