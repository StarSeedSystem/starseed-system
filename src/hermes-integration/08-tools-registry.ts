/**
 * 🌌 StarSeed OS — Tools Registry
 *
 * Registro central de herramientas que los agentes pueden invocar.
 * Cada tool tiene un schema JSON, un handler, y un check_fn opcional
 * para verificar requisitos.
 *
 * Las toolsets agrupan herramientas relacionadas y se pueden activar
 * individualmente.
 */

import type { ToolDefinition, ToolSchema, ToolsetId, ToolsetDefinition } from './01-types';
import { UnifiedMemoryStore } from './03-unified-store';

// ========================================================================
// Toolset Definitions
// ========================================================================

export const TOOLSETS: Record<ToolsetId, ToolsetDefinition> = {
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
    tools: ['memory-save', 'memory-search', 'memory-forget', 'memory-link'],
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
};

// ========================================================================
// Tools Registry
// ========================================================================

export class ToolsRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private enabledToolsets: Set<ToolsetId> = new Set(Object.keys(TOOLSETS) as ToolsetId[]);
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Register built-in tools
    this.registerBuiltInTools();

    // Load from memory store (tools discovered from Hermes/MCP)
    try {
      const store = UnifiedMemoryStore.getInstance();
      await store.init();
      const toolNodes = await store.searchByType('tool');
      for (const node of toolNodes) {
        if (node.data && typeof node.data === 'object' && 'schema' in node.data) {
          const def = node.data as any as ToolDefinition;
          this.tools.set(def.schema.name, def);
        }
      }
    } catch {}

    this.initialized = true;
  }

  // ====================================================================
  // Built-in tool definitions
  // ====================================================================

  private registerBuiltInTools(): void {
    this.register({
      schema: {
        name: 'memory-save',
        description: 'Guarda un hecho en la memoria persistente para recuperarlo en el futuro.',
        parameters: {
          type: 'object',
          properties: {
            fact: { type: 'string', description: 'El hecho o información a recordar' },
            tags: { type: 'string', description: 'Tags separados por coma para categorizar' },
          },
          required: ['fact'],
        },
      },
      toolset: 'memory',
      handler: async (args) => {
        const store = UnifiedMemoryStore.getInstance();
        await store.init();
        const id = `fact-${Date.now()}`;
        await store.addNode({
          id,
          type: 'memory_fact',
          label: (args.fact as string)?.slice(0, 60) || 'Memory fact',
          description: args.fact as string || '',
          data: { fact: args.fact },
          tags: (args.tags as string || '').split(',').map(t => t.trim()).filter(Boolean),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessCount: 0,
          lastAccessedAt: new Date().toISOString(),
          layer: 'memory',
        });
        return JSON.stringify({ success: true, id });
      },
    });

    this.register({
      schema: {
        name: 'memory-search',
        description: 'Busca en la memoria persistente por texto o similitud semántica.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Texto a buscar en la memoria' },
            limit: { type: 'number', description: 'Máximo de resultados (default: 10)' },
          },
          required: ['query'],
        },
      },
      toolset: 'memory',
      handler: async (args) => {
        const store = UnifiedMemoryStore.getInstance();
        await store.init();
        const limit = (args.limit as number) || 10;
        const results = await store.semanticSearch(args.query as string, limit);
        return JSON.stringify({
          results: results.map(n => ({
            id: n.id,
            label: n.label,
            description: n.description,
            tags: n.tags,
            type: n.type,
          })),
        });
      },
    });

    this.register({
      schema: {
        name: 'memory-forget',
        description: 'Elimina un hecho específico de la memoria.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID del nodo de memoria a eliminar' },
          },
          required: ['id'],
        },
      },
      toolset: 'memory',
      handler: async (args) => {
        const store = UnifiedMemoryStore.getInstance();
        await store.init();
        await store.deleteNode(args.id as string);
        return JSON.stringify({ success: true });
      },
    });

    this.register({
      schema: {
        name: 'memory-link',
        description: 'Crea una conexión (edge) entre dos nodos de memoria.',
        parameters: {
          type: 'object',
          properties: {
            sourceId: { type: 'string', description: 'ID del nodo origen' },
            targetId: { type: 'string', description: 'ID del nodo destino' },
            relation: {
              type: 'string',
              description: 'Tipo de relación: related_to, depends_on, references',
              enum: ['related_to', 'depends_on', 'references'],
            },
          },
          required: ['sourceId', 'targetId', 'relation'],
        },
      },
      toolset: 'memory',
      handler: async (args) => {
        const store = UnifiedMemoryStore.getInstance();
        await store.init();
        await store.addEdge({
          id: `edge-${args.sourceId}-${args.targetId}-${Date.now()}`,
          sourceId: args.sourceId as string,
          targetId: args.targetId as string,
          type: (args.relation as any) || 'related_to',
          weight: 1.0,
          frequency: 528,
          data: { createdBy: 'tool' },
          createdAt: new Date().toISOString(),
        });
        return JSON.stringify({ success: true });
      },
    });

    this.register({
      schema: {
        name: 'web-search',
        description: 'Realiza una búsqueda en la web.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Términos de búsqueda' },
          },
          required: ['query'],
        },
      },
      toolset: 'web',
      handler: async (args) => {
        // This would be implemented with an actual search API
        return JSON.stringify({
          message: 'Búsqueda web simulada. Conecta un proveedor de búsqueda en Settings.',
          query: args.query,
        });
      },
    });
  }

  // ====================================================================
  // Public API
  // ====================================================================

  register(def: ToolDefinition): void {
    this.tools.set(def.schema.name, def);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByToolset(toolsetId: ToolsetId): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(t => t.toolset === toolsetId);
  }

  enableToolset(id: ToolsetId): void {
    this.enabledToolsets.add(id);
  }

  disableToolset(id: ToolsetId): void {
    this.enabledToolsets.delete(id);
  }

  isToolsetEnabled(id: ToolsetId): boolean {
    return this.enabledToolsets.has(id);
  }

  getEnabledTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(t => this.enabledToolsets.has(t.toolset as ToolsetId));
  }

  getEnabledToolsets(): ToolsetDefinition[] {
    return Array.from(this.enabledToolsets)
      .map(id => TOOLSETS[id])
      .filter(Boolean);
  }

  async call(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return JSON.stringify({ error: `Tool not found: ${name}` });
    }
    if (!this.enabledToolsets.has(tool.toolset as ToolsetId)) {
      return JSON.stringify({ error: `Toolset '${tool.toolset}' is disabled` });
    }
    if (tool.checkFn && !(await tool.checkFn())) {
      return JSON.stringify({ error: `Requirements not met for: ${name}` });
    }
    try {
      return await tool.handler(args);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }
}

// ========================================================================
// Singleton
// ========================================================================

export const toolsRegistry = new ToolsRegistry();