"use client";

/**
 * WorkspaceAccessDialog — Accesos y permisos (Adenda 76 · Agente G2).
 * Diálogo compartido para ESPACIOS y CHATS. Reutiliza el modelo `AccessGrant`
 * (sharing/access.ts) y el espejo REAL `os_spaces` (workspace-sharing.ts).
 *
 * · Espacio: ámbito (privado/cuenta/perfiles/grupos/público) + destinatarios con
 *   rol (ver/editar/administrar). Invita de verdad al espejo os_spaces.
 * · Chat: comparte por SNAPSHOT en grupo (os_spaces). Es honesto sobre la
 *   limitación beta (no hay streaming mensaje-a-mensaje sin cambio de esquema).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Users, Globe, User, Share2, Trash2, Search, Loader2, Check, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchUsers, searchGroups } from "@/lib/social/os-profiles";
import type { AccessGrant, AccessRole, AccessScope } from "@/lib/sharing/access";
import { ROLE_LABELS } from "@/lib/sharing/access";
import {
  normalizeAccess, setWorkspaceScope, addWorkspaceGrant, removeWorkspaceGrant,
  shareChatWithGrant, unshareChatGrant, chatSharedWith, refreshSharedChatSnapshot,
} from "@/lib/workspaces/workspace-sharing";
import { cachedWorkspace } from "@/lib/workspaces/workspaces";

export type AccessTarget =
  | { kind: "workspace"; id: string; title?: string }
  | { kind: "chat"; id: string; title?: string };

const SCOPES: { id: AccessScope; label: string; icon: typeof Lock }[] = [
  { id: "private", label: "Privado", icon: Lock },
  { id: "account", label: "Mi cuenta", icon: Lock },
  { id: "profiles", label: "Perfiles", icon: User },
  { id: "groups", label: "Grupos", icon: Users },
  { id: "public", label: "Público", icon: Globe },
];
const ROLES: AccessRole[] = ["view", "edit", "admin"];

export function WorkspaceAccessDialog({
  open, onClose, target,
}: {
  open: boolean;
  onClose: () => void;
  target: AccessTarget;
}) {
  const isChat = target.kind === "chat";
  const [scope, setScope] = useState<AccessScope>("account");
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"user" | "group">("user");
  const [role, setRole] = useState<AccessRole>("view");
  const [users, setUsers] = useState<{ id: string; label: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; label: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hidrata el estado del recurso al abrir.
  useEffect(() => {
    if (!open) return;
    if (isChat) {
      setGrants(chatSharedWith(target.id));
      setScope("profiles");
    } else {
      const acc = normalizeAccess(cachedWorkspace(target.id)?.access);
      setScope(acc.scope);
      setGrants(acc.grants);
    }
  }, [open, isChat, target.id]);

  // Búsqueda de destinatarios (usuarios reales os_profiles / grupos).
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setUsers([]);
      setGroups([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const run = async () => {
      try {
        if (mode === "user") {
          const res = await searchUsers(term, 8);
          if (alive) setUsers(res.map((u) => ({ id: u.userId, label: `@${u.username} · ${u.displayName}` })));
        } else {
          const res = await searchGroups(term, 8);
          if (alive) setGroups(res.map((g) => ({ id: g.slug, label: `${g.name} · ${g.kind}` })));
        }
      } catch {
        /* */
      } finally {
        if (alive) setSearching(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, mode, open]);

  const sharedCount = useMemo(
    () => (scope === "public" ? Math.max(1, grants.length) : grants.length),
    [scope, grants.length],
  );

  const addGrant = useCallback(
    async (granteeId: string, label: string) => {
      const grant: AccessGrant = {
        granteeKind: mode === "user" ? "account" : "group",
        granteeId,
        role,
        label,
      };
      setBusy(true);
      try {
        if (isChat) {
          const res = await shareChatWithGrant(target.id, grant);
          setGrants(res.grants);
          toast.success("Compartido (snapshot en grupo)", { description: res.betaNote });
        } else {
          const acc = await addWorkspaceGrant(target.id, grant);
          setGrants(acc.grants);
          setScope(acc.scope);
          toast.success(`Compartido con ${label}`);
        }
        setQ("");
        setUsers([]);
        setGroups([]);
      } finally {
        setBusy(false);
      }
    },
    [mode, role, isChat, target.id],
  );

  const revoke = useCallback(
    async (g: AccessGrant) => {
      setBusy(true);
      try {
        if (isChat) {
          const next = await unshareChatGrant(target.id, g.granteeKind, g.granteeId);
          setGrants(next);
        } else {
          const acc = await removeWorkspaceGrant(target.id, g.granteeKind, g.granteeId);
          setGrants(acc.grants);
        }
      } finally {
        setBusy(false);
      }
    },
    [isChat, target.id],
  );

  const changeScope = useCallback(
    async (s: AccessScope) => {
      setScope(s);
      if (isChat) return; // el chat no tiene ámbito global (solo grants)
      setBusy(true);
      try {
        await setWorkspaceScope(target.id, s);
      } finally {
        setBusy(false);
      }
    },
    [isChat, target.id],
  );

  const results = mode === "user" ? users : groups;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-white/10 bg-black/90 text-white backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-light">
            <Share2 className="h-4 w-4 text-cyan-300" />
            {isChat ? "Compartir chat en grupo" : "Accesos y permisos del espacio"}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-white/50">
            {target.title ? `«${target.title}» · ` : ""}
            Compartido con {sharedCount} {sharedCount === 1 ? "destinatario" : "destinatarios"}.
          </DialogDescription>
        </DialogHeader>

        {isChat && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Beta: los invitados verán un <b>snapshot</b> del hilo (hasta ahora) y sus reexportaciones.
              La co-presencia en vivo mensaje-a-mensaje necesita un cambio de esquema (RLS).
            </span>
          </div>
        )}

        {!isChat && (
          <div className="flex flex-wrap gap-1.5">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => void changeScope(s.id)}
                disabled={busy}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition cursor-pointer",
                  scope === s.id
                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                    : "border-white/10 text-white/50 hover:border-white/30",
                )}
              >
                <s.icon className="h-3 w-3" /> {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Añadir destinatario */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode("user")}
              className={cn("flex-1 rounded-md px-2 py-1 text-[11px] cursor-pointer", mode === "user" ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5")}
            >
              Personas
            </button>
            <button
              onClick={() => setMode("group")}
              className={cn("flex-1 rounded-md px-2 py-1 text-[11px] cursor-pointer", mode === "group" ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5")}
            >
              Grupos
            </button>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AccessRole)}
              className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white outline-none"
              title="Rol"
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="bg-black">
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={mode === "user" ? "Buscar @usuario o nombre…" : "Buscar grupo…"}
              className="h-8 border-white/10 bg-black/40 pl-8 text-xs"
            />
            {searching && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-white/40" />}
          </div>
          {results.length > 0 && (
            <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => void addGrant(r.id, r.label)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/10 cursor-pointer"
                >
                  <User className="h-3 w-3 shrink-0 text-cyan-300" />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de accesos concedidos */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Con acceso</div>
          {grants.length === 0 ? (
            <p className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 text-center text-[11px] text-white/35">
              Aún no compartido. Añade personas o grupos arriba.
            </p>
          ) : (
            grants.map((g) => (
              <div
                key={`${g.granteeKind}:${g.granteeId}`}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
              >
                {g.granteeKind === "group" ? <Users className="h-3.5 w-3.5 text-fuchsia-300" /> : <User className="h-3.5 w-3.5 text-cyan-300" />}
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/80">{g.label || g.granteeId}</span>
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase text-white/50">
                  <ShieldCheck className="h-2.5 w-2.5" /> {ROLE_LABELS[g.role]}
                </span>
                <button
                  onClick={() => void revoke(g)}
                  disabled={busy}
                  className="text-white/40 hover:text-rose-400 cursor-pointer"
                  title="Dejar de compartir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {isChat && grants.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[11px] text-cyan-200 hover:bg-cyan-500/10"
            onClick={async () => {
              const ok = await refreshSharedChatSnapshot(target.id);
              toast[ok ? "success" : "error"](ok ? "Snapshot reexportado" : "No se pudo reexportar");
            }}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Reexportar snapshot ahora
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default WorkspaceAccessDialog;
