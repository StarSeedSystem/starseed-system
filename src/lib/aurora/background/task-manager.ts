"use client";

/**
 * Aurora · Tareas en Segundo Plano — gestor de tareas «en proceso»
 * ----------------------------------------------------------------------------
 * Registro ligero de tareas que Aurora mantiene EN PROCESO mientras sigue la
 * conversación de voz. Pensado para que las acciones largas de Aurora (buscar,
 * rastrear, ejecutar un agente, generar algo…) se registren y el usuario vea el
 * progreso SIN interrumpir la voz: la burbuja del orbe / el Exocórtex se
 * suscriben a `aurora:bg-tasks` y pintan el estado.
 *
 * Estado (SSR-safe):
 *   • En memoria: un array de BgTask, fuente de verdad en runtime.
 *   • Persistencia: localStorage ('starseed.aurora.bgtasks.v1'), para sobrevivir
 *     recargas. Se lee perezosamente en el primer acceso dentro del navegador.
 *   • Eventos: cada mutación emite `aurora:bg-tasks` con la lista completa, de
 *     modo que cualquier superficie se sincronice sin acoplarse a este módulo.
 *
 * 100% aditivo y defensivo: nada aquí toca window/document a nivel de módulo y
 * ninguna función lanza; fuera del navegador todo degrada con gracia.
 */

// ── Clave de persistencia y evento ───────────────────────────────────────────
export const AURORA_BG_TASKS_KEY = "starseed.aurora.bgtasks.v1";
/** Evento emitido en cada cambio del registro de tareas (detail = BgTask[]). */
export const AURORA_BG_TASKS_EVENT = "aurora:bg-tasks";

// ── Tipos públicos ───────────────────────────────────────────────────────────

/** Estado del ciclo de vida de una tarea en segundo plano. */
export type BgTaskStatus = "pending" | "running" | "done" | "error";

/** Una tarea que Aurora mantiene «en proceso». */
export interface BgTask {
  /** Id estable (uuid o fallback). */
  id: string;
  /** Título corto y decible («Buscando en tus memorias»). */
  title: string;
  /** Estado actual. */
  status: BgTaskStatus;
  /** Detalle opcional (última nota de progreso o motivo de error). */
  detail?: string;
  /** Creación (epoch ms). */
  createdAt: number;
  /** Última actualización (epoch ms). */
  updatedAt: number;
  /** Progreso 0..100 opcional. */
  progress?: number;
}

/** Parche parcial admitido por updateTask (title/status/detail/progress). */
export interface BgTaskPatch {
  title?: string;
  status?: BgTaskStatus;
  detail?: string;
  progress?: number;
}

// ── Utilidades base (SSR-safe) ───────────────────────────────────────────────

function isClient(): boolean {
  return typeof window !== "undefined";
}

function now(): number {
  return Date.now();
}

function uuid(): string {
  try {
    if (isClient() && typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* noop */ }
  return "bg_" + Math.random().toString(36).slice(2) + now().toString(36);
}

function clampProgress(p: unknown): number | undefined {
  if (typeof p !== "number" || !Number.isFinite(p)) return undefined;
  return Math.max(0, Math.min(100, Math.round(p)));
}

function isValidStatus(s: unknown): s is BgTaskStatus {
  return s === "pending" || s === "running" || s === "done" || s === "error";
}

/** Normaliza (defensivamente) un objeto crudo a BgTask; null si es inválido. */
function coerceTask(raw: unknown): BgTask | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : uuid();
  const title = typeof o.title === "string" ? o.title : "";
  if (!title.trim()) return null;
  const status = isValidStatus(o.status) ? o.status : "pending";
  const createdAt = typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : now();
  const updatedAt = typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt) ? o.updatedAt : createdAt;
  const task: BgTask = { id, title: title.trim(), status, createdAt, updatedAt };
  if (typeof o.detail === "string" && o.detail.trim()) task.detail = o.detail.trim();
  const prog = clampProgress(o.progress);
  if (prog !== undefined) task.progress = prog;
  return task;
}

// ── Estado en memoria + carga perezosa desde localStorage ────────────────────

let tasks: BgTask[] | null = null; // null ⇒ aún no hidratado en este runtime

function load(): BgTask[] {
  if (tasks) return tasks;
  tasks = [];
  if (!isClient()) return tasks;
  try {
    const raw = window.localStorage.getItem(AURORA_BG_TASKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        tasks = parsed.map(coerceTask).filter((t): t is BgTask => t !== null);
      }
    }
  } catch {
    tasks = [];
  }
  return tasks;
}

function persist(): void {
  if (!isClient() || !tasks) return;
  try {
    window.localStorage.setItem(AURORA_BG_TASKS_KEY, JSON.stringify(tasks));
  } catch { /* cuota/priv: ignoramos, seguimos en memoria */ }
}

/** Copia superficial (inmutable de cara a los suscriptores). */
function snapshot(): BgTask[] {
  return load().map((t) => ({ ...t }));
}

function emit(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(
      new CustomEvent<BgTask[]>(AURORA_BG_TASKS_EVENT, { detail: snapshot() }),
    );
  } catch { /* noop */ }
}

/** Persiste y notifica en una sola llamada tras mutar `tasks`. */
function commit(): void {
  persist();
  emit();
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Crea una tarea (por defecto `pending`) y la registra. Devuelve la tarea creada.
 * `opts` permite arrancar directamente en otro estado o con detalle/progreso.
 */
export function createTask(
  title: string,
  opts?: { status?: BgTaskStatus; detail?: string; progress?: number; id?: string },
): BgTask {
  const list = load();
  const t: BgTask = {
    id: opts?.id && String(opts.id).trim() ? String(opts.id) : uuid(),
    title: String(title ?? "").trim() || "Tarea",
    status: isValidStatus(opts?.status) ? (opts!.status as BgTaskStatus) : "pending",
    createdAt: now(),
    updatedAt: now(),
  };
  if (opts?.detail && String(opts.detail).trim()) t.detail = String(opts.detail).trim();
  const prog = clampProgress(opts?.progress);
  if (prog !== undefined) t.progress = prog;
  list.push(t);
  commit();
  return { ...t };
}

/**
 * Aplica un parche a una tarea (por id). Actualiza `updatedAt`. Devuelve la
 * tarea resultante o null si no existe.
 */
export function updateTask(id: string, patch: BgTaskPatch): BgTask | null {
  const list = load();
  const t = list.find((x) => x.id === id);
  if (!t) return null;
  if (typeof patch.title === "string" && patch.title.trim()) t.title = patch.title.trim();
  if (isValidStatus(patch.status)) t.status = patch.status;
  if (typeof patch.detail === "string") {
    const d = patch.detail.trim();
    if (d) t.detail = d; else delete t.detail;
  }
  if ("progress" in patch) {
    const p = clampProgress(patch.progress);
    if (p !== undefined) t.progress = p; else delete t.progress;
  }
  t.updatedAt = now();
  commit();
  return { ...t };
}

/** Marca una tarea como `done` (opcionalmente con detalle). progress → 100. */
export function completeTask(id: string, detail?: string): BgTask | null {
  return updateTask(id, { status: "done", progress: 100, ...(detail ? { detail } : {}) });
}

/** Marca una tarea como `error` (opcionalmente con el motivo). */
export function failTask(id: string, detail?: string): BgTask | null {
  return updateTask(id, { status: "error", ...(detail ? { detail } : {}) });
}

/** Elimina una tarea por id. Devuelve true si existía. */
export function removeTask(id: string): boolean {
  const list = load();
  const i = list.findIndex((x) => x.id === id);
  if (i === -1) return false;
  list.splice(i, 1);
  commit();
  return true;
}

/** Elimina las tareas ya terminadas (done/error). Devuelve cuántas quitó. */
export function clearFinishedTasks(): number {
  const list = load();
  const before = list.length;
  const kept = list.filter((t) => t.status === "pending" || t.status === "running");
  if (kept.length === before) return 0;
  tasks = kept;
  commit();
  return before - kept.length;
}

/** Lista (copia) de todas las tareas, de la más reciente a la más antigua. */
export function listTasks(): BgTask[] {
  return snapshot().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Solo las tareas activas (pending/running), de la más reciente a la antigua. */
export function listActiveTasks(): BgTask[] {
  return listTasks().filter((t) => t.status === "pending" || t.status === "running");
}

/** Busca una tarea por id (copia) o null. */
export function getTask(id: string): BgTask | null {
  const t = load().find((x) => x.id === id);
  return t ? { ...t } : null;
}

/**
 * Suscribe un callback a los cambios del registro (mismo tab vía CustomEvent,
 * otros tabs vía `storage`). Recibe SIEMPRE la lista completa. Devuelve la
 * función de baja. Emite un primer disparo inmediato con el estado actual.
 */
export function subscribe(cb: (tasks: BgTask[]) => void): () => void {
  if (!isClient()) return () => {};
  const onCustom = (e: Event) => {
    const d = (e as CustomEvent<BgTask[]>).detail;
    cb(Array.isArray(d) ? d : snapshot());
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== AURORA_BG_TASKS_KEY) return;
    // Otra pestaña cambió el almacén: re-hidratamos desde disco.
    tasks = null;
    cb(snapshot());
  };
  window.addEventListener(AURORA_BG_TASKS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  try { cb(snapshot()); } catch { /* noop */ }
  return () => {
    window.removeEventListener(AURORA_BG_TASKS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Frase corta y decible con el estado de las tareas en curso (para que Aurora
 * lo lea en voz). Sin argumentos usa la lista actual.
 */
export function summarizeTasks(list: BgTask[] = listTasks()): string {
  if (!list || list.length === 0) return "No tienes tareas en segundo plano ahora mismo.";
  const running = list.filter((t) => t.status === "running");
  const pending = list.filter((t) => t.status === "pending");
  const done = list.filter((t) => t.status === "done");
  const error = list.filter((t) => t.status === "error");
  const partes: string[] = [];
  const describe = (t: BgTask) => (typeof t.progress === "number" ? `${t.title} (${t.progress}%)` : t.title);
  if (running.length > 0) partes.push(`En curso: ${running.map(describe).join(", ")}`);
  if (pending.length > 0) partes.push(`En espera: ${pending.map((t) => t.title).join(", ")}`);
  if (done.length > 0) partes.push(`Terminada${done.length === 1 ? "" : "s"}: ${done.map((t) => t.title).join(", ")}`);
  if (error.length > 0) partes.push(`Con error: ${error.map((t) => t.title).join(", ")}`);
  return partes.join(". ") + ".";
}

// ── runInBackground: ejecuta una función larga como tarea de fondo ───────────

/**
 * Crea una tarea, la marca `running`, ejecuta `fn` y la completa (o la falla si
 * lanza). Devuelve el resultado de `fn` (o null si falló) junto al id de la
 * tarea, para que el llamador pueda seguir hilando la conversación. NUNCA lanza:
 * cualquier error se captura y se refleja en la tarea (status `error`).
 *
 * Pensado para que las acciones largas de Aurora se registren y el usuario vea
 * el progreso sin interrumpir la voz:
 *
 *     const { id } = await runInBackground("Rastreando la web", async () => {
 *       return await runAuroraTool("crawl_url", { url });
 *     });
 */
export async function runInBackground<T>(
  title: string,
  fn: (task: BgTask, api: {
    update: (patch: BgTaskPatch) => void;
    progress: (n: number, detail?: string) => void;
  }) => Promise<T> | T,
): Promise<{ id: string; ok: boolean; result: T | null; task: BgTask | null }> {
  const created = createTask(title, { status: "running" });
  const id = created.id;
  const api = {
    update: (patch: BgTaskPatch) => { updateTask(id, patch); },
    progress: (n: number, detail?: string) => {
      updateTask(id, { progress: n, ...(detail ? { detail } : {}) });
    },
  };
  try {
    const result = await fn(created, api);
    const task = completeTask(id);
    return { id, ok: true, result, task };
  } catch (err) {
    let msg = "Falló la tarea.";
    try { if (err instanceof Error && err.message) msg = err.message; } catch { /* noop */ }
    const task = failTask(id, msg);
    return { id, ok: false, result: null, task };
  }
}
