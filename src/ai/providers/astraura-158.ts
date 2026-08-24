/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT — proveedor PRIMARIO de inteligencia (Adenda 153)
 * ---------------------------------------------------------------------------
 * Adaptador del backend soberano `StarSeedSystem/astraura` (FastAPI, BitNet
 * b1.58 / Ollama local, personalidades, agentes, habilidades, cerebros) al
 * contrato `Provider` del OS. SOP: `architecture/astraura-158-sistema-primario.md`.
 *
 * Contrato del backend (verificado en `backend/app/main.py` 2026-08-22):
 *   · POST /api/starseed/chat   {messages[], persona_id?, preferences?}  (puente nuevo, §9 del SOP)
 *   · POST /api/chat/stream     {prompt, system_prompt, preferences}        (backend clásico)
 *     → SSE `data: {json}\n\n` con eventos `branching_plan` · `agent_traces` ·
 *       `multi_personality_start` · `token{token}` · `done{full_text}`.
 *   · POST /api/chat            (sin stream) → {response}
 *   · GET  /api/personalities   → {personalities[{id,name,…}], active_persona}
 *
 * El backend es SINGLE-TURN (Ollama `/api/generate` con `system` + `prompt`):
 * este adaptador transcribe el historial dentro de `prompt` y manda el
 * system prompt del OS (personalidad compilada, contexto, skills…) como
 * `system_prompt`, que MANDA sobre la identidad interna del backend.
 *
 * Funciones puras (testeables sin red): `buildAstraura158Prompt`,
 * `parseAstrauraSseLine`, `persona158For`, `modelToPersona158`,
 * `detectMentions158`, `collectAstraura158Event`, `readAstraura158Sse`.
 * Los errores HTTP llevan el código en el mensaje (`error 503`) para que el
 * router aplique cooldown/dead-source con sus regex de siempre.
 *
 * TRAZAS (Adenda 154): además de `token`/`done`, el lector SSE recoge el plan
 * de ramificación (`branching_plan`), las trazas de agentes y ejecuciones de
 * herramientas (`agent_traces`) y las personalidades que intervienen
 * (`multi_personality_start`, `done.personalities_involved`) y las devuelve en
 * `ChatResponse.raw.astraura158` para la transparencia del modal «Ver proceso».
 * MENCIONES: `@Hermes`, `@Logos`… en el último mensaje del usuario seleccionan
 * personalidades 1.58 (`preferences.selected_personalities`) y el modo
 * multi-personalidad (`single` · `multi_dialogue` · `coral_synthesis`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  DecryptedProviderConfig,
  Provider,
  ProviderInfo,
} from "./types";

/* ───────────────────── Personalidades 1.58 (modelos de la fuente) ───────────────────── */

export const ASTRAURA_158_MODEL_PREFIX = "astraura-158/";
export const ASTRAURA_158_DEFAULT_BASE = "http://127.0.0.1:8000";
export const ASTRAURA_158_AUTO_MODEL = `${ASTRAURA_158_MODEL_PREFIX}auto`;

export interface Astraura158Persona {
  id: string;
  label: string;
  /** Órgano cognitivo / especialidad (etiqueta humana). */
  organ: string;
  /** Color propio de la personalidad en el frontend 1.58. */
  color: string;
}

/** Presets del backend (`personality_engine.py` + `PersonalitiesView.jsx`). */
export const ASTRAURA_158_PERSONAS: Astraura158Persona[] = [
  { id: "astraura_prime", label: "Astraura Prime (Génesis)", organ: "Núcleo holístico y coordinación", color: "#00f0ff" },
  { id: "aurora", label: "Aurora", organ: "Voz viva y afectiva de StarSeed OS", color: "#ec4899" },
  { id: "hermione", label: "Hermione", organ: "Puente con el OS, terminal y archivos", color: "#38bdf8" },
  { id: "hephaestus", label: "Hephaestus", organ: "Forja de hardware, C++/SIMD y código", color: "#f59e0b" },
  { id: "hermes", label: "Hermes", organ: "Exploración web y verificación", color: "#10b981" },
  { id: "atenea", label: "Atenea", organ: "Seguridad, auditoría y permisos", color: "#8b5cf6" },
  { id: "oneiros", label: "Oneiros", organ: "Creatividad onírica, shaders y 3D", color: "#d946ef" },
  { id: "kallisti", label: "Kallisti", organ: "Musa ciberdélica y poética", color: "#f43f5e" },
  { id: "mnemosyne", label: "Mnemosyne", organ: "Memoria, grafos y exocórtex", color: "#a855f7" },
  { id: "logos", label: "Logos", organ: "Razón pura y lógica ternaria", color: "#3b82f6" },
];

const PERSONA_IDS = new Set(ASTRAURA_158_PERSONAS.map((p) => p.id));

/** `astraura-158/<persona>` → `<persona>`; `auto`/desconocido → undefined. */
export function modelToPersona158(modelId: string | undefined | null): string | undefined {
  const raw = String(modelId ?? "").trim();
  const id = raw.startsWith(ASTRAURA_158_MODEL_PREFIX) ? raw.slice(ASTRAURA_158_MODEL_PREFIX.length) : raw;
  if (!id || id === "auto") return undefined;
  return PERSONA_IDS.has(id) ? id : undefined;
}

/**
 * Deduce la personalidad 1.58 más afín a una personalidad del OS por su nombre
 * (y, si existe, por un id explícito `persona158`). Pura y tolerante.
 *   Aurora → aurora · Hermione → hermione · poeta/ciberdélica → kallisti ·
 *   analista/precisa/lógica → logos · guardiana/serena/seguridad → atenea ·
 *   exploradora/curiosa/web → hermes · mentora/sabia/memoria → mnemosyne ·
 *   cómplice/creativa/sueños → oneiros · forja/hardware/código → hephaestus ·
 *   resto → astraura_prime.
 */
export function persona158For(persona: { id?: string; name?: string; persona158?: string } | null | undefined): string {
  if (!persona) return "astraura_prime";
  const explicit = String(persona.persona158 ?? "").trim();
  if (explicit && PERSONA_IDS.has(explicit)) return explicit;
  const n = `${persona.id ?? ""} ${persona.name ?? ""}`.toLowerCase();
  if (/hermione/.test(n)) return "hermione";
  if (/aurora/.test(n)) return "aurora";
  if (/kallisti|poeta|ciberd[eé]lic/.test(n)) return "kallisti";
  if (/logos|analista|precis|l[oó]gic/.test(n)) return "logos";
  if (/atenea|athena|guardian|seren|segurid/.test(n)) return "atenea";
  if (/hermes|explorador|curios|web/.test(n)) return "hermes";
  if (/mnemosyne|mentor|sabi|memoria/.test(n)) return "mnemosyne";
  if (/oneiros|c[oó]mplice|creativ|sue[ñn]o|oniric/.test(n)) return "oneiros";
  if (/hephaestus|hefesto|forja|hardware|c[oó]digo|ingenier/.test(n)) return "hephaestus";
  return "astraura_prime";
}

/* ───────────────────── Menciones @persona (modo multi-personalidad) ───────────────────── */

/** Modo multi-personalidad del backend (`preferences.multi_personality_mode`). */
export type Astraura158MultiMode = "single" | "multi_dialogue" | "coral_synthesis";

export interface Astraura158Mentions {
  /** Ids 1.58 mencionados, en orden de aparición y sin duplicados. */
  personas: string[];
  /** `coral` en el texto ⇒ coral_synthesis · ≥2 menciones ⇒ multi_dialogue · si no, single. */
  mode: Astraura158MultiMode;
}

/** Minúsculas sin acentos/diacríticos (comparaciones tolerantes). */
function foldText(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Tabla alias → id 1.58 (ids, etiquetas del catálogo y alias habituales del
 * backend: hefesto/hefestos → hephaestus, athena → atenea, genesis/prime →
 * astraura_prime). Se construye una vez a partir de `ASTRAURA_158_PERSONAS`.
 */
const MENTION_ALIASES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const p of ASTRAURA_158_PERSONAS) {
    out[foldText(p.id)] = p.id;
    // Palabras de la etiqueta ("Astraura Prime (Génesis)" → astraura · prime · genesis).
    for (const w of foldText(p.label).split(/[^a-z0-9_]+/)) if (w.length >= 3) out[w] ??= p.id;
  }
  Object.assign(out, {
    hefesto: "hephaestus", hefestos: "hephaestus", athena: "atenea", genesis: "astraura_prime", prime: "astraura_prime",
  });
  return out;
})();

/**
 * Detecta menciones `@Hermes`, `@Logos`, `@hefesto`… (insensible a mayúsculas y
 * acentos) contra ids/etiquetas de `ASTRAURA_158_PERSONAS`. Pura.
 *   · «coral» en el texto ⇒ `coral_synthesis` (síntesis coral del enjambre);
 *   · ≥2 personalidades mencionadas ⇒ `multi_dialogue`;
 *   · si no ⇒ `single` (con 0 o 1 mención).
 */
export function detectMentions158(text: string): Astraura158Mentions {
  const src = String(text ?? "");
  const personas: string[] = [];
  // `@` precedido de letra/número es un correo (alex@hermes.org), no una mención.
  const rx = /(?<![\p{L}\p{N}])@([\p{L}\p{N}_.-]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src)) !== null) {
    const key = foldText(m[1]).replace(/[._-]+$/, "");
    const id = MENTION_ALIASES[key];
    if (id && !personas.includes(id)) personas.push(id);
  }
  const coral = /\bcoral\b/.test(foldText(src));
  const mode: Astraura158MultiMode = coral ? "coral_synthesis" : personas.length >= 2 ? "multi_dialogue" : "single";
  return { personas, mode };
}

/* ───────────────────── Prompt (transcripción single-turn) ───────────────────── */

export interface Astraura158Prompt {
  system_prompt: string;
  prompt: string;
}

/** Presupuesto de caracteres del historial (contexto 4096 tokens del backend). */
const HISTORY_BUDGET_CHARS = 9000;

/**
 * Convierte `messages[]` (system/user/assistant) en `{system_prompt, prompt}`.
 * El backend es single-turn: el historial viaja como transcripción acotada
 * (se recortan los turnos MÁS ANTIGUOS) y el último mensaje del usuario se
 * marca explícitamente. Sin historial, `prompt` es el texto tal cual.
 */
export function buildAstraura158Prompt(messages: ChatMessage[]): Astraura158Prompt {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content.trim()).filter(Boolean).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");
  if (!turns.length) return { system_prompt: system, prompt: "" };
  const last = turns[turns.length - 1];
  const lastUser = last.role === "user" ? last.content : "";
  const history = last.role === "user" ? turns.slice(0, -1) : turns;
  if (!history.length) return { system_prompt: system, prompt: lastUser.trim() };

  const lines: string[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    const who = m.role === "user" ? "Usuario" : "Astraura";
    const line = `${who}: ${m.content.trim()}`;
    if (used + line.length > HISTORY_BUDGET_CHARS) break;
    lines.unshift(line);
    used += line.length + 1;
  }
  const transcript = lines.join("\n");

  // ── Adenda 159 · POR QUÉ el historial va en `system_prompt` y NO en `prompt` ──
  // El backend soberano decide con COINCIDENCIA DE SUBCADENA sobre `prompt` si
  // responde con una plantilla determinista («¿quién eres?», «¿cómo funciona tu
  // sistema?»…) en lugar de invocar al modelo. Mientras aquí se aplanaba TODA la
  // conversación dentro de `prompt`, bastaba que esas palabras hubieran aparecido
  // UNA vez —incluso en una respuesta anterior de la propia IA— para que cada
  // mensaje siguiente volviera a disparar la misma plantilla: un bucle que se
  // reforzaba solo y hacía que el chat contestara siempre lo mismo dijeras lo que
  // dijeras. Reproducido y verificado contra el backend real.
  //
  // El historial es CONTEXTO, no la pregunta. Va al `system_prompt`, que el
  // backend no escanea; `prompt` lleva SOLO el último mensaje del usuario, que es
  // lo que de verdad hay que responder. El modelo sigue recibiendo ambas cosas.
  if (lastUser) {
    const withHistory = [
      system,
      `[TRANSCRIPCIÓN DE LA CONVERSACIÓN HASTA AHORA]\nResponde SOLO al último mensaje del usuario, sin repetir la transcripción.\n${transcript}`,
    ].filter(Boolean).join("\n\n");
    return { system_prompt: withHistory, prompt: lastUser.trim() };
  }
  return {
    system_prompt: system,
    prompt: `Transcripción de la conversación hasta ahora. Continúa de forma natural:\n${transcript}`,
  };
}

/* ───────────────────── SSE ───────────────────── */

export interface Astraura158Event {
  type: string;
  token?: string;
  full_text?: string;
  [k: string]: unknown;
}

/** `data: {json}` → evento; líneas vacías/comentarios/`[DONE]`/JSON roto → null. */
export function parseAstrauraSseLine(line: string): Astraura158Event | null {
  const t = line.trim();
  if (!t || t.startsWith(":")) return null;
  const payload = t.startsWith("data:") ? t.slice(5).trim() : t;
  if (!payload || payload === "[DONE]") return null;
  try {
    const obj = JSON.parse(payload) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const ev = obj as Astraura158Event;
    return typeof ev.type === "string" ? ev : null;
  } catch {
    return null;
  }
}

/** Normaliza la base: sin barra final; admite rutas relativas (`/api/ai/astraura-158`). */
export function normalizeAstraura158Base(baseUrl: string | undefined | null): string {
  const b = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  return b || ASTRAURA_158_DEFAULT_BASE;
}

/* ───────────────────── Trazas del enjambre (plan · agentes · herramientas) ───────────────────── */

/** Traza de un agente/rama del ciclo paralelo (`agent_traces.traces[]`). */
export interface Astraura158Trace {
  agent: string;
  color?: string;
  thoughts: string[];
}

/** Ejecución de una herramienta del ciclo (`agent_traces.tool_executions[]`). */
export interface Astraura158ToolExecution {
  tool: string;
  target?: string;
  success?: boolean;
  summary?: string;
}

/** Personalidad que intervino (de `multi_personality_start`, `agent_traces` o `done`). */
export interface Astraura158PersonaRef {
  id?: string;
  name: string;
  color?: string;
}

/** Lo que el lector SSE recoge además del texto (transparencia del turno). */
export interface Astraura158Collected {
  /** Plan de ramificación tal cual lo emite el backend (`branching_plan.plan`). */
  plan?: unknown;
  traces: Astraura158Trace[];
  tools: Astraura158ToolExecution[];
  personalities: Astraura158PersonaRef[];
}

export function emptyAstraura158Collected(): Astraura158Collected {
  return { traces: [], tools: [], personalities: [] };
}

/** ¿Hay algo que mostrar? (plan, trazas, herramientas o personalidades). */
export function hasAstraura158Collected(c: Astraura158Collected | null | undefined): boolean {
  return !!c && (c.plan != null || c.traces.length > 0 || c.tools.length > 0 || c.personalities.length > 0);
}

function strOf(v: unknown, max = 400): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

function strList(v: unknown, max = 12): string[] {
  if (typeof v === "string") return strOf(v) ? [strOf(v)!] : [];
  if (!Array.isArray(v)) return [];
  return v.map((x) => strOf(x)).filter((x): x is string => !!x).slice(0, max);
}

/** Normaliza una referencia a personalidad (id/nombre suelto u objeto). */
function toPersonaRef(raw: unknown): Astraura158PersonaRef | null {
  if (typeof raw === "string") {
    const key = foldText(raw);
    const known = ASTRAURA_158_PERSONAS.find((p) => p.id === key || foldText(p.label) === key) ??
      ASTRAURA_158_PERSONAS.find((p) => MENTION_ALIASES[key] === p.id);
    if (known) return { id: known.id, name: known.label, color: known.color };
    const name = strOf(raw, 80);
    return name ? { name } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = strOf(o.id, 64);
  const name = strOf(o.name, 80) ?? (id ? ASTRAURA_158_PERSONAS.find((p) => p.id === id)?.label ?? id : undefined);
  if (!name) return null;
  const color = strOf(o.color, 32) ?? (id ? ASTRAURA_158_PERSONAS.find((p) => p.id === id)?.color : undefined);
  return { ...(id ? { id } : {}), name, ...(color ? { color } : {}) };
}

function mergePersonas(acc: Astraura158Collected, list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    const ref = toPersonaRef(item);
    if (!ref) continue;
    const key = foldText(ref.id ?? ref.name);
    const existing = acc.personalities.find((p) => foldText(p.id ?? p.name) === key || (ref.id && p.id === ref.id));
    if (existing) {
      if (!existing.id && ref.id) existing.id = ref.id;
      if (!existing.color && ref.color) existing.color = ref.color;
      continue;
    }
    if (acc.personalities.length < 16) acc.personalities.push(ref);
  }
}

/**
 * Pliega UN evento SSE en el acumulador de trazas (muta `acc`; pura respecto
 * a la red). Ignora `token`/`error` y eventos desconocidos. Tolerante con
 * formas parciales (strings sueltos, campos ausentes).
 */
export function collectAstraura158Event(acc: Astraura158Collected, ev: Astraura158Event): void {
  if (!ev || typeof ev !== "object") return;
  switch (ev.type) {
    case "branching_plan": {
      if (ev.plan != null) acc.plan = ev.plan;
      mergePersonas(acc, ev.active_personalities);
      return;
    }
    case "agent_traces": {
      if (Array.isArray(ev.traces)) {
        for (const t of ev.traces) {
          if (!t || typeof t !== "object") continue;
          const o = t as Record<string, unknown>;
          const agent = strOf(o.agent, 120) ?? strOf(o.name, 120);
          if (!agent) continue;
          const thoughts = strList(o.thoughts ?? o.thought, 12);
          const color = strOf(o.color, 32);
          const prev = acc.traces.find((x) => x.agent === agent);
          if (prev) {
            for (const th of thoughts) if (!prev.thoughts.includes(th) && prev.thoughts.length < 12) prev.thoughts.push(th);
            if (!prev.color && color) prev.color = color;
          } else if (acc.traces.length < 24) {
            acc.traces.push({ agent, ...(color ? { color } : {}), thoughts });
          }
        }
      }
      if (Array.isArray(ev.tool_executions)) {
        for (const x of ev.tool_executions) {
          if (!x || typeof x !== "object") continue;
          const o = x as Record<string, unknown>;
          const tool = strOf(o.tool, 80) ?? strOf(o.name, 80);
          if (!tool || acc.tools.length >= 32) continue;
          const target = strOf(o.target, 200);
          const summary = strOf(o.summary, 300);
          acc.tools.push({
            tool,
            ...(target ? { target } : {}),
            ...(typeof o.success === "boolean" ? { success: o.success } : {}),
            ...(summary ? { summary } : {}),
          });
        }
      }
      mergePersonas(acc, ev.participating_personalities);
      return;
    }
    case "multi_personality_start":
      mergePersonas(acc, ev.personalities);
      return;
    case "done":
      mergePersonas(acc, ev.personalities_involved);
      return;
    default:
      return;
  }
}

/** Extrae trazas de una respuesta JSON no-stream (`/api/chat` clásico o proxy que tamponó). */
export function collectAstraura158FromJson(json: Record<string, unknown> | null | undefined): Astraura158Collected {
  const acc = emptyAstraura158Collected();
  if (!json) return acc;
  if (json.branching_plan != null) collectAstraura158Event(acc, { type: "branching_plan", plan: json.branching_plan });
  if (Array.isArray(json.agent_traces) || Array.isArray(json.tool_executions)) {
    collectAstraura158Event(acc, { type: "agent_traces", traces: json.agent_traces, tool_executions: json.tool_executions });
  }
  if (Array.isArray(json.personalities_involved)) collectAstraura158Event(acc, { type: "done", personalities_involved: json.personalities_involved });
  return acc;
}

/** Forma de `ChatResponse.raw` que devuelve este proveedor. */
export interface Astraura158Raw {
  astraura158: Astraura158Collected;
  /** Personalidad 1.58 principal del turno. */
  persona: string;
  /** Base del backend que respondió. */
  backend: string;
  /** Nº de eventos SSE leídos (0 en respuestas JSON). */
  events: number;
  /** Ids de personalidades que intervinieron según `done` (compatibilidad). */
  personalities_involved?: unknown;
  /** Modo multi-personalidad enviado (si hubo menciones). */
  mode?: Astraura158MultiMode;
}

/* ───────────────────── Provider ───────────────────── */

const info: ProviderInfo = {
  id: "astraura-158",
  label: "Astraura 1.58-bit",
  description:
    "Sistema primario soberano de StarSeed OS: backend Astraura (BitNet b1.58 / motor local) con personalidades, agentes, habilidades y cerebros. Local (127.0.0.1:8000), túnel, LAN o nube propia.",
  requiresKey: false,
  local: true,
  defaultBaseUrl: ASTRAURA_158_DEFAULT_BASE,
  defaultModels: [ASTRAURA_158_AUTO_MODEL, ...ASTRAURA_158_PERSONAS.map((p) => `${ASTRAURA_158_MODEL_PREFIX}${p.id}`)],
};

export interface ChatPreferences {
  personaId: string;
  selected_personalities: string[];
  multi_personality_mode: Astraura158MultiMode;
  response_style: string;
  max_length_chars?: number;
  web_data_enabled: boolean;
  temperature?: number;
  /** Marca de origen para el backend (telemetría honesta). */
  client: "starseed-os";
}

function preferencesFor(persona: string, options: ChatOptions): ChatPreferences {
  const prefs: ChatPreferences = {
    personaId: persona,
    selected_personalities: [persona],
    multi_personality_mode: "single",
    response_style: "analytical",
    web_data_enabled: true,
    client: "starseed-os",
  };
  if (typeof options.maxTokens === "number" && options.maxTokens > 0) prefs.max_length_chars = Math.max(500, Math.round(options.maxTokens * 4));
  if (typeof options.temperature === "number") prefs.temperature = options.temperature;
  return prefs;
}

/**
 * Aplica las MENCIONES del último mensaje a las preferencias (pura).
 *   · sin menciones ⇒ sin cambios;
 *   · `single` con UNA mención ⇒ esa personalidad lidera el turno (es lo que
 *     significa «@Hermes busca…»): `personaId` y `selected_personalities`
 *     pasan a ser la mencionada;
 *   · `multi_dialogue` / `coral_synthesis` ⇒ la personalidad del modelo va
 *     PRIMERA si no fue mencionada, seguida de las mencionadas.
 * Devuelve también la personalidad principal efectiva del turno.
 */
export function applyMentions158(
  prefs: ChatPreferences,
  persona: string,
  mentions: Astraura158Mentions,
): { prefs: ChatPreferences; persona: string } {
  if (!mentions.personas.length) return { prefs, persona };
  if (mentions.mode === "single") {
    const lead = mentions.personas[0];
    return { prefs: { ...prefs, personaId: lead, selected_personalities: [lead], multi_personality_mode: "single" }, persona: lead };
  }
  const selected = mentions.personas.includes(persona) ? [...mentions.personas] : [persona, ...mentions.personas];
  return {
    prefs: { ...prefs, personaId: persona, selected_personalities: selected, multi_personality_mode: mentions.mode },
    persona,
  };
}

/** Nota corta para el system prompt cuando hay menciones (el backend single-turn no ve la transcripción). */
export function mentionsSystemNote(mentions: Astraura158Mentions, persona: string): string {
  if (!mentions.personas.length) return "";
  const label = (id: string) => {
    const p = ASTRAURA_158_PERSONAS.find((x) => x.id === id);
    return p ? `${p.label} (${p.organ})` : id;
  };
  if (mentions.mode === "single") {
    return `[MENCIÓN 1.58] El usuario invoca a ${label(persona)}: responde en este turno desde esa personalidad y su especialidad.`;
  }
  const names = mentions.personas.map(label).join(" · ");
  return mentions.mode === "coral_synthesis"
    ? `[MODO CORAL 1.58] Intervienen en síntesis coral: ${names}. Integra sus perspectivas en una sola respuesta coherente.`
    : `[DIÁLOGO MULTI-PERSONALIDAD 1.58] Intervienen por turnos: ${names}. Cada una responde desde su especialidad, breve y sin repetir a las demás.`;
}

/** Resultado del lector SSE (texto + telemetría + trazas del enjambre). */
export interface Astraura158SseResult {
  text: string;
  events: number;
  involved?: unknown;
  collected: Astraura158Collected;
}

/**
 * Lee el stream SSE del backend: acumula `token`, toma `done.full_text` como
 * respaldo, lanza en `error` y RECOGE plan/trazas/herramientas/personalidades
 * en `collected` (`collectAstraura158Event`). Exportada para tests (con un
 * `Response` de `ReadableStream`).
 */
export async function readAstraura158Sse(res: Response, onChunk?: (delta: string) => void): Promise<Astraura158SseResult> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Astraura 1.58 error: respuesta sin cuerpo.");
  const decoder = new TextDecoder();
  const collected = emptyAstraura158Collected();
  let buffer = "";
  let acc = "";
  let full: string | undefined;
  let events = 0;
  let involved: unknown;
  const handle = (ev: Astraura158Event) => {
    events++;
    if (ev.type === "token" && typeof ev.token === "string" && ev.token) {
      acc += ev.token;
      onChunk?.(ev.token);
    } else if (ev.type === "done") {
      if (typeof ev.full_text === "string" && ev.full_text.trim()) full = ev.full_text;
      if (ev.personalities_involved) involved = ev.personalities_involved;
      collectAstraura158Event(collected, ev);
    } else if (ev.type === "error" && typeof ev.message === "string") {
      throw new Error(`Astraura 1.58 error: ${ev.message}`);
    } else {
      collectAstraura158Event(collected, ev);
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const ev = parseAstrauraSseLine(line);
      if (ev) handle(ev);
    }
  }
  buffer += decoder.decode();
  const tail = parseAstrauraSseLine(buffer);
  if (tail) handle(tail);
  // El texto emitido por tokens manda (lo que el usuario ya vio); `full_text`
  // solo cubre el caso de un backend que no emitió tokens (p.ej. respuesta
  // determinista) — evita duplicar lo ya entregado vía onChunk.
  const text = acc.trim() ? acc : (full ?? "");
  return { text, events, involved, collected };
}

/** Último mensaje del usuario (para detectar menciones solo en el turno actual). */
function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
  return "";
}

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function chat(
  config: DecryptedProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ChatResponse> {
  const base = normalizeAstraura158Base(config.baseUrl || info.defaultBaseUrl);
  const modelPersona = modelToPersona158(options.model) ?? "astraura_prime";
  // Menciones @persona SOLO del turno actual (el historial no re-selecciona).
  // El `prompt` viaja con el texto crudo (las menciones no se recortan).
  const mentions = detectMentions158(lastUserText(messages));
  const applied = applyMentions158(preferencesFor(modelPersona, options), modelPersona, mentions);
  const persona = applied.persona;
  const preferences = applied.prefs;
  const built = buildAstraura158Prompt(messages);
  if (!built.prompt.trim()) throw new Error("Astraura 1.58 error: no hay mensaje del usuario.");
  const note = mentionsSystemNote(mentions, persona);
  const systemPrompt = note ? [built.system_prompt, note].filter(Boolean).join("\n\n") : built.system_prompt;

  // 1) Puente nuevo (mensajes estructurados; el backend transcribe). 404/405 ⇒ backend antiguo.
  let res: Response | null = null;
  try {
    res = await postJson(`${base}/api/starseed/chat`, {
      messages,
      persona_id: persona,
      preferences,
      system_prompt: systemPrompt,
      stream: true,
    }, options.signal);
    if (res.status === 404 || res.status === 405) res = null;
  } catch (e) {
    if (options.signal?.aborted) throw e;
    res = null;
  }
  // 2) Backend clásico: /api/chat/stream (prompt + system_prompt + preferences).
  if (!res) {
    res = await postJson(`${base}/api/chat/stream`, {
      prompt: built.prompt,
      system_prompt: systemPrompt,
      preferences,
    }, options.signal);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Astraura 1.58 error ${res.status}: ${(text || res.statusText).slice(0, 300)}`);
  }
  const mode = mentions.personas.length ? preferences.multi_personality_mode : undefined;
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("application/json")) {
    // Respuesta no-stream (p.ej. proxy que tamponó): {response|full_text|text}
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const text = String(json?.response ?? json?.full_text ?? json?.text ?? "");
    if (text && options.onChunk) options.onChunk(text);
    const raw: Astraura158Raw & { json?: Record<string, unknown> } = {
      astraura158: collectAstraura158FromJson(json),
      persona,
      backend: base,
      events: 0,
      personalities_involved: json?.personalities_involved,
      ...(mode ? { mode } : {}),
      ...(json ? { json } : {}),
    };
    return { text, raw };
  }
  const out = await readAstraura158Sse(res, options.onChunk);
  const raw: Astraura158Raw = {
    astraura158: out.collected,
    persona,
    backend: base,
    events: out.events,
    personalities_involved: out.involved,
    ...(mode ? { mode } : {}),
  };
  return { text: out.text, raw };
}

async function listModels(config: DecryptedProviderConfig): Promise<string[]> {
  const base = normalizeAstraura158Base(config.baseUrl || info.defaultBaseUrl);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${base}/api/personalities`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`Astraura 1.58 list models failed (${res.status})`);
    const json = (await res.json()) as { personalities?: { id?: string }[] };
    const ids = (json.personalities ?? []).map((p) => String(p.id ?? "")).filter(Boolean);
    return [ASTRAURA_158_AUTO_MODEL, ...ids.map((id) => `${ASTRAURA_158_MODEL_PREFIX}${id}`)];
  } catch {
    return [...info.defaultModels];
  }
}

export const astraura158Provider: Provider = { info, chat, listModels };
