// Registro y recalibrado del umbral de Laya (architecture/laya-y-habilidades.md §6, Ola 1018L · LYS1018M).
// Cada decisión de Laya guarda punto, ámbito, `answer_confidence` (calibrada, nunca `confidence`), dónde
// corrió, cuánto tardó y su resultado; con ≥ 30 casos por punto y ámbito se recalibra el umbral del punto.
// PURA: sin red, sin disco, sin reloj (el `ts` lo pone quien llama) y sin cargas de modelo. Lo privado
// se guarda SOLO como huella y nunca sale en la exportación JSONL del cuaderno de afinado.
import type { MedioLaya } from "./puntos-decision";
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";

/** Resultado de una decisión de Laya: va bien, la corrigieron o se escaló. */
export type ResultadoLaya = "aceptada" | "corregida" | "escalada";

/** Un caso aprendido de una decisión de Laya (§6). */
export interface CasoLaya {
  readonly punto: string;
  readonly ambito: string;
  /** `answer_confidence` con la que se decidió, entre 0 y 1. */
  readonly p: number;
  readonly donde: MedioLaya;
  readonly ms: number;
  readonly resultado: ResultadoLaya;
  /** Estado completo si no es privado; huella «hXXXXXXXX» si lo es. */
  readonly estado: string;
  readonly privado: boolean;
  /** Marca de tiempo opcional (inyectada por quien llama; aquí no se lee el reloj). */
  readonly ts?: number;
}

/** El registro de aprendizaje es la lista de casos; `anotar` no muta, devuelve otro. */
export type RegistroAprendizaje = readonly CasoLaya[];

/** Casos mínimos de un punto y ámbito para recalibrar su umbral (§6: «con ≥ 30 casos»). */
export const MIN_CASOS_UMBRAL = 30;

/** Huella determinista del estado de un caso privado (FNV-1a de 32 bits, puro y sin Node). */
export function huellaEstado(estado: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < estado.length; i++) {
    h ^= estado.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `h${h.toString(16).padStart(8, "0")}`;
}

/** Anota un caso en el registro: si es privado, el estado se guarda SOLO como huella. */
export function anotar(registro: RegistroAprendizaje, caso: CasoLaya): RegistroAprendizaje {
  const guardado = caso.privado ? { ...caso, estado: huellaEstado(caso.estado) } : { ...caso };
  return [...registro, guardado];
}

/** Umbral que Jev/Laya usaría hoy para ese punto: el del catálogo, o el por defecto si no existe ahí. */
export function umbralDeCatalogo(punto: string): number {
  return puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;
}

/** Casos de un punto y un ámbito concretos. */
export const casosDe = (registro: RegistroAprendizaje, punto: string, ambito: string): readonly CasoLaya[] =>
  registro.filter((c) => c.punto === punto && c.ambito === ambito);

/**
 * Umbral recalibrado del punto y ámbito: el que menos decisiones «corregidas» deja pasar entre los
 * `answer_confidence` observados. Con menos de `MIN_CASOS_UMBRAL` casos, el umbral del catálogo.
 * Empate de correcciones: gana el umbral que deja pasar más casos (mayor cobertura) y, si hay empate
 * de nuevo, el más bajo (más permisivo) — nunca se inventa un umbral que no vimos en los datos.
 */
export function umbralRecalibrado(registro: RegistroAprendizaje, punto: string, ambito: string): number {
  const casos = casosDe(registro, punto, ambito);
  if (casos.length < MIN_CASOS_UMBRAL) return umbralDeCatalogo(punto);
  return Math.min(1, Math.max(0, menorCorreccion(casos) ?? umbralDeCatalogo(punto)));
}

/** Candidatos = cada `p` observado del punto y ámbito (de bajo a alto); elige por correcciones. */
function menorCorreccion(casos: readonly CasoLaya[]): number | null {
  const candidatos = [...new Set(casos.map((c) => c.p))].sort((a, b) => a - b);
  let mejor: { t: number; fallos: number; total: number } | null = null;
  for (const t of candidatos) {
    const permitidos = casos.filter((c) => c.p >= t);
    if (permitidos.length === 0) continue;
    const fallos = permitidos.filter((c) => c.resultado === "corregida").length;
    const gana = !mejor || fallos < mejor.fallos ||
      (fallos === mejor.fallos && permitidos.length > mejor.total);
    if (gana) mejor = { t, fallos, total: permitidos.length }; // empate total: se queda el más bajo
  }
  return mejor ? mejor.t : null;
}

/** Línea de JSONL del cuaderno de afinado de Laya (los campos del caso, sin la marca «privado»). */
export type LineaCuaderno = Omit<CasoLaya, "privado">;

/** Saca los casos NO privados en JSONL para el cuaderno de afinado (lo privado nunca sale, ni en huella). */
export function exportarJSONL(registro: RegistroAprendizaje): string {
  return registro
    .filter((c) => !c.privado)
    .map((c) => JSON.stringify({
      punto: c.punto, ambito: c.ambito, p: c.p, donde: c.donde, ms: c.ms,
      resultado: c.resultado, estado: c.estado, ts: c.ts,
    } satisfies LineaCuaderno))
    .join("\n");
}
