/**
 * Batch Processing — al estilo de la Anthropic Message Batches API, pero
 * provider-agnostic: cualquier IA (Claude, OpenAI, local Ollama, Gemini,
 * skills locales) puede procesar lotes asincrónicos.
 *
 * El usuario (o el sistema) puede crear un BatchJob con N requests, lanzarlo
 * y consultar resultados. Útil para:
 *   - resúmenes masivos de la memoria/historias
 *   - reindexado de FTS
 *   - generación de embeddings
 *   - operaciones a 1000+ archivos
 *   - workflows nocturnos sin atención
 *
 * Persistencia local; en producción se sube a un worker o al backend.
 */

export type BatchStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'canceled';
export type BatchProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'skill' | 'mixed';

export interface BatchRequest {
  custom_id: string;
  /** Mensajes a enviar (formato chat) o args si el provider es 'skill'. */
  payload: any;
  /** Cuál skill ejecutar si provider==='skill'. */
  skillId?: string;
  /** Override del modelo. */
  model?: string;
}

export interface BatchResult {
  custom_id: string;
  status: 'success' | 'error';
  output?: any;
  error?: string;
  ms?: number;
}

export interface BatchJob {
  id: string;
  label: string;
  description?: string;
  provider: BatchProvider;
  status: BatchStatus;
  requests: BatchRequest[];
  results: BatchResult[];
  /** Configurable por el usuario. */
  config: {
    concurrency: number;
    retries: number;
    timeoutMs: number;
    /** Prioriza proveedor local/gratuito. */
    preferFree: boolean;
    /** Si una request falla, ¿abortar todo? */
    failFast: boolean;
  };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Estadísticas para gráficas. */
  stats: {
    success: number;
    failed: number;
    avgMs: number;
  };
}

const STORAGE_KEY = 'starseed.batch.jobs.v1';

const DEFAULT_CONFIG: BatchJob['config'] = {
  concurrency: 4,
  retries: 2,
  timeoutMs: 30_000,
  preferFree: true,
  failFast: false,
};

class BatchProcessor {
  private jobs: BatchJob[] = [];
  private loaded = false;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded) return;
    if (typeof window === 'undefined') { this.loaded = true; return; }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.jobs = JSON.parse(raw);
    } catch { /* noop */ }
    this.loaded = true;
  }

  private persist() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.jobs)); } catch { /* noop */ }
    this.listeners.forEach((fn) => fn());
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  all(): BatchJob[] { this.load(); return this.jobs; }
  get(id: string): BatchJob | undefined { this.load(); return this.jobs.find((j) => j.id === id); }

  create(params: Omit<BatchJob, 'id' | 'status' | 'results' | 'createdAt' | 'stats' | 'config'> & {
    config?: Partial<BatchJob['config']>;
  }): BatchJob {
    this.load();
    const job: BatchJob = {
      id: `batch-${Date.now().toString(36)}`,
      label: params.label,
      description: params.description,
      provider: params.provider,
      status: 'queued',
      requests: params.requests,
      results: [],
      config: { ...DEFAULT_CONFIG, ...(params.config ?? {}) },
      createdAt: new Date().toISOString(),
      stats: { success: 0, failed: 0, avgMs: 0 },
    };
    this.jobs.unshift(job);
    this.persist();
    return job;
  }

  cancel(id: string) {
    const j = this.get(id);
    if (!j || j.status === 'completed') return;
    this.update(id, { status: 'canceled' });
  }

  remove(id: string) {
    this.load();
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.persist();
  }

  private update(id: string, patch: Partial<BatchJob>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    this.persist();
  }

  /**
   * Ejecuta el batch. Usa un dispatcher inyectable para no acoplar
   * a un provider específico — así puede correr con Claude, Ollama,
   * un MCP, o una skill local.
   */
  async run(id: string, dispatcher: (req: BatchRequest) => Promise<any>): Promise<BatchJob | null> {
    const job = this.get(id);
    if (!job) return null;
    if (job.status === 'in_progress' || job.status === 'completed') return job;

    this.update(id, { status: 'in_progress', startedAt: new Date().toISOString() });

    const results: BatchResult[] = [];
    const queue = [...job.requests];
    const concurrency = Math.max(1, job.config.concurrency);

    const startMs = Date.now();
    const runOne = async (req: BatchRequest): Promise<BatchResult> => {
      const t0 = Date.now();
      let attempt = 0;
      while (attempt <= job.config.retries) {
        try {
          const output = await Promise.race([
            dispatcher(req),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), job.config.timeoutMs)),
          ]);
          return { custom_id: req.custom_id, status: 'success', output, ms: Date.now() - t0 };
        } catch (e: any) {
          attempt++;
          if (attempt > job.config.retries) {
            return { custom_id: req.custom_id, status: 'error', error: String(e?.message ?? e), ms: Date.now() - t0 };
          }
        }
      }
      return { custom_id: req.custom_id, status: 'error', error: 'unreachable', ms: Date.now() - t0 };
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (queue.length) {
          const req = queue.shift();
          if (!req) break;
          const current = this.get(id);
          if (!current || current.status === 'canceled') break;
          const r = await runOne(req);
          results.push(r);
          // Actualizar progreso parcial cada N items
          if (results.length % 5 === 0) {
            this.update(id, { results: [...results] });
          }
          if (r.status === 'error' && job.config.failFast) {
            queue.length = 0;
            break;
          }
        }
      })());
    }
    await Promise.all(workers);

    const success = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const avgMs = results.length ? Math.round(results.reduce((a, r) => a + (r.ms ?? 0), 0) / results.length) : 0;

    this.update(id, {
      status: this.get(id)?.status === 'canceled' ? 'canceled' : (failed && job.config.failFast ? 'failed' : 'completed'),
      results,
      finishedAt: new Date().toISOString(),
      stats: { success, failed, avgMs },
    });
    return this.get(id) ?? null;
  }

  stats() {
    this.load();
    return {
      total: this.jobs.length,
      queued: this.jobs.filter((j) => j.status === 'queued').length,
      inProgress: this.jobs.filter((j) => j.status === 'in_progress').length,
      completed: this.jobs.filter((j) => j.status === 'completed').length,
      failed: this.jobs.filter((j) => j.status === 'failed').length,
      totalRequests: this.jobs.reduce((a, j) => a + j.requests.length, 0),
    };
  }
}

let _processor: BatchProcessor | null = null;
export function getBatchProcessor(): BatchProcessor {
  if (!_processor) _processor = new BatchProcessor();
  return _processor;
}

/**
 * Dispatcher inteligente: elige automáticamente el provider según prioridades.
 * - Si preferFree, intenta Ollama (local) primero, luego skill, luego Claude/OpenAI.
 * - Si falla un provider, intenta el siguiente.
 */
export async function smartDispatch(req: BatchRequest, preferFree = true): Promise<any> {
  // Stub: en producción inspecciona /providers y elige. Aquí es un puente.
  if (req.skillId) {
    return { handled_by: 'skill', skillId: req.skillId, args: req.payload };
  }
  if (preferFree) {
    return { handled_by: 'ollama-local', payload: req.payload };
  }
  return { handled_by: 'cloud', payload: req.payload };
}
