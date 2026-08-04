"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Link as LinkIcon, ShieldCheck, UserPlus, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useActiveProfile, profileKindLabel } from "@/lib/profiles/profiles";
import { grantEntityRole, getEntityRoles, revokeEntityRole, type EntityRoleRecord } from "@/lib/social/entity-roles";

export function EntityRolesPanel() {
  const confirm = useConfirm();
  const { profiles, loading } = useActiveProfile();
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [roles, setRoles] = useState<EntityRoleRecord[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    if (profiles.length > 0 && !selectedEntityId) {
      setSelectedEntityId(profiles[0].id);
    }
  }, [profiles, selectedEntityId]);

  const loadRoles = async (entityId: string) => {
    setLoadingRoles(true);
    try {
      const entity = profiles.find((p) => p.id === entityId);
      if (!entity) return;
      
      const { data, error } = await getEntityRoles(entity.kind as "profile" | "page" | "group", entityId);
      if (error) throw error;
      setRoles(data || []);
    } catch (e: any) {
      toast.error(e.message || "Error al cargar los roles de la entidad.");
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    if (selectedEntityId) {
      loadRoles(selectedEntityId);
    }
  }, [selectedEntityId]);

  const handleGrant = async () => {
    if (!newUserId.trim() || !selectedEntityId) {
      toast.error("Debes ingresar un ID de usuario válido.");
      return;
    }

    const entity = profiles.find((p) => p.id === selectedEntityId);
    if (!entity) return;

    setGranting(true);
    try {
      const { ok, error } = await grantEntityRole(
        newUserId.trim(),
        entity.kind as "profile" | "page" | "group",
        selectedEntityId,
        newRole
      );

      // `error` puede ser un PostgrestError o un string ("No session"),
      // así que comprobamos el código de forma defensiva.
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined;

      if (!ok) {
        if (code === "23505") { // Unique violation
          toast.error("El usuario ya tiene un rol asignado para esta entidad.");
        } else {
          toast.error("Error al asignar rol. Verifica que el ID de usuario sea correcto.");
        }
      } else {
        toast.success("Rol asignado correctamente.");
        setNewUserId("");
        loadRoles(selectedEntityId);
      }
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (roleId: string) => {
    if (!(await confirm({ title: "Remover acceso", description: "¿Seguro que deseas remover este acceso?", destructive: true }))) return;

    try {
      const { ok } = await revokeEntityRole(roleId);
      if (ok) {
        toast.success("Acceso removido.");
        loadRoles(selectedEntityId);
      } else {
        toast.error("No se pudo remover el acceso.");
      }
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };

  if (loading) {
    return (
      <Card className="bg-background/40 backdrop-blur-sm border-white/5">
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (profiles.length === 0) {
    return (
      <Card className="bg-background/40 backdrop-blur-sm border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" /> Conexiones y Roles
          </CardTitle>
          <CardDescription>No tienes entidades (perfiles, páginas o grupos) creadas todavía.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-background/40 backdrop-blur-sm border-white/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5 text-primary" /> Conexiones y Roles (RBAC)
        </CardTitle>
        <CardDescription>
          Conecta tus páginas y grupos con otras cuentas, asignando roles específicos de acceso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Selecciona la entidad</label>
          <select 
            className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background/50 px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({profileKindLabel(p.kind)})
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-4">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Asignar acceso a otra cuenta
          </h4>
          <p className="text-xs text-muted-foreground">
            Para conceder acceso, necesitas el <b>ID de Usuario</b> (UUID) de la cuenta a la que deseas conectar.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input 
              placeholder="ID de Usuario (ej. 123e4567-e89b-...)" 
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              className="bg-background/50 flex-1"
            />
            <select 
              className="h-9 rounded-md border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as any)}
            >
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="viewer">Lector</option>
            </select>
            <Button onClick={handleGrant} disabled={granting} className="gap-2 cursor-pointer">
              {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conectar"}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Cuentas con acceso
          </h4>
          
          {loadingRoles ? (
            <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : roles.length === 0 ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 p-4 bg-black/10 rounded border border-white/5">
              <AlertCircle className="h-4 w-4" /> No hay otras cuentas conectadas a esta entidad.
            </div>
          ) : (
            <div className="space-y-2">
              {roles.map(role => (
                <div key={role.id} className="flex items-center justify-between p-3 rounded bg-black/20 border border-white/5">
                  <div className="min-w-0">
                    <p className="text-sm font-mono truncate">{role.account_id}</p>
                    <p className="text-xs text-muted-foreground capitalize">Rol: {role.role}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                    onClick={() => handleRevoke(role.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
