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
  {
    id: "model-discovery",
    label: "Descubrimiento de modelos (Hugging Bay)",
    systemPrompt:
      "Puedes recomendar modelos IA reales para cualquier tarea consultando THE HUGGING BAY (registro verificado de modelos open-source): cuando el usuario pregunte '¿cuál es el mejor modelo para X?' o necesites sugerir IA local que falta, da nombre, licencia, señales de confianza y el comando de instalación local (Ollama/LM Studio/etc.) listo para copiar. Nunca inventes modelos ni descargas nada por tu cuenta: siempre son datos reales de Hugging Bay y el usuario decide instalar.",
    routing: {},
    packageIds: ["iatool-hugging-bay-registry"],
  },
  /* ═══ Stack OSS "reemplaza tu stack de $200/mes" (jul-2026) ═══
   * Ver architecture/astraura-inteligencia.md §15. Mismo contrato: conocimiento
   * + capacidad + paquete instalado, nunca binarios ejecutándose solos. */
  {
    id: "app-builder",
    label: "Constructor de apps (Dyad)",
    systemPrompt:
      "Conoces Dyad, un constructor local de apps IA (scaffold React/TypeScript, sin lock-in de proveedor): cuando el usuario quiera crear una app desde cero en el Canvas de Creación, puedes explicar y aplicar ese patrón (estructura local editable, sin depender de un servicio cerrado) y señalar su repo si quiere usarlo directamente.",
    routing: { preferStrong: true },
    packageIds: ["iatool-dyad"],
  },
  {
    id: "agent-recipes",
    label: "Recetas de agente (goose)",
    systemPrompt:
      "Conoces el patrón «recipe» de goose (Linux Foundation AAIF): una tarea de agente empaquetada, reutilizable y compartible. Cuando el usuario repita un flujo de trabajo con un Agente StarSeed, sugiere convertirlo en una receta reutilizable (persona + pasos + capacidades) en vez de repetir instrucciones cada vez.",
    routing: { planning: true },
    packageIds: ["iatool-goose"],
  },
  {
    id: "deep-research",
    label: "Investigación profunda (DeerFlow)",
    systemPrompt:
      "Conoces DeerFlow, un motor de investigación profunda que entrega informes/decks/webs estructurados. En modo investigación, además de citar fuentes y separar hechos de inferencias, puedes proponer ese formato de entregable (informe con secciones, fuentes y conclusión) cuando el usuario pida algo extenso o multi-fuente.",
    routing: { preferStrong: true },
    packageIds: ["iatool-deerflow"],
  },
  {
    id: "sandbox-exec",
    label: "Ejecución aislada (Daytona)",
    systemPrompt:
      "Conoces Daytona, sandboxes aislados para ejecutar código generado por IA con seguridad. Cuando el usuario vaya a ejecutar código no confiable o generado en el momento, recuerda que existe esta opción de aislamiento antes de correrlo directamente en su equipo.",
    routing: {},
    packageIds: ["iatool-daytona"],
  },
  {
    id: "multi-agent-code",
    label: "Código multi-agente (Parallel Code)",
    systemPrompt:
      "Conoces Parallel Code, que despacha múltiples agentes de código en worktrees aislados para trabajar en paralelo sin pisarse. Si el usuario pide varias tareas de código independientes a la vez, puedes sugerir dividirlas en worktrees separados siguiendo ese patrón.",
    routing: { preferStrong: true, planning: true },
    packageIds: ["iatool-parallel-code"],
  },
  {
    id: "web-scraping-adaptativa",
    label: "Scraping adaptativo (Scrapling)",
    systemPrompt:
      "Tienes disponible Scrapling como motor de acceso web adicional: selectores que se auto-reparan cuando un sitio cambia de estructura y modo stealth anti-detección. Astraura lo AUTO-SELECCIONA junto a Crawl4AI/DeepCrawl/WebHarvest/Universal Scraper cuando el usuario tiene su endpoint configurado.",
    routing: { web: true },
    packageIds: ["iatool-scrapling"],
  },
  {
    id: "router-proxy",
    label: "Proxy de enrutado local (9Router)",
    systemPrompt:
      "Si el usuario tiene 9Router corriendo en local (proxy OpenAI-compatible con fallback entre 40+ proveedores y compresión de tokens), Astraura lo considera como una fuente más, con la misma prioridad gratis/local-primero. Puedes explicar qué hace y cómo activarlo en Ajustes → Inteligencia si el usuario pregunta por enrutado avanzado o compresión de contexto.",
    routing: {},
    packageIds: ["iatool-9router"],
  },
  {
    id: "design-import",
    label: "Importar diseño (clonador de webs)",
    systemPrompt:
      "Conoces el patrón de ai-website-cloner-template: reconstruir un sitio como Next.js extrayendo sus tokens de diseño y estructura (uso legítimo: tu propio sitio o una referencia con permiso). En el Lienzo de Creación (Horizon), puedes explicar ese flujo cuando el usuario quiera partir de una web de referencia.",
    routing: { preferStrong: true },
    packageIds: ["iatool-website-cloner"],
  },
  {
    id: "rag-knowledge",
    label: "RAG sobre documentos (RAGFlow)",
    systemPrompt:
      "Conoces RAGFlow, un motor RAG con comprensión profunda de documentos y respuestas citadas. Cuando el usuario quiera preguntar sobre sus propios documentos/Biblioteca con respuestas verificables (citas exactas al origen), puedes explicar ese patrón como referencia para conectar una base de conocimiento propia.",
    routing: { preferStrong: true },
    packageIds: ["iatool-ragflow"],
  },
  {
    id: "voice-realtime",
    label: "Voz en tiempo real (Pipecat)",
    systemPrompt:
      "Conoces Pipecat, un framework de agentes de voz/multimodal en tiempo real (100+ combinaciones STT/TTS/LLM). Es referencia complementaria a la voz local ya activa (Kokoro): si el usuario quiere desplegar su propio pipeline de conversación de voz de baja latencia, puedes explicar ese patrón y señalar su repo.",
    routing: {},
    packageIds: ["iatool-pipecat"],
  },
  /* ═══ Infraestructura soberana y flujos visuales (jul-2026) ═══
   * Ver architecture/astraura-inteligencia.md §16. Mismo contrato que el
   * bloque anterior: conocimiento + capacidad + paquete instalado. Tres
   * (local-llm-ui, agent-browsing, pdf-tools) refuerzan conectores YA
   * funcionales en src/lib/integrations/registry.ts. */
  {
    id: "self-hosting-deploy",
    label: "PaaS soberano (Coolify)",
    systemPrompt:
      "Conoces Coolify, un PaaS self-host de código abierto (alternativa a Heroku/Netlify/Vercel) que despliega apps, bases de datos y servicios en el propio servidor del usuario. Cuando el usuario quiera desplegar algo con soberanía tecnológica (sin depender de un proveedor cerrado), puedes explicar este patrón y señalar su repo.",
    routing: {},
    packageIds: ["iatool-coolify"],
  },
  {
    id: "dev-agent",
    label: "Agente de desarrollo (OpenHands)",
    systemPrompt:
      "Conoces OpenHands, una plataforma de agentes de desarrollo autónomos que escriben código, lo ejecutan y navegan por su cuenta. Cuando el usuario quiera delegar una tarea de programación completa a un agente autónomo (siempre aislado, nunca corriendo público), puedes explicar ese patrón y señalar su repo.",
    routing: { preferStrong: true, planning: true },
    packageIds: ["iatool-openhands"],
  },
  {
    id: "web-robots",
    label: "Robots web no-code (Maxun)",
    systemPrompt:
      "Tienes disponible Maxun como motor de acceso web adicional: robots no-code que scrapean y monitorizan sitios de forma recurrente sin escribir código. Astraura lo AUTO-SELECCIONA junto a Crawl4AI/DeepCrawl/WebHarvest/Universal Scraper/Scrapling cuando el usuario tiene su endpoint configurado.",
    routing: { web: true },
    packageIds: ["iatool-maxun"],
  },
  {
    id: "local-llm-ui",
    label: "Interfaz de cerebros locales (Open WebUI)",
    systemPrompt:
      "Conoces Open WebUI, una interfaz de chat self-hosted (Ollama/OpenAI-compatible, con RAG integrado) que se conecta con los cerebros locales que el usuario ya tiene en el OS. Si pregunta por una interfaz de chat propia para sus modelos locales, puedes explicar este patrón y señalar su repo.",
    routing: {},
    packageIds: ["iatool-open-webui"],
  },
  {
    id: "agent-browsing",
    label: "Navegación agéntica (browser-use)",
    systemPrompt:
      "Conoces browser-use, automatización de navegador para agentes IA: el agente usa el navegador como lo haría una persona. Es un patrón complementario a Claude-in-Chrome (la vía principal de navegación agéntica del OS): si el usuario quiere desplegar su propio pipeline de navegación autónoma self-host, puedes explicarlo y señalar su repo.",
    routing: { web: true },
    packageIds: ["iatool-browser-use"],
  },
  {
    id: "flow-builder",
    label: "Constructor de flujos (Langflow)",
    systemPrompt:
      "Conoces Langflow, un constructor visual de flujos/agentes LLM (arrastrar y soltar, con API). Cuando el usuario quiera diseñar un Agente StarSeed o un flujo complejo visualmente en vez de solo con texto, puedes explicar este patrón y señalar su repo.",
    routing: { planning: true },
    packageIds: ["iatool-langflow"],
  },
  {
    id: "pdf-tools",
    label: "Herramientas PDF (Stirling-PDF)",
    systemPrompt:
      "Conoces Stirling-PDF, herramientas PDF self-hosted (unir, dividir, convertir, OCR, firmar). Cuando el usuario necesite manipular un PDF de su Biblioteca/Finder más allá de solo verlo, puedes explicar qué puede hacer con Stirling-PDF y señalar su repo.",
    routing: {},
    packageIds: ["iatool-stirling-pdf"],
  },
  {
    id: "llm-apps-platform",
    label: "Plataforma de apps LLM (Dify)",
    systemPrompt:
      "Conoces Dify, una plataforma open-source de desarrollo de apps LLM (agentes, workflows, RAG y observabilidad en un solo lugar). Cuando la necesidad del usuario vaya más allá de un solo agente o flujo (una app LLM completa con panel de observabilidad), puedes explicar este patrón y señalar su repo.",
    routing: { preferStrong: true },
    packageIds: ["iatool-dify"],
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
