/**
 * 🌌 StarSeed OS — Unified Memory Store
 *
 * Almacén central de memoria unificada: guarda y recupera nodos y aristas
 * del grafo vivo usando IndexedDB con búsqueda semántica.
 *
 * Singleton: getInstance()
 */

import type {
  MemoryNode, MemoryEdge, MemoryNodeType, MemoryEdgeType, MemoryLayer, GraphNode3D, GraphEdge3D
} from './01-types';

// ========================================================================
// IndexedDB helpers
// ========================================================================

const DB_NAME = 'starseed-memory';
const DB_VERSION = 1;

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

// ========================================================================
// Embedding helper (simulated — in production use transformers.js)
// ========================================================================

function simpleHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function computeEmbedding(text: string): Float32Array {
  // Simple bag-of-words embedding based on character n-grams
  // In production: use transformers.js or call an embedding API
  const dim = 64;
  const vec = new Float32Array(dim);
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    const idx = simpleHash(word) % dim;
    vec[idx] += 1 / words.length;
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

// ========================================================================
// Harmonic frequencies by node type (Solfeggio-based)
// ========================================================================

const BASE_FREQUENCIES: Record<string, number> = {
  conversation: 432,  // Unidad
  message: 432,
  memory_fact: 432,
  skill: 528,         // Transformación
  tool: 639,          // Conexión
  agent: 741,         // Expresión
  provider: 963,      // Trascendencia
  model: 852,         // Expansión
  api_key: 852,
  mcp_server: 852,
  user_preference: 432,
  log_entry: 396,     // Liberación
  discovery: 528,
};

function computeFrequency(type: string, accessCount: number): number {
  const base = BASE_FREQUENCIES[type] || 432;
  return base + (accessCount % 100) * 0.5;
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

  async ensureReady(): Promise<void> {
    if (!this.ready) await this.init();
  }

  // ======================================================================
  // NODES CRUD
  // ======================================================================

  async addNode(node: MemoryNode): Promise<void> {
    await this.ensureReady();
    const tx = this.db!.transaction(['nodes', 'embeddings'], 'readwrite');
    tx.objectStore('nodes').put({
      ...node,
      embedding: undefined, // Don't store raw Float32Array in IndexedDB
    });
    // Store embedding separately
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
    await this.ensureReady();
    const node = await this.db!.get('nodes', id);
    return node ?? null;
  }

  async updateNode(id: string, updates: Partial<MemoryNode>): Promise<void> {
    await this.ensureReady();
    const existing = await this.getNode(id);
    if (!existing) return;
    await this.addNode({ ...existing, ...updates, id });
  }

  async incrementAccess(id: string): Promise<void> {
    await this.ensureReady();
    const node = await this.getNode(id);
    if (!node) return;
    node.accessCount = (node.accessCount || 0) + 1;
    node.lastAccessedAt = new Date().toISOString();
    const tx = this.db!.transaction('nodes', 'readwrite');
    tx.objectStore('nodes').put(node);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteNode(id: string): Promise<void> {
    await this.ensureReady();
    const tx = this.db!.transaction(['nodes', 'edges', 'embeddings'], 'readwrite');

    // Delete node
    tx.objectStore('nodes').delete(id);
    tx.objectStore('embeddings').delete(id);

    // Delete all edges connected to this node
    const edgeIndex = tx.objectStore('edges').index('by-source');
    const range = IDBKeyRange.only(id);
    const req = edgeIndex.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        tx.objectStore('edges').delete(cursor.primaryKey);
        cursor.continue();
      }
    };

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ======================================================================
  // EDGES CRUD
  // ======================================================================

  async addEdge(edge: MemoryEdge): Promise<void> {
    await this.ensureReady();
    await this.db!.put('edges', edge);
  }

  async getEdgesForNode(nodeId: string): Promise<MemoryEdge[]> {
    await this.ensureReady();
    const sourceEdges = await this.db!.getAllFromIndex('edges', 'by-source', nodeId);
    const targetEdges = await this.db!.getAllFromIndex('edges', 'by-target', nodeId);
    return [...sourceEdges, ...targetEdges];
  }

  async deleteEdge(id: string): Promise<void> {
    await this.ensureReady();
    await this.db!.delete('edges', id);
  }

  // ======================================================================
  // QUERIES
  // ======================================================================

  async searchByType(type: MemoryNodeType): Promise<MemoryNode[]> {
    await this.ensureReady();
    const all: MemoryNode[] = await this.db!.getAllFromIndex('nodes', 'by-type', type);
    return all;
  }

  async searchByLayer(layer: MemoryLayer): Promise<{
    nodes: MemoryNode[];
    edges: MemoryEdge[];
  }> {
    await this.ensureReady();
    const { LAYER_CONFIGS } = await import('./02-layers');
    const config = LAYER_CONFIGS[layer];
    if (!config) return { nodes: [], edges: [] };

    // Get nodes matching this layer's types
    const allNodes: MemoryNode[] = [];
    for (const nodeType of config.nodeTypes) {
      const nodes = await this.searchByType(nodeType);
      allNodes.push(...nodes);
    }

    // Get edges between these nodes
    const nodeIds = new Set(allNodes.map(n => n.id));
    const allEdges: MemoryEdge[] = await this.db!.getAll('edges');
    const edges = allEdges.filter(
      e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)
    );

    return { nodes: allNodes, edges };
  }

  async semanticSearch(query: string, limit = 20): Promise<MemoryNode[]> {
    await this.ensureReady();

    // 1. Compute query embedding
    const queryEmb = computeEmbedding(query);

    // 2. Load all embeddings and score
    const allEmb: { id: string; vector: number[] }[] = await this.db!.getAll('embeddings');
    const scored = allEmb.map(e => ({
      id: e.id,
      score: cosineSimilarity(queryEmb, new Float32Array(e.vector)),
    }));
    scored.sort((a, b) => b.score - a.score);

    // 3. Fetch top nodes
    const topIds = scored.slice(0, limit).map(s => s.id);
    const nodes: MemoryNode[] = [];
    for (const id of topIds) {
      const node = await this.getNode(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  async textSearch(query: string): Promise<MemoryNode[]> {
    await this.ensureReady();
    const lowerQuery = query.toLowerCase();
    const all: MemoryNode[] = await this.db!.getAll('nodes');
    return all.filter(node =>
      node.label.toLowerCase().includes(lowerQuery) ||
      node.description.toLowerCase().includes(lowerQuery) ||
      node.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  async getAllTags(): Promise<string[]> {
    await this.ensureReady();
    const all: MemoryNode[] = await this.db!.getAll('nodes');
    const tagSet = new Set<string>();
    all.forEach(n => n.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }

  // ======================================================================
  // GRAPH BUILDER — Construye el grafo 3D desde la store
  // ======================================================================

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
        color: this.getNodeColor(n.type),
        data: n.data,
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

  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      conversation: '#38bdf8',   // Sky blue
      message: '#38bdf8',
      memory_fact: '#38bdf8',
      skill: '#a78bfa',          // Purple
      tool: '#39FF14',           // Neon lime
      agent: '#FFBF00',          // Amber
      provider: '#f472b6',       // Pink
      model: '#f472b6',
      api_key: '#fb923c',        // Orange
      mcp_server: '#34d399',     // Emerald
      user_preference: '#38bdf8',
      log_entry: '#818cf8',      // Indigo
      discovery: '#fbbf24',      // Yellow
    };
    return colors[type] || '#ffffff';
  }

  // ======================================================================
  // CONVENIENCE — Crear nodos de tipos comunes
  // ======================================================================

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

/**
 * Opens the IndexedDB database and returns it.
 * Helper for internal use by UnifiedMemoryStore.
 */
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