"use client";

/**
 * Selector del MOTOR de un agente (ola 1023A · Biblioteca y Genesis).
 * ---------------------------------------------------------------------------
 * Muestra el motor elegido, por qué se sugiere y dónde corre. Los motores que
 * todavía no tienen adaptador salen «Próximamente» con su motivo a la vista;
 * no se finge que corren. Los modelos van siempre por el enrutador propio y
 * las trazas de terceros quedan apagadas (contrato de la ola 1023A).
 *
 * Solo pinta datos: la elección es pura (`elegirMotor`) y no toca red ni disco.
 */

import * as React from "react";
import { Check, Clock, Cpu, MapPin, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ENRUTADOR_PROPIO,
  MOTORES,
  SIN_TRAZAS,
  elegirMotor,
  type AgenteParaMotor,
  type Motor,
  type MotorId,
} from "@/lib/agents/motores/elegir-motor";

export interface SelectorMotorProps {
  /** Agente de la Biblioteca cuya ficha se está mostrando. */
  agente: AgenteParaMotor;
  /** Elección guardada; si falta, se usa la sugerencia. */
  motor?: MotorId;
  /** Avisa del cambio para que la ficha lo persista. */
  onCambiar?: (motor: MotorId) => void;
  className?: string;
}

function etiquetaEstado(motor: Motor, elegido: boolean, sugerido: boolean): string {
  if (!motor.disponible) return "Próximamente";
  if (elegido) return "Elegido";
  if (sugerido) return "Sugerido";
  return "Disponible";
}

export function SelectorMotor({ agente, motor, onCambiar, className }: SelectorMotorProps) {
  const sugerencia = React.useMemo(() => elegirMotor(agente), [agente]);
  const [elegido, setElegido] = React.useState<MotorId>(motor ?? sugerencia.motor.id);

  React.useEffect(() => {
    setElegido(motor ?? sugerencia.motor.id);
  }, [motor, sugerencia.motor.id]);

  const motorElegido = MOTORES.find((m) => m.id === elegido) ?? sugerencia.motor;
  const sugerido = sugerencia.motor.id;

  const elegir = (elegirMotorId: MotorId) => {
    const destino = MOTORES.find((m) => m.id === elegirMotorId);
    if (!destino?.disponible) return;
    setElegido(destino.id);
    onCambiar?.(destino.id);
  };

  return (
    <section
      data-testid="selector-motor"
      aria-labelledby="selector-motor-titulo"
      className={cn("flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4", className)}
    >
      <header className="flex items-start gap-2">
        <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
        <div className="min-w-0">
          <h3 id="selector-motor-titulo" className="text-sm font-semibold text-foreground">
            Motor del agente
          </h3>
          <p className="text-xs leading-snug text-muted-foreground">
            Elige dónde corre. Los modelos van siempre por el enrutador propio, sea cual sea el motor.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] px-3 py-2.5">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
          <Check className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
          Motor elegido: <span data-testid="motor-elegido">{motorElegido.nombre}</span>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100">
            {motorElegido.disponible ? "Listo" : "Próximamente"}
          </span>
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{motorElegido.dondeCorre}</span>
        </p>
        {!motorElegido.disponible && motorElegido.motivoNoDisponible && (
          <p className="mt-1 text-[11px] leading-snug text-amber-200/90">
            {motorElegido.motivoNoDisponible}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          {sugerencia.ideal ? "Mejor encaje cuando llegue" : "Sugerencia"}
          {sugerencia.ideal && (
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
              {sugerencia.ideal.nombre} · Próximamente
            </span>
          )}
        </p>
        <ul data-testid="motivos-sugerencia" className="mt-1 space-y-0.5 pl-5 text-[11px] leading-snug text-muted-foreground">
          {sugerencia.motivos.map((motivo) => (
            <li key={motivo} className="list-disc">{motivo}</li>
          ))}
        </ul>
      </div>

      <div role="radiogroup" aria-label="Motores de agentes" className="flex flex-col gap-2">
        {MOTORES.map((m) => {
          const esElegido = m.id === elegido;
          const esSugerido = m.id === sugerido || m.id === sugerencia.ideal?.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={esElegido}
              aria-disabled={!m.disponible}
              disabled={!m.disponible}
              onClick={() => elegir(m.id)}
              className={cn(
                "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                m.disponible ? "cursor-pointer" : "cursor-not-allowed opacity-70",
                esElegido
                  ? "border-cyan-400/40 bg-cyan-500/[0.08]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20",
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{m.nombre}</span>
                <span className="text-[10px] text-muted-foreground">{m.lenguaje}</span>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                    m.disponible
                      ? esElegido
                        ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                        : "border-white/10 bg-white/5 text-muted-foreground"
                      : "border-amber-400/30 bg-amber-500/10 text-amber-200",
                  )}
                >
                  {!m.disponible && <Clock className="h-2.5 w-2.5" aria-hidden />}
                  {etiquetaEstado(m, esElegido, esSugerido)}
                </span>
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{m.fuerteEn}</span>
              <span className="mt-1 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground/80">
                <MapPin className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden />
                <span>{m.dondeCorre}</span>
              </span>
              {!m.disponible && m.motivoNoDisponible && (
                <span
                  data-testid={`motivo-${m.id}`}
                  className="mt-1 block text-[10px] leading-snug text-amber-200/80"
                >
                  {m.motivoNoDisponible}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <footer className="space-y-1 border-t border-white/10 pt-2 text-[10px] leading-snug text-muted-foreground/80">
        <p>{ENRUTADOR_PROPIO}</p>
        <p>{SIN_TRAZAS}</p>
      </footer>
    </section>
  );
}

export default SelectorMotor;
