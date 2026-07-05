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
  | "repo";

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
  { catalogId: "openrouter-free", icon: "Shapes" },
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
];

/** Repo builtin de Herramientas IA & Agentes (caja de herramientas de Aurora). */
export const STARSEED_IA_TOOLS_REPO: LibraryRepo = {
  id: "starseed-ia-tools",
  name: "Herramientas IA & Agentes",
  builtin: true,
  packages: IA_TOOLS_PACKAGES,
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
  const base = [STARSEED_CORE_REPO, STARSEED_LABS_REPO, STARSEED_IA_TOOLS_REPO];
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

      /* ── Diseño / animación: registro de clases + evento de diseño ── */
      case "design":
      case "animation": {
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
