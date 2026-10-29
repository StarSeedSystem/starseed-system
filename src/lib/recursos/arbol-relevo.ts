// Árbol de relevo (architecture/apps-en-la-malla.md §10, tarea V · Ola 1017A)
// Puro: sin red, sin disco, sin reloj. Cada nodo sostiene como mucho
// floor(subida / kbpsFlujo) hijos; sin medida, 1. El origen es la raíz.

export interface Receptor { nodoId: string; subidaKbps?: number; latenciaMs?: number; }
export type OrigenRelevo = Receptor;
export interface NodoArbol extends Receptor {
  padre: string | null; hijos: string[]; capacidadHijos: number; profundidad: number;
}
export interface ArbolRelevo {
  origen: string; kbpsFlujo: number;
  nodos: Map<string, NodoArbol>;
  /** Padre de cada receptor; el origen no aparece porque es la raíz. */
  padres: Map<string, string>;
}

const flujoValido = (kbpsFlujo: number) => (Number.isFinite(kbpsFlujo) && kbpsFlujo > 0 ? kbpsFlujo : 1);

/** Hijos que puede sostener: medido -> floor; sin medida o roto -> 1; cero o menos -> 0. */
export function capacidadDe(subidaKbps: number | undefined, kbpsFlujo: number): number {
  if (subidaKbps === undefined || !Number.isFinite(subidaKbps)) return 1;
  return subidaKbps <= 0 ? 0 : Math.max(0, Math.floor(subidaKbps / flujoValido(kbpsFlujo)));
}

function subidaOrden(r: Receptor): number {
  return Number.isFinite(r.subidaKbps) && (r.subidaKbps as number) > 0 ? (r.subidaKbps as number) : 0;
}

function latenciaOrden(r: Receptor): number {
  const v = r.latenciaMs as number;
  return Number.isFinite(v) && v >= 0 ? v : Number.POSITIVE_INFINITY;
}

function comparar(a: Receptor, b: Receptor): number {
  const subida = subidaOrden(b) - subidaOrden(a);
  return subida !== 0 ? subida : latenciaOrden(a) - latenciaOrden(b) || (a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0);
}

function normalizar(origen: string, receptores: Receptor[]): Receptor[] {
  const vistos = new Set<string>();
  return receptores.filter((r) => r.nodoId !== "" && r.nodoId !== origen).sort(comparar)
    .filter((r) => (vistos.has(r.nodoId) ? false : (vistos.add(r.nodoId), true)));
}

export function armarArbol(
  origen: string | OrigenRelevo,
  receptores: Receptor[],
  kbpsFlujo: number,
): ArbolRelevo {
  const raizId = typeof origen === "string" ? origen : origen.nodoId;
  const flujo = flujoValido(kbpsFlujo);
  const medida = typeof origen === "string" ? undefined : origen.subidaKbps;
  const raiz: NodoArbol = {
    nodoId: raizId, padre: null, hijos: [], capacidadHijos: capacidadDe(medida, flujo),
    subidaKbps: medida, latenciaMs: typeof origen === "string" ? undefined : origen.latenciaMs, profundidad: 0,
  };
  const nodos = new Map<string, NodoArbol>([[raizId, raiz]]);
  const padres = new Map<string, string>();
  const cola: NodoArbol[] = [raiz];
  let cursor = 0;
  for (const receptor of normalizar(raizId, receptores)) {
    while (cursor < cola.length && cola[cursor].hijos.length >= cola[cursor].capacidadHijos) cursor++;
    const padre = cola[cursor];
    if (!padre) break;
    const nodo: NodoArbol = {
      ...receptor, padre: padre.nodoId, hijos: [],
      capacidadHijos: capacidadDe(receptor.subidaKbps, flujo), profundidad: padre.profundidad + 1,
    };
    nodos.set(nodo.nodoId, nodo);
    padres.set(nodo.nodoId, padre.nodoId);
    padre.hijos.push(nodo.nodoId);
    cola.push(nodo);
  }
  return { origen: raizId, kbpsFlujo: flujo, nodos, padres };
}

function porAnchura(nodos: Map<string, NodoArbol>, origen: string): NodoArbol[] {
  const orden: NodoArbol[] = []; const vistos = new Set<string>(); const cola = [origen];
  while (cola.length > 0) {
    const id = cola.shift() as string; const nodo = nodos.get(id);
    if (!nodo || vistos.has(id)) continue;
    vistos.add(id); orden.push(nodo); cola.push(...nodo.hijos);
  }
  return orden;
}

function reindexar(origen: string, nodos: Map<string, NodoArbol>, kbpsFlujo: number): ArbolRelevo {
  const padres = new Map<string, string>();
  for (const nodo of porAnchura(nodos, origen)) for (const hijoId of nodo.hijos) {
    const hijo = nodos.get(hijoId);
    if (hijo) { hijo.padre = nodo.nodoId; hijo.profundidad = nodo.profundidad + 1; padres.set(hijoId, nodo.nodoId); }
  }
  return { origen, kbpsFlujo, nodos, padres };
}

const clonar = (nodos: Map<string, NodoArbol>) =>
  new Map([...nodos].map(([id, n]) => [id, { ...n, hijos: [...n.hijos] }]));

/** Quita a `seVa` y recoloca solo su rama; el resto conserva su padre. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nodos = clonar(arbol.nodos);
  if (!nodos.has(seVa)) return reindexar(arbol.origen, nodos, arbol.kbpsFlujo);
  if (seVa === arbol.origen) {
    const raiz = nodos.get(arbol.origen) as NodoArbol; raiz.hijos = [];
    return { origen: raiz.nodoId, kbpsFlujo: arbol.kbpsFlujo, nodos: new Map([[raiz.nodoId, raiz]]), padres: new Map() };
  }
  const saliente = nodos.get(seVa) as NodoArbol;
  const ramas = saliente.hijos.map((id) => nodos.get(id)).filter((n): n is NodoArbol => n !== undefined);
  const padre = saliente.padre ? nodos.get(saliente.padre) : undefined;
  if (padre) padre.hijos = padre.hijos.filter((id) => id !== seVa);
  nodos.delete(seVa);
  for (const rama of ramas.sort(comparar)) {
    const disponibles = porAnchura(nodos, arbol.origen);
    // Si el árbol ya está lleno, cuelga del más superficial para no perder la rama.
    const destino = disponibles.find((n) => n.hijos.length < n.capacidadHijos) ?? disponibles[0];
    if (!destino) break;
    rama.padre = destino.nodoId; destino.hijos.push(rama.nodoId);
  }
  return reindexar(arbol.origen, nodos, arbol.kbpsFlujo);
}
