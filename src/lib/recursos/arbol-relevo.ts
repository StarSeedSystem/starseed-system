// Árbol de relevo (architecture/apps-en-la-malla.md §10, tarea V · Ola 1017A).
// Puro: sin red, sin disco, sin reloj. Determinista y sin inventar medidas.
export interface NodoRelevo {
  nodoId: string;
  subidaKbps?: number;
  latenciaMs?: number;
}

export interface ArbolRelevo {
  origen: string;
  kbpsFlujo: number;
  /** Padre de cada receptor; el origen no aparece como hijo. */
  padres: Map<string, string>;
  /** Hijos de cada nodo, en el orden en que se colocaron. */
  hijos: Map<string, string[]>;
  /** floor(subida / kbpsFlujo); sin medida, 1. */
  capacidades: Map<string, number>;
  /** Medidas recibidas, para recolocar sin inventar. */
  nodos: Map<string, NodoRelevo>;
}

const medida = (v?: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

function capacidadDe(n: NodoRelevo, kbps: number): number {
  const s = medida(n.subidaKbps);
  return s === undefined ? 1 : Math.max(0, Math.floor(s / kbps));
}

function comparar(a: NodoRelevo, b: NodoRelevo): number {
  const sa = medida(a.subidaKbps), sb = medida(b.subidaKbps);
  if (sa !== sb) return (sb ?? -1) - (sa ?? -1);
  const la = medida(a.latenciaMs) ?? Infinity, lb = medida(b.latenciaMs) ?? Infinity;
  if (la !== lb) return la - lb;
  return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}

function primerHueco(cola: string[], hijos: Map<string, string[]>, caps: Map<string, number>, desde: number): number {
  for (let i = desde; i < cola.length; i++) if ((hijos.get(cola[i])?.length ?? 0) < (caps.get(cola[i]) ?? 0)) return i;
  return -1;
}

function clonar(a: ArbolRelevo): ArbolRelevo {
  const hijos = new Map<string, string[]>();
  for (const [id, lista] of a.hijos) hijos.set(id, [...lista]);
  return { ...a, padres: new Map(a.padres), hijos, capacidades: new Map(a.capacidades), nodos: new Map(a.nodos) };
}

function conectados(origen: string, hijos: Map<string, string[]>): string[] {
  const cola: string[] = [], pendientes = [origen];
  while (pendientes.length > 0) {
    const id = pendientes.shift()!;
    cola.push(id);
    pendientes.push(...(hijos.get(id) ?? []));
  }
  return cola;
}

export function armarArbol(origen: NodoRelevo | string, receptores: NodoRelevo[], kbpsFlujo: number): ArbolRelevo {
  if (!Number.isFinite(kbpsFlujo) || kbpsFlujo <= 0) throw new Error("kbpsFlujo debe ser mayor que cero");
  const raiz = typeof origen === "string" ? { nodoId: origen } : origen;
  if (!raiz.nodoId) throw new Error("El origen necesita un nodoId");
  const vistos = new Set([raiz.nodoId]);
  const ordenados: NodoRelevo[] = [];
  for (const r of receptores) {
    if (!r || !r.nodoId || vistos.has(r.nodoId)) continue;
    vistos.add(r.nodoId);
    ordenados.push(r);
  }
  ordenados.sort(comparar);
  const padres = new Map<string, string>();
  const hijos = new Map<string, string[]>([[raiz.nodoId, []]]);
  const caps = new Map<string, number>([[raiz.nodoId, capacidadDe(raiz, kbpsFlujo)]]);
  const nodos = new Map<string, NodoRelevo>([[raiz.nodoId, raiz]]);
  const cola = [raiz.nodoId];
  let cursor = 0;
  for (const nodo of ordenados) {
    let i = primerHueco(cola, hijos, caps, cursor);
    if (i < 0) i = 0; // suelo: ningún receptor se queda fuera del árbol
    const padre = cola[i];
    padres.set(nodo.nodoId, padre);
    hijos.get(padre)!.push(nodo.nodoId);
    hijos.set(nodo.nodoId, []);
    caps.set(nodo.nodoId, capacidadDe(nodo, kbpsFlujo));
    nodos.set(nodo.nodoId, nodo);
    cola.push(nodo.nodoId);
    cursor = i;
  }
  return { origen: raiz.nodoId, kbpsFlujo, padres, hijos, capacidades: caps, nodos };
}

export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nuevo = clonar(arbol);
  const padre = nuevo.padres.get(seVa);
  if (!padre || seVa === nuevo.origen) return nuevo;
  const rama = [...(nuevo.hijos.get(seVa) ?? [])];
  nuevo.hijos.set(padre, (nuevo.hijos.get(padre) ?? []).filter((id) => id !== seVa));
  nuevo.padres.delete(seVa);
  nuevo.hijos.delete(seVa);
  nuevo.capacidades.delete(seVa);
  nuevo.nodos.delete(seVa);
  const cola = conectados(nuevo.origen, nuevo.hijos);
  rama.sort((a, b) => comparar(nuevo.nodos.get(a)!, nuevo.nodos.get(b)!));
  let cursor = 0;
  for (const raizRama of rama) {
    let i = primerHueco(cola, nuevo.hijos, nuevo.capacidades, cursor);
    if (i < 0) i = 0;
    const nuevoPadre = cola[i];
    nuevo.padres.set(raizRama, nuevoPadre);
    nuevo.hijos.get(nuevoPadre)!.push(raizRama);
    const sub = [raizRama];
    while (sub.length > 0) {
      const id = sub.shift()!;
      cola.push(id);
      sub.push(...(nuevo.hijos.get(id) ?? []));
    }
    cursor = i;
  }
  return nuevo;
}
