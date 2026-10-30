// Aprendizaje de Laya (architecture/laya-y-habilidades.md §6, Ola 1018L · LYS1018M).
// Cada decisión se anota con su punto, ámbito, `answer_confidence` calibrada, dónde corrió,
// cuánto tardó y cómo acabó; con ≥ 30 casos se recalibra el umbral por punto y ámbito.
// Lo privado guarda el estado SOLO como huella: el texto nunca se escribe. Los casos no
// privados salen en JSONL con el formato del cuaderno de afinado de Laya.
// Módulo PURO: sin red, sin disco, sin reloj y sin modelos.
import { puntoDecision, UMBRAL_POR_DEFECTO, type IdPuntoDecision, type MedioLaya, type PreguntaLaya }
  from "./puntos-decision";

export type ResultadoLaya = "aceptada" | "corregida" | "escalada";

/** Casos mínimos de un punto y ámbito para que el umbral aprendido sustituya al del catálogo. */
export const MIN_CASOS_RECALIBRADO = 30;
/** Resolución del barrido de umbrales: una centésima. */
export const PASO_UMBRAL = 0.01;
const PASOS_UMBRAL = Math.round(1 / PASO_UMBRAL);

/** Caso de una decisión de Laya, tal como queda guardado en el registro. */
export interface CasoLaya {
  readonly punto: IdPuntoDecision | string;
  readonly ambito: string;
  /** `answer_confidence` calibrada que Laya dio al decidir (nunca `confidence`). */
  readonly p: number;
  readonly donde: MedioLaya | string;
  readonly ms: number;
  readonly resultado: ResultadoLaya;
  readonly privado: boolean;
  /** Estado original: solo cuando NO es privado. */
  readonly estado?: unknown;
  /** Huella estable del estado: solo cuando ES privado (el texto nunca se guarda). */
  readonly huella?: string;
  /** Preguntas tipadas del punto; si faltan se toman del catálogo al exportar. */
  readonly preguntas?: Readonly<Record<string, PreguntaLaya>>;
  /** Respuesta esperada (profesor) para el cuaderno de afinado. */
  readonly esperado?: Readonly<Record<string, unknown>>;
}

/** Lo que se entrega a `anotar`: igual que un caso, pero sin la huella (la calcula la función). */
export type EntradaCaso = Omit<CasoLaya, "huella">;

/** Huella estable y sin secretos de un estado (FNV-1a de 32 bits en hexadecimal). */
export function huellaEstado(estado: unknown): string {
  const texto = typeof estado === "string" ? estado : JSON.stringify(estado ?? null) ?? String(estado);
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Anota un caso al final del registro sin mutar la lista. Si es privado, el texto del estado
 * se descarta y solo queda su huella; si no, se guarda tal cual para el cuaderno de afinado.
 */
export function anotar(registro: readonly CasoLaya[], caso: EntradaCaso): CasoLaya[] {
  const { privado, estado, ...resto } = caso;
  const base = { ...resto, privado };
  const nuevo: CasoLaya = privado
    ? { ...base, huella: huellaEstado(estado) }
    : { ...base, estado };
  return [...registro, nuevo];
}

/** Umbral que trae el catálogo para el punto; el de por defecto si el punto no está en él. */
export function umbralDelCatalogo(punto: string): number {
  return puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;
}

/**
 * Umbral que minimiza las correcciones en un punto y ámbito (sobre `answer_confidence`, nunca
 * `confidence`). Solo se recalibra con ≥ 30 casos; con menos manda el catálogo. Nunca baja del
 * umbral del catálogo (bajar solo añadiría casos de baja confianza, no quitaría correcciones) y,
 * entre los que logran el mínimo, se queda el más bajo: así decide todo lo que no corrigió.
 */
export function umbralRecalibrado(
  registro: readonly CasoLaya[],
  punto: IdPuntoDecision | string,
  ambito: string,
): number {
  const casos = registro.filter(
    (c) => c.punto === punto && c.ambito === ambito && Number.isFinite(c.p),
  );
  if (casos.length < MIN_CASOS_RECALIBRADO) return umbralDelCatalogo(punto);
  const inicio = Math.min(1, Math.max(0, umbralDelCatalogo(punto)));
  let mejor = inicio;
  let erroresMejor = casos.length + 1;
  for (let i = Math.round(inicio * PASOS_UMBRAL); i <= PASOS_UMBRAL; i++) {
    const umbral = i / PASOS_UMBRAL;
    let errores = 0;
    for (const c of casos) if (c.p >= umbral && c.resultado === "corregida") errores += 1;
    if (errores < erroresMejor) {
      erroresMejor = errores;
      mejor = umbral;
    }
  }
  return Number(mejor.toFixed(2));
}

/** Preguntas del catálogo para el punto; vacío si no existe (la fila se exporta igual). */
function preguntasDe(punto: string): Readonly<Record<string, PreguntaLaya>> {
  return puntoDecision(punto)?.preguntas ?? {};
}

/** ¿El estado ya viene como fila del cuaderno (`state` + `questions` + `expected`/`gold`)? */
function pareceFilaLaya(estado: unknown): estado is Record<string, unknown> {
  return typeof estado === "object" && estado !== null && !Array.isArray(estado)
    && "state" in estado && "questions" in estado && ("expected" in estado || "gold" in estado);
}

/** Casos no privados en JSONL, una fila por caso con el formato del cuaderno de afinado de Laya. */
export function exportarJSONL(registro: readonly CasoLaya[]): string {
  const lineas = registro.filter((c) => !c.privado).map((c) => {
    const fila = pareceFilaLaya(c.estado)
      ? c.estado
      : { state: c.estado ?? null, questions: c.preguntas ?? preguntasDe(c.punto), expected: c.esperado ?? {} };
    return JSON.stringify(fila);
  });
  return lineas.length ? `${lineas.join("\n")}\n` : "";
}
