// Árbol de relevo de un flujo por la malla (architecture/apps-en-la-malla.md §10 · tarea V, Ola 1017A).
// Puro y determinista: sin red, sin disco, sin reloj. El origen reparte y cada receptor reemite.

export interface ReceptorArbol {
  nodoId: string;
  subidaKbps?: number; // subida medida; si falta, se supone capacidad para un hijo
  latenciaMs?: number; // desempate: la menor latencia queda más cerca del origen
}

export interface ArbolRelevo {
  origen: string;
  kbpsFlujo: number;
  padres: Record<string, string>; // receptor -> padre (otro receptor u origen)
  hijos: Record<string, string[]>; // nodo -> hijos, en orden estable
  capacidad: Record<string, number>; // nodo -> máximo de hijos que sostiene
  sinUbicar: string[]; // receptores que no cupieron en ningún hueco
}

const medida = (valor: number | undefined): valor is number =>
  typeof valor === "number" && Number.isFinite(valor);

function comparar(a: ReceptorArbol, b: ReceptorArbol): number {
  const sa = medida(a.subidaKbps) ? a.subidaKbps : -Infinity;
  const sb = medida(b.subidaKbps) ? b.subidaKbps : -Infinity;
  if (sa !== sb) return sa > sb ? -1 : 1;
  const la = medida(a.latenciaMs) ? a.latenciaMs : Infinity;
  const lb = medida(b.latenciaMs) ? b.latenciaMs : Infinity;
  if (la !== lb) return la < lb ? -1 : 1;
  return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}

/** Huecos de un receptor: floor(subida / kbpsFlujo); sin medida, 1. */
function capacidadDe(subidaKbps: number | undefined, kbpsFlujo: number): number {
  if (!medida(subidaKbps) || subidaKbps < 0) return 1;
  return Math.floor(subidaKbps / kbpsFlujo);
}

/** Arma el árbol: los que más suben quedan antes (más cerca del origen) y nadie pasa sus huecos. */
export function armarArbol(origen: string, receptores: ReceptorArbol[], kbpsFlujo: number): ArbolRelevo {
  if (!Number.isFinite(kbpsFlujo) || kbpsFlujo <= 0) {
    throw new Error("kbpsFlujo debe ser un número positivo");
  }
  const vistos = new Set<string>([origen]);
  const lista: ReceptorArbol[] = [];
  for (const receptor of receptores) {
    if (!receptor || typeof receptor.nodoId !== "string" || receptor.nodoId === "") continue;
    if (vistos.has(receptor.nodoId)) continue;
    vistos.add(receptor.nodoId);
    lista.push(receptor);
  }
  lista.sort(comparar);
  const capacidad: Record<string, number> = { [origen]: 1 }; // el origen, sin medida, sostiene 1 hijo
  const hijos: Record<string, string[]> = { [origen]: [] };
  for (const receptor of lista) {
    capacidad[receptor.nodoId] = capacidadDe(receptor.subidaKbps, kbpsFlujo);
    hijos[receptor.nodoId] = [];
  }
  const padres: Record<string, string> = {};
  const cola: string[] = [origen];
  let cabeza = 0;
  let siguiente = 0;
  while (cabeza < cola.length && siguiente < lista.length) {
    const padre = cola[cabeza++];
    while (hijos[padre].length < capacidad[padre] && siguiente < lista.length) {
      const hijo = lista[siguiente++].nodoId;
      padres[hijo] = padre;
      hijos[padre].push(hijo);
      if (capacidad[hijo] > 0) cola.push(hijo);
    }
  }
  return {
    origen,
    kbpsFlujo,
    padres,
    hijos,
    capacidad,
    sinUbicar: lista.slice(siguiente).map((receptor) => receptor.nodoId),
  };
}

/** Hueco más cercano al origen que no esté dentro de la propia rama (evita ciclos). */
function huecoPara(arbol: ArbolRelevo, rama: string): string | null {
  const excluidos = new Set<string>([rama]);
  for (const nodo of excluidos) {
    for (const hijo of arbol.hijos[nodo] ?? []) excluidos.add(hijo); // el Set recorre lo añadido
  }
  const cola = [arbol.origen];
  for (let i = 0; i < cola.length; i++) {
    const nodo = cola[i];
    if (!excluidos.has(nodo) && (arbol.hijos[nodo]?.length ?? 0) < (arbol.capacidad[nodo] ?? 0)) return nodo;
    for (const hijo of arbol.hijos[nodo] ?? []) if (!excluidos.has(hijo)) cola.push(hijo);
  }
  return null;
}

/** Recoloca solo la rama del que se va: sus hijos buscan hueco y el resto del árbol no se toca. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nuevo = structuredClone(arbol);
  const padre = nuevo.padres[seVa];
  if (padre === undefined) return nuevo;
  const rama = [...nuevo.hijos[seVa]];
  nuevo.hijos[padre] = nuevo.hijos[padre].filter((hijo) => hijo !== seVa);
  delete nuevo.padres[seVa];
  delete nuevo.hijos[seVa];
  delete nuevo.capacidad[seVa];
  for (const hijo of rama) delete nuevo.padres[hijo];
  for (const hijo of rama) {
    const hueco = huecoPara(nuevo, hijo);
    if (hueco === null) {
      if (!nuevo.sinUbicar.includes(hijo)) nuevo.sinUbicar.push(hijo);
      continue;
    }
    nuevo.padres[hijo] = hueco;
    nuevo.hijos[hueco].push(hijo);
  }
  return nuevo;
}
