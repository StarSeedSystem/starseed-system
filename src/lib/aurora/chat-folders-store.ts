"use client";

/**
 * StarSeed OS — ALMACÉN COMPARTIDO de CARPETAS de chat (Adenda 71-ter · I1)
 * ============================================================================
 * `aurora_chat_folders` estaba en la publicación realtime pero SIN suscriptor:
 * al crear una carpeta en una superficie, las demás no se enteraban hasta
 * recargar. Este módulo es la ÚNICA puerta a las carpetas y las mantiene en
 * vivo por DOS caminos que se deduplican entre sí:
 *   1. `live-signal` (broadcast en el canal de cuenta) → inmediato entre dispositivos.
 *   2. `postgres_changes` sobre `aurora_chat_folders` → red de seguridad.
 *
 * Lo usa el Exocórtex, Nexus, `/agent`, el orbe… vía `useChatFolders()`.
 * Nunca lanza; SSR-safe; optimista (la UI ve el cambio al instante).
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { onTableChange } from "@/lib/realtime/realtime";
import { emitChange, onChange } from "@/lib/sync/live-signal";
import { safeGet, safeSet } from "@/lib/safe-storage";

/** Topic de live-signal para carpetas (privado de la cuenta). */
export const AI_FOLDERS_TOPIC = "aurora:folders";
/** Evento del DOM: cambió la lista de carpetas (arranque instantáneo local). */
export const AI_FOLDERS_EVENT = "starseed:ai-folders";
const CACHE_KEY = "starseed.aurora.folders.cache.v1";

export interface ChatFolder {
  id: string;
  name: string;
  position: number;
}

interface FolderRow {
  id: string;
  user_id: string | null;
  name: string | null;
  position: number | null;
}

const isClient = () => typeof window !== "undefined";

function emitDom(): void {
  if (!isClient()) return;
  try { window.dispatchEvent(new CustomEvent(AI_FOLDERS_EVENT)); } catch { /* */ }
}

// ── Caché local ──────────────────────────────────────────────────────────────
function readCache(): ChatFolder[] {
  if (!isClient()) return [];
  try {
    const raw = safeGet(CACHE_KEY);
    const arr = raw ? (JSON.parse(raw) as ChatFolder[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeCache(folders: ChatFolder[]): void {
  if (!isClient()) return;
  safeSet(CACHE_KEY, JSON.stringify(folders)); // nunca lanza (poda/degrada a memoria)
  emitDom();
}

/** Carpetas en caché (orden por position). Instantáneo, SSR-safe. */
export function cachedFolders(): ChatFolder[] {
  return [...readCache()].sort((a, b) => a.position - b.position);
}

async function currentUserId(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

function toFolder(r: FolderRow): ChatFolder {
  return { id: r.id, name: r.name || "Carpeta", position: Number(r.position ?? 0) };
}

// ── Lectura desde la nube ────────────────────────────────────────────────────
/** Baja la lista de carpetas y refresca la caché. Devuelve la lista. */
export async function refreshFolders(): Promise<ChatFolder[]> {
  const uid = await currentUserId();
  if (!uid) return cachedFolders();
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from("aurora_chat_folders")
      .select("id,user_id,name,position")
      .eq("user_id", uid)
      .order("position", { ascending: true });
    if (error || !data) return cachedFolders();
    const folders = (data as unknown as FolderRow[]).map(toFolder);
    writeCache(folders);
    return folders;
  } catch {
    return cachedFolders();
  }
}

// ── Escritura ────────────────────────────────────────────────────────────────
/** Crea una carpeta (nube + caché + señal). Devuelve su nombre o null. */
export async function createFolder(name: string): Promise<ChatFolder | null> {
  const clean = (name || "").trim();
  if (!clean) return null;
  const uid = await currentUserId();
  if (!uid) return null;
  try {
    const sb = createClient();
    const position = cachedFolders().length;
    const { data, error } = await sb
      .from("aurora_chat_folders")
      .insert({ user_id: uid, name: clean, position })
      .select("id,user_id,name,position")
      .single();
    if (error || !data) return null;
    const folder = toFolder(data as unknown as FolderRow);
    writeCache([...cachedFolders(), folder]);
    void emitChange(AI_FOLDERS_TOPIC, { id: folder.id, data: { kind: "folder" } });
    return folder;
  } catch { return null; }
}

/** Renombra una carpeta (nube + caché + señal). */
export async function renameFolder(id: string, name: string): Promise<void> {
  const clean = (name || "").trim();
  if (!id || !clean) return;
  const next = cachedFolders().map((f) => (f.id === id ? { ...f, name: clean } : f));
  writeCache(next);
  const uid = await currentUserId();
  if (!uid) return;
  try {
    const sb = createClient();
    await sb.from("aurora_chat_folders").update({ name: clean }).eq("id", id).eq("user_id", uid);
    void emitChange(AI_FOLDERS_TOPIC, { id, data: { kind: "folder" } });
  } catch { /* */ }
}

/**
 * Fija una carpeta arriba (Adenda 76): le da la posición mínima − 1, así queda
 * por encima del resto (el orden global es por `position` ascendente). Nube +
 * caché + señal. Reversible fijando otra carpeta. Best-effort.
 */
export async function pinFolderTop(id: string): Promise<void> {
  if (!id) return;
  const list = cachedFolders();
  const minPos = list.reduce((m, f) => Math.min(m, f.position), 0);
  const top = minPos - 1;
  writeCache(list.map((f) => (f.id === id ? { ...f, position: top } : f)));
  const uid = await currentUserId();
  if (!uid) return;
  try {
    const sb = createClient();
    await sb.from("aurora_chat_folders").update({ position: top }).eq("id", id).eq("user_id", uid);
    void emitChange(AI_FOLDERS_TOPIC, { id, data: { kind: "folder" } });
  } catch { /* */ }
}

/** Borra una carpeta (nube + caché + señal). No toca las conversaciones. */
export async function deleteFolder(id: string): Promise<void> {
  if (!id) return;
  writeCache(cachedFolders().filter((f) => f.id !== id));
  const uid = await currentUserId();
  if (!uid) return;
  try {
    const sb = createClient();
    await sb.from("aurora_chat_folders").delete().eq("id", id).eq("user_id", uid);
    void emitChange(AI_FOLDERS_TOPIC, { id, data: { kind: "folder" } });
  } catch { /* */ }
}

// ── Sincronización en vivo (singleton por pestaña) ──────────────────────────
const SYNC_FLAG = "__STARSEED_AI_FOLDERS_SYNC__";

/** Arranca (una sola vez) la sincronización en vivo de carpetas. */
export function startFoldersSync(): void {
  if (!isClient()) return;
  const w = window as unknown as Record<string, unknown>;
  if (w[SYNC_FLAG]) return;
  w[SYNC_FLAG] = true;

  const boot = async () => {
    const uid = await currentUserId();
    if (!uid) return;
    await refreshFolders();
    // Camino 1 — postgres_changes (red de seguridad entre dispositivos).
    onTableChange<FolderRow>("aurora_chat_folders", { filter: `user_id=eq.${uid}`, event: "*" }, () => {
      void refreshFolders();
    });
    // Camino 2 — live-signal (broadcast inmediato del canal de cuenta).
    onChange(AI_FOLDERS_TOPIC, () => { void refreshFolders(); });
  };
  void boot();

  try {
    const sb = createClient();
    sb.auth.onAuthStateChange(() => { void boot(); });
  } catch { /* */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export interface UseChatFolders {
  folders: ChatFolder[];
  create: (name: string) => Promise<ChatFolder | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Lista de carpetas de chat (nube + caché), en vivo. Usable en cualquier superficie. */
export function useChatFolders(): UseChatFolders {
  const [folders, setFolders] = useState<ChatFolder[]>([]);

  useEffect(() => {
    if (!isClient()) return;
    startFoldersSync();
    const refresh = () => setFolders(cachedFolders());
    refresh();
    void refreshFolders().then(refresh);
    const onStorage = (e: StorageEvent) => { if (e.key === CACHE_KEY) refresh(); };
    window.addEventListener(AI_FOLDERS_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AI_FOLDERS_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const create = useCallback(async (name: string) => {
    const f = await createFolder(name);
    setFolders(cachedFolders());
    return f;
  }, []);
  const rename = useCallback(async (id: string, name: string) => {
    await renameFolder(id, name);
    setFolders(cachedFolders());
  }, []);
  const remove = useCallback(async (id: string) => {
    await deleteFolder(id);
    setFolders(cachedFolders());
  }, []);
  const refresh = useCallback(async () => {
    await refreshFolders();
    setFolders(cachedFolders());
  }, []);

  return { folders, create, rename, remove, refresh };
}

export default useChatFolders;
