// StarSeed · Propuestas de gobernanza: funciones PURAS (sin React, sin Supabase, sin «use client»).
// Se separan de `permissions.ts` (módulo «use client») para que el servidor y `src/lib/mando`
// puedan construir propuestas sin arrastrar un módulo cliente al bundle de servidor
// (lo vigila src/lib/__tests__/mando-voces-servidor.test.ts). `permissions.ts` las reexporta.

import type { CommandSpec, GovernanceMode } from "./types";

// Descripción de un cambio solicitado, agnóstica a la UI.
// `kind` mapea 1:1 con los COMMAND_TYPES del motor.
export type ChangeRequest = {
  kind: "set_config" | "set_permission" | "set_governance" | "add_member";
  // Pares clave/valor del comando (se serializan a strings para el composer).
  key?: string; // set_config
  value?: string; // set_config / set_permission
  permission?: string; // set_permission
  mode?: GovernanceMode; // set_governance
  profileId?: string; // add_member
  role?: string; // add_member
  // Metadatos opcionales para enriquecer título/descripción.
  label?: string; // etiqueta legible del cambio (p.ej. "el tema del grupo")
  note?: string; // contexto adicional para la descripción
};

export type ProposalDraft = {
  command: CommandSpec;
  title: string;
  description: string;
  // payload en strings, tal como lo consume ProposalComposer.
  payload: Record<string, string>;
};

// Construye un CommandSpec + título/descripción por defecto para un cambio,
// listo para pasarlo al composer (modo democrático = cambio vía propuesta).
export function proposalForChange(
  scope: string,
  scopeRef: string | null | undefined,
  change: ChangeRequest,
): ProposalDraft {
  const ref = scopeRef ?? "";
  const base: Record<string, string> = { scope };
  if (ref) base.scope_ref = ref;

  let title = "Propuesta de cambio";
  let description = "";
  let payload: Record<string, string> = { ...base };

  switch (change.kind) {
    case "set_config": {
      payload = { ...base, key: change.key ?? "", value: change.value ?? "" };
      const what = change.label || change.key || "una configuración";
      title = "Ajustar " + what;
      description =
        "Propuesta para ajustar la configuración «" + (change.key ?? what) + "»" +
        (change.value ? " al valor «" + change.value + "»" : "") +
        " en este " + scopeLabel(scope) + "." +
        (change.note ? "\n\n" + change.note : "") +
        democraticNote();
      break;
    }
    case "set_permission": {
      payload = { ...base, permission: change.permission ?? "", value: change.value ?? "" };
      const what = change.label || change.permission || "un permiso";
      title = "Definir permiso: " + what;
      description =
        "Propuesta para establecer el permiso «" + (change.permission ?? what) + "»" +
        (change.value ? " a «" + change.value + "»" : "") +
        " en este " + scopeLabel(scope) + "." +
        (change.note ? "\n\n" + change.note : "") +
        democraticNote();
      break;
    }
    case "set_governance": {
      payload = { ...base, mode: change.mode ?? "democratic" };
      const target = change.mode === "hierarchical" ? "jerárquico" : "democrático";
      title = "Cambiar modo de gobernanza a " + target;
      description =
        "Propuesta para cambiar el modo de gobernanza de este " + scopeLabel(scope) + " a «" + target + "»." +
        (change.note ? "\n\n" + change.note : "") +
        democraticNote();
      break;
    }
    case "add_member": {
      payload = {
        ...base,
        profileId: change.profileId ?? "",
        role: change.role ?? "member",
      };
      const who = change.label || change.profileId || "un miembro";
      title = "Añadir miembro" + (change.role ? " (" + change.role + ")" : "");
      description =
        "Propuesta para incorporar a «" + who + "»" +
        (change.role ? " con rol «" + change.role + "»" : "") +
        " a este " + scopeLabel(scope) + "." +
        (change.note ? "\n\n" + change.note : "") +
        democraticNote();
      break;
    }
  }

  return {
    command: { type: change.kind, payload: { ...payload } },
    title,
    description,
    payload,
  };
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "group":
      return "grupo";
    case "page":
      return "página";
    case "community":
      return "comunidad";
    case "account":
      return "cuenta";
    case "global":
      return "espacio global";
    default:
      return "contexto";
  }
}

function democraticNote(): string {
  return "\n\nLa opción democrática siempre está disponible: este cambio se aplicará automáticamente si la mayoría lo aprueba.";
}
