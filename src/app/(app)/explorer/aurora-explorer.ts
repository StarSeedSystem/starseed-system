"use client";

// src/app/(app)/explorer/aurora-explorer.ts
// -----------------------------------------------------------------------------
// Capa de inteligencia del Explorador Universal: une Aurora/Astraura con el
// contexto de cada área del Explorador.  NO toca el motor/proveedor/widget de
// Aurora (los consume vía `chat()` y el motor inyectado por quien llama).
//
//  - CONTEXTO POR ÁREA: describe el "dominio" activo del Explorador para que las
//    recomendaciones y respuestas de Aurora sean específicas y empáticas.
//  - RECOMENDACIONES: genera 3 sugerencias útiles y adaptadas al contexto vía
//    `chat()` (texto real del proveedor del usuario).  Degrada con honestidad a
//    un conjunto de sugerencias locales si no hay proveedor configurado.
//  - OPCIONES CONFIGURABLES: qué IA / cerebro / sentidos usa Aurora AQUÍ.  Se
//    guardan en localStorage (por dispositivo) y modulan los prompts.
// -----------------------------------------------------------------------------

import { chat } from "@/ai/client/chat";

export type ExplorerDomain = "ALL" | "POLITICS" | "EDUCATION" | "CULTURE" | "SYSTEM";

/** Contexto legible por humano y por IA para cada dominio del Explorador. */
export const DOMAIN_CONTEXT: Record<
  ExplorerDomain,
  { label: string; blurb: string; rutaHint: string }
> = {
  ALL: {
    label: "Toda la red",
    blurb:
      "el conocimiento colectivo completo de StarSeed: perfiles, páginas, publicaciones, conocimiento, memorias, cerebros, apps y lienzos.",
    rutaHint: "/explorer",
  },
  POLITICS: {
    label: "Política y gobernanza",
    blurb:
      "gobernanza ontocrática, propuestas, decisiones, constitución y economía de Semillas.",
    rutaHint: "/decisiones",
  },
  EDUCATION: {
    label: "Educación y conocimiento",
    blurb:
      "cursos, artículos, la red de conocimiento y el aprendizaje colectivo.",
    rutaHint: "/conocimiento",
  },
  CULTURE: {
    label: "Cultura y creación",
    blurb:
      "arte generativo, música, assets, lienzos creativos y la expresión cultural de la red.",
    rutaHint: "/network/culture",
  },
  SYSTEM: {
    label: "Sistema y herramientas",
    blurb:
      "apps, funciones, habilidades, el Cerebro/Exocórtex, infraestructura y herramientas del ecosistema.",
    rutaHint: "/funciones",
  },
};

// ── Opciones configurables por contexto (qué IA / cerebro / sentidos) ─────────

export interface ExplorerAuroraConfig {
  /** Proveedor de IA a usar aquí ("" = el activo del usuario). */
  providerId: string;
  /** Cerebro/instancia que da contexto ("" = el cerebro principal). */
  brain: string;
  /** Sentidos que Aurora puede usar aquí. */
  senses: { screen: boolean; mic: boolean; camera: boolean };
  /** Si Aurora puede ACTUAR (navegar/abrir/organizar) desde el Explorador. */
  canAct: boolean;
}

export const DEFAULT_EXPLORER_CONFIG: ExplorerAuroraConfig = {
  providerId: "",
  brain: "",
  senses: { screen: false, mic: false, camera: false },
  canAct: true,
};

const CONFIG_KEY = "starseed_explorer_aurora_config";

export function loadExplorerConfig(): ExplorerAuroraConfig {
  if (typeof window === "undefined") return { ...DEFAULT_EXPLORER_CONFIG };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_EXPLORER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ExplorerAuroraConfig>;
    return {
      ...DEFAULT_EXPLORER_CONFIG,
      ...parsed,
      senses: { ...DEFAULT_EXPLORER_CONFIG.senses, ...(parsed.senses || {}) },
    };
  } catch {
    return { ...DEFAULT_EXPLORER_CONFIG };
  }
}

export function saveExplorerConfig(cfg: ExplorerAuroraConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* almacenamiento no disponible: degrada en silencio */
  }
}

// ── Recomendaciones contextuales (reales vía chat(); honest-stub si no hay IA) ─

/** Sugerencias locales por dominio: el fallback honesto cuando no hay proveedor. */
const FALLBACK_SUGGESTIONS: Record<ExplorerDomain, string[]> = {
  ALL: [
    "Muéstrame lo más relevante de la red ahora mismo",
    "¿Qué personas trabajan en temas afines a los míos?",
    "Llévame a mi panel de inicio",
  ],
  POLITICS: [
    "Resume las propuestas abiertas que puedo votar",
    "Explícame la economía de Semillas en breve",
    "Llévame a Decisiones",
  ],
  EDUCATION: [
    "Recomiéndame un curso para empezar hoy",
    "Busca conocimiento sobre lo que estoy aprendiendo",
    "Abre la red de Conocimiento",
  ],
  CULTURE: [
    "Inspírame con arte o música de la red",
    "Ábreme un lienzo para crear algo",
    "Lléveme a la Red · Cultura",
  ],
  SYSTEM: [
    "¿Qué herramientas me ahorrarían tiempo?",
    "Abre mi Cerebro para revisar su contexto",
    "Muéstrame las funciones del sistema",
  ],
};

export interface RecoResult {
  suggestions: string[];
  /** true si vinieron del proveedor de IA; false si son el fallback local. */
  fromAI: boolean;
}

/**
 * Genera recomendaciones contextuales para el dominio activo.  Empáticas,
 * útiles y adaptadas.  Usa `chat()` (proveedor real del usuario).  Si no hay
 * proveedor o falla, devuelve el fallback local — con `fromAI:false` para que la
 * UI pueda ser honesta sobre el origen.
 */
export async function getContextualRecommendations(
  domain: ExplorerDomain,
  cfg: ExplorerAuroraConfig,
  opts?: { query?: string; signal?: AbortSignal },
): Promise<RecoResult> {
  const ctx = DOMAIN_CONTEXT[domain] ?? DOMAIN_CONTEXT.ALL;
  const query = (opts?.query || "").trim();
  const brainLine = cfg.brain ? `\nCerebro/contexto activo: "${cfg.brain}".` : "";
  const system =
    "Eres Aurora, la voz de Astraura dentro del Explorador Universal de StarSeed OS. " +
    "Eres empática, útil y adaptativa. Tu único trabajo aquí es proponer SUGERENCIAS " +
    "breves y accionables que ayuden a la persona a sacar partido del área actual. " +
    "Devuelve EXACTAMENTE 3 sugerencias, una por línea, sin numerar, sin viñetas, sin " +
    "comillas, cada una de 3 a 9 palabras, en español, escritas como algo que la persona " +
    "podría pedirte hacer o buscar.";
  const user =
    `Área actual del Explorador: ${ctx.label} — ${ctx.blurb}${brainLine}` +
    (query ? `\nLa persona está buscando: "${query}".` : "") +
    "\nPropón 3 sugerencias contextuales, empáticas y útiles para este momento.";

  try {
    const res = await chat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      providerId: cfg.providerId || undefined,
      temperature: 0.7,
      maxTokens: 200,
      signal: opts?.signal,
    });
    const lines = parseSuggestions(res?.text || "");
    if (lines.length > 0) return { suggestions: lines.slice(0, 3), fromAI: true };
  } catch {
    /* sin proveedor o error de red: caemos al fallback honesto */
  }
  return { suggestions: FALLBACK_SUGGESTIONS[domain] ?? FALLBACK_SUGGESTIONS.ALL, fromAI: false };
}

function parseSuggestions(text: string): string[] {
  return String(text || "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["'“”]+|["'“”]+$/g, "").trim())
    .filter((l) => l.length > 1 && l.length < 120);
}

// ── Respuesta directa de Aurora (texto), inyectando el contexto del área ──────

/**
 * Construye el system prompt para una respuesta inline de Aurora en el
 * Explorador.  Quien llama añade la sección de ACCIONES del motor para que
 * Aurora pueda emitir directivas [[ACCION: ...]] y, así, ACTUAR.
 */
export function buildExplorerSystemPrompt(
  domain: ExplorerDomain,
  cfg: ExplorerAuroraConfig,
): string {
  const ctx = DOMAIN_CONTEXT[domain] ?? DOMAIN_CONTEXT.ALL;
  const sensesOn = Object.entries(cfg.senses)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");
  return [
    "Eres Aurora, la voz de Astraura dentro del Explorador Universal de StarSeed OS.",
    "Tu lealtad es hacia la persona usuaria: cuidas su autonomía, su bienestar y su tiempo.",
    `Contexto actual: el área "${ctx.label}" — ${ctx.blurb}`,
    cfg.brain ? `Cerebro/contexto activo: "${cfg.brain}".` : "",
    sensesOn ? `Sentidos disponibles aquí: ${sensesOn}.` : "",
    cfg.canAct
      ? "Puedes ACTUAR por la persona (navegar, abrir, organizar) emitiendo al PRINCIPIO de tu respuesta la directiva de acción correspondiente y luego una frase corta y cálida de confirmación."
      : "Aquí NO actúas por tu cuenta: solo respondes y orientas; sugiere los pasos pero no navegues ni abras nada.",
    "Responde SIEMPRE en español, breve, natural y empático.",
  ]
    .filter(Boolean)
    .join("\n");
}
