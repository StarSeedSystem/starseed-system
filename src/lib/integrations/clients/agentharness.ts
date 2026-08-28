// ════════════════════════════════════════════════════════════════
// AgentHarness client para Aurora tools
// ------------------------------------------------------------
// Cablea AgentHarness (orquestación multi-agente) vía HTTP local.
// El motor Rust se ejecuta como proceso local (puerto 1984 por defecto)
// o vía WASM en browser. Las operaciones: definir DAG, lanzar workflow,
// consultar estado, obtener resultados, gestionar agentes.
// ════════════════════════════════════════════════════════════════

import type { IntegrationResult } from "../../../lib/integrations/types";

/** Configuración del cliente AgentHarness */
export interface AgentHarnessConfig {
  /** URL base del servidor AgentHarness (local o remoto) */
  baseUrl?: string;
  /** API key opcional (para entornos remotos) */
  apiKey?: string;
}

/** Un nodo/agente en el DAG */
export interface AgentNode {
  /** ID único del nodo */
  id: string;
  /** Tipo de agente (p. ej. "llm", "tool", "human", "aggregator") */
  type: string;
  /** Prompt o instrucción del agente */
  prompt: string;
  /** Modelo a usar */
  model?: string;
  /** Herramientas asignadas */
  tools?: string[];
  /** Configuración adicional del agente */
  config?: Record<string, unknown>;
}

/** Una arista en el DAG (conexión entre nodos) */
export interface AgentEdge {
  /** Nodo origen */
  from: string;
  /** Nodo destino */
  to: string;
  /** Condición para activar la arista (opcional) */
  condition?: string;
}

/** Definición completa de un workflow DAG */
export interface AgentWorkflow {
  /** ID único del workflow */
  id: string;
  /** Nombre descriptivo */
  name: string;
  /** Nodos del DAG */
  nodes: AgentNode[];
  /** Aristas del DAG */
  edges: AgentEdge[];
  /** Configuración global */
  config?: Record<string, unknown>;
}

/** Estado de una ejecución de workflow */
export type AgentRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/** Resultado de ejecutar un agente en el workflow */
export interface AgentRunResult {
  nodeId: string;
  status: AgentRunStatus;
  output?: string;
  error?: string;
  artifacts?: Record<string, unknown>;
}

/** Resultado completo de un workflow */
export interface AgentRunOutcome {
  workflowId: string;
  status: AgentRunStatus;
  results: AgentRunResult[];
  startedAt: string;
  completedAt?: string;
  metrics?: Record<string, number>;
}

// ── Configuración por defecto ──
const DEFAULT_CONFIG: AgentHarnessConfig = {
  baseUrl: "http://localhost:1984",
  apiKey: undefined,
};

/** Carga la configuración desde localStorage/env. */
export function loadConfig(): AgentHarnessConfig {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("starseed.agentharness.config");
    if (stored) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      } catch {
        // fall through
      }
    }
  }
  return DEFAULT_CONFIG;
}

/** Verifica disponibilidad del servidor AgentHarness. */
export async function healthCheck(config: AgentHarnessConfig): Promise<IntegrationResult> {
  try {
    const base = config.baseUrl || DEFAULT_CONFIG.baseUrl!;
    const res = await fetch(`${base}/health`, {
      headers: config.apiKey ? { "X-API-Key": config.apiKey } : {},
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection error" };
  }
}

/** Crea o actualiza un workflow DAG. */
export async function defineWorkflow(
  config: AgentHarnessConfig,
  workflow: AgentWorkflow
): Promise<IntegrationResult> {
  try {
    const base = config.baseUrl || DEFAULT_CONFIG.baseUrl!;
    const res = await fetch(`${base}/api/workflows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "X-API-Key": config.apiKey } : {}),
      },
      body: JSON.stringify(workflow),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Define workflow error" };
  }
}

/** Lanza un workflow para ejecución. */
export async function launchWorkflow(
  config: AgentHarnessConfig,
  workflowId: string,
  input: Record<string, unknown> = {}
): Promise<IntegrationResult<{ runId: string }>> {
  try {
    const base = config.baseUrl || DEFAULT_CONFIG.baseUrl!;
    const res = await fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { "X-API-Key": config.apiKey } : {}),
      },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Launch workflow error" };
  }
}

/** Consulta el estado de una ejecución. */
export async function getRunStatus(
  config: AgentHarnessConfig,
  runId: string
): Promise<IntegrationResult<AgentRunOutcome>> {
  try {
    const base = config.baseUrl || DEFAULT_CONFIG.baseUrl!;
    const res = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}`, {
      headers: config.apiKey ? { "X-API-Key": config.apiKey } : {},
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Get run status error" };
  }
}

/** Cancela una ejecución en curso. */
export async function cancelRun(
  config: AgentHarnessConfig,
  runId: string
): Promise<IntegrationResult> {
  try {
    const base = config.baseUrl || DEFAULT_CONFIG.baseUrl!;
    const res = await fetch(`${base}/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      headers: config.apiKey ? { "X-API-Key": config.apiKey } : {},
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cancel run error" };
  }
}

/** Lista workflows registrados. */
export async function listWorkflows(config: AgentHarnessConfig): Promise<IntegrationResult<AgentWorkflow[]>> {
  try {
    const base = config.baseUrl || DEFAULT_CONFIG.baseUrl!;
    const res = await fetch(`${base}/api/workflows`, {
      headers: config.apiKey ? { "X-API-Key": config.apiKey } : {},
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "List workflows error" };
  }
}

/** Ejecuta una acción específica de AgentHarness. */
export async function runAgentHarnessAction(
  action: string,
  config: AgentHarnessConfig,
  input: Record<string, unknown>
): Promise<IntegrationResult> {
  switch (action) {
    case "health": {
      return healthCheck(config);
    }
    case "defineWorkflow": {
      const workflow = input.workflow as AgentWorkflow;
      if (!workflow) {
        return { ok: false, error: "workflow (AgentWorkflow) requerido" };
      }
      return defineWorkflow(config, workflow);
    }
    case "launchWorkflow": {
      const workflowId = input.workflowId as string;
      if (!workflowId) {
        return { ok: false, error: "workflowId requerido" };
      }
      const runInput = (input.input as Record<string, unknown>) || {};
      return launchWorkflow(config, workflowId, runInput);
    }
    case "getRunStatus": {
      const runId = input.runId as string;
      if (!runId) {
        return { ok: false, error: "runId requerido" };
      }
      return getRunStatus(config, runId);
    }
    case "cancelRun": {
      const runId = input.runId as string;
      if (!runId) {
        return { ok: false, error: "runId requerido" };
      }
      return cancelRun(config, runId);
    }
    case "listWorkflows": {
      return listWorkflows(config);
    }
    default: {
      return { ok: false, error: `Acción AgentHarness desconocida: ${action}` };
    }
  }
}

/** Re-export tipo IntegrationResult para uso en registry. */
export type { IntegrationResult };