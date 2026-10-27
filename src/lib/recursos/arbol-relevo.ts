/** Árbol de relevo de medios (apps-en-la-malla.md §10, tarea V · Ola 1017A).
 * Más subida cerca del origen; cada nodo sostiene floor(subida / kbpsFlujo) hijos
 * (sin medida, uno). Puro y determinista: sin reloj, red ni disco. */
export type NodoRelevo = { nodoId: string; subidaKbps?: number; latenciaMs?: number };
export type ArbolRelevo = {
  origen: string;
  padres: Record<string, string>; // padre de cada receptor colocado
  sinSitio: string[]; // receptores sin hueco, en orden de prioridad
  nodos: Record<string, NodoRelevo>; // fichas colocadas (incluye el origen)
  flujoKbps: number;
};

/** Más subida primero; a igual subida, menos latencia y luego id estable. */
function comparar(a: NodoRelevo, b: NodoRelevo): number {
  const sa = a.subidaKbps !== undefined && Number.isFinite(a.subidaKbps) ? a.subidaKbps : -1;
  const sb = b.subidaKbps !== undefined && Number.isFinite(b.subidaKbps) ? b.subidaKbps : -1;
  if (sa !== sb) return sb - sa;
  const la = a.latenciaMs ?? Infinity;
  const lb = b.latenciaMs ?? Infinity;
  if (la !== lb) return la - lb;
  return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}

/** Hijos que puede sostener un nodo para un flujo dado. */
export function capacidadRelevo(nodo: NodoRelevo, kbpsFlujo: number): number {
  if (!(kbpsFlujo > 0)) return 1;
  const s = nodo.subidaKbps;
  return s === undefined || !Number.isFinite(s) ? 1 : Math.max(0, Math.floor(s / kbpsFlujo));
}

function hijosDe(padres: Record<string, string>, origen: string): Record<string, string[]> {
  const hijos: Record<string, string[]> = { [origen]: [] };
  for (const [hijo, padre] of Object.entries(padres)) (hijos[padre] ??= []).push(hijo);
  for (const lista of Object.values(hijos)) lista.sort();
  return hijos;
}

function clonar(a: ArbolRelevo): ArbolRelevo {
  return JSON.parse(JSON.stringify(a)) as ArbolRelevo;
}

/** Arma el árbol de relevo de un origen hacia sus receptores. */
export function armarArbol(
  origen: NodoRelevo,
  receptores: NodoRelevo[],
  kbpsFlujo: number
): ArbolRelevo {
  if (!(kbpsFlujo > 0) || !Number.isFinite(kbpsFlujo)) throw new RangeError("kbpsFlujo debe ser positivo");
  const unicos = new Map<string, NodoRelevo>();
  for (const r of receptores) if (r.nodoId !== origen.nodoId && !unicos.has(r.nodoId)) unicos.set(r.nodoId, { ...r });
  const orden = [...unicos.values()].sort(comparar);
  const nodos: Record<string, NodoRelevo> = { [origen.nodoId]: { ...origen } };
  const padres: Record<string, string> = {};
  const cola = [origen.nodoId];
  let puesto = 0;
  for (let i = 0; i < cola.length && puesto < orden.length; i++) {
    let libres = capacidadRelevo(nodos[cola[i]], kbpsFlujo);
    while (libres-- > 0 && puesto < orden.length) {
      const hijo = orden[puesto++];
      padres[hijo.nodoId] = cola[i];
      nodos[hijo.nodoId] = hijo;
      cola.push(hijo.nodoId);
    }
  }
  return { origen: origen.nodoId, padres, sinSitio: orden.slice(puesto).map(n => n.nodoId), nodos, flujoKbps: kbpsFlujo };
}

function profundidad(padres: Record<string, string>, origen: string, id: string): number {
  let d = 0;
  for (; id !== origen && padres[id] !== undefined; id = padres[id]) d++;
  return d;
}

/** Recoloca solo la rama del nodo que se va; el resto del árbol no cambia. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nuevo = clonar(arbol);
  if (seVa === arbol.origen) {
    const orden = Object.keys(arbol.nodos).filter(id => id !== seVa).map(id => arbol.nodos[id]);
    return { ...nuevo, padres: {}, sinSitio: orden.sort(comparar).map(n => n.nodoId), nodos: { [seVa]: { ...arbol.nodos[seVa] } } };
  }
  if (!(seVa in arbol.padres)) return { ...nuevo, sinSitio: nuevo.sinSitio.filter(id => id !== seVa) };
  const hijos = hijosDe(nuevo.padres, nuevo.origen);
  const raices = [...(hijos[seVa] ?? [])];
  const sinColocar = new Set<string>();
  const pila = [...raices];
  while (pila.length) {
    const id = pila.pop() as string;
    if (sinColocar.has(id)) continue;
    sinColocar.add(id);
    pila.push(...(hijos[id] ?? []));
  }
  delete nuevo.padres[seVa]; delete nuevo.nodos[seVa];
  for (const raiz of raices) delete nuevo.padres[raiz];
  const restantes = hijosDe(nuevo.padres, nuevo.origen);
  const libre = (id: string) => capacidadRelevo(nuevo.nodos[id], nuevo.flujoKbps) - (restantes[id]?.length ?? 0);
  const sinSitio = [...nuevo.sinSitio];
  for (const raiz of raices.map(id => nuevo.nodos[id]).sort(comparar).map(n => n.nodoId)) {
    const sub = new Set<string>();
    const pendientes = [raiz];
    while (pendientes.length) {
      const id = pendientes.pop() as string;
      if (sub.has(id)) { continue; }
      sub.add(id);
      pendientes.push(...(hijos[id] ?? []));
    }
    const hueco = Object.keys(nuevo.nodos)
      .filter(id => !sinColocar.has(id) && libre(id) > 0)
      .sort((a, b) => profundidad(nuevo.padres, nuevo.origen, a) - profundidad(nuevo.padres, nuevo.origen, b) || comparar(nuevo.nodos[a], nuevo.nodos[b]))[0];
    if (hueco === undefined) {
      for (const id of sub) { delete nuevo.padres[id]; delete nuevo.nodos[id]; sinSitio.push(id); }
    } else {
      nuevo.padres[raiz] = hueco;
      (restantes[hueco] ??= []).push(raiz);
    }
    for (const id of sub) sinColocar.delete(id);
  }
  return { ...nuevo, sinSitio: sinSitio.sort() };
}
