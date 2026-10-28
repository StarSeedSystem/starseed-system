/**
 * Cliente puro del Agent Server de OpenHands (OHS1020A): solo rutas y campos
 * verificados en docs/referencias/openhands-agent-server-1.7.1-openapi.json.
 * `fetch` y tope de tiempo inyectados, sin seguir redirecciones (`redirect: "manual"`).
 * La clave del modelo la pasa quien llama y se tapa en cualquier error.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export const TIEMPO_MS = 20_000;
export type PoliticaConfirmacion = "AlwaysConfirm" | "ConfirmRisky" | "NeverConfirm";
export type FalloOpenHands = "red" | "tiempo" | "http" | "respuesta";
export interface OpcionesOpenHands { baseUrl: string; fetch?: FetchLike; tiempoMs?: number }
export interface HerramientaOpenHands { nombre: string; parametros?: Record<string, unknown> }
export interface CfgConversacion extends OpcionesOpenHands {
  modelo: string; apiKey?: string; baseUrlModelo?: string; herramientas?: HerramientaOpenHands[];
  directorioTrabajo: string; mensajeInicial?: string; politica?: PoliticaConfirmacion;
}
export interface ConversacionCreada { id: string; execution_status?: string; title?: string | null; [clave: string]: unknown }
export interface EventoOpenHands { kind?: string; id?: string; timestamp?: string; [clave: string]: unknown }
export interface PaginaEventos { items: EventoOpenHands[]; next_page_id?: string | null }
export interface RespuestaOk { ok: boolean }
/** Error con su motivo humano. Nunca lleva la clave del modelo dentro. */
export class ErrorOpenHands extends Error {
  constructor(public readonly fallo: FalloOpenHands, mensaje: string, public readonly estado?: number) {
    super(mensaje);
    this.name = "ErrorOpenHands";
  }
}
function rutaConv(id: string): string { return `/api/conversations/${encodeURIComponent(id)}`; }
function tapar(texto: string, secreto?: string): string {
  const t = secreto ? texto.split(secreto).join("•••") : texto;
  return t.replace(/("api_key"\s*:\s*")[^"]*(")/g, "$1•••$2");
}
function cuerpoJson(cuerpo: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(cuerpo) };
}
/** Petición con tope de tiempo, sin redirecciones y con errores tipados. */
async function pedir<T>(op: OpcionesOpenHands, ruta: string, init: RequestInit, secreto?: string): Promise<T> {
  const f = op.fetch ?? ((url: string, opciones?: RequestInit) => fetch(url, opciones));
  const tiempoMs = op.tiempoMs ?? TIEMPO_MS;
  const control = new AbortController();
  let vencer: (e: ErrorOpenHands) => void = () => undefined;
  const reloj = new Promise<never>((_, rechazar) => { vencer = rechazar; });
  const plazo = setTimeout(() => {
    control.abort();
    vencer(new ErrorOpenHands("tiempo", `El Agent Server no respondió en ${tiempoMs / 1000} s.`));
  }, tiempoMs);
  try {
    const url = `${op.baseUrl.trim().replace(/\/+$/, "")}${ruta}`;
    const r = await Promise.race([f(url, { ...init, redirect: "manual", signal: control.signal }), reloj]);
    if (r.status >= 300 && r.status < 400) {
      throw new ErrorOpenHands("http", `El Agent Server intentó redirigir (HTTP ${r.status}); no se siguen redirecciones.`, r.status);
    }
    const texto = await Promise.race([r.text(), reloj]);
    if (!r.ok) {
      const detalle = tapar(texto.slice(0, 200), secreto);
      throw new ErrorOpenHands("http", `El Agent Server respondió ${r.status}${detalle ? `: ${detalle}` : ""}.`, r.status);
    }
    if (!texto) return undefined as T;
    try { return JSON.parse(texto) as T; } catch {
      throw new ErrorOpenHands("respuesta", "El Agent Server devolvió algo que no es JSON.");
    }
  } catch (e) {
    if (e instanceof ErrorOpenHands) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new ErrorOpenHands("tiempo", `El Agent Server no respondió en ${tiempoMs / 1000} s.`);
    }
    throw new ErrorOpenHands("red", "No se pudo llegar al Agent Server: sin conexión o la red lo bloquea.");
  } finally {
    clearTimeout(plazo);
  }
}
/** GET /health. La respuesta real del Agent Server es un texto de estado. */
export async function salud(op: OpcionesOpenHands): Promise<{ sano: boolean; estado: string }> {
  const estado = await pedir<unknown>(op, "/health", { method: "GET", headers: { accept: "application/json" } });
  return { sano: true, estado: typeof estado === "string" ? estado : "ok" };
}

/** POST /api/conversations con el esquema StartConversationRequest. */
export async function crearConversacion(cfg: CfgConversacion): Promise<ConversacionCreada> {
  const llm: Record<string, unknown> = { model: cfg.modelo };
  if (cfg.apiKey) llm.api_key = cfg.apiKey;
  if (cfg.baseUrlModelo) llm.base_url = cfg.baseUrlModelo;
  const agente: Record<string, unknown> = { kind: "Agent", llm };
  if (cfg.herramientas?.length) {
    agente.tools = cfg.herramientas.map((h) => ({ name: h.nombre, ...(h.parametros ? { params: h.parametros } : {}) }));
  }
  const cuerpo: Record<string, unknown> = {
    agent: agente,
    workspace: { kind: "LocalWorkspace", working_dir: cfg.directorioTrabajo },
    confirmation_policy: { kind: cfg.politica ?? "AlwaysConfirm" },
  };
  if (cfg.mensajeInicial) cuerpo.initial_message = { role: "user", content: [{ type: "text", text: cfg.mensajeInicial }] };
  return pedir<ConversacionCreada>(cfg, "/api/conversations", cuerpoJson(cuerpo), cfg.apiKey);
}

/** POST …/events con el esquema SendMessageRequest. */
export async function enviarMensaje(id: string, texto: string, op: OpcionesOpenHands): Promise<RespuestaOk> {
  const r = await pedir<{ success?: boolean }>(op, `${rutaConv(id)}/events`, cuerpoJson({ role: "user", content: [{ type: "text", text: texto }] }));
  return { ok: r?.success !== false };
}
async function sinCuerpo(id: string, sufijo: string, op: OpcionesOpenHands): Promise<RespuestaOk> {
  const r = await pedir<{ success?: boolean }>(op, `${rutaConv(id)}${sufijo}`, { method: "POST" });
  return { ok: r?.success !== false };
}
/** POST …/run: arranca la conversación en segundo plano. */
export async function ejecutar(id: string, op: OpcionesOpenHands): Promise<RespuestaOk> { return sinCuerpo(id, "/run", op); }
/** POST …/pause: la deja pausada para reanudarla después. */
export async function pausar(id: string, op: OpcionesOpenHands): Promise<RespuestaOk> { return sinCuerpo(id, "/pause", op); }

/** GET …/events/search. `desde` es el `next_page_id` de la página anterior. */
export async function eventos(id: string, op: OpcionesOpenHands, desde?: string | null): Promise<PaginaEventos> {
  const cola = desde ? `?${new URLSearchParams({ page_id: desde })}` : "";
  return pedir<PaginaEventos>(op, `${rutaConv(id)}/events/search${cola}`, { method: "GET", headers: { accept: "application/json" } });
}

/** POST …/confirmation_policy con SetConfirmationPolicyRequest. */
export async function politicaConfirmacion(id: string, politica: PoliticaConfirmacion, op: OpcionesOpenHands): Promise<RespuestaOk> {
  const r = await pedir<{ success?: boolean }>(op, `${rutaConv(id)}/confirmation_policy`, cuerpoJson({ policy: { kind: politica } }));
  return { ok: r?.success !== false };
}
