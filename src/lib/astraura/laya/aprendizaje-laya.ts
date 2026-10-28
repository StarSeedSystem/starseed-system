// Aprendizaje de Laya: registro, recalibrado del umbral y exportación JSONL (Ola 1018L · M).
// Módulo PURO: sin red, sin disco, sin reloj, sin modelo. Lo privado nunca sale: solo huella.
import { UMBRAL_POR_DEFECTO, PUNTOS_DECISION, puntoDecision } from "./puntos-decision";
import type { IdPuntoDecision } from "./puntos-decision";

export type ResultadoAprendizaje = "aceptada" | "corregida" | "escalada";

export interface CasoAprendizaje {
  readonly punto: string;
  readonly ambito: string;
  readonly p: number; // answer_confidence calibrada
  readonly donde: string;
  readonly ms: number;
  readonly resultado: ResultadoAprendizaje;
  readonly privado: boolean;
  readonly estado: string; // texto completo o huella (hash truncado)
}

export type RegistroAprendizaje = CasoAprendizaje[];

export interface EntradaAnotar {
  punto: string | IdPuntoDecision;
  ambito: string;
  p: number;
  donde: string;
  ms: number;
  resultado: ResultadoAprendizaje;
  privado?: boolean;
  estado: string;
}

/** Guarda una huella, nunca el texto completo, cuando es privado. */
function huellaEstado(texto: string): string {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h = ((h << 5) - h + c) | 0;
  }
  return "h" + Math.abs(h).toString(16).slice(0, 8);
}

export function anotar(registro: RegistroAprendizaje, entrada: EntradaAnotar): void {
  const caso: CasoAprendizaje = {
    punto: typeof entrada.punto === "string" ? entrada.punto : entrada.punto,
    ambito: entrada.ambito,
    p: entrada.p,
    donde: entrada.donde,
    ms: entrada.ms,
    resultado: entrada.resultado,
    privado: entrada.privado ?? false,
    estado: entrada.privado ? huellaEstado(entrada.estado) : entrada.estado,
  };
  registro.push(caso);
}

export function umbralRecalibrado(registro: RegistroAprendizaje, punto: string, ambito: string): number {
  const casos = registro.filter((c) => c.punto === punto && c.ambito === ambito);
  const base = puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;
  if (casos.length < 30) return base;

  // Prueba umbrales candidatos: valores únicos de p ordenados.
  const candidatos = Array.from(new Set(casos.map((c) => Math.round(c.p * 100) / 100))).sort((a, b) => a - b);
  let mejor = base;
  let minCorrecciones = Infinity;
  for (const u of candidatos) {
    const correcciones = casos.filter((c) => c.p >= u && c.resultado === "corregida").length;
    if (correcciones < minCorrecciones) {
      minCorrecciones = correcciones;
      mejor = u;
    }
  }
  return mejor;
}

export function exportarJSONL(registro: RegistroAprendizaje): string {
  const lineas = registro
    .filter((c) => !c.privado)
    .map((c) => JSON.stringify({ punto: c.punto, ambito: c.ambito, p: c.p, donde: c.donde, ms: c.ms, resultado: c.resultado, estado: c.estado }));
  return lineas.join("\n") + (lineas.length > 0 ? "\n" : "");
}
