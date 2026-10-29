import { UMBRAL_EJECUTAR as UMBRAL_NEEDLE_EJECUTAR, zonaDeConfianza,
  type DecisionNeedle, type LlamadaNeedle, type HerramientaNeedle } from "./needle3-client";
import { preguntaTipo } from "@/ai/astraura/habilidades/diagramas";
// (Ola 1018L · LYS1018K) El punto «habilidad.elegir» del catálogo arma la choice
// con las habilidades reales: `preguntaHabilidad` es «cuando» de cada una +
// «ninguna», y `bloqueHabilidad` saca el texto a inyectar según la capa.
import {
  bloqueHabilidad, OPCION_NINGUNA, preguntaHabilidad,
  type CapaHabilidad,
} from "@/ai/astraura/habilidades/elegir-habilidad";
import { leerRespuesta } from "@/lib/jev/decisiones";
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

interface DecisionLaya { choice?: unknown; confidence?: unknown; answer_confidence?: unknown; }

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

export interface RespuestaHabilidad {
  habilidad: string; confianza: number; bloque: string; motor: "laya-local";
}

/** Capa 2c · Laya elige QUÉ habilidad de ingeniería aplica (contrato §4-§5) por
 *  el punto «habilidad.elegir»: criteria = «cuando» de cada una + «ninguna».
 *  La capa que va a responder manda el tamaño del bloque a inyectar (tarjeta
 *  para Needle/BitNet, resumen para Bonsai, referencia a la completa para las
 *  capas mayores); «ninguna» o confianza bajo el umbral → bloque vacío. Como
 *  el resto, falla en silencio: sin Laya no hay habilidad, ni bloque ni fallo. */
export async function decidirHabilidad(
  consulta: string, capa?: CapaHabilidad, transporte?: typeof fetch
): Promise<RespuestaHabilidad | null> {
  const pregunta = preguntaHabilidad();
  const opciones = pregunta.criteria;
  try {
    const salida = await preguntarALaya(
      { punto: { ...puntoDeLlamada("habilidad.elegir"), preguntas: { habilidad: pregunta } },
        estado: consulta, medio: "a1" },
      { ...RELOJ_REAL, fetch: transporte ?? fetch });
    const bruta = salida.respuestas?.habilidad as unknown;
    if (!bruta || typeof bruta !== "object") return null;
    const decision = leerRespuesta({ answers: { habilidad: bruta } })["habilidad"];
    if (decision.tipo !== "choice") return null;
    if (typeof decision.valor !== "string"
      || !Object.prototype.hasOwnProperty.call(opciones, decision.valor)) return null;
    const id = decision.valor as string;
    if (id === OPCION_NINGUNA) {
      return { habilidad: id, confianza: decision.confianza, bloque: "", motor: "laya-local" };
    }
    return {
      habilidad: id,
      confianza: decision.confianza,
      bloque: capa ? bloqueHabilidad(decision, capa) : "",
      motor: "laya-local",
    };
  } catch {
    return null;
  }
}
