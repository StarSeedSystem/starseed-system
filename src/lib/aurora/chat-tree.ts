"use client";

/**
 * StarSeed OS — Aurora · Árbol de contextos de conversación
 * ----------------------------------------------------------------------------
 * Modelo de RAMIFICACIÓN de los chats con Aurora: un árbol de "contextos" (temas
 * de conversación) que se pueden crear, ramificar (crear un hijo desde otro),
 * renombrar y archivar. Persiste en localStorage bajo
 * `starseed.aurora.chattree.v1` (SSR-safe).
 *
 * ¿Por qué un modelo aparte del registro (aurora-chat-log)?
 *  · El registro (`aurora-chat-log.ts`) agrupa TODO por día y NO se toca aquí
 *    (regla de la misión): es la fuente de verdad histórica del contenido.
 *  · Este árbol añade una dimensión ORTOGONAL: la estructura temática. El "chat
 *    activo" ES un contexto; los mensajes se asocian a él por timestamp.
 *
 * Asociación mensaje ↔ contexto (sin romper el log):
 *  · Mantenemos un ÍNDICE PARALELO `contextId → ts[]` en este mismo store. Cuando
 *    hay un contexto activo, `tagAuroraMessage(ts)` registra ese timestamp bajo
 *    el contexto activo. Así podemos reconstruir la conversación de un contexto
 *    cruzando esos timestamps con las entradas del registro — sin añadir campos
 *    al log ni modificar su formato.
 *  · Si el registro ya guardase `contextId` en el futuro, este índice sigue
 *    siendo válido (es aditivo y defensivo).
 *
 * 100% aditivo y defensivo: nada aquí instancia motores ni toca el provider.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

// ── Constantes ───────────────────────────────────────────────────────────────
/** Clave de localStorage del árbol de contextos (versionada). */
export const AURORA_CHATTREE_KEY = "starseed.aurora.chattree.v1";
/** Evento interno (mismo tab) emitido tras cada cambio del árbol. */
export const AURORA_CHATTREE_CHANGE_EVENT = "starseed:aurora-chattree";
/** Tope defensivo de contextos persistidos. */
export const AURORA_CHATTREE_CAP = 400;
/** Tope de timestamps asociados por contexto (ring; se descartan los antiguos). */
const CONTEXT_TS_CAP = 600;

// ── Tipos ────────────────────────────────────────────────────────────────────
/** Un contexto/tema de conversación dentro del árbol. */
export interface ChatContext {
  /** Identificador estable (no cambia al renombrar). */
  id: string;
  /** Título editable mostrado en el árbol. */
  title: string;
  /** Contexto padre (null/undefined = raíz). Define la ramificación. */
  parentId?: string | null;
  /** Epoch ms de creación. */
  createdAt: number;
  /** Epoch ms de la última actividad (mensaje, rename, ramificación de hijo). */
  updatedAt: number;
  /** Resumen local opcional (primeras palabras del tema, editable). */
  summary?: string;
  /** Archivado: se oculta del árbol activo pero no se borra. */
  archived?: boolean;
}

/** Estructura persistida completa. */
interface ChatTreeStore {
  v: 1;
  /** Contextos por id. */
  contexts: Record<string, ChatContext>;
  /** Índice paralelo contexto → timestamps de mensajes asociados. */
  index: Record<string, number[]>;
  /** Contexto activo actual (define dónde caen los mensajes nuevos). */
  activeId: string | null;
}

// ── Utilidades internas ──────────────────────────────────────────────────────
function isContext(v: unknown): v is ChatContext {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<ChatContext>;
  return (
    typeof c.id === "string" &&
    c.id.length > 0 &&
    typeof c.title === "string" &&
    typeof c.createdAt === "number" &&
    Number.isFinite(c.createdAt) &&
    typeof c.updatedAt === "number" &&
    Number.isFinite(c.updatedAt)
  );
}

function emptyStore(): ChatTreeStore {
  return { v: 1, contexts: {}, index: {}, activeId: null };
}

/** Genera un id razonablemente único sin depender de crypto (SSR-safe). */
export function newContextId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return `ctx_${c.randomUUID()}`;
  } catch {
    /* defensivo */
  }
  return `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_CHATTREE_CHANGE_EVENT));
  } catch {
    /* defensivo */
  }
}

// ── Lectura / escritura (SSR-safe) ───────────────────────────────────────────
export function readChatTreeStore(): ChatTreeStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(AURORA_CHATTREE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<ChatTreeStore> | null;
    if (!parsed || typeof parsed !== "object") return emptyStore();

    const contexts: Record<string, ChatContext> = {};
    const rawContexts = parsed.contexts;
    if (rawContexts && typeof rawContexts === "object") {
      for (const [id, c] of Object.entries(rawContexts)) {
        if (isContext(c)) contexts[id] = c;
      }
    }

    const index: Record<string, number[]> = {};
    const rawIndex = parsed.index;
    if (rawIndex && typeof rawIndex === "object") {
      for (const [id, list] of Object.entries(rawIndex)) {
        if (Array.isArray(list)) {
          index[id] = list.filter((n) => typeof n === "number" && Number.isFinite(n));
        }
      }
    }

    const activeId =
      typeof parsed.activeId === "string" && contexts[parsed.activeId]
        ? parsed.activeId
        : null;

    return { v: 1, contexts, index, activeId };
  } catch {
    return emptyStore();
  }
}

function writeChatTreeStore(store: ChatTreeStore): void {
  if (typeof window === "undefined") return;
  try {
    // Tope defensivo: si nos pasamos de contextos, descartamos los más antiguos
    // (por createdAt) que estén archivados primero, y si no, los más antiguos.
    let ctxIds = Object.keys(store.contexts);
    if (ctxIds.length > AURORA_CHATTREE_CAP) {
      const sorted = ctxIds
        .map((id) => store.contexts[id])
        .sort((a, b) => {
          const aArch = a.archived ? 0 : 1;
          const bArch = b.archived ? 0 : 1;
          if (aArch !== bArch) return aArch - bArch; // archivados primero a descartar
          return a.createdAt - b.createdAt; // luego, los más antiguos
        });
      const toDrop = sorted.slice(0, ctxIds.length - AURORA_CHATTREE_CAP);
      for (const c of toDrop) {
        delete store.contexts[c.id];
        delete store.index[c.id];
      }
      ctxIds = Object.keys(store.contexts);
    }
    // Ring por contexto en el índice de timestamps.
    for (const id of Object.keys(store.index)) {
      if (!store.contexts[id]) {
        delete store.index[id];
        continue;
      }
      const list = store.index[id];
      if (list.length > CONTEXT_TS_CAP) {
        store.index[id] = list.slice(-CONTEXT_TS_CAP);
      }
    }
    window.localStorage.setItem(AURORA_CHATTREE_KEY, JSON.stringify(store));
  } catch {
    /* defensivo: cuota llena / storage bloqueado → no rompemos nada */
  }
}

// ── Operaciones sobre el árbol ───────────────────────────────────────────────
/** Crea un contexto (raíz si no se pasa parentId). Devuelve el id nuevo. */
export function createContext(title: string, parentId?: string | null): string {
  const store = readChatTreeStore();
  const now = Date.now();
  const id = newContextId();
  const clean = (title ?? "").trim();
  store.contexts[id] = {
    id,
    title: clean || defaultContextTitle(store, parentId ?? null),
    parentId: parentId && store.contexts[parentId] ? parentId : null,
    createdAt: now,
    updatedAt: now,
  };
  // Ramificar toca la actividad del padre.
  if (store.contexts[id].parentId) {
    const parent = store.contexts[store.contexts[id].parentId as string];
    if (parent) parent.updatedAt = now;
  }
  store.activeId = id;
  writeChatTreeStore(store);
  emitChange();
  return id;
}

/** Título por defecto contextual (numera raíces/ramas para orientarse). */
function defaultContextTitle(store: ChatTreeStore, parentId: string | null): string {
  if (parentId && store.contexts[parentId]) {
    const siblings = Object.values(store.contexts).filter(
      (c) => c.parentId === parentId,
    ).length;
    return `Rama ${siblings + 1}`;
  }
  const roots = Object.values(store.contexts).filter(
    (c) => !c.parentId,
  ).length;
  return `Contexto ${roots + 1}`;
}

/** Ramifica: crea un contexto hijo de `fromId` y lo activa. Devuelve su id. */
export function branchContext(fromId: string, title?: string): string {
  const store = readChatTreeStore();
  if (!store.contexts[fromId]) {
    // Si el padre no existe, degradamos a un contexto raíz.
    return createContext(title ?? "", null);
  }
  return createContext(title ?? "", fromId);
}

/** Renombra un contexto (no cambia su id). */
export function renameContext(id: string, title: string): void {
  const store = readChatTreeStore();
  const c = store.contexts[id];
  if (!c) return;
  const clean = (title ?? "").trim();
  if (!clean) return;
  c.title = clean;
  c.updatedAt = Date.now();
  writeChatTreeStore(store);
  emitChange();
}

/** Actualiza el resumen local de un contexto. */
export function setContextSummary(id: string, summary: string): void {
  const store = readChatTreeStore();
  const c = store.contexts[id];
  if (!c) return;
  c.summary = (summary ?? "").trim() || undefined;
  c.updatedAt = Date.now();
  writeChatTreeStore(store);
  emitChange();
}

/** Archiva o desarchiva un contexto (no lo borra). */
export function setContextArchived(id: string, archived: boolean): void {
  const store = readChatTreeStore();
  const c = store.contexts[id];
  if (!c) return;
  c.archived = archived || undefined;
  c.updatedAt = Date.now();
  // Si archivamos el activo, dejamos de tener contexto activo.
  if (archived && store.activeId === id) store.activeId = null;
  writeChatTreeStore(store);
  emitChange();
}

/** Fija (o limpia con null) el contexto activo. */
export function setActiveContext(id: string | null): void {
  const store = readChatTreeStore();
  if (id !== null && !store.contexts[id]) return;
  store.activeId = id;
  if (id) {
    const c = store.contexts[id];
    if (c) c.updatedAt = Date.now();
  }
  writeChatTreeStore(store);
  emitChange();
}

/**
 * Asocia un timestamp de mensaje al contexto activo (índice paralelo). Llamar
 * al enviar/recibir un mensaje mientras hay un contexto activo. No-op si no hay
 * contexto activo o en SSR. `contextId` explícito tiene prioridad sobre el activo.
 */
export function tagAuroraMessage(ts: number, contextId?: string | null): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(ts)) return;
  const store = readChatTreeStore();
  const id = contextId ?? store.activeId;
  if (!id || !store.contexts[id]) return;
  const list = store.index[id] || (store.index[id] = []);
  // Dedupe defensivo del último timestamp.
  if (list[list.length - 1] === ts) return;
  list.push(ts);
  const c = store.contexts[id];
  if (c) c.updatedAt = Date.now();
  writeChatTreeStore(store);
  emitChange();
}

/** Devuelve los timestamps asociados a un contexto (para cruzar con el log). */
export function timestampsOf(id: string): number[] {
  const store = readChatTreeStore();
  return store.index[id] ? [...store.index[id]] : [];
}

// ── Hook para la UI del árbol ────────────────────────────────────────────────
export interface UseChatTree {
  /** Todos los contextos NO archivados, ordenados por actividad reciente. */
  contexts: ChatContext[];
  /** Contextos raíz (sin padre), no archivados. */
  roots: ChatContext[];
  /** Contextos archivados (para una sección "archivo"). */
  archived: ChatContext[];
  /** Hijos directos (no archivados) de un contexto, por actividad reciente. */
  childrenOf: (parentId: string | null) => ChatContext[];
  /** Un contexto por id (o undefined). */
  contextById: (id: string) => ChatContext | undefined;
  /** Crea un contexto raíz (o hijo si se pasa parentId) y lo activa. */
  create: (title?: string, parentId?: string | null) => string;
  /** Ramifica desde un contexto (crea hijo) y lo activa. */
  branchFrom: (fromId: string, title?: string) => string;
  /** Renombra un contexto. */
  rename: (id: string, title: string) => void;
  /** Archiva/desarchiva un contexto. */
  archive: (id: string, archived?: boolean) => void;
  /** Actualiza el resumen local de un contexto. */
  setSummary: (id: string, summary: string) => void;
  /** Contexto activo actual (o null). */
  activeId: string | null;
  /** Fija el contexto activo (o null). */
  setActive: (id: string | null) => void;
  /** Asocia un timestamp de mensaje al contexto activo (índice paralelo). */
  tagMessage: (ts: number, contextId?: string | null) => void;
  /** Timestamps asociados a un contexto (para reconstruir su conversación). */
  timestampsOf: (id: string) => number[];
  /** Profundidad (nivel de sangría) de un contexto en el árbol. */
  depthOf: (id: string) => number;
}

export function useChatTree(): UseChatTree {
  const [store, setStore] = useState<ChatTreeStore>(() =>
    typeof window === "undefined" ? emptyStore() : readChatTreeStore(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStore(readChatTreeStore());
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === AURORA_CHATTREE_KEY) refresh();
    };
    window.addEventListener(AURORA_CHATTREE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AURORA_CHATTREE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const all = useMemo(() => Object.values(store.contexts), [store.contexts]);

  const byRecent = useCallback(
    (list: ChatContext[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt),
    [],
  );

  const contexts = useMemo(
    () => byRecent(all.filter((c) => !c.archived)),
    [all, byRecent],
  );
  const roots = useMemo(
    () => byRecent(all.filter((c) => !c.archived && !c.parentId)),
    [all, byRecent],
  );
  const archived = useMemo(
    () => byRecent(all.filter((c) => c.archived)),
    [all, byRecent],
  );

  const childrenOf = useCallback(
    (parentId: string | null) =>
      byRecent(
        all.filter(
          (c) => !c.archived && (c.parentId ?? null) === (parentId ?? null),
        ),
      ),
    [all, byRecent],
  );

  const contextById = useCallback(
    (id: string) => store.contexts[id],
    [store.contexts],
  );

  const depthOf = useCallback(
    (id: string) => {
      let depth = 0;
      let cur = store.contexts[id];
      const seen = new Set<string>();
      while (cur && cur.parentId && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = store.contexts[cur.parentId];
        depth += 1;
        if (depth > 64) break; // guardia anti-ciclo
      }
      return depth;
    },
    [store.contexts],
  );

  const create = useCallback(
    (title?: string, parentId?: string | null) => createContext(title ?? "", parentId ?? null),
    [],
  );
  const branchFrom = useCallback(
    (fromId: string, title?: string) => branchContext(fromId, title),
    [],
  );
  const rename = useCallback((id: string, title: string) => renameContext(id, title), []);
  const archive = useCallback(
    (id: string, archived = true) => setContextArchived(id, archived),
    [],
  );
  const setSummary = useCallback(
    (id: string, summary: string) => setContextSummary(id, summary),
    [],
  );
  const setActive = useCallback((id: string | null) => setActiveContext(id), []);
  const tagMessage = useCallback(
    (ts: number, contextId?: string | null) => tagAuroraMessage(ts, contextId),
    [],
  );
  const tsOf = useCallback((id: string) => timestampsOf(id), []);

  return {
    contexts,
    roots,
    archived,
    childrenOf,
    contextById,
    create,
    branchFrom,
    rename,
    archive,
    setSummary,
    activeId: store.activeId,
    setActive,
    tagMessage,
    timestampsOf: tsOf,
    depthOf,
  };
}

export default useChatTree;
