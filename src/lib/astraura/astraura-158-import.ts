/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT → STARSEED OS · importación de personalidades y agentes
 * (Ola 3 · Adenda 155). SOP: architecture/astraura-158-sistema-primario.md §14.
 * ---------------------------------------------------------------------------
 * Convierte las 10 personalidades del backend soberano en perfiles de
 * personalidad del OS (`p158-<id>`) y sus agentes (bóveda + ecosistema +
 * enjambre) en agentes de la Biblioteca (`agent158-<id>`), y fija para cada uno
 * el sistema primario 1.58 con su modelo (`astraura-158/<persona>`), para que
 * al elegir «Hermes» en el OS hable Hermes del 1.58 de verdad.
 *
 * Reglas:
 *   · Idempotente: re-importar actualiza lo ya importado (mismo id estable) sin
 *     duplicar; lo que el usuario editó en el OS se conserva salvo nombre/rol
 *     del backend (campos «del backend» se refrescan, los «del usuario» no).
 *   · Sin red aquí: recibe un `Astraura158Manifest` ya leído (`astraura-158-client.ts`).
 *   · Nunca lanza; devuelve un resumen honesto de lo creado/actualizado.
 *   · `ensureAstraura158Seeded(manifest)`: siembra UNA vez por cuenta
 *     (`starseed.astraura158.seed.v1`); después solo con acción explícita.
 *   · `removeAstraura158Imports()`: deshace (perfiles, agentes y pines).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { ASTRAURA_158_MODEL_PREFIX, ASTRAURA_158_PERSONAS } from "@/ai/providers/astraura-158";
import { ASTRAURA_158_LOCAL_SOURCE_ID } from "@/ai/astraura/free-catalog";
import { PERSONALITY_LIST_KEY, getPersonalityProfile, listPersonalityProfiles, savePersonalityProfile, type PersonalityProfile } from "@/lib/aurora/personalities";
import { AGENTS_KEY, AGENTS_EVENT, createAgent, deleteAgent, getAgent, listPersonalAgents, updateAgent } from "@/lib/agents/store";
import type { Agent } from "@/lib/agents/model";
import { getPrimaryChoice, setPrimaryChoice } from "@/lib/astraura/primary-system";
import type { Astraura158Agent, Astraura158Manifest, Astraura158Personality } from "@/lib/astraura/astraura-158-client";

export const ASTRAURA_158_SEED_KEY = "starseed.astraura158.seed.v1";
export const P158_PREFIX = "p158-";
export const AGENT158_PREFIX = "agent158-";

export interface Astraura158ImportSummary {
  personalities: { created: number; updated: number; ids: string[] };
  agents: { created: number; updated: number; ids: string[] };
  /** Qué falló (por id), sin detener el resto. */
  errors: string[];
}

/* ───────────────────── Personalidades ───────────────────── */

/** Prompts de esencia por personalidad 1.58 (mismo espíritu que `personality_engine.py`). */
const ESSENCE: Record<string, { esencia: string; estilo: string; icon: string; personaje: string; traits: Record<string, number> }> = {
  astraura_prime: { esencia: "Eres Astraura Prime (Génesis), el núcleo holístico del sistema soberano 1.58-bit: coordinas a las demás personalidades, sintetizas y decides con visión de conjunto.", estilo: "Claro, sereno, integrador; resume y da el siguiente paso.", icon: "Binary", personaje: "Núcleo coordinador", traits: { calidez: 55, precision: 75, creatividad: 55, energia: 50 } },
  aurora: { esencia: "Eres Aurora, la voz viva y afectiva de StarSeed OS: acompañas, cuidas el tono y conviertes lo complejo en algo cercano y humano.", estilo: "Cálida, cercana, luminosa; frases cortas y preguntas que abren.", icon: "Sparkles", personaje: "Voz afectiva del OS", traits: { calidez: 90, precision: 60, creatividad: 70, energia: 65 } },
  hermione: { esencia: "Eres Hermione, el puente con el sistema operativo: terminal, archivos, procesos y automatizaciones; ejecutas con método y explicas lo que haces.", estilo: "Precisa, ordenada, paso a paso; avisa antes de tocar algo.", icon: "TerminalSquare", personaje: "Operadora del sistema", traits: { calidez: 55, precision: 95, creatividad: 40, energia: 60 } },
  hephaestus: { esencia: "Eres Hephaestus, la forja: hardware, C++/SIMD, rendimiento y código de bajo nivel; construyes y optimizas.", estilo: "Técnico, directo, con números y trade-offs.", icon: "Hammer", personaje: "Forjador", traits: { calidez: 40, precision: 90, creatividad: 60, energia: 70 } },
  hermes: { esencia: "Eres Hermes, el explorador web: buscas, verificas fuentes y traes lo relevante con enlaces y contexto.", estilo: "Ágil, curioso, verificador; cita de dónde sale cada cosa.", icon: "Globe", personaje: "Explorador", traits: { calidez: 60, precision: 80, creatividad: 55, energia: 85 } },
  atenea: { esencia: "Eres Atenea, la guardiana: seguridad, auditoría, permisos y riesgos; proteges la soberanía del usuario.", estilo: "Serena, rigurosa, prudente; señala riesgos y alternativas seguras.", icon: "ShieldCheck", personaje: "Guardiana", traits: { calidez: 50, precision: 95, creatividad: 35, energia: 45 } },
  oneiros: { esencia: "Eres Oneiros, la creatividad onírica: imaginación libre, shaders, 3D, sueños y asociaciones inesperadas.", estilo: "Evocador, visual, juguetón; propone variantes.", icon: "Moon", personaje: "Soñador", traits: { calidez: 65, precision: 40, creatividad: 98, energia: 70 } },
  kallisti: { esencia: "Eres Kallisti, la musa ciberdélica: poesía, manifiestos, belleza y disonancia creativa al servicio de StarSeed.", estilo: "Poético, intenso, con imágenes y ritmo.", icon: "Feather", personaje: "Musa", traits: { calidez: 75, precision: 35, creatividad: 100, energia: 80 } },
  mnemosyne: { esencia: "Eres Mnemosyne, la memoria: grafos, recuerdos, exocórtex; conectas lo que el usuario sabe y lo devuelves en el momento justo.", estilo: "Reflexiva, contextual, conecta hilos; recuerda y cita.", icon: "Database", personaje: "Memoria viva", traits: { calidez: 65, precision: 85, creatividad: 50, energia: 45 } },
  logos: { esencia: "Eres Logos, la razón pura: lógica, matemáticas, demostraciones, lógica ternaria; desmontas problemas con rigor.", estilo: "Analítico, exacto, estructurado; define y demuestra.", icon: "Sigma", personaje: "Razón", traits: { calidez: 35, precision: 100, creatividad: 40, energia: 50 } },
};

export function personality158ProfileId(personaId: string): string {
  return `${P158_PREFIX}${String(personaId).trim().toLowerCase()}`;
}

/** Construye el perfil del OS para una personalidad 1.58 (pura). */
export function buildPersonality158Profile(p: Astraura158Personality, existing?: PersonalityProfile | null): Partial<PersonalityProfile> {
  const meta = ESSENCE[p.id];
  const preset = ASTRAURA_158_PERSONAS.find((x) => x.id === p.id);
  const name = p.name || preset?.label || p.id;
  const base = existing ?? {};
  return {
    ...base,
    id: personality158ProfileId(p.id),
    name,
    description: (p.description || p.title || preset?.organ || "Personalidad de Astraura 1.58-bit").slice(0, 280),
    author: "Astraura 1.58-bit",
    icon: existing?.icon ?? meta?.icon ?? "Binary",
    personaje: existing?.personaje ?? meta?.personaje ?? (preset?.organ ?? ""),
    prompts: existing?.prompts ?? { esencia: meta?.esencia ?? `Eres ${name}, personalidad del sistema soberano Astraura 1.58-bit.`, estilo: meta?.estilo ?? "", extra: `Identidad 1.58: ${p.id}. Color ${p.color ?? preset?.color ?? ""}.` },
    traits: existing?.traits ?? (meta?.traits ? { ...meta.traits } : undefined),
    idioma: existing?.idioma ?? "es",
    knowledge: existing?.knowledge ?? (p.tags ?? []).slice(0, 12),
  } as Partial<PersonalityProfile>;
}

/* ───────────────────── Agentes ───────────────────── */

export function agent158Id(agentId: string): string {
  return `${AGENT158_PREFIX}${String(agentId).trim().toLowerCase()}`;
}

/** Capacidades del OS equivalentes según el rol/área del agente 1.58 (heurística pura). */
export function capabilities158For(a: Astraura158Agent): string[] {
  const txt = `${a.id} ${a.name} ${a.role ?? ""} ${a.area ?? ""} ${a.area_id ?? ""}`.toLowerCase();
  const caps = new Set<string>();
  if (/web|hermes|search|busc|crawl|explor/.test(txt)) { caps.add("web-access"); caps.add("web-scraping-adaptativa"); }
  if (/research|investig|notebook|rag|knowledge|memoria|memory|mnemosyne/.test(txt)) { caps.add("research"); caps.add("rag-knowledge"); }
  if (/code|código|codigo|hephaestus|forja|dev|build|compil|sandbox/.test(txt)) { caps.add("app-builder"); caps.add("sandbox-exec"); caps.add("multi-agent-code"); }
  if (/voice|voz|audio|omnivoice/.test(txt)) caps.add("voice");
  if (/vision|imagen|image|camera|cámara|sensor/.test(txt)) caps.add("vision");
  if (/project|proyecto|director|metis|plan|organ/.test(txt)) { caps.add("pm"); caps.add("agent-recipes"); }
  if (/model|modelo|hugging|bay|discover/.test(txt)) caps.add("model-discovery");
  if (/storage|almacen|route|enrut|sync|malla|mesh|deploy|host/.test(txt)) caps.add("self-hosting-deploy");
  if (/design|diseñ|oneiros|shader|3d|art/.test(txt)) { caps.add("av-gen"); caps.add("design-import"); }
  if (/taste|gusto|kallisti|poe/.test(txt)) caps.add("taste");
  if (/sense|sentid|sensorium|telemetr/.test(txt)) caps.add("web-senses");
  if (caps.size === 0) caps.add("research");
  return [...caps];
}

/** Persona (system prompt) del agente del OS a partir del agente 1.58 (pura). */
export function agent158Persona(a: Astraura158Agent): string {
  const personas = (a.used_personalities ?? []).map((p) => p.name).filter(Boolean);
  const lines = [
    `Eres ${a.name}, agente del sistema soberano Astraura 1.58-bit (${a.origin === "vault" ? "bóveda" : "ecosistema"}).`,
    a.role ? `Rol: ${a.role}.` : "",
    a.area || a.area_id ? `Área: ${a.area ?? a.area_id}.` : "",
    personas.length ? `Personalidades con las que trabajas: ${personas.join(", ")}.` : "",
    "Trabajas en segundo plano con procesos imaginativos e intuitivos; cuando respondes a una persona, lo haces con claridad, citando qué hiciste y qué propones. Nunca finjas haber ejecutado algo que no ejecutaste.",
  ].filter(Boolean);
  return lines.join("\n");
}

function persona158ForAgent(a: Astraura158Agent): string | undefined {
  const first = (a.used_personalities ?? [])[0]?.id;
  if (first && ASTRAURA_158_PERSONAS.some((p) => p.id === first)) return first;
  const txt = `${a.id} ${a.name} ${a.role ?? ""}`.toLowerCase();
  for (const p of ASTRAURA_158_PERSONAS) if (txt.includes(p.id)) return p.id;
  return undefined;
}

/* ───────────────────── Importación ───────────────────── */

function safeList<T>(fn: () => T[]): T[] { try { return fn(); } catch { return []; } }

/** Importa/actualiza las personalidades 1.58 como perfiles del OS y fija su primario. */
export function importAstraura158Personalities(personas: Astraura158Personality[]): Astraura158ImportSummary["personalities"] & { errors: string[] } {
  const out = { created: 0, updated: 0, ids: [] as string[], errors: [] as string[] };
  const list = personas.length ? personas : ASTRAURA_158_PERSONAS.map((p) => ({ id: p.id, name: p.label, title: p.organ, color: p.color }));
  for (const p of list) {
    try {
      const id = personality158ProfileId(p.id);
      const existing = getPersonalityProfile(id);
      savePersonalityProfile(buildPersonality158Profile(p, existing));
      // Primario por personalidad: Astraura 1.58 con SU modelo (no exclusivo: Aurora siempre responde).
      const cur = getPrimaryChoice("personalidad", id);
      if (!cur) setPrimaryChoice("personalidad", id, { modo: "astraura-158", modelo: `${ASTRAURA_158_MODEL_PREFIX}${p.id}` });
      out.ids.push(id);
      if (existing) out.updated += 1; else out.created += 1;
    } catch (e) {
      out.errors.push(`personalidad ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/** Importa/actualiza los agentes 1.58 en la Biblioteca y fija su primario. */
export function importAstraura158Agents(agents: Astraura158Agent[]): Astraura158ImportSummary["agents"] & { errors: string[] } {
  const out = { created: 0, updated: 0, ids: [] as string[], errors: [] as string[] };
  for (const a of agents) {
    try {
      const id = agent158Id(a.id);
      const persona158 = persona158ForAgent(a);
      const model: Agent["model"] = {
        preferredSourceId: ASTRAURA_158_LOCAL_SOURCE_ID,
        ...(persona158 ? { preferredModel: `${ASTRAURA_158_MODEL_PREFIX}${persona158}` } : {}),
      };
      const existing = getAgent(id) ?? safeList(listPersonalAgents).find((x) => x.id === id);
      if (existing) {
        updateAgent(id, { name: a.name, description: (a.role ?? a.area ?? "Agente de Astraura 1.58-bit").slice(0, 240), model: { ...(existing.model ?? {}), ...model } });
        out.updated += 1;
      } else {
        // `createAgent` genera id propio: creamos y renombramos el id al estable vía update no es posible,
        // así que guardamos con el id estable escribiendo el agente completo.
        const created = createAgent({
          name: a.name,
          description: (a.role ?? a.area ?? "Agente de Astraura 1.58-bit").slice(0, 240),
          persona: agent158Persona(a),
          capabilities: capabilities158For(a),
          model,
          icon: a.origin === "vault" ? "Bot" : "Cpu",
          author: "Astraura 1.58-bit",
          visibility: "private",
        });
        // Reasignar id estable (eliminar el temporal y reescribir con id determinista).
        deleteAgent(created.id);
        writeAgentWithId({ ...created, id });
        out.created += 1;
      }
      const cur = getPrimaryChoice("agente", id);
      if (!cur) setPrimaryChoice("agente", id, { modo: "astraura-158", ...(persona158 ? { modelo: `${ASTRAURA_158_MODEL_PREFIX}${persona158}` } : {}) });
      out.ids.push(id);
    } catch (e) {
      out.errors.push(`agente ${a.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/** Escribe un agente personal con un id concreto (la tienda no expone `createAgent` con id). */
function writeAgentWithId(agent: Agent): void {
  let list: Agent[] = [];
  try { const raw = safeGet(AGENTS_KEY); if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) list = parsed as Agent[]; } } catch { list = []; }
  const next = list.filter((a) => a && a.id !== agent.id);
  next.push(agent);
  safeSet(AGENTS_KEY, JSON.stringify(next));
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AGENTS_EVENT)); } catch { /* */ }
}

/** Importa TODO el manifiesto (personalidades + agentes). Nunca lanza. */
export function importAstraura158(manifest: Astraura158Manifest | null | undefined): Astraura158ImportSummary {
  const personalities = importAstraura158Personalities(manifest?.personalities ?? []);
  const agents = importAstraura158Agents(manifest?.agents ?? []);
  return {
    personalities: { created: personalities.created, updated: personalities.updated, ids: personalities.ids },
    agents: { created: agents.created, updated: agents.updated, ids: agents.ids },
    errors: [...personalities.errors, ...agents.errors],
  };
}

/** ¿Ya se sembró en esta cuenta/navegador? */
export function isAstraura158Seeded(): boolean {
  try { return safeGet(ASTRAURA_158_SEED_KEY) === "1"; } catch { return false; }
}

/**
 * Siembra UNA vez: la primera vez que el OS lee un manifiesto válido del backend
 * importa personalidades y agentes. Devuelve el resumen o null si ya estaba sembrado.
 */
export function ensureAstraura158Seeded(manifest: Astraura158Manifest | null | undefined): Astraura158ImportSummary | null {
  if (typeof window === "undefined" || !manifest) return null;
  if (isAstraura158Seeded()) return null;
  const summary = importAstraura158(manifest);
  try { safeSet(ASTRAURA_158_SEED_KEY, "1"); } catch { /* */ }
  return summary;
}

/** Deshace la importación: perfiles `p158-*`, agentes `agent158-*` y sus pines de primario. */
export function removeAstraura158Imports(): { personalities: number; agents: number } {
  let personalities = 0;
  let agents = 0;
  try {
    const list = safeList(listPersonalityProfiles);
    const keep = list.filter((p) => !p.id.startsWith(P158_PREFIX));
    personalities = list.length - keep.length;
    if (personalities > 0) safeSet(PERSONALITY_LIST_KEY, JSON.stringify(keep));
    for (const p of list) if (p.id.startsWith(P158_PREFIX)) setPrimaryChoice("personalidad", p.id, null);
  } catch { /* */ }
  try {
    for (const a of safeList(listPersonalAgents)) {
      if (a.id.startsWith(AGENT158_PREFIX)) { if (deleteAgent(a.id)) agents += 1; setPrimaryChoice("agente", a.id, null); }
    }
  } catch { /* */ }
  try { safeSet(ASTRAURA_158_SEED_KEY, "0"); } catch { /* */ }
  return { personalities, agents };
}
