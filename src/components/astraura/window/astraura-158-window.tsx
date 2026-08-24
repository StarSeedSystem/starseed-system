"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Astraura158Window — la VENTANA UNIVERSAL de entidad (Ola 5 · Adenda 157, SOP §1)
 * ---------------------------------------------------------------------------
 * Una sola ventana para `proceso · agente · personalidad · cerebro · proyecto
 * · creacion · rama`, con pestañas **Resumen · Ramas & Logs · Ajustes · Hablar
 * en Vivo**, cargando SIEMPRE el detalle real por entidad con las funciones ya
 * existentes de `astraura-158-client.ts` — nunca inventa un endpoint: cuando
 * algo no existe para un `kind`, la pestaña lo dice con honestidad (`Empty`).
 *
 * Mismo lenguaje visual que el resto del Studio 1.58 (Crystal Liquid Glass):
 * reutiliza las clases/componentes de `s158/shared.tsx` en vez de duplicarlos.
 *
 * Dos modos:
 *   · `embedded` (usado por `/agent/astraura/[kind]/[id]`) — solo cabecera +
 *     pestañas + contenido, sin overlay.
 *   · superpuesta (`embedded=false`, la usa `Astraura158WindowHost`) — overlay
 *     centrado con tamaño S/M/L/completa, arrastre de altura, `role="dialog"`
 *     / `aria-modal` y cierre con Escape. El cierre por Escape se resuelve con
 *     el propio DOM: el panel se enfoca al montar y escucha `onKeyDown` en SÍ
 *     MISMO (no en `window`), así que con varias ventanas apiladas SOLO la que
 *     tiene el foco (la última abierta) responde a Escape — sin acoplarse al
 *     anfitrión.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity, Bot, Brain, Cpu, ExternalLink, FolderKanban, GitBranch, GitCommitHorizontal, Layers,
  Link2, Maximize2, MessageCircle, Minimize2, RefreshCw, Settings2, ShieldCheck, Sparkles, Wand2, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  activateAstraura158Brain, activateAstraura158Personality, fetchAstraura158Agent, fetchAstraura158AgentApiStatus,
  fetchAstraura158Creation, fetchAstraura158EcosystemAgent, fetchAstraura158ImaginationStatus, fetchAstraura158Manifest,
  fetchAstraura158PersonalityApiStatus, fetchAstraura158Process, fetchAstraura158ProcessBranches, fetchAstraura158Project,
  fetchAstraura158SynapticTree, setAstraura158AgentConcurrency, toggleAstraura158Agent, toggleAstraura158AgentImagination,
  updateAstraura158AgentImaginationConfig, updateAstraura158ProcessConfig, updateAstraura158ProcessPolicy,
  type Astraura158AgentDetail, type Astraura158Branch, type Astraura158Brain, type Astraura158CreationItem,
  type Astraura158EcosystemAgent, type Astraura158PermissionPolicy, type Astraura158Personality, type Astraura158Project,
  type Astraura158ProcessType, type Astraura158SynapticTree, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import {
  BTN, BTN_PRIMARY, Badge, Bar, BusyIcon, CARD, Empty, Field, INPUT, MONO, PERMISSION_LABEL, PERMISSION_LEVEL_IDS,
  SELECT, SUB, SectionTitle, Stat, clampInt, fmtAgo, levelTone, runS158, useBusy,
} from "@/components/astraura/s158/shared";
import { LiveTalk } from "./live-talk";
import {
  ASTRAURA_158_WINDOW_TABS, astraura158WindowHref,
  type Astraura158EntityKind, type Astraura158WindowTab,
} from "./astraura-158-window-bus";

export interface Astraura158WindowProps {
  kind: Astraura158EntityKind;
  id: string;
  target: Astraura158Target;
  initialTab?: Astraura158WindowTab;
  onClose?: () => void;
  /** true = solo cabecera + pestañas (página completa); false = overlay superpuesto. */
  embedded?: boolean;
}

/* ════════════════════════════ Metadatos por kind ═══════════════════════════ */

const KIND_META: Record<Astraura158EntityKind, { icon: LucideIcon; label: string }> = {
  proceso: { icon: Wand2, label: "Proceso" },
  agente: { icon: Bot, label: "Agente" },
  personalidad: { icon: Sparkles, label: "Personalidad" },
  cerebro: { icon: Brain, label: "Cerebro" },
  proyecto: { icon: FolderKanban, label: "Proyecto" },
  creacion: { icon: Layers, label: "Creación" },
  rama: { icon: GitCommitHorizontal, label: "Rama" },
};

const TAB_META: Record<Astraura158WindowTab, { icon: LucideIcon; label: string }> = {
  resumen: { icon: Activity, label: "Resumen" },
  ramas: { icon: GitBranch, label: "Ramas & Logs" },
  ajustes: { icon: Settings2, label: "Ajustes" },
  vivo: { icon: MessageCircle, label: "Hablar en Vivo" },
};

const IMAGINATION_FREQUENCIES = ["cada_ciclo", "frecuente", "normal", "ocasional", "solo_manual"] as const;

/* ════════════════════════════ Carga del detalle real ═══════════════════════
 * UNA sola forma (unión discriminada por `kind`) para las 7 entidades — así el
 * resto del componente narrowea con TypeScript sin casts. Cada rama usa SOLO
 * funciones ya existentes del cliente; si el backend no tiene nada para una
 * entidad, se devuelve un error honesto (nunca se inventa un endpoint).
 * ═══════════════════════════════════════════════════════════════════════════ */

type EntityState =
  | { kind: "proceso"; process: Astraura158ProcessType; progressPercent: number; policy: Astraura158PermissionPolicy }
  | { kind: "agente"; origin: "vault"; agent: Astraura158AgentDetail }
  | { kind: "agente"; origin: "ecosystem"; agent: Astraura158EcosystemAgent }
  | { kind: "personalidad"; personality: Astraura158Personality; active: boolean }
  | { kind: "cerebro"; brain: Astraura158Brain; active: boolean }
  | { kind: "proyecto"; project: Astraura158Project }
  | { kind: "creacion"; creation: Astraura158CreationItem }
  | { kind: "rama"; branch: Astraura158Branch };

type LoadResult = { ok: true; data: EntityState } | { ok: false; error: string };

async function loadEntityState(target: Astraura158Target, kind: Astraura158EntityKind, id: string): Promise<LoadResult> {
  switch (kind) {
    case "proceso": {
      const r = await fetchAstraura158Process(target, id);
      if (!r.ok) return { ok: false, error: r.error };
      if (!r.data.process) return { ok: false, error: "El backend no encontró este proceso." };
      const policy = r.data.process.permission_policy ?? r.data.permission_policy ?? {};
      return { ok: true, data: { kind: "proceso", process: r.data.process, progressPercent: r.data.progress_percent ?? r.data.process.allocated_resource_percent ?? 0, policy } };
    }
    case "agente": {
      const vault = await fetchAstraura158Agent(target, id);
      if (vault.ok && vault.data.agent) return { ok: true, data: { kind: "agente", origin: "vault", agent: vault.data.agent } };
      const eco = await fetchAstraura158EcosystemAgent(target, id);
      if (eco.ok && eco.data.agent) return { ok: true, data: { kind: "agente", origin: "ecosystem", agent: eco.data.agent } };
      return { ok: false, error: !vault.ok ? vault.error : !eco.ok ? eco.error : "No encontré este agente ni en la bóveda ni en el ecosistema." };
    }
    case "personalidad": {
      const r = await fetchAstraura158Manifest(target);
      if (!r.ok) return { ok: false, error: r.error };
      const p = r.data.personalities.find((x) => x.id === id);
      if (!p) return { ok: false, error: "El backend no reporta esta personalidad en su manifiesto." };
      return { ok: true, data: { kind: "personalidad", personality: p, active: r.data.activePersona === id } };
    }
    case "cerebro": {
      const r = await fetchAstraura158Manifest(target);
      if (!r.ok) return { ok: false, error: r.error };
      const b = r.data.brains.find((x) => x.id === id);
      if (!b) return { ok: false, error: "El backend no reporta este cerebro en su manifiesto." };
      return { ok: true, data: { kind: "cerebro", brain: b, active: r.data.activeBrain === id } };
    }
    case "proyecto": {
      const r = await fetchAstraura158Project(target, id);
      if (!r.ok) return { ok: false, error: r.error };
      if (!r.data.project) return { ok: false, error: r.data.error || "El backend no encontró este proyecto." };
      return { ok: true, data: { kind: "proyecto", project: r.data.project } };
    }
    case "creacion": {
      const r = await fetchAstraura158Creation(target, id);
      if (!r.ok) return { ok: false, error: r.error };
      if (!r.data.creation) return { ok: false, error: r.data.error || "El backend no encontró esta creación." };
      return { ok: true, data: { kind: "creacion", creation: r.data.creation } };
    }
    case "rama": {
      // No hay endpoint dedicado a UNA rama suelta: se busca entre las ramas
      // recientes del estado de imaginación (real, existente — no se inventa nada).
      const r = await fetchAstraura158ImaginationStatus(target);
      if (!r.ok) return { ok: false, error: r.error };
      const b = (r.data.branches ?? []).find((x) => x.id === id);
      if (!b) return { ok: false, error: "No encontré esta rama entre las recientes: el backend solo guarda un histórico corto." };
      return { ok: true, data: { kind: "rama", branch: b } };
    }
    default:
      return { ok: false, error: "Tipo de entidad desconocido." };
  }
}

/* ════════════════════════════ Resumen: identidad derivada ══════════════════ */

interface EntityMetric { label: string; value: string; hint?: string }
interface EntityLinked { label: string; items: string[] }
interface EntitySummary {
  name: string;
  subtitle?: string;
  color?: string;
  status?: string;
  description?: string;
  extra?: string;
  metrics: EntityMetric[];
  linked: EntityLinked[];
  personaId?: string;
}

function summarizeEntity(state: EntityState): EntitySummary {
  switch (state.kind) {
    case "proceso": {
      const p = state.process;
      const level = state.policy.level ?? p.default_permission_level ?? "always_ask";
      const active = /active|running|on/i.test(String(p.status ?? "active")) && !p.is_auto_paused_by_limit;
      return {
        name: p.name || p.id,
        subtitle: p.category,
        color: p.color,
        status: p.is_auto_paused_by_limit ? "pausado por límite" : active ? "activo" : "en pausa",
        description: p.description,
        metrics: [
          { label: "CPU asignada", value: `${p.allocated_resource_percent ?? 0}%` },
          { label: "Progreso del ciclo", value: `${Math.round(state.progressPercent)}%` },
          { label: "Ciclos completados", value: String(p.cycles_count ?? 0) },
          { label: "Pendientes de aprobación", value: String(p.pending_proposals_count ?? 0) },
          { label: "Nivel de permisos", value: PERMISSION_LABEL[level] ?? level },
        ],
        linked: [],
      };
    }
    case "agente": {
      if (state.origin === "vault") {
        const a = state.agent;
        return {
          name: a.name || a.id,
          subtitle: a.role ?? a.area,
          color: a.color,
          status: a.status ?? (a.enabled === false ? "inactivo" : "activo"),
          description: a.description,
          metrics: [
            { label: "Imaginación", value: a.imagination_enabled ? "activada" : "desactivada" },
            { label: "Frecuencia", value: a.imagination_frequency ?? "—" },
            { label: "Cuota de CPU", value: `${a.cpu_quota_percent ?? 0}%` },
            { label: "Concurrencia", value: String(a.concurrency ?? 1) },
          ],
          linked: [
            ...(a.used_personalities?.length ? [{ label: "Personalidades usadas", items: a.used_personalities.map((p) => p.name) }] : []),
            ...(a.linked_cerebros?.length ? [{ label: "Cerebros vinculados", items: a.linked_cerebros.map((c) => c.name ?? c.id) }] : []),
            ...(a.skills?.length ? [{ label: "Habilidades", items: a.skills }] : []),
          ],
          personaId: a.used_personalities?.[0]?.id,
        };
      }
      const a = state.agent;
      return {
        name: a.name || a.id,
        subtitle: a.role ?? a.area ?? a.section,
        color: a.color,
        status: a.status ?? (a.enabled === false ? "inactivo" : "activo"),
        metrics: [
          { label: "Sección", value: a.section ?? "—" },
          { label: "Configurable", value: a.configurable ? "sí" : "no" },
          { label: "Ocupado", value: a.is_busy ? "sí" : "no" },
        ],
        linked: [
          ...(a.used_personalities?.length ? [{ label: "Personalidades usadas", items: a.used_personalities.map((p) => p.name) }] : []),
        ],
        personaId: a.used_personalities?.[0]?.id,
      };
    }
    case "personalidad": {
      const p = state.personality;
      return {
        name: p.name || p.id,
        subtitle: p.title,
        color: p.color,
        status: state.active ? "activa (principal del OS)" : "disponible",
        description: p.description,
        metrics: [
          ...(typeof p.temperature === "number" ? [{ label: "Temperatura", value: p.temperature.toFixed(2) }] : []),
          { label: "Origen", value: p.is_custom ? "personalizada" : "de fábrica" },
        ],
        linked: [...(p.tags?.length ? [{ label: "Etiquetas", items: p.tags }] : [])],
        personaId: p.id,
      };
    }
    case "cerebro": {
      const b = state.brain;
      return {
        name: b.name || b.id,
        subtitle: b.role ?? b.scope,
        color: b.color,
        status: state.active ? "activo (principal del OS)" : "disponible",
        metrics: [
          ...(b.active_persona ? [{ label: "Personalidad activa", value: b.active_persona }] : []),
          { label: "Neuronas de memoria", value: String(b.memory_neurons?.length ?? 0) },
          { label: "Capas de contexto", value: String(Object.keys(b.md_layers ?? {}).length) },
        ],
        linked: [...(b.linked_personalities?.length ? [{ label: "Personalidades vinculadas", items: b.linked_personalities }] : [])],
        personaId: b.active_persona,
      };
    }
    case "proyecto": {
      const p = state.project;
      return {
        name: p.name || p.id,
        subtitle: p.type,
        status: p.status,
        description: p.description,
        metrics: [
          ...(p.priority ? [{ label: "Prioridad", value: p.priority }] : []),
          ...(typeof p.progress === "number" ? [{ label: "Progreso", value: `${Math.round(p.progress)}%` }] : []),
          ...(p.current_version ? [{ label: "Versión actual", value: p.current_version }] : []),
        ],
        linked: [
          ...(p.linked_agents?.length ? [{ label: "Agentes vinculados", items: p.linked_agents }] : []),
          ...(p.linked_personalities?.length ? [{ label: "Personalidades vinculadas", items: p.linked_personalities }] : []),
          ...(p.linked_cerebros?.length ? [{ label: "Cerebros vinculados", items: p.linked_cerebros }] : []),
          ...(p.linked_creations?.length ? [{ label: "Creaciones vinculadas", items: p.linked_creations }] : []),
        ],
      };
    }
    case "creacion": {
      const c = state.creation;
      return {
        name: c.title || c.id,
        subtitle: c.category,
        status: c.format_type,
        description: c.summary,
        metrics: [
          ...(c.current_version ? [{ label: "Versión", value: c.current_version }] : []),
          ...(c.brain_name ? [{ label: "Cerebro", value: c.brain_name }] : []),
          ...(c.agent_name ? [{ label: "Agente", value: c.agent_name }] : []),
          ...(c.process_name ? [{ label: "Proceso de origen", value: c.process_name }] : []),
        ],
        linked: [...(c.linked_projects?.length ? [{ label: "Proyectos vinculados", items: c.linked_projects }] : [])],
      };
    }
    case "rama": {
      const b = state.branch;
      return {
        name: b.theme || b.id,
        subtitle: b.process_name ?? b.process_type,
        status: b.status,
        description: b.hypothesis,
        extra: b.insights,
        metrics: [
          ...(typeof b.progress_percent === "number" ? [{ label: "Progreso", value: `${Math.round(b.progress_percent)}%` }] : []),
          ...(b.importance_level ? [{ label: "Importancia", value: b.importance_level }] : []),
          ...(b.applied_by ? [{ label: "Aplicada por", value: b.applied_by }] : []),
        ],
        linked: [],
      };
    }
  }
}

function deriveContextLines(kindLabel: string, s: EntitySummary): string[] {
  const lines: string[] = [`Tipo de entidad: ${kindLabel}.`];
  if (s.status) lines.push(`Estado actual: ${s.status}.`);
  if (s.subtitle) lines.push(s.subtitle);
  if (s.description) lines.push(s.description);
  if (s.extra) lines.push(s.extra);
  for (const m of s.metrics) lines.push(`${m.label}: ${m.value}${m.hint ? ` (${m.hint})` : ""}.`);
  for (const l of s.linked) if (l.items.length) lines.push(`${l.label}: ${l.items.join(", ")}.`);
  return lines;
}

/* ════════════════════════════ Carga perezosa por pestaña ═══════════════════
 * Para «Ramas & Logs»: proceso y cerebro necesitan UNA llamada aparte (sus
 * ramas / su árbol sináptico). Se piden solo la primera vez que se visita la
 * pestaña para esa combinación (target,id) — no en cada cambio de pestaña.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface LazyState<T> { loading: boolean; error: string; data: T | null }

function useLazyOnTab<T>(active: boolean, key: string, fetcher: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>): LazyState<T> {
  const [state, setState] = useState<LazyState<T>>({ loading: false, error: "", data: null });
  const doneKeyRef = useRef("");
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  useEffect(() => {
    if (!active || doneKeyRef.current === key) return;
    doneKeyRef.current = key;
    let alive = true;
    setState({ loading: true, error: "", data: null });
    void fetcherRef.current().then((r) => {
      if (!alive) return;
      if (r.ok) setState({ loading: false, error: "", data: r.data });
      else setState({ loading: false, error: r.error, data: null });
    });
    return () => {
      alive = false;
    };
  }, [active, key]);
  return state;
}

/* ════════════════════════════ Ramas & Logs — piezas por kind ═══════════════ */

function branchGeneratedBy(b: Astraura158Branch): "llm" | "template" | undefined {
  const v = (b as unknown as Record<string, unknown>).generated_by;
  return v === "llm" ? "llm" : v === "template" ? "template" : undefined;
}

function GeneratedByBadge({ b }: { b: Astraura158Branch }) {
  const gen = branchGeneratedBy(b);
  if (!gen) return <Badge tone="border-white/10 text-white/50">origen sin dato</Badge>;
  return (
    <Badge tone={gen === "llm" ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200"}>
      {gen === "llm" ? "modelo real" : "plantilla"}
    </Badge>
  );
}

function BranchLogCard({ b }: { b: Astraura158Branch }) {
  return (
    <div className={cn(SUB, "space-y-1 px-3 py-2")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{b.theme ?? b.id}</p>
        <GeneratedByBadge b={b} />
        {b.status && <Badge tone={levelTone(b.status)}>{b.status}</Badge>}
      </div>
      {b.hypothesis && (
        <p className="text-[10px] leading-snug text-white/65">
          <span className="text-white/40">Hipótesis · </span>
          {b.hypothesis}
        </p>
      )}
      {b.insights && (
        <p className="line-clamp-3 text-[10px] leading-snug text-white/55">
          <span className="text-white/40">Insights · </span>
          {b.insights}
        </p>
      )}
      {typeof b.progress_percent === "number" && b.progress_percent < 100 && <Bar value={b.progress_percent} />}
      <p className={MONO}>
        {b.formatted_time ?? fmtAgo(b.timestamp)}
        {b.applied_by ? ` · aplicada por ${b.applied_by}` : ""}
        {b.verification?.is_verified ? ` · verificada${typeof b.verification.score === "number" ? ` (${b.verification.score})` : ""}` : ""}
      </p>
    </div>
  );
}

function ProcessBranchesPanel({ state }: { state: LazyState<Astraura158Branch[]> }) {
  if (!state.data || state.data.length === 0) return <Empty loading={state.loading} error={state.error} text="Sin ramas todavía para este proceso." />;
  return <div className="grid gap-2 lg:grid-cols-2">{state.data.slice(0, 40).map((b) => <BranchLogCard key={b.id} b={b} />)}</div>;
}

function historyEntryFields(raw: unknown): { title: string; ts?: number; gen?: "llm" | "template" } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title =
    typeof o.title === "string" ? o.title
    : typeof o.summary === "string" ? o.summary
    : typeof o.text === "string" ? o.text
    : typeof o.action === "string" ? o.action
    : JSON.stringify(raw).slice(0, 140);
  const ts = typeof o.timestamp === "number" ? o.timestamp : typeof o.ts === "number" ? o.ts : undefined;
  const gen = o.generated_by === "llm" ? "llm" : o.generated_by === "template" ? "template" : undefined;
  return { title, ts, gen };
}

function AgentHistoryPanel({ history }: { history: unknown[] | undefined }) {
  const items = history ?? [];
  if (items.length === 0) return <Empty text="Sin historial reportado por el backend para este agente." />;
  return (
    <ul className="space-y-1.5">
      {items.slice(0, 40).map((raw, i) => {
        const { title, ts, gen } = historyEntryFields(raw);
        return (
          <li key={i} className={cn(SUB, "flex flex-wrap items-center gap-1.5 px-3 py-1.5")}>
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/80">{title}</span>
            {gen && <Badge tone={gen === "llm" ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200"}>{gen === "llm" ? "modelo real" : "plantilla"}</Badge>}
            {ts && <span className={MONO}>{fmtAgo(ts)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function SynapticTreePanel({ state }: { state: LazyState<Astraura158SynapticTree> }) {
  if (!state.data) return <Empty loading={state.loading} error={state.error} text="El backend no expone la topología sináptica de este cerebro." />;
  const nodes = state.data.nodes ?? [];
  const edges = state.data.edges ?? state.data.links ?? [];
  const top = [...nodes].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 16);
  const statEntries = Object.entries(state.data.stats ?? {}).slice(0, 2);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Nodos" value={nodes.length} />
        <Stat label="Enlaces" value={edges.length} />
        {statEntries.map(([k, v]) => <Stat key={k} label={k} value={String(v)} />)}
      </div>
      {top.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {top.map((n, i) => (
            <Badge key={n.id ?? i} tone="border-violet-400/25 text-violet-100/90">
              {n.label ?? n.id ?? "nodo"}{n.kind ? ` · ${n.kind}` : ""}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelinePanel({ items }: { items: unknown[] | undefined }) {
  const list = items ?? [];
  if (list.length === 0) return <Empty text="Esta creación no tiene ramas de línea de tiempo reportadas." />;
  return (
    <ul className="space-y-1.5">
      {list.slice(0, 40).map((raw, i) => {
        const { title, ts } = historyEntryFields(raw);
        return (
          <li key={i} className={cn(SUB, "flex items-center gap-2 px-3 py-1.5 text-[11px] text-white/80")}>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {ts && <span className={MONO}>{fmtAgo(ts)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function VersionHistoryPanel({ items }: { items: Astraura158Project["version_history"] }) {
  const list = items ?? [];
  if (list.length === 0) return <Empty text="Este proyecto no tiene historial de versiones reportado." />;
  return (
    <ul className="space-y-1.5">
      {list.slice(0, 40).map((v, i) => (
        <li key={i} className={cn(SUB, "px-3 py-1.5")}>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-white/85">{v.version ?? `versión ${i + 1}`}</span>
            {v.author && <span className="text-[10px] text-white/50">· {v.author}</span>}
            {v.timestamp && <span className={cn(MONO, "ml-auto")}>{fmtAgo(v.timestamp)}</span>}
          </div>
          {v.summary && <p className="mt-0.5 text-[10px] leading-snug text-white/60">{v.summary}</p>}
        </li>
      ))}
    </ul>
  );
}

function BranchDetailPanel({ branch }: { branch: Astraura158Branch }) {
  return (
    <div className={cn(SUB, "space-y-1.5 px-3 py-2.5")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {branch.process_name && <Badge tone="border-white/10 text-white/60">{branch.process_name}</Badge>}
        {branch.importance_level && <Badge tone={levelTone(branch.importance_level)}>{branch.importance_level}</Badge>}
        <GeneratedByBadge b={branch} />
        {branch.status && <Badge tone={levelTone(branch.status)}>{branch.status}</Badge>}
      </div>
      {branch.hypothesis && (
        <p className="text-[11px] text-white/70">
          <span className="text-white/40">Hipótesis · </span>
          {branch.hypothesis}
        </p>
      )}
      {branch.insights && (
        <p className="text-[11px] text-white/65">
          <span className="text-white/40">Insights · </span>
          {branch.insights}
        </p>
      )}
      {typeof branch.progress_percent === "number" && <Bar value={branch.progress_percent} />}
      <p className={MONO}>
        {branch.formatted_time ?? fmtAgo(branch.timestamp)}
        {branch.applied_by ? ` · aplicada por ${branch.applied_by}` : ""}
        {branch.permission_policy_applied ? ` · política ${branch.permission_policy_applied}` : ""}
      </p>
    </div>
  );
}

/* ════════════════════════════ Ajustes — piezas por kind ═════════════════════ */

function stringifyApiValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v).slice(0, 140);
  } catch {
    return String(v);
  }
}

/** Estado de API (`api_status`) de una personalidad o un agente: forma libre — se enseña defensivamente. */
function ApiStatusBlock({ target, kind, id }: { target: Astraura158Target; kind: "agente" | "personalidad"; id: string }) {
  const [state, setState] = useState<LazyState<Record<string, unknown>>>({ loading: true, error: "", data: null });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: "", data: null });
    const fetcher = kind === "agente" ? fetchAstraura158AgentApiStatus : fetchAstraura158PersonalityApiStatus;
    void fetcher(target, id).then((r) => {
      if (!alive) return;
      if (r.ok && r.data.detail) setState({ loading: false, error: "", data: r.data.detail });
      else setState({ loading: false, error: r.ok ? r.data.error || "sin detalle" : r.error, data: null });
    });
    return () => {
      alive = false;
    };
  }, [target, kind, id]);

  const entries = state.data ? Object.entries(state.data).slice(0, 20) : [];
  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle icon={ShieldCheck} title="Estado de API" hint="Ámbitos, sincronización y clave (enmascarada) que el backend reporta para esta entidad." />
      {entries.length === 0 && <div className="mt-2"><Empty loading={state.loading} error={state.error} text="El backend no expone estado de API para esta entidad." /></div>}
      {entries.length > 0 && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className={cn(SUB, "px-2.5 py-1.5")}>
              <p className="font-code text-[10px] uppercase tracking-wide text-white/45">{k}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/80" title={stringifyApiValue(v)}>{stringifyApiValue(v)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AjustesCommon { target: Astraura158Target; busy: string; wrap: (label: string, fn: () => Promise<unknown>) => Promise<void>; onChanged: () => void }

function ProcesoAjustes({ process, policy, target, busy, wrap, onChanged }: AjustesCommon & { process: Astraura158ProcessType; policy: Astraura158PermissionPolicy }) {
  const level = policy.level ?? process.default_permission_level ?? "always_ask";
  const active = /active|running|on/i.test(String(process.status ?? "active")) && !process.is_auto_paused_by_limit;
  return (
    <div className={cn(CARD, "space-y-3 p-3")}>
      <SectionTitle icon={Settings2} title="Ajustes del proceso" hint="Nivel de permisos, CPU asignada y estado — lo mismo que edita la pestaña Imaginación." />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-[12px] text-white/80">
          <Switch
            checked={active}
            disabled={busy !== ""}
            aria-label={`${process.name} ${active ? "activo" : "en pausa"}`}
            onCheckedChange={(v) => {
              void wrap("status", () => runS158(`${process.name}: ${v ? "activado" : "pausado"}`, () => updateAstraura158ProcessConfig(target, process.id, { status: v ? "active" : "paused" }), { after: onChanged }));
            }}
          />
          {active ? "activo" : "en pausa"}
        </label>
        <Field label="Nivel de permisos">
          <select
            className={SELECT}
            disabled={busy !== ""}
            value={PERMISSION_LEVEL_IDS.includes(level as (typeof PERMISSION_LEVEL_IDS)[number]) ? level : "always_ask"}
            aria-label="Nivel de permisos del proceso"
            onChange={(e) => {
              void wrap("policy", () => runS158(`Política: ${PERMISSION_LABEL[e.target.value] ?? e.target.value}`, () => updateAstraura158ProcessPolicy(target, process.id, { ...policy, level: e.target.value }), { after: onChanged }));
            }}
          >
            {PERMISSION_LEVEL_IDS.map((lvl) => <option key={lvl} value={lvl}>{PERMISSION_LABEL[lvl] ?? lvl}</option>)}
          </select>
        </Field>
        <Field label="CPU asignada">
          <div className="flex items-center gap-1">
            <input
              type="number" min={1} max={100} defaultValue={process.allocated_resource_percent ?? 10} className={cn(INPUT, "w-16")} disabled={busy !== ""}
              aria-label="Porcentaje de CPU"
              onBlur={(e) => {
                const v = clampInt(e.target.value, 1, 100, process.allocated_resource_percent ?? 10);
                if (v !== (process.allocated_resource_percent ?? 10)) void wrap("cpu", () => runS158(`${v}% de CPU`, () => updateAstraura158ProcessConfig(target, process.id, { allocated_resource_percent: v }), { after: onChanged }));
              }}
            />
            <span className="text-[11px] text-white/50">%</span>
          </div>
        </Field>
      </div>
    </div>
  );
}

function AgenteVaultAjustes({ agent, target, busy, wrap, onChanged }: AjustesCommon & { agent: Astraura158AgentDetail }) {
  const level = agent.imagination_permission_level ?? "always_ask";
  return (
    <div className="space-y-3">
      <div className={cn(CARD, "space-y-3 p-3")}>
        <SectionTitle icon={Settings2} title="Imaginación de fondo del agente" hint="Igual que en Agentes → bóveda: frecuencia, nivel de permisos, cuota de CPU y concurrencia." />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-[12px] text-white/80">
            <Switch
              checked={!!agent.imagination_enabled}
              disabled={busy !== ""}
              aria-label="Imaginación del agente"
              onCheckedChange={(v) => {
                void wrap("imag", () => runS158(`Imaginación ${v ? "activada" : "desactivada"}`, () => toggleAstraura158AgentImagination(target, agent.id, v), { after: onChanged }));
              }}
            />
            imagina de fondo
          </label>
          <Field label="Frecuencia">
            <select
              className={SELECT} disabled={busy !== ""} value={agent.imagination_frequency ?? "normal"} aria-label="Frecuencia de imaginación"
              onChange={(e) => {
                void wrap("freq", () => runS158(`Frecuencia: ${e.target.value}`, () => updateAstraura158AgentImaginationConfig(target, agent.id, { imagination_frequency: e.target.value }), { after: onChanged }));
              }}
            >
              {IMAGINATION_FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
          <Field label="Nivel de permisos">
            <select
              className={SELECT} disabled={busy !== ""}
              value={PERMISSION_LEVEL_IDS.includes(level as (typeof PERMISSION_LEVEL_IDS)[number]) ? level : "always_ask"}
              aria-label="Nivel de permisos del agente"
              onChange={(e) => {
                void wrap("perm", () => runS158(`Permisos: ${PERMISSION_LABEL[e.target.value] ?? e.target.value}`, () => updateAstraura158AgentImaginationConfig(target, agent.id, { imagination_permission_level: e.target.value }), { after: onChanged }));
              }}
            >
              {PERMISSION_LEVEL_IDS.map((lvl) => <option key={lvl} value={lvl}>{PERMISSION_LABEL[lvl] ?? lvl}</option>)}
            </select>
          </Field>
          <Field label="Cuota de CPU">
            <div className="flex items-center gap-1">
              <input
                type="number" min={1} max={100} defaultValue={agent.cpu_quota_percent ?? 10} className={cn(INPUT, "w-16")} disabled={busy !== ""}
                aria-label="Cuota de CPU"
                onBlur={(e) => {
                  const v = clampInt(e.target.value, 1, 100, agent.cpu_quota_percent ?? 10);
                  if (v !== (agent.cpu_quota_percent ?? 10)) void wrap("cpu", () => runS158(`${v}% de CPU`, () => updateAstraura158AgentImaginationConfig(target, agent.id, { cpu_quota_percent: v }), { after: onChanged }));
                }}
              />
              <span className="text-[11px] text-white/50">%</span>
            </div>
          </Field>
          <Field label="Concurrencia">
            <input
              type="number" min={1} max={16} defaultValue={agent.concurrency ?? 1} className={cn(INPUT, "w-16")} disabled={busy !== ""}
              aria-label="Concurrencia del agente"
              onBlur={(e) => {
                const v = clampInt(e.target.value, 1, 16, agent.concurrency ?? 1);
                if (v !== (agent.concurrency ?? 1)) void wrap("conc", () => runS158(`Concurrencia: ${v}`, () => setAstraura158AgentConcurrency(target, agent.id, v), { after: onChanged }));
              }}
            />
          </Field>
        </div>
      </div>
      <ApiStatusBlock target={target} kind="agente" id={agent.id} />
    </div>
  );
}

function AgenteEcosistemaAjustes({ agent, target, busy, wrap, onChanged }: AjustesCommon & { agent: Astraura158EcosystemAgent }) {
  return (
    <div className="space-y-3">
      <div className={cn(CARD, "space-y-2 p-3")}>
        <SectionTitle icon={Settings2} title="Ajustes del agente del ecosistema" hint="Los agentes del ecosistema (sistema) solo exponen activar/desactivar desde el OS: no tienen imaginación de fondo propia." />
        <label className="flex items-center gap-2 text-[12px] text-white/80">
          <Switch
            checked={agent.enabled !== false}
            disabled={busy !== ""}
            aria-label={`Agente ${agent.name}`}
            onCheckedChange={(v) => {
              void wrap("toggle", () => runS158(`${agent.name}: ${v ? "activado" : "desactivado"}`, () => toggleAstraura158Agent(target, agent.id, v), { after: onChanged }));
            }}
          />
          {agent.enabled !== false ? "activo" : "inactivo"}
        </label>
      </div>
      <ApiStatusBlock target={target} kind="agente" id={agent.id} />
    </div>
  );
}

function PersonalidadAjustes({ personality, active, target, busy, wrap, onChanged }: AjustesCommon & { personality: Astraura158Personality; active: boolean }) {
  return (
    <div className="space-y-3">
      <div className={cn(CARD, "space-y-2 p-3")}>
        <SectionTitle icon={Settings2} title="Activación de la personalidad" hint="Actívala como personalidad principal del sistema Astraura 1.58-bit en el backend." />
        <div className="flex items-center gap-2">
          {active ? <Badge tone="border-emerald-400/30 text-emerald-200">activa en el backend</Badge> : <Badge tone="border-white/10 text-white/60">no es la activa</Badge>}
          <button
            type="button" className={BTN_PRIMARY} disabled={busy !== "" || active} aria-label={`Activar ${personality.name} en el backend`}
            onClick={() => { void wrap("activate", () => runS158(`${personality.name} activada en el backend`, () => activateAstraura158Personality(target, personality.id), { after: onChanged })); }}
          >
            <BusyIcon busy={busy === "activate"} icon={Sparkles} /> Activar
          </button>
        </div>
      </div>
      <ApiStatusBlock target={target} kind="personalidad" id={personality.id} />
    </div>
  );
}

function CerebroAjustes({ brain, active, target, busy, wrap, onChanged }: AjustesCommon & { brain: Astraura158Brain; active: boolean }) {
  return (
    <div className={cn(CARD, "space-y-2 p-3")}>
      <SectionTitle icon={Settings2} title="Activación del cerebro" hint="Actívalo como cerebro principal del OS en el backend." />
      <div className="flex items-center gap-2">
        {active ? <Badge tone="border-emerald-400/30 text-emerald-200">activo en el backend</Badge> : <Badge tone="border-white/10 text-white/60">no es el activo</Badge>}
        <button
          type="button" className={BTN_PRIMARY} disabled={busy !== "" || active} aria-label={`Activar el cerebro ${brain.name}`}
          onClick={() => { void wrap("activate", () => runS158(`Cerebro ${brain.name} activado`, () => activateAstraura158Brain(target, brain.id), { after: onChanged })); }}
        >
          <BusyIcon busy={busy === "activate"} icon={Brain} /> Activar
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════ Chrome de ventana (tamaño / arrastre) ════════ */

type WindowSize = "s" | "m" | "l" | "full";
const SIZE_WIDTH: Record<"s" | "m" | "l", string> = { s: "max-w-md", m: "max-w-2xl", l: "max-w-5xl" };
const SIZE_HEIGHT: Record<"s" | "m" | "l", number> = { s: 420, m: 560, l: 720 };

/* ════════════════════════════ Componente principal ═════════════════════════ */

export function Astraura158Window({ kind, id, target, initialTab, onClose, embedded = false }: Astraura158WindowProps) {
  const [tab, setTab] = useState<Astraura158WindowTab>(() => initialTab ?? "resumen");
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entity, setEntity] = useState<EntityState | null>(null);
  const { busy, wrap } = useBusy();

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await loadEntityState(target, kind, id);
    if (r.ok) {
      setEntity(r.data);
      setError("");
    } else {
      setEntity(null);
      setError(r.error);
    }
    setLoading(false);
  }, [target, kind, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Ramas & Logs perezosas: proceso (ramas del backend) y cerebro (árbol sináptico).
  const branchesFetcher = useCallback(async (): Promise<{ ok: true; data: Astraura158Branch[] } | { ok: false; error: string }> => {
    const r = await fetchAstraura158ProcessBranches(target, id);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: r.data.all_branches ?? r.data.branches ?? [] };
  }, [target, id]);
  const synapticFetcher = useCallback(async (): Promise<{ ok: true; data: Astraura158SynapticTree } | { ok: false; error: string }> => {
    const r = await fetchAstraura158SynapticTree(target, id);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: r.data };
  }, [target, id]);
  const branchesState = useLazyOnTab<Astraura158Branch[]>(tab === "ramas" && kind === "proceso", `${target}:${id}`, branchesFetcher);
  const synapticState = useLazyOnTab<Astraura158SynapticTree>(tab === "ramas" && kind === "cerebro", `${target}:${id}`, synapticFetcher);

  const summary = useMemo(() => (entity ? summarizeEntity(entity) : null), [entity]);
  const contextLines = useMemo(() => (summary ? deriveContextLines(KIND_META[kind].label, summary) : []), [summary, kind]);

  /* ── Overlay: tamaño S/M/L/completa + arrastre de altura ── */
  const [size, setSize] = useState<WindowSize>("m");
  const [height, setHeight] = useState<number>(SIZE_HEIGHT.m);
  useEffect(() => {
    if (size !== "full") setHeight(SIZE_HEIGHT[size]);
  }, [size]);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {
    if (embedded) return;
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setHeight(Math.max(320, Math.min(1400, dragRef.current.h + (e.clientY - dragRef.current.y))));
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [embedded]);

  /* ── Foco al abrir: así SOLO la ventana enfocada responde a Escape (con varias apiladas). ── */
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!embedded) rootRef.current?.focus();
  }, [embedded]);

  const Icon = KIND_META[kind].icon;

  const header = (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2", embedded && "rounded-t-2xl")}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${summary?.color ?? "#22d3ee"}22`, color: summary?.color ?? "#22d3ee" }}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-white/90">{summary?.name ?? (loading ? "Cargando…" : id)}</p>
        <p className={MONO}>{KIND_META[kind].label} · {target}</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" className={BTN} onClick={() => void reload()} aria-label="Recargar">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} aria-hidden="true" />
        </button>
        {!embedded && (["s", "m", "l"] as const).map((sz) => (
          <button key={sz} type="button" aria-label={`Tamaño ${sz.toUpperCase()}`} aria-pressed={size === sz} className={cn(BTN, "px-1.5 uppercase", size === sz && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")} onClick={() => setSize(sz)}>
            {sz}
          </button>
        ))}
        {!embedded && (
          <button type="button" className={cn(BTN, "px-1.5", size === "full" && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")} aria-label={size === "full" ? "Salir de pantalla completa" : "Pantalla completa"} onClick={() => setSize((s) => (s === "full" ? "m" : "full"))}>
            {size === "full" ? <Minimize2 className="h-3 w-3" aria-hidden="true" /> : <Maximize2 className="h-3 w-3" aria-hidden="true" />}
          </button>
        )}
        {!embedded && (
          <Link href={astraura158WindowHref(kind, id, tab)} className={BTN} title="Abrir en página completa" aria-label="Abrir en página completa">
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
        {!embedded && (
          <button type="button" className={BTN} onClick={() => onClose?.()} aria-label="Cerrar ventana">
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const tabsBar = (
    <div role="tablist" aria-label="Pestañas de la entidad" className="flex flex-wrap gap-1 border-b border-white/10 bg-black/10 px-2 py-1.5">
      {ASTRAURA_158_WINDOW_TABS.map((t) => {
        const meta = TAB_META[t];
        const TIcon = meta.icon;
        return (
          <button
            key={t} type="button" role="tab" aria-selected={tab === t}
            className={cn(BTN, tab === t && "border-cyan-400/40 bg-cyan-500/15 text-cyan-100")}
            onClick={() => setTab(t)}
          >
            <TIcon className="h-3 w-3" aria-hidden="true" /> {meta.label}
          </button>
        );
      })}
    </div>
  );

  const ajustesContent: ReactNode = !entity ? (
    <Empty loading={loading} error={error} text="Sin datos para configurar." />
  ) : entity.kind === "proceso" ? (
    <ProcesoAjustes process={entity.process} policy={entity.policy} target={target} busy={busy} wrap={wrap} onChanged={reload} />
  ) : entity.kind === "agente" ? (
    entity.origin === "vault"
      ? <AgenteVaultAjustes agent={entity.agent} target={target} busy={busy} wrap={wrap} onChanged={reload} />
      : <AgenteEcosistemaAjustes agent={entity.agent} target={target} busy={busy} wrap={wrap} onChanged={reload} />
  ) : entity.kind === "personalidad" ? (
    <PersonalidadAjustes personality={entity.personality} active={entity.active} target={target} busy={busy} wrap={wrap} onChanged={reload} />
  ) : entity.kind === "cerebro" ? (
    <CerebroAjustes brain={entity.brain} active={entity.active} target={target} busy={busy} wrap={wrap} onChanged={reload} />
  ) : (
    <Empty text="Esta entidad no tiene ajustes disponibles desde el backend todavía." />
  );

  const ramasContent: ReactNode = !entity ? (
    <Empty loading={loading} error={error} />
  ) : entity.kind === "proceso" ? (
    <ProcessBranchesPanel state={branchesState} />
  ) : entity.kind === "agente" ? (
    entity.origin === "vault"
      ? <AgentHistoryPanel history={entity.agent.history} />
      : <Empty text="Los agentes del ecosistema no reportan historial propio desde este cliente." />
  ) : entity.kind === "cerebro" ? (
    <SynapticTreePanel state={synapticState} />
  ) : entity.kind === "creacion" ? (
    <TimelinePanel items={entity.creation.timeline_branches} />
  ) : entity.kind === "proyecto" ? (
    <VersionHistoryPanel items={entity.project.version_history} />
  ) : entity.kind === "rama" ? (
    <BranchDetailPanel branch={entity.branch} />
  ) : (
    <Empty text="Las personalidades no tienen ramas ni bitácora propia en el backend." />
  );

  const resumenContent: ReactNode = !summary ? (
    <div className={cn(CARD, "p-3")}>
      <Empty loading={loading} error={error} text="Sin datos de esta entidad." />
    </div>
  ) : (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: summary.color ?? "#22d3ee", boxShadow: `0 0 8px ${summary.color ?? "#22d3ee"}` }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-white/95">{summary.name}</p>
            {summary.subtitle && <p className="text-[11px] text-white/55">{summary.subtitle}</p>}
          </div>
          {summary.status && <Badge tone={levelTone(summary.status)}>{summary.status}</Badge>}
        </div>
        {summary.description && <p className="mt-2 text-[11px] leading-relaxed text-white/70">{summary.description}</p>}
        {summary.extra && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
            <span className="text-white/40">Insights · </span>
            {summary.extra}
          </p>
        )}
        {summary.metrics.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {summary.metrics.map((m) => <Stat key={m.label} label={m.label} value={m.value} hint={m.hint} />)}
          </div>
        )}
      </div>
      {summary.linked.map((l) => (
        <div key={l.label} className={cn(CARD, "p-3")}>
          <SectionTitle icon={Link2} title={l.label} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {l.items.map((it, i) => <Badge key={`${it}-${i}`} tone="border-white/10 text-white/70">{it}</Badge>)}
          </div>
        </div>
      ))}
    </div>
  );

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {tabsBar}
      <div className={cn("min-h-0 flex-1", tab === "vivo" ? "flex overflow-hidden p-3" : "overflow-y-auto p-3")}>
        {tab === "resumen" && resumenContent}
        {tab === "ramas" && ramasContent}
        {tab === "ajustes" && ajustesContent}
        {tab === "vivo" && (
          <LiveTalk
            kind={kind}
            id={id}
            name={summary?.name ?? id}
            personaId={summary?.personaId}
            contextLines={contextLines}
            target={target}
            className="min-h-0 flex-1"
          />
        )}
      </div>
    </div>
  );

  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20">{body}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Ventana de ${summary?.name ?? id}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose?.();
        }}
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/90 shadow-2xl outline-none",
          size === "full" ? "h-full max-w-full" : SIZE_WIDTH[size],
        )}
        style={size === "full" ? undefined : { height }}
      >
        {body}
        {size !== "full" && (
          <div
            role="separator"
            aria-label="Arrastra para cambiar la altura"
            className="h-1.5 shrink-0 cursor-ns-resize bg-white/[0.06] transition-colors hover:bg-cyan-400/30"
            onPointerDown={(e) => {
              dragRef.current = { y: e.clientY, h: height };
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default Astraura158Window;

// `Cpu` se conserva importado para futuras métricas de hardware por entidad
// (coherente con el resto del Studio 1.58); referenciado aquí para que el
// linter/tsc no lo marque como import muerto si una rama no lo usa todavía.
void Cpu;
