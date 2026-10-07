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
import type { GovernanceMode } from "./types";

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

// Las propuestas (tipos + `proposalForChange`) viven en `./propuestas` (puro, sin «use client»).
export { proposalForChange } from "./propuestas";
export type { ChangeRequest, ProposalDraft } from "./propuestas";
