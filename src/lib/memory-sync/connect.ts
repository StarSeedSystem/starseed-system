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
  type MemoryManifest,
  type MemoryBranch,
} from "./manifest";

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
