/**
 * 🌌 StarSeed OS — Contexto Completo del Sistema
 *
 * Construye un snapshot exhaustivo de TODO lo que la IA personal del usuario
 * debe saber al responder: sentidos activos, MCPs conectados, skills cargados,
 * tools habilitadas, sincrómetro y modo activo, signo solar, fase lunar,
 * memoria reciente, conexiones del grafo vivo, y proveedor de IA activo.
 *
 * Este snapshot se inyecta como system prompt addendum en cada turno de chat.
 *
 * Diseño: lazy + cacheable + serializable. No depende de React.
 */

import { getOpenHumanEngine } from './openhuman-bridge';
import { skillsRegistry } from './07-skills-registry';
import { toolsRegistry } from './08-tools-registry';

// Importes dinámicos por dominio para evitar dependencias circulares
import {
  getZodiacForISO,
  getLunarPhaseForISO,
  SINCROMETRO_MODES,
  type SincrometroMode,
} from '@/lib/sincrometro';

const SENSES_KEY = 'starseed.hermes.senses.v1';
const MCP_KEY = 'starseed.hermes.mcp.v1';
const SINCROMETRO_KEY = 'starseed.sincrometro.mode.v1';

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readString(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export interface SystemContextSnapshot {
  generatedAt: string;
  sincrometro: {
    mode: SincrometroMode;
    today: string;
    zodiacSign: string;
    zodiacGlyph: string;
    lunarPhase: string;
    lunarGlyph: string;
  };
  senses: string[];           // ids of enabled senses
  mcps: { name: string; transport: string; url?: string }[];
  skills: { name: string; description: string }[];
  tools: { name: string; toolset: string }[];
  memorySnapshot: string;      // multi-line OpenHuman MEMORY.md style
  recentEvents: string[];      // upcoming items from sincrómetro
}

/**
 * Construye el snapshot completo del sistema en este momento.
 * Llamar desde la página /agent justo antes de enviar al LLM.
 */
export function buildSystemContext(opts?: {
  /** Eventos del sincrómetro en formato "[YYYY-MM-DD HH:MM] (capa) Título" */
  upcomingEvents?: string[];
}): SystemContextSnapshot {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const sign = getZodiacForISO(today);
  const phase = getLunarPhaseForISO(today);
  const mode = (readString(SINCROMETRO_KEY, 'gregoriano') as SincrometroMode);

  const sensesObj = readJSON<Record<string, boolean>>(SENSES_KEY, {});
  const sensesActive = Object.entries(sensesObj).filter(([, v]) => v).map(([k]) => k);

  const mcps = readJSON<any[]>(MCP_KEY, []).filter((m) => m.enabled).map((m) => ({
    name: m.name,
    transport: m.transport,
    url: m.url,
  }));

  let skills: { name: string; description: string }[] = [];
  let tools: { name: string; toolset: string }[] = [];
  try {
    skills = skillsRegistry.getAll().map((s: any) => ({
      name: s.metadata?.name ?? s.name ?? 'skill',
      description: (s.metadata?.description ?? s.description ?? '').slice(0, 120),
    }));
  } catch { /* registry not initialized */ }
  try {
    const enabled = toolsRegistry.getEnabledTools();
    tools = enabled.map((t: any) => ({
      name: t.schema?.name ?? 'tool',
      toolset: t.toolset ?? 'general',
    }));
  } catch { /* registry not initialized */ }

  const memorySnapshot = getOpenHumanEngine().buildContextSnapshot();

  return {
    generatedAt: now.toISOString(),
    sincrometro: {
      mode,
      today,
      zodiacSign: sign.label,
      zodiacGlyph: sign.glyph,
      lunarPhase: phase.label,
      lunarGlyph: phase.glyph,
    },
    senses: sensesActive,
    mcps,
    skills,
    tools,
    memorySnapshot,
    recentEvents: opts?.upcomingEvents ?? [],
  };
}

/**
 * Convierte el snapshot en un bloque de texto inyectable en un system prompt.
 * Estructura compacta y fácil de parsear por el LLM.
 */
export function snapshotToSystemPrompt(snap: SystemContextSnapshot): string {
  const labelOfMode = SINCROMETRO_MODES.find((m) => m.id === snap.sincrometro.mode)?.label ?? snap.sincrometro.mode;
  const lines: string[] = [
    '# CONTEXTO DEL SISTEMA (StarSeed OS)',
    `Hora de generación: ${snap.generatedAt}`,
    '',
    '## Sincrómetro',
    `Modo activo: ${labelOfMode}`,
    `Hoy es ${snap.sincrometro.today} · Sol en ${snap.sincrometro.zodiacSign} ${snap.sincrometro.zodiacGlyph} · ${snap.sincrometro.lunarPhase} ${snap.sincrometro.lunarGlyph}`,
    '',
    '## Sentidos del Exocórtex activos',
    snap.senses.length > 0 ? snap.senses.map((s) => `- ${s}`).join('\n') : '- (ninguno activo)',
    '',
    '## MCPs conectados',
    snap.mcps.length > 0
      ? snap.mcps.map((m) => `- ${m.name} (${m.transport})${m.url ? ` · ${m.url}` : ''}`).join('\n')
      : '- (ninguno conectado)',
    '',
    '## Skills cargados',
    snap.skills.length > 0 ? snap.skills.map((s) => `- ${s.name}: ${s.description}`).join('\n') : '- (sin skills)',
    '',
    '## Tools habilitadas',
    snap.tools.length > 0 ? snap.tools.map((t) => `- ${t.name} [${t.toolset}]`).join('\n') : '- (sin tools)',
    '',
    '## Próximos eventos del Sincrómetro',
    snap.recentEvents.length > 0 ? snap.recentEvents.map((e) => `- ${e}`).join('\n') : '- (sin eventos próximos)',
    '',
    '## Memoria reciente (OpenHuman tree + KV)',
    snap.memorySnapshot,
    '',
    '## Reglas operativas',
    '- Si el usuario pregunta por el PASADO ya ingerido, consulta la memoria del árbol (tree). No inventes.',
    '- Si pregunta por el PRESENTE (inbox actual, MCP conectado), invoca el toolset correspondiente.',
    '- Si te da un dato personal, persísteloen memory_store(namespace="global", category="core").',
    '- Al usar la memoria, cita siempre la fuente con [tree:nodeId] o [kv:namespace/key].',
    '- Respeta el modo del Sincrómetro al hablar de fechas: si el usuario está en modo lunar, refiérete a las fases; en astrológico, a los signos.',
  ];
  return lines.join('\n');
}
