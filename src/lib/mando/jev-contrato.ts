/* src/lib/mando/jev-contrato.ts — contrato puro de Jev (openjev).
   Sin fs / red / node:*. Solo validación, normalización y formato.
   Texto de UI en español con acentos; sin `any`. */

export type TipoPregunta = "noul" | "choice" | "score";

export interface Pregunta {
  id: string;
  type: TipoPregunta;
  options?: string[];
  levels?: string[];
  question: string;
}

export interface Peticion {
  state: string | object;
  questions: Pregunta[];
  medio?: string;
}

export interface RespuestaPregunta {
  id: string;
  answer: string;
  probs: Record<string, number>;
  confidence: number;
}

export interface Respuesta {
  ok: boolean;
  answers: RespuestaPregunta[];
  medio: string;
  ms: number;
}

export function validarPeticion(p: unknown): { ok: true; pet: Peticion } | { ok: false; error: string } {
  if (p === null || typeof p !== "object") return { ok: false, error: "cuerpo no es objeto" };
  const c = p as Record<string, unknown>;
  if (!("state" in c)) return { ok: false, error: "falta state" };
  const s = c.state;
  if (typeof s === "string" && s.length > 8000) return { ok: false, error: "state excede 8000" };
  if (!("questions" in c)) return { ok: false, error: "falta questions" };
  if (!Array.isArray(c.questions)) return { ok: false, error: "questions no es array" };
  for (const q of c.questions) {
    if (!q || typeof q !== "object") return { ok: false, error: "pregunta no es objeto" };
    const qq = q as Record<string, unknown>;
    if (typeof qq.id !== "string") return { ok: false, error: "pregunta sin id" };
    const t = qq.type;
    if (t !== "noul" && t !== "choice" && t !== "score") return { ok: false, error: "tipo desconocido" };
  }
  return { ok: true, pet: c as unknown as Peticion };
}

export function normalizarPreguntas(p: Peticion): Peticion {
  return { ...p, questions: p.questions.map(q => ({ ...q, options: q.options ?? [], levels: q.levels ?? [] })) };
}

export function decidirAcceso(tokenEnv: string | undefined, cabecera: string | undefined): "sin-token" | "no-autorizado" | "ok" {
  if (tokenEnv === undefined || tokenEnv === "") return "sin-token";
  if (cabecera === undefined || cabecera === "") return "no-autorizado";
  return cabecera === tokenEnv ? "ok" : "no-autorizado";
}

export function formatearRespuesta(raw: unknown, medio = "local", ms = 0): Respuesta {
  const r = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const answersRaw = Array.isArray(r.answers) ? r.answers : [];
  const answers: RespuestaPregunta[] = answersRaw.map((a: unknown) => {
    const aa = (a && typeof a === "object") ? (a as Record<string, unknown>) : {};
    const probsRaw = (aa.probs && typeof aa.probs === "object") ? (aa.probs as Record<string, number>) : {};
    const suma = Object.values(probsRaw).reduce((acc, v) => acc + (typeof v === "number" ? v : 0), 0);
    const probs: Record<string, number> = {};
    for (const k of Object.keys(probsRaw)) probs[k] = suma > 0 ? Math.round((probsRaw[k] / suma) * 10000) / 10000 : 0;
    return {
      id: typeof aa.id === "string" ? aa.id : "",
      answer: typeof aa.answer === "string" ? aa.answer : "",
      probs,
      confidence: typeof aa.confidence === "number" ? aa.confidence : 0,
    };
  });
  // (2026-09-25) El medio es el que de verdad contestó (jev.py lo devuelve): la ruta
  // pasaba el pedido («local» por defecto) y decía «local» con la respuesta de OpenRouter.
  const medioReal = typeof r.medio === "string" && r.medio ? r.medio : answers.length ? medio : "ninguno";
  return { ok: true, answers, medio: medioReal, ms };
}

