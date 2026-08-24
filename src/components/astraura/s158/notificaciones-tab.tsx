"use client";

/**
 * STUDIO 1.58 · Notificaciones de la IA — REDISEÑO Ola 4 (Adenda 156).
 * SOP: architecture/astraura-158-ola4-runtime-y-pestanas.md §2.
 * ----------------------------------------------------------------------------
 * Único destino de lo que la IA propia (imaginación, sueños, enjambre,
 * director, aprendizaje, sensorium, orquestador de autorizaciones…) tiene que
 * decir: esta pestaña, con paridad de funciones frente al sistema 1.58
 * original pero con el diseño del OS. Desde la Ola 4 el sondeo de fondo
 * (`astraura-158-feed.ts`) ya NO empuja esto al centro de notificaciones del
 * OS ni dispara toasts salvo que el usuario lo pida (preferencia
 * `starseed.astraura158.notify.v1`, selector más abajo): aquí se ve todo,
 * pase o no por el centro general.
 *
 * Fusiona DOS fuentes en una sola lista (`mergeS158Feed`, sin duplicados):
 *   · eventos del puente `/api/starseed/events` (imaginación/enjambre/
 *     director/aprendizaje, con `generated_by` y a veces `data.steps`);
 *   · notificaciones clásicas `/api/notifications` (con el registro de
 *     ramificación y el orquestador de autorizaciones).
 * La categoría de cada item (para las pastillas de filtro) sale de
 * `categoryForEvent` (`astraura-158-notify.ts`), pura y testeada aparte.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, BellOff, Check, CheckCheck, CloudSun, Cpu, GraduationCap, RefreshCw, ShieldCheck, Sparkles, ThumbsUp, Trash2, Waves, Wifi,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  ackAstraura158Events, applyAstraura158Notification, applyAstraura158NotificationList, clearAstraura158Notifications,
  deleteAstraura158Notification, fetchAstraura158AuthOrchestrator, fetchAstraura158Events, fetchAstraura158Notifications,
  markAstraura158NotificationsRead, setAstraura158AuthOrchestratorAuto, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { ASTRAURA_158_EVENTS_EVENT, getAstraura158NotifyMode, setAstraura158NotifyMode, type Astraura158NotifyMode } from "@/lib/astraura/astraura-158-feed";
import {
  countByCategory, mergeS158Feed, S158_CATEGORY_LABEL, S158_FILTER_CATEGORIES,
  type S158Category, type S158FeedItem,
} from "@/lib/astraura/astraura-158-notify";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, LABEL, MONO, PILL, PILL_OFF, PILL_ON, SUB,
  SectionTitle, Stat, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps,
} from "./shared";

/* ───────────────────────────── utilidades locales ───────────────────────── */

function fetchEventsLatest(target: Astraura158Target) { return fetchAstraura158Events(target, undefined, 60); }

const CATEGORY_ICON: Record<S158Category, LucideIcon> = {
  autorizacion: ShieldCheck,
  imaginacion: Sparkles,
  sensores: CloudSun,
  hardware: Cpu,
  red: Wifi,
  aprendizaje: GraduationCap,
  general: Waves,
};

/* ───────────────────────────── fila de un aviso ──────────────────────────── */

function ItemRow({ item, busy, onApply, onRead, onDelete }: {
  item: S158FeedItem;
  busy: string;
  onApply: (item: S158FeedItem) => void;
  onRead: (item: S158FeedItem) => void;
  onDelete: (item: S158FeedItem) => void;
}) {
  const Icon = CATEGORY_ICON[item.category];
  const canDelete = item.origin === "notification";
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2", !item.read && "border-cyan-400/25")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!item.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" aria-label="sin leer" />}
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{item.title || item.message || item.id}</p>
        <Badge tone={levelTone(item.level)}>{item.level}</Badge>
        <Badge tone="border-white/10 text-white/55"><Icon className="h-2.5 w-2.5" aria-hidden="true" />{S158_CATEGORY_LABEL[item.category]}</Badge>
        {item.generatedBy && (
          <Badge tone={item.generatedBy === "llm" ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200"}>
            {item.generatedBy === "llm" ? "modelo real" : "plantilla"}
          </Badge>
        )}
      </div>
      {item.message && item.title && <p className="line-clamp-3 text-[10px] leading-snug text-white/65">{item.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className={MONO}>
          {item.source} · {item.origin === "event" ? "puente" : "backend"} · {fmtAgo(item.ts)}
          {item.branchId ? ` · rama ${item.branchId.slice(0, 8)}` : ""}
        </p>
        <div className="flex gap-1">
          {item.actionLabel && (
            <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} onClick={() => onApply(item)} aria-label={`${item.actionLabel} · ${item.title || item.id}`}>
              <BusyIcon busy={busy === `apply:${item.id}`} icon={item.actionLabel === "Conceder" ? ThumbsUp : Check} /> {item.actionLabel}
            </button>
          )}
          {!item.read && (
            <button type="button" className={BTN} disabled={busy !== ""} onClick={() => onRead(item)} aria-label={`Marcar leída · ${item.title || item.id}`}>
              <BusyIcon busy={busy === `read:${item.id}`} icon={BellOff} />
            </button>
          )}
          {canDelete && (
            <button type="button" className={BTN_DANGER} disabled={busy !== ""} onClick={() => onDelete(item)} aria-label={`Descartar · ${item.title || item.id}`}>
              <BusyIcon busy={busy === `del:${item.id}`} icon={Trash2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── pestaña ───────────────────────────────────── */

export function NotificacionesTab({ target, refresh }: S158TabProps) {
  const notif = useS158Load(fetchAstraura158Notifications, target, 20_000);
  const events = useS158Load(fetchEventsLatest, target, 20_000);
  const auth = useS158Load(fetchAstraura158AuthOrchestrator, target, 30_000);
  const { busy, wrap } = useBusy();
  const [category, setCategory] = useState<S158Category | "todas">("todas");
  // `NotificacionesTab` se monta con `ssr:false` (astraura-158-panel.tsx): nunca
  // hay render de servidor, así que leer la preferencia directo en el estado
  // inicial es seguro (sin desajuste de hidratación).
  const [notifyMode, setNotifyMode] = useState<Astraura158NotifyMode>(() => getAstraura158NotifyMode());

  const reloadAll = useCallback(async () => {
    await Promise.all([notif.reload(true), events.reload(true)]);
    await refresh();
  }, [notif, events, refresh]);

  // El sondeo global (singleton) avisa por evento del DOM cuando entrega
  // novedades: refresca esta pestaña al instante, sin esperar su propio poll.
  useEffect(() => {
    const h = () => { void notif.reload(true); void events.reload(true); };
    window.addEventListener(ASTRAURA_158_EVENTS_EVENT, h);
    return () => window.removeEventListener(ASTRAURA_158_EVENTS_EVENT, h);
  }, [notif.reload, events.reload]);

  const items = useMemo(
    () => mergeS158Feed(events.data?.events ?? [], notif.data?.notifications ?? []),
    [events.data, notif.data],
  );
  const counts = useMemo(() => countByCategory(items), [items]);
  const filtered = category === "todas" ? items : items.filter((i) => i.category === category);
  const unreadCount = items.filter((i) => !i.read).length;

  const applicableNotifIds = (notif.data?.notifications ?? [])
    .filter((n) => n.action_type && !/applied|done|discarded/i.test(String(n.status ?? "")))
    .map((n) => n.id);

  const logs = notif.data?.branching_logs ?? [];
  const stepItems = items.filter((i) => i.steps.length > 0);
  const a = auth.data;

  function changeNotifyMode(mode: Astraura158NotifyMode) {
    setAstraura158NotifyMode(mode);
    setNotifyMode(mode);
  }

  function applyItem(item: S158FeedItem) {
    const label = item.actionLabel === "Conceder" ? "Concedido" : "Notificación aplicada";
    void wrap(`apply:${item.id}`, () => runS158(label, () => applyAstraura158Notification(target, item.id), { after: reloadAll }));
  }
  function readItem(item: S158FeedItem) {
    void wrap(`read:${item.id}`, () => (
      item.origin === "event"
        ? runS158("Marcado como leído", () => ackAstraura158Events(target, [item.id]), { after: reloadAll })
        : runS158("Marcado como leído", () => markAstraura158NotificationsRead(target, item.id), { after: reloadAll })
    ));
  }
  function deleteItem(item: S158FeedItem) {
    void wrap(`del:${item.id}`, () => runS158("Descartada", () => deleteAstraura158Notification(target, item.id), { after: reloadAll }));
  }
  const markAllRead = useCallback(() => wrap("read_all", async () => {
    const unreadEventIds = items.filter((i) => i.origin === "event" && !i.read).map((i) => i.id);
    const hasUnreadNotif = (notif.data?.notifications ?? []).some((n) => !n.read);
    await Promise.all([
      hasUnreadNotif ? runS158("Notificaciones marcadas como leídas", () => markAstraura158NotificationsRead(target)) : Promise.resolve(true),
      unreadEventIds.length ? runS158("Eventos confirmados", () => ackAstraura158Events(target, unreadEventIds)) : Promise.resolve(true),
    ]);
    await reloadAll();
  }), [wrap, items, notif.data, target, reloadAll]);

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Bell} title={`Notificaciones de la IA (${unreadCount} no leídas · ${items.length} en total)`} tone="text-cyan-300"
          hint="Imaginación, sueños, enjambre, director, aprendizaje, sensorium y el orquestador de autorizaciones: aparte del resto del centro de notificaciones del OS."
          right={(
            <button type="button" className={BTN} disabled={notif.loading || events.loading} onClick={() => { void reloadAll(); }} aria-label="Refrescar notificaciones">
              <RefreshCw className={cn("h-3 w-3", (notif.loading || events.loading) && "animate-spin")} aria-hidden="true" />
            </button>
          )} />

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || applicableNotifIds.length === 0} aria-label={`Autorizar y aplicar las ${applicableNotifIds.length} notificaciones con acción pendiente`}
            onClick={() => { void wrap("apply_all", () => runS158("Notificaciones aplicadas", () => applyAstraura158NotificationList(target, applicableNotifIds), { description: (d) => `${d.processed_count ?? 0} aplicadas · ${d.failed_count ?? 0} fallidas · ${Math.round(d.elapsed_seconds ?? 0)} s`, after: reloadAll })); }}>
            <BusyIcon busy={busy === "apply_all"} icon={CheckCheck} /> Autorizar y Aplicar Todas ({applicableNotifIds.length})
          </button>
          <button type="button" className={BTN} disabled={busy !== "" || unreadCount === 0} aria-label="Marcar todo como leído"
            onClick={() => { void markAllRead(); }}>
            <BusyIcon busy={busy === "read_all"} icon={BellOff} /> Marcar todo leído
          </button>
          <button type="button" className={BTN_DANGER} disabled={busy !== "" || (notif.data?.notifications ?? []).length === 0} aria-label="Vaciar notificaciones del backend"
            onClick={() => { void wrap("clear", () => runS158("Notificaciones vaciadas", () => clearAstraura158Notifications(target), { after: reloadAll })); }}>
            <BusyIcon busy={busy === "clear"} icon={Trash2} /> Vaciar
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className={LABEL}>avisos en</span>
          <button type="button" className={cn(PILL, notifyMode === "tab" ? PILL_ON : PILL_OFF)} aria-pressed={notifyMode === "tab"}
            aria-label="Avisar solo en esta pestaña (no usar toasts ni el centro de notificaciones del OS)" onClick={() => changeNotifyMode("tab")}>
            Solo esta pestaña
          </button>
          <button type="button" className={cn(PILL, notifyMode === "tab+os" ? PILL_ON : PILL_OFF)} aria-pressed={notifyMode === "tab+os"}
            aria-label="Avisar también en el centro de notificaciones del OS (toasts incluidos)" onClick={() => changeNotifyMode("tab+os")}>
            También en el centro del OS
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className={cn(PILL, category === "todas" ? PILL_ON : PILL_OFF)} aria-pressed={category === "todas"}
            aria-label={`Todas las categorías (${items.length})`} onClick={() => setCategory("todas")}>
            Todas ({items.length})
          </button>
          {S158_FILTER_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICON[cat];
            return (
              <button key={cat} type="button" className={cn(PILL, category === cat ? PILL_ON : PILL_OFF)} aria-pressed={category === cat}
                aria-label={`${S158_CATEGORY_LABEL[cat]} (${counts[cat]})`} onClick={() => setCategory(cat)}>
                <Icon className="h-3 w-3" aria-hidden="true" /> {S158_CATEGORY_LABEL[cat]} ({counts[cat]})
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-white/10 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[11px] font-medium text-white/80">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              Orquestador de autorizaciones{a?.agent_name ? ` · ${a.agent_name}` : ""}
              {a?.is_busy && <span className={MONO}>procesando</span>}
              {!a?.is_busy && a?.draining_mode && <span className={MONO}>drenando</span>}
            </p>
            <label className="flex items-center gap-2 text-[11px] text-white/80">
              Auto-Orquestación
              <Switch checked={!!a?.auto_mode} disabled={busy !== "" || !a} aria-label="Auto-Orquestación: aplica sola lo que la política permite"
                onCheckedChange={(v) => { void wrap("auth_auto", () => runS158(v ? "Orquestador en automático" : "Orquestador manual", () => setAstraura158AuthOrchestratorAuto(target, v), { after: async () => { await auth.reload(true); } })); }} />
            </label>
          </div>
          {!a && <Empty loading={auth.loading} error={auth.error} text="Sin orquestador de autorizaciones." />}
          {a && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Stat label="Orquestaciones ejecutadas" value={a.orchestrations_run ?? 0} />
              <Stat label="Procesadas" value={a.last_run?.processed_count ?? 0} />
              <Stat label="Fallidas" value={a.last_run?.failed_count ?? 0} hint={a.last_run?.elapsed_seconds ? `${Math.round(a.last_run.elapsed_seconds)} s de media` : undefined} />
            </div>
          )}
          {a?.last_run?.message && <p className="mt-1.5 text-[10px] text-white/55">{a.last_run.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Waves} title={`Avisos (${filtered.length})`} tone="text-fuchsia-300"
            hint={category === "todas" ? "Todo, mezclado por fecha." : `Filtrado por «${S158_CATEGORY_LABEL[category]}».`} />
          <div className="mt-2 space-y-1.5">
            {filtered.length === 0 && (
              <Empty loading={notif.loading || events.loading} error={notif.error || events.error} text={category === "todas" ? "Sin avisos todavía." : "Nada en esta categoría."} />
            )}
            {filtered.slice(0, 60).map((item) => (
              <ItemRow key={`${item.origin}:${item.id}`} item={item} busy={busy} onApply={applyItem} onRead={readItem} onDelete={deleteItem} />
            ))}
          </div>
        </div>

        <div className={cn(CARD, "p-3 xl:sticky xl:top-3 xl:self-start")}>
          <SectionTitle icon={Waves} title="Árbol de Procesos Ramificados" tone="text-white/70"
            hint="Ramas que el backend fue registrando y los pasos que cada evento completó, con sus tiempos." />
          {logs.length === 0 && stepItems.length === 0 && (
            <Empty loading={notif.loading || events.loading} error={notif.error} text="Sin ramas ni pasos registrados todavía." />
          )}
          {logs.length > 0 && (
            <div className="mt-2">
              <p className={LABEL}>ramas registradas</p>
              <ul className="mt-1 space-y-1.5 border-l border-white/10 pl-2.5">
                {logs.slice(-20).reverse().map((l, i) => (
                  <li key={l.id ?? i} className="text-[10px] leading-snug text-white/65">
                    <span className={MONO}>{fmtAgo(l.timestamp)}</span>{l.agent ? <span className="text-white/80"> · {l.agent}</span> : null}
                    <br /><span className="text-white/75">{l.title ?? l.message ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {stepItems.length > 0 && (
            <div className="mt-3">
              <p className={LABEL}>pasos por evento</p>
              <ul className="mt-1 space-y-2">
                {stepItems.slice(0, 12).map((it) => (
                  <li key={it.id} className="border-l border-white/10 pl-2.5">
                    <p className="truncate text-[11px] font-medium text-white/85">{it.title || it.source}</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {it.steps.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-[10px] text-white/60">
                          <span className="min-w-0 truncate">{s.label}{s.status ? ` · ${s.status}` : ""}</span>
                          <span className={MONO}>{s.ms} ms</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificacionesTab;
