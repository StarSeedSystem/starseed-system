"use client";

import { useCallback, useEffect, useState } from "react";
import { AdnAvatar } from "@/lib/avatares/adn/adn";
import { sanearAdn } from "@/lib/avatares/adn/adn";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

/**
 * Almacén de ADN de AVATAR (AV1011): cada ADN es una entrada en la Biblioteca,
 * con visibilidad (privado/grupo/público), caché en memoria por ref+rev y limpieza
 * defensiva (read sólo lo que ha sido validado por sanearAdn).
 */

export const ADN_AVATAR_KIND = "avatar-adn";
const ADN_STORAGE_KEY = "starseed.avatar.adn.v1";
const ADN_EVENT = "starseed:avatar-adn";

export interface AdnEntry {
  id: string;
  kind: typeof ADN_AVATAR_KIND;
  title: string;
  url?: string;
  origin?: string;
  savedAt: number;
  rev: number;
  visibilidad: "privado" | "grupo" | "publico";
  raw: string; // ADN serializado JSON
}

export interface UseAdnEntry {
  entry: AdnEntry | null;
  loading: boolean;
  loadAdn: (ref: string, rev?: number) => Promise<AdnEntry | null>;
  saveAdn: (adn: AdnAvatar, visibilidad: AdnEntry["visibilidad"]) => Promise<void>;
  invalidateCache: (ref: string) => void;
}

/** Cache: AdnEntry en memoria por ref+rev para lectura sesión única (excepto cambio de rev). */
const cache = new Map<string, { entry: AdnEntry; rev: number }>();

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function emitAdnChange(): void {
  if (!isClient()) return;
  try {
    window.dispatchEvent(new Event(ADN_EVENT));
  } catch {}
}

/** Leer el storage (localStorage) crudo: JSON serializado { [ref]: AdnEntry } */
function readStorage(): Record<string, AdnEntry> {
  if (!isClient()) return {};
  try {
    const raw = localStorage.getItem(ADN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, AdnEntry>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

/** Escribir de vuelta el storage completo (commit optimista). */
function writeStorage(data: Record<string, AdnEntry>): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(ADN_STORAGE_KEY, JSON.stringify(data));
  } catch {}
  emitAdnChange();
}

/** Guardar la entrada de ADN con deduplicación por ref (url). "biblioteca:…" vs "genesis:…". */
export async function saveAdnToLibrary(adn: AdnAvatar, visibilidad: AdnEntry["visibilidad"]): Promise<void> {
  const url = adn.base.ref || `biblioteca:${adn.id}`;
  const cleaned = sanearAdn(adn);
  if (!cleaned) throw new Error("ADN inválido por sanearAdn");
  const raw = JSON.stringify(cleaned);

  const existing = readStorage();
  const refKey = url.startsWith("biblioteca:") || url.startsWith("genesis:") ? url : `biblioteca:${url}`;
  existing[refKey] = {
    id: cleaned.id,
    kind: ADN_AVATAR_KIND,
    title: cleaned.nombre || "Avatar",
    url,
    origin: "avatar",
    savedAt: Date.now(),
    rev: cleaned.rev,
    visibilidad,
    raw,
  };

  writeStorage(existing);
  void mergeUserPrefs({ [ADN_STORAGE_KEY]: existing }).catch(() => {});
}

/** Cargar una entrada específica de ADN por su ref (url); actualiza el cache si la revisión cambia. */
export async function loadAdnEntry(ref: string, rev?: number): Promise<AdnEntry | null> {
  const cacheKey = ref;
  const cached = cache.get(cacheKey);
  if (cached && (!rev || cached.rev === rev)) {
    return cached.entry;
  }

  const storage = readStorage();
  const entry = storage[ref];
  if (!entry) return null;

  if (rev !== undefined && entry.rev !== rev) return null;

  cache.set(cacheKey, { entry, rev: entry.rev });
  return entry;
}

/** Hook reactivo: carga y suscribe un ADN por ref. */
export function useAdnEntry(ref: string, rev?: number): UseAdnEntry {
  const [state, setState] = useState<{ entry: AdnEntry | null; loading: boolean }>({ entry: null, loading: !!ref });

  useEffect(() => {
    let alive = true;
    if (!ref) {
      if (alive) setState({ entry: null, loading: false });
      return;
    }

    const load = async () => {
      try {
        const entry = await loadAdnEntry(ref, rev);
        if (!alive) return;
        setState({ entry, loading: false });
      } catch {
        if (alive) setState({ entry: null, loading: false });
      }
    };

    void load();

    const onChange = () => {
      void load();
    };
    window.addEventListener(ADN_EVENT, onChange);

    return () => {
      alive = false;
      window.removeEventListener(ADN_EVENT, onChange);
    };
  }, [ref, rev]);

  const loadAdn = useCallback(async (r: string, rev?: number) => {
    try {
      const entry = await loadAdnEntry(r, rev);
      setState({ entry, loading: false });
      return entry;
    } catch {
      setState({ entry: null, loading: false });
      return null;
    }
  }, []);

  const saveAdn = useCallback(async (adn: AdnAvatar, visibilidad: AdnEntry["visibilidad"]) => {
    await saveAdnToLibrary(adn, visibilidad);
    const url = adn.base.ref || `biblioteca:${adn.id}`;
    const refKey = url.startsWith("biblioteca:") || url.startsWith("genesis:") ? url : `biblioteca:${url}`;
    await loadAdn(refKey, adn.rev);
  }, []);

  const invalidateCache = useCallback((r: string) => {
    cache.delete(r);
    setState((s) => ({ ...s, loading: true }));
    void loadAdn(r, rev);
  }, [rev, loadAdn]);

  return { ...state, loadAdn, saveAdn, invalidateCache };
}

/** Obtener todas las entradas de ADN guardadas en la Biblioteca (ordenadas por fecha de guardado). */
export function getSavedAdnEntries(): AdnEntry[] {
  const storage = readStorage();
  return Object.values(storage).sort((a, b) => b.savedAt - a.savedAt);
}

/** Eliminar un ADN de la Biblioteca (y de cache). */
export async function removeAdnFromLibrary(ref: string): Promise<void> {
  const storage = readStorage();
  if (!storage[ref]) return;
  delete storage[ref];
  writeStorage(storage);
  cache.delete(ref);
}

/** Parsear el raw JSON a AdnAvatar (validado con sanearAdn). */
export async function parseAdnEntry(entry: AdnEntry): Promise<AdnAvatar | null> {
  try {
    const parsed = JSON.parse(entry.raw) as AdnAvatar;
    const validated = sanearAdn(parsed);
    return validated;
  } catch {
    return null;
  }
}
