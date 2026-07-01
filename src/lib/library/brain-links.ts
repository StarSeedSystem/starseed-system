"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Librería · Vínculo con Cerebros de Contexto + Almacén
// ----------------------------------------------------------------
// Modelo COMPARTIDO (contrato) para responder a tres preguntas de la
// Librería/Biblioteca unificada:
//   1) ¿Qué SERVIDOR respalda esta librería?         → LibraryStorageConfig.server
//   2) ¿Dónde se ALMACENA?                            → LibraryStorageConfig.storage
//   3) ¿Qué CEREBRO(S) de contexto la respaldan?      → LibraryStorageConfig.brainIds
//                                                        + LibraryBrainLink[]
//
// Este módulo es la ÚNICA fuente de verdad del vínculo Librería↔Cerebros.
// El panel de Cerebros (owned por otro agente) CONSUME estas mismas
// funciones para reflejar/editar los vínculos desde su lado — por eso los
// tipos y las claves de almacenamiento son estables y públicos.
//
// Convención de claves (alineada con el resto del OS):
//   • `starseed.library.storage.v1` → configuración de almacenamiento.
//   • `starseed.library.brains.v1`  → vínculos con cerebros de contexto.
//
// El campo `storage` reutiliza el mismo vocabulario que
// `BrainSourceOrigin` de `@/lib/brains/brains` ("local" | "starseed" |
// "external") pero renombra "external"→"external" y añade el alias
// soberano por defecto: "starseed". Se mantiene compatible para que un
// cerebro y la librería puedan hablar el mismo idioma de origen.
//
// ⚠️ DEFENSIVO / SSR-SAFE: TODO va con guardas `typeof window`, try/catch
//    y normalización tolerante. Nunca lanza a sus llamadores. DESCONECTADO
//    DE LA CUENTA: es una vista previa local; ningún backend se contacta
//    aquí. Cualquier vínculo real es una acción explícita del usuario.
// ════════════════════════════════════════════════════════════════

// ── Vocabulario de almacenamiento ────────────────────────────────

/**
 * Método de almacenamiento que respalda la librería.
 *  • `starseed` → almacenamiento soberano gestionado por la red (por defecto).
 *  • `local`    → este equipo (cerebro local / carpeta local).
 *  • `external` → endpoint/servicio propio (S3, IPFS, VPS, etc.).
 * Espejo compatible de `BrainSourceOrigin` en `@/lib/brains/brains`.
 */
export type LibraryStorageMethod = "starseed" | "local" | "external";

/** Alcance de acceso que un cerebro tiene sobre la librería. */
export type LibraryBrainAccess = "none" | "read" | "write";

// ── Contrato principal (consumido también por el panel de Cerebros) ──

/**
 * Configuración de almacenamiento de la librería/biblioteca unificada.
 * Todos los campos son OPCIONALES para permitir configuraciones parciales
 * y compatibilidad hacia atrás: un campo ausente = valor por defecto.
 */
export interface LibraryStorageConfig {
  /** Id/nombre del servidor que respalda la librería (BrainServer.id o libre). */
  server?: string;
  /** Método de almacenamiento (soberano StarSeed por defecto). */
  storage?: LibraryStorageMethod;
  /** Ids de los cerebros de contexto que respaldan esta librería. */
  brainIds?: string[];
}

/**
 * Vínculo entre la librería y UN cerebro de contexto: nivel de acceso y si
 * se sincroniza. El panel de Cerebros lee/escribe esta misma estructura.
 */
export interface LibraryBrainLink {
  /** Id del cerebro (Brain.id). */
  brainId: string;
  /** Acceso del cerebro a la librería. */
  access: LibraryBrainAccess;
  /** ¿Se sincroniza el contenido de la librería con este cerebro? */
  sync: boolean;
}

// ── Claves de localStorage (públicas y estables) ─────────────────

/** Configuración de almacenamiento de la librería. */
export const LIBRARY_STORAGE_KEY = "starseed.library.storage.v1";

/** Vínculos con cerebros de contexto de la librería. */
export const LIBRARY_BRAINS_KEY = "starseed.library.brains.v1";

// ── Valores por defecto ──────────────────────────────────────────

/** Configuración por defecto: almacenamiento soberano StarSeed, sin cerebros. */
export const DEFAULT_LIBRARY_STORAGE_CONFIG: LibraryStorageConfig = {
  server: undefined,
  storage: "starseed",
  brainIds: [],
};

/** Métodos de almacenamiento con etiqueta y ayuda (para poblar selectores). */
export const LIBRARY_STORAGE_META: Record<
  LibraryStorageMethod,
  { label: string; emoji: string; hint: string }
> = {
  starseed: {
    label: "StarSeed (soberano)",
    emoji: "✨",
    hint: "Almacenamiento gestionado por la red StarSeed. Recomendado por defecto.",
  },
  local: {
    label: "Local (este equipo)",
    emoji: "💻",
    hint: "Este equipo/cerebro local guarda y sirve la librería, sincronizado.",
  },
  external: {
    label: "Externo (propio)",
    emoji: "🌐",
    hint: "Un endpoint/servicio propio (S3, IPFS, VPS…) respalda la librería.",
  },
};

/** Niveles de acceso con etiqueta (para poblar selectores del panel de Cerebros). */
export const LIBRARY_BRAIN_ACCESS_META: Record<
  LibraryBrainAccess,
  { label: string; hint: string }
> = {
  none: { label: "Sin acceso", hint: "El cerebro no accede a la librería." },
  read: { label: "Lectura", hint: "El cerebro puede leer/consultar la librería." },
  write: { label: "Escritura", hint: "El cerebro puede leer y modificar la librería." },
};

// ── Utilidades base (SSR-safe + defensivas) ──────────────────────

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
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

const VALID_STORAGE: readonly LibraryStorageMethod[] = ["starseed", "local", "external"];
const VALID_ACCESS: readonly LibraryBrainAccess[] = ["none", "read", "write"];

/** Normaliza un método de almacenamiento arbitrario (cae en "starseed"). */
export function normalizeStorageMethod(v: unknown): LibraryStorageMethod {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  return (VALID_STORAGE as readonly string[]).includes(s)
    ? (s as LibraryStorageMethod)
    : "starseed";
}

/** Normaliza un nivel de acceso arbitrario (cae en "read"). */
export function normalizeAccess(v: unknown): LibraryBrainAccess {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  return (VALID_ACCESS as readonly string[]).includes(s) ? (s as LibraryBrainAccess) : "read";
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
  }
  return Array.from(new Set(out));
}

// ── Configuración de almacenamiento ──────────────────────────────

/** Lee la configuración de almacenamiento (merge sobre el default). */
export function loadLibraryStorageConfig(): LibraryStorageConfig {
  const parsed = readJson<Partial<LibraryStorageConfig>>(LIBRARY_STORAGE_KEY);
  if (!parsed || typeof parsed !== "object") {
    return { ...DEFAULT_LIBRARY_STORAGE_CONFIG };
  }
  const server =
    typeof parsed.server === "string" && parsed.server.trim() ? parsed.server.trim() : undefined;
  const storage = parsed.storage ? normalizeStorageMethod(parsed.storage) : "starseed";
  const brainIds = toStringArray(parsed.brainIds);
  return { server, storage, brainIds };
}

/** Guarda la configuración de almacenamiento (normalizando; nunca lanza). */
export function saveLibraryStorageConfig(cfg: LibraryStorageConfig): LibraryStorageConfig {
  const normalized: LibraryStorageConfig = {
    server:
      typeof cfg?.server === "string" && cfg.server.trim() ? cfg.server.trim() : undefined,
    storage: normalizeStorageMethod(cfg?.storage),
    brainIds: toStringArray(cfg?.brainIds),
  };
  writeJson(LIBRARY_STORAGE_KEY, normalized);
  emitLibraryLinksChange();
  return normalized;
}

/** Actualiza parcialmente la configuración de almacenamiento. */
export function patchLibraryStorageConfig(
  patch: Partial<LibraryStorageConfig>,
): LibraryStorageConfig {
  const current = loadLibraryStorageConfig();
  return saveLibraryStorageConfig({ ...current, ...patch });
}

// ── Vínculos con cerebros de contexto ────────────────────────────

/** Normaliza un vínculo parcial a uno válido (o null si falta brainId). */
function normalizeBrainLink(raw: unknown): LibraryBrainLink | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LibraryBrainLink>;
  const brainId = typeof r.brainId === "string" ? r.brainId.trim() : "";
  if (!brainId) return null;
  return {
    brainId,
    access: normalizeAccess(r.access),
    sync: typeof r.sync === "boolean" ? r.sync : false,
  };
}

/** Lee todos los vínculos con cerebros (array vacío si no hay / error). */
export function loadLibraryBrainLinks(): LibraryBrainLink[] {
  const raw = readJson<unknown>(LIBRARY_BRAINS_KEY);
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { links?: unknown }).links)
      ? (raw as { links: unknown[] }).links
      : [];
  const out: LibraryBrainLink[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const link = normalizeBrainLink(item);
    if (!link || seen.has(link.brainId)) continue;
    seen.add(link.brainId);
    out.push(link);
  }
  return out;
}

/** Persiste la lista completa de vínculos (dedup por brainId). */
export function saveLibraryBrainLinks(links: LibraryBrainLink[]): LibraryBrainLink[] {
  const out: LibraryBrainLink[] = [];
  const seen = new Set<string>();
  for (const l of Array.isArray(links) ? links : []) {
    const link = normalizeBrainLink(l);
    if (!link || seen.has(link.brainId)) continue;
    seen.add(link.brainId);
    out.push(link);
  }
  writeJson(LIBRARY_BRAINS_KEY, out);
  emitLibraryLinksChange();
  return out;
}

/** Devuelve el vínculo de un cerebro concreto (o undefined). */
export function getLibraryBrainLink(brainId: string): LibraryBrainLink | undefined {
  if (!brainId) return undefined;
  return loadLibraryBrainLinks().find((l) => l.brainId === brainId);
}

/**
 * Crea o actualiza el vínculo de un cerebro. Si `access` es "none", ELIMINA
 * el vínculo (y quita el cerebro de `brainIds` de la config de almacenamiento).
 * Devuelve la lista actualizada de vínculos.
 */
export function setLibraryBrainLink(
  brainId: string,
  patch: Partial<Omit<LibraryBrainLink, "brainId">>,
): LibraryBrainLink[] {
  if (!brainId) return loadLibraryBrainLinks();
  const links = loadLibraryBrainLinks();
  const existing = links.find((l) => l.brainId === brainId);
  const access = patch.access !== undefined ? normalizeAccess(patch.access) : existing?.access ?? "read";

  // access "none" => desvincula por completo.
  if (access === "none") {
    return unlinkLibraryBrain(brainId);
  }

  const next: LibraryBrainLink = {
    brainId,
    access,
    sync: patch.sync !== undefined ? !!patch.sync : existing?.sync ?? false,
  };
  const rest = links.filter((l) => l.brainId !== brainId);
  const saved = saveLibraryBrainLinks([next, ...rest]);

  // Mantener `brainIds` de la config de almacenamiento en sincronía.
  const cfg = loadLibraryStorageConfig();
  if (!(cfg.brainIds ?? []).includes(brainId)) {
    saveLibraryStorageConfig({ ...cfg, brainIds: [...(cfg.brainIds ?? []), brainId] });
  }
  return saved;
}

/** Elimina el vínculo de un cerebro y lo quita de `brainIds`. */
export function unlinkLibraryBrain(brainId: string): LibraryBrainLink[] {
  if (!brainId) return loadLibraryBrainLinks();
  const next = loadLibraryBrainLinks().filter((l) => l.brainId !== brainId);
  const saved = saveLibraryBrainLinks(next);
  const cfg = loadLibraryStorageConfig();
  if ((cfg.brainIds ?? []).includes(brainId)) {
    saveLibraryStorageConfig({
      ...cfg,
      brainIds: (cfg.brainIds ?? []).filter((id) => id !== brainId),
    });
  }
  return saved;
}

/**
 * Ids de cerebros que respaldan la librería, unificando `brainIds` de la
 * config de almacenamiento + los brainId de los vínculos con acceso != none.
 */
export function getBackingBrainIds(): string[] {
  const cfg = loadLibraryStorageConfig();
  const links = loadLibraryBrainLinks();
  const ids = new Set<string>([...(cfg.brainIds ?? [])]);
  for (const l of links) {
    if (l.access !== "none") ids.add(l.brainId);
  }
  return Array.from(ids);
}

// ── Eventos de cambio (para que la UI reaccione en vivo) ─────────

/** Nombre del evento emitido tras cualquier mutación del vínculo. */
export const LIBRARY_LINKS_EVENT = "starseed:library-links";

function emitLibraryLinksChange(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new Event(LIBRARY_LINKS_EVENT));
  } catch {
    /* noop */
  }
}

/**
 * Suscribe a cambios de almacenamiento/vínculos (evento propio + `storage`
 * entre pestañas). Devuelve la función de desuscripción. SSR-safe.
 */
export function subscribeLibraryLinks(callback: () => void): () => void {
  if (!isClient()) return () => {};
  const onChange = () => callback();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LIBRARY_STORAGE_KEY || e.key === LIBRARY_BRAINS_KEY || e.key === null) callback();
  };
  window.addEventListener(LIBRARY_LINKS_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LIBRARY_LINKS_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
