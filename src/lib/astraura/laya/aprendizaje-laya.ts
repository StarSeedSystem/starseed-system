// Registro y recalibrado del umbral de Laya por punto y ámbito (Ola 1018L · LYS1018M).
// PURA: sin red, sin disco, sin reloj y sin modelo. `p` es SIEMPRE la `answer_confidence`
// calibrada, nunca `confidence`. Lo privado se guarda solo como huella y nunca sale en el JSONL.
import type { IdPuntoDecision, MedioLaya } from "./puntos-decision";
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";

export type ResultadoLaya = "aceptada" | "corregida" | "escalada";

export interface EntradaAnotacion {
  readonly punto: IdPuntoDecision | string;
  readonly ambito: string;
  readonly p: number;
  readonly donde: MedioLaya | string;
  readonly ms: number;
  readonly resultado: ResultadoLaya;
  readonly privado: boolean;
  readonly estado: string;
}

export interface CasoLaya {
  readonly punto: string;
  readonly ambito: string;
  readonly p: number;
  readonly donde: string;
  readonly ms: number;
  readonly resultado: ResultadoLaya;
  readonly privado: boolean;
  /** Texto del estado: solo en los casos no privados. */
  readonly estado?: string;
  /** Huella estable del estado: solo en los casos privados. */
  readonly huella?: string;
}

export type RegistroLaya = readonly CasoLaya[];

export const MIN_CASOS_RECALIBRADO = 30, UMBRAL_MIN = 0, UMBRAL_MAX = 1;
export const RESULTADOS_LAYA: readonly ResultadoLaya[] = ["aceptada", "corregida", "escalada"];

/** Huella estable de 16 hex (FNV-1a de 32 bits con dos semillas): no revela el texto. */
export function huellaEstado(texto: string): string {
  const fnv = (semilla: number): number => {
    let h = semilla >>> 0;
    for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
    return h >>> 0;
  };
  return fnv(0x811c9dc5).toString(16).padStart(8, "0") + fnv(0x9e3779b9).toString(16).padStart(8, "0");
}

function validar(e: EntradaAnotacion): void {
  const fallo = (m: string): never => { throw new Error(m); };
  if (typeof e.punto !== "string" || !e.punto.trim()) fallo("Falta el punto de decisión");
  if (typeof e.ambito !== "string" || !e.ambito.trim()) fallo("Falta el ámbito");
  if (typeof e.p !== "number" || !Number.isFinite(e.p) || e.p < UMBRAL_MIN || e.p > UMBRAL_MAX)
    fallo("p debe ser la answer_confidence calibrada, entre 0 y 1");
  if (typeof e.donde !== "string" || !e.donde.trim()) fallo("Falta dónde corrió Laya");
  if (typeof e.ms !== "number" || !Number.isFinite(e.ms) || e.ms < 0) fallo("ms debe ser un número ≥ 0");
  if (!RESULTADOS_LAYA.includes(e.resultado)) fallo(`resultado desconocido «${String(e.resultado)}»`);
  if (typeof e.privado !== "boolean") fallo("privado debe ser booleano");
  if (typeof e.estado !== "string" || !e.estado.trim()) fallo("Falta el estado que vio Laya");
}

/** Añade un caso sin mutar el registro. Privado ⇒ solo huella; no privado ⇒ el texto. */
export function anotar(registro: RegistroLaya, entrada: EntradaAnotacion): RegistroLaya {
  validar(entrada);
  const base = { punto: entrada.punto, ambito: entrada.ambito, p: entrada.p, donde: entrada.donde,
    ms: entrada.ms, resultado: entrada.resultado, privado: entrada.privado };
  return [...registro, entrada.privado ? { ...base, huella: huellaEstado(entrada.estado) } : { ...base, estado: entrada.estado }];
}

/** Umbral del catálogo para el punto; el de por defecto si el punto no está en el catálogo. */
export const umbralCatalogo = (punto: string): number => puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;

type Coste = readonly [correcciones: number, escaladas: number, distancia: number];

function coste(casos: readonly CasoLaya[], t: number, catalogo: number): Coste {
  let correcciones = 0, escaladas = 0;
  for (const c of casos) {
    if (c.p >= t) { if (c.resultado === "corregida") correcciones++; }
    else if (c.resultado === "aceptada") escaladas++;
  }
  return [correcciones, escaladas, Math.abs(t - catalogo)];
}

const menor = (a: Coste, b: Coste): boolean =>
  a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];

/**
 * Umbral que menos corrige para el punto y ámbito, con ≥ 30 casos. Primero minimiza
 * correcciones, después escaladas innecesarias y por último la distancia al catálogo.
 * Con menos casos devuelve el del catálogo.
 */
export function umbralRecalibrado(registro: RegistroLaya, punto: string, ambito: string): number {
  const catalogo = umbralCatalogo(punto);
  const casos = registro.filter((c) => c.punto === punto && c.ambito === ambito);
  if (casos.length < MIN_CASOS_RECALIBRADO) return catalogo;
  const valores = [...new Set(casos.map((c) => c.p))].sort((a, b) => a - b);
  const candidatos = new Set<number>([catalogo, valores[0], UMBRAL_MAX]);
  for (let i = 0; i < valores.length; i++) {
    candidatos.add(valores[i]);
    if (i + 1 < valores.length) candidatos.add(Number(((valores[i] + valores[i + 1]) / 2).toFixed(6)));
  }
  let mejor = catalogo;
  let mejorCoste = coste(casos, catalogo, catalogo);
  for (const t of [...candidatos].sort((a, b) => a - b)) {
    const c = coste(casos, t, catalogo);
    if (menor(c, mejorCoste)) { mejor = t; mejorCoste = c; }
  }
  return mejor;
}

/** Fila del cuaderno de afinado de Laya: `{state, questions}` y el resultado como señal de afinado. */
const filaAfinado = (c: CasoLaya): Record<string, unknown> => ({ state: c.estado,
  questions: puntoDecision(c.punto)?.preguntas, punto: c.punto, answer_confidence: c.p,
  resultado: c.resultado, ambito: c.ambito, donde: c.donde, ms: c.ms });

/** Casos NO privados en JSONL, una línea por caso y con salto final; vacío si no hay ninguno. */
export function exportarJSONL(registro: RegistroLaya): string {
  const lineas = registro.filter((c) => !c.privado && typeof c.estado === "string").map((c) => JSON.stringify(filaAfinado(c)));
  return lineas.length ? `${lineas.join("\n")}\n` : "";
}
