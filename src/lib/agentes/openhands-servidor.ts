/**
 * OpenHands Agent Server · cliente puro (OHS1020A, Ola 1020U).
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ: habla con el Agent Server de OpenHands (REST) con `fetch` INYECTADO,
 * `redirect: "manual"` y tope de tiempo. Rutas y campos tomados de la
 * descripción real 1.7.1 que vive en
 * `docs/referencias/openhands-agent-server-1.7.1-openapi.json`:
 *   GET  /health
 *   POST /api/conversations
 *   POST /api/conversations/{id}/events
 *   POST /api/conversations/{id}/run
 *   POST /api/conversations/{id}/pause
 *   GET  /api/conversations/{id}/events/search
 *   POST /api/conversations/{id}/confirmation_policy
 *
 * La clave del modelo la pasa quien llama y NUNCA aparece en un error: los
 * motivos se recortan y se tapan los secretos conocidos. Módulo PURO (sin
 * `node:*`): lo puede importar el cliente. Pruebas: `__tests__/openhands-servidor.test.ts`.
 */

export type FetchOpenHands = typeof fetch;

export type FalloOpenHands = "configuracion" | "red" | "tiempo" | "http" | "json";

export type ResultadoOpenHands<T> =
  | { ok: true; estado: number; datos: T }
  | { ok: false; fallo: FalloOpenHands; motivo: string; estado?: number };

/** Política de confirmación del Agent Server. `AlwaysConfirm` pide permiso antes de actuar. */
export type PoliticaConfirmacion =
  | { kind: "AlwaysConfirm" }
  | { kind: "NeverConfirm" }
  | { kind: "ConfirmRisky"; threshold?: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH"; confirm_unknown?: boolean };

export interface LlmOpenHands {
  model: string;
  apiKey: string;
  baseUrl?: string;
  usageId?: string;
  temperature?: number;
}

export interface ConfiguracionConversacion {
  llm: LlmOpenHands;
  workingDir: string;
  tools?: string[];
  maxIterations?: number;
  mensajeInicial?: string;
  /** Por defecto `AlwaysConfirm`: los agentes no actúan sin aprobación. */
  politica?: PoliticaConfirmacion;
}

export interface ConversacionOpenHands {
  id: string;
  title?: string | null;
  execution_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EventoOpenHands {
  id?: string;
  kind?: string;
  source?: string;
  timestamp?: string;
  [campo: string]: unknown;
}

export interface PaginaEventos {
  items: EventoOpenHands[];
  next_page_id?: string | null;
}

export interface OpcionesOpenHands {
  /** Origen del Agent Server, p. ej. `http://127.0.0.1:8010`. */
  baseUrl: string;
  fetch: FetchOpenHands;
  /** Tope de tiempo por petición; 30 s por defecto. */
  tiempoMs?: number;
  /** Token del Agent Server, si la instancia lo exige. No es la clave del modelo. */
  token?: string;
}

export interface ClienteOpenHands {
  salud(): Promise<ResultadoOpenHands<string>>;
  crearConversacion(cfg: ConfiguracionConversacion): Promise<ResultadoOpenHands<ConversacionOpenHands>>;
  enviarMensaje(id: string, texto: string): Promise<ResultadoOpenHands<{ success?: boolean }>>;
  ejecutar(id: string): Promise<ResultadoOpenHands<{ success?: boolean }>>;
  pausar(id: string): Promise<ResultadoOpenHands<{ success?: boolean }>>;
  eventos(id: string, desde?: string): Promise<ResultadoOpenHands<PaginaEventos>>;
  politicaConfirmacion(id: string, politica: PoliticaConfirmacion): Promise<ResultadoOpenHands<{ success?: boolean }>>;
}

export const TIEMPO_OPENHANDS_MS = 30_000;
export const POLITICA_POR_DEFECTO: PoliticaConfirmacion = { kind: "AlwaysConfirm" };

/** Origen válido (`http(s)://host[:puerto]`), sin ruta, credenciales, consulta ni hash. */
export function origenOpenHands(baseUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(baseUrl.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname || u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== "/" && u.pathname !== "") return null;
  return u.origin;
}

function tapar(texto: string, secretos: string[]): string {
  let t = texto;
  for (const s of secretos) if (s) t = t.split(s).join("•••");
  return t;
}

function recortar(texto: string): string {
  return texto.length > 200 ? `${texto.slice(0, 200)}…` : texto;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function esConversacion(v: unknown): v is ConversacionOpenHands {
  return esObjeto(v) && typeof v.id === "string" && v.id.length > 0;
}

function esPaginaEventos(v: unknown): v is PaginaEventos {
  return esObjeto(v) && Array.isArray(v.items);
}

export function crearClienteOpenHands(opciones: OpcionesOpenHands): ClienteOpenHands {
  const base = origenOpenHands(opciones.baseUrl);
  const tiempo = opciones.tiempoMs ?? TIEMPO_OPENHANDS_MS;
  const token = opciones.token?.trim() || "";

  type Metodo = "GET" | "POST";

  async function pedir(
    ruta: string,
    metodo: Metodo,
    cuerpo: unknown,
    secretos: string[],
    crudo = false,
  ): Promise<ResultadoOpenHands<unknown>> {
    if (!base) {
      return {
        ok: false,
        fallo: "configuracion",
        motivo: "La URL del Agent Server debe ser http(s), sin ruta, credenciales, consulta ni hash.",
      };
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    let texto: string | undefined;
    if (cuerpo !== undefined) {
      headers["content-type"] = "application/json";
      try {
        texto = JSON.stringify(cuerpo);
      } catch {
        return { ok: false, fallo: "configuracion", motivo: "El cuerpo de la petición no se puede convertir a JSON." };
      }
    }
    const todos = [token, ...secretos].filter(Boolean);
    const ctl = new AbortController();
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const plazo = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => {
        ctl.abort();
        rechazar(new Error("tiempo"));
      }, tiempo);
    });
    try {
      const r = await Promise.race([
        opciones.fetch(`${base}${ruta}`, {
          method: metodo,
          headers,
          body: texto,
          signal: ctl.signal,
          redirect: "manual",
        }),
        plazo,
      ]);
      const leido = await Promise.race([r.text(), plazo]);
      if (!r.ok) {
        return {
          ok: false,
          fallo: "http",
          estado: r.status,
          motivo: `El Agent Server respondió ${r.status}: ${recortar(tapar(leido, todos))}`,
        };
      }
      if (crudo) return { ok: true, estado: r.status, datos: leido };
      if (!leido.trim()) return { ok: true, estado: r.status, datos: null };
      try {
        return { ok: true, estado: r.status, datos: JSON.parse(leido) as unknown };
      } catch {
        return { ok: false, fallo: "json", motivo: "La respuesta del Agent Server no es JSON válido." };
      }
    } catch {
      if (ctl.signal.aborted) {
        return { ok: false, fallo: "tiempo", motivo: `El Agent Server no respondió en ${Math.round(tiempo / 1000)} s.` };
      }
      return { ok: false, fallo: "red", motivo: "No se pudo hablar con el Agent Server." };
    } finally {
      if (temporizador !== undefined) clearTimeout(temporizador);
    }
  }

  type Exito = { success?: boolean };
  const config = (motivo: string): ResultadoOpenHands<never> => ({ ok: false, fallo: "configuracion", motivo });
  const rutaDe = (id: string, sufijo: string): string | null => {
    const limpio = id.trim();
    return limpio ? `/api/conversations/${encodeURIComponent(limpio)}${sufijo}` : null;
  };
  const comoExito = (r: ResultadoOpenHands<unknown>): ResultadoOpenHands<Exito> => {
    if (!r.ok) return r;
    const datos = esObjeto(r.datos) && typeof r.datos.success === "boolean"
      ? { success: r.datos.success }
      : { success: true };
    return { ok: true, estado: r.estado, datos };
  };

  return {
    async salud() {
      const r = await pedir("/health", "GET", undefined, [], true);
      if (!r.ok) return r;
      return { ok: true, estado: r.estado, datos: String(r.datos ?? "") };
    },

    async crearConversacion(cfg) {
      const modelo = cfg.llm.model?.trim();
      const clave = cfg.llm.apiKey?.trim();
      const directorio = cfg.workingDir?.trim();
      if (!modelo || !clave || !directorio) {
        return config("Hacen falta el modelo, su clave y el directorio de trabajo de la conversación.");
      }
      const llm: Record<string, unknown> = { model: modelo, api_key: cfg.llm.apiKey };
      if (cfg.llm.baseUrl) llm.base_url = cfg.llm.baseUrl;
      if (cfg.llm.usageId) llm.usage_id = cfg.llm.usageId;
      if (cfg.llm.temperature !== undefined) llm.temperature = cfg.llm.temperature;
      const cuerpo: Record<string, unknown> = {
        agent: {
          kind: "Agent",
          llm,
          ...(cfg.tools?.length ? { tools: cfg.tools.map((name) => ({ name })) } : {}),
        },
        workspace: { kind: "LocalWorkspace", working_dir: directorio },
        confirmation_policy: cfg.politica ?? POLITICA_POR_DEFECTO,
      };
      if (cfg.maxIterations !== undefined) cuerpo.max_iterations = cfg.maxIterations;
      if (cfg.mensajeInicial) {
        cuerpo.initial_message = {
          role: "user",
          content: [{ type: "text", text: cfg.mensajeInicial }],
          run: false,
        };
      }
      const r = await pedir("/api/conversations", "POST", cuerpo, [cfg.llm.apiKey]);
      if (!r.ok) return r;
      if (!esConversacion(r.datos)) {
        return { ok: false, fallo: "json", motivo: "El Agent Server no devolvió una conversación con id." };
      }
      return { ok: true, estado: r.estado, datos: r.datos };
    },

    async enviarMensaje(id, texto) {
      const ruta = rutaDe(id, "/events");
      if (!ruta) return config("Hace falta el id de la conversación.");
      const limpio = texto?.trim();
      if (!limpio) return config("El mensaje no puede estar vacío.");
      const r = await pedir(ruta, "POST", {
        role: "user",
        content: [{ type: "text", text: texto }],
        run: false,
      }, []);
      return comoExito(r);
    },

    async ejecutar(id) {
      const ruta = rutaDe(id, "/run");
      if (!ruta) return config("Hace falta el id de la conversación.");
      return comoExito(await pedir(ruta, "POST", undefined, []));
    },

    async pausar(id) {
      const ruta = rutaDe(id, "/pause");
      if (!ruta) return config("Hace falta el id de la conversación.");
      return comoExito(await pedir(ruta, "POST", undefined, []));
    },

    async eventos(id, desde) {
      const ruta = rutaDe(id, "/events/search");
      if (!ruta) return config("Hace falta el id de la conversación.");
      const pagina = desde?.trim();
      const r = await pedir(pagina ? `${ruta}?page_id=${encodeURIComponent(pagina)}` : ruta, "GET", undefined, []);
      if (!r.ok) return r;
      if (!esPaginaEventos(r.datos)) {
        return { ok: false, fallo: "json", motivo: "El Agent Server no devolvió una página de eventos válida." };
      }
      return { ok: true, estado: r.estado, datos: r.datos };
    },

    async politicaConfirmacion(id, politica) {
      const ruta = rutaDe(id, "/confirmation_policy");
      if (!ruta) return config("Hace falta el id de la conversación.");
      if (!politica || typeof politica.kind !== "string") {
        return config("La política de confirmación no es válida.");
      }
      return comoExito(await pedir(ruta, "POST", { policy: politica }, []));
    },
  };
}
