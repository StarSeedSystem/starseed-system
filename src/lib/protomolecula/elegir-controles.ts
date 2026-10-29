/**
 * Protomolécula · ELEGIR CONTROLES (PM1010F7B). Contrato: `architecture/protomolecula.md` §4.3 y nota
 * de la Ola 1026P (se enchufa antes de las reglas locales, sin otro planificador). Con más de 30
 * controles, Needle 3 o Jev proponen los 5 más probables; si no hay cupo o fallan, respaldo
 * determinista por distancia de nombres (`limpiarFrase` de `./dictado`). NUNCA aplica nada: devuelve
 * candidatos y la operación sigue por `decidirOperacion`. PURO: el modelo entra inyectado.
 */
import { limpiarFrase } from "./dictado";
import type { CandidatoParametro } from "./tipos";

export const UMBRAL_CONTROLES = 30;
export const MAX_ELEGIDOS = 5;

/** `ids`: referencias `atomoId::parametroId`, en orden de probabilidad. */
export interface EleccionControles { ok: boolean; ids?: string[]; motivo?: string }

export type ConsultarControles = (
  frase: string,
  candidatos: CandidatoParametro[],
  maximo: number,
) => Promise<EleccionControles | null>;

export interface DependenciasElegirControles {
  /** Needle 3 o Jev; el adaptador traduce su respuesta a referencias. */
  consultar?: ConsultarControles;
  /** false = cupo agotado: ni se llama al modelo. */
  hayCupo?: () => boolean;
  /** Cuántos devolver (por defecto y como máximo, 5). */
  maximo?: number;
}

/** Referencia estable de un candidato. */
export const refDe = (c: CandidatoParametro): string => `${c.ref.atomoId}::${c.ref.parametroId}`;

const LEJOS = 1e9;
function distancia(a: string, b: string): number {
  let f = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) f = f.reduce<number[]>((n, _, k) => (n.push(k ? Math.min(f[k] + 1, n[k - 1] + 1, f[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)) : i), n), []);
  return f[b.length];
}

/** Distancia mínima entre la frase y el nombre/sinónimos del control (0 = aparece tal cual). */
function cercania(frase: string, c: CandidatoParametro): number {
  const f = limpiarFrase(frase);
  const palabras = f.split(" ").filter(Boolean);
  const nombres = [c.parametro.nombre, ...(c.parametro.sinonimos ?? [])]
    .map((n) => limpiarFrase(n))
    .filter(Boolean);
  let mejor = LEJOS;
  for (const n of nombres) {
    if (f === n || f.includes(n)) return 0;
    mejor = Math.min(mejor, distancia(f, n));
    for (const a of palabras) {
      if (a.length < 3) continue;
      for (const b of n.split(" ").filter((w) => w.length >= 3)) mejor = Math.min(mejor, distancia(a, b));
    }
  }
  return mejor;
}

const normalizarMaximo = (n?: number): number =>
  typeof n === "number" && Number.isFinite(n)
    ? Math.max(1, Math.min(MAX_ELEGIDOS, Math.floor(n)))
    : MAX_ELEGIDOS;

function esCandidato(x: unknown): x is CandidatoParametro {
  const c = x as CandidatoParametro | null;
  return !!c && typeof c === "object" && !!c.ref && typeof c.ref.atomoId === "string"
    && typeof c.ref.parametroId === "string" && !!c.parametro && typeof c.parametro.nombre === "string";
}

/** Respaldo determinista: los más cercanos por nombre, con el orden original como desempate. */
export function seleccionDeterminista(
  frase: string,
  candidatos: CandidatoParametro[],
  maximo: number = MAX_ELEGIDOS,
): CandidatoParametro[] {
  return candidatos
    .map((c, i) => ({ c, i, d: cercania(frase, c) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, normalizarMaximo(maximo))
    .map((x) => x.c);
}

function ordenarPorIds(
  candidatos: CandidatoParametro[],
  r: EleccionControles | null,
): CandidatoParametro[] {
  if (!r || !r.ok || !Array.isArray(r.ids)) return [];
  const porRef = new Map(candidatos.map((c) => [refDe(c), c]));
  const vistos = new Set<string>();
  const out: CandidatoParametro[] = [];
  for (const id of r.ids) {
    if (typeof id !== "string" || vistos.has(id)) continue;
    const c = porRef.get(id);
    if (c) { vistos.add(id); out.push(c); }
  }
  return out;
}

export async function elegirControles(
  frase: string,
  candidatos: CandidatoParametro[],
  deps: DependenciasElegirControles = {},
): Promise<CandidatoParametro[]> {
  const lista = (Array.isArray(candidatos) ? candidatos : []).filter(esCandidato);
  const maximo = normalizarMaximo(deps.maximo);
  const respaldo = (): CandidatoParametro[] => seleccionDeterminista(frase, lista, maximo);
  if (lista.length <= UMBRAL_CONTROLES) return lista;
  if (!deps.consultar || (deps.hayCupo && !deps.hayCupo())) return respaldo();

  let eleccion: EleccionControles | null = null;
  try {
    eleccion = await deps.consultar(frase, lista, maximo);
  } catch {
    eleccion = null;
  }
  const elegidos = ordenarPorIds(lista, eleccion);
  return elegidos.length ? elegidos : respaldo();
}
