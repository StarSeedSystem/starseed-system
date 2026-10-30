// Aprendizaje de Laya por punto y ámbito (architecture/laya-y-habilidades.md §6, Ola 1018L · LYS1018M).
// Módulo PURO: sin red, sin disco y sin reloj. Decide con `answer_confidence` (calibrada), nunca `confidence`.
// Lo privado se guarda SOLO como huella y jamás sale en el JSONL del cuaderno de afinado.
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";
/** Resultado de una decisión de Laya, tal como lo valora la persona o la capa siguiente. */
export type ResultadoLaya = "aceptada" | "corregida" | "escalada";
/** Casos mínimos por punto y ámbito antes de mover el umbral del catálogo (§6). */
export const MIN_CASOS_RECALIBRAR = 30;

/** Un caso del registro: métricas y resultado, con el estado completo o su huella si es privado. */
export interface CasoAprendizaje {
  readonly punto: string;
  readonly ambito: string;
  /** `answer_confidence` calibrada de Laya en [0, 1]. */
  readonly p: number;
  readonly donde: string;
  readonly ms: number;
  readonly resultado: ResultadoLaya;
  readonly privado: boolean;
  readonly estado: string;
}

/** Lo que llega a `anotar`: igual que un caso, pero el estado puede ser cualquier valor. */
export type EntradaAnotacion = Omit<CasoAprendizaje, "privado" | "estado"> & {
  readonly privado: boolean;
  readonly estado: unknown;
};

/** FNV-1a de 32 bits en hex con prefijo `h`: estable, barata y sin `node:*`. */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i) & 0xff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `h${h.toString(16).padStart(8, "0")}`;
}

/** Texto estable del estado: una cadena tal cual; lo demás, su JSON. */
function textoDe(estado: unknown): string {
  if (typeof estado === "string") return estado;
  if (estado === null || estado === undefined) return "";
  if (typeof estado === "object") {
    try { return JSON.stringify(estado); } catch { return String(estado); }
  }
  return String(estado);
}

/** `answer_confidence` utilizable: número finito en [0, 1]; lo demás cuenta como 0. */
function confianza(p: number): number {
  return typeof p === "number" && Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
}

/** Añade un caso al registro SIN mutarlo; si es privado, guarda su huella. */
export function anotar(registro: readonly CasoAprendizaje[], entrada: EntradaAnotacion): CasoAprendizaje[] {
  const original = textoDe(entrada.estado);
  const privado = entrada.privado === true;
  return [...registro, {
    punto: textoDe(entrada.punto).trim(),
    ambito: textoDe(entrada.ambito).trim(),
    p: confianza(entrada.p),
    donde: textoDe(entrada.donde).trim(),
    ms: Number.isFinite(entrada.ms) ? Math.max(0, Math.round(entrada.ms)) : 0,
    resultado: entrada.resultado,
    privado,
    estado: privado ? huella(original) : original,
  }];
}

function casosDe(registro: readonly CasoAprendizaje[], punto: string, ambito: string): CasoAprendizaje[] {
  return registro.filter((c) => c.punto === punto && c.ambito === ambito);
}

/** ¿El umbral `t` decide lo corregido/escalado o duda de lo aceptado? Contar solo lo primero dejaría el umbral en 1. */
function seEquivoca(caso: CasoAprendizaje, t: number): boolean {
  return caso.resultado === "aceptada" ? caso.p < t : caso.p >= t;
}

/** Umbral que menos se equivoca con ≥ 30 casos; si hay menos, el del catálogo. */
export function umbralRecalibrado(registro: readonly CasoAprendizaje[], punto: string, ambito: string): number {
  const catalogo = puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;
  const casos = casosDe(registro, punto, ambito);
  if (casos.length < MIN_CASOS_RECALIBRAR) return catalogo;
  const candidatos = [...new Set([0, 1, catalogo, ...casos.map((c) => c.p)])].sort((a, b) => a - b);
  let mejor = catalogo;
  let mejorError = Number.POSITIVE_INFINITY;
  let mejorDistancia = Number.POSITIVE_INFINITY;
  for (const t of candidatos) {
    const error = casos.reduce((n, c) => n + (seEquivoca(c, t) ? 1 : 0), 0);
    const distancia = Math.abs(t - catalogo);
    if (error < mejorError || (error === mejorError && distancia < mejorDistancia)) {
      mejor = t;
      mejorError = error;
      mejorDistancia = distancia;
    }
  }
  return mejor;
}

/** Línea del cuaderno de afinado de Laya: `state` + preguntas del catálogo + metadatos del caso. */
function filaExportable(caso: CasoAprendizaje): Record<string, unknown> {
  const punto = puntoDecision(caso.punto);
  return {
    state: caso.estado,
    ...(punto ? { questions: punto.preguntas } : {}),
    punto: caso.punto,
    ambito: caso.ambito,
    answer_confidence: caso.p,
    resultado: caso.resultado,
    donde: caso.donde,
    ms: caso.ms,
  };
}

/** Exporta en JSONL los casos NO privados; lo privado no sale nunca (ni su huella). */
export function exportarJSONL(registro: readonly CasoAprendizaje[]): string {
  return registro.filter((c) => !c.privado).map((c) => JSON.stringify(filaExportable(c))).join("\n");
}
