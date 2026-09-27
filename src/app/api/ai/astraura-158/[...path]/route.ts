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
// (Ola 228 · N1) El upstream ya no es fijo de una sola máquina: se resuelve
// por orden (env → túnel/publicado) con sonda de salud y caché de 60 s.
import { destinoNube, invalidarDestino } from "@/lib/astraura/destino-nube";
// (Ola 278 · OS4) Detección de despliegue local (igual que /api/voz/*) y de
// destino de neurona local para la puerta de sesión sin cookie en localhost.
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import { destinoEsLocal } from "@/lib/astraura/destino-local";
// (Ola 278 · OS6) Decisión PURA y exportada del destino del proxy: en un
// despliegue local sin nube sana, cae a la neurona local (`local-respaldo`) en
// vez de responder 503. Ver `elegir-destino.ts`.
import { debeRechazarLocalNoDisponible, elegirDestino, type DestinoElegido } from "@/lib/astraura/elegir-destino";
import { destinoParaPeticion } from "@/lib/astraura/donde-razona-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * (2026-09-25, MEDIDO) Sin nube de Google, la web y la app hablan con la Astraura de la Mac
 * por su túnel: el plan y las trazas llegan al instante, pero el primer token tarda 60–110 s
 * (prefill de ~700 tokens a 8–16 tok/s en 8 GB). Con el corte de 110 s, la respuesta de la
 * web se cortaba justo antes de hablar. 300 s es el tope de Vercel con Fluid compute.
 */
export const maxDuration = 300;

const MAX_BODY_BYTES = 256 * 1024;
const GET_TIMEOUT_MS = 12_000;
const CHAT_TIMEOUT_MS = 280_000;

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
  /^\/api\/needle\/status$/,
  // (Ola 278 · OS5) Latido ligero de la neurona y estado del BitNet: lecturas
  // sin datos sensibles, necesarias para el puente local.
  /^\/api\/ping$/,
  /^\/api\/bitnet\/estado$/,
  // (G10 · 2026-09-26) Cola/admisión del backend: cuántos activos, en cola,
  // espera estimada y si admite más — el router y la UI la leen para saber si
  // «ocupada» va a durar y elegir otro medio en vez de esperar a ciegas.
  /^\/api\/cola$/,
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
  /^\/api\/cerebros\/auto_detect$/,
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
  /^\/api\/cerebros\/auto_link$/,
  /^\/api\/chat$/,
  /^\/api\/chat\/stream$/,
  /^\/api\/starseed\/chat$/,
  /^\/api\/memory\/mem0\/search$/,
  /^\/api\/personalities\/activate$/,
  /^\/api\/skills\/toggle$/,
  /^\/api\/cerebros\/activate$/,
  /^\/api\/ecosystem\/agents\/[\w.-]+\/toggle$/,
  /^\/api\/browser\/search$/,
  // (G8 · 2026-09-26) Needle 3 y Jev desde CUALQUIER dispositivo: antes solo
  // corrían si el navegador hablaba DIRECTO con la neurona (127.0.0.1); por el
  // proxy caían en el 403 de «ruta no permitida». Bucket de cupo propio, ver
  // el POST de abajo (`ai-astraura158-decidir`).
  /^\/api\/needle\/decidir$/,
  /^\/api\/jev\/decidir$/,
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

/**
 * Destino resuelto del proxy (Ola 278 · OS6): la nube (`nube`), la neurona local
 * de la propia máquina por elección (`local`) o por respaldo sin nube
 * (`local-respaldo`). `DestinoElegido` lo define `elegir-destino.ts`.
 */
type DestinoProxy = DestinoElegido;

/**
 * (Ola 278 · OS5) De dónde quiere la respuesta el cliente: «local» si el
 * parámetro de consulta `destino` o la cabecera `X-Starseed-Destino` valen
 * `local`, y «nube» en cualquier otro caso. El cliente marca la llamada así
 * cuando usa el puente para llegar a la neurona local de la propia máquina.
 */
function destinoPedido(req: Request): "local" | "nube" {
  const query = new URL(req.url).searchParams.get("destino") ?? "";
  const cabecera = req.headers.get("x-starseed-destino") ?? "";
  if (query.trim().toLowerCase() === "local" || cabecera.trim().toLowerCase() === "local") return "local";
  return "nube";
}

/**
 * (Ola 278 · OS5) Quita el parámetro `destino` del search: es una orden para
 * el PROXY (elegir origen), no algo que deba reenviarse al backend.
 */
function buscarSinDestino(u: URL): string {
  const params = new URLSearchParams(u.search);
  params.delete("destino");
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * (Ola 278 · OS5/OS6) Resuelve el destino del proxy con `elegirDestino`, en el
 * orden (a) pedido local + despliegue local → neurona; (b) nube sana → nube;
 * (c) sin nube pero despliegue local → respaldo a la neurona local; (d) si no,
 * null. Solo sondea la nube cuando hace falta: si el cliente pide la neurona
 * local y estamos en la propia máquina, se va directo a la local sin sondear.
 */
async function resolverDestino(
  req: NextRequest,
): Promise<{ proxy: DestinoProxy | null; motivo: string; localNoDisponible?: boolean }> {
  const query = new URL(req.url).searchParams.get("destino") ?? "";
  const cabecera = req.headers.get("x-starseed-destino") ?? "";
  const reqDestino = query.trim() || cabecera.trim() || null;

  const decServidor = await destinoParaPeticion({ destinoPedido: reqDestino });
  const pedido = decServidor.destino;
  const local = esDespliegueLocal(req);
  // (G1 · 2026-09-26) Piden EXPRESAMENTE la neurona local y este despliegue NO
  // es la propia máquina (p.ej. Vercel): no hay «local» honesto que servir
  // aquí. Antes se sondeaba la nube igualmente y `elegirDestino` la devolvía
  // como si fuera la respuesta a "local" — la etiqueta mentía. Se corta ANTES
  // de sondear (ahorra esa sonda) y el cliente decide con la verdad: su propia
  // Astraura local si la tiene (llamada directa, sin pasar por este proxy) o
  // cualquier otra fuente del router — nunca la nube disfrazada de local.
  if (debeRechazarLocalNoDisponible(pedido, local)) {
    return { proxy: null, motivo: "local-no-disponible", localNoDisponible: true };
  }
  const baseNube = pedido === "local" && local ? null : ((await destinoNube())?.base ?? null);
  const baseLocal = String(process.env.ASTRAURA_LOCAL_URL ?? "").trim().replace(/\/+$/, "") || "http://127.0.0.1:8000";
  const proxy = elegirDestino({ pedido, local, baseNube, baseLocal });
  return { proxy, motivo: decServidor.motivo };
}

/** (G1) Piden la neurona local en un despliegue que no lo es: 421, nunca 503 —
 *  el cliente no debe reintentar esta MISMA ruta pidiendo lo mismo. */
function localNoDisponible(): Response {
  return Response.json({ error: "local-no-disponible" }, { status: 421 });
}

/** Sin destino sano: respuesta clara y NUNCA cuelga (el router cliente releva solo). */
function sinDestino(motivo?: string): Response {
  return Response.json(
    {
      error: "astraura-nube-no-disponible",
      sugerencia: "usa una fuente libre o tu Astraura local",
      ...(motivo ? { motivo } : {}),
    },
    { status: 503 },
  );
}

function joinPath(segments: string[] | undefined): string {
  const p = "/" + (segments ?? []).map((s) => encodeURIComponent(decodeURIComponent(s))).join("/");
  // Normaliza `..`, dobles barras y demás (la allowlist trabaja sobre la ruta limpia).
  return p.replace(/\/{2,}/g, "/").replace(/\/\.\.?(?=\/|$)/g, "");
}

function allowed(path: string, list: RegExp[]): boolean {
  return list.some((rx) => rx.test(path));
}

/**
 * Puerta de sesión del proxy.
 *
 * `modoLocal` (Ola 278 · OS4) abre la puerta cuando el despliegue es local Y el
 * destino resuelto es la neurona local: el navegador bloquea `127.0.0.1` desde
 * la página (contenido mixto), así que el único camino a la neurona es el
 * servidor del propio OS, que ya corre EN esa neurona — exigir ahí una cookie
 * de producción no protege nada (la fuente local es de por sí accesible) y solo
 * rompe el chat local. Devuelve un identificador sintético `"local"` para que
 * el rate-limit siga funcionando por clave `ai-astraura158-*:local`.
 */
async function requireUser(modoLocal: boolean): Promise<{ userId: string } | Response> {
  if (modoLocal) return { userId: "local" };
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

async function forward(method: "GET" | "POST" | "DELETE", path: string, search: string, body: string | undefined, destino: DestinoProxy): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), method === "POST" ? CHAT_TIMEOUT_MS : GET_TIMEOUT_MS);
  try {
    const res = await fetch(`${destino.base}${path}${search}`, {
      method,
      headers: upstreamHeaders(body ? { "Content-Type": "application/json" } : undefined),
      body,
      signal: ctrl.signal,
    });
    // (G2/G10 · 2026-09-26) La nube respondió MAL (502/503/504) fuera del
    // contrato de «ocupada»: puede ser el túnel muerto o el backend caído de
    // verdad, no una cola que se vacía sola. Invalidamos la caché de
    // `destinoNube()` para que el PRÓXIMO turno vuelva a sondear en vez de
    // reusar 10-60 s más un destino que ya sabemos roto. Cuando SÍ es
    // `{ocupado:true}` (cola/RAM) el destino sigue sano — no se invalida, solo
    // se deja pasar el 503/429 con su `Retry-After` para que el router enfríe
    // y pruebe otro medio.
    if (destino.via === "nube" && (res.status === 502 || res.status === 503 || res.status === 504)) {
      const ctypeSonda = res.headers.get("content-type") || "";
      let ocupado = false;
      if (ctypeSonda.includes("application/json")) {
        try {
          const cuerpo = (await res.clone().json()) as { ocupado?: unknown };
          ocupado = cuerpo?.ocupado === true;
        } catch { /* cuerpo no era JSON (o ya es un stream SSE de verdad) */ }
      }
      if (!ocupado) {
        try { invalidarDestino(); } catch { /* defensivo */ }
      }
    }
    const ctype = res.headers.get("content-type") || "application/json";
    const headers: Record<string, string> = {
      "Content-Type": ctype,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      // (G6) Vía REAL que sirvió este turno: la UI y el router dejan de fiarse
      // de qué fuente CREÍAN haber llamado y leen la verdad del proxy.
      "X-Astraura-Via": destino.via,
      "Access-Control-Expose-Headers": "X-Astraura-Via, X-Astraura-Cola, Retry-After",
    };
    // (G10) Cola/reintento del backend: se reenvían TAL CUAL si el backend las
    // trajo (el contrato de «ocupado» las pone en la respuesta original, JSON
    // o no) — el router y la UI las leen para saltar de medio sin adivinar.
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) headers["Retry-After"] = retryAfter;
    const cola = res.headers.get("x-astraura-cola");
    if (cola) headers["X-Astraura-Cola"] = cola;
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
    // (G2) Ni siquiera pudimos CONTACTAR el destino (túnel caído, DNS, red):
    // esto nunca es una cola que se vacía sola. Invalida ya la caché de
    // `destinoNube()` para que el próximo turno vuelva a sondear.
    if (destino.via === "nube") {
      try { invalidarDestino(); } catch { /* defensivo */ }
    }
    return Response.json(
      {
        error: cold
          ? "La nube de Astraura 1.58-bit no respondió a tiempo (¿arrancando en frío?)."
          : `No se pudo contactar la nube de Astraura 1.58-bit: ${msg.slice(0, 160)}`,
      },
      { status: 503, headers: { "X-Astraura-Via": destino.via, "Access-Control-Expose-Headers": "X-Astraura-Via" } },
    );
  }
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  // (Ola 278 · OS4/OS5) Destino resuelto aquí para saber si es la neurona local
  // antes de decidir si se exige sesión; se reutiliza en `forward`.
  const { proxy: destino, motivo, localNoDisponible: sinLocal } = await resolverDestino(req);
  if (!destino) return sinLocal ? localNoDisponible() : sinDestino(motivo);
  const auth = await requireUser(esDespliegueLocal(req) && destinoEsLocal(destino.base));
  if (auth instanceof Response) return auth;
  const { path } = await ctx.params;
  const p = joinPath(path);
  // (2026-09-27) Medido en producción: con la tablet, la Mac y dos pestañas de la misma
  // cuenta, las sondas de salud (ping/cola/estado, cada una casi gratis) agotaban el cupo
  // de 120 GET y la nube salía «sin señal» con 429 aunque el túnel respondía. Las sondas
  // van en su propio cubo, amplio; el resto de lecturas (Studio) sube a 360 por 10 min.
  const esSonda = /^\/api\/(ping|cola|status|bitnet\/estado)$/.test(p);
  const rl = esSonda
    ? rateLimit(`ai-astraura158-sonda:${auth.userId}`, 900, 10 * 60 * 1000)
    : rateLimit(`ai-astraura158-get:${auth.userId}`, 360, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json({ error: "Demasiadas solicitudes." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  if (!allowed(p, GET_ALLOW)) return Response.json({ error: "Ruta no permitida por el proxy de Astraura 1.58." }, { status: 403 });
  return forward("GET", p, buscarSinDestino(req.nextUrl), undefined, destino);
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { proxy: destino, motivo, localNoDisponible: sinLocal } = await resolverDestino(req);
  if (!destino) return sinLocal ? localNoDisponible() : sinDestino(motivo);
  const auth = await requireUser(esDespliegueLocal(req) && destinoEsLocal(destino.base));
  if (auth instanceof Response) return auth;
  const { path } = await ctx.params;
  const p = joinPath(path);
  // (G5/G8 · 2026-09-26) Needle y Jev tienen su PROPIO cupo, separado del chat:
  // antes compartían el bucket general de POST y una ráfaga de decisiones de UI
  // (needle sondeando intención, jev arbitrando) podía dejar sin cupo al chat
  // de verdad. La ruta ya se resolvió arriba, así que el bucket se elige ANTES
  // del límite (no después, como antes).
  const esDecidir = /^\/api\/(needle|jev)\/decidir$/.test(p);
  const rl = esDecidir
    ? rateLimit(`ai-astraura158-decidir:${auth.userId}`, 60, 10 * 60 * 1000)
    : rateLimit(`ai-astraura158-post:${auth.userId}`, 60, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json({ error: "Demasiadas solicitudes. Inténtalo más tarde." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  if (!allowed(p, POST_ALLOW)) return Response.json({ error: "Ruta no permitida por el proxy de Astraura 1.58." }, { status: 403 });
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "Cuerpo demasiado grande." }, { status: 413 });
  if (raw) {
    try { JSON.parse(raw); } catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  }
  return forward("POST", p, "", raw || "{}", destino);
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const { proxy: destino, motivo, localNoDisponible: sinLocal } = await resolverDestino(_req);
  if (!destino) return sinLocal ? localNoDisponible() : sinDestino(motivo);
  const auth = await requireUser(esDespliegueLocal(_req) && destinoEsLocal(destino.base));
  if (auth instanceof Response) return auth;
  const rl = rateLimit(`ai-astraura158-post:${auth.userId}`, 60, 10 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json({ error: "Demasiadas solicitudes. Inténtalo más tarde." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const { path } = await ctx.params;
  const p = joinPath(path);
  if (!allowed(p, DELETE_ALLOW)) return Response.json({ error: "Ruta no permitida por el proxy de Astraura 1.58." }, { status: 403 });
  return forward("DELETE", p, "", undefined, destino);
}
