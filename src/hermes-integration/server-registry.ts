/**
 * Server Registry — registro de servidores y bases de datos a los que el
 * usuario puede conectar publicaciones, archivos, mensajes, agentes y
 * memorias.
 *
 * Default: servidor LOCAL (este dispositivo, IndexedDB + localStorage).
 * Cuando llegue el servidor en línea, se podrá apuntar a él sin tocar la
 * lógica de las publicaciones — solo cambiando la entrada activa.
 *
 * Es la pieza que permite que toda la red sea "funcional e interconectada":
 * publicaciones, archivos, historias, comentarios y eventos viven en alguno
 * de estos servidores, y el usuario decide cuál usa para cada perfil/grupo.
 */

export type ServerKind = 'local' | 'remote-http' | 'supabase' | 'fediverso' | 'ipfs' | 'custom';
export type DatabaseKind = 'localstorage' | 'indexeddb' | 'sqlite-wasm' | 'postgres' | 'sqlite-remote' | 'rxdb';

export interface ServerEntry {
  id: string;
  label: string;
  description: string;
  kind: ServerKind;
  url?: string;
  /** Base de datos asociada. */
  database: DatabaseKind;
  /** Datos almacenados en este servidor: posts, archivos, mensajes, eventos, memorias. */
  scopes: ('posts' | 'files' | 'messages' | 'events' | 'memory' | 'stories' | 'agents')[];
  /** Estado de conexión actual. */
  status: 'connected' | 'disconnected' | 'error' | 'configuring';
  /** Si es el servidor activo por defecto del sistema. */
  isDefault: boolean;
  /** Origin: 'preset' (semilla) o 'user' (añadido manualmente). */
  origin: 'preset' | 'user';
  createdAt: string;
  lastSync?: string;
}

const STORAGE_KEY = 'starseed.server-registry.v1';
const ACTIVE_KEY = 'starseed.server-registry.active.v1';

const SEED: ServerEntry[] = [
  {
    id: 'local',
    label: 'Local (este dispositivo)',
    description: 'Todo se guarda en tu navegador. Funciona sin internet. Por defecto al iniciar.',
    kind: 'local',
    database: 'indexeddb',
    scopes: ['posts', 'files', 'messages', 'events', 'memory', 'stories', 'agents'],
    status: 'connected',
    isDefault: true,
    origin: 'preset',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'supabase-default',
    label: 'Supabase (cuenta StarSeed)',
    description: 'Base PostgreSQL gestionada. Activable cuando configures el .env.',
    kind: 'supabase',
    url: 'https://*.supabase.co',
    database: 'postgres',
    scopes: ['posts', 'files', 'messages', 'events', 'memory', 'stories', 'agents'],
    status: 'disconnected',
    isDefault: false,
    origin: 'preset',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'fediverso',
    label: 'Fediverso (ActivityPub)',
    description: 'Federa publicaciones con otros nodos. Solo lo público se propaga.',
    kind: 'fediverso',
    database: 'postgres',
    scopes: ['posts', 'messages', 'events'],
    status: 'disconnected',
    isDefault: false,
    origin: 'preset',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'ipfs',
    label: 'IPFS',
    description: 'Almacenamiento descentralizado para archivos pesados (vídeo, audio, datasets).',
    kind: 'ipfs',
    database: 'indexeddb',
    scopes: ['files', 'stories'],
    status: 'disconnected',
    isDefault: false,
    origin: 'preset',
    createdAt: new Date(0).toISOString(),
  },
];

function load(): ServerEntry[] {
  if (typeof window === 'undefined') return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ServerEntry[];
      const known = new Set(parsed.map((s) => s.id));
      const missing = SEED.filter((s) => !known.has(s.id));
      return [...parsed, ...missing];
    }
  } catch { /* noop */ }
  return SEED;
}

function persist(servers: ServerEntry[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(servers)); } catch { /* noop */ }
}

class ServerRegistry {
  private servers: ServerEntry[] = SEED;
  private active = 'local';
  private loaded = false;
  private listeners = new Set<() => void>();

  private ensureLoaded() {
    if (this.loaded) return;
    this.servers = load();
    if (typeof window !== 'undefined') {
      try { this.active = window.localStorage.getItem(ACTIVE_KEY) ?? 'local'; } catch { /* noop */ }
    }
    this.loaded = true;
  }

  private notify() { this.listeners.forEach((fn) => fn()); }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  all(): ServerEntry[] { this.ensureLoaded(); return this.servers; }

  get(id: string): ServerEntry | undefined { this.ensureLoaded(); return this.servers.find((s) => s.id === id); }

  /** Servidor activo: donde se escriben/leen las publicaciones por defecto. */
  getActive(): ServerEntry {
    this.ensureLoaded();
    return this.get(this.active) ?? this.servers[0];
  }

  setActive(id: string) {
    this.ensureLoaded();
    if (!this.get(id)) return;
    this.active = id;
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(ACTIVE_KEY, id); } catch { /* noop */ }
    }
    this.notify();
  }

  add(server: Omit<ServerEntry, 'createdAt' | 'origin'>): ServerEntry {
    this.ensureLoaded();
    const entry: ServerEntry = { ...server, createdAt: new Date().toISOString(), origin: 'user' };
    this.servers = [...this.servers, entry];
    persist(this.servers);
    this.notify();
    return entry;
  }

  update(id: string, patch: Partial<ServerEntry>) {
    this.ensureLoaded();
    this.servers = this.servers.map((s) => (s.id === id ? { ...s, ...patch } : s));
    persist(this.servers);
    this.notify();
  }

  remove(id: string) {
    this.ensureLoaded();
    const s = this.get(id);
    if (!s || s.origin === 'preset') return; // No se borran los seed
    this.servers = this.servers.filter((s) => s.id !== id);
    persist(this.servers);
    if (this.active === id) this.setActive('local');
    this.notify();
  }

  /** Marca este servidor para un scope específico (overrides parciales). */
  setScopeServer(scope: ServerEntry['scopes'][number], serverId: string) {
    if (typeof window === 'undefined') return;
    try {
      const key = 'starseed.server-registry.scope.' + scope;
      window.localStorage.setItem(key, serverId);
    } catch { /* noop */ }
    this.notify();
  }

  getScopeServer(scope: ServerEntry['scopes'][number]): ServerEntry {
    if (typeof window === 'undefined') return this.getActive();
    try {
      const key = 'starseed.server-registry.scope.' + scope;
      const id = window.localStorage.getItem(key);
      if (id) return this.get(id) ?? this.getActive();
    } catch { /* noop */ }
    return this.getActive();
  }
}

let _registry: ServerRegistry | null = null;
export function getServerRegistry(): ServerRegistry {
  if (!_registry) _registry = new ServerRegistry();
  return _registry;
}
