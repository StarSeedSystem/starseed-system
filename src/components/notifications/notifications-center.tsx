"use client";

// src/components/notifications/notifications-center.tsx
// -----------------------------------------------------------------------------
// CENTRO DE NOTIFICACIONES (Módulo 2) — feed unificado, realtime y categorizado.
//
// Fusiona `notifications` + `proposal_notifications` (vía
// `@/lib/notifications/notifications`) en un único feed con:
//   • Pestañas de categoría: Todas / Menciones y Respuestas / Actividad Política
//     / Invitaciones y Solicitudes.
//   • Agrupación de casi-duplicados (groupSimilar) — inteligente, no abrumador.
//   • Acciones por item: marcar leído + enlace a su destino.
//   • "Marcar todas como leídas".
//   • Suscripción REALTIME a ambas tablas (filtradas por user_id) → recarga viva.
//   • Botón opcional "Resumen" de Astraura (summarize, IA).
//
// SSR-safe: consulta sólo tras `auth.getUser()`. Todo en español.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  AtSign,
  Landmark,
  UserPlus,
  Inbox,
  Check,
  CheckCheck,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Loader2,
  ChevronDown,
  Radio,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/client";
import { useRealtime } from "@/lib/realtime/realtime";
import {
  loadAllNotifications,
  markSeen,
  markAllSeen,
  categorize,
  groupSimilar,
  summarize,
  type UnifiedNotification,
  type NotificationGroup,
  type NotificationCategoryKey,
} from "@/lib/notifications/notifications";

// ----------------------------- Config de pestañas ----------------------------

type TabKey = "todas" | NotificationCategoryKey;

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "todas", label: "Todas", icon: Bell },
  { key: "menciones", label: "Menciones y Respuestas", icon: AtSign },
  { key: "politica", label: "Actividad Política", icon: Landmark },
  { key: "invitaciones", label: "Invitaciones y Solicitudes", icon: UserPlus },
];

const CATEGORY_ICON: Record<NotificationCategoryKey, any> = {
  menciones: AtSign,
  politica: Landmark,
  invitaciones: UserPlus,
  otras: Bell,
};

const CATEGORY_ACCENT: Record<NotificationCategoryKey, string> = {
  menciones: "text-pink-400 border-pink-500/30 bg-pink-500/10",
  politica: "text-red-400 border-red-500/30 bg-red-500/10",
  invitaciones: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  otras: "text-blue-400 border-blue-500/30 bg-blue-500/10",
};

// Etiqueta de la acción de enlace según categoría.
function actionLabel(item: UnifiedNotification): string {
  const cat = categorize(item);
  if (cat === "politica") return "Ver / Votar";
  if (cat === "menciones") return "Responder";
  if (cat === "invitaciones") return "Revisar";
  return "Abrir";
}

function timeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "";
    const diff = Date.now() - then;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

// ============================================================================

export function NotificationsCenter() {
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<UnifiedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("todas");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyMarkAll, setBusyMarkAll] = useState(false);

  // Resumen IA (Astraura).
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);

  // --- Carga (SSR-safe: tras getUser). ---
  const reload = useCallback(async () => {
    const next = await loadAllNotifications();
    setItems(next);
    setLoading(false);
  }, []);

  // Resolver el usuario (para filtros realtime) + primera carga.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (active) setUid(data?.user?.id ?? null);
      } catch {
        if (active) setUid(null);
      }
      await reload();
    })();
    return () => {
      active = false;
    };
  }, [reload]);

  // --- REALTIME: ambas tablas, filtradas por user_id → recarga. ---
  const generalFilter = uid ? `user_id=eq.${uid}` : undefined;
  useRealtime("notifications", { filter: generalFilter }, () => {
    void reload();
  });
  useRealtime("proposal_notifications", { filter: generalFilter }, () => {
    void reload();
  });

  // --- Derivados: filtro por pestaña/no-leídas + agrupación. ---
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      todas: 0,
      menciones: 0,
      politica: 0,
      invitaciones: 0,
      otras: 0,
    };
    for (const it of items) {
      if (it.seen) continue; // los badges cuentan SIN LEER
      c.todas++;
      c[categorize(it)]++;
    }
    return c;
  }, [items]);

  const visibleGroups: NotificationGroup[] = useMemo(() => {
    let list = items;
    if (tab !== "todas") list = list.filter((it) => categorize(it) === tab);
    if (onlyUnread) list = list.filter((it) => !it.seen);
    return groupSimilar(list);
  }, [items, tab, onlyUnread]);

  const allUnread = useMemo(() => items.filter((it) => !it.seen), [items]);

  // --- Acciones ---
  const handleMarkSeen = useCallback(
    async (item: UnifiedNotification) => {
      if (item.seen) return;
      // Optimista: marca en memoria todos los del mismo rawId/fuente.
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, seen: true } : i)),
      );
      const ok = await markSeen(item);
      if (!ok) {
        // Revertir si falló.
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, seen: false } : i)),
        );
        toast.error("No se pudo marcar como leída.");
      }
    },
    [],
  );

  // Marca como leído todo el grupo (head + items colapsados).
  const handleMarkGroupSeen = useCallback(async (group: NotificationGroup) => {
    const unread = group.items.filter((i) => !i.seen);
    if (unread.length === 0) return;
    const ids = new Set(unread.map((i) => i.id));
    setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, seen: true } : i)));
    const ok = await markAllSeen(unread);
    if (!ok) {
      setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, seen: false } : i)));
      toast.error("No se pudieron marcar como leídas.");
    }
  }, []);

  const handleMarkAll = useCallback(async () => {
    if (allUnread.length === 0) {
      toast("No hay notificaciones sin leer.");
      return;
    }
    setBusyMarkAll(true);
    const ids = new Set(allUnread.map((i) => i.id));
    setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, seen: true } : i)));
    const ok = await markAllSeen(allUnread);
    setBusyMarkAll(false);
    if (ok) {
      toast.success("Todas marcadas como leídas.");
    } else {
      setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, seen: false } : i)));
      toast.error("No se pudieron marcar todas como leídas.");
    }
  }, [allUnread]);

  const handleSummarize = useCallback(async () => {
    const base = allUnread.length > 0 ? allUnread : items;
    if (base.length === 0) {
      toast("No hay notificaciones que resumir.");
      return;
    }
    setSummarizing(true);
    setSummary("");
    const text = await summarize(base);
    setSummarizing(false);
    if (text) {
      setSummary(text);
    } else {
      toast.error("No se pudo generar el resumen. ¿Tienes una IA activa en Ajustes?");
    }
  }, [allUnread, items]);

  // ----------------------------- Render --------------------------------------

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-5 md:p-6 backdrop-blur-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Encabezado del centro unificado */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 relative">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10">
            <Radio className="w-4 h-4 text-cyan-300" />
          </span>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white/80">
              Feed Unificado
            </h2>
            <p className="text-[10px] text-white/40 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Tiempo real · {counts.todas} sin leer
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleSummarize}
            variant="outline"
            size="sm"
            disabled={summarizing}
            className="h-8 rounded-xl text-xs gap-1.5 bg-purple-500/5 border-purple-500/20 text-purple-300 hover:bg-purple-500/10"
          >
            {summarizing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Resumen
          </Button>
          <Button
            onClick={() => setOnlyUnread((v) => !v)}
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 rounded-xl text-xs",
              onlyUnread ? "bg-cyan-500/15 text-cyan-300" : "text-white/60 hover:text-white",
            )}
          >
            {onlyUnread ? "Sin leer" : "Todas"}
          </Button>
          <Button
            onClick={handleMarkAll}
            variant="ghost"
            size="sm"
            disabled={busyMarkAll || counts.todas === 0}
            className="h-8 rounded-xl text-xs gap-1.5 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
          >
            {busyMarkAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            Marcar todas como leídas
          </Button>
          <Button
            onClick={() => void reload()}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl text-white/50 hover:text-white"
            title="Recargar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Resumen IA */}
      {summary && (
        <div className="mb-4 p-4 rounded-2xl border border-purple-500/20 bg-purple-500/[0.06] relative">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300">
              Resumen de Astraura
            </span>
            <button
              onClick={() => setSummary("")}
              className="ml-auto text-[10px] text-white/40 hover:text-white"
            >
              cerrar
            </button>
          </div>
          <p className="text-xs text-white/75 leading-relaxed whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Pestañas de categoría */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          const badge = counts[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border",
                active
                  ? "bg-cyan-500/15 text-cyan-200 border-cyan-500/30"
                  : "bg-white/[0.02] text-white/55 border-white/5 hover:text-white hover:bg-white/5",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {badge > 0 && (
                <span
                  className={cn(
                    "ml-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                    active ? "bg-cyan-400/30 text-cyan-100" : "bg-white/10 text-white/70",
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista de grupos */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 rounded-2xl bg-white/[0.03] border border-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed border-white/5 bg-white/[0.01] rounded-3xl gap-2">
            <Inbox className="w-10 h-10 opacity-15 text-cyan-400" />
            <span className="text-sm opacity-60">
              {onlyUnread ? "No hay notificaciones sin leer aquí." : "Nada por aquí, todo en calma."}
            </span>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <GroupCard
              key={group.key}
              group={group}
              expanded={!!expanded[group.key]}
              onToggle={() =>
                setExpanded((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
              }
              onMarkSeen={handleMarkSeen}
              onMarkGroupSeen={handleMarkGroupSeen}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --------------------------- Tarjeta de grupo --------------------------------

function GroupCard({
  group,
  expanded,
  onToggle,
  onMarkSeen,
  onMarkGroupSeen,
}: {
  group: NotificationGroup;
  expanded: boolean;
  onToggle: () => void;
  onMarkSeen: (item: UnifiedNotification) => void;
  onMarkGroupSeen: (group: NotificationGroup) => void;
}) {
  const Icon = CATEGORY_ICON[group.category];
  const accent = CATEGORY_ACCENT[group.category];
  const head = group.head;
  const grouped = group.count > 1;
  const hasUnread = group.unread > 0;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border backdrop-blur-md transition-all",
        hasUnread
          ? "bg-white/[0.05] border-white/10 border-l-2 border-l-cyan-400"
          : "bg-white/[0.02] border-white/5 opacity-75 hover:opacity-100",
      )}
    >
      <div className="flex gap-3 p-3.5">
        {/* Icono de categoría */}
        <div
          className={cn(
            "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border",
            accent,
          )}
        >
          <Icon className="w-4 h-4" />
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="text-sm font-medium text-white leading-snug flex-1 min-w-0">
              {head.title}
              {grouped && (
                <Badge
                  variant="outline"
                  className="ml-2 align-middle text-[10px] px-1.5 py-0 border-white/15 text-white/70"
                >
                  ×{group.count}
                </Badge>
              )}
            </h3>
            <span className="text-[10px] text-white/35 shrink-0 font-mono pt-0.5">
              {timeAgo(head.created_at)}
            </span>
          </div>

          {head.body && (
            <p className="text-xs text-white/55 leading-relaxed mt-0.5 line-clamp-2">
              {head.body}
            </p>
          )}

          {/* Acciones del item/grupo */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {head.link && (
              <Button
                asChild
                size="sm"
                variant="secondary"
                className="h-7 rounded-lg text-[11px] gap-1 bg-cyan-500/15 border border-cyan-500/20 text-cyan-200 hover:bg-cyan-500/25"
              >
                <Link href={head.link} onClick={() => onMarkSeen(head)}>
                  {actionLabel(head)}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </Button>
            )}

            {hasUnread && (
              <Button
                onClick={() => (grouped ? onMarkGroupSeen(group) : onMarkSeen(head))}
                size="sm"
                variant="ghost"
                className="h-7 rounded-lg text-[11px] gap-1 text-emerald-300 hover:bg-emerald-500/10"
              >
                <Check className="w-3 h-3" />
                {grouped ? "Marcar grupo leído" : "Marcar leído"}
              </Button>
            )}

            {grouped && (
              <button
                onClick={onToggle}
                className="h-7 px-2 rounded-lg text-[11px] text-white/50 hover:text-white hover:bg-white/5 flex items-center gap-1 ml-auto"
              >
                {expanded ? "Ocultar" : `Ver ${group.count - 1} más`}
                <ChevronDown
                  className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Items colapsados del grupo */}
      {grouped && expanded && (
        <div className="border-t border-white/5 px-3.5 py-2 space-y-1.5">
          {group.items.slice(1).map((sub) => (
            <div
              key={sub.id}
              className="flex items-center gap-2 text-xs text-white/55 py-1"
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  sub.seen ? "bg-white/20" : "bg-cyan-400",
                )}
              />
              <span className="flex-1 min-w-0 truncate">{sub.body || sub.title}</span>
              <span className="text-[10px] text-white/30 font-mono shrink-0">
                {timeAgo(sub.created_at)}
              </span>
              {sub.link && (
                <Link
                  href={sub.link}
                  onClick={() => onMarkSeen(sub)}
                  className="text-cyan-300/70 hover:text-cyan-200 shrink-0"
                  title={actionLabel(sub)}
                >
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
              {!sub.seen && (
                <button
                  onClick={() => onMarkSeen(sub)}
                  className="text-emerald-300/70 hover:text-emerald-200 shrink-0"
                  title="Marcar leído"
                >
                  <Check className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotificationsCenter;
