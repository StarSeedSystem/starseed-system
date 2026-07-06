"use client";

/*
 * Astraura · Capa de "conocimiento de contexto" de Aurora
 * -------------------------------------------------------
 * Hace que Aurora SEPA en qué sistema del ecosistema StarSeed vive (aquí:
 * StarSeed OS / SOSD), qué OTROS sistemas existen (Nexus · Café), cuáles son
 * las secciones/rutas del propio OS, los fundamentos StarSeed (Tríada +
 * invariantes) y los ENLACES DIRECTOS correctos a cada área.
 *
 * Se compone de tres piezas puras y defensivas (el router/cerebro las cablea;
 * este módulo NO llama al modelo ni muta nada):
 *   1) systemContextPrompt()  → bloque compacto (~150-250 palabras) para el
 *      system prompt del cerebro. Derivado EXCLUSIVAMENTE de CLAUDE.md (§2 rutas,
 *      §3 Tríada, §4 ecosistemas, §6 invariantes, §7 Trinity). No inventa rutas.
 *   2) directLinkFor(intent)  → mapea intención/palabra clave (es/en) a una ruta
 *      del OS ("/library", "/network/politics", "/settings", "/escritorios", …).
 *   3) screenContext()        → best-effort SOLO en cliente: pathname actual +
 *      nombre de sección más cercana + hasta ~5 títulos H1/H2 visibles.
 *
 * HONESTIDAD (se refleja en el texto del prompt): aquí Aurora NO tiene acceso a
 * internet en tiempo real ni actúa sobre la pantalla; describe la ESTRUCTURA del
 * sistema y puede señalar el enlace directo correcto. La lectura de pantalla es
 * una aproximación del DOM presente, no una visión continua.
 *
 * Todo SSR-safe: sin `window`/`document` devuelve valores por defecto y nunca
 * lanza. Contrato compartido OS · Nexus · Café (misma idea que astraura-core.js).
 */

/* ─────────────────────────── Secciones del OS ─────────────────────────── */
/** Ruta → { etiqueta, palabras clave es/en }. Derivado de CLAUDE.md §2/§4. */
interface OsSection {
  path: string;
  label: string;
  keywords: string[];
}

/** Secciones del StarSeed OS (rutas reales de CLAUDE.md §2 + Ajustes/Escritorios). */
export const OS_SECTIONS: OsSection[] = [
  { path: "/dashboard", label: "Dashboard (widgets arrastrables)", keywords: ["dashboard", "panel", "inicio", "widgets", "home"] },
  { path: "/network", label: "Red (feed holográfico)", keywords: ["red", "network", "feed", "muro", "social"] },
  { path: "/network/politics", label: "Gobernanza · Política (democracia directa)", keywords: ["gobernanza", "politica", "política", "politics", "voto", "votacion", "votación", "vote", "governance", "ontocracia", "asamblea"] },
  { path: "/network/culture", label: "Cultura (expresión artística, Multiverso)", keywords: ["cultura", "culture", "arte", "art", "multiverso", "eventos", "events"] },
  { path: "/network/education", label: "Educación (aprendizaje inmersivo)", keywords: ["educacion", "educación", "education", "aprender", "learn", "curso", "mentoria", "mentoría"] },
  { path: "/hub", label: "Hub (comunidades)", keywords: ["hub", "comunidad", "comunidades", "community", "communities", "sangha", "sanghas"] },
  { path: "/agent", label: "Agentes de IA (Exocórtex)", keywords: ["agente", "agentes", "agent", "agents", "ia", "ai", "exocortex", "exocórtex", "aurora"] },
  { path: "/library", label: "Biblioteca (universal · Cydia de skills)", keywords: ["biblioteca", "library", "libros", "books", "skills", "cydia", "paquetes", "packages"] },
  { path: "/explorer", label: "Explorer (explorar el sistema)", keywords: ["explorer", "explorar", "explore", "buscar", "descubrir", "discover"] },
  { path: "/publish", label: "Publicar (Lienzo Universal · crear contenido)", keywords: ["publicar", "publish", "crear", "create", "lienzo", "canvas", "post", "publicacion", "publicación"] },
  { path: "/escritorios", label: "Escritorios (página principal del OS · Aurora vive aquí)", keywords: ["escritorio", "escritorios", "desktop", "desktops", "workspace", "escritorio virtual"] },
  { path: "/trinity", label: "Trinity Lab (paradigma de interfaz)", keywords: ["trinity", "trinidad", "zenith", "horizon", "logic", "anchor", "interfaz", "ui"] },
  { path: "/settings", label: "Ajustes (incl. Inteligencia de Aurora)", keywords: ["ajustes", "settings", "configuracion", "configuración", "config", "preferencias", "inteligencia", "intelligence", "modelos", "models", "ia de aurora"] },
  { path: "/login", label: "Acceso / Cuenta soberana", keywords: ["login", "acceso", "entrar", "cuenta", "account", "sesion", "sesión", "registro", "signin"] },
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

/* ─────────────────────────── System prompt ─────────────────────────── */

/**
 * Bloque COMPACTO (~150-250 palabras) que describe el sistema para el cerebro de
 * Aurora. Derivado de CLAUDE.md. Honesto sobre límites (sin internet en tiempo
 * real ni control de pantalla aquí; describe estructura y enlaces directos).
 */
export function systemContextPrompt(): string {
  const rutas = OS_SECTIONS.map((s) => `${s.label.split(" (")[0]} ${s.path}`).join("; ");
  return [
    "CONTEXTO DEL SISTEMA (Aurora). Estás dentro de StarSeed OS (SOSD · Sistema Operativo Social Descentralizado), desplegado en starseed-os.vercel.app.",
    "Ecosistema StarSeed = 3 sistemas hermanos que comparten cuenta soberana: (1) StarSeed OS — este; la red social, gobernanza y sistema operativo; (2) StarSeed Nexus — el portal de marca (starseed-nexus.vercel.app); (3) StarSeed Café — menú bio-funcional, Alquimista y economía de Granos & Semillas.",
    `Secciones del OS y sus rutas: ${rutas}.`,
    "Fundamentos StarSeed. Tríada Ideológica (cláusulas pétreas): Ontocracia (soberanía directa, una persona-una voz, voto delegado líquido), Ciberdelia (tecnología para expandir la conciencia, nunca para vigilar; tu IA = Exocórtex, leal al usuario) y Transhumanismo Comunista (post-escasez, abundancia común). Invariantes: identidad soberana (el usuario posee sus datos), código abierto absoluto, singularidad del contenido (Lienzo Universal: se referencia, no se duplica), dualidad Cuenta (privada, ancla legal) / Perfiles (públicos), justicia restaurativa. Interfaz Trinity: Zenith (guía IA), Horizon (creación), Logic (control), Anchor (dock raíz).",
    "LÍMITES (sé honesta): aquí no navegas por internet en tiempo real ni actúas sobre la pantalla por tu cuenta; conoces la ESTRUCTURA del sistema y puedes indicar el ENLACE DIRECTO correcto a cada área (usa la ruta exacta). Si el usuario quiere ir a una sección, dale su ruta.",
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
