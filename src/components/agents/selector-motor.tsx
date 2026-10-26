"use client";

/**
 * StarSeed OS — Agentes · selector de motor.
 * En la ficha de cada agente enseña el motor elegido, por qué se sugiere y dónde
 * corre; los motores sin adaptador salen como «próximamente» con su motivo. La
 * sugerencia la decide `elegirMotor` (módulo puro del mismo nombre). Aún no se
 * persiste: es controlado (`value` + `onChange`) hasta que otra capa lo cablee.
 */

import * as React from "react";
import { Cpu } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/agents/model";
import { MOTORES, elegirMotor, motorPorId, type MotorId } from "@/lib/agents/motores/selector-motor";

export interface SelectorMotorProps {
  agent?: Pick<Agent, "capabilities"> | null;
  value?: MotorId | null;
  onChange?: (id: MotorId) => void;
  /** Adaptadores ya instalados; el resto se pinta «próximamente». */
  adaptadores?: readonly MotorId[];
  className?: string;
}

export function SelectorMotor({
  agent,
  value,
  onChange,
  adaptadores = [],
  className,
}: SelectorMotorProps) {
  const sugerencia = elegirMotor(agent, { adaptadores });
  const [elegido, setElegido] = React.useState<MotorId>(value ?? sugerencia.id);

  React.useEffect(() => {
    if (value == null) setElegido(sugerencia.id);
  }, [sugerencia.id, value]);

  const motor = motorPorId(elegido);
  const disponible = motor.adaptador || adaptadores.includes(motor.id);
  const esSugerencia = elegido === sugerencia.id;

  return (
    <section
      className={cn("rounded-xl border border-foreground/10 bg-background/40 p-3", className)}
      aria-label="Motor del agente"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Cpu className="h-4 w-4 text-primary" aria-hidden="true" /> Motor del agente
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <span className="text-sm font-medium">{motor.nombre}</span>
        <span className="rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] text-muted-foreground">{motor.lenguaje}</span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            disponible
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-amber-400/40 bg-amber-500/10 text-amber-200",
          )}
        >
          {disponible ? "Listo" : "Próximamente"}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">Dónde corre: {motor.donde}</p>
      <p className="text-xs text-muted-foreground">Por qué: {esSugerencia ? sugerencia.motivo : motor.motivo}</p>
      {!esSugerencia && (
        <p className="text-xs text-muted-foreground">Sugerencia para este agente: {sugerencia.nombre} · {sugerencia.motivo}</p>
      )}
      {!disponible && (
        <p className="mt-1 text-xs text-amber-200/90" role="note">
          Próximamente: {motor.pendiente}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Elegir motor">
        {MOTORES.map((m) => {
          const activo = elegido === m.id;
          const listo = m.adaptador || adaptadores.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={activo}
              data-motor={m.id}
              title={listo ? m.motivo : m.pendiente}
              onClick={() => {
                setElegido(m.id);
                onChange?.(m.id);
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all duration-200",
                activo
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-foreground/10 bg-background/30 hover:border-foreground/30",
              )}
            >
              <span className="font-medium">{m.nombre}</span>
              <span className="text-[10px] text-muted-foreground">
                {listo ? "Listo" : "Próximamente"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default SelectorMotor;
