/** Protomolécula · GRAFO DE CONVERGENCIA (architecture/protomolecula.md §3.3). PURO: sin React, red ni disco.
 * Dos programas de formatos distintos no se mezclan por dentro: intercambian exportaciones. Una arista `de → a`
 * es «la salida de `de` alimenta a `a`» (en una pizarra, una `CanvasEdge` entre ventanas: `{de: from, a: to}`).
 * Da el orden de ejecución (Kahn estable), los ciclos (DFS) y qué conexiones encajan directas, cuáles piden
 * conversión y cuáles no tienen arreglo. `ok` = sin ciclos, incompatibles ni conexiones sueltas. */
import type { DefinicionAtomo } from "./registro-atomos";

export interface Arista { de: string; a: string }
export interface AtomoGrafo { id: string; herramientaId: string }
export interface Diagnostico {
  ok: boolean; orden: string[]; ciclos: string[][]; avisos: string[];
  incompatibles: { arista: Arista; salidas: string[]; entradas: string[] }[];
  conversiones: { arista: Arista; ruta: string[] }[];
}
/** Cadena de formatos de `de` a `a` (p. ej. `["obj", "gltf", "glb"]`) o null si no hay conversor. */
export type RutaDe = (de: string, a: string) => string[] | null;
type Definicion = (herramientaId: string) => DefinicionAtomo | undefined;
/** Topes de la búsqueda de ciclos (un grafo muy enredado tiene muchísimos): pasado uno se corta y se avisa. */
export const TOPE_CICLOS = 50, TOPE_PASOS = 20_000;

const normalizar = (f: string): string => f.trim().toLowerCase().replace(/^\.+/, "");
const formatos = (lista: string[] | undefined): string[] =>
  [...new Set((lista ?? []).map(normalizar).filter((f) => f.length > 0))];
const sinRegistro = (at: AtomoGrafo): string =>
  `La herramienta ${at.herramientaId} (átomo ${at.id}) no está registrada: no sé qué produce ni qué recibe.`;

function evaluarArista(arista: Arista, origen: AtomoGrafo, destino: AtomoGrafo, definicion: Definicion,
  rutaDe: RutaDe, d: Diagnostico, avisar: (t: string) => void): void {
  const defO = definicion(origen.herramientaId), defD = definicion(destino.herramientaId);
  const salidas = formatos(defO?.salidas), entradas = formatos(defD?.entradas);
  const fallo = (motivo: string): void => { d.incompatibles.push({ arista, salidas, entradas }); avisar(motivo); };
  if (!defO) return fallo(sinRegistro(origen));
  if (!defD) return fallo(sinRegistro(destino));
  if (entradas.length === 0) return fallo(`La herramienta ${defD.nombre} no recibe archivos.`);
  if (salidas.length === 0) return fallo(`La herramienta ${defO.nombre} no produce archivos.`);
  if (salidas.some((s) => entradas.includes(s))) return;
  let mejor: string[] | null = null;
  for (const s of salidas) for (const e of entradas) {
    const ruta = rutaDe(s, e);
    if (ruta && ruta.length > 0 && (!mejor || ruta.length < mejor.length)) mejor = ruta.map(normalizar);
  }
  if (mejor) d.conversiones.push({ arista, ruta: mejor });
  else fallo(`No hay conversor de ${salidas.join(", ")} a ${entradas.join(", ")} (de ${defO.nombre} a ${defD.nombre}).`);
}

/** Kahn estable: entre los átomos listos sale siempre el primero en el orden de entrada. */
function ordenKahn(lista: AtomoGrafo[], sucesores: number[][], gradosIniciales: number[]): string[] {
  const grados = [...gradosIniciales];
  const hecho = lista.map(() => false), orden: string[] = [];
  for (;;) {
    const k = grados.findIndex((g, i) => g === 0 && !hecho[i]);
    if (k < 0) return orden;
    hecho[k] = true; orden.push(lista[k].id);
    for (const s of sucesores[k]) grados[s]--;
  }
}

/** CADA ciclo elemental una vez, empezando por su átomo de menor orden de entrada `s`: DFS desde `s` solo por
 * átomos posteriores que aún pueden volver a `s`. Si se llega a un tope, `cortado` lo dice (puede haber más). */
function ciclosDfs(lista: AtomoGrafo[], sucesores: number[][]): { ciclos: string[][]; cortado: boolean } {
  const ciclos: string[][] = [], previos = lista.map((): number[] => []);
  sucesores.forEach((ss, u) => ss.forEach((v) => previos[v].push(u)));
  let pasos = 0;
  const agotado = (): boolean => ciclos.length >= TOPE_CICLOS || pasos >= TOPE_PASOS;
  for (let s = 0; s < lista.length && !agotado(); s++) {
    const cola = [s]; // los que vuelven a `s` pasando solo por átomos posteriores a `s`
    for (let q = 0; q < cola.length; q++) for (const u of previos[cola[q]]) if (u > s && !cola.includes(u)) cola.push(u);
    const vuelve = new Set(cola);
    const camino: number[] = [];
    const visitar = (u: number): void => {
      camino.push(u);
      for (const v of sucesores[u]) {
        if (agotado()) break;
        if (v === s) ciclos.push(camino.map((k) => lista[k].id));
        else if (v > s && vuelve.has(v) && !camino.includes(v)) { pasos++; visitar(v); }
      }
      camino.pop();
    };
    visitar(s);
  }
  return { ciclos, cortado: agotado() };
}

export function analizarConvergencia(atomos: AtomoGrafo[], aristas: Arista[], definicion: Definicion,
  rutaDe: RutaDe): Diagnostico {
  const d: Diagnostico = { ok: false, orden: [], ciclos: [], incompatibles: [], conversiones: [], avisos: [] };
  const dichos = new Set<string>();
  const avisar = (t: string): void => { if (!dichos.has(t)) { dichos.add(t); d.avisos.push(t); } };
  const indice = new Map<string, number>();
  const lista: AtomoGrafo[] = [];
  for (const at of atomos) {
    if (indice.has(at.id)) { avisar(`El átomo ${at.id} está repetido: cuenta una vez.`); continue; }
    indice.set(at.id, lista.length);
    lista.push({ id: at.id, herramientaId: at.herramientaId });
    if (!definicion(at.herramientaId)) avisar(sinRegistro(at));
  }
  const sucesores = lista.map((): number[] => []), grados = lista.map(() => 0);
  const unicas = new Set<string>(); let sueltas = 0;
  for (const { de, a } of aristas) {
    const i = indice.get(de), j = indice.get(a);
    if (i === undefined || j === undefined) {
      sueltas++; avisar(`La conexión ${de} → ${a} apunta a un átomo que no está (${i === undefined ? de : a}): se ignora.`);
      continue;
    }
    if (unicas.has(`${i}>${j}`)) continue;
    unicas.add(`${i}>${j}`); sucesores[i].push(j); grados[j]++;
    evaluarArista({ de, a }, lista[i], lista[j], definicion, rutaDe, d, avisar);
  }
  d.orden = ordenKahn(lista, sucesores, grados);
  const { ciclos, cortado } = ciclosDfs(lista, sucesores); d.ciclos = ciclos;
  for (const c of ciclos) avisar(`Hay un ciclo: ${[...c, c[0]].join(" → ")}. Quita una de sus conexiones para poder ordenar.`);
  if (cortado) avisar(`Dejo de buscar ciclos tras ${ciclos.length} (el grafo está demasiado enredado): puede haber más.`);
  const enCiclo = new Set(ciclos.flat());
  const esperan = lista.filter((at) => !d.orden.includes(at.id) && !enCiclo.has(at.id)).map((at) => at.id);
  if (esperan.length > 0) avisar(`Sin orden porque dependen de un ciclo: ${esperan.join(", ")}.`);
  d.ok = ciclos.length === 0 && d.incompatibles.length === 0 && sueltas === 0;
  return d;
}
