// Aprendizaje de Laya por punto y ámbito (architecture/laya-y-habilidades.md §6, Ola 1018L · LYS1018M).
// PURA: sin red, sin disco, sin reloj y sin modelo. Cada decisión se anota con su resultado
// (aceptada, corregida o escalada); lo privado se guarda SOLO como huella, nunca el texto.
// Con ≥ 30 casos por punto y ámbito se recalibra el umbral con `answer_confidence`; si hay menos,
// se conserva el del catálogo (puntos-decision.ts).
import { puntoDecision, UMBRAL_POR_DEFECTO, type PreguntaLaya } from "./puntos-decision";

export type ResultadoLaya = "aceptada" | "corregida" | "escalada";
export const RESULTADOS_LAYA: readonly ResultadoLaya[] = ["aceptada", "corregida", "escalada"];
/** Por debajo de este número de casos no se toca el umbral: manda el catálogo. */
export const MIN_CASOS_RECALIBRADO = 30;

export interface CasoLaya {
  readonly punto: string;
  readonly ambito: string;
  /** `answer_confidence` calibrada que traía la decisión, no `confidence`. */
  readonly p: number;
  readonly donde: string;
  readonly ms: number;
  readonly resultado: ResultadoLaya;
  readonly privado: boolean;
  /** Estado no privado, serializado tal cual para el cuaderno de afinado. */
  readonly estado?: string;
  /** Huella determinista del estado privado: el texto nunca se guarda. */
  readonly huella?: string;
}

export type RegistroLaya = readonly CasoLaya[];
/** Sin declarar `privado`, se asume privado: ante la duda, la privacidad no baja. */
export type AnotacionLaya = Omit<CasoLaya, "privado" | "estado" | "huella">
  & { readonly privado?: boolean; readonly estado?: unknown };

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`«${campo}» debe ser texto no vacío`);
  return valor.trim();
}

function numero(valor: unknown, campo: string, min: number, max: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < min || valor > max)
    throw new Error(`«${campo}» debe ser un número entre ${min} y ${max}`);
  return valor;
}

/** Ordena las claves para que la huella no dependa del orden en que llegó el objeto. */
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    return Object.fromEntries(Object.keys(objeto).sort().map((k) => [k, canonico(objeto[k])]));
  }
  return valor;
}

export function serializarEstado(estado: unknown): string {
  if (typeof estado === "string") return estado;
  try {
    const json = JSON.stringify(canonico(estado));
    return json === undefined ? String(estado) : json;
  } catch {
    return String(estado);
  }
}

/** cyrb53: huella determinista y sin dependencias de Node (vale también en el navegador). */
export function huellaDe(textoPlano: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < textoPlano.length; i++) {
    const c = textoPlano.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `huella:${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

export function anotar(registro: RegistroLaya, entrada: AnotacionLaya): RegistroLaya {
  const punto = texto(entrada.punto, "punto");
  const ambito = texto(entrada.ambito, "ambito");
  const p = numero(entrada.p, "p", 0, 1);
  const ms = numero(entrada.ms, "ms", 0, Number.MAX_SAFE_INTEGER);
  if (!RESULTADOS_LAYA.includes(entrada.resultado))
    throw new Error(`«resultado» debe ser ${RESULTADOS_LAYA.join(", ")}`);
  const privado = entrada.privado ?? true;
  const base = { punto, ambito, p, donde: texto(entrada.donde, "donde"), ms, resultado: entrada.resultado, privado };
  if (entrada.estado === undefined) return [...registro, base];
  const serializado = serializarEstado(entrada.estado);
  return [...registro, privado ? { ...base, huella: huellaDe(serializado) } : { ...base, estado: serializado }];
}

/** Preguntas del punto para el cuaderno de afinado; vacío si el id no está en el catálogo. */
export const preguntasDelPunto = (punto: string): Readonly<Record<string, PreguntaLaya>> =>
  puntoDecision(punto)?.preguntas ?? {};
export const umbralDelCatalogo = (punto: string): number => puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;

export function umbralRecalibrado(registro: RegistroLaya, punto: string, ambito: string): number {
  const delCatalogo = umbralDelCatalogo(punto);
  const casos = registro.filter((c) => c.punto === punto && c.ambito === ambito
    && typeof c.p === "number" && Number.isFinite(c.p) && c.p >= 0 && c.p <= 1);
  if (casos.length < MIN_CASOS_RECALIBRADO) return delCatalogo;
  // Candidatos: donde cambia alguna decisión (cada p observado) más los extremos.
  const candidatos = [...new Set<number>([0, 1, ...casos.map((c) => c.p)])].sort((a, b) => a - b);
  let mejor = { umbral: delCatalogo, utilidad: Number.NEGATIVE_INFINITY, correcciones: Infinity, aciertos: -1 };
  for (const umbral of candidatos) {
    let aciertos = 0, correcciones = 0;
    for (const c of casos) {
      if (c.p < umbral) continue;
      if (c.resultado === "aceptada") aciertos++;
      else if (c.resultado === "corregida") correcciones++;
    }
    // Se maximiza aciertos − correcciones: minimizar correcciones sin dejar de decidir.
    const utilidad = aciertos - correcciones;
    const gana = utilidad > mejor.utilidad
      || (utilidad === mejor.utilidad && (correcciones < mejor.correcciones
        || (correcciones === mejor.correcciones && aciertos > mejor.aciertos)));
    if (gana) mejor = { umbral, utilidad, correcciones, aciertos };
  }
  return mejor.umbral;
}

/** Una línea JSON por caso NO privado, con `state` y las `questions` del punto (cuaderno de afinado). */
export function exportarJSONL(registro: RegistroLaya): string {
  const lineas: string[] = [];
  for (const caso of registro) {
    if (caso.privado || typeof caso.estado !== "string" || !caso.estado.trim()) continue;
    const preguntas = preguntasDelPunto(caso.punto);
    const fila: Record<string, unknown> = {
      state: caso.estado, ...(Object.keys(preguntas).length ? { questions: preguntas } : {}),
      punto: caso.punto, ambito: caso.ambito, p: caso.p, donde: caso.donde, ms: caso.ms, resultado: caso.resultado,
    };
    lineas.push(JSON.stringify(fila));
  }
  return lineas.length ? `${lineas.join("\n")}\n` : "";
}
