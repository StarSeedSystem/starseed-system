"use client";
/**
 * Perfil del agente en la red (Ola 1025U · U3). Esqueleto del contrato: la ficha del agente (U2) lo monta en su
 * pestaña «Perfil y red»; U3 lo llena (privado o vinculado a grupos, comunidades y páginas, dispositivos
 * virtuales y la etiqueta de bot de IA).
 */
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";

export interface PerfilAgenteRedProps {
  agente: AgenteMundoRef;
}

export function PerfilAgenteRed({ agente }: PerfilAgenteRedProps) {
  return <section aria-label={`Perfil en la red de ${agente.nombre}`} data-testid="perfil-agente-red" />;
}
