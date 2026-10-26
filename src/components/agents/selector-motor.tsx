"use client";

/*
 * ════════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · Selector de Motor [P5]
 * ---------------------------------------------------------------------------
 * Muestra el motor sugerido para un agente usando `elegirMotor`, por qué
 * se sugiere y dónde corre. Los motores sin adaptador marcan "próximamente".
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";

import { elegirMotor, MotorAgentes, MOTORES_AGENTES } from "@/lib/agents/motores/tipos";
import type { Agent } from "@/lib/agents/model";

export interface SelectorMotorProps {
  /** Agente para el cual elegir un motor. */
  agente: Agent;
  /** Necesidades opcionales que dirigen la elección del motor. */
  necesidades?: {
    ejecucionLargaConReanudacion?: boolean;
    salidaConEsquema?: boolean;
    traspasos?: boolean;
    equipoConMemoriaCompartida?: boolean;
    correrEnNeuronaNode?: boolean;
  };
  /** Llamado al cambiar la elección del motor. */
  onMotorCambiar?: (motor: MotorAgentes) => void;
}

/** Estado interno: motor actual elegido. */
function useMotorSeleccionado(
  agente: Agent,
  necesidades: SelectorMotorProps["necesidades"] | undefined,
): MotorAgentes {
  const motor = elegirMotor(agente, necesidades ?? {});
  return motor;
}

/* ── Ficha de motor · renderizado ─────────────────────────────────────────── */

function renderFichaMotor(motor: MotorAgentes) {
  const ficha = MOTORES_AGENTES[motor];
  if (!ficha) return null;

  const dondeCorreLabels = {
    "navegador": "Navegador (SSR-safe)",
    "neurona-node": "Neurona Node.js",
    "neurona-python": "Neurona Python",
  };

  return (
    <Card className="p-4 space-y-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Avatar className="h-5 w-5">
            {motor.charAt(0).toUpperCase() + motor.slice(1)}
          </Avatar>
          {ficha.nombre}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="font-medium text-muted-foreground">Lenguaje:</span>
            <span>{ficha.lenguaje === "ts" ? "TypeScript" : "Python"}</span>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Dónde corre:</span>
            <span>{dondeCorreLabels[ficha.dondeCorre]}</span>
          </div>
        </div>

        <div>
          <span className="font-medium text-muted-foreground">Aportes:</span>
          <div className="grid grid-cols-2 gap-1">
            {ficha.aportes.map((aporte) => (
              <Badge key={aporte} variant="outline" className="text-[10px]">
                {aporte}
              </Badge>
            ))}
          </div>
        </div>

        {ficha.nota && (
          <p className="text-xs text-muted-foreground">{ficha.nota}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Componente principal ──────────────────────────────────────────────────── */

export function SelectorMotor({ agente, necesidades, onMotorCambiar }: SelectorMotorProps) {
  const motor = useMotorSeleccionado(agente, necesidades ?? {});

  return (
    <Card className="p-4 space-y-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Avatar className="h-5 w-5">
            {agente.name.charAt(0).toUpperCase() + agente.name.slice(1)}
          </Avatar>
          Motor para {agente.name}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Renderiza la ficha completa del motor elegido */}
        {renderFichaMotor(motor)}

        {/* Por qué se sugiere este motor */}
        <div>
          <span className="font-medium text-muted-foreground">¿Por qué este motor?</span>
          {(() => {
            if (necesidades?.ejecucionLargaConReanudacion) {
              return "Se sugiere LangGraph por ejecución larga con reanudación.";
            }
            if (necesidades?.salidaConEsquema) {
              return "Se sugiere Pydantic AI por salida con esquema.";
            }
            if (necesidades?.traspasos) {
              return "Se sugiere OpenAI Agents por traspasos entre roles.";
            }
            if (necesidades?.equipoConMemoriaCompartida) {
              return "Se sugiere Agno por equipo con memoria compartida.";
            }
            if (necesidades?.correrEnNeuronaNode) {
              return "Se sugiere Mastra por correr en neurona Node.";
            }
            return "Motor nativo por defecto (sin dependencias).";
          })()}
        </div>

        {/* Acción: cambiar motor manualmente */}
        {onMotorCambiar && (
          <Button
            variant="outline"
            onClick={() => onMotorCambiar(motor)}
            className="mt-2 text-sm"
          >
            Cambiar a otro motor
          </Button>
        )}
      </CardContent>
    </Card>
  );
}