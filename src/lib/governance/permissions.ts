"use client";

// StarSeed · Permisos de gobernanza ligados a páginas/grupos/comunidades reales.
// Conecta el modo (democrático/jerárquico) con el rol real del usuario
// (page_members / group_members) y construye propuestas para cualquier cambio.
//
// Regla rectora (ontocracia): la opción democrática SIEMPRE está disponible,
// incluso en contextos jerárquicos. En modo democrático, todo cambio de
// configuración / permisos / membresía / gobernanza pasa por una propuesta
// que se ejecuta al aprobarse. En modo jerárquico, un admin/owner puede actuar
// directamente, pero cualquiera puede abrir igualmente una propuesta a votación.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getConfig } from "./config";
import { roleFromMemberships } from "./membership";
import type { CommandSpec, GovernanceMode } from "./types";

// Roles que pueden actuar directamente en modo jerárquico.
const ADMIN_ROLES = new Set(["admin", "owner", "moderator"]);

export type GovernanceContext = {
  mode: GovernanceMode;
  params: Record<string, unknown>;
  role: string | null;
  isAdmin: boolean;
  isMember: boolean;
  userId: string | null;
  // En jerárquico + admin → puede aplicar el cambio directamente.
  // En democrático (o no-admin) → debe proponerlo a votación.
  canActDirectly: boolean;
  loading: boolean;
  reload: () => Promise<void>;
};

// Lee el rol del usuario en un contexto real (best-effort, tolerante a errores).
// FUENTE PRINCIPAL: `os_memberships` por `group_slug` (= scopeRef) y `user_id`, donde
// se registra la membresía real y su rol (admin/owner/miembro…). Esto habilita "actuar
// directamente" en modo jerárquico para admins/owners reales.
// FALLBACK (aditivo): si no hay fila en os_memberships, se usa el rol histórico
// group_members(role) por member; page/community → page_members(role) por profile_id.
export async function roleOf(
  scope: string,
  scopeRef: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  const ref = scopeRef ?? null;
  if (!ref || !userId) return null;

  // Principal: rol desde os_memberships (por slug).
  const primaryRole = await roleFromMemberships(ref, userId);
  if (primaryRole) return primaryRole;

  // Fallback histórico.
  const supabase = createClient();
  try {
    if (scope === "group") {
      const { data } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", ref)
        .eq("member", userId)
        .maybeSingle();
      return (data?.role as string) ?? null;
    }
    if (scope === "page" || scope === "community") {
      // El usuario puede estar guardado por profile_id (= user_id en muchos
      // esquemas) o vía profiles.user_id. Probamos la vía directa primero.
      const { data: direct } = await supabase
        .from("page_members")
        .select("role")
        .eq("page_id", ref)
        .eq("profile_id", userId)
        .maybeSingle();
      if (direct?.role) return direct.role as string;

      // Fallback: resolver profile_id desde profiles.user_id.
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        const profileId = (prof as any)?.id;
        if (profileId) {
          const { data: viaProfile } = await supabase
            .from("page_members")
            .select("role")
            .eq("page_id", ref)
            .eq("profile_id", profileId)
            .maybeSingle();
          return (viaProfile?.role as string) ?? null;
        }
      } catch {
        /* perfil no resoluble */
      }
      return null;
    }
  } catch {
    /* sin sesión / error transitorio */
  }
  return null;
}

// Hook principal: carga config (modo + params) y el rol real del usuario.
export function useGovernanceContext(
  scope: string,
  scopeRef?: string,
): GovernanceContext {
  const [mode, setMode] = useState<GovernanceMode>("democratic");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);

      const cfg = await getConfig(scope, scopeRef || null);
      setMode(cfg.mode);
      setParams(cfg.params || {});

      const r = await roleOf(scope, scopeRef || null, uid);
      setRole(r);
    } catch {
      /* SSR-guard / sin sesión */
    }
    setLoading(false);
  }, [scope, scopeRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reload();
  }, [reload]);

  const isAdmin = !!role && ADMIN_ROLES.has(role);
  const isMember = !!role;
  // El corazón del sistema: sólo se actúa directo en jerárquico siendo admin.
  // En cualquier otro caso (democrático, o no-admin) → propuesta.
  const canActDirectly = mode === "hierarchical" && isAdmin;

  return {
    mode,
    params,
    role,
    isAdmin,
    isMember,
    userId,
    canActDirectly,
    loading,
    reload,
  };
}

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
