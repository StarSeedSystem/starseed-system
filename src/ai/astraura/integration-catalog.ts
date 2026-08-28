"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · CATÁLOGO DE INTEGRACIONES EXTERNAS (Adenda 172, 2026-08-27)
 * ---------------------------------------------------------------------------
 * Registro nativo de herramientas/papers externos que Alex pidió integrar en
 * StarSeed OS + Hermes: OpenViking, AgentHarness/qm, opencode, agent-reach,
 * oxibonsai, draw-realtime, 1.58-bit FLUX.
 *
 * Cada entrada lleva:
 *   · `autoUpdate`  — watch de releases de GitHub (vía free-sources-sync.ts)
 *     para mantener la versión referenciada al día SIN tocar el código.
 *   · `native`      — se expone como capacidad nativa del OS por defecto.
 *   · `defaultOn`   — los agentes/Astraura la usan sin que el usuario la active.
 *   · `adapter`     — módulo cliente que la cablea (patrón huggingbay.ts).
 *
 * Esto NO es el router de LLM (free-catalog.ts): son CAPACIDADES (memoria,
 * web, inferencia local, orquestación, coding). El router las consulta para
 * enriquecer agentes/personalidades/cerebro/exocortex/orbe.
 *
 * SSR-safe: solo datos + funciones puras. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Dónde encaja la herramienta en la arquitectura del OS. */
export type IntegrationDomain =
  | "memory" // memoria/contexto a largo plazo
  | "web" // acceso a la web externa para agentes
  | "inference" // inferencia local soberana (texto/imagen/video)
  | "orchestration" // orquestación multi-agente soberana
  | "coding" // coding agent / harness de desarrollo
  | "research"; // papers / base teórica

/** Requisitos de ejecución (honestidad: un Mac M1 8GB no corre GPU). */
export interface RuntimeReqs {
  /** ¿Requiere GPU/NVIDIA CUDA? (oxibonsai/draw-realtime lo requieren). */
  gpu?: boolean;
  /** ¿Requiere Rust toolchain para build local? (oxibonsai). */
  rust?: boolean;
  /** ¿Se instala como CLI/Python en la neurona del usuario? (agent-reach, OpenViking). */
  localCli?: boolean;
  /** ¿Solo referencia teórica / paper? (1.58-bit FLUX). */
  referenceOnly?: boolean;
  /** Nota legible de requisitos. */
  note?: string;
}

export interface IntegrationEntry {
  /** Id estable del catálogo (starseed.astraura.integrations). */
  id: string;
  label: string;
  domain: IntegrationDomain;
  /** Repo / URL canónica. */
  repo: string;
  /** Licencia. */
  license: string;
  /** Por qué aporta al OS (transparencia, como el resto de Astraura). */
  why: string;
  /** ¿Se expone como capacidad nativa por defecto? */
  native: boolean;
  /** ¿Los agentes la usan sin activación explícita? */
  defaultOn: boolean;
  /** Módulo adaptador que la cablea (patrón huggingbay.ts). null = pendiente. */
  adapter: string | null;
  /** Watch de releases de GitHub para auto-update (vía free-sources-sync.ts). */
  autoUpdate: {
    enabled: boolean;
    /** `owner/repo` para el watch de releases. */
    github: string | null;
    /** Cadencia de sondeo sugerida (min). */
    pollMinutes: number;
  };
  /** Requisitos de ejecución (honestidad de hardware). */
  reqs: RuntimeReqs;
  /** Estado de la integración. */
  status: "registered" | "wired" | "pending-research";
}

/* ───────────────────────────── Catálogo ───────────────────────── */

export const INTEGRATIONS: IntegrationEntry[] = [
  {
    id: "openviking",
    label: "OpenViking — base de datos de contexto para agentes",
    domain: "memory",
    repo: "https://github.com/volcengine/OpenViking",
    license: "Apache-2.0 / AGPLv3",
    why: "Memoria y contexto a largo plazo observables (URI viking://, capas L0/L1/L2) para Astraura y el exocortex del usuario. Recuperación por directorio + trayectoria depurable. Reduce tokens y latencia.",
    native: true,
    defaultOn: false, // opt-in: requiere servidor local; no se impone a todos
    adapter: "@/ai/astraura/integrations/openviking",
    autoUpdate: { enabled: true, github: "volcengine/OpenViking", pollMinutes: 1440 },
    reqs: { localCli: true, note: "Python 3.10+, servidor local (openviking-server). Opcional para el OS." },
    status: "registered",
  },
  {
    id: "agent-reach",
    label: "Agent Reach — acceso a la web externa para agentes",
    domain: "web",
    repo: "https://github.com/Panniantong/Agent-Reach",
    license: "MIT",
    why: "Da a los agentes Astraura ojos en TODA la web (Twitter/X, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu, búsqueda semántica, RSS) TODO GRATIS, multi-backend. Hoy los agentes del OS NO tienen acceso web nativo.",
    native: true,
    defaultOn: true, // valor alto, riesgo bajo → encendido por defecto
    adapter: "@/ai/astraura/integrations/agent-reach",
    autoUpdate: { enabled: true, github: "Panniantong/Agent-Reach", pollMinutes: 1440 },
    reqs: { localCli: true, note: "Python 3.10+ en la neurona del usuario (pip install agent-reach). El OS lo invoca vía el backend de Astraura o proxy." },
    status: "registered",
  },
  {
    id: "opencode",
    label: "OpenCode — coding agent open-source",
    domain: "coding",
    repo: "https://github.com/anomalyco/opencode",
    license: "MIT",
    why: "Agente de código abierto para delegar implementación de features del OS y de la librería. Ya instalado localmente en esta neurona (/Users/alex/.opencode/bin/opencode).",
    native: true,
    defaultOn: true,
    adapter: "@/ai/astraura/integrations/opencode",
    autoUpdate: { enabled: true, github: "anomalyco/opencode", pollMinutes: 1440 },
    reqs: { localCli: true, note: "Ya presente en la neurona; usado para delegar coding." },
    status: "wired",
  },
  {
    id: "qm",
    label: "QM — harness/deploy CLI multi-agente soberano",
    domain: "orchestration",
    repo: "https://github.com/yc-software/qm",
    license: "verificar",
    why: "Harness multi-proveedor (OpenCode/Claude/Codex/pi) con tools/skills sandboxeados y despliegue a Fly/AWS. Orquestador soberano de cerebros/agentes del OS.",
    native: false,
    defaultOn: false,
    adapter: null,
    autoUpdate: { enabled: true, github: "yc-software/qm", pollMinutes: 1440 },
    reqs: { localCli: true, note: "Investigar como orquestador de despliegue soberano." },
    status: "pending-research",
  },
  {
    id: "agentharness",
    label: "AgentHarness (ApodexAI) — harness multi-agente",
    domain: "orchestration",
    repo: "https://github.com/ApodexAI/AgentHarness",
    license: "verificar",
    why: "Harness multi-agente. El repo exacto no se pudo extraer (404/redirect); cercano: ruvnet/metaharness (fábrica de harnesses que soporta Hermes) y yc-software/qm. Investigar forma canónica.",
    native: false,
    defaultOn: false,
    adapter: null,
    autoUpdate: { enabled: false, github: null, pollMinutes: 1440 },
    reqs: { note: "Pendiente de localizar el repo canónico." },
    status: "pending-research",
  },
  {
    id: "oxibonsai",
    label: "OxiBonsai — inferencia sub-2-bit en Pure Rust",
    domain: "inference",
    repo: "https://github.com/cool-japan/oxibonsai",
    license: "Apache-2.0",
    why: "Motor de inferencia PURE RUST (sin llama.cpp) para modelos Bonsai 1-bit/ternary (Qwen3, FLUX.2-Klein imagen) en CPU/Metal/CUDA. Refuerza Astraura 1.58-bit local como núcleo soberano de inferencia.",
    native: false,
    defaultOn: false,
    adapter: null,
    autoUpdate: { enabled: true, github: "cool-japan/oxibonsai", pollMinutes: 1440 },
    reqs: { gpu: false, rust: true, note: "Requiere Rust + modelos; no instalable en Mac M1 8GB sin build pesado. Referenciar kernel 1.58-bit y adaptar." },
    status: "registered",
  },
  {
    id: "draw-realtime",
    label: "draw-realtime — video2video/text2video 1.58-bit en tiempo real",
    domain: "inference",
    repo: "https://github.com/jasperan/draw-realtime",
    license: "MIT",
    why: "Generación audiovisual en tiempo real con cuantización 1.58-bit (BitNet PTQ), StreamDiffusion + FLUX.2 Klein + MonarchRT. Sección de creación visual del OS.",
    native: false,
    defaultOn: false,
    adapter: null,
    autoUpdate: { enabled: true, github: "jasperan/draw-realtime", pollMinutes: 1440 },
    reqs: { gpu: true, note: "Requiere NVIDIA GPU + CUDA + ~10GB VRAM. NO ejecutable en Mac M1 8GB. Referenciar para la arquitectura de creación visual." },
    status: "registered",
  },
  {
    id: "flux-158",
    label: "1.58-bit FLUX (paper) — cuantización de FLUX.1-dev a 1.58-bit",
    domain: "research",
    repo: "https://arxiv.org/abs/2412.18653",
    license: "paper",
    why: "Base teórica para la generación de imagen 1.58-bit del OS: 7.7× menor almacenamiento, 5.1× menos memoria, calidad comparable. Complementa oxibonsai/draw-realtime.",
    native: true,
    defaultOn: true,
    adapter: null,
    autoUpdate: { enabled: false, github: null, pollMinutes: 1440 },
    reqs: { referenceOnly: true, note: "Referencia teórica; no ejecutable." },
    status: "registered",
  },
];

/* ───────────────────────────── API de consulta ───────────────────────── */

/** Entradas nativas por defecto (las que los agentes usan sin activación). */
export function defaultIntegrations(): IntegrationEntry[] {
  return INTEGRATIONS.filter((i) => i.native && i.defaultOn);
}

/** Entradas de un dominio concreto. */
export function integrationsByDomain(domain: IntegrationDomain): IntegrationEntry[] {
  return INTEGRATIONS.filter((i) => i.domain === domain);
}

/** Busca una entrada por id (insensible). */
export function getIntegration(id: string): IntegrationEntry | null {
  const key = String(id || "").trim().toLowerCase();
  return INTEGRATIONS.find((i) => i.id === key) ?? null;
}

/** Entradas con auto-update habilitado (para free-sources-sync.ts). */
export function autoUpdatable(): IntegrationEntry[] {
  return INTEGRATIONS.filter((i) => i.autoUpdate.enabled && i.autoUpdate.github);
}
