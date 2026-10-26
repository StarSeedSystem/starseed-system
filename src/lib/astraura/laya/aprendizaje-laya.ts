// Aprendizaje de Laya (architecture/laya-y-habilidades.md §6, Ola 1018L · tarea M).
// Anota cada decisión con su punto, ámbito, `answer_confidence` (la calibrada, nunca
// `confidence`), medio, ms y resultado; con ≥ 30 casos recalibra el umbral solo.
// Lo privado se guarda SOLO como huella. PURA: sin red, disco, reloj ni modelo.
import { puntoDecision, UMBRAL_POR_DEFECTO, type IdPuntoDecision, type MedioLaya } from "./puntos-decision";

export type ResultadoLaya = "aceptada" | "corregida" | "escalada";
/** Casos mínimos por punto y ámbito antes de mover el umbral del catálogo. */
export const MIN_CASOS_RECALIBRADO = 30;

interface CasoBase {
  readonly punto: IdPuntoDecision; readonly ambito: string;
  /** `answer_confidence` calibrada que dio Laya en esta decisión. */
  readonly p: number; readonly donde: MedioLaya; readonly ms: number;
  readonly resultado: ResultadoLaya;
}

/** Un caso del registro: el estado completo si es público, o solo su huella si es privado. */
export type CasoLaya =
  | (CasoBase & { readonly privado: false; readonly estado: unknown })
  | (CasoBase & { readonly privado: true; readonly huella: string });
export type RegistroLaya = readonly CasoLaya[];

export type EntradaRegistroLaya = CasoBase & { readonly privado: boolean; readonly estado: unknown };

const RESULTADOS: readonly ResultadoLaya[] = ["aceptada", "corregida", "escalada"];

/** Serialización canónica y estable: mismas claves en cualquier orden dan el mismo texto. */
function canonico(valor: unknown, vistos: WeakSet<object>): string {
  if (valor === null) return "null";
  if (typeof valor === "string") return JSON.stringify(valor);
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "null";
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (typeof valor === "bigint") return `${valor}n`;
  if (Array.isArray(valor)) return `[${valor.map((v) => canonico(v, vistos)).join(",")}]`;
  if (typeof valor !== "object") return "null";
  if (vistos.has(valor)) return '"[círculo]"';
  vistos.add(valor);
  const objeto = valor as Record<string, unknown>;
  const cuerpo = Object.keys(objeto).sort().map((k) => `${JSON.stringify(k)}:${canonico(objeto[k], vistos)}`).join(",");
  vistos.delete(valor);
  return `{${cuerpo}}`;
}

/** Huella estable y no criptográfica de un estado privado: empareja, no permite recuperarlo. */
export function huellaEstado(estado: unknown): string {
  const texto = canonico(estado, new WeakSet());
  let h1 = 2166136261, h2 = 2246822519;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 3266489917) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Anota un caso en un registro NUEVO; si es privado guarda solo la huella, nunca el estado. */
export function anotar(registro: RegistroLaya, entrada: EntradaRegistroLaya): RegistroLaya {
  const ambito = entrada.ambito.trim();
  if (!ambito) throw new Error("el ámbito de Laya no puede estar vacío");
  if (typeof entrada.p !== "number" || !Number.isFinite(entrada.p) || entrada.p < 0 || entrada.p > 1)
    throw new Error(`answer_confidence fuera de 0–1: «${String(entrada.p)}»`);
  if (typeof entrada.ms !== "number" || !Number.isFinite(entrada.ms) || entrada.ms < 0)
    throw new Error(`ms inválido: «${String(entrada.ms)}»`);
  if (!RESULTADOS.includes(entrada.resultado))
    throw new Error(`resultado desconocido: «${String(entrada.resultado)}»`);
  const base = { punto: entrada.punto, ambito, p: entrada.p, donde: entrada.donde, ms: entrada.ms, resultado: entrada.resultado };
  const caso: CasoLaya = entrada.privado
    ? { ...base, privado: true, huella: huellaEstado(entrada.estado) }
    : { ...base, privado: false, estado: entrada.estado };
  return [...registro, caso];
}

/** Correcciones que costaría decidir con `umbral`: aceptar lo corregido o dudar de lo bueno. */
function correccionesDe(casos: readonly CasoLaya[], umbral: number): number {
  let coste = 0;
  for (const c of casos) {
    const acepta = c.p >= umbral;
    if (acepta ? c.resultado !== "aceptada" : c.resultado === "aceptada") coste++;
  }
  return coste;
}

/**
 * Umbral que minimiza correcciones para ese punto y ámbito; con menos de 30 casos, el del
 * catálogo. Empates: el más cercano al catálogo y, si siguen empatados, el más alto.
 */
export function umbralRecalibrado(registro: RegistroLaya, punto: IdPuntoDecision, ambito: string): number {
  const actual = puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;
  const clave = ambito.trim();
  const casos = registro.filter((c) => c.punto === punto && c.ambito === clave);
  if (casos.length < MIN_CASOS_RECALIBRADO) return actual;
  let mejor = actual, costeMejor = correccionesDe(casos, actual), distancia = 0;
  for (let i = 0; i <= 100; i++) {
    const t = Number((i / 100).toFixed(2));
    const coste = correccionesDe(casos, t);
    const d = Math.abs(t - actual);
    if (coste < costeMejor || (coste === costeMejor && (d < distancia || (d === distancia && t > mejor)))) {
      mejor = t;
      costeMejor = coste;
      distancia = d;
    }
  }
  return mejor;
}

export type LineaAfinado = {
  readonly punto: IdPuntoDecision; readonly ambito: string; readonly estado: unknown;
  readonly answer_confidence: number; readonly resultado: ResultadoLaya;
  readonly donde: MedioLaya; readonly ms: number;
};

/** Una línea JSON por caso NO privado, con la forma del cuaderno de afinado de Laya. */
export function exportarJSONL(registro: RegistroLaya): string {
  const lineas = registro.filter((c) => !c.privado).map((c) => JSON.stringify({
    punto: c.punto, ambito: c.ambito, estado: c.estado, answer_confidence: c.p,
    resultado: c.resultado, donde: c.donde, ms: c.ms,
  } satisfies LineaAfinado));
  return lineas.length ? lineas.join("\n") + "\n" : "";
}
