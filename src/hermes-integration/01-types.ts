/**
 * 🌌 StarSeed OS — Tipos del Sistema de Integración Hermes
 *
 * Define todos los tipos compartidos entre skills, tools, memoria,
 * agentes, MCP, y el grafo armónico.
 */
export {};

// ========================================================================
// SKILLS
// ========================================================================

export type SkillCategory =
  | 'development' | 'research' | 'creative' | 'system'
  | 'governance' | 'education' | 'social' | 'analysis';

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  category: SkillCategory;
  tags: string[];
  author?: string;
  created: string;
  updated: string;
  triggers: string[];
  dependencies: string[];
  requiredTools: string[];
  loadMode: 'auto' | 'manual';
}

export interface SkillDocument {
  metadata: SkillMetadata;
  content: string;
  linkedFiles: Record<string, string>;
}

// ========================================================================
// TOOLS
// ========================================================================

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
  toolset: string;
  handler: (args: Record<string, unknown>) => Promise<string>;
  checkFn?: () => boolean | Promise<boolean>;
  requiresEnv?: string[];
  requiresApproval?: boolean;
}

export type ToolsetId =
  | 'web' | 'file' | 'terminal' | 'code_execution'
  | 'memory' | 'delegation' | 'cron' | 'vision'
  | 'image_gen' | 'messaging';

export interface ToolsetDefinition {
  label: string;
  icon: string;
  tools: string[];
}

// ========================================================================
// MEMORIA UNIFICADA — Nodos, Aristas, Capas
// ========================================================================

export type MemoryNodeType =
  | 'conversation' | 'message' | 'memory_fact' | 'skill'
  | 'tool' | 'agent' | 'provider' | 'model' | 'api_key'
  | 'mcp_server' | 'user_preference' | 'log_entry' | 'discovery';

export type MemoryEdgeType =
  | 'used_in' | 'depends_on' | 'configured_for' | 'discovered_at'
  | 'related_to' | 'created_by' | 'references';

export type MemoryLayer =
  | 'memory' | 'skills' | 'tools' | 'agents'
  | 'ai' | 'mcp' | 'discoveries' | 'all';

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  label: string;
  description: string;
  data: Record<string, unknown>;
  embedding?: Float32Array;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
  layer: MemoryLayer;
}

export interface MemoryEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: MemoryEdgeType;
  weight: number;
  frequency: number;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryLayerConfig {
  id: MemoryLayer;
  label: string;
  description: string;
  icon: string;
  color: string;
  nodeTypes: MemoryNodeType[];
  edgeTypes: MemoryEdgeType[];
  dimmedOpacity: number;
  visibleByDefault: boolean;
}

// ========================================================================
// GRAFO 3D
// ========================================================================

export interface GraphNode3D {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  size: number;
  frequency: number;
  mass: number;
  label: string;
  selected?: boolean;
  color?: string;
  data: Record<string, unknown>;
}

export interface GraphEdge3D {
  source: string;
  target: string;
  weight: number;
  frequency: number;
  type: string;
}

export interface HarmonicConfig {
  harmonicAttraction: number;
  repulsion: number;
  connectionDistance: number;
  damping: number;
  centerGravity: number;
  minVelocity: number;
}

// ========================================================================
// AI DETECTION
// ========================================================================

export interface DiscoveredProvider {
  id: string;
  label: string;
  baseUrl: string;
  requiresKey: boolean;
  local: boolean;
  models: string[];
  status: 'available' | 'configured' | 'error';
  source: string;
}

export interface DiscoveredKey {
  provider: string;
  label: string;
  keyPreview: string;
  source: string;
  encrypted: boolean;
}

export interface DiscoveryResult {
  providers: DiscoveredProvider[];
  agents: DiscoveredAgent[];
  skills: SkillDocument[];
  memories: MemoryNode[];
  apiKeys: DiscoveredKey[];
}

export interface DiscoveredAgent {
  id: string;
  name: string;
  source: string;
  config: Record<string, unknown>;
}

// ========================================================================
// AGENTES
// ========================================================================

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
  rules: string[];
  skills: string[];
  tools: string[];
  memoryEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  mode: 'chat' | 'tool' | 'autonomous';
}

// ========================================================================
// MCP
// ========================================================================

export interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  apiKey?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ========================================================================
// CRON
// ========================================================================

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  agentId: string;
  enabled: boolean;
  delivery?: {
    channel: string;
    format: 'summary' | 'full' | 'silent';
  };
  lastRun?: string;
  lastResult?: string;
  createdAt: string;
}