export function armarArbol(
  origen: string,
  receptores: { nodoId: string; subidaKbps?: number }[],
  kbpsFlujo: number
) {
  const nodos = new Map<string, { hijos: string[]; subidaKbps?: number }>();

  const procesados = receptores.map((r) => ({
    nodoId: r.nodoId,
    subidaKbps: r.subidaKbps ?? 0,
  }));

  procesados.sort((a, b) => b.subidaKbps - a.subidaKbps);

  nodos.set(origen, { hijos: procesados.map((r) => r.nodoId), subidaKbps: undefined });

  const asignados = new Set<string>();
  asignados.add(origen);

  for (const r of procesados) {
    asignados.add(r.nodoId);
  }

  for (const r of procesados) {
    const capacidadMax =
      r.subidaKbps > 0 ? Math.floor(r.subidaKbps / kbpsFlujo) : 9999;
    const disponibles = procesados.filter(
      (r2) => !asignados.has(r2.nodoId) && r2.nodoId !== r.nodoId
    );
    const hijos = disponibles.slice(0, capacidadMax).map((r2) => r2.nodoId);
    hijos.forEach((id) => asignados.add(id));
    nodos.set(r.nodoId, { hijos, subidaKbps: r.subidaKbps });
  }

  return { origen, nodos };
}

export function recolocar(
  arbol: {
    origen: string;
    nodos: Map<string, { hijos: string[]; subidaKbps?: number }>;
  },
  nodoId: string
) {
  const nuevo = new Map(arbol.nodos);
  const nodo = nuevo.get(nodoId);

  if (!nodo) {
    return arbol;
  }

  nuevo.set(nodoId, { ...nodo, hijos: [] });

  const origenNodo = nuevo.get(arbol.origen);
  if (origenNodo) {
    nuevo.get(arbol.origen)!.hijos = origenNodo.hijos.filter((id) => id !== nodoId);
  }

  for (const [id, n] of nuevo) {
    if (id !== nodoId) {
      n.hijos = n.hijos.filter((id) => id !== nodoId);
      nuevo.set(id, n);
    }
  }

  return {
    origen: arbol.origen,
    nodos: nuevo,
  };
}