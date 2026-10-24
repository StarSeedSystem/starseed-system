// Cliente único de Laya por medio (Ola 1018L · LYS1018B): servidor local → A1 por la malla → regla.
// Módulo PURO: fetch, reloj y relé de malla VAN INYECTADOS; sin red, sin disco y sin reloj propio.
// Los plazos salen del catálogo de A (puntos-decision.ts) según el medio; decide con `answer_confidence`.
import { construirPeticion } from "@/lib/jev/decisiones";
import { PLAZO_MAX_MS, puntoDecision, type IdPuntoDecision, type MedioLaya, type PuntoDecision }
  from "./puntos-decision";

export const URL_LAYA_LOCAL = "http://127.0.0.1:4470/v1/systemone";
export type DondeLaya = "local" | "malla";

/** Lo que devuelve `preguntarALaya`: respuestas de Laya (answers) o null con el motivo del fallo. */
export interface SalidaLaya {
  respuestas: Record<string, unknown> | null;
  donde: DondeLaya | null;
  ms: number;
  motivo?: string;
}

/** Reloj inyectado: medir ms y esperar `ms` sin bloquear el hilo (la siesta se cancela si no hace falta). */
export interface Siesta { promesa: Promise<void>; cancelar: () => void; }
export interface RelojLaya {
  ahora: () => number;
  dormir: (ms: number) => Siesta;
}

export interface DepsLaya extends RelojLaya {
  fetch: typeof fetch;
  /** Relé de malla hacia el A1 (`capacidad.decision.laya`, tarea G): devuelve la respuesta o null si no llegó. */
  relevoMalla?: (cuerpo: string) => Promise<unknown>;
  /** true cuando el A1 es un servidor propio de la cuenta: lo privado podría viajar a él. */
  a1Propio?: boolean;
}

export interface PeticionClienteLaya {
  punto: PuntoDecision | IdPuntoDecision;
  estado: unknown;
  /** Lo privado nunca sale de las neuronas de la persona ni de sus servidores propios. */
  privado?: boolean;
  medio: MedioLaya;
  /** La decisión ocurre con una conversación en curso: el servidor local puede cargarse con X-Prioridad. */
  conversacion?: boolean;
}

/** Resuelve el punto de decisión (objeto del catálogo o su id) — falla con el id desconocado. */
export function puntoDeLlamada(p: PeticionClienteLaya["punto"]): PuntoDecision {
  const punto = typeof p === "string" ? puntoDecision(p) : p;
  if (!punto) throw new Error(`punto de decisión desconocido «${String(p)}»`);
  return punto;
}

/** Carrera contra el plazo del punto: si gana el trabajo, la siesta se cancela; si vence, null. */
async function conPlazo(trabajo: Promise<unknown>, ms: number, deps: RelojLaya): Promise<unknown> {
  const espera = deps.dormir(ms);
  try {
    return await Promise.race([trabajo, espera.promesa.then((): unknown => null)]);
  } finally {
    espera.cancelar();
  }
}

/** Lee las answers del formato nativo de system_one; null si el cuerpo no las trae. */
export function leerAnswers(json: unknown): Record<string, unknown> | null {
  const answers = (json as { answers?: unknown } | null)?.answers;
  return answers && typeof answers === "object" && !Array.isArray(answers)
    ? (answers as Record<string, unknown>) : null;
}

export async function preguntarALaya(p: PeticionClienteLaya, deps: DepsLaya): Promise<SalidaLaya> {
  const punto = puntoDeLlamada(p.punto);
  const cuerpo = JSON.stringify(construirPeticion(p.estado, { ...punto.preguntas }));
  const inicio = deps.ahora();
  const msDe = (): number => Math.max(0, deps.ahora() - inicio);
  const falla = (motivo: string): SalidaLaya => ({ respuestas: null, donde: null, ms: msDe(), motivo });

  // 1. Servidor local del aparato: formato nativo; X-Prioridad solo si hay conversación en curso.
  const cabeceras: Record<string, string> = { "Content-Type": "application/json" };
  if (p.conversacion) cabeceras["X-Prioridad"] = "conversacion";
  const plazoPorMedio = punto.plazoMsPorMedio[p.medio] ?? PLAZO_MAX_MS;
  try {
    const r = await conPlazo(deps.fetch(URL_LAYA_LOCAL, { method: "POST", headers: cabeceras, body: cuerpo }),
      plazoPorMedio, deps) as (Response & { status?: number }) | null;
    if (!r || typeof r.ok !== "boolean") throw new Error("sin respuesta del servidor local");
    if (!r.ok) throw new Error(`HTTP ${(r as Response).status ?? "sin estado"}`);
    const answers = leerAnswers(await (r as Response).json());
    if (!answers) throw new Error("el servidor local no trajo answers");
    return { respuestas: answers, donde: "local", ms: msDe() };
  } catch { /* el local no sirvió: se intenta el A1 por la malla */ }

  // 2. A1 por la malla: solo si no es privado o el A1 es servidor propio de la cuenta.
  const privado = p.privado ?? false;
  if (privado && !deps.a1Propio) return falla("lo privado no sale de la malla: solo en neuronas y servidores propios");
  if (!deps.relevoMalla) return falla(`sin Laya local ni relé de malla: ${punto.respaldo}`);
  try {
    const r = await conPlazo(Promise.resolve(deps.relevoMalla(cuerpo)), plazoPorMedio, deps);
    const answers = leerAnswers(r);
    if (!answers) throw new Error("la malla no trajo answers");
    return { respuestas: answers, donde: "malla", ms: msDe() };
  } catch {
    return falla(`Laya no llegó ni local ni por la malla: ${punto.respaldo}`);
  }
}
