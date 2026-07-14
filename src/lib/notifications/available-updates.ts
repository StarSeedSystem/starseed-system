"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — ACTUALIZACIONES DISPONIBLES de los programas/repos instalados
 * ---------------------------------------------------------------------------
 * (Adenda 66 §12) El Centro de Notificaciones muestra si hay una versión nueva
 * de cualquier paquete/repo instalado desde la Biblioteca. Fuentes REALES,
 * multi-servidor, sin clave (rate-limit anónimo tolerado con gracia):
 *
 *   1) `starseed-catalog` → la versión que declara el catálogo builtin del OS
 *      (findPackage(id).version). Cero red: si el OS sube la versión de un
 *      paquete, aquí aparece como actualización servida por StarSeed.
 *   2) `github-release`    → GitHub Releases API (`/releases/latest`).
 *   3) `github-tag`        → GitHub Tags API (`/tags`), como respaldo/variación.
 *
 * El repo de GitHub de cada paquete se deduce de `payload.externalUrl`/`url`.
 * Los paquetes sin repo (materiales, animaciones, fuentes IA sin repo…) solo se
 * comparan contra el catálogo StarSeed.
 *
 * HONESTIDAD RADICAL:
 *   · Sin token: el límite anónimo de GitHub (~60/h) se maneja con gracia
 *     (403 → se marca `rateLimited` y se corta, sin romper). Cacheamos 6 h y
 *     limitamos el nº de repos por comprobación para no agotar el límite.
 *   · «Actualizar» NO descarga nada: marca la versión detectada como instalada
 *     en el registro de la Biblioteca (setInstalledVersion) y lo apunta en el
 *     historial. La actualización real del binario/servicio la hace el usuario
 *     donde corresponda (repo/servidor); aquí registramos la intención/estado.
 *
 * Persistencia (localStorage, SSR-safe, defensiva):
 *   · `starseed.updates.available.cache.v1` → última comprobación (para no
 *      martillear GitHub en cada montaje).
 *   · `starseed.updates.history.v1`         → historial de actualizaciones
 *      aplicadas. CLAVE NUEVA a reportar para SYNCED_KEYS (settings-sync.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  getInstalledMap,
  findPackage,
  setInstalledVersion,
  LIBRARY_EVENT,
} from "@/lib/library/packages";

/* ─────────────────────────── Claves y eventos ─────────────────────────── */

/** Caché de la última comprobación de actualizaciones. */
export const UPDATES_CACHE_KEY = "starseed.updates.available.cache.v1";
/** Historial de actualizaciones aplicadas (⚠️ reportar para SYNCED_KEYS). */
export const UPDATES_HISTORY_KEY = "starseed.updates.history.v1";
/** Preferencia de auto-actualización (⚠️ reportar para SYNCED_KEYS). */
export const AUTOUPDATE_KEY = "starseed.library.autoupdate.v1";
/** Evento emitido al cambiar el estado de actualizaciones/historial. */
export const AVAILABLE_UPDATES_EVENT = "starseed:available-updates";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h: honesto con el rate-limit anónimo
const MAX_REPOS_PER_CHECK = 18; // límite anónimo de GitHub ≈ 60/h → margen amplio
const FETCH_TIMEOUT_MS = 8000;

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export type UpdateSourceId = "starseed-catalog" | "github-release" | "github-tag";

export interface UpdateSourceResult {
  source: UpdateSourceId;
  /** Etiqueta legible de la fuente/servidor. */
  label: string;
  /** Versión normalizada hallada en esta fuente (o null si no aplica/no hay). */
  version: string | null;
  /** Enlace a la fuente (página del release/tag), si lo hay. */
  url?: string;
  /** Nota honesta (p.ej. "sin releases", "límite de GitHub"). */
  note?: string;
}

export interface PackageUpdate {
  id: string;
  name: string;
  icon: string;
  installedVersion: string;
  /** Mejor versión hallada entre todas las fuentes (o null). */
  latestVersion: string | null;
  /** ¿La mejor versión supera a la instalada? */
  hasUpdate: boolean;
  /** Fuente que ganó (de dónde viene `latestVersion`). */
  bestSource?: UpdateSourceId;
  /** owner/repo de GitHub, si el paquete tiene repo. */
  repo?: { owner: string; repo: string };
  /** Variaciones por fuente/servidor (para la vista multi-servidor). */
  sources: UpdateSourceResult[];
}

export interface UpdatesReport {
  /** TODOS los paquetes comprobados (con o sin actualización). */
  items: PackageUpdate[];
  /** Subconjunto con actualización disponible. */
  available: PackageUpdate[];
  checkedAt: number;
  /** GitHub cortó por límite anónimo durante la comprobación. */
  rateLimited: boolean;
  reposChecked: number;
  fromCache: boolean;
}

export interface UpdateHistoryEntry {
  id: string;
  name: string;
  from: string;
  to: string;
  source: UpdateSourceId;
  at: number;
}

/* ────────────────────────── Utilidades SSR-safe ───────────────────────── */

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

function emit(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new Event(AVAILABLE_UPDATES_EVENT));
  } catch {
    /* noop */
  }
}

/* ─────────────────────── Parseo de repo + versiones ───────────────────── */

/** Extrae {owner, repo} de una URL de GitHub. Null si no es un repo válido. */
export function parseGitHubRepo(url: string | undefined | null): { owner: string; repo: string } | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  const m = u.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  return { owner, repo };
}

/** Normaliza una etiqueta de versión (quita `v`, prefijos release-, sufijos). */
export function normalizeVersion(tag: string | undefined | null): string {
  const t = (tag ?? "").trim();
  if (!t) return "";
  const m = t.match(/\d+(?:\.\d+)*/);
  return m ? m[0] : t.replace(/^[vV]/, "");
}

function parseVer(v: string): number[] {
  const m = (v ?? "").match(/\d+(?:\.\d+)*/);
  if (!m) return [];
  return m[0].split(".").map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
}

/** Compara dos versiones semver-ish. -1 si a<b, 0 si iguales, 1 si a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVer(a);
  const pb = parseVer(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/* ───────────────────────────── GitHub (real) ──────────────────────────── */

interface GhFetch {
  releaseVersion: string | null;
  releaseUrl?: string;
  tagVersion: string | null;
  tagUrl?: string;
  rateLimited: boolean;
  /** true si el repo respondió (aunque sin releases). */
  reached: boolean;
}

async function ghGet(url: string, signal: AbortSignal): Promise<Response | null> {
  try {
    return await fetch(url, {
      signal,
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    return null;
  }
}

/**
 * Consulta releases/latest y (para la variación) tags de un repo. 1-2 requests.
 * Tolera 403 (límite anónimo) y 404 (sin releases) sin romper.
 */
async function fetchGitHub(owner: string, repo: string): Promise<GhFetch> {
  const out: GhFetch = { releaseVersion: null, tagVersion: null, rateLimited: false, reached: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // 1) Release más reciente.
    const rel = await ghGet(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, ctrl.signal);
    if (rel) {
      out.reached = true;
      if (rel.status === 403) {
        out.rateLimited = true;
        return out;
      }
      if (rel.ok) {
        const j = (await rel.json().catch(() => null)) as { tag_name?: string; html_url?: string } | null;
        if (j?.tag_name) {
          out.releaseVersion = normalizeVersion(j.tag_name);
          out.releaseUrl = typeof j.html_url === "string" ? j.html_url : undefined;
        }
      }
    }
    // 2) Tags (variación / respaldo si no hay releases). Otra petición.
    const tagsRes = await ghGet(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=30`, ctrl.signal);
    if (tagsRes) {
      out.reached = true;
      if (tagsRes.status === 403) {
        out.rateLimited = true;
        return out;
      }
      if (tagsRes.ok) {
        const arr = (await tagsRes.json().catch(() => null)) as Array<{ name?: string }> | null;
        if (Array.isArray(arr) && arr.length) {
          // Elige la MAYOR por semver entre la primera página.
          let best: string | null = null;
          for (const t of arr) {
            const v = normalizeVersion(t?.name);
            if (!v) continue;
            if (best === null || compareVersions(v, best) > 0) best = v;
          }
          out.tagVersion = best;
          out.tagUrl = `https://github.com/${owner}/${repo}/tags`;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return out;
}

/* ──────────────────── Paquetes instalados con repo/versión ─────────────── */

interface InstalledRepoRef {
  id: string;
  name: string;
  icon: string;
  installedVersion: string;
  catalogVersion: string;
  repo: { owner: string; repo: string } | null;
}

/** Lista los paquetes instalados con su versión, versión de catálogo y repo. */
export function installedForUpdates(): InstalledRepoRef[] {
  if (!isClient()) return [];
  const map = getInstalledMap();
  const out: InstalledRepoRef[] = [];
  for (const [id, entry] of Object.entries(map)) {
    const pkg = findPackage(id);
    const name = pkg?.name ?? id;
    const icon = pkg?.icon ?? "Package";
    const rawUrl = pkg ? pkg.payload?.externalUrl ?? pkg.payload?.url : undefined;
    const url = typeof rawUrl === "string" ? rawUrl : "";
    out.push({
      id,
      name,
      icon,
      installedVersion: entry.version || "1.0.0",
      catalogVersion: pkg?.version || entry.version || "1.0.0",
      repo: parseGitHubRepo(url),
    });
  }
  // Orden estable por nombre.
  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/* ─────────────────────── Construcción del PackageUpdate ────────────────── */

function buildPackageUpdate(ref: InstalledRepoRef, gh: GhFetch | null): PackageUpdate {
  const sources: UpdateSourceResult[] = [];

  // Fuente 1: catálogo StarSeed (sin red). Real y siempre disponible.
  sources.push({
    source: "starseed-catalog",
    label: "Catálogo StarSeed",
    version: ref.catalogVersion || null,
    note: "Versión declarada por el catálogo del OS (sin red).",
  });

  // Fuentes 2 y 3: GitHub (si el paquete tiene repo y pudimos consultarlo).
  if (ref.repo) {
    if (gh?.releaseVersion) {
      sources.push({
        source: "github-release",
        label: "GitHub · release",
        version: gh.releaseVersion,
        url: gh.releaseUrl,
      });
    } else {
      sources.push({
        source: "github-release",
        label: "GitHub · release",
        version: null,
        note: gh?.rateLimited ? "Límite de GitHub (reintenta luego)." : gh?.reached ? "Sin releases publicados." : "No se pudo consultar.",
      });
    }
    if (gh?.tagVersion) {
      sources.push({
        source: "github-tag",
        label: "GitHub · tag",
        version: gh.tagVersion,
        url: gh.tagUrl,
      });
    }
  }

  // Mejor versión entre todas las fuentes con versión.
  let latestVersion: string | null = null;
  let bestSource: UpdateSourceId | undefined;
  for (const s of sources) {
    if (!s.version) continue;
    if (latestVersion === null || compareVersions(s.version, latestVersion) > 0) {
      latestVersion = s.version;
      bestSource = s.source;
    }
  }

  const hasUpdate = latestVersion !== null && compareVersions(latestVersion, ref.installedVersion) > 0;

  return {
    id: ref.id,
    name: ref.name,
    icon: ref.icon,
    installedVersion: ref.installedVersion,
    latestVersion,
    hasUpdate,
    bestSource,
    repo: ref.repo ?? undefined,
    sources,
  };
}

/* ───────────────────────────── Caché ───────────────────────────────────── */

export function getCachedReport(): UpdatesReport | null {
  const cached = readJson<UpdatesReport>(UPDATES_CACHE_KEY);
  if (!cached || typeof cached.checkedAt !== "number") return null;
  return { ...cached, fromCache: true };
}

function isFresh(report: UpdatesReport | null): boolean {
  return !!report && Date.now() - report.checkedAt < CACHE_TTL_MS;
}

/* ─────────────────────── Comprobación principal ────────────────────────── */

/**
 * Comprueba actualizaciones de todos los paquetes instalados. Usa la caché (6 h)
 * salvo `force`. Consulta GitHub solo para los primeros MAX_REPOS_PER_CHECK repos
 * (rate-limit anónimo). Siempre compara contra el catálogo StarSeed (sin red).
 * Nunca lanza.
 */
export async function checkForUpdates(opts?: { force?: boolean }): Promise<UpdatesReport> {
  if (!isClient()) {
    return { items: [], available: [], checkedAt: 0, rateLimited: false, reposChecked: 0, fromCache: false };
  }

  const cached = getCachedReport();
  if (!opts?.force && isFresh(cached)) return cached as UpdatesReport;

  const refs = installedForUpdates();
  const items: PackageUpdate[] = [];
  let rateLimited = false;
  let reposChecked = 0;

  for (const ref of refs) {
    let gh: GhFetch | null = null;
    if (ref.repo && !rateLimited && reposChecked < MAX_REPOS_PER_CHECK) {
      gh = await fetchGitHub(ref.repo.owner, ref.repo.repo);
      reposChecked++;
      if (gh.rateLimited) rateLimited = true;
    }
    items.push(buildPackageUpdate(ref, gh));
  }

  const available = items.filter((it) => it.hasUpdate);
  const report: UpdatesReport = {
    items,
    available,
    checkedAt: Date.now(),
    rateLimited,
    reposChecked,
    fromCache: false,
  };
  writeJson(UPDATES_CACHE_KEY, report);
  emit();
  return report;
}

/**
 * Comprobación multi-fuente PROFUNDA de UN paquete (bajo demanda, al expandir
 * su ficha). Consulta catálogo + release + tags de nuevo para mostrar las
 * variaciones frescas de ese paquete concreto sin gastar cuota en todos.
 */
export async function checkPackageSources(id: string): Promise<UpdateSourceResult[] | null> {
  if (!isClient()) return null;
  const ref = installedForUpdates().find((r) => r.id === id);
  if (!ref) return null;
  const gh = ref.repo ? await fetchGitHub(ref.repo.owner, ref.repo.repo) : null;
  return buildPackageUpdate(ref, gh).sources;
}

/* ─────────────────────────── Historial ─────────────────────────────────── */

export function getUpdateHistory(): UpdateHistoryEntry[] {
  const raw = readJson<unknown>(UPDATES_HISTORY_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is UpdateHistoryEntry =>
      !!e && typeof e === "object" &&
      typeof (e as UpdateHistoryEntry).id === "string" &&
      typeof (e as UpdateHistoryEntry).to === "string")
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

function pushHistory(entry: UpdateHistoryEntry): void {
  const hist = getUpdateHistory();
  hist.unshift(entry);
  // Cap defensivo del historial (últimas 200 entradas).
  writeJson(UPDATES_HISTORY_KEY, hist.slice(0, 200));
}

/* ─────────────────────────── Aplicar actualización ─────────────────────── */

export interface ApplyUpdateResult {
  ok: boolean;
  message: string;
}

/**
 * «Actualizar»: marca `toVersion` como instalada en el registro de la Biblioteca
 * y lo apunta en el historial. NO descarga: la actualización real del
 * binario/servicio la realiza el usuario donde corresponda. Actualiza la caché
 * para que la ficha refleje "al día" al instante. Nunca lanza.
 */
export function applyUpdate(id: string, toVersion: string, source: UpdateSourceId = "starseed-catalog"): ApplyUpdateResult {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador." };
  const map = getInstalledMap();
  const entry = map[id];
  if (!entry) return { ok: false, message: "Ese paquete no está instalado." };
  const from = entry.version || "1.0.0";
  const to = normalizeVersion(toVersion) || toVersion;
  if (!to || compareVersions(to, from) <= 0) {
    return { ok: false, message: "No hay una versión más nueva que aplicar." };
  }
  const pkg = findPackage(id);
  const changed = setInstalledVersion(id, to);
  if (!changed) return { ok: false, message: "No se pudo actualizar el registro." };

  pushHistory({ id, name: pkg?.name ?? id, from, to, source, at: Date.now() });

  // Refresca la caché: marca este paquete como al día.
  try {
    const cached = getCachedReport();
    if (cached) {
      const items = cached.items.map((it) =>
        it.id === id ? { ...it, installedVersion: to, hasUpdate: false } : it,
      );
      const next: UpdatesReport = { ...cached, items, available: items.filter((i) => i.hasUpdate) };
      writeJson(UPDATES_CACHE_KEY, next);
    }
  } catch {
    /* noop */
  }

  emit();
  // El registro de instalados cambió → que reaccione toda la Biblioteca también.
  try { window.dispatchEvent(new Event(LIBRARY_EVENT)); } catch { /* noop */ }
  return { ok: true, message: `«${pkg?.name ?? id}» marcado como actualizado a ${to}.` };
}

/** Nº de actualizaciones disponibles según la caché (para la campanita/badge). */
export function cachedAvailableCount(): number {
  const cached = getCachedReport();
  return cached ? cached.available.length : 0;
}

/* ═══════════════════ AUTO-ACTUALIZACIÓN (Adenda 69 · J-2) ══════════════════
 * HONESTIDAD RADICAL — qué significa «actualizar» aquí:
 *   Para un paquete OSS/externo, actualizar NO descarga ni ejecuta binarios: el
 *   código vive en su repo externo y NO corre dentro del OS. «Actualizar» =
 *   REFRESCAR el metadato/enlace/versión en el registro de tu Biblioteca
 *   (`starseed.library.installed.v1`) y apuntarlo en el historial. Para las apps
 *   NATIVAS del OS, la versión nueva la trae recargar/reinstalar la app (el
 *   despliegue). La UI lo dice con todas las letras; no se finge lo contrario.
 *
 * El modo «Actualizaciones automáticas» aplica solas las disponibles y AVISA
 * («X se actualizó a vN») vía el sistema de notificaciones de apps (J-1).
 * ─────────────────────────────────────────────────────────────────────────── */

/** ¿Está activada la auto-actualización? (default: OFF, opt-in explícito.) */
export function getAutoUpdateEnabled(): boolean {
  const raw = readJson<{ enabled?: boolean }>(AUTOUPDATE_KEY);
  return !!raw?.enabled;
}

/** Activa/desactiva la auto-actualización. Persiste + emite. */
export function setAutoUpdateEnabled(enabled: boolean): void {
  writeJson(AUTOUPDATE_KEY, { enabled: !!enabled, at: Date.now() });
  emit();
}

/**
 * Aplica TODAS las actualizaciones disponibles del informe dado (o de la caché).
 * Devuelve la lista de entradas aplicadas (para el historial/aviso). No lanza.
 */
export function applyAllUpdates(report?: UpdatesReport | null): ApplyUpdateResult & { applied: UpdateHistoryEntry[] } {
  if (!isClient()) return { ok: false, message: "Solo disponible en el navegador.", applied: [] };
  const rep = report ?? getCachedReport();
  const available = rep?.available ?? [];
  const applied: UpdateHistoryEntry[] = [];
  for (const it of available) {
    if (!it.latestVersion || !it.hasUpdate) continue;
    const from = it.installedVersion;
    const res = applyUpdate(it.id, it.latestVersion, it.bestSource ?? "starseed-catalog");
    if (res.ok) {
      applied.push({
        id: it.id,
        name: it.name,
        from,
        to: normalizeVersion(it.latestVersion) || it.latestVersion,
        source: it.bestSource ?? "starseed-catalog",
        at: Date.now(),
      });
    }
  }
  return {
    ok: applied.length > 0,
    message: applied.length ? `${applied.length} paquete(s) actualizado(s).` : "No había nada que actualizar.",
    applied,
  };
}

/**
 * Ejecuta la auto-actualización si está activada: aplica las disponibles y avisa
 * por cada una vía notifyFromApp (J-1) — «X se actualizó a vN». Devuelve las
 * aplicadas. Import diferido de app-notify para no acoplar los bundles. No lanza.
 */
export async function runAutoUpdate(report?: UpdatesReport | null): Promise<UpdateHistoryEntry[]> {
  if (!isClient() || !getAutoUpdateEnabled()) return [];
  const { applied } = applyAllUpdates(report);
  if (applied.length === 0) return applied;
  try {
    const { notifyFromApp } = await import("./app-notify");
    for (const a of applied) {
      notifyFromApp({
        appId: a.id,
        title: `${a.name} se actualizó a v${a.to}`,
        body: `Actualización automática (${a.from} → ${a.to}). Se refrescó el registro del paquete en tu Biblioteca.`,
        icon: "ArrowUpCircle",
        level: "success",
        dedupeKey: `autoupdate:${a.id}:${a.to}`,
        actions: [{ label: "Ver Biblioteca", href: "/library" }],
      });
    }
  } catch { /* sin aviso: la actualización igualmente se aplicó */ }
  return applied;
}

/**
 * Comprueba actualizaciones y, si el modo automático está activo, las aplica y
 * avisa. Punto único que usan el <AutoUpdateWatcher/> y el panel del centro.
 */
export async function checkAndMaybeAutoUpdate(opts?: { force?: boolean }): Promise<{ report: UpdatesReport; applied: UpdateHistoryEntry[] }> {
  const report = await checkForUpdates(opts);
  const applied = await runAutoUpdate(report);
  // Si algo se aplicó, el informe fresco (post-aplicación) es el de la caché.
  const finalReport = applied.length ? (getCachedReport() ?? report) : report;
  return { report: finalReport, applied };
}
