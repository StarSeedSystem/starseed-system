export type Nodo = {
  nodoId: string;
  subidaKbps?: number;
  latenciaMs?: number;
};

export function capacidadHijos(nodo: Nodo, kbpsFlujo: number): number {
  const subida = nodo.subidaKbps ?? 0;
  return subida > 0 ? Math.floor(subida / kbpsFlujo) : 1;
}

export function armarArbol(origen: string, receptores: Nodo[], kbpsFlujo: number): Record<string, string> {
  const mapa: Record<string, string> = {};
  const placed: { id: string; subida: number; restante: number }[] = [{ id: origen, subida: Infinity, restante: 2 }];

  const sorted = [...receptores].sort((a, b) => {
    const sa = a.subidaKbps ?? -1;
    const sb = b.subidaKbps ?? -1;
    if (sa !== sb) return sb - sa;
    return a.nodoId.localeCompare(b.nodoId);
  });

  for (const receptor of sorted) {
    let padre: string | undefined = undefined;
    let mejorIdx = -1;
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (p.restante > 0) {
        if (mejorIdx === -1 || p.subida > placed[mejorIdx].subida) {
          mejorIdx = i;
          padre = p.id;
        }
      }
    }
    if (mejorIdx !== -1) placed[mejorIdx].restante--;
    if (padre === undefined) padre = origen;
    mapa[receptor.nodoId] = padre;

    const cap = capacidadHijos(receptor, kbpsFlujo);
    placed.push({ id: receptor.nodoId, subida: receptor.subidaKbps ?? 0, restante: cap });
  }

  return mapa;
}

export function recolocar(arbol: Record<string, string>, seVa: string): Record<string, string> {
  const nuevo: Record<string, string> = { ...arbol };
  delete nuevo[seVa];
  const padreSeVa = arbol[seVa];
  for (const [hijo, padre] of Object.entries(arbol)) {
    if (padre === seVa) {
      if (padreSeVa !== undefined) nuevo[hijo] = padreSeVa;
      else nuevo[hijo] = "";
    }
  }
  return nuevo;
}