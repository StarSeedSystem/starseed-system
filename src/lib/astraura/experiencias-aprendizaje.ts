// Lo que sale de las experiencias: líneas para Needle y curvas de calibración.
import type { Experiencia, Capa } from "./experiencias";

interface SalidaNeedle {
  herramientas?: string[];
  llamadas?: { nombre: string; argumentos?: Record<string, unknown> }[];
  razonamiento?: string;
}

export interface LineaNeedle {
  query: string;
  tools: string[];
  answers: { name: string; arguments: Record<string, unknown> }[];
  reasoning: string;
}

// Solo intenciones acertadas → JSONL que entiende `needle finetune`.
export function paraNeedle(exps: Experiencia[]): LineaNeedle[] {
  const fuera: LineaNeedle[] = [];
  for (const e of exps) {
    if (e.tipo !== "intencion" || !e.resultado) continue;
    const s = e.salida as SalidaNeedle | null;
    if (!s || typeof s !== "object" || !s.herramientas || !s.llamadas) continue;
    fuera.push({
      query: e.entrada,
      tools: s.herramientas,
      answers: s.llamadas.map((c) => ({ name: c.nombre, arguments: c.argumentos ?? {} })),
      reasoning: s.razonamiento ?? "",
    });
  }
  return fuera;
}

export interface TramoCalibracion {
  n: number;
  aciertos: number;
}

// Aciertos por décima de confianza, solo con resultado conocido.
export function calibracion(exps: Experiencia[], capa: Capa = "jev"): Record<string, TramoCalibracion> {
  const tramos: Record<string, TramoCalibracion> = {};
  for (const e of exps) {
    if (e.capa !== capa || e.resultado === null || e.confianza === null) continue;
    const k = (Math.floor(e.confianza * 10) / 10).toFixed(1);
    const t = (tramos[k] ??= { n: 0, aciertos: 0 });
    t.n += 1;
    if (e.resultado) t.aciertos += 1;
  }
  return tramos;
}
