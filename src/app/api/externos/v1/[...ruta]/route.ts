// ══════════════════════════════════════════════════════════════
// API externa v1 — Ola 281 · E2 (2026-09-07)
// Endpoints públicos con Bearer `ssk_…` para hablar con la
// personalidad/agente/chat del vínculo a través del router del OS:
//   GET  /api/externos/v1/estado        → estado, permisos y caducidad
//   POST /api/externos/v1/chat          → {mensaje, system?} (permiso escribir)
//   GET  /api/externos/v1/memorias      → últimas memorias del ámbito
// Cualquier otra ruta → 404 JSON. CORS `*` solo para `GET estado`.
// ══════════════════════════════════════════════════════════════
import { NextRequest } from "next/server";
import { autenticarExterno, type ExternoAutenticado } from "@/lib/externos/guardian-externo";
import { destinoNube } from "@/lib/astraura/destino-nube";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VERSION = "v1";
const CHAT_TIMEOUT_MS = 110_000;

const ACAO = { "Access-Control-Allow-Origin": "*" };

type Ctx = { params: Promise<{ ruta?: string[] }> };

function json(datos: unknown, status = 200, extra?: Record<string, string>): Response {
  return Response.json(datos, { status, headers: extra });
}

function queRuta(ctx: Ctx, raw: string[] | undefined): string {
  return raw?.[0] ?? "";
}

function authFail(a: Extract<Awaited<ReturnType<typeof autenticarExterno>>, { ok: false }>): Response {
  return json({ error: a.error }, a.status);
}

interface ChatRespuesta {
  ok: boolean;
  status: number;
  error?: string;
  respuesta?: string;
  fuente?: string;
  ms?: number;
}

function cabecerasUpstream(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const clave = String(process.env.ASTRAURA_158_KEY ?? "").trim();
  if (clave) h["X-Astraura-Key"] = clave;
  return h;
}

/**
 * Envía el mensaje al backend Astraura con la identidad del ámbito del vínculo:
 * personalidad → `preferences.personality_id`, agente → `agent_id`, chat →
 * `chat_id`. Usa la misma resolución de destino que el proxy del OS
 * (`destinoNube`), así que releva sola ante una nube no disponible.
 */
async function reenviarChat(
  vinculo: ExternoAutenticado["vinculo"],
  mensaje: string,
  system: string | undefined,
): Promise<ChatRespuesta> {
  const destino = await destinoNube();
  if (!destino) {
    return { ok: false, status: 503, error: "La nube de Astraura no está disponible ahora mismo." };
  }
  const preferences: Record<string, unknown> = {};
  if (vinculo.ambito_tipo === "personalidad") preferences.personality_id = vinculo.ambito_id;
  else if (vinculo.ambito_tipo === "agente") preferences.agent_id = vinculo.ambito_id;
  else if (vinculo.ambito_tipo === "chat") preferences.chat_id = vinculo.ambito_id;
  const cuerpo: Record<string, unknown> = { prompt: mensaje };
  if (system && system.trim()) cuerpo.system_prompt = system;
  if (Object.keys(preferences).length > 0) cuerpo.preferences = preferences;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`${destino.base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecerasUpstream() },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const ms = Date.now() - t0;
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status >= 500 ? 502 : res.status, error: `Astraura respondió ${res.status}.`, ms };
    }
    let parseado: { response?: unknown } = {};
    try { parseado = JSON.parse(raw); } catch { parseado = { response: raw }; }
    const respuesta = typeof parseado.response === "string" ? parseado.response : raw.slice(0, 4000);
    return { ok: true, status: 200, respuesta, fuente: destino.via, ms };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = /abort/i.test(msg);
    return { ok: false, status: 504, error: timeout ? "Astraura no respondió a tiempo." : "No se pudo contactar Astraura.", ms: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

/** `GET estado`: estado, ámbito, permisos y caducidad (único con CORS `*`). */
async function estado(a: ExternoAutenticado): Promise<Response> {
  return json(
    {
      ok: true,
      version: VERSION,
      ambito: { tipo: a.vinculo.ambito_tipo, id: a.vinculo.ambito_id, nombre: a.vinculo.nombre },
      permisos: a.vinculo.permisos,
      expira_en: a.vinculo.expira_en,
    },
    200,
    ACAO,
  );
}

/** `GET memorias?limite=20`: últimas memorias del ámbito (permiso `memoria`). */
async function memorias(req: NextRequest, a: ExternoAutenticado): Promise<Response> {
  const limiteStr = new URL(req.url).searchParams.get("limite") ?? "20";
  const limite = Math.max(1, Math.min(50, Number(limiteStr) || 20));
  let query = a.supabase
    .from("astraura_messages")
    .select("id,chat_id,role,content,created_at,user_id")
    .eq("user_id", a.owner)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (a.vinculo.ambito_tipo === "chat" && a.vinculo.ambito_id) {
    query = query.eq("chat_id", a.vinculo.ambito_id);
  }
  const { data, error } = await query;
  if (error) {
    return json({ error: "No se pudieron leer las memorias." }, 500);
  }
  return json({ ok: true, memorias: data ?? [], limite, version: VERSION });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const operacion = queRuta(ctx, (await ctx.params).ruta);
  if (operacion !== "estado" && operacion !== "memorias") {
    return json({ error: "Ruta desconocida en la API externa v1." }, 404);
  }
  const auth = await autenticarExterno(req, operacion === "memorias" ? "memoria" : undefined);
  if (!auth.ok) return authFail(auth);
  if (operacion === "estado") return estado(auth);
  return memorias(req, auth);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const operacion = queRuta(ctx, (await ctx.params).ruta);
  if (operacion !== "chat") {
    return json({ error: "Ruta desconocida en la API externa v1." }, 404);
  }
  const auth = await autenticarExterno(req, "escribir");
  if (!auth.ok) return authFail(auth);
  let cuerpo: { mensaje?: unknown; system?: unknown } = {};
  try { cuerpo = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
  const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : "";
  if (!mensaje) return json({ error: "El campo `mensaje` es obligatorio." }, 400);
  const system = typeof cuerpo.system === "string" ? cuerpo.system : undefined;
  const chat = await reenviarChat(auth.vinculo, mensaje, system);
  return json(
    { ok: chat.ok, error: chat.error, respuesta: chat.respuesta, fuente: chat.fuente, ms: chat.ms },
    chat.status,
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...ACAO,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}