"use client";

/**
 * Cerebros · MEMORY TYPES — registro central de tipos de memoria
 * ============================================================================
 * Fuente de verdad única de "qué tipos de memoria existen" para todo el OS.
 * Cada tipo es compatible con .md (markdown + frontmatter opcional + enlaces
 * [[wiki]] estilo Obsidian). Ver architecture/cerebros-memorias-graphify.md §3-4.
 *
 * COMPATIBILIDAD: los 5 ficheros semilla existentes de
 * src/lib/cerebro/memory-files.ts (soul/memory/dream/skills/apis) NO se tocan
 * ni cambian de color — este registro los incluye con los MISMOS tonos para
 * continuidad visual entre `/cerebro` (paneles) y `/cerebro/mapa` (grafos).
 *
 * Extensible en caliente: registerMemoryType() añade tipos custom sin romper
 * los ya existentes. Nunca lanza; memoryTypeById() cae a "memory" (genérico).
 *
 * NOTA (jul-2026): Reor (github.com/reorproject/reor, paquete `iatool-reor`,
 * capacidad `local-ai-notes` en skills.ts) documenta un patrón conceptualmente
 * afín a este catálogo — misma filosofía de bóveda markdown local con enlaces
 * [[wiki]]. Sin integración de código aquí (Reor no tiene API pública hoy):
 * solo doc/referencia. Ver architecture/astraura-inteligencia.md §21.
 */

import {
  Sparkles,
  FileText,
  Moon,
  Wand2,
  Plug,
  Bot,
  Paintbrush,
  Bell,
  BookOpen,
  Layers,
  Wrench,
  Puzzle,
  Palette,
  Cable,
  ScrollText,
  LayoutGrid,
  Send,
  Users,
  FileCode,
  Braces,
  Settings,
  LayoutDashboard,
  MonitorSmartphone,
  PenSquare,
  Presentation,
  Globe,
  Compass,
  AppWindow,
  Component,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Id de tipo de memoria. Extensible: cualquier string registrado vale. */
export type MemoryTypeId = string;

/**
 * Taxonomía COGNITIVA transversal (jul-2026). Mapea cada tipo de memoria a una
 * de las 8 categorías cognitivas usadas por el grafo semántico
 * (src/components/exocortex/exocortex-brain.tsx KIND_LABEL y
 * src/data/starseed-memory-graph.json). Es un EJE ORTOGONAL al `id` de tipo:
 * varios tipos (memory, knowledge…) comparten un mismo `cognitiveKind`
 * (semantic). Sirve de filtro extra en el Hub y las vistas 2D/3D.
 */
export type CognitiveKind =
  | "identity"
  | "semantic"
  | "episodic"
  | "procedural"
  | "project"
  | "reference"
  | "account"
  | "feedback";

/** Etiquetas es-ES de la taxonomía cognitiva (idénticas a exocortex-brain.tsx). */
export const COGNITIVE_KINDS: Record<CognitiveKind, { label: string; color: string; blurb: string }> = {
  identity:   { label: "Identidad",  color: "#c084fc", blurb: "Quién es: alma, ego, valores y reglas." },
  semantic:   { label: "Semántica",  color: "#38bdf8", blurb: "Hechos, conocimiento y significados." },
  episodic:   { label: "Episódica",  color: "#94a3b8", blurb: "Eventos, bitácoras y traspasos en el tiempo." },
  procedural: { label: "Procedural", color: "#fbbf24", blurb: "Cómo hacer: skills, agentes, funciones, MCPs." },
  project:    { label: "Proyecto",   color: "#818cf8", blurb: "Objetivos, tareas, sueños e ideas en gestación." },
  reference:  { label: "Referencia", color: "#2dd4bf", blurb: "Contexto, configs, APIs y material de consulta." },
  account:    { label: "Cuenta",     color: "#4ade80", blurb: "Perfiles y datos de cuenta." },
  feedback:   { label: "Feedback",   color: "#f472b6", blurb: "Correcciones y aprendizajes del usuario." },
};

/** Lista ordenada de ids cognitivos (para selects/filtros). */
export const COGNITIVE_KIND_IDS: CognitiveKind[] = Object.keys(COGNITIVE_KINDS) as CognitiveKind[];

/** Etiqueta legible de un id cognitivo (cae al propio id si no existe). */
export function cognitiveKindLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return COGNITIVE_KINDS[id as CognitiveKind]?.label ?? id;
}

export interface MemoryTypeDef {
  id: MemoryTypeId;
  label: string;
  blurb: string;
  icon: LucideIcon;
  /** Color hex para nodos/badges de este tipo. */
  color: string;
  /** Nombre de fichero semilla por defecto (p.ej. "dream.md"). */
  defaultFile: string;
  /** ¿Es uno de los 5 tipos "núcleo" ya sembrados por ensureSeedFiles()? */
  core?: boolean;
  /** Categoría cognitiva transversal (taxonomía de 8) a la que pertenece. */
  cognitiveKind?: CognitiveKind;
}

/* ------------------------------------------------------------------ */
/* Catálogo (32 tipos requeridos + extensible)                         */
/* ------------------------------------------------------------------ */

const BUILTIN_TYPES: MemoryTypeDef[] = [
  { id: "memory", label: "Memoria", blurb: "Hechos/estado genéricos (fallback).", icon: FileText, color: "#38bdf8", defaultFile: "memory.md", core: true, cognitiveKind: "semantic" },
  { id: "ego", label: "Ego", blurb: "Configuración/identidad de Aurora.", icon: Bot, color: "#f0abfc", defaultFile: "ego.md", cognitiveKind: "identity" },
  { id: "soul", label: "Alma", blurb: "Identidad, valores y reglas del cerebro.", icon: Sparkles, color: "#c084fc", defaultFile: "soul.md", core: true, cognitiveKind: "identity" },
  { id: "dream", label: "Sueños", blurb: "Objetivos e ideas en gestación.", icon: Moon, color: "#818cf8", defaultFile: "dream.md", core: true, cognitiveKind: "project" },
  { id: "imagine", label: "Imaginación", blurb: "Ideas especulativas / brainstorming.", icon: Wand2, color: "#e879f9", defaultFile: "imagine.md", cognitiveKind: "project" },
  { id: "style", label: "Estilo", blurb: "Sistema de diseño / preferencias visuales.", icon: Paintbrush, color: "#fb7185", defaultFile: "style.md", cognitiveKind: "reference" },
  { id: "reminders", label: "Recordatorios", blurb: "Recordatorios y tareas con fecha.", icon: Bell, color: "#fcd34d", defaultFile: "reminders.md", cognitiveKind: "project" },
  { id: "knowledge", label: "Conocimiento", blurb: "Conocimiento consolidado / aprendizajes.", icon: BookOpen, color: "#60a5fa", defaultFile: "knowledge.md", cognitiveKind: "semantic" },
  { id: "contexts", label: "Contextos", blurb: "Contexto de sesión/situación.", icon: Layers, color: "#2dd4bf", defaultFile: "contexts.md", cognitiveKind: "reference" },
  { id: "skills", label: "Habilidades", blurb: "Catálogo de habilidades del cerebro.", icon: Wrench, color: "#fbbf24", defaultFile: "skills.md", core: true, cognitiveKind: "procedural" },
  { id: "plugins", label: "Plugins", blurb: "Plugins/MCPs instalados y su config.", icon: Puzzle, color: "#a78bfa", defaultFile: "plugins.md", cognitiveKind: "procedural" },
  { id: "apis", label: "APIs", blurb: "APIs y conexiones (claves por referencia).", icon: Plug, color: "#34d399", defaultFile: "apis.md", core: true, cognitiveKind: "reference" },
  { id: "designs", label: "Diseños", blurb: "Diseños/mockups referenciados.", icon: Palette, color: "#f472b6", defaultFile: "designs.md", cognitiveKind: "reference" },
  { id: "mcps", label: "MCPs", blurb: "Servidores MCP conectados.", icon: Cable, color: "#22d3ee", defaultFile: "mcps.md", cognitiveKind: "procedural" },
  { id: "logs", label: "Registros", blurb: "Bitácora de eventos del sistema.", icon: ScrollText, color: "#94a3b8", defaultFile: "logs.md", cognitiveKind: "episodic" },
  { id: "ui", label: "Interfaz", blurb: "Preferencias de interfaz.", icon: LayoutGrid, color: "#7dd3fc", defaultFile: "ui.md", cognitiveKind: "reference" },
  { id: "handoff", label: "Traspaso", blurb: "Traspasos de contexto entre sesiones/agentes.", icon: Send, color: "#fdba74", defaultFile: "handoff.md", cognitiveKind: "episodic" },
  { id: "profiles", label: "Perfiles", blurb: "Perfiles de cuenta relevantes.", icon: Users, color: "#4ade80", defaultFile: "profiles.md", cognitiveKind: "account" },
  { id: "agents", label: "Agentes", blurb: "Agentes configurados.", icon: Bot, color: "#fb923c", defaultFile: "agents.md", cognitiveKind: "procedural" },
  { id: "pages", label: "Páginas", blurb: "Páginas/entidades relevantes.", icon: FileCode, color: "#c4b5fd", defaultFile: "pages.md", cognitiveKind: "reference" },
  { id: "functions", label: "Funciones", blurb: "Funciones/acciones definidas.", icon: Braces, color: "#93c5fd", defaultFile: "functions.md", cognitiveKind: "procedural" },
  { id: "configs", label: "Configuraciones", blurb: "Configuraciones técnicas.", icon: Settings, color: "#a3a3a3", defaultFile: "configs.md", cognitiveKind: "reference" },
  { id: "preferences", label: "Preferencias", blurb: "Preferencias de usuario.", icon: Settings, color: "#d4d4d8", defaultFile: "preferences.md", cognitiveKind: "reference" },
  { id: "dashboards", label: "Dashboards", blurb: "Dashboards guardados.", icon: LayoutDashboard, color: "#5eead4", defaultFile: "dashboards.md", cognitiveKind: "reference" },
  { id: "desktops", label: "Escritorios", blurb: "Escritorios guardados.", icon: MonitorSmartphone, color: "#fda4af", defaultFile: "desktops.md", cognitiveKind: "reference" },
  { id: "whiteboard", label: "Pizarra blanca", blurb: "Pizarras (contenido/enlaces).", icon: PenSquare, color: "#fef08a", defaultFile: "whiteboard.md", cognitiveKind: "project" },
  { id: "blackboard", label: "Pizarra negra", blurb: "Notas de pizarra oficial/lectura.", icon: Presentation, color: "#d6d3d1", defaultFile: "blackboard.md", cognitiveKind: "reference" },
  { id: "web", label: "Web", blurb: "Referencias web relevantes.", icon: Globe, color: "#67e8f9", defaultFile: "web.md", cognitiveKind: "reference" },
  { id: "browser", label: "Navegador", blurb: "Contexto de navegación.", icon: Compass, color: "#86efac", defaultFile: "browser.md", cognitiveKind: "episodic" },
  { id: "apps", label: "Apps", blurb: "Apps generadas/instaladas relevantes.", icon: AppWindow, color: "#fdba74", defaultFile: "apps.md", cognitiveKind: "reference" },
  { id: "widgets", label: "Widgets", blurb: "Widgets configurados.", icon: Component, color: "#fbcfe8", defaultFile: "widgets.md", cognitiveKind: "reference" },
];

/** Registro mutable (BUILTIN_TYPES + tipos custom registrados en caliente). */
const REGISTRY: Map<string, MemoryTypeDef> = new Map(BUILTIN_TYPES.map((t) => [t.id, t]));

/** Tipo genérico de respaldo cuando no se reconoce nada (nunca falla). */
const FALLBACK_TYPE: MemoryTypeDef = REGISTRY.get("memory")!;

/** Registra (o sobrescribe) un tipo de memoria custom. Aditivo, nunca lanza. */
export function registerMemoryType(def: MemoryTypeDef): void {
  try {
    if (!def?.id) return;
    REGISTRY.set(def.id, def);
  } catch {
    /* no-op defensivo */
  }
}

/** Catálogo completo (builtin + custom registrados), en orden de inserción. */
export function listMemoryTypes(): MemoryTypeDef[] {
  return Array.from(REGISTRY.values());
}

/** Busca un tipo por id; cae a "memory" (genérico) si no existe. Nunca lanza. */
export function memoryTypeById(id: string | null | undefined): MemoryTypeDef {
  if (!id) return FALLBACK_TYPE;
  return REGISTRY.get(id) ?? FALLBACK_TYPE;
}

/** Ids válidos del catálogo actual (para validar selects/formularios). */
export function memoryTypeIds(): string[] {
  return Array.from(REGISTRY.keys());
}

/**
 * Mapa de respaldo para los `kinds` que usa el Memory Hub (tabla `memories`) y
 * que NO son ids de tipo del registro (md, 3d, tokens, connections, mcp…).
 */
const HUB_KIND_TO_COGNITIVE: Record<string, CognitiveKind> = {
  md: "semantic",
  "3d": "reference",
  tokens: "reference",
  connections: "reference",
  mcp: "procedural",
  apis: "reference",
  skills: "procedural",
  plugins: "procedural",
  soul: "identity",
  ego: "identity",
  dream: "project",
  memory: "semantic",
};

/**
 * Categoría cognitiva de un tipo/kind: (1) `cognitiveKind` del tipo registrado,
 * (2) mapa del Hub, (3) fallback "semantic". Nunca lanza.
 */
export function cognitiveKindOf(typeOrKind: string | null | undefined): CognitiveKind {
  try {
    if (!typeOrKind) return "semantic";
    const def = REGISTRY.get(typeOrKind);
    if (def?.cognitiveKind) return def.cognitiveKind;
    if (HUB_KIND_TO_COGNITIVE[typeOrKind]) return HUB_KIND_TO_COGNITIVE[typeOrKind];
    return "semantic";
  } catch {
    return "semantic";
  }
}

/**
 * Categoría cognitiva de una memoria del Hub por su lista de `kinds[]`: usa el
 * primer kind reconocido; si ninguno, "semantic".
 */
export function cognitiveKindOfKinds(kinds: string[] | null | undefined): CognitiveKind {
  if (!Array.isArray(kinds) || kinds.length === 0) return "semantic";
  for (const k of kinds) {
    const def = REGISTRY.get(k);
    if (def?.cognitiveKind) return def.cognitiveKind;
    if (HUB_KIND_TO_COGNITIVE[k]) return HUB_KIND_TO_COGNITIVE[k];
  }
  return "semantic";
}

/* ------------------------------------------------------------------ */
/* Inferencia de tipo (frontmatter → nombre de fichero → fallback)      */
/* ------------------------------------------------------------------ */

/** Quita la extensión .md (case-insensitive) de un nombre de fichero. */
function stemOf(name: string): string {
  return (name || "").toLowerCase().replace(/\.md$/i, "").trim();
}

/**
 * Infiere el tipo de una memoria: (1) `meta.type` si es un id válido,
 * (2) el nombre de fichero (sin .md) si coincide con un id o su defaultFile,
 * (3) fallback "memory". Nunca lanza.
 */
export function inferMemoryType(name: string, meta?: Record<string, unknown> | null): MemoryTypeDef {
  try {
    const metaType = meta && typeof meta.type === "string" ? meta.type : undefined;
    if (metaType && REGISTRY.has(metaType)) return REGISTRY.get(metaType)!;
    const stem = stemOf(name);
    if (REGISTRY.has(stem)) return REGISTRY.get(stem)!;
    for (const t of REGISTRY.values()) {
      if (stemOf(t.defaultFile) === stem) return t;
    }
    return FALLBACK_TYPE;
  } catch {
    return FALLBACK_TYPE;
  }
}

/* ------------------------------------------------------------------ */
/* Frontmatter (parser propio, sin dependencias nuevas)                 */
/* ------------------------------------------------------------------ */

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

/** Interpreta un valor escalar simple: true/false, número, array [a, b], o string. */
function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => parseScalar(s.trim()));
  }
  // Quita comillas envolventes si las hay.
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parsea un bloque frontmatter `---\nclave: valor\n---` al inicio del markdown.
 * Sin bloque → { data: {}, body: markdown } (compatibilidad total con ficheros
 * existentes sin frontmatter). Formato deliberadamente simple (subconjunto de
 * YAML: pares clave/valor de una línea + arrays inline) — sin librerías nuevas.
 */
export function parseFrontmatter(markdown: string): ParsedMarkdown {
  try {
    const src = markdown ?? "";
    const m = src.match(FRONTMATTER_RX);
    if (!m) return { data: {}, body: src };
    const data: Record<string, unknown> = {};
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      if (!key) continue;
      data[key] = parseScalar(line.slice(idx + 1));
    }
    return { data, body: m[2] ?? "" };
  } catch {
    return { data: {}, body: markdown ?? "" };
  }
}

/** Serializa un valor simple al formato frontmatter (inverso de parseScalar). */
function stringifyScalar(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => stringifyScalar(x)).join(", ")}]`;
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return String(v ?? "");
}

/**
 * Serializa `{data, body}` de vuelta a markdown. Si `data` está vacío devuelve
 * `body` sin tocar (no ensucia documentos simples con un frontmatter vacío).
 */
export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  try {
    const keys = Object.keys(data || {});
    if (keys.length === 0) return body ?? "";
    const lines = keys.map((k) => `${k}: ${stringifyScalar(data[k])}`);
    return `---\n${lines.join("\n")}\n---\n\n${(body ?? "").replace(/^\n+/, "")}`;
  } catch {
    return body ?? "";
  }
}

/* ------------------------------------------------------------------ */
/* Enlaces [[wiki]] (mismo formato que src/lib/memory-vault.ts)         */
/* ------------------------------------------------------------------ */

/** Extrae los nombres referenciados vía `[[Nombre]]` en un texto. Nunca lanza. */
export function extractWikiLinks(text: string): string[] {
  try {
    const re = /\[\[([^\]]+)\]\]/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text || "")) !== null) out.push(m[1].trim());
    return out;
  } catch {
    return [];
  }
}

/** ¿Este documento está marcado como importante (frontmatter o tipo protegido)? */
export function isImportantMemory(meta: Record<string, unknown> | null | undefined, typeId?: string): boolean {
  try {
    if (meta && (meta.important === true || meta.important === "true")) return true;
    return typeId === "soul" || typeId === "ego";
  } catch {
    return false;
  }
}

/**
 * Contenido semilla para un tipo dado: frontmatter `type:` + encabezado. Usado
 * al crear una memoria nueva desde el grafo (§4 del SOP): compatible con
 * ficheros existentes sin frontmatter (no se fuerza sobre ellos).
 */
export function seedContentFor(typeId: string): string {
  const t = memoryTypeById(typeId);
  return stringifyFrontmatter({ type: t.id }, `# ${t.label}\n\n${t.blurb}\n`);
}
