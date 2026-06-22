"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  UserMinus,
  Loader2,
  Crown,
  Shield,
  User as UserIcon,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Member = {
  group_id: string;
  member: string;
  role: string;
  joined_at: string | null;
};

const ROLE_META: Record<string, { label: string; icon: typeof UserIcon; color: string }> = {
  owner: { label: "Propietario", icon: Crown, color: "text-amber-300 border-amber-400/40 bg-amber-500/10" },
  admin: { label: "Admin", icon: Shield, color: "text-cyan-300 border-cyan-400/40 bg-cyan-500/10" },
  member: { label: "Miembro", icon: UserIcon, color: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10" },
};

function roleMeta(role: string) {
  return ROLE_META[role] ?? ROLE_META.member;
}

/** Acorta un uuid para mostrarlo de forma legible. */
function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function GroupMembers({ groupId }: { groupId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);

      const { data } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });
      setMembers((data as Member[]) ?? []);
    } catch {
      /* sin sesión / error transitorio */
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const isMember = !!userId && members.some((m) => m.member === userId);

  async function join() {
    if (!userId) {
      setError("Inicia sesión para unirte al grupo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("group_members")
        .insert({ group_id: groupId, member: userId, role: "member" });
      if (err) setError(err.message);
      await load();
    } catch {
      setError("No se pudo unir al grupo.");
    }
    setBusy(false);
  }

  async function leave() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      // RLS: solo se puede borrar la fila propia (member = auth.uid()).
      const { error: err } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("member", userId);
      if (err) setError(err.message);
      await load();
    } catch {
      setError("No se pudo salir del grupo.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* Cabecera + acción */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-300" />
          <span className="text-sm font-semibold text-white">Miembros del grupo</span>
          <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-200/80">
            {members.length} {members.length === 1 ? "miembro" : "miembros"}
          </Badge>
          {isMember && (
            <Badge
              variant="outline"
              className="text-[9px] gap-1 border-emerald-500/40 text-emerald-200 bg-emerald-500/10"
            >
              <CheckCircle2 className="w-2.5 h-2.5" /> Eres miembro
            </Badge>
          )}
        </div>
        {userId &&
          (isMember ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 border-red-500/30 text-red-200 hover:bg-red-900/20"
              disabled={busy}
              onClick={leave}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
              Salir
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 h-8 bg-cyan-600 hover:bg-cyan-500"
              disabled={busy}
              onClick={join}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Unirme
            </Button>
          ))}
      </div>

      {error && (
        <div className="text-[11px] rounded px-2 py-1.5 bg-red-900/30 text-red-200 border border-red-500/30 break-words">
          {error}
        </div>
      )}

      {!userId && !loading && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-white/50">
          Inicia sesión para ver y unirte a los miembros de este grupo.
        </div>
      )}

      {/* Lista de miembros */}
      {loading ? (
        <div className="text-sm text-white/40 px-1 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando miembros…
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
          <Users className="w-6 h-6 text-cyan-300/50 mx-auto mb-2" />
          <div className="text-sm text-white/50">
            Este grupo aún no tiene miembros. Sé el primero en unirte.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const meta = roleMeta(m.role);
            const RoleIcon = meta.icon;
            const mine = !!userId && m.member === userId;
            return (
              <div
                key={m.member}
                className={cn(
                  "rounded-lg border bg-white/5 p-3 flex items-center gap-3",
                  mine ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-tr",
                    mine ? "from-emerald-500 to-cyan-500" : "from-cyan-500/60 to-fuchsia-500/60",
                  )}
                >
                  <RoleIcon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs">{shortId(m.member)}</span>
                    {mine && <span className="text-[10px] text-emerald-300/80">(tú)</span>}
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5">
                    {m.joined_at ? `Se unió el ${new Date(m.joined_at).toLocaleDateString()}` : "Miembro del grupo"}
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-[9px] gap-1 shrink-0", meta.color)}>
                  <RoleIcon className="w-2.5 h-2.5" /> {meta.label}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default GroupMembers;
