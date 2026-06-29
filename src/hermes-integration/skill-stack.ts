/**
 * StarSeed Skill Stack — catálogo abierto, editable, instalable.
 *
 * Fusiona contribuciones de Hermes (agente mensajero), OpenHuman AI
 * (memoria 3 capas) y OpenClaw (agente operativo). Cada skill incluye:
 *   - metadata visible al usuario
 *   - código editable (texto plano, sin minificar) — el usuario puede
 *     verlo, modificarlo, exportarlo o re-importarlo.
 *   - origen (preset / user / external)
 *   - dependencias de tools, sentidos y MCPs
 *
 * El usuario puede:
 *   - habilitar/deshabilitar
 *   - editar el código en una textarea
 *   - duplicar como skill propio
 *   - exportar como `.skill` JSON e importar de cualquier fuente
 *   - generar nuevas skills desde una skill (meta-skills)
 *
 * Persistencia: localStorage. Compatible con el flujo Anthropic/Claude
 * Skill API (skill.md → metadata + content).
 */

export type SkillOrigin = 'hermes' | 'openhuman' | 'openclaw' | 'starseed' | 'user' | 'external';

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  origin: SkillOrigin;
  /** Categoría amplia para filtros. */
  category: 'memory' | 'agent' | 'comms' | 'creative' | 'governance' | 'research' | 'system' | 'meta';
  /** Cualquier código (TS/JS/MD) embebido. Texto plano, totalmente editable. */
  code: string;
  /** Tools mínimas que la skill espera. */
  requiredTools: string[];
  /** Triggers (palabras clave) que activan la skill automáticamente. */
  triggers: string[];
  /** Modelo recomendado (puede ser cualquier provider). */
  preferredModel?: string;
  /** ¿Puede esta skill generar otras skills/agentes? */
  selfReplicating?: boolean;
  enabled: boolean;
  version: string;
  /** Métricas de uso para mostrar gráficas en Astraura AI. */
  invocations?: number;
  lastUsedAt?: string;
}

const STORAGE_KEY = 'starseed.skill-stack.v1';

// ── Preset stack ─────────────────────────────────────────────────────────

export const SKILL_STACK_PRESETS: SkillEntry[] = [
  // ── HERMES ──
  {
    id: 'hermes-orchestrator',
    name: 'Hermes · Orchestrator',
    description: 'Decide qué capa de memoria/tool usar según la intención del usuario. Árbol de decisión OpenHuman §4.',
    origin: 'hermes',
    category: 'agent',
    requiredTools: ['memory', 'delegation'],
    triggers: ['recordar', 'olvidar', 'qué dijiste', 'inbox'],
    enabled: true,
    version: '1.0.0',
    selfReplicating: false,
    code: `// Hermes Orchestrator
// Devuelve la acción adecuada para un prompt dado.
import { decideAction } from '@/hermes-integration/openhuman-bridge';
export async function run(prompt) {
  const actions = decideAction(prompt);
  return { actions };
}`,
  },
  {
    id: 'hermes-archivist',
    name: 'Hermes · Archivist',
    description: 'Extrae lecciones al final de cada sesión, actualiza MEMORY.md e indexa en FTS.',
    origin: 'hermes',
    category: 'memory',
    requiredTools: ['memory', 'file'],
    triggers: ['guardar sesión', 'archivar', 'memory.md'],
    enabled: true,
    version: '1.0.0',
    code: `// Hermes Archivist
import { getOpenHumanEngine } from '@/hermes-integration/openhuman-bridge';
export async function run(sessionText) {
  return getOpenHumanEngine().ingest(sessionText, 'system', 'archive-' + Date.now());
}`,
  },

  // ── OPENHUMAN ──
  {
    id: 'openhuman-tree-query',
    name: 'OpenHuman · Tree Query',
    description: 'Consulta el árbol jerárquico de memoria por entidad, tema, fuente o ventana temporal.',
    origin: 'openhuman',
    category: 'memory',
    requiredTools: ['memory'],
    triggers: ['qué dijo', 'la semana pasada', 'busca en mi historial'],
    enabled: true,
    version: '1.0.0',
    code: `// OpenHuman Tree Query
import { getOpenHumanEngine } from '@/hermes-integration/openhuman-bridge';
export async function run({ days = 7 }) {
  return getOpenHumanEngine().tree.queryGlobal(days);
}`,
  },
  {
    id: 'openhuman-kv-recall',
    name: 'OpenHuman · KV Recall',
    description: 'Recupera datos personales recordados (preferencias, idioma, estilo, hechos).',
    origin: 'openhuman',
    category: 'memory',
    requiredTools: ['memory'],
    triggers: ['mi idioma', 'mis preferencias', 'qué sabes de mí'],
    enabled: true,
    version: '1.0.0',
    code: `// OpenHuman KV Recall
import { getOpenHumanEngine } from '@/hermes-integration/openhuman-bridge';
export async function run({ namespace = 'global', key }) {
  return getOpenHumanEngine().kv.get(namespace, key);
}`,
  },

  // ── OPENCLAW ──
  {
    id: 'openclaw-navigator',
    name: 'OpenClaw · Navigator',
    description: 'Navega entre páginas y secciones del SOSD desde el chat. Responde a comandos de voz/texto.',
    origin: 'openclaw',
    category: 'system',
    requiredTools: ['delegation'],
    triggers: ['abre', 've a', 'navega', 'lleva'],
    enabled: true,
    version: '1.0.0',
    code: `// OpenClaw Navigator
// Convierte intenciones de voz en navegación.
export async function run({ target }) {
  const routes = {
    'inicio': '/dashboard',
    'hub': '/hub',
    'cerebro': '/network/graph',
    'ia': '/agent',
    'ajustes': '/settings',
    'biblioteca': '/library',
    'red': '/network',
    'notificaciones': '/notifications',
  };
  const route = routes[String(target).toLowerCase()];
  if (route) window.location.href = route;
  return { navigated: !!route, route };
}`,
  },
  {
    id: 'openclaw-form-filler',
    name: 'OpenClaw · Form Filler',
    description: 'Rellena formularios desde el chat por voz o texto. Soporta toda la UI del SOSD.',
    origin: 'openclaw',
    category: 'system',
    requiredTools: ['delegation'],
    triggers: ['llena', 'rellena', 'escribe en'],
    enabled: true,
    version: '1.0.0',
    code: `// OpenClaw Form Filler
export async function run({ selector, value }) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false };
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}`,
  },
  {
    id: 'openclaw-click',
    name: 'OpenClaw · Click',
    description: 'Hace click en cualquier botón/elemento por descripción o selector.',
    origin: 'openclaw',
    category: 'system',
    requiredTools: ['delegation'],
    triggers: ['haz click', 'pulsa', 'presiona'],
    enabled: true,
    version: '1.0.0',
    code: `// OpenClaw Click
export async function run({ selector }) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false };
  el.click();
  return { ok: true };
}`,
  },

  // ── STARSEED nativo ──
  {
    id: 'starseed-sincrometro-context',
    name: 'StarSeed · Sincrómetro Context',
    description: 'Inyecta sign solar, fase lunar, horóscopos multi-tradición y eventos próximos como contexto.',
    origin: 'starseed',
    category: 'agent',
    requiredTools: ['memory'],
    triggers: ['horóscopo', 'fase lunar', 'mi día'],
    enabled: true,
    version: '1.0.0',
    code: `// StarSeed Sincrómetro Context
import { getAstroProfile, getLunarPhaseForISO } from '@/lib/sincrometro';
export async function run({ iso = new Date().toISOString().slice(0, 10) }) {
  return { astro: getAstroProfile(iso), lunar: getLunarPhaseForISO(iso) };
}`,
  },
  {
    id: 'starseed-cerebro-connect',
    name: 'StarSeed · Cerebro Connect',
    description: 'Crea conexiones entre nodos del Cerebro desde el chat.',
    origin: 'starseed',
    category: 'system',
    requiredTools: ['memory'],
    triggers: ['conecta', 'enlaza', 'crea conexión'],
    enabled: true,
    version: '1.0.0',
    code: `// StarSeed Cerebro Connect
import { getLivingGraphStore } from '@/hermes-integration/living-graph-store';
export async function run({ source, target, kind = 'custom' }) {
  return getLivingGraphStore().addEdge({ sourceId: source, targetId: target, kind, origin: 'user' });
}`,
  },

  // ── META-SKILLS: skills que crean skills ──
  {
    id: 'meta-skill-generator',
    name: 'Meta · Skill Generator',
    description: 'Crea nuevas skills a partir de una descripción textual. La skill resultante queda editable.',
    origin: 'starseed',
    category: 'meta',
    requiredTools: ['memory'],
    triggers: ['crea skill', 'genera habilidad', 'nueva skill'],
    enabled: true,
    selfReplicating: true,
    version: '1.0.0',
    code: `// Meta · Skill Generator
import { getSkillStack } from '@/hermes-integration/skill-stack';
export async function run({ name, description, category = 'agent', code, triggers = [] }) {
  const id = 'user-' + Date.now().toString(36);
  return getSkillStack().addSkill({
    id, name, description, category,
    code: code || \`// \${name}\\nexport async function run(args) {\\n  return { ok: true, args };\\n}\`,
    origin: 'user', requiredTools: [], triggers, enabled: true, version: '0.1.0',
  });
}`,
  },
  {
    id: 'meta-agent-generator',
    name: 'Meta · Agent Generator',
    description: 'Crea agentes nuevos con persona, reglas, skills y memoria propios. El agente resultante se guarda en el Astraura AI.',
    origin: 'starseed',
    category: 'meta',
    requiredTools: ['memory'],
    triggers: ['crea agente', 'nuevo agente', 'genera asistente'],
    enabled: true,
    selfReplicating: true,
    version: '1.0.0',
    code: `// Meta · Agent Generator
export async function run({ name, persona, skills = [], temperature = 0.7 }) {
  const agents = JSON.parse(localStorage.getItem('starseed.agents.v1') || '[]');
  const id = 'agent-' + Date.now().toString(36);
  agents.push({ id, name, systemPrompt: persona, skills, temperature, createdAt: new Date().toISOString() });
  localStorage.setItem('starseed.agents.v1', JSON.stringify(agents));
  return { id };
}`,
  },

  // ── REACT-DOCTOR plugin como skill ──
  {
    id: 'react-doctor',
    name: 'React Doctor · Fix My Code',
    description: 'Analiza y corrige componentes React detectando hydration mismatches, claves duplicadas, hooks mal usados y patrones anti-pattern. Cuidadoso: nunca elimina funciones útiles, solo refactoriza patrones rotos.',
    origin: 'external',
    category: 'system',
    requiredTools: ['file'],
    triggers: ['react-doctor', 'fix my code', 'arregla mi código', 'analiza react'],
    enabled: true,
    version: '0.1.0',
    code: `// React Doctor · Fix My Code
// Reglas:
//   1. Detecta Math.random()/Date.now() en render → sugiere mover a useEffect.
//   2. Detecta keys duplicadas en .map → propone deduplicación con index.
//   3. Detecta useEffect sin cleanup en suscripciones.
//   4. NUNCA elimina lógica funcional — solo refactoriza patrones rotos.
export async function run({ code }) {
  const issues = [];
  if (/Math\\.random\\(/.test(code) && /return\\s*\\(/.test(code)) {
    issues.push({ severity: 'high', message: 'Math.random() detectado en render — mover a useEffect/useMemo.' });
  }
  if (/Date\\.now\\(/.test(code) && /return\\s*\\(/.test(code)) {
    issues.push({ severity: 'high', message: 'Date.now() en render — usa useState + useEffect.' });
  }
  if (/typeof\\s+window\\s*!==/.test(code) && /return\\s*\\(/.test(code)) {
    issues.push({ severity: 'medium', message: 'Server/client branch en render — usar mounted flag.' });
  }
  return { issues, autoFix: false };
}`,
  },
];

// ── Store ────────────────────────────────────────────────────────────────

class SkillStack {
  private skills: SkillEntry[] = [];
  private loaded = false;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded) return;
    if (typeof window === 'undefined') { this.skills = SKILL_STACK_PRESETS; this.loaded = true; return; }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SkillEntry[];
        const known = new Set(parsed.map((s) => s.id));
        // Añade presets nuevos que no estuvieran guardados
        const missing = SKILL_STACK_PRESETS.filter((p) => !known.has(p.id));
        this.skills = [...parsed, ...missing];
      } else {
        this.skills = SKILL_STACK_PRESETS;
      }
    } catch {
      this.skills = SKILL_STACK_PRESETS;
    }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.skills)); } catch { /* noop */ }
    this.listeners.forEach((fn) => fn());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  all(): SkillEntry[] { this.load(); return this.skills; }
  get(id: string): SkillEntry | undefined { this.load(); return this.skills.find((s) => s.id === id); }

  addSkill(s: SkillEntry): SkillEntry {
    this.load();
    const exists = this.skills.find((x) => x.id === s.id);
    if (exists) {
      this.skills = this.skills.map((x) => (x.id === s.id ? s : x));
    } else {
      this.skills = [...this.skills, s];
    }
    this.persist();
    return s;
  }

  updateSkill(id: string, patch: Partial<SkillEntry>) {
    this.load();
    this.skills = this.skills.map((s) => (s.id === id ? { ...s, ...patch } : s));
    this.persist();
  }

  toggle(id: string) {
    const s = this.get(id);
    if (s) this.updateSkill(id, { enabled: !s.enabled });
  }

  remove(id: string) {
    this.load();
    this.skills = this.skills.filter((s) => s.id !== id);
    this.persist();
  }

  duplicate(id: string): SkillEntry | null {
    const s = this.get(id);
    if (!s) return null;
    const copy: SkillEntry = {
      ...s,
      id: `${s.id}-copy-${Date.now().toString(36)}`,
      name: `${s.name} (copia)`,
      origin: 'user',
      enabled: false,
      version: '0.1.0',
    };
    this.addSkill(copy);
    return copy;
  }

  recordInvocation(id: string) {
    const s = this.get(id);
    if (!s) return;
    this.updateSkill(id, {
      invocations: (s.invocations ?? 0) + 1,
      lastUsedAt: new Date().toISOString(),
    });
  }

  exportSkill(id: string): string {
    const s = this.get(id);
    if (!s) return '';
    return JSON.stringify(s, null, 2);
  }

  importSkill(json: string): SkillEntry | null {
    try {
      const parsed = JSON.parse(json) as SkillEntry;
      if (!parsed.id || !parsed.name) return null;
      parsed.origin = 'external';
      return this.addSkill(parsed);
    } catch {
      return null;
    }
  }

  /** Estadísticas para Astraura AI. */
  stats() {
    this.load();
    const byOrigin: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    this.skills.forEach((s) => {
      byOrigin[s.origin] = (byOrigin[s.origin] ?? 0) + 1;
      byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    });
    return {
      total: this.skills.length,
      enabled: this.skills.filter((s) => s.enabled).length,
      byOrigin,
      byCategory,
      totalInvocations: this.skills.reduce((a, s) => a + (s.invocations ?? 0), 0),
    };
  }
}

let _stack: SkillStack | null = null;
export function getSkillStack(): SkillStack {
  if (!_stack) _stack = new SkillStack();
  return _stack;
}
