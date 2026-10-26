/**
 * Contrato común de la Ola 1025U (Mundo de los avatares con Hermes3D): quién es un habitante del mundo y cómo
 * lo nombran el mundo (U1), la ficha del agente (U2), la red (U3) y los sueños (U4). Solo tipos y funciones
 * puras: sin «use client» y sin `node:*`, porque lo importan componentes de cliente.
 */
import type { TipoDueno } from "@/lib/astraura-bots/tipos";

/** De dónde sale el habitante: una personalidad de la cuenta, un bot de una entidad o un agente de grupo. */
export type OrigenAgenteMundo = "personalidad" | "bot" | "agente-grupo";

/** Referencia estable a un agente del mundo. Todo agente del mundo es una IA: `esBotIA` es siempre `true`. */
export interface AgenteMundoRef {
  /** Id único en el mundo: `<origen>:<id de origen>`. */
  id: string;
  origen: OrigenAgenteMundo;
  /** Id en su almacén de origen (personalidad, bot o agente de grupo). */
  idOrigen: string;
  nombre: string;
  /** Quién responde por él (Dualidad Cuenta/Perfil). */
  dueno: { tipo: TipoDueno | "cuenta"; id: string };
  /** Referencia de avatar (glb, imagen o ADN), si la tiene. */
  avatarRef?: string;
  esBotIA: true;
}

export function idAgenteMundo(origen: OrigenAgenteMundo, idOrigen: string): string {
  return `${origen}:${idOrigen}`;
}

export function crearAgenteMundoRef(p: Omit<AgenteMundoRef, "id" | "esBotIA">): AgenteMundoRef {
  return { ...p, id: idAgenteMundo(p.origen, p.idOrigen), esBotIA: true };
}
