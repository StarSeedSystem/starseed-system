"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · Sistema de PAQUETES INSTALABLES (estilo Cydia)
// ----------------------------------------------------------------------------
// La Biblioteca es la TIENDA VIVA del OS: desde ella se instala CUALQUIER COSA
// directamente al sistema — repos (fuentes de paquetes), apps, widgets,
// páginas, publicaciones, pizarras, investigaciones, proyectos, diseños,
// animaciones, funciones/skills y FUENTES DE IA. Todo open source y
// gratis-primero (Tríada §3 · Comunismo de Abundancia).
//
// HONESTIDAD RADICAL: cada paquete declara en su `payload` EXACTAMENTE lo que
// hará al instalarse, y solo existen paquetes cuyo efecto es REAL hoy:
//   · ai-source  → activa una fuente del FREE_CATALOG en Astraura (quita el id
//                  de `disabledSources`; si necesita clave, guía a conseguirla
//                  y a Ajustes → Inteligencia).
//   · design     → añade `payload.materialClass` al registro de diseño
//                  (`starseed.library.design.v1`) y emite "starseed:design".
//                  La capa de materiales (src/styles/starseed-materials.css,
//                  en creación en esta misma ola) LEERÁ ese registro para
//                  aplicar las clases a las superficies del OS.
//   · animation  → igual que design pero con `payload.animClass`.
//   · function   → registra `payload.skillId` en `starseed.library.functions.v1`
//                  (skills de Aurora; los cerebros leen este registro).
//   · repo       → añade OTRO repo de paquetes por URL (JSON con shape
//                  LibraryRepo) — el mecanismo "añadir fuente" de Cydia.
//   · app/widget/page/publication/board/research/project → abren la ruta REAL
//                  del OS (`payload.route`). Si algo aún no tiene ruta real,
//                  se marca `comingSoon` y el botón queda deshabilitado.
//   · externo    → cualquier kind con `payload.externalUrl` y SIN `route`
//                  (p.ej. TabFM/AgentOS: servicios Python/servidor o repos de
//                  referencia): instalar = GUARDAR el enlace en la biblioteca
//                  (`starseed.library.links.v1`) y ABRIR la URL en pestaña
//                  nueva. Honestidad: NO fingimos ejecutarlo en el navegador;
//                  si además trae `catalogSourceId` (Sipp) se activa esa fuente.
//
// Persistencia (localStorage, soberana; SSR-safe y defensiva):
//   · `starseed.library.installed.v1` → { [packageId]: {installedAt,version,kind} }
//     (ya viaja con la cuenta: está en SYNCED_KEYS de settings-sync).
//   · `starseed.library.repos.v1`     → repos externos añadidos por URL.
//   · `starseed.library.design.v1`    → clases de material/animación activas.
//   · `starseed.library.functions.v1` → skills instaladas.
//   · `starseed.library.links.v1`     → enlaces guardados (research/externos).
//   · `starseed.library.mine.v1`      → repo local del usuario (réplicas/forks).
//   · `starseed.library.published.v1` → ramas marcadas como públicas (local;
//     la publicación real a la red es un paso futuro vía Supabase).
// Tras cada mutación se emite el evento window "starseed:library" (el mismo
// que usa library-store.ts, para que toda la Biblioteca reaccione).
// ════════════════════════════════════════════════════════════════════════════

import { FREE_CATALOG, findSource } from "@/ai/astraura/free-catalog";
// Agentes builtin (P5). `builtins.ts` solo depende de `./model` (sin ciclo con
// este módulo), así que un import estático es seguro y más robusto que require.
import { BUILTIN_AGENTS as AGENT_BUILTINS } from "@/lib/agents/builtins";
// Catálogo de TEMAS/ESTILOS (P·Catálogo). El import ya registra los ~24
// ThemePacks builtin (side-effect de theme-catalog.ts); applyTheme (aliased)
// es lo que instalar un paquete design-theme-* ejecuta de verdad.
import { BUILTIN_THEMES } from "@/lib/design/theme-catalog";
import { applyTheme as applyThemePack } from "@/lib/design/theme-engine";
// Elementos de Diseño sueltos (Mezclador — theme-mixer.ts): paletas,
// materiales, fondos, tipografías, animaciones, densidades y efectos que se
// exponen también como paquetes "design" instalables (payload.elementKind),
// para que aparezcan en la Biblioteca y el Mezclador los liste como fuentes.
import { DESIGN_ELEMENTS, type DesignElementKind } from "@/lib/design/design-elements";

/* ───────────────────────────── Tipos ───────────────────────────── */

/** Todo lo instalable desde la Biblioteca. */
export type PackageKind =
  | "app"
  | "widget"
  | "page"
  | "publication"
  | "board"
  | "research"
  | "project"
  | "design"
  | "animation"
  | "function"
  | "ai-source"
  | "repo"
  // Agentes (P5): un agente Aurora+Astraura guardable/instalable. Su efecto de
  // instalación (packages.install) registra el agente en el store de agentes
  // (src/lib/agents/store.ts). El `payload.agent` lleva su definición.
  | "agent";

/** Un paquete instalable. El `payload` describe su efecto real (transparencia). */
export interface LibraryPackage {
  id: string;
  kind: PackageKind;
  name: string;
  description: string;
  /** Nombre de icono lucide (la UI lo resuelve con fallback a Package). */
  icon: string;
  tags: string[];
  version: string;
  author: string;
  /** Repo del que procede (se rellena al listar). */
  sourceRepoId: string;
  /** Gratis-primero: hoy todo el catálogo de arranque es gratuito. */
  free: boolean;
  /** Datos del efecto de instalación (visible al usuario en la ficha). */
  payload: Record<string, unknown>;
  /** Honesto: aún sin efecto real → botón deshabilitado. (Aditivo opcional.) */
  comingSoon?: boolean;
  /** Destacado en la portada de la tienda. (Aditivo opcional.) */
  featured?: boolean;
  /** Si es una COPIA replicada: id del paquete original. (Aditivo opcional.) */
  forkedFrom?: string;
  /** Visibilidad de una rama del usuario: "private" (por defecto) o "public". */
  visibility?: "private" | "public";
}

/** Un repo (fuente de paquetes), builtin o añadido por URL. */
export interface LibraryRepo {
  id: string;
  name: string;
  url?: string;
  builtin?: boolean;
  packages: LibraryPackage[];
}

/** Entrada del registro de instalados. */
export interface InstalledEntry {
  installedAt: number;
  version: string;
  kind: PackageKind;
}

/** Resultado de install()/uninstall() para que la UI reaccione (toast/route). */
export interface InstallResult {
  ok: boolean;
  message: string;
  /** "route" → navegar dentro del OS · "external" → abrir URL externa. */
  action?: "route" | "external";
  href?: string;
}

/* ─────────────────────── Claves y eventos ─────────────────────── */

export const INSTALLED_KEY = "starseed.library.installed.v1";
export const REPOS_KEY = "starseed.library.repos.v1";
export const DESIGN_KEY = "starseed.library.design.v1";
export const FUNCTIONS_KEY = "starseed.library.functions.v1";
/** Copias editables del usuario (fork local, estilo Cydia «Replicar»). */
export const MINE_KEY = "starseed.library.mine.v1";
/** Ramas marcadas como públicas (preparadas para publicar a la red). */
export const PUBLISHED_KEY = "starseed.library.published.v1";
/** Enlaces guardados sin ejecutar efecto (research/project/externos). */
export const LINKS_KEY = "starseed.library.links.v1";
/** Mismo evento que library-store.ts: toda la Biblioteca escucha uno solo. */
export const LIBRARY_EVENT = "starseed:library";
/** Evento para la capa de materiales/animaciones del OS. */
export const DESIGN_EVENT = "starseed:design";

export const VALID_KINDS: PackageKind[] = [
  "app", "widget", "page", "publication", "board", "research",
  "project", "design", "animation", "function", "ai-source", "repo",
  "agent",
];

/* ─────────────────── Utilidades base (SSR-safe) ─────────────────── */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

function emitLibraryEvent(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new Event(LIBRARY_EVENT));
  } catch { /* noop */ }
}

/** Suscripción sencilla a cambios de la Biblioteca (para componentes). */
export function subscribeLibrary(cb: () => void): () => void {
  if (!isClient()) return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || (e.key && e.key.startsWith("starseed.library."))) cb();
  };
  window.addEventListener(LIBRARY_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LIBRARY_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* ═══════════════════ REPO BUILTIN «starseed-core» ═══════════════════ */

/**
 * Paquetes de fuentes de IA derivados del FREE_CATALOG (fuente de verdad
 * única: nombre, límites y `why` viven allí). Solo las fuentes gratuitas
 * curadas de arranque; instalar = activarla en Astraura.
 */
const CORE_AI_SOURCE_IDS: { catalogId: string; icon: string; featured?: boolean }[] = [
  { catalogId: "groq-free", icon: "Zap", featured: true },
  { catalogId: "cerebras-free", icon: "Gauge" },
  { catalogId: "openrouter-free", icon: "Shapes", featured: true },
  { catalogId: "omniroute-local", icon: "Network", featured: true },
  { catalogId: "gemini-free", icon: "Sparkles", featured: true },
  { catalogId: "pollinations-text", icon: "Flower2", featured: true },
  { catalogId: "chrome-ai", icon: "Chrome" },
  { catalogId: "webllm", icon: "Globe" },
  { catalogId: "ollama-local", icon: "HardDrive" },
];

function buildAiSourcePackages(): LibraryPackage[] {
  const out: LibraryPackage[] = [];
  for (const entry of CORE_AI_SOURCE_IDS) {
    const src = FREE_CATALOG.find((s) => s.id === entry.catalogId);
    if (!src) continue; // defensivo: si el catálogo cambia, no rompemos
    out.push({
      id: `ai-${src.id}`,
      kind: "ai-source",
      name: src.label,
      description: `${src.why} Límites: ${src.limits}`,
      icon: entry.icon,
      tags: [
        src.tier === "local" ? "local" : src.tier === "instant" ? "sin-clave" : "clave-gratis",
        src.privacy,
        "ia",
      ],
      version: "1.0.0",
      author: "Catálogo Astraura",
      sourceRepoId: "starseed-core",
      free: true,
      featured: entry.featured,
      payload: { catalogSourceId: src.id },
    });
  }
  return out;
}

/** Temas de material: instalar = activar la clase en el registro de diseño. */
const CORE_DESIGN_PACKAGES: LibraryPackage[] = [
  {
    id: "design-cristal-zenith", kind: "design", name: "Cristal Zenith",
    description: "Material de cristal líquido azul zenital: superficies translúcidas con refracción suave para paneles y tarjetas.",
    icon: "Gem", tags: ["tema", "cristal", "zenith"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { materialClass: "ss-crystal" },
  },
  {
    id: "design-neon-horizon", kind: "design", name: "Neón Horizon",
    description: "Bordes y brillos neón verde-lima del nodo Horizon: vitalidad y génesis para las superficies de creación.",
    icon: "Zap", tags: ["tema", "neon", "horizon"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { materialClass: "ss-neon--horizon" },
  },
  {
    id: "design-metal-logic", kind: "design", name: "Metal Logic",
    description: "Material metálico bruñido ámbar del nodo Logic: orden y ejecución con reflejos dorados.",
    icon: "Layers", tags: ["tema", "metal", "logic"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { materialClass: "ss-metal" },
  },
  {
    id: "design-madera-calida", kind: "design", name: "Madera Cálida",
    description: "Vetas de madera cálida y biomimética para quienes prefieren un OS más orgánico y acogedor.",
    icon: "TreePine", tags: ["tema", "madera", "organico"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { materialClass: "ss-wood" },
  },
  {
    id: "design-naturaleza-viva", kind: "design", name: "Naturaleza Viva",
    description: "Superficies vivas con musgo, hoja y agua: biomimética Cyberdelic para disolver la frontera máquina-naturaleza.",
    icon: "Leaf", tags: ["tema", "naturaleza", "biomimetica"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { materialClass: "ss-nature" },
  },
];

/** Animaciones de interfaz: instalar = activar la clase de animación. */
const CORE_ANIMATION_PACKAGES: LibraryPackage[] = [
  {
    id: "anim-flotacion-3d", kind: "animation", name: "Flotación 3D",
    description: "Las tarjetas flotan con una deriva 3D sutil, como cristales suspendidos en gravedad cero.",
    icon: "Move3d", tags: ["animacion", "3d", "flotar"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { animClass: "ss-anim-float" },
  },
  {
    id: "anim-respiracion-neon", kind: "animation", name: "Respiración neón",
    description: "Brillo neón que respira lentamente en bordes y acentos: el OS se siente vivo sin distraer.",
    icon: "Activity", tags: ["animacion", "neon", "brillo"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { animClass: "ss-anim-breathe" },
  },
  {
    id: "anim-micro-tilt", kind: "animation", name: "Micro-tilt",
    description: "Inclinación 3D milimétrica al pasar el cursor sobre tarjetas y botones (150-300 ms, como manda el design system).",
    icon: "Rotate3d", tags: ["animacion", "tilt", "hover"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { animClass: "ss-anim-tilt" },
  },
];

/** Superficies reales del OS: instalar = registrar + abrir su ruta. */
const CORE_ROUTE_PACKAGES: LibraryPackage[] = [
  {
    id: "app-navegador", kind: "app", name: "Navegador Estelar",
    description: "El navegador integrado del OS: pestañas soberanas dentro de tu sistema, sin salir de StarSeed.",
    icon: "Globe", tags: ["app", "navegador", "web"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { route: "/navegador" },
  },
  {
    id: "app-omnifrecuencias", kind: "app", name: "Omni-Frecuencias",
    description: "Frecuencias y paisajes sonoros generativos para foco, descanso y expansión de conciencia.",
    icon: "Radio", tags: ["app", "audio", "frecuencias"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/omnifrecuencias" },
  },
  {
    id: "app-red-3d", kind: "app", name: "Red 3D",
    description: "Visualización tridimensional de la red StarSeed: entidades, conexiones y flujo de la voluntad colectiva.",
    icon: "Orbit", tags: ["app", "3d", "red"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/red-3d" },
  },
  {
    id: "widget-panel-dashboard", kind: "widget", name: "Panel de Widgets",
    description: "El dashboard con widgets arrastrables del OS: clima, actividad, cripto-escudo, identidad y más.",
    icon: "LayoutGrid", tags: ["widget", "dashboard", "arrastrable"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { route: "/dashboard" },
  },
  {
    id: "page-escritorios", kind: "page", name: "Escritorios",
    description: "La página principal del OS: escritorios configurables con Aurora en el Exocórtex Zenith.",
    icon: "Monitor", tags: ["pagina", "escritorio", "inicio"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/escritorios" },
  },
  {
    id: "app-camara", kind: "app", name: "Cámara",
    description: "Cámara real del OS: foto y vídeo con controles auto y manuales, guardado en tu biblioteca personal.",
    icon: "Camera", tags: ["app", "camara", "foto", "video"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { route: "/camara" },
  },
  {
    id: "app-galeria", kind: "app", name: "Galería",
    description: "Tus fotos y vídeos organizados por fecha y álbumes, con visor, edición básica e Historias.",
    icon: "Images", tags: ["app", "galeria", "fotos", "videos"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { route: "/galeria" },
  },
  {
    id: "page-wiki", kind: "page", name: "Wiki de la Red",
    description: "El conocimiento común editable de la red: artículos vivos como Entidades Únicas (Lienzo Universal).",
    icon: "BookOpen", tags: ["pagina", "wiki", "conocimiento"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/wiki" },
  },
  {
    id: "board-pizarras", kind: "board", name: "Pizarras colaborativas",
    description: "Lienzos infinitos para pensar en común: notas, archivos y recursos de la Biblioteca en un mismo plano.",
    icon: "Presentation", tags: ["pizarra", "lienzo", "colaboracion"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { route: "/pizarras" },
  },
  {
    id: "research-explorer", kind: "research", name: "Explorer · investigación",
    description: "El explorador de investigación del OS: sumérgete en datos, fuentes y hallazgos de la red.",
    icon: "FlaskConical", tags: ["investigacion", "explorer", "datos"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/explorer" },
  },
  {
    id: "research-memorias-3d", kind: "research", name: "Memorias 3D",
    description: "Explora la memoria viva del sistema en tres dimensiones: grafo navegable de recuerdos y conceptos.",
    icon: "Boxes", tags: ["investigacion", "memoria", "3d"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/memorias-3d" },
  },
  {
    id: "project-design-canvas", kind: "project", name: "Lienzo de Diseño",
    description: "Proyecto de diseño visual del OS: compón interfaces y materiales en el canvas de creación.",
    icon: "Palette", tags: ["proyecto", "diseno", "canvas"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/design-canvas" },
  },
  {
    id: "publication-crear", kind: "publication", name: "Crear publicación",
    description: "El compositor de publicaciones de la red: comparte texto, archivos y recursos con tus comunidades.",
    icon: "PenSquare", tags: ["publicacion", "compositor", "red"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { route: "/publicar" },
  },
];

/** Skills de Aurora (funciones). Solo la real hoy + próximas honestas. */
const CORE_FUNCTION_PACKAGES: LibraryPackage[] = [
  {
    // Id real de src/lib/brain-skills (AUTO_UPDATE_SKILL_ID): la única skill
    // registrada hoy en el OS. Si añades skills allí, refléjalas aquí.
    id: "fn-auto-update", kind: "function", name: "Auto-actualización de cerebros",
    description: "Skill de Aurora que mantiene tus cerebros al día y te recomienda alternativas mejores cuando aparecen.",
    icon: "RefreshCw", tags: ["skill", "aurora", "cerebros"], version: "1.0.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true,
    payload: { skillId: "starseed-auto-update" },
  },
  {
    id: "fn-resumen-diario", kind: "function", name: "Resumen diario",
    description: "Aurora te resumirá cada mañana lo importante de tu red. Aún en construcción: se activará cuando exista de verdad.",
    icon: "CalendarClock", tags: ["skill", "aurora", "resumen"], version: "0.1.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, comingSoon: true,
    payload: { skillId: "starseed-daily-digest" },
  },
  {
    id: "fn-traduccion-viva", kind: "function", name: "Traducción viva",
    description: "Traducción automática de publicaciones entre idiomas de la red. Aún en construcción: honestamente, todavía no hace nada.",
    icon: "Languages", tags: ["skill", "aurora", "traduccion"], version: "0.1.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, comingSoon: true,
    payload: { skillId: "starseed-live-translate" },
  },
];

/** Repos añadibles como paquete (mecanismo Cydia de «fuentes»). */
const CORE_REPO_PACKAGES: LibraryPackage[] = [
  {
    id: "repo-comunidad", kind: "repo", name: "Repo de la Comunidad",
    description: "Cuando la red publique su índice de paquetes comunitarios (JSON con shape LibraryRepo), este paquete lo añadirá como fuente. Mientras tanto puedes añadir cualquier repo por URL en la pestaña Repos.",
    icon: "GitBranch", tags: ["repo", "comunidad", "fuente"], version: "0.1.0",
    author: "StarSeed Core", sourceRepoId: "starseed-core", free: true, comingSoon: true,
    payload: { url: "" },
  },
];

/** El repo builtin de arranque (~30 paquetes con efecto real u honestidad). */
export const STARSEED_CORE_REPO: LibraryRepo = {
  id: "starseed-core",
  name: "StarSeed Core",
  builtin: true,
  packages: [
    ...buildAiSourcePackages(),
    ...CORE_DESIGN_PACKAGES,
    ...CORE_ANIMATION_PACKAGES,
    ...CORE_ROUTE_PACKAGES,
    ...CORE_FUNCTION_PACKAGES,
    ...CORE_REPO_PACKAGES,
  ],
};

/* ═══════════════════ REPO BUILTIN «starseed-labs» ═══════════════════ */
/**
 * Laboratorio: repos y modelos OSS reales que el visionario pidió incorporar
 * como PAQUETES INSTALABLES. Cada uno declara en su payload EXACTAMENTE su
 * efecto (transparencia radical):
 *   · ai-source con `catalogSourceId` → activa esa fuente en Astraura (igual
 *     que los de core: quita su id de `disabledSources`).
 *   · function con `skillId` + `route` → registra la skill y lleva a activarla.
 *   · repo con `url` → añade OTRA fuente de paquetes (mecanismo Cydia).
 *   · research/project/function con `externalUrl` (y SIN route) → guarda el
 *     enlace en la biblioteca y lo abre; honesto sobre que es servicio/servidor
 *     o repo de referencia, no algo que finjamos correr en el navegador.
 */
const LABS_PACKAGES: LibraryPackage[] = [
  /* ── SmolLM3 en el navegador (WebGPU · sin clave) ── */
  {
    id: "ai-smollm3-webgpu", kind: "ai-source", name: "SmolLM3 3B (navegador)",
    description:
      "LLM abierto (Apache-2.0) que corre 100% en tu navegador con WebGPU: privacidad total, buen español y razonamiento dual (/think). Instalar lo activa para Aurora; la 1ª vez descarga ~1,9 GB (cacheado).",
    icon: "BrainCircuit", tags: ["ia", "local", "webgpu", "texto"], version: "1.0.0",
    author: "HuggingFace · StarSeed Labs", sourceRepoId: "starseed-labs", free: true, featured: true,
    payload: { catalogSourceId: "smollm3-webgpu" },
  },
  /* ── SmolLM3 vía Ollama (local) ── */
  {
    id: "ai-smollm3-ollama", kind: "ai-source", name: "SmolLM3 (Ollama)",
    description:
      "El mismo SmolLM3 3B pero servido por Ollama en este equipo (soberanía máxima, sin límites). Requiere Ollama instalado y el modelo descargado (ollama pull alibayram/smollm3).",
    icon: "HardDrive", tags: ["ia", "local", "ollama", "texto"], version: "1.0.0",
    author: "Ollama · StarSeed Labs", sourceRepoId: "starseed-labs", free: true,
    payload: { catalogSourceId: "ollama-local", model: "alibayram/smollm3", note: "requiere Ollama" },
  },
  /* ── Visión de Aurora · SmolVLM2 (skill que abre Ajustes para activarla) ── */
  {
    id: "fn-aurora-vision", kind: "function", name: "Visión de Aurora · SmolVLM2",
    description:
      "Da percepción visual local a Aurora (imagen, pantalla y cámara) con SmolVLM2, 100% en tu dispositivo. Gratis y Apache-2.0. Instalar registra la skill y te lleva a Ajustes para activar la visión.",
    icon: "Eye", tags: ["skill", "aurora", "vision", "webgpu"], version: "1.0.0",
    author: "HuggingFace · StarSeed Labs", sourceRepoId: "starseed-labs", free: true, featured: true,
    payload: { skillId: "aurora-vision", route: "/settings" },
  },
  /* ── Voz Kokoro (español, local) — skill que abre Ajustes ── */
  {
    id: "fn-aurora-voice-kokoro", kind: "function", name: "Voz Kokoro (español, local)",
    description:
      "Voz TTS local de alta calidad para Aurora (Kokoro), con buen español y sin enviar tu voz a la nube. Instalar registra la skill y te lleva a Ajustes → Voz para elegirla.",
    icon: "Volume2", tags: ["skill", "aurora", "voz", "tts", "local"], version: "1.0.0",
    author: "Kokoro · StarSeed Labs", sourceRepoId: "starseed-labs", free: true,
    payload: { skillId: "aurora-voice-kokoro", route: "/settings" },
  },
  /* ── KittenTTS / KittenML — repo (fuente de paquetes) ── */
  {
    id: "repo-kittentts", kind: "repo", name: "KittenTTS / KittenML",
    description:
      "Voces TTS open source ultraligeras de KittenML (beta, por ahora en inglés). Es un repo/fuente: cuando publique su índice de paquetes (JSON con shape LibraryRepo) se añadirá como fuente. Mientras, puedes guardar el enlace o abrir su GitHub.",
    icon: "Cat", tags: ["repo", "tts", "voz", "oss", "beta"], version: "0.1.0",
    author: "KittenML", sourceRepoId: "starseed-labs", free: true,
    payload: { externalUrl: "https://github.com/KittenML", note: "beta · inglés" },
  },
  /* ── TabFM · modelo tabular (Google Research) — research/servicio ── */
  {
    id: "research-tabfm", kind: "research", name: "TabFM · Modelo tabular (Google)",
    description:
      "Modelo fundacional para datos tabulares de Google Research. Es un servicio Python/servidor: NO se ejecuta en el navegador. Instalar GUARDA el enlace en tu biblioteca y abre el repositorio para desplegarlo donde corresponda.",
    icon: "Table", tags: ["investigacion", "tabular", "google", "python"], version: "1.0.0",
    author: "Google Research", sourceRepoId: "starseed-labs", free: true,
    payload: { externalUrl: "https://github.com/google-research/tabfm" },
  },
  /* ── Sipp · GGUF en el navegador (beta) — project + fuente IA ── */
  {
    id: "project-sipp", kind: "project", name: "Sipp · GGUF en navegador",
    description:
      "Motor experimental que corre modelos GGUF en el navegador (arranque muy rápido, alternativa beta a WebLLM). Instalar guarda el enlace, abre su GitHub y activa la fuente «Sipp» en Astraura para que Aurora pueda probarla.",
    icon: "Beaker", tags: ["proyecto", "gguf", "webgpu", "beta"], version: "0.1.0",
    author: "Noumena Labs", sourceRepoId: "starseed-labs", free: true,
    payload: { externalUrl: "https://github.com/noumena-labs/Sipp", catalogSourceId: "sipp-local" },
  },
  /* ── AgentOS · patrones de agentes — function (referencia/beta) ── */
  {
    id: "fn-agentos", kind: "function", name: "AgentOS · patrones de agentes",
    description:
      "Patrones de orquestación de agentes (referencia). No es una skill ejecutable hoy: instalar GUARDA el enlace en tu biblioteca y abre su GitHub para estudiar/adaptar sus patrones al Exocórtex.",
    icon: "Workflow", tags: ["referencia", "agentes", "orquestacion", "beta"], version: "0.1.0",
    author: "Rivet", sourceRepoId: "starseed-labs", free: true,
    payload: { externalUrl: "https://github.com/rivet-dev/agentos", note: "patrones de orquestación" },
  },
];

/** Repo builtin de laboratorio (modelos/repos OSS reales del visionario). */
export const STARSEED_LABS_REPO: LibraryRepo = {
  id: "starseed-labs",
  name: "StarSeed Labs",
  builtin: true,
  packages: LABS_PACKAGES,
};

/* ═══════════════ REPO BUILTIN «starseed-ia-tools» ═══════════════ */
/**
 * Herramientas IA & Agentes: la caja de herramientas de la inteligencia
 * gratis-primero de Aurora (investigación julio 2026). Cada paquete declara en
 * su payload EXACTAMENTE su efecto (transparencia radical) y es open source:
 *   · ai-source con `catalogSourceId` → activa esa fuente local en Astraura
 *     (OpenLLM: opt-in de uso; requiere el servidor local corriendo).
 *   · function/skill con `skillId` (+ `externalUrl`) → registra la skill en
 *     `starseed.library.functions.v1` para que los cerebros de Aurora la usen
 *     Y guarda/abre su repo de referencia (honesto: la skill es la mejora real,
 *     el enlace es el código fuente para estudiar/adaptar).
 *   · project/repo/research/app con `externalUrl` (sin route) → guarda el
 *     enlace en la biblioteca y lo abre; honesto sobre que es un servicio,
 *     servidor o repo de referencia, no algo que finjamos correr en el navegador.
 * Estas herramientas alimentan la auto-selección de Astraura (RouteLLM ya
 * integrado, LiteLLM como patrón multi-proveedor, listas vivas de APIs gratis).
 */
const IA_TOOLS_PACKAGES: LibraryPackage[] = [
  /* ── Lista viva de APIs LLM gratis (alimenta la auto-selección) — DESTACADO ── */
  {
    id: "iatool-free-llm-api-resources", kind: "repo", name: "Free LLM API Resources",
    description:
      "Lista viva y curada de APIs de LLM GRATIS (Groq, Gemini, OpenRouter, Cerebras, Cloudflare, Cohere…) que alimenta la auto-selección gratis-primero de Astraura. Instalar guarda el enlace y abre el repositorio para consultar límites y novedades.",
    icon: "ListChecks", tags: ["ia", "apis", "gratis", "catalogo", "agentes"], version: "1.0.0",
    author: "cheahjs · comunidad", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { externalUrl: "https://github.com/cheahjs/free-llm-api-resources", note: "Lista viva de APIs LLM gratis que alimenta la auto-selección de Astraura" },
  },
  /* ── OpenLLM · API OpenAI local (fuente IA local) ── */
  {
    id: "iatool-openllm", kind: "ai-source", name: "OpenLLM (API local)",
    description:
      "Corre modelos abiertos como una API OpenAI local en tu equipo (openllm serve): máxima privacidad y soberanía. Instalar activa la fuente «OpenLLM» para que Aurora pueda elegirla (requiere el servidor local corriendo) y abre su repo.",
    icon: "Server", tags: ["ia", "local", "servidor", "openai", "soberania"], version: "1.0.0",
    author: "BentoML", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { catalogSourceId: "local-openllm", externalUrl: "https://github.com/bentoml/OpenLLM", note: "Corre modelos abiertos como API OpenAI local (openllm serve)" },
  },
  /* ── RouteLLM · enrutado por dificultad (ya integrado en Astraura) ── */
  {
    id: "iatool-routellm", kind: "project", name: "RouteLLM",
    description:
      "Enruta cada petición al modelo adecuado según su dificultad (fuertes para lo difícil, rápidos/baratos para lo trivial). Su patrón ya está integrado en Astraura (Ajustes → Inteligencia → «Enrutado por dificultad»). Instalar guarda el enlace y abre su repo de referencia.",
    icon: "GitBranch", tags: ["ia", "enrutado", "agentes", "referencia"], version: "1.0.0",
    author: "LM-SYS", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { externalUrl: "https://github.com/lm-sys/RouteLLM", note: "Enrutado por dificultad (ya integrado en Astraura)" },
  },
  /* ── LiteLLM · proxy multi-proveedor OpenAI-compatible ── */
  {
    id: "iatool-litellm", kind: "project", name: "LiteLLM",
    description:
      "Proxy que unifica ~100 proveedores de LLM tras una única API OpenAI-compatible (el patrón de naming de Astraura se inspira en él). Es un servicio/servidor: instalar guarda el enlace y abre su repo para desplegarlo donde corresponda.",
    icon: "Boxes", tags: ["ia", "proxy", "multi-proveedor", "servidor"], version: "1.0.0",
    author: "BerriAI", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { externalUrl: "https://github.com/BerriAI/litellm", note: "Proxy multi-proveedor OpenAI-compatible" },
  },
  /* ── taste-skill · mejora la UI que genera Aurora (Horizon) ── */
  {
    id: "iatool-taste-skill", kind: "function", name: "Taste Skill (calidad de UI)",
    description:
      "Skill que mejora el gusto y la calidad de las interfaces que Aurora genera en el Canvas de Creación (nodo Horizon). Instalar la registra para tus cerebros y abre su repo de referencia.",
    icon: "Sparkles", tags: ["skill", "aurora", "ui", "horizon", "diseño"], version: "1.0.0",
    author: "Leonxlnx", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "aurora-taste", externalUrl: "https://github.com/Leonxlnx/taste-skill", note: "Mejora la calidad de UI que genera Aurora (Horizon)" },
  },
  /* ── pm-skills · gestión de producto/proyecto para Aurora ── */
  {
    id: "iatool-pm-skills", kind: "function", name: "PM Skills (producto/proyecto)",
    description:
      "Conjunto de skills de gestión de producto y proyecto para Aurora (planificación, requisitos, priorización). Instalar las registra para tus cerebros y abre su repo de referencia.",
    icon: "ClipboardList", tags: ["skill", "aurora", "producto", "proyecto"], version: "1.0.0",
    author: "phuryn", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "aurora-pm", externalUrl: "https://github.com/phuryn/pm-skills" },
  },
  /* ── Agent-Reach · sentidos web de Aurora ── */
  {
    id: "iatool-agent-reach", kind: "function", name: "Agent-Reach (sentidos web)",
    description:
      "Da a Aurora sentidos web gratis: leer X/Reddit/YouTube/webs para traer contexto fresco a la red. Instalar la registra para tus cerebros y abre su repo de referencia.",
    icon: "Radar", tags: ["skill", "aurora", "web", "sentidos", "agentes"], version: "1.0.0",
    author: "Panniantong", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "aurora-web-senses", externalUrl: "https://github.com/Panniantong/Agent-Reach", note: "Sentidos web de Aurora: leer X/Reddit/YouTube/web gratis" },
  },
  /* ── open-notebook · NotebookLM open source (Área de Investigación) ── */
  {
    id: "iatool-open-notebook", kind: "research", name: "Open Notebook (investigación)",
    description:
      "NotebookLM open source: convierte fuentes en notas, resúmenes y podcasts como Área de Investigación de Aurora. Es un servicio con REST API (:5055): instalar guarda el enlace y abre su repo para desplegarlo.",
    icon: "NotebookPen", tags: ["investigacion", "notebooklm", "oss", "servidor"], version: "1.0.0",
    author: "lfnovo", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { externalUrl: "https://github.com/lfnovo/open-notebook", note: "NotebookLM open source como Área de Investigación de Aurora (REST API :5055)" },
  },
  /* ── AgentOS (rivet) · patrones de orquestación de agentes ── */
  {
    id: "iatool-agentos", kind: "function", name: "AgentOS · orquestación (rivet)",
    description:
      "Patrones de orquestación de agentes (referencia). No es una skill ejecutable hoy: instalar guarda el enlace y abre su repo para estudiar/adaptar sus patrones al Exocórtex.",
    icon: "Workflow", tags: ["referencia", "agentes", "orquestacion"], version: "0.1.0",
    author: "Rivet", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { externalUrl: "https://github.com/rivet-dev/agentos", note: "Patrones de orquestación de agentes" },
  },
  /* ── OpenCode · agente de programación open source ── */
  {
    id: "iatool-opencode", kind: "app", name: "OpenCode (agente de código)",
    description:
      "Agente de programación open source para terminal. Es una app externa: instalar guarda el enlace y abre su repo para instalarlo en tu equipo.",
    icon: "Terminal", tags: ["app", "codigo", "agente", "oss"], version: "1.0.0",
    author: "anomalyco", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { externalUrl: "https://github.com/anomalyco/opencode", note: "Agente de programación open source" },
  },
  /* ── OpenClaw · asistente omnicanal open source ── */
  {
    id: "iatool-openclaw", kind: "app", name: "OpenClaw (omnicanal)",
    description:
      "Asistente omnicanal open source (alternativa a Abacus Claw): responde en múltiples canales. Es una app/servicio externo: instalar guarda el enlace y abre su repo.",
    icon: "MessagesSquare", tags: ["app", "omnicanal", "asistente", "oss"], version: "1.0.0",
    author: "openclaw", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { externalUrl: "https://github.com/openclaw/openclaw", note: "Asistente omnicanal open source (alt. Abacus Claw)" },
  },
  /* ── apple/container · aislar agentes/herramientas locales en el Mac ── */
  {
    id: "iatool-apple-container", kind: "project", name: "apple/container",
    description:
      "Ejecuta contenedores Linux en el Mac (macOS 26) para AISLAR agentes y herramientas locales con seguridad. Es una herramienta de sistema: instalar guarda el enlace y abre su repo.",
    icon: "Container", tags: ["proyecto", "contenedor", "aislamiento", "macos"], version: "1.0.0",
    author: "Apple", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { externalUrl: "https://github.com/apple/container", note: "Aislar agentes/herramientas locales en el Mac (macOS 26)" },
  },
  /* ══ ACCESO A INTERNET (WEB) · herramientas de scraping para agentes ══
   * Dan a Aurora la capacidad "web-access": Astraura AUTO-SELECCIONA la mejor
   * herramienta gratis/local por tarea (Crawl4AI/DeepCrawl/WebHarvest/Universal
   * Scraper) y solo usa Firecrawl si hay clave; si no hay proveedor configurado,
   * Aurora pide la URL/el contenido (ver src/ai/astraura/web-access.ts). Honesto:
   * el navegador NO scrapea solo — estos servicios corren en local/self-host o
   * (Firecrawl) en la nube con clave. Instalar registra la skill/enlace real. */
  /* ── Crawl4AI · scraper Python LOCAL para agentes/LLMs (recomendado) ── */
  {
    id: "iatool-crawl4ai", kind: "function", name: "Crawl4AI (acceso web local)",
    description:
      "Scraper web en Python para agentes/LLMs que corre 100% LOCAL: convierte páginas en markdown limpio listo para Aurora. Gratis y open source. Instalar registra la skill de acceso web para tus cerebros y abre su repo (necesita el servicio local corriendo; pega su endpoint en Ajustes → Inteligencia → Acceso web).",
    icon: "Globe", tags: ["skill", "aurora", "web", "scraping", "local", "markdown"], version: "1.0.0",
    author: "unclecode", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "aurora-web-access", externalUrl: "https://github.com/unclecode/crawl4ai", note: "Scraper web Python LOCAL para agentes/LLMs (markdown). Auto-seleccionable por Astraura." },
  },
  /* ── DeepCrawl · edge OSS: markdown + árbol de enlaces ── */
  {
    id: "iatool-deepcrawl", kind: "function", name: "DeepCrawl (web · edge OSS)",
    description:
      "Extrae markdown y el árbol de enlaces de un sitio; corre en el edge y es open source. Instalar registra la skill de acceso web para tus cerebros y abre su repo (self-host: pega su endpoint en Ajustes → Inteligencia → Acceso web).",
    icon: "Network", tags: ["skill", "aurora", "web", "scraping", "enlaces", "oss"], version: "1.0.0",
    author: "lumpinif", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "aurora-web-access", externalUrl: "https://github.com/lumpinif/deepcrawl", note: "Edge OSS: markdown + árbol de enlaces. Auto-seleccionable por Astraura." },
  },
  /* ── WebHarvest · scraper OSS self-host, sortea anti-bot ── */
  {
    id: "iatool-webharvest", kind: "function", name: "WebHarvest (web · self-host)",
    description:
      "Scraper open source auto-alojado con formatos amigables para agentes que sortea muchos anti-bot. Instalar registra la skill de acceso web para tus cerebros (self-host: pega su endpoint en Ajustes → Inteligencia → Acceso web).",
    icon: "Bot", tags: ["skill", "aurora", "web", "scraping", "anti-bot", "self-host"], version: "1.0.0",
    author: "WebHarvest", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "aurora-web-access", note: "Scraper OSS self-host, formatos agent-friendly, sortea anti-bot. Auto-seleccionable por Astraura." },
  },
  /* ── Universal Scraper · Python ligero (Cloudscraper+Selenium), JSON/CSV ── */
  {
    id: "iatool-universal-scraper", kind: "function", name: "Universal Scraper (web local)",
    description:
      "Scraper ligero en Python (Cloudscraper + Selenium) con export a JSON/CSV; corre LOCAL. Ideal para datos estructurados y tablas. Instalar registra la skill de acceso web para tus cerebros (necesita el script local corriendo; pega su endpoint en Ajustes → Inteligencia → Acceso web).",
    icon: "FileJson", tags: ["skill", "aurora", "web", "scraping", "json", "csv", "local"], version: "1.0.0",
    author: "comunidad", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "aurora-web-access", note: "Python ligero (Cloudscraper+Selenium), export JSON/CSV. Auto-seleccionable por Astraura." },
  },
  /* ── Firecrawl · scraping gestionado (SOLO con clave; nunca por defecto) ── */
  {
    id: "iatool-firecrawl", kind: "function", name: "Firecrawl (web · con clave)",
    description:
      "Servicio de scraping/crawl gestionado que devuelve markdown limpio. NO es gratis-primero: requiere una CLAVE API (opción de nube, no por defecto). Instalar registra la skill de acceso web y abre su web para conseguir la clave (pégala en Ajustes → Inteligencia → Acceso web).",
    icon: "Flame", tags: ["skill", "aurora", "web", "scraping", "clave", "nube"], version: "1.0.0",
    author: "Firecrawl", sourceRepoId: "starseed-ia-tools", free: false,
    payload: { skillId: "aurora-web-access", externalUrl: "https://www.firecrawl.dev", note: "Scraping gestionado con clave API (última opción; no por defecto)." },
  },
  /* ── THE HUGGING BAY · registro verificado de modelos + descubrimiento ── */
  {
    id: "iatool-hugging-bay-registry", kind: "repo", name: "Hugging Bay Registry",
    description:
      "Registro verificado de modelos IA open-source con API pública agent-friendly (recomendador por tarea, búsqueda semántica, trending, kits de instalación local). Instalar registra la skill de descubrimiento de modelos para tus cerebros de Aurora (\"¿cuál es el mejor modelo para X?\") y guarda el enlace a la sección Biblioteca → Hugging Bay, donde puedes explorar el catálogo en vivo.",
    icon: "Compass", tags: ["skill", "aurora", "modelos", "descubrimiento", "catalogo", "open-source"], version: "1.0.0",
    author: "Hugging Bay", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "model-discovery", externalUrl: "https://huggingbay.xyz", note: "Descubrimiento inteligente de modelos reales (licencia + confianza + comando local). Ver Biblioteca → Hugging Bay." },
  },
  /* ══ STACK OSS "REEMPLAZA TU STACK DE $200/MES" (jul-2026) ══
   * Diez repos de la guía "Replace Your $200/Month Tool Stack". Mismo patrón
   * honesto que el resto: function con `skillId` → registra la capacidad viva
   * en skills.ts (ver architecture/astraura-inteligencia.md §15) + guarda/abre
   * el repo de referencia real. Ninguno se ejecuta dentro del navegador: son
   * conocimiento+capacidad+paquete instalado, no binarios corriendo. */
  /* ── Dyad · constructor local de apps IA (sin lock-in) ── */
  {
    id: "iatool-dyad", kind: "function", name: "Dyad (constructor de apps)",
    description:
      "Constructor LOCAL de apps con IA: genera el scaffold de una app React/TypeScript editable, sin lock-in de proveedor. Qué reemplaza: builders de apps IA cerrados/de pago. Instalar registra la skill «Constructor de apps» para que Aurora aplique ese patrón en el Canvas de Creación y abre su repo de referencia.",
    icon: "AppWindow", tags: ["skill", "aurora", "apps", "scaffold", "horizon", "oss"], version: "1.0.0",
    author: "dyad-sh", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "app-builder", externalUrl: "https://github.com/dyad-sh/dyad", note: "Constructor local de apps IA (scaffold React/TS, sin lock-in)." },
  },
  /* ── goose · agente autónomo en máquina con "recipes" (Linux Foundation AAIF) ── */
  {
    id: "iatool-goose", kind: "function", name: "goose (recetas de agente)",
    description:
      "Agente autónomo que corre en tu máquina con «recipes» (recetas) reutilizables: tareas de agente empaquetadas y compartibles. Qué reemplaza: asistentes de automatización de escritorio de pago. Instalar registra la skill «Recetas de agente» para que Aurora aplique ese patrón a tus Agentes StarSeed y abre su repo de referencia.",
    icon: "Workflow", tags: ["skill", "aurora", "agentes", "recetas", "automatizacion", "oss"], version: "1.0.0",
    author: "Linux Foundation AAIF", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "agent-recipes", externalUrl: "https://github.com/aaif-goose/goose", note: "Agente autónomo en máquina con recetas reutilizables (Linux Foundation AAIF)." },
  },
  /* ── DeerFlow · super-agente de investigación profunda ── */
  {
    id: "iatool-deerflow", kind: "function", name: "DeerFlow (investigación profunda)",
    description:
      "Super-agente de investigación profunda que entrega informes, presentaciones y webs a partir de una pregunta. Qué reemplaza: herramientas de investigación asistida por IA de pago. Instalar registra la skill que refuerza el modo «Investigación» de Aurora con este formato de entregable y abre su repo de referencia.",
    icon: "SearchCode", tags: ["skill", "aurora", "investigacion", "informes", "oss"], version: "1.0.0",
    author: "ByteDance", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "deep-research", externalUrl: "https://github.com/bytedance/deer-flow", note: "Super-agente de investigación profunda: entrega informes/decks/webs." },
  },
  /* ── Daytona · sandboxes aislados para ejecutar código de IA ── */
  {
    id: "iatool-daytona", kind: "function", name: "Daytona (sandbox aislado)",
    description:
      "Sandboxes aislados para ejecutar código generado por IA con seguridad, sin arriesgar tu equipo. Qué reemplaza: entornos de ejecución en la nube de pago. Es un servicio/servidor: instalar registra la skill «Ejecución aislada» (Aurora la recomienda antes de correr código no confiable) y abre su repo para desplegarlo donde corresponda.",
    icon: "Container", tags: ["skill", "aurora", "sandbox", "ejecucion", "seguridad", "oss"], version: "1.0.0",
    author: "Daytona", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "sandbox-exec", externalUrl: "https://github.com/daytonaio/daytona", note: "Sandboxes aislados para ejecutar código generado por IA." },
  },
  /* ── Parallel Code · múltiples agentes de código en worktrees aislados ── */
  {
    id: "iatool-parallel-code", kind: "function", name: "Parallel Code (multi-agente)",
    description:
      "Despacha múltiples agentes de código en worktrees aislados para trabajar varias tareas en paralelo sin pisarse. Qué reemplaza: orquestadores de coding agents de pago. Instalar registra la skill «Código multi-agente» para que Aurora sugiera ese patrón y abre su repo de referencia.",
    icon: "GitFork", tags: ["skill", "aurora", "codigo", "multi-agente", "worktrees", "oss"], version: "1.0.0",
    author: "johannesjo", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "multi-agent-code", externalUrl: "https://github.com/johannesjo/parallel-code", note: "Despacha múltiples agentes de código en worktrees aislados." },
  },
  /* ── Scrapling · scraping adaptativo con selectores auto-reparables ── */
  {
    id: "iatool-scrapling", kind: "function", name: "Scrapling (web adaptativo)",
    description:
      "Scraper adaptativo con selectores que se auto-reparan cuando el sitio cambia de estructura, y modo stealth anti-detección. Qué reemplaza: servicios de scraping gestionados de pago para sitios que cambian su HTML. Instalar registra la skill de acceso web (se suma a Crawl4AI/DeepCrawl/WebHarvest/Universal Scraper, auto-seleccionable por Astraura) y abre su repo (self-host: pega su endpoint en Ajustes → Inteligencia → Acceso web).",
    icon: "Sparkle", tags: ["skill", "aurora", "web", "scraping", "adaptativo", "stealth", "oss"], version: "1.0.0",
    author: "D4Vinci", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "web-scraping-adaptativa", externalUrl: "https://github.com/D4Vinci/Scrapling", note: "Scraping adaptativo (selectores auto-reparables) + stealth. Auto-seleccionable por Astraura." },
  },
  /* ── 9Router · proxy local OpenAI-compatible con fallback y compresión ── */
  {
    id: "iatool-9router", kind: "function", name: "9Router (proxy local)",
    description:
      "Proxy local OpenAI-compatible que enruta entre 40+ proveedores con fallback por niveles y compresión de tokens. Qué reemplaza: proxies de enrutado multi-proveedor gestionados de pago. Instalar registra la skill «Proxy de enrutado local» (Astraura lo detecta como fuente si lo tienes corriendo en `localhost:8000`, configurable en Ajustes → Inteligencia) y abre su repo de referencia.",
    icon: "Router", tags: ["skill", "aurora", "proxy", "enrutado", "local", "compresion", "oss"], version: "1.0.0",
    author: "decolua", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "router-proxy", externalUrl: "https://github.com/decolua/9router", note: "Proxy local OpenAI-compatible con fallback por niveles y compresión de tokens." },
  },
  /* ── ai-website-cloner-template · reconstruye sitios como Next.js ── */
  {
    id: "iatool-website-cloner", kind: "function", name: "Clonador de webs (tokens de diseño)",
    description:
      "Reconstruye un sitio como app Next.js extrayendo sus tokens de diseño y estructura (uso legítimo: tu propio sitio o una referencia con permiso). Qué reemplaza: herramientas de clonado de webs de pago. Instalar registra la skill «Importar diseño» para el Lienzo de Creación (Horizon) y abre su repo de referencia.",
    icon: "Copy", tags: ["skill", "aurora", "diseño", "horizon", "tokens", "oss"], version: "1.0.0",
    author: "JCodesMore", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "design-import", externalUrl: "https://github.com/JCodesMore/ai-website-cloner-template", note: "Reconstruye sitios como Next.js extrayendo tokens/estructura (uso legítimo)." },
  },
  /* ── RAGFlow · motor RAG enterprise con comprensión profunda de documentos ── */
  {
    id: "iatool-ragflow", kind: "function", name: "RAGFlow (conocimiento con citas)",
    description:
      "Motor RAG con comprensión profunda de documentos y respuestas siempre citadas al origen exacto. Qué reemplaza: plataformas RAG enterprise de pago. Es un servicio/servidor: instalar registra la skill «RAG sobre documentos» (refuerza la Biblioteca-Cydia e Investigación) y abre su repo para desplegarlo donde corresponda.",
    icon: "Library", tags: ["skill", "aurora", "rag", "conocimiento", "documentos", "citas", "oss"], version: "1.0.0",
    author: "InfiniFlow", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "rag-knowledge", externalUrl: "https://github.com/infiniflow/ragflow", note: "Motor RAG enterprise con comprensión profunda de documentos y respuestas citadas." },
  },
  /* ══ MOTORES DE VOZ DE AURORA (Adenda 67 · P2) ═══════════════════════════
   * Instalar = registrar la skill `voice-engines` (Aurora sabe explicarlos y
   * configurarlos) + guardar su repo. NO descarga modelos ni lanza servidores:
   * el motor real vive en TU neurona/PC y se conecta por endpoint desde
   * Ajustes → Voz. Registro vivo: src/lib/aurora/tts-oss/engine-registry.ts */
  {
    id: "iatool-voxcpm", kind: "function", name: "VoxCPM (voz principal)",
    description:
      "El motor de voz MÁS REALISTA de Aurora y el recomendado. TTS tokenizer-free de OpenBMB (difusión autoregresiva): 30 idiomas, 48 kHz y DISEÑO DE VOZ con palabras — describes la voz («mujer joven, cálida y serena») y la crea, sin necesidad de audio de referencia; también clona una voz a partir de una muestra. En cuanto tiene endpoint, Aurora lo elige SOLA como motor principal, y si se cae, la cadena de respaldo mantiene la voz (nunca se queda muda). Necesita un servidor VoxCPM con GPU en una neurona propia (vLLM-Omni, Nano-vLLM o su demo Gradio) y pegar su URL en Ajustes → Voz.",
    icon: "AudioLines", tags: ["skill", "aurora", "voz", "tts", "clonacion", "principal", "oss"], version: "1.0.0",
    author: "OpenBMB", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "voice-engines", externalUrl: "https://github.com/OpenBMB/VoxCPM", note: "Motor de voz PRINCIPAL (Apache-2.0). Endpoint: vLLM-Omni /v1/audio/speech · Nano-vLLM /generate · Gradio." },
  },
  {
    id: "iatool-voicebox", kind: "function", name: "Voicebox (estudio de voz local)",
    description:
      "Estudio de voz local y libre (alternativa a ElevenLabs + WisprFlow en una sola app): clona voces con unos segundos de audio, trae 7 motores TTS dentro (Qwen3-TTS, Chatterbox, LuxTTS, Kokoro…), 23 idiomas, efectos y dictado global. HONESTIDAD: es una APP DE ESCRITORIO (Tauri), no un servicio web — pero expone una API REST real, así que Aurora SÍ puede hablar con tus voces clonadas. Para usarla como motor: ten la app abierta, crea un perfil de voz, pega su URL (http://127.0.0.1:17493) y el id del perfil en Ajustes → Voz, y arranca la app con VOICEBOX_CORS_ORIGINS=https://starseed-os.vercel.app (su CORS por defecto no deja entrar al navegador).",
    icon: "Mic", tags: ["skill", "aurora", "voz", "tts", "clonacion", "escritorio", "dictado", "oss"], version: "1.0.0",
    author: "Jamie Pine", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "voice-engines", externalUrl: "https://github.com/jamiepine/voicebox", note: "App de escritorio (MIT) con API REST en 127.0.0.1:17493. Ruta útil: POST /generate/stream (WAV). Requiere profile_id + CORS." },
  },
  /* ── Pipecat · framework de agentes de voz/multimodal en tiempo real ── */
  {
    id: "iatool-pipecat", kind: "function", name: "Pipecat (voz en tiempo real)",
    description:
      "Framework de agentes de voz/multimodal en tiempo real (100+ combinaciones de STT/TTS/LLM). Qué reemplaza: plataformas de voz conversacional en tiempo real de pago. Complementa a Kokoro (voz local ya activa): instalar registra la skill «Voz en tiempo real» y abre su repo de referencia.",
    icon: "AudioLines", tags: ["skill", "aurora", "voz", "tiempo-real", "multimodal", "oss"], version: "1.0.0",
    author: "Pipecat AI", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "voice-realtime", externalUrl: "https://github.com/pipecat-ai/pipecat", note: "Framework de agentes de voz/multimodal en tiempo real (100+ STT/TTS/LLM)." },
  },
  /* ══ INFRAESTRUCTURA SOBERANA Y FLUJOS VISUALES (jul-2026) ══
   * Ocho repos más. Mismo patrón honesto: function con `skillId` → registra la
   * capacidad viva en skills.ts (ver architecture/astraura-inteligencia.md §16)
   * + guarda/abre el repo de referencia real. Tres de ellos (Open WebUI,
   * Stirling-PDF, browser-use) YA tienen conector funcional real en
   * src/lib/integrations/registry.ts; esta ola les añade la capa de capacidad
   * viva de Astraura que antes no tenían. Ninguno se ejecuta en el navegador:
   * conocimiento + capacidad + paquete instalado, no binarios corriendo. */
  /* ── Coolify · PaaS self-host (infraestructura soberana) ── */
  {
    id: "iatool-coolify", kind: "function", name: "Coolify (PaaS soberano)",
    description:
      "PaaS self-host de código abierto: despliega tus propias apps, bases de datos y servicios en tu propio servidor, sin depender de Heroku/Netlify/Vercel. Qué reemplaza: PaaS de pago gestionados por terceros. Encaja con la infraestructura tecnológica soberana de la Tríada (§3 CLAUDE.md). Instalar registra la skill «PaaS soberano» para que Aurora explique este patrón cuando el usuario quiera desplegar algo en su propio servidor, y abre su repo de referencia.",
    icon: "Server", tags: ["skill", "aurora", "paas", "self-host", "soberania", "oss"], version: "1.0.0",
    author: "coollabsio", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "self-hosting-deploy", externalUrl: "https://github.com/coollabsio/coolify", note: "PaaS self-host: despliega apps/BDs/servicios en tu propio servidor (alt. Heroku/Netlify/Vercel)." },
  },
  /* ── OpenHands · agentes de desarrollo autónomos ── */
  {
    id: "iatool-openhands", kind: "function", name: "OpenHands (agente de desarrollo)",
    description:
      "Plataforma de agentes de desarrollo autónomos: escriben código, lo ejecutan y navegan por su cuenta. Qué reemplaza: asistentes de programación autónomos de pago. Es un servicio que corre aislado (nunca público): instalar registra la skill «Agente de desarrollo» para que Aurora sepa cuándo recomendar este patrón y abre su repo de referencia.",
    icon: "Bot", tags: ["skill", "aurora", "agente", "codigo", "desarrollo", "oss"], version: "1.0.0",
    author: "All-Hands-AI", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "dev-agent", externalUrl: "https://github.com/All-Hands-AI/OpenHands", note: "Plataforma de agentes de desarrollo autónomos (escriben código, ejecutan, navegan)." },
  },
  /* ── Maxun · extracción de datos web no-code ── */
  {
    id: "iatool-maxun", kind: "function", name: "Maxun (robots web no-code)",
    description:
      "Extracción de datos web no-code: entrena «robots» que scrapean y monitorizan sitios sin escribir código. Qué reemplaza: herramientas de monitorización web de pago. Se suma como motor de acceso web adicional (junto a Crawl4AI/DeepCrawl/WebHarvest/Universal Scraper/Scrapling, auto-seleccionable por Astraura). Instalar registra la skill «Robots web» y abre su repo (self-host: pega su endpoint en Ajustes → Inteligencia → Acceso web).",
    icon: "Bot", tags: ["skill", "aurora", "web", "scraping", "no-code", "monitorizacion", "oss"], version: "1.0.0",
    author: "getmaxun", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "web-robots", externalUrl: "https://github.com/getmaxun/maxun", note: "Robots no-code que scrapean y monitorizan sitios. Auto-seleccionable por Astraura." },
  },
  /* ── Open WebUI · interfaz de chat self-hosted para cerebros locales ── */
  {
    id: "iatool-open-webui", kind: "function", name: "Open WebUI (interfaz de chat local)",
    description:
      "Interfaz de chat LLM self-hosted (Ollama/OpenAI-compatible, con RAG integrado). Qué reemplaza: interfaces de chat gestionadas de pago. Se integra con los cerebros locales (Ollama) que ya tienes en el OS. Instalar registra la skill «Interfaz de cerebros locales» para que Aurora la mencione al hablar de cerebros locales y abre su repo de referencia.",
    icon: "MessageSquare", tags: ["skill", "aurora", "cerebros", "ollama", "chat", "local", "oss"], version: "1.0.0",
    author: "open-webui", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "local-llm-ui", externalUrl: "https://github.com/open-webui/open-webui", note: "Interfaz de chat self-hosted para cerebros locales (Ollama/OpenAI-compatible + RAG)." },
  },
  /* ── browser-use · automatización de navegador para agentes IA ── */
  {
    id: "iatool-browser-use", kind: "function", name: "browser-use (agente navega solo)",
    description:
      "Automatización de navegador para agentes IA: el agente usa el navegador como lo haría una persona. Qué reemplaza: servicios de automatización de navegador gestionados de pago. Complementa a Claude-in-Chrome (vía principal de navegación agéntica del OS) como patrón alternativo self-host. Instalar registra la skill «Navegación agéntica» y abre su repo de referencia.",
    icon: "MousePointerClick", tags: ["skill", "aurora", "navegador", "agente", "automatizacion", "oss"], version: "1.0.0",
    author: "browser-use", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "agent-browsing", externalUrl: "https://github.com/browser-use/browser-use", note: "Automatización de navegador para agentes IA (usa el navegador como humano)." },
  },
  /* ── Langflow · constructor visual de flujos/agentes LLM ── */
  {
    id: "iatool-langflow", kind: "function", name: "Langflow (flujos visuales)",
    description:
      "Constructor visual de flujos/agentes LLM (arrastrar y soltar, con API). Qué reemplaza: constructores de flujos de agentes de pago. Patrón de referencia para diseñar Agentes StarSeed visualmente. Instalar registra la skill «Constructor de flujos» y abre su repo de referencia.",
    icon: "Workflow", tags: ["skill", "aurora", "agentes", "flujos", "visual", "oss"], version: "1.0.0",
    author: "langflow-ai", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "flow-builder", externalUrl: "https://github.com/langflow-ai/langflow", note: "Constructor visual de flujos/agentes LLM (drag&drop, API)." },
  },
  /* ── Stirling-PDF · herramientas PDF self-hosted ── */
  {
    id: "iatool-stirling-pdf", kind: "function", name: "Stirling-PDF (herramientas PDF)",
    description:
      "Herramientas PDF self-hosted: unir, dividir, convertir, hacer OCR y firmar. Qué reemplaza: servicios de edición de PDF de pago. Útil para las vistas previas y la gestión de archivos del Finder. Instalar registra la skill «Herramientas PDF» y abre su repo de referencia.",
    icon: "FileText", tags: ["skill", "aurora", "pdf", "archivos", "finder", "oss"], version: "1.0.0",
    author: "Stirling-Tools", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "pdf-tools", externalUrl: "https://github.com/Stirling-Tools/Stirling-PDF", note: "Herramientas PDF self-hosted (unir, dividir, convertir, OCR, firmar)." },
  },
  /* ── Dify · plataforma open-source de desarrollo de apps LLM ── */
  {
    id: "iatool-dify", kind: "function", name: "Dify (plataforma de apps LLM)",
    description:
      "Plataforma open-source de desarrollo de apps LLM: agentes, workflows, RAG y observabilidad en un solo lugar. Qué reemplaza: plataformas de apps LLM enterprise de pago. Instalar registra la skill «Plataforma de apps LLM» y abre su repo de referencia.",
    icon: "LayoutDashboard", tags: ["skill", "aurora", "agentes", "workflows", "rag", "plataforma", "oss"], version: "1.0.0",
    author: "langgenius", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "llm-apps-platform", externalUrl: "https://github.com/langgenius/dify", note: "Plataforma open-source de desarrollo de apps LLM (agentes, workflows, RAG, observabilidad)." },
  },
  /* ══ SIETE REPOS MÁS — Marcadores, conocimiento, IoT y ciencia (jul-2026) ══
   * Mismo patrón honesto de §15-16: conocimiento + capacidad + paquete
   * instalado, nunca binarios que el OS ejecute por sí solo. Dos (Audiobookshelf,
   * Home Assistant) suman además un CONECTOR real de solo lectura en
   * src/lib/integrations/registry.ts (endpoint propio, apagado por defecto,
   * nunca auto-conecta). Karakeep NO se conecta a una instancia externa: inspira
   * la superficie propia «Marcadores» de la Biblioteca (src/lib/library/bookmarks.ts),
   * implementación propia de StarSeed (no copia código AGPL). */
  /* ── Karakeep · guardar-todo con etiquetado IA (inspira "Marcadores") ── */
  {
    id: "iatool-karakeep", kind: "function", name: "Karakeep (marcadores con IA)",
    description:
      "Guarda enlaces, notas e imágenes con etiquetado automático por IA y búsqueda de texto completo. Qué reemplaza: gestores de marcadores de pago (Pocket/Raindrop premium). Licencia AGPL-3.0: StarSeed no copia su código; esta capacidad inspira la superficie PROPIA «Marcadores» de la Biblioteca (guarda enlaces/notas/imágenes con sugerencia de etiquetas vía Aurora y búsqueda local, implementación propia). Instalar registra la skill «Marcadores con IA» y abre su repo de referencia.",
    icon: "Bookmark", tags: ["skill", "aurora", "marcadores", "bookmarks", "media", "ia", "oss"], version: "1.0.0",
    author: "karakeep-app", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "bookmarks-ai", externalUrl: "https://github.com/karakeep-app/karakeep", note: "Guardar-todo con etiquetado IA + búsqueda de texto completo (AGPL-3.0). Inspira la superficie propia «Marcadores»." },
  },
  /* ── Anytype · objetos/notas local-first cifrados ── */
  {
    id: "iatool-anytype", kind: "function", name: "Anytype (objetos local-first)",
    description:
      "Notas y objetos conectados local-first, cifrados de extremo a extremo y sincronizables P2P sin servidor central. Qué reemplaza: apps de notas/wikis en la nube de pago. Encaja con memorias y conocimiento personal soberano (Tríada §3 CLAUDE.md: Identidad Soberana). Instalar registra la skill «Objetos locales» para que Aurora conozca este patrón de conocimiento personal cifrado. Conector en vivo pendiente a propósito: su API local exige emparejar la app de escritorio con un código de verificación (flujo de dos pasos que hoy no se automatiza con honestidad desde un simple endpoint), así que queda como capacidad + enlace, no como conector configurable. Abre su repo de referencia.",
    icon: "Boxes", tags: ["skill", "aurora", "notas", "objetos", "local-first", "e2ee", "p2p", "oss"], version: "1.0.0",
    author: "anyproto", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "local-objects", externalUrl: "https://github.com/anyproto/anytype-ts", note: "Objetos/notas local-first cifrados, sincronización P2P sin servidor central." },
  },
  /* ── Audiobookshelf · servidor de audiolibros y podcasts ── */
  {
    id: "iatool-audiobookshelf", kind: "function", name: "Audiobookshelf (audiolibros y podcasts)",
    description:
      "Servidor self-host de audiolibros y podcasts con tu propia biblioteca de audio. Qué reemplaza: suscripciones de audiolibros de pago. Es un servicio/servidor: instalar registra la skill «Biblioteca de audio» y suma el CONECTOR real de solo lectura (self-host, endpoint propio, apagado por defecto) en Ajustes → Integraciones, para que Aurora liste tus audiolibros/podcasts (API /api/libraries). Licencia GPL-3.0. Abre su repo de referencia.",
    icon: "Headphones", tags: ["skill", "aurora", "audio", "audiolibros", "podcasts", "media", "oss"], version: "1.0.0",
    author: "advplyr", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "audio-library", externalUrl: "https://github.com/advplyr/audiobookshelf", note: "Servidor self-host de audiolibros/podcasts (GPL-3.0). Conector real de solo lectura en Ajustes → Integraciones (apagado por defecto)." },
  },
  /* ── Home Assistant · automatización del hogar (IoT) ── */
  {
    id: "iatool-home-assistant", kind: "function", name: "Home Assistant (domótica)",
    description:
      "Plataforma de automatización del hogar (IoT/MQTT) que corre 100% local, sin depender de la nube de un fabricante. Qué reemplaza: apps de domótica propietarias con tus datos en servidores de terceros. Es un servicio/servidor: instalar registra la skill «Domótica» y suma el CONECTOR real de solo lectura (self-host, token propio, apagado por defecto) en Ajustes → Integraciones, para que Aurora consulte el estado de tus dispositivos (API REST /api/states). El panel de Centro de Control (otra superficie del OS) puede reutilizar este mismo conector. Licencia Apache-2.0. Abre su repo de referencia.",
    icon: "Home", tags: ["skill", "aurora", "iot", "domotica", "hogar", "automatizacion", "oss"], version: "1.0.0",
    author: "home-assistant", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "home-automation", externalUrl: "https://github.com/home-assistant/core", note: "Automatización del hogar 100% local (Apache-2.0). Conector real de solo lectura en Ajustes → Integraciones (apagado por defecto)." },
  },
  /* ── Syncthing · sincronización P2P de archivos ── */
  {
    id: "iatool-syncthing", kind: "function", name: "Syncthing (sync P2P de archivos)",
    description:
      "Sincroniza archivos entre tus dispositivos directamente por P2P, sin subir tus datos a un servidor central. Qué reemplaza: servicios de sincronización en la nube de pago. Encaja con la soberanía de datos de la Tríada (§3 CLAUDE.md). Instalar registra la skill «Sincronización P2P» para que Aurora conozca este patrón (el proveedor de sincronización en sí se gestiona en Ajustes → Cerebros → Proveedores de sync, otra superficie). Licencia MPL-2.0. Abre su repo de referencia.",
    icon: "RefreshCw", tags: ["skill", "aurora", "sync", "p2p", "archivos", "soberania", "oss"], version: "1.0.0",
    author: "syncthing", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "p2p-sync", externalUrl: "https://github.com/syncthing/syncthing", note: "Sincronización de archivos P2P sin servidor central (MPL-2.0)." },
  },
  /* ── Open-LLM-VTuber · voz + avatar Live2D para agentes ── */
  {
    id: "iatool-open-llm-vtuber", kind: "function", name: "Open-LLM-VTuber (avatar con voz)",
    description:
      "Compañero IA con voz en tiempo real y avatar Live2D/3D animado, 100% local y open-source. Qué reemplaza: apps de avatar/vtuber de pago. Instalar registra la skill «Avatar de Aurora», que apunta al patrón de avatar visual con voz para Aurora (la implementación del componente visual del avatar es otra superficie del OS); aquí queda el conocimiento + capacidad + paquete instalado. Licencia MIT. Abre su repo de referencia.",
    icon: "Drama", tags: ["skill", "aurora", "avatar", "voz", "live2d", "oss"], version: "1.0.0",
    author: "Open-LLM-VTuber", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "aurora-avatar", externalUrl: "https://github.com/Open-LLM-VTuber/Open-LLM-VTuber", note: "Voz en tiempo real + avatar Live2D/3D animado, 100% local (MIT)." },
  },
  /* ── AltaiR · toolkit FASTA alignment-free (ciencia/datos) ── */
  {
    id: "iatool-altair", kind: "function", name: "AltaiR (alineamiento-free FASTA)",
    description:
      "Toolkit de bioinformática para comparar secuencias FASTA sin alineamiento (alignment-free), útil para análisis genómico/comparativo a gran escala. Qué reemplaza: herramientas de bioinformática comerciales. Instalar registra la skill «Ciencia de datos FASTA» para que Aurora conozca y explique este patrón de análisis de secuencias cuando el usuario trabaje con datos científicos/genómicos. Licencia GPL-3.0. Abre su repo de referencia.",
    icon: "Dna", tags: ["skill", "aurora", "ciencia", "bioinformatica", "fasta", "datos", "oss"], version: "1.0.0",
    author: "cobilab", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "data-science-fasta", externalUrl: "https://github.com/cobilab/altair", note: "Toolkit FASTA alignment-free para análisis genómico/comparativo (GPL-3.0)." },
  },
  /* ══ TERCERA OLA — Galería (Immich) + IA/Agentes (Perplexica, Flowise, AnythingLLM, Reor) (jul-2026) ══
   * Cinco repos más. Mismo patrón honesto: function con `skillId` → registra
   * la capacidad viva en skills.ts (ver architecture/astraura-inteligencia.md
   * §21) + guarda/abre el repo de referencia real. Immich y AnythingLLM suman
   * CONECTOR real nuevo en src/lib/integrations/registry.ts (apagado por
   * defecto); Flowise YA tenía conector real (ola previa) y aquí solo gana su
   * paquete+capacidad; Perplexica suma conector + participa como motor
   * opcional en `ai/astraura/web-access.ts`; Reor queda como capacidad+ficha
   * (sin API pública hoy, honesto). Ninguno se ejecuta dentro del navegador. */
  /* ── Immich · fotos/vídeos self-host con ML ── */
  {
    id: "iatool-immich", kind: "function", name: "Immich (fotos y vídeos con IA)",
    description:
      "Servidor self-host de fotos y vídeos con reconocimiento facial/de objetos (ML) y tu propia fototeca. Qué reemplaza: Google Photos/iCloud Photos. Licencia AGPL-3.0: StarSeed no copia su código. Instalar registra la skill «Copia de fotos» y suma el CONECTOR real de SOLO LECTURA v1 (self-host, clave x-api-key propia, apagado por defecto) en Ajustes → Integraciones Y en Galería → Servicios externos: listar álbumes y ver assets recientes, con «Importar a Biblioteca» que guarda una referencia (no copia el archivo). Abre su repo de referencia.",
    icon: "Images", tags: ["skill", "aurora", "fotos", "videos", "galeria", "ml", "oss"], version: "1.0.0",
    author: "immich-app", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "photo-backup", externalUrl: "https://github.com/immich-app/immich", note: "Fotos/vídeos self-host con ML (AGPL-3.0). Conector real de SOLO LECTURA en Ajustes → Integraciones y en Galería → Servicios externos (apagado por defecto)." },
  },
  /* ── Perplexica (renombrado "Vane") · buscador IA con citas ── */
  {
    id: "iatool-perplexica", kind: "function", name: "Perplexica / Vane (búsqueda IA con citas)",
    description:
      "Buscador IA privado que responde con fuentes citadas, self-host, combinando un LLM (local o proveedor propio) con SearXNG. Qué reemplaza: buscadores IA de pago (Perplexity). Nota honesta: su repo oficial se renombró a «Vane» en 2026 (mismo autor/proyecto); mantenemos el id «perplexica» por continuidad. Licencia MIT. Instalar registra la skill «Búsqueda IA» y suma el CONECTOR real (self-host, apagado por defecto) en Ajustes → Integraciones — su API pide el providerId de TU instancia (usa la acción «Ver proveedores/modelos» para obtenerlo), por eso queda como endpoint configurable en vez de un solo campo. También participa como motor opcional en el auto-selector de acceso web de Astraura. Abre su repo de referencia.",
    icon: "Search", tags: ["skill", "aurora", "busqueda", "web", "citas", "ia", "oss"], version: "1.0.0",
    author: "ItzCrazyKns", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "ai-search", externalUrl: "https://github.com/ItzCrazyKns/Vane", note: "Búsqueda IA con citas, self-host (MIT; repo renombrado a «Vane»). Conector real en Ajustes → Integraciones (apagado por defecto) + motor opcional en el acceso web de Astraura." },
  },
  /* ── Flowise · chatflows/agentes visuales ── */
  {
    id: "iatool-flowise", kind: "function", name: "Flowise (chatflows visuales)",
    description:
      "Construye chatflows/agentes conversacionales de forma visual (drag-and-drop) sobre LangChain. Qué reemplaza: constructores de chatbots de pago. Diferencia con Langflow (ya integrado, capacidad «flow-builder»): Langflow es un constructor GENERAL de flujos/agentes LLM sobre un grafo de nodos; Flowise está más centrado en chatflows conversacionales listos para incrustar (widget de chat). Son complementarios, no excluyentes — usa el que mejor calce con tu flujo. El conector real (predict de chatflow) YA existe en src/lib/integrations; instalar aquí solo registra la skill «Automatización de flujos» y abre su repo de referencia.",
    icon: "Workflow", tags: ["skill", "aurora", "agentes", "chatflows", "visual", "oss"], version: "1.0.0",
    author: "FlowiseAI", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "flow-automation", externalUrl: "https://github.com/FlowiseAI/Flowise", note: "Chatflows/agentes visuales sobre LangChain (Apache-2.0 core). Complementa a Langflow (constructor general) — conector real ya existente en Ajustes → Integraciones." },
  },
  /* ── AnythingLLM · workspace RAG todo-en-uno ── */
  {
    id: "iatool-anything-llm", kind: "function", name: "AnythingLLM (workspace RAG)",
    description:
      "App todo-en-uno self-host: chat con tus documentos por workspace, agentes y multiusuario, con vectorDB propia. Qué reemplaza: ChatGPT Team/plataformas RAG de pago. Licencia MIT. Instalar registra la skill «Workspace RAG» y suma el CONECTOR real (self-host, clave Bearer propia, apagado por defecto) en Ajustes → Integraciones: pregunta a un workspace concreto y cita sus fuentes. Abre su repo de referencia.",
    icon: "MessagesSquare", tags: ["skill", "aurora", "rag", "workspace", "documentos", "oss"], version: "1.0.0",
    author: "Mintplex-Labs", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "rag-workspace", externalUrl: "https://github.com/Mintplex-Labs/anything-llm", note: "Workspace RAG todo-en-uno self-host (MIT). Conector real en Ajustes → Integraciones (apagado por defecto)." },
  },
  /* ── Reor · notas locales con IA y grafo ── */
  {
    id: "iatool-reor", kind: "function", name: "Reor (notas locales con IA)",
    description:
      "App de notas de escritorio local-first: enlaza notas relacionadas automáticamente, responde preguntas sobre tu propio corpus (RAG local vía Ollama) y permite búsqueda semántica — todo corre en tu equipo. Qué reemplaza: Notion AI/Mem de pago. Licencia AGPL-3.0: StarSeed no copia su código. Conceptualmente compatible con el sistema de memorias .md del propio OS (memory root + `src/lib/brains/memory-types.ts`: mismo modelo de bóveda markdown con enlaces [[wiki]]). Honesto: Reor es una app de escritorio de un solo directorio SIN API pública hoy (su propio README: «Integrations with other apps are hopefully coming soon!»), así que instalar solo registra la skill «Notas locales con IA» —sin conector ni importación automática— y abre su repo de referencia.",
    icon: "NotebookText", tags: ["skill", "aurora", "notas", "grafo", "local", "memorias", "oss"], version: "1.0.0",
    author: "reorproject", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "local-ai-notes", externalUrl: "https://github.com/reorproject/reor", note: "Notas locales con IA y grafo (AGPL-3.0). Sin API pública hoy: solo capacidad + ficha, sin conector (honesto)." },
  },
  /* ── tldraw · pizarra infinita profesional (Adenda tldraw) ──
   * DISTINTO del resto de este repo: no es solo un enlace de referencia — es
   * una dependencia npm REAL instalada en el propio OS (`tldraw`, ver
   * package.json), que añade el motor "tldraw (profesional)" como OPCIÓN
   * dentro de /pizarra, junto al motor "Lienzo StarSeed" (que queda intacto y
   * sigue siendo el motor por defecto; se elige por pizarra al abrir/crear).
   * Instalar aquí solo registra la skill «Pizarra profesional»: el motor YA
   * funciona sin este paso (cero descarga adicional) — esto sólo hace que
   * Aurora lo conozca y lo recomiende. */
  {
    id: "iatool-tldraw", kind: "function", name: "tldraw (pizarra profesional)",
    description:
      "Motor de pizarra infinita profesional (dibujo a mano alzada, formas, notas adhesivas, diagramas) YA integrado como opción dentro de /pizarra, junto al «Lienzo StarSeed» (que sigue intacto y activo por defecto). A diferencia del resto de este repo, tldraw es una dependencia real instalada en el propio OS, no solo un enlace de referencia: elige el motor al abrir o crear una pizarra, persiste por pizarra. Licencia «tldraw license»: uso gratuito con la marca de agua «Made with tldraw» visible en el lienzo (no se oculta ni recorta — licencia comercial sin marca de agua no contratada). Instalar registra la skill «Pizarra profesional» para que Aurora la recomiende cuando el usuario quiera dibujo libre o diagramas, y abre su repo de referencia.",
    icon: "PenTool", tags: ["skill", "aurora", "pizarra", "dibujo", "diagramas", "whiteboard", "ya-integrado"], version: "1.0.0", featured: true,
    author: "tldraw Inc.", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "whiteboard-pro", externalUrl: "https://github.com/tldraw/tldraw", note: "SDK de pizarra infinita YA integrado en /pizarra (\"tldraw license\", marca de agua «Made with tldraw» obligatoria)." },
  },
  /* ══ SERVIDORES CASEROS + VOZ NEURAL (jul-2026 · SOP centro-creacion §6b/§10) ══
   * CasaOS y los tres motores de voz neural del sistema de voz de Aurora.
   * SEMBRADOS POR DEFECTO desde SEED_VERSION 13 (Adenda 66): instalar solo deja
   * la capacidad + el enlace listos (no descarga, no clave, no abre pestaña en la
   * siembra); el endpoint del servidor/voz se conecta después. Mismo patrón
   * honesto del repo: NINGUNO corre en el navegador —
   * son servidores que se instalan EN una neurona (dispositivo) y se conectan
   * por endpoint. Instalar = registrar skill/enlace real + abrir el repo. */
  {
    id: "iatool-casaos", kind: "app", name: "CasaOS (servidor casero)",
    description:
      "Convierte cualquier equipo (Linux/Raspberry Pi) en tu nube personal: panel web + App Store de apps Docker (Files, Nextcloud, Syncthing, Jellyfin, Ollama, AdGuard Home…). Es un servidor que se instala EN el dispositivo (curl -fsSL https://get.casaos.io | sudo bash), NO corre en el navegador. Instalar guarda el enlace y abre su repo; después declara su URL en Cerebro → Neuronas para probarlo, abrir/embeber su panel y usarlo como almacén de cerebros/memorias o host del motor IA local de Astraura.",
    icon: "HardDrive", tags: ["app", "servidor-casero", "docker", "neuronas", "self-host", "oss"], version: "1.0.0",
    author: "IceWhaleTech", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { externalUrl: "https://github.com/IceWhaleTech/CasaOS", note: "Servidor casero por neurona (Apache-2.0). Configuración por dispositivo en Cerebro → Neuronas → CasaOS." },
  },
  {
    id: "iatool-bark", kind: "function", name: "Bark (voz generativa de Aurora)",
    description:
      "TTS generativo expresivo de Suno: no solo lee — entona, ríe y ambienta (texto→audio). Es un servidor Python: se conecta por ENDPOINT (tu neurona o CasaOS), no corre en el navegador. Instalar registra la skill de voz neural para tus cerebros y abre su repo; el endpoint se configura en Ajustes → Voz. Aurora siempre habla: si el endpoint no está, cae a Kokoro o a la mejor voz del navegador.",
    icon: "Volume2", tags: ["skill", "aurora", "voz", "tts", "generativo", "oss"], version: "1.0.0",
    author: "suno-ai", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "aurora-voice-bark", externalUrl: "https://github.com/suno-ai/bark", note: "TTS generativo expresivo (MIT). Servidor Python por endpoint (neurona propia o CasaOS); fallback automático a Kokoro/navegador." },
  },
  {
    id: "iatool-gpt-sovits", kind: "function", name: "GPT-SoVITS (clonación de voz)",
    description:
      "Clonación de voz few-shot: con ~5 segundos de muestra crea una voz propia para Aurora (TTS multilingüe con WebUI). Es un servidor Python: se conecta por ENDPOINT (tu neurona o CasaOS), no corre en el navegador. Simbiótico con Bark (puede clonar la voz que Bark genera). Instalar registra la skill de voz neural para tus cerebros y abre su repo; el endpoint se configura en Ajustes → Voz.",
    icon: "AudioWaveform", tags: ["skill", "aurora", "voz", "tts", "clonacion", "oss"], version: "1.0.0",
    author: "RVC-Boss", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "aurora-voice-sovits", externalUrl: "https://github.com/RVC-Boss/GPT-SoVITS", note: "Clonación de voz few-shot + TTS multilingüe (MIT). Servidor Python por endpoint; simbiótico con Bark." },
  },
  {
    id: "iatool-omnivoice", kind: "function", name: "OmniVoice (voz multilingüe)",
    description:
      "Motor de voz neural multilingüe del ecosistema k2-fsa (Next-gen Kaldi): completa la cadena de voz gratis-primero de Aurora como opción multilingüe junto a Bark y GPT-SoVITS. Es un servidor: se conecta por ENDPOINT (tu neurona o CasaOS), no corre en el navegador. Instalar registra la skill de voz neural para tus cerebros y abre su repo; el endpoint se configura en Ajustes → Voz.",
    icon: "Languages", tags: ["skill", "aurora", "voz", "tts", "multilingue", "oss"], version: "1.0.0",
    author: "k2-fsa", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "aurora-voice-omnivoice", externalUrl: "https://github.com/k2-fsa/OmniVoice", note: "Voz neural multilingüe (Apache-2.0, Next-gen Kaldi). Servidor por endpoint; parte de la cadena de fallback de voz." },
  },
  /* ══ MEMORIA AGÉNTICA · ORGANIZADOR · SEGURIDAD · MAPAS (Adenda 66 · jul-2026) ══
   * Cinco repos del catálogo OSS (oss-library.ts) que faltaban como PAQUETES
   * instalables. Mismo patrón honesto del repo: `function` con `skillId` →
   * registra la capacidad viva en skills.ts + guarda/abre el repo de referencia.
   * NINGUNO corre en el navegador: Raven/Skales son servidores por endpoint
   * (neurona propia o CasaOS, misma pauta que en brains/servers.ts); Mouzi,
   * Strix y Organic Maps inspiran superficies PROPIAS del OS ya existentes
   * (smart-organizer.ts · security/scanner.ts · lib/map + Leaflet). Instalar =
   * solo registro de skill/capacidad + enlace; cero descarga, cero clave. */
  /* ── Raven · backend de memoria agéntica (EverMind) ── */
  {
    id: "iatool-raven", kind: "function", name: "Raven (memoria agéntica)",
    description:
      "Backend open-source de MEMORIA e inteligencia para agentes (EverMind-AI/Raven): recuerda, indexa y recupera contexto de largo plazo para tus cerebros de Aurora/Astraura. Es un servidor: se conecta por ENDPOINT (tu neurona propia o CasaOS), no corre en el navegador — misma pauta de conector que CasaOS (se declara en Cerebro → Neuronas/Servidores). Instalar registra la skill de memoria agéntica para tus cerebros y abre su repo de referencia.",
    icon: "Brain", tags: ["skill", "aurora", "memoria", "agentes", "cerebros", "oss"], version: "1.0.0",
    author: "EverMind-AI", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "agent-memory-raven", externalUrl: "https://github.com/EverMind-AI/Raven", note: "Backend de memoria agéntica de largo plazo (servidor por endpoint: neurona propia o CasaOS)." },
  },
  /* ── Skales · adaptador de memoria e inteligencia para agentes ── */
  {
    id: "iatool-skales", kind: "function", name: "Skales (memoria e inteligencia)",
    description:
      "Backend/adaptador open-source de memoria e inteligencia (skalesapp/skales) para cerebros de Aurora/Astraura: capa opcional que un cerebro puede usar como fuente de memoria. Autoalojable en una neurona propia; se conecta por ENDPOINT, con tus datos bajo tu control. Instalar registra la skill de memoria agéntica para tus cerebros y abre su repo de referencia.",
    icon: "Network", tags: ["skill", "aurora", "memoria", "inteligencia", "cerebros", "oss"], version: "1.0.0",
    author: "skalesapp", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "agent-memory-skales", externalUrl: "https://github.com/skalesapp/skales", note: "Adaptador de memoria/inteligencia para agentes (servidor por endpoint; datos bajo tu control)." },
  },
  /* ── Mouzi · organizador inteligente de archivos ── */
  {
    id: "iatool-mouzi", kind: "function", name: "Mouzi (organizador de archivos)",
    description:
      "Organizador inteligente de archivos: clasifica por tipo, tema y fecha con IA y propone una estructura de folders. Qué reemplaza: organizadores de archivos de pago. Es la inspiración OSS de la acción «Organizar inteligentemente» que YA existe en Biblioteca, cerebros y escritorios del OS (lib/files/smart-organizer.ts). Instalar registra la skill «Organización inteligente» para que Aurora la aplique y abre su repo de referencia.",
    icon: "FolderTree", tags: ["skill", "aurora", "archivos", "organizador", "clasificacion", "oss"], version: "1.0.0",
    author: "hsr88", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "smart-file-organize", externalUrl: "https://github.com/hsr88/mouzi", note: "Organizador de archivos con IA (inspira «Organizar inteligentemente» del OS, ya funcional)." },
  },
  /* ── Strix · agentes autónomos de seguridad ofensiva ── */
  {
    id: "iatool-strix", kind: "function", name: "Strix (seguridad ofensiva)",
    description:
      "Agentes autónomos de seguridad ofensiva (pentesting/AppSec) que encuentran y VALIDAN vulnerabilidades reales: suite avanzada para auditar tus neuronas, servidores caseros y despliegues propios. Qué reemplaza: suites de pentesting comerciales. Encaja con la seguridad estilo Strix ya presente en el OS (lib/security/scanner.ts). Es un servicio que corre aislado (nunca contra objetivos sin permiso): instalar registra la skill «Auditoría de seguridad» para que Aurora la recomiende y abre su repo de referencia.",
    icon: "ShieldAlert", tags: ["skill", "aurora", "seguridad", "pentesting", "agentes", "oss"], version: "1.0.0",
    author: "usestrix", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "security-audit", externalUrl: "https://github.com/usestrix/strix", note: "Agentes de seguridad ofensiva que validan vulnerabilidades reales (Apache-2.0). Solo con permiso." },
  },
  /* ── Organic Maps · mapas offline OSM (misma filosofía que el Mapa del Hub) ── */
  {
    id: "iatool-organicmaps", kind: "function", name: "Organic Maps (mapas offline)",
    description:
      "Mapas offline basados en OpenStreetMap, sin rastreo ni anuncios (Apache-2.0). Qué reemplaza: mapas propietarios con rastreo. Misma filosofía de datos abiertos que el Mapa del Hub de Conexiones del OS, que ya se dibuja con Leaflet + OSM (lib/map + components/map). Instalar registra la skill «Mapas offline» para que Aurora conozca este patrón de cartografía soberana y abre su repo de referencia (la app nativa es para Android/iOS/escritorio).",
    icon: "MapPinned", tags: ["skill", "aurora", "mapas", "osm", "leaflet", "offline", "oss"], version: "1.0.0",
    author: "organicmaps", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "offline-maps", externalUrl: "https://github.com/organicmaps/organicmaps", note: "Mapas offline OSM sin rastreo (Apache-2.0). El Mapa del Hub del OS usa Leaflet + OSM." },
  },

  /* ══ ADENDA 67 · P4 — Nueve repos (jul-2026) ══════════════════════════════
   * Cada paquete dice EN SU FICHA qué hace REALMENTE al instalarse. Tres estados:
   *   · FUNCIONAL → ya se ejecuta en el OS sin instalar nada (llm-council).
   *   · CONECTOR  → servidor que TÚ levantas; instalar registra la capacidad +
   *                 el enlace, y el endpoint se pega en Ajustes → Integraciones.
   *   · CATÁLOGO  → sin API usable; instalar guarda el enlace y abre el repo.
   * Ninguno descarga nada, ninguno lanza servidores, ninguno pide clave al
   * instalarse. Todos traen `externalUrl` de GitHub → el Centro de
   * Actualizaciones (available-updates.ts) detecta sus releases automáticamente.
   */

  /* ── P4-1 · OpenManus: Aurora delega tareas complejas ── */
  {
    id: "iatool-openmanus", kind: "function", name: "OpenManus (agente general)",
    description:
      "Da a Aurora la capacidad de DELEGAR tareas complejas de varios pasos a un agente general (MIT, del equipo de MetaGPT): planifica, navega con un navegador real, ejecuta código Python y encadena pasos hasta acabar. Instalar registra la capacidad «Delegación a agente general» para tus cerebros (Aurora sabrá cuándo conviene delegar y te lo propondrá) y guarda su repo. ⚠️ HONESTIDAD: OpenManus NO trae API HTTP — es CLI (main.py), flujo multi-agente (run_flow.py) y servidor MCP (run_mcp_server.py). Para que la delegación FUNCIONE de verdad tienes que exponerlo tú en tu neurona (su MCP en modo SSE o un envoltorio que acepte POST {task}) y pegar su URL + ruta en Ajustes → Integraciones → OpenManus. Sin endpoint, Aurora te lo dice y responde por su cuenta: nunca finge haber delegado.",
    icon: "Bot", tags: ["skill", "aurora", "agentes", "delegacion", "python", "mcp", "oss"], version: "1.0.0",
    author: "FoundationAgents (MetaGPT)", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "agent-delegation", externalUrl: "https://github.com/FoundationAgents/OpenManus", note: "Agente general OSS. CONECTOR EXPERIMENTAL: sin API HTTP oficial — exponlo tú (MCP SSE o envoltorio POST {task})." },
  },

  /* ── P4-2 · Penpot: lienzo, pizarras y entornos de edición ── */
  {
    id: "iatool-penpot", kind: "app", name: "Penpot (diseño y pizarras)",
    description:
      "La plataforma de DISEÑO de código abierto (MPL-2.0): lienzos, pizarras, componentes, prototipos e inspección de código — la alternativa soberana a Figma, con SVG estándar y sin encierro de datos. Instalar guarda el enlace, registra la capacidad «Diseño Penpot» para Aurora y habilita el BLOQUE DE PUBLICACIÓN «Diseño Penpot» en el Lienzo Universal: pegas el enlace de vista de un diseño y se publica en la red. ⚠️ HONESTIDAD: design.penpot.app envía «X-Frame-Options: SAMEORIGIN» (comprobado con curl) → NO se puede incrustar dentro del OS; el bloque muestra una tarjeta con enlace (que sí funciona) y solo ofrece incrustar si apuntas a una instancia PROPIA que lo permita.",
    icon: "PencilRuler", tags: ["app", "diseño", "lienzo", "pizarra", "prototipo", "self-host", "oss"], version: "2.16.2",
    author: "Penpot", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "design-penpot", externalUrl: "https://github.com/penpot/penpot", note: "Instancia oficial gratis (design.penpot.app) o auto-hospedada. Bloque de publicación «Diseño Penpot» en el Lienzo. NO incrustable en la instancia oficial." },
  },

  /* ── P4-3 · OpenCut: edición de vídeo ── */
  {
    id: "iatool-opencut", kind: "app", name: "OpenCut (edición de vídeo)",
    description:
      "Editor de VÍDEO open source (MIT) que corre en el navegador — la alternativa libre a CapCut. Tus ficheros no salen de tu equipo. Instalar guarda el enlace al editor (opencut.app, en vivo y gratis), registra la capacidad «Edición de vídeo» para Aurora y habilita el BLOQUE DE PUBLICACIÓN «Vídeo» en el Lienzo Universal, que reproduce de verdad el vídeo que exportes. ⚠️ HONESTIDAD: OpenCut NO tiene API todavía — su «Editor API», el modo headless y su servidor MCP están anunciados como FUTUROS en su propio README, así que el OS no puede editar por ti ni traerse tu montaje solo: montas allí, exportas, y publicas aquí.",
    icon: "Film", tags: ["app", "video", "edicion", "navegador", "creacion", "oss"], version: "1.0.0",
    author: "OpenCut", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "video-editing", externalUrl: "https://github.com/opencut-app/opencut", note: "Editor de vídeo web (MIT). Sin API hoy (Editor API/headless/MCP anunciados como futuros). Bloque «Vídeo» en el Lienzo." },
  },

  /* ── Adenda 69 · K · Audiomorphic COMPLETO (app + fondo, desbloqueado) ── */
  {
    id: "app-audiomorphic", kind: "app", name: "Audiomorphic (visualizador)",
    description:
      "★ YA FUNCIONA, sin instalar nada: es NATIVO del OS y está COMPLETO. El visualizador de consciencia de StarSeed — el sonido se convierte en geometría viva: una espiral fractal gobernada por el «Tratado de Unificación Armónica». Portado ENTERO desde la repo del usuario (alexbordongarrigos/audiomorphic-ar) a código del OS: se abre en /audiomorphic con el MENÚ DE AJUSTES COMPLETO — 3 pilotos (Deriva · Armónico · Génesis), 11 modos de aleatorización (Inteligente · DJ · Sagrado · Rítmico · Arcoíris · Astral…), autorregeneración avanzada con bloqueo por parámetro, LAS 20 GEOMETRÍAS SAGRADAS (Metatrón · Merkaba · Sri Yantra · Cimática · Sólidos Platónicos · Árbol de la Vida · Chakras · Om · Loto · Dharma Chakra · 3 mandalas…) tanto de capa propia como perturbando la espiral, color armónico, 6 modos de fondo, viñeta y presets ilimitados. SIN LOGIN, SIN PLANES, SIN TOUR (en la app original los planes bloqueaban DE VERDAD la mitad de esa lista). El mismo menú completo está disponible para la CAPA DE FONDO del sistema, con TRANSPARENCIA REAL, en Ajustes → Apariencia → Fondo. El micrófono se concede con un clic; sin él, el espiral sigue vivo con el piloto automático. HONESTIDAD: el modo VR/AR NO está portado (su motor exige React 19 + R3F v9; el OS va con React 18 + R3F v8) — para eso se abre la app original.",
    icon: "AudioWaveform", tags: ["app", "visualizador", "audio", "fondo", "geometria-sagrada", "nativo", "starseed"], version: "2.0.0",
    author: "Audiomorphic · Alex Bordón Garrigós", sourceRepoId: "starseed-core", free: true, featured: true,
    payload: { route: "/audiomorphic", externalUrl: "https://github.com/alexbordongarrigos/audiomorphic-ar", note: "PORTADO COMPLETO: motor en src/lib/audiomorphic/ (20 geometrías + piloto real + fondos). App en /audiomorphic + capa de fondo con alfa real y el MISMO menú completo. VR/AR solo en la app original (React 19)." },
  },

  /* ── P4-4 · llm-council → Consejo de Aurora (¡YA FUNCIONA!) ── */
  {
    id: "iatool-llm-council", kind: "function", name: "Consejo de Aurora (llm-council)",
    description:
      "★ ESTE YA FUNCIONA, sin instalar nada más: es el CONSEJO DE AURORA del Área Política. Implementa de verdad el patrón llm-council de Andrej Karpathy (dictámenes por separado → revisión cruzada ANONIMIZADA → síntesis del «Chairman») usando el router gratis-primero de Astraura — sin servidor, sin clave y sin pagar OpenRouter (que es lo que exige el repo original). Nuestra variación: los consejeros no son modelos rivales sino los CINCO FUNDAMENTOS StarSeed (ontocrático · ecológico · abundancia · simbiótico · empático), y cada dictamen CITA el fundamento en que se apoya. Instalar registra la capacidad para que Aurora sepa convocarlo desde cualquier chat. Úsalo en Red → Política («Consejo de Aurora») o desde el compositor de propuestas («Consultar al Consejo de Aurora»). HONESTIDAD: si solo tienes UNA fuente de inteligencia disponible, el informe lo declara («fuente única») en lugar de fingir que han deliberado varias IAs.",
    icon: "Landmark", tags: ["skill", "aurora", "politica", "deliberacion", "multi-modelo", "consejo", "funcional"], version: "1.0.0",
    author: "karpathy · StarSeed", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "aurora-council", externalUrl: "https://github.com/karpathy/llm-council", route: "/network/politics", note: "IMPLEMENTADO en src/lib/aurora/council.ts. Corre con el router gratis-primero: cero coste, cero servidores." },
  },

  /* ── P4-5 · Typesense: búsqueda del OS ── */
  {
    id: "iatool-typesense", kind: "function", name: "Typesense (búsqueda)",
    description:
      "Motor de BÚSQUEDA open source (GPL-3.0), instantáneo y tolerante a erratas — la alternativa libre a Algolia. Instalar registra la capacidad «Búsqueda avanzada» para Aurora y guarda su repo. Si además levantas el servidor en tu neurona (Docker, puerto 8108) y lo activas en Ajustes → Integraciones, la búsqueda de personas y grupos del OS (Hub y Cultura) pasa a usarlo, con relevancia real y tolerancia a erratas. HONESTIDAD/SEGURIDAD DE LA CADENA: si NO lo tienes, si se cae o si su índice está vacío, la búsqueda cae SOLA a la de siempre (Supabase) y no te enteras. Es una mejora opcional, nunca un requisito. Usa una clave de SOLO BÚSQUEDA en el OS; jamás la admin key.",
    icon: "Search", tags: ["skill", "aurora", "busqueda", "typesense", "self-host", "fallback", "oss"], version: "30.2.0",
    author: "Typesense", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "advanced-search", externalUrl: "https://github.com/typesense/typesense", note: "Servidor de búsqueda por endpoint (:8108). Con fallback automático a Supabase: la búsqueda del OS NUNCA se queda sin motor." },
  },

  /* ── P4-6 · Memoria: MemPalace + TencentDB Agent Memory ── */
  {
    id: "iatool-mempalace", kind: "function", name: "MemPalace (memoria local)",
    description:
      "Memoria de IA local-first (MIT) que guarda tus conversaciones LITERALMENTE —no resume ni parafrasea— y las recupera por búsqueda semántica, organizadas como un palacio de la memoria: personas y proyectos son «alas», los temas «habitaciones» y el contenido original vive en «cajones». 96,6 % de recall en LongMemEval sin una sola llamada a ninguna API. Instalar registra la capacidad «Memoria agéntica» y añade MemPalace como FUENTE DE MEMORIA declarable en tus cerebros (Cerebro → Memoria → Fuente). ⚠️ HONESTIDAD DURA: MemPalace NO expone API HTTP — su servidor MCP habla JSON-RPC por stdio (lo dice su propio docker-compose), así que el OS, desde el navegador, NO puede sincronizar con él. Lo declaras para que Aurora sepa que tu memoria vive ahí y te guíe con sus comandos; la lectura/escritura real la hace tu agente local por MCP. Si montas un puente HTTP, pega su URL y entonces sí sincroniza.",
    icon: "Library", tags: ["skill", "aurora", "memoria", "local-first", "mcp", "cerebros", "oss"], version: "3.5.0",
    author: "MemPalace", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "agent-memory-mempalace", externalUrl: "https://github.com/mempalace/mempalace", note: "Local-first (CLI + MCP por stdio). SIN API HTTP: no sincronizable desde el navegador salvo puente propio." },
  },
  {
    id: "iatool-tencentdb-memory", kind: "function", name: "TencentDB Agent Memory (memoria por capas)",
    description:
      "Memoria para agentes en dos frentes: (1) memoria SIMBÓLICA de corto plazo que condensa los logs de herramientas en un lienzo Mermaid compacto (miden hasta −61 % de tokens), y (2) memoria LARGA POR CAPAS que destila la conversación en una pirámide L0 conversación → L1 átomo → L2 escena → L3 persona, en vez de un montón plano de vectores. 100 % local por defecto (SQLite + sqlite-vec), sin APIs externas. Instalar registra la capacidad «Memoria agéntica» y lo añade como FUENTE DE MEMORIA de tus cerebros. A diferencia de MemPalace, ESTE SÍ trae un Gateway HTTP propio (/recall · /capture · /search/memories · /session/end): levántalo en tu neurona (Docker, :8420), autoriza el origen del OS en su CORS, pega su URL en Ajustes → Integraciones y el OS lo llama de verdad.",
    icon: "Brain", tags: ["skill", "aurora", "memoria", "capas", "gateway", "cerebros", "oss"], version: "1.0.0",
    author: "TencentCloud", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "agent-memory-tencentdb", externalUrl: "https://github.com/TencentCloud/TencentDB-Agent-Memory", note: "CONECTOR REAL: Gateway HTTP (:8420) con /recall · /capture · /search/memories. 100% local por defecto." },
  },

  /* ── P4-7 · Databasement: respaldo de bases de datos ── */
  {
    id: "iatool-databasement", kind: "function", name: "Databasement (respaldo de BD)",
    description:
      "Gestor auto-hospedado de COPIAS DE SEGURIDAD de bases de datos, con panel web (MIT): programa y ejecuta backups de MySQL, PostgreSQL, MariaDB, SQL Server, MongoDB, SQLite, Firebird y Redis hacia S3, SFTP, FTP o disco local; retención GFS, cifrado AES-256, túnel SSH, agentes remotos para redes cerradas y restauración cruzada. Instalar registra la capacidad «Respaldo de datos» para Aurora y guarda su repo; conéctalo por endpoint (API /api/v1 con token Sanctum) y decláralo como SERVIDOR DE RESPALDO de tu cuenta, tu cerebro o tu perfil (Cerebro → Servidores, rol «Almacenamiento»). ⚠️ HONESTIDAD: NO es «una base de datos para cada cuenta» — no provisiona bases de datos nuevas. Es quien las RESPALDA, que para soberanía de datos (§6: el usuario es el único propietario de sus datos) es justo la pieza que faltaba.",
    icon: "DatabaseBackup", tags: ["skill", "aurora", "respaldo", "backup", "bases-de-datos", "soberania", "oss"], version: "1.0.0",
    author: "David-Crty", sourceRepoId: "starseed-ia-tools", free: true,
    payload: { skillId: "data-backup", externalUrl: "https://github.com/David-Crty/databasement", note: "CONECTOR REAL: /api/v1 (Sanctum). Es un gestor de COPIAS DE SEGURIDAD, no un proveedor de bases de datos." },
  },

  /* ── P4-8 · Postiz: Astraura en las redes sociales ── */
  {
    id: "iatool-postiz", kind: "function", name: "Postiz (publicar en redes)",
    description:
      "Gestor open source (AGPL-3.0) de publicación y programación en ~32 REDES SOCIALES (X, LinkedIn, Instagram, Facebook, Threads, Mastodon, Bluesky, Telegram, Discord, Reddit, YouTube, TikTok, Pinterest, Medium, Dev.to, WordPress…) — la alternativa libre a Buffer. Instalar registra la capacidad «Publicar en redes» para Aurora (sabrá adaptar un texto a cada red y prepararte el borrador) y lo añade al Hub de Conexiones. Con tu clave puesta (Ajustes → Integraciones → Postiz), el Lienzo Universal muestra el panel «Publicar también en redes». ⚠️ REGLA DE ORO DEL OS: publicar fuera de StarSeed es IRREVERSIBLE y toca cuentas de terceros → NUNCA es automático. Publicar en la red StarSeed jamás dispara Postiz. El crosspost es un acto SEPARADO, con la lista exacta de canales y el texto exacto a la vista, y una confirmación explícita tuya. Aurora puede redactar; pulsar el botón, no.",
    icon: "Megaphone", tags: ["skill", "aurora", "redes-sociales", "publicacion", "postiz", "confirmacion-explicita", "oss"], version: "2.21.10",
    author: "Gitroom", sourceRepoId: "starseed-ia-tools", free: true, featured: true,
    payload: { skillId: "social-publish", externalUrl: "https://github.com/gitroomhq/postiz-app", note: "CONECTOR REAL: API pública (Authorization en crudo). Publicar SIEMPRE requiere confirmación explícita del usuario." },
  },
];

/** Repo builtin de Herramientas IA & Agentes (caja de herramientas de Aurora). */
export const STARSEED_IA_TOOLS_REPO: LibraryRepo = {
  id: "starseed-ia-tools",
  name: "Herramientas IA & Agentes",
  builtin: true,
  packages: IA_TOOLS_PACKAGES,
};

/* ═══════════════════ REPO BUILTIN «starseed-agents» (P5) ═══════════════════ */
/**
 * Agentes: cada agente Aurora+Astraura de fábrica se expone como PAQUETE
 * instalable de kind "agent". Instalar = registrar su definición en el store de
 * agentes (src/lib/agents/store.ts → ensureAgentInstalled) como copia editable
 * de tu biblioteca personal. Transparencia radical: el payload.agent lleva la
 * definición EXACTA (persona + capacidades + preferencias de modelo) y no hay
 * efecto oculto. Los ids de capacidad son los del vocabulario compartido de
 * skills.ts (taste · pm · web-senses · research · vision · voice), así que un
 * agente instalado activa esas capacidades reales de Aurora al usarlo.
 *
 * APPEND-ONLY: se construye desde BUILTIN_AGENTS (una sola fuente de verdad).
 */
function buildAgentPackages(): LibraryPackage[] {
  const agents = Array.isArray(AGENT_BUILTINS) ? AGENT_BUILTINS : [];
  return agents.map((a) => ({
    id: `agent-pkg-${a.id}`,
    kind: "agent" as PackageKind,
    name: a.name,
    description: a.description,
    icon: a.icon || "Bot",
    tags: ["agente", "aurora", ...(a.capabilities ?? []).slice(0, 6)],
    version: a.version || "1.0.0",
    author: a.author || "StarSeed Core",
    sourceRepoId: "starseed-agents",
    free: true,
    featured: a.id === "agent-aurora-guide",
    payload: { agent: a },
  }));
}

/** Repo builtin de Agentes (P5). */
export const STARSEED_AGENTS_REPO: LibraryRepo = {
  id: "starseed-agents",
  name: "Agentes",
  builtin: true,
  packages: buildAgentPackages(),
};

/* ═══════════════════ REPO BUILTIN «starseed-themes» (Catálogo) ═══════════════════ */
/**
 * Catálogo de TEMAS/ESTILOS: cada ThemePack builtin de theme-catalog.ts se
 * expone también como paquete instalable de kind "design" con
 * `payload.themeId` (en vez de `payload.materialClass`). Instalar = APLICAR
 * el ThemePack completo (paleta + material + fondo) vía theme-engine.ts —
 * ver el caso "design" de install() más abajo. Honestidad radical: a
 * diferencia de un material suelto, aplicar un tema completo SUSTITUYE la
 * paleta activa (por diseño: son excluyentes entre sí), así que NINGUNO de
 * estos ids entra en RECOMMENDED_PACKAGE_IDS (defaults-seed.ts) — el usuario
 * elige el suyo a propósito, igual que con "design-cristal-zenith" hoy.
 */
const THEME_PACKAGE_ICONS: Record<string, string> = {
  "art-nouveau": "Flower2", "art-deco": "Gem", "pop": "CircleDot",
  "solarpunk": "Sprout", "retro": "Disc3", "futurista": "Rocket",
  "retrofuturista": "Waves", "matrix": "Terminal", "naturaleza": "Leaf",
  "cyberpunk": "Zap", "visionario": "Eye", "arcoiris": "Rainbow",
  "hippie": "Flower", "punk": "Skull", "cristal-realista": "Gem",
  "climatico": "CloudSun", "astrologico": "Stars", "infantil": "PartyPopper",
  "profesional": "Briefcase", "equilibrado": "Scale", "neon": "Zap",
  "metalico": "CircleDot", "madera": "TreePine", "material-3d": "Boxes",
};

function buildThemePackages(): LibraryPackage[] {
  return BUILTIN_THEMES.map((t) => ({
    id: `design-theme-${t.id}`,
    kind: "design" as PackageKind,
    name: `Tema · ${t.name}`,
    description: t.description,
    icon: THEME_PACKAGE_ICONS[t.id] || "Palette",
    tags: ["tema", "catalogo", t.style],
    version: "1.0.0",
    author: "StarSeed Core",
    sourceRepoId: "starseed-themes",
    free: true,
    payload: { themeId: t.id },
  }));
}

/** Repo builtin del Catálogo de Temas. */
export const STARSEED_THEMES_REPO: LibraryRepo = {
  id: "starseed-themes",
  name: "Catálogo de Temas",
  builtin: true,
  packages: buildThemePackages(),
};

/* ═══════════════ REPO BUILTIN «starseed-design-elements» (Mezclador) ═══════════════ */
/**
 * Elementos de Diseño SUELTOS (design-elements.ts): paletas, materiales,
 * fondos animados, tipografías, animaciones, densidades y efectos — cada
 * `DesignElementDef` se expone como paquete "design" con
 * `payload.elementKind` + `payload.tokens` (en vez de `payload.themeId` o
 * `payload.materialClass`). A diferencia de un tema completo, instalar UN
 * elemento suelto NUNCA sustituye la paleta activa (sería sorprendente:
 * instalar solo "Metal Bruñido" no debería cambiar tus colores) — su efecto
 * real es quedar disponible como fuente de slot en el Mezclador
 * (theme-mixer.ts lista TODOS los DESIGN_ELEMENTS exista o no el paquete
 * "instalado"; instalarlo aquí es sobre todo para que aparezca en tu
 * Biblioteca/Cydia como cualquier otro paquete, con su ficha y su registro).
 */
const DESIGN_ELEMENT_KIND_ICONS: Record<DesignElementKind, string> = {
  paleta: "Palette", material: "Layers", fondo: "Waves", tipografia: "Type",
  animaciones: "Activity", densidad: "Shapes", efectos: "Sparkles",
};

function buildDesignElementPackages(): LibraryPackage[] {
  return DESIGN_ELEMENTS.map((el) => ({
    id: `design-element-${el.id}`,
    kind: "design" as PackageKind,
    name: el.name,
    description: el.description,
    icon: DESIGN_ELEMENT_KIND_ICONS[el.kind] || "Palette",
    tags: ["elemento", "mezclador", el.kind],
    version: "1.0.0",
    author: "StarSeed Core",
    sourceRepoId: "starseed-design-elements",
    free: true,
    payload: { elementKind: el.kind, elementId: el.id, tokens: el.light },
  }));
}

/** Repo builtin de Elementos de Diseño (fuentes sueltas del Mezclador). */
export const STARSEED_DESIGN_ELEMENTS_REPO: LibraryRepo = {
  id: "starseed-design-elements",
  name: "Elementos de Diseño",
  builtin: true,
  packages: buildDesignElementPackages(),
};

/* ═══════════════════ Validación de repos externos ═══════════════════ */

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Sanea un paquete crudo de un repo externo. Devuelve null si es inválido. */
function sanitizePackage(raw: unknown, repoId: string): LibraryPackage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id).trim();
  const name = asString(r.name).trim();
  const kind = asString(r.kind).trim() as PackageKind;
  if (!id || !name || !VALID_KINDS.includes(kind)) return null;
  return {
    id,
    kind,
    name,
    description: asString(r.description),
    icon: asString(r.icon, "Package"),
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string").slice(0, 12) : [],
    version: asString(r.version, "1.0.0"),
    author: asString(r.author, "Desconocido"),
    sourceRepoId: repoId,
    free: r.free !== false, // gratis-primero por defecto
    payload: r.payload && typeof r.payload === "object" && !Array.isArray(r.payload)
      ? (r.payload as Record<string, unknown>)
      : {},
    comingSoon: r.comingSoon === true,
  };
}

/**
 * Valida el shape LibraryRepo de un JSON externo. Tolerante: descarta
 * paquetes inválidos en vez de rechazar el repo entero. Null si no es repo.
 */
export function validateRepoShape(data: unknown, url?: string): LibraryRepo | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id = asString(d.id).trim();
  const name = asString(d.name).trim();
  if (!id || !name || !Array.isArray(d.packages)) return null;
  const packages = d.packages
    .map((p) => sanitizePackage(p, id))
    .filter((p): p is LibraryPackage => p !== null);
  return { id, name, url: url ?? (asString(d.url) || undefined), builtin: false, packages };
}

/* ═══════════════════ Repos: listar / añadir / quitar ═══════════════════ */

function readExternalRepos(): LibraryRepo[] {
  const raw = readJson<unknown>(REPOS_KEY);
  if (!Array.isArray(raw)) return [];
  // Re-validamos al leer: si alguien corrompió el storage, no rompemos la UI.
  return raw
    .map((r) => validateRepoShape(r, (r as { url?: string })?.url))
    .filter((r): r is LibraryRepo => r !== null);
}

/** Id del repo local del usuario (réplicas/forks editables). */
export const MINE_REPO_ID = "starseed-mine";

/** Lee las réplicas del usuario y las expone como un repo local. */
function readMineRepo(): LibraryRepo {
  const raw = readJson<unknown>(MINE_KEY);
  const pkgs = Array.isArray(raw)
    ? raw.map((p) => sanitizePackage(p, MINE_REPO_ID)).filter((p): p is LibraryPackage => p !== null)
    : [];
  // Re-inyectamos los campos aditivos que sanitizePackage no conserva (forkedFrom/visibility).
  if (Array.isArray(raw)) {
    for (const pkg of pkgs) {
      const src = raw.find((r) => (r as { id?: string })?.id === pkg.id) as Record<string, unknown> | undefined;
      if (src) {
        if (typeof src.forkedFrom === "string") pkg.forkedFrom = src.forkedFrom;
        if (src.visibility === "public" || src.visibility === "private") pkg.visibility = src.visibility;
        if (src.featured === true) pkg.featured = true;
      }
    }
  }
  return { id: MINE_REPO_ID, name: "Mi biblioteca (réplicas)", builtin: false, packages: pkgs };
}

function readMinePackages(): LibraryPackage[] {
  return readMineRepo().packages;
}

function writeMinePackages(pkgs: LibraryPackage[]): void {
  writeJson(MINE_KEY, pkgs);
  emitLibraryEvent();
}

/** Todos los repos: builtins primero + repo local del usuario + externos. */
export function listRepos(): LibraryRepo[] {
  const mine = readMineRepo();
  const base = [STARSEED_CORE_REPO, STARSEED_LABS_REPO, STARSEED_IA_TOOLS_REPO, STARSEED_AGENTS_REPO, STARSEED_THEMES_REPO, STARSEED_DESIGN_ELEMENTS_REPO];
  // El repo local del usuario solo se lista si tiene réplicas (evita ruido).
  if (mine.packages.length) base.push(mine);
  return [...base, ...readExternalRepos()];
}

/**
 * Añade un repo externo por URL. El JSON debe tener shape LibraryRepo:
 * `{ "id": "...", "name": "...", "packages": [ { id, kind, name, ... } ] }`.
 * Defensivo: timeout de 8 s, validación completa, nunca lanza.
 */
export async function addRepoByUrl(url: string): Promise<InstallResult & { repo?: LibraryRepo }> {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador." };
  const clean = (url ?? "").trim();
  if (!/^https?:\/\//i.test(clean)) {
    return { ok: false, message: "La URL debe empezar por http:// o https://." };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let data: unknown;
    try {
      const res = await fetch(clean, { signal: ctrl.signal });
      if (!res.ok) return { ok: false, message: `El repo respondió ${res.status}.` };
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
    const repo = validateRepoShape(data, clean);
    if (!repo) {
      return { ok: false, message: "El JSON no tiene el shape LibraryRepo (id, name, packages[])." };
    }
    if (
      repo.id === STARSEED_CORE_REPO.id ||
      repo.id === STARSEED_LABS_REPO.id ||
      repo.id === STARSEED_IA_TOOLS_REPO.id ||
      repo.id === STARSEED_AGENTS_REPO.id ||
      repo.id === STARSEED_THEMES_REPO.id ||
      repo.id === STARSEED_DESIGN_ELEMENTS_REPO.id ||
      repo.id === MINE_REPO_ID
    ) {
      return { ok: false, message: `Ese id de repo está reservado (${repo.id}).` };
    }
    const others = readExternalRepos().filter((r) => r.id !== repo.id);
    writeJson(REPOS_KEY, [...others, repo]);
    emitLibraryEvent();
    return { ok: true, message: `Repo «${repo.name}» añadido con ${repo.packages.length} paquete(s).`, repo };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError"
      ? "El repo tardó demasiado en responder (8 s)."
      : "No pude leer el repo (¿CORS o JSON inválido?).";
    return { ok: false, message: msg };
  }
}

/** Quita un repo externo (el builtin no se puede quitar). */
export function removeRepo(id: string): InstallResult {
  if (id === STARSEED_CORE_REPO.id) {
    return { ok: false, message: "El repo del núcleo no se puede quitar." };
  }
  const current = readExternalRepos();
  const next = current.filter((r) => r.id !== id);
  if (next.length === current.length) return { ok: false, message: "Ese repo no existe." };
  writeJson(REPOS_KEY, next);
  emitLibraryEvent();
  return { ok: true, message: "Repo quitado. Sus paquetes instalados siguen registrados." };
}

/* ═══════════════════ Paquetes: catálogo unificado ═══════════════════ */

/** Todos los paquetes de todos los repos (dedupe por id; builtin manda). */
export function allPackages(): LibraryPackage[] {
  const seen = new Set<string>();
  const out: LibraryPackage[] = [];
  for (const repo of listRepos()) {
    for (const pkg of repo.packages) {
      if (seen.has(pkg.id)) continue;
      seen.add(pkg.id);
      out.push({ ...pkg, sourceRepoId: repo.id });
    }
  }
  return out;
}

export function findPackage(id: string): LibraryPackage | undefined {
  return allPackages().find((p) => p.id === id);
}

/* ═══════════════════ Registro de instalados ═══════════════════ */

/** Mapa completo de instalados (defensivo: objeto plano validado). */
export function getInstalledMap(): Record<string, InstalledEntry> {
  const raw = readJson<unknown>(INSTALLED_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, InstalledEntry> = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    out[id] = {
      installedAt: typeof e.installedAt === "number" ? e.installedAt : Date.now(),
      version: asString(e.version, "1.0.0"),
      kind: VALID_KINDS.includes(e.kind as PackageKind) ? (e.kind as PackageKind) : "app",
    };
  }
  return out;
}

export function isInstalled(id: string): boolean {
  return id in getInstalledMap();
}

function registerInstalled(pkg: LibraryPackage): void {
  const map = getInstalledMap();
  map[pkg.id] = { installedAt: Date.now(), version: pkg.version, kind: pkg.kind };
  writeJson(INSTALLED_KEY, map);
  emitLibraryEvent();
}

function unregisterInstalled(id: string): void {
  const map = getInstalledMap();
  if (!(id in map)) return;
  delete map[id];
  writeJson(INSTALLED_KEY, map);
  emitLibraryEvent();
}

/**
 * Marca una versión nueva como instalada para un paquete YA instalado (sin
 * reejecutar su efecto). Lo usa el Centro de Notificaciones → «Actualizaciones
 * disponibles» cuando el usuario acepta actualizar a la versión detectada en
 * GitHub/registro. Actualiza el registro `starseed.library.installed.v1` (que
 * viaja con la cuenta vía SYNCED_KEYS y library-sync). No-op si no está
 * instalado. Devuelve true si cambió algo. SSR-safe.
 */
export function setInstalledVersion(id: string, version: string): boolean {
  if (!isClient()) return false;
  const map = getInstalledMap();
  const entry = map[id];
  if (!entry) return false;
  const next = (version ?? "").trim();
  if (!next || next === entry.version) return false;
  map[id] = { ...entry, version: next };
  writeJson(INSTALLED_KEY, map);
  emitLibraryEvent();
  return true;
}

/* ═══════════════ Registros de efectos (diseño / funciones) ═══════════════ */

function readStringList(key: string): string[] {
  const raw = readJson<unknown>(key);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Clases de material/animación activas. La capa de materiales del OS
 * (starseed-materials.css + su aplicador) lee esta lista y escucha
 * DESIGN_EVENT para aplicar las clases a las superficies.
 */
export function getActiveDesignClasses(): string[] {
  return readStringList(DESIGN_KEY);
}

function setActiveDesignClasses(classes: string[]): void {
  writeJson(DESIGN_KEY, Array.from(new Set(classes)));
  if (isClient()) {
    try {
      window.dispatchEvent(new CustomEvent(DESIGN_EVENT, { detail: { classes: getActiveDesignClasses() } }));
    } catch { /* noop */ }
  }
  emitLibraryEvent();
}

/** Skills de Aurora instaladas desde la Biblioteca (los cerebros las leen). */
export function getInstalledFunctionIds(): string[] {
  return readStringList(FUNCTIONS_KEY);
}

/** IDs de paquetes instalados (claves del mapa `starseed.library.installed.v1`).
 *  Lo usan las Capacidades de Aurora (skills.ts) para activar capacidades cuyo
 *  disparador es un paquete (p.ej. Open Notebook) y no una skill-función. */
export function getInstalledPackageIds(): string[] {
  return Object.keys(getInstalledMap());
}

/** Fusiona (UNIÓN, nunca resta) instalados/funciones traídos de la CUENTA para
 *  que la Biblioteca "Cydia" y las skills de Aurora SIGAN a la misma cuenta en
 *  cualquier dispositivo (OS · Nexus · Café comparten cuenta soberana). Lo llama
 *  library-sync al iniciar sesión. Local gana en conflicto; defensivo. */
export function mergeInstalledFromAccount(
  map?: Record<string, InstalledEntry> | null,
  fns?: string[] | null,
): void {
  if (!isClient()) return;
  try {
    if (map && typeof map === "object") {
      const local = getInstalledMap();
      writeJson(INSTALLED_KEY, { ...map, ...local }); // local prevalece
    }
  } catch { /* noop */ }
  try {
    if (Array.isArray(fns) && fns.length) {
      const set = new Set<string>([...getInstalledFunctionIds(), ...fns.filter((x) => typeof x === "string")]);
      writeJson(FUNCTIONS_KEY, Array.from(set));
    }
  } catch { /* noop */ }
  emitLibraryEvent();
}

function setInstalledFunctionIds(ids: string[]): void {
  writeJson(FUNCTIONS_KEY, Array.from(new Set(ids)));
  emitLibraryEvent();
}

/* ═══════════════════ install() / uninstall() ═══════════════════ */

/**
 * Instala un paquete aplicando su EFECTO REAL según su kind y registrándolo.
 * Usa imports dinámicos defensivos para no arrastrar módulos pesados (router
 * de Astraura, disponibilidad) hasta que hacen falta. Nunca lanza.
 */
export async function install(pkg: LibraryPackage): Promise<InstallResult> {
  if (!isClient()) return { ok: false, message: "Instalación disponible solo en el navegador." };
  if (!pkg || !pkg.id) return { ok: false, message: "Paquete inválido." };
  if (pkg.comingSoon) return { ok: false, message: "Este paquete llegará próximamente: aún no tiene efecto real." };

  try {
    /* ── Enlace externo (research/project/función con externalUrl, sin route):
     *    guardamos el enlace en la biblioteca y lo abrimos. Honesto: NO se
     *    finge ejecutar en el navegador. Si además trae catalogSourceId (Sipp),
     *    activamos esa fuente en Astraura como cortesía. ─────────────────── */
    const externalUrl = asString(pkg.payload.externalUrl).trim();
    const hasRoute = !!asString(pkg.payload.route).trim();
    if (externalUrl && !hasRoute) {
      saveLinkEntry(pkg, externalUrl);
      registerInstalled(pkg);
      // Co-registro de skill si el paquete externo TAMBIÉN declara `skillId`
      // (p.ej. taste-skill / Agent-Reach / pm-skills de Herramientas IA): la
      // mejora real es la skill; el enlace es su código fuente de referencia.
      const coSkillId = asString(pkg.payload.skillId).trim();
      if (coSkillId) {
        setInstalledFunctionIds([...getInstalledFunctionIds(), coSkillId]);
      }
      // Co-activación opcional de fuente IA (p.ej. Sipp / OpenLLM) — nunca bloquea.
      const coSourceId = asString(pkg.payload.catalogSourceId).trim();
      if (coSourceId && findSource(coSourceId)) {
        try {
          const router = await import("@/ai/astraura/router");
          const prefs = router.getIntelligenceSettings();
          router.saveIntelligenceSettings({
            disabledSources: prefs.disabledSources.filter((id) => id !== coSourceId),
          });
        } catch { /* defensivo: la fuente se puede activar luego a mano */ }
      }
      const msg = coSkillId
        ? `Skill «${pkg.name}» registrada para tus cerebros y su enlace guardado. Abro el repo de referencia.`
        : `Enlace de «${pkg.name}» guardado en tu biblioteca. Lo abro para que lo despliegues/estudies (no se ejecuta en el navegador).`;
      return { ok: true, message: msg, action: "external", href: externalUrl };
    }

    switch (pkg.kind) {
      /* ── Agente (P5): registrar su definición en el store de agentes ── */
      case "agent": {
        const agentDef = pkg.payload.agent;
        if (!agentDef || typeof agentDef !== "object") {
          return { ok: false, message: "Este paquete de agente no trae su definición." };
        }
        try {
          const store = await import("@/lib/agents/store");
          store.ensureAgentInstalled(agentDef as import("@/lib/agents/model").Agent);
        } catch {
          return { ok: false, message: "No pude registrar el agente en tu biblioteca." };
        }
        registerInstalled(pkg);
        return {
          ok: true,
          message: `Agente «${pkg.name}» instalado en tu biblioteca: ábrelo para personalizarlo o átalo a un cerebro.`,
        };
      }

      /* ── Fuente de IA: activarla en Astraura ─────────────────────── */
      case "ai-source": {
        const sourceId = asString(pkg.payload.catalogSourceId).trim();
        const source = findSource(sourceId);
        if (!source) return { ok: false, message: "Esa fuente ya no existe en el catálogo Astraura." };
        // Import dinámico defensivo: el router toca localStorage y providers.
        const router = await import("@/ai/astraura/router");
        const prefs = router.getIntelligenceSettings();
        router.saveIntelligenceSettings({
          disabledSources: prefs.disabledSources.filter((id) => id !== sourceId),
        });
        registerInstalled(pkg);
        if (source.requiresKey) {
          // ¿Ya tiene el usuario una config con clave para esta fuente?
          let configured = false;
          try {
            const avail = await import("@/ai/astraura/availability");
            configured = !!avail.userConfigForSource(source);
          } catch { /* defensivo: asumimos no configurada */ }
          if (!configured && source.getKeyUrl) {
            return {
              ok: true,
              message: `${source.label} activada para Aurora. Consigue tu clave GRATIS y pégala en Ajustes → Inteligencia.`,
              action: "external",
              href: source.getKeyUrl,
            };
          }
        }
        const extra = source.tier === "local"
          ? " Requiere el servidor local corriendo en este equipo."
          : "";
        return { ok: true, message: `${source.label} activada: Aurora ya puede elegirla.${extra}` };
      }

      /* ── Diseño / animación: registro de clases + evento de diseño.
             Excepciones (ambas kind "design"):
               · payload.themeId      → APLICA el ThemePack completo entero
                 (paleta+material+fondo) vía theme-engine.ts.
               · payload.elementKind  → un elemento SUELTO del Mezclador
                 (design-elements.ts): NUNCA aplica nada globalmente por sí
                 solo (sería sorprendente que instalar solo un material
                 cambiara tu paleta) — su efecto real es quedar registrado en
                 tu Biblioteca; el Mezclador ya lo lista como fuente de slot
                 exista o no el paquete "instalado". ── */
      case "design":
      case "animation": {
        if (pkg.kind === "design" && typeof pkg.payload.themeId === "string" && pkg.payload.themeId) {
          const themeId = pkg.payload.themeId;
          const applied = applyThemePack(themeId, "auto");
          if (!applied) return { ok: false, message: "Ese tema ya no existe en el catálogo." };
          registerInstalled(pkg);
          return { ok: true, message: `Tema «${pkg.name}» aplicado: el OS adopta su paleta, material y fondo.` };
        }
        if (pkg.kind === "design" && typeof pkg.payload.elementKind === "string" && pkg.payload.elementKind) {
          registerInstalled(pkg);
          return { ok: true, message: `Elemento «${pkg.name}» añadido a tu Biblioteca — combínalo en el Mezclador de Diseños (Ajustes → Apariencia o Estudio).` };
        }
        const cls = asString(pkg.kind === "design" ? pkg.payload.materialClass : pkg.payload.animClass).trim();
        if (!cls) return { ok: false, message: "Este paquete no declara ninguna clase aplicable." };
        setActiveDesignClasses([...getActiveDesignClasses(), cls]);
        registerInstalled(pkg);
        return {
          ok: true,
          message: pkg.kind === "design"
            ? `Material «${pkg.name}» activado: las superficies del OS lo irán adoptando.`
            : `Animación «${pkg.name}» activada en la capa de movimiento del OS.`,
        };
      }

      /* ── Función/skill de Aurora ─────────────────────────────────── */
      case "function": {
        const skillId = asString(pkg.payload.skillId).trim();
        if (!skillId) return { ok: false, message: "Este paquete no declara ninguna skill." };
        setInstalledFunctionIds([...getInstalledFunctionIds(), skillId]);
        registerInstalled(pkg);
        // Si la skill necesita activarse en una superficie (p.ej. visión/voz en
        // Ajustes), devolvemos la ruta para que la UI ofrezca "Abrir".
        const fnRoute = asString(pkg.payload.route).trim();
        if (fnRoute) {
          return {
            ok: true,
            message: `Skill «${pkg.name}» instalada. Ábrela en Ajustes para activarla del todo.`,
            action: "route",
            href: fnRoute,
          };
        }
        return { ok: true, message: `Skill «${pkg.name}» instalada: tus cerebros ya pueden usarla.` };
      }

      /* ── Repo: añade otra fuente de paquetes ─────────────────────── */
      case "repo": {
        const url = asString(pkg.payload.url).trim();
        if (!url) return { ok: false, message: "Este paquete de repo no trae URL todavía." };
        const res = await addRepoByUrl(url);
        if (res.ok) registerInstalled(pkg);
        return res;
      }

      /* ── Superficies del OS: abrir la ruta real ──────────────────── */
      default: {
        const route = asString(pkg.payload.route).trim();
        if (route) {
          registerInstalled(pkg);
          return { ok: true, message: `«${pkg.name}» instalado en tu sistema.`, action: "route", href: route };
        }
        const template = asString(pkg.payload.template).trim();
        if (template) {
          registerInstalled(pkg);
          return { ok: true, message: `Plantilla «${pkg.name}» instalada en tu colección.` };
        }
        return { ok: false, message: "Este paquete no declara ruta ni plantilla instalable." };
      }
    }
  } catch (e) {
    return { ok: false, message: `No pude instalar: ${e instanceof Error ? e.message : "error desconocido"}.` };
  }
}

/**
 * Desinstala revirtiendo lo reversible: re-deshabilita fuentes de IA, quita
 * clases de diseño/animación y skills. Las rutas solo se desregistran (la
 * superficie del OS sigue existiendo, claro). Nunca lanza.
 */
export async function uninstall(id: string): Promise<InstallResult> {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador." };
  const entry = getInstalledMap()[id];
  if (!entry) return { ok: false, message: "Ese paquete no está instalado." };
  const pkg = findPackage(id); // puede faltar si su repo externo fue quitado

  try {
    if (pkg) {
      switch (pkg.kind) {
        case "ai-source": {
          const sourceId = asString(pkg.payload.catalogSourceId).trim();
          if (sourceId) {
            const router = await import("@/ai/astraura/router");
            const prefs = router.getIntelligenceSettings();
            if (!prefs.disabledSources.includes(sourceId)) {
              router.saveIntelligenceSettings({ disabledSources: [...prefs.disabledSources, sourceId] });
            }
          }
          break;
        }
        case "design":
        case "animation": {
          const cls = asString(pkg.kind === "design" ? pkg.payload.materialClass : pkg.payload.animClass).trim();
          if (cls) setActiveDesignClasses(getActiveDesignClasses().filter((c) => c !== cls));
          break;
        }
        case "function": {
          const skillId = asString(pkg.payload.skillId).trim();
          if (skillId) setInstalledFunctionIds(getInstalledFunctionIds().filter((s) => s !== skillId));
          break;
        }
        default:
          break; // rutas/plantillas: solo desregistro
      }
    }
    // Enlaces guardados (research/project/externos): se quitan al desinstalar.
    removeLinkEntry(id);
    unregisterInstalled(id);
    return { ok: true, message: pkg ? `«${pkg.name}» desinstalado.` : "Paquete desinstalado." };
  } catch (e) {
    return { ok: false, message: `No pude desinstalar: ${e instanceof Error ? e.message : "error desconocido"}.` };
  }
}

/* ═══════════════════ ACCIONES estilo Cydia (mejorado) ═══════════════════ */
// Además de Instalar/Desinstalar/Abrir, la Biblioteca ofrece por paquete:
//   · Guardar enlace  → saveLink(pkg)          (registra sin ejecutar efecto)
//   · Descargar       → downloadPackage(pkg)   (abre URL o baja .json del payload)
//   · Replicar        → replicatePackage(pkg)  (copia editable en repo local)
//   · Publicar rama   → publishBranch(localId) (marca la copia como pública)

/** Entrada de un enlace guardado en la biblioteca. */
export interface SavedLink {
  id: string;
  name: string;
  kind: PackageKind;
  href: string;
  savedAt: number;
}

function readLinks(): SavedLink[] {
  const raw = readJson<unknown>(LINKS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is SavedLink =>
    !!l && typeof l === "object" && typeof (l as SavedLink).id === "string" && typeof (l as SavedLink).href === "string");
}

/** Enlaces guardados (para paneles «Mi colección»). */
export function getSavedLinks(): SavedLink[] {
  return readLinks();
}

/** Guarda/actualiza un enlace en la biblioteca (uso interno de install()). */
function saveLinkEntry(pkg: LibraryPackage, href: string): void {
  const links = readLinks().filter((l) => l.id !== pkg.id);
  links.push({ id: pkg.id, name: pkg.name, kind: pkg.kind, href, savedAt: Date.now() });
  writeJson(LINKS_KEY, links);
  emitLibraryEvent();
}

function removeLinkEntry(id: string): void {
  const links = readLinks();
  const next = links.filter((l) => l.id !== id);
  if (next.length === links.length) return;
  writeJson(LINKS_KEY, next);
  emitLibraryEvent();
}

/**
 * «Guardar enlace en biblioteca»: registra el paquete como enlace SIN ejecutar
 * su efecto. Usa `payload.externalUrl`/`url` si existe; si no, una referencia
 * interna estable. No instala (no toca el registro de instalados).
 */
export function saveLink(pkg: LibraryPackage): InstallResult {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador." };
  if (!pkg || !pkg.id) return { ok: false, message: "Paquete inválido." };
  const href =
    asString(pkg.payload.externalUrl).trim() ||
    asString(pkg.payload.url).trim() ||
    asString(pkg.payload.route).trim() ||
    `starseed://library/${pkg.id}`;
  saveLinkEntry(pkg, href);
  return { ok: true, message: `Enlace de «${pkg.name}» guardado en tu biblioteca (sin ejecutar su efecto).` };
}

/**
 * «Descargar»: si el paquete tiene URL externa/recurso, la abre en pestaña
 * nueva (action:"external"). Para diseños/animaciones/temas locales (sin URL),
 * genera y descarga un .json del paquete vía Blob para poder compartirlo o
 * reimportarlo en un repo. Devuelve la acción para que la UI la ejecute.
 */
export function downloadPackage(pkg: LibraryPackage): InstallResult {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador." };
  if (!pkg || !pkg.id) return { ok: false, message: "Paquete inválido." };
  const href = asString(pkg.payload.externalUrl).trim() || asString(pkg.payload.url).trim();
  if (href) {
    return { ok: true, message: `Abriendo la descarga de «${pkg.name}»…`, action: "external", href };
  }
  // Sin URL externa: descargamos el paquete como JSON (tema/diseño/animación…).
  try {
    const json = JSON.stringify({ ...pkg, sourceRepoId: undefined }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pkg.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, message: `Descargado «${pkg.id}.json» (puedes reimportarlo o publicarlo en un repo).` };
  } catch (e) {
    return { ok: false, message: `No pude descargar: ${e instanceof Error ? e.message : "error"}.` };
  }
}

/**
 * «Replicar»: crea una COPIA EDITABLE del paquete en el repo local del usuario
 * (`starseed.library.mine.v1`) con un id nuevo y `forkedFrom` apuntando al
 * original. La copia aparece como paquete propio en la Biblioteca y puede
 * editarse/publicarse. `overrides` permite cambiar nombre/descr/payload al vuelo.
 */
export function replicatePackage(
  pkg: LibraryPackage,
  overrides?: Partial<LibraryPackage>,
): InstallResult & { localId?: string } {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador." };
  if (!pkg || !pkg.id) return { ok: false, message: "Paquete inválido." };
  const suffix = Math.random().toString(36).slice(2, 7);
  const localId = `mine-${pkg.id}-${suffix}`;
  const copy: LibraryPackage = {
    ...pkg,
    ...overrides,
    id: localId,
    name: overrides?.name ?? `${pkg.name} (copia)`,
    author: overrides?.author ?? "Tú",
    sourceRepoId: MINE_REPO_ID,
    forkedFrom: pkg.id,
    visibility: "private",
    featured: false,
    comingSoon: false,
    payload: { ...pkg.payload, ...(overrides?.payload ?? {}) },
  };
  const mine = readMinePackages().filter((p) => p.id !== localId);
  writeMinePackages([...mine, copy]);
  return { ok: true, message: `«${pkg.name}» replicado como copia editable en tu biblioteca.`, localId };
}

/**
 * «Publicar como rama»: marca una réplica local como pública y la registra en
 * `starseed.library.published.v1` (con visibilidad public). HONESTO: es una
 * preparación LOCAL — la publicación real a la red StarSeed (para que otras
 * cuentas la instalen) es un paso futuro vía Supabase; aquí dejamos la rama
 * lista y firmada con tu autoría para ese momento.
 */
export function publishBranch(localId: string): InstallResult {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador." };
  const mine = readMinePackages();
  const idx = mine.findIndex((p) => p.id === localId);
  if (idx < 0) return { ok: false, message: "Esa copia no existe en tu biblioteca. Replícala primero." };
  mine[idx] = { ...mine[idx], visibility: "public" };
  writeMinePackages(mine);
  // Registro de publicadas (dedupe por id).
  const published = readJson<unknown>(PUBLISHED_KEY);
  const arr = Array.isArray(published) ? published.filter((p): p is LibraryPackage => !!p && typeof p === "object") : [];
  const next = arr.filter((p) => p.id !== localId);
  next.push({ ...mine[idx], visibility: "public" });
  writeJson(PUBLISHED_KEY, next);
  emitLibraryEvent();
  return {
    ok: true,
    message: "Rama marcada como pública y lista localmente. La publicación real a la red (Supabase) llegará pronto.",
  };
}

/** Ramas marcadas como públicas (local; preparadas para publicar a la red). */
export function getPublishedBranches(): LibraryPackage[] {
  const raw = readJson<unknown>(PUBLISHED_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is LibraryPackage => !!p && typeof p === "object" && typeof (p as LibraryPackage).id === "string");
}
