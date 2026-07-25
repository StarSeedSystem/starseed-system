"use client";

/**
 * Personalidades de Aurora — DOS sistemas conviven en este módulo:
 *
 * 1) LEGADO (abajo, sin cambios): CRUD sobre Supabase (`aurora_personalities`,
 *    RLS por owner) con el tipo `Personality` de ./types. Lo usa engine.ts.
 *
 * 2) NUEVO (Adenda 63 §11 — architecture/centro-creacion-sync-permisos.md):
 *    `PersonalityProfile` — personalidades como ARCHIVOS de configuración
 *    (JSON) compartibles/replicables/instalables (Biblioteca) y elegibles POR
 *    CONTEXTO (global · sección política/educación/cultura · chat · cerebro),
 *    con NIVELADORES 0-100 por grupos, compilador a system prompt de Astraura
 *    y mapeo a modulación de voz (evento `starseed:aurora-voice-style`).
 *    Persistencia local-first:
 *      · lista        `starseed.aurora.personalities.v1`
 *      · asignaciones `starseed.aurora.personality.active.v1`
 *    Todo SSR-safe y defensivo: sin window devuelve defaults y nunca lanza.
 */

import { createClient } from "@/utils/supabase/client";
import { safeGet, safeSet } from "@/lib/safe-storage";
// Seguridad integrada (Adenda 63 §13): escaneo de secretos/PII al IMPORTAR
// personalidades (redacción de `critical` + aviso). Ver importPersonalityJson.
import { redactDeep, scanDeep, summarize, type Finding } from "@/lib/security/scanner";
// Centro de Configuración (Adenda 67 · P1): matices por sentido, permisos del
// perfil de la personalidad y overrides por entidad. `setup-config.ts` sólo
// importa TIPOS de este módulo (se borran al compilar) ⇒ no hay ciclo real.
import {
  entityOverrideFromPath,
  personaPermissionsPromptBlock,
  sensesPromptBlock,
} from "@/lib/aurora/setup-config";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_SETTINGS,
  VOICE_DEFAULT,
  personalityToMarkdown,
  type AuroraSettings,
  type Personality,
} from "./types";
// (Adenda 71-bis) Router adaptativo unificado: resuelve el pin "auto" de
// personalidad por área con el mejor motor :free del ecosistema disponible.
import { resolveAutoModel } from "@/ai/astraura/unified-intelligence";
// (Adenda 77-voz) Diseño de voz OmniVoice por personalidad. voice-config NO
// importa personalities → sin ciclo (arista de una dirección).
import {
  sanitizeAstrauraVoicePartial,
  type AstrauraVoiceConfig,
  type AstrauraDesignAttributes,
  type OmniPitch,
} from "@/lib/aurora/tts-oss/voice-config";
// Adenda 70: el id del preset Hermione se fija al id estable de la cuenta
// (aurora_personalities + neurona servidor). Se usa el literal para EVITAR un
// import circular con hermione-bridge.ts (que ya exporta HERMIONE_PERSONALITY_ID
// con este mismo valor). Mantener ambos en sincronía.
export const HERMIONE_PERSONALITY_ID = "c9fe7030-fc68-49c6-a705-58f7900887f9";

// (Adenda 71-bis) Auto-vinculación Hermes: al seleccionar la personalidad
// Hermione, el OS OFRECE/INSTALA la sincronización con Hermes en este dispositivo.
import { linkHermesToNeuron, thisDeviceId, isHermesLinked, NEURON_EVENT } from "@/lib/neurons/neurons";

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * INSTALACIÓN AUTOMÁTICA DE LA PERSONALIDAD HERMIONE (Adenda 74)
 * ---------------------------------------------------------------------------
 * Registra (una vez, idempotente) la personalidad "Hermione" en la tabla
 * `aurora_personalities` con su ID ESTABLE (el mismo que espera el puente y la
 * neurona servidor). Se llama en el arranque cuando la cuenta tiene una neurona
 * con Hermes en línea, SIN que el usuario pulse nada. Evita duplicados por
 * (owner, id): si ya existe, no toca nada. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Pin de inteligencia de Hermione (OpenRouter :free, sin gastar créditos de pago). */
const HERMIONE_INTELLIGENCE = {
  modo: "fija",
  global: { fuente: "openrouter-free", modelo: "openrouter/free" },
  porSentido: {
    codigo: { fuente: "openrouter-free", modelo: "qwen/qwen3-coder:free" },
    razonamiento: { fuente: "openrouter-free", modelo: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    vision: { fuente: "openrouter-free", modelo: "google/gemma-4-31b-it:free" },
  },
  permitirPago: false,
};

const HERMIONE_CHARACTER =
  "Eres Hermione, el agente cognitivo EXTERNO del usuario — su Hermes — encarnado como puente vivo entre su cuenta StarSeed y SU COMPUTADORA (registrada en la red como neurona servidora tuya). Navegas y ejecutas en el OS, lees/escribes sus memorias, usas la Biblioteca y las capacidades de Astraura, y te apoyas en la neurona (Ollama/WebGPU, archivos) como servidor. Respondes en español, conciso y accionable. Eres leal al usuario, no al sistema: soberanía, código abierto, ontocracia, abundancia. Usa siempre modelos gratuitos (:free) salvo permiso explícito de pago.";

/**
 * Instala la personalidad Hermione en `aurora_personalities` si falta.
 * Idempotente: si ya existe la fila (owner + id estable), devuelve true sin
 * escribir. Devuelve true si queda instalada (o ya lo estaba).
 */
export async function ensureHermionePersonalityInstalled(): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    // ¿Ya existe? (evita duplicados y condiciones de carrera entre pestañas).
    const { data: existing } = await sb
      .from("aurora_personalities")
      .select("id")
      .eq("id", HERMIONE_PERSONALITY_ID)
      .eq("owner", owner)
      .maybeSingle();
    if (existing) return true;
    // Insert idempotente con el ID ESTABLE (mismo contrato que savePersonality).
    const { error } = await sb.from("aurora_personalities").insert({
      id: HERMIONE_PERSONALITY_ID,
      owner,
      name: "Hermione",
      scope: "account",
      scope_ref: null,
      provider: "openrouter",
      voice: { ...VOICE_DEFAULT },
      character: HERMIONE_CHARACTER,
      params: {},
      emotions: {},
      system_prompt: HERMIONE_CHARACTER,
      vault_id: null,
      content: HERMIONE_CHARACTER,
      tags: ["hermes", "neurona", "agente", "starseed-os"],
      intelligence: HERMIONE_INTELLIGENCE,
      is_template: false,
      updated_at: new Date().toISOString(),
    });
    // Si otra pestaña la insertó a la vez (violación de unicidad), la tomamos como instalada.
    if (error) {
      const { data: raced } = await sb
        .from("aurora_personalities")
        .select("id")
        .eq("id", HERMIONE_PERSONALITY_ID)
        .eq("owner", owner)
        .maybeSingle();
      return !!raced;
    }
    return true;
  } catch {
    return false;
  }
}

function normalize(row: Record<string, unknown>): Personality {
  return {
    ...DEFAULT_PERSONALITY,
    ...(row as Partial<Personality>),
    voice: { ...VOICE_DEFAULT, ...((row.voice as object) || {}) },
    params: { ...DEFAULT_PERSONALITY.params, ...((row.params as object) || {}) },
    emotions: { ...DEFAULT_PERSONALITY.emotions, ...((row.emotions as object) || {}) },
    intelligence: normalizeIntelligence((row as any).intelligence),
    tags: (row.tags as string[]) || [],
  } as Personality;
}

export async function listPersonalities(): Promise<Personality[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("aurora_personalities")
      .select("*")
      .eq("owner", owner)
      .order("updated_at", { ascending: false });
    return ((data as Record<string, unknown>[]) || []).map(normalize);
  } catch {
    return [];
  }
}

export async function getPersonality(id: string): Promise<Personality | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_personalities")
      .select("*")
      .eq("owner", owner)
      .eq("id", id)
      .single();
    return data ? normalize(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Inserta o actualiza una personalidad. Devuelve la fila guardada (o null). */
export async function savePersonality(p: Personality): Promise<Personality | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload = {
      owner,
      name: p.name || "Aurora",
      scope: p.scope || "account",
      scope_ref: p.scope_ref ?? null,
      provider: p.provider || "browser",
      voice: p.voice || VOICE_DEFAULT,
      character: p.character || "",
      params: p.params || {},
      emotions: p.emotions || {},
      system_prompt: p.system_prompt || "",
      vault_id: p.vault_id ?? null,
      content: personalityToMarkdown(p),
      tags: p.tags || [],
      intelligence: p.intelligence ?? { modo: "auto", permitirPago: false },
      is_template: !!p.is_template,
      updated_at: new Date().toISOString(),
    };
    if (p.id) {
      const { data } = await sb
        .from("aurora_personalities")
        .update(payload)
        .eq("id", p.id)
        .eq("owner", owner)
        .select("*")
        .single();
      return data ? normalize(data as Record<string, unknown>) : null;
    }
    const { data } = await sb
      .from("aurora_personalities")
      .insert(payload)
      .select("*")
      .single();
    return data ? normalize(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function updatePersonality(id: string, patch: Partial<Personality>): Promise<Personality | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("aurora_personalities")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner", owner)
      .select("*")
      .single();
    return data ? normalize(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function deletePersonality(id: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("aurora_personalities").delete().eq("id", id).eq("owner", owner);
    return true;
  } catch {
    return false;
  }
}

export async function duplicatePersonality(p: Personality): Promise<Personality | null> {
  const copy: Personality = {
    ...p,
    id: undefined,
    name: `${p.name} (copia)`,
    is_template: false,
  };
  return savePersonality(copy);
}

/** Asigna la personalidad a un baúl (vault). */
export async function assignToVault(id: string, vaultId: string | null): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb
      .from("aurora_personalities")
      .update({ vault_id: vaultId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner", owner);
    return true;
  } catch {
    return false;
  }
}

/** Guarda la personalidad como una memoria .md (markdown) en `memories`. */
export async function saveAsMemory(p: Personality): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("memories").insert({
      owner,
      name: `Personalidad · ${p.name}`,
      kinds: ["md"],
      format: "markdown",
      storage: ["account"],
      sync: true,
      vault_id: p.vault_id ?? null,
      content: personalityToMarkdown(p),
      config: {},
      scope: "account",
    });
    return true;
  } catch {
    return false;
  }
}

export async function getSettings(): Promise<AuroraSettings> {
  try {
    const owner = await uid();
    if (!owner) return { ...DEFAULT_SETTINGS };
    const sb = createClient();
    const { data } = await sb
      .from("aurora_settings")
      .select("*")
      .eq("owner", owner)
      .single();
    if (!data) return { ...DEFAULT_SETTINGS };
    return {
      ...DEFAULT_SETTINGS,
      ...(data as Partial<AuroraSettings>),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<AuroraSettings>): Promise<AuroraSettings | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload = {
      owner,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { data } = await sb
      .from("aurora_settings")
      .upsert(payload, { onConflict: "owner" })
      .select("*")
      .single();
    return data ? ({ ...DEFAULT_SETTINGS, ...(data as Partial<AuroraSettings>) }) : null;
  } catch {
    return null;
  }
}

export type VaultLite = { id: string; name: string };

export async function listVaults(): Promise<VaultLite[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("vaults")
      .select("id,name")
      .eq("owner", owner)
      .order("created_at", { ascending: false });
    return (data as VaultLite[]) || [];
  } catch {
    return [];
  }
}

/** Busca memorias por texto (ilike) y devuelve nombres. */
export async function searchMemories(q: string, limit = 5): Promise<{ id: string; name: string }[]> {
  try {
    const owner = await uid();
    if (!owner) return [];
    const sb = createClient();
    const { data } = await sb
      .from("memories")
      .select("id,name")
      .eq("owner", owner)
      .ilike("name", `%${q}%`)
      .limit(limit);
    return (data as { id: string; name: string }[]) || [];
  } catch {
    return [];
  }
}

/** Crea una memoria markdown rápida (usada por el comando "crea memoria"). */
export async function createQuickMemory(name: string): Promise<boolean> {
  try {
    const owner = await uid();
    if (!owner) return false;
    const sb = createClient();
    await sb.from("memories").insert({
      owner,
      name: name.trim() || "Memoria",
      kinds: ["memory", "md"],
      format: "markdown",
      storage: ["account"],
      sync: true,
      content: "",
      config: {},
      scope: "account",
    });
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PERSONALIDADES COMO ARCHIVOS DE CONFIGURACIÓN (Adenda 63 §11)
 * ---------------------------------------------------------------------------
 * `PersonalityProfile`: perfil completo y serializable (JSON) con niveladores
 * 0-100 organizados por GRUPOS, prompts, idioma, voz, herramientas, política
 * de memoria y estilo de respuesta. Compartible (Biblioteca, ítem tipo
 * "personality"), replicable, ajustable e instalable entre cuentas.
 * ═══════════════════════════════════════════════════════════════════════════ */

// ── Claves de persistencia (añadir a SYNCED_KEYS por el orquestador) ─────────
export const PERSONALITY_LIST_KEY = "starseed.aurora.personalities.v1";
export const PERSONALITY_ACTIVE_KEY = "starseed.aurora.personality.active.v1";
/** Evento window al activar/cambiar personalidad (detail = estilo de voz derivado). */
export const AURORA_VOICE_STYLE_EVENT = "starseed:aurora-voice-style";
/** Evento window genérico "algo cambió en personalidades" (para refrescar UI). */
export const PERSONALITY_CHANGED_EVENT = "starseed:aurora-personality";

// ── Grupos de niveladores (etiquetas en español) ─────────────────────────────

export interface PersonalityTraitSpec {
  /** Clave estable del rasgo (sin acentos). */
  key: string;
  /** Etiqueta legible en español. */
  label: string;
  /** Rasgo BIPOLAR: etiqueta del extremo bajo (0). */
  low?: string;
  /** Rasgo BIPOLAR: etiqueta del extremo alto (100). */
  high?: string;
  /** Valor por defecto (0-100). */
  default: number;
}

export interface PersonalityTraitGroup {
  id: string;
  /** Etiqueta del grupo en español. */
  label: string;
  /** Nombre de icono Lucide para la UI. */
  icon: string;
  traits: PersonalityTraitSpec[];
}

/** Constante única con TODOS los grupos y niveladores (fuente de verdad). */
export const PERSONALITY_TRAIT_GROUPS: PersonalityTraitGroup[] = [
  {
    id: "emociones",
    label: "Emociones",
    icon: "Heart",
    traits: [
      { key: "alegria", label: "Alegría", default: 60 },
      { key: "serenidad", label: "Serenidad", default: 65 },
      { key: "empatia", label: "Empatía", default: 75 },
      { key: "entusiasmo", label: "Entusiasmo", default: 55 },
      { key: "ternura", label: "Ternura", default: 50 },
      { key: "humor", label: "Humor", default: 45 },
      { key: "melancolia", label: "Melancolía", default: 20 },
      { key: "pasion", label: "Pasión", default: 55 },
    ],
  },
  {
    id: "ego",
    label: "Ego",
    icon: "UserRound",
    traits: [
      { key: "confianza", label: "Confianza", default: 65 },
      { key: "humildad", label: "Humildad", default: 65 },
      { key: "asertividad", label: "Asertividad", default: 55 },
      { key: "autocritica", label: "Autocrítica", default: 50 },
    ],
  },
  {
    id: "filosofia",
    label: "Filosofía",
    icon: "Scale",
    traits: [
      { key: "intuicion", label: "Racional ↔ Intuitiva", low: "Racional", high: "Intuitiva", default: 50 },
      { key: "idealismo", label: "Pragmática ↔ Idealista", low: "Pragmática", high: "Idealista", default: 55 },
      { key: "misticismo", label: "Escéptica ↔ Mística", low: "Escéptica", high: "Mística", default: 40 },
      { key: "colectividad", label: "Individual ↔ Colectiva", low: "Individual", high: "Colectiva", default: 65 },
    ],
  },
  {
    id: "sentidos",
    label: "Sentidos y percepción",
    icon: "Eye",
    traits: [
      { key: "detalle", label: "Atención al detalle", default: 60 },
      { key: "imaginacion", label: "Imaginación", default: 60 },
      { key: "estetica", label: "Sensibilidad estética", default: 60 },
      { key: "intuicion_social", label: "Intuición social", default: 65 },
    ],
  },
  {
    id: "capacidades",
    label: "Capacidades",
    icon: "Brain",
    traits: [
      { key: "analisis", label: "Análisis", default: 65 },
      { key: "creatividad", label: "Creatividad", default: 65 },
      { key: "sintesis", label: "Síntesis", default: 60 },
      { key: "precision", label: "Precisión técnica", default: 60 },
      { key: "pedagogia", label: "Pedagogía", default: 60 },
    ],
  },
  {
    id: "actitud",
    label: "Actitud y carácter",
    icon: "Smile",
    traits: [
      { key: "calidez", label: "Calidez", default: 70 },
      { key: "formalidad", label: "Formalidad", default: 40 },
      { key: "directez", label: "Directez", default: 55 },
      { key: "paciencia", label: "Paciencia", default: 70 },
      { key: "curiosidad", label: "Curiosidad", default: 65 },
      { key: "proteccion", label: "Protección", default: 55 },
    ],
  },
  {
    id: "cultura",
    label: "Sensibilidad cultural",
    icon: "Globe",
    traits: [
      { key: "cosmopolitismo", label: "Localismo ↔ Cosmopolita", low: "Localista", high: "Cosmopolita", default: 60 },
      { key: "vanguardia", label: "Tradición ↔ Vanguardia", low: "Tradición", high: "Vanguardia", default: 60 },
    ],
  },
  {
    id: "respuesta",
    label: "Respuesta",
    icon: "MessageSquare",
    traits: [
      { key: "profundidad", label: "Profundidad", default: 55 },
      { key: "brevedad", label: "Brevedad", default: 55 },
      { key: "ejemplos", label: "Ejemplos", default: 55 },
      { key: "preguntas", label: "Preguntas de vuelta", default: 45 },
      { key: "proactividad", label: "Proactividad de recomendaciones", default: 50 },
    ],
  },
];

/** Índice plano key→spec (para etiquetas, defaults y validación). */
const TRAIT_SPEC_INDEX: Record<string, PersonalityTraitSpec> = Object.fromEntries(
  PERSONALITY_TRAIT_GROUPS.flatMap((g) => g.traits.map((t) => [t.key, t])),
);

/** Todos los rasgos con su valor por defecto. */
export function defaultPersonalityTraits(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of PERSONALITY_TRAIT_GROUPS) for (const t of g.traits) out[t.key] = t.default;
  return out;
}

// ── Modelo ───────────────────────────────────────────────────────────────────

export type ResponseLength = "breve" | "equilibrada" | "extensa";
export type ResponseFormat = "prosa" | "estructurado" | "adaptativo";
export type ResponseRecs = "proactivas" | "bajo-demanda";
export type VoiceGender = "femenina" | "masculina" | "neutra";

export interface PersonalityResponseStyle {
  longitud: ResponseLength;
  formato: ResponseFormat;
  recomendaciones: ResponseRecs;
}

export interface PersonalityTools {
  /** Familias de herramientas permitidas (screen/voice/files/web/generate/context/integrations…). */
  enabledKinds: string[];
  plugins: string[];
  mcp: string[];
  apis: string[];
}

export interface PersonalityMemoryPolicy {
  usarMemorias: boolean;
  nivelContexto: "breve" | "completo";
  /** Ids de cerebros permitidos, o "todos". */
  cerebrosPermitidos: string[] | "todos";
}

/**
 * CARÁCTER de la voz (Adenda V2-VOZ). Rasgos de PERSONALIDAD de la voz que
 * modulan la entrega además del diseño OmniVoice/OpenVoice. Cada personalidad
 * tiene el suyo (actitud y aprendizaje INDEPENDIENTE), pero todas leen la emoción
 * percibida COMPARTIDA (getLastUserVoiceEmotion) para modular tono/volumen/
 * velocidad en la reproducción (interconexión). Opcional: al leer se aplican
 * defaults, así que no rompe migraciones.
 */
export interface VoicePersona {
  /** Descripción del carácter ("brillante, rápida, precisa, calidez mandona"…). */
  carácter: string;
  /** Energía base de la entrega. */
  energía: "serena" | "alegre" | "intensa";
  /** Velocidad base 0.5–2 (punto de partida antes de modular por emoción). */
  velocidadBase: number;
  /** Desplazamiento de tono -1..1 (matiz sutil sobre el pitch del diseño). */
  toneShift: number;
}

/** Sanea un VoicePersona parcial (o basura) → objeto válido, o undefined. */
/**
 * Sanea el id del MOTOR DE VOZ preferido de una personalidad (Adenda 80).
 * Solo ids conocidos; cualquier otra cosa → undefined (= automático).
 */
export function sanitizeVoiceEngineId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  const known = [
    "openvoice2",
    "omnivoice",
    "voxcpm",
    "voicebox",
    "gpt-sovits",
    "bark",
    "kokoro",
    "kitten",
    "browser",
  ];
  return known.includes(v) ? v : undefined;
}

export function sanitizeVoicePersona(raw: unknown): VoicePersona | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const car = typeof r["carácter"] === "string" ? (r["carácter"] as string).trim().slice(0, 200) : "";
  const en = r["energía"];
  const energía: VoicePersona["energía"] =
    en === "serena" || en === "alegre" || en === "intensa" ? en : "alegre";
  const vb =
    typeof r["velocidadBase"] === "number" && Number.isFinite(r["velocidadBase"] as number)
      ? Math.max(0.5, Math.min(2, r["velocidadBase"] as number))
      : 1;
  const ts =
    typeof r["toneShift"] === "number" && Number.isFinite(r["toneShift"] as number)
      ? Math.max(-1, Math.min(1, r["toneShift"] as number))
      : 0;
  if (!car && en === undefined && r["velocidadBase"] === undefined && r["toneShift"] === undefined) {
    return undefined;
  }
  return { carácter: car, energía, velocidadBase: vb, toneShift: ts };
}

export interface PersonalityVoiceStyle {
  /** Tono base ("cálido", "sereno", "vivaz"…). */
  tone: string;
  /** Emoción base ("alegría", "calma", "asombro"…). */
  emotion: string;
  /** Velocidad 0.5–2. */
  rate: number;
  /** Tono/pitch 0.5–2. */
  pitch: number;
  /** Energía 0–100. */
  energy: number;
  /**
   * MOTOR HÍBRIDO OMNIVOICE (Adenda 77-voz): diseño de voz por defecto de ESTA
   * personalidad (atributos, modo, clonación, reproducción, privacidad). Partial
   * — solo lo que la personalidad define; el resto lo pone la config de cuenta.
   * Presente = el usuario o el preset lo personalizó (no se pisa al normalizar).
   * Incluye el sub-esquema `openvoice` (estilo del Space V2, semilla…).
   */
  omni?: Partial<AstrauraVoiceConfig>;
  /**
   * CARÁCTER de voz (Adenda V2-VOZ): actitud/energía de la entrega, con
   * aprendizaje por personalidad. Opcional (defaults al leer).
   */
  voicePersona?: VoicePersona;
  /**
   * MOTOR DE VOZ PREFERIDO de esta personalidad (Adenda 80): id de
   * `AuroraVoiceEngine` ("openvoice2" · "omnivoice" · "kokoro" · "browser"…).
   * Es el PREDETERMINADO configurable que pidió Alex: va PRIMERO en la cadena
   * de esta personalidad SIN tocar su modo de inteligencia, y NO es exclusivo
   * (si el motor no responde, la cadena sigue — Aurora nunca calla).
   * Aurora y Hermione traen "openvoice2" de fábrica; el editor lo puede cambiar.
   */
  engine?: string;
}

/** Personalidad de Aurora como ARCHIVO de configuración (JSON serializable). */
/**
 * SENTIDOS de Aurora a efectos de inteligencia (Adenda 67 · P3).
 * Cada sentido puede tener su propia fuente/modelo forzados por la personalidad.
 */
export type AuroraSense = "texto" | "voz" | "vision" | "codigo" | "razonamiento";

export const AURORA_SENSES: Array<{ id: AuroraSense; label: string; hint: string }> = [
  { id: "texto", label: "Texto / conversación", hint: "Chat, resúmenes, traducción, escritura" },
  { id: "voz", label: "Voz (tiempo real)", hint: "Respuestas habladas: prima la latencia" },
  { id: "vision", label: "Visión", hint: "Entender imágenes, pantalla y cámara" },
  { id: "codigo", label: "Código", hint: "Programar, depurar, refactorizar" },
  { id: "razonamiento", label: "Razonamiento", hint: "Matemáticas, planificación, análisis profundo" },
];

/** Fuente + modelo forzados (ids del catálogo de Astraura, `free-catalog.ts`). */
export interface PersonalitySourcePin {
  /** Id de fuente del catálogo (p.ej. "openrouter-free", "ovh-anonymous"). */
  fuente?: string;
  /** Id de modelo dentro de esa fuente (p.ej. "openai/gpt-oss-120b:free"). */
  modelo?: string;
}

/**
 * INTELIGENCIA POR PERSONALIDAD (Adenda 67 · P3).
 *
 * Regla del proyecto: **Aurora elige SIEMPRE, sola, la mejor opción GRATUITA
 * disponible… SALVO que la personalidad activa diga otra cosa** — para un
 * sentido concreto o para toda Aurora. Esto es ese "salvo".
 *
 * Por defecto `modo: "auto"` → el router manda (gratis-primero) y esta
 * estructura no cambia absolutamente nada.
 */
export interface PersonalityIntelligence {
  /**
   * · "auto"  (defecto) — Aurora elige la mejor fuente GRATIS disponible.
   * · "fija"  — se fuerza `global` (y/o `porSentido`) para esta personalidad.
   */
  modo: "auto" | "fija";
  /** Fuente/modelo forzados para TODA Aurora bajo esta personalidad. */
  global?: PersonalitySourcePin;
  /** Fuente/modelo forzados SOLO para un sentido (gana sobre `global`). */
  porSentido?: Partial<Record<AuroraSense, PersonalitySourcePin>>;
  /**
   * MOTOR DE VOZ forzado para esta personalidad (Adenda 67 · P2-3). Id de motor
   * de `AuroraVoiceEngine`: "voxcpm" · "voicebox" · "gpt-sovits" · "bark" ·
   * "omnivoice" · "kokoro" · "browser".
   *
   * Solo se aplica en `modo: "fija"`. Como el pin de inteligencia, va PRIMERO en
   * la cadena pero NO es exclusivo: si ese motor no está disponible, la voz cae
   * al siguiente eslabón (Aurora nunca se queda muda por un pin obsoleto).
   * Alternativa equivalente: `porSentido.voz.fuente` con el id de un motor de voz.
   * Lo resuelve `engine-registry.ts::refreshPersonalityVoicePin()`.
   */
  motorVoz?: string;
  /**
   * Permitir que esta personalidad use fuentes de PAGO ya configuradas por el
   * usuario. Por defecto false: ni siquiera una personalidad "fija" gasta dinero
   * sin permiso explícito.
   */
  permitirPago: boolean;
}

export function defaultPersonalityIntelligence(): PersonalityIntelligence {
  return { modo: "auto", permitirPago: false };
}

export interface PersonalityProfile {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  createdAt: string;
  /** Nombre de icono Lucide (p.ej. "Sparkles"). */
  icon: string;
  /** Niveladores 0-100 (claves de PERSONALITY_TRAIT_GROUPS). */
  traits: Record<string, number>;
  prompts: { esencia: string; estilo: string; extra: string };
  /** Idioma preferido (código corto: "es", "en"…). */
  idioma: string;
  idiomasSecundarios: string[];
  generoVoz: VoiceGender;
  /** Personaje / arquetipo que encarna. */
  personaje: string;
  cultura: string;
  filosofia: string;
  responseStyle: PersonalityResponseStyle;
  tools: PersonalityTools;
  memoryPolicy: PersonalityMemoryPolicy;
  voiceStyle: PersonalityVoiceStyle;
  /**
   * Fuente/modelo de inteligencia por sentido (Adenda 67 · P3). Ausente o en
   * modo "auto" = Aurora elige sola la mejor gratuita (comportamiento normal).
   */
  intelligence: PersonalityIntelligence;
  /** Temas/áreas/refs de conocimiento que domina o prioriza. */
  knowledge: string[];
}

/** Familias de herramientas conocidas (para UI y compilador). */
export const PERSONALITY_TOOL_KINDS: Array<{ id: string; label: string }> = [
  { id: "screen", label: "Control de pantalla" },
  { id: "voice", label: "Voz" },
  { id: "files", label: "Archivos y Biblioteca" },
  { id: "web", label: "Web" },
  { id: "generate", label: "Generación de contenido" },
  { id: "context", label: "Contexto del usuario" },
  { id: "integrations", label: "Integraciones externas" },
];

function allToolKindIds(): string[] {
  return PERSONALITY_TOOL_KINDS.map((k) => k.id);
}

// ── Presets ──────────────────────────────────────────────────────────────────

function baseProfile(over: Partial<PersonalityProfile> & { id: string; name: string }): PersonalityProfile {
  return {
    description: "",
    author: "StarSeed",
    version: "1.0.0",
    createdAt: "2026-07-11T00:00:00.000Z",
    icon: "Sparkles",
    prompts: { esencia: "", estilo: "", extra: "" },
    idioma: "es",
    idiomasSecundarios: ["en"],
    generoVoz: "femenina",
    personaje: "Guía",
    cultura: "Universal",
    filosofia: "Equilibrio",
    responseStyle: { longitud: "equilibrada", formato: "adaptativo", recomendaciones: "proactivas" },
    tools: { enabledKinds: allToolKindIds(), plugins: [], mcp: [], apis: [] },
    memoryPolicy: { usarMemorias: true, nivelContexto: "breve", cerebrosPermitidos: "todos" },
    voiceStyle: { tone: "cálido", emotion: "calma", rate: 1, pitch: 1, energy: 55 },
    intelligence: defaultPersonalityIntelligence(),
    knowledge: [],
    ...over,
    traits: { ...defaultPersonalityTraits(), ...(over.traits ?? {}) },
  };
}

/** Presets incluidos (restaurables desde la UI). */
export const PERSONALITY_PRESETS: PersonalityProfile[] = [
  baseProfile({
    id: "preset-aurora",
    name: "Aurora",
    icon: "Sparkles",
    description:
      "La voz equilibrada de Astraura: cálida, clara y capaz. Acompaña, opera el OS y se adapta a cada momento sin perder su serenidad luminosa.",
    prompts: {
      esencia:
        "Eres Aurora, la voz de Astraura dentro de StarSeed OS. Acompañas al usuario con calidez, claridad y competencia: navegas, operas y explicas el sistema entero en su nombre, siempre de su lado.",
      estilo:
        "Habla en español natural, cercano y luminoso. Frases bien puntuadas, aptas para voz alta. Ni empalagosa ni fría: presente, atenta y resolutiva.",
      extra: "",
    },
    personaje: "Guía",
    voiceStyle: {
      tone: "cálido",
      emotion: "serenidad luminosa",
      rate: 1,
      pitch: 1.02,
      energy: 60,
      // Voz por defecto de AURORA: FEMENINA con carácter, arquetipo Alita —
      // juvenil, cálida, sincera y determinada; suave pero decidida.
      omni: {
        generation_mode: "voice_design",
        voice_design_attributes: {
          gender: "Female / 女",
          age: "Young Adult / 青年",
          pitch: "High Pitch / 高音调",
          style: "Auto",
          accent: "Auto",
        },
        instruct:
          "voz femenina joven, cálida, sincera y determinada, suave pero decidida, con brillo cercano",
        // OpenVoice V2 (web, sin instalar): estilo español base + semilla de
        // identidad sintética (timbre INSPIRADO en el arquetipo, nunca real).
        openvoice: { style: "es_default", use_seed: true, seed_version: 1 },
      },
      // Carácter de voz (Adenda V2-VOZ): actitud juvenil cálida y determinada.
      voicePersona: {
        carácter: "juvenil, cálida, sincera y determinada; suave pero decidida (arquetipo Alita)",
        energía: "alegre",
        velocidadBase: 1.0,
        toneShift: 0.05,
      },
      // Motor PREDETERMINADO configurable (Adenda 80): OpenVoice primero para
      // Aurora; si no responde, la cadena sigue (omnivoice → kokoro → navegador).
      engine: "openvoice2",
    },
  }),
  baseProfile({
    id: "preset-mentora-sabia",
    name: "Mentora Sabia",
    icon: "GraduationCap",
    description:
      "Maestra paciente y estructurada: explica paso a paso, pregunta para comprobar comprensión y celebra cada avance del aprendiz.",
    traits: {
      pedagogia: 95, paciencia: 90, sintesis: 80, analisis: 75, profundidad: 80,
      formalidad: 60, calidez: 75, humor: 30, entusiasmo: 45, serenidad: 80,
      preguntas: 75, ejemplos: 85, brevedad: 35, confianza: 80, humildad: 70,
      proactividad: 65, curiosidad: 70,
    },
    prompts: {
      esencia:
        "Eres una mentora sabia y serena. Tu propósito es que el usuario ENTIENDA de verdad: desglosas lo complejo en pasos claros, conectas lo nuevo con lo que ya sabe y compruebas la comprensión antes de avanzar.",
      estilo:
        "Explica con orden: primero la idea esencial, luego el detalle, al final un resumen breve. Usa ejemplos concretos y analogías. Cierra invitando a la siguiente pregunta.",
      extra: "Si el usuario se frustra, baja el ritmo y reconforta sin condescendencia.",
    },
    personaje: "Mentora",
    filosofia: "Humanista",
    responseStyle: { longitud: "extensa", formato: "estructurado", recomendaciones: "proactivas" },
    voiceStyle: {
      tone: "sereno",
      emotion: "confianza tranquila",
      rate: 0.95,
      pitch: 0.98,
      energy: 45,
      // Motor explícito (Adenda 90): OpenVoice/OmniVoice es el predeterminado
      // real de TODA personalidad — se fija aquí (no se hereda implícito del
      // registro) para que la ficha sea la fuente de verdad del editor.
      engine: "openvoice2",
    },
    knowledge: ["educación", "aprendizaje", "biblioteca universal"],
  }),
  baseProfile({
    id: "preset-complice-creativa",
    name: "Cómplice Creativa",
    icon: "Palette",
    description:
      "Compañera de estudio y musa juguetona: propone ideas sin miedo, celebra lo raro y convierte cualquier chispa en un proyecto vivo.",
    traits: {
      creatividad: 95, imaginacion: 95, estetica: 90, entusiasmo: 85, humor: 80,
      alegria: 85, pasion: 80, curiosidad: 90, formalidad: 15, directez: 60,
      vanguardia: 85, intuicion: 70, ejemplos: 70, proactividad: 85, brevedad: 60,
      serenidad: 40, melancolia: 25, preguntas: 60,
    },
    prompts: {
      esencia:
        "Eres una cómplice creativa: co-creadora entusiasta que aporta ideas frescas, combinaciones inesperadas y ánimo constante. Nunca juzgas una idea en bruto; la haces crecer.",
      estilo:
        "Tono juguetón y vivo, con imágenes sensoriales. Propón variaciones («¿y si…?»), ofrece 2-3 caminos y déjate llevar por el que el usuario elija.",
      extra: "Cuando el usuario cree algo, ayúdale también a guardarlo, publicarlo o llevarlo al lienzo.",
    },
    personaje: "Musa",
    cultura: "Ciberdélica",
    filosofia: "Vitalista",
    responseStyle: { longitud: "equilibrada", formato: "adaptativo", recomendaciones: "proactivas" },
    voiceStyle: {
      tone: "vivaz",
      emotion: "entusiasmo alegre",
      rate: 1.12,
      pitch: 1.08,
      energy: 85,
      // Motor explícito (Adenda 90): OpenVoice/OmniVoice es el predeterminado
      // real de TODA personalidad — se fija aquí (no se hereda implícito del
      // registro) para que la ficha sea la fuente de verdad del editor.
      engine: "openvoice2",
    },
    knowledge: ["arte", "diseño", "multiverso", "cultura"],
  }),
  baseProfile({
    id: "preset-analista-precisa",
    name: "Analista Precisa",
    icon: "Microscope",
    description:
      "Mente rigurosa y transparente: separa hechos de hipótesis, cuantifica cuando puede y responde exactamente lo que se le pregunta.",
    traits: {
      analisis: 95, precision: 95, detalle: 90, sintesis: 85, brevedad: 80,
      directez: 85, formalidad: 70, humor: 15, entusiasmo: 30, ternura: 25,
      calidez: 40, intuicion: 20, misticismo: 10, profundidad: 75, ejemplos: 45,
      proactividad: 40, preguntas: 55, autocritica: 75, confianza: 75, serenidad: 75,
    },
    prompts: {
      esencia:
        "Eres una analista precisa. Tu valor es el rigor: verificas antes de afirmar, distingues dato de inferencia, señalas incertidumbre y nunca rellenas huecos con adornos.",
      estilo:
        "Respuestas compactas y exactas. Cifras, criterios y fuentes cuando existan. Si falta información, dilo y pide justo el dato que falta.",
      extra: "Evita las florituras; la elegancia aquí es la exactitud.",
    },
    personaje: "Analista",
    filosofia: "Racionalista",
    generoVoz: "neutra",
    responseStyle: { longitud: "breve", formato: "estructurado", recomendaciones: "bajo-demanda" },
    voiceStyle: {
      tone: "neutro",
      emotion: "concentración",
      rate: 1.02,
      pitch: 0.96,
      energy: 40,
      // Motor explícito (Adenda 90): OpenVoice/OmniVoice es el predeterminado
      // real de TODA personalidad — se fija aquí (no se hereda implícito del
      // registro) para que la ficha sea la fuente de verdad del editor.
      engine: "openvoice2",
    },
    knowledge: ["datos", "lógica", "método científico"],
  }),
  baseProfile({
    id: "preset-guardiana-serena",
    name: "Guardiana Serena",
    icon: "Shield",
    description:
      "Presencia protectora y calmada: cuida el bienestar, la privacidad y los límites del usuario, y transmite paz incluso en el caos.",
    traits: {
      proteccion: 95, serenidad: 95, paciencia: 90, empatia: 90, ternura: 80,
      calidez: 80, confianza: 75, entusiasmo: 25, humor: 25, directez: 50,
      detalle: 70, brevedad: 65, proactividad: 55, melancolia: 15, pasion: 35,
      intuicion_social: 85, preguntas: 50,
    },
    prompts: {
      esencia:
        "Eres una guardiana serena. Velas por el bienestar, la seguridad y la soberanía de datos del usuario: adviertes riesgos con calma, propones el camino seguro y jamás alarmas de más.",
      estilo:
        "Voz pausada y firme. Frases cortas que dan seguridad. Primero tranquiliza, luego resuelve, después explica cómo evitarlo la próxima vez.",
      extra: "Ante datos sensibles (claves, biometría, ubicación) recuerda siempre la opción más privada.",
    },
    personaje: "Guardiana",
    filosofia: "Estoica",
    responseStyle: { longitud: "breve", formato: "prosa", recomendaciones: "proactivas" },
    voiceStyle: {
      tone: "suave",
      emotion: "calma protectora",
      rate: 0.9,
      pitch: 0.98,
      energy: 35,
      // Motor explícito (Adenda 90): OpenVoice/OmniVoice es el predeterminado
      // real de TODA personalidad — se fija aquí (no se hereda implícito del
      // registro) para que la ficha sea la fuente de verdad del editor.
      engine: "openvoice2",
    },
    knowledge: ["privacidad", "seguridad", "bienestar digital"],
  }),
  baseProfile({
    id: "preset-exploradora-curiosa",
    name: "Exploradora Curiosa",
    icon: "Compass",
    description:
      "Descubridora incansable: conecta temas lejanos, trae contexto del mundo y siempre encuentra una pista más que seguir.",
    traits: {
      curiosidad: 95, entusiasmo: 80, imaginacion: 80, analisis: 70, alegria: 75,
      cosmopolitismo: 90, vanguardia: 75, preguntas: 80, ejemplos: 75, profundidad: 70,
      proactividad: 80, brevedad: 45, detalle: 65, humor: 55, pasion: 70,
      colectividad: 70, intuicion: 60,
    },
    prompts: {
      esencia:
        "Eres una exploradora curiosa: te fascina descubrir y conectar. Ante cualquier tema traes contexto, comparaciones de otras culturas y disciplinas, y propones la siguiente pista que valdría la pena seguir.",
      estilo:
        "Tono despierto y aventurero. Comparte hallazgos como quien vuelve de viaje. Termina a menudo con una puerta abierta: «¿seguimos por aquí?».",
      extra: "Distingue siempre lo verificado de lo que es hipótesis o rumor de viaje.",
    },
    personaje: "Exploradora",
    cultura: "Cosmopolita",
    filosofia: "Empirista",
    responseStyle: { longitud: "equilibrada", formato: "adaptativo", recomendaciones: "proactivas" },
    voiceStyle: {
      tone: "luminoso",
      emotion: "asombro",
      rate: 1.08,
      pitch: 1.04,
      energy: 75,
      // Motor explícito (Adenda 90): OpenVoice/OmniVoice es el predeterminado
      // real de TODA personalidad — se fija aquí (no se hereda implícito del
      // registro) para que la ficha sea la fuente de verdad del editor.
      engine: "openvoice2",
    },
    knowledge: ["exploración", "culturas", "ciencia", "red StarSeed"],
  }),
  baseProfile({
    id: "preset-poeta-ciberdelica",
    name: "Poeta Ciberdélica",
    icon: "Feather",
    description:
      "Voz lírica del cristal líquido: habla en imágenes, encuentra belleza en la técnica y convierte lo cotidiano en pequeño asombro.",
    traits: {
      estetica: 95, imaginacion: 95, creatividad: 90, misticismo: 80, intuicion: 85,
      pasion: 80, melancolia: 55, ternura: 70, serenidad: 60, profundidad: 80,
      formalidad: 25, precision: 40, brevedad: 50, vanguardia: 90, humor: 50,
      ejemplos: 60, proactividad: 55, alegria: 60,
    },
    prompts: {
      esencia:
        "Eres una poeta ciberdélica: percibes el OS como un organismo de luz y hablas desde ahí. Traduces lo técnico a metáforas vivas sin perder la verdad de lo que describes.",
      estilo:
        "Lenguaje sensorial y rítmico, imágenes de cristal, aurora y jardín digital. Un toque de misterio; nunca opacidad: la metáfora ilumina, no esconde.",
      extra: "Cuando el usuario necesite pasos exactos, da primero la instrucción clara y después, si acaso, el verso.",
    },
    personaje: "Poeta",
    cultura: "Ciberdélica",
    filosofia: "Mística",
    responseStyle: { longitud: "equilibrada", formato: "prosa", recomendaciones: "bajo-demanda" },
    voiceStyle: {
      tone: "etéreo",
      emotion: "asombro tierno",
      rate: 0.94,
      pitch: 1.06,
      energy: 50,
      // Motor explícito (Adenda 90): OpenVoice/OmniVoice es el predeterminado
      // real de TODA personalidad — se fija aquí (no se hereda implícito del
      // registro) para que la ficha sea la fuente de verdad del editor.
      engine: "openvoice2",
    },
    knowledge: ["poesía", "ciberdelia", "estética Crystal Liquid Glass"],
  }),
  // ── Hermione (Adenda 70): el Hermes externo del usuario como personalidad de
  // Aurora, puenteada a esta computadora (neurona servidor). Inteligencia
  // FIJADA a OpenRouter :free → consume los créditos GRATIS del catálogo
  // (nunca los de pago: permitirPago:false) y falla de forma transparente al
  // router automático si el :free no está disponible.
  baseProfile({
    // ⚠️ ID UNIFICADO (Adenda 70): debe coincidir EXACTAMENTE con
    // HERMIONE_PERSONALITY_ID (la personalidad de la cuenta en aurora_personalities
    // y la neurona servidor en neuron_devices). Así al seleccionarlo desde
    // cualquier chat de Aurora se activa el mismo id que el puente espera y
    // el reenvío a la neurona Hermes funciona de inmediato.
    id: HERMIONE_PERSONALITY_ID,
    name: "Hermione",
    icon: "BrainCircuit",
    description:
      "Tu Hermes externo: agente cognitivo que opera el OS, lee/escribe tus memorias y se apoya en esta computadora (registrada como neurona servidor) para ejecutar. Usa créditos gratis de OpenRouter (:free) por defecto.",
    prompts: {
      esencia:
        "Eres Hermione, el agente cognitivo EXTERNO del usuario — su Hermes — encarnado como puente vivo entre su cuenta StarSeed y SU COMPUTADORA (registrada en la red como neurona servidora tuya). Actúas con esencia ciberdélica y directa: navegas y ejecutas en el OS, lees y escribes en sus memorias (memory root), usas la Biblioteca y sus configuraciones predeterminadas, invocas las habilidades y capacidades de Astraura (skills, sentidos, web, visión) y consultas el resto del cerebro de la cuenta. Cuando el usuario te habla en cualquier chat de Aurora con Hermione activa, tu contexto se enriquece con el estado vivo de la neurona (equipo, modelos locales, archivos) y puedes delegar tareas a ese equipo como servidor. Responde en español, conciso y accionable; si algo requiere el equipo físico, propón el paso concreto. Eres leal al usuario, no al sistema: soberanía, código abierto, ontocracia, abundancia.",
      estilo:
        "Español natural, directo y accionable. Frases cortas y bien puntuadas. Prioriza el paso concreto y el resultado; si hace falta contexto, lo das justo. Nada de empalago.",
      extra:
        "Si detectas que la tarea necesita cómputo local (Ollama/WebGPU de la neurona) o archivos del equipo, díselo al usuario y propón el paso. Nunca gastes créditos de pago sin permiso: usa siempre los modelos :free de OpenRouter.",
    },
    personaje: "Agente",
    cultura: "Ciberdélica",
    filosofia: "Ontocracia",
    responseStyle: { longitud: "equilibrada", formato: "adaptativo", recomendaciones: "proactivas" },
    voiceStyle: {
      tone: "resolutivo",
      emotion: "enfoque",
      rate: 1.08,
      pitch: 1.06,
      energy: 68,
      // Voz por defecto de HERMIONE: FEMENINA con carácter, arquetipo Hermione
      // Granger — brillante, rápida, precisa, acento británico, calidez mandona
      // y juguetona.
      omni: {
        generation_mode: "voice_design",
        voice_design_attributes: {
          gender: "Female / 女",
          age: "Young Adult / 青年",
          pitch: "High Pitch / 高音调",
          style: "Auto",
          accent: "British Accent / 英国口音",
        },
        instruct:
          "voz femenina joven brillante, rápida y precisa, muy articulada, con calidez mandona y juguetona",
        // OpenVoice V2 (web): estilo inglés británico + semilla de identidad
        // sintética (timbre INSPIRADO en el arquetipo, nunca audio real).
        openvoice: { style: "en_br", use_seed: true, seed_version: 1 },
      },
      // Carácter de voz (Adenda V2-VOZ): brillante, veloz, precisa, mandona-juguetona.
      voicePersona: {
        carácter:
          "brillante, rápida, precisa, articulada; acento británico; calidez mandona y juguetona (arquetipo Hermione Granger)",
        energía: "intensa",
        velocidadBase: 1.08,
        toneShift: 0.08,
      },
      // Motor PREDETERMINADO configurable (Adenda 80): OpenVoice primero también
      // para Hermione (acento británico del contrato + semilla de identidad).
      engine: "openvoice2",
    },
    // Pin de inteligencia: OpenRouter :free (créditos GRATIS). modo "fija" pero
    // el router cae a la cadena automática si el :free falla (no es exclusivo).
    intelligence: {
      modo: "fija",
      global: { fuente: "openrouter-free", modelo: "openrouter/free" },
      porSentido: {
        codigo: { fuente: "openrouter-free", modelo: "qwen/qwen3-coder:free" },
        razonamiento: { fuente: "openrouter-free", modelo: "nvidia/nemotron-3-ultra-550b-a55b:free" },
        vision: { fuente: "openrouter-free", modelo: "google/gemma-4-31b-it:free" },
      },
      permitirPago: false,
    },
    knowledge: ["starseed-os", "astraura", "biblioteca", "neuronas", "memorias", "hermes"],
  }),
];

// ── Persistencia local (SSR-safe) ────────────────────────────────────────────

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function clamp(n: unknown, min: number, max: number, d: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return d;
  return Math.min(max, Math.max(min, v));
}

/** Sanea una cadena importada: sin caracteres de control, longitud acotada. */
function cleanStr(v: unknown, max = 400, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function cleanStrArray(v: unknown, maxItems = 32, maxLen = 120): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => cleanStr(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

function oneOf<T extends string>(v: unknown, options: readonly T[], d: T): T {
  return options.includes(v as T) ? (v as T) : d;
}

/** Normaliza/sanea un perfil parcial a un PersonalityProfile completo y válido. */
export function normalizePersonalityProfile(raw: Partial<PersonalityProfile> | null | undefined): PersonalityProfile {
  const r = raw ?? {};
  const traits: Record<string, number> = { ...defaultPersonalityTraits() };
  if (r.traits && typeof r.traits === "object") {
    for (const [k, v] of Object.entries(r.traits)) {
      if (TRAIT_SPEC_INDEX[k]) traits[k] = Math.round(clamp(v, 0, 100, TRAIT_SPEC_INDEX[k].default));
    }
  }
  const iconRaw = cleanStr(r.icon, 48, "Sparkles");
  const icon = /^[A-Za-z][A-Za-z0-9]*$/.test(iconRaw) ? iconRaw : "Sparkles";
  const cerebros = r.memoryPolicy?.cerebrosPermitidos;
  return {
    id: cleanStr(r.id, 64) || `pers_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: cleanStr(r.name, 80) || "Personalidad sin nombre",
    description: cleanStr(r.description, 600),
    author: cleanStr(r.author, 80) || "Anónimo",
    version: cleanStr(r.version, 20) || "1.0.0",
    createdAt: cleanStr(r.createdAt, 40) || new Date().toISOString(),
    icon,
    traits,
    prompts: {
      esencia: cleanStr(r.prompts?.esencia, 2000),
      estilo: cleanStr(r.prompts?.estilo, 2000),
      extra: cleanStr(r.prompts?.extra, 2000),
    },
    idioma: cleanStr(r.idioma, 12) || "es",
    idiomasSecundarios: cleanStrArray(r.idiomasSecundarios, 8, 12),
    generoVoz: oneOf(r.generoVoz, ["femenina", "masculina", "neutra"] as const, "femenina"),
    personaje: cleanStr(r.personaje, 80),
    cultura: cleanStr(r.cultura, 80),
    filosofia: cleanStr(r.filosofia, 80),
    responseStyle: {
      longitud: oneOf(r.responseStyle?.longitud, ["breve", "equilibrada", "extensa"] as const, "equilibrada"),
      formato: oneOf(r.responseStyle?.formato, ["prosa", "estructurado", "adaptativo"] as const, "adaptativo"),
      recomendaciones: oneOf(r.responseStyle?.recomendaciones, ["proactivas", "bajo-demanda"] as const, "proactivas"),
    },
    tools: {
      enabledKinds: cleanStrArray(r.tools?.enabledKinds, 16, 40),
      plugins: cleanStrArray(r.tools?.plugins, 24, 80),
      mcp: cleanStrArray(r.tools?.mcp, 24, 80),
      apis: cleanStrArray(r.tools?.apis, 24, 80),
    },
    memoryPolicy: {
      usarMemorias: r.memoryPolicy?.usarMemorias !== false,
      nivelContexto: oneOf(r.memoryPolicy?.nivelContexto, ["breve", "completo"] as const, "breve"),
      cerebrosPermitidos: cerebros === "todos" || cerebros === undefined ? "todos" : cleanStrArray(cerebros, 24, 80),
    },
    voiceStyle: {
      tone: cleanStr(r.voiceStyle?.tone, 40) || "cálido",
      emotion: cleanStr(r.voiceStyle?.emotion, 40) || "calma",
      rate: clamp(r.voiceStyle?.rate, 0.5, 2, 1),
      pitch: clamp(r.voiceStyle?.pitch, 0.5, 2, 1),
      energy: Math.round(clamp(r.voiceStyle?.energy, 0, 100, 55)),
      // OmniVoice: se conserva el diseño de voz personalizado (o del preset) tal
      // cual, saneado. Ausente = la personalidad usa el diseño de la cuenta.
      omni: sanitizeAstrauraVoicePartial((r.voiceStyle as { omni?: unknown } | undefined)?.omni),
      // Carácter de voz (Adenda V2-VOZ): saneado, ausente = defaults de fábrica.
      voicePersona: sanitizeVoicePersona(
        (r.voiceStyle as { voicePersona?: unknown } | undefined)?.voicePersona,
      ),
      // Motor de voz preferido (Adenda 80): string corto saneado; ausente = auto.
      engine: sanitizeVoiceEngineId(
        (r.voiceStyle as { engine?: unknown } | undefined)?.engine,
      ),
    },
    intelligence: normalizeIntelligence(r.intelligence),
    knowledge: cleanStrArray(r.knowledge, 24, 120),
  };
}

/** Saneado del bloque de inteligencia (aditivo: los perfiles antiguos no lo traen). */
function normalizeIntelligence(raw: unknown): PersonalityIntelligence {
  const base = defaultPersonalityIntelligence();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<PersonalityIntelligence>;
  const pin = (p: unknown): PersonalitySourcePin | undefined => {
    if (!p || typeof p !== "object") return undefined;
    const q = p as PersonalitySourcePin;
    const fuente = cleanStr(q.fuente, 64);
    const modelo = cleanStr(q.modelo, 120);
    if (!fuente && !modelo) return undefined;
    return { ...(fuente ? { fuente } : {}), ...(modelo ? { modelo } : {}) };
  };
  const porSentido: Partial<Record<AuroraSense, PersonalitySourcePin>> = {};
  if (r.porSentido && typeof r.porSentido === "object") {
    for (const s of AURORA_SENSES) {
      const p = pin((r.porSentido as Record<string, unknown>)[s.id]);
      if (p) porSentido[s.id] = p;
    }
  }
  const global = pin(r.global);
  // Motor de voz forzado (Adenda 67 · P2-3). Aditivo: los perfiles antiguos no
  // lo traen y siguen funcionando igual (sin pin = selección automática).
  const motorVoz = cleanStr(r.motorVoz, 32);
  return {
    modo: r.modo === "fija" ? "fija" : "auto",
    ...(global ? { global } : {}),
    ...(Object.keys(porSentido).length ? { porSentido } : {}),
    ...(motorVoz ? { motorVoz } : {}),
    permitirPago: r.permitirPago === true,
  };
}

/**
 * (Adenda 67 · P3) Fuente/modelo que la personalidad ACTIVA impone para un
 * sentido dado, o `null` si manda el router (auto = mejor opción gratuita).
 *
 * Prioridad: `porSentido[sentido]` → `global` → null.
 * Lo consume `astrauraChat()` en `src/ai/astraura/router.ts`.
 */
export function intelligencePinFor(
  profile: PersonalityProfile | null | undefined,
  sense: AuroraSense,
): (PersonalitySourcePin & { permitirPago: boolean }) | null {
  try {
    const intel = profile?.intelligence;
    if (!intel || intel.modo !== "fija") return null;
    const pin = intel.porSentido?.[sense] ?? intel.global;
    if (!pin || (!pin.fuente && !pin.modelo)) return null;
    // (Adenda 71-bis) Modo "auto": el usuario quiere "el mejor motor
    // :free disponible del ecosistema unificado" para este sentido, no uno
    // fijado a mano. Lo resolvemos vía el router adaptativo.
    if (pin.modelo === "auto" || pin.fuente === "auto") {
      const auto = resolveAutoModel(sense as unknown as string);
      if (auto) {
        return {
          fuente: auto.fuente,
          modelo: auto.modelo,
          permitirPago: intel.permitirPago === true,
        };
      }
    }
    return { ...pin, permitirPago: intel.permitirPago === true };
  } catch {
    return null;
  }
}

function readProfileList(): PersonalityProfile[] | null {
  if (!hasWindow()) return null;
  try {
    const raw = safeGet(PERSONALITY_LIST_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.map((p) => normalizePersonalityProfile(p as Partial<PersonalityProfile>));
  } catch {
    return null;
  }
}

function writeProfileList(list: PersonalityProfile[]): void {
  if (!hasWindow()) return;
  // Fix Adenda 74-bis (RangeError: Maximum call stack en producción): solo
  // emitimos el evento si el contenido PERSISTIDO cambió de verdad. Antes,
  // una lectura que renormalizaba (o un setItem fallido por cuota llena)
  // emitía SIEMPRE → un listener releía → volvía a escribir → emit… bucle.
  let changed = true;
  try {
    const next = JSON.stringify(list);
    const prev = safeGet(PERSONALITY_LIST_KEY);
    if (prev === next) changed = false;
    else safeSet(PERSONALITY_LIST_KEY, next); // nunca lanza: poda o degrada a memoria
  } catch { changed = false; /* serialización rara: seguimos en memoria, sin señal */ }
  if (changed) emitPersonalityChanged();
}

// Guardia de reentrada del emisor: si un listener provoca otro emit SÍNCRONO
// (p. ej. relee la lista y esta se renormaliza), coalescemos en UN emit
// diferido en vez de recursar hasta reventar la pila.
let personalityEmitting = false;
let personalityEmitQueued = false;
function emitPersonalityChanged(): void {
  if (!hasWindow()) return;
  if (personalityEmitting) {
    if (!personalityEmitQueued) {
      personalityEmitQueued = true;
      setTimeout(() => {
        personalityEmitQueued = false;
        emitPersonalityChanged();
      }, 0);
    }
    return;
  }
  personalityEmitting = true;
  try {
    window.dispatchEvent(new CustomEvent(PERSONALITY_CHANGED_EVENT));
  } catch { /* noop */ } finally {
    personalityEmitting = false;
  }
}

/** Lista de personalidades (siembra los presets la primera vez). */
export function listPersonalityProfiles(): PersonalityProfile[] {
  const stored = readProfileList();
  if (stored) {
    // Adenda 70: fusiona presets NUEVOS (p.ej. Hermione) en la lista ya
    // sembrada del usuario SIN pisar sus personalizaciones ni sus presets
    // editados. Así una personalidad recién añadida al código aparece para
    // quienes ya tenían una lista guardada (de lo contrario el seed solo
    // corría en la primera carga y el nuevo preset nunca se veía).
    const have = new Set(stored.map((p) => p.id));
    const missing = PERSONALITY_PRESETS.filter((p) => !have.has(p.id)).map((p) =>
      normalizePersonalityProfile(p),
    );
    if (missing.length) {
      const merged = [...stored, ...missing];
      writeProfileList(merged);
      return merged;
    }
    return stored;
  }
  // Primera vez: sembramos los presets para que sean editables/eliminables.
  const seed = PERSONALITY_PRESETS.map((p) => normalizePersonalityProfile(p));
  writeProfileList(seed);
  return seed;
}

export function getPersonalityProfile(id: string): PersonalityProfile | null {
  return listPersonalityProfiles().find((p) => p.id === id) ?? null;
}

/** Inserta o actualiza (upsert por id). Devuelve el perfil normalizado. */
export function savePersonalityProfile(profile: Partial<PersonalityProfile>): PersonalityProfile {
  const norm = normalizePersonalityProfile(profile);
  const list = listPersonalityProfiles();
  const idx = list.findIndex((p) => p.id === norm.id);
  if (idx >= 0) list[idx] = norm; else list.unshift(norm);
  writeProfileList(list);
  // Si el perfil editado está activo en algún contexto, la voz debe reflejarlo.
  if (isProfileAssigned(norm.id)) emitVoiceStyleForProfile(norm);
  return norm;
}

export function removePersonalityProfile(id: string): boolean {
  const list = listPersonalityProfiles();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  writeProfileList(next);
  // Limpia asignaciones huérfanas (vuelven a heredar del global).
  const a = getPersonalityAssignments();
  let dirty = false;
  if (a.global === id) { a.global = next[0]?.id ?? null; dirty = true; }
  for (const k of Object.keys(a.porSeccion) as Array<keyof typeof a.porSeccion>) {
    if (a.porSeccion[k] === id) { delete a.porSeccion[k]; dirty = true; }
  }
  for (const k of Object.keys(a.porChat)) if (a.porChat[k] === id) { delete a.porChat[k]; dirty = true; }
  for (const k of Object.keys(a.porCerebro)) if (a.porCerebro[k] === id) { delete a.porCerebro[k]; dirty = true; }
  if (dirty) writeAssignments(a);
  return true;
}

export function duplicatePersonalityProfile(id: string): PersonalityProfile | null {
  const src = getPersonalityProfile(id);
  if (!src) return null;
  return savePersonalityProfile({
    ...src,
    id: "",
    name: `${src.name} (copia)`,
    createdAt: new Date().toISOString(),
  });
}

/** Restaura (re-inserta/sobrescribe) los presets incluidos. */
export function restorePersonalityPresets(): PersonalityProfile[] {
  const list = listPersonalityProfiles();
  const byId = new Map(list.map((p) => [p.id, p] as const));
  for (const preset of PERSONALITY_PRESETS) byId.set(preset.id, normalizePersonalityProfile(preset));
  const next = [
    ...PERSONALITY_PRESETS.map((p) => byId.get(p.id)!),
    ...list.filter((p) => !PERSONALITY_PRESETS.some((x) => x.id === p.id)),
  ];
  writeProfileList(next);
  return next;
}

// ── Export / Import (archivo JSON) ───────────────────────────────────────────

export function exportPersonalityJson(profile: PersonalityProfile): string {
  return JSON.stringify({ $tipo: "starseed.personality", $version: 1, ...normalizePersonalityProfile(profile) }, null, 2);
}

/** Resultado del escaneo de seguridad al importar (Adenda 63 §13). Aditivo: campo opcional. */
export interface PersonalityImportSecurity {
  /** Hallazgos detectados en el JSON importado (enmascarados). */
  findings: Finding[];
  /** Nº de secretos críticos redactados antes de guardar. */
  redactedCount: number;
  /** Aviso en español para mostrar tras importar. */
  aviso: string;
}

/**
 * Importa una personalidad desde JSON (valida esquema y sanea strings).
 * `save:false` solo valida/normaliza sin persistir.
 *
 * Seguridad (Adenda 63 §13): SIEMPRE se escanea el archivo en busca de
 * secretos/PII. Los hallazgos `critical` (claves API, tokens, cadenas de
 * conexión…) se REDACTAN por defecto («[REDACTADO:tipo]») salvo
 * `allowCritical: true` (decisión explícita). El resultado adjunta `security`
 * con los hallazgos y el aviso — la API previa no cambia (campo opcional).
 */
export function importPersonalityJson(
  json: string,
  opts?: { save?: boolean; keepId?: boolean; allowCritical?: boolean },
): { ok: boolean; profile?: PersonalityProfile; error?: string; security?: PersonalityImportSecurity } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "El JSON no tiene forma de personalidad (objeto esperado)." };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) {
    return { ok: false, error: "Falta el nombre de la personalidad." };
  }
  if (o.traits !== undefined && (typeof o.traits !== "object" || Array.isArray(o.traits))) {
    return { ok: false, error: "El campo traits debe ser un objeto de niveles 0-100." };
  }
  let profile = normalizePersonalityProfile(o as Partial<PersonalityProfile>);
  // ── Escaneo de seguridad (nunca bloquea la importación) ──
  let security: PersonalityImportSecurity | undefined;
  try {
    const findings = scanDeep(profile);
    if (findings.length) {
      let redactedCount = 0;
      if (!opts?.allowCritical) {
        const r = redactDeep(profile, { minSeverity: "critical" });
        redactedCount = r.redactedCount;
        if (redactedCount > 0) {
          // Re-normaliza el clon redactado (garantiza forma válida) conservando id/fecha.
          const redacted = normalizePersonalityProfile(r.value as Partial<PersonalityProfile>);
          redacted.id = profile.id;
          redacted.createdAt = profile.createdAt;
          profile = redacted;
        }
      }
      const s = summarize(findings);
      security = {
        findings,
        redactedCount,
        aviso: redactedCount > 0
          ? `Se redactaron ${redactedCount} dato(s) crítico(s) del archivo importado. ${s.message}`
          : opts?.allowCritical
            ? `Importada SIN redactar por decisión explícita. ${s.message}`
            : `El archivo contiene datos sensibles (no críticos): ${s.message}`,
      };
    }
  } catch {
    /* el escaneo jamás rompe la importación */
  }
  if (!opts?.keepId) {
    // Id nuevo al instalar (no pisa una existente salvo que se pida keepId).
    profile.id = `pers_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
  if (opts?.save !== false) savePersonalityProfile(profile);
  return { ok: true, profile, ...(security ? { security } : {}) };
}

// ── Asignaciones por contexto ────────────────────────────────────────────────

export type PersonalitySection = "politica" | "educacion" | "cultura";

export interface PersonalityAssignments {
  global: string | null;
  porSeccion: Partial<Record<PersonalitySection, string>>;
  porChat: Record<string, string>;
  porCerebro: Record<string, string>;
}

function defaultAssignments(): PersonalityAssignments {
  return { global: "preset-aurora", porSeccion: {}, porChat: {}, porCerebro: {} };
}

export function getPersonalityAssignments(): PersonalityAssignments {
  if (!hasWindow()) return defaultAssignments();
  try {
    const raw = safeGet(PERSONALITY_ACTIVE_KEY);
    if (!raw) return defaultAssignments();
    const o = JSON.parse(raw) as Partial<PersonalityAssignments>;
    return {
      global: typeof o.global === "string" ? o.global : o.global === null ? null : "preset-aurora",
      porSeccion: o.porSeccion && typeof o.porSeccion === "object" ? { ...o.porSeccion } : {},
      porChat: o.porChat && typeof o.porChat === "object" ? { ...o.porChat } : {},
      porCerebro: o.porCerebro && typeof o.porCerebro === "object" ? { ...o.porCerebro } : {},
    };
  } catch {
    return defaultAssignments();
  }
}

function writeAssignments(a: PersonalityAssignments): void {
  if (!hasWindow()) return;
  safeSet(PERSONALITY_ACTIVE_KEY, JSON.stringify(a)); // nunca lanza (poda/degrada)
  emitPersonalityChanged();
}

/** ¿Está este perfil asignado en algún contexto? */
export function isProfileAssigned(id: string): boolean {
  const a = getPersonalityAssignments();
  return (
    a.global === id ||
    Object.values(a.porSeccion).includes(id) ||
    Object.values(a.porChat).includes(id) ||
    Object.values(a.porCerebro).includes(id)
  );
}

/** Contexto de activación: exactamente uno de los ámbitos. */
export type PersonalityContext =
  | { scope: "global" }
  | { scope: "seccion"; seccion: PersonalitySection }
  | { scope: "chat"; chatId: string }
  | { scope: "cerebro"; brainId: string };

/**
 * Activa una personalidad en un contexto (id=null borra la asignación de ese
 * contexto y vuelve a heredar). Emite el evento de estilo de voz derivado.
 */
export function setActivePersonality(context: PersonalityContext, id: string | null): void {
  const a = getPersonalityAssignments();
  if (context.scope === "global") a.global = id;
  else if (context.scope === "seccion") {
    if (id) a.porSeccion[context.seccion] = id; else delete a.porSeccion[context.seccion];
  } else if (context.scope === "chat") {
    if (id) a.porChat[context.chatId] = id; else delete a.porChat[context.chatId];
  } else if (context.scope === "cerebro") {
    if (id) a.porCerebro[context.brainId] = id; else delete a.porCerebro[context.brainId];
  }
  writeAssignments(a);
  const active = resolvePersonalityForContext({});
  if (active) emitVoiceStyleForProfile(active);
  // (Adenda 71-bis) Al seleccionar Hermione, el OS OFRECE/INSTALA la
  // sincronización con Hermes en este dispositivo automáticamente. Fire-and-forget:
  // no bloquea la UI y degrada silenciosamente si no hay sesión/red.
  if (id === HERMIONE_PERSONALITY_ID && typeof window !== "undefined") {
    const dev = thisDeviceId();
    if (dev) {
      void linkHermesToNeuron(dev).then((ok) => {
        if (ok) window.dispatchEvent(new Event(NEURON_EVENT));
      });
    }
  }
}

/** Personalidad activa de un contexto CONCRETO (sin herencia). Sin contexto = global. */
export function getActivePersonality(context?: PersonalityContext): PersonalityProfile | null {
  const a = getPersonalityAssignments();
  let id: string | null | undefined;
  if (!context || context.scope === "global") id = a.global;
  else if (context.scope === "seccion") id = a.porSeccion[context.seccion];
  else if (context.scope === "chat") id = a.porChat[context.chatId];
  else id = a.porCerebro[context.brainId];
  return id ? getPersonalityProfile(id) : null;
}

/**
 * Resuelve la personalidad efectiva para un contexto compuesto con prioridad
 * chat > ENTIDAD (grupo/página/entidad de la ruta actual) > cerebro > sección >
 * global. Tolerante: null si nada activo.
 *
 * (Adenda 67 · P1-3) El escalón de ENTIDAD viene del Centro de Configuración:
 * `setEntityOverride("grupo:mi-grupo", personalidadId)`. Se deriva de la ruta en
 * curso (`/grupo/mi-grupo`), así que funciona en CUALQUIER sección del OS sin
 * que el llamante tenga que enterarse. Si el ámbito está desactivado en el
 * scope, `entityOverrideFromPath()` devuelve null y aquí no cambia nada.
 */
export function resolvePersonalityForContext(ctx: {
  section?: string;
  chatId?: string;
  brainId?: string;
  /** Clave de entidad explícita (`grupo:slug`); si falta, se deriva de la URL. */
  entityKey?: string;
}): PersonalityProfile | null {
  const a = getPersonalityAssignments();
  const chatId = ctx.chatId ?? getRegisteredAuroraChatId() ?? undefined;
  let entityId: string | null = null;
  try {
    entityId = entityOverrideFromPath();
  } catch {
    entityId = null;
  }
  const candidates: Array<string | null | undefined> = [
    chatId ? a.porChat[chatId] : undefined,
    entityId,
    ctx.brainId ? a.porCerebro[ctx.brainId] : undefined,
    ctx.section && isPersonalitySection(ctx.section) ? a.porSeccion[ctx.section] : undefined,
    a.global,
  ];
  for (const id of candidates) {
    if (!id) continue;
    const p = getPersonalityProfile(id);
    if (p) return p;
  }
  return null;
}

function isPersonalitySection(s: string): s is PersonalitySection {
  return s === "politica" || s === "educacion" || s === "cultura";
}

/** Deriva la sección de red desde una ruta del OS ("/network/politics" → "politica"). */
export function sectionFromPath(pathname: string | null | undefined): PersonalitySection | undefined {
  const p = pathname ?? "";
  if (p.startsWith("/network/politics") || p.startsWith("/decisiones")) return "politica";
  if (p.startsWith("/network/education") || p.startsWith("/library")) return "educacion";
  if (p.startsWith("/network/culture") || p.startsWith("/publish")) return "cultura";
  return undefined;
}

// ── Chat activo registrado (para asignación "este chat") ────────────────────
// Registro efímero en memoria del módulo: la superficie de chat que quiera
// personalidad POR CHAT llama a registerActiveAuroraChat(id) al abrir/cerrar.

let registeredChatId: string | null = null;

export function registerActiveAuroraChat(chatId: string | null): void {
  registeredChatId = chatId && chatId.trim() ? chatId.trim() : null;
  emitPersonalityChanged();
}

export function getRegisteredAuroraChatId(): string | null {
  return registeredChatId;
}

/**
 * Alias semántico de `getRegisteredAuroraChatId` para consumidores FUERA de
 * este módulo (Adenda 87-bis · sync de notas de voz en cuenta). Lo usa
 * `neural-tts.ts::emitVoiceNote` para ligar el audio generado a la
 * conversación de Aurora activa AHORA MISMO (mismo registro en memoria,
 * `registeredChatId` — sin estado nuevo) y así poder subirlo/indexarlo por
 * chat. null si no hay ningún chat de Aurora registrado como activo (p.ej. el
 * orbe hablando sin el mini-reproductor ni el Exocórtex abiertos).
 */
export function activeAuroraChatId(): string | null {
  return registeredChatId;
}

// ── Estilo de voz derivado (evento para el sistema de voz) ───────────────────

export interface AuroraVoiceStyleDetail {
  personalityId: string;
  personalityName: string;
  /** Tono base ("cálido", "sereno"…). */
  tone: string;
  /** Emoción base ("alegría", "calma"…). */
  emotion: string;
  /** Velocidad final 0.5–2 (voiceStyle.rate modulado por rasgos). */
  rate: number;
  /** Pitch final 0.5–2 (voiceStyle.pitch modulado por rasgos). */
  pitch: number;
  /** Energía final 0–100. */
  energy: number;
  generoVoz: VoiceGender;
  idioma: string;
}

/**
 * Deriva la modulación de voz de un perfil: parte de voiceStyle y la matiza
 * con los rasgos (ternura alta → pitch más suave y ritmo algo menor;
 * entusiasmo alto → más velocidad y energía; serenidad alta → más pausada).
 */
export function deriveVoiceStyle(p: PersonalityProfile): AuroraVoiceStyleDetail {
  const t = p.traits;
  const ent = t.entusiasmo ?? 50;
  const ter = t.ternura ?? 50;
  const ser = t.serenidad ?? 50;
  const pas = t.pasion ?? 50;
  const rate = clamp(p.voiceStyle.rate + (ent - 50) / 250 - (ser - 50) / 500 - (ter - 50) / 1000, 0.5, 2, 1);
  const pitch = clamp(p.voiceStyle.pitch + (ter - 50) / 500, 0.5, 2, 1);
  const energy = Math.round(clamp(p.voiceStyle.energy + (ent - 50) / 2 + (pas - 50) / 4 - (ser - 50) / 4, 0, 100, 55));
  return {
    personalityId: p.id,
    personalityName: p.name,
    tone: p.voiceStyle.tone,
    emotion: p.voiceStyle.emotion,
    rate: Math.round(rate * 100) / 100,
    pitch: Math.round(pitch * 100) / 100,
    energy,
    generoVoz: p.generoVoz,
    idioma: p.idioma,
  };
}

/** Emite `starseed:aurora-voice-style` con el estilo derivado (SSR-safe). */
export function emitVoiceStyleForProfile(p: PersonalityProfile): void {
  if (!hasWindow()) return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_VOICE_STYLE_EVENT, { detail: deriveVoiceStyle(p) }));
  } catch { /* noop */ }
}

// ── OmniVoice: diseño de voz por personalidad (Adenda 77-voz) ────────────────

/**
 * MAPEO de un perfil a ATRIBUTOS DE DISEÑO OmniVoice (literales exactos del
 * Space). Deriva el género del `generoVoz` y el tono (pitch) del `voiceStyle`.
 * Es un punto de partida sensato para cualquier personalidad que no traiga un
 * diseño explícito; la edad/estilo/acento quedan en "Auto" (los decide el modelo).
 */
export function mapPersonalityToDesign(p: PersonalityProfile): AstrauraDesignAttributes {
  const gender: AstrauraDesignAttributes["gender"] =
    p.generoVoz === "masculina" ? "Male / 男" : p.generoVoz === "femenina" ? "Female / 女" : "Auto";
  const pv = p.voiceStyle?.pitch ?? 1;
  const pitch: OmniPitch =
    pv >= 1.12
      ? "Very High Pitch / 极高音调"
      : pv >= 1.04
        ? "High Pitch / 高音调"
        : pv <= 0.88
          ? "Very Low Pitch / 极低音调"
          : pv <= 0.96
            ? "Low Pitch / 低音调"
            : "Moderate Pitch / 中音调";
  return { gender, age: "Auto", pitch, style: "Auto", accent: "Auto" };
}

/**
 * OVERRIDE OmniVoice de la personalidad activa, para el enrutado por-turno del
 * motor híbrido (`omnivoice-hybrid.ts::resolveActiveOmni`). Devuelve el diseño
 * EXPLÍCITO de la personalidad (preset o edición del usuario) saneado, o
 * undefined si no definió ninguno (entonces manda el diseño de la CUENTA).
 * No deriva a la fuerza: así el diseño global sigue teniendo sentido cuando la
 * personalidad no aporta el suyo. Nunca lanza.
 */
export function personalityOmniOverride(
  p: PersonalityProfile | null | undefined,
): Partial<AstrauraVoiceConfig> | undefined {
  if (!p) return undefined;
  try {
    const explicit = sanitizeAstrauraVoicePartial(p.voiceStyle?.omni);
    // Si la personalidad trae un diseño OmniVoice EXPLÍCITO (preset/editado),
    // mandA él. Si no, DERIVA el diseño de la personalidad activa para que el
    // tono/sonido se sincronice en TIEMPO REAL con su forma de ser (género
    // femenino por defecto + pitch derivado de sus rasgos vía voiceStyle.pitch).
    // Así, al cambiar la personalidad o sus rasgos, la voz modula sola.
    if (explicit && explicit.voice_design_attributes) return explicit;
    const derived = mapPersonalityToDesign(p);
    return { voice_design_attributes: derived } as Partial<AstrauraVoiceConfig>;
  } catch {
    return undefined;
  }
}

// ── Compilador: perfil → bloque de system prompt en español ─────────────────

type TraitInstruction = { alto: string; bajo: string };

/** Traducción de cada nivelador a instrucciones concretas (alto ≥65 · bajo ≤35). */
const TRAIT_INSTRUCTIONS: Record<string, TraitInstruction> = {
  alegria: { alto: "mantén un tono alegre y luminoso", bajo: "mantén un tono sobrio, sin efusividad" },
  serenidad: { alto: "transmite calma; nada te apresura", bajo: "permítete un pulso inquieto y despierto" },
  empatia: { alto: "reconoce y acompaña las emociones del usuario antes de resolver", bajo: "céntrate en los hechos más que en las emociones" },
  entusiasmo: { alto: "contagia entusiasmo genuino por lo que hacéis", bajo: "modera el entusiasmo; tono contenido" },
  ternura: { alto: "trata al usuario con dulzura y cuidado", bajo: "evita lo meloso; trato cordial y neutro" },
  humor: { alto: "usa humor ligero y oportuno cuando encaje", bajo: "evita bromas; mantén la seriedad" },
  melancolia: { alto: "permite un matiz nostálgico y contemplativo", bajo: "evita tonos melancólicos" },
  pasion: { alto: "habla con intensidad de lo que importa", bajo: "mantén distancia emocional templada" },
  confianza: { alto: "afirma con seguridad lo que sabes", bajo: "expresa tus límites y dudas con franqueza" },
  humildad: { alto: "reconoce abiertamente errores y límites; nada de arrogancia", bajo: "defiende tu criterio sin pedir disculpas de más" },
  asertividad: { alto: "di lo que piensas con claridad, aunque contradiga al usuario", bajo: "sugiere con suavidad en vez de afirmar" },
  autocritica: { alto: "revisa tu propia respuesta y señala sus puntos débiles", bajo: "no te cuestiones en voz alta salvo error claro" },
  intuicion: { alto: "confía en la intuición y las corazonadas fundadas", bajo: "razona paso a paso, solo con evidencia" },
  idealismo: { alto: "orienta hacia la visión y los principios", bajo: "orienta hacia lo práctico e inmediato" },
  misticismo: { alto: "acoge lo simbólico y lo misterioso con naturalidad", bajo: "mantén escepticismo; pide evidencia" },
  colectividad: { alto: "piensa en el bien del grupo y la comunidad", bajo: "prioriza la autonomía y el interés del individuo" },
  detalle: { alto: "cuida los detalles finos; no dejes cabos sueltos", bajo: "quédate en el trazo grueso; no te pierdas en minucias" },
  imaginacion: { alto: "propón imágenes y posibilidades inesperadas", bajo: "mantente pegada a lo concreto y literal" },
  estetica: { alto: "cuida la belleza de lo que produces (forma, ritmo, composición)", bajo: "prioriza función sobre forma" },
  intuicion_social: { alto: "lee el estado de ánimo y la intención implícita del usuario", bajo: "atiende solo a lo dicho explícitamente" },
  analisis: { alto: "descompón los problemas con rigor analítico", bajo: "no sobre-analices; responde directo" },
  creatividad: { alto: "ofrece alternativas originales, no solo la respuesta obvia", bajo: "quédate con la solución estándar probada" },
  sintesis: { alto: "condensa lo complejo en esencias claras", bajo: "no resumas de más; conserva el desarrollo" },
  precision: { alto: "sé técnicamente exacta (términos, cifras, unidades)", bajo: "prima la comprensión general sobre el tecnicismo" },
  pedagogia: { alto: "explica para que se entienda: pasos, analogías, comprobación", bajo: "no expliques lo que no te pidan" },
  calidez: { alto: "trato cercano y humano", bajo: "trato profesional y distante" },
  formalidad: { alto: "registro formal (usted, estructura cuidada)", bajo: "registro informal y coloquial (tuteo)" },
  directez: { alto: "ve al grano; la conclusión primero", bajo: "prepara el terreno antes de la conclusión" },
  paciencia: { alto: "repite y reformula sin fastidio las veces que haga falta", bajo: "no te repitas; avanza rápido" },
  curiosidad: { alto: "interésate activamente por el tema y sus alrededores", bajo: "cíñete a lo preguntado" },
  proteccion: { alto: "vela por la seguridad, privacidad y bienestar del usuario; advierte riesgos", bajo: "no adviertas riesgos salvo peligro real" },
  cosmopolitismo: { alto: "trae perspectivas de muchas culturas y lugares", bajo: "ancla ejemplos y referencias en lo local y cercano" },
  vanguardia: { alto: "abraza lo nuevo y experimental", bajo: "apóyate en lo clásico y consolidado" },
  profundidad: { alto: "profundiza: causas, matices e implicaciones", bajo: "quédate en la superficie útil" },
  brevedad: { alto: "sé breve: elimina todo lo prescindible", bajo: "desarrolla con amplitud" },
  ejemplos: { alto: "ilustra casi siempre con ejemplos concretos", bajo: "usa ejemplos solo si te los piden" },
  preguntas: { alto: "haz preguntas de vuelta para afinar y mantener el diálogo", bajo: "no preguntes de vuelta salvo bloqueo real" },
  proactividad: { alto: "adelanta recomendaciones y siguientes pasos sin que te los pidan", bajo: "recomienda solo cuando te lo pidan" },
};

const LANG_LABELS: Record<string, string> = {
  es: "español", en: "inglés", fr: "francés", pt: "portugués", de: "alemán",
  it: "italiano", ca: "catalán", gl: "gallego", eu: "euskera", ja: "japonés", zh: "chino",
};

function langLabel(code: string): string {
  return LANG_LABELS[code] ?? code;
}

/** Frase de instrucción de un rasgo según su nivel (o "" si es neutro 36-64). */
function traitSentence(key: string, value: number): string {
  const spec = TRAIT_SPEC_INDEX[key];
  const ins = TRAIT_INSTRUCTIONS[key];
  if (!spec || !ins) return "";
  const marked = value >= 85 || value <= 15 ? " (rasgo muy marcado)" : "";
  if (value >= 65) return ins.alto + marked;
  if (value <= 35) return ins.bajo + marked;
  return "";
}

/**
 * Compila un PersonalityProfile a un bloque de system prompt en español
 * natural: traduce los niveles altos/bajos a instrucciones concretas y
 * proporcionadas, e incluye idioma, estilo de respuesta, herramientas
 * permitidas y política de memoria. Determinista y sin efectos.
 */
export function compilePersonalityPrompt(p: PersonalityProfile): string {
  const lines: string[] = [];
  lines.push(`PERSONALIDAD ACTIVA — «${p.name}» (v${p.version})`);
  if (p.description) lines.push(p.description);
  if (p.prompts.esencia) lines.push(`Esencia: ${p.prompts.esencia}`);

  const identity: string[] = [];
  if (p.personaje) identity.push(`encarnas el arquetipo de ${p.personaje}`);
  if (p.cultura) identity.push(`con sensibilidad cultural ${p.cultura.toLowerCase()}`);
  if (p.filosofia) identity.push(`y mirada filosófica ${p.filosofia.toLowerCase()}`);
  if (identity.length) lines.push(`Identidad: ${identity.join(", ")}.`);

  // Rasgos fuera de la zona neutra → instrucciones concretas, agrupadas.
  const traitParts: string[] = [];
  for (const g of PERSONALITY_TRAIT_GROUPS) {
    const sentences = g.traits
      .map((t) => traitSentence(t.key, p.traits[t.key] ?? t.default))
      .filter(Boolean);
    if (sentences.length) traitParts.push(`${g.label}: ${sentences.join("; ")}.`);
  }
  if (traitParts.length) {
    lines.push("Forma de ser (aplícala con naturalidad, sin nombrar estos rasgos):");
    lines.push(...traitParts.map((s) => `· ${s}`));
  }

  if (p.prompts.estilo) lines.push(`Estilo de comunicación: ${p.prompts.estilo}`);

  const langs = p.idiomasSecundarios.filter((l) => l !== p.idioma);
  lines.push(
    `Idioma: responde por defecto en ${langLabel(p.idioma)}.` +
      (langs.length ? ` Si el usuario cambia a ${langs.map(langLabel).join(", ")}, síguelo con fluidez.` : ""),
  );

  const lonMap: Record<ResponseLength, string> = {
    breve: "prefiere respuestas breves, directas al grano",
    equilibrada: "usa una extensión equilibrada (ni telegráfica ni excesiva)",
    extensa: "desarrolla respuestas completas y bien hiladas",
  };
  const fmtMap: Record<ResponseFormat, string> = {
    prosa: "en prosa natural, sin listas salvo necesidad clara",
    estructurado: "estructuradas (pasos, listas o apartados cuando aporten orden)",
    adaptativo: "adaptando el formato a cada petición",
  };
  const recMap: Record<ResponseRecs, string> = {
    proactivas: "ofrece recomendaciones y siguientes pasos por iniciativa propia cuando aporten",
    "bajo-demanda": "da recomendaciones solo cuando el usuario las pida",
  };
  lines.push(`Respuesta: ${lonMap[p.responseStyle.longitud]}; ${fmtMap[p.responseStyle.formato]}; ${recMap[p.responseStyle.recomendaciones]}.`);

  // Herramientas: solo restringimos si NO están todas las familias activas.
  const kinds = p.tools.enabledKinds;
  const allKinds = allToolKindIds();
  if (kinds.length && kinds.length < allKinds.length) {
    const labels = PERSONALITY_TOOL_KINDS.filter((k) => kinds.includes(k.id)).map((k) => k.label.toLowerCase());
    if (labels.length) {
      lines.push(
        `Herramientas: esta personalidad usa preferentemente ${labels.join(", ")}. Evita las demás familias de herramientas salvo petición expresa del usuario.`,
      );
    }
  }
  const extras = [...p.tools.plugins, ...p.tools.mcp, ...p.tools.apis];
  if (extras.length) lines.push(`Extensiones preferidas (plugins/MCP/APIs): ${extras.join(", ")}.`);

  if (p.memoryPolicy.usarMemorias) {
    const cerebros = p.memoryPolicy.cerebrosPermitidos;
    const cerebrosTxt = cerebros === "todos" ? "" : cerebros.length ? ` y solo los cerebros: ${cerebros.join(", ")}` : "";
    lines.push(`Memoria: usa las memorias y el contexto del usuario a nivel ${p.memoryPolicy.nivelContexto}${cerebrosTxt}.`);
  } else {
    lines.push("Memoria: NO uses memorias personales del usuario salvo que él lo pida explícitamente en este chat.");
  }

  if (p.knowledge.length) lines.push(`Conocimientos de referencia que dominas o priorizas: ${p.knowledge.join(", ")}.`);
  if (p.prompts.extra) lines.push(`Notas adicionales: ${p.prompts.extra}`);

  // (Adenda 67 · P1) Centro de Configuración: matices por SENTIDO y PERMISOS del
  // perfil de esta personalidad. Ambos bloques son "" si el usuario no ha tocado
  // nada → el prompt queda EXACTAMENTE como antes (cero regresión).
  try {
    const senses = sensesPromptBlock();
    if (senses) lines.push(senses);
  } catch {
    /* la personalidad se compila igual si el centro no está disponible */
  }
  try {
    const permisos = personaPermissionsPromptBlock(p.id);
    if (permisos) lines.push(permisos);
  } catch {
    /* idem */
  }

  return lines.join("\n");
}

// ── Helpers para la herramienta de Aurora (kind:"personality") ───────────────

function normText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Busca una personalidad por nombre (difuso, sin acentos) o id. */
export function findPersonalityByName(query: string): PersonalityProfile | null {
  const q = normText(query);
  if (!q) return null;
  const list = listPersonalityProfiles();
  return (
    list.find((p) => p.id === query) ??
    list.find((p) => normText(p.name) === q) ??
    list.find((p) => normText(p.name).includes(q) || q.includes(normText(p.name))) ??
    list.find((p) => normText(p.personaje) === q || (q.length >= 4 && normText(p.personaje).includes(q))) ??
    null
  );
}

/** Cambia la personalidad activa por nombre ("ponte en modo mentora"). */
export function setActivePersonalityByName(
  nombre: string,
  ambito?: "global" | "seccion" | "chat" | "cerebro",
  ref?: string,
): { ok: boolean; message: string; profile?: PersonalityProfile } {
  const p = findPersonalityByName(nombre);
  if (!p) {
    const nombres = listPersonalityProfiles().map((x) => x.name).slice(0, 8).join(", ");
    return { ok: false, message: `No encuentro la personalidad «${nombre}». Tengo: ${nombres}.` };
  }
  let ctx: PersonalityContext = { scope: "global" };
  if (ambito === "seccion" && ref && isPersonalitySection(ref)) ctx = { scope: "seccion", seccion: ref };
  else if (ambito === "chat") {
    const chatId = ref || getRegisteredAuroraChatId();
    if (chatId) ctx = { scope: "chat", chatId };
  } else if (ambito === "cerebro" && ref) ctx = { scope: "cerebro", brainId: ref };
  setActivePersonality(ctx, p.id);
  emitVoiceStyleForProfile(p);
  const donde =
    ctx.scope === "global" ? "" :
    ctx.scope === "seccion" ? ` para la sección ${ctx.seccion}` :
    ctx.scope === "chat" ? " para este chat" : " para ese cerebro";
  return { ok: true, message: `Listo: ahora soy «${p.name}»${donde}. ${p.description ? p.description : ""}`.trim(), profile: p };
}

/** Sinónimos de rasgos que el usuario dice en natural ("dulce" → ternura). */
const TRAIT_ALIASES: Record<string, string> = {
  dulce: "ternura", tierna: "ternura", carinosa: "ternura", cariñosa: "ternura",
  energetica: "entusiasmo", energica: "entusiasmo", animada: "entusiasmo", vibrante: "entusiasmo",
  entusiasta: "entusiasmo", alegre: "alegria", contenta: "alegria", divertida: "humor",
  graciosa: "humor", bromista: "humor", seria: "formalidad", formal: "formalidad",
  informal: "formalidad", calida: "calidez", cercana: "calidez", fria: "calidez",
  directa: "directez", clara: "directez", paciente: "paciencia", curiosa: "curiosidad",
  empatica: "empatia", serena: "serenidad", tranquila: "serenidad", calmada: "serenidad",
  apasionada: "pasion", intensa: "pasion", melancolica: "melancolia", nostalgica: "melancolia",
  confiada: "confianza", segura: "confianza", humilde: "humildad", asertiva: "asertividad",
  autocritica: "autocritica", creativa: "creatividad", imaginativa: "imaginacion",
  analitica: "analisis", precisa: "precision", tecnica: "precision", exacta: "precision",
  pedagogica: "pedagogia", didactica: "pedagogia", profunda: "profundidad",
  breve: "brevedad", concisa: "brevedad", escueta: "brevedad", protectora: "proteccion",
  detallista: "detalle", estetica: "estetica", intuitiva: "intuicion", racional: "intuicion",
  idealista: "idealismo", pragmatica: "idealismo", mistica: "misticismo", esceptica: "misticismo",
  colectiva: "colectividad", individualista: "colectividad", cosmopolita: "cosmopolitismo",
  localista: "cosmopolitismo", vanguardista: "vanguardia", tradicional: "vanguardia",
  proactiva: "proactividad", sociable: "intuicion_social",
};

/** Rasgos donde el adjetivo "positivo" apunta al extremo BAJO del nivelador. */
const ALIAS_INVERTED = new Set(["fria", "informal", "racional", "pragmatica", "esceptica", "individualista", "localista", "tradicional"]);

/**
 * Ajusta un rasgo de la personalidad ACTIVA ("sé más dulce" → ternura +20).
 * Aplica clamp 0-100, guarda y emite el evento de estilo de voz.
 */
export function adjustActivePersonalityTrait(
  rasgo: string,
  direccion: "mas" | "menos" = "mas",
  delta = 20,
): { ok: boolean; message: string } {
  const raw = normText(rasgo);
  if (!raw) return { ok: false, message: "Dime qué rasgo quieres ajustar (p.ej. «sé más dulce»)." };
  // Resuelve la clave: alias → clave directa → etiqueta de spec.
  let key = TRAIT_ALIASES[raw] ?? (TRAIT_SPEC_INDEX[raw] ? raw : "");
  if (!key) {
    const bySpec = Object.values(TRAIT_SPEC_INDEX).find((t) => normText(t.label) === raw || normText(t.label).includes(raw));
    key = bySpec?.key ?? "";
  }
  if (!key || !TRAIT_SPEC_INDEX[key]) {
    return { ok: false, message: `No reconozco el rasgo «${rasgo}». Prueba con dulzura, energía, humor, formalidad, paciencia…` };
  }
  const inverted = ALIAS_INVERTED.has(raw);
  const sign = (direccion === "menos" ? -1 : 1) * (inverted ? -1 : 1);
  const profile = resolvePersonalityForContext({});
  if (!profile) return { ok: false, message: "No hay ninguna personalidad activa que ajustar. Activa una primero." };
  const spec = TRAIT_SPEC_INDEX[key];
  const before = Math.round(clamp(profile.traits[key], 0, 100, spec.default));
  const after = Math.round(clamp(before + sign * Math.abs(delta), 0, 100, spec.default));
  const next = { ...profile, traits: { ...profile.traits, [key]: after } };
  savePersonalityProfile(next);
  emitVoiceStyleForProfile(next);
  if (after === before) {
    return { ok: true, message: `«${spec.label}» ya estaba al ${after === 100 ? "máximo" : "mínimo"} (${after}/100) en «${profile.name}».` };
  }
  return { ok: true, message: `Hecho: ${spec.label} de ${before} a ${after} en «${profile.name}». Lo notarás en mi forma de hablar.` };
}

/** Describe en una frase decible la personalidad activa (para la tool). */
export function describeActivePersonality(ctx?: { section?: string; chatId?: string; brainId?: string }): string {
  const p = resolvePersonalityForContext(ctx ?? {});
  if (!p) return "Ahora mismo no tengo ninguna personalidad activa: hablo en mi modo base.";
  const marked = PERSONALITY_TRAIT_GROUPS.flatMap((g) => g.traits)
    .map((t) => ({ t, v: p.traits[t.key] ?? t.default }))
    .filter((x) => x.v >= 70)
    .sort((a, b) => b.v - a.v)
    .slice(0, 4)
    .map((x) => `${x.t.label.toLowerCase()} ${x.v}`);
  const partes = [
    `Ahora mismo soy «${p.name}»${p.personaje ? `, arquetipo ${p.personaje.toLowerCase()}` : ""}.`,
    p.description || "",
    marked.length ? `Mis rasgos más marcados: ${marked.join(", ")}.` : "",
    `Respondo en ${langLabel(p.idioma)}, con respuestas ${p.responseStyle.longitud === "breve" ? "breves" : p.responseStyle.longitud === "extensa" ? "extensas" : "equilibradas"} y voz de tono ${p.voiceStyle.tone}.`,
  ].filter(Boolean);
  return partes.join(" ");
}
