"use client";

/**
 * Cerebros · OFFLINE + FUSIÓN — mirror local, cola offline, fusión no
 * destructiva, conflictos y ramas de memoria.
 * ============================================================================
 * Ver architecture/cerebros-memorias-graphify.md §8. Responsabilidad ÚNICA de
 * este módulo: que ninguna edición de memoria se pierda nunca, con o sin red,
 * y que la fusión al reconectar sea HONESTA (preserva todo; solo auto-fusiona
 * lo no-importante; lo importante se registra como conflicto para el humano).
 *
 * Persistencia 100% local (localStorage), por cerebro:
 *   · starseed.brain.<id>.memory-mirror.v1  — snapshot descargable/restaurable.
 *   · starseed.brain.<id>.offline-queue.v1  — cambios pendientes de subir.
 *   · starseed.brain.<id>.conflicts.v1      — discrepancias sin resolver.
 *
 * Defensivo/SSR-safe: try/catch en todo, nunca lanza. No sustituye a
 * memory-destinations.ts (StarSeed/externos); este módulo es el destino
 * "local (siempre)" de esa configuración.
 */

import {
  listMemoryFiles,
  saveMemoryFile,
  updateMemoryContent,
  type MemoryFile,
} from "@/lib/cerebro/memory-files";
import { inferMemoryType, isImportantMemory } from "@/lib/brains/memory-types";

/* ------------------------------------------------------------------ */
/* Claves + utilidades SSR-safe                                        */
/* ------------------------------------------------------------------ */

const mirrorKey = (brainId: string) => `starseed.brain.${brainId}.memory-mirror.v1`;
const queueKey = (brainId: string) => `starseed.brain.${brainId}.offline-queue.v1`;
const conflictsKey = (brainId: string) => `starseed.brain.${brainId}.conflicts.v1`;

/** Evento emitido al cambiar el registro de conflictos de un cerebro. */
export const BRAIN_CONFLICTS_EVENT = "starseed:brain-conflicts";
/** Evento emitido tras cada fusión/flush de la cola offline. */
export const BRAIN_OFFLINE_FLUSH_EVENT = "starseed:brain-offline-flush";

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isClient()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota/modo privado: degrada en silencio */
  }
}

function emit(event: string, detail?: unknown): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new CustomEvent(event, { detail }));
  } catch {
    /* noop */
  }
}

/** ¿El navegador se declara online? (SSR-safe; asume true en servidor). */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/* ------------------------------------------------------------------ */
/* Mirror local (snapshot vivo, exportable/restaurable)                 */
/* ------------------------------------------------------------------ */

export interface MirrorEntry {
  id: string;
  brain_id: string | null;
  name: string;
  content: string;
  meta: Record<string, unknown>;
  updated_at?: string;
}

function toMirrorEntry(f: MemoryFile): MirrorEntry {
  return { id: f.id, brain_id: f.brain_id, name: f.name, content: f.content, meta: f.meta, updated_at: f.updated_at };
}

/** Lee el mirror local actual de un cerebro (snapshot de la última exportación). */
export function readMirror(brainId: string): MirrorEntry[] {
  return readJson<MirrorEntry[]>(mirrorKey(brainId), []);
}

/**
 * Actualiza el mirror local con el estado ACTUAL del cerebro (online) y
 * devuelve el bundle JSON exportable. Es el "descargar cerebro a dispositivo"
 * (§8 del SOP): tras esto, el cerebro es consultable/editable sin red.
 */
export async function exportBrainMemory(brainId: string, brainName?: string): Promise<string> {
  try {
    const files = await listMemoryFiles(brainId);
    const entries = files.map(toMirrorEntry);
    writeJson(mirrorKey(brainId), entries);
    const bundle = {
      starseedBrainMemoryMirror: 1,
      brainId,
      brainName: brainName ?? null,
      exportedAt: new Date().toISOString(),
      files: entries,
    };
    return JSON.stringify(bundle, null, 2);
  } catch {
    return JSON.stringify({ starseedBrainMemoryMirror: 1, brainId, exportedAt: new Date().toISOString(), files: [] });
  }
}

type FileSystemAccessWindow = Window & {
  showSaveFilePicker?: (opts?: unknown) => Promise<{
    createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

/** Descarga el bundle exportado como fichero .json (File System Access o descarga clásica). */
export async function downloadBrainMemoryBackup(brainId: string, brainName?: string): Promise<{ ok: boolean; message: string }> {
  if (typeof window === "undefined") return { ok: false, message: "No disponible en el servidor." };
  const json = await exportBrainMemory(brainId, brainName);
  const filename = `starseed-cerebro-${brainId.slice(0, 8)}-memorias.json`;
  const w = window as FileSystemAccessWindow;
  try {
    if (typeof w.showSaveFilePicker === "function") {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Memorias del cerebro StarSeed", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return { ok: true, message: "Copia de memorias guardada en el archivo elegido." };
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, message: "Guardado cancelado." };
  }
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, message: "Copia de memorias descargada." };
  } catch (e) {
    return { ok: false, message: `No se pudo exportar: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Importa un bundle exportado. Por defecto crea filas NUEVAS (seguro entre
 * cuentas/cerebros); `opts.overwrite` reutiliza los ids originales (restaurar
 * el mismo cerebro/cuenta). Actualiza también el mirror local. Nunca lanza.
 */
export async function importBrainMemory(
  brainId: string,
  json: string,
  opts?: { overwrite?: boolean },
): Promise<{ ok: boolean; imported: number; message: string }> {
  try {
    const parsed = JSON.parse(json) as { files?: MirrorEntry[] } | MirrorEntry[];
    const files = Array.isArray(parsed) ? parsed : parsed.files ?? [];
    if (!Array.isArray(files) || files.length === 0) {
      return { ok: false, imported: 0, message: "El archivo no contiene memorias reconocibles." };
    }
    let imported = 0;
    for (const f of files) {
      const saved = await saveMemoryFile({
        id: opts?.overwrite ? f.id : undefined,
        brain_id: brainId,
        name: f.name,
        content: f.content,
        meta: f.meta ?? {},
        source: "starseed",
      });
      if (saved) imported++;
    }
    await exportBrainMemory(brainId); // refresca el mirror con el resultado real
    return { ok: imported > 0, imported, message: `${imported}/${files.length} memorias importadas.` };
  } catch (e) {
    return { ok: false, imported: 0, message: `Archivo inválido: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ------------------------------------------------------------------ */
/* Cola offline (cambios pendientes de subir)                          */
/* ------------------------------------------------------------------ */

export interface QueuedChange {
  id: string;
  brainId: string;
  fileId: string;
  fileName: string;
  content: string;
  /** `updated_at` remoto conocido cuando se encoló (para detectar conflicto). */
  baseUpdatedAt?: string;
  queuedAt: string;
}

function newChangeId(): string {
  return `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readOfflineQueue(brainId: string): QueuedChange[] {
  return readJson<QueuedChange[]>(queueKey(brainId), []);
}

function writeOfflineQueue(brainId: string, queue: QueuedChange[]): void {
  writeJson(queueKey(brainId), queue);
}

/**
 * Escribe el contenido de una memoria de forma RESILIENTE: intenta guardar en
 * remoto; si falla o no hay red, encola el cambio (nunca se pierde) y
 * actualiza igualmente el mirror local (optimista) para que la UI no se
 * bloquee. Devuelve si quedó guardado en remoto (`synced`) o solo encolado.
 */
export async function writeMemoryContentResilient(
  file: Pick<MemoryFile, "id" | "brain_id" | "name" | "updated_at">,
  content: string,
): Promise<{ synced: boolean }> {
  const brainId = file.brain_id ?? "__account__";

  // Optimista: refleja el cambio en el mirror local de inmediato.
  try {
    const mirror = readMirror(brainId);
    const idx = mirror.findIndex((m) => m.id === file.id);
    const entry: MirrorEntry = {
      id: file.id,
      brain_id: file.brain_id,
      name: file.name,
      content,
      meta: idx >= 0 ? mirror[idx].meta : {},
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) mirror[idx] = entry;
    else mirror.push(entry);
    writeJson(mirrorKey(brainId), mirror);
  } catch {
    /* el mirror es una comodidad, no bloquea el guardado */
  }

  if (isOnline()) {
    try {
      const ok = await updateMemoryContent(file.id, content);
      if (ok) return { synced: true };
    } catch {
      /* cae a la cola */
    }
  }

  const queue = readOfflineQueue(brainId);
  queue.push({
    id: newChangeId(),
    brainId,
    fileId: file.id,
    fileName: file.name,
    content,
    baseUpdatedAt: file.updated_at,
    queuedAt: new Date().toISOString(),
  });
  writeOfflineQueue(brainId, queue);
  return { synced: false };
}

/* ------------------------------------------------------------------ */
/* Conflictos                                                          */
/* ------------------------------------------------------------------ */

export interface MemoryConflict {
  id: string;
  brainId: string;
  fileId: string;
  fileName: string;
  localContent: string;
  remoteContent: string;
  baseUpdatedAt?: string;
  detectedAt: string;
  resolved: boolean;
}

export function listConflicts(brainId: string): MemoryConflict[] {
  return readJson<MemoryConflict[]>(conflictsKey(brainId), []).filter((c) => !c.resolved);
}

function pushConflict(conflict: MemoryConflict): void {
  const all = readJson<MemoryConflict[]>(conflictsKey(conflict.brainId), []);
  all.push(conflict);
  writeJson(conflictsKey(conflict.brainId), all);
  emit(BRAIN_CONFLICTS_EVENT, { brainId: conflict.brainId });
}

/**
 * Resuelve un conflicto eligiendo la versión local, la remota, o un texto
 * fusionado manualmente. Aplica el resultado al remoto (si hay red) y marca
 * el conflicto como resuelto. Nunca lanza.
 */
export async function resolveConflict(
  brainId: string,
  conflictId: string,
  resolution: "local" | "remote" | "merged",
  mergedText?: string,
): Promise<boolean> {
  try {
    const all = readJson<MemoryConflict[]>(conflictsKey(brainId), []);
    const idx = all.findIndex((c) => c.id === conflictId);
    if (idx === -1) return false;
    const c = all[idx];
    const finalText =
      resolution === "local" ? c.localContent : resolution === "remote" ? c.remoteContent : mergedText ?? c.remoteContent;
    const ok = await updateMemoryContent(c.fileId, finalText);
    all[idx] = { ...c, resolved: true };
    writeJson(conflictsKey(brainId), all);
    emit(BRAIN_CONFLICTS_EVENT, { brainId });
    return ok;
  } catch {
    return false;
  }
}

/** Se suscribe a cambios del registro de conflictos (cualquier cerebro). Devuelve función de limpieza. */
export function subscribeBrainConflicts(cb: () => void): () => void {
  if (!isClient()) return () => {};
  window.addEventListener(BRAIN_CONFLICTS_EVENT, cb);
  return () => window.removeEventListener(BRAIN_CONFLICTS_EVENT, cb);
}

/* ------------------------------------------------------------------ */
/* Fusión al reconectar (preserva-todo, nunca inventa un merge de prosa) */
/* ------------------------------------------------------------------ */

function mergedMarkdown(local: string, remote: string): string {
  const now = new Date().toLocaleString();
  return (
    `${remote.trim()}\n\n` +
    `## (fusión automática · ${now})\n` +
    `La versión local (sin sincronizar) se preserva íntegra debajo — revísala y limpia si procede.\n\n` +
    `${local.trim()}\n`
  );
}

export interface FlushResult {
  brainId: string;
  applied: number;
  autoMerged: number;
  conflicts: number;
}

/**
 * Vacía la cola offline de un cerebro: aplica sin conflicto lo que se pueda,
 * fusiona automáticamente lo NO importante, y registra como conflicto lo que
 * SÍ es importante (soul/ego o `meta.important`). Idempotente y defensivo.
 */
export async function flushOfflineQueue(brainId: string): Promise<FlushResult> {
  const result: FlushResult = { brainId, applied: 0, autoMerged: 0, conflicts: 0 };
  if (!isOnline()) return result;
  try {
    const queue = readOfflineQueue(brainId);
    if (queue.length === 0) return result;
    const remoteFiles = await listMemoryFiles(brainId === "__account__" ? null : brainId);
    const remoteById = new Map(remoteFiles.map((f) => [f.id, f]));
    const remaining: QueuedChange[] = [];

    for (const change of queue) {
      const remote = remoteById.get(change.fileId);
      if (!remote) {
        // El fichero ya no existe remotamente: no se puede aplicar; se descarta
        // con seguridad (el mirror local conserva el contenido igualmente).
        continue;
      }
      const remoteChanged =
        !!change.baseUpdatedAt && !!remote.updated_at && new Date(remote.updated_at) > new Date(change.baseUpdatedAt);

      if (!remoteChanged) {
        const ok = await updateMemoryContent(change.fileId, change.content);
        if (ok) result.applied++;
        else remaining.push(change);
        continue;
      }

      const type = inferMemoryType(remote.name, remote.meta);
      if (isImportantMemory(remote.meta, type.id)) {
        pushConflict({
          id: newChangeId(),
          brainId,
          fileId: change.fileId,
          fileName: change.fileName,
          localContent: change.content,
          remoteContent: remote.content,
          baseUpdatedAt: change.baseUpdatedAt,
          detectedAt: new Date().toISOString(),
          resolved: false,
        });
        result.conflicts++;
      } else {
        const merged = mergedMarkdown(change.content, remote.content);
        const ok = await updateMemoryContent(change.fileId, merged);
        if (ok) result.autoMerged++;
        else remaining.push(change);
      }
    }

    writeOfflineQueue(brainId, remaining);
    emit(BRAIN_OFFLINE_FLUSH_EVENT, result);
    return result;
  } catch {
    return result;
  }
}

/** Ids de cerebro con cola offline pendiente (escanea localStorage). SSR-safe. */
function brainsWithPendingQueue(): string[] {
  if (!isClient()) return [];
  try {
    const ids: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      const m = key?.match(/^starseed\.brain\.(.+)\.offline-queue\.v1$/);
      if (m) ids.push(m[1]);
    }
    return ids;
  } catch {
    return [];
  }
}

let offlineSyncStarted = false;
const OFFLINE_SYNC_FLAG = "__STARSEED_MEMORY_OFFLINE_SYNC__";

/**
 * Arranca el listener de reconexión: al volver a haber red, vacía la cola
 * offline de TODOS los cerebros con cambios pendientes. Idempotente
 * (singleton por window, HMR-safe), igual patrón que realtime-sync.ts.
 */
export function startOfflineSync(): void {
  if (!isClient() || offlineSyncStarted) return;
  try {
    if ((window as unknown as Record<string, boolean>)[OFFLINE_SYNC_FLAG]) return;
    (window as unknown as Record<string, boolean>)[OFFLINE_SYNC_FLAG] = true;
    offlineSyncStarted = true;
    const flushAll = () => {
      for (const brainId of brainsWithPendingQueue()) void flushOfflineQueue(brainId);
    };
    window.addEventListener("online", flushAll);
    if (isOnline()) flushAll(); // por si había cola de una sesión anterior
  } catch {
    /* no-op defensivo */
  }
}

/* ------------------------------------------------------------------ */
/* Ramas de memoria (branch al editar en conflicto)                    */
/* ------------------------------------------------------------------ */

/**
 * Crea una RAMA de una memoria: una fila nueva e independiente con
 * `meta.branchOf = original.id`, editable sin afectar al original. El
 * original NUNCA se toca. Devuelve la rama creada o null.
 */
export async function createMemoryBranch(
  original: Pick<MemoryFile, "id" | "brain_id" | "name" | "meta">,
  content: string,
  label: string,
): Promise<MemoryFile | null> {
  try {
    const branchLabel = label.trim() || `rama ${new Date().toLocaleString()}`;
    return await saveMemoryFile({
      brain_id: original.brain_id,
      name: `${original.name.replace(/\.md$/i, "")} (${branchLabel}).md`,
      content,
      source: "starseed",
      meta: { ...original.meta, branchOf: original.id, branchLabel },
    });
  } catch {
    return null;
  }
}

/**
 * Aplica el contenido de una rama sobre su memoria objetivo (manual, nunca
 * automático). `strategy:"replace"` sustituye el contenido; `"append"` lo
 * añade al final bajo un separador. La rama NO se borra sola (decisión del
 * usuario) — el llamador puede archivarla/eliminarla aparte si quiere.
 */
export async function mergeBranch(
  branch: Pick<MemoryFile, "content">,
  target: Pick<MemoryFile, "id" | "content">,
  strategy: "replace" | "append" = "replace",
): Promise<boolean> {
  try {
    const finalContent =
      strategy === "replace" ? branch.content : `${target.content.trim()}\n\n---\n\n${branch.content.trim()}\n`;
    return await updateMemoryContent(target.id, finalContent);
  } catch {
    return false;
  }
}
