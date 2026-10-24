// Cliente puro del Agent Server de OpenHands (OHS1020A). Rutas y campos de la API REAL
// 1.7.1 del A1 (docs/referencias/openhands-agent-server-1.7.1-openapi.json). Sin `node:*`
// ni Supabase: la red entra por `fetch`. La clave del modelo la pasa quien llama y nunca se repite en un error.
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type PoliticaConfirmacion = "AlwaysConfirm" | "ConfirmRisky" | "NeverConfirm";
/** `timeoutMs` es el tope de tiempo por petición, en milisegundos. */
export interface ConfigOpenHands { baseUrl: string; fetch?: FetchLike; timeoutMs?: number }
/** Herramienta del agente, con la forma de `Tool-Input` del esquema. */
export interface HerramientaAgente { name: string; params?: Record<string, unknown> }
export interface ConfigConversacion {
  modelo: string;
  /** Clave del modelo: viaja a `agent.llm.api_key` y no se registra. */
  apiKey: string;
  baseUrlModelo?: string;
  directorioTrabajo: string;
  herramientas?: HerramientaAgente[];
  mensajeInicial?: string;
  /** Por defecto `AlwaysConfirm`: el agente pide permiso antes de actuar. */
  politicaConfirmacion?: PoliticaConfirmacion;
}
export interface ConversacionOpenHands { id: string; agent?: unknown; workspace?: unknown; created_at?: string; updated_at?: string }
export interface EventoOpenHands { kind?: string; [clave: string]: unknown }
export interface PaginaEventos { items: EventoOpenHands[]; next_page_id?: string | null }
export class ErrorOpenHands extends Error {
  constructor(mensaje: string, public readonly status?: number, public readonly causa?: unknown) {
    super(mensaje);
    this.name = "ErrorOpenHands";
  }
}
const TOPE_POR_DEFECTO = 20_000;
async function pedir<T>(cfg: ConfigOpenHands, ruta: string, init: RequestInit = {}): Promise<T> {
  const enviar = cfg.fetch ?? fetch;
  const tope = cfg.timeoutMs ?? TOPE_POR_DEFECTO;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), tope);
  let res: Response;
  try {
    res = await enviar(`${cfg.baseUrl.replace(/\/+$/, "")}${ruta}`, {
      ...init,
      redirect: "manual",
      signal: control.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch (causa) {
    const motivo = control.signal.aborted
      ? `sin respuesta en ${tope} ms`
      : "no se pudo conectar con el Agent Server";
    throw new ErrorOpenHands(motivo, undefined, causa);
  } finally {
    clearTimeout(reloj);
  }
  if (!res.ok) {
    // No se lee el cuerpo: puede llevar la configuración del agente con su clave.
    throw new ErrorOpenHands(`el Agent Server respondió con estado ${res.status}`, res.status);
  }
  const texto = await res.text();
  if (!texto) return undefined as T;
  try { return JSON.parse(texto) as T; } catch { return texto as unknown as T; }
}

function rutaConversacion(id: string, sufijo: string): string {
  return `/api/conversations/${encodeURIComponent(id)}${sufijo}`;
}

export function salud(cfg: ConfigOpenHands): Promise<string> {
  return pedir<string>(cfg, "/health");
}

export function crearConversacion(cfg: ConfigOpenHands, conv: ConfigConversacion): Promise<ConversacionOpenHands> {
  const cuerpo = {
    agent: {
      kind: "Agent",
      llm: { model: conv.modelo, api_key: conv.apiKey, ...(conv.baseUrlModelo ? { base_url: conv.baseUrlModelo } : {}) },
      ...(conv.herramientas
        ? { tools: conv.herramientas.map((h) => ({ name: h.name, params: h.params ?? {} })) }
        : {}),
    },
    workspace: { kind: "LocalWorkspace", working_dir: conv.directorioTrabajo },
    confirmation_policy: { kind: conv.politicaConfirmacion ?? "AlwaysConfirm" },
    ...(conv.mensajeInicial
      ? { initial_message: { role: "user", content: [{ type: "text", text: conv.mensajeInicial }] } }
      : {}),
  };
  return pedir<ConversacionOpenHands>(cfg, "/api/conversations", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });
}

export function enviarMensaje(cfg: ConfigOpenHands, id: string, texto: string): Promise<EventoOpenHands> {
  return pedir<EventoOpenHands>(cfg, rutaConversacion(id, "/events"), {
    method: "POST",
    body: JSON.stringify({ role: "user", content: [{ type: "text", text: texto }], run: false }),
  });
}

export function ejecutar(cfg: ConfigOpenHands, id: string): Promise<{ success?: boolean }> {
  return pedir<{ success?: boolean }>(cfg, rutaConversacion(id, "/run"), { method: "POST" });
}

export function pausar(cfg: ConfigOpenHands, id: string): Promise<{ success?: boolean }> {
  return pedir<{ success?: boolean }>(cfg, rutaConversacion(id, "/pause"), { method: "POST" });
}

export function eventos(cfg: ConfigOpenHands, id: string, desde?: string): Promise<PaginaEventos> {
  const consulta = desde ? `?timestamp__gte=${encodeURIComponent(desde)}` : "";
  return pedir<PaginaEventos>(cfg, rutaConversacion(id, `/events/search${consulta}`));
}

export function politicaConfirmacion(
  cfg: ConfigOpenHands, id: string, politica: PoliticaConfirmacion,
): Promise<{ success?: boolean }> {
  return pedir<{ success?: boolean }>(cfg, rutaConversacion(id, "/confirmation_policy"), {
    method: "POST",
    body: JSON.stringify({ policy: { kind: politica } }),
  });
}
