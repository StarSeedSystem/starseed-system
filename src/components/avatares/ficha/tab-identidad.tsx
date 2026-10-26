"use client";
/** Pestaña «Identidad» de la ficha (Ola 1025U · U2): quién es el agente, de quién es y su Desarrollo. */
import { Bot, Fingerprint, UserRound } from "lucide-react";
import type { RecuerdoBot } from "@/lib/astraura-bots/memoria-bot";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import type { ConfigAgente } from "@/lib/avatares/agente/config-agente";
import { vistaDesarrollo } from "@/lib/avatares/agente/desarrollo";
import { SeccionDesarrollo } from "./seccion-desarrollo";
import { Bloque, InsigniaBotIA } from "./ui-ficha";

export const ETIQUETA_DUENO: Record<string, string> = {
  cuenta: "Tu cuenta", perfil: "Perfil", grupo: "Grupo", comunidad: "Comunidad", pagina: "Página",
};

export function describirOrigen(a: AgenteMundoRef): string {
  if (a.origen === "personalidad") return "Personalidad de tu cuenta";
  if (a.origen === "agente-grupo") return "Agente de grupo";
  return `Bot de ${(ETIQUETA_DUENO[a.dueno.tipo] ?? "entidad").toLowerCase()}`;
}

export interface TabIdentidadProps {
  agente: AgenteMundoRef;
  config: ConfigAgente;
  recuerdos: RecuerdoBot[];
  ahora: number;
  alDeshacer: (idPaso: string) => void;
}

export function TabIdentidad({ agente, config, recuerdos, ahora, alDeshacer }: TabIdentidadProps) {
  const vista = vistaDesarrollo({ recuerdos, agente, config, ahora });
  return (
    <div className="space-y-3">
      <Bloque icono={Fingerprint} titulo="Quién es">
        <dl className="grid min-w-0 gap-x-3 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-xs text-muted-foreground">Nombre</dt>
          <dd className="min-w-0 break-words text-foreground">{agente.nombre}</dd>
          <dt className="text-xs text-muted-foreground">Tipo</dt>
          <dd className="min-w-0 break-words text-foreground">{describirOrigen(agente)}</dd>
          <dt className="text-xs text-muted-foreground">Responde por él</dt>
          <dd className="min-w-0 break-words text-foreground">
            {ETIQUETA_DUENO[agente.dueno.tipo] ?? agente.dueno.tipo} <span className="text-xs text-muted-foreground">({agente.dueno.id})</span>
          </dd>
          <dt className="text-xs text-muted-foreground">Identificador</dt>
          <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">{agente.id}</dd>
        </dl>
      </Bloque>

      <Bloque icono={Bot} titulo="Es una IA">
        <p className="flex min-w-0 flex-wrap items-center gap-2 break-words text-sm text-foreground">
          <InsigniaBotIA /> No es una persona: su ficha le pide decir que es una IA si se lo preguntan.
        </p>
      </Bloque>

      <SeccionDesarrollo vista={vista} ahora={ahora} alDeshacer={alDeshacer} />

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
        Lo que cambies en esta ficha se guarda en este aparato.
      </p>
    </div>
  );
}
