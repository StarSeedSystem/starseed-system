import { createClient } from "@/utils/supabase/client";

export type EntityRole = "owner" | "admin" | "editor" | "viewer";
export type EntityType = "profile" | "page" | "group";

export interface EntityRoleRecord {
    id: string;
    account_id: string;
    entity_type: EntityType;
    entity_id: string;
    role: EntityRole;
    permissions: Record<string, any>;
}

export async function hasPermission(
    entityType: EntityType, 
    entityId: string, 
    requiredRole: EntityRole = "viewer"
): Promise<boolean> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
        .from("os_entity_roles")
        .select("role")
        .eq("account_id", user.id)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .maybeSingle();

    if (error || !data) return false;

    const roleHierarchy: Record<EntityRole, number> = {
        owner: 4, admin: 3, editor: 2, viewer: 1
    };

    return (roleHierarchy[data.role as EntityRole] || 0) >= (roleHierarchy[requiredRole] || 0);
}

export async function assignRole(
    targetAccountId: string,
    entityType: EntityType,
    entityId: string,
    role: EntityRole,
    permissions: Record<string, any> = {}
) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No autenticado");
    
    const { error } = await supabase.from("os_entity_roles").upsert({
        account_id: targetAccountId,
        entity_type: entityType,
        entity_id: entityId,
        role,
        permissions,
        updated_at: new Date().toISOString()
    }, { onConflict: "account_id,entity_type,entity_id" });

    if (error) throw new Error(error.message);
    return true;
}

export async function listMyEntities() {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_entity_roles")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) return [];
    return data as EntityRoleRecord[];
}
