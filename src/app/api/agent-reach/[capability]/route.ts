import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs, constants as fsc } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/security/rate-limit";
import { HINT_INSTALACION, leerSobre, resolverComando } from "@/lib/integrations/agent-reach-comandos";

// ══════════════════════════════════════════════════════════════════════
// Proxy de AGENT REACH v1.6 (https://github.com/Panniantong/Agent-Reach)
// ----------------------------------------------------------------------------
// POST /api/agent-reach/<capacidad> · GET /api/agent-reach/health (versión).
// Las capacidades, la validación (SSRF, argumentos con guion) y la lectura del
// JSON viven en src/lib/integrations/agent-reach-comandos.ts. Aquí solo:
//   · sesión de Supabase obligatoria (o STARSEED_LOCAL=1 en la neurona),
//   · binario resuelto sin adivinar (variable, ~/.local/bin, /usr/local/bin, which),
//   · spawn SIN shell, tiempo límite y salida acotada.
// Canales con sesión (Reddit, X…) apagados salvo STARSEED_AGENT_REACH_LOGIN=1 (R1).
// ══════════════════════════════════════════════════════════════════════

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIEMPO_MS = 45_000;
const SALIDA_MAX = 2_000_000;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Sesión de Supabase (Bearer) o neurona local. Devuelve la clave del límite o null. */
async function quienLlama(req: NextRequest): Promise<string | null> {
  if (process.env.STARSEED_LOCAL === "1") return "local";
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !url || !clave) return null;
  try {
    const sb = createClient(url, clave, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.getUser(token);
    return error || !data?.user?.id ? null : data.user.id;
  } catch {
    return null;
  }
}

async function ejecutable(ruta: string): Promise<boolean> {
  try { await fs.access(ruta, fsc.X_OK); return true; } catch { return false; }
}

/** Dónde está agent-reach en esta neurona (null si no está). */
async function resolverBinario(): Promise<string | null> {
  const candidatos = [process.env.STARSEED_AGENT_REACH_BIN, path.join(homedir(), ".local/bin/agent-reach"), "/usr/local/bin/agent-reach"];
  for (const c of candidatos) if (c && path.isAbsolute(c) && (await ejecutable(c))) return c;
  return new Promise((resolve) => {
    let out = "";
    const p = spawn("which", ["agent-reach"], { stdio: ["ignore", "pipe", "ignore"] });
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.on("close", (c) => resolve(c === 0 && out.trim() ? out.trim().split("\n")[0] : null));
    p.on("error", () => resolve(null));
  });
}

/** Lanza la orden sin shell, con tiempo límite y salida acotada. */
function lanzar(bin: string, argv: string[]): Promise<{ codigo: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const hijo = spawn(bin, argv, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    hijo.stdout?.on("data", (d) => { if (out.length < SALIDA_MAX) out += d.toString(); });
    hijo.stderr?.on("data", (d) => { if (err.length < 4000) err += d.toString(); });
    const reloj = setTimeout(() => hijo.kill("SIGKILL"), TIEMPO_MS);
    hijo.on("close", (codigo) => { clearTimeout(reloj); resolve({ codigo, out, err }); });
    hijo.on("error", (e) => { clearTimeout(reloj); resolve({ codigo: -1, out, err: e.message }); });
  });
}

async function atender(req: NextRequest, capacidad: string, cuerpo: Record<string, unknown>) {
  const quien = await quienLlama(req);
  if (!quien) return json({ ok: false, error: "Sesión requerida." }, 401);
  if (!rateLimit(`agent-reach:${quien}`, 30, 60_000).allowed) {
    return json({ ok: false, error: "Demasiadas lecturas seguidas; prueba en un minuto." }, 429);
  }
  const r = resolverComando(capacidad, cuerpo, { login: process.env.STARSEED_AGENT_REACH_LOGIN === "1" });
  if (!r.ok) {
    const status = r.motivo === "DESCONOCIDA" ? 404 : r.motivo === "NEED_LOGIN_BLOQUEADO" ? 403 : 400;
    return json({ ok: false, error: r.error, motivo: r.motivo }, status);
  }
  const bin = await resolverBinario();
  if (!bin) return json({ ok: false, error: "agent-reach no está instalado en esta neurona.", hint: HINT_INSTALACION });

  const { codigo, out, err } = await lanzar(bin, r.argv);
  if (capacidad === "health") {
    return json({ ok: codigo === 0, service: "starseed-agent-reach-proxy", version: out.trim().slice(0, 200) || null });
  }
  if (!out.trim()) {
    return json({ ok: false, error: codigo === null ? "agent-reach superó el tiempo límite." : err.trim().slice(0, 500) || `agent-reach salió con ${codigo}` });
  }
  const sobre = leerSobre(out);
  return json({ ok: sobre.ok, content: sobre.content, items: sobre.items, error: sobre.error?.hint, codigo: sobre.error?.code, meta: { capability: capacidad } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ capability: string }> }) {
  const { capability } = await ctx.params;
  let cuerpo: Record<string, unknown> = {};
  if (capability !== "health") {
    try {
      const b: unknown = await req.json();
      if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("no es objeto");
      cuerpo = b as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "Cuerpo inválido." }, 400);
    }
  }
  return atender(req, capability, cuerpo);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ capability: string }> }) {
  const { capability } = await ctx.params;
  if (capability !== "health") return json({ ok: false, error: "Usa POST para esta capacidad." }, 405);
  return atender(req, "health", {});
}
