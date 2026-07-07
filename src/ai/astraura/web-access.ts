"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · ACCESO A INTERNET (WEB) — auto-selección gratis/local-primero
 * ---------------------------------------------------------------------------
 * Da a Aurora la capacidad HONESTA de leer/traer páginas web usando
 * herramientas OPEN SOURCE, priorizando lo GRATIS/LOCAL/OSS y dejando lo de
 * clave (Firecrawl) como última opción. Auto-selecciona el mejor proveedor
 * DISPONIBLE por tarea/contexto (Comunismo de Abundancia · §3 CLAUDE.md;
 * Ciberdelia: tecnología para expandir la conciencia, nunca para vigilar).
 *
 * HONESTIDAD RADICAL: Aurora en el navegador NO puede scrapear la web por sí
 * sola (CORS/anti-bot). Necesita que el usuario tenga corriendo un proveedor
 * (Crawl4AI/DeepCrawl/WebHarvest/Universal Scraper en local o self-host) o una
 * clave (Firecrawl). Si no hay NINGUNO configurado, la selección devuelve null
 * y Aurora pide al usuario que pegue la URL/el contenido (sin fingir que
 * navega). Toda la lógica es pura + SSR-safe: sin `window` degrada a "sin
 * proveedor" y Aurora sigue funcionando igual.
 *
 * Herramientas (URLs reales verificadas):
 *   · Crawl4AI       — https://github.com/unclecode/crawl4ai   (Python, LOCAL, OSS)
 *   · DeepCrawl      — https://github.com/lumpinif/deepcrawl   (edge OSS: markdown + árbol de enlaces)
 *   · WebHarvest     — scraper OSS self-host (formatos agent-friendly, sortea anti-bot)
 *   · Universal Scraper — Python ligero (Cloudscraper + Selenium), export JSON/CSV (LOCAL, OSS)
 *   · Scrapling      — https://github.com/D4Vinci/Scrapling    (selectores auto-reparables + stealth, LOCAL, OSS)
 *   · Maxun          — https://github.com/getmaxun/maxun       (robots no-code, self-host, OSS)
 *   · Firecrawl      — https://www.firecrawl.dev               (SOLO con clave; nunca por defecto)
 *
 * Persistencia (localStorage, soberana; SSR-safe y defensiva):
 *   · `starseed.astraura.webaccess.v1` → { [providerId]: { endpoint?, key? } }
 *     Los OSS/locales se activan pegando su `endpoint` (URL del servicio); el
 *     de clave (Firecrawl) se activa pegando su `key`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Clase de proveedor de acceso web (transparencia sobre dónde corre). */
export type WebAccessKind = "local" | "oss-selfhost" | "keyed";

/** Un proveedor de acceso a internet que Aurora puede usar. */
export interface WebAccessProvider {
  /** Id estable (starseed.astraura.webaccess). */
  id: string;
  /** Etiqueta legible para el cerebro y los ajustes. */
  label: string;
  /** Dónde corre: local (tu equipo), self-host OSS, o de clave (nube). */
  kind: WebAccessKind;
  /** Repositorio OSS de referencia (si aplica). */
  repo?: string;
  /** URL base/servicio por defecto (si aplica). */
  baseUrl?: string;
  /** Gratis-primero: true en los OSS/locales; false en el de clave. */
  free: boolean;
  /** Para qué destaca (guía la auto-selección por tarea). */
  strengths: string[];
}

/* ───────────────────────── Catálogo de proveedores ───────────────────────── */
/**
 * Orden = preferencia por defecto (gratis/local/OSS primero, clave al final).
 * `selectWebAccessProvider` respeta este orden entre los DISPONIBLES.
 */
export const WEB_ACCESS_PROVIDERS: WebAccessProvider[] = [
  {
    id: "crawl4ai",
    label: "Crawl4AI (local)",
    kind: "local",
    repo: "https://github.com/unclecode/crawl4ai",
    free: true,
    strengths: ["markdown", "llm", "scraping", "articulo", "general", "local"],
  },
  {
    id: "deepcrawl",
    label: "DeepCrawl (OSS · edge)",
    kind: "oss-selfhost",
    repo: "https://github.com/lumpinif/deepcrawl",
    free: true,
    strengths: ["markdown", "enlaces", "mapa", "crawl", "sitio", "edge"],
  },
  {
    id: "webharvest",
    label: "WebHarvest (OSS · self-host)",
    kind: "oss-selfhost",
    free: true,
    strengths: ["anti-bot", "dinamico", "agentes", "scraping", "protegido"],
  },
  {
    id: "universal-scraper",
    label: "Universal Scraper (local)",
    kind: "local",
    free: true,
    strengths: ["json", "csv", "datos", "tabla", "estructurado", "local"],
  },
  {
    id: "scrapling",
    label: "Scrapling (local · adaptativo)",
    kind: "local",
    repo: "https://github.com/D4Vinci/Scrapling",
    free: true,
    strengths: ["adaptativo", "auto-reparable", "stealth", "anti-deteccion", "cambia", "estructura"],
  },
  {
    id: "maxun",
    label: "Maxun (OSS · robots no-code)",
    kind: "oss-selfhost",
    repo: "https://github.com/getmaxun/maxun",
    free: true,
    strengths: ["robots", "no-code", "monitorizacion", "recurrente", "entrenar", "vigilar"],
  },
  {
    id: "firecrawl",
    label: "Firecrawl (con clave)",
    kind: "keyed",
    baseUrl: "https://api.firecrawl.dev",
    free: false,
    strengths: ["markdown", "crawl", "sitio", "gestionado", "nube"],
  },
];

/* ───────────────────────── Config del usuario (SSR-safe) ───────────────────────── */

/** Clave de almacenamiento de la config de acceso web (soberana). */
export const WEB_ACCESS_KEY = "starseed.astraura.webaccess.v1";

/** Config por proveedor: endpoint (OSS/local) y/o clave (keyed). */
export interface WebAccessConfigEntry {
  endpoint?: string;
  key?: string;
}

/** Mapa completo de config: { [providerId]: { endpoint?, key? } }. */
export type WebAccessConfig = Record<string, WebAccessConfigEntry>;

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Lee la config de acceso web (o {} si no hay navegador/datos). Nunca lanza. */
export function readWebAccessConfig(): WebAccessConfig {
  if (!isClient()) return {};
  try {
    const raw = window.localStorage.getItem(WEB_ACCESS_KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : null;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: WebAccessConfig = {};
    for (const [id, entry] of Object.entries(obj as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const endpoint = typeof e.endpoint === "string" ? e.endpoint.trim() : "";
      const key = typeof e.key === "string" ? e.key.trim() : "";
      out[id] = {};
      if (endpoint) out[id].endpoint = endpoint;
      if (key) out[id].key = key;
    }
    return out;
  } catch {
    return {};
  }
}

/** Guarda (fusiona) la config de un proveedor. Defensivo; nunca lanza. */
export function saveWebAccessConfig(providerId: string, patch: WebAccessConfigEntry): void {
  if (!isClient() || !providerId) return;
  try {
    const cfg = readWebAccessConfig();
    const cur = cfg[providerId] || {};
    const next: WebAccessConfigEntry = { ...cur };
    if (typeof patch.endpoint === "string") {
      const v = patch.endpoint.trim();
      if (v) next.endpoint = v; else delete next.endpoint;
    }
    if (typeof patch.key === "string") {
      const v = patch.key.trim();
      if (v) next.key = v; else delete next.key;
    }
    cfg[providerId] = next;
    window.localStorage.setItem(WEB_ACCESS_KEY, JSON.stringify(cfg));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/** Resuelve un proveedor por id (o undefined). */
export function findWebAccessProvider(id: string): WebAccessProvider | undefined {
  return WEB_ACCESS_PROVIDERS.find((p) => p.id === id);
}

/**
 * ¿Está ESTE proveedor disponible para usarse ahora mismo?
 *   · local/oss-selfhost → disponible si tiene `endpoint` configurado
 *     (Aurora no puede llamar a un servicio local/self-host sin su URL).
 *   · keyed (Firecrawl)  → disponible si tiene `key` guardada.
 * Función pura sobre la config leída (para poder testear la selección).
 */
export function isProviderAvailable(p: WebAccessProvider, cfg: WebAccessConfig): boolean {
  const entry = cfg[p.id];
  if (!entry) return false;
  if (p.kind === "keyed") return !!(entry.key && entry.key.length);
  // local u oss-selfhost: necesita endpoint (o baseUrl por defecto configurado).
  return !!(entry.endpoint && entry.endpoint.length);
}

/** Proveedores disponibles ahora mismo, en orden de preferencia del catálogo. */
export function availableWebAccessProviders(): WebAccessProvider[] {
  const cfg = readWebAccessConfig();
  return WEB_ACCESS_PROVIDERS.filter((p) => isProviderAvailable(p, cfg));
}

/** Endpoints configurados (id → endpoint) de los proveedores OSS/locales. */
export function configuredWebEndpoints(): Record<string, string> {
  const cfg = readWebAccessConfig();
  const out: Record<string, string> = {};
  for (const p of WEB_ACCESS_PROVIDERS) {
    const entry = cfg[p.id];
    if (entry && entry.endpoint) out[p.id] = entry.endpoint;
  }
  return out;
}

/* ───────────────────────── Auto-selección por tarea ───────────────────────── */

/**
 * Elige el MEJOR proveedor DISPONIBLE para la tarea/contexto:
 *   1) Filtra a los disponibles (config presente: endpoint para OSS/local,
 *      key para keyed).
 *   2) Prefiere GRATIS/LOCAL/OSS antes que el de clave (Firecrawl al final).
 *   3) Dentro de ese orden, si `taskHint` casa con las `strengths` de un
 *      proveedor gratis, lo asciende (auto-selección por tarea/contexto).
 *   4) Devuelve `null` si NO hay ninguno configurado — honesto: el navegador
 *      de Aurora no puede scrapear sin un proveedor corriendo, así que la capa
 *      superior pedirá al usuario que pegue la URL/el contenido.
 */
export function selectWebAccessProvider(taskHint?: string): { id: string; label: string } | null {
  const cfg = readWebAccessConfig();
  const available = WEB_ACCESS_PROVIDERS.filter((p) => isProviderAvailable(p, cfg));
  if (!available.length) return null;

  const hint = String(taskHint ?? "").toLowerCase();

  // Partición gratis-primero: OSS/locales (free) antes que los de clave.
  const freeOnes = available.filter((p) => p.free);
  const keyedOnes = available.filter((p) => !p.free);

  // Dentro de los gratis, si el hint casa con las strengths de alguno, ese gana.
  if (hint && freeOnes.length) {
    const matched = freeOnes.find((p) => p.strengths.some((s) => hint.includes(s)));
    if (matched) return { id: matched.id, label: matched.label };
  }

  // Si no hubo match por tarea: primer gratis en orden de catálogo; si no hay
  // ninguno gratis, el primero de clave (Firecrawl como red de seguridad).
  const chosen = freeOnes[0] || keyedOnes[0] || null;
  return chosen ? { id: chosen.id, label: chosen.label } : null;
}

/* ───────────────────────── Línea de estado para el cerebro ───────────────────────── */

/**
 * Frase corta y honesta para el system prompt de Aurora, p.ej.
 *   "Acceso web: Crawl4AI (local) disponible."
 *   "Acceso web: sin proveedor configurado — pide al usuario que pegue la
 *    URL/el contenido."
 * Nunca lanza; sin navegador reporta "sin proveedor".
 */
export function webAccessStatusLine(): string {
  const chosen = selectWebAccessProvider();
  if (!chosen) {
    return "Acceso web: sin proveedor configurado — pide al usuario que pegue la URL/el contenido.";
  }
  return `Acceso web: ${chosen.label} disponible (se auto-selecciona la mejor herramienta gratis/local por tarea).`;
}
