/**
 * /api/ai/astraura-158/[...path] — PROXY del backend Astraura 1.58-bit (Adenda 153).
 *
 * El OS desplegado (HTTPS) habla con la NUBE de Astraura 1.58 (Cloud Run /
 * gateway) a través de su propio origen: sin CORS, sin contenido mixto y sin
 * exponer la URL/clave del backend al navegador. La fuente local
 * (`astraura-158-local`, 127.0.0.1:8000) NO pasa por aquí: el navegador habla
 * directo con la neurona, como con Ollama.
 *
 * Seguridad (el backend 1.58 no tiene auth propia, ver SOP §10):
 *   · EXIGE SESIÓN (Supabase) + rate-limit por usuario.
 *   · ALLOWLIST estricta de rutas: estado, catálogos (personalidades, agentes,
 *     habilidades, cerebros), chat, búsquedas y —Studio 1.58— los subsistemas
 *     (imaginación, enjambre/director, notificaciones, sentidos/privacidad,
 *     almacenamiento, proyectos/creaciones/workflows, voz, memoria) y —Ola 4
 *     (Adenda 156)— telemetría, navegador autónomo (navigate/search/action/
 *     index_memory) y el Explorador del dispositivo: SOLO LECTURA del sistema
 *     de archivos del backend (`system/fs`, `system/file`, `system/item_details`,
 *     `system/search`, `system/storage/drives`, `system/senses`) más la
 *     concesión explícita de `system/universal_device_access`. JAMÁS ejecución
 *     (`/api/system/exec`, `/api/execute/*`), JAMÁS escritura de archivos
 *     (ningún método distinto de GET sobre `system/file` ni sobre `system/fs`),
 *     arranque-parada del túnel ni claves de API.
 *   · DELETE solo para reglas de almacenamiento (`/api/storage/rules/{id}`).
 *   · Upstream fijo por entorno (`ASTRAURA_158_URL`; por defecto el Cloud Run
 *     oficial) → no hay SSRF: el usuario no elige el host.
 *   · Cuerpo ≤ 256 KB · timeouts duros · el stream SSE se reenvía tal cual.
 *   · `ASTRAURA_158_KEY` (opcional) viaja como `X-Astraura-Key` solo servidor→backend.
 *   · El Explorador del dispositivo lee la MÁQUINA del backend soberano (la
 *     neurona), NO el servidor del OS ni el navegador de quien lo usa; el
 *     propio backend es responsable de sanear las rutas que recibe por `?path=`.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_UPSTREAM = "https://astraura-backend-334237619848.us-central1.run.app";
const MAX_BODY_BYTES = 256 * 1024;
const GET_TIMEOUT_MS = 12_000;
const CHAT_TIMEOUT_MS = 110_000;

const GET_ALLOW: RegExp[] = [
  // (Ola 5 · Adenda 157) Ventanas por entidad y orquestación: SOLO lecturas.
  /^\/api\/agents\/[\w.-]+$/,
  /^\/api\/ecosystem\/agents\/[\w.-]+$/,
  /^\/api\/agents_api\/[\w.-]+\/api_status$/,
  /^\/api\/personalities\/[\w.-]+\/api_status$/,
  /^\/api\/cerebros\/[\w.-]+\/synaptic_tree$/,
  /^\/api\/cerebros\/context_metrics$/,
  /^\/api\/status$/,
  /^\/api\/bitnet\/status$/,
  /^\/api\/starseed\/(manifest|health)$/,
  /^\/api\/personalities$/,
  /^\/api\/agents$/,
  /^\/api\/agents\/[\w.-]+$/,
  /^\/api\/ecosystem\/agents$/,
  /^\/api\/skills$/,
  /^\/api\/cerebros$/,
  /^\/api\/memory\/graph$/,
  /^\/api\/memory\/mem0$/,
  /^\/api\/memory\/starseed\/manifest$/,
  /^\/api\/system\/tunnel\/status$/,
  /^\/active_tunnel\.json$/,
  // ── Studio 1.58 (lectura de subsistemas; sin archivos, sin OS, sin claves) ──
  /^\/api\/starseed\/(events|processes)$/,
  /^\/api\/starseed\/cognition\/preference$/,
  /^\/api\/imagination\/(status|process_types|sync_execution_state)$/,
  /^\/api\/imagination\/process\/[\w.-]+(\/branches)?$/,
  /^\/api\/imagination\/synthesis_reports(\/latest|\/[\w.-]+)?$/,
  /^\/api\/system\/dual_trunk$/,
  /^\/api\/swarm\/status$/,
  /^\/api\/director\/(status|config)$/,
  /^\/api\/dream\/(status|process_types)$/,
  /^\/api\/notifications$/,
  /^\/api\/notifications\/auth_orchestrator_status$/,
  /^\/api\/sensorium\/live$/,
  /^\/api\/privacy\/settings$/,
  /^\/api\/storage\/(devices|rules)$/,
  /^\/api\/routing_storage\/status$/,
  /^\/api\/system\/sync\/telemetry$/,
  /^\/api\/projects$/,
  /^\/api\/projects\/agent\/status$/,
  /^\/api\/projects\/[\w.-]+$/,
  /^\/api\/creations$/,
  /^\/api\/creations\/[\w.-]+$/,
  /^\/api\/workflows$/,
  /^\/api\/voice\/daemon\/status$/,
  /^\/api\/voice\/matrix$/,
  /^\/api\/voice_studio\/profiles$/,
  /^\/api\/memory\/recuerdos$/,
  // ── Ola 4 (Adenda 156): Telemetría · Navegador autónomo (estado) · Explorador del dispositivo (SOLO lectura) ──
  /^\/api\/system\/senses$/,
  /^\/api\/system\/fs$/,
  /^\/api\/system\/file$/,
  /^\/api\/system\/item_details$/,
  /^\/api\/system\/search$/,
  /^\/api\/system\/storage\/drives$/,
  /^\/api\/system\/universal_device_access$/,
];

const POST_ALLOW: RegExp[] = [
  // (Ola 5 · Adenda 157) Gobernanza: concurrencia del enjambre, permisos de agentes,
  // personalidades y cerebros, control de procesos de cerebro y auto-enlace sináptico.
  /^\/api\/swarm\/agent\/concurrency$/,
  /^\/api\/agents_api\/[\w.-]+\/update_permissions$/,
  /^\/api\/personalities\/[\w.-]+\/update_permissions$/,
  /^\/api\/cerebros\/process\/control$/,
  /^\/api\/cerebros\/neuron\/permissions$/,
  /^\/api\/cerebros\/auto_link_synapses$/,
  /^\/api\/chat$/,
  /^\/api\/chat\/stream$/,
  /^\/api\/starseed\/chat$/,
  /^\/api\/memory\/mem0\/search$/,
  /^\/api\/personalities\/activate$/,
  /^\/api\/skills\/toggle$/,
  /^\/api\/cerebros\/activate$/,
  /^\/api\/ecosystem\/agents\/[\w.-]+\/toggle$/,
  /^\/api\/browser\/search$/,
  // ── Studio 1.58 (acciones de subsistemas; JAMÁS exec/execute/archivos/OS/túnel/claves) ──
  /^\/api\/imagination\/(trigger|config|action|recycle|apply_all)$/,
  /^\/api\/imagination\/requests\/grant_all$/,
  /^\/api\/imagination\/requests\/[\w.-]+\/grant$/,
  /^\/api\/imagination\/process\/[\w.-]+\/(config|permission_policy)$/,
  /^\/api\/imagination\/synthesis_reports\/generate$/,
  /^\/api\/system\/dual_trunk$/,
  /^\/api\/swarm\/capacity_mode$/,
  /^\/api\/swarm\/task\/(dispatch|cancel)$/,
  /^\/api\/swarm\/schedule\/(toggle|frequency|create)$/,
  /^\/api\/swarm\/agent\/toggle$/,
  /^\/api\/director\/(config|steer_swarm|trigger_cycle|renew_tasks)$/,
  /^\/api\/notifications\/(mark_read|apply|apply_all_from_list|delete|clear|auth_orchestrator_auto)$/,
  /^\/api\/privacy\/(settings|toggle_air_gap)$/,
  /^\/api\/sensorium\/(location|weather\/fetch)$/,
  /^\/api\/storage\/(rules|scan_now)$/,
  /^\/api\/workflows\/(toggle|run)$/,
  /^\/api\/voice\/daemon\/(toggle_master|toggle_personality)$/,
  /^\/api\/memory\/recuerdos$/,
  /^\/api\/memory\/mem0\/add$/,
  /^\/api\/starseed\/events\/ack$/,
  /^\/api\/starseed\/processes\/imagination\/trigger$/,
  /^\/api\/starseed\/cognition\/preference$/,
  /^\/api\/agents\/[\w.-]+\/(toggle_imagination|update_imagination_config)$/,
  /^\/api\/ecosystem\/agents\/[\w.-]+\/config$/,
  // ── Ola 4 (Adenda 156): Navegador autónomo y concesión de acceso universal del Explorador del dispositivo ──
  /^\/api\/browser\/navigate$/,
  /^\/api\/browser\/action$/,
  /^\/api\/browser\/index_memory$/,
  /^\/api\/system\/universal_device_access\/grant$/,
];

/** DELETE: únicamente reglas de enrutamiento de almacenamiento (Studio 1.58). */
const DELETE_ALLOW: RegExp[] = [
  /^\/api\/storage\/rules\/[\w.-]+$/,
];

function upstreamBase(): string {
  const v = String(process.env.ASTRAURA_158_URL ?? "").trim().replace(/\/+$/, "");
  return v || DEFAULT_UPSTREAM;
}

function joinPath(segments: string[] | undefined): string {
  const p = "/" + (segments ?? []).map((s) => encodeURIComponent(decodeURIComponent(s))).join("/");
  // Normaliza `..`, dobles barras y demás (la allowlist trabaja sobre la ruta limpia).
  return p.replace(/\/{2,}/g, "/").replace(/\/\.\.?(?=\/|$)/g, "");
}

function allowed(path: string, list: RegExp[]): boolean {
  return list.some((rx) => rx.test(path));
}

async function requireUser(): Promise<{ userId: string } | Response> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return Response.json(
        { error: "Necesitas iniciar sesión para usar la nube de Astraura 1.58-bit." },
        { status: 401 },
      );
    }
    return { userId: data.user.id };
  } catch {
    return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
  }
}

function upstreamHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json, text/event-stream", ...(extra ?? {}) };
  const key = String(process.env.ASTRAURA_158_KEY ?? "").trim();
  if (key) h["X-Astraura-Key"] = key;
  return h;
}

async function forward(method: "GET" | "POST" | "DELETE", path: string, search: string, body?: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), method === "POST" ? CHAT_TIMEOUT_MS : GET_TIMEOUT_MS);
  try {
    const res = await fetch(`${upstreamBase()}${path}${search}`, {
      method,
      headers: upstreamHeaders(body ? { "Content-Type": "application/json" } : undefined),
      body,
      signal: ctrl.signal,
    });
    const ctype = res.headers.get("content-type") || "application/json";
    const headers: Record<string, string> = {
      "Content-Type": ctype,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    };
    // Reenvío del cuerpo TAL CUAL (SSE incluido). El timer se limpia al cerrar.
    const stream = res.body
      ? new ReadableStream({
          async start(controller) {
            const reader = res.body!.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            } catch (e) {
              controller.error(e);
              return;
            } finally {
              clearTimeout(t);
            }
            controller.close();
          },
          cancel() {
            clearTimeout(t);
            ctrl.abort();
          },
        })
      : null;
    if (!stream) clearTimeout(t);
    return new Response(stream, { status: res.status, headers });
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    const cold = /abort/i.test(msg);
    return Response.json(
      {
        error: cold
          ? "La nube de Astraura 1.58-bit no respondió a tiempo (¿arrancando en frío?)."
          : `No se pudo contactar la nube de Astraura 1.58-bit: ${msg.slice(0, 160)}`,
      },
      { status: 503 },
    );
  }
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const rl = rateLimit(`ai-astraura158-get:${auth.userId}`, 120, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json({ error: "Demasiadas solicitudes." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const { path } = await ctx.params;
  const p = joinPath(path);
  if (!allowed(p, GET_ALLOW)) return Response.json({ error: "Ruta no permitida por el proxy de Astraura 1.58." }, { status: 403 });
  return forward("GET", p, req.nextUrl.search);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const rl = rateLimit(`ai-astraura158-post:${auth.userId}`, 60, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json({ error: "Demasiadas solicitudes. Inténtalo más tarde." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const { path } = await ctx.params;
  const p = joinPath(path);
  if (!allowed(p, POST_ALLOW)) return Response.json({ error: "Ruta no permitida por el proxy de Astraura 1.58." }, { status: 403 });
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Cuerpo demasiado grande." }, { status: 413 });
  if (raw) {
    try { JSON.parse(raw); } catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  }
  return forward("POST", p, "", raw || "{}");
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const rl = rateLimit(`ai-astraura158-post:${auth.userId}`, 60, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json({ error: "Demasiadas solicitudes. Inténtalo más tarde." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const { path } = await ctx.params;
  const p = joinPath(path);
  if (!allowed(p, DELETE_ALLOW)) return Response.json({ error: "Ruta no permitida por el proxy de Astraura 1.58." }, { status: 403 });
  return forward("DELETE", p, "");
}
