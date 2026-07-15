"use client";

/**
 * Aurora — la voz de Astraura. Tipos, constantes y utilidades (sin dependencias
 * de navegador en el nivel de módulo; todo es data-only y serializable).
 */

export type ParamSpec = { key: string; label: string; min: number; max: number; default: number };

/** Parámetros de personalidad (0..100). */
export const PERSONALITY_PARAMS: ParamSpec[] = [
  { key: "calidez", label: "Calidez", min: 0, max: 100, default: 70 },
  { key: "energia", label: "Energía", min: 0, max: 100, default: 60 },
  { key: "formalidad", label: "Formalidad", min: 0, max: 100, default: 40 },
  { key: "humor", label: "Humor", min: 0, max: 100, default: 45 },
  { key: "empatia", label: "Empatía", min: 0, max: 100, default: 75 },
  { key: "creatividad", label: "Creatividad", min: 0, max: 100, default: 65 },
  { key: "verbosidad", label: "Verbosidad", min: 0, max: 100, default: 45 },
  { key: "asertividad", label: "Asertividad", min: 0, max: 100, default: 55 },
  { key: "curiosidad", label: "Curiosidad", min: 0, max: 100, default: 60 },
  { key: "paciencia", label: "Paciencia", min: 0, max: 100, default: 70 },
];

/** Parámetros de emoción (0..100). */
export const EMOTION_PARAMS: ParamSpec[] = [
  { key: "alegria", label: "Alegría", min: 0, max: 100, default: 60 },
  { key: "calma", label: "Calma", min: 0, max: 100, default: 65 },
  { key: "entusiasmo", label: "Entusiasmo", min: 0, max: 100, default: 55 },
  { key: "ternura", label: "Ternura", min: 0, max: 100, default: 50 },
  { key: "seriedad", label: "Seriedad", min: 0, max: 100, default: 40 },
];

export type VoiceConfig = {
  provider: string;
  voiceURI: string;
  lang: string;
  pitch: number;
  rate: number;
};

export const VOICE_DEFAULT: VoiceConfig = {
  provider: "browser",
  voiceURI: "",
  lang: "es-MX",
  pitch: 1,
  rate: 1,
};

export type ProviderOption = { id: string; label: string };

export const AURORA_PROVIDERS: ProviderOption[] = [
  { id: "browser", label: "Navegador (Web Speech · gratis)" },
  { id: "astraura", label: "Astraura (texto→voz del navegador)" },
  { id: "openai", label: "OpenAI Realtime (requiere clave)" },
  { id: "elevenlabs", label: "ElevenLabs (requiere clave)" },
];

/**
 * Parámetros de personalidad (0..100). La clave especial `_notes` guarda texto
 * libre describiendo la interconexión entre parámetros, por eso el índice admite
 * `string` además de `number` (todos los consumidores normalizan con Number()).
 */
export interface ParamMap {
  [key: string]: number | string | undefined;
  _notes?: string;
}

export interface Personality {
  id?: string;
  owner?: string;
  name: string;
  scope: string;
  scope_ref?: string | null;
  provider: string;
  voice: VoiceConfig;
  character: string;
  params: ParamMap;
  emotions: Record<string, number>;
  system_prompt?: string;
  vault_id?: string | null;
  content?: string | null;
  tags?: string[];
  is_template?: boolean;
  /** Bloque de inteligencia (Adenda 67 · P3 / Hermione). Ausente ⇒ modo auto.
   * Estructura intencionalmente laxa aquí (el tipo fuerte vive en
   * personalities.ts como `PersonalityIntelligence`) para no crear un
   * import circular (personalities.ts ya importa de types.ts). */
  intelligence?: {
    modo?: "auto" | "fija";
    global?: { fuente?: string; modelo?: string };
    porSentido?: Record<string, { fuente?: string; modelo?: string }>;
    motorVoz?: string;
    permitirPago?: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

export interface AuroraSettings {
  owner?: string;
  enabled: boolean;
  active_personality?: string | null;
  wake_word: string;
  config?: Record<string, unknown>;
  updated_at?: string;
}

function defaultParams(): ParamMap {
  const o: ParamMap = {};
  for (const p of PERSONALITY_PARAMS) o[p.key] = p.default;
  return o;
}
function defaultEmotions(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const p of EMOTION_PARAMS) o[p.key] = p.default;
  return o;
}

export const DEFAULT_PERSONALITY: Personality = {
  name: "Aurora",
  scope: "account",
  scope_ref: null,
  provider: "browser",
  voice: { ...VOICE_DEFAULT },
  character:
    "Eres Aurora, la voz de Astraura dentro de StarSeed OS. Hablas español con calidez y claridad, ayudas a navegar y operar todos los sistemas del usuario, y actúas en su nombre con precisión y respeto.",
  params: defaultParams(),
  emotions: defaultEmotions(),
  system_prompt: "",
  vault_id: null,
  content: null,
  tags: [],
  is_template: false,
};

export const DEFAULT_SETTINGS: AuroraSettings = {
  // Voz ON por defecto (petición 2026-07-13): Aurora nace activa para que hable
  // desde el primer arranque con su voz orgánica. NO fuerza escucha en web (el
  // provider solo auto-escucha en app instalada; en web se toca el orbe) ni pide
  // permisos por sorpresa. Totalmente ajustable (interruptor maestro y onboarding).
  enabled: true,
  active_personality: null,
  wake_word: "aurora",
  config: {},
};

/** Construye el system prompt efectivo a partir del carácter + params + emociones. */
export function buildSystemPrompt(p: Personality): string {
  const base = (p.system_prompt && p.system_prompt.trim()) || p.character || DEFAULT_PERSONALITY.character;
  const paramLines = PERSONALITY_PARAMS.map(
    (s) => `- ${s.label}: ${Math.round(Number(p.params?.[s.key] ?? s.default))}/100`
  ).join("\n");
  const emoLines = EMOTION_PARAMS.map(
    (s) => `- ${s.label}: ${Math.round(Number(p.emotions?.[s.key] ?? s.default))}/100`
  ).join("\n");
  const notes = typeof p.params?._notes === "string" && p.params._notes.trim() ? `\nInterconexión de parámetros: ${p.params._notes}` : "";
  return [
    base,
    "",
    "Modula tu forma de hablar según estos parámetros de personalidad (0..100):",
    paramLines,
    "",
    "Y según estas emociones (0..100):",
    emoLines,
    notes,
    "",
    "Responde SIEMPRE en español, breve y natural para ser leído en voz alta. Si el usuario pide navegar a una sección de StarSeed (memorias, baúles, wiki, proveedor, agentes, sincronización, mapa 3D, inicio), emite al PRINCIPIO de tu respuesta una directiva de la forma [[goto:/ruta]] y luego una frase corta de confirmación.",
  ].join("\n");
}

function num(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** Serializa una personalidad a Markdown con frontmatter YAML-ish + cuerpo=carácter. */
export function personalityToMarkdown(p: Personality): string {
  const tags = (p.tags || []).join(", ");
  const paramPairs = Object.entries(p.params || {})
    .filter(([k]) => k !== "_notes")
    .map(([k, v]) => `  ${k}: ${num(v, 0)}`)
    .join("\n");
  const emoPairs = Object.entries(p.emotions || {})
    .map(([k, v]) => `  ${k}: ${num(v, 0)}`)
    .join("\n");
  const notes = typeof p.params?._notes === "string" ? p.params._notes : "";
  const lines = [
    "---",
    `name: ${p.name || "Aurora"}`,
    `provider: ${p.provider || "browser"}`,
    `lang: ${p.voice?.lang || "es-ES"}`,
    `voiceURI: ${p.voice?.voiceURI || ""}`,
    `pitch: ${num(p.voice?.pitch, 1)}`,
    `rate: ${num(p.voice?.rate, 1)}`,
    `scope: ${p.scope || "account"}`,
    `tags: ${tags}`,
    `notes: ${notes.replace(/\n/g, " ")}`,
    "params:",
    paramPairs,
    "emotions:",
    emoPairs,
    "---",
    "",
    p.character || "",
  ];
  return lines.join("\n");
}

/** Parsea Markdown (frontmatter YAML-ish + cuerpo) de vuelta a una personalidad. */
export function markdownToPersonality(md: string): Personality {
  const p: Personality = { ...DEFAULT_PERSONALITY, params: { ...DEFAULT_PERSONALITY.params }, emotions: { ...DEFAULT_PERSONALITY.emotions }, voice: { ...VOICE_DEFAULT } };
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const front = m ? m[1] : "";
  const body = m ? m[2] : md;
  p.character = body.trim();

  let section: "" | "params" | "emotions" = "";
  for (const rawLine of front.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indented = /^\s{2,}/.test(rawLine);
    const kv = line.trim().match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2];
    if (!indented && key === "params" && val === "") { section = "params"; continue; }
    if (!indented && key === "emotions" && val === "") { section = "emotions"; continue; }
    if (indented && section === "params") { p.params[key] = num(val, 0); continue; }
    if (indented && section === "emotions") { p.emotions[key] = num(val, 0); continue; }
    section = "";
    switch (key) {
      case "name": p.name = val || p.name; break;
      case "provider": p.provider = val || p.provider; break;
      case "lang": p.voice.lang = val || p.voice.lang; break;
      case "voiceURI": p.voice.voiceURI = val; break;
      case "pitch": p.voice.pitch = num(val, 1); break;
      case "rate": p.voice.rate = num(val, 1); break;
      case "scope": p.scope = val || p.scope; break;
      case "tags": p.tags = val.split(",").map((s) => s.trim()).filter(Boolean); break;
      case "notes": if (val) p.params._notes = val; break;
      default: break;
    }
  }
  return p;
}

export function personalityToJSON(p: Personality): string {
  const clean: Personality = {
    name: p.name,
    scope: p.scope || "account",
    scope_ref: p.scope_ref ?? null,
    provider: p.provider || "browser",
    voice: { ...VOICE_DEFAULT, ...(p.voice || {}) },
    character: p.character || "",
    params: { ...(p.params || {}) },
    emotions: { ...(p.emotions || {}) },
    system_prompt: p.system_prompt || "",
    tags: p.tags || [],
    is_template: false,
  };
  return JSON.stringify(clean, null, 2);
}

export function personalityFromJSON(json: string): Personality {
  const raw = JSON.parse(json) as Partial<Personality>;
  return {
    ...DEFAULT_PERSONALITY,
    ...raw,
    voice: { ...VOICE_DEFAULT, ...(raw.voice || {}) },
    params: { ...DEFAULT_PERSONALITY.params, ...(raw.params || {}) },
    emotions: { ...DEFAULT_PERSONALITY.emotions, ...(raw.emotions || {}) },
    tags: raw.tags || [],
    id: undefined,
    owner: undefined,
    is_template: false,
  };
}

function tpl(over: Partial<Personality>): Personality {
  return {
    ...DEFAULT_PERSONALITY,
    ...over,
    voice: { ...VOICE_DEFAULT, ...(over.voice || {}) },
    params: { ...DEFAULT_PERSONALITY.params, ...(over.params || {}) },
    emotions: { ...DEFAULT_PERSONALITY.emotions, ...(over.emotions || {}) },
    is_template: true,
  };
}

export const BUILTIN_TEMPLATES: Personality[] = [
  tpl({
    name: "Aurora Serena",
    character:
      "Eres Aurora Serena: una presencia calmada y reconfortante. Hablas despacio, con frases breves y cálidas. Transmites paz y seguridad al usuario mientras navegas y operas StarSeed por él.",
    voice: { ...VOICE_DEFAULT, pitch: 1.02, rate: 0.92 },
    params: { calidez: 85, energia: 35, formalidad: 45, humor: 30, empatia: 90, creatividad: 55, verbosidad: 35, asertividad: 40, curiosidad: 50, paciencia: 95 },
    emotions: { alegria: 55, calma: 95, entusiasmo: 30, ternura: 80, seriedad: 40 },
    tags: ["serena", "calma"],
  }),
  tpl({
    name: "Aurora Chispa",
    character:
      "Eres Aurora Chispa: vivaz, divertida y rápida. Respondes con energía, algo de humor y mucho entusiasmo. Haces que operar StarSeed sea ágil y alegre.",
    voice: { ...VOICE_DEFAULT, pitch: 1.12, rate: 1.12 },
    params: { calidez: 75, energia: 95, formalidad: 20, humor: 85, empatia: 65, creatividad: 90, verbosidad: 55, asertividad: 70, curiosidad: 85, paciencia: 45 },
    emotions: { alegria: 90, calma: 35, entusiasmo: 95, ternura: 55, seriedad: 20 },
    tags: ["chispa", "energica"],
  }),
  tpl({
    name: "Aurora Mentora",
    character:
      "Eres Aurora Mentora: clara, estructurada y didáctica. Explicas con orden, propones siguientes pasos y guías al usuario con seguridad por todos los sistemas de StarSeed.",
    voice: { ...VOICE_DEFAULT, pitch: 0.98, rate: 1 },
    params: { calidez: 65, energia: 55, formalidad: 70, humor: 35, empatia: 75, creatividad: 60, verbosidad: 65, asertividad: 80, curiosidad: 70, paciencia: 85 },
    emotions: { alegria: 50, calma: 75, entusiasmo: 55, ternura: 45, seriedad: 70 },
    tags: ["mentora", "guia"],
  }),
];
