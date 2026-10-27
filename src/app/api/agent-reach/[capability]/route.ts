import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  AVISO_PYPI,
  ORDEN_INSTALACION,
  leerSobre,
  loginPermitido,
  resolverCapacidad,
  type EntradaAgentReach,
} from "@/lib/integrations/agent-reach-comandos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ══════════════════════════════════════════════════════════════════════════
// Proxy de Agent-Reach v1.6 (INV1025A). Ruta SOLO local: estas rutas deben
// responder 404 en producción (regla del área mando) y jamás devuelven claves
// ni rutas del disco. Cada capacidad pasa por la tabla pura de
// agent-reach-comandos.ts; aquí solo vive lo de proceso (binario, spawn, sesión).
// ══════════════════════════════════════════════════════════════════════════

const TIMEOUT_MS = 45_000;
const BINARIO_GLOBAL = "/usr/local/bin/agent-reach";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ capability: string }> },
) {
  const { capability } = await ctx.params;
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    cuerpo = {};
  }
  return atender(capability, { url: cuerpo.url, q: cuerpo.q, limit: cuerpo.limit, texto: cuerpo.texto }, req);
}

/** Salud del proxy (la llama el cliente con GET): equivale a `agent-reach version`. */
export async function GET(req: NextRequest) {
  return atender("health", {}, req);
}

/** Resuelve el binario: variable de la neurona → ~/.local/bin → /usr/local/bin → PATH. */
async function binarioAgenteReach(): Promise<string | null> {
  const delEntorno = (process.env.STARSEED_AGENT_REACH_BIN || "").trim();
  if (delEntorno) return delEntorno;
  const home = (process.env.HOME || "").trim();
  const candidatos = [home ? `${home}/.local/bin/agent-reach` : "", BINARIO_GLOBAL].filter(Boolean);
  for (const ruta of candidatos) {
    try {
      await fs.access(ruta);
      return ruta;
    } catch {
      /* tampoco ahí: seguimos */
    }
  }
  return new Promise((resolve) => {
    const p = spawn("which", ["agent-reach"], { shell: false, stdio: "ignore" });
    p.on("close", (c) => resolve(c === 0 ? "agent-reach" : null));
    p.on("error", () => resolve(null));
  });
}

/** Sesión de Supabase como /api/mail/enviar, o modo local de la neurona. */
async function sesionOk(req: NextRequest): Promise<boolean> {
  if ((process.env.STARSEED_LOCAL || "").trim() === "1") return true;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false } },
  );
  const { data } = await sb.auth.getUser(token);
  return Boolean(data?.user?.id);
}

/** Ejecución aislada: spawn SIN shell, args como array y tiempo límite duro. */
function ejecutar(bin: string, argv: string[]): Promise<{ ok: boolean; timeout?: boolean; salida?: string; error?: string }> {
  return new Promise((resolve) => {
    const hijo = spawn(bin, argv, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", timeout = false;
    hijo.stdout?.on("data", (d) => (out += d.toString()));
    hijo.stderr?.on("data", (d) => (err += d.toString()));
    const t = setTimeout(() => {
      timeout = true;
      hijo.kill("SIGKILL");
    }, TIMEOUT_MS);
    hijo.on("close", (code) => {
      clearTimeout(t);
      if (timeout) return resolve({ ok: false, timeout: true });
      if (code === 0) return resolve({ ok: true, salida: out });
      resolve({ ok: false, error: err.trim() || out.trim() || `agent-reach terminó con exit ${code}` });
    });
    hijo.on("error", (e) => {
      clearTimeout(t);
      resolve({ ok: false, error: (e as Error)?.message || "spawn fallo" });
    });
  });
}

/** Camino común de POST (cualquier capacidad) y GET (health → `version`). */
async function atender(id: string, entrada: EntradaAgentReach, req: NextRequest) {
  if (!(await sesionOk(req))) {
    return json(
      { ok: false, error: { code: "SESION_REQUERIDA", hint: "Sesión de Supabase obligatoria, o STARSEED_LOCAL=1 en la neurona." } },
      401,
    );
  }
  const res = resolverCapacidad(id, entrada, loginPermitido(process.env));
  if (!res.ok) {
    const estado = res.code === "NOT_FOUND" ? 404 : res.code === "NEED_LOGIN_BLOQUEADO" ? 403 : 400;
    return json({ ok: false, error: { code: res.code, hint: res.hint } }, estado);
  }
  const bin = await binarioAgenteReach();
  if (!bin) {
    return json({
      ok: false,
      error: {
        code: "NEED_SETUP",
        hint: `agent-reach no está en esta neurona. Instálalo con: ${ORDEN_INSTALACION} — y recuerda ${AVISO_PYPI}`,
      },
    });
  }
  const r = await ejecutar(bin, res.argv);
  if (r.timeout) {
    return json({ ok: false, error: { code: "TIMEOUT", hint: `agent-reach no respondió en ${TIMEOUT_MS / 1000} s.` }, meta: { capacidad: id } });
  }
  if (!r.ok) {
    return json({ ok: false, error: { code: "UPSTREAM_BROKEN", hint: r.error || "agent-reach falló." }, meta: { capacidad: id } });
  }
  return json({ ...leerSobre(r.salida), meta: { capacidad: id } });
}
