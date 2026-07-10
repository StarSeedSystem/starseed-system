import { createClient } from "@/utils/supabase/client";

export type EntityType = "profile" | "page" | "group";
export type EntityRole = "admin" | "editor" | "viewer" | "owner";

export interface EntityRoleRecord {
  id: string;
  account_id: string; // The user ID who has this role
  entity_type: EntityType;
  entity_id: string;
  role: EntityRole;
  granted_by: string; // The user ID who granted this role
  created_at: string;
}

/**
 * Fetches all roles where the current user is the grantee (account_id = current user)
 */
export async function getMyEntityRoles() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: "No session" };

  const { data, error } = await supabase
    .from("os_entity_roles")
    .select("*")
    .eq("account_id", session.user.id);
    
  return { data, error };
}

/**
 * Fetches all roles for an entity that the current user owns or is an admin of
 */
export async function getEntityRoles(entityType: EntityType, entityId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("os_entity_roles")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
    
  return { data, error };
}

/**
 * Grants a role to another user for a specific entity
 */
export async function grantEntityRole(
  targetAccountId: string,
  entityType: EntityType,
  entityId: string,
  role: EntityRole
) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return { error: "No session" };

  const { error } = await supabase
    .from("os_entity_roles")
    .insert({
      account_id: targetAccountId,
      entity_type: entityType,
      entity_id: entityId,
      role: role,
      granted_by: session.user.id,
    });
    
  return { ok: !error, error };
}

/**
 * Revokes a role from a user for a specific entity
 */
export async function revokeEntityRole(roleId: string) {
  const supabase = createClient();
  
  const { error } = await supabase
    .from("os_entity_roles")
    .delete()
    .eq("id", roleId);
    
  return { ok: !error, error };
}
