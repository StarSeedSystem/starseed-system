// ════════════════════════════════════════════════════════════════
// StarSeed OS — Memory Roots · Manifest (parsing + diff, PURO sin red)
// ----------------------------------------------------------------
// Lector y comparador del contrato portátil `memory.manifest.json` que
// describe un **memory root** (`<nombre>_memory_root/`): un folder raíz
// con RAMAS (subfolders) por tipo de memoria. El mismo formato sirve para
// repo, Google Drive, cerebros, servidores y VMs.
// Ver `architecture/memoria-cerebros-sync.md` y `starseed_memory_root/sync.md`.
//
// Este módulo es PURAMENTE de utilidades: parseo tolerante, diff por rama
// y resumen. NO hace I/O ni red (eso vive en `connect.ts` y la UI).
//
// ⚠️ DESCONECTADO DE LA CUENTA: nada aquí contacta una cuenta/servidor real.
//    Es un mecanismo de vista previa local (la cuenta "Ester" se conecta
//    más tarde, fuera de este código).
// ════════════════════════════════════════════════════════════════

// ── Tipos del contrato ───────────────────────────────────────────

/** Tipos de rama soportados por el contrato portátil. */
export const BRANCH_TIPOS = [
  "soul",
  "skill",
  "memory",
  "dream",
  "task",
  "aurora",
  "style",
  "accounts",
  "log",
] as const;
export type BranchTipo = (typeof BRANCH_TIPOS)[number];

/** Una rama (subfolder) del memory root = una memoria del contrato. */
export interface MemoryBranch {
  /** Nombre lógico de la rama (p. ej. "soul"). */
  rama: string;
  /** Tipo de memoria de la rama. */
  tipo: BranchTipo;
  /** Ruta relativa del archivo dentro del root (clave de identidad). */
  archivo: string;
  /** Alcance de la memoria (global, page, chat…). Opcional. */
  scope?: string;
  /** Hash de contenido (si el manifest lo aporta) para detectar cambios. */
  hash?: string;
}

/** Manifiesto completo de un memory root (contrato portátil). */
export interface MemoryManifest {
  /** Nombre legible del root (p. ej. "Ester"). */
  name: string;
  /** Discriminante del contrato; siempre "memory_root". */
  kind: "memory_root";
  /** Estructura: raíz + ramas. */
  structure: string;
  /**
   * Si el root ya está vinculado a una cuenta real. En este OS SIEMPRE se
   * fuerza a `false`: trabajamos en modo vista previa, sin cuenta.
   */
  accountConnected: boolean;
  /** Destinos a los que el root puede vincularse (cerebros/servidores/VMs). */
  linkTargets: string[];
  /** Política/estado de sincronización tal cual viene en el manifest. */
  sync: Record<string, unknown>;
  /** Lista de ramas (memorias) del root. */
  branches: MemoryBranch[];
}

// ── Helpers de parseo defensivo ──────────────────────────────────

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Normaliza un `tipo` arbitrario a un BranchTipo válido (cae en "memory"). */
function normalizeTipo(v: unknown): BranchTipo {
  const s = asString(v).toLowerCase().trim();
  return (BRANCH_TIPOS as readonly string[]).includes(s)
    ? (s as BranchTipo)
    : "memory";
}

/** Normaliza una rama suelta del JSON a un MemoryBranch limpio. */
function parseBranch(raw: unknown, idx: number): MemoryBranch {
  const o = asRecord(raw);
  const rama = asString(o.rama).trim() || `rama-${idx + 1}`;
  const tipo = normalizeTipo(o.tipo);
  // `archivo` es la clave de identidad; si falta, derivamos una estable.
  const archivo = asString(o.archivo).trim() || `${rama}/${rama}.md`;
  const branch: MemoryBranch = { rama, tipo, archivo };
  const scope = asString(o.scope).trim();
  if (scope) branch.scope = scope;
  const hash = asString(o.hash).trim();
  if (hash) branch.hash = hash;
  return branch;
}

/**
 * Parsea un `memory.manifest.json` (string JSON u objeto ya parseado) a un
 * `MemoryManifest` tolerante. Nunca lanza por campos faltantes: aplica
 * valores por defecto sensatos.
 *
 * - Acepta string (lo parsea con JSON.parse) u objeto.
 * - `accountConnected` SIEMPRE se fuerza a `false` (modo vista previa).
 * - Si el string no es JSON válido, LANZA un Error claro (la UI lo captura).
 */
export function parseManifest(jsonOrObj: unknown): MemoryManifest {
  let obj: unknown = jsonOrObj;
  if (typeof jsonOrObj === "string") {
    const text = jsonOrObj.trim();
    if (!text) throw new Error("El manifiesto está vacío.");
    try {
      obj = JSON.parse(text);
    } catch {
      throw new Error("El manifiesto no es JSON válido.");
    }
  }
  const o = asRecord(obj);
  const branchesRaw = Array.isArray(o.branches) ? o.branches : [];
  return {
    name: asString(o.name).trim() || "memory_root",
    kind: "memory_root",
    structure: asString(o.structure).trim() || "root+branches",
    // Vista previa: jamás confiamos en el flag del archivo para "conectar".
    accountConnected: false,
    linkTargets: asStringArray(o.linkTargets),
    sync: asRecord(o.sync),
    branches: branchesRaw.map(parseBranch),
  };
}

// ── Diff por rama (vista previa de sincronización) ───────────────

/** Estado de una rama al comparar dos manifiestos. */
export type BranchStatus = "added" | "updated" | "unchanged" | "removed";

/** Resultado del diff para una rama concreta (clave: `archivo`). */
export interface BranchDiff {
  archivo: string;
  rama: string;
  tipo: BranchTipo;
  scope?: string;
  status: BranchStatus;
  /** Hash anterior/nuevo, si están disponibles (ayuda a explicar el cambio). */
  prevHash?: string;
  nextHash?: string;
}

/** Resumen agregado del diff (cuántas ramas por estado). */
export interface ManifestDiff {
  branches: BranchDiff[];
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  /** Total de ramas que SÍ se sincronizarían (added + updated). */
  toSync: number;
}

/**
 * Compara dos manifiestos por rama, usando `archivo` como clave de identidad.
 *
 * Reglas (vista previa — NO escribe nada):
 * - rama nueva en `next` y no en `prev`           → "added".
 * - rama en ambos con `hash` distinto              → "updated".
 * - rama en ambos sin hash, o con el mismo hash    → "unchanged".
 * - rama en `prev` pero no en `next`               → "removed".
 *
 * Si no hay `prev` (primera vinculación), todas las ramas son "added".
 */
export function diffManifest(
  prev: MemoryManifest | null | undefined,
  next: MemoryManifest,
): ManifestDiff {
  const prevByFile = new Map<string, MemoryBranch>();
  for (const b of prev?.branches ?? []) prevByFile.set(b.archivo, b);

  const branches: BranchDiff[] = [];
  const seen = new Set<string>();

  for (const b of next.branches) {
    seen.add(b.archivo);
    const before = prevByFile.get(b.archivo);
    let status: BranchStatus;
    if (!before) {
      status = "added";
    } else if (b.hash && before.hash && b.hash !== before.hash) {
      status = "updated";
    } else if (b.hash && before.hash && b.hash === before.hash) {
      status = "unchanged";
    } else {
      // Sin hashes fiables a ambos lados: lo tratamos como sin cambios.
      status = "unchanged";
    }
    branches.push({
      archivo: b.archivo,
      rama: b.rama,
      tipo: b.tipo,
      scope: b.scope,
      status,
      prevHash: before?.hash,
      nextHash: b.hash,
    });
  }

  // Ramas que estaban antes y ya no aparecen → "removed".
  for (const [archivo, b] of prevByFile) {
    if (seen.has(archivo)) continue;
    branches.push({
      archivo,
      rama: b.rama,
      tipo: b.tipo,
      scope: b.scope,
      status: "removed",
      prevHash: b.hash,
    });
  }

  const added = branches.filter((x) => x.status === "added").length;
  const updated = branches.filter((x) => x.status === "updated").length;
  const unchanged = branches.filter((x) => x.status === "unchanged").length;
  const removed = branches.filter((x) => x.status === "removed").length;

  return { branches, added, updated, unchanged, removed, toSync: added + updated };
}

// ── Resumen del manifiesto ───────────────────────────────────────

/** Resumen legible de un manifiesto: totales y desglose por tipo. */
export interface ManifestSummary {
  name: string;
  totalBranches: number;
  /** Conteo de ramas por `tipo`. */
  byTipo: Record<string, number>;
  linkTargets: string[];
  accountConnected: boolean;
}

/**
 * Resume un manifiesto para mostrarlo de un vistazo (cabecera del panel):
 * nombre, nº de ramas, desglose por tipo y destinos de vínculo.
 */
export function summarize(manifest: MemoryManifest): ManifestSummary {
  const byTipo: Record<string, number> = {};
  for (const b of manifest.branches) {
    byTipo[b.tipo] = (byTipo[b.tipo] ?? 0) + 1;
  }
  return {
    name: manifest.name,
    totalBranches: manifest.branches.length,
    byTipo,
    linkTargets: manifest.linkTargets,
    accountConnected: manifest.accountConnected,
  };
}
