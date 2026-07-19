"use client";

/**
 * StarSeed OS — ESPACIOS DE TRABAJO (Adenda 76 · Agente G2)
 * ============================================================================
 * Un "espacio de trabajo" agrupa chats, carpetas, archivos de la Librería,
 * memorias, enlaces, instrucciones e identidad (personalidad + preferencias)
 * bajo un mismo contexto. Al adjuntar un chat a un espacio:
 *   · sus INSTRUCCIONES se inyectan al system prompt del chat (vía
 *     `workspaceSystemExtra(convId)`, que el pipeline `composeAuroraSystem` lee),
 *   · si la personalidad es FIJA, se fuerza en el chat (meta.config.personalityId
 *     + asignación por chat), si es VARIABLE se sugiere como preferida,
 *   · las preferencias (voz, proveedor…) se aplican a meta.config del chat.
 *
 * PERSISTENCIA (sin DDL) — copia EXACTA del patrón de la Librería
 * (`entity-library.ts`): local-first en `safe-storage` + nube en `entity_state`
 * (owner_kind="user", key="workspaces") + realtime (`subscribeEntityState`) +
 * broadcast inmediato (`live-signal`). LWW por `updatedAt` de cada espacio, con
 * tumbas (`tombstones`) para que un borrado no "resucite" al mezclar caché+nube.
 *
 * Contrato con el Agente G1 (importa dinámicamente): ver exports marcados.
 */

import { useCallback, useEffect, useState } from "react";
import { safeGet, safeSet } from "@/lib/safe-storage";
import {
  getEntityState,
  setEntityState,
  subscribeEntityState,
  currentUserRef,
  type EntityRef,
} from "@/lib/sync/entity-state";
import { emitChange, onChange } from "@/lib/sync/live-signal";
import { cachedConversations } from "@/lib/aurora/conversations";
import { patchChatConfig } from "@/lib/aurora/config-change";
import { setActivePersonality } from "@/lib/aurora/personalities";
import type { ChatConfig } from "@/components/aurora/chat-config-menu";

/* ───────────────────────────── Modelo (CONTRATO G1) ───────────────────────── */

export interface WorkspaceLink {
  label: string;
  url: string;
}

/** Modo de personalidad del espacio. `fija` fuerza; `variable` sugiere. */
export type WorkspacePersonalityMode = "fija" | "variable";

/**
 * CONTRATO EXACTO con G1 — no cambiar las firmas de estos campos.
 * Los campos extra viven bajo `config` (voz por defecto, proveedor fijado…).
 */
export interface Workspace {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  chatIds: string[];
  folderIds: string[];
  fileRefs: string[];
  memoryIds: string[];
  links: WorkspaceLink[];
  instructions?: string;
  personalityId?: string | null;
  personalityMode?: WorkspacePersonalityMode;
  config?: Record<string, unknown>;
  /** Accesos y permisos (AccessGrant[] + ámbito + espejo os_spaces). Ver workspace-sharing.ts. */
  access?: unknown;
  createdAt: number;
  updatedAt: number;
}

/** Forma que el espacio guarda en `config` (todo opcional). */
export interface WorkspaceConfigExtra {
  /** Voz de Aurora ON/OFF por defecto para los chats del espacio. */
  voice?: boolean;
  /** Proveedor/modelo fijado por defecto para los chats del espacio. */
  provider?: string | null;
  [k: string]: unknown;
}

/* ───────────────────────────── Persistencia base ──────────────────────────── */

const CACHE_KEY = "starseed.workspaces.cache.v1";
const ES_KEY = "workspaces";
/** Topic de live-signal (privado de la cuenta) para difusión inmediata. */
export const WORKSPACES_TOPIC = "aurora:workspaces";
/** Evento del DOM: cambió la lista de espacios (arranque instantáneo local). */
export const WORKSPACES_EVENT = "starseed:workspaces";

interface WorkspacesBlob {
  v: 1;
  workspaces: Workspace[];
  /** id → timestamp de borrado (evita resurrección al mezclar caché+nube). */
  tombstones: Record<string, number>;
}

const isClient = (): boolean => typeof window !== "undefined";

function emptyBlob(): WorkspacesBlob {
  return { v: 1, workspaces: [], tombstones: {} };
}

function normalizeWorkspace(raw: Partial<Workspace> & { id: string }): Workspace {
  const now = Date.now();
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Espacio",
    icon: typeof raw.icon === "string" ? raw.icon : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    chatIds: Array.isArray(raw.chatIds) ? raw.chatIds.filter((x) => typeof x === "string") : [],
    folderIds: Array.isArray(raw.folderIds) ? raw.folderIds.filter((x) => typeof x === "string") : [],
    fileRefs: Array.isArray(raw.fileRefs) ? raw.fileRefs.filter((x) => typeof x === "string") : [],
    memoryIds: Array.isArray(raw.memoryIds) ? raw.memoryIds.filter((x) => typeof x === "string") : [],
    links: Array.isArray(raw.links)
      ? raw.links.filter((l): l is WorkspaceLink => !!l && typeof l.url === "string")
      : [],
    instructions: typeof raw.instructions === "string" ? raw.instructions : undefined,
    personalityId: raw.personalityId ?? null,
    personalityMode: raw.personalityMode === "fija" ? "fija" : raw.personalityMode === "variable" ? "variable" : "variable",
    config: raw.config && typeof raw.config === "object" ? (raw.config as Record<string, unknown>) : {},
    access: raw.access,
    createdAt: Number(raw.createdAt ?? now),
    updatedAt: Number(raw.updatedAt ?? now),
  };
}

function readBlob(): WorkspacesBlob {
  if (!isClient()) return emptyBlob();
  try {
    const raw = safeGet(CACHE_KEY);
    if (!raw) return emptyBlob();
    const p = JSON.parse(raw) as Partial<WorkspacesBlob> | null;
    return {
      v: 1,
      workspaces: Array.isArray(p?.workspaces)
        ? (p!.workspaces as Workspace[]).filter((w) => w && typeof w.id === "string").map((w) => normalizeWorkspace(w))
        : [],
      tombstones: p?.tombstones && typeof p.tombstones === "object" ? (p.tombstones as Record<string, number>) : {},
    };
  } catch {
    return emptyBlob();
  }
}

function writeBlob(blob: WorkspacesBlob): void {
  if (!isClient()) return;
  safeSet(CACHE_KEY, JSON.stringify(blob)); // safe-storage nunca lanza (poda/degrada)
  try {
    window.dispatchEvent(new CustomEvent(WORKSPACES_EVENT));
  } catch {
    /* */
  }
}

/** Espacios en caché (orden: los actualizados primero). Instantáneo, SSR-safe. */
export function cachedWorkspaces(): Workspace[] {
  return [...readBlob().workspaces].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Un espacio en caché por id, o null. Síncrono. */
export function cachedWorkspace(id: string): Workspace | null {
  return readBlob().workspaces.find((w) => w.id === id) ?? null;
}

async function ownerRef(): Promise<EntityRef | null> {
  return currentUserRef();
}

/** Mezcla dos blobs por id (LWW por updatedAt) respetando tumbas. */
function mergeBlobs(a: WorkspacesBlob, b: WorkspacesBlob): WorkspacesBlob {
  const tombstones: Record<string, number> = { ...a.tombstones };
  for (const [id, ts] of Object.entries(b.tombstones)) {
    tombstones[id] = Math.max(tombstones[id] ?? 0, ts);
  }
  const byId = new Map<string, Workspace>();
  for (const w of [...a.workspaces, ...b.workspaces]) {
    const prev = byId.get(w.id);
    if (!prev || w.updatedAt >= prev.updatedAt) byId.set(w.id, w);
  }
  // Aplica tumbas: descarta lo borrado (a menos que una edición posterior lo revalide).
  const workspaces: Workspace[] = [];
  for (const w of byId.values()) {
    const deletedAt = tombstones[w.id];
    if (deletedAt && deletedAt >= w.updatedAt) continue;
    workspaces.push(w);
  }
  return { v: 1, workspaces, tombstones };
}

/** Baja el blob de la nube y lo mezcla con la caché local. Devuelve la lista. */
export async function refreshWorkspaces(): Promise<Workspace[]> {
  const ref = await ownerRef();
  if (!ref) return cachedWorkspaces();
  try {
    const row = await getEntityState<Partial<WorkspacesBlob>>(ref, ES_KEY);
    const cloud: WorkspacesBlob = row?.value
      ? {
          v: 1,
          workspaces: Array.isArray(row.value.workspaces)
            ? (row.value.workspaces as Workspace[]).filter((w) => w && typeof w.id === "string").map(normalizeWorkspace)
            : [],
          tombstones:
            row.value.tombstones && typeof row.value.tombstones === "object"
              ? (row.value.tombstones as Record<string, number>)
              : {},
        }
      : emptyBlob();
    const merged = mergeBlobs(readBlob(), cloud);
    writeBlob(merged);
    return [...merged.workspaces].sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return cachedWorkspaces();
  }
}

/** Empuja el blob local a la nube (best-effort) y difunde la señal. */
async function pushBlob(blob: WorkspacesBlob): Promise<void> {
  const ref = await ownerRef();
  if (!ref) return;
  try {
    await setEntityState(ref, ES_KEY, blob);
    void emitChange(WORKSPACES_TOPIC, { data: { kind: "workspaces" } });
  } catch {
    /* best-effort: la caché local ya lo tiene */
  }
}

/** CONTRATO G1 — lista de espacios (nube + caché mezclada). */
export async function listWorkspaces(): Promise<Workspace[]> {
  return refreshWorkspaces();
}

/**
 * Lee → aplica mutación → escribe (caché + nube + señal). Read-modify-write
 * contra la ÚLTIMA versión conocida (mezcla caché+nube) para no pisar cambios
 * concurrentes de otros dispositivos.
 */
async function mutate(fn: (blob: WorkspacesBlob) => WorkspacesBlob): Promise<Workspace[]> {
  // Base: mezcla lo local con lo de la nube antes de mutar (si hay sesión).
  let base = readBlob();
  const ref = await ownerRef();
  if (ref) {
    try {
      const row = await getEntityState<Partial<WorkspacesBlob>>(ref, ES_KEY);
      if (row?.value) {
        const cloud: WorkspacesBlob = {
          v: 1,
          workspaces: Array.isArray(row.value.workspaces)
            ? (row.value.workspaces as Workspace[]).filter((w) => w && typeof w.id === "string").map(normalizeWorkspace)
            : [],
          tombstones:
            row.value.tombstones && typeof row.value.tombstones === "object"
              ? (row.value.tombstones as Record<string, number>)
              : {},
        };
        base = mergeBlobs(base, cloud);
      }
    } catch {
      /* usa la caché local */
    }
  }
  const next = fn(base);
  writeBlob(next);
  await pushBlob(next);
  return [...next.workspaces].sort((a, b) => b.updatedAt - a.updatedAt);
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ───────────────────────────── CRUD (CONTRATO G1) ─────────────────────────── */

export interface CreateWorkspaceInput {
  name: string;
  icon?: string;
  description?: string;
  instructions?: string;
  personalityId?: string | null;
  personalityMode?: WorkspacePersonalityMode;
  chatIds?: string[];
  folderIds?: string[];
  fileRefs?: string[];
  memoryIds?: string[];
  links?: WorkspaceLink[];
  config?: Record<string, unknown>;
}

/** CONTRATO G1 — crea un espacio y devuelve el objeto creado. */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const now = Date.now();
  const ws = normalizeWorkspace({
    id: uuid(),
    name: input.name,
    icon: input.icon,
    description: input.description,
    instructions: input.instructions,
    personalityId: input.personalityId ?? null,
    personalityMode: input.personalityMode ?? "variable",
    chatIds: input.chatIds ?? [],
    folderIds: input.folderIds ?? [],
    fileRefs: input.fileRefs ?? [],
    memoryIds: input.memoryIds ?? [],
    links: input.links ?? [],
    config: input.config ?? {},
    createdAt: now,
    updatedAt: now,
  });
  await mutate((blob) => {
    const tombstones = { ...blob.tombstones };
    delete tombstones[ws.id];
    return { v: 1, workspaces: [...blob.workspaces.filter((w) => w.id !== ws.id), ws], tombstones };
  });
  // Aplica identidad/instrucciones a los chats iniciales.
  await applyWorkspaceToChats(ws, ws.chatIds);
  return ws;
}

/** CONTRATO G1 — actualiza un espacio (patch superficial) y reaplica a sus chats. */
export async function updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace | null> {
  await mutate((blob) => {
    const i = blob.workspaces.findIndex((w) => w.id === id);
    if (i < 0) return blob;
    const merged = normalizeWorkspace({ ...blob.workspaces[i], ...patch, id, updatedAt: Date.now() });
    const workspaces = [...blob.workspaces];
    workspaces[i] = merged;
    return { ...blob, workspaces };
  });
  const updated = cachedWorkspace(id);
  if (updated) await applyWorkspaceToChats(updated, updated.chatIds);
  return updated;
}

/** CONTRATO G1 — borra un espacio (con tumba) y limpia la marca en sus chats. */
export async function deleteWorkspace(id: string): Promise<void> {
  const prev = cachedWorkspace(id);
  await mutate((blob) => ({
    v: 1,
    workspaces: blob.workspaces.filter((w) => w.id !== id),
    tombstones: { ...blob.tombstones, [id]: Date.now() },
  }));
  // Desvincula los chats (quita workspaceId/instrucciones inyectadas). Best-effort.
  if (prev) {
    for (const chatId of prev.chatIds) {
      try {
        await patchChatConfig(chatId, { workspaceId: undefined, workspaceInstructions: undefined });
      } catch {
        /* */
      }
    }
  }
}

/**
 * CONTRATO G1 — adjunta recursos a un espacio (une, sin duplicar). Reaplica la
 * identidad/instrucciones a los chats afectados.
 */
export async function attachToWorkspace(
  wsId: string,
  add: { chatIds?: string[]; folderIds?: string[]; fileRefs?: string[]; memoryIds?: string[] },
): Promise<Workspace | null> {
  const uniq = (a: string[], b?: string[]): string[] => Array.from(new Set([...a, ...(b ?? [])]));
  await mutate((blob) => {
    const i = blob.workspaces.findIndex((w) => w.id === wsId);
    if (i < 0) return blob;
    const w = blob.workspaces[i];
    const merged: Workspace = {
      ...w,
      chatIds: uniq(w.chatIds, add.chatIds),
      folderIds: uniq(w.folderIds, add.folderIds),
      fileRefs: uniq(w.fileRefs, add.fileRefs),
      memoryIds: uniq(w.memoryIds, add.memoryIds),
      updatedAt: Date.now(),
    };
    const workspaces = [...blob.workspaces];
    workspaces[i] = merged;
    return { ...blob, workspaces };
  });
  const updated = cachedWorkspace(wsId);
  if (updated && add.chatIds?.length) await applyWorkspaceToChats(updated, add.chatIds);
  return updated;
}

/** Quita un recurso concreto de un espacio (y desvincula el chat si aplica). */
export async function detachFromWorkspace(
  wsId: string,
  remove: { chatId?: string; folderId?: string; fileRef?: string; memoryId?: string },
): Promise<Workspace | null> {
  await mutate((blob) => {
    const i = blob.workspaces.findIndex((w) => w.id === wsId);
    if (i < 0) return blob;
    const w = blob.workspaces[i];
    const merged: Workspace = {
      ...w,
      chatIds: remove.chatId ? w.chatIds.filter((x) => x !== remove.chatId) : w.chatIds,
      folderIds: remove.folderId ? w.folderIds.filter((x) => x !== remove.folderId) : w.folderIds,
      fileRefs: remove.fileRef ? w.fileRefs.filter((x) => x !== remove.fileRef) : w.fileRefs,
      memoryIds: remove.memoryId ? w.memoryIds.filter((x) => x !== remove.memoryId) : w.memoryIds,
      updatedAt: Date.now(),
    };
    const workspaces = [...blob.workspaces];
    workspaces[i] = merged;
    return { ...blob, workspaces };
  });
  const updated = cachedWorkspace(wsId);
  if (remove.chatId) {
    try {
      await patchChatConfig(remove.chatId, { workspaceId: undefined, workspaceInstructions: undefined });
    } catch {
      /* */
    }
  }
  return updated;
}

/* ─────────────── Inyección al chat: instrucciones + personalidad ───────────── */

/**
 * Aplica la identidad del espacio a un chat concreto (meta.config del chat, que
 * el pipeline ya lee): marca `workspaceId`, denormaliza `workspaceInstructions`
 * (snapshot para `workspaceSystemExtra`), fija personalidad si el modo es `fija`
 * y aplica preferencias (voz, proveedor). Idempotente; best-effort.
 */
export async function applyWorkspaceToChat(ws: Workspace, chatId: string): Promise<void> {
  if (!chatId) return;
  const cfg = (ws.config ?? {}) as WorkspaceConfigExtra;
  const patch: Partial<ChatConfig> = {
    workspaceId: ws.id,
    workspaceInstructions: (ws.instructions ?? "").trim() || undefined,
  };
  // Personalidad FIJA: fuerza la del espacio en el chat.
  if (ws.personalityMode === "fija" && ws.personalityId) {
    patch.personalityId = ws.personalityId;
    try {
      setActivePersonality({ scope: "chat", chatId }, ws.personalityId);
    } catch {
      /* */
    }
  }
  // Preferencias por defecto del espacio (no pisan valores explícitos ya puestos
  // por el usuario salvo la voz/proveedor que el espacio declara como default).
  if (typeof cfg.voice === "boolean") patch.voice = cfg.voice;
  if (typeof cfg.provider === "string") patch.provider = cfg.provider;
  try {
    await patchChatConfig(chatId, patch);
  } catch {
    /* */
  }
}

async function applyWorkspaceToChats(ws: Workspace, chatIds: string[]): Promise<void> {
  for (const id of chatIds) {
    // Secuencial para no saturar la nube; cada uno es best-effort.
    // eslint-disable-next-line no-await-in-loop
    await applyWorkspaceToChat(ws, id);
  }
}

/**
 * CONTRATO PIPELINE — extra de system prompt del ESPACIO ACTIVO de un chat.
 * SÍNCRONO y barato (lee de la caché local): pensado para llamarse dentro de
 * `composeAuroraSystem` (turn.ts). Devuelve "" si el chat no está en un espacio
 * o el espacio no tiene instrucciones.
 *
 * Uso en el pipeline (ya cableado en composeAuroraSystem):
 *   const wx = workspaceSystemExtra(opts.convId); if (wx) pieces.push(wx);
 */
export function workspaceSystemExtra(convId?: string | null): string {
  if (!convId) return "";
  try {
    const conv = cachedConversations().find((c) => c.id === convId);
    const cfg = ((conv?.meta as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<string, unknown>;
    const wsId = typeof cfg.workspaceId === "string" ? cfg.workspaceId : undefined;
    let instructions = "";
    let name = "";
    if (wsId) {
      const ws = cachedWorkspace(wsId);
      if (ws) {
        instructions = (ws.instructions ?? "").trim();
        name = ws.name;
      }
    }
    // Respaldo: snapshot denormalizado en el propio meta.config del chat.
    if (!instructions && typeof cfg.workspaceInstructions === "string") {
      instructions = cfg.workspaceInstructions.trim();
    }
    if (!instructions) return "";
    return (
      `ESPACIO DE TRABAJO ACTIVO${name ? ` — «${name}»` : ""}. ` +
      `Sigue estas instrucciones del espacio en este chat:\n${instructions}`
    );
  } catch {
    return "";
  }
}

/* ───────────────────────────── Sync en vivo ───────────────────────────────── */

const SYNC_FLAG = "__STARSEED_WORKSPACES_SYNC__";

/** Arranca (una sola vez por pestaña) la sincronización en vivo de espacios. */
export function startWorkspacesSync(): void {
  if (!isClient()) return;
  const w = window as unknown as Record<string, unknown>;
  if (w[SYNC_FLAG]) return;
  w[SYNC_FLAG] = true;

  const boot = async () => {
    const ref = await ownerRef();
    if (!ref) return;
    await refreshWorkspaces();
    // Camino 1 — realtime de entity_state (red de seguridad entre dispositivos).
    subscribeEntityState(ref, ES_KEY, () => {
      void refreshWorkspaces();
    });
    // Camino 2 — broadcast inmediato del canal de cuenta.
    onChange(WORKSPACES_TOPIC, () => {
      void refreshWorkspaces();
    });
  };
  void boot();
}

/* ───────────────────────────── Hook (CONTRATO G1) ─────────────────────────── */

export interface UseWorkspaces {
  workspaces: Workspace[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (input: CreateWorkspaceInput) => Promise<Workspace>;
  update: (id: string, patch: Partial<Workspace>) => Promise<Workspace | null>;
  remove: (id: string) => Promise<void>;
  attach: (
    wsId: string,
    add: { chatIds?: string[]; folderIds?: string[]; fileRefs?: string[]; memoryIds?: string[] },
  ) => Promise<Workspace | null>;
}

/** CONTRATO G1 — hook reactivo de espacios (realtime + refresh). */
export function useWorkspaces(): UseWorkspaces {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isClient()) return;
    startWorkspacesSync();
    const sync = () => setWorkspaces(cachedWorkspaces());
    sync();
    void refreshWorkspaces().then(() => {
      sync();
      setLoading(false);
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY) sync();
    };
    window.addEventListener(WORKSPACES_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WORKSPACES_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const refresh = useCallback(async () => {
    await refreshWorkspaces();
    setWorkspaces(cachedWorkspaces());
  }, []);
  const create = useCallback(async (input: CreateWorkspaceInput) => {
    const ws = await createWorkspace(input);
    setWorkspaces(cachedWorkspaces());
    return ws;
  }, []);
  const update = useCallback(async (id: string, patch: Partial<Workspace>) => {
    const ws = await updateWorkspace(id, patch);
    setWorkspaces(cachedWorkspaces());
    return ws;
  }, []);
  const remove = useCallback(async (id: string) => {
    await deleteWorkspace(id);
    setWorkspaces(cachedWorkspaces());
  }, []);
  const attach = useCallback(
    async (wsId: string, add: { chatIds?: string[]; folderIds?: string[]; fileRefs?: string[]; memoryIds?: string[] }) => {
      const ws = await attachToWorkspace(wsId, add);
      setWorkspaces(cachedWorkspaces());
      return ws;
    },
    [],
  );

  return { workspaces, loading, refresh, create, update, remove, attach };
}

export default useWorkspaces;
