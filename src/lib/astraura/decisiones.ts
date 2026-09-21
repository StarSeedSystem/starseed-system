import type { Pregunta, RespuestaPregunta } from "@/lib/mando/jev-contrato";

export const PLAZO_DECISION_MS = 5_000;

export type VeredictoModeracion = "publicar" | "revisar" | "rechazar";

export interface ResultadoDecision<T extends string> {
  veredicto: T | null;
  confianza: number;
  decidio: boolean;
}

interface RespuestaContrato {
  ok: boolean;
  answers: RespuestaPregunta[];
}

function urlContrato(): string {
  if (typeof window !== "undefined") return "/api/jev/systemone";
  const base = process.env.STARSEED_BASE_URL?.trim();
  return base ? new URL("/api/jev/systemone", base).toString() : "/api/jev/systemone";
}

function esRespuestaPregunta(valor: unknown): valor is RespuestaPregunta {
  if (!valor || typeof valor !== "object") return false;
  const respuesta = valor as Record<string, unknown>;
  return typeof respuesta.id === "string"
    && typeof respuesta.answer === "string"
    && typeof respuesta.confidence === "number"
    && respuesta.probs !== null
    && typeof respuesta.probs === "object"
    && !Array.isArray(respuesta.probs);
}

function leerContrato(valor: unknown): RespuestaPregunta[] | null {
  if (!valor || typeof valor !== "object") return null;
  const respuesta = valor as Partial<RespuestaContrato>;
  if (respuesta.ok !== true || !Array.isArray(respuesta.answers)) return null;
  return respuesta.answers.every(esRespuestaPregunta) ? respuesta.answers : null;
}

function cabecerasContrato(): HeadersInit {
  const cabeceras: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window === "undefined") {
    const token = process.env.STARSEED_JEV_TOKEN?.trim();
    if (token) cabeceras["x-starseed-jev"] = token;
  }
  return cabeceras;
}

export async function decidir(
  estado: string | object,
  preguntas: Pregunta[]
): Promise<RespuestaPregunta[] | null> {
  if (preguntas.length === 0) return null;
  const controller = new AbortController();
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  try {
    const plazo = new Promise<Response>((_, rechazar) => {
      temporizador = setTimeout(() => {
        controller.abort();
        rechazar(new Error("Plazo de decisión vencido"));
      }, PLAZO_DECISION_MS);
    });
    const respuesta = await Promise.race([
      fetch(urlContrato(), {
        method: "POST",
        headers: cabecerasContrato(),
        body: JSON.stringify({ state: estado, questions: preguntas }),
        signal: controller.signal,
      }),
      plazo,
    ]);
    if (!respuesta.ok) return null;
    return leerContrato(await respuesta.json());
  } catch {
    return null;
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}

function sinDecision<T extends string>(): ResultadoDecision<T> {
  // Ausencia de decisión no equivale a permitir ni a prohibir: decide el llamador.
  return { veredicto: null, confianza: 0, decidio: false };
}

function resultadoDe<T extends string>(
  respuestas: RespuestaPregunta[] | null,
  id: string,
  opciones: readonly T[]
): ResultadoDecision<T> {
  const respuesta = respuestas?.find((actual) => actual.id === id);
  if (!respuesta || !opciones.includes(respuesta.answer as T)) return sinDecision<T>();
  const confianza = Number.isFinite(respuesta.confidence)
    ? Math.min(1, Math.max(0, respuesta.confidence))
    : 0;
  return { veredicto: respuesta.answer as T, confianza, decidio: true };
}

async function elegir<T extends string>(
  id: string,
  estado: object,
  pregunta: string,
  opciones: readonly T[]
): Promise<ResultadoDecision<T>> {
  if (opciones.length === 0) return sinDecision<T>();
  const respuestas = await decidir(estado, [{
    id,
    type: "choice",
    question: pregunta,
    options: [...opciones],
  }]);
  return resultadoDe(respuestas, id, opciones);
}

export async function moderar(
  texto: string
): Promise<ResultadoDecision<VeredictoModeracion>> {
  const opciones = ["publicar", "revisar", "rechazar"] as const;
  return elegir(
    "moderacion",
    { texto },
    "¿Qué veredicto corresponde según las normas de la comunidad?",
    opciones
  );
}

export async function enrutar<T extends string>(
  peticion: string,
  destinos: readonly T[]
): Promise<ResultadoDecision<T>> {
  return elegir(
    "enrutado",
    { peticion, destinos },
    "¿Qué destino es el más adecuado para atender esta petición?",
    destinos
  );
}

export async function intencion<T extends string>(
  texto: string,
  lista: readonly T[]
): Promise<ResultadoDecision<T>> {
  return elegir(
    "intencion",
    { texto, intenciones: lista },
    "¿Qué intención describe mejor el texto?",
    lista
  );
}
