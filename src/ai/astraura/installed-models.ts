"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · MODELOS DESCARGABLES = OPT-IN (el usuario decide cuándo/cómo)
 * ---------------------------------------------------------------------------
 * Algunas fuentes del catálogo corren en el navegador pero requieren DESCARGAR
 * pesos grandes la primera vez (SmolLM3 ~1,9 GB, SmolVLM2 ~250 MB, WebLLM,
 * Sipp, y el Gemini Nano de Chrome ~3-4 GB). Eso NUNCA debe pasar solo: colgaría
 * a Aurora y consumiría datos sin permiso.
 *
 * REGLA (petición del usuario):
 *   · Estos modelos son una OPCIÓN recomendada, pero NO se usan hasta que el
 *     usuario los INSTALA explícitamente (modal "instalar ahora / después").
 *   · Mientras no estén instalados, el router los IGNORA y Aurora usa la mejor
 *     alternativa disponible (Pollinations, nube gratis, Ollama…). Aurora
 *     SIEMPRE funciona sin ellos.
 *   · La instalación (descarga) ocurre EN SEGUNDO PLANO; Aurora sigue normal.
 *
 * Persistencia: `starseed.astraura.installed-models.v1` (viaja con la cuenta vía
 * settings-sync). Estado de descarga en memoria + evento para la UI.
 * SSR-safe y defensivo. Nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const INSTALLED_MODELS_KEY = "starseed.astraura.installed-models.v1";
export const INSTALLED_MODELS_EVENT = "starseed:astraura-installed-models";
/** Evento de progreso de descarga: detail = { sourceId, pct, label, done, error }. */
export const MODEL_DOWNLOAD_EVENT = "starseed:astraura-model-download";

/** Fuentes del catálogo que requieren descarga/instalación explícita. */
export const DOWNLOADABLE_SOURCES = [
  "smollm3-webgpu",
  "smolvlm2-webgpu",
  "webllm",
  "sipp-local",
  "chrome-ai",
] as const;

export type DownloadableSourceId = (typeof DOWNLOADABLE_SOURCES)[number];

/** Tamaño aproximado de descarga (para el modal), legible. */
export const DOWNLOAD_SIZES: Record<string, string> = {
  "smollm3-webgpu": "~1,9 GB",
  "smolvlm2-webgpu": "~250 MB",
  webllm: "~1–4 GB",
  "sipp-local": "~1–2 GB",
  "chrome-ai": "~3–4 GB (lo gestiona Chrome)",
};

export function isDownloadableSource(sourceId: string): boolean {
  return (DOWNLOADABLE_SOURCES as readonly string[]).includes(sourceId);
}

/* ───────────────────── Registro de instalados ───────────────────── */

interface InstalledState {
  /** sourceId → { at } de los modelos que el usuario ha instalado. */
  models: Record<string, { at: number }>;
  /** ¿El usuario ya vio (y descartó) la oferta para cada fuente? evita re-preguntar. */
  offered: Record<string, number>;
}

function read(): InstalledState {
  if (typeof window === "undefined") return { models: {}, offered: {} };
  try {
    const raw = window.localStorage.getItem(INSTALLED_MODELS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return {
      models: p?.models && typeof p.models === "object" ? p.models : {},
      offered: p?.offered && typeof p.offered === "object" ? p.offered : {},
    };
  } catch {
    return { models: {}, offered: {} };
  }
}

function write(s: InstalledState): void {
  try {
    window.localStorage.setItem(INSTALLED_MODELS_KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(INSTALLED_MODELS_EVENT));
  } catch { /* */ }
}

/** ¿El usuario instaló esta fuente descargable? (las no-descargables → true). */
export function isModelInstalled(sourceId: string): boolean {
  if (!isDownloadableSource(sourceId)) return true;
  return !!read().models[sourceId];
}

/** Marca una fuente como instalada (tras aceptar la descarga). */
export function markModelInstalled(sourceId: string): void {
  if (typeof window === "undefined") return;
  const s = read();
  s.models[sourceId] = { at: Date.now() };
  write(s);
}

/** Desinstala una fuente descargable (deja de ofrecerse al router). */
export function markModelUninstalled(sourceId: string): void {
  if (typeof window === "undefined") return;
  const s = read();
  if (s.models[sourceId]) {
    delete s.models[sourceId];
    write(s);
  }
}

/** Lista de fuentes descargables instaladas. */
export function listInstalledModels(): string[] {
  return Object.keys(read().models);
}

/** ¿Ya se le ofreció al usuario esta fuente (para no re-preguntar)? */
export function wasOffered(sourceId: string): boolean {
  return !!read().offered[sourceId];
}

/** Marca que ya se ofreció (el usuario dijo "después"). */
export function markOffered(sourceId: string): void {
  if (typeof window === "undefined") return;
  const s = read();
  s.offered[sourceId] = Date.now();
  write(s);
}

/* ───────────────────── Estado de descarga (en memoria) ───────────────────── */

const downloading = new Map<string, number>(); // sourceId → pct

export function isDownloading(sourceId: string): boolean {
  return downloading.has(sourceId);
}

export function downloadProgress(sourceId: string): number {
  return downloading.get(sourceId) ?? 0;
}

/** Emite progreso de descarga (lo llama el instalador en 2º plano). */
export function emitDownloadProgress(sourceId: string, pct: number, label = ""): void {
  downloading.set(sourceId, pct);
  try {
    window.dispatchEvent(
      new CustomEvent(MODEL_DOWNLOAD_EVENT, { detail: { sourceId, pct, label, done: false } }),
    );
  } catch { /* */ }
}

/** Cierra el estado de descarga (éxito o error) + marca instalado si ok. */
export function finishDownload(sourceId: string, ok: boolean, error?: string): void {
  downloading.delete(sourceId);
  if (ok) markModelInstalled(sourceId);
  try {
    window.dispatchEvent(
      new CustomEvent(MODEL_DOWNLOAD_EVENT, { detail: { sourceId, pct: ok ? 100 : 0, done: true, error } }),
    );
  } catch { /* */ }
}

/* ───────────────────── Instalación en segundo plano ───────────────────── */

/**
 * Descarga/calienta un modelo de navegador EN SEGUNDO PLANO. Aurora sigue
 * funcionando con normalidad mientras. Al terminar, queda instalado y el router
 * ya podrá elegirlo. Defensivo: si falla, informa y NO bloquea nada.
 */
export async function installModelInBackground(sourceId: string): Promise<{ ok: boolean; message: string }> {
  if (typeof window === "undefined") return { ok: false, message: "No disponible en el servidor." };
  if (isDownloading(sourceId)) return { ok: false, message: "Ya se está descargando." };
  emitDownloadProgress(sourceId, 0, "Preparando…");
  try {
    if (sourceId === "smollm3-webgpu") {
      const eng = await import("./builtin-engines");
      // Un chat mínimo fuerza la descarga+carga del pipeline (cacheado luego).
      await eng.transformersChat(
        "HuggingFaceTB/SmolLM3-3B-ONNX",
        [{ role: "user", content: "hola" }],
        { onProgress: (p) => emitDownloadProgress(sourceId, guessPct(p), p) },
      );
    } else if (sourceId === "smolvlm2-webgpu") {
      const v = await import("./vision");
      // Precarga el pipeline de visión (descarga los pesos ONNX).
      await v.warmUpVision?.("HuggingFaceTB/SmolVLM2-256M-Video-Instruct", (p: string) =>
        emitDownloadProgress(sourceId, guessPct(p), p),
      );
    } else if (sourceId === "webllm") {
      const eng = await import("./builtin-engines");
      await eng.webllmChat(
        "Llama-3.2-3B-Instruct-q4f16_1-MLC",
        [{ role: "user", content: "hola" }],
        { onProgress: (p) => emitDownloadProgress(sourceId, guessPct(p), p) },
      );
    } else if (sourceId === "chrome-ai") {
      // Chrome gestiona su propia descarga de Gemini Nano al crear la sesión.
      const eng = await import("./builtin-engines");
      await eng.chromeAiChat([{ role: "user", content: "hola" }]);
    } else if (sourceId === "sipp-local") {
      // Sipp es beta: marcamos instalado (su carga real es perezosa al usarlo).
      markModelInstalled(sourceId);
    }
    finishDownload(sourceId, true);
    return { ok: true, message: "Modelo instalado y listo." };
  } catch (e: any) {
    finishDownload(sourceId, false, String(e?.message ?? e));
    return { ok: false, message: `No se pudo instalar: ${String(e?.message ?? e).slice(0, 160)}` };
  }
}

/** Heurística: extrae un % de un texto de progreso tipo "archivo 42%". */
function guessPct(text: string): number {
  const m = /(\d{1,3})\s*%/.exec(text || "");
  if (m) return Math.max(0, Math.min(100, parseInt(m[1], 10)));
  return 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CANDIDATOS DESCUBIERTOS · THE HUGGING BAY (jul-2026)
 * ---------------------------------------------------------------------------
 * Cuando el usuario pulsa "Usar en Astraura" sobre un modelo encontrado en la
 * Biblioteca → Hugging Bay (src/ai/astraura/huggingbay.ts), lo registramos
 * aquí como CANDIDATO conocido: no es una descarga (eso lo hace el propio
 * usuario con el comando del kit local, p.ej. `ollama pull <modelo>`), es solo
 * una anotación de "este modelo existe y el usuario quiere que Aurora lo tenga
 * en cuenta". El router (free-catalog/availability) puede consultarlo para
 * mostrarlo como sugerencia de modelo por tarea vía Ollama/LM Studio locales
 * ya presentes en el catálogo. Honesto: si el usuario no ha instalado
 * realmente el modelo con su herramienta local, Aurora no podrá usarlo — solo
 * queda anotado como intención para cuando lo instale.
 *
 * Persistencia propia (no reutiliza INSTALLED_MODELS_KEY, que es solo para las
 * fuentes builtin de navegador `DOWNLOADABLE_SOURCES`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const HUGGING_BAY_CANDIDATES_KEY = "starseed.astraura.huggingbay-candidates.v1";
export const HUGGING_BAY_CANDIDATES_EVENT = "starseed:astraura-huggingbay-candidates";

export interface HuggingBayCandidate {
  /** id de artefacto de Hugging Bay. */
  id: string;
  /** Nombre legible. */
  name: string;
  /** repo "owner/name" (referencia para Ollama/HF). */
  repo: string;
  /** Herramienta local elegida (ollama/lmstudio/…) al registrarlo. */
  tool: string;
  /** Comando copiado (para recordar cómo se instaló/instalará). */
  command: string;
  /** Momento del registro. */
  at: number;
}

function readCandidates(): HuggingBayCandidate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HUGGING_BAY_CANDIDATES_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? arr.filter((x): x is HuggingBayCandidate => !!x && typeof x === "object" && typeof (x as HuggingBayCandidate).id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeCandidates(list: HuggingBayCandidate[]): void {
  try {
    window.localStorage.setItem(HUGGING_BAY_CANDIDATES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(HUGGING_BAY_CANDIDATES_EVENT));
  } catch { /* noop */ }
}

/** Candidatos de Hugging Bay registrados por el usuario ("Usar en Astraura"). */
export function listHuggingBayCandidates(): HuggingBayCandidate[] {
  return readCandidates();
}

/** Registra (o actualiza) un candidato descubierto en Hugging Bay. Idempotente por id. */
export function registerHuggingBayCandidate(c: Omit<HuggingBayCandidate, "at">): HuggingBayCandidate {
  const entry: HuggingBayCandidate = { ...c, at: Date.now() };
  const next = [...readCandidates().filter((x) => x.id !== entry.id), entry];
  writeCandidates(next);
  return entry;
}

/** Quita un candidato registrado. */
export function removeHuggingBayCandidate(id: string): void {
  const next = readCandidates().filter((x) => x.id !== id);
  writeCandidates(next);
}

/** ¿Ya está este artefacto registrado como candidato? */
export function isHuggingBayCandidate(id: string): boolean {
  return readCandidates().some((x) => x.id === id);
}
