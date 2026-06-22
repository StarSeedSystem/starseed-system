"use client";

/**
 * MyActivity — Panel "Mi actividad democrática".
 * Reúne en un solo lugar la huella democrática del usuario actual dentro de la
 * Ontocracia de StarSeed: las propuestas que ha creado, los votos que ha emitido
 * y las notificaciones de decisiones que ha recibido.
 *
 * - SSR-safe: sólo consulta tras auth.getUser(); sin sesión muestra aviso.
 * - Votos públicos: para "mis votos" se muestra la opción que eligió el usuario.
 * - "Notificar por Telegram": resuelve participantes del ámbito de la propuesta
 *   (page/community → page_members.profile_id → profiles.user_id; group →
 *   group_members.member; otros → votantes actuales de la propuesta) y llama al
 *   bot de notificaciones para pedirles que voten.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Activity,
  RefreshCw,
  Loader2,
  Clock,
  FileText,
  Vote,
  Bell,
  Send,
  Check,
  CheckCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Rocket,
  Trophy,
  ArrowRight,
  Gavel,
  ListChecks,
} from "lucide-react";
import type {
  Proposal,
  ProposalVote,
  ProposalNotification,
} from "@/lib/governance/types";
import { YESNO_OPTIONS } from "@/lib/governance/types";

const BOT_NOTIFY = "https://starseed-neurocortex.vercel.app/api/govern_notify";

// Estilo de los chips de estado de propuesta (espejo de proposal-card.tsx).
const STATUS_META: Record<
  string,
  { label: string; cls: string; icon: typeof Vote }
> = {
  open: { label: "Abierta", cls: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10", icon: Vote },
  passed: { label: "Aprobada", cls: "border-emerald-400/50 text-emerald-200 bg-emerald-500/15", icon: CheckCircle2 },
  executed: { label: "Ejecutada", cls: "border-cyan-400/50 text-cyan-200 bg-cyan-500/15", icon: Rocket },
  rejected: { label: "Rechazada", cls: "border-red-400/40 text-red-200 bg-red-500/10", icon: XCircle },
  expired: { label: "Sin quórum", cls: "border-amber-400/40 text-amber-200 bg-amber-500/10", icon: AlertTriangle },
  failed: { label: "Falló", cls: "border-red-400/50 text-red-200 bg-red-500/15", icon: AlertTriangle },
};

// Estilo de los chips de notificación (espejo de notifications-panel.tsx).
const KIND_META: Record<
  string,
  { label: string; cls: string; icon: typeof Bell }
> = {
  vote_request: { label: "Te toca votar", cls: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10", icon: Vote },
  affected: { label: "Te afecta", cls: "border-amber-400/40 text-amber-200 bg-amber-500/10", icon: AlertTriangle },
  result: { label: "Resultado", cls: "border-cyan-400/40 text-cyan-200 bg-cyan-500/10", icon: Trophy },
};

const SCOPE_LABELS: Record<string, string> = {
  message: "Mensaje",
  group: "Grupo",
  page: "Página",
  community: "Comunidad",
  account: "Cuenta",
  global: "Global",
};

// Filtros de estado disponibles en las secciones de propuestas/votos.
type EstadoFilter = "todas" | "abiertas" | "aprobadas" | "rechazadas" | "ejecutadas";

const ESTADO_FILTERS: { id: EstadoFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "abiertas", label: "Abiertas" },
  { id: "aprobadas", label: "Aprobadas" },
  { id: "rechazadas", label: "Rechazadas" },
  { id: "ejecutadas", label: "Ejecutadas" },
];

// Agrupa estados crudos en las categorías visibles del filtro.
function matchesEstado(status: string, filter: EstadoFilter): boolean {
  if (filter === "todas") return true;
  if (filter === "abiertas") return status === "open";
  if (filter === "aprobadas") return status === "passed";
  if (filter === "rechazadas") return status === "rejected" || status === "failed" || status === "expired";
  if (filter === "ejecutadas") return status === "executed";
  return true;
}

// Etiqueta legible para la opción elegida en un voto.
function choiceLabel(proposal: Proposal | undefined, choice: string): string {
  const opts = (proposal?.options ?? []).length > 0 ? proposal!.options : YESNO_OPTIONS;
  const found = opts.find((o) => o.id === choice);
  return found?.label ?? choice;
}

// Voto enriquecido con la propuesta asociada (para mostrar estado + opción).
type VoteRow = ProposalVote & { proposal?: Proposal };

export default function MyActivity() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [myVotes, setMyVotes] = useState<VoteRow[]>([]);
  const [notifications, setNotifications] = useState<ProposalNotification[]>([]);

  // Filtros independientes por sección.
  const [propFilter, setPropFilter] = useState<EstadoFilter>("todas");
  const [voteFilter, setVoteFilter] = useState<EstadoFilter>("todas");
  const [notifFilter, setNotifFilter] = useState<"todas" | "sin_ver" | "vistas">("todas");

  // Estados de acción ("Notificar por Telegram" / marcar visto).
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [busyNotif, setBusyNotif] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setProposals([]);
        setMyVotes([]);
        setNotifications([]);
        setLoading(false);
        return;
      }

      // 1) Mis propuestas (author = yo).
      const propsP = supabase
        .from("proposals")
        .select("*")
        .eq("author", uid)
        .order("created_at", { ascending: false })
        .limit(200);

      // 2) Mis votos (filas en proposal_votes donde voter = yo).
      const votesP = supabase
        .from("proposal_votes")
        .select("proposal_id, voter, choice, weight, comment, created_at")
        .eq("voter", uid)
        .order("created_at", { ascending: false })
        .limit(200);

      // 3) Mis notificaciones.
      const notifsP = supabase
        .from("proposal_notifications")
        .select("id, proposal_id, user_id, kind, message, seen, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(100);

      const [propsRes, votesRes, notifsRes] = await Promise.all([propsP, votesP, notifsP]);

      const myProposals = (propsRes.data as Proposal[]) ?? [];
      setProposals(myProposals);

      const votes = (votesRes.data as ProposalVote[]) ?? [];
      setNotifications((notifsRes.data as ProposalNotification[]) ?? []);

      // Enriquecer cada voto con su propuesta (para estado + etiqueta de opción).
      if (votes.length > 0) {
        const ids = Array.from(new Set(votes.map((v) => v.proposal_id)));
        const ownById: Record<string, Proposal> = {};
        for (const p of myProposals) ownById[p.id] = p;
        const missing = ids.filter((id) => !ownById[id]);
        if (missing.length > 0) {
          const { data: extra } = await supabase
            .from("proposals")
            .select("*")
            .in("id", missing);
          for (const p of (extra as Proposal[]) ?? []) ownById[p.id] = p;
        }
        setMyVotes(votes.map((v) => ({ ...v, proposal: ownById[v.proposal_id] })));
      } else {
        setMyVotes([]);
      }
    } catch {
      /* el panel nunca debe romper la app */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Resumen del encabezado.
  const summary = useMemo(() => {
    const creadas = proposals.length;
    const emitidos = myVotes.length;
    // Pendientes: propuestas abiertas (mías) + notificaciones de "te toca votar" sin ver.
    const abiertas = proposals.filter((p) => p.status === "open").length;
    const sinVerVoto = notifications.filter((n) => !n.seen && n.kind === "vote_request").length;
    return { creadas, emitidos, pendientes: abiertas + sinVerVoto, abiertas };
  }, [proposals, myVotes, notifications]);

  const filteredProposals = useMemo(
    () => proposals.filter((p) => matchesEstado(p.status, propFilter)),
    [proposals, propFilter],
  );

  const filteredVotes = useMemo(
    () => myVotes.filter((v) => matchesEstado(v.proposal?.status ?? "open", voteFilter)),
    [myVotes, voteFilter],
  );

  const filteredNotifs = useMemo(() => {
    if (notifFilter === "sin_ver") return notifications.filter((n) => !n.seen);
    if (notifFilter === "vistas") return notifications.filter((n) => n.seen);
    return notifications;
  }, [notifications, notifFilter]);

  const unseenCount = useMemo(() => notifications.filter((n) => !n.seen).length, [notifications]);

  // Resuelve los user_ids a notificar para una propuesta (best-effort), siguiendo
  // la misma lógica que el motor: page/community → page_members → profiles.user_id;
  // group → group_members.member; en otros ámbitos → los votantes actuales.
  const resolveParticipants = useCallback(async (proposal: Proposal): Promise<string[]> => {
    const supabase = createClient();
    const ref = proposal.scope_ref ?? null;
    try {
      if ((proposal.scope === "page" || proposal.scope === "community") && ref) {
        const { data } = await supabase
          .from("page_members")
          .select("profile_id, profiles:profile_id(user_id)")
          .eq("page_id", ref)
          .limit(500);
        const ids: string[] = [];
        for (const row of (data as any[]) ?? []) {
          const u = row?.profiles?.user_id ?? row?.profile_id;
          if (u) ids.push(u);
        }
        if (ids.length > 0) return Array.from(new Set(ids));
      } else if (proposal.scope === "group" && ref) {
        const { data } = await supabase
          .from("group_members")
          .select("member")
          .eq("group_id", ref)
          .limit(500);
        const ids = ((data as any[]) ?? []).map((r) => r.member).filter(Boolean);
        if (ids.length > 0) return Array.from(new Set(ids));
      }
    } catch {
      /* caemos al fallback de votantes */
    }
    // Fallback (o ámbitos sin censo): los votantes que ya han participado.
    try {
      const { data } = await supabase
        .from("proposal_votes")
        .select("voter")
        .eq("proposal_id", proposal.id)
        .limit(500);
      const ids = ((data as any[]) ?? []).map((r) => r.voter).filter(Boolean);
      return Array.from(new Set(ids));
    } catch {
      return [];
    }
  }, []);

  // Acción "Notificar por Telegram": resuelve participantes y llama al bot.
  async function notifyTelegram(proposal: Proposal) {
    setNotifyingId(proposal.id);
    try {
      const voters = await resolveParticipants(proposal);
      if (voters.length === 0) {
        toast.message("No hay participantes a quienes notificar todavía.");
        setNotifyingId(null);
        return;
      }
      const url =
        typeof window !== "undefined" ? `${window.location.origin}/decisiones` : "/decisiones";
      const res = await fetch(BOT_NOTIFY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: proposal.title,
          url,
          voters,
          proposal_id: proposal.id,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        const notified = json.notified ?? 0;
        const missing = Array.isArray(json.missing) ? json.missing.length : json.missing ?? 0;
        toast.success(
          `Telegram: ${notified} avisado(s)` + (missing ? ` · ${missing} sin vincular` : ""),
        );
      } else {
        toast.error(json?.error || "No se pudo notificar por Telegram.");
      }
    } catch {
      toast.error("No se pudo notificar por Telegram.");
    }
    setNotifyingId(null);
  }

  async function markSeen(id: string) {
    setBusyNotif(id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("proposal_notifications")
        .update({ seen: true })
        .eq("id", id);
      if (error) toast.error(error.message);
      else setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, seen: true } : n)));
    } catch {
      toast.error("No se pudo marcar como vista.");
    }
    setBusyNotif(null);
  }

  async function markAllSeen() {
    if (!userId) return;
    setBusyNotif("all");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("proposal_notifications")
        .update({ seen: true })
        .eq("user_id", userId)
        .eq("seen", false);
      if (error) toast.error(error.message);
      else {
        setNotifications((prev) => prev.map((n) => ({ ...n, seen: true })));
        toast.success("Todas marcadas como vistas");
      }
    } catch {
      toast.error("No se pudieron marcar.");
    }
    setBusyNotif(null);
  }

  // Sin sesión.
  if (!userId && !loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">
        Inicia sesión para ver tu actividad democrática: tus propuestas, tus votos y tus notificaciones.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado con resumen */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold text-white">Resumen de tu actividad</span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 text-white/60"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualizar
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/45">
              <FileText className="h-3 w-3" /> Propuestas creadas
            </div>
            <div className="mt-1 font-mono text-2xl text-emerald-300">{summary.creadas}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/45">
              <Vote className="h-3 w-3" /> Votos emitidos
            </div>
            <div className="mt-1 font-mono text-2xl text-cyan-300">{summary.emitidos}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/45">
              <Clock className="h-3 w-3" /> Pendientes
            </div>
            <div className="mt-1 font-mono text-2xl text-amber-300">{summary.pendientes}</div>
          </div>
        </div>
      </div>

      {/* SECCIÓN: Mis propuestas */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold text-white">Mis propuestas</span>
          <Badge variant="outline" className="text-[9px] border-emerald-400/40 text-emerald-200 bg-emerald-500/10">
            {proposals.length}
          </Badge>
          <Link href="/decisiones" className="ml-auto text-[11px] text-emerald-300/80 hover:text-emerald-200">
            Ir a Decisiones →
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {ESTADO_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setPropFilter(f.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                propFilter === f.id
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
            {proposals.length === 0
              ? "Aún no has creado ninguna propuesta. Crea una decisión en Decisiones para empezar."
              : "No tienes propuestas con este estado."}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {filteredProposals.map((p) => {
              const sMeta = STATUS_META[p.status] ?? STATUS_META.open;
              const SIcon = sMeta.icon;
              const reason = (p.result?.reason as string) || null;
              return (
                <div key={p.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white break-words">{p.title}</span>
                    <Badge variant="outline" className={cn("gap-1 text-[9px]", sMeta.cls)}>
                      <SIcon className="h-2.5 w-2.5" /> {sMeta.label}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] border-white/15 text-white/55">
                      {SCOPE_LABELS[p.scope] ?? p.scope}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/40">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(p.created_at).toLocaleString()}
                    </span>
                  </div>
                  {reason && (
                    <p className="mt-1 break-words text-[11px] text-white/50">{reason}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                    <Link href="/decisiones">
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-white/15 text-white/70">
                        <Gavel className="h-3.5 w-3.5" /> Ver en Decisiones
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 border-cyan-400/30 text-cyan-200 hover:bg-cyan-900/20"
                      onClick={() => notifyTelegram(p)}
                      disabled={notifyingId === p.id}
                    >
                      {notifyingId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Notificar por Telegram
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECCIÓN: Mis votos */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <ListChecks className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-semibold text-white">Mis votos</span>
          <Badge variant="outline" className="text-[9px] border-cyan-400/40 text-cyan-200 bg-cyan-500/10">
            {myVotes.length}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {ESTADO_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setVoteFilter(f.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                voteFilter === f.id
                  ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                  : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : filteredVotes.length === 0 ? (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
            {myVotes.length === 0
              ? "Todavía no has votado en ninguna propuesta. Tus votos aparecerán aquí."
              : "No tienes votos en propuestas con este estado."}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {filteredVotes.map((v) => {
              const status = v.proposal?.status ?? "open";
              const sMeta = STATUS_META[status] ?? STATUS_META.open;
              const SIcon = sMeta.icon;
              const title = v.proposal?.title ?? "Propuesta";
              return (
                <div
                  key={`${v.proposal_id}-${v.voter}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white break-words">{title}</span>
                      <Badge variant="outline" className={cn("gap-1 text-[9px]", sMeta.cls)}>
                        <SIcon className="h-2.5 w-2.5" /> {sMeta.label}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/40">
                      <span className="flex items-center gap-1">
                        <Vote className="h-3 w-3" /> Tu voto:{" "}
                        <span className="font-medium text-cyan-200">
                          {choiceLabel(v.proposal, v.choice)}
                        </span>
                      </span>
                      <span>· {new Date(v.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <Link href="/decisiones">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-white/50 hover:text-cyan-200">
                      Ver <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECCIÓN: Notificaciones */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Bell className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-semibold text-white">Notificaciones</span>
          {unseenCount > 0 && (
            <Badge variant="outline" className="text-[9px] border-emerald-400/50 text-emerald-200 bg-emerald-500/10">
              {unseenCount} sin ver
            </Badge>
          )}
          {unseenCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 gap-1 text-white/60"
              onClick={markAllSeen}
              disabled={busyNotif === "all"}
            >
              {busyNotif === "all" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Marcar todas
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {([
            { id: "todas", label: "Todas" },
            { id: "sin_ver", label: "Sin ver" },
            { id: "vistas", label: "Vistas" },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setNotifFilter(f.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                notifFilter === f.id
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : filteredNotifs.length === 0 ? (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
            {notifications.length === 0
              ? "No tienes notificaciones de decisiones por ahora."
              : "No hay notificaciones con este filtro."}
          </div>
        ) : (
          <div className="mt-3 space-y-1.5">
            {filteredNotifs.map((n) => {
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
                      disabled={busyNotif === n.id}
                    >
                      {busyNotif === n.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
