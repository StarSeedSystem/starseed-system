/**
 * Protomolécula · ELEGIR CONTROLES (Ola 1010P · F7, esbozo).
 * Con muchos controles abiertos (> 30), el dictado necesita una lista corta. Este módulo pregunta a Needle 3 o a
 * Jev los 5 más probables y, si no responden, elige de forma DETERMINISTA por parecido de nombres. Nunca aplica
 * nada: devuelve CANDIDATOS para que `entenderDictado` los use y la operación siga pasando por `decidirOperacion`.
 */
import { limpiarFrase } from "./dictado";
import type { CandidatoParametro } from "./tipos";

export const MAX_CONTROLES_SIN_IA = 30;
export const CANDIDATOS_ELEGIDOS = 5;

export interface PeticionElegir { frase: string; candidatos: CandidatoParametro[]; max: number }
export interface RespuestaEleccion { ids: string[]; motor?: "needle" | "jev" }
/** El adaptador real llama a Needle 3 o a Jev; aquí entra inyectado para probar sin red. */
export type ElegirConIA = (peticion: PeticionElegir) => Promise<RespuestaEleccion | null>;

export interface DependenciasElegirControles {
  elegirConIA?: ElegirConIA;
  maxElegidos?: number;
  limiteSinIA?: number;
}

export type MotorEleccion = "sin-necesidad" | "needle" | "jev" | "distancia";

export interface ResultadoElegirControles {
  candidatos: CandidatoParametro[];
  motor: MotorEleccion;
  motivo?: string;
}

/** Id estable de un candidato: `atomoId::parametroId` (el mismo que usa el estado de la molécula). */
export const claveDe = (c: CandidatoParametro): string => `${c.ref.atomoId}::${c.ref.parametroId}`;

/** Distancia de Levenshtein (la misma idea que usa la sugerencia de `dictado.ts`). */
function distancia(a: string, b: string): number {
  let f = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    f = f.reduce<number[]>((n, _, k) => {
      n.push(k ? Math.min(f[k] + 1, n[k - 1] + 1, f[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)) : i);
      return n;
    }, []);
  }
  return f[b.length];
}

/** Verbos, artículos, conectores y números no ayudan a reconocer un control. */
const IGNORAR = /^(?:-?\d+(?:[.,]\d+)?|%|sube|subir|baja|bajar|pon|poner|fija|ajusta|deja|cambia|activa|desactiva|alterna|dispara|el|la|los|las|un|una|unos|unas|de|del|al|a|en|hasta|por|y)$/;
const palabrasDe = (frase: string): string[] => {
  const t = limpiarFrase(frase).split(" ").filter((w) => w && !IGNORAR.test(w));
  return t.length ? t : limpiarFrase(frase).split(" ").filter(Boolean);
};

/** Parecido mínimo entre las palabras de la frase y las del nombre, sinónimos y átomo. */
function parecido(frase: string[], c: CandidatoParametro): number {
  const palabras = [c.parametro.nombre, ...(c.parametro.sinonimos ?? []), c.atomo ?? ""]
    .flatMap((n) => limpiarFrase(n).split(" ")).filter(Boolean);
  let mejor = Number.POSITIVE_INFINITY;
  for (const a of frase) for (const b of palabras) mejor = Math.min(mejor, distancia(a, b));
  return mejor;
}

/** Respaldo determinista: ordena por parecido y, si empatan, conserva el orden original. */
function porDistancia(frase: string, candidatos: CandidatoParametro[], max: number): CandidatoParametro[] {
  const palabras = palabrasDe(frase);
  return candidatos
    .map((c, i) => ({ c, i, d: parecido(palabras, c) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, max)
    .map((x) => x.c);
}

/**
 * Devuelve los controles entre los que el dictado debe buscar: todos si son pocos, o los más probables (5 por
 * defecto) cuando hay más de 30. Si Needle/Jev no responden, cae al parecido de nombres. No aplica nada.
 */
export async function elegirControles(
  frase: string,
  candidatos: CandidatoParametro[],
  deps: DependenciasElegirControles = {},
): Promise<ResultadoElegirControles> {
  const todos = Array.isArray(candidatos) ? candidatos.slice() : [];
  const max = Math.max(1, deps.maxElegidos ?? CANDIDATOS_ELEGIDOS);
  const limite = deps.limiteSinIA ?? MAX_CONTROLES_SIN_IA;
  if (!todos.length) return { candidatos: [], motor: "sin-necesidad", motivo: "No hay controles abiertos." };
  if (todos.length <= limite) return { candidatos: todos, motor: "sin-necesidad" };

  if (deps.elegirConIA) {
    let respuesta: RespuestaEleccion | null = null;
    try {
      respuesta = await deps.elegirConIA({ frase, candidatos: todos, max });
    } catch {
      respuesta = null;
    }
    const elegidos: CandidatoParametro[] = [];
    const vistos = new Set<string>();
    if (respuesta && Array.isArray(respuesta.ids)) {
      for (const id of respuesta.ids) {
        if (typeof id !== "string") continue;
        const c = todos.find((x) => claveDe(x) === id)
          ?? todos.find((x) => limpiarFrase(x.parametro.nombre) === limpiarFrase(id));
        if (!c || vistos.has(claveDe(c))) continue;
        elegidos.push(c);
        vistos.add(claveDe(c));
        if (elegidos.length >= max) break;
      }
    }
    if (elegidos.length) return { candidatos: elegidos, motor: respuesta?.motor ?? "needle" };
  }

  return {
    candidatos: porDistancia(frase, todos, max),
    motor: "distancia",
    motivo: deps.elegirConIA ? "la IA no respondió; elegí por parecido de nombres" : "sin IA conectada; elegí por parecido de nombres",
  };
}
