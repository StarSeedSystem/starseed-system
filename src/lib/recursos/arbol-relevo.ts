// Árbol de relevo (architecture/apps-en-la-malla.md §10, tarea V · Ola 1017A).
// Puro: sin red, sin disco ni reloj; lo medido llega en los nodos.
export interface NodoRelevo { nodoId: string; subidaKbps?: number; latenciaMs?: number; }
export interface ArbolRelevo {
  raiz: string; kbpsFlujo: number; nodos: Record<string, NodoRelevo>;
  padres: Record<string, string>; hijos: Record<string, string[]>;
  orden: string[]; sinColocar: string[];
}
export type OrigenRelevo = string | NodoRelevo;
const flujo = (k: number) => (Number.isFinite(k) && k > 0 ? k : 1);
/** Hijos que puede sostener un nodo; sin medida, uno; nunca negativo. */
export function capacidadHijos(nodo: NodoRelevo, kbpsFlujo: number): number {
  const s = nodo.subidaKbps;
  return s === undefined || !Number.isFinite(s) ? 1 : Math.max(0, Math.floor(s / flujo(kbpsFlujo)));
}
/** Más subida (más capacidad) cerca del origen; sin medida cuenta como uno. */
function comparar(a: NodoRelevo, b: NodoRelevo, k: number): number {
  const ca = capacidadHijos(a, k), cb = capacidadHijos(b, k);
  if (ca !== cb) return cb - ca;
  const la = a.latenciaMs ?? Number.POSITIVE_INFINITY, lb = b.latenciaMs ?? Number.POSITIVE_INFINITY;
  return la !== lb ? la - lb : a.nodoId.localeCompare(b.nodoId);
}
const comoNodo = (o: OrigenRelevo): NodoRelevo => (typeof o === "string" ? { nodoId: o } : { ...o });
/** Reparte candidatos ya ordenados en anchura; cada uno cuelga del primer hueco. */
function colocar(raiz: NodoRelevo, candidatos: NodoRelevo[], k: number) {
  const padres: Record<string, string> = {}, hijos: Record<string, string[]> = { [raiz.nodoId]: [] };
  const cola = [raiz.nodoId], usados = new Map<string, number>();
  const tope = new Map<string, number>([[raiz.nodoId, capacidadHijos(raiz, k)]]);
  const orden = [raiz.nodoId], sinColocar: string[] = [];
  let cabeza = 0;
  for (const nodo of candidatos) {
    while (cabeza < cola.length && (usados.get(cola[cabeza]) ?? 0) >= (tope.get(cola[cabeza]) ?? 0)) cabeza++;
    if (cabeza >= cola.length) { sinColocar.push(nodo.nodoId); continue; }
    const padre = cola[cabeza];
    padres[nodo.nodoId] = padre;
    (hijos[padre] ??= []).push(nodo.nodoId);
    usados.set(padre, (usados.get(padre) ?? 0) + 1);
    hijos[nodo.nodoId] = [];
    tope.set(nodo.nodoId, capacidadHijos(nodo, k));
    cola.push(nodo.nodoId);
    orden.push(nodo.nodoId);
  }
  return { padres, hijos, orden, sinColocar };
}
/** Árbol determinista: la raíz es el origen y cada receptor cuelga de quien tenga hueco. */
export function armarArbol(origen: OrigenRelevo, receptores: NodoRelevo[], kbpsFlujo: number): ArbolRelevo {
  const raiz = comoNodo(origen), k = flujo(kbpsFlujo);
  const vistos = new Set<string>([raiz.nodoId]), candidatos: NodoRelevo[] = [];
  for (const receptor of receptores) {
    if (vistos.has(receptor.nodoId)) continue;
    vistos.add(receptor.nodoId);
    candidatos.push({ ...receptor });
  }
  candidatos.sort((a, b) => comparar(a, b, k));
  const c = colocar(raiz, candidatos, k), fuera = new Set(c.sinColocar);
  const nodos: Record<string, NodoRelevo> = { [raiz.nodoId]: raiz };
  for (const nodo of candidatos) if (!fuera.has(nodo.nodoId)) nodos[nodo.nodoId] = nodo;
  return { raiz: raiz.nodoId, kbpsFlujo: k, nodos, ...c };
}
function copiar(arbol: ArbolRelevo): ArbolRelevo {
  const hijos = Object.fromEntries(Object.entries(arbol.hijos).map(([clave, lista]) => [clave, [...lista]]));
  return { ...arbol, nodos: { ...arbol.nodos }, padres: { ...arbol.padres }, hijos, orden: [...arbol.orden], sinColocar: [...arbol.sinColocar] };
}
function rama(hijos: Record<string, string[]>, desde: string): string[] {
  const salida: string[] = [], pila = [desde];
  while (pila.length > 0) {
    const actual = pila.pop();
    if (actual === undefined) break;
    salida.push(actual);
    pila.push(...(hijos[actual] ?? []));
  }
  return salida;
}
/** Mueve solo la rama del que se va: los demás conservan su padre y su sitio. */
export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  if (!arbol.nodos[seVa]) return copiar(arbol);
  const k = flujo(arbol.kbpsFlujo), n = copiar(arbol);
  const dentro = new Set(rama(n.hijos, seVa)), huerfanos = [...(n.hijos[seVa] ?? [])], raizVieja = n.raiz, sinColocar = [...n.sinColocar];
  if (seVa !== raizVieja && n.padres[seVa]) n.hijos[n.padres[seVa]] = n.hijos[n.padres[seVa]].filter(id => id !== seVa);
  delete n.padres[seVa]; delete n.hijos[seVa]; delete n.nodos[seVa];
  for (const id of huerfanos) delete n.padres[id];
  const usados = new Map<string, number>(), tope = new Map<string, number>(), cola: string[] = [];
  const meter = (id: string) => {
    const nodo = n.nodos[id];
    if (!nodo) return;
    const cap = capacidadHijos(nodo, k), uso = (n.hijos[id] ?? []).length;
    tope.set(id, cap); usados.set(id, uso);
    if (uso < cap) cola.push(id);
  };
  n.raiz = seVa === raizVieja ? "" : raizVieja;
  if (seVa !== raizVieja) for (const id of n.orden) if (!dentro.has(id)) meter(id);
  const ordenados = huerfanos.map(id => n.nodos[id])
    .filter((nodo): nodo is NodoRelevo => nodo !== undefined).sort((a, b) => comparar(a, b, k));
  if (seVa === raizVieja && ordenados[0]) { n.raiz = ordenados[0].nodoId; meter(n.raiz); }
  let cabeza = 0;
  for (const huerfano of ordenados) {
    if (huerfano.nodoId === n.raiz) continue;
    while (cabeza < cola.length && (usados.get(cola[cabeza]) ?? 0) >= (tope.get(cola[cabeza]) ?? 0)) cabeza++;
    if (cabeza >= cola.length) {
      for (const id of rama(n.hijos, huerfano.nodoId)) {
        delete n.nodos[id]; delete n.padres[id]; delete n.hijos[id]; sinColocar.push(id);
      }
      continue;
    }
    const padre = cola[cabeza];
    n.padres[huerfano.nodoId] = padre;
    (n.hijos[padre] ??= []).push(huerfano.nodoId);
    usados.set(padre, (usados.get(padre) ?? 0) + 1);
    meter(huerfano.nodoId);
  }
  if (!n.raiz || !n.nodos[n.raiz]) {
    return { raiz: "", kbpsFlujo: k, nodos: {}, padres: {}, hijos: {}, orden: [], sinColocar };
  }
  const orden: string[] = [], barrido = [n.raiz];
  for (let i = 0; i < barrido.length; i++) {
    orden.push(barrido[i]);
    barrido.push(...(n.hijos[barrido[i]] ?? []));
  }
  return { ...n, kbpsFlujo: k, orden, sinColocar };
}
