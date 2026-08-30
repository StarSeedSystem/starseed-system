"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Astraura158Presence — presencia AMBIENTE de Astraura 1.58 en el resto del OS
 * (Ola 5 · Adenda 157; SOP `architecture/astraura-158-ola5-orquestacion.md` §5)
 * ---------------------------------------------------------------------------
 * Dos piezas MÍNIMAS y discretas (NO son notificaciones, no se superponen a
 * nada, sin toasts, sin `notifyFromApp`):
 *
 *   · `Astraura158PresenceBar` — tira compacta para el Exocórtex:
 *     «N procesos activos · M agentes vivos · K aprobaciones pendientes»,
 *     con puntos de estado y enlaces a Orquestación / Imaginación /
 *     Notificaciones, más un botón directo al agente en curso (si lo hay).
 *   · `Astraura158PresenceDot` — versión mínima (un punto + número) para la
 *     orbe: tooltip accesible con el mismo resumen y clic que abre la
 *     Orquestación.
 *
 * DATOS: ambas leen el feed vivo (`useAstraura158Feed`, ya montado en
 * `app-globals.tsx`) — de ahí toman el TARGET (local/nube) ya descubierto y,
 * en la tira, el contador `unread` real para la insignia de Notificaciones —
 * más un sondeo propio LIGERO (un singleton de módulo, una sola llamada de
 * red para toda la app sin importar cuántas tiras/puntos estén montados a la
 * vez) a `fetchAstraura158Processes` / `fetchAstraura158Swarm` cada
 * `ASTRAURA_158_FEED_MS` (30 s), pausado con `document.hidden`. Si el feed no
 * conoce un backend vivo, este sondeo no llama a nada (cero ruido); si ambas
 * llamadas fallan, se limpia el estado y ambos componentes no pintan nada.
 *
 * HONESTIDAD: «K aprobaciones pendientes» se deriva escaneando las claves
 * numéricas de cada proceso (`Astraura158ProcessSummary` y su `.counters`)
 * que "suenan" a pendiente/aprobación (`/pend|aprob|approv/i`) — el puente
 * `/api/starseed/processes` no fija un nombre de campo único para esto y este
 * módulo nunca inventa un número: si el backend no expone ninguna clave así,
 * el resultado es un 0 honesto, no un dato inventado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Bot, Wand2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchAstraura158Processes,
  fetchAstraura158Swarm,
  type Astraura158ProcessSummary,
  type Astraura158SwarmAgent,
  type Astraura158SwarmStatus,
  type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { ASTRAURA_158_FEED_MS, getAstraura158FeedState, useAstraura158Feed } from "@/lib/astraura/astraura-158-feed";
import { openAstraura158Window } from "@/components/astraura/window/astraura-158-window-bus";

/* ─────────────────── deep-links del Studio 1.58 (SOP §5) ─────────────────── */

const ORQUESTACION_HREF = "/agent?tab=astraura-158&sub=orquestacion";
// (Adenda 178) La barra de procesos activos lleva a la SECCIÓN PRINCIPAL de
// Imaginación Intuitiva (página propia `/imaginacion`, Ola 6), no a la sub-pestaña.
const IMAGINACION_HREF = "/imaginacion";
const NOTIFICACIONES_HREF = "/agent?tab=astraura-158&sub=notificaciones";

/* ═══════════════════ sondeo propio, ligero (singleton de módulo) ═══════════════════
 * Mismo patrón que `astraura-158-feed.ts`: estado de módulo + evento custom +
 * hook de lectura. Ref-contado (`presenceSubscribers`) para que el temporizador
 * viva mientras HAYA al menos una tira/punto montado en cualquier pantalla, y
 * se detenga limpio cuando el último se desmonta.
 */

interface Astraura158PresenceState {
  /** true = el último sondeo obtuvo al menos un dato real (procesos o enjambre). */
  ok: boolean;
  target: Astraura158Target | null;
  processes: Astraura158ProcessSummary[];
  swarm: Astraura158SwarmStatus | null;
}

const PRESENCE_POLL_EVENT = "starseed:astraura158-presence-poll";
const EMPTY_PRESENCE: Astraura158PresenceState = { ok: false, target: null, processes: [], swarm: null };
const presenceState: Astraura158PresenceState = { ...EMPTY_PRESENCE };

let presenceTimer = 0;
let presenceRunning = false;
let presenceTicking = false;
let presenceSubscribers = 0;
let presenceLastAt = 0;
let presenceVisCleanup: (() => void) | null = null;

function emitPresence(): void {
  try {
    window.dispatchEvent(new CustomEvent<Astraura158PresenceState>(PRESENCE_POLL_EVENT, { detail: { ...presenceState } }));
  } catch { /* la presencia nunca rompe la pantalla que la monta */ }
}

function clearPresence(): void {
  presenceState.ok = false;
  presenceState.target = null;
  presenceState.processes = [];
  presenceState.swarm = null;
}

async function presenceTick(): Promise<void> {
  if (presenceTicking || typeof window === "undefined") return;
  // Reutiliza el TARGET que el feed vivo ya descubrió — cero lógica de
  // descubrimiento local/nube duplicada aquí (es la fuente de verdad única).
  const target = getAstraura158FeedState().target;
  presenceLastAt = Date.now();
  if (!target) {
    if (presenceState.ok) { clearPresence(); emitPresence(); }
    return;
  }
  presenceTicking = true;
  try {
    const [p, s] = await Promise.all([fetchAstraura158Processes(target), fetchAstraura158Swarm(target)]);
    if (!p.ok && !s.ok) {
      clearPresence();
    } else {
      presenceState.ok = true;
      presenceState.target = target;
      if (p.ok) presenceState.processes = p.data;
      if (s.ok) presenceState.swarm = s.data;
    }
    emitPresence();
  } finally {
    presenceTicking = false;
  }
}

/** Arranca el sondeo (singleton, idempotente). Devuelve stop(). */
function startPresencePoll(): () => void {
  if (typeof window === "undefined") return () => {};
  if (presenceRunning) return stopPresencePoll;
  presenceRunning = true;
  const loop = () => { if (!document.hidden) void presenceTick(); };
  // Pequeño margen tras el montaje (deja que el feed vivo descubra el backend
  // primero) y luego cada ASTRAURA_158_FEED_MS, igual que el feed.
  presenceTimer = window.setTimeout(() => {
    loop();
    presenceTimer = window.setInterval(loop, ASTRAURA_158_FEED_MS) as unknown as number;
  }, 5_000) as unknown as number;
  const onVisible = () => { if (!document.hidden && Date.now() - presenceLastAt > ASTRAURA_158_FEED_MS) void presenceTick(); };
  document.addEventListener("visibilitychange", onVisible);
  presenceVisCleanup = () => document.removeEventListener("visibilitychange", onVisible);
  return stopPresencePoll;
}

function stopPresencePoll(): void {
  if (presenceTimer) { window.clearTimeout(presenceTimer); window.clearInterval(presenceTimer); presenceTimer = 0; }
  presenceVisCleanup?.();
  presenceVisCleanup = null;
  presenceRunning = false;
}

function getPresenceSnapshot(): Astraura158PresenceState {
  return { ...presenceState, processes: [...presenceState.processes] };
}

/** Hook interno compartido: arranca el singleton (ref-contado) y se suscribe. */
function useAstraura158Presence(): Astraura158PresenceState {
  const [snap, setSnap] = useState<Astraura158PresenceState>(() => getPresenceSnapshot());
  useEffect(() => {
    presenceSubscribers += 1;
    const stop = startPresencePoll();
    const onPoll = (e: Event) => {
      const detail = (e as CustomEvent<Astraura158PresenceState>).detail;
      setSnap(detail ? { ...detail } : getPresenceSnapshot());
    };
    window.addEventListener(PRESENCE_POLL_EVENT, onPoll);
    setSnap(getPresenceSnapshot()); // por si otro consumidor ya había sondeado antes de este montaje
    return () => {
      window.removeEventListener(PRESENCE_POLL_EVENT, onPoll);
      presenceSubscribers = Math.max(0, presenceSubscribers - 1);
      if (presenceSubscribers === 0) stop();
    };
  }, []);
  return snap;
}

/* ═══════════════════ heurísticas honestas (nunca inventan un dato) ═══════════════════ */

/** ¿Este proceso resumido está activo? Mismo criterio que la pestaña «Resumen». */
function isProcessActive(p: Astraura158ProcessSummary): boolean {
  if (typeof p.running === "boolean") return p.running;
  if (typeof p.enabled === "boolean") return p.enabled;
  return /active|running|online|on|enabled|ok|dreaming|busy/i.test(String(p.status ?? ""));
}

/** ¿Este agente del enjambre está trabajando ahora? Mismo criterio que Orquestación. */
function isAgentWorking(a: Astraura158SwarmAgent): boolean {
  return /running|active|busy|trabajando|working|ejecut/i.test(String(a.status ?? ""));
}

/** Suma valores numéricos de claves que "suenan" a pendiente/aprobación. */
function sumPendingLike(obj: Record<string, unknown> | null | undefined): number {
  if (!obj || typeof obj !== "object") return 0;
  let total = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!/pend|aprob|approv/i.test(k)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

interface Astraura158PresenceCounts {
  processesActive: number;
  agentsLive: number;
  pendingApprovals: number;
  workingAgent: Astraura158SwarmAgent | null;
}

function deriveCounts(state: Astraura158PresenceState): Astraura158PresenceCounts {
  const processesActive = state.processes.filter(isProcessActive).length;

  let pendingApprovals = 0;
  for (const p of state.processes) {
    pendingApprovals += sumPendingLike(p as unknown as Record<string, unknown>);
    if (p.counters) pendingApprovals += sumPendingLike(p.counters);
  }

  const swarm = state.swarm;
  const agents = swarm?.agents ?? [];
  let workingAgent: Astraura158SwarmAgent | null = agents.find(isAgentWorking) ?? null;

  let agentsLive: number;
  if (swarm && typeof swarm.total_active_agents === "number" && Number.isFinite(swarm.total_active_agents)) {
    agentsLive = Math.max(0, Math.round(swarm.total_active_agents));
  } else if (agents.length) {
    agentsLive = agents.filter(isAgentWorking).length;
  } else {
    const ids = new Set<string>();
    for (const t of swarm?.active_tasks ?? []) {
      if (t.status === "running" && t.agent_id) ids.add(t.agent_id);
    }
    agentsLive = ids.size;
  }

  // Sin agente "vivo" explícito en la lista del enjambre: si hay una tarea en
  // curso con agente asociado, sintetiza un agente mínimo desde la tarea
  // (mismo `id` que usa la ventana universal para abrirlo).
  if (!workingAgent) {
    const task = (swarm?.active_tasks ?? []).find((t) => t.status === "running" && !!t.agent_id);
    if (task && task.agent_id) {
      workingAgent = { id: task.agent_id, name: task.agent_name ?? task.agent_id, status: "running" };
    }
  }

  return { processesActive, agentsLive, pendingApprovals, workingAgent };
}

function summaryText(c: Astraura158PresenceCounts, unread?: number): string {
  const base = `${c.processesActive} proceso(s) activo(s) · ${c.agentsLive} agente(s) vivo(s) · ${c.pendingApprovals} aprobación(es) pendiente(s)`;
  return unread && unread > 0 ? `${base} · ${unread} notificación(es) sin leer` : base;
}

/* ═══════════════════ piezas visuales compartidas (Crystal Liquid Glass) ═══════════════════ */

type PresenceTone = "emerald" | "cyan" | "amber";

const TONE_DOT: Record<PresenceTone | "muted", string> = {
  emerald: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
  cyan: "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]",
  amber: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
  muted: "bg-white/25",
};

const TONE_BADGE: Record<PresenceTone, string> = {
  emerald: "border-emerald-300/50 bg-emerald-500/90 text-emerald-950",
  cyan: "border-cyan-300/50 bg-cyan-500/90 text-cyan-950",
  amber: "border-amber-300/50 bg-amber-500/95 text-amber-950",
};

const PILL_LINK =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/80 transition-colors hover:border-cyan-400/40 hover:text-cyan-100 cursor-pointer";

function PresenceStatusDot({ tone, active }: { tone: PresenceTone; active: boolean }) {
  return <span aria-hidden className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", active ? TONE_DOT[tone] : TONE_DOT.muted)} />;
}

/* ═══════════════════════════════ Astraura158PresenceBar ═══════════════════════════════ */

/**
 * Tira compacta y discreta para el Exocórtex — NO es una notificación, no se
 * superpone a nada (fluye en el documento como una línea más bajo la
 * cabecera). No pinta nada si el backend 1.58 no responde.
 */
export function Astraura158PresenceBar({ className }: { className?: string }) {
  const feed = useAstraura158Feed();
  const presence = useAstraura158Presence();
  const counts = useMemo(() => deriveCounts(presence), [presence]);

  if (!presence.ok) return null; // cero ruido: sin backend vivo, no hay tira

  const { processesActive, agentsLive, pendingApprovals, workingAgent } = counts;
  const summary = summaryText(counts, feed.unread);

  return (
    <div
      className={cn(
        "flex w-full max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md",
        className,
      )}
    >
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label={`Presencia Astraura 1.58: ${summary}.`}>
        <span aria-hidden className="inline-flex items-center gap-1.5">
          <PresenceStatusDot tone="emerald" active={processesActive > 0} />
          <span className="font-medium text-white/85">{processesActive}</span> procesos activos
        </span>
        <span aria-hidden className="text-white/25">·</span>
        <span aria-hidden className="inline-flex items-center gap-1.5">
          <PresenceStatusDot tone="cyan" active={agentsLive > 0} />
          <span className="font-medium text-white/85">{agentsLive}</span> agentes vivos
        </span>
        <span aria-hidden className="text-white/25">·</span>
        <span aria-hidden className="inline-flex items-center gap-1.5">
          <PresenceStatusDot tone="amber" active={pendingApprovals > 0} />
          <span className="font-medium text-white/85">{pendingApprovals}</span> aprobaciones pendientes
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
        <Link href={ORQUESTACION_HREF} aria-label="Abrir el centro de Orquestación de Astraura 1.58" className={PILL_LINK}>
          <Workflow className="h-3 w-3" aria-hidden /> Orquestación
        </Link>
        <Link href={IMAGINACION_HREF} aria-label="Abrir Imaginación de Astraura 1.58" className={PILL_LINK}>
          <Wand2 className="h-3 w-3" aria-hidden /> Imaginación
        </Link>
        <Link
          href={NOTIFICACIONES_HREF}
          aria-label={feed.unread > 0 ? `Abrir Notificaciones de Astraura 1.58, ${feed.unread} sin leer` : "Abrir Notificaciones de Astraura 1.58"}
          className={PILL_LINK}
        >
          <Bell className="h-3 w-3" aria-hidden /> Notificaciones
          {feed.unread > 0 && (
            <span aria-hidden className="ml-0.5 rounded-full bg-rose-500/90 px-1.5 text-[10px] font-semibold text-white">
              {feed.unread > 99 ? "99+" : feed.unread}
            </span>
          )}
        </Link>
        {workingAgent && (
          <button
            type="button"
            onClick={() => openAstraura158Window({ kind: "agente", id: workingAgent.id, target: presence.target ?? undefined })}
            aria-label={`Abrir la ventana del agente ${workingAgent.name}, en curso ahora mismo`}
            className={PILL_LINK}
          >
            <Bot className="h-3 w-3" aria-hidden /> <span className="max-w-[9rem] truncate">{workingAgent.name}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ Astraura158PresenceDot ═══════════════════════════════ */

/**
 * Versión mínima (un punto + número) para la orbe de Aurora: tooltip
 * accesible con el resumen completo y clic que abre la Orquestación. Se
 * incrusta como HERMANO del núcleo visual de `AuroraOrb` (no descendiente
 * suyo, que va `aria-hidden`) para conservar su propio nombre accesible y
 * foco de teclado.
 *
 * En el widget flotante, `AuroraOrb` vive DENTRO de un `<button>` real (el
 * propio orbe, arrastrable) — anidar aquí OTRO `<button>` sería HTML
 * inválido. Por eso usa `role="button"` sobre un `<span>` con manejo de
 * teclado propio, y detiene la propagación de sus punteros/clics para no
 * disparar el arrastre ni el menú Trinity del orbe que lo envuelve.
 */
export function Astraura158PresenceDot({ className }: { className?: string }) {
  const feed = useAstraura158Feed();
  const presence = useAstraura158Presence();
  const router = useRouter();
  const counts = useMemo(() => deriveCounts(presence), [presence]);

  const activate = useCallback((e: { stopPropagation: () => void; preventDefault?: () => void }) => {
    e.stopPropagation();
    router.push(ORQUESTACION_HREF);
  }, [router]);

  if (!presence.ok) return null; // cero ruido: sin backend vivo, no hay punto

  const { processesActive, agentsLive, pendingApprovals } = counts;
  const total = processesActive + agentsLive + pendingApprovals;
  const tone: PresenceTone = pendingApprovals > 0 ? "amber" : agentsLive > 0 ? "cyan" : "emerald";
  const label = `Astraura 1.58: ${summaryText(counts, feed.unread)}. Toca para abrir Orquestación.`;

  return (
    <span
      role="button"
      tabIndex={0}
      title={label}
      aria-label={label}
      onClick={activate}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          activate(e);
        }
      }}
      className={cn(
        "absolute -top-1 -left-1 z-[2] grid h-4 w-4 select-none place-items-center rounded-full border text-[9px] font-semibold leading-none shadow-[0_0_8px_rgba(0,0,0,0.35)] cursor-pointer",
        TONE_BADGE[tone],
        className,
      )}
    >
      {total > 9 ? "9+" : total}
    </span>
  );
}
