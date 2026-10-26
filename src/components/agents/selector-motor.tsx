"use client";
/* Selector de MOTOR del agente (SOP §3): motor elegido, sugerencia y dónde corre. */
import * as React from "react";
import { Check, Clock, Cpu, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/lib/agents/model";
import {
  MOTORES_AGENTES, elegirMotor,
  type DondeCorreMotor, type MotorAgentes, type NecesidadesAgentes,
} from "@/lib/agents/motores/tipos";
export const MOTORES_CON_ADAPTADOR: readonly MotorAgentes[] = ["nativo"];
export function etiquetaDondeCorre(d: DondeCorreMotor): string {
  return d === "navegador" ? "En el navegador" : d === "neurona-node" ? "En una neurona Node" : "En una neurona Python";
}
export function motivoSugerencia(n: NecesidadesAgentes): string {
  if (n.ejecucionLargaConReanudacion) return "pide ejecución larga con reanudación y memoria de estado.";
  if (n.salidaConEsquema) return "pide salidas validadas por un esquema exacto.";
  if (n.traspasos) return "pide traspasos entre roles con guardas.";
  if (n.equipoConMemoriaCompartida) return "pide un equipo de agentes con memoria compartida.";
  if (n.correrEnNeuronaNode) return "corre en la neurona Node, junto al servidor de IA.";
  return "sin necesidades especiales: motor propio, gratis primero y sin dependencias.";
}

const MOTIVO_NO_DISPONIBLE: Record<MotorAgentes, string> = {
  nativo: "El motor propio no necesita adaptador.",
  mastra: "Adaptador Mastra aún no montado en la neurona Node.",
  langgraph: "Adaptador LangGraph aún no montado en la neurona Python.",
  "pydantic-ai": "Adaptador Pydantic AI aún no montado; llega con los directores tipados.",
  "openai-agents": "Adaptador OpenAI Agents aún no montado; sus trazas de terceros irían apagadas.",
  agno: "Adaptador Agno aún no montado en AgentOS.",
};

export function motivoNoDisponible(motor: MotorAgentes): string {
  return MOTIVO_NO_DISPONIBLE[motor];
}

export interface SelectorMotorProps {
  agente: Pick<Agent, "id">;
  necesidades?: NecesidadesAgentes;
  motor?: MotorAgentes | null; // fijado a mano; si falta manda `elegirMotor`.
  onCambiarMotor?: (motor: MotorAgentes) => void;
  disponibles?: readonly MotorAgentes[];
  className?: string;
}

export function SelectorMotor({
  agente, necesidades = {}, motor = null, onCambiarMotor,
  disponibles = MOTORES_CON_ADAPTADOR, className,
}: SelectorMotorProps) {
  const [elegido, setElegido] = React.useState<MotorAgentes | null>(null);
  const sugerido = elegirMotor(agente, necesidades);
  const seleccionado = motor ?? elegido ?? sugerido;
  const ficha = MOTORES_AGENTES[seleccionado];
  function elegir(m: MotorAgentes) {
    if (!disponibles.includes(m)) return;
    setElegido(m);
    onCambiarMotor?.(m);
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--aw-line,rgba(255,255,255,0.1))]",
        "bg-[var(--aw-surface,rgba(255,255,255,0.03))] px-3 py-2.5", className,
      )}
      data-testid="selector-motor"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong,#fff)]">
          <Cpu className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> Motor del agente
        </p>
        <Badge variant="outline" className="gap-1 border-cyan-400/30 text-cyan-200" data-testid="donde-corre">
          <MapPin className="h-3 w-3" aria-hidden="true" /> {etiquetaDondeCorre(ficha.dondeCorre)}
        </Badge>
      </div>
      <p className="mt-1 text-[13px] font-medium text-[var(--aw-strong,#fff)]" data-testid="motor-elegido">
        {ficha.nombre} {seleccionado === sugerido ? <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-400" aria-label="Sugerido" /> : null}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-[var(--aw-muted,rgba(255,255,255,0.6))]" data-testid="motivo-sugerencia">
        <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
        Se sugiere {MOTORES_AGENTES[sugerido].nombre} porque {motivoSugerencia(necesidades)}
        {seleccionado !== sugerido ? ` Elegido a mano: ${ficha.nombre}.` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motor del agente">
        {(Object.keys(MOTORES_AGENTES) as MotorAgentes[]).map((m) => {
          const disponible = disponibles.includes(m);
          const activo = m === seleccionado;
          return (
            <button
              key={m} type="button" role="radio" aria-checked={activo}
              disabled={!disponible} onClick={() => elegir(m)}
              title={disponible ? MOTORES_AGENTES[m].nota : motivoNoDisponible(m)}
              data-testid={`motor-opcion-${m}`}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium",
                "transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60",
                activo
                  ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
                  : "border-[var(--aw-line,rgba(255,255,255,0.1))] text-[var(--aw-text,rgba(255,255,255,0.85))] hover:border-[var(--aw-line-strong,rgba(255,255,255,0.25))]",
              )}
            >
              {MOTORES_AGENTES[m].nombre}
              {!disponible ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300" data-testid={`motor-proximamente-${m}`}>
                  <Clock className="h-3 w-3" aria-hidden="true" /> Próximamente
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {!disponibles.includes(seleccionado) ? (
        <p className="mt-1.5 text-[10px] leading-snug text-amber-300" data-testid="aviso-proximamente">
          {ficha.nombre}: {motivoNoDisponible(seleccionado)} Los modelos seguirán saliendo por el enrutador propio.
        </p>
      ) : null}
    </div>
  );
}
