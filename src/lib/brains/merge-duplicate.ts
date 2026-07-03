"use client";

/**
 * Cerebros & Memorias — FUSIONAR y DUPLICAR
 * ==========================================
 *
 * Lógica ADITIVA y retrocompatible para:
 *   • Duplicar un cerebro (copia con nuevo id, conservando config/includes/servers/memorias).
 *   • Fusionar dos cerebros en uno nuevo (unión sin duplicar; NO destruye los originales
 *     salvo opción explícita `replaceSources`).
 *   • Duplicar una memoria (copia con nuevo id).
 *   • Fusionar varias memorias en una nueva (concatena/uniona secciones con encabezados),
 *     sin borrar las originales salvo opción explícita `removeSources`.
 *
 * Persistencia: reutiliza EXCLUSIVAMENTE las APIs de store existentes —
 *   - Cerebros: `@/lib/brains/brains` (Supabase `brains`, RLS por owner).
 *   - Memorias: `@/lib/memory-vault` (localStorage `starseed.memory.vault.v1`).
 * No se toca ningún esquema ni fichero de store; todo se apoya en sus funciones públicas.
 *
 * Diseño defensivo: SSR-safe (las rutas de memoria salen pronto en servidor),
 * try/catch en las async, dedup por id, y NUNCA lanza en los flujos "felices"
 * (devuelve null / resultado parcial). Pensado para invocarse desde la UI de
 * Cerebros (BrainsPanel) con previsualización.
 */

import {
  saveBrain,
  getBrain,
  deleteBrain,
  newServerId,
  duplicateBrain as duplicateBrainRow,
  type Brain,
  type BrainServer,
  type BrainIncludes,
  type BrainPermission,
} from "@/lib/brains/brains";
import {
  listMemories,
  getMemory,
  createMemory,
  deleteMemory,
  duplicateMemory as duplicateMemoryDocRow,
  type MemoryDoc,
} from "@/lib/memory-vault";

/* ====================================================================== */
/* Utilidades comunes                                                      */
/* ====================================================================== */

/** Une dos listas de strings preservando orden y eliminando duplicados. */
function unionStrings(a: string[] = [], b: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...a, ...b]) {
    if (x == null) continue;
    const key = String(x);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Une listas de permisos evitando duplicados exactos (por who+level). */
function unionPermissions(
  a: BrainPermission[] = [],
  b: BrainPermission[] = [],
): BrainPermission[] {
  const seen = new Set<string>();
  const out: BrainPermission[] = [];
  for (const p of [...a, ...b]) {
    if (!p || typeof p !== "object") continue;
    const key = `${p.who ?? ""}::${p.level ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ who: p.who ?? "", level: p.level ?? "lectura" });
  }
  return out;
}

/** Normaliza `permissions` (puede venir como array o como Record). */
function permsAsArray(perms: BrainIncludes["permissions"]): BrainPermission[] {
  return Array.isArray(perms) ? (perms as BrainPermission[]) : [];
}

/**
 * Une dos servidores. Deduplica por (kind + endpoint); si un servidor no tiene
 * endpoint, deduplica por (kind + name). Regenera ids para no colisionar.
 */
function unionServers(a: BrainServer[] = [], b: BrainServer[] = []): BrainServer[] {
  const seen = new Set<string>();
  const out: BrainServer[] = [];
  for (const s of [...a, ...b]) {
    if (!s || typeof s !== "object") continue;
    const endpoint = (s.endpoint ?? "").toString().trim();
    const key = endpoint
      ? `${s.kind}::${endpoint.toLowerCase()}`
      : `${s.kind}::${(s.name ?? "").toString().trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, id: newServerId() });
  }
  return out;
}

/** Une dos objetos `config` de forma superficial (B gana en colisiones simples). */
function mergeConfig(
  a: Record<string, unknown> = {},
  b: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...(a || {}), ...(b || {}) };
}

/* ====================================================================== */
/* CEREBROS — Duplicar                                                     */
/* ====================================================================== */

/**
 * Duplica un cerebro por id. Copia su config/includes/memorias/acceso y
 * regenera los ids de servidor. El nombre recibe el sufijo " (copia)".
 * Devuelve el cerebro creado, o null si no existe / no hay sesión.
 */
export async function duplicateBrainById(id: string): Promise<Brain | null> {
  try {
    const src = await getBrain(id);
    if (!src) return null;
    // Reutilizamos el duplicador existente del store (regenera ids de servidor
    // y añade "(copia)"), garantizando el mismo comportamiento probado.
    return await duplicateBrainRow(src);
  } catch {
    return null;
  }
}

/* ====================================================================== */
/* CEREBROS — Fusionar                                                     */
/* ====================================================================== */

export interface MergeBrainsOptions {
  /** Nombre del cerebro resultante (por defecto "A + B"). */
  name?: string;
  /**
   * Si es true, ELIMINA los cerebros de origen tras crear la fusión.
   * Por defecto false: los originales se conservan (unión no destructiva).
   */
  replaceSources?: boolean;
}

/**
 * Vista previa (sin persistir) del resultado de fusionar dos cerebros.
 * Útil para mostrar "A + B → resultado" en la UI antes de confirmar.
 */
export interface BrainMergePreview {
  name: string;
  scope: string;
  includes: BrainIncludes;
  servers: BrainServer[];
  /** Conteos por sección incluida (unión ya deduplicada). */
  counts: Record<string, number>;
  /** Cuántos elementos totales aporta cada origen (antes de deduplicar). */
  sourceTotals: { a: number; b: number };
}

const INC_KEYS: (keyof Pick<
  BrainIncludes,
  | "vaults"
  | "backends"
  | "personalities"
  | "runtimes"
  | "tokens"
  | "memories"
  | "connections"
>)[] = [
  "vaults",
  "backends",
  "personalities",
  "runtimes",
  "tokens",
  "memories",
  "connections",
];

/** Construye el `includes` fusionado (unión deduplicada) de dos cerebros. */
function mergeIncludes(a: BrainIncludes, b: BrainIncludes): BrainIncludes {
  return {
    vaults: unionStrings(a.vaults, b.vaults),
    backends: unionStrings(a.backends, b.backends),
    personalities: unionStrings(a.personalities, b.personalities),
    runtimes: unionStrings(a.runtimes, b.runtimes),
    tokens: unionStrings(a.tokens, b.tokens),
    memories: unionStrings(a.memories, b.memories),
    connections: unionStrings(a.connections, b.connections),
    // bindScope: si CUALQUIERA vincula todo el alcance, el resultado también.
    bindScope: !!a.bindScope || !!b.bindScope,
    permissions: unionPermissions(permsAsArray(a.permissions), permsAsArray(b.permissions)),
    // Proveedor de IA: preferimos el de A; si no tiene, el de B.
    aiProvider: a.aiProvider || b.aiProvider,
  };
}

/**
 * Calcula la vista previa de fusión de dos cerebros por id, sin persistir nada.
 * Devuelve null si alguno no existe.
 */
export async function previewMergeBrains(
  idA: string,
  idB: string,
  opts: MergeBrainsOptions = {},
): Promise<BrainMergePreview | null> {
  try {
    const [a, b] = await Promise.all([getBrain(idA), getBrain(idB)]);
    if (!a || !b) return null;
    const includes = mergeIncludes(a.includes, b.includes);
    const servers = unionServers(a.servers, b.servers);
    const counts: Record<string, number> = {};
    for (const k of INC_KEYS) counts[k] = (includes[k] as string[]).length;
    counts.servers = servers.length;
    const totalOf = (br: Brain) =>
      INC_KEYS.reduce((n, k) => n + ((br.includes[k] as string[])?.length || 0), 0) +
      (br.servers?.length || 0);
    return {
      name: (opts.name || "").trim() || `${a.name} + ${b.name}`,
      scope: a.scope,
      includes,
      servers,
      counts,
      sourceTotals: { a: totalOf(a), b: totalOf(b) },
    };
  } catch {
    return null;
  }
}

/**
 * Fusiona dos cerebros en uno NUEVO (unión sin duplicar). Los originales se
 * conservan salvo que `opts.replaceSources` sea true. Devuelve el cerebro
 * creado, o null si algo falla / falta sesión.
 *
 * El alcance del resultado toma el de A (idA). La descripción documenta el
 * origen de la fusión para trazabilidad.
 */
export async function mergeBrains(
  idA: string,
  idB: string,
  opts: MergeBrainsOptions = {},
): Promise<Brain | null> {
  try {
    if (!idA || !idB || idA === idB) return null;
    const [a, b] = await Promise.all([getBrain(idA), getBrain(idB)]);
    if (!a || !b) return null;

    const includes = mergeIncludes(a.includes, b.includes);
    const servers = unionServers(a.servers, b.servers);
    const name = (opts.name || "").trim() || `${a.name} + ${b.name}`;

    const created = await saveBrain({
      name,
      scope: a.scope,
      scope_ref: a.scope_ref,
      description:
        `Fusión de «${a.name}» + «${b.name}».` +
        (a.description || b.description
          ? ` ${[a.description, b.description].filter(Boolean).join(" · ")}`
          : ""),
      config: {
        ...mergeConfig(a.config, b.config),
        mergedFrom: [a.id, b.id],
        mergedAt: new Date().toISOString(),
      },
      includes,
      servers,
    });

    if (created && opts.replaceSources) {
      // Sólo si se pidió explícitamente. Defensivo: no bloquea el resultado.
      try {
        await deleteBrain(a.id);
        await deleteBrain(b.id);
      } catch {
        /* conservar la fusión aunque falle el borrado de orígenes */
      }
    }

    return created;
  } catch {
    return null;
  }
}

/* ====================================================================== */
/* MEMORIAS — Duplicar                                                     */
/* ====================================================================== */

/**
 * Duplica una memoria (MemoryDoc) por id, generando un nuevo id y añadiendo
 * " (copia)" al nombre. Delega en el duplicador del vault. SSR-safe.
 */
export function duplicateMemoryDoc(id: string): MemoryDoc | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return duplicateMemoryDocRow(id);
  } catch {
    return undefined;
  }
}

/* ====================================================================== */
/* MEMORIAS — Fusionar                                                     */
/* ====================================================================== */

export interface MergeMemoriesOptions {
  /** Título de la memoria resultante (por defecto "Fusión de N memorias"). */
  title?: string;
  /** Categoría del resultado (por defecto la de la primera memoria). */
  category?: string;
  /**
   * Si es true, ELIMINA las memorias de origen tras crear la fusión.
   * Por defecto false: se conservan (no destructivo).
   */
  removeSources?: boolean;
}

/** Vista previa (sin persistir) de la fusión de varias memorias. */
export interface MemoryMergePreview {
  title: string;
  category: string;
  /** Markdown combinado ya ensamblado. */
  markdown: string;
  /** Etiquetas unión (deduplicadas). */
  tags: string[];
  /** Nombres de las memorias de origen, en orden. */
  sources: string[];
  /** Nº de caracteres del markdown resultante (indicador de tamaño). */
  chars: number;
}

/**
 * Ensambla el markdown de una fusión: por cada memoria añade un encabezado de
 * nivel 1 con su nombre y, debajo, su contenido markdown (rebajando sus propios
 * H1 a H2 para preservar jerarquía y evitar múltiples títulos de primer nivel).
 */
function assembleMergedMarkdown(docs: MemoryDoc[], title: string): string {
  const parts: string[] = [`# ${title}`, ""];
  for (const d of docs) {
    parts.push(`## ${d.name}`, "");
    // Rebaja encabezados del cuerpo un nivel (# → ##, ## → ###, …) hasta 6.
    const body = (d.markdown || "").replace(/^(#{1,6})(\s)/gm, (_m, hashes: string, sp: string) =>
      (hashes.length < 6 ? "#".repeat(hashes.length + 1) : hashes) + sp,
    );
    parts.push(body.trim(), "", "---", "");
  }
  // Quita el separador final sobrante.
  while (parts.length && (parts[parts.length - 1] === "" || parts[parts.length - 1] === "---")) {
    parts.pop();
  }
  return parts.join("\n") + "\n";
}

/** Recupera y ordena (según el orden de `ids`) las memorias existentes. */
function collectMemories(ids: string[]): MemoryDoc[] {
  const all = listMemories();
  const byId = new Map(all.map((d) => [d.id, d] as const));
  const out: MemoryDoc[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const d = byId.get(id);
    if (d) out.push(d);
  }
  return out;
}

/**
 * Vista previa (sin persistir) de fusionar varias memorias por ids.
 * Devuelve null si hay menos de una memoria válida.
 */
export function previewMergeMemories(
  ids: string[],
  opts: MergeMemoriesOptions = {},
): MemoryMergePreview | null {
  if (typeof window === "undefined") return null;
  try {
    const docs = collectMemories(ids);
    if (docs.length === 0) return null;
    const title = (opts.title || "").trim() || `Fusión de ${docs.length} memorias`;
    const category = (opts.category || "").trim() || docs[0].category || "Personal";
    const tags = unionStrings(...docs.map((d) => d.tags || []));
    const markdown = assembleMergedMarkdown(docs, title);
    return {
      title,
      category,
      markdown,
      tags,
      sources: docs.map((d) => d.name),
      chars: markdown.length,
    };
  } catch {
    return null;
  }
}

/**
 * Fusiona varias memorias en una NUEVA (concatena/uniona secciones con
 * encabezados y une etiquetas). Las originales se conservan salvo
 * `opts.removeSources`. Devuelve el MemoryDoc creado o undefined.
 */
export function mergeMemories(
  ids: string[],
  opts: MergeMemoriesOptions = {},
): MemoryDoc | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const docs = collectMemories(ids);
    if (docs.length === 0) return undefined;
    const title = (opts.title || "").trim() || `Fusión de ${docs.length} memorias`;
    const category = (opts.category || "").trim() || docs[0].category || "Personal";
    const tags = unionStrings(...docs.map((d) => d.tags || []));
    const markdown = assembleMergedMarkdown(docs, title);

    const created = createMemory({
      name: title,
      category,
      tags,
      markdown,
      // Hereda el color de la primera memoria como pista visual.
      color: docs[0].color,
    });

    if (created && opts.removeSources) {
      for (const d of docs) {
        // No borres la propia fusión (id distinto, pero por seguridad).
        if (d.id === created.id) continue;
        try {
          deleteMemory(d.id);
        } catch {
          /* conservar la fusión aunque falle un borrado */
        }
      }
    }

    return created;
  } catch {
    return undefined;
  }
}
