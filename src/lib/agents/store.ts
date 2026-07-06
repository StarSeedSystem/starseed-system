"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · STORE (CRUD + localStorage + espejo de cuenta) [P5+P4]
 * ---------------------------------------------------------------------------
 * Persistencia soberana de los AGENTES y sus VÍNCULOS (bindings), siguiendo el
 * mismo patrón que la Biblioteca (packages.ts / library-sync.ts):
 *   · Fuente de verdad LOCAL: localStorage (SSR-safe, defensivo, nunca lanza).
 *   · Espejo en la CUENTA soberana (Supabase `user_settings.prefs`) por UNIÓN,
 *     nunca resta — vía `mergeAgentsFromAccount` que llamará library-sync.
 *   · Cada mutación emite el evento window `starseed:library` (el MISMO que ya
 *     escucha library-sync para disparar el push con debounce). Así los agentes
 *     "viajan con la cuenta" en OS · Nexus · Café sin nueva tubería de red.
 *
 * Claves localStorage:
 *   · `starseed.agents.v1`            → Agent[] de la biblioteca personal.
 *   · `starseed.agents.bindings.v1`   → AgentBinding[] (agente ↔ ubicación).
 *   · `starseed.agents.public.v1`     → PublicAgentRecord[] (registro PÚBLICO
 *                                        "stub": compartición local; la
 *                                        publicación real a la red es futura).
 *
 * Los BUILTINS (builtins.ts) NO se guardan en localStorage: se fusionan al
 * listar. Editar un builtin = replicarlo a la biblioteca personal.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  type Agent,
  type AgentBinding,
  type AgentModelPrefs,
  type AgentVisibility,
  type BindingScope,
  type BindingTargetType,
  type PublicAgentRecord,
  BINDING_TARGET_TYPES,
} from "./model";
import { getBuiltinAgents } from "./builtins";

/* ─────────────────────────── Claves y evento ─────────────────────────── */

export const AGENTS_KEY = "starseed.agents.v1";
export const AGENT_BINDINGS_KEY = "starseed.agents.bindings.v1";
export const PUBLIC_AGENTS_KEY = "starseed.agents.public.v1";
/** Mismo evento que la Biblioteca: library-sync ya lo escucha para subir. */
export const AGENTS_EVENT = "starseed:library";

/* ─────────────────────── Utilidades base (SSR-safe) ─────────────────────── */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

function emitAgentsEvent(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new Event(AGENTS_EVENT));
  } catch {
    /* noop */
  }
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function newId(prefix = "agent"): string {
  const rnd = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}

/** Suscripción sencilla a cambios de agentes (para componentes). */
export function subscribeAgents(cb: () => void): () => void {
  if (!isClient()) return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || (e.key && e.key.startsWith("starseed.agents."))) cb();
  };
  window.addEventListener(AGENTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AGENTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* ─────────────────────── Saneado defensivo ─────────────────────── */

function sanitizeModelPrefs(raw: unknown): AgentModelPrefs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: AgentModelPrefs = {};
  if (typeof r.preferStrong === "boolean") out.preferStrong = r.preferStrong;
  if (typeof r.preferredSourceId === "string") out.preferredSourceId = r.preferredSourceId;
  if (typeof r.preferredModel === "string") out.preferredModel = r.preferredModel;
  if (typeof r.temperature === "number" && r.temperature >= 0 && r.temperature <= 2) {
    out.temperature = r.temperature;
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeVisibility(v: unknown): AgentVisibility {
  return v === "public" ? "public" : "private";
}

/** Sanea un Agente crudo (de storage o de la cuenta). Null si es inválido. */
function sanitizeAgent(raw: unknown): Agent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id).trim();
  const name = asString(r.name).trim();
  if (!id || !name) return null;
  const now = Date.now();
  const agent: Agent = {
    id,
    name,
    description: asString(r.description),
    persona: asString(r.persona),
    capabilities: Array.isArray(r.capabilities)
      ? r.capabilities.filter((c): c is string => typeof c === "string").slice(0, 24)
      : [],
    model: sanitizeModelPrefs(r.model),
    icon: asString(r.icon, "Bot"),
    author: asString(r.author, "Tú"),
    visibility: sanitizeVisibility(r.visibility),
    version: asString(r.version, "1.0.0"),
    createdAt: typeof r.createdAt === "number" ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : now,
  };
  if (typeof r.parentId === "string" && r.parentId.trim()) agent.parentId = r.parentId.trim();
  if (r.builtin === true) agent.builtin = true;
  return agent;
}

function isBindingTargetType(v: unknown): v is BindingTargetType {
  return typeof v === "string" && (BINDING_TARGET_TYPES as string[]).includes(v);
}

function sanitizeBinding(raw: unknown): AgentBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const agentId = asString(r.agentId).trim();
  const targetId = asString(r.targetId).trim();
  if (!agentId || !targetId || !isBindingTargetType(r.targetType)) return null;
  return {
    agentId,
    targetType: r.targetType,
    targetId,
    scope: r.scope === "public" ? "public" : "private",
    at: typeof r.at === "number" ? r.at : Date.now(),
  };
}

/* ═══════════════════════════ AGENTES · lectura ═══════════════════════════ */

/** Agentes de la biblioteca PERSONAL (localStorage). Saneados. */
function readPersonalAgents(): Agent[] {
  const raw = readJson<unknown>(AGENTS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeAgent).filter((a): a is Agent => a !== null);
}

function writePersonalAgents(agents: Agent[]): void {
  writeJson(AGENTS_KEY, agents);
  emitAgentsEvent();
}

/**
 * TODOS los agentes visibles: builtins de fábrica + personales.
 * Dedupe por id (un id personal con el mismo id que un builtin gana, para
 * permitir "sobreescribir" — aunque replicateAgent siempre genera id nuevo).
 */
export function listAgents(): Agent[] {
  const seen = new Set<string>();
  const out: Agent[] = [];
  for (const a of [...readPersonalAgents(), ...getBuiltinAgents()]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

/** Solo los agentes de la biblioteca personal (editable). */
export function listPersonalAgents(): Agent[] {
  return readPersonalAgents();
}

/** Solo los builtins de fábrica. */
export function listBuiltinAgents(): Agent[] {
  return getBuiltinAgents();
}

export function getAgent(id: string): Agent | undefined {
  return listAgents().find((a) => a.id === id);
}

export function isBuiltinAgent(id: string): boolean {
  return getBuiltinAgents().some((a) => a.id === id);
}

/* ═══════════════════════════ AGENTES · CRUD ═══════════════════════════ */

/** Datos mínimos para CREAR un agente (el resto se rellena con defaults). */
export interface AgentDraft {
  name: string;
  description?: string;
  persona?: string;
  capabilities?: string[];
  model?: AgentModelPrefs;
  icon?: string;
  author?: string;
  visibility?: AgentVisibility;
  parentId?: string;
}

/** Crea y GUARDA un agente nuevo en la biblioteca personal. */
export function createAgent(draft: AgentDraft): Agent {
  const now = Date.now();
  const agent: Agent = {
    id: newId(),
    name: (draft.name ?? "Agente sin nombre").trim() || "Agente sin nombre",
    description: draft.description ?? "",
    persona: draft.persona ?? "",
    capabilities: (draft.capabilities ?? []).filter((c) => typeof c === "string"),
    model: draft.model,
    icon: draft.icon ?? "Bot",
    author: draft.author ?? "Tú",
    visibility: draft.visibility ?? "private",
    version: "1.0.0",
    parentId: draft.parentId,
    createdAt: now,
    updatedAt: now,
  };
  const next = readPersonalAgents().filter((a) => a.id !== agent.id);
  writePersonalAgents([...next, agent]);
  return agent;
}

/**
 * CUSTOMIZAR: actualiza campos de un agente PERSONAL. No permite editar
 * builtins (devuelve null); para eso hay que replicar primero. `bumpVersion`
 * incrementa el patch de la versión (UPDATE explícito).
 */
export function updateAgent(
  id: string,
  patch: Partial<Omit<Agent, "id" | "createdAt" | "builtin">>,
  opts?: { bumpVersion?: boolean },
): Agent | null {
  const agents = readPersonalAgents();
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return null; // no existe en la personal (builtin o inexistente)
  const current = agents[idx];
  const merged: Agent = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    builtin: undefined,
    updatedAt: Date.now(),
    version: opts?.bumpVersion ? bumpPatch(current.version) : (patch.version ?? current.version),
  };
  // Re-sanea capacidades/visibilidad por si el patch trae basura.
  merged.capabilities = (merged.capabilities ?? []).filter((c) => typeof c === "string");
  merged.visibility = sanitizeVisibility(merged.visibility);
  merged.model = sanitizeModelPrefs(merged.model);
  agents[idx] = merged;
  writePersonalAgents(agents);
  return merged;
}

/** UPDATE: sube el patch de versión de un agente personal (atajo). */
export function updateAgentVersion(id: string): Agent | null {
  return updateAgent(id, {}, { bumpVersion: true });
}

/** Incrementa el último número de una versión "a.b.c" (defensivo). */
function bumpPatch(version: string): string {
  const parts = (version || "1.0.0").split(".");
  while (parts.length < 3) parts.push("0");
  const last = parseInt(parts[2], 10);
  parts[2] = String(Number.isFinite(last) ? last + 1 : 1);
  return parts.slice(0, 3).join(".");
}

/** Borra un agente PERSONAL (los builtins no se borran). */
export function deleteAgent(id: string): boolean {
  const agents = readPersonalAgents();
  const next = agents.filter((a) => a.id !== id);
  if (next.length === agents.length) return false;
  writePersonalAgents(next);
  // Limpia sus bindings huérfanos.
  const bindings = readBindings().filter((b) => b.agentId !== id);
  writeJson(AGENT_BINDINGS_KEY, bindings);
  emitAgentsEvent();
  return true;
}

/**
 * REPLICAR: copia CUALQUIER agente (builtin o personal) a la biblioteca
 * personal con un id NUEVO. La copia es editable y privada por defecto.
 * `overrides` permite cambiar nombre/persona/etc. al vuelo.
 */
export function replicateAgent(source: Agent | string, overrides?: Partial<AgentDraft>): Agent | null {
  const src = typeof source === "string" ? getAgent(source) : source;
  if (!src) return null;
  return createAgent({
    name: overrides?.name ?? `${src.name} (copia)`,
    description: overrides?.description ?? src.description,
    persona: overrides?.persona ?? src.persona,
    capabilities: overrides?.capabilities ?? [...src.capabilities],
    model: overrides?.model ?? (src.model ? { ...src.model } : undefined),
    icon: overrides?.icon ?? src.icon,
    author: overrides?.author ?? "Tú",
    visibility: overrides?.visibility ?? "private",
    // Una réplica pura NO establece parentId (es una copia, no una rama):
    // el linaje de "fork" lo marca branchAgent.
  });
}

/**
 * BRANCH (fork): como replicar, pero DEJA CONSTANCIA del linaje con
 * `parentId` apuntando al agente origen (Singularidad del contenido §6).
 */
export function branchAgent(source: Agent | string, overrides?: Partial<AgentDraft>): Agent | null {
  const src = typeof source === "string" ? getAgent(source) : source;
  if (!src) return null;
  return createAgent({
    name: overrides?.name ?? `${src.name} (rama)`,
    description: overrides?.description ?? src.description,
    persona: overrides?.persona ?? src.persona,
    capabilities: overrides?.capabilities ?? [...src.capabilities],
    model: overrides?.model ?? (src.model ? { ...src.model } : undefined),
    icon: overrides?.icon ?? src.icon,
    author: overrides?.author ?? "Tú",
    visibility: overrides?.visibility ?? "private",
    parentId: src.id,
  });
}

/* ═══════════════════ SHARE público (stub, sin backend real) ═══════════════════ */

function readPublicRecords(): PublicAgentRecord[] {
  const raw = readJson<unknown>(PUBLIC_AGENTS_KEY);
  if (!Array.isArray(raw)) return [];
  const out: PublicAgentRecord[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const agent = sanitizeAgent(rec.agent);
    if (!agent) continue;
    out.push({
      agent,
      sharedAt: typeof rec.sharedAt === "number" ? rec.sharedAt : Date.now(),
      sharedBy: asString(rec.sharedBy, agent.author),
    });
  }
  return out;
}

/** Registro público local (compartidos). HONESTO: la red real es un paso futuro. */
export function listPublicAgents(): PublicAgentRecord[] {
  return readPublicRecords();
}

/**
 * COMPARTIR a un entorno social público: marca el agente como `visibility:
 * "public"` (si es personal) y lo AÑADE al registro público "stub"
 * (`starseed.agents.public.v1`). HONESTIDAD RADICAL (como publishBranch de
 * packages.ts): esto es una preparación LOCAL firmada con tu autoría; la
 * publicación real a la red StarSeed (para que otras cuentas lo instalen) es
 * un paso futuro vía Supabase. Devuelve el registro creado (o null si no hay
 * agente).
 */
export function shareAgentPublic(id: string, sharedBy?: string): PublicAgentRecord | null {
  const agent = getAgent(id);
  if (!agent) return null;
  // Si es personal, refleja la visibilidad pública en su ficha.
  if (!isBuiltinAgent(id)) {
    updateAgent(id, { visibility: "public" });
  }
  const shared: Agent = { ...getAgent(id)!, visibility: "public" };
  const record: PublicAgentRecord = {
    agent: shared,
    sharedAt: Date.now(),
    sharedBy: sharedBy ?? shared.author ?? "Tú",
  };
  const next = readPublicRecords().filter((r) => r.agent.id !== id);
  next.push(record);
  writeJson(PUBLIC_AGENTS_KEY, next);
  emitAgentsEvent();
  return record;
}

/** Retira un agente del registro público (vuelve a privado si es personal). */
export function unshareAgentPublic(id: string): boolean {
  const records = readPublicRecords();
  const next = records.filter((r) => r.agent.id !== id);
  const changed = next.length !== records.length;
  if (changed) writeJson(PUBLIC_AGENTS_KEY, next);
  if (!isBuiltinAgent(id)) updateAgent(id, { visibility: "private" });
  if (changed) emitAgentsEvent();
  return changed;
}

/** ¿Está este agente compartido públicamente (en el registro stub)? */
export function isSharedPublic(id: string): boolean {
  return readPublicRecords().some((r) => r.agent.id === id);
}

/* ═══════════════════════════ BINDINGS [P4] ═══════════════════════════ */

function readBindings(): AgentBinding[] {
  const raw = readJson<unknown>(AGENT_BINDINGS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeBinding).filter((b): b is AgentBinding => b !== null);
}

function writeBindings(bindings: AgentBinding[]): void {
  writeJson(AGENT_BINDINGS_KEY, bindings);
  emitAgentsEvent();
}

/** Clave de identidad de un binding (un agente por target+scope). */
function bindingKey(b: { agentId: string; targetType: string; targetId: string; scope: string }): string {
  return `${b.agentId}::${b.targetType}::${b.targetId}::${b.scope}`;
}

/**
 * ATAR un agente a un "cerebro"/ubicación (page/group/post/message/widget/app/
 * profile) en ámbito público o privado. Idempotente: no duplica el mismo
 * vínculo. Devuelve el binding creado o null si los datos son inválidos.
 */
export function bindAgent(
  agentId: string,
  targetType: BindingTargetType,
  targetId: string,
  scope: BindingScope = "private",
): AgentBinding | null {
  const candidate = sanitizeBinding({ agentId, targetType, targetId, scope, at: Date.now() });
  if (!candidate) return null;
  const bindings = readBindings();
  const key = bindingKey(candidate);
  const others = bindings.filter((b) => bindingKey(b) !== key);
  writeBindings([...others, candidate]);
  return candidate;
}

/** DESATAR: quita un vínculo concreto (agente+target+scope). */
export function unbindAgent(
  agentId: string,
  targetType: BindingTargetType,
  targetId: string,
  scope?: BindingScope,
): boolean {
  const bindings = readBindings();
  const next = bindings.filter((b) => {
    const sameTarget = b.agentId === agentId && b.targetType === targetType && b.targetId === targetId;
    if (!sameTarget) return true;
    if (scope && b.scope !== scope) return true; // si se pasa scope, solo ese
    return false; // eliminar
  });
  if (next.length === bindings.length) return false;
  writeBindings(next);
  return true;
}

/** Quita TODOS los vínculos de un agente (p.ej. al borrarlo). */
export function unbindAllForAgent(agentId: string): number {
  const bindings = readBindings();
  const next = bindings.filter((b) => b.agentId !== agentId);
  const removed = bindings.length - next.length;
  if (removed > 0) writeBindings(next);
  return removed;
}

/** LISTAR todos los vínculos (opcionalmente filtrados). */
export function listBindings(filter?: {
  agentId?: string;
  targetType?: BindingTargetType;
  targetId?: string;
  scope?: BindingScope;
}): AgentBinding[] {
  let out = readBindings();
  if (filter?.agentId) out = out.filter((b) => b.agentId === filter.agentId);
  if (filter?.targetType) out = out.filter((b) => b.targetType === filter.targetType);
  if (filter?.targetId) out = out.filter((b) => b.targetId === filter.targetId);
  if (filter?.scope) out = out.filter((b) => b.scope === filter.scope);
  return out;
}

/**
 * El(los) agente(s) atados a un target concreto. Útil para que una superficie
 * (página/grupo/widget…) resuelva "qué cerebro Aurora me anima".
 */
export function agentsForTarget(
  targetType: BindingTargetType,
  targetId: string,
  scope?: BindingScope,
): Agent[] {
  const binds = listBindings({ targetType, targetId, scope });
  const byId = new Map(listAgents().map((a) => [a.id, a] as const));
  const out: Agent[] = [];
  for (const b of binds) {
    const a = byId.get(b.agentId);
    if (a && !out.some((x) => x.id === a.id)) out.push(a);
  }
  return out;
}

/** Primer agente atado a un target (atajo cómodo). */
export function primaryAgentForTarget(
  targetType: BindingTargetType,
  targetId: string,
  scope?: BindingScope,
): Agent | undefined {
  return agentsForTarget(targetType, targetId, scope)[0];
}

/* ═══════════════════ Sincronización con la CUENTA soberana ═══════════════════ */

/**
 * Fusiona (UNIÓN, nunca resta) agentes/bindings/públicos traídos de la CUENTA,
 * para que los agentes SIGAN a la misma identidad en cualquier dispositivo
 * (OS · Nexus · Café). Lo llamará library-sync en el pull. Local prevalece en
 * conflicto de id. Defensivo; nunca lanza.
 */
export function mergeAgentsFromAccount(payload?: {
  agents?: unknown;
  bindings?: unknown;
  publicAgents?: unknown;
} | null): void {
  if (!isClient() || !payload) return;

  // ── Agentes: unión por id; el local gana. ──
  try {
    if (Array.isArray(payload.agents)) {
      const local = readPersonalAgents();
      const localIds = new Set(local.map((a) => a.id));
      const remote = payload.agents
        .map(sanitizeAgent)
        .filter((a): a is Agent => a !== null && !a.builtin && !localIds.has(a.id));
      if (remote.length) writePersonalAgents([...local, ...remote]);
    }
  } catch {
    /* noop */
  }

  // ── Bindings: unión por clave; el local gana. ──
  try {
    if (Array.isArray(payload.bindings)) {
      const local = readBindings();
      const localKeys = new Set(local.map(bindingKey));
      const remote = payload.bindings
        .map(sanitizeBinding)
        .filter((b): b is AgentBinding => b !== null && !localKeys.has(bindingKey(b)));
      if (remote.length) writeBindings([...local, ...remote]);
    }
  } catch {
    /* noop */
  }

  // ── Registro público (stub): unión por id de agente. ──
  try {
    if (Array.isArray(payload.publicAgents)) {
      const local = readPublicRecords();
      const localIds = new Set(local.map((r) => r.agent.id));
      const remote: PublicAgentRecord[] = [];
      for (const r of payload.publicAgents) {
        if (!r || typeof r !== "object") continue;
        const rec = r as Record<string, unknown>;
        const agent = sanitizeAgent(rec.agent);
        if (!agent || localIds.has(agent.id)) continue;
        remote.push({
          agent,
          sharedAt: typeof rec.sharedAt === "number" ? rec.sharedAt : Date.now(),
          sharedBy: asString(rec.sharedBy, agent.author),
        });
      }
      if (remote.length) writeJson(PUBLIC_AGENTS_KEY, [...local, ...remote]);
    }
  } catch {
    /* noop */
  }

  emitAgentsEvent();
}

/**
 * Snapshot para SUBIR a la cuenta (lo consumirá library-sync al hacer push).
 * Solo agentes PERSONALES (los builtins no se suben: son de fábrica).
 */
export function getAgentsSnapshot(): {
  agents: Agent[];
  bindings: AgentBinding[];
  publicAgents: PublicAgentRecord[];
} {
  return {
    agents: readPersonalAgents(),
    bindings: readBindings(),
    publicAgents: readPublicRecords(),
  };
}

/* ═══════════════════ Puente con la Biblioteca ("instalar" kind agent) ═══════════════════ */

/**
 * Registra un agente (típicamente un builtin del repo «Agentes») en la
 * biblioteca personal si aún no existe (por id). Lo usa packages.install()
 * al instalar un paquete de kind "agent". Idempotente. Nunca lanza.
 * Devuelve true si añadió algo nuevo.
 */
export function ensureAgentInstalled(agent: Agent): boolean {
  if (!isClient()) return false;
  try {
    const safe = sanitizeAgent(agent);
    if (!safe) return false;
    const personal = readPersonalAgents();
    if (personal.some((a) => a.id === safe.id)) return false;
    // Al instalar desde la Biblioteca dejamos constancia de su origen builtin
    // pero como copia editable de tu biblioteca (no `builtin`, para que puedas
    // ajustarla). El linaje queda en parentId.
    const installed: Agent = {
      ...safe,
      builtin: undefined,
      parentId: safe.parentId ?? safe.id,
      updatedAt: Date.now(),
    };
    writePersonalAgents([...personal, installed]);
    return true;
  } catch {
    return false;
  }
}
