// Árbol de relevo (architecture/apps-en-la-malla.md §10 · tarea V, Ola 1017A).
// Puro y determinista: sin red, sin disco y sin reloj. Cada nodo releva a lo sumo
// floor(subida / kbpsFlujo) hijos; sin medida, uno. Los que más suben van más cerca del origen.
export interface ReceptorRelevo { nodoId: string; subidaKbps?: number; latenciaMs?: number }
export interface ArbolRelevo {
  origen: string;
  kbpsFlujo: number;
  padre: Map<string, string | null>;
  hijos: Map<string, string[]>;
  capacidad: Map<string, number>;
  subida: Map<string, number | undefined>;
}
const SIN_MEDIDA = 1;
function caudal(kbpsFlujo: number): number {
  return Number.isFinite(kbpsFlujo) && kbpsFlujo > 0 ? kbpsFlujo : 1;
}
/** Hijos que puede sostener un nodo; lo no medido cuenta como uno. */
export function capacidadRelevo(subidaKbps: number | undefined, kbpsFlujo: number): number {
  if (subidaKbps === undefined || !Number.isFinite(subidaKbps)) return SIN_MEDIDA;
  return Math.max(0, Math.floor(subidaKbps / caudal(kbpsFlujo)));
}
function ordenar(receptores: ReceptorRelevo[]): ReceptorRelevo[] {
  return [...receptores].sort((a, b) => {
    const sa = a.subidaKbps ?? -1;
    const sb = b.subidaKbps ?? -1;
    if (sa !== sb) return sb - sa;
    const la = a.latenciaMs ?? Infinity;
    const lb = b.latenciaMs ?? Infinity;
    if (la !== lb) return la - lb;
    return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
  });
}
export function armarArbol(origen: string, receptores: ReceptorRelevo[], kbpsFlujo: number): ArbolRelevo {
  const flujo = caudal(kbpsFlujo);
  const unicos = new Map<string, ReceptorRelevo>();
  let medidaOrigen: number | undefined;
  for (const r of receptores) {
    if (!r || !r.nodoId) continue;
    if (r.nodoId === origen) {
      if (medidaOrigen === undefined) medidaOrigen = r.subidaKbps;
      continue;
    }
    if (!unicos.has(r.nodoId)) unicos.set(r.nodoId, r);
  }
  const orden = ordenar([...unicos.values()]);
  const padre = new Map<string, string | null>([[origen, null]]);
  const hijos = new Map<string, string[]>([[origen, []]]);
  const capacidad = new Map<string, number>([[origen, capacidadRelevo(medidaOrigen, flujo)]]);
  const subida = new Map<string, number | undefined>([[origen, medidaOrigen]]);
  const cola: string[] = [origen];
  let i = 0;
  for (const r of orden) {
    let destino: string | undefined;
    while (i < cola.length) {
      const candidato = cola[i];
      const cupo = capacidad.get(candidato) ?? 0;
      if ((hijos.get(candidato)?.length ?? 0) < cupo) {
        destino = candidato;
        break;
      }
      i++;
    }
    if (destino === undefined) destino = origen;
    padre.set(r.nodoId, destino);
    hijos.get(destino)!.push(r.nodoId);
    hijos.set(r.nodoId, []);
    const cap = capacidadRelevo(r.subidaKbps, flujo);
    capacidad.set(r.nodoId, cap);
    subida.set(r.nodoId, r.subidaKbps);
    if (cap > 0) cola.push(r.nodoId);
  }
  return { origen, kbpsFlujo: flujo, padre, hijos, capacidad, subida };
}
function clonar(a: ArbolRelevo): ArbolRelevo {
  const hijos = new Map<string, string[]>([...a.hijos].map(([nodo, lista]) => [nodo, [...lista]] as [string, string[]]));
  return { ...a, padre: new Map(a.padre), hijos, capacidad: new Map(a.capacidad), subida: new Map(a.subida) };
}
function recorrido(arbol: ArbolRelevo): string[] {
  const orden: string[] = [];
  const cola: string[] = [arbol.origen];
  const vistos = new Set<string>([arbol.origen]);
  while (cola.length > 0) {
    const nodo = cola.shift()!;
    orden.push(nodo);
    for (const hijo of arbol.hijos.get(nodo) ?? []) {
      if (vistos.has(hijo)) continue;
      vistos.add(hijo);
      cola.push(hijo);
    }
  }
  return orden;
}
function tieneHueco(arbol: ArbolRelevo, nodo: string): boolean {
  return (arbol.hijos.get(nodo)?.length ?? 0) < (arbol.capacidad.get(nodo) ?? 0);
}
/** Recoloca solo la rama del que se va: sus hijos cuelgan de donde haya hueco. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nuevo = clonar(arbol);
  if (seVa === nuevo.origen || !nuevo.padre.has(seVa)) return nuevo;
  const viejoPadre = nuevo.padre.get(seVa) ?? null;
  if (viejoPadre !== null) {
    const hermanos = nuevo.hijos.get(viejoPadre) ?? [];
    nuevo.hijos.set(viejoPadre, hermanos.filter((hijo) => hijo !== seVa));
  }
  const ramas = [...(nuevo.hijos.get(seVa) ?? [])];
  nuevo.hijos.delete(seVa);
  nuevo.padre.delete(seVa);
  nuevo.capacidad.delete(seVa);
  nuevo.subida.delete(seVa);
  const candidatos = recorrido(nuevo);
  for (const rama of ramas) {
    const destino =
      (viejoPadre !== null && tieneHueco(nuevo, viejoPadre) ? viejoPadre : undefined) ??
      candidatos.find((nodo) => tieneHueco(nuevo, nodo)) ??
      nuevo.origen;
    nuevo.padre.set(rama, destino);
    nuevo.hijos.get(destino)!.push(rama);
  }
  return nuevo;
}
