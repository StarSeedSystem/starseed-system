export type Nodo = {
  id: string;
  privacidad: "publico" | "privado" | "contacto";
  dueno?: string;
  contactos?: string[];
};

export const visiblePara = (nodo: Nodo, observador: { id: string }): boolean => {
  if (nodo.privacidad === "publico") return true;
  if (nodo.dueno === observador.id) return true;
  if (nodo.privacidad === "contacto" && nodo.contactos?.includes(observador.id)) return true;
  return false;
};

export const podarGrafo = (grafo: { nodos: Nodo[]; aristas: any[] }, observador: { id: string }) => {
  const nodosVisibles = grafo.nodos.filter((n) => visiblePara(n, observador));
  const idsVisibles = new Set(nodosVisibles.map((n) => n.id));
  const aristasVisibles = grafo.aristas.filter(
    (a) => idsVisibles.has(a.origen) && idsVisibles.has(a.destino)
  );
  return { nodos: nodosVisibles, aristas: aristasVisibles };
};
