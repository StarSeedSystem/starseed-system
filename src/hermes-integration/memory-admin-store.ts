/**
 * Memory Admin Store — administrador completo de cada nodo del Cerebro.
 *
 * Para cada nodo guarda:
 *   - Logs (timeline de eventos: creación, ediciones, conexiones, accesos)
 *   - Versiones (snapshots etiquetados que se pueden restaurar)
 *   - Archivos asociados (paths con tamaño y tipo)
 *   - Folders/ubicaciones de almacenamiento (local, IndexedDB, IPFS, fediverso)
 *   - Configuraciones específicas del nodo
 *
 * Persiste en localStorage. La idea es que cada usuario tenga un control
 * absoluto sobre las facetas de su memoria personal y pueda moverla,
 * conectarla y desconectarla libremente.
 */

export interface MemoryLog {
  id: string;
  timestamp: string;
  action:
    | 'created'
    | 'edited'
    | 'connected'
    | 'disconnected'
    | 'moved'
    | 'accessed'
    | 'snapshot'
    | 'shared'
    | 'restored';
  details: string;
  actor?: string;
}

export interface MemoryVersion {
  id: string;
  timestamp: string;
  label: string;
  snapshot: Record<string, unknown>;
}

export interface MemoryFile {
  id: string;
  name: string;
  path: string;
  mime: string;
  sizeBytes: number;
  addedAt: string;
}

export type StorageLocation = 'local' | 'indexeddb' | 'supabase' | 'ipfs' | 'fediverso' | 'gdrive' | 'icloud';

export interface MemoryAdminRecord {
  nodeId: string;
  /** Peso global (0..1) que influye en la prominencia visual. */
  weight: number;
  /** Ubicación principal de almacenamiento. */
  storage: StorageLocation;
  /** Folder lógico dentro del perfil del usuario. */
  folder: string;
  /** Perfil al que pertenece (cuenta puede tener varios perfiles). */
  profileId: string;
  /** Cuenta raíz (Constitución: Cuenta privada soberana). */
  accountId: string;
  /** Etiquetas libres. */
  tags: string[];
  /** Notas privadas del usuario. */
  notes: string;
  /** Configuración libre key→value para este nodo. */
  config: Record<string, string>;
  logs: MemoryLog[];
  versions: MemoryVersion[];
  files: MemoryFile[];
  /** Ids de otros nodos a los que está sincronizado en otros perfiles. */
  syncedWith: string[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'starseed.memory-admin.v1';

const STORAGE_OPTIONS: { id: StorageLocation; label: string; description: string }[] = [
  { id: 'local',      label: 'Local (este dispositivo)', description: 'Persistido en localStorage del navegador.' },
  { id: 'indexeddb',  label: 'IndexedDB',                 description: 'Base local del navegador, mayor capacidad.' },
  { id: 'supabase',   label: 'Supabase (cuenta)',         description: 'Sincronizado con tu cuenta StarSeed.' },
  { id: 'ipfs',       label: 'IPFS',                      description: 'Almacenamiento descentralizado.' },
  { id: 'fediverso',  label: 'Fediverso',                 description: 'Compartido con nodos federados ActivityPub.' },
  { id: 'gdrive',     label: 'Google Drive',              description: 'Sincronizado con tu cuenta de Google.' },
  { id: 'icloud',     label: 'iCloud',                    description: 'Sincronizado con iCloud Drive.' },
];

export function getStorageOptions() { return STORAGE_OPTIONS; }

class MemoryAdminStore {
  private records = new Map<string, MemoryAdminRecord>();
  private loaded = false;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded) return;
    if (typeof window === 'undefined') { this.loaded = true; return; }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MemoryAdminRecord[];
        parsed.forEach((r) => this.records.set(r.nodeId, r));
      }
    } catch { /* noop */ }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.records.values())));
    } catch { /* noop */ }
    this.listeners.forEach((fn) => fn());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getOrInit(nodeId: string, defaults?: Partial<MemoryAdminRecord>): MemoryAdminRecord {
    this.load();
    let rec = this.records.get(nodeId);
    if (rec) return rec;
    const now = new Date().toISOString();
    rec = {
      nodeId,
      weight: 0.6,
      storage: 'local',
      folder: '/personal',
      profileId: 'me',
      accountId: 'self',
      tags: [],
      notes: '',
      config: {},
      logs: [{
        id: `log-${Date.now()}`,
        timestamp: now,
        action: 'created',
        details: 'Registro de administración inicializado.',
      }],
      versions: [],
      files: [],
      syncedWith: [],
      createdAt: now,
      updatedAt: now,
      ...defaults,
    };
    this.records.set(nodeId, rec);
    this.persist();
    return rec;
  }

  update(nodeId: string, patch: Partial<MemoryAdminRecord>, logEntry?: { action: MemoryLog['action']; details: string }) {
    this.load();
    const rec = this.getOrInit(nodeId);
    const next: MemoryAdminRecord = {
      ...rec,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (logEntry) {
      next.logs = [
        ...rec.logs,
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: next.updatedAt,
          ...logEntry,
        },
      ];
    }
    this.records.set(nodeId, next);
    this.persist();
    return next;
  }

  snapshot(nodeId: string, label: string, payload: Record<string, unknown>) {
    const rec = this.getOrInit(nodeId);
    const version: MemoryVersion = {
      id: `v-${Date.now()}`,
      timestamp: new Date().toISOString(),
      label,
      snapshot: payload,
    };
    return this.update(
      nodeId,
      { versions: [...rec.versions, version] },
      { action: 'snapshot', details: `Versión "${label}" guardada.` }
    );
  }

  restoreVersion(nodeId: string, versionId: string): MemoryAdminRecord | null {
    const rec = this.getOrInit(nodeId);
    const v = rec.versions.find((x) => x.id === versionId);
    if (!v) return null;
    return this.update(
      nodeId,
      { ...(v.snapshot as Partial<MemoryAdminRecord>) },
      { action: 'restored', details: `Versión "${v.label}" restaurada.` }
    );
  }

  addFile(nodeId: string, file: Omit<MemoryFile, 'id' | 'addedAt'>) {
    const rec = this.getOrInit(nodeId);
    const f: MemoryFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      addedAt: new Date().toISOString(),
      ...file,
    };
    return this.update(
      nodeId,
      { files: [...rec.files, f] },
      { action: 'edited', details: `Archivo "${f.name}" añadido.` }
    );
  }

  removeFile(nodeId: string, fileId: string) {
    const rec = this.getOrInit(nodeId);
    return this.update(
      nodeId,
      { files: rec.files.filter((f) => f.id !== fileId) },
      { action: 'edited', details: 'Archivo eliminado.' }
    );
  }

  syncWith(nodeId: string, otherNodeId: string) {
    const rec = this.getOrInit(nodeId);
    if (rec.syncedWith.includes(otherNodeId)) return rec;
    return this.update(
      nodeId,
      { syncedWith: [...rec.syncedWith, otherNodeId] },
      { action: 'connected', details: `Sincronizado con ${otherNodeId}.` }
    );
  }

  unsyncFrom(nodeId: string, otherNodeId: string) {
    const rec = this.getOrInit(nodeId);
    return this.update(
      nodeId,
      { syncedWith: rec.syncedWith.filter((x) => x !== otherNodeId) },
      { action: 'disconnected', details: `Sincronización con ${otherNodeId} detenida.` }
    );
  }

  move(nodeId: string, storage: StorageLocation, folder?: string) {
    return this.update(
      nodeId,
      { storage, folder: folder ?? this.getOrInit(nodeId).folder },
      { action: 'moved', details: `Movido a ${storage}${folder ? ` (${folder})` : ''}.` }
    );
  }

  all(): MemoryAdminRecord[] {
    this.load();
    return Array.from(this.records.values());
  }
}

let _store: MemoryAdminStore | null = null;
export function getMemoryAdminStore(): MemoryAdminStore {
  if (!_store) _store = new MemoryAdminStore();
  return _store;
}

// ── Perfiles de la cuenta ────────────────────────────────────────────────

export interface AccountProfile {
  id: string;
  label: string;
  description: string;
  glyph: string;
}

export const DEFAULT_PROFILES: AccountProfile[] = [
  { id: 'me',           label: 'Personal',     description: 'Perfil privado del usuario.',     glyph: '◉' },
  { id: 'civic',        label: 'Cívico',       description: 'Participación política y gobernanza.', glyph: '⚖' },
  { id: 'artistic',     label: 'Artístico',    description: 'Expresión cultural y creativa.',  glyph: '✦' },
  { id: 'professional', label: 'Profesional',  description: 'Trabajo y colaboraciones.',       glyph: '⚒' },
  { id: 'spiritual',    label: 'Espiritual',   description: 'Práctica contemplativa y comunitaria.', glyph: '☉' },
];
