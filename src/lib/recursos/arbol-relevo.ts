// Árbol de relevo para publicaciones y transmisiones por la malla
// (architecture/apps-en-la-malla.md §10). Puro: sin red, disco ni reloj.
// Los de más subida quedan más cerca del origen; recolocar solo mueve la rama del que se fue.

export type NodoRelevo = {
  nodoId: string;
  subidaKbps?: number;
  latenciaMs?: number;
};

export type ArbolRelevo = {
  origen: string;
  kbpsFlujo: number;
  nodos: Map<string, NodoRelevo>; // receptores colocados (el origen no es receptor)
  padreDe: Map<string, string>; // receptor → padre directo
};

/** Hijos directos que puede sostener un nodo: floor(subida / flujo), mínimo 1; sin medida: 1. */
export function capacidadRelevo(nodo: NodoRelevo | undefined, kbpsFlujo: number): number {
  if (!nodo || nodo.subidaKbps === undefined) return 1;
  const flujo = kbpsFlujo > 0 && Number.isFinite(kbpsFlujo) ? kbpsFlujo : 1;
  return Math.max(1, Math.floor(nodo.subidaKbps / flujo));
}

/** Orden determinista de colocación: más subida, después menos latencia, después id. */
export function compararRelevo(a: NodoRelevo, b: NodoRelevo): number {
  const subA = a.subidaKbps ?? -1;
  const subB = b.subidaKbps ?? -1;
  if (subA !== subB) return subB - subA;
  const latA = a.latenciaMs ?? Number.POSITIVE_INFINITY;
  const latB = b.latenciaMs ?? Number.POSITIVE_INFINITY;
  if (latA !== latB) return latA - latB;
  return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}

/** Arma el árbol en anchura: cada padre admite hijos hasta su capacidad, en el orden del comparador. */
export function armarArbol(
  origen: string,
  receptores: NodoRelevo[],
  kbpsFlujo: number
): ArbolRelevo {
  const nodos = new Map<string, NodoRelevo>();
  const orden: NodoRelevo[] = [];
  for (const r of receptores) {
    if (r.nodoId === origen || nodos.has(r.nodoId)) continue; // sin auto-bucle ni duplicados
    nodos.set(r.nodoId, r);
    orden.push(r);
  }
  orden.sort(compararRelevo);
  const padreDe = new Map<string, string>();
  const cola: string[] = [origen];
  let i = 0;
  while (cola.length > 0 && i < orden.length) {
    const padre = cola.shift() as string;
    let libres = capacidadRelevo(padre === origen ? undefined : nodos.get(padre), kbpsFlujo);
    while (libres > 0 && i < orden.length) {
      padreDe.set(orden[i].nodoId, padre);
      cola.push(orden[i].nodoId);
      i += 1;
      libres -= 1;
    }
  }
  return { origen, kbpsFlujo, nodos, padreDe };
}

/** Distancia de cada receptor al origen (1 = hijo directo). */
export function profundidades(arbol: ArbolRelevo): Map<string, number> {
  const res = new Map<string, number>();
  for (const id of arbol.nodos.keys()) {
    let d = 1, actual: string | undefined = arbol.padreDe.get(id), pasos = 0;
    while (actual !== undefined && actual !== arbol.origen && pasos <= arbol.nodos.size) {
      d += 1;
      pasos += 1;
      actual = arbol.padreDe.get(actual);
    }
    res.set(id, d);
  }
  return res;
}

/** Cuando `seVa` se va: quítalo y recoloca solo a sus hijos directos y a nadie más. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nodos = new Map(arbol.nodos);
  const padreDe = new Map(arbol.padreDe);
  if (!nodos.has(seVa)) return { ...arbol, nodos, padreDe }; // el origen no se recoloca: si se va, el flujo termina
  const padreViejo = padreDe.get(seVa);
  nodos.delete(seVa); padreDe.delete(seVa);
  const huerfanos = [...padreDe.entries()].filter(([, p]) => p === seVa).map(([h]) => nodos.get(h) as NodoRelevo).sort(compararRelevo);
  for (const h of huerfanos) padreDe.delete(h.nodoId);
  const hijosDe = new Map<string, string[]>();
  for (const [h, p] of padreDe) hijosDe.set(p, [...(hijosDe.get(p) ?? []), h]);
  for (const lista of hijosDe.values()) lista.sort((x, y) => compararRelevo(nodos.get(x) as NodoRelevo, nodos.get(y) as NodoRelevo));
  const usa = new Map<string, number>();
  for (const [p, lista] of hijosDe) usa.set(p, lista.length);
  const coloca = (raiz: string, faltan: NodoRelevo[]): number => {
    let oi = 0;
    const cola: string[] = [raiz];
    const vistas = new Set<string>();
    while (cola.length > 0 && oi < faltan.length) {
      const nodo = cola.shift() as string;
      if (vistas.has(nodo)) continue;
      vistas.add(nodo);
      const datos = nodo === arbol.origen ? undefined : nodos.get(nodo);
      let libres = capacidadRelevo(datos, arbol.kbpsFlujo) - (usa.get(nodo) ?? 0);
      while (libres > 0 && oi < faltan.length) {
        const h = faltan[oi];
        oi += 1;
        padreDe.set(h.nodoId, nodo);
        hijosDe.set(nodo, [...(hijosDe.get(nodo) ?? []), h.nodoId]);
        usa.set(nodo, (usa.get(nodo) ?? 0) + 1);
        libres -= 1;
      }
      for (const c of hijosDe.get(nodo) ?? []) if (!vistas.has(c)) cola.push(c);
    }
    return oi;
  };
  const ya = padreViejo ? coloca(padreViejo, huerfanos) : 0;
  if (ya < huerfanos.length) coloca(arbol.origen, huerfanos.slice(ya)); // red de seguridad: árbol entero
  return { origen: arbol.origen, kbpsFlujo: arbol.kbpsFlujo, nodos, padreDe };
}
