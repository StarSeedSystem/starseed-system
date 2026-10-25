// Árbol de relevo de una transmisión (architecture/apps-en-la-malla.md §10, tarea V · Ola 1017A).
// Puro y determinista: sin red, disco, reloj ni procesos. Los números llegan medidos; sin medida vale 1.

export interface ReceptorRelevo { nodoId: string; subidaKbps?: number; latenciaMs?: number }
export interface NodoArbol {
  nodoId: string; padre: string | null; nivel: number; hijos: string[];
  capacidadHijos: number; subidaKbps?: number; latenciaMs?: number; excedeTope: boolean;
}
export interface ArbolRelevo { origen: string; kbpsFlujo: number; nodos: Map<string, NodoArbol> }

function medido(v: number | undefined, porDefecto: number): number {
  return v !== undefined && Number.isFinite(v) ? v : porDefecto;
}

/** Hijos que puede sostener un nodo: floor(subida/flujo); sin medida o flujo inválido, 1. */
export function capacidadHijos(subidaKbps: number | undefined, kbpsFlujo: number): number {
  if (subidaKbps === undefined || !Number.isFinite(subidaKbps)) return 1;
  if (!Number.isFinite(kbpsFlujo) || kbpsFlujo <= 0) return 1;
  return Math.max(0, Math.floor(subidaKbps / kbpsFlujo));
}

function ordenar(a: ReceptorRelevo, b: ReceptorRelevo): number {
  const sa = medido(a.subidaKbps, -Infinity), sb = medido(b.subidaKbps, -Infinity);
  if (sa !== sb) return sa > sb ? -1 : 1;
  const la = medido(a.latenciaMs, Infinity), lb = medido(b.latenciaMs, Infinity);
  if (la !== lb) return la < lb ? -1 : 1;
  return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}

function crearNodo(nodoId: string, padre: string | null, nivel: number, subidaKbps: number | undefined,
  latenciaMs: number | undefined, kbpsFlujo: number, excedeTope: boolean): NodoArbol {
  return { nodoId, padre, nivel, hijos: [], capacidadHijos: capacidadHijos(subidaKbps, kbpsFlujo), subidaKbps, latenciaMs, excedeTope };
}
/** Arma el árbol: los receptores con más subida ocupan los huecos más cercanos al origen. */
export function armarArbol(origen: string | ReceptorRelevo, receptores: ReceptorRelevo[], kbpsFlujo: number): ArbolRelevo {
  const idOrigen = typeof origen === "string" ? origen : origen.nodoId;
  const subidaOrigen = typeof origen === "string" ? undefined : origen.subidaKbps;
  const nodos = new Map<string, NodoArbol>();
  const raiz = crearNodo(idOrigen, null, 0, subidaOrigen, undefined, kbpsFlujo, false);
  nodos.set(idOrigen, raiz);
  const vistos = new Set<string>([idOrigen]);
  const lista: ReceptorRelevo[] = [];
  for (const r of receptores) {
    if (vistos.has(r.nodoId)) continue;
    vistos.add(r.nodoId);
    const s = r.subidaKbps !== undefined && Number.isFinite(r.subidaKbps) ? r.subidaKbps : undefined;
    const l = r.latenciaMs !== undefined && Number.isFinite(r.latenciaMs) ? r.latenciaMs : undefined;
    lista.push({ nodoId: r.nodoId, subidaKbps: s, latenciaMs: l });
  }
  lista.sort(ordenar);
  const cola = [idOrigen];
  const libres = new Map([[idOrigen, raiz.capacidadHijos]]);
  let cabeza = 0;
  for (const r of lista) {
    while (cabeza < cola.length && (libres.get(cola[cabeza]) ?? 0) <= 0) cabeza++;
    const hay = cabeza < cola.length;
    const idPadre = hay ? cola[cabeza] : idOrigen;
    const padre = nodos.get(idPadre)!;
    const nodo = crearNodo(r.nodoId, idPadre, padre.nivel + 1, r.subidaKbps, r.latenciaMs, kbpsFlujo, !hay);
    nodos.set(nodo.nodoId, nodo);
    padre.hijos.push(nodo.nodoId);
    if (hay) libres.set(idPadre, (libres.get(idPadre) ?? 0) - 1);
    if (nodo.capacidadHijos > 0) { cola.push(nodo.nodoId); libres.set(nodo.nodoId, nodo.capacidadHijos); }
  }
  return { origen: idOrigen, kbpsFlujo: Number.isFinite(kbpsFlujo) && kbpsFlujo > 0 ? kbpsFlujo : 1, nodos };
}

function subarbol(nodos: Map<string, NodoArbol>, raiz: string): Set<string> {
  const fuera = new Set<string>();
  const pila = [raiz];
  while (pila.length > 0) {
    const id = pila.pop()!;
    if (fuera.has(id)) continue;
    fuera.add(id);
    const n = nodos.get(id);
    if (n) for (const h of n.hijos) pila.push(h);
  }
  return fuera;
}

function buscarHueco(origen: string, nodos: Map<string, NodoArbol>, fuera: Set<string>): string | null {
  const cola = [origen];
  for (let i = 0; i < cola.length; i++) {
    const id = cola[i], n = nodos.get(id);
    if (fuera.has(id) || !n) continue;
    if (n.hijos.length < n.capacidadHijos) return id;
    for (const h of n.hijos) cola.push(h);
  }
  return null;
}

function recalcular(origen: string, nodos: Map<string, NodoArbol>): void {
  const cola = [origen];
  for (let i = 0; i < cola.length; i++) {
    const n = nodos.get(cola[i])!;
    for (const h of n.hijos) { const hijo = nodos.get(h)!; hijo.nivel = n.nivel + 1; cola.push(h); }
  }
}

/** Saca a `seVa` y recoloca solo su rama: el resto del árbol no cambia de padre. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nodos = new Map<string, NodoArbol>();
  for (const [id, n] of arbol.nodos) nodos.set(id, { ...n, hijos: [...n.hijos] });
  const ido = nodos.get(seVa);
  if (!ido || seVa === arbol.origen) return { ...arbol, nodos };
  const padre = ido.padre ? nodos.get(ido.padre) : undefined;
  if (padre) padre.hijos = padre.hijos.filter((h) => h !== seVa);
  nodos.delete(seVa);
  for (const rama of ido.hijos) {
    const hueco = buscarHueco(arbol.origen, nodos, subarbol(nodos, rama));
    const destino = hueco ?? arbol.origen;
    const n = nodos.get(rama)!;
    n.padre = destino;
    n.excedeTope = hueco === null;
    nodos.get(destino)!.hijos.push(rama);
  }
  recalcular(arbol.origen, nodos);
  return { ...arbol, nodos };
}
