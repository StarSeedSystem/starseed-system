import { NextRequest, NextResponse } from "next/server";

// ══════════════════════════════════════════════════════════════════════
// Proxy de AGENTHARNESS (orquestación multi-agente)
// ----------------------------------------------------------------------------
// Delega peticiones del cliente AgentHarness (src/lib/integrations/clients/
// agentharness.ts) al servidor local AgentHarness (puerto 1984) que corre
// en la neurona del usuario. Si el servidor no responde, degrada limpio
// (ok:false) sin romper el build ni el runtime.
//
// SEGURIDAD:
//   · La URL base es configurable (starseed.integration.agentharness.endpoint).
//   · La API key nunca viaja por query string; se envía en header X-API-Key.
//   · No se almacenan credenciales.
// ══════════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_BASE = "http://localhost:1984";
const TIMEOUT_MS = 8_000;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Métodos HTTP permitidos → path del servidor AgentHarness */
const ACTIONS: Record<string, string> = {
  health: "/health",
  defineWorkflow: "/api/workflows",
  launchWorkflow: "/api/workflows/{id}/run",
  getRunStatus: "/api/runs/{id}",
  cancelRun: "/api/runs/{id}/cancel",
  listWorkflows: "/api/workflows",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action: capability } = await params;
  if (capability !== "health") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const baseUrl = process.env.AGENTHARNESS_URL || DEFAULT_BASE;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));
    return json({ ok: res.ok, ...data });
  } catch {
    return json({ ok: false, error: "AgentHarness no disponible en localhost:1984" });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action: capability } = await params;
  const action = ACTIONS[capability];
  if (!action) {
    return json({ ok: false, error: `Acción desconocida: ${capability}` }, 400);
  }

  let input: Record<string, unknown> = {};
  try {
    const body = await req.text();
    if (body) input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  const baseUrl = process.env.AGENTHARNESS_URL || DEFAULT_BASE;

  // Resolve path template (e.g. {id} → workflowId or runId)
  const workflowId = input.workflowId ? String(input.workflowId) : "";
  const runId = input.runId ? String(input.runId) : "";
  const resolvedPath = action
    .replace("{id}", capability === "launchWorkflow" ? workflowId : runId);

  const url = `${baseUrl}${resolvedPath}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(capability === "launchWorkflow" ? input.input : input),
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));
    return json({ ok: res.ok, ...data });
  } catch {
    return json({ ok: false, error: "AgentHarness no disponible en localhost:1984" });
  }
}
