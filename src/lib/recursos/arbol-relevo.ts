/**
 * Información de un nodo para el árbol de relevo.
 */
export interface NodoInfo {
  subidaKbps?: number;
  latenciaMs?: number;
}
/**
 * Arbol de relevo: para cada nodo, devuelve su padre en el árbol.
 * El árbol se construye de manera que los nodos con más subida estén más cerca del origen.
 * Cada nodo puede tener como mucho floor(subida / kbpsFlujo) hijos (si subida no está definida, se asume 1).
 * @param origen - Identificador del nodo origen (raíz del árbol)
 * @param receptores - Lista de receptores con su nodoId, subidaKbps (opcional) y latenciaMs (opcional)
 * @param kbpsFlujo - Ancho de banda requerido para el flujo (en kbps)
 * @returns Mapa que asigna a cada receptor su nodo padre en el árbol
 */
export function armarArbol(
  origen: string,
  receptores: { nodoId: string; subidaKbps?: number; latenciaMs?: number }[],
  kbpsFlujo: number
): Map<string, string> {
  const tree = new Map<string, string>();
  const capacity = new Map<string, number>();
  // Origin has infinite capacity
  capacity.set(origen, Infinity);

  // Sort receptors by subidaKbps descending, then by latenciaMs ascending
  const sortedReceptores = [...receptores].sort((a, b) => {
    const subidaA = a.subidaKbps ?? 0;
    const subidaB = b.subidaKbps ?? 0;
    if (subidaB !== subidaA) {
      return subidaB - subidaA; // descending
    }
    const latA = a.latenciaMs ?? 0;
    const latB = b.latenciaMs ?? 0;
    return latA - latB; // ascending latency
  });

  // List of nodes that can be parents, in the order we want to try (origin first, then receptors in sorted order)
  const parentsInOrder: string[] = [origen];

  for (const receptor of sortedReceptores) {
    const { nodoId, subidaKbps, latenciaMs } = receptor;
    let parentFound = false;
    for (const parentId of parentsInOrder) {
      const currentCapacity = capacity.get(parentId) ?? 0;
      if (currentCapacity > 0) {
        // Assign this receptor to parentId
        tree.set(nodoId, parentId);
        capacity.set(parentId, currentCapacity - 1);
        // Set the capacity for this new node
        const maxChildren = subidaKbps !== undefined ? Math.floor(subidaKbps / kbpsFlujo) : 1;
        capacity.set(nodoId, maxChildren);
        // Add this node to the list of potential parents for future receptors
        parentsInOrder.push(nodoId);
        parentFound = true;
        break;
      }
    }
    if (!parentFound) {
      // This should not happen if the origin has infinite capacity, but if we run out of capacity, we cannot assign.
      throw new Error(`No capacity left for receptor ${nodoId}`);
    }
  }

  return tree;
}
/**
 * Recoloca el árbol cuando se va un nodo.
 * Mueve solo la rama del nodo que se fue, reanudando sus conexiones en el árbol existente.
 * @param arbol - Árbol actual (mapa de hijo a padre)
 * @param seVa - Identificador del nodo que se va
 * @returns Nuevo árbol con la rama del nodo que se fue recolocada
 */
export function recolocar(arbol: Map<string, string>, seVa: string): Map<string, string> {
  // Create a shallow copy of the original tree
  const newTree = new Map<string, string>(arbol);

  // Remove the leaving node from the tree (if it exists as a child)
  newTree.delete(seVa);

  // If the tree is empty after removal, return it
  if (newTree.size === 0) {
    return newTree;
  }

  // Find the origin in the original tree (the node that is not a child of any node)
  const allNodes = new Set<string>();
  for (const [child, parent] of arbol.entries()) {
    allNodes.add(child);
    allNodes.add(parent);
  }
  const childrenSet = new Set(arbol.keys());
  let origin: string | undefined = undefined;
  for (const node of allNodes) {
    if (!childrenSet.has(node)) {
      origin = node;
      break;
    }
  }

  // If we didn't find an origin, return the tree as is (without the leaving node)
  if (origin === undefined) {
    return newTree;
  }

  // Find all direct children of the leaving node in the original tree
  const childrenToReattach: string[] = [];
  for (const [child, parent] of arbol.entries()) {
    if (parent === seVa) {
      childrenToReattach.push(child);
    }
  }

  // Reattach each child of the leaving node to the origin
  for (const childId of childrenToReattach) {
    newTree.set(childId, origin);
  }

  return newTree;
}