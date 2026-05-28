/**
 * 🌌 StarSeed OS — Configuración de Capas del Grafo de Memoria
 *
 * Define qué tipos de nodos y aristas pertenecen a cada capa,
 * sus colores, opacidades, y comportamiento visual.
 */

import type { MemoryLayer, MemoryLayerConfig } from './01-types';

export const LAYER_CONFIGS: Record<MemoryLayer, MemoryLayerConfig> = {
  all: {
    id: 'all',
    label: '🌌 Todo',
    description: 'Muestra todos los nodos y conexiones del sistema sin filtro.',
    icon: 'Globe',
    color: '#ffffff',
    nodeTypes: [
      'conversation', 'message', 'memory_fact', 'skill', 'tool',
      'agent', 'provider', 'model', 'api_key', 'mcp_server',
      'user_preference', 'log_entry', 'discovery',
    ],
    edgeTypes: [
      'used_in', 'depends_on', 'configured_for', 'discovered_at',
      'related_to', 'created_by', 'references',
    ],
    dimmedOpacity: 0.15,
    visibleByDefault: true,
  },

  memory: {
    id: 'memory',
    label: '🧠 Memoria',
    description: 'Conversaciones, hechos recordados, preferencias del usuario y logs.',
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
    description: 'Herramientas disponibles y sus relaciones con skills y agentes.',
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
    description: 'Agentes de IA configurados y sus relaciones con providers y skills.',
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
    description: 'Proveedores de IA, modelos, API keys y descubrimientos del sistema.',
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
    description: 'Servidores MCP conectados y las herramientas que exponen.',
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
    description: 'IAs, agentes y configuraciones detectadas recientemente en el sistema.',
    icon: 'Search',
    color: '#fb923c',
    nodeTypes: ['discovery', 'api_key', 'provider', 'model'],
    edgeTypes: ['discovered_at'],
    dimmedOpacity: 0.1,
    visibleByDefault: false,
  },
};

/**
 * Frecuencias armónicas base para cada tipo de nodo.
 * Basadas en frecuencias Solfeggio y geometría sagrada.
 */
export const NODE_HARMONICS: Record<string, { base: number; name: string; solid: string }> = {
  conversation: { base: 432, name: 'Unidad', solid: 'Esfera' },
  message:      { base: 432, name: 'Unidad', solid: 'Esfera' },
  memory_fact:  { base: 432, name: 'Unidad', solid: 'Esfera' },
  skill:        { base: 528, name: 'Transformación', solid: 'Octaedro' },
  tool:         { base: 639, name: 'Conexión', solid: 'Cubo' },
  agent:        { base: 741, name: 'Expresión', solid: 'Tetraedro' },
  provider:     { base: 963, name: 'Trascendencia', solid: 'Dodecaedro' },
  model:        { base: 852, name: 'Expansión', solid: 'Icosaedro' },
  api_key:      { base: 852, name: 'Expansión', solid: 'Icosaedro' },
  mcp_server:   { base: 852, name: 'Expansión', solid: 'Icosaedro' },
  user_preference: { base: 432, name: 'Unidad', solid: 'Esfera' },
  log_entry:    { base: 396, name: 'Liberación', solid: 'Esfera' },
  discovery:    { base: 528, name: 'Transformación', solid: 'Octaedro' },
};

export function getHarmonicForType(type: string) {
  return NODE_HARMONICS[type] || { base: 432, name: 'Armonía', solid: 'Esfera' };
}

export function getNodeTypeColor(type: string): string {
  const configs = Object.values(LAYER_CONFIGS);
  for (const config of configs) {
    if (config.nodeTypes.includes(type as any)) {
      return config.color;
    }
  }
  return '#ffffff';
}