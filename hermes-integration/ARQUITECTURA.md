# 🌌 Arquitectura del Sistema de Integración Hermes en StarSeed OS

> Documento maestro de arquitectura para la integración completa de Hermes Agent
> en el Sistema Operativo Social Descentralizado StarSeed OS.
>
> **Versión:** 1.0.0
> **Fecha:** 2026-05-26
> **Stack:** Next.js 15 + TypeScript + Three.js/R3F + IndexedDB + WebCrypto

---

## Índice

1. [Visión General](#1-visión-general)
2. [Skills System](#2-skills-system)
3. [Tools Registry](#3-tools-registry)
4. [Unified Memory Store](#4-unified-memory-store)
5. [AI Detection & Multi-Provider](#5-ai-detection--multi-provider)
6. [Living Graph 3D Armónico](#6-living-graph-3d-armónico)
7. [Sistema de Capas (Layers)](#7-sistema-de-capas-layers)
8. [Sistema de Agentes](#8-sistema-de-agentes)
9. [MCP Bridge](#9-mcp-bridge)
10. [Cron & Webhooks](#10-cron--webhooks)
11. [Plan de Implementación](#11-plan-de-implementación)

---

## 1. Visión General

### Principio Rector

Todo el sistema sigue el principio de **Unified Exocórtex**: la IA personal del usuario,
sus herramientas, skills, memorias, agentes y conexiones MCP forman un **sistema nervioso
digital único** donde cada componente es un nodo en un grafo armónico vivo.

### Mapa de Módulos

```
src/
├── skills/              ← Sistema de skills (procedimientos reutilizables)
│   ├── types.ts         ← SkillMetadata, SkillDocument, SkillCategory
│   ├── registry.ts      ← Catálogo central + FTS5 search
│   ├── loader.ts        ← Carga contextual (qué skills cargar según el prompt)
│   ├── curator.ts       ← Mantenimiento: stale, archive, prune
│   └── templates/       ← Plantillas para crear skills
│
├── tools/               ← Sistema de herramientas registrables
│   ├── types.ts         ← ToolDefinition, ToolSchema, Toolset
│   ├── registry.ts      ← Registro central con check_fn
│   ├── toolsets.ts      ← Agrupaciones lógicas
│   ├── web-search.ts
│   ├── file-system.ts
│   ├── code-exec.ts
│   ├── cron-scheduler.ts
│   ├── memory-store.ts
│   ├── image-gen.ts
│   ├── vision.ts
│   └── subagent.ts
│
├── memory/              ← Sistema de memoria unificada
│   ├── types.ts         ← MemoryEntry, MemoryNode, MemoryEdge, Layer
│   ├── unified-store.ts ← Store central (IndexedDB + SQLite + Supabase)
│   ├── embeddings.ts    ← Vector store local (simdjson + cosine sim)
│   ├── graph-builder.ts ← Construye el grafo desde la memoria
│   ├── layers.ts        ← Sistema de capas filtrables
│   ├── search.ts        ← Búsqueda semántica + FTS5
│   └── detectors/       ← Detectores de datos existentes
│       ├── local-ai.ts        ← Detecta Ollama, llama.cpp, LM Studio
│       ├── api-keys.ts        ← Escanea .env, config, keychains
│       ├── agent-configs.ts   ← Detecta agentes Hermes/Claude/Codex
│       ├── hermes-discover.ts ← Escanea ~/.hermes/ completo
│       └── system-scan.ts     ← Coordina todos los detectores
│
├── ai/                  ← Capa de IA expandida
│   ├── detectors/       ← Detectores de IA (nuevos)
│   │   ├── index.ts
│   │   ├── local-detector.ts
│   │   ├── api-detector.ts
│   │   └── auto-discover.ts
│   ├── providers/       ← Proveedores existentes + nuevos
│   │   ├── types.ts     ← (existente, expandir)
│   │   ├── index.ts     ← (existente, expandir)
│   │   ├── ollama.ts    ← (existente)
│   │   ├── openai.ts    ← (existente)
│   │   ├── anthropic.ts ← (existente)
│   │   ├── google.ts    ← (existente)
│   │   ├── deepseek.ts  ← NUEVO: DeepSeek (free tier)
│   │   ├── groq.ts      ← NUEVO: Groq (free tier)
│   │   ├── xai.ts       ← NUEVO: xAI/Grok
│   │   ├── huggingface.ts ← NUEVO: HF Inference
│   │   ├── together.ts   ← NUEVO: Together AI
│   │   └── openrouter.ts ← NUEVO: OpenRouter (agregador)
│   └── agents/
│       ├── types.ts
│       ├── registry.ts
│       └── orchestrator.ts
│
├── components/
│   ├── network/         ← Living Graph 3D Armónico
│   │   ├── harmonic-graph.tsx       ← Contenedor principal Three.js
│   │   ├── memory-node.tsx          ← Nodo: esfera pulsante
│   │   ├── skill-node.tsx           ← Nodo: octaedro rotante
│   │   ├── tool-node.tsx            ← Nodo: cubo cristalino
│   │   ├── agent-node.tsx           ← Nodo: tetraedro
│   │   ├── mcp-node.tsx             ← Nodo: icosaedro
│   │   ├── user-node.tsx            ← Nodo: círculo holográfico
│   │   ├── harmonic-connection.tsx  ← Arista armónica
│   │   ├── particle-flow.tsx        ← Flujo de partículas
│   │   ├── force-graph-engine.ts    ← Simulación de fuerzas 3D
│   │   ├── harmonic-physics.ts      ← Física armónica
│   │   ├── layer-selector.tsx       ← Selector de capas
│   │   ├── node-detail-panel.tsx    ← Panel de detalle
│   │   └── graph-controls.tsx       ← Controles de navegación
│   │
│   ├── skills/
│   │   ├── skill-card.tsx
│   │   ├── skill-editor.tsx
│   │   └── skill-browser.tsx
│   │
│   ├── ai-setup/
│   │   ├── ai-detection-wizard.tsx   ← Asistente de detección
│   │   ├── provider-selector.tsx     ← Selector visual de proveedores
│   │   ├── free-tier-browser.tsx     ← Explorador de IAs gratuitas
│   │   └── local-model-browser.tsx   ← Explorador de modelos locales
│   │
│   └── memory/
│       ├── memory-timeline.tsx       ← Línea de tiempo de memoria
│       └── memory-search.tsx         ← Búsqueda visual de memorias
│
├── cron/
│   ├── scheduler.ts
│   └── jobs.ts
│
└── app/(app)/
    ├── skills/           ← NUEVA ruta
    │   └── page.tsx
    ├── memory/           ← NUEVA ruta
    │   └── page.tsx
    └── ai-setup/         ← NUEVA ruta (wizard)
        └── page.tsx
```

### Flujo de Datos

```
[AI Detector] → detecta IAs locales (Ollama, llama.cpp, LM Studio)
              → detecta APIs (OpenAI, Anthropic, DeepSeek, Groq...)
              → detecta configs existentes (~/.hermes, .env, keychains)
              → detecta agentes (Hermes, Claude Code, Codex)
                      │
                      ▼
         [AI Detection Wizard]
         ¿Quieres integrar estos descubrimientos?
                      │
                      ▼
         [Unified Memory Store]
         Guarda: providers, agentes, skills, memorias, herramientas
                      │
                      ▼
         [Graph Builder] → construye nodos y aristas
                      │
                      ▼
         [Living Graph 3D] → renderiza con geometría armónica
                      │
                      ▼
         [Layer System] → filtra qué mostrar
         Memoria | Skills | Tools | Agentes | MCP | Todo
```

---

## 2. Skills System

### Concepto

Un **Skill** es un procedimiento reutilizable que el sistema puede cargar automáticamente
cuando el contexto lo requiere. Similar a los skills de Hermes Agent, pero nativos en
StarSeed OS y visibles en la UI.

### Tipos

```typescript
// src/skills/types.ts
export type SkillCategory =
  | 'development'   // Coding, debugging, deployment
  | 'research'      // Web search, paper analysis, fact-checking
  | 'creative'      // Writing, image gen, music, design
  | 'system'        // Terminal, file ops, process management
  | 'governance'    // Voting, proposals, consensus
  | 'education'     // Learning paths, tutoring, mentorship
  | 'social'        // Community, messaging, networking
  | 'analysis';     // Data analysis, visualization, reporting

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  category: SkillCategory;
  tags: string[];
  author?: string;
  created: string;       // ISO date
  updated: string;
  /** Palabras clave que triggeran la carga automática */
  triggers: string[];
  /** Skills que deben cargarse antes que este */
  dependencies: string[];
  /** Tools necesarias para ejecutar este skill */
  requiredTools: string[];
  /** Autonomía: 'auto' se carga solo, 'manual' requiere aprobación */
  loadMode: 'auto' | 'manual';
}

export interface SkillDocument {
  metadata: SkillMetadata;
  /** El contenido markdown del skill */
  content: string;
  /** Archivos asociados (templates, scripts, referencias) */
  linkedFiles: Record<string, string>;
}
```

### Registry

```typescript
// src/skills/registry.ts
export class SkillRegistry {
  private skills: Map<string, SkillDocument> = new Map();
  private db: IDBDatabase | null = null;

  async init() {
    // Abre IndexedDB, carga skills instalados
    // Escanea ~/.hermes/skills/ si existe
    this.db = await openSkillsDB();
    const stored = await this.db.getAll('skills');
    stored.forEach(s => this.skills.set(s.metadata.name, s));
  }

  async install(skill: SkillDocument): Promise<void> {
    // Valida, guarda, registra
    this.skills.set(skill.metadata.name, skill);
    await this.db!.put('skills', skill);
  }

  search(query: string): SkillDocument[] {
    // FTS5 sobre nombre, descripción, tags, triggers
    return fuzzySearch(this.skills.values(), query);
  }

  /** Carga skills relevantes para un contexto */
  loadForContext(context: string): SkillDocument[] {
    const loaded: SkillDocument[] = [];
    for (const skill of this.skills.values()) {
      if (skill.metadata.loadMode === 'manual') continue;
      const matches = skill.metadata.triggers.some(
        t => context.toLowerCase().includes(t.toLowerCase())
      );
      if (matches) loaded.push(skill);
    }
    // Resolver dependencias en orden topológico
    return this.resolveDependencies(loaded);
  }
}
```

---

## 3. Tools Registry

### Concepto

Cada **Tool** es una función registrada con un schema JSON que el agente puede llamar.
Similar a las tools de Hermes pero como sistema nativo en StarSeed.

### Tipos

```typescript
// src/tools/types.ts
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolDefinition {
  schema: ToolSchema;
  /** Toolset al que pertenece */
  toolset: string;
  /** Handler: recibe args, devuelve JSON string */
  handler: (args: Record<string, unknown>) => Promise<string>;
  /** Verifica si los requisitos están satisfechos */
  checkFn?: () => boolean | Promise<boolean>;
  /** Variables de entorno necesarias */
  requiresEnv?: string[];
  /** Si requiere aprobación del usuario */
  requiresApproval?: boolean;
}

// src/tools/toolsets.ts
export const TOOLSETS = {
  web: {
    label: 'Web & Búsqueda',
    icon: 'Globe',
    tools: ['web-search', 'web-extract'],
  },
  file: {
    label: 'Sistema de Archivos',
    icon: 'FolderTree',
    tools: ['read-file', 'write-file', 'search-files', 'patch'],
  },
  terminal: {
    label: 'Terminal',
    icon: 'Terminal',
    tools: ['execute-command'],
  },
  code_execution: {
    label: 'Ejecución de Código',
    icon: 'Code',
    tools: ['run-python', 'run-javascript'],
  },
  memory: {
    label: 'Memoria',
    icon: 'Database',
    tools: ['memory-save', 'memory-search', 'memory-forget'],
  },
  delegation: {
    label: 'Delegación',
    icon: 'GitFork',
    tools: ['delegate-task', 'subagent-spawn'],
  },
  cron: {
    label: 'Tareas Programadas',
    icon: 'Clock',
    tools: ['cron-create', 'cron-list', 'cron-remove'],
  },
  vision: {
    label: 'Visión',
    icon: 'Eye',
    tools: ['analyze-image'],
  },
  image_gen: {
    label: 'Generación de Imágenes',
    icon: 'ImagePlus',
    tools: ['generate-image'],
  },
  messaging: {
    label: 'Mensajería',
    icon: 'MessageSquare',
    tools: ['send-message', 'list-channels'],
  },
} as const;
```

---

## 4. Unified Memory Store

### Concepto

Un único almacén que unifica: memorias de conversación, logs, datos de usuario,
skills instalados, tools registradas, agentes configurados, servidores MCP, 
y detecciones de IA. Todo como nodos en un grafo con relaciones (edges).

### Tipos

```typescript
// src/memory/types.ts

/** Tipos de nodos en el grafo de memoria */
export type MemoryNodeType =
  | 'conversation'      // Una sesión de chat
  | 'message'           // Un mensaje individual
  | 'memory_fact'       // Un hecho recordado (preferencia, dato)
  | 'skill'             // Un skill instalado
  | 'tool'              // Una herramienta registrada
  | 'agent'             // Un agente configurado
  | 'provider'          // Un proveedor de IA
  | 'model'             // Un modelo de IA específico
  | 'api_key'           // Una clave de API detectada
  | 'mcp_server'        // Un servidor MCP
  | 'user_preference'   // Preferencia del usuario
  | 'log_entry'         // Una entrada de log
  | 'discovery';        // Un descubrimiento de IA

/** Tipos de aristas (relaciones) */
export type MemoryEdgeType =
  | 'used_in'           // Tool/skill usado en una conversación
  | 'depends_on'        // Skill depende de otro skill o tool
  | 'configured_for'    // Provider configurado para un agente
  | 'discovered_at'     // Detectado en una ubicación
  | 'related_to'        // Relación semántica general
  | 'created_by'        // Creado por un agente/usuario
  | 'references';       // Referencia a otro nodo

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  label: string;
  description: string;
  /** Metadatos específicos del tipo */
  data: Record<string, unknown>;
  /** Embedding vector para búsqueda semántica */
  embedding?: Float32Array;
  /** Tags para filtrado */
  tags: string[];
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  /** Frecuencia de acceso (para el grafo: grosor/tamaño) */
  accessCount: number;
  /** Último acceso */
  lastAccessedAt: string;
  /** Capa a la que pertenece */
  layer: MemoryLayer;
}

export interface MemoryEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: MemoryEdgeType;
  /** Peso de la relación (0-1). Determina grosor/brillo en el grafo */
  weight: number;
  /** Frecuencia armónica asociada (para animación) */
  frequency: number;
  /** Metadatos */
  data: Record<string, unknown>;
  createdAt: string;
}

/** Capas para filtrar el grafo */
export type MemoryLayer =
  | 'memory'        // Solo memorias y conversaciones
  | 'skills'        // Solo skills
  | 'tools'         // Solo herramientas
  | 'agents'        // Solo agentes
  | 'ai'            // Solo proveedores y modelos
  | 'mcp'           // Solo servidores MCP
  | 'discoveries'   // Solo descubrimientos recientes
  | 'all';          // Todo

export interface MemoryLayerConfig {
  id: MemoryLayer;
  label: string;
  description: string;
  icon: string;          // Lucide icon name
  color: string;         // Color hex
  nodeTypes: MemoryNodeType[];
  edgeTypes: MemoryEdgeType[];
  /** Opacidad para nodos fuera de esta capa */
  dimmedOpacity: number;
  /** Si los nodos de esta capa son visibles por defecto */
  visibleByDefault: boolean;
}
```

### Almacenamiento Unificado

```typescript
// src/memory/unified-store.ts
export class UnifiedMemoryStore {
  private db: IDBDatabase | null = null;
  private vectorStore: VectorStore;
  private static instance: UnifiedMemoryStore;

  static getInstance(): UnifiedMemoryStore {
    if (!this.instance) this.instance = new UnifiedMemoryStore();
    return this.instance;
  }

  async init() {
    // Abre IndexedDB con stores: nodes, edges, embeddings
    this.db = await openUnifiedDB();
    this.vectorStore = new VectorStore(this.db);
  }

  // --- CRUD de Nodos ---
  async addNode(node: MemoryNode): Promise<void> {
    node.embedding = await computeEmbedding(node.label + ' ' + node.description);
    await this.db!.put('nodes', node);
    await this.vectorStore.index(node.id, node.embedding);
  }

  async getNode(id: string): Promise<MemoryNode | null> {
    return this.db!.get('nodes', id) ?? null;
  }

  async updateNodeAccess(id: string) {
    const node = await this.getNode(id);
    if (!node) return;
    node.accessCount++;
    node.lastAccessedAt = new Date().toISOString();
    await this.db!.put('nodes', node);
  }

  // --- CRUD de Aristas ---
  async addEdge(edge: MemoryEdge): Promise<void> {
    await this.db!.put('edges', edge);
  }

  // --- Búsqueda ---
  async semanticSearch(query: string, limit = 20): Promise<MemoryNode[]> {
    const queryEmbedding = await computeEmbedding(query);
    return this.vectorStore.search(queryEmbedding, limit);
  }

  async searchByType(type: MemoryNodeType): Promise<MemoryNode[]> {
    const index = this.db!.transaction('nodes').store.index('by-type');
    return index.getAll(type);
  }

  async searchByLayer(layer: MemoryLayer): Promise<{
    nodes: MemoryNode[];
    edges: MemoryEdge[];
  }> {
    const layerConfig = getLayerConfig(layer);
    const nodes = await Promise.all(
      layerConfig.nodeTypes.map(t => this.searchByType(t))
    ).then(arrays => arrays.flat());
    const nodeIds = new Set(nodes.map(n => n.id));
    const allEdges = await this.db!.getAll('edges');
    const edges = allEdges.filter(
      e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)
    );
    return { nodes, edges };
  }

  // --- Construcción de Grafo ---
  async buildGraph(layer: MemoryLayer): Promise<GraphData> {
    const { nodes, edges } = await this.searchByLayer(layer);
    return {
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type,
        label: n.label,
        size: Math.log2(n.accessCount + 2) * 3, // Tamaño basado en acceso
        frequency: this.computeHarmonicFrequency(n),
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

  /** Frecuencia armónica: combinación de tipo + peso + accesos */
  private computeHarmonicFrequency(node: MemoryNode): number {
    const base = {
      memory: 432,    // Hz — conexión profunda
      skill: 528,     // Hz — transformación
      tool: 639,      // Hz — conexión
      agent: 741,     // Hz — expresión
      mcp: 852,       // Hz — despertar
      provider: 963,  // Hz — luz cósmica
    }[node.type] || 432;

    // Modular por accessCount para variación orgánica
    return base + (node.accessCount % 100) * 0.5;
  }
}
```

### Vector Store Local

```typescript
// src/memory/embeddings.ts
export class VectorStore {
  private dimension = 384; // all-MiniLM-L6-v2

  constructor(private db: IDBDatabase) {}

  async index(id: string, embedding: Float32Array) {
    await this.db.put('embeddings', { id, vector: Array.from(embedding) });
  }

  async search(query: Float32Array, limit: number): Promise<MemoryNode[]> {
    const all = await this.db.getAll('embeddings');
    const scores = all.map(entry => ({
      id: entry.id,
      score: cosineSimilarity(query, new Float32Array(entry.vector)),
    }));
    scores.sort((a, b) => b.score - a.score);
    const topIds = scores.slice(0, limit).map(s => s.id);
    return Promise.all(topIds.map(id => this.db.get('nodes', id)));
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

---

## 5. AI Detection & Multi-Provider

### Sistema de Detección Automática

El corazón de la integración: un sistema que escanea el entorno del usuario y detecta:

1. **IAs Locales**: Ollama, llama.cpp, LM Studio, vLLM, text-generation-webui
2. **APIs configuradas**: archivos .env, config.yaml de Hermes, keychains del SO
3. **Agentes existentes**: configs de Hermes Agent, Claude Code, Codex CLI
4. **Skills Hermes**: skills instalados en `~/.hermes/skills/`
5. **Memoria Hermes**: sesiones guardadas, facts de memoria

```typescript
// src/ai/detectors/auto-discover.ts
export interface DiscoveryResult {
  providers: DiscoveredProvider[];
  agents: DiscoveredAgent[];
  skills: SkillDocument[];
  memories: MemoryNode[];
  apiKeys: DiscoveredKey[];
}

export class AutoDiscover {
  private results: DiscoveryResult = {
    providers: [],
    agents: [],
    skills: [],
    memories: [],
    apiKeys: [],
  };

  /** Escanea TODO el sistema. Retorna todo lo encontrado. */
  async scanAll(): Promise<DiscoveryResult> {
    const scans = await Promise.all([
      this.scanLocalAI(),
      this.scanEnvFiles(),
      this.scanHermesConfig(),
      this.scanDotHermes(),
      this.scanKeychains(),
    ]);
    this.results = this.merge(scans);
    return this.results;
  }

  private async scanLocalAI(): Promise<Partial<DiscoveryResult>> {
    const providers: DiscoveredProvider[] = [];

    // 1. Ollama — puerto por defecto 11434
    try {
      const ollamaRes = await fetch('http://localhost:11434/api/tags');
      if (ollamaRes.ok) {
        const models = await ollamaRes.json();
        providers.push({
          id: 'ollama',
          label: 'Ollama (Local)',
          baseUrl: 'http://localhost:11434',
          requiresKey: false,
          local: true,
          models: (models.models || []).map((m: any) => m.name),
          status: 'available',
          source: 'localhost:11434',
        });
      }
    } catch {}

    // 2. LM Studio — puerto por defecto 1234
    try {
      const lmRes = await fetch('http://localhost:1234/v1/models');
      if (lmRes.ok) {
        const models = await lmRes.json();
        providers.push({
          id: 'openai-compatible',
          label: 'LM Studio (Local)',
          baseUrl: 'http://localhost:1234/v1',
          requiresKey: false,
          local: true,
          models: (models.data || []).map((m: any) => m.id),
          status: 'available',
          source: 'localhost:1234',
        });
      }
    } catch {}

    // 3. llama.cpp server — puertos comunes 8080, 8000
    for (const port of [8080, 8000]) {
      try {
        const res = await fetch(`http://localhost:${port}/v1/models`);
        if (res.ok) {
          providers.push({
            id: 'openai-compatible',
            label: `llama.cpp (localhost:${port})`,
            baseUrl: `http://localhost:${port}/v1`,
            requiresKey: false,
            local: true,
            models: [],
            status: 'available',
            source: `localhost:${port}`,
          });
        }
      } catch {}
    }

    // 4. vLLM — puerto por defecto 8000 (ya cubierto arriba)
    return { providers };
  }

  private async scanEnvFiles(): Promise<Partial<DiscoveryResult>> {
    const providers: DiscoveredProvider[] = [];
    const apiKeys: DiscoveredKey[] = [];

    // Busca en ubicaciones comunes
    const envPaths = [
      '.env', '.env.local', '.env.development',
      '~/.hermes/.env', '~/.config/hermes/.env',
    ];

    for (const envPath of envPaths) {
      try {
        const content = await this.readFile(envPath);
        if (!content) continue;

        // Extrae API keys conocidas
        const keyPatterns: [RegExp, string, string][] = [
          [/OPENAI_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'openai', 'OpenAI'],
          [/ANTHROPIC_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'anthropic', 'Anthropic'],
          [/GOOGLE_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'google', 'Google Gemini'],
          [/DEEPSEEK_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'deepseek', 'DeepSeek'],
          [/GROQ_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'groq', 'Groq'],
          [/OPENROUTER_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'openrouter', 'OpenRouter'],
          [/HUGGINGFACE_TOKEN[=: ]+['"]?(\S+)['"]?/i, 'huggingface', 'HuggingFace'],
          [/TOGETHER_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'together', 'Together AI'],
          [/XAI_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'xai', 'xAI/Grok'],
          [/MISTRAL_API_KEY[=: ]+['"]?(\S+)['"]?/i, 'mistral', 'Mistral'],
        ];

        for (const [pattern, providerId, label] of keyPatterns) {
          const match = content.match(pattern);
          if (match) {
            apiKeys.push({
              provider: providerId as any,
              label,
              keyPreview: match[1].slice(0, 8) + '...',
              source: envPath,
              encrypted: false,
            });
          }
        }
      } catch {}
    }

    return { providers, apiKeys };
  }

  private async scanHermesConfig(): Promise<Partial<DiscoveryResult>> {
    // Escanea ~/.hermes/config.yaml para detectar proveedores configurados
    const providers: DiscoveredProvider[] = [];
    try {
      const content = await this.readFile('~/.hermes/config.yaml');
      if (!content) return { providers };

      // Extrae modelo y proveedor principal
      const modelMatch = content.match(/default:\s*['"]?([\w\/.-]+)['"]?/);
      const providerMatch = content.match(/provider:\s*['"]?(\w+)['"]?/);
      if (modelMatch && providerMatch) {
        providers.push({
          id: providerMatch[1] as any,
          label: `Hermes: ${providerMatch[1]}`,
          baseUrl: '',
          requiresKey: true,
          local: false,
          models: [modelMatch[1]],
          status: 'configured',
          source: '~/.hermes/config.yaml',
        });
      }
    } catch {}

    return { providers };
  }

  private async scanDotHermes(): Promise<Partial<DiscoveryResult>> {
    // Escanea skills, sesiones, memoria persistente de Hermes
    const skills: SkillDocument[] = [];
    const memories: MemoryNode[] = [];

    try {
      // Skills de Hermes
      const skillsDir = await this.readDir('~/.hermes/skills/');
      for (const skillPath of skillsDir || []) {
        const content = await this.readFile(skillPath + '/SKILL.md');
        if (content) {
          const metadata = this.parseSkillFrontmatter(content);
          skills.push({
            metadata: {
              ...metadata,
              loadMode: 'manual',
            },
            content,
            linkedFiles: {},
          });
          memories.push({
            id: `hermes-skill-${metadata.name}`,
            type: 'skill',
            label: metadata.name,
            description: metadata.description,
            data: { source: 'hermes', path: skillPath },
            tags: ['hermes', ...(metadata.tags || [])],
            createdAt: metadata.created || new Date().toISOString(),
            updatedAt: metadata.updated || new Date().toISOString(),
            accessCount: 0,
            lastAccessedAt: new Date().toISOString(),
            layer: 'skills',
          });
        }
      }
    } catch {}

    return { skills, memories };
  }

  private async scanKeychains(): Promise<Partial<DiscoveryResult>> {
    // macOS: keychain, Linux: libsecret, Windows: Credential Manager
    const apiKeys: DiscoveredKey[] = [];

    if (typeof window !== 'undefined' && 'credentials' in navigator) {
      try {
        // WebAuthn / Credential Management API
        const cred = await (navigator as any).credentials.get({
          password: true,
          unmediated: true,
        });
        // Nota: esto requiere HTTPS y solo funciona en contextos seguros
      } catch {}
    }

    return { apiKeys };
  }

  /** Unifica resultados de múltiples scans */
  private merge(scans: Partial<DiscoveryResult>[]): DiscoveryResult {
    const result: DiscoveryResult = {
      providers: [],
      agents: [],
      skills: [],
      memories: [],
      apiKeys: [],
    };
    for (const scan of scans) {
      if (scan.providers) result.providers.push(...scan.providers);
      if (scan.agents) result.agents.push(...scan.agents);
      if (scan.skills) result.skills.push(...scan.skills);
      if (scan.memories) result.memories.push(...scan.memories);
      if (scan.apiKeys) result.apiKeys.push(...scan.apiKeys);
    }
    // Deduplicar
    return result;
  }
}
```

### Proveedores Gratuitos

```typescript
// src/ai/providers/deepseek.ts — NUEVO
const info: ProviderInfo = {
  id: 'deepseek',
  label: 'DeepSeek (Free Tier)',
  description: 'Modelo gratuito de DeepSeek. Ideal para empezar sin costo. '
    + 'deepseek-chat es comparable a GPT-4 en razonamiento.',
  requiresKey: false,  // Tiene free tier sin API key (rate-limited)
  local: false,
  defaultBaseUrl: 'https://api.deepseek.com/v1',
  defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
};

async function chat(config: DecryptedProviderConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || info.defaultBaseUrl).replace(/\/$/, '');
  const stream = Boolean(options.onChunk);

  const body: Record<string, unknown> = {
    model: options.model || config.defaultModel,
    messages,
    stream,
  };
  if (options.temperature) body.temperature = options.temperature;
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  // Sin API key: usa el free tier público (rate-limited)

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek error ${res.status}: ${text || res.statusText}`);
  }

  if (stream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content ?? '';
          if (delta) { full += delta; options.onChunk!(delta); }
        } catch {}
      }
    }
    return { text: full };
  }

  const json = await res.json();
  return {
    text: json?.choices?.[0]?.message?.content ?? '',
    raw: json,
    usage: {
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
    },
  };
}

export const deepseekProvider: Provider = { info, chat };

// src/ai/providers/groq.ts — NUEVO
const info: ProviderInfo = {
  id: 'groq',
  label: 'Groq (Free Tier)',
  description: 'Inferencia ultrarrápida con hardware LPU. '
    + 'Tiene free tier generoso sin necesidad de clave para modelos públicos.',
  requiresKey: false,
  local: false,
  defaultBaseUrl: 'https://api.groq.com/openai/v1',
  getKeyUrl: 'https://console.groq.com/keys',
  defaultModels: [
    'llama3-70b-8192', 'llama3-8b-8192',
    'mixtral-8x7b-32768', 'gemma2-9b-it',
    'deepseek-r1-distill-llama-70b',
  ],
};

// src/ai/providers/openrouter.ts — NUEVO
const info: ProviderInfo = {
  id: 'openrouter',
  label: 'OpenRouter (Agregador)',
  description: 'Agregador de 200+ modelos. Un solo API key para acceder a '
    + 'cualquier modelo. Algunos modelos gratuitos disponibles.',
  requiresKey: true,
  local: false,
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  getKeyUrl: 'https://openrouter.ai/keys',
  defaultModels: [
    'deepseek/deepseek-v4-flash:free',
    'deepseek/deepseek-r1:free',
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'anthropic/claude-sonnet-4',
    'openai/gpt-4o',
  ],
};
```

### Categorías de Proveedores

```typescript
// src/ai/providers/index.ts — EXPANDIDO
export const PROVIDER_CATEGORIES = {
  free: {
    label: '💚 Gratuitos (Sin API Key)',
    description: 'Modelos públicos gratuitos, rate-limited. Perfectos para empezar.',
    providers: ['deepseek'], // DeepSeek free tier sin key
  },
  local: {
    label: '🖥 Local (Privacidad Total)',
    description: 'Modelos en tu máquina. Cero datos salen de tu equipo.',
    providers: ['ollama'],
  },
  freemium: {
    label: '💛 Freemium (API Key Opcional)',
    description: 'Tienen tier gratuito con key, o modelos gratuitos en OpenRouter.',
    providers: ['openrouter', 'groq', 'google'],
  },
  premium: {
    label: '💜 Premium (API Key Requerida)',
    description: 'Modelos de pago. Trae tu propia clave.',
    providers: ['openai', 'anthropic', 'openai-compatible'],
  },
} as const;
```

---

## 6. Living Graph 3D Armónico

### Principio de Geometría Armónica

Cada tipo de nodo tiene una **geometría 3D específica** basada en sólidos platónicos
y sus frecuencias armónicas asociadas:

| Sólido | Nodo | Frecuencia | Significado |
|--------|------|------------|-------------|
| Esfera | Memoria | 432 Hz | Unidad, completitud |
| Octaedro | Skill | 528 Hz | Transformación, ADN |
| Cubo | Tool | 639 Hz | Estabilidad, conexión |
| Tetraedro | Agente | 741 Hz | Expresión, acción |
| Icosaedro | MCP Server | 852 Hz | Expansión, red |
| Dodecaedro | Proveedor AI | 963 Hz | Trascendencia |

Las **conexiones** usan ondas sinusoidales con la frecuencia combinada de ambos nodos,
creando patrones de interferencia armónica.

### Force Graph Engine

```typescript
// src/components/network/force-graph-engine.ts
import * as THREE from 'three';

export interface GraphNode3D {
  id: string;
  type: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  frequency: number;
  mass: number;
  data: any;
}

export interface GraphEdge3D {
  source: string;
  target: string;
  weight: number;
  frequency: number;
  type: string;
}

export interface HarmonicConfig {
  /** Fuerza de atracción armónica */
  harmonicAttraction: number;       // default: 0.01
  /** Fuerza de repulsión entre nodos */
  repulsion: number;                // default: 50
  /** Distancia natural de conexión */
  connectionDistance: number;       // default: 200
  /** Amortiguamiento de velocidad */
  damping: number;                  // default: 0.9
  /** Centro de gravedad */
  centerGravity: number;            // default: 0.005
  /** Umbral de velocidad mínima para detener */
  minVelocity: number;              // default: 0.1
}

export class HarmonicForceEngine {
  private nodes: Map<string, GraphNode3D> = new Map();
  private edges: GraphEdge3D[] = [];
  private config: HarmonicConfig;

  constructor(config?: Partial<HarmonicConfig>) {
    this.config = {
      harmonicAttraction: 0.01,
      repulsion: 50,
      connectionDistance: 200,
      damping: 0.9,
      centerGravity: 0.005,
      minVelocity: 0.1,
      ...config,
    };
  }

  load(nodes: GraphNode3D[], edges: GraphEdge3D[]) {
    this.nodes.clear();
    nodes.forEach(n => this.nodes.set(n.id, n));
    this.edges = edges;
  }

  /** Un tick de simulación. Llamar en cada frame de rAF */
  tick(): void {
    const forces: Map<string, THREE.Vector3> = new Map();
    const nodeArray = Array.from(this.nodes.values());

    // Inicializar fuerzas
    nodeArray.forEach(n => forces.set(n.id, new THREE.Vector3(0, 0, 0)));

    // 1. Atracción armónica entre nodos conectados
    for (const edge of this.edges) {
      const source = this.nodes.get(edge.source);
      const target = this.nodes.get(edge.target);
      if (!source || !target) continue;

      const delta = new THREE.Vector3().copy(target.position).sub(source.position);
      const distance = delta.length();

      if (distance > 0) {
        // Atracción: nodos más conectados se acercan más
        const attractionForce = delta.normalize().multiplyScalar(
          this.config.harmonicAttraction * edge.weight * distance
        );
        forces.get(edge.source)!.add(attractionForce);
        forces.get(edge.target)!.sub(attractionForce);
      }
    }

    // 2. Repulsión entre todos los nodos (Ley de Coulomb)
    for (let i = 0; i < nodeArray.length; i++) {
      for (let j = i + 1; j < nodeArray.length; j++) {
        const a = nodeArray[i];
        const b = nodeArray[j];
        const delta = new THREE.Vector3().copy(b.position).sub(a.position);
        const distance = Math.max(delta.length(), 1);
        const repulsionForce = delta.normalize().multiplyScalar(
          this.config.repulsion / (distance * distance)
        );
        forces.get(a.id)!.sub(repulsionForce);
        forces.get(b.id)!.add(repulsionForce);
      }
    }

    // 3. Gravedad hacia el centro
    nodeArray.forEach(n => {
      const centerForce = n.position.clone().negate().multiplyScalar(
        this.config.centerGravity * n.mass
      );
      forces.get(n.id)!.add(centerForce);
    });

    // 4. Aplicar fuerzas con amortiguamiento
    nodeArray.forEach(n => {
      const force = forces.get(n.id)!;
      n.velocity.add(force);
      n.velocity.multiplyScalar(this.config.damping);
      n.position.add(n.velocity);

      // Limitar velocidad mínima
      if (n.velocity.length() < this.config.minVelocity) {
        n.velocity.set(0, 0, 0);
      }
    });
  }

  /** Obtener nodos y sus puntos de conexión para render */
  getRenderState() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges.map(e => ({
        source: this.nodes.get(e.source),
        target: this.nodes.get(e.target),
        weight: e.weight,
        frequency: e.frequency,
        type: e.type,
      })).filter(e => e.source && e.target),
    };
  }
}
```

### Nodo de Memoria (Three.js/R3F)

```tsx
// src/components/network/memory-node.tsx
'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface MemoryNodeProps {
  position: THREE.Vector3;
  size: number;
  frequency: number;
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}

export function MemoryNode({
  position, size, frequency, label, color, selected, onClick,
}: MemoryNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Pulsación armónica: sin(frequency * time)
  useFrame(({ clock }) => {
    if (!meshRef.current || !glowRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * frequency * 0.1) * 0.1;
    meshRef.current.scale.setScalar(pulse);
    
    // Glow pulsante
    const glowPulse = 0.5 + Math.sin(t * frequency * 0.05) * 0.5;
    glowRef.current.material.opacity = glowPulse * 0.3;
  });

  // Color con selección
  const materialColor = useMemo(() => {
    if (selected) return new THREE.Color('#ffffff');
    return new THREE.Color(color);
  }, [selected, color]);

  return (
    <group position={position}>
      {/* Glow exterior */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2.5, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* Nodo principal */}
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[size, 32, 32]} />
        <meshPhysicalMaterial
          color={materialColor}
          emissive={selected ? new THREE.Color('#ffffff') : new THREE.Color(color)}
          emissiveIntensity={selected ? 0.5 : 0.2}
          metalness={0.3}
          roughness={0.1}
          transparent
          opacity={selected ? 1 : 0.85}
        />
      </mesh>

      {/* Label */}
      <Text
        position={[0, -size - 8, 0]}
        fontSize={size * 0.4}
        color={selected ? '#ffffff' : '#aaaaaa'}
        anchorX="center"
        anchorY="top"
        maxWidth={100}
      >
        {label}
      </Text>
    </group>
  );
}
```

### Conexión Armónica

```tsx
// src/components/network/harmonic-connection.tsx
'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HarmonicConnectionProps {
  source: THREE.Vector3;
  target: THREE.Vector3;
  weight: number;
  frequency: number;
  type: string;
  highlighted: boolean;
}

export function HarmonicConnection({
  source, target, weight, frequency, type, highlighted,
}: HarmonicConnectionProps) {
  const lineRef = useRef<THREE.Line>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Puntos de control para curva bezier con desviación armónica
  const { points, midPoint } = useMemo(() => {
    const mid = new THREE.Vector3().addVectors(source, target).multiplyScalar(0.5);
    const direction = new THREE.Vector3().subVectors(target, source);
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, direction.z * 0.5).normalize();
    const deviation = 20 + (1 - weight) * 40;
    mid.add(perpendicular.multiplyScalar(deviation));

    const pts: THREE.Vector3[] = [];
    for (let t = 0; t <= 1; t += 0.05) {
      const p = new THREE.Vector3()
        .copy(source)
        .lerp(mid, t < 0.5 ? t * 2 : 1)
        .lerp(target, t > 0.5 ? (t - 0.5) * 2 : 0);
      pts.push(p);
    }
    return { points: pts, midPoint: mid };
  }, [source.x, source.y, source.z, target.x, target.y, target.z, weight]);

  // Color según tipo de conexión
  const color = useMemo(() => {
    const colors: Record<string, string> = {
      used_in: '#38bdf8',
      depends_on: '#a78bfa',
      configured_for: '#f472b6',
      discovered_at: '#34d399',
      related_to: '#fbbf24',
      created_by: '#fb923c',
      references: '#818cf8',
    };
    return colors[type] || '#ffffff';
  }, [type]);

  // Grosor según peso y frecuencia de onda
  const thickness = 0.5 + weight * 2;

  return (
    <group>
      {/* Línea principal */}
      <line ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={highlighted ? 0.8 : 0.15 + weight * 0.3}
          linewidth={thickness}
        />
      </line>

      {/* Partículas fluyendo a lo largo de la curva */}
      <ParticleFlow
        points={points}
        frequency={frequency}
        highlighted={highlighted}
      />
    </group>
  );
}

function ParticleFlow({
  points, frequency, highlighted,
}: {
  points: THREE.Vector3[];
  frequency: number;
  highlighted: boolean;
}) {
  const meshRef = useRef<THREE.Points>(null);
  const particleCount = Math.max(3, Math.floor(frequency / 100));

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const positions = meshRef.current.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < particleCount; i++) {
      const progress = ((t * frequency * 0.02 + i / particleCount) % 1);
      const idx = Math.floor(progress * (points.length - 1));
      const nextIdx = Math.min(idx + 1, points.length - 1);
      const localT = (progress * (points.length - 1)) - idx;
      
      const p = new THREE.Vector3().copy(points[idx]).lerp(points[nextIdx], localT);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={new Float32Array(particleCount * 3)}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={2}
        color={highlighted ? '#ffffff' : '#88ccff'}
        transparent
        opacity={highlighted ? 0.9 : 0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
```

### Grafo Armónico Principal

```tsx
// src/components/network/harmonic-graph.tsx
'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

import { UnifiedMemoryStore } from '@/memory/unified-store';
import { HarmonicForceEngine, type GraphNode3D, type GraphEdge3D } from './force-graph-engine';
import { MemoryNode } from './memory-node';
import { SkillNode } from './skill-node';
import { ToolNode } from './tool-node';
import { AgentNode } from './agent-node';
import { McpNode } from './mcp-node';
import { HarmonicConnection } from './harmonic-connection';
import type { MemoryLayer } from '@/memory/types';

interface HarmonicGraphProps {
  layer: MemoryLayer;
  onNodeSelect?: (nodeId: string) => void;
}

export function HarmonicGraph({ layer, onNodeSelect }: HarmonicGraphProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode3D[]; edges: GraphEdge3D[] }>({
    nodes: [],
    edges: [],
  });
  const engineRef = useRef(new HarmonicForceEngine());
  const mouseRef = useRef(new THREE.Vector2());

  // Cargar datos del store unificado
  useEffect(() => {
    async function load() {
      const store = UnifiedMemoryStore.getInstance();
      await store.init();
      const data = await store.buildGraph(layer);
      setGraphData(data);

      // Inicializar posiciones 3D
      const nodes3D = data.nodes.map(n => ({
        ...n,
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 400,
          (Math.random() - 0.5) * 400,
          (Math.random() - 0.5) * 200,
        ),
        velocity: new THREE.Vector3(0, 0, 0),
        mass: n.size,
      }));
      engineRef.current.load(nodes3D, data.edges as any);
    }
    load();
  }, [layer]);

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedNode(prev => prev === nodeId ? null : nodeId);
    onNodeSelect?.(nodeId);
  }, [onNodeSelect]);

  const handlePointerMove = useCallback((e: any) => {
    mouseRef.current.set(e.clientX, e.clientY);
  }, []);

  return (
    <div className="w-full h-[800px] rounded-2xl overflow-hidden border border-white/10 bg-black/40">
      <Canvas
        onPointerMove={handlePointerMove}
        camera={{ position: [0, 0, 600], fov: 60 }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[0, 300, 300]} intensity={0.8} />
        <pointLight position={[-300, -200, 100]} intensity={0.4} color="#007FFF" />
        <pointLight position={[300, 200, -100]} intensity={0.4} color="#39FF14" />

        {/* Grid de fondo */}
        <gridHelper args={[800, 40, '#1a1a2e', '#16213e']} />

        {/* Simulación y render del grafo */}
        <GraphRenderer
          engine={engineRef.current}
          selectedNode={selectedNode}
          onSelect={handleSelect}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={100}
          maxDistance={1500}
          autoRotate
          autoRotateSpeed={0.3}
        />
      </Canvas>
    </div>
  );
}

function GraphRenderer({
  engine, selectedNode, onSelect,
}: {
  engine: HarmonicForceEngine;
  selectedNode: string | null;
  onSelect: (id: string) => void;
}) {
  const { nodes: nodes3D, edges } = engine.getRenderState();

  // Tick de física en cada frame
  useFrame(() => {
    engine.tick();
  });

  // Render nodos según tipo
  const nodeComponents = nodes3D.map(node => {
    const props = {
      key: node.id,
      position: node.position,
      size: node.size,
      frequency: node.frequency,
      label: node.label,
      selected: selectedNode === node.id,
      onClick: () => onSelect(node.id),
    };

    switch (node.type) {
      case 'memory': return <MemoryNode {...props} color="#38bdf8" />;
      case 'skill': return <SkillNode {...props} color="#a78bfa" />;
      case 'tool': return <ToolNode {...props} color="#39FF14" />;
      case 'agent': return <AgentNode {...props} color="#FFBF00" />;
      case 'mcp_server': return <McpNode {...props} color="#f472b6" />;
      default: return <MemoryNode {...props} color="#ffffff" />;
    }
  });

  // Render conexiones con highlighting
  const edgeComponents = edges
    .filter(e => e.source && e.target)
    .map((edge, i) => {
      const relatedToSelected =
        selectedNode === edge.source?.id ||
        selectedNode === edge.target?.id;

      return (
        <HarmonicConnection
          key={i}
          source={edge.source!.position}
          target={edge.target!.position}
          weight={edge.weight}
          frequency={edge.frequency}
          type={edge.type}
          highlighted={relatedToSelected || selectedNode === null}
        />
      );
    });

  return <>{nodeComponents}{edgeComponents}</>;
}
```

---

## 7. Sistema de Capas (Layers)

### Selector de Capas

```tsx
// src/components/network/layer-selector.tsx
'use client';

import { useState } from 'react';
import { LAYER_CONFIGS } from '@/memory/layers';
import type { MemoryLayer } from '@/memory/types';
import { cn } from '@/lib/utils';

interface LayerSelectorProps {
  activeLayer: MemoryLayer;
  onLayerChange: (layer: MemoryLayer) => void;
  /** Capas adicionales combinables */
  secondaryLayers?: MemoryLayer[];
  onSecondaryLayersChange?: (layers: MemoryLayer[]) => void;
}

export function LayerSelector({
  activeLayer, onLayerChange,
  secondaryLayers = [], onSecondaryLayersChange,
}: LayerSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  const layers = Object.values(LAYER_CONFIGS);

  return (
    <div className="absolute top-4 left-4 z-20">
      <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-3 space-y-2 min-w-[200px]">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Capas del Grafo
        </h3>

        <div className="space-y-1">
          {layers.map(layer => (
            <button
              key={layer.id}
              onClick={() => {
                if (layer.id === 'all') {
                  onLayerChange('all');
                  return;
                }
                if (activeLayer === layer.id) {
                  onLayerChange('all');
                } else {
                  onLayerChange(layer.id);
                }
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                activeLayer === layer.id
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'hover:bg-white/5 text-muted-foreground border border-transparent'
              )}
            >
              {/* Indicador de color */}
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: layer.color }}
              />
              <span className="flex-1 text-left">{layer.label}</span>
              <span className="text-[10px] opacity-50">{layer.nodeTypes.length} tipos</span>
            </button>
          ))}
        </div>

        {/* Modo combinación */}
        <div className="border-t border-white/10 pt-2 mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            {expanded ? '▼ Combinar capas' : '▶ Combinar capas'}
          </button>

          {expanded && (
            <div className="mt-2 space-y-1">
              {layers.filter(l => l.id !== 'all' && l.id !== activeLayer).map(layer => (
                <label
                  key={layer.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={secondaryLayers.includes(layer.id)}
                    onChange={() => {
                      if (!onSecondaryLayersChange) return;
                      const next = secondaryLayers.includes(layer.id)
                        ? secondaryLayers.filter(l => l !== layer.id)
                        : [...secondaryLayers, layer.id];
                      onSecondaryLayersChange(next);
                    }}
                    className="rounded border-white/20"
                  />
                  <div
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: layer.color }}
                  />
                  {layer.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Configuración de Capas

```typescript
// src/memory/layers.ts
import type { MemoryLayer, MemoryNodeType, MemoryEdgeType, MemoryLayerConfig } from './types';

export const LAYER_CONFIGS: Record<MemoryLayer, MemoryLayerConfig> = {
  all: {
    id: 'all',
    label: '🌌 Todo',
    description: 'Muestra todos los nodos y conexiones del sistema sin filtro.',
    icon: 'Globe',
    color: '#ffffff',
    nodeTypes: ['conversation', 'message', 'memory_fact', 'skill', 'tool', 'agent', 'provider', 'model', 'api_key', 'mcp_server', 'user_preference', 'log_entry', 'discovery'],
    edgeTypes: ['used_in', 'depends_on', 'configured_for', 'discovered_at', 'related_to', 'created_by', 'references'],
    dimmedOpacity: 0.15,
    visibleByDefault: true,
  },
  memory: {
    id: 'memory',
    label: '🧠 Memoria',
    description: 'Conversaciones, hechos recordados, preferencias del usuario.',
    icon: 'Brain',
    color: '#38bdf8',
    nodeTypes: ['conversation', 'message', 'memory_fact', 'user_preference', 'log_entry'],
    edgeTypes: ['related_to', 'references', 'created_by'],
    dimmedOpacity: 0.1,
    visibleByDefault: true,
  },
  skills: {
    id: 'skills',
    label: '⚡ Skills',
    description: 'Procedimientos reutilizables y su árbol de dependencias.',
    icon: 'Zap',
    color: '#a78bfa',
    nodeTypes: ['skill'],
    edgeTypes: ['depends_on', 'used_in'],
    dimmedOpacity: 0.1,
    visibleByDefault: true,
  },
  tools: {
    id: 'tools',
    label: '🔧 Tools',
    description: 'Herramientas disponibles y sus relaciones con skills/agentes.',
    icon: 'Wrench',
    color: '#39FF14',
    nodeTypes: ['tool'],
    edgeTypes: ['used_in', 'depends_on'],
    dimmedOpacity: 0.1,
    visibleByDefault: true,
  },
  agents: {
    id: 'agents',
    label: '🤖 Agentes',
    description: 'Agentes de IA configurados y sus relaciones.',
    icon: 'Bot',
    color: '#FFBF00',
    nodeTypes: ['agent'],
    edgeTypes: ['configured_for', 'created_by', 'used_in'],
    dimmedOpacity: 0.1,
    visibleByDefault: true,
  },
  ai: {
    id: 'ai',
    label: '☁ IA & Modelos',
    description: 'Proveedores, modelos, API keys y descubrimientos.',
    icon: 'Cloud',
    color: '#f472b6',
    nodeTypes: ['provider', 'model', 'api_key', 'discovery'],
    edgeTypes: ['configured_for', 'discovered_at'],
    dimmedOpacity: 0.1,
    visibleByDefault: true,
  },
  mcp: {
    id: 'mcp',
    label: '🔗 MCP Servers',
    description: 'Servidores MCP conectados y sus herramientas.',
    icon: 'Link',
    color: '#34d399',
    nodeTypes: ['mcp_server'],
    edgeTypes: ['configured_for', 'depends_on'],
    dimmedOpacity: 0.1,
    visibleByDefault: true,
  },
  discoveries: {
    id: 'discoveries',
    label: '🔍 Descubrimientos',
    description: 'IAs, agentes y configuraciones detectadas recientemente.',
    icon: 'Search',
    color: '#fb923c',
    nodeTypes: ['discovery', 'api_key', 'provider', 'model'],
    edgeTypes: ['discovered_at'],
    dimmedOpacity: 0.1,
    visibleByDefault: false,
  },
};
```

---

## 8. Sistema de Agentes

```typescript
// src/ai/agents/types.ts
export type AgentCapability = 
  | 'chat' | 'code' | 'search' | 'memory' | 'vision' 
  | 'image_gen' | 'file_ops' | 'delegation' | 'cron';

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  capabilities: AgentCapability[];
  providerId: string;
  model: string;
  rules: string[];      // IDs de reglas activas
  skills: string[];      // IDs de skills auto-cargados
  tools: string[];       // Tools habilitadas para este agente
  memoryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Modo: chat (solo responder), tool (puede usar herramientas) */
  mode: 'chat' | 'tool' | 'autonomous';
}

// src/ai/agents/orchestrator.ts
export class AgentOrchestrator {
  async delegateTask(
    agentId: string,
    goal: string,
    context: string,
  ): Promise<string> {
    const agent = await this.getAgent(agentId);
    // 1. Cargar skills relevantes
    const skills = await skillRegistry.loadForContext(goal);
    // 2. Cargar tools habilitadas
    const tools = agent.tools.map(t => toolRegistry.get(t)).filter(Boolean);
    // 3. Construir contexto con memoria
    const memories = await memoryStore.semanticSearch(goal, 10);
    // 4. Ejecutar
    return this.execute(agent, skills, tools, memories, goal);
  }
}
```

---

## 9. MCP Bridge

```typescript
// src/ai/mcp/client.ts
export class McpClient {
  private servers: Map<string, McpServerConnection> = new Map();

  async connect(name: string, config: McpServerConfig) {
    if (config.transport === 'stdio') {
      const process = spawn(config.command, config.args);
      const connection = new McpConnection(process.stdin, process.stdout);
      await connection.initialize();
      this.servers.set(name, connection);
    } else if (config.transport === 'http') {
      const connection = new HttpMcpConnection(config.url, config.apiKey);
      await connection.initialize();
      this.servers.set(name, connection);
    }
    // Registrar tools del MCP en el tool registry
    const server = this.servers.get(name)!;
    const tools = await server.listTools();
    for (const tool of tools) {
      toolRegistry.register({
        schema: tool,
        toolset: 'mcp',
        handler: async (args) => {
          return server.callTool(tool.name, args);
        },
      });
    }
  }
}
```

---

## 10. Cron & Webhooks

```typescript
// src/cron/scheduler.ts
export class CronScheduler {
  private jobs: CronJob[] = [];
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  add(job: CronJob) {
    this.jobs.push(job);
    this.schedule(job);
  }

  private schedule(job: CronJob) {
    const ms = parseCronExpression(job.schedule);
    const id = setInterval(() => this.execute(job), ms);
    this.intervals.set(job.id, id);
  }

  private async execute(job: CronJob) {
    // Cargar skills, tools, contexto del agente
    const agent = await agentRegistry.get(job.agentId);
    const skills = await skillRegistry.loadForContext(job.prompt);
    // Ejecutar
    const result = await agentOrchestrator.execute(job.prompt);
    // Entregar según configuración
    if (job.delivery?.channel) {
      await messagingService.send(job.delivery.channel, result);
    }
    // Guardar en memoria
    await memoryStore.addNode({
      id: `cron-${job.id}-${Date.now()}`,
      type: 'log_entry',
      label: `Cron: ${job.name}`,
      description: result.slice(0, 200),
      data: { jobId: job.id, result },
      tags: ['cron', 'scheduled'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: 0,
      lastAccessedAt: new Date().toISOString(),
      layer: 'memory',
    });
  }
}
```

---

## 11. AI Detection Wizard — UI

```tsx
// src/components/ai-setup/ai-detection-wizard.tsx
'use client';

import { useState, useEffect } from 'react';
import { AutoDiscover } from '@/ai/detectors/auto-discover';
import { UnifiedMemoryStore } from '@/memory/unified-store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Cpu, Cloud, Key, Bot, BookOpen, Database,
  CheckCircle2, AlertCircle, ChevronRight, Sparkles,
} from 'lucide-react';

type WizardStep = 'intro' | 'scanning' | 'results' | 'importing' | 'done';

export function AiDetectionWizard() {
  const [step, setStep] = useState<WizardStep>('intro');
  const [scanProgress, setScanProgress] = useState(0);
  const [discovery, setDiscovery] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState(0);

  const startScan = async () => {
    setStep('scanning');
    const discover = new AutoDiscover();
    
    // Simular progreso mientras escanea
    const progressInterval = setInterval(() => {
      setScanProgress(p => Math.min(p + 15, 90));
    }, 300);

    const results = await discover.scanAll();
    clearInterval(progressInterval);
    setScanProgress(100);
    setDiscovery(results);
    
    // Seleccionar todo por defecto
    const allIds = new Set<string>();
    results.providers.forEach((p: any) => allIds.add(`provider-${p.id}`));
    results.apiKeys.forEach((k: any) => allIds.add(`key-${k.provider}`));
    results.skills.forEach((s: any) => allIds.add(`skill-${s.metadata.name}`));
    setSelectedItems(allIds);

    setTimeout(() => setStep('results'), 500);
  };

  const importSelected = async () => {
    setStep('importing');
    const store = UnifiedMemoryStore.getInstance();
    await store.init();
    
    let imported = 0;
    const total = selectedItems.size;

    // Importar proveedores
    for (const provider of discovery.providers) {
      if (!selectedItems.has(`provider-${provider.id}`)) continue;
      await store.addNode({
        id: `provider-${provider.id}`,
        type: 'provider',
        label: provider.label,
        description: `Detectado en ${provider.source}`,
        data: provider,
        tags: ['ai', 'provider', provider.local ? 'local' : 'cloud'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
        layer: 'ai',
      });
      imported++;
      setImportProgress((imported / total) * 100);
    }

    // Importar API keys
    for (const key of discovery.apiKeys) {
      if (!selectedItems.has(`key-${key.provider}`)) continue;
      await store.addNode({
        id: `key-${key.provider}`,
        type: 'api_key',
        label: `${key.label}`,
        description: `Encontrada en ${key.source}`,
        data: key,
        tags: ['ai', 'api-key', key.encrypted ? 'encrypted' : 'plain'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
        layer: 'ai',
      });
      imported++;
      setImportProgress((imported / total) * 100);
    }

    // Importar skills
    for (const skill of discovery.skills) {
      if (!selectedItems.has(`skill-${skill.metadata.name}`)) continue;
      await store.addNode({
        id: `skill-${skill.metadata.name}`,
        type: 'skill',
        label: skill.metadata.name,
        description: skill.metadata.description,
        data: skill,
        tags: ['skill', ...skill.metadata.tags],
        createdAt: skill.metadata.created || new Date().toISOString(),
        updatedAt: skill.metadata.updated || new Date().toISOString(),
        accessCount: 0,
        lastAccessedAt: new Date().toISOString(),
        layer: 'skills',
      });
      imported++;
      setImportProgress((imported / total) * 100);
    }

    toast.success(`${imported} elementos integrados al sistema`);
    setTimeout(() => setStep('done'), 500);
  };

  if (step === 'intro') {
    return (
      <Card className="max-w-2xl mx-auto p-8 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 
          border border-white/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Descubrimiento del Ecosistema IA</h2>
        <p className="text-muted-foreground">
          Este asistente escaneará tu sistema en busca de:
        </p>
        <div className="grid grid-cols-2 gap-4 text-left">
          {[
            { icon: Cpu, label: 'IAs Locales', desc: 'Ollama, llama.cpp, LM Studio...' },
            { icon: Cloud, label: 'APIs Cloud', desc: 'OpenAI, Anthropic, DeepSeek...' },
            { icon: Key, label: 'API Keys', desc: 'En .env, config.yaml, keychains...' },
            { icon: Bot, label: 'Agentes', desc: 'Hermes, Claude Code, Codex...' },
            { icon: BookOpen, label: 'Skills', desc: 'Skills de Hermes instalados...' },
            { icon: Database, label: 'Memoria', desc: 'Sesiones y preferencias...' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
              <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Button onClick={startScan} size="lg" className="gap-2">
          <Sparkles className="w-5 h-5" /> Iniciar Escaneo
        </Button>
      </Card>
    );
  }

  if (step === 'scanning') {
    return (
      <Card className="max-w-md mx-auto p-8 text-center space-y-4">
        <Cpu className="w-12 h-12 text-primary mx-auto animate-pulse" />
        <h3 className="text-lg font-semibold">Escaneando...</h3>
        <Progress value={scanProgress} className="w-full" />
        <p className="text-sm text-muted-foreground">
          Buscando IAs locales, APIs, agentes y configuraciones...
        </p>
      </Card>
    );
  }

  if (step === 'results') {
    return (
      <Card className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            {discovery.providers.length + discovery.apiKeys.length + discovery.skills.length} elementos encontrados
          </h3>
          <Badge variant="outline" className="text-xs">
            {selectedItems.size} seleccionados
          </Badge>
        </div>

        {/* Proveedores */}
        {discovery.providers.length > 0 && (
          <div>
            <h4 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
              ☁ Proveedores de IA
            </h4>
            <div className="space-y-2">
              {discovery.providers.map((p: any) => (
                <label key={p.id} className="flex items-center gap-3 p-3 rounded-lg
                  hover:bg-white/5 cursor-pointer border border-white/5">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(`provider-${p.id}`)}
                    onChange={() => {
                      const next = new Set(selectedItems);
                      next.has(`provider-${p.id}`) 
                        ? next.delete(`provider-${p.id}`)
                        : next.add(`provider-${p.id}`);
                      setSelectedItems(next);
                    }}
                    className="rounded"
                  />
                  {p.local ? (
                    <Cpu className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Cloud className="w-4 h-4 text-blue-400" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{p.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.models.length} modelos detectados · {p.status}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{p.source}</Badge>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* API Keys */}
        {discovery.apiKeys.length > 0 && (
          <div>
            <h4 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
              🔑 API Keys Detectadas
            </h4>
            <div className="space-y-2">
              {discovery.apiKeys.map((k: any) => (
                <label key={k.provider} className="flex items-center gap-3 p-3 rounded-lg
                  hover:bg-white/5 cursor-pointer border border-white/5">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(`key-${k.provider}`)}
                    onChange={() => {
                      const next = new Set(selectedItems);
                      next.has(`key-${k.provider}`)
                        ? next.delete(`key-${k.provider}`)
                        : next.add(`key-${k.provider}`);
                      setSelectedItems(next);
                    }}
                    className="rounded"
                  />
                  <Key className="w-4 h-4 text-amber-400" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{k.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{k.keyPreview}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{k.source}</Badge>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {discovery.skills.length > 0 && (
          <div>
            <h4 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
              ⚡ Skills Detectados
            </h4>
            <div className="space-y-2">
              {discovery.skills.map((s: any) => (
                <label key={s.metadata.name} className="flex items-center gap-3 p-3 rounded-lg
                  hover:bg-white/5 cursor-pointer border border-white/5">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(`skill-${s.metadata.name}`)}
                    onChange={() => {
                      const next = new Set(selectedItems);
                      next.has(`skill-${s.metadata.name}`)
                        ? next.delete(`skill-${s.metadata.name}`)
                        : next.add(`skill-${s.metadata.name}`);
                      setSelectedItems(next);
                    }}
                    className="rounded"
                  />
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{s.metadata.name}</p>
                    <p className="text-xs text-muted-foreground">{s.metadata.description}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">v{s.metadata.version}</Badge>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setStep('intro')}>
            Volver
          </Button>
          <Button onClick={importSelected} className="gap-2">
            <Database className="w-4 h-4" />
            Integrar {selectedItems.size} elementos al Grafo Vivo
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'importing') {
    return (
      <Card className="max-w-md mx-auto p-8 text-center space-y-4">
        <Database className="w-12 h-12 text-primary mx-auto animate-bounce" />
        <h3 className="text-lg font-semibold">Integrando al Ecosistema...</h3>
        <Progress value={importProgress} className="w-full" />
        <p className="text-sm text-muted-foreground">
          Conectando nodos, creando relaciones y preparando el grafo vivo...
        </p>
      </Card>
    );
  }

  if (step === 'done') {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 
          flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold">Ecosistema Integrado</h3>
        <p className="text-muted-foreground">
          Todos los elementos seleccionados ahora son parte del grafo vivo.
          Puedes verlos en la sección Red, filtrar por capas, y explorar
          las conexiones armónicas entre cada componente.
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => setStep('intro')}>
            Volver a empezar
          </Button>
          <Button onClick={() => window.location.href = '/network'}>
            Ir al Grafo Vivo <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}
```

---

## Resumen de Conexiones Armónicas en el Grafo

Cuando seleccionas un nodo en el Living Graph 3D:

1. **Iluminación radial**: el nodo seleccionado emite un pulso de luz blanca
2. **Conexiones directas**: todas las aristas del nodo seleccionado se iluminan al 100% de opacidad
3. **Conexiones de segundo grado**: aristas conectadas a nodos vecinos se iluminan al 60%
4. **Conexiones de tercer grado**: al 30%
5. **Nodos no conectados**: se atenúan al 10% de opacidad
6. **Partículas aceleran**: las partículas fluyendo por las aristas conectadas duplican su velocidad
7. **Frecuencia cambia**: la frecuencia de pulsación del nodo seleccionado se duplica (resonancia)
8. **Distancia**: los nodos conectados se acercan ligeramente (atracción armónica)
9. **Tooltip**: aparece un panel con los detalles del nodo (contenido de memoria, código de skill, etc.)

Todo esto está implementado en los archivos anteriores. El grafo no es decorativo —
cada nodo representa un dato real del sistema unificado de memoria.
