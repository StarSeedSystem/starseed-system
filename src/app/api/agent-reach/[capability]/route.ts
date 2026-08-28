import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

// ══════════════════════════════════════════════════════════════════════
// Proxy de AGENT REACH (https://github.com/Panniantong/Agent-Reach)
// ----------------------------------------------------------------------------
// Da a los agentes Astraura acceso a la web externa (Twitter/X, Reddit,
// YouTube, GitHub, Bilibili, búsqueda, RSS) TODO GRATIS. El cliente
// (src/ai/astraura/integrations/agent-reach.ts) pasa SIEMPRE por aquí.
//
// El proxy invoca el CLI de agent-reach SOLO si está instalado en la neurona
// del usuario (donde el usuario corrió `pip install agent-reach`). En Vercel
// el CLI no existe → degrada a { ok:false } SIN romper el build ni el runtime.
//
// SEGURIDAD:
//   · Allowlist estricta de `capability` (no hay ruta arbitraria del cliente).
//   · Argumentos validados como strings (sin shell injection: usamos spawn
//     con array de args, nunca shell).
//   · Timeout duro. Sin credenciales: agent-reach usa cookies locales del
//     usuario en su neurona; el proxy nunca las toca.
// ══════════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIMEOUT_MS = 45_000;

/** Capacidades permitidas (deben coincidir con AgentReachCapability del cliente). */
const ALLOWED: Record<string, string> = {
  web: "read", // agent-reach read <url>
  search: "search", // agent-reach search "<q>"
  youtube: "youtube", // agent-reach youtube <url>
  github: "github", // agent-reach github <repo>
  reddit: "reddit", // agent-reach reddit "<q>"
  twitter: "twitter", // agent-reach twitter <url> (requiere config del usuario)
  rss: "rss", // agent-reach rss <feed>
  bilibili: "bilibili", // agent-reach bilibili "<q>"
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** ¿Está agent-reach instalado en esta neurona? Comprueba el binario. */
async function agentReachAvailable(): Promise<boolean> {
  try {
    await fs.access("/usr/local/bin/agent-reach");
    return true;
  } catch {
    /* intenta via PATH */
  }
  return new Promise((resolve) => {
    const p = spawn("which", ["agent-reach"], { stdio: "ignore" });
    p.on("close", (c) => resolve(c === 0));
    p.on("error", () => resolve(false));
  });
}

/** Ejecuta el subcomando de agent-reach de forma aislada (spawn, sin shell). */
function runAgentReach(sub: string, arg: string): Promise<{ ok: boolean; out?: string; error?: string }> {
  return new Promise((resolve) => {
    const bin = "/usr/local/bin/agent-reach";
    const args = sub === "search" || sub === "reddit" || sub === "bilibili"
      ? [sub, arg]
      : [sub, arg];
    const child = spawn(bin, args, { timeout: TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, out: out.trim() || "(sin salida)" });
      else resolve({ ok: false, error: err.trim() || `agent-reach exit ${code}` });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: (e as Error)?.message || "spawn error" });
    });
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ capability: string }> },
) {
  const { capability } = await ctx.params;
  const sub = ALLOWED[capability];
  if (!sub) return json({ ok: false, error: "capability no permitida" }, 404);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "cuerpo inválido" });
  }

  // Extrae el argumento según la capacidad (siempre string, sin shell).
  const arg =
    typeof body.url === "string" ? body.url
    : typeof body.repo === "string" ? body.repo
    : typeof body.feed === "string" ? body.feed
    : typeof body.q === "string" ? body.q
    : "";
  if (!arg) return json({ ok: false, error: "falta argumento (url/repo/feed/q)" });

  const available = await agentReachAvailable();
  if (!available) {
    // Degradación limpia: la neurona no tiene agent-reach instalado.
    return json({
      ok: false,
      error: "agent-reach no instalado en esta neurona",
      hint: "pip install agent-reach  (ver https://github.com/Panniantong/Agent-Reach)",
    });
  }

  const result = await runAgentReach(sub, arg);
  if (result.ok) {
    return json({ ok: true, content: result.out, meta: { capability, arg } });
  }
  return json({ ok: false, error: result.error, meta: { capability, arg } });
}

export async function HEAD() {
  return NextResponse.json({ ok: true, service: "starseed-agent-reach-proxy" });
}
