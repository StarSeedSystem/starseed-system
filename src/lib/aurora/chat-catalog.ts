"use client";

/**
 * StarSeed OS — Aurora · Catálogo de chats (log + árbol + categoría unificados)
 * ----------------------------------------------------------------------------
 * Capa que UNIFICA las tres fuentes de verdad existentes SIN duplicarlas:
 *   · `aurora-chat-log.ts`  → los MENSAJES (sesiones por día, contenido real).
 *   · `chat-tree.ts`        → la RAMIFICACIÓN (contextos/temas, índice ts→ctx).
 *   · `chat-auto-categorize.ts` → la CATEGORÍA temática + título (heurística).
 *
 * y añade, en su propio store persistido `starseed.aurora.chatcatalog.v1`, sólo
 * los METADATOS que ninguna de las tres guarda:
 *   · categoría cacheada por chat (día o contexto) + título derivado,
 *   · enlaces bidireccionales entre chats (`linkedIds`, "interconectar"),
 *   · marcas de "guardado en memorias" (referencia al MemoryDoc creado),
 *   · duplicados (un chat duplicado apunta a su `sourceId`).
 *
 * Un "chat" en el catálogo puede ser:
 *   · una SESIÓN por día        → id `day:<YYYY-MM-DD>`  (fuente: el registro).
 *   · un CONTEXTO del árbol      → id `ctx:<contextId>`   (fuente: el árbol).
 * Ambos se proyectan a un modelo común `CatalogChat` (mensajes + categoría), y
 * se organizan en DOS EJES para el explorador de folders:
 *   · por FECHA  → hoy / ayer / esta semana / por mes.
 *   · por TEMA   → un folder por categoría (chat-auto-categorize).
 *
 * "Guardar en memorias" reutiliza el sistema existente:
 *   · `createMemory()` de `memory-vault.ts` (baúl de memorias .md editables), y
 *   · `saveResource()` de `library-store.ts` (referencia navegable en Biblioteca).
 *
 * SSR-safe, defensivo y aditivo: no toca el motor, el provider, ni el formato de
 * las tres fuentes. Sólo lee de ellas y guarda metadatos propios.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { safeGet, safeSet } from "@/lib/safe-storage";
import {
  readAuroraChatEntries,
  readAuroraChatSessions,
  auroraChatDayOf,
  AURORA_CHATLOG_CHANGE_EVENT,
  AURORA_CHATLOG_KEY,
  type AuroraChatLogEntry,
} from "@/lib/aurora/aurora-chat-log";
import {
  readChatTreeStore,
  timestampsOf as treeTimestampsOf,
  createContext as createTreeContext,
  tagAuroraMessage as tagTreeMessage,
  AURORA_CHATTREE_CHANGE_EVENT,
  AURORA_CHATTREE_KEY,
  type ChatContext,
} from "@/lib/aurora/chat-tree";
import {
  categorizeEntries,
  categoryDef,
  fallbackTitle,
  type ChatCategoryId,
} from "@/lib/aurora/chat-auto-categorize";
import { createMemory } from "@/lib/memory-vault";
import { saveResource } from "@/lib/library-store";

// ── Constantes ───────────────────────────────────────────────────────────────
/** Clave de localStorage del catálogo (versionada). */
export const AURORA_CHATCATALOG_KEY = "starseed.aurora.chatcatalog.v1";
/** Evento interno (mismo tab) emitido tras cada cambio del catálogo. */
export const AURORA_CHATCATALOG_CHANGE_EVENT = "starseed:aurora-chatcatalog";
/** Tope defensivo de entradas de metadatos persistidas. */
const CATALOG_CAP = 800;

// ── Tipos ────────────────────────────────────────────────────────────────────
/** De dónde procede un chat del catálogo. */
export type CatalogSource = "day" | "context";

/** Metadatos que el catálogo persiste POR chat (lo que las 3 fuentes no guardan). */
export interface CatalogMeta {
  /** Id compuesto: `day:<YYYY-MM-DD>` o `ctx:<contextId>`. */
  id: string;
  /** Categoría temática cacheada (chat-auto-categorize). */
  category: ChatCategoryId;
  /** Título derivado del contenido (cacheado). */
  title: string;
  /** Última vez que se recategorizó (para invalidar de forma barata). */
  categorizedAt: number;
  /** Nº de mensajes que había al categorizar (invalidación por cambio de tamaño). */
  sizeAtCategorize: number;
  /** Enlaces bidireccionales a otros chats (ids del catálogo). "Interconectar". */
  linkedIds?: string[];
  /** Si se guardó como memoria: id del MemoryDoc creado en la bóveda. */
  savedMemoryId?: string;
  /** Epoch ms de guardado en memorias (si aplica). */
  savedAt?: number;
  /** Si es un duplicado: id del chat origen del catálogo. */
  duplicatedFromId?: string;
  /** Nota/etiqueta manual opcional del usuario. */
  note?: string;
}

/** Estructura persistida del catálogo. */
interface CatalogStore {
  v: 1;
  metas: Record<string, CatalogMeta>;
}

/** Un chat proyectado al modelo común (log + árbol + categoría). */
export interface CatalogChat {
  /** Id compuesto del catálogo. */
  id: string;
  source: CatalogSource;
  /** Día (YYYY-MM-DD) — para sesiones ES el día; para contextos, el del 1er msg. */
  day: string;
  /** Título mostrado (del catálogo si existe; si no, derivado o fallback). */
  title: string;
  /** Categoría temática. */
  category: ChatCategoryId;
  /** Mensajes en orden temporal (reconstruidos de la fuente). */
  entries: AuroraChatLogEntry[];
  /** Nº de mensajes. */
  count: number;
  /** Epoch ms del primer y último mensaje (0 si vacío). */
  startTs: number;
  endTs: number;
  /** Ids del catálogo con los que está interconectado. */
  linkedIds: string[];
  /** Id del MemoryDoc si se guardó en memorias. */
  savedMemoryId?: string;
  /** Id del contexto del árbol (sólo si source === "context"). */
  contextId?: string;
  /** Título original del contexto del árbol (sólo contextos). */
  contextTitle?: string;
}

// ── Utilidades de id ─────────────────────────────────────────────────────────
export function dayChatId(day: string): string {
  return `day:${day}`;
}
export function contextChatId(contextId: string): string {
  return `ctx:${contextId}`;
}

// ── Lectura / escritura del store (SSR-safe) ─────────────────────────────────
function emptyCatalog(): CatalogStore {
  return { v: 1, metas: {} };
}

function isMeta(v: unknown): v is CatalogMeta {
  if (!v || typeof v !== "object") return false;
  const m = v as Partial<CatalogMeta>;
  return typeof m.id === "string" && m.id.length > 0 && typeof m.category === "string";
}

export function readCatalogStore(): CatalogStore {
  if (typeof window === "undefined") return emptyCatalog();
  try {
    const raw = safeGet(AURORA_CHATCATALOG_KEY);
    if (!raw) return emptyCatalog();
    const parsed = JSON.parse(raw) as Partial<CatalogStore> | null;
    if (!parsed || typeof parsed !== "object") return emptyCatalog();
    const metas: Record<string, CatalogMeta> = {};
    if (parsed.metas && typeof parsed.metas === "object") {
      for (const [id, m] of Object.entries(parsed.metas)) {
        if (isMeta(m)) {
          // Saneamos linkedIds a strings únicos.
          const links = Array.isArray(m.linkedIds)
            ? Array.from(new Set(m.linkedIds.filter((x) => typeof x === "string" && x)))
            : undefined;
          metas[id] = { ...m, linkedIds: links && links.length ? links : undefined };
        }
      }
    }
    return { v: 1, metas };
  } catch {
    return emptyCatalog();
  }
}

function writeCatalogStore(store: CatalogStore): void {
  if (typeof window === "undefined") return;
  try {
    // Tope defensivo: descartamos primero las metas más "pobres" (sin enlaces,
    // sin memoria guardada, sin nota) y más antiguas por categorizedAt.
    const ids = Object.keys(store.metas);
    if (ids.length > CATALOG_CAP) {
      const sorted = ids
        .map((id) => store.metas[id])
        .sort((a, b) => {
          const aRich = (a.linkedIds?.length ? 1 : 0) + (a.savedMemoryId ? 1 : 0) + (a.note ? 1 : 0);
          const bRich = (b.linkedIds?.length ? 1 : 0) + (b.savedMemoryId ? 1 : 0) + (b.note ? 1 : 0);
          if (aRich !== bRich) return aRich - bRich; // más pobres primero a descartar
          return (a.categorizedAt || 0) - (b.categorizedAt || 0);
        });
      for (const m of sorted.slice(0, ids.length - CATALOG_CAP)) delete store.metas[m.id];
    }
    safeSet(AURORA_CHATCATALOG_KEY, JSON.stringify(store)); // nunca lanza (poda/degrada)
  } catch {
    /* defensivo: serialización rara → no rompemos nada */
  }
}

function emitCatalogChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_CHATCATALOG_CHANGE_EVENT));
  } catch {
    /* defensivo */
  }
}

// ── Proyección de las 3 fuentes a chats del catálogo ─────────────────────────
/**
 * Reconstruye la conversación de un CONTEXTO del árbol cruzando sus timestamps
 * asociados con las entradas del registro (dedup + orden). Barato y defensivo.
 */
function entriesForContext(contextId: string, allEntries: AuroraChatLogEntry[]): AuroraChatLogEntry[] {
  const tsSet = new Set(treeTimestampsOf(contextId));
  if (tsSet.size === 0) return [];
  return allEntries.filter((e) => tsSet.has(e.ts)).sort((a, b) => a.ts - b.ts);
}

/**
 * Aplica (con caché) la categoría a un chat: si el store ya tiene una meta
 * vigente (mismo tamaño), la reutiliza; si no, recategoriza con la heurística
 * local y persiste. NO llama a IA. Devuelve la meta efectiva (sin escribir aquí
 * si sólo lee: la escritura la hace `ensureCategorized` en lote).
 */
function computeMeta(
  id: string,
  entries: AuroraChatLogEntry[],
  store: CatalogStore,
  day: string,
): { meta: CatalogMeta; changed: boolean } {
  const existing = store.metas[id];
  const size = entries.length;
  // Vigente si existe y el tamaño no cambió (invalidación barata y determinista).
  if (existing && existing.sizeAtCategorize === size && existing.title) {
    return { meta: existing, changed: false };
  }
  const res = categorizeEntries(entries);
  const title = res.title || existing?.title || fallbackTitle(res.category, day);
  const meta: CatalogMeta = {
    id,
    category: res.category,
    title,
    categorizedAt: Date.now(),
    sizeAtCategorize: size,
    linkedIds: existing?.linkedIds,
    savedMemoryId: existing?.savedMemoryId,
    savedAt: existing?.savedAt,
    duplicatedFromId: existing?.duplicatedFromId,
    note: existing?.note,
  };
  return { meta, changed: true };
}

/**
 * Construye la LISTA COMPLETA de chats del catálogo desde las 3 fuentes,
 * categorizando en el acto (con caché) y persistiendo las metas nuevas EN LOTE.
 * SSR-safe: devuelve [] en servidor.
 */
export function buildCatalogChats(): CatalogChat[] {
  if (typeof window === "undefined") return [];

  const allEntries = readAuroraChatEntries();
  const sessions = readAuroraChatSessions(); // por día, recientes primero
  const treeStore = readChatTreeStore();
  const store = readCatalogStore();
  let storeChanged = false;

  const chats: CatalogChat[] = [];

  // 1) Sesiones por día → chats "day:*".
  for (const s of sessions) {
    const id = dayChatId(s.day);
    const { meta, changed } = computeMeta(id, s.entries, store, s.day);
    if (changed) {
      store.metas[id] = meta;
      storeChanged = true;
    }
    const first = s.entries[0];
    const last = s.entries[s.entries.length - 1];
    chats.push({
      id,
      source: "day",
      day: s.day,
      title: meta.title,
      category: meta.category,
      entries: s.entries,
      count: s.entries.length,
      startTs: first ? first.ts : 0,
      endTs: last ? last.ts : 0,
      linkedIds: meta.linkedIds ?? [],
      savedMemoryId: meta.savedMemoryId,
    });
  }

  // 2) Contextos del árbol (no archivados con al menos 1 mensaje asociado)
  //    → chats "ctx:*". Dan la dimensión de RAMIFICACIÓN al explorador.
  const contexts = Object.values(treeStore.contexts) as ChatContext[];
  for (const ctx of contexts) {
    if (ctx.archived) continue;
    const entries = entriesForContext(ctx.id, allEntries);
    if (entries.length === 0) continue; // sin mensajes → no lo listamos como chat
    const day = auroraChatDayOf(entries[0].ts);
    const id = contextChatId(ctx.id);
    const { meta, changed } = computeMeta(id, entries, store, day);
    if (changed) {
      store.metas[id] = meta;
      storeChanged = true;
    }
    const first = entries[0];
    const last = entries[entries.length - 1];
    // Preferimos el título del contexto si el usuario lo puso a mano (no "Rama N"
    // ni "Contexto N", que son autogenerados); si no, el título derivado.
    const auto = /^(Rama|Contexto)\s+\d+$/.test(ctx.title.trim());
    chats.push({
      id,
      source: "context",
      day,
      title: auto ? meta.title : ctx.title,
      category: meta.category,
      entries,
      count: entries.length,
      startTs: first ? first.ts : 0,
      endTs: last ? last.ts : 0,
      linkedIds: meta.linkedIds ?? [],
      savedMemoryId: meta.savedMemoryId,
      contextId: ctx.id,
      contextTitle: ctx.title,
    });
  }

  if (storeChanged) {
    writeCatalogStore(store);
    // No emitimos evento aquí para no realimentar el render que lo disparó; la UI
    // ya tiene los datos recién calculados en `chats`.
  }

  // Orden global por actividad reciente (último mensaje).
  chats.sort((a, b) => b.endTs - a.endTs);
  return chats;
}

// ── Ejes del explorador de folders ──────────────────────────────────────────
/** Cubo de fecha para el eje temporal. */
export type DateBucketId = "hoy" | "ayer" | "semana" | string; // string = "YYYY-MM"

export interface DateBucket {
  id: DateBucketId;
  label: string;
  chats: CatalogChat[];
}

export interface CategoryBucket {
  id: ChatCategoryId;
  label: string;
  icon: string;
  color: string;
  hint: string;
  chats: CatalogChat[];
}

/** Inicio del día local de un timestamp. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Etiqueta "YYYY-MM" → "julio 2026" (capitalizado). */
function monthLabel(ym: string): string {
  try {
    const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
    const d = new Date(y, (m || 1) - 1, 1);
    const l = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return l.charAt(0).toUpperCase() + l.slice(1);
  } catch {
    return ym;
  }
}

/**
 * Agrupa los chats por FECHA: Hoy, Ayer, Esta semana, y luego por mes.
 * Orden dentro de cada cubo: más reciente primero. Cubos vacíos se omiten.
 */
export function groupByDate(chats: CatalogChat[]): DateBucket[] {
  const now = Date.now();
  const today0 = startOfDay(now);
  const yesterday0 = today0 - 86_400_000;
  const week0 = today0 - 6 * 86_400_000; // últimos 7 días (incluye hoy)

  const hoy: CatalogChat[] = [];
  const ayer: CatalogChat[] = [];
  const semana: CatalogChat[] = [];
  const meses = new Map<string, CatalogChat[]>();

  for (const c of chats) {
    const ref = c.endTs || c.startTs || now;
    const ref0 = startOfDay(ref);
    if (ref0 === today0) hoy.push(c);
    else if (ref0 === yesterday0) ayer.push(c);
    else if (ref0 >= week0) semana.push(c);
    else {
      const ym = c.day && /^\d{4}-\d{2}/.test(c.day) ? c.day.slice(0, 7) : auroraChatDayOf(ref).slice(0, 7);
      const list = meses.get(ym) || (meses.set(ym, []).get(ym) as CatalogChat[]);
      list.push(c);
    }
  }

  const buckets: DateBucket[] = [];
  if (hoy.length) buckets.push({ id: "hoy", label: "Hoy", chats: hoy });
  if (ayer.length) buckets.push({ id: "ayer", label: "Ayer", chats: ayer });
  if (semana.length) buckets.push({ id: "semana", label: "Esta semana", chats: semana });
  // Meses en orden descendente (más reciente primero).
  for (const ym of Array.from(meses.keys()).sort((a, b) => b.localeCompare(a))) {
    buckets.push({ id: ym, label: monthLabel(ym), chats: meses.get(ym) as CatalogChat[] });
  }
  return buckets;
}

/**
 * Agrupa los chats por TEMA (categoría). Devuelve un folder por categoría con
 * al menos un chat, en el orden de la taxonomía. Cada folder lleva su meta
 * visual (icono/color/hint) para el explorador.
 */
export function groupByCategory(chats: CatalogChat[]): CategoryBucket[] {
  const byCat = new Map<ChatCategoryId, CatalogChat[]>();
  for (const c of chats) {
    const list = byCat.get(c.category) || (byCat.set(c.category, []).get(c.category) as CatalogChat[]);
    list.push(c);
  }
  const buckets: CategoryBucket[] = [];
  // Orden = taxonomía (chat-auto-categorize exporta CHAT_CATEGORIES en ese orden).
  for (const [id, list] of byCat.entries()) {
    const def = categoryDef(id);
    buckets.push({
      id,
      label: def.label,
      icon: def.icon,
      color: def.color,
      hint: def.hint,
      chats: list,
    });
  }
  // Ordenamos los folders por el índice de la taxonomía (estable) usando el
  // color/label; como categoryDef no expone índice, ordenamos por nº de chats
  // desc y luego alfabético para una presentación clara.
  buckets.sort((a, b) => (b.chats.length - a.chats.length) || a.label.localeCompare(b.label));
  return buckets;
}

// ── Acciones sobre metadatos (persistencia propia) ───────────────────────────
function mutateMeta(id: string, fn: (m: CatalogMeta) => CatalogMeta): CatalogMeta {
  const store = readCatalogStore();
  const base: CatalogMeta =
    store.metas[id] ||
    {
      id,
      category: "general",
      title: "",
      categorizedAt: 0,
      sizeAtCategorize: 0,
    };
  const next = fn({ ...base });
  store.metas[id] = next;
  writeCatalogStore(store);
  emitCatalogChange();
  return next;
}

/**
 * INTERCONECTAR: crea un enlace bidireccional entre dos chats del catálogo. Si ya
 * existe, no-op. Ambos extremos guardan al otro en `linkedIds`.
 */
export function linkChats(aId: string, bId: string): void {
  if (!aId || !bId || aId === bId) return;
  mutateMeta(aId, (m) => {
    const set = new Set(m.linkedIds ?? []);
    set.add(bId);
    return { ...m, linkedIds: Array.from(set) };
  });
  mutateMeta(bId, (m) => {
    const set = new Set(m.linkedIds ?? []);
    set.add(aId);
    return { ...m, linkedIds: Array.from(set) };
  });
}

/** Deshace un enlace bidireccional entre dos chats. */
export function unlinkChats(aId: string, bId: string): void {
  if (!aId || !bId) return;
  mutateMeta(aId, (m) => ({
    ...m,
    linkedIds: (m.linkedIds ?? []).filter((x) => x !== bId),
  }));
  mutateMeta(bId, (m) => ({
    ...m,
    linkedIds: (m.linkedIds ?? []).filter((x) => x !== aId),
  }));
}

/** Etiqueta/nota manual de un chat (metadato propio). */
export function setChatNote(id: string, note: string): void {
  mutateMeta(id, (m) => ({ ...m, note: (note ?? "").trim() || undefined }));
}

/** Reasigna manualmente la categoría de un chat (override de la heurística). */
export function setChatCategory(id: string, category: ChatCategoryId): void {
  mutateMeta(id, (m) => ({ ...m, category, categorizedAt: Date.now() }));
}

// ── Serialización de un chat a Markdown (para memorias / duplicado) ──────────
function chatToMarkdown(chat: CatalogChat, auroraName = "Aurora"): string {
  const def = categoryDef(chat.category);
  const lines: string[] = [
    `# ${chat.title || def.label}`,
    "",
    `Categoría: ${def.label} · ${chat.count} mensajes · ${chat.day}`,
    "",
    "## Conversación",
    "",
  ];
  for (const e of chat.entries) {
    let hhmm = "";
    try {
      hhmm = new Date(e.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch {
      /* defensivo */
    }
    lines.push(`- **${hhmm} · ${e.role === "user" ? "Tú" : auroraName}:** ${e.text}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * GUARDAR EN MEMORIAS: crea un MemoryDoc (baúl de memorias .md) con toda la
 * conversación del chat + una referencia navegable en la Biblioteca. Marca el
 * chat como guardado (`savedMemoryId`). Idempotente-suave: si ya estaba guardado,
 * devuelve el id existente sin duplicar. Devuelve el id del MemoryDoc o null.
 */
export function saveChatAsMemory(chat: CatalogChat, auroraName = "Aurora"): string | null {
  if (typeof window === "undefined") return null;
  // Ya guardado antes → no duplicamos (Singularidad del Contenido).
  const store = readCatalogStore();
  const prev = store.metas[chat.id]?.savedMemoryId;
  if (prev) return prev;

  const def = categoryDef(chat.category);
  try {
    const doc = createMemory({
      name: chat.title || `Chat ${def.label}`,
      category: def.label,
      tags: ["aurora", "chat", def.id],
      color: def.color,
      markdown: chatToMarkdown(chat, auroraName),
    });
    // Referencia ligera y navegable en la Biblioteca (dedup por url+título).
    try {
      saveResource({
        kind: "chat-aurora",
        title: chat.title || `Chat ${def.label}`,
        url: `/memorias#${doc.id}`,
        origin: "Aurora · Exocórtex",
      });
    } catch {
      /* defensivo: la referencia es secundaria */
    }
    mutateMeta(chat.id, (m) => ({
      ...m,
      savedMemoryId: doc.id,
      savedAt: Date.now(),
    }));
    return doc.id;
  } catch {
    return null;
  }
}

/**
 * DUPLICAR: crea un CONTEXTO nuevo en el árbol (id nuevo), copia allí los
 * timestamps del chat origen (para que su conversación se reconstruya igual) y
 * registra en el catálogo que es un duplicado. Reutiliza el árbol como soporte
 * de identidad (no inventamos otro almacén de chats). Devuelve el id del catálogo
 * del duplicado (`ctx:<nuevoId>`) o null.
 *
 * Se apoya en el árbol (chat-tree) como soporte de identidad del duplicado: crea
 * un contexto nuevo y le asocia los timestamps del origen. No hay ciclo de import
 * (chat-tree no importa este módulo).
 */
export function duplicateChat(chat: CatalogChat): string | null {
  if (typeof window === "undefined") return null;
  try {
    const def = categoryDef(chat.category);
    const baseTitle = chat.title || def.label;
    const newCtxId = createTreeContext(`${baseTitle} (copia)`, null);
    // Copiamos los timestamps del origen al nuevo contexto (misma conversación).
    for (const e of chat.entries) {
      tagTreeMessage(e.ts, newCtxId);
    }
    const dupCatalogId = contextChatId(newCtxId);
    mutateMeta(dupCatalogId, (m) => ({
      ...m,
      category: chat.category,
      title: `${baseTitle} (copia)`,
      duplicatedFromId: chat.id,
      categorizedAt: Date.now(),
      sizeAtCategorize: chat.entries.length,
    }));
    return dupCatalogId;
  } catch {
    return null;
  }
}

// ── Búsqueda dentro de los chats ─────────────────────────────────────────────
/**
 * Filtra chats cuyo título, categoría o CUALQUIER mensaje contenga el término
 * (normalizado, sin tildes). Barato y determinista. Vacío/corto → todos.
 */
export function searchChats(chats: CatalogChat[], query: string): CatalogChat[] {
  const q = (query ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (q.length < 2) return chats;
  const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return chats.filter((c) => {
    if (norm(c.title).includes(q)) return true;
    if (norm(categoryDef(c.category).label).includes(q)) return true;
    return c.entries.some((e) => norm(e.text).includes(q));
  });
}

// ── Hook para la UI del explorador ───────────────────────────────────────────
export interface UseChatCatalog {
  /** Todos los chats proyectados (log + contextos), recientes primero. */
  chats: CatalogChat[];
  /** Agrupados por fecha (hoy/ayer/semana/meses). */
  byDate: DateBucket[];
  /** Agrupados por categoría/tema. */
  byCategory: CategoryBucket[];
  /** Un chat del catálogo por id. */
  chatById: (id: string) => CatalogChat | undefined;
  /** Chats interconectados con uno dado (resuelve linkedIds → chats). */
  linkedChatsOf: (id: string) => CatalogChat[];
  /** Filtra por término (título/categoría/mensajes). */
  search: (query: string) => CatalogChat[];
  /** Guardar un chat en memorias (bóveda + biblioteca). Devuelve MemoryDoc id. */
  saveAsMemory: (chat: CatalogChat, auroraName?: string) => string | null;
  /** Duplicar un chat (nuevo contexto). Devuelve id del catálogo del duplicado. */
  duplicate: (chat: CatalogChat) => string | null;
  /** Interconectar dos chats (enlace bidireccional). */
  link: (aId: string, bId: string) => void;
  /** Deshacer interconexión. */
  unlink: (aId: string, bId: string) => void;
  /** Nota/etiqueta manual de un chat. */
  setNote: (id: string, note: string) => void;
  /** Override manual de la categoría. */
  setCategory: (id: string, category: ChatCategoryId) => void;
  /** Total de chats. */
  total: number;
}

export function useChatCatalog(): UseChatCatalog {
  const [chats, setChats] = useState<CatalogChat[]>(() =>
    typeof window === "undefined" ? [] : buildCatalogChats(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      try {
        setChats(buildCatalogChats());
      } catch {
        /* defensivo */
      }
    };
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === AURORA_CHATLOG_KEY ||
        e.key === AURORA_CHATTREE_KEY ||
        e.key === AURORA_CHATCATALOG_KEY ||
        e.key === null
      ) {
        refresh();
      }
    };
    // Nos refrescamos cuando cambian el log, el árbol o el propio catálogo.
    window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, refresh);
    window.addEventListener(AURORA_CHATTREE_CHANGE_EVENT, refresh);
    window.addEventListener(AURORA_CHATCATALOG_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, refresh);
      window.removeEventListener(AURORA_CHATTREE_CHANGE_EVENT, refresh);
      window.removeEventListener(AURORA_CHATCATALOG_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const byDate = useMemo(() => groupByDate(chats), [chats]);
  const byCategory = useMemo(() => groupByCategory(chats), [chats]);

  const chatById = useCallback(
    (id: string) => chats.find((c) => c.id === id),
    [chats],
  );

  const linkedChatsOf = useCallback(
    (id: string) => {
      const self = chats.find((c) => c.id === id);
      if (!self || self.linkedIds.length === 0) return [];
      const set = new Set(self.linkedIds);
      return chats.filter((c) => set.has(c.id));
    },
    [chats],
  );

  const search = useCallback((query: string) => searchChats(chats, query), [chats]);

  const saveAsMemory = useCallback(
    (chat: CatalogChat, auroraName?: string) => saveChatAsMemory(chat, auroraName),
    [],
  );
  const duplicate = useCallback((chat: CatalogChat) => duplicateChat(chat), []);
  const link = useCallback((aId: string, bId: string) => linkChats(aId, bId), []);
  const unlink = useCallback((aId: string, bId: string) => unlinkChats(aId, bId), []);
  const setNote = useCallback((id: string, note: string) => setChatNote(id, note), []);
  const setCategory = useCallback(
    (id: string, category: ChatCategoryId) => setChatCategory(id, category),
    [],
  );

  return {
    chats,
    byDate,
    byCategory,
    chatById,
    linkedChatsOf,
    search,
    saveAsMemory,
    duplicate,
    link,
    unlink,
    setNote,
    setCategory,
    total: chats.length,
  };
}

export default useChatCatalog;
