"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Bell,
  RefreshCw,
  Loader2,
  Check,
  CheckCheck,
  Vote,
  AlertTriangle,
  Trophy,
  ArrowRight,
} from "lucide-react";
import type { ProposalNotification } from "@/lib/governance/types";

const KIND_META: Record<string, { label: string; cls: string; icon: typeof Bell }> = {
  vote_request: { label: "Te toca votar", cls: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10", icon: Vote },
  affected: { label: "Te afecta", cls: "border-amber-400/40 text-amber-200 bg-amber-500/10", icon: AlertTriangle },
  result: { label: "Resultado", cls: "border-cyan-400/40 text-cyan-200 bg-cyan-500/10", icon: Trophy },
};

export default function GovNotifications() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<ProposalNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data } = await supabase
          .from("proposal_notifications")
          .select("id, proposal_id, user_id, kind, message, seen, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50);
        setItems((data as ProposalNotification[]) ?? []);
      }
    } catch {
      /* */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markSeen(id: string) {
    setBusy(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("proposal_notifications").update({ seen: true }).eq("id", id);
      if (error) toast.error(error.message);
      else setItems((prev) => prev.map((n) => (n.id === id ? { ...n, seen: true } : n)));
    } catch {
      toast.error("No se pudo marcar como vista.");
    }
    setBusy(null);
  }

  async function markAll() {
    if (!userId) return;
    setBusy("all");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("proposal_notifications")
        .update({ seen: true })
        .eq("user_id", userId)
        .eq("seen", false);
      if (error) toast.error(error.message);
      else {
        setItems((prev) => prev.map((n) => ({ ...n, seen: true })));
        toast.success("Todas marcadas como vistas");
      }
    } catch {
      toast.error("No se pudieron marcar.");
    }
    setBusy(null);
  }

  const unseen = items.filter((n) => !n.seen).length;

  if (!userId && !loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
        Inicia sesión para ver tus notificaciones de decisiones.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bell className="h-4 w-4 text-emerald-300" />
        <span className="text-sm font-semibold text-white">Notificaciones de decisiones</span>
        {unseen > 0 && (
          <Badge variant="outline" className="text-[9px] border-emerald-400/50 text-emerald-200 bg-emerald-500/10">
            {unseen} sin ver
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {unseen > 0 && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-white/60" onClick={markAll} disabled={busy === "all"}>
              {busy === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Marcar todas
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-white/60" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-4 text-center text-sm text-white/50">
          No tienes notificaciones de decisiones por ahora.
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {items.map((n) => {
            const meta = KIND_META[n.kind] ?? KIND_META.result;
            const Icon = meta.icon;
            return (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-2 rounded-lg border p-2.5",
                  n.seen ? "border-white/10 bg-white/5 opacity-70" : "border-emerald-500/20 bg-emerald-950/10",
                )}
              >
                <Badge variant="outline" className={cn("mt-0.5 gap-1 text-[9px] shrink-0", meta.cls)}>
                  <Icon className="h-2.5 w-2.5" /> {meta.label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs text-white/80">{n.message || "Actualización de propuesta"}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35">
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                    <Link
                      href={`/decisiones?p=${n.proposal_id}`}
                      className="flex items-center gap-0.5 text-emerald-300/80 hover:text-emerald-200"
                    >
                      Ver propuesta <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </div>
                {!n.seen && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-white/40 hover:text-emerald-300"
                    onClick={() => markSeen(n.id)}
                    disabled={busy === n.id}
                  >
                    {busy === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
