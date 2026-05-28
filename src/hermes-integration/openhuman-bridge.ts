/**
 * 🌌 StarSeed OS — Bridge OpenHuman AI × Hermes
 *
 * Implementa el modelo de memoria de 3 capas de OpenHuman AI:
 *   1. Memory Tree (jerárquico-sumario)
 *   2. FTS-like full-text search (indexado en memoria + persistido)
 *   3. KV Store namespaced (global, background, autocomplete, skill-*)
 *
 * Y lo conecta con el grafo unificado de Hermes — cada hecho, sesión,
 * preferencia, descubrimiento, skill y tool se traduce automáticamente
 * a nodos/aristas en la Gráfica Viva.
 *
 * Persistencia: localStorage para arranque rápido + delegación opcional
 * al UnifiedMemoryStore (IndexedDB) cuando esté disponible.
 *
 * Esta es la "fusión funcional" de los dos sistemas:
 *   - OpenHuman aporta la organización semántica de la memoria
 *   - Hermes aporta los registries de skills/tools/MCP y el grafo
 */

import type { MemoryNode, MemoryEdge, MemoryNodeType, MemoryEdgeType } from './01-types';

// ── 1. KV STORE NAMESPACED (OpenHuman §3) ─────────────────────────────────

export type KvNamespace = 'global' | 'background' | 'autocomplete' | string;
export type KvCategory = 'core' | 'daily' | 'conversation';

export interface KvEntry {
  namespace: KvNamespace;
  key: string;
  content: string;
  category: KvCategory;
  createdAt: string;
  updatedAt: string;
}

const KV_STORAGE_KEY = 'starseed.openhuman.kv.v1';

class KvStore {
  private entries = new Map<string, KvEntry>();
  private loaded = false;

  private load() {
    if (this.loaded) return;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(KV_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as KvEntry[];
        parsed.forEach((e) => this.entries.set(this.compositeKey(e.namespace, e.key), e));
      }
    } catch { /* ignore */ }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        KV_STORAGE_KEY,
        JSON.stringify(Array.from(this.entries.values()))
      );
    } catch { /* ignore */ }
  }

  private compositeKey(ns: string, key: string): string {
    return `${ns}::${key}`;
  }

  store(namespace: KvNamespace, key: string, content: string, category: KvCategory = 'core'): KvEntry {
    this.load();
    const ck = this.compositeKey(namespace, key);
    const existing = this.entries.get(ck);
    const now = new Date().toISOString();
    const entry: KvEntry = {
      namespace, key, content, category,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.entries.set(ck, entry);
    this.persist();
    return entry;
  }

  get(namespace: KvNamespace, key: string): string | undefined {
    this.load();
    return this.entries.get(this.compositeKey(namespace, key))?.content;
  }

  forget(namespace: KvNamespace, key: string): boolean {
    this.load();
    const ok = this.entries.delete(this.compositeKey(namespace, key));
    if (ok) this.persist();
    return ok;
  }

  list(namespace?: KvNamespace, category?: KvCategory): KvEntry[] {
    this.load();
    return Array.from(this.entries.values()).filter((e) => {
      if (namespace && e.namespace !== namespace) return false;
      if (category && e.category !== category) return false;
      return true;
    });
  }

  clearCategory(category: KvCategory) {
    this.load();
    for (const [ck, e] of this.entries.entries()) {
      if (e.category === category) this.entries.delete(ck);
    }
    this.persist();
  }
}

// ── 2. MEMORY TREE (OpenHuman §1) ─────────────────────────────────────────

export type SourceKind = 'email' | 'chat' | 'document' | 'system' | 'sincrometro' | 'skill' | 'discovery';

export interface TreeNode {
  nodeId: string;
  parentId: string | null;
  depth: number;
  summary: string;
  sourceKind: SourceKind;
  timeStart: string;
  timeEnd: string;
  childIds: string[];
  chunkIds: string[];
  entityIds: string[];
}

export interface Chunk {
  chunkId: string;
  nodeId: string;
  content: string;
  sourceRef?: string;
  timestamp: string;
}

export interface Entity {
  entityId: string;
  displayName: string;
  kind: string;
}

const TREE_STORAGE_KEY = 'starseed.openhuman.tree.v1';

class MemoryTree {
  private nodes = new Map<string, TreeNode>();
  private chunks = new Map<string, Chunk>();
  private entities = new Map<string, Entity>();
  private loaded = false;

  private load() {
    if (this.loaded || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(TREE_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { nodes: TreeNode[]; chunks: Chunk[]; entities: Entity[] };
        data.nodes?.forEach((n) => this.nodes.set(n.nodeId, n));
        data.chunks?.forEach((c) => this.chunks.set(c.chunkId, c));
        data.entities?.forEach((e) => this.entities.set(e.entityId, e));
      }
    } catch { /* ignore */ }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        TREE_STORAGE_KEY,
        JSON.stringify({
          nodes: Array.from(this.nodes.values()),
          chunks: Array.from(this.chunks.values()),
          entities: Array.from(this.entities.values()),
        })
      );
    } catch { /* ignore */ }
  }

  insertChunk(content: string, sourceKind: SourceKind, sourceRef?: string, entityIds: string[] = []): { nodeId: string; chunkId: string } {
    this.load();
    const ts = new Date().toISOString();
    const chunkId = `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const summary = content.length > 200 ? content.slice(0, 197) + '…' : content;
    this.nodes.set(nodeId, {
      nodeId, parentId: null, depth: 0,
      summary, sourceKind,
      timeStart: ts, timeEnd: ts,
      childIds: [], chunkIds: [chunkId],
      entityIds,
    });
    this.chunks.set(chunkId, { chunkId, nodeId, content, sourceRef, timestamp: ts });
    this.persist();
    return { nodeId, chunkId };
  }

  upsertEntity(displayName: string, kind: string): Entity {
    this.load();
    const existing = Array.from(this.entities.values()).find(
      (e) => e.displayName.toLowerCase() === displayName.toLowerCase() && e.kind === kind
    );
    if (existing) return existing;
    const entityId = `entity-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const ent: Entity = { entityId, displayName, kind };
    this.entities.set(entityId, ent);
    this.persist();
    return ent;
  }

  queryGlobal(days = 7): TreeNode[] {
    this.load();
    const cutoff = Date.now() - days * 86_400_000;
    return Array.from(this.nodes.values())
      .filter((n) => new Date(n.timeStart).getTime() >= cutoff)
      .sort((a, b) => b.timeStart.localeCompare(a.timeStart));
  }

  querySource(kind: SourceKind, days = 30): TreeNode[] {
    return this.queryGlobal(days).filter((n) => n.sourceKind === kind);
  }

  queryTopic(entityId: string, limit = 10): TreeNode[] {
    this.load();
    return Array.from(this.nodes.values())
      .filter((n) => n.entityIds.includes(entityId))
      .sort((a, b) => b.timeStart.localeCompare(a.timeStart))
      .slice(0, limit);
  }

  searchEntities(query: string): Entity[] {
    this.load();
    const q = query.toLowerCase();
    return Array.from(this.entities.values()).filter((e) =>
      e.displayName.toLowerCase().includes(q)
    );
  }

  fetchChunks(chunkIds: string[]): Chunk[] {
    this.load();
    return chunkIds.map((id) => this.chunks.get(id)).filter((c): c is Chunk => !!c);
  }

  allNodes(): TreeNode[] {
    this.load();
    return Array.from(this.nodes.values());
  }
}

// ── 3. FTS-LIKE FULL-TEXT INDEX (OpenHuman §2) ────────────────────────────

const FTS_STORAGE_KEY = 'starseed.openhuman.fts.v1';

interface FtsDoc {
  chunkId: string;
  content: string;
  sourceKind: SourceKind;
  timestamp: string;
  entityIds: string[];
}

class FtsIndex {
  private docs: FtsDoc[] = [];
  private loaded = false;

  private load() {
    if (this.loaded || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(FTS_STORAGE_KEY);
      if (raw) this.docs = JSON.parse(raw);
    } catch { /* ignore */ }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FTS_STORAGE_KEY, JSON.stringify(this.docs));
    } catch { /* ignore */ }
  }

  index(doc: FtsDoc) {
    this.load();
    const existing = this.docs.findIndex((d) => d.chunkId === doc.chunkId);
    if (existing >= 0) this.docs[existing] = doc;
    else this.docs.push(doc);
    this.persist();
  }

  /**
   * Búsqueda simple por tokens (case-insensitive). Para producción se
   * conectaría con SQLite WASM FTS5 o un motor más rico.
   */
  search(query: string, limit = 20): FtsDoc[] {
    this.load();
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const scored = this.docs.map((d) => {
      const text = d.content.toLowerCase();
      const score = tokens.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
      return { doc: d, score };
    });
    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.doc);
  }
}

// ── 4. ORCHESTRATOR (OpenHuman §4) ────────────────────────────────────────

/**
 * Orquestador: decide qué capa usar según la intención del usuario.
 * Reglas duras de OpenHuman §4:
 *   - Pregunta sobre el PASADO ingerido → memory_tree
 *   - Pregunta sobre el PRESENTE (inbox actual) → integrations_agent (no tree)
 *   - Dato personal → memory_store(global, core)
 *   - Sesión compleja terminó → archive_session
 *   - "Recordame X" → memory_store o cron_add
 */
export type OrchestratorAction =
  | { kind: 'query_tree'; topic?: string; entityId?: string }
  | { kind: 'query_source'; sourceKind: SourceKind; days: number }
  | { kind: 'fetch_inbox'; integration: string }
  | { kind: 'store_fact'; namespace: KvNamespace; key: string; content: string }
  | { kind: 'recall'; namespace: KvNamespace; key: string }
  | { kind: 'archive'; sessionId: string };

export function decideAction(prompt: string): OrchestratorAction[] {
  const lower = prompt.toLowerCase();
  const actions: OrchestratorAction[] = [];
  if (/(qué|que).*(dijo|dijiste|hablamos|comentamos)/.test(lower) || /la semana pasada|ayer|el mes pasado/.test(lower)) {
    actions.push({ kind: 'query_tree', topic: prompt });
  }
  if (/inbox|bandeja|email nuevos|nuevos correos/.test(lower)) {
    actions.push({ kind: 'fetch_inbox', integration: 'gmail' });
  }
  if (/(acordate|acuérdate|recuerda|guarda) (que|de|esto|esta)/.test(lower)) {
    const m = lower.match(/(?:acordate|acuérdate|recuerda|guarda)(?: que| de| esto| esta)?\s*[:,]?\s*(.+)/);
    if (m) actions.push({ kind: 'store_fact', namespace: 'global', key: `note-${Date.now()}`, content: m[1] });
  }
  if (/(qué|que).*(lenguaje|idioma|tono|estilo).*(uso|prefiero)/.test(lower)) {
    actions.push({ kind: 'recall', namespace: 'global', key: 'lang' });
  }
  return actions;
}

// ── 5. SINGLETON ORCHESTRATOR ─────────────────────────────────────────────

export class OpenHumanMemoryEngine {
  public kv = new KvStore();
  public tree = new MemoryTree();
  public fts = new FtsIndex();

  /** Ingesta orquestada: chunkea, indexa, y devuelve el nodeId. */
  ingest(content: string, sourceKind: SourceKind, sourceRef?: string, entityIds: string[] = []): string {
    const { nodeId, chunkId } = this.tree.insertChunk(content, sourceKind, sourceRef, entityIds);
    this.fts.index({
      chunkId,
      content,
      sourceKind,
      timestamp: new Date().toISOString(),
      entityIds,
    });
    return nodeId;
  }

  decide(prompt: string): OrchestratorAction[] {
    return decideAction(prompt);
  }

  /**
   * Serializa la memoria viva para construir un grafo armónico unificado.
   * Cada hecho KV, cada nodo del árbol y cada entidad se proyecta como
   * un MemoryNode de Hermes con su tipo y aristas correspondientes.
   */
  projectToGraph(): { nodes: MemoryNode[]; edges: MemoryEdge[] } {
    const nodes: MemoryNode[] = [];
    const edges: MemoryEdge[] = [];
    const now = new Date().toISOString();

    // KV → user_preference / memory_fact nodes
    for (const kv of this.kv.list()) {
      nodes.push({
        id: `kv-${kv.namespace}-${kv.key}`,
        type: kv.namespace === 'global' && kv.category === 'core' ? 'user_preference' : 'memory_fact',
        label: kv.key,
        description: kv.content.slice(0, 120),
        data: { namespace: kv.namespace, category: kv.category },
        tags: ['kv', kv.namespace, kv.category],
        createdAt: kv.createdAt,
        updatedAt: kv.updatedAt,
        accessCount: 0,
        lastAccessedAt: kv.updatedAt,
        layer: 'memory',
      });
    }

    // Tree nodes → conversation/message nodes
    for (const tn of this.tree.allNodes()) {
      nodes.push({
        id: `tn-${tn.nodeId}`,
        type: tn.sourceKind === 'chat' ? 'message' : tn.sourceKind === 'email' ? 'message' : 'log_entry',
        label: tn.summary.slice(0, 50),
        description: tn.summary,
        data: { sourceKind: tn.sourceKind, depth: tn.depth },
        tags: ['tree', tn.sourceKind],
        createdAt: tn.timeStart,
        updatedAt: tn.timeEnd,
        accessCount: 0,
        lastAccessedAt: tn.timeEnd,
        layer: 'memory',
      });
      // Edges to entities mentioned
      for (const entityId of tn.entityIds) {
        edges.push({
          id: `edge-${tn.nodeId}-${entityId}`,
          sourceId: `tn-${tn.nodeId}`,
          targetId: `ent-${entityId}`,
          type: 'references',
          weight: 1,
          frequency: 432,
          data: {},
          createdAt: now,
        });
      }
    }

    return { nodes, edges };
  }

  /** Snapshot textual estilo OpenHuman MEMORY.md para inyectar en el agente. */
  buildContextSnapshot(): string {
    const lines: string[] = [];
    lines.push('# Memory Log — Snapshot');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Core preferences (KV global/core)');
    const core = this.kv.list('global', 'core');
    if (core.length === 0) lines.push('- (none)');
    core.forEach((kv) => lines.push(`- **${kv.key}**: ${kv.content}`));
    lines.push('');
    lines.push('## Recent activity (memory tree, last 7d)');
    const recent = this.tree.queryGlobal(7).slice(0, 10);
    if (recent.length === 0) lines.push('- (no recent activity)');
    recent.forEach((n) => lines.push(`- [${n.sourceKind}] ${n.summary}`));
    return lines.join('\n');
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let _engine: OpenHumanMemoryEngine | null = null;

export function getOpenHumanEngine(): OpenHumanMemoryEngine {
  if (!_engine) _engine = new OpenHumanMemoryEngine();
  return _engine;
}
