import { UMBRAL_EJECUTAR as UMBRAL_NEEDLE_EJECUTAR, zonaDeConfianza,
  type DecisionNeedle, type LlamadaNeedle, type HerramientaNeedle } from "./needle3-client";

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

interface RespuestaLayaHttp { answers?: Record<string,
  { choice?: unknown; confidence?: unknown; }>; }

export async function decidirConLaya(
  consulta: string, herramientas: HerramientaNeedle[], transporte?: typeof fetch
): Promise<RespuestaLaya | null> {
  if (herramientas.length === 0) return null;
  const criteria = Object.fromEntries(herramientas.map(
    ({ name, description }) => [name, description]));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const respuesta = await (transporte ?? fetch)("http://127.0.0.1:4470/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state: consulta,
        questions: {
          herramienta: { type: "choice",
            instructions: "Elige la herramienta más adecuada para resolver la consulta", criteria },
        },
      }),
      signal: controller.signal,
    });
    if (!respuesta.ok) return null;
    const data = (await respuesta.json()) as RespuestaLayaHttp;
    const decision = data.answers?.herramienta;
    if (typeof decision?.choice !== "string"
      || !Object.prototype.hasOwnProperty.call(criteria, decision.choice)) return null;
    if (typeof decision.confidence !== "number" || !Number.isFinite(decision.confidence)) return null;
    return { herramienta: decision.choice, confianza: decision.confidence, motor: "laya-local" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function decidirConJev(
  consulta: string, herramientas: HerramientaNeedle[], apiKey: string, transporte?: typeof fetch
): Promise<RespuestaJev> {
  if (!apiKey) return { ok: false, probabilidad: null, error: "Sin clave de API de OpenRouter" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
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
