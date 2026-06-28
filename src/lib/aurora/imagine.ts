"use client";

/**
 * AURORA · imagine.md — sistema VIVO/COLABORATIVO de ideación, investigación y
 * tareas de Aurora.
 *
 * Es el hermano EN DIRECTO de dream.md/ego.md: mientras un Ego (ego.md) define
 * QUIÉN es Aurora, un imagine.md es algo que Aurora DESARROLLA — contigo o en
 * segundo plano — para idear, investigar o ejecutar tareas. Editable, integrable
 * y compartible (como dream.md, pero en directo).
 *
 * Dos piezas:
 *   • aurora_imagine — los ficheros imagine.md (markdown editable, shareable,
 *     adjuntable a contextos).  CRUD + autosave + realtime.
 *   • imagine_runs   — EJECUCIONES. Una run recorre PASOS (steps). Aurora puede
 *     elegir IAs/agentes/subagentes/skills/conexiones/plugins/APIs (ai_config)
 *     y el SERVIDOR donde ejecutar (tri-fuente: propio/StarSeed/externo/auto).
 *       · modo "juntos" → notifica al usuario en cada paso para colaborar
 *         (el usuario responde / espera / deja continuar). La run pausa tras
 *         cada paso esperando decisión.
 *       · modo "fondo"  → corre en segundo plano y notifica sólo cuando emerge
 *         algo relevante.
 *
 * Servidor de ejecución: se lee de `service_routes` (dominio "imagine") que ya
 * modela la tri-fuente propio/StarSeed/externo + "auto" (modulación). Ver
 * `@/lib/services/service-routes`.
 *
 * Notificaciones: cuando algo es relevante (un paso producido en modo juntos, o
 * un hallazgo en modo fondo) se escribe en la tabla `notifications`
 * (user_id, kind, title, body, link, seen) para avisar al usuario aunque no esté
 * mirando el panel. Ver `@/lib/notifications/notifications`.
 *
 * El "paso" lo produce el modelo activo vía `chat()` (`@/ai/client/chat`).
 *
 * LÍMITE HONESTO (serverless): el "segundo plano" real aquí es un bucle
 * asíncrono dirigido por el cliente — sigue dando pasos mientras el usuario
 * navega por el OS y deja constancia en `notifications`. Un fondo 100% autónomo
 * del lado servidor (que avance sin ninguna pestaña abierta) es un siguiente
 * paso: una tarea programada / edge function que llame a `stepRun`. Ver
 * `BACKGROUND_LIMITATION`.
 *
 * SSR-safe + defensivo: nunca lanza; cae a [] / null / false ante cualquier error.
 */

import { createClient } from "@/utils/supabase/client";
import { chat } from "@/ai/client/chat";
import {
  loadRoute,
  resolveRoute,
  activeSources,
  type ServiceRoute,
  type SourceKind,
} from "@/lib/services/service-routes";
import {
  Sparkles,
  FlaskConical,
  ListChecks,
  Lightbulb,
  Bot,
  Wand2,
  Plug,
  Network,
  Cpu,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** Dominio de `service_routes` que gobierna el servidor de ejecución. */
export const IMAGINE_DOMAIN = "imagine";

/**
 * Nota honesta sobre el "segundo plano" en un despliegue serverless. La UI la
 * muestra para no prometer más de lo que hay.
 */
export const BACKGROUND_LIMITATION =
  "El modo en segundo plano avanza mientras tengas StarSeed abierto (aunque " +
  "estés en otra sección): Aurora sigue dando pasos y te avisa por " +
  "notificaciones. Un fondo 100% autónomo sin ninguna pestaña abierta llegará " +
  "como tarea programada / edge function (siguiente iteración).";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Un fichero imagine.md (vivo/colaborativo). */
export interface ImagineFile {
  id: string;
  owner?: string;
  name: string;
  content: string;
  shareable: boolean;
  attached_to: Record<string, unknown>;
  updated_at?: string;
  created_at?: string;
}

/** Modo de una ejecución. */
export type RunMode = "juntos" | "fondo";

/** Estado de una ejecución. */
export type RunStatus = "pending" | "running" | "paused" | "done" | "error";

/** Servidor elegido para ejecutar (alias UI de la tri-fuente). */
export type RunServer = "propio" | "starseed" | "externo" | "auto";

/** Un paso de la ejecución (se acumulan en `steps` jsonb). */
export interface RunStep {
  /** Índice 1..n del paso. */
  n: number;
  /** Rol: pensamiento/acción de Aurora, o respuesta del usuario. */
  role: "aurora" | "user";
  /** Texto del paso. */
  text: string;
  /** ¿Es un hallazgo relevante (dispara notificación en modo fondo)? */
  relevant?: boolean;
  /** ISO timestamp. */
  at: string;
}

/**
 * Selección de IAs/agentes/subagentes/skills/conexiones/plugins/APIs para la
 * run. Todo opcional; se serializa tal cual en `ai_config` jsonb.
 */
export interface AiConfig {
  /** Id del proveedor de IA (override de `chat()`); vacío = el activo. */
  provider?: string;
  /** Modelo concreto (override del por defecto del proveedor). */
  model?: string;
  /** Agentes seleccionados (ids/nombres libres). */
  agents?: string[];
  /** Subagentes seleccionados. */
  subagents?: string[];
  /** Skills/herramientas seleccionadas. */
  skills?: string[];
  /** Plugins seleccionados. */
  plugins?: string[];
  /** Conexiones (cuentas/servicios enlazados). */
  connections?: string[];
  /** APIs externas seleccionadas. */
  apis?: string[];
  /** Temperatura de muestreo. */
  temperature?: number;
  /** Notas/objetivo libre que matiza la run. */
  note?: string;
}

/** Una ejecución (fila de imagine_runs). */
export interface ImagineRun {
  id: string;
  owner?: string;
  title: string;
  status: RunStatus;
  mode: RunMode;
  server: string;
  ai_config: AiConfig;
  steps: RunStep[];
  result: string | null;
  imagine_id: string | null;
  updated_at?: string;
  created_at?: string;
}

/* ------------------------------------------------------------------ */
/* Catálogos para la UI (selección de IA/agentes/skills/…)            */
/* ------------------------------------------------------------------ */

export interface ServerOptionDef {
  /** Valor guardado en `imagine_runs.server`. */
  id: RunServer;
  /** Kind correspondiente en service_routes (auto no mapea a uno). */
  kind: SourceKind | null;
  label: string;
  blurb: string;
  icon: string;
}

/** Opciones de servidor de ejecución (tri-fuente + auto inteligente). */
export const RUN_SERVERS: ServerOptionDef[] = [
  {
    id: "propio",
    kind: "propio",
    label: "Tu servidor",
    blurb: "Ejecuta en tu propio servidor/endpoint (autoalojado). Tu cómputo, tu control.",
    icon: "🖥️",
  },
  {
    id: "starseed",
    kind: "starseed",
    label: "Servidor StarSeed",
    blurb: "La infraestructura de la red StarSeed. Por defecto, sin configurar nada.",
    icon: "✨",
  },
  {
    id: "externo",
    kind: "externo",
    label: "Servidor externo",
    blurb: "Un proveedor de terceros que tengas configurado.",
    icon: "🌐",
  },
  {
    id: "auto",
    kind: null,
    label: "Auto inteligente",
    blurb:
      "Aurora elige según tu configuración tri-fuente (service_routes · imagine): prioridad, balanceo, fusión o failover.",
    icon: "🧭",
  },
];

export function serverOptionById(id: string): ServerOptionDef | undefined {
  return RUN_SERVERS.find((s) => s.id === id);
}

/** Modos de ejecución para la UI. */
export const RUN_MODES: { id: RunMode; label: string; blurb: string; icon: string }[] = [
  {
    id: "juntos",
    label: "Juntos (en directo)",
    blurb:
      "Aurora te avisa en cada paso para colaborar: puedes responder, esperar o dejar que continúe.",
    icon: "🤝",
  },
  {
    id: "fondo",
    label: "En segundo plano",
    blurb:
      "Aurora trabaja sola y te notifica sólo cuando emerge algo relevante.",
    icon: "🌙",
  },
];

/**
 * Tipos de recurso que Aurora puede seleccionar para una run. Sirven para la UI
 * (chips por categoría) y se mapean a campos de `AiConfig`.
 */
export type AiResourceKind =
  | "agents"
  | "subagents"
  | "skills"
  | "plugins"
  | "connections"
  | "apis";

export const AI_RESOURCE_KINDS: {
  key: AiResourceKind;
  label: string;
  singular: string;
  icon: string;
  placeholder: string;
}[] = [
  { key: "agents", label: "Agentes", singular: "agente", icon: "🤖", placeholder: "p. ej. investigador, planificador" },
  { key: "subagents", label: "Subagentes", singular: "subagente", icon: "🧩", placeholder: "p. ej. buscador-web, resumidor" },
  { key: "skills", label: "Skills / Habilidades", singular: "skill", icon: "🪄", placeholder: "p. ej. deep-research, scraping" },
  { key: "plugins", label: "Plugins", singular: "plugin", icon: "🔌", placeholder: "p. ej. notion, github" },
  { key: "connections", label: "Conexiones", singular: "conexión", icon: "🔗", placeholder: "p. ej. drive, calendar" },
  { key: "apis", label: "APIs", singular: "API", icon: "🛰️", placeholder: "p. ej. openweather, arxiv" },
];

const STATUS_META: Record<RunStatus, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "text-white/50 border-white/15 bg-white/5" },
  running: { label: "En curso", tone: "text-cyan-200 border-cyan-400/40 bg-cyan-500/15" },
  paused: { label: "En pausa", tone: "text-amber-200 border-amber-400/40 bg-amber-500/15" },
  done: { label: "Completada", tone: "text-emerald-200 border-emerald-400/40 bg-emerald-500/15" },
  error: { label: "Error", tone: "text-rose-200 border-rose-400/40 bg-rose-500/15" },
};

export function statusMeta(s: RunStatus) {
  return STATUS_META[s] ?? STATUS_META.pending;
}

/** Icono para un fichero imagine por nombre (extensible). */
const FILE_ICONS: Record<string, LucideIcon> = {
  "imagine.md": Sparkles,
  "research.md": FlaskConical,
  "tasks.md": ListChecks,
  "ideas.md": Lightbulb,
  "agents.md": Bot,
  "skills.md": Wand2,
  "plugins.md": Plug,
  "conexiones.md": Network,
  "modelos.md": Cpu,
};

export function iconForImagineFile(name: string): LucideIcon {
  return FILE_ICONS[(name || "").toLowerCase()] ?? Sparkles;
}

/* ------------------------------------------------------------------ */
/* Semilla de un imagine.md nuevo                                      */
/* ------------------------------------------------------------------ */

export const IMAGINE_SEED_CONTENT = [
  "# imagine.md — espacio vivo de Aurora",
  "",
  "Esto es un imagine.md: un espacio EN DIRECTO donde Aurora idea, investiga y",
  "ejecuta tareas — contigo o en segundo plano. Es editable, integrable y",
  "compartible (como dream.md, pero en vivo).",
  "",
  "## Objetivo",
  "- ¿Qué quieres imaginar/investigar/lograr?",
  "",
  "## Contexto",
  "- Notas, enlaces y material de partida.",
  "",
  "## Recursos preferidos",
  "- IAs / modelos:",
  "- Agentes / subagentes:",
  "- Skills / plugins / APIs / conexiones:",
  "",
  "## Plan",
  "1. …",
  "",
  "## Hallazgos",
  "- (Aurora irá anotando aquí lo relevante de cada run.)",
  "",
].join("\n");

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

function normalizeAiConfig(raw: unknown): AiConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    provider: typeof r.provider === "string" ? r.provider : undefined,
    model: typeof r.model === "string" ? r.model : undefined,
    agents: asArr(r.agents),
    subagents: asArr(r.subagents),
    skills: asArr(r.skills),
    plugins: asArr(r.plugins),
    connections: asArr(r.connections),
    apis: asArr(r.apis),
    temperature:
      typeof r.temperature === "number" && Number.isFinite(r.temperature)
        ? r.temperature
        : undefined,
    note: typeof r.note === "string" ? r.note : undefined,
  };
}

function normalizeSteps(raw: unknown): RunStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, i): RunStep | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const role = o.role === "user" ? "user" : "aurora";
      return {
        n: typeof o.n === "number" ? o.n : i + 1,
        role,
        text: typeof o.text === "string" ? o.text : "",
        relevant: !!o.relevant,
        at: typeof o.at === "string" ? o.at : new Date().toISOString(),
      };
    })
    .filter((x): x is RunStep => x !== null);
}

function normalizeRun(row: Record<string, unknown>): ImagineRun {
  const status = (row.status as RunStatus) || "pending";
  const mode = (row.mode as RunMode) === "fondo" ? "fondo" : "juntos";
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    title: (row.title as string) || "Sin título",
    status: (["pending", "running", "paused", "done", "error"] as RunStatus[]).includes(status)
      ? status
      : "pending",
    mode,
    server: (row.server as string) || "starseed",
    ai_config: normalizeAiConfig(row.ai_config),
    steps: normalizeSteps(row.steps),
    result: (row.result as string) ?? null,
    imagine_id: (row.imagine_id as string) ?? null,
    updated_at: (row.updated_at as string) ?? undefined,
    created_at: (row.created_at as string) ?? undefined,
  };
}

function normalizeFile(row: Record<string, unknown>): ImagineFile {
  return {
    id: String(row.id ?? ""),
    owner: (row.owner as string) ?? undefined,
    name: (row.name as string) || "imagine.md",
    content: (row.content as string) ?? "",
    shareable: !!row.shareable,
    attached_to: (row.attached_to as Record<string, unknown>) || {},
    updated_at: (row.updated_at as string) ?? undefined,
    created_at: (row.created_at as string) ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* CRUD · ficheros imagine.md                                          */
/* ------------------------------------------------------------------ */

export async function listImagineFiles(): Promise<ImagineFile[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("aurora_imagine")
      .select("*")
      .eq("owner", owner)
      .order("updated_at", { ascending: false });
    return ((data as Record<string, unknown>[]) || []).map(normalizeFile);
  } catch {
    return [];
  }
}

export async function createImagineFile(name?: string, content?: string): Promise<ImagineFile | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_imagine")
      .insert({
        owner,
        name: (name || "imagine.md").trim(),
        content: content ?? IMAGINE_SEED_CONTENT,
        shareable: false,
        attached_to: {},
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    return data ? normalizeFile(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Autosave del editor (sólo contenido). */
export async function updateImagineContent(id: string, content: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("aurora_imagine")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function renameImagineFile(id: string, name: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("aurora_imagine")
      .update({ name: (name || "imagine.md").trim(), updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function setImagineShareable(id: string, shareable: boolean): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb
      .from("aurora_imagine")
      .update({ shareable, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function deleteImagineFile(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("aurora_imagine").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/** Adjunta el imagine a un contexto (no destructivo). */
export async function attachImagineToContext(
  id: string,
  attachment: { kind: string; ref?: string; label?: string },
): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_imagine")
      .select("attached_to")
      .eq("owner", owner)
      .eq("id", id)
      .single();
    const cur = ((data as Record<string, unknown>)?.attached_to as Record<string, unknown>) || {};
    const list = Array.isArray(cur.attachments) ? (cur.attachments as Record<string, unknown>[]) : [];
    const exists = list.some(
      (a) => a.kind === attachment.kind && (a.ref ?? "") === (attachment.ref ?? ""),
    );
    const next = exists ? list : [...list, { ...attachment, at: new Date().toISOString() }];
    const { error } = await sb
      .from("aurora_imagine")
      .update({ attached_to: { ...cur, attachments: next }, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** Exporta un imagine.md como bundle markdown portable. */
export function imagineToMarkdown(file: ImagineFile): string {
  return [
    `<!-- starseed:imagine name="${file.name}" shareable="${file.shareable}" -->`,
    "",
    file.content || "",
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* CRUD · ejecuciones (imagine_runs)                                   */
/* ------------------------------------------------------------------ */

export async function listRuns(imagineId?: string | null): Promise<ImagineRun[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    let q = sb
      .from("imagine_runs")
      .select("*")
      .eq("owner", owner)
      .order("updated_at", { ascending: false });
    if (imagineId) q = q.eq("imagine_id", imagineId);
    const { data } = await q;
    return ((data as Record<string, unknown>[]) || []).map(normalizeRun);
  } catch {
    return [];
  }
}

export async function getRun(id: string): Promise<ImagineRun | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("imagine_runs")
      .select("*")
      .eq("owner", owner)
      .eq("id", id)
      .single();
    return data ? normalizeRun(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Crea e inicia una ejecución. Queda en estado "running" lista para `stepRun`.
 * `server` acepta los alias de RUN_SERVERS (propio/starseed/externo/auto).
 */
export async function startRun(
  title: string,
  mode: RunMode,
  server: RunServer | string,
  ai_config: AiConfig,
  imagineId?: string | null,
): Promise<ImagineRun | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("imagine_runs")
      .insert({
        owner,
        title: (title || "Nueva ejecución").trim(),
        status: "running",
        mode: mode === "fondo" ? "fondo" : "juntos",
        server: server || "starseed",
        ai_config: normalizeAiConfig(ai_config),
        steps: [],
        imagine_id: imagineId ?? null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    return data ? normalizeRun(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function setRunStatus(id: string, status: RunStatus, result?: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (typeof result === "string") patch.result = result;
    const { error } = await sb.from("imagine_runs").update(patch).eq("owner", owner).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export async function pauseRun(id: string): Promise<boolean> {
  return setRunStatus(id, "paused");
}

export async function resumeRun(id: string): Promise<boolean> {
  return setRunStatus(id, "running");
}

export async function deleteRun(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("imagine_runs").delete().eq("owner", owner).eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/** Añade un paso a una run (lee el array actual, hace push y persiste). */
async function appendStep(id: string, step: RunStep): Promise<RunStep[] | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data: cur } = await sb
      .from("imagine_runs")
      .select("steps")
      .eq("owner", owner)
      .eq("id", id)
      .single();
    const prev = normalizeSteps((cur as Record<string, unknown>)?.steps);
    const next = [...prev, step];
    const { error } = await sb
      .from("imagine_runs")
      .update({ steps: next, updated_at: new Date().toISOString() })
      .eq("owner", owner)
      .eq("id", id);
    if (error) return null;
    return next;
  } catch {
    return null;
  }
}

/** El usuario responde en una run "juntos": añade su mensaje y la reanuda. */
export async function replyToRun(id: string, text: string): Promise<RunStep[] | null> {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  const step: RunStep = {
    n: 0, // se renumerará en lectura; usamos timestamp como orden real
    role: "user",
    text: trimmed,
    at: new Date().toISOString(),
  };
  const next = await appendStep(id, step);
  if (next) await setRunStatus(id, "running");
  return next;
}

/* ------------------------------------------------------------------ */
/* Selección de servidor (lee service_routes · dominio "imagine")      */
/* ------------------------------------------------------------------ */

export interface ResolvedServer {
  /** Etiqueta legible del destino. */
  label: string;
  /** Kind efectivo (o "auto"). */
  kind: SourceKind | "auto";
  /** Modo de modulación si es auto. */
  mode?: string;
  /** Endpoint efectivo (si lo hay). */
  endpoint?: string;
}

/**
 * Resuelve a qué servidor irá la run. Si `server` es "auto", consulta
 * `service_routes` (dominio imagine) y aplica la modulación; si es un kind
 * concreto, intenta encontrar esa fuente (y su endpoint) en la ruta.
 * Lectura pura: nunca lanza.
 */
export async function resolveRunServer(server: RunServer | string): Promise<ResolvedServer> {
  try {
    const route: ServiceRoute = await loadRoute(IMAGINE_DOMAIN);
    if (server === "auto") {
      const r = resolveRoute(IMAGINE_DOMAIN);
      const primary = r.primary;
      return {
        label:
          r.mode === "balanceo" || r.mode === "fusion"
            ? `Auto · ${r.mode} (${r.participants.length} fuentes)`
            : `Auto · ${primary?.kind ?? "starseed"}`,
        kind: "auto",
        mode: r.mode,
        endpoint: primary?.endpoint || undefined,
      };
    }
    const src = route.sources.find((s) => s.kind === server);
    const opt = serverOptionById(server);
    return {
      label: opt?.label || server,
      kind: (server as SourceKind) || "starseed",
      endpoint: src?.endpoint || undefined,
    };
  } catch {
    const opt = serverOptionById(server);
    return { label: opt?.label || String(server), kind: "starseed" };
  }
}

/** ¿Hay alguna fuente activa configurada para imagine? (para avisos de UI). */
export async function imagineHasConfiguredSources(): Promise<boolean> {
  try {
    const route = await loadRoute(IMAGINE_DOMAIN);
    return activeSources(route).length > 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Notificaciones                                                      */
/* ------------------------------------------------------------------ */

/**
 * Escribe una notificación en la tabla `notifications` (esquema: user_id, kind,
 * title, body, link, seen). Se usa para avisar al usuario de un paso (modo
 * juntos) o de un hallazgo relevante (modo fondo) aunque no esté en el panel.
 * NUNCA lanza.
 */
export async function notify(opts: {
  title: string;
  body?: string;
  link?: string;
  kind?: string;
}): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    const { error } = await sb.from("notifications").insert({
      user_id: owner,
      kind: opts.kind || "imagine",
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? "/aurora",
      seen: false,
    });
    return !error;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Motor de pasos (stepRun)                                            */
/* ------------------------------------------------------------------ */

/** Resultado de un paso de ejecución. */
export interface StepResult {
  ok: boolean;
  /** El paso producido (si lo hubo). */
  step?: RunStep;
  /** Lista de pasos resultante. */
  steps?: RunStep[];
  /** Estado tras el paso. */
  status: RunStatus;
  /** Mensaje de error legible (si ok=false). */
  error?: string;
}

/** Construye el system prompt del motor imagine a partir de la run. */
function buildImagineSystemPrompt(run: ImagineRun, server: ResolvedServer): string {
  const cfg = run.ai_config || {};
  const resources: string[] = [];
  const push = (label: string, arr?: string[]) => {
    if (arr && arr.length) resources.push(`- ${label}: ${arr.join(", ")}`);
  };
  push("Agentes", cfg.agents);
  push("Subagentes", cfg.subagents);
  push("Skills", cfg.skills);
  push("Plugins", cfg.plugins);
  push("Conexiones", cfg.connections);
  push("APIs", cfg.apis);
  const resourceBlock = resources.length
    ? `\nRecursos que puedes orquestar en esta run (descríbelos como pasos; no los ejecutes literalmente):\n${resources.join("\n")}`
    : "";
  const noteBlock = cfg.note ? `\nObjetivo/notas del usuario: ${cfg.note}` : "";

  return [
    "Eres Aurora, la voz de Astraura dentro de StarSeed OS, operando un imagine.md:",
    "un espacio VIVO de ideación, investigación y tareas. Avanzas la tarea PASO A PASO.",
    "",
    `Modo: ${run.mode === "fondo" ? "EN SEGUNDO PLANO (trabajas sola; sólo destacas hallazgos relevantes)" : "JUNTOS (colaboras con el usuario en cada paso)"}.`,
    `Servidor de ejecución elegido: ${server.label}.`,
    resourceBlock,
    noteBlock,
    "",
    "En CADA turno produce UN SOLO paso, conciso y accionable (2-6 frases o viñetas).",
    "Un paso puede ser: una idea, un sub-objetivo, una búsqueda/investigación a realizar,",
    "un borrador, un análisis, o una conclusión parcial.",
    "Si consideras que la tarea está terminada, empieza tu mensaje EXACTAMENTE con [FIN] y",
    "ofrece un resumen final.",
    "Si el paso contiene un hallazgo claramente relevante para el usuario, empieza con",
    "[RELEVANTE] (en modo fondo esto disparará una notificación).",
    "Responde SIEMPRE en español, en tono cálido y claro.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Convierte los pasos previos en historial de chat. */
function stepsToHistory(run: ImagineRun): { role: "user" | "assistant"; content: string }[] {
  const ordered = [...run.steps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return ordered.map((s) => ({
    role: s.role === "user" ? ("user" as const) : ("assistant" as const),
    content: s.text,
  }));
}

/**
 * Produce el SIGUIENTE paso de la run con `chat()`, lo añade a `steps`, y:
 *   • si el modelo marca [FIN]  → status "done" + result.
 *   • modo "juntos"             → status "paused" (espera al usuario) y notifica.
 *   • modo "fondo"              → status "running" (sigue) y notifica si [RELEVANTE].
 *
 * Devuelve un StepResult. NUNCA lanza.
 */
export async function stepRun(runId: string): Promise<StepResult> {
  try {
    const owner = await uid();
    if (!owner) return { ok: false, status: "error", error: "Sin sesión." };

    const run = await getRun(runId);
    if (!run) return { ok: false, status: "error", error: "Run no encontrada." };
    if (run.status === "done" || run.status === "error") {
      return { ok: true, status: run.status, steps: run.steps };
    }

    const server = await resolveRunServer(run.server);
    const system = buildImagineSystemPrompt(run, server);
    const history = stepsToHistory(run);

    // Si no hay historial aún, sembramos con el título como primer objetivo.
    const messages = [
      { role: "system" as const, content: system },
      ...(history.length
        ? history
        : [{ role: "user" as const, content: `Objetivo de la run: ${run.title}. Da el primer paso.` }]),
      ...(history.length
        ? [{ role: "user" as const, content: "Continúa con el siguiente paso." }]
        : []),
    ];

    let text = "";
    try {
      const res = await chat({
        messages,
        providerId: run.ai_config?.provider || undefined,
        model: run.ai_config?.model || undefined,
        temperature:
          typeof run.ai_config?.temperature === "number" ? run.ai_config.temperature : 0.6,
        maxTokens: 700,
      });
      text = (res?.text || "").trim();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "No se pudo contactar al proveedor de IA.";
      await setRunStatus(runId, "error", msg);
      await notify({
        title: `imagine · error en "${run.title}"`,
        body: msg,
        kind: "imagine_error",
      });
      return { ok: false, status: "error", error: msg };
    }

    if (!text) {
      const msg = "El modelo no devolvió contenido.";
      await setRunStatus(runId, "error", msg);
      return { ok: false, status: "error", error: msg };
    }

    const isEnd = /^\s*\[FIN\]/i.test(text);
    const isRelevant = /^\s*\[RELEVANTE\]/i.test(text);
    const clean = text.replace(/^\s*\[(FIN|RELEVANTE)\]\s*/i, "").trim();

    const step: RunStep = {
      n: run.steps.length + 1,
      role: "aurora",
      text: clean || text,
      relevant: isRelevant || isEnd,
      at: new Date().toISOString(),
    };
    const steps = await appendStep(runId, step);
    if (!steps) {
      return { ok: false, status: run.status, error: "No se pudo guardar el paso." };
    }

    // Resolución de estado + notificaciones según el modo.
    if (isEnd) {
      await setRunStatus(runId, "done", clean || text);
      await notify({
        title: `imagine · "${run.title}" completada`,
        body: (clean || text).slice(0, 240),
        kind: "imagine_done",
      });
      return { ok: true, status: "done", step, steps };
    }

    if (run.mode === "juntos") {
      // En directo: pausa tras cada paso esperando al usuario, y avisa.
      await setRunStatus(runId, "paused");
      await notify({
        title: `imagine · nuevo paso en "${run.title}"`,
        body: step.text.slice(0, 240),
        kind: "imagine_step",
      });
      return { ok: true, status: "paused", step, steps };
    }

    // En fondo: sigue corriendo; notifica sólo si es relevante.
    await setRunStatus(runId, "running");
    if (isRelevant) {
      await notify({
        title: `imagine · hallazgo en "${run.title}"`,
        body: step.text.slice(0, 240),
        kind: "imagine_finding",
      });
    }
    return { ok: true, status: "running", step, steps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado en el paso.";
    return { ok: false, status: "error", error: msg };
  }
}

/* ------------------------------------------------------------------ */
/* Realtime helpers (filtros PostgREST)                                */
/* ------------------------------------------------------------------ */

/** Filtro realtime para las runs de un imagine concreto. */
export function runsFilterForImagine(imagineId: string): string {
  return `imagine_id=eq.${imagineId}`;
}

/** Filtro realtime para una run concreta (pasos en vivo). */
export function runFilterById(runId: string): string {
  return `id=eq.${runId}`;
}
