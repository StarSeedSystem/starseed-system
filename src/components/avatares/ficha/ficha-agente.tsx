"use client";
/**
 * Ficha del agente del mundo (Ola 1025U · U2). Esqueleto del contrato: el mundo (U1) la abre al elegir un
 * habitante; U2 la llena con identidad, cerebro, capas, percepción, motores, herramientas y perfil en la red.
 */
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";

export interface FichaAgenteProps {
  agente: AgenteMundoRef;
  alCerrar?: () => void;
}

export function FichaAgente({ agente }: FichaAgenteProps) {
  return (
    <section aria-label={`Ficha de ${agente.nombre}`} data-testid="ficha-agente" className="text-sm text-white/80">
      <p className="font-headline text-base text-white">{agente.nombre}</p>
    </section>
  );
}
