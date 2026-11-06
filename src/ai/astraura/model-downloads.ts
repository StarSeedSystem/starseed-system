"use client";

/**
 * StarSeed OS — GESTOR DE DESCARGAS EN SEGUNDO PLANO (Adenda 113).
 * ============================================================================
 * Capa de cola/observabilidad sobre `installed-models.ts`: coordina las descargas
 * de modelos locales, deja que sigan EN SEGUNDO PLANO mientras se usa el resto del
 * OS, expone su progreso a la UI y AVISA al completar (evento + toast global). El
 * descargador real y el marcado de instalado viven en `installed-models.ts`; aquí
 * solo se observa y se notifica. Lógica pura + un listener DOM opcional. Nunca lanza.
 */

import {
  MODEL_DOWNLOAD_EVENT,
  installModelInBackground,
  DOWNLOAD_SIZES,
  DOWNLOADABLE_SOURCES,
  isModelInstalled,
  markModelUninstalled,
} from "./installed-models";

export const DOWNLOAD_TASKS_EVENT = "starseed:model-download-tasks";
export const MODEL_DOWNLOAD_DONE_EVENT = "starseed:model-download-done";

export const STORAGE_KEY = "starseed.model-downloads.v1";
const MAX_COMPLETED_TASKS = 20;

export type DownloadState = "downloading" | "done" | "error";

export interface DownloadTask {
  sourceId: string;
  label: string;
  sizeLabel?: string;
  state: DownloadState;
  pct: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

/** Carga la cola desde localStorage (solo en navegador). */
function loadPersistedTasks(): DownloadTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const tasks: DownloadTask[] = parsed
      .filter(
        (t): t is DownloadTask =>
          t &&
          typeof t === "object" &&
          typeof t.sourceId === "string" &&
          typeof t.label === "string" &&
          typeof t.state === "string" &&
          typeof t.pct === "number" &&
          typeof t.startedAt === "number",
      )
      .map((t) => ({
        ...t,
        sizeLabel: t.sizeLabel,
        error: t.error,
        finishedAt: t.finishedAt,
      }));
    return applyRecoveryLogic(tasks);
  } catch {
    return [];
  }
}

/** Aplica la lógica de recuperación: done se conservan (máx 20), downloading → error. */
function applyRecoveryLogic(tasks: DownloadTask[]): DownloadTask[] {
  const done = tasks.filter((t) => t.state === "done").sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const keptDone = done.slice(0, MAX_COMPLETED_TASKS);
  const interrupted = tasks
    .filter((t) => t.state === "downloading")
    .map((t) => ({
      ...t,
      state: "error" as const,
      error: "interrumpida al recargar · vuelve a pulsar Descargar",
      pct: 0,
      finishedAt: nowSafe(),
    }));
  return [...keptDone, ...interrupted].sort((a, b) => b.startedAt - a.startedAt);
}

/** Guarda la cola en localStorage (solo en navegador). */
function savePersistedTasks(tasks: Map<string, DownloadTask>): void {
  if (typeof window === "undefined") return;
  try {
    const arr = [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* modo privado: no se recuerda */
  }
}

const LABELS: Record<string, string> = {
  "smollm3-webgpu": "SmolLM3 (navegador)",
  "smolvlm2-webgpu": "SmolVLM2 · visión (navegador)",
  webllm: "WebLLM · Llama 3.2 3B (navegador)",
  "sipp-local": "Sipp (local)",
  "chrome-ai": "Gemini Nano (Chrome AI)",
};

export function downloadLabel(sourceId: string): string {
  return LABELS[sourceId] ?? sourceId;
}

export const DOWNLOADABLE = DOWNLOADABLE_SOURCES;

function nowSafe(): number {
  try { return Date.now(); } catch { return 0; }
}

let tasksInitialized = false;
const tasks = new Map<string, DownloadTask>();
let lastCompleted: { sourceId: string; label: string; ok: boolean; error?: string } | null = null;
const listeners = new Set<() => void>();

/** Inicializa la cola desde localStorage (lazy, solo en navegador). */
function ensureTasksInitialized(): void {
  if (tasksInitialized || typeof window === "undefined") return;
  tasksInitialized = true;
  const persisted = loadPersistedTasks();
  for (const t of persisted) tasks.set(t.sourceId, t);
}

function emit(): void {
  for (const l of listeners) { try { l(); } catch { /* */ } }
  try { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DOWNLOAD_TASKS_EVENT)); } catch { /* */ }
  savePersistedTasks(tasks);
}

export function subscribeDownloadTasks(cb: () => void): () => void {
  ensureTasksInitialized();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function downloadTasksSnapshot(): DownloadTask[] {
  ensureTasksInitialized();
  return [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function taskFor(sourceId: string): DownloadTask | undefined {
  ensureTasksInitialized();
  return tasks.get(sourceId);
}

export function lastCompletedDownload(): { sourceId: string; label: string; ok: boolean; error?: string } | null {
  return lastCompleted;
}

/**
 * Procesa un evento de progreso/fin de descarga (lo usa el listener DOM y los
 * tests). Actualiza la tarea y, al terminar, fija `lastCompleted` y emite el
 * evento de notificación.
 */
export function _ingest(detail: { sourceId?: string; pct?: number; label?: string; done?: boolean; error?: string }): void {
  ensureTasksInitialized();
  const sourceId = detail?.sourceId;
  if (!sourceId) return;
  const cur: DownloadTask = tasks.get(sourceId) ?? {
    sourceId, label: downloadLabel(sourceId), sizeLabel: DOWNLOAD_SIZES[sourceId],
    state: "downloading", pct: 0, startedAt: nowSafe(),
  };
  if (detail.done) {
    cur.state = detail.error ? "error" : "done";
    cur.pct = detail.error ? cur.pct : 100;
    cur.error = detail.error;
    cur.finishedAt = nowSafe();
    tasks.set(sourceId, cur);
    lastCompleted = { sourceId, label: cur.label, ok: !detail.error, error: detail.error };
    emit();
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(MODEL_DOWNLOAD_DONE_EVENT, { detail: { sourceId, label: cur.label, ok: !detail.error, error: detail.error } }));
      }
    } catch { /* */ }
    return;
  }
  cur.state = "downloading";
  if (typeof detail.pct === "number") cur.pct = Math.max(0, Math.min(100, detail.pct));
  tasks.set(sourceId, cur);
  emit();
}

let wired = false;
function ensureWired(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener(MODEL_DOWNLOAD_EVENT, (ev: Event) => {
    const d = (ev as CustomEvent).detail;
    if (d) _ingest(d);
  });
}

/**
 * Inicia (o reanuda) la descarga EN SEGUNDO PLANO de una fuente descargable. El OS
 * sigue usándose con normalidad; al terminar se avisa. Best-effort.
 */
export async function startDownload(sourceId: string): Promise<{ ok: boolean; message: string }> {
  ensureWired();
  if (isModelInstalled(sourceId)) return { ok: true, message: "Ya está instalado." };
  _ingest({ sourceId, pct: 0, label: "Preparando…" });
  return installModelInBackground(sourceId); // emite progreso + finish → _ingest por el DOM
}

/** Desinstala una fuente descargable y limpia su tarea. */
export function uninstall(sourceId: string): void {
  ensureTasksInitialized();
  markModelUninstalled(sourceId);
  tasks.delete(sourceId);
  emit();
}
