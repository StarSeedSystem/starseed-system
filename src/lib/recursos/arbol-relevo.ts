// Árbol de relevo puro (§10 apps-en-la-malla.md): distribución por subida.
export interface ReceptorRelevo {
  nodoId: string;
  subidaKbps?: number;
  latenciaMs?: number;
}

export interface NodoRelevo {
  id: string;
  padre?: string;
  hijos: string[];
  subidaKbps?: number;
}

export interface ArbolRelevo {
  raiz: string;
  nodos: Map<string, NodoRelevo>;
}

function capacidadHijos(subida: number | undefined, kbpsFlujo: number): number {
  if (subida === undefined || !Number.isFinite(subida) || subida <= 0) return 1;
  return Math.max(1, Math.floor(subida / kbpsFlujo));
}

export function armarArbol(
  origen: string,
  receptores: ReceptorRelevo[],
  kbpsFlujo: number
): ArbolRelevo {
  const nodos = new Map<string, NodoRelevo>();
  nodos.set(origen, { id: origen, padre: undefined, hijos: [], subidaKbps: Infinity });
  for (const r of receptores) {
    nodos.set(r.nodoId, { id: r.nodoId, padre: undefined, hijos: [], subidaKbps: r.subidaKbps });
  }

  const candidatos = Array.from(nodos.values()).sort((a, b) => {
    const sa = a.subidaKbps === Infinity ? Infinity : (a.subidaKbps ?? 0);
    const sb = b.subidaKbps === Infinity ? Infinity : (b.subidaKbps ?? 0);
    if (sb !== sa) return sb - sa;
    return a.id.localeCompare(b.id);
  });

  const asignados = new Map<string, number>();
  for (const id of nodos.keys()) asignados.set(id, 0);

  const ordenReceptores = [...receptores].sort((a, b) => {
    const sa = a.subidaKbps ?? 0;
    const sb = b.subidaKbps ?? 0;
    if (sb !== sa) return sb - sa;
    return a.nodoId.localeCompare(b.nodoId);
  });

  for (const r of ordenReceptores) {
    const receptor = nodos.get(r.nodoId)!;
    const posibles = candidatos.filter(p => {
      if (p.id === receptor.id) return false;
      const cap = capacidadHijos(p.subidaKbps, kbpsFlujo);
      return (asignados.get(p.id) ?? 0) < cap;
    }).sort((a, b) => {
      const sa = a.subidaKbps === Infinity ? Infinity : (a.subidaKbps ?? 0);
      const sb = b.subidaKbps === Infinity ? Infinity : (b.subidaKbps ?? 0);
      if (sb !== sa) return sb - sa;
      return a.id.localeCompare(b.id);
    });

    const padre = posibles[0] ?? nodos.get(origen)!;
    receptor.padre = padre.id;
    padre.hijos.push(receptor.id);
    asignados.set(padre.id, (asignados.get(padre.id) ?? 0) + 1);
  }

  return { raiz: origen, nodos };
}

export function recolocar(arbol: ArbolRelevo, seVa: string): ArbolRelevo {
  const nuevo = new Map<string, NodoRelevo>();
  for (const [id, nodo] of arbol.nodos) {
    if (id === seVa) continue;
    nuevo.set(id, { ...nodo, hijos: nodo.hijos.filter(h => h !== seVa) });
  }

  const seVaNodo = arbol.nodos.get(seVa);
  if (!seVaNodo) return { raiz: arbol.raiz, nodos: nuevo };

  const padreSeVa = seVaNodo.padre ? arbol.nodos.get(seVaNodo.padre) : undefined;
  const padreId = padreSeVa ? padreSeVa.id : arbol.raiz;

  for (const hijoId of seVaNodo.hijos) {
    const hijo = nuevo.get(hijoId);
    if (!hijo) continue;
    hijo.padre = padreId;
    const padreNodo = nuevo.get(padreId);
    if (padreNodo) padreNodo.hijos.push(hijoId);
  }

  return { raiz: arbol.raiz, nodos: nuevo };
}
