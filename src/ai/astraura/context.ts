"use client";

/*
 * Astraura · Capa de "conocimiento de contexto" de Aurora
 * -------------------------------------------------------
 * Hace que Aurora SEPA en qué sistema del ecosistema StarSeed vive (aquí:
 * StarSeed OS / SOSD), qué OTROS sistemas existen (Nexus · Café), cuáles son
 * las secciones/rutas del propio OS —QUÉ SE PUEDE HACER en cada una—, los
 * fundamentos StarSeed (Tríada + invariantes) y los ENLACES DIRECTOS correctos
 * a cada área. Adenda 2026-07-06 (P·comprensión): mapa vivo ampliado con
 * acciones por área, capacidad de actuar como agente (páginas/grupos/
 * comunidades/archivos/publicaciones/comentarios/mensajes), capacidades/skills
 * instaladas y agentes disponibles — expuesto vía `describeArea()`/`systemMap()`.
 *
 * Se compone de piezas puras y defensivas (el router/cerebro las cablea; este
 * módulo NO llama al modelo ni muta nada):
 *   1) systemContextPrompt()  → bloque compacto para el system prompt del
 *      cerebro. Derivado EXCLUSIVAMENTE de CLAUDE.md (§2 rutas, §3 Tríada, §4
 *      ecosistemas, §6 invariantes, §7 Trinity) + el mapa vivo de abajo.
 *   2) directLinkFor(intent)  → mapea intención/palabra clave (es/en) a una ruta
 *      del OS ("/library", "/network/politics", "/settings", "/escritorios", …).
 *   3) screenContext()        → best-effort SOLO en cliente: pathname actual +
 *      nombre de sección más cercana + hasta ~5 títulos H1/H2 visibles.
 *   4) describeArea(route)    → ficha completa de un área: label, qué se puede
 *      hacer ahí, y si Aurora puede actuar como agente en ese tipo de lugar.
 *   5) systemMap()            → mapa vivo completo: TODAS las áreas +
 *      capacidades activas (skills.ts) + agentes disponibles (lib/agents),
 *      todo por import dinámico defensivo (nunca acopla en compilación ni lanza).
 *
 * HONESTIDAD (se refleja en el texto del prompt): aquí Aurora NO tiene acceso a
 * internet en tiempo real por sí misma (salvo capacidad web-access instalada);
 * describe la ESTRUCTURA del sistema, qué se puede hacer en cada área, y puede
 * señalar el enlace directo correcto. La lectura de pantalla es una
 * aproximación del DOM presente, no una visión continua.
 *
 * Todo SSR-safe: sin `window`/`document` devuelve valores por defecto y nunca
 * lanza. Contrato compartido OS · Nexus · Café (misma idea que astraura-core.js).
 */

/* ─────────────────────────── Secciones del OS ─────────────────────────── */
/** Ruta → ficha completa. Derivado de CLAUDE.md §2/§4 + rutas reales del repo. */
interface OsSection {
  path: string;
  label: string;
  keywords: string[];
  /** Qué se puede HACER en esta área (frases cortas, imperativo, es-ES). */
  actions: string[];
  /**
   * ¿Puede Aurora actuar aquí como AGENTE (crear/editar/comentar/publicar/
   * enviar en nombre del usuario, dentro de páginas/grupos/comunidades/
   * archivos/publicaciones/comentarios/mensajes)? Informativo para el prompt;
   * la ejecución real siempre pasa por las acciones/herramientas del motor.
   */
  agentCapable: boolean;
}

/** Secciones del StarSeed OS (rutas reales de CLAUDE.md §2 + Ajustes/Escritorios). */
export const OS_SECTIONS: OsSection[] = [
  {
    path: "/dashboard", label: "Dashboard (widgets arrastrables)",
    keywords: ["dashboard", "panel", "inicio", "widgets", "home"],
    actions: ["añadir/quitar/reordenar widgets", "crear tableros", "ver resumen de actividad"],
    agentCapable: true,
  },
  {
    path: "/network", label: "Red (feed holográfico)",
    keywords: ["red", "network", "feed", "muro", "social"],
    actions: ["ver el feed social", "publicar", "comentar", "reaccionar", "seguir perfiles/páginas"],
    agentCapable: true,
  },
  {
    path: "/network/politics", label: "Gobernanza · Política (democracia directa)",
    keywords: ["gobernanza", "politica", "política", "politics", "voto", "votacion", "votación", "vote", "governance", "ontocracia", "asamblea"],
    actions: ["votar propuestas", "delegar voto (líquido y revocable)", "debatir en asambleas", "proponer iniciativas"],
    agentCapable: true,
  },
  {
    path: "/network/culture", label: "Cultura (expresión artística, Multiverso)",
    keywords: ["cultura", "culture", "arte", "art", "multiverso", "eventos", "events"],
    actions: ["publicar obras/eventos", "explorar el Multiverso", "coordinar eventos físicos"],
    agentCapable: true,
  },
  {
    path: "/network/education", label: "Educación (aprendizaje inmersivo)",
    keywords: ["educacion", "educación", "education", "aprender", "learn", "curso", "mentoria", "mentoría"],
    actions: ["explorar cursos", "pedir mentoría híbrida (humana + IA)", "seguir rutas de aprendizaje"],
    agentCapable: true,
  },
  {
    path: "/hub", label: "Hub (comunidades)",
    keywords: ["hub", "comunidad", "comunidades", "community", "communities", "sangha", "sanghas"],
    actions: ["crear/unirse a comunidades (Sanghas)", "gestionar grupos", "coordinar miembros"],
    agentCapable: true,
  },
  {
    path: "/agent", label: "Agentes de IA (Exocórtex · Cerebros)",
    keywords: ["agente", "agentes", "agent", "agents", "ia", "ai", "exocortex", "exocórtex", "aurora", "cerebro", "cerebros"],
    actions: ["chatear con Aurora/Astraura", "crear/configurar agentes (persona + capacidades)", "atar agentes a páginas/grupos", "gestionar cerebros y servidores"],
    agentCapable: true,
  },
  {
    path: "/library", label: "Biblioteca (universal · Cydia de skills)",
    keywords: ["biblioteca", "library", "libros", "books", "skills", "cydia", "paquetes", "packages", "hugging bay", "huggingbay", "modelos", "descubrir modelos"],
    actions: ["buscar/leer documentos", "instalar skills/paquetes", "descubrir modelos reales (Hugging Bay)", "guardar en memorias", "publicar como rama"],
    agentCapable: true,
  },
  {
    path: "/explorer", label: "Explorer (explorar el sistema)",
    keywords: ["explorer", "explorar", "explore", "buscar", "descubrir", "discover"],
    actions: ["buscar en todo el sistema", "descubrir páginas/perfiles/comunidades"],
    agentCapable: false,
  },
  {
    path: "/publish", label: "Publicar (Lienzo Universal · crear contenido)",
    keywords: ["publicar", "publish", "crear", "create", "lienzo", "canvas", "post", "publicacion", "publicación"],
    actions: ["crear publicaciones", "compartir contenido (se referencia, no se duplica)", "elegir perfil/página de publicación"],
    agentCapable: true,
  },
  {
    path: "/escritorios", label: "Escritorios (página principal del OS · Aurora vive aquí)",
    keywords: ["escritorio", "escritorios", "desktop", "desktops", "workspace", "escritorio virtual"],
    actions: ["organizar escritorios/ventanas", "abrir pizarras y apps", "guardar disposiciones"],
    agentCapable: true,
  },
  {
    path: "/trinity", label: "Trinity Lab (paradigma de interfaz)",
    keywords: ["trinity", "trinidad", "zenith", "horizon", "logic", "anchor", "interfaz", "ui"],
    actions: ["explorar el paradigma Trinity (Zenith/Horizon/Logic/Anchor)", "ver variaciones de diseño"],
    agentCapable: false,
  },
  {
    path: "/settings", label: "Ajustes (incl. Inteligencia de Aurora)",
    keywords: ["ajustes", "settings", "configuracion", "configuración", "config", "preferencias", "inteligencia", "intelligence", "modelos", "models", "ia de aurora"],
    actions: ["configurar Inteligencia de Aurora (auto/manual, fuentes)", "gestionar apariencia/perfil/seguridad", "conectar proveedores de IA propios"],
    agentCapable: false,
  },
  {
    path: "/aurora", label: "Aurora (Estudio de voz, Ego, Imagine)",
    keywords: ["aurora", "voz", "voice", "ego", "imagine", "estudio", "personalidad", "personality"],
    actions: ["configurar voz/personalidad de Aurora", "crear/compartir un Ego (ego.md)", "gestionar conexiones de chat", "usar Imagine (imagine.md)"],
    agentCapable: false,
  },
  {
    path: "/sincronizacion", label: "Sincronización de archivos (Syncthing P2P)",
    keywords: ["sincronizacion", "sincronización", "sync", "syncthing", "archivos"],
    actions: ["sincronizar archivos entre dispositivos (P2P, cifrado)"],
    agentCapable: false,
  },
  {
    path: "/servidores", label: "Servidores de cerebros (registro N:N)",
    keywords: ["servidores", "servers", "cerebro local", "vps", "hostinger", "runtime"],
    actions: ["registrar servidores (local/VPS/Hostinger/servicio conectado)", "enlazar servidores↔cerebros", "sincronizar/probar conexión"],
    agentCapable: false,
  },
  {
    path: "/login", label: "Acceso / Cuenta soberana",
    keywords: ["login", "acceso", "entrar", "cuenta", "account", "sesion", "sesión", "registro", "signin"],
    actions: ["iniciar sesión", "crear cuenta soberana"],
    agentCapable: false,
  },
];

/* ───────────────────── Enlaces directos por intención ───────────────────── */

/** Normaliza texto (minúsculas, sin acentos) para comparar palabras clave. */
function norm(s: string): string {
  try {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  } catch {
    return String(s || "").toLowerCase().trim();
  }
}

/**
 * Devuelve la ruta del OS que mejor corresponde a la intención/palabra clave
 * (es/en), o `null` si ninguna encaja. Puro y defensivo: nunca lanza.
 * Ej.: "biblioteca"|"library" → "/library"; "gobernanza"|"política" →
 * "/network/politics"; "ajustes de ia"|"inteligencia" → "/settings";
 * "escritorio" → "/escritorios".
 */
export function directLinkFor(intent: string): string | null {
  const q = norm(intent);
  if (!q) return null;

  // 1) Coincidencia exacta con una ruta ya escrita (p.ej. "/library").
  const exact = OS_SECTIONS.find((s) => q === s.path || q === s.path.slice(1));
  if (exact) return exact.path;

  // 2) Coincidencia por palabra clave normalizada (subcadena en cualquier sentido).
  //    Recorremos en el orden declarado (rutas más específicas primero para las
  //    de /network/*, que están antes de /network en el arreglo salvo /network).
  const scored: { path: string; score: number }[] = [];
  for (const s of OS_SECTIONS) {
    let best = 0;
    for (const k of s.keywords) {
      const nk = norm(k);
      if (!nk) continue;
      if (q === nk) best = Math.max(best, 3); // palabra clave idéntica
      else if (q.includes(nk)) best = Math.max(best, 2); // la intención contiene la clave
      else if (nk.includes(q) && q.length >= 3) best = Math.max(best, 1); // la clave contiene la intención
    }
    if (best > 0) scored.push({ path: s.path, score: best });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].path;
}

/* ─────────────────────────── Ficha de área (describeArea) ─────────────────────────── */

/** Ficha completa de un área del OS, lista para mostrar o inyectar en el prompt. */
export interface AreaDescription {
  path: string;
  label: string;
  /** Qué se puede hacer ahí (frases cortas, es-ES). */
  actions: string[];
  /** ¿Aurora puede actuar como agente en este tipo de lugar? */
  agentCapable: boolean;
  /** Frase lista para hablar/mostrar: label + acciones + capacidad de agente. */
  summary: string;
}

/** Busca la sección por ruta exacta o por el prefijo más largo que encaje. */
function findSectionForRoute(route: string): OsSection | null {
  const p = norm(route);
  if (!p) return null;
  const exact = OS_SECTIONS.find((s) => norm(s.path) === p);
  if (exact) return exact;
  let best: OsSection | null = null;
  let bestLen = -1;
  for (const s of OS_SECTIONS) {
    const sp = norm(s.path);
    if (sp !== "/" && (p === sp || p.startsWith(`${sp}/`)) && sp.length > bestLen) {
      best = s;
      bestLen = sp.length;
    }
  }
  return best;
}

/**
 * Describe un área del OS por su ruta (exacta o por prefijo, p.ej.
 * "/network/politics/proposal/42" encaja con "/network/politics"). Devuelve
 * `null` si la ruta no corresponde a ninguna sección conocida. Puro y
 * defensivo: nunca lanza. Úsalo para que Aurora explique "qué puedo hacer aquí".
 */
export function describeArea(route: string): AreaDescription | null {
  const section = findSectionForRoute(route);
  if (!section) return null;
  const label = section.label.split(" (")[0];
  const agentNote = section.agentCapable
    ? "Aurora puede actuar aquí como agente (crear, editar, comentar, publicar o enviar en tu nombre, con tu confirmación)."
    : "Esta área es sobre todo de configuración/consulta; Aurora te guía pero no suele actuar aquí en tu nombre.";
  const summary = `${label} (${section.path}) — puedes: ${section.actions.join("; ")}. ${agentNote}`;
  return { path: section.path, label, actions: section.actions, agentCapable: section.agentCapable, summary };
}

/* ─────────────────────────── System prompt ─────────────────────────── */

/**
 * Bloque COMPACTO que describe el sistema para el cerebro de Aurora. Derivado
 * de CLAUDE.md + el mapa vivo de OS_SECTIONS (qué se puede hacer en cada área).
 * Honesto sobre límites (sin internet en tiempo real por defecto ni control de
 * pantalla aquí; describe estructura, capacidades y enlaces directos).
 */
export function systemContextPrompt(): string {
  const rutas = OS_SECTIONS
    .map((s) => `${s.label.split(" (")[0]} ${s.path} [${s.actions.slice(0, 3).join(" · ")}]${s.agentCapable ? " (agente)" : ""}`)
    .join("; ");
  return [
    "CONTEXTO DEL SISTEMA (Aurora). Estás dentro de StarSeed OS (SOSD · Sistema Operativo Social Descentralizado), desplegado en starseed-os.vercel.app.",
    "Ecosistema StarSeed = 3 sistemas hermanos que comparten cuenta soberana: (1) StarSeed OS — este; la red social, gobernanza y sistema operativo; (2) StarSeed Nexus — el portal de marca (starseed-nexus.vercel.app); (3) StarSeed Café — menú bio-funcional, Alquimista y economía de Granos & Semillas.",
    `Secciones del OS, sus rutas y qué se puede hacer en cada una (agente) = Aurora puede actuar ahí en tu nombre: ${rutas}.`,
    "Fundamentos StarSeed. Tríada Ideológica (cláusulas pétreas): Ontocracia (soberanía directa, una persona-una voz, voto delegado líquido), Ciberdelia (tecnología para expandir la conciencia, nunca para vigilar; tu IA = Exocórtex, leal al usuario) y Transhumanismo Comunista (post-escasez, abundancia común). Invariantes: identidad soberana (el usuario posee sus datos), código abierto absoluto, singularidad del contenido (Lienzo Universal: se referencia, no se duplica), dualidad Cuenta (privada, ancla legal) / Perfiles (públicos), justicia restaurativa. Interfaz Trinity: Zenith (guía IA), Horizon (creación), Logic (control), Anchor (dock raíz).",
    "COMO AGENTE: en las áreas marcadas (agente) puedes actuar dentro de páginas, grupos, comunidades, archivos, publicaciones, comentarios y mensajes — crear, editar, comentar, publicar o enviar EN NOMBRE del usuario cuando te lo pida, usando las acciones/herramientas disponibles del motor. Pide confirmación antes de acciones irreversibles o públicas.",
    "LÍMITES (sé honesta): sin una capacidad de acceso web instalada no navegas por internet en tiempo real; conoces la ESTRUCTURA del sistema, qué se puede hacer en cada área y puedes indicar el ENLACE DIRECTO correcto (usa la ruta exacta). Si el usuario quiere ir a una sección, dale su ruta.",
  ].join("\n");
}

/* ─────────────────────────── Lectura de pantalla ─────────────────────────── */

export interface ScreenContext {
  /** location.pathname actual ("" si no hay window). */
  path: string;
  /** Nombre de la sección del OS más cercana al pathname (o "" si desconocida). */
  section: string;
  /** Hasta ~5 textos de H1/H2 visibles en el DOM (vacío si no hay document). */
  headings: string[];
}

/** ¿Estamos en cliente con DOM disponible? */
function hasDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Sección del OS que corresponde a un pathname (match por prefijo más largo). */
function sectionForPath(path: string): string {
  const p = norm(path);
  let bestLabel = "";
  let bestLen = -1;
  for (const s of OS_SECTIONS) {
    const sp = norm(s.path);
    // Coincidencia por prefijo de ruta; nos quedamos con la más específica.
    if (p === sp || p.startsWith(sp + "/") || (sp !== "/" && p.startsWith(sp))) {
      if (sp.length > bestLen) {
        bestLen = sp.length;
        bestLabel = s.label.split(" (")[0];
      }
    }
  }
  return bestLabel;
}

/**
 * Contexto de pantalla best-effort (SOLO cliente). Devuelve pathname actual, la
 * sección del OS más cercana y hasta ~5 títulos H1/H2 visibles. Defensivo: sin
 * DOM devuelve `{ path:"", section:"", headings:[] }` y nunca lanza.
 */
export function screenContext(): ScreenContext {
  if (!hasDom()) return { path: "", section: "", headings: [] };
  let path = "";
  try {
    path = window.location?.pathname || "";
  } catch {
    path = "";
  }

  const headings: string[] = [];
  try {
    const nodes = document.querySelectorAll("h1, h2");
    for (let i = 0; i < nodes.length && headings.length < 5; i++) {
      const el = nodes[i] as HTMLElement;
      // Salta lo oculto (best-effort; offsetParent es null si display:none).
      const hidden = el.offsetParent === null && norm(getComputedStyle?.(el)?.position || "") !== "fixed";
      if (hidden) continue;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text && text.length <= 160 && !headings.includes(text)) headings.push(text);
    }
  } catch {
    /* noop */
  }

  let section = "";
  try {
    // Preferimos el pathname; si no dio nada, intentamos un <main data-section>
    // o el primer heading como pista débil.
    section = sectionForPath(path);
    if (!section) {
      const marked = document.querySelector("[data-section]") as HTMLElement | null;
      const ds = marked?.getAttribute("data-section") || "";
      if (ds) section = ds.trim();
    }
  } catch {
    section = "";
  }

  return { path, section, headings };
}

/**
 * Azúcar opcional: bloque de una línea con el contexto de pantalla actual, listo
 * para anexar al system prompt cuando el cerebro quiera situar a Aurora "aquí y
 * ahora". Devuelve "" si no hay nada útil. El parent decide si lo usa.
 */
export function screenContextLine(): string {
  const s = screenContext();
  if (!s.path && !s.section && !s.headings.length) return "";
  const parts: string[] = [];
  if (s.section) parts.push(`sección: ${s.section}`);
  if (s.path) parts.push(`ruta: ${s.path}`);
  if (s.headings.length) parts.push(`en pantalla: ${s.headings.join(" · ")}`);
  return `Contexto de pantalla actual (aproximado) — ${parts.join("; ")}.`;
}

/* ────────────────── Cerebros de contexto de la Biblioteca activa ────────────────── */

/**
 * Si la ruta dada (o `screenContext().path` si se omite) corresponde a la
 * sección Biblioteca (`/library`), devuelve una línea en es-ES con los
 * NOMBRES de los cerebros de contexto (`src/lib/brains/brains.ts`) que
 * `getLibraryBrains()` resuelve para el perfil activo (`activeProfileId()`).
 * Fuera de `/library`, o si algo falla, devuelve "" (nunca lanza). Importa
 * dinámicamente `@/lib/profiles/profiles` y `@/lib/library/library-brains`
 * siguiendo el mismo patrón defensivo que los imports de `systemMap()`.
 */
export async function libraryBrainsContextLine(route?: string): Promise<string> {
  try {
    const path = route ?? screenContext().path;
    const section = findSectionForRoute(path);
    if (!section || section.path !== "/library") return "";

    let profileId: string | null = null;
    try {
      const profilesMod = await import("@/lib/profiles/profiles");
      profileId = profilesMod.activeProfileId();
    } catch {
      profileId = null;
    }

    const libraryBrainsMod = await import("@/lib/library/library-brains");
    const brains = await libraryBrainsMod.getLibraryBrains(profileId);
    const names = brains.map((b) => b.name).filter(Boolean);

    const lista = names.length ? names.join(", ") : "sin cerebros de contexto configurados";
    return `Cerebros de contexto de esta biblioteca: ${lista}.`;
  } catch {
    return "";
  }
}

/* ─────────────────────────── Mapa vivo del sistema (systemMap) ─────────────────────────── */

/** Agente disponible (ficha mínima, derivada de `lib/agents/store.ts`). */
export interface AvailableAgent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
}

/** Capacidad/skill activa (ficha mínima, derivada de `astraura/skills.ts`). */
export interface ActiveCapabilitySummary {
  id: string;
  label: string;
}

/** Mapa vivo completo del sistema: áreas + capacidades activas + agentes. */
export interface SystemMap {
  /** Todas las áreas del OS con sus acciones y capacidad de agente. */
  areas: AreaDescription[];
  /** Capacidades/skills activas de Aurora ahora mismo (Biblioteca). */
  capabilities: ActiveCapabilitySummary[];
  /** Agentes disponibles (builtin + personales) para atar a superficies. */
  agents: AvailableAgent[];
  /** Bloque de texto listo para inyectar en un prompt (resumen legible). */
  prompt: string;
}

/**
 * Construye el MAPA VIVO completo del sistema: todas las áreas (con qué se
 * puede hacer en cada una), las capacidades/skills activas de Aurora ahora
 * mismo, y los agentes disponibles para atar a páginas/grupos/comunidades.
 * Combina `OS_SECTIONS` (estático) con `skills.ts` y `lib/agents/store.ts`
 * (dinámico y defensivo: sin cliente o si algo falla, esas listas quedan
 * vacías pero `areas`/`prompt` siempre se devuelven). Nunca lanza.
 *
 * `route` (OPCIONAL, retrocompatible): ruta activa para resolver contexto
 * situacional adicional (p.ej. cerebros de contexto si `route` es `/library`).
 * Si se omite, se usa `screenContext().path` (best-effort, SOLO cliente).
 *
 * Uso típico: `const map = await systemMap(); brainMessages.unshift({role:
 * "system", content: map.prompt})`. También sirve para paneles/depuración.
 */
export async function systemMap(route?: string): Promise<SystemMap> {
  const areas = OS_SECTIONS.map((s) => describeArea(s.path)).filter((a): a is AreaDescription => !!a);

  let capabilities: ActiveCapabilitySummary[] = [];
  try {
    const mod = await import("./skills");
    capabilities = mod.activeCapabilities().map((c) => ({ id: c.id, label: c.label }));
  } catch {
    capabilities = [];
  }

  let agents: AvailableAgent[] = [];
  try {
    const mod = await import("@/lib/agents/store");
    agents = mod.listAgents().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
    }));
  } catch {
    agents = [];
  }

  let libraryBrainsLine = "";
  try {
    libraryBrainsLine = await libraryBrainsContextLine(route);
  } catch {
    libraryBrainsLine = "";
  }

  const areasLine = areas
    .map((a) => `${a.label} (${a.path})${a.agentCapable ? " [agente]" : ""}: ${a.actions.slice(0, 3).join(" · ")}`)
    .join("\n");
  const capsLine = capabilities.length ? capabilities.map((c) => c.label).join(", ") : "ninguna instalada";
  const agentsLine = agents.length
    ? agents.map((a) => `${a.name} (${a.capabilities.join(",") || "sin capacidades"})`).join("; ")
    : "ninguno creado todavía";

  const prompt = [
    "MAPA VIVO DEL SISTEMA (Aurora).",
    `Áreas y qué se puede hacer en cada una:\n${areasLine}`,
    `Capacidades/skills activas de Aurora ahora mismo: ${capsLine}.`,
    `Agentes disponibles (persona + capacidades, atables a páginas/grupos/comunidades): ${agentsLine}.`,
    ...(libraryBrainsLine ? [libraryBrainsLine] : []),
  ].join("\n\n");

  return { areas, capabilities, agents, prompt };
}
