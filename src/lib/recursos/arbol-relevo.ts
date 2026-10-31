// Árbol de relevo de un flujo por la malla (architecture/apps-en-la-malla.md §10 · tarea V).
// Puro: sin red, sin disco, sin reloj. Cada receptor tiene un solo padre y cada nodo
// sostiene como mucho floor(subida / kbpsFlujo) hijos; si su subida no se midió, uno.

export interface ReceptorRelevo {
  nodoId: string;
  subidaKbps?: number;
  latenciaMs?: number;
}

export interface NodoRelevo {
  hijos: string[];
  subidaKbps?: number;
  latenciaMs?: number;
}

export interface ArbolRelevo {
  origen: string;
  nodos: Map<string, NodoRelevo>;
  kbpsFlujo?: number;
}

export function capacidadRelevo(subidaKbps: number | undefined, kbpsFlujo: number): number {
  if (subidaKbps === undefined) return 1;
  if (!Number.isFinite(subidaKbps) || subidaKbps <= 0) return 0;
  const caudal = Number.isFinite(kbpsFlujo) && kbpsFlujo > 0 ? kbpsFlujo : 1;
  return Math.floor(subidaKbps / caudal);
}

/** Orden determinista: más capacidad, más subida, menos latencia y, al final, el id. */
function ordenarReceptores(
  receptores: ReceptorRelevo[],
  kbpsFlujo: number,
  origen: string,
): ReceptorRelevo[] {
  const vistos = new Set<string>();
  return receptores
    .filter((r) => {
      if (!r.nodoId || r.nodoId === origen || vistos.has(r.nodoId)) return false;
      vistos.add(r.nodoId);
      return true;
    })
    .sort((a, b) => {
      const ca = capacidadRelevo(a.subidaKbps, kbpsFlujo);
      const cb = capacidadRelevo(b.subidaKbps, kbpsFlujo);
      if (ca !== cb) return cb - ca;
      const sa = a.subidaKbps ?? -1;
      const sb = b.subidaKbps ?? -1;
      if (sa !== sb) return sb - sa;
      const latencia = (a.latenciaMs ?? Infinity) - (b.latenciaMs ?? Infinity);
      return latencia || (a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0);
    });
}

export function armarArbol(
  origen: string,
  receptores: ReceptorRelevo[],
  kbpsFlujo: number,
): ArbolRelevo {
  const nodos = new Map<string, NodoRelevo>([[origen, { hijos: [] }]]);
  const cola: { id: string; tope: number }[] = [{ id: origen, tope: 1 }];
  let cabeza = 0;
  for (const r of ordenarReceptores(receptores, kbpsFlujo, origen)) {
    while (cabeza < cola.length &&
      (nodos.get(cola[cabeza].id)?.hijos.length ?? 0) >= cola[cabeza].tope) {
      cabeza += 1;
    }
    const padre = cola[cabeza]?.id ?? origen;
    nodos.get(padre)!.hijos.push(r.nodoId);
    const nodo: NodoRelevo = { hijos: [] };
    if (r.subidaKbps !== undefined) nodo.subidaKbps = r.subidaKbps;
    if (r.latenciaMs !== undefined) nodo.latenciaMs = r.latenciaMs;
    nodos.set(r.nodoId, nodo);
    const tope = capacidadRelevo(r.subidaKbps, kbpsFlujo);
    if (tope > 0) cola.push({ id: r.nodoId, tope });
  }
  return { origen, nodos, kbpsFlujo };
}

export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  if (seVa === arbol.origen || !arbol.nodos.has(seVa)) return arbol;
  const nodos = new Map<string, NodoRelevo>();
  for (const [id, n] of arbol.nodos) nodos.set(id, { ...n, hijos: [...n.hijos] });
  const saliente = nodos.get(seVa)!;
  const ramas = [...saliente.hijos];
  saliente.hijos = [];
  for (const nodo of nodos.values()) {
    nodo.hijos = nodo.hijos.filter((hijo) => hijo !== seVa);
  }
  const kbpsFlujo = arbol.kbpsFlujo ?? 1;
  for (const rama of ramas) {
    const vetados = subarbol(nodos, rama);
    const padre = buscarPadre(nodos, arbol.origen, kbpsFlujo, vetados) ?? arbol.origen;
    nodos.get(padre)!.hijos.push(rama);
  }
  return { origen: arbol.origen, nodos, kbpsFlujo };
}

function subarbol(nodos: Map<string, NodoRelevo>, raiz: string, vistos = new Set<string>()): Set<string> {
  if (vistos.has(raiz)) return vistos;
  vistos.add(raiz);
  for (const hijo of nodos.get(raiz)?.hijos ?? []) subarbol(nodos, hijo, vistos);
  return vistos;
}

function buscarPadre(nodos: Map<string, NodoRelevo>, origen: string, kbpsFlujo: number, vetados: Set<string>): string | undefined {
  const cola = [origen];
  const vistos = new Set<string>();
  for (let i = 0; i < cola.length; i++) {
    const id = cola[i];
    if (vistos.has(id) || vetados.has(id)) continue;
    vistos.add(id);
    const nodo = nodos.get(id);
    if (!nodo) continue;
    const tope = id === origen ? 1 : capacidadRelevo(nodo.subidaKbps, kbpsFlujo);
    if (nodo.hijos.length < tope) return id;
    cola.push(...nodo.hijos.filter((hijo) => !vistos.has(hijo) && !vetados.has(hijo)));
  }
  return undefined;
}
