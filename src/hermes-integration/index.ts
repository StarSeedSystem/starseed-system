/**
 * 🌌 StarSeed OS — Hermes Integration Index
 *
 * Punto de entrada central para todo el sistema de integración.
 * Inicializa todos los subsistemas en orden y expone una API unificada.
 *
 * Uso típico:
 *   import { hermes } from '@/hermes-integration';
 *   await hermes.init();
 *   await hermes.discover.scanAll();
 *   const graphData = await hermes.memory.buildGraph('all');
 */

import { UnifiedMemoryStore } from './03-unified-store';
import { AutoDiscover } from './04-auto-discover';
import { SkillsRegistry, skillsRegistry } from './07-skills-registry';
import { ToolsRegistry, toolsRegistry } from './08-tools-registry';
import { LAYER_CONFIGS } from './02-layers';
import { HarmonicForceEngine } from './05-force-graph-engine';
import type { MemoryLayer, MemoryNode, MemoryEdge, GraphNode3D, GraphEdge3D, DiscoveryResult } from './01-types';

// ========================================================================
// HermesIntegration — Punto de entrada único
// ========================================================================

class HermesIntegration {
  public memory: UnifiedMemoryStore;
  public discover: AutoDiscover;
  public skills: SkillsRegistry;
  public tools: ToolsRegistry;
  public engine: HarmonicForceEngine;

  private initialized = false;

  constructor() {
    this.memory = UnifiedMemoryStore.getInstance();
    this.discover = new AutoDiscover();
    this.skills = skillsRegistry;
    this.tools = toolsRegistry;
    this.engine = new HarmonicForceEngine();
  }

  /** Inicializa todos los subsistemas en orden */
  async init(): Promise<void> {
    if (this.initialized) return;
    console.log('[Hermes] Initializing integration subsystems...');

    // 1. Memory first (other systems depend on it)
    await this.memory.init();
    console.log('[Hermes] Memory store ready');

    // 2. Skills registry
    await this.skills.init();
    console.log(`[Hermes] Skills registry ready: ${this.skills.getAll().length} skills`);

    // 3. Tools registry
    await this.tools.init();
    console.log(`[Hermes] Tools registry ready: ${this.tools.getAll().length} tools`);

    this.initialized = true;
    console.log('[Hermes] All subsystems initialized');
  }

  /** Escanea el sistema completo y retorna descubrimientos */
  async scan(): Promise<DiscoveryResult> {
    await this.ensureInit();
    console.log('[Hermes] Starting system scan...');
    const results = await this.discover.scanAll();
    console.log(`[Hermes] Scan complete: ${results.providers.length} providers, ${results.apiKeys.length} keys, ${results.skills.length} skills`);
    return results;
  }

  /** Construye el grafo 3D para una capa específica */
  async buildGraph(layer: MemoryLayer = 'all'): Promise<{
    nodes: GraphNode3D[];
    edges: GraphEdge3D[];
  }> {
    await this.ensureInit();
    const data = await this.memory.buildGraph(layer);

    // Load into force engine
    this.engine.load(data.nodes, data.edges);

    return data;
  }

  /** Carga skills relevantes para un contexto */
  loadSkillsForContext(context: string) {
    return this.skills.loadForContext(context);
  }

  /** Obtiene todos los skills disponibles */
  getAllSkills() {
    return this.skills.getAll();
  }

  /** Verifica si el sistema ya está listo */
  isReady(): boolean {
    return this.initialized;
  }

  /** Obtiene un resumen del estado del sistema */
  async getStatus(): Promise<{
    memory: { nodes: number; edges: number };
    skills: number;
    tools: number;
    initialized: boolean;
  }> {
    await this.ensureInit();
    const allNodes = (await this.memory as any).db?.getAll('nodes') || [];
    const allEdges = (await this.memory as any).db?.getAll('edges') || [];
    return {
      memory: {
        nodes: allNodes.length || 0,
        edges: allEdges.length || 0,
      },
      skills: this.skills.getAll().length,
      tools: this.tools.getAll().length,
      initialized: this.initialized,
    };
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init();
  }
}

// ========================================================================
// Singleton export
// ========================================================================

export const hermes = new HermesIntegration();

// ========================================================================
// Convenience re-exports
// ========================================================================

export type { 
  MemoryLayer, MemoryNode, MemoryEdge, 
  GraphNode3D, GraphEdge3D, DiscoveryResult,
  SkillDocument, SkillMetadata, SkillCategory,
  ToolDefinition, ToolSchema, ToolsetId,
  HarmonicConfig,
} from './01-types';

export { LAYER_CONFIGS, getNodeTypeColor, getHarmonicForType } from './02-layers';
export { UnifiedMemoryStore } from './03-unified-store';
export { AutoDiscover } from './04-auto-discover';
export { HarmonicForceEngine, DEFAULT_HARMONIC_CONFIG } from './05-force-graph-engine';
export { SkillsRegistry, skillsRegistry } from './07-skills-registry';
export { ToolsRegistry, toolsRegistry, TOOLSETS } from './08-tools-registry';