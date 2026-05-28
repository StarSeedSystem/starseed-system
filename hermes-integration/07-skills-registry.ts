/**
 * 🌌 StarSeed OS — Skills Registry
 *
 * Registro central de skills. Cada skill es un procedimiento reutilizable
 * que el sistema carga automáticamente cuando detecta palabras clave
 * en el contexto del usuario.
 *
 * Carga skills desde:
 * 1. IndexedDB (skills instalados por el usuario)
 * 2. ~/.hermes/skills/ (skills de Hermes Agent, si existen)
 * 3. Skills nativos de StarSeed (pre-instalados)
 */

import type { SkillDocument, SkillMetadata, SkillCategory } from './01-types';
import { UnifiedMemoryStore } from './03-unified-store';

// ========================================================================
// Skills nativos de StarSeed OS
// ========================================================================

const NATIVE_SKILLS: SkillDocument[] = [
  {
    metadata: {
      name: 'principios-ontocraticos',
      description: 'Principios fundacionales de la Sociedad StarSeed: Ontocracia, Ciberdelia y Transhumanismo Comunista.',
      version: '1.0.0',
      category: 'governance',
      tags: ['ontocracia', 'ciberdelia', 'transhumanismo', 'constitucion'],
      triggers: ['ontocracia', 'gobernanza', 'votacion', 'soberania', 'starseed'],
      dependencies: [],
      requiredTools: [],
      loadMode: 'auto',
      author: 'StarSeed OS',
      created: '2026-05-01',
      updated: '2026-05-26',
    },
    content: `# Principios Ontocráticos

## Ontocracia — El Gobierno del Ser
- Soberanía Directa: el poder reside en el individuo
- Meritocracia del Entendimiento: autoridad por sabiduría verificable
- Una Persona, Una Voz con verificación biométrica ZK
- Voto Delegado Líquido

## Ciberdelia — Tecnología para la Expansión de la Conciencia
- La tecnología nunca es instrumento de control
- Propósito: amplificar cognición, conexión empática, inteligencia colectiva
- IA personal = Exocórtex (propiedad del usuario)

## Transhumanismo Comunista — Evolución y Abundancia
- Comunismo de Abundancia: recursos como procomún
- Evolución Simbiótica: integración ética bio-tecnológica
- 3 fases: Semilla → Fruto → Cosecha`,
    linkedFiles: {},
  },
  {
    metadata: {
      name: 'blast-framework',
      description: 'Protocolo B.L.A.S.T. para desarrollo: Blueprint, Link, Architect, Stylize, Trigger.',
      version: '1.0.0',
      category: 'development',
      tags: ['blast', 'desarrollo', 'framework', 'metodologia'],
      triggers: ['blast', 'desarrollo', 'implementar', 'codigo', 'feature'],
      dependencies: [],
      requiredTools: ['file-system', 'code-exec'],
      loadMode: 'auto',
      author: 'StarSeed OS',
      created: '2026-05-01',
      updated: '2026-05-26',
    },
    content: `# Protocolo B.L.A.S.T.

1. **Blueprint** — Diseñar antes de codificar. Documentar arquitectura.
2. **Link** — Conectar con sistemas existentes. No duplicar.
3. **Architect** — Implementar siguiendo el diseño. Tests primero.
4. **Stylize** — Refinar UI/UX. Consistencia visual.
5. **Trigger** — Probar, desplegar, documentar.`,
    linkedFiles: {},
  },
  {
    metadata: {
      name: 'exocortex-config',
      description: 'Cómo configurar el Exocórtex: proveedores de IA, modelos, cifrado de claves.',
      version: '1.0.0',
      category: 'system',
      tags: ['exocortex', 'ia', 'proveedores', 'configuracion'],
      triggers: ['exocortex', 'configurar ia', 'proveedor', 'api key', 'modelo'],
      dependencies: [],
      requiredTools: [],
      loadMode: 'auto',
      author: 'StarSeed OS',
      created: '2026-05-24',
      updated: '2026-05-26',
    },
    content: `# Configuración del Exocórtex

## Proveedores Soportados
- **Locales**: Ollama, LM Studio, llama.cpp, vLLM
- **Cloud**: OpenAI, Anthropic, Google, DeepSeek, Groq, OpenRouter
- **Compatibles**: Cualquier API compatible con OpenAI

## Seguridad
- Las API keys se cifran con AES-GCM 256-bit
- Clave derivada con PBKDF2-SHA256, 250k iteraciones
- Las claves NUNCA salen del navegador

## Categorías
- **Gratuitos**: DeepSeek (free tier), Groq (free tier)
- **Locales**: Ollama (privacidad total)
- **Premium**: OpenAI, Anthropic (trae tu propia clave)`,
    linkedFiles: {},
  },
  {
    metadata: {
      name: 'harmonic-graph-navigation',
      description: 'Cómo navegar e interactuar con el Living Graph 3D armónico.',
      version: '1.0.0',
      category: 'system',
      tags: ['grafo', 'navegacion', '3d', 'visualizacion'],
      triggers: ['grafo', 'living graph', 'nodos', 'conexiones', 'red'],
      dependencies: [],
      requiredTools: [],
      loadMode: 'manual',
      author: 'StarSeed OS',
      created: '2026-05-26',
      updated: '2026-05-26',
    },
    content: `# Navegación del Grafo Armónico

## Geometrías de Nodos
- **Esfera** → Memorias (432 Hz)
- **Octaedro** → Skills (528 Hz)
- **Cubo** → Tools (639 Hz)
- **Tetraedro** → Agentes (741 Hz)
- **Icosaedro** → MCP Servers (852 Hz)
- **Dodecaedro** → Proveedores IA (963 Hz)

## Interacción
- **Click** → Seleccionar nodo, ilumina conexiones
- **Arrastrar** → Orbitar cámara
- **Scroll** → Zoom
- **Selector de capas** → Filtrar por tipo de datos

## Capas Disponibles
- Memoria, Skills, Tools, Agentes, IA, MCP, Descubrimientos`,
    linkedFiles: {},
  },
];

// ========================================================================
// Skills Registry
// ========================================================================

export class SkillsRegistry {
  private skills: Map<string, SkillDocument> = new Map();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Load native skills
    for (const skill of NATIVE_SKILLS) {
      this.skills.set(skill.metadata.name, skill);
    }

    // Load from IndexedDB (user-installed skills)
    try {
      const store = UnifiedMemoryStore.getInstance();
      await store.init();
      const memoryNodes = await store.searchByType('skill');
      for (const node of memoryNodes) {
        if (node.data && typeof node.data === 'object' && 'content' in node.data) {
          const metadata: Partial<SkillMetadata> = node.data as any;
          if (metadata.name) {
            this.skills.set(metadata.name, {
              metadata: metadata as SkillMetadata,
              content: (node.data as any).content || node.description,
              linkedFiles: {},
            });
          }
        }
      }
    } catch {}

    this.initialized = true;
  }

  /** Busca skills por query (nombre, descripción, tags) */
  search(query: string): SkillDocument[] {
    const lower = query.toLowerCase();
    const results: SkillDocument[] = [];

    for (const skill of this.skills.values()) {
      const nameMatch = skill.metadata.name.toLowerCase().includes(lower);
      const descMatch = skill.metadata.description?.toLowerCase().includes(lower);
      const tagMatch = skill.metadata.tags?.some(t => t.toLowerCase().includes(lower));
      const triggerMatch = skill.metadata.triggers?.some(t => t.toLowerCase().includes(lower));

      if (nameMatch || descMatch || tagMatch || triggerMatch) {
        results.push(skill);
      }
    }

    return results;
  }

  /** Carga skills relevantes para un contexto dado */
  loadForContext(context: string): SkillDocument[] {
    const lower = context.toLowerCase();
    const loaded: SkillDocument[] = [];

    for (const skill of this.skills.values()) {
      // Skip manual-load skills
      if (skill.metadata.loadMode === 'manual') continue;

      // Check triggers
      const matches = skill.metadata.triggers.some(t => lower.includes(t.toLowerCase()));
      if (matches) {
        loaded.push(skill);
      }
    }

    return this.resolveDependencies(loaded);
  }

  /** Resuelve dependencias en orden topológico */
  private resolveDependencies(skills: SkillDocument[]): SkillDocument[] {
    const resolved: SkillDocument[] = [];
    const visited = new Set<string>();

    const visit = (skillName: string) => {
      if (visited.has(skillName)) return;
      visited.add(skillName);

      const skill = this.skills.get(skillName);
      if (!skill) return;

      // Resolve dependencies first
      for (const dep of skill.metadata.dependencies) {
        visit(dep);
      }

      resolved.push(skill);
    };

    for (const skill of skills) {
      visit(skill.metadata.name);
    }

    return resolved;
  }

  /** Obtener un skill por nombre */
  get(name: string): SkillDocument | undefined {
    return this.skills.get(name);
  }

  /** Listar todos los skills */
  getAll(): SkillDocument[] {
    return Array.from(this.skills.values());
  }

  /** Obtener skills por categoría */
  getByCategory(category: SkillCategory): SkillDocument[] {
    return Array.from(this.skills.values())
      .filter(s => s.metadata.category === category);
  }

  /** Instalar un nuevo skill */
  async install(skill: SkillDocument): Promise<void> {
    this.skills.set(skill.metadata.name, skill);

    // Persistir en memoria unificada
    const store = UnifiedMemoryStore.getInstance();
    await store.init();
    await store.addNode({
      id: `skill-installed-${skill.metadata.name}-${Date.now()}`,
      type: 'skill',
      label: skill.metadata.name,
      description: skill.metadata.description || '',
      data: { ...skill.metadata, content: skill.content },
      tags: ['skill', 'installed', ...skill.metadata.tags],
      createdAt: skill.metadata.created || new Date().toISOString(),
      updatedAt: skill.metadata.updated || new Date().toISOString(),
      accessCount: 0,
      lastAccessedAt: new Date().toISOString(),
      layer: 'skills',
    });
  }

  /** Desinstalar un skill */
  async uninstall(name: string): Promise<void> {
    this.skills.delete(name);
  }
}

// ========================================================================
// Singleton
// ========================================================================

export const skillsRegistry = new SkillsRegistry();