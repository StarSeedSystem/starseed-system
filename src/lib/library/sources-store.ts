"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Librería · Almacén de Fuentes (persistencia local)
// ----------------------------------------------------------------
// Capa fina, SSR-safe y defensiva sobre localStorage para el gestor de
// Fuentes de la Librería. Reúne el seed `LIBRARY_SOURCES` (catálogo
// soberano, NO editable aquí) con el estado de usuario:
//   • Habilitado/deshabilitado por fuente (clave global de la librería).
//   • Fuentes añadidas por el usuario (url + kind personalizados).
//   • Instalaciones de una fuente en un cerebro concreto (registro con
//     alcance/permiso: usuario o comunidad).
//
// Convención de claves (alineada con el resto del OS):
//   • `starseed.library.sources.v1`          → estado global de fuentes.
//   • `starseed.brain.<brainId>.sources`     → fuentes instaladas en cerebro.
//
// ⚠️ DESCONECTADO DE LA CUENTA: nada aquí contacta un backend real. Es una
//    vista previa local. La instalación SIEMPRE es una acción explícita del
//    usuario (un clic): este módulo nunca auto-instala nada.
// ════════════════════════════════════════════════════════════════

import { LIBRARY_SOURCES, type LibrarySource } from "@/lib/oss-library";

/** Tipos de origen soportados (espejo del union de `LibrarySource.kind`). */
export type SourceKind = NonNullable<LibrarySource["kind"]>;

/** Alcance/permiso con el que se comparte o instala una fuente. */
export type InstallScope = "user" | "community";

// ── Claves de localStorage ───────────────────────────────────────

/** Estado global de fuentes (enabled overrides + fuentes de usuario). */
export const LIBRARY_SOURCES_KEY = "starseed.library.sources.v1";

/** Fuentes instaladas en un cerebro concreto: `starseed.brain.<id>.sources`. */
export function brainSourcesKey(brainId: string): string {
  return `starseed.brain.${brainId}.sources`;
}

// ── Modelos persistidos ──────────────────────────────────────────

/** Estado global persistido del gestor de fuentes. */
export interface LibrarySourcesState {
  /**
   * Override de habilitación por id de fuente. Si un id NO está en el mapa,
   * vale el `enabled` por defecto de `LIBRARY_SOURCES` (o true para añadidas).
   */
  enabled: Record<string, boolean>;
  /** Fuentes añadidas por el usuario (no presentes en el seed). */
  custom: LibrarySource[];
}

/** Registro de una fuente instalada en un cerebro (con permiso/alcance). */
export interface InstalledSourceRecord {
  /** Id de la fuente (del seed o de una añadida por el usuario). */
  sourceId: string;
  /** Etiqueta legible (copia para mostrar sin re-resolver). */
  label: string;
  /** Tipo de origen. */
  kind: SourceKind;
  /** URL de la fuente. */
  url: string;
  /** Alcance/permiso con el que se instaló (usuario o comunidad). */
  scope: InstallScope;
  /** Epoch ms del alta. */
  installedAt: number;
}

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

function newId(prefix = "src"): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* sin crypto: fallback */
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const VALID_KINDS: readonly SourceKind[] = [
  "catalog",
  "code",
  "components",
  "design",
  "mcp",
  "models",
  "automation",
  "apps",
];

/** Normaliza un kind arbitrario a un `SourceKind` válido (cae en "catalog"). */
export function normalizeKind(v: unknown): SourceKind {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  return (VALID_KINDS as readonly string[]).includes(s) ? (s as SourceKind) : "catalog";
}

// ── Estado global de fuentes ─────────────────────────────────────

/** Normaliza una fuente parcial de usuario a una `LibrarySource` válida. */
function normalizeCustomSource(raw: unknown): LibrarySource | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<LibrarySource>;
  const label = typeof s.label === "string" ? s.label.trim() : "";
  const url = typeof s.url === "string" ? s.url.trim() : "";
  if (!label && !url) return null;
  return {
    id: typeof s.id === "string" && s.id ? s.id : newId(),
    label: label || url,
    url,
    enabled: typeof s.enabled === "boolean" ? s.enabled : true,
    kind: normalizeKind(s.kind),
    installable: typeof s.installable === "boolean" ? s.installable : true,
    shareable: typeof s.shareable === "boolean" ? s.shareable : true,
    description: typeof s.description === "string" ? s.description : undefined,
  };
}

/** Lee el estado global (defensivo: estado vacío si no hay / error). */
export function readSourcesState(): LibrarySourcesState {
  const parsed = readJson<Partial<LibrarySourcesState>>(LIBRARY_SOURCES_KEY);
  const enabled =
    parsed && parsed.enabled && typeof parsed.enabled === "object"
      ? (parsed.enabled as Record<string, boolean>)
      : {};
  const custom = Array.isArray(parsed?.custom)
    ? parsed!.custom.map(normalizeCustomSource).filter((x): x is LibrarySource => !!x)
    : [];
  return { enabled, custom };
}

/** Persiste el estado global completo (degrada en silencio si falla). */
export function writeSourcesState(state: LibrarySourcesState): void {
  writeJson(LIBRARY_SOURCES_KEY, state);
}

/**
 * Devuelve TODAS las fuentes (seed `LIBRARY_SOURCES` + añadidas por el usuario)
 * con su flag `enabled` resuelto a partir del estado persistido. El seed nunca
 * se muta; sólo se aplica el override de habilitación encima.
 */
export function getAllSources(): LibrarySource[] {
  const { enabled, custom } = readSourcesState();
  const seed = LIBRARY_SOURCES.map((s) => ({
    ...s,
    enabled: s.id in enabled ? !!enabled[s.id] : s.enabled,
  }));
  // Dedup defensivo: si una fuente de usuario comparte id con el seed, gana el seed.
  const seedIds = new Set(seed.map((s) => s.id));
  const userSources = custom
    .filter((s) => !seedIds.has(s.id))
    .map((s) => ({ ...s, enabled: s.id in enabled ? !!enabled[s.id] : s.enabled }));
  return [...seed, ...userSources];
}

/** Sólo las fuentes habilitadas (seed + usuario). */
export function getEnabledSources(): LibrarySource[] {
  return getAllSources().filter((s) => s.enabled);
}

/** ¿Es una fuente añadida por el usuario (no parte del seed)? */
export function isCustomSource(sourceId: string): boolean {
  return !LIBRARY_SOURCES.some((s) => s.id === sourceId);
}

/** Resuelve una fuente por id (seed + usuario), o undefined. */
export function findSource(sourceId: string): LibrarySource | undefined {
  return getAllSources().find((s) => s.id === sourceId);
}

/** Activa/desactiva una fuente por id. Devuelve el nuevo flag efectivo. */
export function setSourceEnabled(sourceId: string, value: boolean): boolean {
  const state = readSourcesState();
  state.enabled = { ...state.enabled, [sourceId]: value };
  writeSourcesState(state);
  return value;
}

/** Alterna la habilitación de una fuente. Devuelve el nuevo flag efectivo. */
export function toggleSource(sourceId: string): boolean {
  const current = findSource(sourceId);
  const next = !(current?.enabled ?? false);
  return setSourceEnabled(sourceId, next);
}

/**
 * Añade una fuente de usuario (url + kind personalizados). Defensivo: exige
 * al menos label o url. Devuelve la fuente creada (o null si inválida).
 * Dedup por URL entre las fuentes de usuario (singularidad de la entidad).
 */
export function addCustomSource(partial: Partial<LibrarySource>): LibrarySource | null {
  const created = normalizeCustomSource({
    ...partial,
    id: partial.id || newId(),
  });
  if (!created) return null;
  const state = readSourcesState();
  // Dedup por URL (no nula) entre fuentes de usuario.
  const url = created.url.trim();
  const next = url ? state.custom.filter((s) => s.url.trim() !== url) : state.custom.slice();
  next.unshift(created);
  state.custom = next;
  // Por defecto, una fuente recién añadida queda habilitada.
  state.enabled = { ...state.enabled, [created.id]: created.enabled };
  writeSourcesState(state);
  return created;
}

/** Elimina una fuente de usuario por id (el seed no se puede eliminar). */
export function removeCustomSource(sourceId: string): void {
  if (!isCustomSource(sourceId)) return; // el seed es inmutable
  const state = readSourcesState();
  state.custom = state.custom.filter((s) => s.id !== sourceId);
  if (sourceId in state.enabled) {
    const { [sourceId]: _omit, ...rest } = state.enabled;
    state.enabled = rest;
  }
  writeSourcesState(state);
}

// ── Instalación en un cerebro (con permiso/alcance) ──────────────

/** Lee las fuentes instaladas en un cerebro (array vacío si no hay / error). */
export function readBrainSources(brainId: string): InstalledSourceRecord[] {
  if (!brainId) return [];
  const raw = readJson<unknown>(brainSourcesKey(brainId));
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { sources?: unknown }).sources)
      ? (raw as { sources: unknown[] }).sources
      : [];
  const out: InstalledSourceRecord[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<InstalledSourceRecord>;
    const sourceId = typeof r.sourceId === "string" ? r.sourceId : "";
    if (!sourceId) continue;
    out.push({
      sourceId,
      label: typeof r.label === "string" ? r.label : sourceId,
      kind: normalizeKind(r.kind),
      url: typeof r.url === "string" ? r.url : "",
      scope: r.scope === "community" ? "community" : "user",
      installedAt: typeof r.installedAt === "number" ? r.installedAt : Date.now(),
    });
  }
  return out;
}

/** Persiste la lista de fuentes instaladas de un cerebro. */
function writeBrainSources(brainId: string, records: InstalledSourceRecord[]): void {
  if (!brainId) return;
  writeJson(brainSourcesKey(brainId), records);
}

/** ¿Está esta fuente instalada en el cerebro dado? */
export function isSourceInstalledInBrain(brainId: string, sourceId: string): boolean {
  return readBrainSources(brainId).some((r) => r.sourceId === sourceId);
}

/**
 * Instala una fuente en un cerebro con un alcance/permiso explícito. SIEMPRE
 * debe invocarse como resultado de una acción del usuario (un clic / confirmar
 * un enlace). Dedup por `sourceId`: si ya estaba, ACTUALIZA su registro (no
 * duplica). Devuelve la lista actualizada de registros del cerebro.
 */
export function installSourceInBrain(
  brainId: string,
  source: Pick<LibrarySource, "id" | "label" | "url"> & { kind?: LibrarySource["kind"] },
  scope: InstallScope = "user",
): InstalledSourceRecord[] {
  if (!brainId || !source?.id) return readBrainSources(brainId);
  const record: InstalledSourceRecord = {
    sourceId: source.id,
    label: source.label || source.id,
    kind: normalizeKind(source.kind),
    url: source.url || "",
    scope: scope === "community" ? "community" : "user",
    installedAt: Date.now(),
  };
  const current = readBrainSources(brainId).filter((r) => r.sourceId !== source.id);
  current.unshift(record);
  writeBrainSources(brainId, current);
  return current;
}

/** Desinstala una fuente de un cerebro. Devuelve la lista actualizada. */
export function uninstallSourceFromBrain(brainId: string, sourceId: string): InstalledSourceRecord[] {
  const next = readBrainSources(brainId).filter((r) => r.sourceId !== sourceId);
  writeBrainSources(brainId, next);
  return next;
}
