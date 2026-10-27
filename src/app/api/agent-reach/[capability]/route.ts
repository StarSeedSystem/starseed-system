import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { ComandoEntrada, leerSobre, resolver } from "@/lib/integrations/agent-reach-comandos";

// Proxy del OS a agent-reach v1.6 (solo local): resuelve el binario
// (STARSEED_AGENT_REACH_BIN · ~/.local/bin · /usr/local/bin · which),
// lanza con spawn SIN shell y tiempo límite, exige sesión de Supabase
// (o STARSEED_LOCAL=1) y parsea el JSON de la v1.6. En Vercel degrada.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 45_000;
const HINT_INSTALAR =
  "Instala agent-reach v1.6 con: uv tool install " +
  "https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip (queda en ~/.local/bin). " +
  "Atención: el paquete «agent-reach» de PyPI NO es este proyecto.";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// ── Resolución del binario ──
async function resolverBinario(): Promise<string | null> {
  const candidatos = [process.env.STARSEED_AGENT_REACH_BIN || null, `${homedir()}/.local/bin/agent-reach`, "/usr/local/bin/agent-reach"]
    .filter((p): p is string => !!p);
  for (const c of candidatos) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* siguiente candidato */
    }
  }
  return new Promise<string | null>((resolve) => {
    const hijo = spawn("which", ["agent-reach"], { shell: false, stdio: ["ignore", "pipe", "ignore"] });
    hijo.stdout?.on("data", (d) => {
      const ruta = d.toString().trim();
      if (ruta) resolve(ruta);
    });
    hijo.on("close", () => resolve(null));
    hijo.on("error", () => resolve(null));
  });
}

/** Ejecuta agent-reach con argv ya validado: spawn sin shell, con tiempo límite. */
function ejecutar(
  bin: string,
  argv: string[],
  timeoutMs = TIMEOUT_MS,
): Promise<{ salida: string; errores: string; timeout: boolean }> {
  return new Promise((resolve) => {
    let salida = "";
    let errores = "";
    const hijo = spawn(bin, argv, { shell: false, stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    hijo.stdout?.on("data", (d) => (salida += d.toString()));
    hijo.stderr?.on("data", (d) => (errores += d.toString()));
    hijo.on("close", (_code, senal) => resolve({ salida, errores, timeout: senal === "SIGTERM" || senal === "SIGKILL" }));
    hijo.on("error", () => resolve({ salida, errores, timeout: false }));
  });
}

// ── Sesión de Supabase (como /api/mail/enviar) o modo local ────
async function haySesion(req: NextRequest): Promise<boolean> {
  if (process.env.STARSEED_LOCAL === "1") return true;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return false;
  const { createClient } = await import("@supabase/supabase-js");
  const { data, error } = await createClient(url, key).auth.getUser(token);
  return !error && !!data.user;
}

type Cli = { salida: string; errores: string; timeout: boolean };

/** Salida cruda del CLI → respuesta del proxy (con el código de TIMEOUT). */
function respuestaDe(r: Cli, salida: string): NextResponse {
  if (r.timeout) {
    return json({ ok: false, error: { code: "TIMEOUT", hint: `agent-reach no respondió en ${TIMEOUT_MS / 1000} s: se canceló la orden.` } });
  }
  return json(leerSobre(salida));
}

function extraerEntrada(body: Record<string, unknown>): ComandoEntrada {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  return { url: str("url"), q: str("q") ?? str("query"), repo: str("repo"), feed: str("feed"), limit: typeof body.limit === "number" ? body.limit : undefined };
}

/** GET: solo salud (health y version → agent-reach version). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ capability: string }> }) {
  const { capability } = await ctx.params;
  if (capability !== "health" && capability !== "version") {
    return json({ ok: false, error: { code: "NOT_FOUND", hint: "Por GET solo se consulta health." } }, 404);
  }
  const bin = await resolverBinario();
  if (!bin) return json({ ok: false, error: { code: "NEED_SETUP", hint: HINT_INSTALAR } });
  const r = await ejecutar(bin, ["version"]);
  return respuestaDe(r, r.salida.trim() ? r.salida : r.errores);
}

/** POST: la única puerta a los canales sin sesión. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ capability: string }> }) {
  const { capability } = await ctx.params;
  if (!(await haySesion(req))) {
    return json({ ok: false, error: { code: "NEED_LOGIN", hint: "Sesión de Supabase requerida (o STARSEED_LOCAL=1)." } }, 401);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: { code: "BAD_INPUT", hint: "Cuerpo JSON inválido." } });
  }
  const resuelto = resolver(capability, extraerEntrada(body), false);
  if (!resuelto.ok) return json({ ok: false, error: { code: resuelto.codigo ?? "BAD_INPUT", hint: resuelto.hint ?? "Sin pista." } });
  const bin = await resolverBinario();
  if (!bin) return json({ ok: false, error: { code: "NEED_SETUP", hint: HINT_INSTALAR } });
  const r = await ejecutar(bin, resuelto.argv ?? []);
  return respuestaDe(r, r.salida.trim() ? r.salida : r.errores);
}
