/**
 * DeepTutor · conector opcional de servidor propio (RPO1104S).
 * Módulo PURO: `fetchFn` entra inyectado y el token viaja SOLO en `Authorization`.
 * Ante 429/402, fallo de red o plazo agotado devuelve `null`: Astraura sigue con su habilidad nativa.
 */
import type { Pedir, RespuestaEtapi } from "./trilium";

export const PLAZO_MS = 20_000;
export const RUTA_ESTADO = "/api/system/status";
// La API canónica de turnos de DeepTutor v1.7 es el WebSocket `/ws`; el último POST
// HTTP documentado (issue #511) es este SSE. Si tu servidor usa otra ruta, cámbiala aquí.
export const RUTA_PREGUNTAR = "/api/v1/plugins/capabilities/chat/execute-stream";

export type FetchFn = Pedir;
export interface ConfigDeeptutor { url: string; token: string }
export interface PreguntaTutor { pregunta: string; modo: string }
export interface RespuestaTutor { texto: string; capacidad: string }
const CAPACIDADES: Readonly<Record<string, string>> = {
  chat: "chat", charla: "chat", conversar: "chat", explicar: "chat",
  resolver: "deep_solve", solve: "deep_solve", "deep_solve": "deep_solve",
  cuestionario: "deep_question", quiz: "deep_question", "deep_question": "deep_question",
  practica: "deep_question", practicar: "deep_question",
  investigar: "deep_research", research: "deep_research", "deep_research": "deep_research",
  visualizar: "visualize", visualiza: "visualize",
};
export function capacidadDeModo(modo: string): string {
  return CAPACIDADES[modo.trim().toLowerCase()] ?? "chat";
}

export function configDeeptutor(env: Record<string, string | undefined>): ConfigDeeptutor | null {
  const cruda = (env.DEEPTUTOR_URL ?? "").trim();
  if (!cruda) return null;
  try {
    const u = new URL(cruda);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: cruda.replace(/\/+$/, ""), token: (env.DEEPTUTOR_TOKEN ?? "").trim() };
}

function cabeceras(config: ConfigDeeptutor, conJson = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (config.token) h.Authorization = `Bearer ${config.token}`;
  if (conJson) h["Content-Type"] = "application/json";
  return h;
}
async function pedirConPlazo(
  fetchFn: FetchFn, url: string, init: Parameters<Pedir>[1], plazoMs: number,
): Promise<RespuestaEtapi | null> {
  const control = new AbortController();
  const ms = Number.isFinite(plazoMs) && plazoMs > 0 ? Math.trunc(plazoMs) : PLAZO_MS;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<null>((resolver) => {
    reloj = setTimeout(() => { control.abort(); resolver(null); }, ms);
  });
  try {
    const conSenal = { ...init, signal: control.signal };
    return await Promise.race([fetchFn(url, conSenal).catch(() => null), plazo]);
  } finally {
    if (reloj !== undefined) clearTimeout(reloj);
  }
}

/** Comprueba que el servidor responde; cualquier fallo o plazo se lee como `false`. */
export async function estadoDeeptutor(
  config: ConfigDeeptutor, fetchFn: FetchFn, plazoMs = PLAZO_MS,
): Promise<boolean> {
  const r = await pedirConPlazo(fetchFn, `${config.url}${RUTA_ESTADO}`, {
    method: "GET", headers: cabeceras(config),
  }, plazoMs);
  return r !== null && r.ok;
}

function textoDe(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return "";
  const o = valor as Record<string, unknown>;
  return textoDe(o.answer) || textoDe(o.content) || textoDe(o.text) || textoDe(o.message);
}

function comoJson(crudo: string): unknown {
  try { return JSON.parse(crudo) as unknown; } catch { return null; }
}

/** Extrae el texto de una respuesta JSON o de un flujo SSE (`data: {...}`). */
export function textoDeRespuesta(crudo: string): string {
  const limpio = crudo.trim();
  if (!limpio) return "";
  const directo = comoJson(limpio);
  if (directo !== null) return textoDe(directo);
  let acumulado = "";
  for (const linea of limpio.split(/\r?\n/)) {
    if (!linea.startsWith("data:")) continue;
    const dato = linea.slice(5).trim();
    if (!dato || dato === "[DONE]") continue;
    const evento = comoJson(dato);
    acumulado += evento === null ? dato : textoDe(evento);
  }
  return acumulado;
}

/** Pregunta al tutor con plazo; devuelve `null` ante cualquier caída limpia. */
export async function preguntarTutor(
  config: ConfigDeeptutor, fetchFn: FetchFn, peticion: PreguntaTutor, plazoMs = PLAZO_MS,
): Promise<RespuestaTutor | null> {
  const pregunta = peticion.pregunta.trim();
  if (!pregunta) return null;
  const capacidad = capacidadDeModo(peticion.modo);
  const r = await pedirConPlazo(fetchFn, `${config.url}${RUTA_PREGUNTAR}`, {
    method: "POST",
    headers: cabeceras(config, true),
    body: JSON.stringify({ content: pregunta, capability: capacidad, language: "es", enabledTools: [], knowledgeBases: [] }),
  }, plazoMs);
  if (!r || !r.ok) return null;
  try {
    const texto = textoDeRespuesta(await r.text()).trim();
    return texto ? { texto, capacidad } : null;
  } catch { return null; }
}
