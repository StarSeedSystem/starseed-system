/**
 * DeepTutor · conector opcional al servidor propio (Ola 1104 · RPO1104S).
 * Sin `node:*`: `fetchFn` entra inyectado. El token viaja solo en `Authorization`
 * y nunca aparece en un motivo de error. Cualquier fallo devuelve `null` o
 * `disponible: false` para que Astraura siga con la habilidad nativa.
 */

export interface RespuestaHttp { ok: boolean; status: number; text(): Promise<string>; }

type Peticion = { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };

export type FetchFn = (url: string, init: Peticion) => Promise<RespuestaHttp>;

export interface ConfigDeeptutor { url: string; token: string; agente: string; }

export type ModoTutor = "explicar" | "comprobar" | "practicar" | "resumir";

export interface PreguntaTutor { pregunta: string; modo: ModoTutor; }

export interface RespuestaTutor { texto: string; modo: ModoTutor; sesion: string | null; }

export type EstadoDeeptutor =
  | { disponible: true; url: string }
  | { disponible: false; motivo: string };

/** GET real de la API de DeepTutor 1.7 (docs.deeptutor.info/cli/server-api). */
const RUTA_ESTADO = "/api/system/status";
/**
 * El turno genérico de DeepTutor es el WebSocket `/ws`; con `fetch` inyectado
 * solo queda el chat HTTP documentado de un compañero (POST
 * `/api/partners/{partner_id}/chat`). Su id entra por `DEEPTUTOR_AGENTE`
 * (por defecto «tutor»). Si tu servidor usa otra ruta, cámbiala aquí.
 */
const RUTA_PREGUNTA = "/api/partners/{agente}/chat";
const PLAZO_MS = 8000;

const MODOS: Readonly<Record<string, ModoTutor>> = {
  explicar: "explicar", explicame: "explicar", explain: "explicar", chat: "explicar",
  charla: "explicar", conversar: "explicar", tutor: "explicar", resolver: "explicar",
  solve: "explicar", investigar: "explicar", research: "explicar", deep_solve: "explicar",
  deep_research: "explicar",
  comprobar: "comprobar", comprueba: "comprobar", check: "comprobar", quiz: "comprobar",
  cuestionario: "comprobar", test: "comprobar", preguntar: "comprobar", deep_question: "comprobar",
  practicar: "practicar", practica: "practicar", practice: "practicar", ejercicio: "practicar",
  resumir: "resumir", resume: "resumir", resumen: "resumir", summary: "resumir",
};

/** Normaliza el modo que llega de la integración a los cuatro del método de DeepTutor. */
export function normalizarModo(valor: unknown): ModoTutor {
  const clave = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  return MODOS[clave] ?? "explicar";
}

const INSTRUCCION: Record<ModoTutor, string> = {
  explicar: "Explica el concepto con claridad, en pasos y con un ejemplo.",
  comprobar: "Comprueba lo aprendido con una sola pregunta y espera la respuesta.",
  practicar: "Propón un ejercicio para practicar y da la pauta para resolverlo.",
  resumir: "Resume lo aprendido en tres ideas y termina con una comprobación.",
};

function limpiarUrl(valor: string | undefined): string {
  const url = (valor ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+/i.test(url) ? url : "";
}

function cabeceras(config: ConfigDeeptutor, conCuerpo = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (conCuerpo) headers["Content-Type"] = "application/json";
  return headers;
}

function motivoHttp(status: number): string {
  if (status === 401 || status === 403) return "DeepTutor rechazó el token (401/403).";
  if (status === 404) return "DeepTutor no encontró la ruta (404): revisa la URL base.";
  if (status === 429) return "DeepTutor limita las peticiones (429): reintenta más tarde.";
  return status >= 500 ? `El servidor de DeepTutor falló (${status}).` : `DeepTutor respondió con error HTTP ${status}.`;
}

async function pedirConPlazo(fetchFn: FetchFn, url: string, init: Peticion, plazoMs: number): Promise<RespuestaHttp | null> {
  const control = typeof AbortController !== "undefined" ? new AbortController() : null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => { control?.abort(); resolver(null); }, plazoMs);
  });
  try {
    const respuesta = await Promise.race([
      fetchFn(url, control ? { ...init, signal: control.signal } : init).catch(() => null),
      plazo,
    ]);
    return respuesta ?? null;
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}

export function configDeeptutor(env: Record<string, string | undefined>): ConfigDeeptutor | null {
  const url = limpiarUrl(env.DEEPTUTOR_URL);
  if (!url) return null;
  return { url, token: (env.DEEPTUTOR_TOKEN ?? "").trim(), agente: (env.DEEPTUTOR_AGENTE ?? "").trim() || "tutor" };
}

export async function estadoDeeptutor(config: ConfigDeeptutor | null, fetchFn: FetchFn): Promise<EstadoDeeptutor> {
  if (!config) return { disponible: false, motivo: "DeepTutor no está configurado." };
  const r = await pedirConPlazo(
    fetchFn, config.url + RUTA_ESTADO, { method: "GET", headers: cabeceras(config) }, PLAZO_MS,
  );
  if (!r) return { disponible: false, motivo: "DeepTutor no respondió a tiempo o no es accesible." };
  if (!r.ok) return { disponible: false, motivo: motivoHttp(r.status) };
  return { disponible: true, url: config.url };
}

export async function preguntarTutor(
  config: ConfigDeeptutor | null,
  fetchFn: FetchFn,
  pregunta: PreguntaTutor,
): Promise<RespuestaTutor | null> {
  if (!config) return null;
  const texto = pregunta.pregunta.trim();
  if (!texto) return null;
  const instruccion = INSTRUCCION[pregunta.modo];
  const ruta = RUTA_PREGUNTA.replace("{agente}", encodeURIComponent(config.agente));
  const r = await pedirConPlazo(
    fetchFn,
    config.url + ruta,
    { method: "POST", headers: cabeceras(config, true), body: JSON.stringify({ content: instruccion ? `${instruccion}\n\n${texto}` : texto }) },
    PLAZO_MS,
  );
  if (!r || !r.ok) return null;
  try {
    const datos = JSON.parse(await r.text()) as { content?: unknown; session_id?: unknown };
    if (typeof datos.content !== "string" || !datos.content.trim()) return null;
    return { texto: datos.content, modo: pregunta.modo, sesion: typeof datos.session_id === "string" ? datos.session_id : null };
  } catch {
    return null;
  }
}
