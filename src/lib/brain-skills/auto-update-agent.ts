"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Brain Skill · "Auto-actualización + Recomendaciones"
// ----------------------------------------------------------------
// Skill por defecto, INTEGRADA en cada cerebro y totalmente configurable
// (y removible). Vigila novedades en:
//   • Skills instaladas del cerebro (registro de skills por defecto).
//   • La librería OSS (`OSS_LIBRARY`): nuevas/actualizadas opciones.
//   • Las fuentes de la librería (`LIBRARY_SOURCES`): nuevos registros.
//   • Las FUENTES DE CONTENIDO del usuario (de cualquier tipo): rss/feed,
//     repos de GitHub, páginas web, ids de fuente de librería, cuentas
//     conectadas, canales/youtube, etc.
//
// Compara el estado actual contra un "snapshot" previo (guardado en
// localStorage) y devuelve una lista de NOVEDADES. Aparte, reúne las
// fuentes de contenido + el catálogo y pide a Aurora (vía `chatSmart`,
// de forma defensiva y opcional) que ordene + resuma lo más relevante.
//
// ⚠️ DEFENSIVO: TODO va con guardas `typeof window`, try/catch y SIN
//    dependencias duras de red. Si Aurora/fetch no están disponibles,
//    devuelve una lista heurística local útil. Nunca lanza a sus llamadores.
// ════════════════════════════════════════════════════════════════

import {
  OSS_LIBRARY,
  LIBRARY_SOURCES,
  OSS_CATEGORY_META,
  type OssOption,
  type OssCategory,
} from "@/lib/oss-library";

// ── Identidad estable de la skill ────────────────────────────────

/** Id estable de esta skill (no cambiar: persiste en configs/cerebros). */
export const AUTO_UPDATE_SKILL_ID = "starseed-auto-update" as const;

/** Metadatos de la skill para mostrarla en catálogos/UI. */
export const AUTO_UPDATE_SKILL_META = {
  id: AUTO_UPDATE_SKILL_ID,
  name: "Auto-actualización + Recomendaciones",
  emoji: "🛰️",
  blurb:
    "Vigila novedades (skills, librería OSS, fuentes de librería y tus fuentes de contenido) y te recomienda lo más relevante con Aurora.",
  /** Activa por defecto en cada cerebro nuevo. */
  defaultEnabled: true,
} as const;

// ── Modelo de configuración (persistida por cerebro) ─────────────

/** Cadencia con la que el cerebro busca novedades. */
export type AutoUpdateCadence = "manual" | "diaria" | "semanal";

/** Tipos de objetivo que la skill puede vigilar. */
export interface AutoUpdateTargets {
  /** Vigilar nuevas/actualizadas skills instaladas. */
  skills: boolean;
  /** Vigilar nuevas/actualizadas opciones de la librería OSS. */
  ossLibrary: boolean;
  /** Vigilar nuevas fuentes de la librería (`LIBRARY_SOURCES`). */
  librarySources: boolean;
  /** Vigilar las fuentes de contenido del usuario (definidas abajo). */
  contentSources: boolean;
}

/** Tipo flexible de una fuente de contenido del usuario (CUALQUIER tipo). */
export type ContentSourceKind =
  | "rss"
  | "feed"
  | "github"
  | "web"
  | "library-source"
  | "account"
  | "youtube"
  | "channel"
  | "otro";

/** Una fuente de contenido del usuario. Modelo flexible y abierto. */
export interface ContentSource {
  /** Id estable interno. */
  id: string;
  /** Tipo de fuente (rss/feed, repo GitHub, web, id de fuente de librería, …). */
  kind: ContentSourceKind | string;
  /** Etiqueta legible. */
  label: string;
  /** URL / identificador (puede ser una URL, un id de librería, un handle, …). */
  url: string;
}

/** Configuración completa de la skill para UN cerebro. */
export interface AutoUpdateConfig {
  /** Activada en este cerebro (por defecto true). */
  enabled: boolean;
  /** Cada cuánto buscar novedades (manual por defecto = no automático). */
  cadence: AutoUpdateCadence;
  /** Qué objetivos vigilar. */
  targets: AutoUpdateTargets;
  /** Fuentes de contenido del usuario (de cualquier tipo). */
  sources: ContentSource[];
}

/** Configuración por defecto: ON, manual, vigila todo, sin fuentes propias. */
export const DEFAULT_AUTO_UPDATE_CONFIG: AutoUpdateConfig = {
  enabled: AUTO_UPDATE_SKILL_META.defaultEnabled,
  cadence: "manual",
  targets: {
    skills: true,
    ossLibrary: true,
    librarySources: true,
    contentSources: true,
  },
  sources: [],
};

// ── Claves de localStorage (convención por cerebro) ──────────────

/** Config de la skill: `starseed.brain.<id>.autoupdate`. */
export function autoUpdateKey(brainId: string): string {
  return `starseed.brain.${brainId}.autoupdate`;
}

/** Snapshot de lo último visto: `starseed.brain.<id>.autoupdate.snapshot`. */
export function autoUpdateSnapshotKey(brainId: string): string {
  return `starseed.brain.${brainId}.autoupdate.snapshot`;
}

/**
 * Clave por cerebro con los ids de skills instaladas (vista previa local).
 * No la posee esta skill; la leemos de forma defensiva si existe para poder
 * detectar skills nuevas. La escribe el registro de skills por defecto.
 */
export function brainSkillsKey(brainId: string): string {
  return `starseed.brain.${brainId}.skills`;
}

// ── Utilidades de almacenamiento (SSR-safe + defensivas) ─────────

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

// ── Carga / guardado de la configuración ─────────────────────────

/** Normaliza una fuente de contenido parcial a una válida (defensivo). */
function normalizeSource(raw: unknown): ContentSource | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<ContentSource>;
  const label = typeof s.label === "string" ? s.label.trim() : "";
  const url = typeof s.url === "string" ? s.url.trim() : "";
  if (!label && !url) return null;
  return {
    id: typeof s.id === "string" && s.id ? s.id : newId(),
    kind: typeof s.kind === "string" && s.kind ? s.kind : "otro",
    label: label || url,
    url,
  };
}

/** Lee la config de la skill para un cerebro, con merge sobre el default. */
export function loadAutoUpdateConfig(brainId: string): AutoUpdateConfig {
  if (!brainId || !isClient()) return { ...DEFAULT_AUTO_UPDATE_CONFIG };
  const parsed = readJson<Partial<AutoUpdateConfig>>(autoUpdateKey(brainId));
  if (!parsed) return { ...DEFAULT_AUTO_UPDATE_CONFIG };
  const targets = {
    ...DEFAULT_AUTO_UPDATE_CONFIG.targets,
    ...(parsed.targets && typeof parsed.targets === "object" ? parsed.targets : {}),
  };
  const sources = Array.isArray(parsed.sources)
    ? parsed.sources.map(normalizeSource).filter((x): x is ContentSource => !!x)
    : [];
  const cadence: AutoUpdateCadence =
    parsed.cadence === "diaria" || parsed.cadence === "semanal" || parsed.cadence === "manual"
      ? parsed.cadence
      : DEFAULT_AUTO_UPDATE_CONFIG.cadence;
  return {
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_AUTO_UPDATE_CONFIG.enabled,
    cadence,
    targets,
    sources,
  };
}

/** Guarda la config de la skill para un cerebro. */
export function saveAutoUpdateConfig(brainId: string, cfg: AutoUpdateConfig): void {
  if (!brainId) return;
  writeJson(autoUpdateKey(brainId), cfg);
}

/** Crea una nueva fuente de contenido (sin persistir). */
export function makeContentSource(partial: Partial<ContentSource> = {}): ContentSource {
  return {
    id: newId(),
    kind: partial.kind || "rss",
    label: partial.label || "",
    url: partial.url || "",
  };
}

// ── Snapshot: estado de lo último visto ──────────────────────────

interface AutoUpdateSnapshot {
  /** Epoch ms de la última comprobación. */
  checkedAt: number;
  /** Ids de opciones OSS vistas + firma corta para detectar cambios. */
  ossSignatures: Record<string, string>;
  /** Ids de fuentes de librería vistas. */
  librarySourceIds: string[];
  /** Ids de skills instaladas vistas. */
  skillIds: string[];
  /** Ids de fuentes de contenido del usuario vistas. */
  contentSourceIds: string[];
}

const EMPTY_SNAPSHOT: AutoUpdateSnapshot = {
  checkedAt: 0,
  ossSignatures: {},
  librarySourceIds: [],
  skillIds: [],
  contentSourceIds: [],
};

function loadSnapshot(brainId: string): AutoUpdateSnapshot {
  const parsed = readJson<Partial<AutoUpdateSnapshot>>(autoUpdateSnapshotKey(brainId));
  if (!parsed) return { ...EMPTY_SNAPSHOT };
  return {
    checkedAt: typeof parsed.checkedAt === "number" ? parsed.checkedAt : 0,
    ossSignatures:
      parsed.ossSignatures && typeof parsed.ossSignatures === "object"
        ? (parsed.ossSignatures as Record<string, string>)
        : {},
    librarySourceIds: Array.isArray(parsed.librarySourceIds)
      ? parsed.librarySourceIds.filter((x): x is string => typeof x === "string")
      : [],
    skillIds: Array.isArray(parsed.skillIds)
      ? parsed.skillIds.filter((x): x is string => typeof x === "string")
      : [],
    contentSourceIds: Array.isArray(parsed.contentSourceIds)
      ? parsed.contentSourceIds.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function saveSnapshot(brainId: string, snap: AutoUpdateSnapshot): void {
  writeJson(autoUpdateSnapshotKey(brainId), snap);
}

/** Firma corta de una opción OSS para detectar actualizaciones (no solo altas). */
function ossSignature(o: OssOption): string {
  // Incluimos campos que, al cambiar, consideramos "actualización" relevante.
  return [o.license, o.maintained ? "1" : "0", o.url].join("|");
}

// ── Lectura de skills instaladas del cerebro (defensiva) ─────────

/** Lee los ids de skills instaladas del cerebro (si el registro existe). */
export function readInstalledSkillIds(brainId: string): string[] {
  if (!brainId) return [];
  const raw = readJson<unknown>(brainSkillsKey(brainId));
  // Aceptamos varias formas: string[] | { id }[] | { skills: ... }.
  const arr: unknown = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { skills?: unknown }).skills)
      ? (raw as { skills: unknown[] }).skills
      : [];
  const ids: string[] = [];
  for (const item of arr as unknown[]) {
    if (typeof item === "string") ids.push(item);
    else if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      ids.push((item as { id: string }).id);
    }
  }
  // La auto-update siempre se considera instalada por defecto.
  if (!ids.includes(AUTO_UPDATE_SKILL_ID)) ids.push(AUTO_UPDATE_SKILL_ID);
  return Array.from(new Set(ids));
}

// ── Resultado: una "novedad" ─────────────────────────────────────

export type NoveltyKind = "oss-new" | "oss-updated" | "library-source" | "skill" | "content-source";

export interface Novelty {
  /** Categoría de la novedad. */
  kind: NoveltyKind;
  /** Id del elemento relacionado (id OSS, id de fuente, etc.). */
  refId: string;
  /** Título legible. */
  title: string;
  /** Detalle / descripción corta. */
  detail: string;
  /** URL relevante, si la hay. */
  url?: string;
}

export interface CheckForUpdatesResult {
  /** Lista de novedades detectadas (vacía si no hay). */
  novelties: Novelty[];
  /** Epoch ms del snapshot anterior (0 = primera vez). */
  previousCheckedAt: number;
  /** ¿Era la primera comprobación (sin snapshot previo)? */
  firstRun: boolean;
}

// ── checkForUpdates ──────────────────────────────────────────────

/**
 * Compara el catálogo/fuentes/skills actuales contra el último snapshot y
 * devuelve las novedades. Persiste el nuevo snapshot al terminar (salvo que se
 * pida `persist: false`). En la PRIMERA ejecución (sin snapshot) NO marca todo
 * como novedad: registra el estado base y devuelve `firstRun: true` con lista
 * vacía, para no inundar al usuario.
 *
 * Es puramente LOCAL y síncrona; nunca lanza.
 */
export function checkForUpdates(
  brainId: string,
  opts: { persist?: boolean } = {},
): CheckForUpdatesResult {
  const persist = opts.persist !== false;
  try {
    const cfg = loadAutoUpdateConfig(brainId);
    const prev = loadSnapshot(brainId);
    const firstRun = prev.checkedAt === 0;
    const novelties: Novelty[] = [];

    // Estado actual.
    const currentOssSignatures: Record<string, string> = {};
    for (const o of OSS_LIBRARY) currentOssSignatures[o.id] = ossSignature(o);
    const currentLibrarySourceIds = LIBRARY_SOURCES.map((s) => s.id);
    const currentSkillIds = readInstalledSkillIds(brainId);
    const currentContentSourceIds = cfg.sources.map((s) => s.id);

    if (!firstRun) {
      // 1) OSS: altas y actualizaciones.
      if (cfg.targets.ossLibrary) {
        for (const o of OSS_LIBRARY) {
          const prevSig = prev.ossSignatures[o.id];
          const meta = OSS_CATEGORY_META[o.category];
          if (prevSig === undefined) {
            novelties.push({
              kind: "oss-new",
              refId: o.id,
              title: `Nueva opción: ${o.name}`,
              detail: `${meta?.label ?? o.category} · ${o.description}`,
              url: o.url,
            });
          } else if (prevSig !== currentOssSignatures[o.id]) {
            novelties.push({
              kind: "oss-updated",
              refId: o.id,
              title: `Actualizada: ${o.name}`,
              detail: `${meta?.label ?? o.category} · ${o.license}${o.maintained ? "" : " · en mantenimiento"}`,
              url: o.url,
            });
          }
        }
      }

      // 2) Fuentes de la librería: nuevas.
      if (cfg.targets.librarySources) {
        const prevSet = new Set(prev.librarySourceIds);
        for (const s of LIBRARY_SOURCES) {
          if (!prevSet.has(s.id)) {
            novelties.push({
              kind: "library-source",
              refId: s.id,
              title: `Nueva fuente de librería: ${s.label}`,
              detail: s.url,
              url: s.url.startsWith("http") ? s.url : undefined,
            });
          }
        }
      }

      // 3) Skills: nuevas instaladas.
      if (cfg.targets.skills) {
        const prevSet = new Set(prev.skillIds);
        for (const id of currentSkillIds) {
          if (!prevSet.has(id)) {
            novelties.push({
              kind: "skill",
              refId: id,
              title: id === AUTO_UPDATE_SKILL_ID ? `Skill: ${AUTO_UPDATE_SKILL_META.name}` : `Nueva skill: ${id}`,
              detail: "Disponible en este cerebro.",
            });
          }
        }
      }

      // 4) Fuentes de contenido del usuario: nuevas desde el último snapshot.
      if (cfg.targets.contentSources) {
        const prevSet = new Set(prev.contentSourceIds);
        for (const s of cfg.sources) {
          if (!prevSet.has(s.id)) {
            novelties.push({
              kind: "content-source",
              refId: s.id,
              title: `Fuente añadida: ${s.label}`,
              detail: `${s.kind}${s.url ? ` · ${s.url}` : ""}`,
              url: s.url && s.url.startsWith("http") ? s.url : undefined,
            });
          }
        }
      }
    }

    if (persist) {
      saveSnapshot(brainId, {
        checkedAt: Date.now(),
        ossSignatures: currentOssSignatures,
        librarySourceIds: currentLibrarySourceIds,
        skillIds: currentSkillIds,
        contentSourceIds: currentContentSourceIds,
      });
    }

    return { novelties, previousCheckedAt: prev.checkedAt, firstRun };
  } catch {
    return { novelties: [], previousCheckedAt: 0, firstRun: false };
  }
}

/** Restablece el snapshot (la próxima comprobación parte de cero / firstRun). */
export function resetSnapshot(brainId: string): void {
  if (!brainId || !isClient()) return;
  try {
    window.localStorage.removeItem(autoUpdateSnapshotKey(brainId));
  } catch {
    /* noop */
  }
}

// ── Recomendaciones ──────────────────────────────────────────────

export interface Recommendation {
  /** Id del elemento recomendado (id OSS o id de fuente del usuario). */
  refId: string;
  /** Título legible. */
  title: string;
  /** Por qué es relevante (1 línea). */
  reason: string;
  /** URL relevante, si la hay. */
  url?: string;
  /** Origen del item: catálogo OSS o una fuente de contenido del usuario. */
  origin: "oss" | "source";
}

export interface GetRecommendationsResult {
  /** Lista ordenada de recomendaciones (máx. ~8). */
  recommendations: Recommendation[];
  /** ¿Las ordenó/resumió Aurora? (false = heurística local). */
  viaAurora: boolean;
  /** Resumen breve en prosa (de Aurora si está disponible). */
  summary: string;
  /**
   * ADITIVO (opcional, compat. hacia atrás): mejores alternativas propuestas
   * para lo que el cerebro ya tiene instalado (misma categoría, mantenida,
   * mayor relevancia). Sólo se rellena si se pide `includeAlternatives`.
   * Los llamadores existentes que no lo lean siguen funcionando igual.
   */
  alternatives?: BetterAlternative[];
}

/** Construye el conjunto de candidatos (catálogo OSS + fuentes del usuario). */
function buildCandidates(cfg: AutoUpdateConfig): Recommendation[] {
  const out: Recommendation[] = [];
  // Catálogo OSS: priorizamos opciones mantenidas y OSS "puro".
  for (const o of OSS_LIBRARY) {
    const meta = OSS_CATEGORY_META[o.category];
    out.push({
      refId: o.id,
      title: o.name,
      reason: `${meta?.label ?? o.category}${o.maintained ? "" : " · en mantenimiento"} · ${o.license}`,
      url: o.url,
      origin: "oss",
    });
  }
  // Fuentes de contenido del usuario.
  for (const s of cfg.sources) {
    out.push({
      refId: s.id,
      title: s.label,
      reason: `Fuente del usuario · ${s.kind}`,
      url: s.url && s.url.startsWith("http") ? s.url : undefined,
      origin: "source",
    });
  }
  return out;
}

/** Heurística local: ordena candidatos sin IA (mantenidos + fuentes primero). */
function localHeuristicRanking(cfg: AutoUpdateConfig, limit: number): Recommendation[] {
  const candidates = buildCandidates(cfg);
  const score = (r: Recommendation): number => {
    let s = 0;
    if (r.origin === "source") s += 100; // lo que el usuario eligió pesa más
    if (r.origin === "oss") {
      const o = OSS_LIBRARY.find((x) => x.id === r.refId);
      if (o) {
        if (o.maintained) s += 30;
        if (o.oss) s += 10;
        if (o.moaNative) s += 5;
      }
    }
    return s;
  };
  return candidates
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);
}

/**
 * Reúne las fuentes de contenido del cerebro + el catálogo y pide a Aurora que
 * ordene y resuma lo más relevante. DEFENSIVO/OPCIONAL: si no hay proveedor de
 * IA, o `chatSmart` falla o devuelve algo inesperado, cae a una heurística
 * local útil. Nunca lanza.
 *
 * @param brainId  Cerebro cuyo contexto/fuentes se usan.
 * @param opts.limit  Máximo de recomendaciones (por defecto 8).
 * @param opts.passphrase  Passphrase para descifrar la clave del proveedor.
 * @param opts.includeAlternatives  ADITIVO: si true, adjunta `alternatives`
 *   (mejores alternativas OSS para lo ya instalado). Off por defecto → los
 *   llamadores existentes obtienen exactamente el mismo resultado que antes.
 * @param opts.installedIds  ADITIVO: ids OSS instalados a considerar. Si se
 *   omite, se leen de forma defensiva desde localStorage del cerebro.
 */
export async function getRecommendations(
  brainId: string,
  opts: {
    limit?: number;
    passphrase?: string;
    signal?: AbortSignal;
    includeAlternatives?: boolean;
    installedIds?: string[];
  } = {},
): Promise<GetRecommendationsResult> {
  const limit = Math.max(1, Math.min(20, opts.limit ?? 8));
  const cfg = loadAutoUpdateConfig(brainId);
  const candidates = buildCandidates(cfg);
  const localRanking = localHeuristicRanking(cfg, limit);

  // ADITIVO: si el llamador pide alternativas, las calculamos (siempre local,
  // defensivo). Aurora podrá afinarlas dentro de findBetterAlternatives. Sólo
  // adjuntamos el array de alternativas (el campo del resultado es BetterAlternative[]).
  let alternatives: BetterAlternative[] | undefined;
  if (opts.includeAlternatives) {
    try {
      const alt = await findBetterAlternatives(brainId, {
        installedIds: opts.installedIds,
        passphrase: opts.passphrase,
        signal: opts.signal,
      });
      alternatives = alt.alternatives;
    } catch {
      alternatives = [];
    }
  }

  // Sin candidatos → nada que recomendar (pero devolvemos alternatives si se pidió).
  if (candidates.length === 0) {
    return { recommendations: [], viaAurora: false, summary: "", ...(alternatives ? { alternatives } : {}) };
  }

  // ¿Hay algún proveedor de IA activo? Si no, devolvemos la heurística local.
  let hasProvider = false;
  try {
    const { loadConfigs } = await import("@/ai/client/providerStore");
    hasProvider = loadConfigs().some((c) => c.enabled);
  } catch {
    hasProvider = false;
  }
  if (!hasProvider) {
    return {
      recommendations: localRanking,
      viaAurora: false,
      summary: "Recomendaciones locales (activa un proveedor de IA para que Aurora las afine).",
      ...(alternatives ? { alternatives } : {}),
    };
  }

  // Intento con Aurora (chatSmart). Todo dentro de try/catch.
  try {
    const { chatSmart } = await import("@/ai/client/chat");
    // Acotamos el menú para no exceder contexto: hasta 40 candidatos con índice.
    const menu = candidates
      .slice(0, 40)
      .map((c, i) => `${i}: [${c.origin}] ${c.title} — ${c.reason}${c.url ? ` (${c.url})` : ""}`)
      .join("\n");

    const sourcesNote = cfg.sources.length
      ? `Fuentes de contenido del usuario: ${cfg.sources.map((s) => `${s.label} (${s.kind})`).join(", ")}.`
      : "El usuario aún no añadió fuentes de contenido propias.";

    const content = `Eres Aurora, el sistema de IA de un cerebro de StarSeed OS. Tu tarea: de la siguiente lista numerada de opciones (catálogo de código abierto + fuentes de contenido del usuario), elige y ORDENA las ${limit} MÁS RELEVANTES para este usuario y explica en una frase por qué cada una.
${sourcesNote}

Lista de candidatos:
${menu}

Responde ÚNICAMENTE con JSON válido y sin texto extra, con esta forma exacta:
{"summary":"<resumen breve en español, 1-2 frases>","items":[{"index":<número de la lista>,"reason":"<por qué, en español, 1 frase>"}]}
Usa como máximo ${limit} items, ordenados de más a menos relevante.`;

    const res = await chatSmart({
      brainId,
      messages: [{ role: "user", content }],
      temperature: 0.3,
      passphrase: opts.passphrase,
      signal: opts.signal,
    });

    const parsed = parseAuroraRecommendations(res?.text ?? "", candidates, limit);
    if (parsed && parsed.recommendations.length > 0) {
      return { ...parsed, viaAurora: true, ...(alternatives ? { alternatives } : {}) };
    }
    // Aurora respondió pero no pudimos parsear → heurística local.
    return {
      recommendations: localRanking,
      viaAurora: false,
      summary: "Recomendaciones locales (no se pudo interpretar la respuesta de Aurora).",
      ...(alternatives ? { alternatives } : {}),
    };
  } catch {
    // Cualquier fallo (sin clave, red, parseo) → heurística local.
    return {
      recommendations: localRanking,
      viaAurora: false,
      summary: "Recomendaciones locales (Aurora no estuvo disponible).",
      ...(alternatives ? { alternatives } : {}),
    };
  }
}

/** Extrae el primer bloque JSON de un texto (tolerante a ```json … ```). */
function extractJsonBlock(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** Interpreta la respuesta JSON de Aurora y la mapea a recomendaciones. */
function parseAuroraRecommendations(
  text: string,
  candidates: Recommendation[],
  limit: number,
): { recommendations: Recommendation[]; summary: string } | null {
  const block = extractJsonBlock(text);
  if (!block) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(block);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as { summary?: unknown; items?: unknown };
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const items = Array.isArray(o.items) ? o.items : [];
  const recommendations: Recommendation[] = [];
  const seen = new Set<number>();
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const idxRaw = (it as { index?: unknown }).index;
    const idx = typeof idxRaw === "number" ? idxRaw : Number(idxRaw);
    if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length || seen.has(idx)) continue;
    seen.add(idx);
    const reason = typeof (it as { reason?: unknown }).reason === "string"
      ? ((it as { reason: string }).reason).trim()
      : candidates[idx].reason;
    recommendations.push({ ...candidates[idx], reason: reason || candidates[idx].reason });
    if (recommendations.length >= limit) break;
  }
  if (recommendations.length === 0) return null;
  return { recommendations, summary };
}

// ════════════════════════════════════════════════════════════════
// ADITIVO · "Mejores alternativas" (Actualizaciones inteligentes)
// ----------------------------------------------------------------
// Dado lo que un cerebro ya tiene instalado (opciones OSS de apps, runtimes,
// servidores y almacenamiento — más, opcionalmente, integraciones y ficheros),
// propone para CADA contexto opciones más nuevas/mejores del catálogo
// (`OSS_LIBRARY`): misma categoría, mantenidas y de mayor relevancia.
//
// Todo es LOCAL-FIRST y DEFENSIVO (guardas typeof window, try/catch, sin red
// dura). Aurora (`chatSmart`) es OPCIONAL: sólo afina las razones/orden si hay
// proveedor activo. Nunca lanza a sus llamadores. La Librería (sección de
// Actualizaciones) puede llamar `findBetterAlternatives(brainId)` directamente.
// ════════════════════════════════════════════════════════════════

/**
 * Claves por cerebro de las selecciones OSS instaladas (misma convención que
 * `@/lib/brains/brains`: `starseed.brain.<id>.{apps,runtimes,servers,storage}`).
 * Se definen aquí en local para leerlas de forma defensiva SIN acoplar este
 * módulo a brains.ts (evitamos ciclos de import y dependencias duras).
 */
const OSS_SLOT_SUFFIXES = ["apps", "runtimes", "servers", "storage"] as const;

function brainOssSlotKey(brainId: string, slot: (typeof OSS_SLOT_SUFFIXES)[number]): string {
  return `starseed.brain.${brainId}.${slot}`;
}

/**
 * Lee los ids de opciones OSS instaladas en un cerebro desde los cuatro huecos
 * (apps/runtimes/servers/storage). Acepta la forma `{ ids: string[] }` que guarda
 * BrainOssCatalogSection y, defensivamente, un `string[]` plano. Si no hay
 * config guardada para un hueco, se omite (no inventamos instalados).
 */
export function readInstalledOssIds(brainId: string): string[] {
  if (!brainId) return [];
  const ids = new Set<string>();
  for (const slot of OSS_SLOT_SUFFIXES) {
    const raw = readJson<unknown>(brainOssSlotKey(brainId, slot));
    if (!raw) continue;
    const arr: unknown = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { ids?: unknown }).ids)
        ? (raw as { ids: unknown[] }).ids
        : [];
    for (const item of arr as unknown[]) {
      if (typeof item === "string" && item) ids.add(item);
    }
  }
  return Array.from(ids);
}

/** Una mejor alternativa propuesta para un elemento ya instalado. */
export interface BetterAlternative {
  /** Id OSS de la opción instalada que se puede mejorar/reemplazar. */
  forId: string;
  /** Nombre legible de la opción instalada. */
  forName: string;
  /** Categoría (contexto) compartida entre instalada y alternativa. */
  category: OssCategory;
  /** Etiqueta legible de la categoría (contexto). */
  categoryLabel: string;
  /** Id OSS de la alternativa sugerida. */
  refId: string;
  /** Nombre de la alternativa sugerida. */
  title: string;
  /** Por qué es mejor / relevante (1 frase, español). */
  reason: string;
  /** URL de la alternativa (repo), si la hay. */
  url?: string;
}

export interface FindBetterAlternativesResult {
  /** Alternativas propuestas, agrupables por `forId`/categoría. */
  alternatives: BetterAlternative[];
  /** Recomendaciones relevantes adicionales del catálogo (misma-categoría, mantenidas) aunque no reemplacen a nada instalado. */
  recommendations: Recommendation[];
  /** ¿Aurora afinó razones/orden? (false = heurística local). */
  viaAurora: boolean;
  /** Resumen breve (de Aurora si está disponible). */
  summary: string;
  /** Ids OSS instalados considerados (para depurar/mostrar). */
  installedIds: string[];
}

/**
 * Puntúa cuánto "mejor" es una alternativa `cand` frente a la opción instalada
 * `inst` (ambas de la misma categoría). Heurística local, determinista:
 *  - mantenida vs no-mantenida (lo más importante),
 *  - OSI-approved (`oss`) frente a open-weight/otra licencia,
 *  - MoA nativo si aplica,
 *  - integrada por defecto (señal de relevancia curada).
 * Devuelve 0 o negativo si no aporta mejora clara (se descarta).
 */
function alternativeScore(inst: OssOption, cand: OssOption): number {
  let s = 0;
  if (cand.maintained && !inst.maintained) s += 50; // reemplazo claro: lo tuyo está sin mantener
  else if (cand.maintained) s += 8; // ambas mantenidas: leve preferencia por opciones vivas
  if (cand.oss && !inst.oss) s += 15; // más abierto que lo instalado
  if (cand.moaNative && !inst.moaNative) s += 6;
  if (cand.defaultIntegrated) s += 4; // curada/integrada por la red
  return s;
}

/** Construye las alternativas locales (sin IA) para un conjunto de instalados. */
function buildLocalAlternatives(installed: OssOption[], perContext: number): BetterAlternative[] {
  const out: BetterAlternative[] = [];
  const installedIds = new Set(installed.map((o) => o.id));
  for (const inst of installed) {
    const meta = OSS_CATEGORY_META[inst.category];
    const sameCat = OSS_LIBRARY.filter(
      (o) => o.category === inst.category && o.id !== inst.id && !installedIds.has(o.id) && o.maintained,
    );
    const ranked = sameCat
      .map((cand) => ({ cand, s: alternativeScore(inst, cand) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, Math.max(1, perContext));
    for (const { cand } of ranked) {
      const better = !inst.maintained && cand.maintained;
      const moreOpen = cand.oss && !inst.oss;
      const reason = better
        ? `Alternativa mantenida a ${inst.name} (que está en mantenimiento).`
        : moreOpen
          ? `Más abierta que ${inst.name} (${cand.license}), mismo contexto ${meta?.label ?? inst.category}.`
          : `Alternativa vigente en ${meta?.label ?? inst.category} a considerar frente a ${inst.name}.`;
      out.push({
        forId: inst.id,
        forName: inst.name,
        category: inst.category,
        categoryLabel: meta?.label ?? inst.category,
        refId: cand.id,
        title: cand.name,
        reason,
        url: cand.url,
      });
    }
  }
  return out;
}

/** Recomendaciones adicionales del catálogo por contexto (mantenidas), sin duplicar instaladas. */
function buildContextRecommendations(installed: OssOption[], limit: number): Recommendation[] {
  const out: Recommendation[] = [];
  const installedIds = new Set(installed.map((o) => o.id));
  const categories = Array.from(new Set(installed.map((o) => o.category)));
  const seen = new Set<string>();
  for (const cat of categories) {
    const meta = OSS_CATEGORY_META[cat];
    const options = OSS_LIBRARY.filter(
      (o) => o.category === cat && !installedIds.has(o.id) && o.maintained,
    )
      .sort((a, b) => Number(b.defaultIntegrated ?? false) - Number(a.defaultIntegrated ?? false))
      .slice(0, 3);
    for (const o of options) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push({
        refId: o.id,
        title: o.name,
        reason: `${meta?.label ?? cat} · ${o.license}${o.defaultIntegrated ? " · integrada" : ""}`,
        url: o.url,
        origin: "oss",
      });
    }
  }
  return out.slice(0, limit);
}

/**
 * Propone MEJORES ALTERNATIVAS para lo que un cerebro ya tiene instalado.
 *
 * Estrategia: local-first + Aurora opcional (igual patrón que getRecommendations).
 * 1) Lee los ids OSS instalados (o usa `opts.installedIds`).
 * 2) Por cada instalado, busca en su misma categoría opciones mantenidas y de
 *    mayor relevancia (heurística determinista) → alternativas.
 * 3) Añade recomendaciones de contexto (misma categoría, mantenidas).
 * 4) Si hay proveedor de IA, deja que Aurora reordene/afine las RAZONES; si no,
 *    devuelve el ranking local. Nunca lanza.
 *
 * @param brainId  Cerebro a analizar.
 * @param opts.installedIds  Ids OSS instalados (si se omite, se leen del cerebro).
 * @param opts.perContext  Máx. alternativas por elemento instalado (def. 2).
 * @param opts.limit  Máx. recomendaciones de contexto (def. 8).
 * @param opts.passphrase / opts.signal  Para el intento opcional con Aurora.
 */
export async function findBetterAlternatives(
  brainId: string,
  opts: {
    installedIds?: string[];
    perContext?: number;
    limit?: number;
    passphrase?: string;
    signal?: AbortSignal;
  } = {},
): Promise<FindBetterAlternativesResult> {
  const perContext = Math.max(1, Math.min(5, opts.perContext ?? 2));
  const limit = Math.max(1, Math.min(20, opts.limit ?? 8));

  try {
    const installedIds = Array.isArray(opts.installedIds)
      ? opts.installedIds.filter((x): x is string => typeof x === "string" && !!x)
      : readInstalledOssIds(brainId);

    // Mapear a opciones OSS conocidas (ignoramos ids desconocidos con seguridad).
    const installed = installedIds
      .map((id) => OSS_LIBRARY.find((o) => o.id === id))
      .filter((o): o is OssOption => !!o);

    // Sin instalados reconocibles → nada que comparar (defensivo, no inventamos).
    if (installed.length === 0) {
      return {
        alternatives: [],
        recommendations: [],
        viaAurora: false,
        summary:
          "Sin opciones instaladas reconocibles en este cerebro. Añade apps, runtimes, servidores o almacenamiento del catálogo para recibir mejores alternativas.",
        installedIds,
      };
    }

    const localAlternatives = buildLocalAlternatives(installed, perContext);
    const contextRecs = buildContextRecommendations(installed, limit);

    // ¿Hay proveedor de IA? Si no, devolvemos el ranking local.
    let hasProvider = false;
    try {
      const { loadConfigs } = await import("@/ai/client/providerStore");
      hasProvider = loadConfigs().some((c) => c.enabled);
    } catch {
      hasProvider = false;
    }
    if (!hasProvider || localAlternatives.length === 0) {
      return {
        alternatives: localAlternatives,
        recommendations: contextRecs,
        viaAurora: false,
        summary: localAlternatives.length
          ? "Mejores alternativas locales (activa un proveedor de IA para que Aurora las afine)."
          : "No se encontraron mejores alternativas claras para lo instalado (todo parece vigente).",
        installedIds,
      };
    }

    // Intento con Aurora: reordena/afina RAZONES sobre las alternativas locales.
    try {
      const { chatSmart } = await import("@/ai/client/chat");
      const menu = localAlternatives
        .slice(0, 40)
        .map(
          (a, i) =>
            `${i}: [${a.categoryLabel}] instalada «${a.forName}» → alternativa «${a.title}» — ${a.reason}${
              a.url ? ` (${a.url})` : ""
            }`,
        )
        .join("\n");

      const content = `Eres Aurora, el sistema de IA de un cerebro de StarSeed OS. El usuario ya tiene instaladas ciertas opciones de software libre; abajo tienes propuestas de MEJORES ALTERNATIVAS (misma categoría/contexto, mantenidas). Elige y ORDENA hasta ${limit} de las MÁS convenientes de reemplazar/añadir y afina en una frase por qué cada una es mejor para su contexto.

Lista de propuestas (instalada → alternativa):
${menu}

Responde ÚNICAMENTE con JSON válido, sin texto extra, con esta forma exacta:
{"summary":"<resumen breve en español, 1-2 frases>","items":[{"index":<número de la lista>,"reason":"<por qué es mejor, en español, 1 frase>"}]}
Usa como máximo ${limit} items, ordenados de más a menos relevante.`;

      const res = await chatSmart({
        brainId,
        messages: [{ role: "user", content }],
        temperature: 0.3,
        passphrase: opts.passphrase,
        signal: opts.signal,
      });

      const refined = parseAuroraAlternatives(res?.text ?? "", localAlternatives, limit);
      if (refined && refined.alternatives.length > 0) {
        return {
          alternatives: refined.alternatives,
          recommendations: contextRecs,
          viaAurora: true,
          summary: refined.summary || "Mejores alternativas afinadas por Aurora.",
          installedIds,
        };
      }
      // Aurora respondió pero no se pudo interpretar → ranking local.
      return {
        alternatives: localAlternatives,
        recommendations: contextRecs,
        viaAurora: false,
        summary: "Mejores alternativas locales (no se pudo interpretar la respuesta de Aurora).",
        installedIds,
      };
    } catch {
      return {
        alternatives: localAlternatives,
        recommendations: contextRecs,
        viaAurora: false,
        summary: "Mejores alternativas locales (Aurora no estuvo disponible).",
        installedIds,
      };
    }
  } catch {
    // Cualquier fallo inesperado → resultado vacío seguro.
    return { alternatives: [], recommendations: [], viaAurora: false, summary: "", installedIds: [] };
  }
}

/** Interpreta la respuesta JSON de Aurora y reordena/afina las alternativas locales. */
function parseAuroraAlternatives(
  text: string,
  base: BetterAlternative[],
  limit: number,
): { alternatives: BetterAlternative[]; summary: string } | null {
  const block = extractJsonBlock(text);
  if (!block) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(block);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as { summary?: unknown; items?: unknown };
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const items = Array.isArray(o.items) ? o.items : [];
  const alternatives: BetterAlternative[] = [];
  const seen = new Set<number>();
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const idxRaw = (it as { index?: unknown }).index;
    const idx = typeof idxRaw === "number" ? idxRaw : Number(idxRaw);
    if (!Number.isInteger(idx) || idx < 0 || idx >= base.length || seen.has(idx)) continue;
    seen.add(idx);
    const reason =
      typeof (it as { reason?: unknown }).reason === "string"
        ? ((it as { reason: string }).reason).trim()
        : base[idx].reason;
    alternatives.push({ ...base[idx], reason: reason || base[idx].reason });
    if (alternatives.length >= limit) break;
  }
  if (alternatives.length === 0) return null;
  return { alternatives, summary };
}
