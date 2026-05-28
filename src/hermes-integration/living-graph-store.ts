/**
 * 🌌 StarSeed OS — Almacén del Grafo Vivo
 *
 * Una sola fuente de verdad para la Gráfica Viva geométrica. Persiste
 * los nodos (Memoria Unificada, Skills, Tools, Agentes, MCPs, Modelos,
 * Sentidos) y las aristas (relaciones de cualquier tipo) en localStorage.
 *
 * No es un grafo dinámico con física: el layout lo decide el componente
 * de forma determinista. Aquí solo guardamos topología + metadatos.
 *
 * Permite al usuario crear, modificar y eliminar conexiones entre
 * cualesquiera dos nodos.
 */

export type GraphNodeKind =
  | 'self'        // El centro: el usuario
  | 'memory'      // hechos KV, nodos del árbol OpenHuman
  | 'skill'
  | 'tool'
  | 'agent'
  | 'mcp'
  | 'provider'
  | 'sense'
  | 'discovery'
  | 'conversation';

export type GraphEdgeKind =
  | 'uses'           // agent uses tool / skill
  | 'depends_on'     // skill depends on tool
  | 'exposes'        // mcp exposes tool
  | 'configured_for' // agent configured for provider
  | 'remembers'      // self remembers memory
  | 'perceives'      // self perceives via sense
  | 'references'     // memory references entity
  | 'discovers'      // discovery discovered provider
  | 'custom';        // user-defined connection

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  description?: string;
  /** Frecuencia armónica solfeggio del nodo (visual). */
  frequency: number;
  /** Sólido platónico que representa visualmente al nodo. */
  geometry: 'sphere' | 'tetrahedron' | 'cube' | 'octahedron' | 'icosahedron' | 'dodecahedron' | 'star';
  /** Color hex de acento. */
  color: string;
  /** Metadatos arbitrarios para inspección. */
  data?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: GraphEdgeKind;
  /** Etiqueta libre opcional, p.ej. "se carga al iniciar" */
  label?: string;
  /** Peso visual 0..1. */
  weight: number;
  createdAt: string;
  /** Quién creó la conexión: 'system' (descubierta) o 'user' (manual). */
  origin: 'system' | 'user';
}

const STORAGE_KEY = 'starseed.living-graph.v1';

// ── Defaults / Semilla ──────────────────────────────────────────────────

const KIND_GEOMETRY: Record<GraphNodeKind, { geom: GraphNode['geometry']; freq: number; color: string }> = {
  self:         { geom: 'star',         freq: 528, color: '#fbbf24' },
  memory:       { geom: 'sphere',       freq: 432, color: '#38bdf8' },
  skill:        { geom: 'octahedron',   freq: 528, color: '#a78bfa' },
  tool:         { geom: 'cube',         freq: 639, color: '#39FF14' },
  agent:        { geom: 'tetrahedron',  freq: 741, color: '#FFBF00' },
  mcp:          { geom: 'icosahedron',  freq: 852, color: '#34d399' },
  provider:     { geom: 'dodecahedron', freq: 963, color: '#f472b6' },
  sense:        { geom: 'sphere',       freq: 396, color: '#fb7185' },
  discovery:    { geom: 'octahedron',   freq: 528, color: '#fbbf24' },
  conversation: { geom: 'sphere',       freq: 432, color: '#818cf8' },
};

function seed(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const now = new Date().toISOString();
  const mk = (id: string, kind: GraphNodeKind, label: string, description: string): GraphNode => ({
    id, kind, label, description,
    frequency: KIND_GEOMETRY[kind].freq,
    geometry: KIND_GEOMETRY[kind].geom,
    color: KIND_GEOMETRY[kind].color,
    createdAt: now, updatedAt: now,
  });
  const mkEdge = (sourceId: string, targetId: string, kind: GraphEdgeKind, label?: string): GraphEdge => ({
    id: `edge-${sourceId}-${targetId}-${kind}`,
    sourceId, targetId, kind, label, weight: 0.8, createdAt: now, origin: 'system',
  });

  const nodes: GraphNode[] = [
    mk('self', 'self', 'Tú', 'Centro soberano del Exocórtex.'),

    // Memoria (OpenHuman 3 capas)
    mk('mem-tree', 'memory', 'Memory Tree', 'Árbol jerárquico-sumario (OpenHuman §1).'),
    mk('mem-fts',  'memory', 'FTS Index',   'Búsqueda full-text persistida (OpenHuman §2).'),
    mk('mem-kv',   'memory', 'KV Store',    'Hechos y preferencias namespaced (OpenHuman §3).'),

    // Sentidos
    mk('sense-vision',     'sense', 'Visión',     'Análisis de imágenes y capturas.'),
    mk('sense-hearing',    'sense', 'Audición',   'Transcripción y comandos de voz.'),
    mk('sense-voice',      'sense', 'Voz',        'Síntesis de voz local.'),
    mk('sense-location',   'sense', 'Ubicación',  'Contexto geográfico.'),
    mk('sense-awareness',  'sense', 'Consciencia ambiental', 'Notificaciones de la red.'),
    mk('sense-intuition',  'sense', 'Intuición sintética', 'Patrones de la memoria.'),
    mk('sense-astral',     'sense', 'Resonancia armónica', 'Sincrómetro como contexto.'),

    // Agentes
    mk('agent-core',  'agent', 'Núcleo StarSeed', 'Asistente central del SOSD.'),
    mk('agent-muse',  'agent', 'Musa Creativa',   'Arte y conceptos abstractos.'),

    // Providers
    mk('prov-ollama',    'provider', 'Ollama (local)',  'Proveedor local sin clave.'),
    mk('prov-anthropic', 'provider', 'Anthropic Claude','LLM avanzado.'),
    mk('prov-openai',    'provider', 'OpenAI compat.',  'OpenAI, Groq, OpenRouter.'),
    mk('prov-google',    'provider', 'Google Gemini',   'Modelos multimodales Gemini.'),

    // MCPs
    mk('mcp-memory',      'mcp', 'MCP · Memoria Unificada',  'Acceso al tree/FTS/KV.'),
    mk('mcp-sincrometro', 'mcp', 'MCP · Sincrómetro',        'Eventos y modo activo.'),
    mk('mcp-fedi',        'mcp', 'MCP · Fediverso',          'ActivityPub relay.'),

    // Tools comunes
    mk('tool-web',         'tool', 'Web',           'Navegación y fetch HTTP.'),
    mk('tool-file',        'tool', 'Archivos',      'Lectura/escritura del FS.'),
    mk('tool-memory',      'tool', 'Memoria',       'API store/recall/forget.'),
    mk('tool-delegation',  'tool', 'Delegación',    'Sub-agentes.'),
    mk('tool-cron',        'tool', 'Cron',          'Tareas programadas.'),
    mk('tool-vision',      'tool', 'Visión',        'Análisis de imagen.'),
    mk('tool-imggen',      'tool', 'Image Gen',     'Generación de imágenes.'),
    mk('tool-message',     'tool', 'Mensajería',    'Envío de mensajes.'),

    // Skills
    mk('skill-research',   'skill', 'Investigación',  'Búsqueda y síntesis estructurada.'),
    mk('skill-coding',     'skill', 'Programación',   'Edición de código y revisión.'),
    mk('skill-writing',    'skill', 'Escritura',      'Redacción y edición de texto.'),
    mk('skill-vision',     'skill', 'Análisis visual','Interpretar imágenes.'),
    mk('skill-archivist',  'skill', 'Archivista',     'Resumir sesiones y escribir MEMORY.md.'),
  ];

  const edges: GraphEdge[] = [
    // Self ↔ memoria (siempre)
    mkEdge('self', 'mem-tree', 'remembers'),
    mkEdge('self', 'mem-fts',  'remembers'),
    mkEdge('self', 'mem-kv',   'remembers'),

    // Self → sentidos activos por defecto
    mkEdge('self', 'sense-voice',     'perceives'),
    mkEdge('self', 'sense-intuition', 'perceives'),
    mkEdge('self', 'sense-astral',    'perceives'),

    // Agentes ↔ providers
    mkEdge('agent-core', 'prov-ollama',    'configured_for'),
    mkEdge('agent-muse', 'prov-anthropic', 'configured_for'),

    // Agentes ↔ skills
    mkEdge('agent-core', 'skill-research', 'uses'),
    mkEdge('agent-core', 'skill-coding',   'uses'),
    mkEdge('agent-core', 'skill-archivist','uses'),
    mkEdge('agent-muse', 'skill-writing',  'uses'),
    mkEdge('agent-muse', 'skill-vision',   'uses'),

    // Skills → tools
    mkEdge('skill-research',  'tool-web',     'depends_on'),
    mkEdge('skill-research',  'tool-memory',  'depends_on'),
    mkEdge('skill-coding',    'tool-file',    'depends_on'),
    mkEdge('skill-writing',   'tool-memory',  'depends_on'),
    mkEdge('skill-vision',    'tool-vision',  'depends_on'),
    mkEdge('skill-archivist', 'tool-memory',  'depends_on'),

    // MCPs → tools que exponen
    mkEdge('mcp-memory',      'tool-memory',  'exposes'),
    mkEdge('mcp-sincrometro', 'tool-cron',    'exposes'),
    mkEdge('mcp-fedi',        'tool-message', 'exposes'),

    // Sentidos → tools
    mkEdge('sense-vision',   'tool-vision', 'uses'),
    mkEdge('sense-hearing',  'tool-message','uses'),
    mkEdge('sense-astral',   'mcp-sincrometro','uses'),

    // Memoria ↔ MCPs (la memoria se expone por MCP)
    mkEdge('mem-tree', 'mcp-memory', 'exposes'),
    mkEdge('mem-fts',  'mcp-memory', 'exposes'),
    mkEdge('mem-kv',   'mcp-memory', 'exposes'),
  ];

  return { nodes, edges };
}

// ── Store ────────────────────────────────────────────────────────────────

export class LivingGraphStore {
  private data: { nodes: GraphNode[]; edges: GraphEdge[] } = { nodes: [], edges: [] };
  private loaded = false;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded) return;
    if (typeof window === 'undefined') {
      this.data = seed();
      this.loaded = true;
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.data = JSON.parse(raw);
      } else {
        this.data = seed();
        this.persist();
      }
    } catch {
      this.data = seed();
    }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch { /* noop */ }
    this.listeners.forEach((fn) => fn());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getNodes(): GraphNode[] { this.load(); return this.data.nodes; }
  getEdges(): GraphEdge[] { this.load(); return this.data.edges; }

  getNode(id: string): GraphNode | undefined {
    this.load();
    return this.data.nodes.find((n) => n.id === id);
  }

  /** Devuelve aristas adyacentes a un nodo. */
  edgesOf(nodeId: string): GraphEdge[] {
    this.load();
    return this.data.edges.filter((e) => e.sourceId === nodeId || e.targetId === nodeId);
  }

  addNode(node: Omit<GraphNode, 'createdAt' | 'updatedAt' | 'frequency' | 'geometry' | 'color'> & Partial<GraphNode>): GraphNode {
    this.load();
    const now = new Date().toISOString();
    const defaults = KIND_GEOMETRY[node.kind];
    const full: GraphNode = {
      frequency: defaults.freq,
      geometry: defaults.geom,
      color: defaults.color,
      ...node,
      createdAt: now,
      updatedAt: now,
    };
    this.data.nodes.push(full);
    this.persist();
    return full;
  }

  addEdge(input: { sourceId: string; targetId: string; kind: GraphEdgeKind; label?: string; weight?: number; origin?: 'user' | 'system' }): GraphEdge | null {
    this.load();
    if (input.sourceId === input.targetId) return null;
    const exists = this.data.edges.some(
      (e) => e.sourceId === input.sourceId && e.targetId === input.targetId && e.kind === input.kind
    );
    if (exists) return null;
    const edge: GraphEdge = {
      id: `edge-${input.sourceId}-${input.targetId}-${input.kind}-${Date.now().toString(36)}`,
      sourceId: input.sourceId,
      targetId: input.targetId,
      kind: input.kind,
      label: input.label,
      weight: input.weight ?? 0.7,
      origin: input.origin ?? 'user',
      createdAt: new Date().toISOString(),
    };
    this.data.edges.push(edge);
    this.persist();
    return edge;
  }

  removeEdge(id: string): boolean {
    this.load();
    const before = this.data.edges.length;
    this.data.edges = this.data.edges.filter((e) => e.id !== id);
    if (this.data.edges.length < before) {
      this.persist();
      return true;
    }
    return false;
  }

  reset() {
    this.data = seed();
    this.persist();
  }

  /** Resumen textual de las conexiones para alimentar a la IA. */
  textualSummary(): string {
    this.load();
    const byKind = new Map<GraphNodeKind, GraphNode[]>();
    this.data.nodes.forEach((n) => {
      const arr = byKind.get(n.kind) ?? [];
      arr.push(n);
      byKind.set(n.kind, arr);
    });
    const lines: string[] = ['# Grafo vivo'];
    for (const [kind, list] of byKind.entries()) {
      lines.push(`## ${kind} (${list.length})`);
      list.forEach((n) => lines.push(`- ${n.label}${n.description ? `: ${n.description}` : ''}`));
    }
    lines.push('## Conexiones');
    this.data.edges.forEach((e) => {
      const s = this.getNode(e.sourceId)?.label ?? e.sourceId;
      const t = this.getNode(e.targetId)?.label ?? e.targetId;
      lines.push(`- ${s} —[${e.kind}]→ ${t}${e.label ? ` (${e.label})` : ''}`);
    });
    return lines.join('\n');
  }
}

let _store: LivingGraphStore | null = null;
export function getLivingGraphStore(): LivingGraphStore {
  if (!_store) _store = new LivingGraphStore();
  return _store;
}

// ── Tipos de capas (= tipos de conexiones) ──────────────────────────────

export interface ConnectionLayerMeta {
  id: GraphEdgeKind;
  label: string;
  description: string;
  color: string;
  dashed?: boolean;
}

export const CONNECTION_LAYERS: ConnectionLayerMeta[] = [
  { id: 'uses',           label: 'Uso',                 description: 'Un agente usa un skill, un sentido usa una tool.',      color: '#a78bfa' },
  { id: 'depends_on',     label: 'Dependencia',         description: 'Un skill depende de una tool concreta.',                color: '#FFBF00', dashed: true },
  { id: 'exposes',        label: 'Exposición',          description: 'Un MCP/memoria expone una tool al sistema.',            color: '#34d399' },
  { id: 'configured_for', label: 'Configuración IA',    description: 'Un agente está configurado para un proveedor de IA.',   color: '#f472b6', dashed: true },
  { id: 'remembers',      label: 'Memoria',             description: 'El usuario recuerda contenidos de la memoria unificada.', color: '#38bdf8' },
  { id: 'perceives',      label: 'Percepción',          description: 'El usuario percibe a través de un sentido del Exocórtex.', color: '#fb7185' },
  { id: 'references',     label: 'Referencia',          description: 'Una memoria referencia a una entidad o concepto.',      color: '#818cf8', dashed: true },
  { id: 'discovers',      label: 'Descubrimiento',      description: 'Un escaneo descubrió un proveedor, clave o configuración.', color: '#fbbf24' },
  { id: 'custom',         label: 'Conexión manual',     description: 'Conexión creada manualmente por el usuario.',            color: '#ffffff' },
];
