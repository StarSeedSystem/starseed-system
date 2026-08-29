"use client";

/**
 * Cliente de GESTIÓN del backend Astraura 1.58-bit (Adenda 153).
 * ----------------------------------------------------------------------------
 * El CHAT va por el proveedor (`src/ai/providers/astraura-158.ts`) y el router.
 * Este módulo cubre lo demás que el OS enseña y opera desde el panel
 * «Astraura 1.58» y la ventana de sistemas: estado del motor, personalidades,
 * agentes, habilidades, cerebros, memoria (mem0) y túnel.
 *
 * Endpoints (verificados en `backend/app/main.py`, 2026-08-22):
 *   GET  /api/status · /api/personalities · /api/agents · /api/ecosystem/agents ·
 *        /api/skills · /api/cerebros · /api/system/tunnel/status · /api/starseed/manifest (puente nuevo)
 *   POST /api/personalities/activate {persona_id} · /api/skills/toggle {skill_id,enabled} ·
 *        /api/cerebros/activate {brain_id} · /api/ecosystem/agents/{id}/toggle {enabled} ·
 *        /api/memory/mem0/search {query,user_id,limit}
 *
 * Dos destinos: LOCAL (endpoint de la neurona, directo) y NUBE (proxy del OS
 * `/api/ai/astraura-158`, con sesión). Timeouts cortos; nunca lanza hacia la UI
 * (devuelve `{ ok:false, error }`). SSR-safe.
 */

import { settingsFor, thisDeviceId, astraura158EndpointOf } from "@/lib/neurons/neurons";
import { ASTRAURA_158_PROXY_BASE } from "@/ai/astraura/free-catalog";

export type Astraura158Target = "local" | "nube";

export interface Astraura158Result<T> { ok: true; data: T; target: Astraura158Target; endpoint: string }
export interface Astraura158Failure { ok: false; error: string; target: Astraura158Target; endpoint: string }
export type Astraura158Response<T> = Astraura158Result<T> | Astraura158Failure;

export interface Astraura158Status {
  status?: string;
  app_name?: string;
  engine?: {
    engine_name?: string;
    active_model?: string;
    bitnet_cpp_installed?: boolean;
    models_on_disk?: unknown[];
    inference_mode?: string;
    quantization?: string;
    tokens_generated?: number;
    speed_tps?: number;
    /** "bitnet-native" | "ollama" | "templates" (backend fusionado, Adenda 153). */
    real_mode?: string;
    /** Memoria RSS del proceso del motor, en MB (si el backend la mide). Ola 4 (§3, Telemetría). */
    process_memory_mb?: number;
    /** Servidor nativo `llama-server` embebido (bitnet.cpp): perfiles interactivo y de fondo. Ola 4. */
    bitnet_server?: { interactive?: Astraura158BitnetServerProfile; background?: Astraura158BitnetServerProfile; [k: string]: unknown };
    /** (Adenda 157) Pila de cuantización: motores de PESOS + índice comprimido de MEMORIA. */
    quantization_stack?: Astraura158QuantizationStack;
  };
  memory_summary?: { knowledge_nodes?: number; knowledge_edges?: number; vector_documents?: number; learned_events_count?: number };
  skills_active?: number;
  profiler?: { hardware_family?: string; system?: Record<string, unknown> };
  telemetry?: Record<string, unknown>;
}

/** (Adenda 157) Inventario honesto de cuantización que publica el backend. */
export interface Astraura158QuantizationEngine {
  id?: string;
  nombre?: string;
  disponible?: boolean;
  activo?: boolean;
  cuantizacion?: string;
  detalle?: string;
  binario?: string | null;
  url?: string;
  requisitos?: string;
  [k: string]: unknown;
}

export interface Astraura158QuantizationStack {
  pesos?: { activo?: string; maquina?: string; nota?: string; motores?: Astraura158QuantizationEngine[]; error?: string };
  memoria?: {
    codec?: string; disponible?: boolean; activo?: boolean; bits?: number; dim?: number;
    documentos?: number; indexados?: number; minimo_para_activarse?: number;
    coseno_medio?: number; coseno_minimo?: number; ratio_compresion?: number; nota?: string; error?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface Astraura158Personality {
  id: string;
  name: string;
  title?: string;
  color?: string;
  description?: string;
  is_custom?: boolean;
  temperature?: number;
  voice_profile?: { voice_id?: string; caracter?: string };
  tags?: string[];
}

export interface Astraura158Agent {
  id: string;
  name: string;
  role?: string;
  area?: string;
  area_id?: string;
  status?: string;
  enabled?: boolean;
  is_busy?: boolean;
  color?: string;
  emoji?: string;
  used_personalities?: { id: string; name: string }[];
  /** Procedencia en el backend: bóveda (`/api/agents`) o ecosistema (`/api/ecosystem/agents`). */
  origin: "vault" | "ecosystem";
}

export interface Astraura158Skill {
  id: string;
  name: string;
  category?: string;
  icon?: string;
  blurb?: string;
  enabled: boolean;
  is_builtin?: boolean;
}

export interface Astraura158Brain {
  id: string;
  name: string;
  scope?: string;
  role?: string;
  color?: string;
  active_persona?: string;
  md_layers?: Record<string, string>;
  memory_neurons?: { id: string; name: string; type?: string; enabled?: boolean }[];
  linked_personalities?: string[];
}

export interface Astraura158Manifest {
  status: Astraura158Status | null;
  personalities: Astraura158Personality[];
  activePersona?: string;
  agents: Astraura158Agent[];
  skills: Astraura158Skill[];
  brains: Astraura158Brain[];
  activeBrain?: string;
  /** true si el backend trae el puente `/api/starseed/*` (versión fusionada). */
  bridge: boolean;
}

/** Endpoint efectivo por destino (local = neurona; nube = proxy del OS). */
export function astraura158Endpoint(target: Astraura158Target): string {
  if (target === "nube") {
    const env = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ASTRAURA_158_URL : undefined;
    const v = String(env ?? "").trim().replace(/\/+$/, "");
    return v || ASTRAURA_158_PROXY_BASE;
  }
  try { return astraura158EndpointOf(thisDeviceId()); } catch { return "http://127.0.0.1:8000"; }
}

/** ¿Esta neurona apagó su fuente local? */
export function astraura158LocalEnabled(): boolean {
  try { return settingsFor(thisDeviceId()).astraura158?.enabled !== false; } catch { return true; }
}

/** Timeouts «largos» para acciones que el backend ejecuta de verdad (ciclos, informes, workflows, lotes). */
function longTimeout(target: Astraura158Target): number {
  return target === "nube" ? 60_000 : 30_000;
}

async function call<T>(target: Astraura158Target, path: string, init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number }): Promise<Astraura158Response<T>> {
  const endpoint = astraura158Endpoint(target);
  if (typeof window === "undefined") return { ok: false, error: "SSR", target, endpoint };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? (target === "nube" ? 12_000 : 4_000));
  try {
    const res = await fetch(`${endpoint}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = String(j?.error ?? j?.detail ?? ""); } catch { /* */ }
      return { ok: false, error: `HTTP ${res.status}${detail ? `: ${detail.slice(0, 140)}` : ""}`, target, endpoint };
    }
    const data = (await res.json()) as T;
    return { ok: true, data, target, endpoint };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort/i.test(msg) ? "sin respuesta (timeout)" : msg.slice(0, 160), target, endpoint };
  }
}

/** Muchas acciones del backend devuelven `{success:false, error}` con HTTP 200: se normaliza a fallo. */
function unwrap<T extends { success?: boolean; error?: string; message?: string }>(r: Astraura158Response<T>): Astraura158Response<T> {
  if (r.ok && r.data && typeof r.data === "object" && r.data.success === false) {
    return { ok: false, error: String(r.data.error ?? r.data.message ?? "el backend rechazó la acción"), target: r.target, endpoint: r.endpoint };
  }
  return r;
}

async function post<T extends { success?: boolean; error?: string; message?: string }>(target: Astraura158Target, path: string, body?: unknown, timeoutMs?: number) {
  return unwrap(await call<T>(target, path, { method: "POST", body: body ?? {}, timeoutMs }));
}

/**
 * Igual que `call`, pero para respuestas que NO son JSON. El backend soberano
 * sirve el script del instalador como `text/x-shellscript` (PlainTextResponse):
 * pasarlo por `res.json()` reventaba con «Unexpected token» y la pestaña
 * mostraba un error de red que no existía.
 */
async function callText(target: Astraura158Target, path: string, timeoutMs?: number): Promise<Astraura158Response<string>> {
  const endpoint = astraura158Endpoint(target);
  if (typeof window === "undefined") return { ok: false, error: "SSR", target, endpoint };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs ?? (target === "nube" ? 12_000 : 4_000));
  try {
    const res = await fetch(`${endpoint}${path}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, target, endpoint };
    return { ok: true, data: await res.text(), target, endpoint };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort/i.test(msg) ? "sin respuesta (timeout)" : msg.slice(0, 160), target, endpoint };
  }
}

export function fetchAstraura158Status(target: Astraura158Target): Promise<Astraura158Response<Astraura158Status>> {
  return call<Astraura158Status>(target, "/api/status");
}

/**
 * Manifiesto UNIFICADO. Usa `/api/starseed/manifest` (puente nuevo) y, si el
 * backend es antiguo (404), lo compone con las 5 llamadas clásicas en paralelo.
 */
export async function fetchAstraura158Manifest(target: Astraura158Target): Promise<Astraura158Response<Astraura158Manifest>> {
  const bridged = await call<{
    status?: Astraura158Status; personalities?: Astraura158Personality[]; active_persona_id?: string;
    agents?: Astraura158Agent[]; skills?: Astraura158Skill[]; cerebros?: Astraura158Brain[]; active_brain_id?: string;
  }>(target, "/api/starseed/manifest");
  if (bridged.ok) {
    const d = bridged.data;
    return {
      ok: true, target, endpoint: bridged.endpoint,
      data: {
        status: d.status ?? null,
        personalities: d.personalities ?? [],
        activePersona: d.active_persona_id,
        agents: (d.agents ?? []).map((a) => ({ ...a, origin: a.origin ?? "vault" })),
        skills: d.skills ?? [],
        brains: d.cerebros ?? [],
        activeBrain: d.active_brain_id,
        bridge: true,
      },
    };
  }
  const [status, personalities, agents, eco, skills, brains] = await Promise.all([
    call<Astraura158Status>(target, "/api/status"),
    call<{ personalities?: Astraura158Personality[]; active_persona?: { id?: string } }>(target, "/api/personalities"),
    call<{ agents?: Astraura158Agent[] }>(target, "/api/agents"),
    call<{ agents?: Astraura158Agent[] }>(target, "/api/ecosystem/agents"),
    call<{ skills?: Astraura158Skill[] }>(target, "/api/skills"),
    call<{ cerebros?: Astraura158Brain[]; active_brain_id?: string }>(target, "/api/cerebros"),
  ]);
  if (!status.ok) return { ok: false, error: status.error, target, endpoint: status.endpoint };
  const vault = (agents.ok ? agents.data.agents ?? [] : []).map((a) => ({ ...a, origin: "vault" as const }));
  const ecosystem = (eco.ok ? eco.data.agents ?? [] : []).map((a) => ({ ...a, origin: "ecosystem" as const }));
  return {
    ok: true, target, endpoint: status.endpoint,
    data: {
      status: status.data,
      personalities: personalities.ok ? personalities.data.personalities ?? [] : [],
      activePersona: personalities.ok ? personalities.data.active_persona?.id : undefined,
      agents: [...vault, ...ecosystem],
      skills: skills.ok ? skills.data.skills ?? [] : [],
      brains: brains.ok ? brains.data.cerebros ?? [] : [],
      activeBrain: brains.ok ? brains.data.active_brain_id : undefined,
      bridge: false,
    },
  };
}

export function activateAstraura158Personality(target: Astraura158Target, personaId: string) {
  return call<{ success?: boolean }>(target, "/api/personalities/activate", { method: "POST", body: { persona_id: personaId } });
}

export function toggleAstraura158Skill(target: Astraura158Target, skillId: string, enabled: boolean) {
  return call<{ success?: boolean }>(target, "/api/skills/toggle", { method: "POST", body: { skill_id: skillId, enabled } });
}

export function activateAstraura158Brain(target: Astraura158Target, brainId: string) {
  return call<{ success?: boolean }>(target, "/api/cerebros/activate", { method: "POST", body: { brain_id: brainId } });
}

export function toggleAstraura158Agent(target: Astraura158Target, agentId: string, enabled: boolean) {
  return call<{ success?: boolean }>(target, `/api/ecosystem/agents/${encodeURIComponent(agentId)}/toggle`, { method: "POST", body: { enabled } });
}

export interface Astraura158Memory { id?: string; memory?: string; category?: string; created_at?: string; score?: number }

export function searchAstraura158Memory(target: Astraura158Target, query: string, limit = 8) {
  return call<{ success?: boolean; results?: Astraura158Memory[]; total?: number }>(target, "/api/memory/mem0/search", {
    method: "POST", body: { query, limit }, timeoutMs: 8000,
  });
}

export interface Astraura158Tunnel { active?: boolean; url?: string; lan_ips?: string[]; lan_endpoints?: string[]; provider?: string }

export function fetchAstraura158Tunnel(target: Astraura158Target) {
  return call<{ success?: boolean; tunnel?: Astraura158Tunnel }>(target, "/api/system/tunnel/status");
}

/** Prueba un endpoint arbitrario (para el campo «endpoint de esta neurona»). */
export async function probeAstraura158(endpoint: string, timeoutMs = 5000): Promise<{ ok: boolean; model?: string; error?: string }> {
  if (typeof window === "undefined") return { ok: false, error: "SSR" };
  const base = endpoint.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, error: "endpoint vacío" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/status`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j = (await res.json().catch(() => null)) as Astraura158Status | null;
    return { ok: true, model: j?.engine?.active_model };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort/i.test(msg) ? "sin respuesta (timeout)" : msg.slice(0, 120) };
  }
}

/** Resumen honesto del motor para chips (lo que el backend DICE que usa). */
export function describeAstraura158Engine(s: Astraura158Status | null | undefined): { label: string; real: boolean; bitnet: boolean } {
  const model = String(s?.engine?.active_model ?? "").trim();
  if (!s) return { label: "sin conexión", real: false, bitnet: false };
  // Backend fusionado (Adenda 153): `real_mode` dice la verdad del motor.
  const mode = String((s.engine as { real_mode?: string } | undefined)?.real_mode ?? "");
  if (mode === "bitnet-native") return { label: model || "BitNet b1.58 nativo", real: true, bitnet: true };
  if (mode === "ollama") return { label: model, real: true, bitnet: false };
  if (mode === "templates") return { label: "motor sin modelo (plantillas)", real: false, bitnet: false };
  // Backend anterior: heurística por campos clásicos.
  const bitnet = !!s.engine?.bitnet_cpp_installed && Array.isArray(s.engine?.models_on_disk) && s.engine!.models_on_disk!.length > 0;
  if (bitnet) return { label: `BitNet b1.58 nativo · ${model || "GGUF"}`, real: true, bitnet: true };
  if (model) return { label: model, real: true, bitnet: false };
  return { label: "motor sin modelo (plantillas)", real: false, bitnet: false };
}

/* ════════════════════════════════════════════════════════════════════════════
 * STUDIO 1.58 — operación de TODOS los subsistemas del backend desde el OS.
 * Endpoints y nombres de campo verificados en `backend/app/main.py` (2026-08-22).
 * Misma regla: nunca lanza; `{ok:false,error}` explícito; `success:false` → fallo.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Respuesta genérica de acción (`{success, message?, …}`). */
export interface Astraura158Ack { success?: boolean; message?: string; error?: string; [k: string]: unknown }

/* ── Imaginación intuitiva ─────────────────────────────────────────────────── */

export interface Astraura158PermissionPolicy {
  level?: string;
  notify_on_important?: boolean;
  notify_on_security?: boolean;
  auto_sync_agents?: boolean;
}

export interface Astraura158PermissionLevel { id: string; label: string; description?: string; auto_threshold?: string[] }

export interface Astraura158ProcessType {
  id: string;
  name: string;
  icon?: string;
  category?: string;
  description?: string;
  color?: string;
  default_permission_level?: string;
  status?: string;
  allocated_resource_percent?: number;
  last_activated_at?: number;
  last_activated_formatted?: string;
  cycles_count?: number;
  permission_policy?: Astraura158PermissionPolicy;
  pending_proposals_count?: number;
  is_auto_paused_by_limit?: boolean;
}

export interface Astraura158Branch {
  id: string;
  theme?: string;
  hypothesis?: string;
  insights?: string;
  process_type?: string;
  process_name?: string;
  importance_level?: string;
  requires_user_approval?: boolean;
  permission_policy_applied?: string;
  status?: string;
  applied_by?: string;
  timestamp?: number;
  formatted_time?: string;
  progress_percent?: number;
  verification?: { is_verified?: boolean; score?: number; checked_by?: string };
}

export interface Astraura158ImaginationCreation {
  id: string;
  title?: string;
  type?: string;
  content?: string;
  tags?: string[];
  origin_branch?: string;
  importance_level?: string;
  requires_user_approval?: boolean;
  status?: string;
  timestamp?: number;
}

export interface Astraura158DualTrunk {
  imagination_global_percent?: number;
  swarm_global_percent?: number;
  interactive_reserve_percent?: number;
  total_cores?: number;
  imagination_cores?: number;
  swarm_cores?: number;
  user_chat_cores?: number;
}

/** Campos GLOBALES editables vía `POST /api/imagination/config {config}` (engine.update_config). */
export interface Astraura158ImaginationConfig {
  is_always_on?: boolean;
  operation_mode?: string;
  cycle_frequency_minutes?: number;
  max_imagination_global_percent?: number;
  max_swarm_global_percent?: number;
  max_concurrent_processes?: number;
  max_accumulated_requests_threshold?: number;
  max_proposals_per_agent_limit?: number;
  auto_sync_all_proposals_enabled?: boolean;
  quantum_entropy_level?: number;
  max_kb_per_minute?: number;
  max_mb_per_hour?: number;
  storage_target?: string;
  associated_brain_ids?: string[];
  auto_recycle_memories?: boolean;
}

export interface Astraura158ImaginationStatus extends Astraura158ImaginationConfig {
  dual_trunk?: Astraura158DualTrunk;
  allocated_cores?: number;
  total_m1_cores?: number;
  is_paused_due_to_threshold?: boolean;
  active_agents_count?: number;
  active_processes_count?: number;
  hourly_generated_kb?: number;
  daily_generated_mb?: number;
  cycles_completed?: number;
  active_process_types?: string[];
  permission_levels_catalog?: Record<string, Astraura158PermissionLevel>;
  permission_policies?: Record<string, Astraura158PermissionPolicy>;
  process_types_catalog?: Astraura158ProcessType[];
  is_dreaming_now?: boolean;
  next_cycle_seconds_left?: number;
  next_cycle_formatted?: string;
  pending_approval_count?: number;
  total_proposals_count?: number;
  branches?: Astraura158Branch[];
  creations?: Astraura158ImaginationCreation[];
  sync_execution_state?: { is_running?: boolean; progress_percent?: number; total_tasks?: number; completed_tasks?: number };
}

export function fetchAstraura158ImaginationStatus(target: Astraura158Target) {
  return call<Astraura158ImaginationStatus>(target, "/api/imagination/status", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

export function fetchAstraura158ProcessTypes(target: Astraura158Target) {
  return call<{ process_types?: Astraura158ProcessType[] }>(target, "/api/imagination/process_types");
}

export function updateAstraura158ImaginationConfig(target: Astraura158Target, config: Astraura158ImaginationConfig) {
  return post<Astraura158Ack & { config?: Astraura158ImaginationStatus }>(target, "/api/imagination/config", { config });
}

/**
 * Dispara un ciclo de imaginación. PRIMERO por el puente (`/api/starseed/...`),
 * que lo programa en SEGUNDO PLANO y responde al instante: el ciclo hace
 * inferencia real con el modelo 1.58 y puede tardar minutos en CPU; la rama
 * llega luego por el feed de eventos. Si el backend no trae el puente (versión
 * anterior), cae al endpoint clásico bloqueante.
 */
export async function triggerAstraura158Imagination(target: Astraura158Target, opts?: { theme?: string; process_type?: string }) {
  const body = { theme: opts?.theme || null, process_type: opts?.process_type || null };
  const bridged = await post<Astraura158Ack & { scheduled?: boolean; branch?: Astraura158Branch }>(
    target, "/api/starseed/processes/imagination/trigger", body, longTimeout(target),
  );
  if (bridged.ok) return bridged;
  return post<Astraura158Ack & { branch?: Astraura158Branch; paused_by_threshold?: boolean; change_needed?: boolean; scheduled?: boolean }>(
    target, "/api/imagination/trigger", body, longTimeout(target),
  );
}

export function recycleAstraura158Imagination(target: Astraura158Target) {
  return post<Astraura158Ack & { recycle?: { items_compacted?: number; space_freed_kb?: number } }>(target, "/api/imagination/recycle", {}, longTimeout(target));
}

export type Astraura158ProposalAction = "apply" | "discard" | "edit";

export function imaginationAstraura158Action(target: Astraura158Target, itemId: string, itemType: "branch" | "creation" | "insight" | "suggestion", action: Astraura158ProposalAction, data?: Record<string, unknown>) {
  return post<Astraura158Ack>(target, "/api/imagination/action", { item_id: itemId, item_type: itemType, action, data: data ?? null }, longTimeout(target));
}

export function fetchAstraura158Process(target: Astraura158Target, processId: string) {
  return call<{ success?: boolean; process?: Astraura158ProcessType; metadata?: Record<string, unknown>; progress_percent?: number; permission_policy?: Astraura158PermissionPolicy; branches?: Astraura158Branch[]; creations?: Astraura158ImaginationCreation[]; history?: unknown[] }>(
    target, `/api/imagination/process/${encodeURIComponent(processId)}`,
  );
}

export function fetchAstraura158ProcessBranches(target: Astraura158Target, processId: string) {
  return call<{ success?: boolean; process?: Astraura158ProcessType; all_branches?: Astraura158Branch[]; branches?: Astraura158Branch[]; in_progress?: Astraura158Branch[]; completed?: Astraura158Branch[] }>(
    target, `/api/imagination/process/${encodeURIComponent(processId)}/branches`,
  );
}

export function updateAstraura158ProcessConfig(target: Astraura158Target, processId: string, config: { allocated_resource_percent?: number; status?: string; quantum_entropy?: number; permission_level?: string }) {
  return post<Astraura158Ack>(target, `/api/imagination/process/${encodeURIComponent(processId)}/config`, { config });
}

export function updateAstraura158ProcessPolicy(target: Astraura158Target, processId: string, policy: Astraura158PermissionPolicy) {
  return post<Astraura158Ack & { policy?: Astraura158PermissionPolicy }>(target, `/api/imagination/process/${encodeURIComponent(processId)}/permission_policy`, { policy });
}

export function applyAllAstraura158Proposals(target: Astraura158Target, itemIds?: string[]) {
  return post<Astraura158Ack & { applied_count?: number }>(target, "/api/imagination/apply_all", { item_ids: itemIds ?? null }, longTimeout(target));
}

export function grantAllAstraura158Requests(target: Astraura158Target) {
  return post<Astraura158Ack & { granted_count?: number }>(target, "/api/imagination/requests/grant_all", {}, longTimeout(target));
}

export function grantAstraura158Request(target: Astraura158Target, branchId: string, data?: Record<string, unknown>) {
  return post<Astraura158Ack>(target, `/api/imagination/requests/${encodeURIComponent(branchId)}/grant`, { data: data ?? null }, longTimeout(target));
}

export interface Astraura158SynthesisReport {
  id: string;
  synthesis_index?: number;
  timestamp?: number;
  formatted_date?: string;
  title?: string;
  trigger_type?: string;
  author_agent?: { id?: string; name?: string; role?: string; avatar_color?: string };
  supervisor?: string;
  executive_summary?: string;
  participating_agents?: { id?: string; name?: string; role?: string; color?: string; process_developed?: string; result?: string }[];
  completed_processes?: unknown[];
  upcoming_processes?: unknown[];
  delta_changes?: { new_elements?: string[]; modified_elements?: string[]; improvements?: string[] };
}

export function fetchAstraura158SynthesisReports(target: Astraura158Target, limit = 20) {
  return call<{ success?: boolean; total_reports?: number; latest?: Astraura158SynthesisReport | null; reports?: Astraura158SynthesisReport[] }>(
    target, `/api/imagination/synthesis_reports?limit=${encodeURIComponent(String(limit))}`,
  );
}

export function fetchAstraura158LatestSynthesisReport(target: Astraura158Target) {
  return call<{ success?: boolean; report?: Astraura158SynthesisReport }>(target, "/api/imagination/synthesis_reports/latest", { timeoutMs: longTimeout(target) });
}

export function generateAstraura158SynthesisReport(target: Astraura158Target, triggerType = "manual_request", contextData?: Record<string, unknown>) {
  return post<Astraura158Ack & { report?: Astraura158SynthesisReport }>(target, "/api/imagination/synthesis_reports/generate", { trigger_type: triggerType, context_data: contextData ?? null }, longTimeout(target));
}

export function fetchAstraura158DualTrunk(target: Astraura158Target) {
  return call<Astraura158DualTrunk>(target, "/api/system/dual_trunk");
}

export function setAstraura158DualTrunk(target: Astraura158Target, imaginationPercent: number, swarmPercent: number) {
  return call<Astraura158DualTrunk>(target, "/api/system/dual_trunk", { method: "POST", body: { imagination_percent: Math.round(imaginationPercent), swarm_percent: Math.round(swarmPercent) } });
}

/* ── Enjambre (swarm) y Director ───────────────────────────────────────────── */

export interface Astraura158SwarmArea { id: string; name: string; lead_agent?: string; lead_name?: string; description?: string; color?: string }

export interface Astraura158SwarmAgent {
  id: string;
  name: string;
  area_id?: string;
  role?: string;
  status?: string;
  concurrency?: number;
  current_task?: string;
  progress?: number;
  color?: string;
  subagents_spawned?: number;
  completed_tasks?: number;
  used_personalities?: { id: string; name: string; color?: string; archetype?: string }[];
  linked_cerebros?: { id: string; name: string; color?: string }[];
}

export interface Astraura158SwarmTask {
  id: string;
  title?: string;
  prompt?: string;
  area_id?: string;
  area_name?: string;
  agent_id?: string;
  agent_name?: string;
  status?: string;
  progress?: number;
  execution_phase?: string;
  phase_label?: string;
  allocated_cpu_percent?: number;
  real_memory_mb?: number;
  started_at?: number;
  target_project_id?: string;
}

export interface Astraura158Schedule {
  id: string;
  title?: string;
  area_id?: string;
  assigned_agent?: string;
  frequency_minutes?: number;
  trigger_type?: string;
  is_enabled?: boolean;
  prompt?: string;
  next_run_timestamp?: number;
  last_run_timestamp?: number;
  last_result?: string;
}

export interface Astraura158CapacityGovernor {
  capacity_mode?: string;
  relative_capacity_percent?: number;
  allocated_cores?: number;
  free_cores_for_user?: number;
  system_cpu_usage?: number;
  battery_percent?: number;
  is_charging?: boolean;
  idle_seconds?: number;
  adaptation_reason?: string;
}

export interface Astraura158SwarmStatus {
  capacity_governor?: Astraura158CapacityGovernor;
  areas?: Astraura158SwarmArea[];
  agents?: Astraura158SwarmAgent[];
  active_tasks?: Astraura158SwarmTask[];
  schedules?: Astraura158Schedule[];
  total_active_agents?: number;
  total_completed_tasks?: number;
}

export function fetchAstraura158Swarm(target: Astraura158Target) {
  return call<Astraura158SwarmStatus>(target, "/api/swarm/status", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

export type Astraura158CapacityMode = "adaptive" | "performance" | "eco" | "manual";

export function setAstraura158SwarmCapacity(target: Astraura158Target, mode: Astraura158CapacityMode, manualPercent?: number) {
  return post<Astraura158Ack>(target, "/api/swarm/capacity_mode", { mode, manual_percent: manualPercent ?? null });
}

export function dispatchAstraura158Task(target: Astraura158Target, req: { area_id: string; title: string; prompt: string; agent_id?: string }) {
  return post<Astraura158Ack & { task?: Astraura158SwarmTask }>(target, "/api/swarm/task/dispatch", { ...req, agent_id: req.agent_id || null }, longTimeout(target));
}

export function cancelAstraura158Task(target: Astraura158Target, taskId: string) {
  return post<Astraura158Ack>(target, "/api/swarm/task/cancel", { task_id: taskId });
}

export function toggleAstraura158Schedule(target: Astraura158Target, scheduleId: string, enabled: boolean) {
  return post<Astraura158Ack>(target, "/api/swarm/schedule/toggle", { schedule_id: scheduleId, enabled });
}

export function setAstraura158ScheduleFrequency(target: Astraura158Target, scheduleId: string, frequencyMinutes: number) {
  return post<Astraura158Ack>(target, "/api/swarm/schedule/frequency", { schedule_id: scheduleId, frequency_minutes: Math.max(1, Math.round(frequencyMinutes)) });
}

export function createAstraura158Schedule(target: Astraura158Target, req: { title: string; area_id: string; agent_id: string; frequency_minutes: number; prompt?: string }) {
  return post<Astraura158Ack & { schedule?: Astraura158Schedule }>(target, "/api/swarm/schedule/create", { ...req, prompt: req.prompt || "Ejecución autónoma programada" });
}

export function toggleAstraura158SwarmAgent(target: Astraura158Target, agentId: string, enabled: boolean) {
  return post<Astraura158Ack>(target, "/api/swarm/agent/toggle", { agent_id: agentId, enabled });
}

export interface Astraura158DirectorConfig {
  orchestration_mode?: string;
  quality_threshold?: number;
  supervision_interval_seconds?: number;
  auto_route_to_projects?: boolean;
  auto_inject_axioms?: boolean;
  auto_trigger_imagination?: boolean;
  max_agent_concurrency?: number;
  m1_hardware_limit_percent?: number;
  default_master_directive?: string;
  retention_logs_count?: number;
}

export interface Astraura158DirectorStatus {
  director?: {
    id?: string; name?: string; role?: string; version?: string; color?: string; status?: string; active_directive?: string;
    config?: Astraura158DirectorConfig; tasks_supervised_count?: number; verifications_completed_count?: number; routings_performed_count?: number;
  };
  config?: Astraura158DirectorConfig;
  holistic_context?: Record<string, unknown>;
  executive_memories?: { id?: string; title?: string; content?: string; category?: string; importance?: string; timestamp?: number }[];
  decision_history?: { id?: string; timestamp?: number; action?: string; agent_id?: string; reasoning?: string; status?: string }[];
  audit_log?: { timestamp?: number; type?: string; target?: string; quality_score?: number; verdict?: string; details?: string }[];
}

export function fetchAstraura158Director(target: Astraura158Target) {
  return call<Astraura158DirectorStatus>(target, "/api/director/status", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

export function fetchAstraura158DirectorConfig(target: Astraura158Target) {
  return call<{ config?: Astraura158DirectorConfig }>(target, "/api/director/config");
}

export function updateAstraura158DirectorConfig(target: Astraura158Target, config: Astraura158DirectorConfig) {
  return post<Astraura158Ack & { config?: Astraura158DirectorConfig }>(target, "/api/director/config", { config });
}

export function steerAstraura158Swarm(target: Astraura158Target, directive: string, targetProjectId?: string) {
  return post<Astraura158Ack & { dispatched_actions?: unknown[] }>(target, "/api/director/steer_swarm", { directive, target_project_id: targetProjectId || null }, longTimeout(target));
}

export function triggerAstraura158DirectorCycle(target: Astraura158Target) {
  return post<Astraura158Ack & { context?: Record<string, unknown> }>(target, "/api/director/trigger_cycle", {}, longTimeout(target));
}

export function renewAstraura158DirectorTasks(target: Astraura158Target) {
  return post<Astraura158Ack & { renewed_tasks?: { title?: string; agent_id?: string; area_id?: string }[] }>(target, "/api/director/renew_tasks", {}, longTimeout(target));
}

/** Agentes de la BÓVEDA (`/api/agents`): imaginación de fondo por agente. */
export interface Astraura158VaultAgentImagination {
  imagination_enabled?: boolean;
  imagination_frequency?: string;
  imagination_permission_level?: string;
  compute_trunk?: string;
  cpu_quota_percent?: number;
  ram_limit_mb?: number;
  concurrency?: number;
}

export function fetchAstraura158VaultAgents(target: Astraura158Target) {
  return call<{ success?: boolean; agents?: (Astraura158Agent & Astraura158VaultAgentImagination)[] }>(target, "/api/agents");
}

export function toggleAstraura158AgentImagination(target: Astraura158Target, agentId: string, enabled: boolean) {
  return post<Astraura158Ack & { imagination_enabled?: boolean }>(target, `/api/agents/${encodeURIComponent(agentId)}/toggle_imagination`, { enabled });
}

export function updateAstraura158AgentImaginationConfig(target: Astraura158Target, agentId: string, config: Astraura158VaultAgentImagination) {
  return post<Astraura158Ack>(target, `/api/agents/${encodeURIComponent(agentId)}/update_imagination_config`, { config });
}

export interface Astraura158EcosystemAgent extends Astraura158Agent {
  section?: string;
  status_detail?: Record<string, unknown>;
  configurable?: boolean;
  config?: Record<string, unknown>;
}

export function fetchAstraura158EcosystemAgents(target: Astraura158Target) {
  return call<{ success?: boolean; agents?: Astraura158EcosystemAgent[] }>(target, "/api/ecosystem/agents");
}

export function updateAstraura158EcosystemAgentConfig(target: Astraura158Target, agentId: string, config: Record<string, unknown>) {
  return post<Astraura158Ack>(target, `/api/ecosystem/agents/${encodeURIComponent(agentId)}/config`, { config });
}

export interface Astraura158AuthOrchestrator {
  is_busy?: boolean;
  orchestrations_run?: number;
  auto_mode?: boolean;
  draining_mode?: boolean;
  requests_embargoed?: boolean;
  max_balanced_queue?: number;
  agent_name?: string;
  last_run?: { processed_count?: number; failed_count?: number; elapsed_seconds?: number; message?: string };
}

export function fetchAstraura158AuthOrchestrator(target: Astraura158Target) {
  return call<Astraura158AuthOrchestrator>(target, "/api/notifications/auth_orchestrator_status");
}

export function setAstraura158AuthOrchestratorAuto(target: Astraura158Target, enabled: boolean) {
  return post<Astraura158Ack & { auto_mode?: boolean }>(target, "/api/notifications/auth_orchestrator_auto", { enabled });
}

/* ── Notificaciones y eventos ──────────────────────────────────────────────── */

export interface Astraura158Notification {
  id: string;
  title?: string;
  message?: string;
  category?: string;
  /** "info" | "suggestion" | "warning" | "success" (+ "error" en versiones nuevas). */
  severity?: string;
  timestamp?: number;
  read?: boolean;
  action_type?: string | null;
  branch_id?: string | null;
  status?: string;
}

export interface Astraura158BranchingLog { id?: string; timestamp?: number; title?: string; message?: string; agent?: string; [k: string]: unknown }

export function fetchAstraura158Notifications(target: Astraura158Target) {
  return call<{ unread_count?: number; notifications?: Astraura158Notification[]; branching_logs?: Astraura158BranchingLog[] }>(target, "/api/notifications", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

/** Sin id marca TODAS como leídas (campo real del backend: `notif_id`). */
export function markAstraura158NotificationsRead(target: Astraura158Target, notifId?: string) {
  return post<Astraura158Ack>(target, "/api/notifications/mark_read", { notif_id: notifId ?? null });
}

export function applyAstraura158Notification(target: Astraura158Target, notifId: string) {
  return post<Astraura158Ack>(target, "/api/notifications/apply", { notif_id: notifId }, longTimeout(target));
}

export function applyAstraura158NotificationList(target: Astraura158Target, notifIds: string[]) {
  return post<Astraura158Ack & { processed_count?: number; failed_count?: number; elapsed_seconds?: number }>(target, "/api/notifications/apply_all_from_list", { notif_ids: notifIds }, Math.max(longTimeout(target), 90_000));
}

export function deleteAstraura158Notification(target: Astraura158Target, notifId: string) {
  return post<Astraura158Ack>(target, "/api/notifications/delete", { notif_id: notifId });
}

export function clearAstraura158Notifications(target: Astraura158Target) {
  return post<Astraura158Ack>(target, "/api/notifications/clear", {}, longTimeout(target));
}

/** Evento del puente `/api/starseed/events` (backend nuevo; 404 en versiones anteriores). */
export interface Astraura158Event {
  id: string;
  ts?: number;
  timestamp?: number;
  level?: string;
  severity?: string;
  source?: string;
  process?: string;
  title?: string;
  message?: string;
  read?: boolean;
  acked?: boolean;
  data?: Record<string, unknown>;
}

export function fetchAstraura158Events(target: Astraura158Target, since?: number, limit = 50) {
  const qs = new URLSearchParams();
  if (since) qs.set("since", String(since));
  qs.set("limit", String(limit));
  return call<{ events?: Astraura158Event[]; unread_count?: number; total?: number; since?: number }>(target, `/api/starseed/events?${qs.toString()}`);
}

export function ackAstraura158Events(target: Astraura158Target, ids: string[]) {
  return post<Astraura158Ack & { acked?: number }>(target, "/api/starseed/events/ack", { ids });
}

/** (Adenda 175) Preferencia de motor de cognición del backend 1.58. */
export type Astraura158CognitionPreferenceValue = "auto" | "bitnet-158" | "multimodel";

export interface Astraura158CognitionPreference {
  preference: Astraura158CognitionPreferenceValue;
  /** Procedencia honesta del valor: variable de entorno · archivo persistido · por defecto. */
  source?: "env" | "stored" | "default";
  /** true = ASTRAURA_COGNITION_PREFERENCE manda y el cambio en caliente no aplica. */
  env_override?: boolean;
  options?: string[];
  applied?: boolean;
  reason?: string;
}

export function fetchAstraura158CognitionPreference(target: Astraura158Target) {
  return call<Astraura158CognitionPreference & { success?: boolean }>(target, "/api/starseed/cognition/preference");
}

export function setAstraura158CognitionPreference(target: Astraura158Target, preference: Astraura158CognitionPreferenceValue) {
  return post<Astraura158CognitionPreference & { success?: boolean }>(target, "/api/starseed/cognition/preference", { preference });
}

/** Resumen de procesos del puente (`/api/starseed/processes`): forma tolerante (lista u objeto por id). */
export interface Astraura158ProcessSummary {
  id: string;
  name?: string;
  status?: string;
  running?: boolean;
  enabled?: boolean;
  detail?: string;
  counters?: Record<string, number>;
  [k: string]: unknown;
}

export async function fetchAstraura158Processes(target: Astraura158Target): Promise<Astraura158Response<Astraura158ProcessSummary[]>> {
  const r = await call<{ processes?: Astraura158ProcessSummary[] | Record<string, Omit<Astraura158ProcessSummary, "id"> & { id?: string }> } | Astraura158ProcessSummary[]>(target, "/api/starseed/processes");
  if (!r.ok) return r;
  const raw = Array.isArray(r.data) ? r.data : r.data?.processes;
  let list: Astraura158ProcessSummary[] = [];
  if (Array.isArray(raw)) list = raw.filter((p) => p && typeof p === "object" && typeof p.id === "string");
  else if (raw && typeof raw === "object") list = Object.entries(raw).map(([id, v]) => ({ ...(v as object), id: (v as { id?: string }).id ?? id }));
  else if (r.data && typeof r.data === "object" && !Array.isArray(r.data)) {
    // Backend 1.1.0 inicial: secciones planas {imagination, swarm, director, …} sin lista
    // normalizada. Se adapta aquí (id = clave; estado heurístico) para no perder el resumen.
    const skip = new Set(["bridge", "server_ts", "processes"]);
    list = Object.entries(r.data as Record<string, unknown>)
      .filter(([k, v]) => !skip.has(k) && v && typeof v === "object" && !Array.isArray(v))
      .map(([id, v]) => {
        const o = v as Record<string, unknown>;
        const running = Boolean(o.is_always_on ?? o.auto_mode ?? o.running ?? (o.real_mode && o.real_mode !== "templates"));
        return { id, status: String(o.status ?? o.real_mode ?? (running ? "active" : "idle")), running } as Astraura158ProcessSummary;
      });
  }
  return { ok: true, data: list, target: r.target, endpoint: r.endpoint };
}

export function triggerAstraura158ProcessImagination(target: Astraura158Target, opts?: { theme?: string; process_type?: string }) {
  return post<Astraura158Ack>(target, "/api/starseed/processes/imagination/trigger", { theme: opts?.theme || null, process_type: opts?.process_type || null }, longTimeout(target));
}

/** Contadores para los badges de las pestañas (puente nuevo → fallback a 3 lecturas clásicas). */
export interface Astraura158Counters { unread: number; pending: number; running: number }

export async function fetchAstraura158Counters(target: Astraura158Target): Promise<Astraura158Counters | null> {
  const [n, i, s] = await Promise.all([fetchAstraura158Notifications(target), fetchAstraura158ImaginationStatus(target), fetchAstraura158Swarm(target)]);
  if (!n.ok && !i.ok && !s.ok) return null;
  return {
    unread: n.ok ? Number(n.data.unread_count ?? (n.data.notifications ?? []).filter((x) => !x.read).length) : 0,
    pending: i.ok ? Number(i.data.pending_approval_count ?? 0) : 0,
    running: s.ok ? (s.data.active_tasks ?? []).filter((t) => t.status === "running").length : 0,
  };
}

/* ── Sentidos (sensorium) y privacidad ─────────────────────────────────────── */

export interface Astraura158Location { latitude?: number; longitude?: number; city?: string; region?: string; country?: string; timezone?: string; altitude_m?: number; source?: string }

export interface Astraura158Weather {
  temperature_c?: number; feels_like_c?: number; humidity_percent?: number; pressure_hpa?: number; wind_speed_kmh?: number; wind_direction?: string;
  condition?: string; uv_index?: number; air_quality_index?: string; sources_used?: string[]; last_updated?: number;
}

export interface Astraura158Sensorium {
  timestamp?: string;
  time_formatted?: string;
  location?: Astraura158Location;
  weather?: Astraura158Weather;
  hardware?: {
    chipset?: string; cpu_cores?: number; cpu_percent?: number; cpu_freq_mhz?: number;
    ram_total_gb?: number; ram_used_gb?: number; ram_available_gb?: number; ram_percent?: number;
    disk_total_gb?: number; disk_free_gb?: number; disk_percent?: number;
    battery?: { percent?: number; is_charging?: boolean; seconds_left?: number };
    network?: { bytes_sent_mb?: number; bytes_recv_mb?: number; status?: string };
  };
  client_sensors?: Record<string, unknown>;
  behavioral_directive?: { mode?: string; directive?: string };
}

export function fetchAstraura158Sensorium(target: Astraura158Target) {
  return call<Astraura158Sensorium>(target, "/api/sensorium/live", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

export function setAstraura158Location(target: Astraura158Target, location: Astraura158Location) {
  return post<Astraura158Ack & { location?: Astraura158Location }>(target, "/api/sensorium/location", { location });
}

/** Campos reales del backend: `latitude` / `longitude` (no lat/lon). */
export function fetchAstraura158Weather(target: Astraura158Target, latitude?: number, longitude?: number) {
  const body: Record<string, number> = {};
  if (typeof latitude === "number") body.latitude = latitude;
  if (typeof longitude === "number") body.longitude = longitude;
  return post<Astraura158Ack & { weather?: Astraura158Weather }>(target, "/api/sensorium/weather/fetch", body, longTimeout(target));
}

export interface Astraura158PrivacySettings {
  strict_air_gap_mode?: boolean;
  allow_gps_location?: boolean;
  location_precision?: string;
  allow_weather_sync?: boolean;
  allow_microphone_stream?: boolean;
  allow_camera_access?: boolean;
  allow_compass_orientation?: boolean;
  allow_gyroscope_motion?: boolean;
  allow_hardware_telemetry?: boolean;
  allow_external_web_search?: boolean;
  allow_cloud_sync?: boolean;
  allow_sensory_imagination?: boolean;
  allow_persistent_logging?: boolean;
  data_retention_days?: number;
  anonymize_network_ips?: boolean;
  [k: string]: unknown;
}

export interface Astraura158PrivacyReport {
  settings?: Astraura158PrivacySettings;
  air_gap_active?: boolean;
  audit_log?: { id?: string; timestamp?: number; event?: string; sensor_type?: string; action?: string; details?: string }[];
  protected_sensors_count?: number;
  sovereign_guarantee?: string;
}

export function fetchAstraura158Privacy(target: Astraura158Target) {
  return call<Astraura158PrivacyReport>(target, "/api/privacy/settings");
}

export function updateAstraura158Privacy(target: Astraura158Target, settings: Astraura158PrivacySettings) {
  return post<Astraura158Ack & { settings?: Astraura158PrivacySettings }>(target, "/api/privacy/settings", { settings });
}

/** Campo real: `enabled` (opcional; sin él el backend alterna). */
export function toggleAstraura158AirGap(target: Astraura158Target, enabled: boolean) {
  return post<Astraura158Ack & { air_gap_mode?: boolean }>(target, "/api/privacy/toggle_air_gap", { enabled });
}

/* ── Almacenamiento y enrutamiento ─────────────────────────────────────────── */

export interface Astraura158StorageDevice {
  device?: string; mountpoint?: string; fstype?: string; opts?: string;
  total_gb?: number; free_gb?: number; percent_used?: number; is_external?: boolean; is_connected?: boolean;
}

export interface Astraura158StorageRule {
  id?: string;
  name?: string;
  media_type?: string;
  target_path?: string;
  is_enabled?: boolean;
  auto_memory_routing?: { enabled?: boolean; target_brains?: string[]; memory_category?: string; index_files?: boolean; file_extensions?: string[] };
  trigger_imagination?: { enabled?: boolean; process_types?: string[]; burst_cycles?: number };
  capacity_limits_override?: { enabled?: boolean; imagination_max_percent?: number; swarm_max_percent?: number; capacity_mode?: string };
  last_detected_at?: number;
  last_detected_formatted?: string;
  status?: string;
  updated_at?: number;
  [k: string]: unknown;
}

export function fetchAstraura158StorageDevices(target: Astraura158Target) {
  return call<{ timestamp?: number; devices_count?: number; devices?: Astraura158StorageDevice[] }>(target, "/api/storage/devices", { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export function fetchAstraura158StorageRules(target: Astraura158Target) {
  return call<{ rules?: Astraura158StorageRule[] }>(target, "/api/storage/rules");
}

export function saveAstraura158StorageRule(target: Astraura158Target, rule: Astraura158StorageRule) {
  return post<Astraura158Ack & { rule?: Astraura158StorageRule }>(target, "/api/storage/rules", { rule });
}

export async function deleteAstraura158StorageRule(target: Astraura158Target, ruleId: string) {
  return unwrap(await call<Astraura158Ack & { deleted_rule_id?: string }>(target, `/api/storage/rules/${encodeURIComponent(ruleId)}`, { method: "DELETE" }));
}

export function scanAstraura158StorageNow(target: Astraura158Target) {
  return post<Astraura158Ack & { events_triggered?: unknown[]; rules?: Astraura158StorageRule[] }>(target, "/api/storage/scan_now", {}, longTimeout(target));
}

export interface Astraura158RoutingStorage {
  agent_id?: string; agent_name?: string; enabled?: boolean; is_busy?: boolean; sync_runs?: number;
  config?: Record<string, unknown>; detected_devices?: unknown[]; brains_count?: number; last_sync?: Record<string, unknown> | null; capabilities?: string[];
}

export function fetchAstraura158RoutingStorage(target: Astraura158Target) {
  return call<Astraura158RoutingStorage>(target, "/api/routing_storage/status", { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export function fetchAstraura158SyncTelemetry(target: Astraura158Target) {
  return call<{ success?: boolean; mesh?: { active_synced_clients?: number; status?: string; last_event?: Record<string, unknown> | null } }>(target, "/api/system/sync/telemetry");
}

/* ── Proyectos · creaciones · workflows ────────────────────────────────────── */

export interface Astraura158Project {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  priority?: string;
  progress?: number;
  current_version?: string;
  linked_agents?: string[];
  linked_creations?: string[];
  linked_personalities?: string[];
  linked_cerebros?: string[];
  linked_projects?: string[];
  version_history?: { version?: string; timestamp?: number; summary?: string; author?: string }[];
  [k: string]: unknown;
}

export function fetchAstraura158Projects(target: Astraura158Target) {
  return call<{ projects?: Astraura158Project[]; total?: number }>(target, "/api/projects", { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export function fetchAstraura158Project(target: Astraura158Target, projectId: string) {
  return call<{ success?: boolean; project?: Astraura158Project; error?: string }>(target, `/api/projects/${encodeURIComponent(projectId)}`);
}

export function fetchAstraura158ProjectAgentStatus(target: Astraura158Target) {
  return call<Record<string, unknown>>(target, "/api/projects/agent/status");
}

export interface Astraura158CreationItem {
  id: string;
  title?: string;
  category?: string;
  brain_id?: string;
  brain_name?: string;
  agent_id?: string;
  agent_name?: string;
  agent_origin_media?: string;
  process_id?: string;
  process_name?: string;
  format_type?: string;
  current_version?: string;
  summary?: string;
  linked_projects?: string[];
  timeline_branches?: unknown[];
  [k: string]: unknown;
}

export function fetchAstraura158Creations(target: Astraura158Target) {
  return call<{ success?: boolean; creations?: Astraura158CreationItem[]; storage_telemetry?: Record<string, unknown>; recycling_history?: unknown[] }>(target, "/api/creations", { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export function fetchAstraura158Creation(target: Astraura158Target, creationId: string) {
  return call<{ success?: boolean; creation?: Astraura158CreationItem; error?: string }>(target, `/api/creations/${encodeURIComponent(creationId)}`);
}

export interface Astraura158Workflow {
  id: string;
  name?: string;
  description?: string;
  trigger_type?: string;
  trigger?: string;
  cron_expression?: string;
  /** "enabled" | "disabled". */
  status?: string;
  auto_learn?: boolean;
  last_run?: string;
  executions_count?: number;
  steps?: { step?: number; action?: string; desc?: string }[];
}

export function fetchAstraura158Workflows(target: Astraura158Target) {
  return call<{ workflows?: Astraura158Workflow[]; logs?: unknown[] }>(target, "/api/workflows");
}

export function toggleAstraura158Workflow(target: Astraura158Target, workflowId: string, enabled: boolean) {
  return post<Astraura158Ack>(target, "/api/workflows/toggle", { workflow_id: workflowId, enabled });
}

export function runAstraura158Workflow(target: Astraura158Target, workflowId: string) {
  return post<Astraura158Ack & { steps_executed?: number; results?: string[]; step_results?: string[] }>(target, "/api/workflows/run", { workflow_id: workflowId }, Math.max(longTimeout(target), 90_000));
}

/* ── Voz (daemon continuo + Voice Studio) ──────────────────────────────────── */

export interface Astraura158VoicePersonaState {
  voice_autonomous_enabled?: boolean;
  multiagent_enabled?: boolean;
  presence_state?: string;
  sensitivity?: number;
  current_affect?: string;
  character_evolution_score?: number;
  last_active_timestamp?: number;
  cognitive_organ?: string;
}

export interface Astraura158VoiceDaemon {
  success?: boolean;
  master_switches?: {
    master_voice_enabled?: boolean;
    master_ambient_listening_enabled?: boolean;
    master_affective_learning_enabled?: boolean;
    master_device_sensory_link?: boolean;
  };
  personality_states?: Record<string, Astraura158VoicePersonaState>;
  sensory_telemetry?: Record<string, unknown>;
  active_listening_personalities_count?: number;
  recent_perceptions?: unknown[];
  system_time?: string;
}

export type Astraura158VoiceMasterKey = "master_voice_enabled" | "master_ambient_listening_enabled" | "master_affective_learning_enabled" | "master_device_sensory_link";

export function fetchAstraura158VoiceDaemon(target: Astraura158Target) {
  return call<Astraura158VoiceDaemon>(target, "/api/voice/daemon/status");
}

export function toggleAstraura158VoiceMaster(target: Astraura158Target, switchKey: Astraura158VoiceMasterKey, enabled: boolean) {
  return post<Astraura158Ack & { status?: Astraura158VoiceDaemon }>(target, "/api/voice/daemon/toggle_master", { switch_key: switchKey, enabled });
}

export function toggleAstraura158VoicePersonality(target: Astraura158Target, personaId: string, opts: { voice_enabled?: boolean; multiagent_enabled?: boolean }) {
  return post<Astraura158Ack>(target, "/api/voice/daemon/toggle_personality", {
    persona_id: personaId,
    voice_enabled: opts.voice_enabled ?? null,
    multiagent_enabled: opts.multiagent_enabled ?? null,
  });
}

export interface Astraura158VoiceProfile {
  id: string;
  name?: string;
  persona_id?: string;
  gender?: string;
  age_group?: string;
  accent?: string;
  language?: string;
  pitch_base_hz?: number;
  warmth?: number;
  clarity?: number;
  breathiness?: number;
  emotion?: string;
  formants?: Record<string, number>;
  dsp?: Record<string, number>;
  is_factory?: boolean;
  created_at?: number;
}

export function fetchAstraura158VoiceProfiles(target: Astraura158Target) {
  return call<{ profiles?: Astraura158VoiceProfile[]; total?: number }>(target, "/api/voice_studio/profiles");
}

export function fetchAstraura158VoiceMatrix(target: Astraura158Target) {
  return call<{ holographic_matrix?: Record<string, Record<string, unknown>>; [k: string]: unknown }>(target, "/api/voice/matrix");
}

/* ── Memoria (recuerdos · grafo · manifiesto · mem0) ───────────────────────── */

export interface Astraura158Recuerdos {
  user_preferences?: {
    preferred_name?: string; legal_name?: string; nickname?: string; role_title?: string; communication_tone?: string;
    language?: string; hardware_device?: string; host_identity?: string; [k: string]: unknown;
  };
  software_capabilities_context?: Record<string, unknown>;
  personalities_catalogue?: Record<string, string>;
  pinned_core_memories?: { id?: string; title?: string; content?: string; priority?: string; created_at?: string }[];
  context_personality_rules?: Record<string, unknown>[];
  connected_accounts_prefs?: Record<string, unknown>[];
  [k: string]: unknown;
}

export function fetchAstraura158Recuerdos(target: Astraura158Target) {
  return call<Astraura158Recuerdos>(target, "/api/memory/recuerdos");
}

/** Solo las claves del modelo `SaveRecuerdosRequest` (se fusionan en el backend). */
export function saveAstraura158Recuerdos(target: Astraura158Target, patch: Pick<Astraura158Recuerdos, "user_preferences" | "context_personality_rules" | "connected_accounts_prefs" | "pinned_core_memories">) {
  return post<Astraura158Ack & { recuerdos?: Astraura158Recuerdos }>(target, "/api/memory/recuerdos", patch);
}

export interface Astraura158MemoryGraph {
  nodes?: unknown[];
  edges?: unknown[];
  links?: unknown[];
  stats?: Record<string, number>;
  [k: string]: unknown;
}

export function fetchAstraura158MemoryGraph(target: Astraura158Target) {
  return call<Astraura158MemoryGraph>(target, "/api/memory/graph", { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export function fetchAstraura158StarseedManifest(target: Astraura158Target) {
  return call<{ branches?: Record<string, unknown> | unknown[]; [k: string]: unknown }>(target, "/api/memory/starseed/manifest");
}

export function addAstraura158Memory(target: Astraura158Target, memory: string, category = "general") {
  return post<Astraura158Ack & { memory?: Astraura158Memory }>(target, "/api/memory/mem0/add", { memory, category });
}

/* ── Sueños (estado; la operación vive en Imaginación) ─────────────────────── */

export function fetchAstraura158DreamStatus(target: Astraura158Target) {
  return call<{ is_dreaming?: boolean; is_always_on?: boolean; operation_mode?: string; next_cycle_seconds_left?: number; cycles_completed?: number; [k: string]: unknown }>(target, "/api/dream/status");
}


/* ════════════════════════════════════════════════════════════════════════════
 * OLA 4 (Adenda 156) — Telemetría 1.58-bit, Navegador autónomo y Explorador
 * del dispositivo (arquitectura: astraura-158-ola4-runtime-y-pestanas.md §3).
 * Mismas reglas del archivo: nunca lanza; `{ok:false,error}` explicito;
 * formas NO verificadas contra `backend/app/main.py` (backend fuera de este
 * repo) se leen de forma TOLERANTE (`[k:string]:unknown` + helpers
 * defensivos en cada pestaña) — honestidad ante todo: si el dato no llega,
 * la pestaña lo dice, nunca lo inventa.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ── Telemetría 1.58-bit (motor nativo · sentidos del sistema) ─────────────── */

/** Un perfil del servidor nativo `llama-server` (bitnet.cpp) embebido en el backend: interactivo o de fondo. */
export interface Astraura158BitnetServerProfile {
  running?: boolean;
  ready?: boolean;
  port?: number;
  model?: string;
  pid?: number;
  [k: string]: unknown;
}

/**
 * `/api/bitnet/status`: estado dedicado del motor nativo BitNet b1.58 (ademas
 * de lo que ya trae `/api/status.engine`). Forma NO verificada contra
 * `backend/app/main.py` (backend fuera de este repo): lectura tolerante.
 */
export interface Astraura158BitnetStatus {
  installed?: boolean;
  cpp_installed?: boolean;
  native_available?: boolean;
  active_model?: string;
  quantization?: string;
  models_on_disk?: unknown[];
  server?: { interactive?: Astraura158BitnetServerProfile; background?: Astraura158BitnetServerProfile; [k: string]: unknown };
  interactive?: Astraura158BitnetServerProfile;
  background?: Astraura158BitnetServerProfile;
  process_memory_mb?: number;
  [k: string]: unknown;
}

export function fetchAstraura158BitnetStatus(target: Astraura158Target) {
  return call<Astraura158BitnetStatus>(target, "/api/bitnet/status", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

/**
 * `/api/system/senses`: telemetría de sensores del sistema (distinta de
 * `/api/sensorium/live`, que es tiempo/lugar/clima). Forma NO verificada:
 * lectura tolerante.
 */
export interface Astraura158SystemSenses {
  active_sensors?: number;
  sensors_count?: number;
  sensors?: { id?: string; name?: string; type?: string; active?: boolean; status?: string; [k: string]: unknown }[];
  summary?: string;
  [k: string]: unknown;
}

export function fetchAstraura158SystemSenses(target: Astraura158Target) {
  return call<Astraura158SystemSenses>(target, "/api/system/senses", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

/* ── Navegador autónomo ──────────────────────────────────────────────────── */

/** Resultado de navegar a una URL. Se pinta SIEMPRE como texto/extracto — nunca `dangerouslySetInnerHTML`. */
export interface Astraura158BrowserPage {
  success?: boolean;
  url?: string;
  final_url?: string;
  title?: string;
  excerpt?: string;
  text?: string;
  status_code?: number;
  fetched_at?: number;
  error?: string;
  message?: string;
  [k: string]: unknown;
}

export function navigateAstraura158Browser(target: Astraura158Target, url: string) {
  return post<Astraura158BrowserPage>(target, "/api/browser/navigate", { url }, longTimeout(target));
}

export interface Astraura158BrowserSearchItem { title?: string; url?: string; link?: string; excerpt?: string; snippet?: string; [k: string]: unknown }

export interface Astraura158BrowserSearch {
  success?: boolean;
  query?: string;
  results?: Astraura158BrowserSearchItem[];
  error?: string;
  message?: string;
  [k: string]: unknown;
}

export function searchAstraura158Browser(target: Astraura158Target, query: string, limit = 8) {
  return post<Astraura158BrowserSearch>(target, "/api/browser/search", { query, limit }, longTimeout(target));
}

/** Catálogo de acciones: lo ofrece el OS (no hay endpoint de catálogo en el backend); si el backend no soporta la acción, responde `success:false` y se ve como fallo honesto. */
export function runAstraura158BrowserAction(target: Astraura158Target, action: string, params?: Record<string, unknown>) {
  return post<Astraura158Ack & { result?: unknown }>(target, "/api/browser/action", { action, params: params ?? {} }, longTimeout(target));
}

export function indexAstraura158BrowserMemory(target: Astraura158Target, payload: { url?: string; title?: string; content?: string; category?: string }) {
  return post<Astraura158Ack>(target, "/api/browser/index_memory", payload, longTimeout(target));
}

/* ── Explorador del dispositivo (sistema de archivos del BACKEND) ──────────── */
/* Lee la MÁQUINA donde corre el backend soberano (la neurona) — NUNCA la del
 * navegador. Solo lectura: el proxy del OS no expone escritura ni ejecución. */

export interface Astraura158FsEntry {
  name?: string;
  path?: string;
  is_dir?: boolean;
  type?: string;
  size_bytes?: number;
  modified_at?: number;
  [k: string]: unknown;
}

export interface Astraura158FsListing {
  path?: string;
  parent?: string;
  entries?: Astraura158FsEntry[];
  items?: Astraura158FsEntry[];
  error?: string;
  [k: string]: unknown;
}

export function fetchAstraura158Fs(target: Astraura158Target, path?: string) {
  const qs = new URLSearchParams();
  if (path) qs.set("path", path);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return call<Astraura158FsListing>(target, `/api/system/fs${suffix}`, { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export interface Astraura158FileContent {
  path?: string;
  content?: string;
  text?: string;
  size_bytes?: number;
  truncated?: boolean;
  is_binary?: boolean;
  encoding?: string;
  error?: string;
  [k: string]: unknown;
}

/** Vista previa de texto acotada (~40 KB de tope pedido al backend); el componente además recorta en cliente por si el backend no respeta `max_bytes`. */
export function fetchAstraura158File(target: Astraura158Target, path: string, maxBytes = 40_000) {
  const qs = new URLSearchParams({ path, max_bytes: String(maxBytes) });
  return call<Astraura158FileContent>(target, `/api/system/file?${qs.toString()}`, { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export interface Astraura158ItemDetails {
  path?: string;
  name?: string;
  size_bytes?: number;
  is_dir?: boolean;
  created_at?: number;
  modified_at?: number;
  mime_type?: string;
  error?: string;
  [k: string]: unknown;
}

export function fetchAstraura158ItemDetails(target: Astraura158Target, path: string) {
  const qs = new URLSearchParams({ path });
  return call<Astraura158ItemDetails>(target, `/api/system/item_details?${qs.toString()}`, { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export interface Astraura158FsSearch {
  query?: string;
  path?: string;
  results?: Astraura158FsEntry[];
  matches?: Astraura158FsEntry[];
  error?: string;
  [k: string]: unknown;
}

export function searchAstraura158Fs(target: Astraura158Target, query: string, path?: string) {
  const qs = new URLSearchParams({ query });
  if (path) qs.set("path", path);
  return call<Astraura158FsSearch>(target, `/api/system/search?${qs.toString()}`, { timeoutMs: target === "nube" ? 20_000 : 10_000 });
}

export interface Astraura158Drive {
  name?: string;
  mountpoint?: string;
  device?: string;
  fstype?: string;
  total_gb?: number;
  free_gb?: number;
  percent_used?: number;
  is_removable?: boolean;
  [k: string]: unknown;
}

export function fetchAstraura158Drives(target: Astraura158Target) {
  return call<{ drives?: Astraura158Drive[] }>(target, "/api/system/storage/drives", { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

export interface Astraura158UniversalDeviceAccess {
  granted?: boolean;
  enabled?: boolean;
  scope?: string;
  granted_at?: number;
  granted_paths?: string[];
  message?: string;
  [k: string]: unknown;
}

export function fetchAstraura158UniversalDeviceAccess(target: Astraura158Target) {
  return call<Astraura158UniversalDeviceAccess>(target, "/api/system/universal_device_access", { timeoutMs: target === "nube" ? 15_000 : 6_000 });
}

/** Concesión EXPLÍCITA (botón dedicado en el Explorador del Dispositivo); el backend decide el alcance real. */
export function grantAstraura158UniversalDeviceAccess(target: Astraura158Target, opts?: { scope?: string }) {
  return post<Astraura158Ack & { granted?: boolean }>(target, "/api/system/universal_device_access/grant", { confirm: true, ...(opts ?? {}) }, longTimeout(target));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ORQUESTACIÓN AUTÓNOMA · VENTANAS POR ENTIDAD · PERMISOS Y ACCESOS (Ola 5 · Adenda 157)
 * Lo que faltaba del sistema original: abrir la «página completa» de cualquier
 * entidad viva (proceso · agente · personalidad · cerebro · proyecto), gobernar
 * el enjambre agente a agente y aprobar permisos y accesos desde el OS.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Detalle de UN agente de la bóveda (`/api/agents/{id}`). */
export interface Astraura158AgentDetail extends Astraura158Agent {
  description?: string;
  imagination_enabled?: boolean;
  imagination_frequency?: string;
  imagination_permission_level?: string;
  cpu_quota_percent?: number;
  ram_limit_mb?: number;
  concurrency?: number;
  compute_trunk?: string;
  linked_cerebros?: { id: string; name?: string; color?: string }[];
  skills?: string[];
  history?: unknown[];
  permissions?: Record<string, unknown>;
  [k: string]: unknown;
}

export function fetchAstraura158Agent(target: Astraura158Target, agentId: string) {
  return call<{ success?: boolean; agent?: Astraura158AgentDetail; error?: string }>(target, `/api/agents/${encodeURIComponent(agentId)}`);
}

export function fetchAstraura158EcosystemAgent(target: Astraura158Target, agentId: string) {
  return call<{ success?: boolean; agent?: Astraura158EcosystemAgent; error?: string }>(target, `/api/ecosystem/agents/${encodeURIComponent(agentId)}`);
}

/** Concurrencia (hilos simultáneos) de un agente del enjambre. */
export function setAstraura158AgentConcurrency(target: Astraura158Target, agentId: string, concurrency: number) {
  return post<Astraura158Ack>(target, "/api/swarm/agent/concurrency", { agent_id: agentId, concurrency: Math.max(1, Math.min(16, Math.round(concurrency))) });
}

/** Permisos granulares de un agente (`/api/agents_api/{id}/update_permissions`). */
export function updateAstraura158AgentPermissions(target: Astraura158Target, agentId: string, permissions: Record<string, boolean | string | number>) {
  return post<Astraura158Ack & { permissions?: Record<string, unknown> }>(target, `/api/agents_api/${encodeURIComponent(agentId)}/update_permissions`, { permissions });
}

/** Permisos granulares de una personalidad (`/api/personalities/{id}/update_permissions`). */
export function updateAstraura158PersonalityPermissions(target: Astraura158Target, personaId: string, permissions: Record<string, boolean | string | number>) {
  return post<Astraura158Ack & { permissions?: Record<string, unknown> }>(target, `/api/personalities/${encodeURIComponent(personaId)}/update_permissions`, { permissions });
}

/** Estado de la API de una personalidad (scopes, sincronizaciones, clave enmascarada). */
export function fetchAstraura158PersonalityApiStatus(target: Astraura158Target, personaId: string) {
  return call<{ success?: boolean; detail?: Record<string, unknown>; error?: string }>(target, `/api/personalities/${encodeURIComponent(personaId)}/api_status`);
}

/** Estado de la API de un agente (mismo contrato que el de personalidades). */
export function fetchAstraura158AgentApiStatus(target: Astraura158Target, agentId: string) {
  return call<{ success?: boolean; detail?: Record<string, unknown>; error?: string }>(target, `/api/agents_api/${encodeURIComponent(agentId)}/api_status`);
}

/** Árbol sináptico de un cerebro: nodos (memorias/creaciones/agentes) y sus enlaces. */
export interface Astraura158SynapticTree {
  success?: boolean;
  brain?: { id?: string; name?: string; color?: string };
  nodes?: { id?: string; label?: string; kind?: string; weight?: number; color?: string; [k: string]: unknown }[];
  edges?: { source?: string; target?: string; weight?: number; kind?: string; [k: string]: unknown }[];
  links?: { source?: string; target?: string; [k: string]: unknown }[];
  stats?: Record<string, number>;
  [k: string]: unknown;
}

export function fetchAstraura158SynapticTree(target: Astraura158Target, brainId: string) {
  return call<Astraura158SynapticTree>(target, `/api/cerebros/${encodeURIComponent(brainId)}/synaptic_tree`, { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

/** Métricas de contexto de los cerebros (cuánto ocupa cada rama en el contexto). */
export function fetchAstraura158BrainContextMetrics(target: Astraura158Target) {
  return call<{ metrics?: Record<string, unknown>; cerebros?: unknown[]; [k: string]: unknown }>(target, "/api/cerebros/context_metrics");
}

/** Control de los procesos de un cerebro (pausar/reanudar/prioridad). */
export function controlAstraura158BrainProcess(target: Astraura158Target, body: { brain_id: string; action: string; process_id?: string; value?: number }) {
  return post<Astraura158Ack>(target, "/api/cerebros/process/control", body, longTimeout(target));
}

/** Permisos de una neurona sobre un cerebro (lectura/escritura/sincronización). */
export function updateAstraura158BrainNeuronPermissions(target: Astraura158Target, body: { brain_id: string; neuron_id?: string; permissions: Record<string, boolean | string> }) {
  return post<Astraura158Ack>(target, "/api/cerebros/neuron/permissions", body);
}

/** Auto-enlace sináptico: el sistema conecta memorias/creaciones afines por su cuenta. */
export function autoLinkAstraura158Synapses(target: Astraura158Target, brainId?: string) {
  return post<Astraura158Ack & { linked?: number }>(target, "/api/cerebros/auto_link_synapses", { brain_id: brainId ?? null }, longTimeout(target));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * OLA 6 · Adenda 158 — paridad total con el programa original 1.58-bit.
 * Todo lo que el original llamaba y el OS todavía no envolvía: ramas vivas de
 * un proceso imaginativo, bóveda de credenciales, CRUD de workflows y
 * proyectos, documentos/OpenViking de memoria, fusión de cerebros externos,
 * permisos nativos del navegador (aquí solo la parte de backend), instalador
 * y auto-modificación del sistema.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Ramas de un proceso imaginativo (control fino) ────────────────────────── */

/** Avanza un paso de ejecución de una rama en caliente (el «Paso en Vivo» del original). */
export function stepAstraura158Process(target: Astraura158Target, processId: string, branchId?: string) {
  return post<Astraura158Ack & { branch?: Astraura158Branch }>(target, `/api/imagination/process/${encodeURIComponent(processId)}/step`, { branch_id: branchId ?? null }, longTimeout(target));
}

/** Vuelve a generar el contenido de una rama con el motor real. */
export function regenerateAstraura158Branch(target: Astraura158Target, branchId: string) {
  return post<Astraura158Ack & { branch?: Astraura158Branch }>(target, `/api/imagination/branch/${encodeURIComponent(branchId)}/regenerate`, {}, longTimeout(target));
}

/** Bifurca una rama en una sub-rama con una nota de enfoque. */
export function forkAstraura158Branch(target: Astraura158Target, branchId: string, forkNote: string) {
  return post<Astraura158Ack & { branch?: Astraura158Branch }>(target, `/api/imagination/branch/${encodeURIComponent(branchId)}/fork`, { fork_note: forkNote }, longTimeout(target));
}

/** Edita hipótesis/insights de una rama existente. */
export function modifyAstraura158Branch(target: Astraura158Target, branchId: string, data: { hypothesis?: string; insights?: string; theme?: string }) {
  return post<Astraura158Ack>(target, `/api/imagination/branch/${encodeURIComponent(branchId)}/modify`, { data });
}

/** Elimina una rama. */
export async function deleteAstraura158Branch(target: Astraura158Target, branchId: string) {
  return unwrap(await call<Astraura158Ack>(target, `/api/imagination/branch/${encodeURIComponent(branchId)}`, { method: "DELETE" }));
}

/** Borra el historial de informes de síntesis. */
export async function clearAstraura158SynthesisReports(target: Astraura158Target) {
  return unwrap(await call<Astraura158Ack>(target, "/api/imagination/synthesis_reports/clear", { method: "DELETE" }));
}

export interface Astraura158SyncExecution {
  is_running?: boolean;
  progress_percent?: number;
  completed_tasks?: number;
  total_tasks?: number;
  current_logs?: string[];
  agent_progress?: Record<string, { tasks?: number; status?: string }>;
  [k: string]: unknown;
}

/** Estado del aplicado sincronizado multi-agente (modal de progreso del original). */
export function fetchAstraura158SyncExecution(target: Astraura158Target) {
  return call<Astraura158SyncExecution>(target, "/api/imagination/sync_execution_state");
}

/* ── Bóveda soberana (credenciales de servicios + parámetros de inferencia) ── */

export interface Astraura158VaultConnection {
  id?: string;
  service?: string;
  name?: string;
  status?: string;
  connected?: boolean;
  has_token?: boolean;
  masked_token?: string;
  scopes?: string[];
  updated_at?: string;
  [k: string]: unknown;
}

export interface Astraura158VaultParameters {
  bitnet_threads?: number;
  bitnet_context_size?: number;
  memory_cache_mb?: number;
  dream_interval_minutes?: number;
  [k: string]: unknown;
}

export interface Astraura158Vault {
  connections?: Astraura158VaultConnection[];
  parameters?: Astraura158VaultParameters;
  [k: string]: unknown;
}

export function fetchAstraura158Vault(target: Astraura158Target) {
  return call<Astraura158Vault>(target, "/api/vault");
}

/**
 * Guarda el token de un servicio (Vercel, GitHub, Supabase, Hugging Face…).
 * El backend identifica la conexión por `conn_id` — que es la CLAVE del objeto
 * `connections` de la bóveda, no el nombre visible del servicio.
 */
export function updateAstraura158VaultConnection(target: Astraura158Target, connId: string, token: string, opts?: { account?: string; status?: string }) {
  return post<Astraura158Ack>(target, "/api/vault/connection/update", {
    conn_id: connId, token, account: opts?.account ?? null, status: opts?.status ?? null,
  });
}

/** Ajusta los parámetros de inferencia del motor soberano. */
export function updateAstraura158VaultParameters(target: Astraura158Target, parameters: Astraura158VaultParameters) {
  return post<Astraura158Ack>(target, "/api/vault/parameters/update", { parameters });
}

/* ── Workflows: crear, editar y eliminar ──────────────────────────────────── */

export function saveAstraura158Workflow(target: Astraura158Target, workflow: Astraura158Workflow) {
  return post<Astraura158Ack & { workflow?: Astraura158Workflow }>(target, "/api/workflows/save", { workflow });
}

export async function deleteAstraura158Workflow(target: Astraura158Target, workflowId: string) {
  return unwrap(await call<Astraura158Ack>(target, `/api/workflows/${encodeURIComponent(workflowId)}`, { method: "DELETE" }));
}

/* ── Proyectos y creaciones: ciclo completo ───────────────────────────────── */

export function createAstraura158Project(target: Astraura158Target, project: { name: string; description: string; type?: string; status?: string; priority?: string }) {
  return post<Astraura158Ack & { project?: Astraura158Project }>(target, "/api/projects/create", { type: "personal", ...project });
}

export function deleteAstraura158Project(target: Astraura158Target, projectId: string) {
  return post<Astraura158Ack>(target, "/api/projects/delete", { project_id: projectId });
}

export function addAstraura158ProjectVersion(target: Astraura158Target, projectId: string, version: { summary: string; version?: string; changes?: string[]; author?: string }) {
  return post<Astraura158Ack>(target, "/api/projects/add_version", { project_id: projectId, ...version });
}

export function createAstraura158ProjectBranch(target: Astraura158Target, projectId: string, branchName: string, notes?: string, originBranch = "main") {
  return post<Astraura158Ack>(target, "/api/projects/branch/create", { project_id: projectId, branch_name: branchName, origin_branch: originBranch, notes: notes ?? "" });
}

export function mergeAstraura158ProjectBranch(target: Astraura158Target, projectId: string, sourceBranch: string, targetBranch = "main") {
  return post<Astraura158Ack>(target, "/api/projects/branch/merge", { project_id: projectId, source_branch: sourceBranch, target_branch: targetBranch }, longTimeout(target));
}

export function deleteAstraura158ProjectFile(target: Astraura158Target, projectId: string, filePath: string) {
  return post<Astraura158Ack>(target, "/api/projects/file/delete", { project_id: projectId, file_path: filePath });
}

export function forkAstraura158CreationVersion(target: Astraura158Target, req: { creation_id: string; branch_name: string; diff_summary: string; new_content: string; author_agent?: string }) {
  return post<Astraura158Ack>(target, "/api/creations/fork_version", req);
}

/** Ejecuta una muestra de código de una creación en el sandbox del backend. */
export function runAstraura158CreationSample(target: Astraura158Target, creationId: string) {
  return post<Astraura158Ack & { output?: string; stdout?: string; stderr?: string }>(target, "/api/creations/run_sample", { creation_id: creationId }, longTimeout(target));
}

/* ── Memoria: documentos StarSeed y OpenViking ────────────────────────────── */

/**
 * Documento del memory root soberano. Campos REALES del backend
 * (`SaveMemoryDocRequest`): el cuerpo es `markdown` y el título es `name` —
 * no `content`/`title`, que es lo que se supuso antes de verificar el contrato.
 */
export interface Astraura158Document {
  id?: string;
  name: string;
  branch: string;
  markdown: string;
  category?: string;
  tags?: string[];
  color?: string;
  active?: boolean;
  [k: string]: unknown;
}

/**
 * OJO: este endpoint devuelve un ARRAY pelado, no `{ documents: [...] }`.
 * Y el memory root real de una neurona pasa de los 10 000 documentos, así que
 * SIEMPRE se pide una página: sin `limit` el backend los manda todos y la
 * pestaña se come megabytes por gusto. Los más recientes van primero.
 */
export function fetchAstraura158Documents(target: Astraura158Target, opts?: { branch?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (opts?.branch) q.set("branch", opts.branch);
  q.set("limit", String(opts?.limit ?? 200));
  if (opts?.offset) q.set("offset", String(opts.offset));
  return call<Astraura158Document[]>(target, `/api/memory/starseed/documents?${q.toString()}`);
}

export function saveAstraura158Document(target: Astraura158Target, doc: Astraura158Document) {
  return post<Astraura158Ack & { document?: Astraura158Document }>(target, "/api/memory/starseed/document", doc);
}

export async function deleteAstraura158Document(target: Astraura158Target, docId: string) {
  return unwrap(await call<Astraura158Ack>(target, `/api/memory/starseed/document/${encodeURIComponent(docId)}`, { method: "DELETE" }));
}

export interface Astraura158OpenViking {
  session_buffer?: { id?: string; role?: string; content?: string; timestamp?: number; tokens?: number }[];
  events?: { id?: string; kind?: string; summary?: string; timestamp?: number; valence?: number }[];
  concept_propagation?: { concept?: string; strength?: number; linked?: string[] }[];
  pipelines?: { id?: string; name?: string; stage?: string; progress?: number; status?: string }[];
  [k: string]: unknown;
}

/** Memoria de trabajo jerárquica «OpenViking» (buffer, eventos, conceptos, pipelines). */
export function fetchAstraura158OpenViking(target: Astraura158Target) {
  return call<Astraura158OpenViking>(target, "/api/memory/openviking");
}

/* ── Cerebros externos: escanear, fusionar y llevar en el bolsillo ─────────── */

export interface Astraura158ExternalBrain {
  id?: string;
  name?: string;
  owner?: string;
  device?: string;
  path?: string;
  volume?: string;
  size_mb?: number;
  memories?: number;
  permission_mode?: string;
  last_seen?: string;
  [k: string]: unknown;
}

/** Busca cerebros Astraura de otras personas o dispositivos en las unidades conectadas. */
export function scanAstraura158ExternalBrains(target: Astraura158Target) {
  return call<{ success?: boolean; total_detected?: number; external_brains?: Astraura158ExternalBrain[] }>(
    target, "/api/cerebros/external/scan", { timeoutMs: longTimeout(target) },
  );
}

/** Fusiona un cerebro externo con el propio según una estrategia. */
export function fuseAstraura158ExternalBrain(target: Astraura158Target, brainId: string, strategy: "bidirectional_merge" | "import_only" | "export_only" = "bidirectional_merge") {
  return post<Astraura158Ack & { merged?: number }>(target, "/api/cerebros/external/fuse", { brain_id: brainId, strategy }, longTimeout(target));
}

/** Modo de permiso con el que se trata un cerebro externo. */
export function setAstraura158ExternalBrainPermissions(target: Astraura158Target, brainId: string, mode: string) {
  return post<Astraura158Ack>(target, "/api/cerebros/external/permissions", { brain_id: brainId, mode });
}

/** Copia una app portátil autoejecutable (backend + cerebro) a una unidad extraíble. */
export function syncAstraura158Portable(target: Astraura158Target, opts: { drive_path: string; brain_id?: string; include_projects?: boolean; include_voice_studio?: boolean }) {
  return post<Astraura158Ack & { path?: string; size_mb?: number }>(target, "/api/cerebros/portable/sync_to_storage", {
    brain_id: opts.brain_id ?? "starseed_unified_brain",
    drive_path: opts.drive_path,
    include_projects: opts.include_projects ?? true,
    include_voice_studio: opts.include_voice_studio ?? true,
  }, longTimeout(target));
}

/** Prueba en seco de una regla de enrutamiento (sin evento real). */
export function simulateAstraura158StorageRule(target: Astraura158Target, ruleId: string) {
  return post<Astraura158Ack & { steps?: string[] }>(target, `/api/storage/rules/${encodeURIComponent(ruleId)}/simulate`, {});
}

/* ── Explorador: indexar cualquier ruta en la memoria 1.58 ─────────────────── */

/**
 * Indexar es LENTO de verdad: medido en vivo, ~17 s por una carpeta con un solo
 * `.md` (trocea, extrae conceptos y reconstruye el grafo). Con `longTimeout`
 * (30 s) se abortaba a mitad y parecía un fallo de red. 3 minutos.
 */
export function indexAstraura158Path(target: Astraura158Target, path: string, opts?: { brain_id?: string; recursive?: boolean; force?: boolean }) {
  return post<Astraura158Ack & { indexed?: number; indexed_files_count?: number; new_chunks_added?: number; files_processed?: string[] }>(
    target, "/api/system/index_path", { path, force: true, ...opts }, 180_000,
  );
}

/* ── Instalador universal y descubrimiento ────────────────────────────────── */

/** El script del instalador llega como TEXTO (`text/x-shellscript`), no como JSON. */
export function fetchAstraura158InstallerScript(target: Astraura158Target) {
  return callText(target, "/api/installer/script", longTimeout(target));
}

export interface Astraura158DiscoveryScan {
  devices?: { id?: string; name?: string; kind?: string; address?: string; reachable?: boolean; version?: string }[];
  [k: string]: unknown;
}

/**
 * El descubrimiento del ecosistema es GET en el backend soberano, y es CARO:
 * medido en vivo, 48 s y ~8,6 MB de respuesta (recorre el dispositivo entero).
 * Con `longTimeout` se abortaba siempre. 3 minutos.
 */
export function runAstraura158DiscoveryScan(target: Astraura158Target) {
  return call<Astraura158DiscoveryScan>(target, "/api/discovery/scan", { timeoutMs: 180_000 });
}

/**
 * Recompila el motor nativo bitnet.cpp con las optimizaciones del silicio local.
 * Clonar + compilar tarda MINUTOS la primera vez; con `force:false` (por
 * defecto) responde al instante si ya está compilado. 10 minutos de margen.
 */
export function buildAstraura158Bitnet(target: Astraura158Target, force = false) {
  return post<Astraura158Ack & { log?: string[]; message?: string }>(target, "/api/bitnet/build", { force }, 600_000);
}

/* ── Sistema operativo soberano: estado, actualizaciones y auto-modificación ─ */

export interface Astraura158OsStatus {
  version?: string;
  channel?: string;
  build?: string;
  update_available?: boolean;
  latest_version?: string;
  changelog?: string[];
  [k: string]: unknown;
}

export function fetchAstraura158OsStatus(target: Astraura158Target) {
  return call<Astraura158OsStatus>(target, "/api/system/os/status");
}

export function checkAstraura158OsUpdates(target: Astraura158Target, channel?: "stable" | "beta") {
  return post<Astraura158Ack & Astraura158OsStatus>(target, "/api/system/os/check-updates", { channel: channel ?? null }, longTimeout(target));
}

export function installAstraura158OsUpdate(target: Astraura158Target, opts?: { auto_restart?: boolean; channel?: string }) {
  return post<Astraura158Ack & { log?: string[] }>(target, "/api/system/os/install-update", {
    channel: opts?.channel ?? "stable", auto_restart: opts?.auto_restart ?? false,
  }, longTimeout(target));
}

/**
 * Aplica al sistema una modificación de configuración propuesta por la IA.
 * Requiere consentimiento explícito del usuario (`granted: true`): sin él, el
 * backend debe rechazarla — el OS nunca la envía sin confirmación.
 */
export function modifyAstraura158OsConfiguration(target: Astraura158Target, body: { modifications: Record<string, unknown>; granted: boolean; osType?: string; consentToken?: string }) {
  return post<Astraura158Ack & { applied?: string[] }>(target, "/api/system/os/modify", {
    os_type: body.osType ?? "starseed_os",
    modifications: body.modifications,
    user_permissions_granted: body.granted,
    security_consent_token: body.consentToken ?? null,
  }, longTimeout(target));
}

export function saveAstraura158OsPreferences(target: Astraura158Target, preferences: Record<string, unknown>) {
  return post<Astraura158Ack>(target, "/api/system/os/preferences", { preferences });
}

/* ── Memoria del dispositivo: sincronizar almacenamiento local con la IA ─────
 * (Ola 6 · Adenda 158, ronda «memoria total») Hasta ahora el backend metía 3
 * recuerdos fijos en cada respuesta y nunca tocaba los documentos reales del
 * usuario. Este bloque habla con el módulo nuevo del backend soberano que
 * vigila carpetas REALES del dispositivo donde corre la neurona (nunca del
 * navegador) y las indexa en el MISMO grafo/índice que usa para responder:
 * `searchAstraura158MemoryContext` golpea la función que arma el contexto de
 * cada turno de chat, así que sirve también como «qué recuerda de esto». ───── */

export interface Astraura158DeviceSyncFolder {
  /** Ruta absoluta en el dispositivo donde corre el backend soberano. Identificador natural (no hay `id` separado). */
  path: string;
  enabled?: boolean;
  /** Epoch (s o ms, `fmtAgo` detecta cuál) de la última vez que se indexó esta carpeta; ausente/0 = nunca. */
  last_indexed?: number | null;
  files_indexed?: number;
  chunks_added?: number;
  /** Motivo del último fallo (ruta inexistente, permiso denegado…) TAL CUAL lo manda el backend. Nunca se esconde. */
  last_error?: string | null;
  [k: string]: unknown;
}

export interface Astraura158DeviceSync {
  folders?: Astraura158DeviceSyncFolder[];
  /** Si el demonio de fondo re-sincroniza solo cada `interval_minutes`. */
  auto?: boolean;
  interval_minutes?: number;
  /** El demonio está ejecutándose AHORA MISMO (no solo «activado»). */
  running?: boolean;
  total_documents?: number;
  total_nodes?: number;
  [k: string]: unknown;
}

/** Estado de la sincronización: carpetas vigiladas, demonio automático y totales del índice. Rápido. */
export function fetchAstraura158DeviceSync(target: Astraura158Target) {
  return call<Astraura158DeviceSync>(target, "/api/memory/device_sync", { timeoutMs: target === "nube" ? 15_000 : 8_000 });
}

/**
 * Da de alta (o actualiza — upsert por `path`) una carpeta a vigilar. Si el
 * backend la rechaza (no existe, no es directorio, sin permiso…) el `error`
 * que llega en la respuesta es el motivo TAL CUAL: no se reinterpreta aquí.
 */
export function addAstraura158DeviceSyncFolder(target: Astraura158Target, path: string, enabled?: boolean) {
  return post<Astraura158Ack & { folder?: Astraura158DeviceSyncFolder }>(target, "/api/memory/device_sync/folder", { path, enabled });
}

/** Activa o desactiva una carpeta ya vigilada. Mismo endpoint de alta (upsert por `path`): el backend no distingue «crear» de «actualizar». */
export function toggleAstraura158DeviceSyncFolder(target: Astraura158Target, path: string, enabled: boolean) {
  return post<Astraura158Ack & { folder?: Astraura158DeviceSyncFolder }>(target, "/api/memory/device_sync/folder", { path, enabled });
}

/** Deja de vigilar una carpeta (no borra lo que ya se indexó, solo la saca de la lista sincronizada). */
export async function removeAstraura158DeviceSyncFolder(target: Astraura158Target, path: string) {
  return unwrap(await call<Astraura158Ack>(target, `/api/memory/device_sync/folder?path=${encodeURIComponent(path)}`, { method: "DELETE" }));
}

/** Enciende/apaga el demonio automático y/o cambia cada cuántos minutos re-sincroniza. */
export function configureAstraura158DeviceSync(target: Astraura158Target, patch: { auto?: boolean; interval_minutes?: number }) {
  return post<Astraura158Ack & Astraura158DeviceSync>(target, "/api/memory/device_sync/config", patch);
}

export interface Astraura158DeviceSyncFolderResult {
  path?: string;
  indexed_files?: number;
  new_chunks?: number;
  error?: string;
  [k: string]: unknown;
}

export interface Astraura158DeviceSyncRunResult {
  success?: boolean;
  indexed_files?: number;
  new_chunks?: number;
  seconds?: number;
  per_folder?: Astraura158DeviceSyncFolderResult[];
  error?: string;
  message?: string;
  [k: string]: unknown;
}

/**
 * Indexa AHORA: una carpeta concreta (`path`) o todas las vigiladas (`path`
 * omitido/`null`). LENTO de verdad: medido en vivo, ~17 s por una carpeta
 * pequeña — con muchas carpetas o los 10 000+ documentos de un usuario real
 * esto son minutos, no segundos. Mismo margen que `indexAstraura158Path`
 * (con `longTimeout`, 30 s, se abortaba a mitad): 3 minutos.
 */
export function runAstraura158DeviceSync(target: Astraura158Target, path?: string | null) {
  return post<Astraura158DeviceSyncRunResult>(target, "/api/memory/device_sync/run", { path: path ?? null }, 180_000);
}

export interface Astraura158ContextHit {
  /** De dónde sale este fragmento de contexto: memoria fijada/mem0, documento indexado, o concepto del grafo. */
  source?: "memory" | "document" | "concept" | string;
  title?: string;
  text?: string;
  score?: number;
  [k: string]: unknown;
}

export interface Astraura158ContextSearch {
  query?: string;
  hits?: Astraura158ContextHit[];
  [k: string]: unknown;
}

/**
 * «Qué recuerda de esto»: NO es una vista aparte de la memoria — es la MISMA
 * función que el backend usa para armar el contexto de cada respuesta del
 * chat (1.58-bit, todas las memorias). Lo que devuelve esto es literalmente
 * lo que ve el modelo. Rápido.
 */
export function searchAstraura158MemoryContext(target: Astraura158Target, query: string, topK = 8) {
  const q = new URLSearchParams({ q: query, top_k: String(topK) });
  return call<Astraura158ContextSearch>(target, `/api/memory/search?${q.toString()}`, { timeoutMs: 8000 });
}
