import { UMBRAL_EJECUTAR as UMBRAL_NEEDLE_EJECUTAR, zonaDeConfianza,
  type DecisionNeedle, type LlamadaNeedle, type HerramientaNeedle } from "./needle3-client";
import { preguntaTipo } from "@/ai/astraura/habilidades/diagramas";
// Bloque Habilidades (Ola 1018L · LYS1018K): la pregunta choice y el texto a
// inyectar salen del módulo PURO `elegir-habilidad` (laya-y-habilidades.md §4-§5).
import {
  HABILIDADES_INGENIERIA,
  TAMANO_POR_CAPA,
  bloqueHabilidad,
  preguntaHabilidad,
  type CapaHabilidad,
  type TamanoHabilidad,
} from "@/ai/astraura/habilidades/elegir-habilidad";
// Cliente único de Laya (Ola 1018L · Tarea B): aquí es donde debía usarse `preguntarALaya`,
// que era la única llamada a Laya del servidor TS, con plazos del catálogo y relé de malla.
import { preguntarALaya, puntoDeLlamada, type RelojLaya, type Siesta } from "./laya/cliente-laya";
import { conOpciones, puntoDecision } from "./laya/puntos-decision";

/** ¿La consulta pide dibujar un diagrama? (la petición, no la intención del modelo). */
const RX_PETE_DIAGRAMA = /\b(diagrama?s?|dibuja|dibujar|dibujo|esquema?s?|organigrama|gantt|sankey|wardley|flowchart|flujograma)\b/i;

export function esPeticionDeDiagrama(consulta: string): boolean {
  return RX_PETE_DIAGRAMA.test(consulta);
}

export type AccionPlan = "ejecutar" | "confirmar" | "escalar_jev" | "escalar_llm";
export type CapaDecision = "needle" | "laya" | "jev" | "llm";
export { UMBRAL_NEEDLE_EJECUTAR };
export const UMBRAL_LAYA_EJECUTAR = 0.6;
export const UMBRAL_JEV_EJECUTAR = 0.75;
export const UMBRAL_JEV_CONFIRMAR = 0.5;

export interface RespuestaLaya { herramienta: string; confianza: number; motor: "laya-local"; }
export interface RespuestaJev { ok: boolean; probabilidad: number | null; llamada?: LlamadaNeedle;
  razonamiento?: string; error?: string; }
export interface PlanDecision { accion: AccionPlan; capa: CapaDecision;
  llamada?: LlamadaNeedle; motivo: string; }

function plan(capa: CapaDecision, accion: AccionPlan, motivo: string,
  llamada?: LlamadaNeedle): PlanDecision {
  return { capa, accion, motivo, ...(llamada ? { llamada } : {}) };
}

export function planDeDecision(
  needle: DecisionNeedle | null,
  layaOJev: RespuestaLaya | RespuestaJev | null,
  respuestaJev?: RespuestaJev | null
): PlanDecision {
  const zona = needle ? zonaDeConfianza(needle) : "escalar";
  const laya = layaOJev && "motor" in layaOJev ? layaOJev : null;
  const jev = respuestaJev === undefined && !laya
    ? layaOJev as RespuestaJev | null
    : respuestaJev ?? null;
  if (zona === "ejecutar") return plan("needle", "ejecutar",
    "Needle 3 determinó ejecución directa con alta confianza", needle?.llamadas?.[0]);
  if (zona === "confirmar") return plan("needle", "confirmar",
    "Needle 3 requiere confirmación por confianza media", needle?.llamadas?.[0]);
  if (laya && laya.confianza >= UMBRAL_LAYA_EJECUTAR) return plan("laya", "ejecutar",
    "Laya local eligió una herramienta con confianza suficiente (≥ 0,6)",
    { nombre: laya.herramienta, argumentos: {} });
  if (jev && jev.ok && typeof jev.probabilidad === "number") {
    if (jev.probabilidad >= UMBRAL_JEV_EJECUTAR) return plan("jev", "ejecutar",
      "Jev determinó ejecución directa con alta probabilidad (≥ 0,75)", jev.llamada);
    if (jev.probabilidad >= UMBRAL_JEV_CONFIRMAR) return plan("jev", "confirmar",
      "Jev requiere confirmación por probabilidad moderada (0,5–0,75)", jev.llamada);
    return plan("llm", "escalar_llm",
      "Jev determinó probabilidad insuficiente (< 0,5), se escala a LLM");
  }
  return plan("llm", "escalar_llm",
    "Sin respuesta de Jev en escalado de Needle 3, se escala a LLM");
}

interface DecisionLaya { choice?: unknown; confidence?: unknown; answer_confidence?: unknown;
  probabilities?: unknown; }

/** Siesta del reloj real: se cancela (el temporizador se retira) si el trabajo gana el plazo. */
function siesta(ms: number): Siesta {
  let cancelar: () => void = () => {};
  const promesa: Promise<void> = new Promise((resolver) => {
    const t = setTimeout(resolver, ms);
    cancelar = () => clearTimeout(t);
  });
  return { promesa, cancelar };
}

const RELOJ_REAL: RelojLaya = { ahora: () => Date.now(), dormir: siesta };

export async function decidirConLaya(
  consulta: string, herramientas: HerramientaNeedle[], transporte?: typeof fetch
): Promise<RespuestaLaya | null> {
  if (herramientas.length === 0) return null;
  const punto = puntoDecision("reflejo.herramienta");
  if (!punto) return null;
  const criteria = Object.fromEntries(herramientas.map(
    ({ name, description }) => [name, description]));
  try {
    const salida = await preguntarALaya(
      { punto: { ...punto, preguntas: conOpciones(punto, "herramienta", criteria) },
        estado: consulta, medio: "a1" },
      { ...RELOJ_REAL, fetch: transporte ?? fetch });
    const decision = salida.respuestas?.herramienta as DecisionLaya | undefined;
    if (typeof decision?.choice !== "string"
      || !Object.prototype.hasOwnProperty.call(criteria, decision.choice)) return null;
    // Lectura calibrada (Ola 1018L · LYS1018B): manda `answer_confidence`; `confidence` solo si falta aquella.
    const cruda = typeof decision.answer_confidence === "number" && Number.isFinite(decision.answer_confidence)
      ? decision.answer_confidence
      : decision.confidence;
    if (typeof cruda !== "number" || !Number.isFinite(cruda)) return null;
    return { herramienta: decision.choice, confianza: cruda, motor: "laya-local" };
  } catch {
    return null;
  }
}

export async function decidirConJev(
  consulta: string, herramientas: HerramientaNeedle[], apiKey: string, transporte?: typeof fetch
): Promise<RespuestaJev> {
  if (!apiKey) return { ok: false, probabilidad: null, error: "Sin clave de API de OpenRouter" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);  try {
    const res = await (transporte ?? fetch)("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "~typesafe/jev-latest", input: { consulta, herramientas } }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, probabilidad: null, error: `HTTP ${res.status}` };
    const data = (await res.json()) as Record<string, unknown>;
    const prob = typeof data.probabilidad === "number" ? data.probabilidad
      : typeof data.confidence === "number" ? data.confidence
      : typeof data.noul === "number" ? data.noul : null;
    return {
      ok: true,
      probabilidad: prob,
      llamada: (data.llamada as LlamadaNeedle | undefined) ?? undefined,
      razonamiento: typeof data.razonamiento === "string" ? data.razonamiento : undefined,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    return { ok: false, probabilidad: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface RespuestaTipoDiagrama { tipo: string; confianza: number; motor: "laya-local"; }

/** Capa 2b · Laya elige el TIPO de diagrama entre los 45 por la petición
 *  (architecture/diagramas.md §3.1). Pasa por el cliente único de Laya, así que
 *  hereda los plazos del catálogo y la lectura calibrada. Con `tipos` (ids de
 *  `TIPOS_DIAGRAMA`) limita las opciones, por ejemplo al bloque afín a la petición. */
export async function decidirTipoDiagrama(
  consulta: string, tipos?: string[], transporte?: typeof fetch
): Promise<RespuestaTipoDiagrama | null> {
  const pregunta = preguntaTipo(tipos);
  const opciones = pregunta.criteria;
  try {
    const salida = await preguntarALaya(
      { punto: { ...puntoDeLlamada("habilidad.elegir"), preguntas: { tipo: pregunta } },
        estado: consulta, medio: "a1" },
      { ...RELOJ_REAL, fetch: transporte ?? fetch });
    const decision = salida.respuestas?.tipo as DecisionLaya | undefined;
    if (typeof decision?.choice !== "string"
      || !Object.prototype.hasOwnProperty.call(opciones, decision.choice)) return null;
    const cruda = typeof decision.answer_confidence === "number" && Number.isFinite(decision.answer_confidence)
      ? decision.answer_confidence
      : decision.confidence;
    if (typeof cruda !== "number" || !Number.isFinite(cruda)) return null;
    return { tipo: decision.choice, confianza: cruda, motor: "laya-local" };
  } catch {
    return null;
  }
}

export interface RespuestaHabilidadLaya {
  /** La cadena `choice` de Laya tal cual («ninguna», id de habilidad o null). */
  habilidad: string | null;
  /** La calibrada `answer_confidence`, o null si faltó. */
  confianza: number | null;
  /** El tamaño que le toca a la capa que responde (`TAMANO_POR_CAPA`). */
  tamano: TamanoHabilidad | null;
  /** El texto a inyectar de `bloqueHabilidad`: null si «ninguna», duda o forma rara. */
  texto: string | null;
  motor: "laya-local";
}

/** Bloque Habilidades (architecture/laya-y-habilidades.md §4-§5) · Laya elige CUÁL
 *  habilidad de ingeniería aplica mediante el punto «habilidad.elegir» con la
 *  pregunta de `preguntaHabilidad` (los «cuándo» de las 12 + «ninguna»), y
 *  `bloqueHabilidad` convierte la respuesta en el texto a inyectar del tamaño de
 *  `capa`. Decide SOLO con la calibrada `answer_confidence`; si duda, el
 *  respaldo del punto es «ninguna habilidad». Nunca lanza (capa 2c: el mismo
 *  Laya en CPU tarda segundos (contrato §2): quien llama no debe bloquear la
 *  primera palabra de una conversación. */
export async function decidirHabilidad(
  consulta: string, capa: string, transporte?: typeof fetch
): Promise<RespuestaHabilidadLaya | null> {
  const punto = puntoDecision("habilidad.elegir");
  if (!punto || !Object.prototype.hasOwnProperty.call(TAMANO_POR_CAPA, capa)) return null;
  const pregunta = preguntaHabilidad(HABILIDADES_INGENIERIA);
  try {
    const salida = await preguntarALaya(
      { punto: { ...punto, preguntas: { habilidad: pregunta } },
        estado: consulta, medio: "a1" },
      { ...RELOJ_REAL, fetch: transporte ?? fetch });
    const decision = salida.respuestas?.habilidad as DecisionLaya | undefined;
    if (!decision) return null;
    // Solo pasa al módulo puro lo que tenga forma de respuesta de Laya.
    const respuesta: { choice?: unknown; probabilities?: unknown; answer_confidence?: unknown } = {};
    if (typeof decision.choice === "string") respuesta.choice = decision.choice;
    if (decision.probabilities && typeof decision.probabilities === "object" && !Array.isArray(decision.probabilities)) {
      respuesta.probabilities = decision.probabilities;
    }
    if (typeof decision.answer_confidence === "number" && Number.isFinite(decision.answer_confidence)) {
      respuesta.answer_confidence = decision.answer_confidence;
    }
    return {
      habilidad: typeof respuesta.choice === "string" ? respuesta.choice : null,
      confianza: typeof respuesta.answer_confidence === "number" ? respuesta.answer_confidence : null,
      tamano: TAMANO_POR_CAPA[capa as CapaHabilidad],
      texto: bloqueHabilidad(respuesta, capa as CapaHabilidad, punto.umbral),
      motor: "laya-local",
    };
  } catch {
    return null;
  }
}
