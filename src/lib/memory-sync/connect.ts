"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Memory Roots · Connect (carga de manifest + persistencia)
// ----------------------------------------------------------------
// Carga un `memory.manifest.json` desde una URL o desde texto pegado, y
// persiste los roots vinculados en localStorage (clave
// `starseed.memory.roots.v1`). Capa fina y defensiva sobre el parser puro
// de `manifest.ts`.
//
// ⚠️ DESCONECTADO DE LA CUENTA: NO contacta ninguna cuenta/servidor real de
//    StarSeed. `loadManifestFromUrl` sólo hace un `fetch` de un JSON portátil
//    (local/Drive/repo). La sincronización real con la cuenta "Ester" se
//    conecta más tarde, fuera de este código. Aquí todo es vista previa.
// ════════════════════════════════════════════════════════════════

import {
  parseManifest,
  BRANCH_TIPOS,
  type MemoryManifest,
  type MemoryBranch,
  type BranchTipo,
} from "./manifest";
import {
  listMemoryFiles,
  saveMemoryFile,
  type MemoryFile,
} from "@/lib/cerebro/memory-files";
import { parseFrontmatter } from "@/lib/brains/memory-types";
import { getBrain, saveBrain } from "@/lib/brains/brains";

/** Clave de localStorage donde viven los roots vinculados (vista previa). */
export const ROOTS_KEY = "starseed.memory.roots.v1";

/** Un root vinculado tal y como se persiste localmente. */
export interface ConnectedRoot {
  id: string;
  name: string;
  /** URL de origen del manifest, o null si se pegó como texto. */
  url: string | null;
  /** Ramas del root (copia ligera para listarlo sin re-fetch). */
  branches: MemoryBranch[];
  /** Marca de tiempo de alta (epoch ms). */
  addedAt: number;
  /** SIEMPRE false: vista previa, sin cuenta. */
  accountConnected: false;
  /** Último manifiesto conocido (base para `diffManifest`). */
  lastManifest: MemoryManifest;
}

// ── Carga del manifiesto (texto / URL) ───────────────────────────

/**
 * Parsea un manifiesto desde texto pegado. Lanza un Error claro si el texto
 * no es JSON válido (lo propaga `parseManifest`).
 */
export function loadManifestFromText(text: string): MemoryManifest {
  return parseManifest(text);
}

/**
 * Descarga y parsea un `memory.manifest.json` desde una URL. Defensivo:
 * try/catch con mensajes claros para red, HTTP y JSON inválido.
 *
 * No envía credenciales ni toca ninguna cuenta: es un GET de un JSON portátil.
 */
export async function loadManifestFromUrl(url: string): Promise<MemoryManifest> {
  const trimmed = (url ?? "").trim();
  if (!trimmed) throw new Error("Indica una URL de manifiesto.");
  let res: Response;
  try {
    res = await fetch(trimmed, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" },
      cache: "no-store",
    });
  } catch {
    throw new Error("No se pudo contactar la URL del manifiesto (red/CORS).");
  }
  if (!res.ok) {
    throw new Error(`El manifiesto respondió HTTP ${res.status}.`);
  }
  const body = await res.text().catch(() => "");
  if (!body.trim()) throw new Error("La URL del manifiesto devolvió contenido vacío.");
  // parseManifest lanza un Error claro si el cuerpo no es JSON válido.
  return parseManifest(body);
}

// ── Persistencia local (localStorage, SSR-safe + defensivo) ──────

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Genera un id estable y único para un root vinculado. */
function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* sin crypto: caemos al fallback */
  }
  return `root-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Lee la lista de roots vinculados (array vacío si no hay / error). */
export function readRoots(): ConnectedRoot[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(ROOTS_KEY) ?? "";
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConnectedRoot[]) : [];
  } catch {
    return [];
  }
}

/** Persiste la lista completa de roots (degrada en silencio si falla). */
export function writeRoots(roots: ConnectedRoot[]): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(ROOTS_KEY, JSON.stringify(roots));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/**
 * Da de alta un root a partir de un manifiesto ya parseado y devuelve la
 * lista actualizada. Si ya existe un root con la misma `url` (no nula), lo
 * REEMPLAZA en lugar de duplicarlo (singularidad de la entidad).
 *
 * `accountConnected` se fuerza a false: es una vinculación de vista previa.
 */
export function addRoot(
  manifest: MemoryManifest,
  url: string | null,
): ConnectedRoot[] {
  const roots = readRoots();
  const entry: ConnectedRoot = {
    id: makeId(),
    name: manifest.name,
    url: url && url.trim() ? url.trim() : null,
    branches: manifest.branches,
    addedAt: Date.now(),
    accountConnected: false,
    lastManifest: manifest,
  };
  // Dedup por URL: si ya seguíamos esa misma fuente, conservamos su id.
  const next = entry.url
    ? roots.filter((r) => r.url !== entry.url)
    : roots.slice();
  const existing = entry.url ? roots.find((r) => r.url === entry.url) : undefined;
  if (existing) entry.id = existing.id;
  next.unshift(entry);
  writeRoots(next);
  return next;
}

/** Elimina un root por id y devuelve la lista actualizada. */
export function removeRoot(id: string): ConnectedRoot[] {
  const next = readRoots().filter((r) => r.id !== id);
  writeRoots(next);
  return next;
}

/**
 * Actualiza el `lastManifest` (y ramas) de un root tras una sincronización de
 * vista previa confirmada, para que el siguiente diff parta del nuevo estado.
 * Devuelve la lista actualizada.
 */
export function updateRootManifest(
  id: string,
  manifest: MemoryManifest,
): ConnectedRoot[] {
  const next = readRoots().map((r) =>
    r.id === id
      ? { ...r, name: manifest.name, branches: manifest.branches, lastManifest: manifest }
      : r,
  );
  writeRoots(next);
  return next;
}

// ════════════════════════════════════════════════════════════════
// IMPORTACIÓN REAL a un cerebro (brain_memory_files) — Adenda I2 · tarea 5
// ----------------------------------------------------------------
// A diferencia del resto de este módulo (vista previa), estas funciones SÍ
// escriben en `brain_memory_files` del cerebro elegido. Implementan el contrato
// INTEGRACION.md del memory root client-side: cada RAMA se importa como un
// fichero .md con meta {type, rama, scope, hash, updated, source}. La detección
// de conflicto es por `updated` (gana el más reciente). También hay exportación
// inversa (descargar una rama como .md).
// ════════════════════════════════════════════════════════════════

/** Contenido real de un fichero del memory root (leído de disco/subida). */
export interface RootFileContent {
  /** Ruta relativa dentro del root (clave de identidad; coincide con branch.archivo). */
  archivo: string;
  /** Texto markdown del fichero. */
  content: string;
  /** `updated` del frontmatter (epoch ms) si existe, para resolver conflictos. */
  updated?: number;
}

/** Mapa BranchTipo → id de tipo de memoria (memory-types). */
const TIPO_TO_TYPE: Record<string, string> = {
  soul: "soul", skill: "skills", memory: "memory", dream: "dream",
  task: "reminders", aurora: "ego", style: "style", accounts: "profiles", log: "logs",
};

/** Nombre base (fichero) de una ruta relativa. */
function baseName(path: string): string {
  const p = (path || "").split(/[\\/]/).filter(Boolean);
  return p[p.length - 1] || path || "nota.md";
}

/** Convierte un `updated` de frontmatter (número o fecha ISO) a epoch ms. */
function toEpoch(v: unknown): number | undefined {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000; // s → ms si parece segundos
  if (typeof v === "string") {
    const n = Date.parse(v);
    if (!Number.isNaN(n)) return n;
    const num = Number(v);
    if (!Number.isNaN(num)) return num > 1e12 ? num : num * 1000;
  }
  return undefined;
}

/** Extrae `updated` (epoch ms) del frontmatter de un markdown. */
export function extractUpdated(content: string): number | undefined {
  try {
    const { data } = parseFrontmatter(content);
    return toEpoch((data as Record<string, unknown>).updated);
  } catch {
    return undefined;
  }
}

/* ── Lectura de la carpeta (File System Access API o subida <input webkitdirectory>) ── */

/** Interfaz mínima del File System Access API (evita depender de lib.dom completa). */
interface FsDirHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<FsDirHandle | FsFileHandle>;
}
interface FsFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

/** ¿El navegador soporta el File System Access API (showDirectoryPicker)? */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Recorre recursivamente un handle de carpeta y devuelve los .md + manifest. */
async function walkDir(
  dir: FsDirHandle,
  prefix: string,
  out: RootFileContent[],
  manifestRef: { text: string | null },
): Promise<void> {
  for await (const entry of dir.values()) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      await walkDir(entry, rel, out, manifestRef);
    } else {
      if (entry.name === "memory.manifest.json") {
        manifestRef.text = await (await entry.getFile()).text();
      } else if (/\.md$/i.test(entry.name)) {
        const text = await (await entry.getFile()).text();
        out.push({ archivo: rel, content: text, updated: extractUpdated(text) });
      }
    }
  }
}

/**
 * Abre el selector de carpetas (File System Access API), lee el manifest y todos
 * los .md. Lanza un Error claro si el navegador no lo soporta o el usuario cancela.
 */
export async function readFolderViaPicker(): Promise<{ manifest: MemoryManifest | null; files: RootFileContent[] }> {
  if (!supportsDirectoryPicker()) {
    throw new Error("Este navegador no soporta abrir carpetas. Usa el botón de subir carpeta.");
  }
  const picker = (window as unknown as { showDirectoryPicker: () => Promise<FsDirHandle> }).showDirectoryPicker;
  const dir = await picker();
  const files: RootFileContent[] = [];
  const manifestRef: { text: string | null } = { text: null };
  await walkDir(dir, "", files, manifestRef);
  const manifest = manifestRef.text ? parseManifest(manifestRef.text) : null;
  return { manifest, files };
}

/**
 * Lee una carpeta subida vía `<input type="file" webkitdirectory>`: extrae el
 * manifest y todos los .md con su ruta relativa.
 */
export async function readFolderFromFileList(
  list: FileList | File[],
): Promise<{ manifest: MemoryManifest | null; files: RootFileContent[] }> {
  const arr = Array.from(list);
  const files: RootFileContent[] = [];
  let manifest: MemoryManifest | null = null;
  for (const f of arr) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (f.name === "memory.manifest.json") {
      try { manifest = parseManifest(await f.text()); } catch { /* manifest inválido: seguimos con .md */ }
    } else if (/\.md$/i.test(f.name)) {
      const text = await f.text();
      // Quita el primer segmento (nombre de la carpeta raíz) para casar con branch.archivo.
      const parts = rel.split("/");
      const archivo = parts.length > 1 ? parts.slice(1).join("/") : rel;
      files.push({ archivo, content: text, updated: extractUpdated(text) });
    }
  }
  return { manifest, files };
}

/* ── Importación a brain_memory_files con conflicto por `updated` ── */

export type ImportBranchStatus = "created" | "updated" | "skipped-older" | "unchanged";

export interface ImportBranchResult {
  archivo: string;
  name: string;
  tipo: string;
  status: ImportBranchStatus;
  /** Diff simple para conflictos: tamaños y primeras líneas. */
  diff?: { incomingChars: number; existingChars: number; incomingUpdated?: number; existingUpdated?: number };
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: number;
  results: ImportBranchResult[];
}

/** Empareja una rama del manifest con su contenido real (por `archivo`). */
function contentFor(files: RootFileContent[], archivo: string): RootFileContent | undefined {
  const target = archivo.toLowerCase();
  return (
    files.find((f) => f.archivo.toLowerCase() === target) ||
    files.find((f) => baseName(f.archivo).toLowerCase() === baseName(archivo).toLowerCase())
  );
}

/**
 * Importa las ramas de un memory root como brain_memory_files del cerebro dado.
 * - name    = nombre de fichero de la rama (baseName del archivo)
 * - content = markdown real del fichero
 * - meta    = { type, rama, scope, hash, updated, source: 'memory_root' }
 * - sync    = true
 *
 * Conflicto por `updated`: si ya existe un fichero con ese nombre en el cerebro,
 * gana el MÁS RECIENTE (compara meta.updated / updated_at contra el `updated`
 * del frontmatter entrante). Nunca borra: si el existente es más nuevo, se omite
 * y se reporta el conflicto con un diff simple.
 */
export async function importRootToBrain(
  brainId: string | null,
  manifest: MemoryManifest,
  files: RootFileContent[],
): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, skipped: 0, results: [] };
  let existing: MemoryFile[] = [];
  try {
    existing = await listMemoryFiles(brainId);
  } catch {
    existing = [];
  }
  const byName = new Map(existing.map((f) => [f.name.toLowerCase(), f]));

  for (const branch of manifest.branches) {
    const rc = contentFor(files, branch.archivo);
    const name = baseName(branch.archivo);
    const tipo = TIPO_TO_TYPE[branch.tipo] ?? branch.tipo ?? "memory";
    if (!rc) {
      // Sin contenido para esta rama: no la creamos (evita ficheros vacíos).
      report.results.push({ archivo: branch.archivo, name, tipo, status: "skipped-older" });
      report.skipped++;
      continue;
    }
    const incomingUpdated = rc.updated ?? undefined;
    const meta = {
      type: tipo,
      rama: branch.rama,
      scope: branch.scope ?? "global",
      hash: branch.hash,
      updated: incomingUpdated,
      source: "memory_root",
    };
    const prev = byName.get(name.toLowerCase());
    if (!prev) {
      const saved = await saveMemoryFile({ brain_id: brainId, name, content: rc.content, source: "starseed", meta, sync: true });
      report.results.push({ archivo: branch.archivo, name, tipo, status: saved ? "created" : "skipped-older" });
      if (saved) report.created++; else report.skipped++;
      continue;
    }
    // Existe: resolvemos por `updated` (gana el más reciente).
    const prevUpdated = toEpoch((prev.meta as Record<string, unknown>)?.updated) ?? (prev.updated_at ? Date.parse(prev.updated_at) : undefined);
    const diff = {
      incomingChars: rc.content.length,
      existingChars: prev.content.length,
      incomingUpdated,
      existingUpdated: prevUpdated,
    };
    if (rc.content === prev.content) {
      report.results.push({ archivo: branch.archivo, name, tipo, status: "unchanged", diff });
      continue;
    }
    const incomingWins = incomingUpdated != null && (prevUpdated == null || incomingUpdated >= prevUpdated);
    if (incomingWins) {
      const saved = await saveMemoryFile({ id: prev.id, brain_id: brainId, name, content: rc.content, source: prev.source, meta: { ...prev.meta, ...meta }, sync: true });
      report.results.push({ archivo: branch.archivo, name, tipo, status: saved ? "updated" : "skipped-older", diff });
      if (saved) report.updated++; else report.skipped++;
    } else {
      report.results.push({ archivo: branch.archivo, name, tipo, status: "skipped-older", diff });
      report.skipped++;
    }
  }
  return report;
}

/**
 * Registra el memory root como fuente del cerebro en config.memorySources[].
 * Idempotente por `name`+`url`. Devuelve true si se guardó.
 */
export async function registerMemorySourceOnBrain(
  brainId: string,
  source: { name: string; url?: string | null; branches?: number; kind?: string },
): Promise<boolean> {
  try {
    const brain = await getBrain(brainId);
    if (!brain) return false;
    const cfg = (brain.config || {}) as Record<string, unknown>;
    const list = Array.isArray(cfg.memorySources) ? (cfg.memorySources as Record<string, unknown>[]) : [];
    const key = (s: Record<string, unknown>) => `${s.name ?? ""}|${s.url ?? ""}`;
    const entry = { kind: source.kind ?? "memory_root", name: source.name, url: source.url ?? null, branches: source.branches ?? 0, connectedAt: Date.now() };
    const next = list.filter((s) => key(s) !== key(entry));
    next.unshift(entry);
    const saved = await saveBrain({ ...brain, config: { ...cfg, memorySources: next } });
    return !!saved;
  } catch {
    return false;
  }
}

/** Normaliza un stem/frontmatter a un BranchTipo válido (cae en "memory"). */
function tipoFromStem(stem: string, fmTipo?: unknown): BranchTipo {
  const cand = (typeof fmTipo === "string" ? fmTipo : stem).toLowerCase().replace(/s$/, "");
  const map: Record<string, BranchTipo> = {
    soul: "soul", skill: "skill", memory: "memory", dream: "dream",
    task: "task", reminder: "task", aurora: "aurora", ego: "aurora",
    style: "style", account: "accounts", profile: "accounts", log: "log",
  };
  if (map[cand]) return map[cand];
  return (BRANCH_TIPOS as readonly string[]).includes(cand) ? (cand as BranchTipo) : "memory";
}

/**
 * Sintetiza un MemoryManifest a partir de los .md leídos cuando la carpeta NO
 * trae `memory.manifest.json`. Deriva `tipo`/`scope` del frontmatter o del
 * nombre de fichero. Permite importar cualquier carpeta de markdown como root.
 */
export function synthManifestFromFiles(files: RootFileContent[], name = "memory_root"): MemoryManifest {
  const branches: MemoryBranch[] = files.map((f) => {
    const stem = baseName(f.archivo).replace(/\.md$/i, "");
    let fm: Record<string, unknown> = {};
    try { fm = parseFrontmatter(f.content).data as Record<string, unknown>; } catch { /* sin frontmatter */ }
    const tipo = tipoFromStem(stem, fm.tipo);
    const branch: MemoryBranch = { rama: (typeof fm.rama === "string" ? fm.rama : stem) || stem, tipo, archivo: f.archivo };
    if (typeof fm.scope === "string") branch.scope = fm.scope;
    if (typeof fm.hash === "string") branch.hash = fm.hash;
    return branch;
  });
  return {
    name,
    kind: "memory_root",
    structure: "root+branches",
    accountConnected: false,
    linkTargets: [],
    sync: {},
    branches,
  };
}

/** Descarga una rama/fichero como .md (exportación inversa). SSR-safe. */
export function exportBranchAsMd(name: string, content: string): void {
  if (!isClient()) return;
  try {
    const fname = /\.md$/i.test(name) ? name : `${name}.md`;
    const blob = new Blob([content ?? ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = baseName(fname);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    /* noop */
  }
}
