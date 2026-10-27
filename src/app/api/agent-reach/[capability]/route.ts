import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import {
  resolverCapacidad,
  validarEntrada,
  leerSobre,
  tipoDeCapacidad,
} from "@/lib/integrations/agent-reach-comandos";

/**
 * Proxy de Agent Reach v1.6 (2026-10-23) · SOLO local (404 en producción).
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/agent-reach/<capacidad> · GET /api/agent-reach/health (= version).
 * Exige sesión de Supabase (o STARSEED_LOCAL=1). R1: canales con sesión
 * bloqueados salvo STARSEED_AGENT_REACH_LOGIN=1. Spawn sin shell, con límite.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 45_000;
const INSTALAR =
  "uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip" +
  " (el paquete `agent-reach` de PyPI NO es este proyecto)";

function json(datos: unknown, status = 200) {
  return NextResponse.json(datos, { status });
}

/** Sesión de Supabase vía `Authorization: Bearer`, como /api/mail/enviar; o local. */
async function haySesion(req: NextRequest): Promise<boolean> {
  if (process.env.STARSEED_LOCAL === "1") return true;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !url) return false;
  const sb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", {
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser(token);
  return Boolean(data?.user);
}

/** Env → ~/.local/bin → /usr/local/bin → which. null si no está. */
async function resolverBinario(): Promise<string | null> {
  const candidatos = [
    process.env.STARSEED_AGENT_REACH_BIN,
    `${homedir()}/.local/bin/agent-reach`,
    "/usr/local/bin/agent-reach",
  ].filter((c): c is string => Boolean(c));
  for (const c of candidatos) {
    try { await access(c, constants.X_OK); return c; } catch { /* siguiente */ }
  }
  return new Promise((resolver) => {
    const p = spawn("which", ["agent-reach"], { stdio: "ignore" });
    p.on("close", (c) => resolver(c === 0 ? "agent-reach" : null));
    p.on("error", () => resolver(null));
  });
}

function ejecutar(bin: string, argv: string[]): Promise<{ salida: string; fallo?: string }> {
  return new Promise((resolver) => {
    const hijo = spawn(bin, argv, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    hijo.stdout?.on("data", (d) => (salida += String(d)));
    hijo.stderr?.on("data", (d) => (salida += String(d)));
    const reloj = setTimeout(() => hijo.kill("SIGKILL"), TIMEOUT_MS);
    hijo.on("close", (c) => { clearTimeout(reloj); resolver({ salida, fallo: c === 0 ? undefined : `exit ${c}` }); });
    hijo.on("error", (e) => { clearTimeout(reloj); resolver({ salida: "", fallo: (e as { code?: string }).code ?? "spawn" }); });
  });
}

/** POST `/api/agent-reach/<capacidad>` con { q?, url?, repo?, limite? }. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ capability: string }> }) {
  const { capability } = await ctx.params;
  if (!(await haySesion(req))) return json({ ok: false, error: "Sesión requerida." }, 401);
  if (process.env.NODE_ENV === "production") return json({ ok: false, error: "Solo local." }, 404);

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* sigue */ }
  const tipo = tipoDeCapacidad(capability);
  const arg = String(body[tipo === "q" ? "q" : tipo === "repo" ? "repo" : "url"] ?? "");
  const resuelto = resolverCapacidad(capability, arg, {
    limite: Number(body.limite) || undefined,
    loginPermitido: process.env.STARSEED_AGENT_REACH_LOGIN === "1",
  });
  if (resuelto.accion === "rechazar") return json({ ok: false, motivo: resuelto.motivo }, 403);
  const entrada = validarEntrada(tipo, arg);
  if (!entrada.ok) return json({ ok: false, error: { code: entrada.motivo } }, 400);

  const bin = await resolverBinario();
  if (!bin) return json({ ok: false, error: { code: "NEED_SETUP" }, hint: INSTALAR, meta: { capability } }, 503);
  const { salida, fallo } = await ejecutar(bin, resuelto.argv);
  const sobre = leerSobre(salida);
  if (!sobre.ok && salida.trim() === "" && fallo) {
    return json({ ok: false, error: { code: "NEED_SETUP" }, hint: INSTALAR, meta: { capability } }, 503);
  }
  return json({ ...sobre, meta: { capability, arg } });
}

/** GET = comprobación de salud: `agent-reach version`. */
export async function GET(req: NextRequest) {
  if (!(await haySesion(req))) return json({ ok: false, error: "Sesión requerida." }, 401);
  if (process.env.NODE_ENV === "production") return json({ ok: false, error: "Solo local." }, 404);
  const bin = await resolverBinario();
  if (!bin) return json({ ok: false, error: { code: "NEED_SETUP" }, hint: INSTALAR }, 503);
  const { salida, fallo } = await ejecutar(bin, ["version"]);
  const sobre = leerSobre(salida);
  return json({ ...sobre, fallo: fallo ?? undefined });
}


