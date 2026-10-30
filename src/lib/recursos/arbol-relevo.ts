// Árbol de relevo puro (architecture/apps-en-la-malla.md §10, tarea V · Ola 1017A).
// Sin red, disco, procesos ni reloj: reparte receptores en un árbol determinista por subida.
/** Un receptor tal y como lo anuncia la malla; lo no medido va `undefined`, nunca inventado. */
export interface ReceptorRelevo { nodoId: string; subidaKbps?: number; latenciaMs?: number; }
export interface NodoRelevo {
  nodoId: string; padre: string | null; hijos: string[];
  capacidad: number; subidaKbps?: number; latenciaMs?: number;
}
export interface ArbolRelevo { origen: string; kbpsFlujo: number; nodos: Map<string, NodoRelevo>; }
/** Capacidad de relevo: floor(subida / kbpsFlujo); sin medir, 1. */
export function capacidadDeSubida(subidaKbps: number | undefined, kbpsFlujo: number): number {
  if (subidaKbps === undefined) return 1;
  if (!Number.isFinite(kbpsFlujo) || kbpsFlujo <= 0) return 1;
  return Math.max(0, Math.floor(subidaKbps / kbpsFlujo));
}
function medido(valor: number | undefined): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : undefined;
}
/** Orden estable: más subida primero, luego menos latencia y, por último, el id. */
function compararSubida(a: ReceptorRelevo, b: ReceptorRelevo): number {
  const sa = a.subidaKbps ?? -1;
  const sb = b.subidaKbps ?? -1;
  if (sa !== sb) return sb - sa;
  const la = a.latenciaMs ?? Number.POSITIVE_INFINITY;
  const lb = b.latenciaMs ?? Number.POSITIVE_INFINITY;
  if (la !== lb) return la - lb;
  return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}
function crearNodo(
  nodoId: string, padre: string | null, capacidad: number, subidaKbps?: number, latenciaMs?: number
): NodoRelevo {
  return { nodoId, padre, hijos: [], capacidad, subidaKbps, latenciaMs };
}
function hueco(cola: string[], libres: Map<string, number>): number {
  return cola.findIndex((id) => (libres.get(id) ?? 0) > 0);
}
export function armarArbol(
  origen: string,
  receptores: ReceptorRelevo[],
  kbpsFlujo: number
): ArbolRelevo {
  // Si el origen viene entre los receptores, su subida mide cuántos hijos directos admite.
  const unicos = new Map<string, ReceptorRelevo>();
  let subidaOrigen: number | undefined, latenciaOrigen: number | undefined;
  for (const r of receptores) {
    if (!r || typeof r.nodoId !== "string" || r.nodoId === "") continue;
    const n = { nodoId: r.nodoId, subidaKbps: medido(r.subidaKbps), latenciaMs: medido(r.latenciaMs) };
    if (n.nodoId === origen) { subidaOrigen = n.subidaKbps; latenciaOrigen = n.latenciaMs; continue; }
    if (!unicos.has(n.nodoId)) unicos.set(n.nodoId, n);
  }
  const ordenados = [...unicos.values()].sort(compararSubida);
  const capacidadOrigen = capacidadDeSubida(subidaOrigen, kbpsFlujo);
  const nodos = new Map<string, NodoRelevo>();
  const libres = new Map<string, number>();
  const cola: string[] = [origen];
  nodos.set(origen, crearNodo(origen, null, capacidadOrigen, subidaOrigen, latenciaOrigen));
  libres.set(origen, capacidadOrigen);
  for (const r of ordenados) {
    const capacidad = capacidadDeSubida(r.subidaKbps, kbpsFlujo);
    let i = hueco(cola, libres);
    if (i < 0) i = 0; // nunca un receptor se queda sin padre: el origen acoge
    const padreId = cola[i];
    const padre = nodos.get(padreId);
    if (!padre) continue;
    padre.hijos.push(r.nodoId);
    libres.set(padreId, (libres.get(padreId) ?? 0) - 1);
    nodos.set(r.nodoId, crearNodo(r.nodoId, padreId, capacidad, r.subidaKbps, r.latenciaMs));
    libres.set(r.nodoId, capacidad);
    if (capacidad > 0) cola.push(r.nodoId);
  }
  return { origen, kbpsFlujo, nodos };
}
/** Saca a `seVa` y reengancha solo su rama; el resto del árbol no se toca. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const saliente = arbol.nodos.get(seVa);
  if (!saliente || seVa === arbol.origen) return arbol;
  const nodos = new Map(arbol.nodos);
  if (saliente.padre !== null) {
    const padre = nodos.get(saliente.padre);
    if (padre) nodos.set(padre.nodoId, { ...padre, hijos: padre.hijos.filter((id) => id !== seVa) });
  }
  const rama = new Set<string>();
  const pila = [...saliente.hijos];
  while (pila.length > 0) {
    const id = pila.pop();
    if (id === undefined || rama.has(id)) continue;
    rama.add(id);
    const d = nodos.get(id);
    if (d) pila.push(...d.hijos);
  }
  nodos.delete(seVa);
  const libres = new Map<string, number>();
  const cola: string[] = [];
  const vistos = new Set<string>();
  const visitar = (id: string) => {
    const n = nodos.get(id);
    if (!n || rama.has(id) || vistos.has(id)) return;
    vistos.add(id); cola.push(id);
    libres.set(id, Math.max(0, n.capacidad - n.hijos.length));
  };
  visitar(arbol.origen);
  for (let i = 0; i < cola.length; i++) {
    for (const hijo of nodos.get(cola[i])?.hijos ?? []) visitar(hijo);
  }
  const raices = [...saliente.hijos]
    .map((id) => nodos.get(id))
    .filter((n): n is NodoRelevo => n !== undefined)
    .sort(compararSubida);
  for (const raiz of raices) {
    const i = hueco(cola, libres);
    const destinoId = i >= 0 ? cola[i] : arbol.origen;
    const destino = nodos.get(destinoId);
    if (!destino) continue;
    nodos.set(destinoId, { ...destino, hijos: [...destino.hijos, raiz.nodoId] });
    libres.set(destinoId, (libres.get(destinoId) ?? 0) - 1);
    const actual = nodos.get(raiz.nodoId);
    if (actual) nodos.set(raiz.nodoId, { ...actual, padre: destinoId });
  }
  return { origen: arbol.origen, kbpsFlujo: arbol.kbpsFlujo, nodos };
}
