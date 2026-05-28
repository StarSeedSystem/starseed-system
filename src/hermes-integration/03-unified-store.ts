/**
 * 🌌 StarSeed OS — Unified Memory Store
 *
 * Almacén central de memoria unificada usando IndexedDB.
 * Singleton vía getInstance().
 */

import type {
  MemoryNode, MemoryEdge, MemoryNodeType, MemoryLayer, GraphNode3D, GraphEdge3D
} from './01-types';

const DB_NAME = 'starseed-memory';
const DB_VERSION = 1;

// ========================================================================
// IndexedDB helpers
// ========================================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('nodes')) {
        const nodes = db.createObjectStore('nodes', { keyPath: 'id' });
        nodes.createIndex('by-type', 'type', { unique: false });
        nodes.createIndex('by-layer', 'layer', { unique: false });
        nodes.createIndex('by-tag', 'tags', { unique: false, multiEntry: true });
      }
      if (!db.objectStoreNames.contains('edges')) {
        const edges = db.createObjectStore('edges', { keyPath: 'id' });
        edges.createIndex('by-source', 'sourceId', { unique: false });
        edges.createIndex('by-target', 'targetId', { unique: false });
      }
      if (!db.objectStoreNames.contains('embeddings')) {
        db.createObjectStore('embeddings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txGet<T>(db: IDBDatabase, storeName: string, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

function txPut<T>(db: IDBDatabase, storeName: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txDelete(db: IDBDatabase, storeName: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txGetAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

function txGetAllFromIndex<T>(db: IDBDatabase, storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

// ========================================================================
// Embedding helper
// ========================================================================

function simpleHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function computeEmbedding(text: string): Float32Array {
  const dim = 64;
  const vec = new Float32Array(dim);
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    const idx = simpleHash(word) % dim;
    vec[idx] += 1 / Math.max(words.length, 1);
  }
  return vec;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

const BASE_FREQUENCIES: Record<string, number> = {
  conversation: 432, message: 432, memory_fact: 432,
  skill: 528, tool: 639, agent: 741,
  provider: 963, model: 852, api_key: 852,
  mcp_server: 852, user_preference: 432,
  log_entry: 396, discovery: 528,
};

const NODE_COLORS: Record<string, string> = {
  conversation: '#38bdf8', message: '#38bdf8', memory_fact: '#38bdf8',
  skill: '#a78bfa', tool: '#39FF14', agent: '#FFBF00',
  provider: '#f472b6', model: '#f472b6', api_key: '#fb923c',
  mcp_server: '#34d399', user_preference: '#38bdf8',
  log_entry: '#818cf8', discovery: '#fbbf24',
};

function computeFrequency(type: string, accessCount: number): number {
  return (BASE_FREQUENCIES[type] || 432) + (accessCount % 100) * 0.5;
}

// ========================================================================
// Unified Memory Store
// ========================================================================

export class UnifiedMemoryStore {
  private db: IDBDatabase | null = null;
  private static instance: UnifiedMemoryStore;
  private ready = false;

  private constructor() {}

  static getInstance(): UnifiedMemoryStore {
    if (!this.instance) this.instance = new UnifiedMemoryStore();
    return this.instance;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    this.db = await openDB();
    this.ready = true;
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.ready) await this.init();
    return this.db!;
  }

  // ====================================================================
  // NODES
  // ====================================================================

  async addNode(node: MemoryNode): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(['nodes', 'embeddings'], 'readwrite');
    tx.objectStore('nodes').put({ ...node, embedding: undefined });
    tx.objectStore('embeddings').put({
      id: node.id,
      vector: Array.from(computeEmbedding(node.label + ' ' + node.description)),
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getNode(id: string): Promise<MemoryNode | null> {
    const db = await this.ensureDB();
    return (await txGet<MemoryNode>(db, 'nodes', id)) ?? null;
  }

  async updateNode(id: string, updates: Partial<MemoryNode>): Promise<void> {
    const existing = await this.getNode(id);
    if (!existing) return;
    await this.addNode({ ...existing, ...updates, id });
  }

  async incrementAccess(id: string): Promise<void> {
    const node = await this.getNode(id);
    if (!node) return;
    node.accessCount = (node.accessCount || 0) + 1;
    node.lastAccessedAt = new Date().toISOString();
    const db = await this.ensureDB();
    await txPut(db, 'nodes', node);
  }

  async deleteNode(id: string): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction(['nodes', 'edges', 'embeddings'], 'readwrite');
    tx.objectStore('nodes').delete(id);
    tx.objectStore('embeddings').delete(id);
    // Delete edges referencing this node
    const edgeReq = tx.objectStore('edges').openCursor();
    edgeReq.onsuccess = () => {
      const cursor = edgeReq.result;
      if (cursor) {
        const edge = cursor.value as MemoryEdge;
        if (edge.sourceId === id || edge.targetId === id) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ====================================================================
  // EDGES
  // ====================================================================

  async addEdge(edge: MemoryEdge): Promise<void> {
    const db = await this.ensureDB();
    await txPut(db, 'edges', edge);
  }

  async getEdgesForNode(nodeId: string): Promise<MemoryEdge[]> {
    const db = await this.ensureDB();
    const sourceEdges = await txGetAllFromIndex<MemoryEdge>(db, 'edges', 'by-source', nodeId);
    const targetEdges = await txGetAllFromIndex<MemoryEdge>(db, 'edges', 'by-target', nodeId);
    return [...sourceEdges, ...targetEdges];
  }

  // ====================================================================
  // QUERIES
  // ====================================================================

  async searchByType(type: MemoryNodeType): Promise<MemoryNode[]> {
    const db = await this.ensureDB();
    return txGetAllFromIndex<MemoryNode>(db, 'nodes', 'by-type', type);
  }

  async searchByLayer(layer: MemoryLayer): Promise<{
    nodes: MemoryNode[];
    edges: MemoryEdge[];
  }> {
    const { LAYER_CONFIGS } = await import('./02-layers');
    const config = LAYER_CONFIGS[layer];
    if (!config) return { nodes: [], edges: [] };

    const allNodes: MemoryNode[] = [];
    for (const nodeType of config.nodeTypes) {
      const nodes = await this.searchByType(nodeType);
      allNodes.push(...nodes);
    }

    const db = await this.ensureDB();
    const allEdges: MemoryEdge[] = await txGetAll(db, 'edges');
    const nodeIds = new Set(allNodes.map(n => n.id));
    const edges = allEdges.filter(
      e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)
    );

    return { nodes: allNodes, edges };
  }

  async semanticSearch(query: string, limit = 20): Promise<MemoryNode[]> {
    const db = await this.ensureDB();
    const queryEmb = computeEmbedding(query);
    const allEmb: { id: string; vector: number[] }[] = await txGetAll(db, 'embeddings');

    const scored = allEmb.map(e => ({
      id: e.id,
      score: cosineSimilarity(queryEmb, new Float32Array(e.vector)),
    }));
    scored.sort((a, b) => b.score - a.score);

    const topIds = scored.slice(0, limit).map(s => s.id);
    const nodes: MemoryNode[] = [];
    for (const id of topIds) {
      const node = await this.getNode(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  async textSearch(query: string): Promise<MemoryNode[]> {
    const db = await this.ensureDB();
    const lowerQuery = query.toLowerCase();
    const all: MemoryNode[] = await txGetAll(db, 'nodes');
    return all.filter(node =>
      node.label.toLowerCase().includes(lowerQuery) ||
      node.description.toLowerCase().includes(lowerQuery) ||
      node.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  async getAllNodes(): Promise<MemoryNode[]> {
    const db = await this.ensureDB();
    return txGetAll<MemoryNode>(db, 'nodes');
  }

  // ====================================================================
  // GRAPH BUILDER
  // ====================================================================

  async buildGraph(layer: MemoryLayer): Promise<{
    nodes: GraphNode3D[];
    edges: GraphEdge3D[];
  }> {
    const { nodes, edges } = await this.searchByLayer(layer);

    return {
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type,
        label: n.label,
        size: Math.max(3, Math.log2((n.accessCount || 0) + 2) * 3),
        frequency: computeFrequency(n.type, n.accessCount || 0),
        mass: Math.max(1, (n.accessCount || 0) + 1) * 0.5,
        selected: false,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        color: NODE_COLORS[n.type] || '#ffffff',
        data: n as unknown as Record<string, unknown>,
      })),
      edges: edges.map(e => ({
        source: e.sourceId,
        target: e.targetId,
        weight: e.weight,
        frequency: e.frequency,
        type: e.type,
      })),
    };
  }

  // ====================================================================
  // CONVENIENCE
  // ====================================================================

  async createDiscoveryNode(
    label: string,
    description: string,
    sourceData: Record<string, unknown>,
  ): Promise<string> {
    const id = `discovery-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await this.addNode({
      id,
      type: 'discovery',
      label,
      description,
      data: sourceData,
      tags: ['discovery', 'auto-detected'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 0,
      lastAccessedAt: new Date().toISOString(),
      layer: 'discoveries',
    });
    return id;
  }
}