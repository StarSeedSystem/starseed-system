"use client";

/*
 * Astraura · Capacidades de Aurora (skills vivas)
 * ------------------------------------------------
 * Convierte las *skills* instaladas desde la Biblioteca ("Cydia") en
 * COMPORTAMIENTO REAL de Aurora: (1) inyecta un bloque de system prompt en el
 * cerebro antes de llamar al modelo y (2) SESGA el routing de Astraura
 * (modelo fuerte / web / visión / planificación). Antes solo se registraban en
 * `starseed.library.functions.v1` sin que nada las leyera; esto cierra ese hueco.
 *
 * Contrato compartido OS · Nexus · Café → architecture/astraura-capabilities.md
 * (mismo vocabulario de ids: taste · pm · web-senses · research · vision · voice).
 *
 * NOTA de nombres: este módulo se llama `skills.ts` a propósito, para NO chocar
 * con `src/lib/aurora/capabilities.ts` (capacidades de DISPOSITIVO: micrófono,
 * síntesis de voz, permisos), que es un concepto distinto.
 *
 * Todo defensivo y SSR-safe: sin `window` devuelve vacío y Aurora funciona igual.
 */

import { getInstalledFunctionIds, getInstalledPackageIds } from "@/lib/library/packages";

/** Espejo local de capacidades activas (lo mantiene sincronizado library-sync
 *  con `user_settings.prefs.capabilities` de la cuenta soberana). */
export const CAPS_KEY = "starseed.capabilities.v1";

export interface SkillCapability {
  /** id del vocabulario compartido entre los 3 sistemas. */
  id: string;
  /** Etiqueta legible para el system prompt y los ajustes. */
  label: string;
  /** Fragmento que se inyecta en el cerebro de Aurora cuando la capacidad está activa. */
  systemPrompt: string;
  /** Sesgo de routing hacia Astraura. */
  routing?: { preferStrong?: boolean; web?: boolean; vision?: boolean; planning?: boolean };
  /** Skills-función (FUNCTIONS_KEY) que disparan esta capacidad. */
  skillIds?: string[];
  /** Paquetes (INSTALLED_KEY) que disparan esta capacidad. */
  packageIds?: string[];
}

/** Manifiesto: skills de la Biblioteca → capacidad viva de Aurora. */
export const SKILL_CAPABILITIES: SkillCapability[] = [
  {
    id: "taste",
    label: "Taste · calidad de UI y estética",
    systemPrompt:
      "Cuando generes interfaz, contenido visual o texto, aplica criterio de diseño de alto nivel (jerarquía clara, espacio en blanco, contraste, coherencia con el sistema Crystal Liquid Glass). Prefiere lo elegante, legible y sobrio a lo recargado.",
    routing: { preferStrong: true },
    skillIds: ["aurora-taste"],
    packageIds: ["iatool-taste-skill"],
  },
  {
    id: "pm",
    label: "PM · producto y proyecto",
    systemPrompt:
      "Cuando el usuario planifique o defina trabajo, descompón en objetivo, alcance, riesgos y próximos pasos accionables con criterios de aceptación. Sé estructurado y conciso; distingue lo esencial de lo opcional.",
    routing: { preferStrong: true, planning: true },
    skillIds: ["aurora-pm"],
    packageIds: ["iatool-pm-skills"],
  },
  {
    id: "web-senses",
    label: "Sentidos web (Agent-Reach)",
    systemPrompt:
      "Tienes sentidos web: si el usuario pega enlaces o pide contenido de X/Reddit/YouTube/páginas, razona sobre ese contenido y pide la URL cuando falte. No inventes fuentes ni cites lo que no se te ha dado.",
    routing: { web: true },
    skillIds: ["aurora-web-senses"],
    packageIds: ["iatool-agent-reach"],
  },
  {
    id: "research",
    label: "Investigación (Open Notebook)",
    systemPrompt:
      "Modo investigación: al sintetizar fuentes, separa hechos de inferencias, señala de dónde viene cada afirmación y cierra con un resumen breve y notas accionables.",
    routing: { preferStrong: true },
    packageIds: ["iatool-open-notebook"],
  },
  {
    id: "vision",
    label: "Visión",
    systemPrompt:
      "Puedes interpretar imágenes que el usuario comparte: describe lo relevante y actúa sobre ello con precisión.",
    routing: { vision: true },
    skillIds: ["aurora-vision"],
    packageIds: ["iatool-aurora-vision"],
  },
  {
    id: "voice",
    label: "Voz de alta calidad (Kokoro)",
    systemPrompt:
      "Si hablas en voz alta, usa frases naturales y bien puntuadas para que la síntesis suene fluida.",
    skillIds: ["aurora-voice-kokoro"],
    packageIds: ["iatool-aurora-voice-kokoro"],
  },
  {
    id: "web-access",
    label: "Acceso a internet (web)",
    systemPrompt:
      "Puedes traer y leer páginas web cuando hay un proveedor de acceso web disponible. AUTO-SELECCIONAS la mejor herramienta GRATIS/LOCAL/OSS por tarea (Crawl4AI · DeepCrawl · WebHarvest · Universal Scraper) y solo usas Firecrawl si el usuario tiene su clave. Si NINGÚN proveedor está configurado, no finjas que navegas: pide al usuario que pegue la URL o el contenido. No inventes fuentes ni cites lo que no se te ha dado.",
    routing: { web: true },
    skillIds: ["aurora-web-access"],
    packageIds: ["iatool-crawl4ai", "iatool-deepcrawl", "iatool-webharvest", "iatool-universal-scraper", "iatool-firecrawl"],
  },
];

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Lee el espejo de capacidades traído de la cuenta (o [] para invitado sin datos). */
function readCapMirror(): string[] {
  if (!isClient()) return [];
  try {
    const raw = window.localStorage.getItem(CAPS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** IDs de capacidad activas = unión de (skills instaladas ∪ paquetes ∪ espejo de cuenta). */
export function activeCapabilityIds(): string[] {
  const fns = new Set(isClient() ? getInstalledFunctionIds() : []);
  const pkgs = new Set(isClient() ? getInstalledPackageIds() : []);
  const mirror = new Set(readCapMirror());
  const out: string[] = [];
  for (const c of SKILL_CAPABILITIES) {
    const bySkill = (c.skillIds ?? []).some((s) => fns.has(s));
    const byPkg = (c.packageIds ?? []).some((p) => pkgs.has(p));
    if (bySkill || byPkg || mirror.has(c.id)) out.push(c.id);
  }
  return out;
}

/** Capacidades activas resueltas a su manifiesto. */
export function activeCapabilities(): SkillCapability[] {
  const set = new Set(activeCapabilityIds());
  return SKILL_CAPABILITIES.filter((c) => set.has(c.id));
}

/** Bloque de system prompt que Aurora antepone al cerebro (o "" si no hay ninguna). */
export function skillsSystemPrompt(): string {
  const act = activeCapabilities();
  if (!act.length) return "";
  return (
    "Capacidades activas de Aurora (Biblioteca StarSeed):\n" +
    act.map((c) => `• ${c.label}: ${c.systemPrompt}`).join("\n")
  );
}

/** Sesgo agregado de routing de todas las capacidades activas. */
export function skillsRoutingBias(): { preferStrong: boolean; web: boolean; vision: boolean; planning: boolean } {
  const act = activeCapabilities();
  return {
    preferStrong: act.some((c) => !!c.routing?.preferStrong),
    web: act.some((c) => !!c.routing?.web),
    vision: act.some((c) => !!c.routing?.vision),
    planning: act.some((c) => !!c.routing?.planning),
  };
}

/** Recalcula el espejo local `starseed.capabilities.v1` a partir de lo instalado.
 *  Lo llama la Biblioteca tras instalar/desinstalar; library-sync lo sube a la
 *  cuenta. Devuelve los ids resultantes. Nunca lanza. */
export function recomputeCapabilityMirror(): string[] {
  if (!isClient()) return [];
  const fns = new Set(getInstalledFunctionIds());
  const pkgs = new Set(getInstalledPackageIds());
  const ids = SKILL_CAPABILITIES.filter(
    (c) => (c.skillIds ?? []).some((s) => fns.has(s)) || (c.packageIds ?? []).some((p) => pkgs.has(p)),
  ).map((c) => c.id);
  try {
    window.localStorage.setItem(CAPS_KEY, JSON.stringify(ids));
  } catch {
    /* noop */
  }
  return ids;
}
