"use client";

/**
 * STUDIO 1.58 · Notificaciones — las notificaciones especiales del backend
 * (propuestas de la imaginación, avisos de seguridad, sugerencias con acción
 * aplicable), el orquestador de autorizaciones que las procesa solo, el
 * registro de ramificación y el feed de eventos del puente
 * (`/api/starseed/events`) que el OS convierte en avisos del centro de
 * notificaciones (`astraura-158-feed.ts`).
 */

import { useCallback, useState } from "react";
import { Bell, BellOff, Check, CheckCheck, RefreshCw, ShieldCheck, Trash2, Waves, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  ackAstraura158Events, applyAstraura158Notification, applyAstraura158NotificationList, clearAstraura158Notifications,
  deleteAstraura158Notification, fetchAstraura158AuthOrchestrator, fetchAstraura158Events, fetchAstraura158Notifications,
  markAstraura158NotificationsRead, setAstraura158AuthOrchestratorAuto, type Astraura158Notification, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, MONO, SUB, SectionTitle, Stat, fmtAgo, levelTone, runS158, useBusy, useS158Load, type S158TabProps } from "./shared";

const SEVERITY_TONE: Record<string, string> = {
  success: "border-emerald-400/30 text-emerald-200",
  warning: "border-amber-400/30 text-amber-200",
  error: "border-rose-400/30 text-rose-200",
  security: "border-rose-400/30 text-rose-200",
  suggestion: "border-fuchsia-400/30 text-fuchsia-200",
  info: "border-cyan-400/30 text-cyan-200",
};

function fetchEventsLatest(target: Astraura158Target) { return fetchAstraura158Events(target, undefined, 40); }

function NotifRow({ n, busy, onApply, onRead, onDelete }: { n: Astraura158Notification; busy: string; onApply: (id: string) => void; onRead: (id: string) => void; onDelete: (id: string) => void }) {
  const applicable = !!n.action_type && !/applied|done|discarded/i.test(String(n.status ?? ""));
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2", !n.read && "border-cyan-400/25")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" aria-label="sin leer" />}
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{n.title ?? n.category ?? n.id}</p>
        {n.severity && <Badge tone={SEVERITY_TONE[n.severity] ?? "border-white/10 text-white/60"}>{n.severity}</Badge>}
        {n.category && <Badge tone="border-white/10 text-white/55">{n.category}</Badge>}
        {n.status && <Badge tone={levelTone(n.status)}>{n.status}</Badge>}
      </div>
      {n.message && <p className="line-clamp-3 text-[10px] leading-snug text-white/65">{n.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className={MONO}>{fmtAgo(n.timestamp)}{n.action_type ? ` · acción ${n.action_type}` : ""}{n.branch_id ? ` · rama ${n.branch_id.slice(0, 8)}` : ""}</p>
        <div className="flex gap-1">
          {applicable && <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} onClick={() => onApply(n.id)} aria-label={`Aplicar ${n.title ?? n.id}`}><BusyIcon busy={busy === `apply:${n.id}`} icon={Check} /> Aplicar</button>}
          {!n.read && <button type="button" className={BTN} disabled={busy !== ""} onClick={() => onRead(n.id)} aria-label={`Marcar leída ${n.title ?? n.id}`}><BusyIcon busy={busy === `read:${n.id}`} icon={BellOff} /></button>}
          <button type="button" className={BTN_DANGER} disabled={busy !== ""} onClick={() => onDelete(n.id)} aria-label={`Eliminar ${n.title ?? n.id}`}><BusyIcon busy={busy === `del:${n.id}`} icon={Trash2} /></button>
        </div>
      </div>
    </div>
  );
}

export function NotificacionesTab({ target, refresh }: S158TabProps) {
  const notif = useS158Load(fetchAstraura158Notifications, target, 20_000);
  const auth = useS158Load(fetchAstraura158AuthOrchestrator, target, 30_000);
  const events = useS158Load(fetchEventsLatest, target, 20_000);
  const { busy, wrap } = useBusy();
  const [onlyUnread, setOnlyUnread] = useState(false);

  const after = useCallback(async () => { await notif.reload(true); await refresh(); }, [notif, refresh]);
  const afterEvents = useCallback(async () => { await events.reload(true); await refresh(); }, [events, refresh]);

  const list = notif.data?.notifications ?? [];
  const shown = (onlyUnread ? list.filter((n) => !n.read) : list).slice().sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const applicableIds = list.filter((n) => n.action_type && !/applied|done|discarded/i.test(String(n.status ?? ""))).map((n) => n.id);
  const logs = notif.data?.branching_logs ?? [];
  const ev = events.data?.events ?? [];
  const unreadEvents = ev.filter((e) => !e.acked && !e.read);
  const a = auth.data;

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={Bell} title={`Notificaciones del backend (${list.length} · ${notif.data?.unread_count ?? list.filter((n) => !n.read).length} sin leer)`} tone="text-cyan-300"
          hint="Lo que los procesos de fondo quieren decirte: propuestas aplicables, avisos de seguridad y sugerencias."
          right={(
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 text-[10px] text-white/60"><Switch checked={onlyUnread} onCheckedChange={setOnlyUnread} aria-label="Solo sin leer" /> solo sin leer</label>
              <button type="button" className={BTN} onClick={() => { void notif.reload(); }} aria-label="Recargar notificaciones"><RefreshCw className={cn("h-3 w-3", notif.loading && "animate-spin")} aria-hidden="true" /></button>
            </div>
          )} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className={BTN_PRIMARY} disabled={busy !== "" || applicableIds.length === 0} aria-label="Aplicar todas las notificaciones con acción"
            onClick={() => { void wrap("apply_all", () => runS158("Notificaciones aplicadas", () => applyAstraura158NotificationList(target, applicableIds), { description: (d) => `${d.processed_count ?? 0} aplicadas · ${d.failed_count ?? 0} fallidas · ${Math.round(d.elapsed_seconds ?? 0)} s`, after })); }}>
            <BusyIcon busy={busy === "apply_all"} icon={CheckCheck} /> Aplicar todas ({applicableIds.length})
          </button>
          <button type="button" className={BTN} disabled={busy !== "" || list.length === 0} aria-label="Marcar todas como leídas"
            onClick={() => { void wrap("read_all", () => runS158("Todas marcadas como leídas", () => markAstraura158NotificationsRead(target), { after })); }}>
            <BusyIcon busy={busy === "read_all"} icon={BellOff} /> Marcar leídas
          </button>
          <button type="button" className={BTN_DANGER} disabled={busy !== "" || list.length === 0} aria-label="Vaciar notificaciones"
            onClick={() => { void wrap("clear", () => runS158("Notificaciones vaciadas", () => clearAstraura158Notifications(target), { after })); }}>
            <BusyIcon busy={busy === "clear"} icon={Trash2} /> Vaciar
          </button>
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {shown.length === 0 && <Empty loading={notif.loading} error={notif.error} text={onlyUnread ? "Nada sin leer." : "Sin notificaciones."} />}
          {shown.slice(0, 40).map((n) => (
            <NotifRow key={n.id} n={n} busy={busy}
              onApply={(id) => { void wrap(`apply:${id}`, () => runS158("Notificación aplicada", () => applyAstraura158Notification(target, id), { after })); }}
              onRead={(id) => { void wrap(`read:${id}`, () => runS158("Marcada como leída", () => markAstraura158NotificationsRead(target, id), { after })); }}
              onDelete={(id) => { void wrap(`del:${id}`, () => runS158("Notificación eliminada", () => deleteAstraura158Notification(target, id), { after })); }} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={ShieldCheck} title={`Orquestador de autorizaciones${a?.agent_name ? ` · ${a.agent_name}` : ""}`} tone="text-emerald-300"
            hint="Agente que revisa las propuestas pendientes y aplica solas las que la política permite; en modo automático trabaja sin preguntar." />
          {!a && <Empty loading={auth.loading} error={auth.error} text="Sin orquestador." />}
          {a && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Stat label="Estado" value={a.is_busy ? "procesando" : a.draining_mode ? "drenando" : "en espera"} hint={a.requests_embargoed ? "solicitudes embargadas" : undefined} />
                <Stat label="Ejecuciones" value={a.orchestrations_run ?? 0} hint={a.last_run ? `última: ${a.last_run.processed_count ?? 0} ok · ${a.last_run.failed_count ?? 0} fallos` : undefined} />
              </div>
              <label className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
                <Switch checked={!!a.auto_mode} disabled={busy !== ""} aria-label="Modo automático del orquestador"
                  onCheckedChange={(v) => { void wrap("auth_auto", () => runS158(v ? "Orquestador en automático" : "Orquestador manual", () => setAstraura158AuthOrchestratorAuto(target, v), { after: async () => { await auth.reload(true); } })); }} />
                modo automático (aplica solo lo que la política permite)
              </label>
              {a.last_run?.message && <p className="mt-1 text-[10px] text-white/55">{a.last_run.message}</p>}
            </>
          )}
        </div>

        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Waves} title={`Eventos del puente (${ev.length} · ${unreadEvents.length} nuevos)`} tone="text-fuchsia-300"
            hint="Feed `/api/starseed/events`: lo mismo que el OS convierte en avisos del centro de notificaciones. Confirmar = ack en el backend."
            right={<button type="button" className={BTN} disabled={busy !== "" || unreadEvents.length === 0} aria-label="Confirmar todos los eventos"
              onClick={() => { void wrap("ack", () => runS158("Eventos confirmados", () => ackAstraura158Events(target, unreadEvents.map((e) => e.id)), { description: (d) => `${d.acked ?? unreadEvents.length} confirmado(s)`, after: afterEvents })); }}><BusyIcon busy={busy === "ack"} icon={Check} /> Confirmar</button>} />
          <div className="mt-2 space-y-1">
            {ev.length === 0 && <Empty loading={events.loading} error={events.error} text={events.error ? "Este backend no trae el puente de eventos (versión anterior)." : "Sin eventos todavía."} />}
            {ev.slice(0, 25).map((e) => (
              <div key={e.id} className={cn("flex items-start gap-2 rounded-md px-2 py-1", !e.acked && !e.read ? "bg-white/[0.04]" : "")}>
                <Zap className={cn("mt-0.5 h-3 w-3 shrink-0", /warn|error|security|high|critical/i.test(String(e.level ?? e.severity ?? "")) ? "text-amber-300" : "text-white/40")} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-white/85">{e.title ?? e.message ?? e.id}</p>
                  {e.title && e.message && <p className="line-clamp-2 text-[10px] text-white/55">{e.message}</p>}
                  <p className={MONO}>{e.source ?? e.process ?? ""} · {fmtAgo(e.ts ?? e.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className={cn(CARD, "p-3")}>
          <SectionTitle icon={Waves} title={`Registro de ramificación (${logs.length})`} tone="text-white/70" hint="Trazas de las ramas y agentes que el backend fue abriendo." />
          <ul className="mt-2 space-y-0.5">
            {logs.slice(-15).reverse().map((l, i) => (
              <li key={l.id ?? i} className="truncate text-[10px] text-white/60"><span className={MONO}>{fmtAgo(l.timestamp)}</span> · {l.agent ? <span className="text-white/80">{l.agent} · </span> : null}{l.title ?? l.message ?? ""}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default NotificacionesTab;
