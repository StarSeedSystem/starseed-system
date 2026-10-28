/**
 * Protomolécula · ELEGIR CONTROLES (F7, esbozo). Módulo PURO: sin red, sin React, sin `node:*`.
 * Con más de 30 controles, pide a Needle 3 o Jev los 5 más probables y devuelve ESOS CANDIDATOS al
 * dictado; si callan, elige por distancia de nombres (lo de `./dictado`). Nunca aplica nada: la
 * operación sigue pasando por `decidirOperacion`.
 */
import { limpiarFrase } from "./dictado";
import type { CandidatoParametro } from "./tipos";

export const UMBRAL_CONTROLES = 30;
export const MAXIMO_CONTROLES = 5;

/** Herramienta mínima que entienden Needle 3 y el contrato de Jev (solo usamos su `name`). */
export interface HerramientaControl {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface DependenciasEleccion {
  /** Needle 3 o Jev inyectados: ids en orden de probabilidad (`null` si callan). */
  preguntar?: (frase: string, herramientas: HerramientaControl[], maximo: number) => Promise<string[] | null>;
  umbral?: number;
  maximo?: number;
}

export const claveDeCandidato = (c: CandidatoParametro): string => `${c.ref.atomoId}::${c.ref.parametroId}`;

export function herramientasDeCandidatos(candidatos: CandidatoParametro[]): HerramientaControl[] {
  return candidatos.map((c) => {
    const alias = (c.parametro.sinonimos ?? []).filter(Boolean);
    const donde = c.atomo ? ` de «${c.atomo}»` : "";
    return {
      name: claveDeCandidato(c),
      description: `Control «${c.parametro.nombre}»${donde}${alias.length ? ` (también: ${alias.join(", ")})` : ""}`,
      parameters: { type: "object", properties: { relevancia: { type: "number", description: "De 0 a 1, cuánto encaja." } }, required: ["relevancia"] },
    };
  });
}

const distancia = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a || !b) return a.length + b.length;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++)
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previa = fila;
  }
  return previa[b.length];
};

const puntuar = (fraseLimpia: string, c: CandidatoParametro): number => {
  const tokens = fraseLimpia.split(" ").filter(Boolean);
  const nombres = [c.parametro.nombre, ...(c.parametro.sinonimos ?? [])].map((n) => limpiarFrase(n)).filter(Boolean);
  let mejor = Infinity;
  for (const nombre of nombres) {
    if (fraseLimpia.includes(nombre)) return 0;
    const n = nombre.split(" ").length;
    for (let i = 0; i + n <= tokens.length; i++)
      mejor = Math.min(mejor, distancia(nombre, tokens.slice(i, i + n).join(" ")));
  }
  return mejor;
};

const comparar = (a: { c: CandidatoParametro; d: number }, b: { c: CandidatoParametro; d: number }): number => {
  if (a.d !== b.d) return a.d - b.d;
  const na = limpiarFrase(a.c.parametro.nombre), nb = limpiarFrase(b.c.parametro.nombre);
  if (na !== nb) return na < nb ? -1 : 1;
  const ka = claveDeCandidato(a.c), kb = claveDeCandidato(b.c);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/** Respaldo determinista: los `maximo` controles con el nombre más cerca de la frase. */
export function elegirPorNombre(frase: string, candidatos: CandidatoParametro[], maximo: number = MAXIMO_CONTROLES): CandidatoParametro[] {
  const tope = typeof maximo === "number" && Number.isFinite(maximo) ? Math.max(0, Math.floor(maximo)) : 0;
  if (!tope || !Array.isArray(candidatos) || !candidatos.length) return [];
  const limpia = limpiarFrase(typeof frase === "string" ? frase : "");
  return candidatos.map((c) => ({ c, d: puntuar(limpia, c) })).sort(comparar).slice(0, tope).map((x) => x.c);
}

/** Solo acepta ids que existan, sin repetir y en el orden que dio la IA. */
const ordenarPorIds = (candidatos: CandidatoParametro[], ids: string[] | null, maximo: number): CandidatoParametro[] => {
  const mapa = new Map<string, CandidatoParametro>();
  for (const c of candidatos) mapa.set(claveDeCandidato(c), c);
  const vistos = new Set<string>();
  const out: CandidatoParametro[] = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== "string" || vistos.has(id)) continue;
    const c = mapa.get(id);
    if (!c) continue;
    vistos.add(id);
    out.push(c);
    if (out.length >= maximo) break;
  }
  return out;
};

/**
 * Con más de 30 controles pide a Needle/Jev los más probables; con pocos, o si la IA calla o devuelve
 * ids que no existen, responde el respaldo determinista por nombre. Devuelve CANDIDATOS, nunca aplica.
 */
export async function elegirControles(frase: string, candidatos: CandidatoParametro[], deps: DependenciasEleccion = {}): Promise<CandidatoParametro[]> {
  const lista = Array.isArray(candidatos) ? candidatos.filter((c) => c && c.ref && c.parametro) : [];
  if (!lista.length) return [];
  const umbral = typeof deps.umbral === "number" && Number.isFinite(deps.umbral) ? Math.max(0, Math.floor(deps.umbral)) : UMBRAL_CONTROLES;
  const maximo = typeof deps.maximo === "number" && Number.isFinite(deps.maximo) ? Math.max(1, Math.floor(deps.maximo)) : MAXIMO_CONTROLES;
  if (lista.length <= umbral) return lista.slice();
  if (!deps.preguntar) return elegirPorNombre(frase, lista, maximo);

  let ids: string[] | null = null;
  try {
    ids = await deps.preguntar(typeof frase === "string" ? frase : "", herramientasDeCandidatos(lista), maximo);
  } catch {
    ids = null;
  }
  const elegidos = ordenarPorIds(lista, ids, maximo);
  return elegidos.length ? elegidos : elegirPorNombre(frase, lista, maximo);
}
