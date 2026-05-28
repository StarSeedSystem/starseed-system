/**
 * Content Store — capa unificada para posts, archivos, mensajes y eventos.
 * Funcional desde el primer momento (local). Cuando llegue el servidor en
 * línea, basta cambiar `serverRegistry.getActive()` para que las mismas
 * llamadas escriban contra él.
 */

import { getServerRegistry, type ServerEntry } from './server-registry';
import { getLivingGraphStore } from './living-graph-store';
import { getOpenHumanEngine } from './openhuman-bridge';

export type ContentKind = 'post' | 'file' | 'message' | 'event';

export interface ContentItem {
  id: string;
  kind: ContentKind;
  authorId: string;
  authorLabel: string;
  body?: string;
  /** Archivo: nombre + MIME + URL/dataURL. */
  fileName?: string;
  mime?: string;
  url?: string;
  /** Conexiones con otros items del mismo perfil/comunidad. */
  refs: string[];
  visibility: 'privada' | 'comunidad' | 'red';
  /** Servidor donde reside. */
  serverId: string;
  createdAt: string;
  /** Etiquetas libres. */
  tags: string[];
  /** Metadatos del schema gemini.md (Lienzo Universal). */
  meta: Record<string, unknown>;
}

const STORAGE_KEY = 'starseed.content-store.v1';

class ContentStore {
  private items: ContentItem[] = [];
  private loaded = false;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded) return;
    if (typeof window === 'undefined') { this.loaded = true; return; }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.items = JSON.parse(raw);
    } catch { /* noop */ }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items)); } catch { /* noop */ }
    this.listeners.forEach((fn) => fn());
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  all(): ContentItem[] { this.load(); return this.items; }

  byKind(kind: ContentKind): ContentItem[] {
    this.load();
    return this.items.filter((i) => i.kind === kind);
  }

  byAuthor(authorId: string): ContentItem[] {
    this.load();
    return this.items.filter((i) => i.authorId === authorId);
  }

  create(item: Omit<ContentItem, 'id' | 'createdAt' | 'refs' | 'serverId' | 'tags' | 'meta'> & {
    refs?: string[]; tags?: string[]; meta?: Record<string, unknown>;
  }): ContentItem {
    this.load();
    const server = getServerRegistry().getScopeServer(
      item.kind === 'file' ? 'files' :
      item.kind === 'message' ? 'messages' :
      item.kind === 'event' ? 'events' :
      'posts'
    );
    const full: ContentItem = {
      ...item,
      id: `${item.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      refs: item.refs ?? [],
      tags: item.tags ?? [],
      meta: item.meta ?? {},
      serverId: server.id,
    };
    this.items = [full, ...this.items];
    this.persist();
    // Reflejar en el Cerebro como conversation o memory node
    try {
      const graph = getLivingGraphStore();
      const kindToNodeKind = { post: 'memory', file: 'memory', message: 'conversation', event: 'memory' } as const;
      graph.addNode({
        id: `content-${full.id}`,
        kind: kindToNodeKind[full.kind],
        label: full.body?.slice(0, 40) ?? full.fileName ?? full.kind,
        description: `${full.kind} en ${server.label}`,
      } as any);
      graph.addEdge({ sourceId: 'self', targetId: `content-${full.id}`, kind: 'remembers', origin: 'system' });
    } catch { /* noop */ }
    // Indexar en OpenHuman FTS
    try {
      const txt = (full.body ?? '') + ' ' + (full.fileName ?? '');
      if (txt.trim()) getOpenHumanEngine().ingest(txt, 'document', `content-${full.id}`);
    } catch { /* noop */ }
    return full;
  }

  update(id: string, patch: Partial<ContentItem>) {
    this.load();
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    this.persist();
  }

  remove(id: string) {
    this.load();
    this.items = this.items.filter((i) => i.id !== id);
    this.persist();
  }

  /** Conectar dos items entre sí (singularidad del contenido — Lienzo Universal). */
  link(aId: string, bId: string) {
    this.load();
    this.items = this.items.map((i) => {
      if (i.id === aId && !i.refs.includes(bId)) return { ...i, refs: [...i.refs, bId] };
      if (i.id === bId && !i.refs.includes(aId)) return { ...i, refs: [...i.refs, aId] };
      return i;
    });
    this.persist();
  }

  stats() {
    this.load();
    const byKind: Record<ContentKind, number> = { post: 0, file: 0, message: 0, event: 0 };
    const byServer: Record<string, number> = {};
    this.items.forEach((i) => {
      byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
      byServer[i.serverId] = (byServer[i.serverId] ?? 0) + 1;
    });
    return { total: this.items.length, byKind, byServer };
  }
}

let _store: ContentStore | null = null;
export function getContentStore(): ContentStore {
  if (!_store) _store = new ContentStore();
  return _store;
}
