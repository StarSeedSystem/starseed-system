import {
  zonaDeConfianza,
  type DecisionNeedle,
  type LlamadaNeedle,
  type HerramientaNeedle,
} from "./needle3-client";

export type AccionPlan = "ejecutar" | "confirmar" | "escalar_jev" | "escalar_llm";
export type CapaDecision = "needle" | "jev" | "llm";

export interface RespuestaJev {
  ok: boolean;
  probabilidad: number | null;
  llamada?: LlamadaNeedle;
  razonamiento?: string;
  error?: string;
}

export interface PlanDecision {
  accion: AccionPlan;
  capa: CapaDecision;
  llamada?: LlamadaNeedle;
  motivo: string;
}

export function planDeDecision(
  needle: DecisionNeedle | null,
  jev: RespuestaJev | null
): PlanDecision {
  const zona = needle ? zonaDeConfianza(needle) : "escalar";

  if (zona === "ejecutar") {
    const llamada = needle?.llamadas?.[0];
    return {
      accion: "ejecutar",
      capa: "needle",
      ...(llamada ? { llamada } : {}),
      motivo: "Needle 3 determinó ejecución directa con alta confianza",
    };
  }

  if (zona === "confirmar") {
    const llamada = needle?.llamadas?.[0];
    return {
      accion: "confirmar",
      capa: "needle",
      ...(llamada ? { llamada } : {}),
      motivo: "Needle 3 requiere confirmación por confianza media",
    };
  }

  if (jev && jev.ok && typeof jev.probabilidad === "number") {
    if (jev.probabilidad >= 0.75) {
      return {
        accion: "ejecutar",
        capa: "jev",
        ...(jev.llamada ? { llamada: jev.llamada } : {}),
        motivo: "Jev determinó ejecución directa con alta probabilidad (≥ 0,75)",
      };
    }
    if (jev.probabilidad >= 0.5) {
      return {
        accion: "confirmar",
        capa: "jev",
        ...(jev.llamada ? { llamada: jev.llamada } : {}),
        motivo: "Jev requiere confirmación por probabilidad moderada (0,5–0,75)",
      };
    }
    return {
      accion: "escalar_llm",
      capa: "llm",
      motivo: "Jev determinó probabilidad insuficiente (< 0,5), se escala a LLM",
    };
  }

  return {
    accion: "escalar_llm",
    capa: "llm",
    motivo: "Sin respuesta de Jev en escalado de Needle 3, se escala a LLM",
  };
}

export async function decidirConJev(
  consulta: string,
  herramientas: HerramientaNeedle[],
  apiKey: string,
  transporte?: typeof fetch
): Promise<RespuestaJev> {
  if (!apiKey) return { ok: false, probabilidad: null, error: "Sin clave de API de OpenRouter" };
  const fetchFn = transporte ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetchFn("https://openrouter.ai/api/alpha/decisions", {
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
