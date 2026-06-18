/**
 * StarSeed OS — Exocórtex · Memory Graph Data
 *
 * Carga el grafo de memoria del ecosistema StarSeed desde
 * src/data/starseed-memory-graph.json y expone tipos + helpers.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import raw from "@/data/starseed-memory-graph.json";

// ============================================================
// Tipos
// ============================================================

export interface MemoryLink {
  label: string;
  url: string;
}

export interface MemoryNode {
  id: string;
  label: string;
  type: string;
  kind: string;
  context: string[];
  group: number;
  status: string;
  summary?: string;
  links?: MemoryLink[];
}

export interface MemoryEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
  label?: string;
}

export interface MemoryMeta {
  name: string;
  version: number;
  generated: string;
  maintainer: string;
  description: string;
  nodeTypes: Record<string, string>;
  edgeTypes: Record<string, string>;
  memoryKinds: string[];
  contexts: string[];
}

export interface MemoryGraph {
  meta: MemoryMeta;
  nodes: MemoryNode[];
  edges: MemoryEdge[];
}

// ============================================================
// Grafo exportado (parseado + tipado)
// ============================================================

const _raw = raw as any;

export const memoryGraph: MemoryGraph = {
  meta: _raw.meta as MemoryMeta,
  nodes: (_raw.nodes ?? []) as MemoryNode[],
  edges: (_raw.edges ?? []) as MemoryEdge[],
};

// ============================================================
// Helpers
// ============================================================

/** Devuelve los nodos agrupados por kind. */
export function nodesByKind(): Record<string, MemoryNode[]> {
  return memoryGraph.nodes.reduce<Record<string, MemoryNode[]>>((acc, node) => {
    const k = node.kind ?? "desconocido";
    if (!acc[k]) acc[k] = [];
    acc[k].push(node);
    return acc;
  }, {});
}

/** Busca nodos cuyo label, summary o context incluyan la query (case-insensitive). */
export function searchNodes(q: string): MemoryNode[] {
  if (!q.trim()) return [];
  const lower = q.toLowerCase();
  return memoryGraph.nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(lower) ||
      (n.summary ?? "").toLowerCase().includes(lower) ||
      (n.context ?? []).some((c) => c.toLowerCase().includes(lower)) ||
      n.type.toLowerCase().includes(lower) ||
      n.kind.toLowerCase().includes(lower)
  );
}

/** Devuelve un nodo por id, o undefined. */
export function getNode(id: string): MemoryNode | undefined {
  return memoryGraph.nodes.find((n) => n.id === id);
}

/** Devuelve los nodos vecinos (directamente conectados) de un nodo. */
export function neighbors(id: string): MemoryNode[] {
  const connectedIds = new Set<string>();
  for (const edge of memoryGraph.edges) {
    if (edge.source === id) connectedIds.add(edge.target);
    if (edge.target === id) connectedIds.add(edge.source);
  }
  return memoryGraph.nodes.filter((n) => connectedIds.has(n.id));
}
