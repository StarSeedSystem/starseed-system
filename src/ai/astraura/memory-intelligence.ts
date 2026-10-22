"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · MEMORY INTELLIGENCE — qué memoria usar/crear, y cuándo
 * ---------------------------------------------------------------------------
 * Ver architecture/cerebros-memorias-graphify.md §6. Dos responsabilidades:
 *
 *   1) `suggestMemoryTypeForContext(context)` — mapa contexto → tipo(s) de
 *      memoria (src/lib/brains/memory-types.ts), para que cualquier módulo
 *      pregunte "¿qué tipo uso para esto?" sin heurísticas propias.
 *   2) `autoUpdate(event)` — Aurora ESCUCHA eventos existentes del OS
 *      (chat, Biblioteca; la sincronización NO escribe memoria), los acumula con DEBOUNCE, y genera/actualiza
 *      memorias sola llamando a `astrauraChat` (router gratis-primero +
 *      enrutado por dificultad YA existente — no se reimplementa aquí).
 *
 * Modo por cerebro: `Brain.config.memoryMode` ('write' por defecto | 'read').
 * En 'read' Astraura NUNCA escribe en ese cerebro, solo podría leerlo como
 * contexto (la lectura de contexto la resuelve library-brains.ts/otros).
 *
 * Defensivo/SSR-safe: todo el pipeline es fire-and-forget; ningún fallo aquí
 * puede bloquear a Aurora ni al usuario. Singleton idempotente (flag en
 * window), igual patrón que src/lib/aurora/aurora-chat-log.ts y
 * src/lib/sync/realtime-sync.ts.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { listBrains, saveBrain, type Brain } from "@/lib/brains/brains";
import { escribirAgrupado, listMemoryFiles, saveMemoryFile, type MemoryFile } from "@/lib/cerebro/memory-files";
import { memoryTypeById, seedContentFor } from "@/lib/brains/memory-types";
import { writeMemoryContentResilient } from "@/lib/brains/memory-offline";
import { astrauraChat } from "@/ai/astraura/router";
import { AURORA_CONVERSATION_EVENT } from "@/lib/aurora/aurora-orb-bus";

/* ───────────────────── Mapa contexto → tipo(s) de memoria ───────────────────── */

/**
 * Heurística contexto → tipos candidatos (orden de preferencia). Claves en
 * ASCII sin acentos (normalizadas vía `normalizeKey`) para que "diseño" y
 * "diseno" resuelvan a la misma entrada.
 */
export const CONTEXT_TYPE_MAP: Record<string, string[]> = {
  chat: ["memory", "contexts"],
  conversacion: ["memory", "contexts"],
  diseno: ["style", "designs"],
  estilo: ["style", "designs"],
  navegacion: ["web", "browser"],
  escritorios: ["desktops"],
  escritorio: ["desktops"],
  biblioteca: ["knowledge"],
  pizarra: ["whiteboard"],
  recordatorio: ["reminders"],
  dashboard: ["dashboards"],
  perfil: ["profiles"],
  agente: ["agents"],
  configuracion: ["configs", "preferences"],
  plugin: ["plugins", "mcps"],
  api: ["apis"],
  handoff: ["handoff"],
  traspaso: ["handoff"],
};

/** Rango Unicode (por código de punto, no por carácter literal en la fuente)
 *  de las marcas diacríticas combinantes que deja la normalización NFD. */
const COMBINING_MARK_MIN = 0x0300;
const COMBINING_MARK_MAX = 0x036f;

/**
 * Quita diacríticos: NFD descompone "ñ" en "n" + marca combinante, y aquí se
 * descarta esa marca comparando códigos de punto numéricos (nunca un
 * carácter combinante literal en el código fuente, para que el archivo sea
 * estable ante cualquier editor/codificación). "diseño" → "diseno".
 */
function normalizeKey(s: string): string {
  try {
    const decomposed = (s || "").toLowerCase().normalize("NFD");
    let out = "";
    for (const ch of decomposed) {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= COMBINING_MARK_MIN && code <= COMBINING_MARK_MAX) continue;
      out += ch;
    }
    return out.trim();
  } catch {
    return (s || "").toLowerCase().trim();
  }
}

/** Tipos de memoria sugeridos para un contexto dado (fallback: "memory"). */
export function suggestMemoryTypeForContext(context: string): string[] {
  return CONTEXT_TYPE_MAP[normalizeKey(context)] ?? ["memory"];
}

const TEXT_TYPE_HINTS: Array<{ rx: RegExp; types: string[] }> = [
  { rx: /\b(diseñ|diseno|estilo|color|tema visual|paleta)/i, types: ["style", "designs"] },
  { rx: /\b(escritorio|dashboard)/i, types: ["desktops"] },
  { rx: /\b(pizarra|whiteboard|blackboard)/i, types: ["whiteboard"] },
  { rx: /\b(recuerda|recordatorio|no olvides)/i, types: ["reminders"] },
  { rx: /\b(biblioteca|guardad|librer[ií]a)/i, types: ["knowledge"] },
  { rx: /\b(navegando|https?:\/\/)/i, types: ["web", "browser"] },
  { rx: /\bperfil/i, types: ["profiles"] },
  { rx: /\bagente/i, types: ["agents"] },
  { rx: /\b(plugin|mcp)/i, types: ["plugins", "mcps"] },
  { rx: /\b(api|conexi[oó]n)/i, types: ["apis"] },
];

/** Clasifica un texto de evento libre a tipo(s) candidatos (fallback: memory/contexts). */
function classifyEventText(text: string): string[] {
  for (const { rx, types } of TEXT_TYPE_HINTS) {
    if (rx.test(text)) return types;
  }
  return ["memory", "contexts"];
}

/* ───────────────────── Modo por cerebro: write | read ───────────────────── */

export type BrainMemoryMode = "write" | "read";

/** Modo de memoria de un cerebro. Por defecto 'write' (Astraura puede escribir). */
export function getBrainMemoryMode(brain: Brain | null | undefined): BrainMemoryMode {
  try {
    const v = (brain?.config as Record<string, unknown> | undefined)?.memoryMode;
    return v === "read" ? "read" : "write";
  } catch {
    return "write";
  }
}

/** Cambia el modo de memoria de un cerebro ('write' Astraura escribe · 'read' solo lee). */
export async function setBrainMemoryMode(brain: Brain, mode: BrainMemoryMode): Promise<Brain | null> {
  try {
    return await saveBrain({ ...brain, config: { ...(brain.config || {}), memoryMode: mode } });
  } catch {
    return null;
  }
}

/* ───────────────────── autoUpdate: buffer + debounce + Astraura ───────────────────── */

export type MemoryEventSource = "sync" | "library" | "aurora" | "manual";

export interface MemoryIntelligenceEvent {
  source: MemoryEventSource;
  text: string;
  /** Tipos candidatos si el llamador ya los conoce (salta la clasificación). */
  hintTypes?: string[];
}

/** Silencio de actividad antes de redactar (no procesa evento a evento). */
const DEBOUNCE_MS = 8000;
/** Tope del lote: si se llena antes del debounce, se procesa ya (evita prompts gigantes). */
const MAX_BUFFER = 40;
/** Tope de caracteres del digest enviado al modelo (barato y suficiente para un resumen). */
const DIGEST_CHAR_CAP = 6000;

let buffer: MemoryIntelligenceEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBuffer();
  }, DEBOUNCE_MS);
}

/**
 * Registra un evento para que Astraura decida (con debounce) si genera/
 * actualiza una memoria. Fire-and-forget: nunca lanza, nunca bloquea al
 * llamador.
 */
export function autoUpdate(event: MemoryIntelligenceEvent): void {
  try {
    if (!event?.text?.trim()) return;
    buffer.push(event);
    if (buffer.length >= MAX_BUFFER) void flushBuffer();
    else scheduleFlush();
  } catch {
    /* nunca lanza */
  }
}

/**
 * Ficheros ya leídos (cerebro|tipo → fichero, con el contenido que esta pestaña
 * le ha ido añadiendo). `brain_memory_files` se lee la primera vez y cuando
 * llega un cambio de verdad de memoria/cerebros, no en cada actualización.
 */
const fileCache = new Map<string, MemoryFile>();

/** Olvida los ficheros leídos: la próxima actualización vuelve a leerlos. */
export function invalidateMemoryFileCache(): void {
  fileCache.clear();
}

/** ¿Es una clave sincronizada de memoria o de cerebros? (`starseed.brain.*`, `*memory*`). */
export function isMemorySyncKey(key: string): boolean {
  const k = (key || "").toLowerCase();
  return k.startsWith("starseed.brain.") || k.includes("memory") || k.includes("memoria");
}

async function findOrCreateTypeFile(brainId: string, typeId: string): Promise<MemoryFile | null> {
  const cacheKey = `${brainId}|${typeId}`;
  const cached = fileCache.get(cacheKey);
  if (cached) return cached;
  const file = await readOrCreateTypeFile(brainId, typeId);
  if (file) fileCache.set(cacheKey, file);
  return file;
}

async function readOrCreateTypeFile(brainId: string, typeId: string): Promise<MemoryFile | null> {
  try {
    const files = await listMemoryFiles(brainId);
    const t = memoryTypeById(typeId);
    const existing = files.find((f) => f.name.toLowerCase() === t.defaultFile.toLowerCase());
    if (existing) return existing;
    return await saveMemoryFile({
      brain_id: brainId,
      name: t.defaultFile,
      content: seedContentFor(typeId),
      source: "starseed",
      meta: { type: typeId, kind: "auto" },
    });
  } catch {
    return null;
  }
}

/** Pide al router (gratis-primero, por dificultad) un resumen breve del digest. */
async function draftSummary(digest: string, typeId: string): Promise<string | null> {
  try {
    const label = memoryTypeById(typeId).label;
    const res = await astrauraChat({
      taskHint: "summary",
      messages: [
        {
          role: "user",
          content:
            `Resume en 2 a 4 viñetas breves, en español y sin encabezados, lo relevante para una ` +
            `memoria de tipo "${label}" a partir de estos eventos recientes del usuario:\n\n${digest}`,
        },
      ],
    });
    return res?.text?.trim() || null;
  } catch {
    return null;
  }
}

async function flushBuffer(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    // Tipo más sugerido del lote (voto simple por frecuencia).
    const counts = new Map<string, number>();
    for (const ev of batch) {
      const types = ev.hintTypes?.length ? ev.hintTypes : classifyEventText(ev.text);
      for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const primaryType = ranked[0]?.[0] ?? "memory";
    const digest = batch.map((e) => `- (${e.source}) ${e.text}`).join("\n").slice(0, DIGEST_CHAR_CAP);

    const draft = await draftSummary(digest, primaryType);
    if (!draft) return;

    const brains = await listBrains();
    const dated = `\n\n## Actualización automática de Astraura · ${new Date().toLocaleString()}\n${draft}\n`;
    for (const brain of brains) {
      if (getBrainMemoryMode(brain) !== "write") continue;
      const file = await findOrCreateTypeFile(brain.id, primaryType);
      if (!file) continue;
      const next = `${file.content}${dated}`;
      // La siguiente actualización se apila sobre esta aunque aún no haya salido.
      fileCache.set(`${brain.id}|${primaryType}`, { ...file, content: next });
      // Como mucho una escritura cada 5 min por fichero (y lo pendiente al cerrar).
      escribirAgrupado(file.id, next, (content) => writeMemoryContentResilient(file, content));
    }
  } catch {
    /* nunca lanza: Astraura sigue funcionando aunque falle la memoria automática */
  }
}

/* ───────────────────── Arranque/parada (singleton, idempotente) ───────────────────── */

const START_FLAG = "__STARSEED_MEMORY_INTELLIGENCE__";
let started = false;
let auroraHandler: ((e: Event) => void) | null = null;
let libraryHandler: (() => void) | null = null;
let syncHandler: ((e: Event) => void) | null = null;

/**
 * Suscribe `autoUpdate` a los eventos existentes del OS: chat de Aurora
 * (`aurora:conversation`) y Biblioteca (`starseed:library`). La sincronización
 * genérica (`starseed:sync:apply`) solo invalida los ficheros leídos. Llamar UNA vez (p.ej. desde el efecto de
 * montaje de AuroraProvider); idempotente y SSR-safe.
 */
export function startMemoryIntelligenceAutoUpdate(): void {
  if (typeof window === "undefined" || started) return;
  try {
    if ((window as unknown as Record<string, boolean>)[START_FLAG]) return;
    (window as unknown as Record<string, boolean>)[START_FLAG] = true;
  } catch {
    return;
  }
  started = true;

  auroraHandler = (e: Event) => {
    try {
      const detail = (e as CustomEvent<{ role?: string; text?: string }>).detail;
      if (!detail?.text?.trim()) return;
      autoUpdate({
        source: "aurora",
        text: `${detail.role === "user" ? "Usuario" : "Aurora"}: ${detail.text}`,
      });
    } catch {
      /* */
    }
  };
  libraryHandler = () => {
    autoUpdate({ source: "library", text: "Cambio reciente en la Biblioteca del usuario.", hintTypes: ["knowledge"] });
  };
  // Una sincronización aplicada NO es un recuerdo (CON1011B): escribir memoria
  // aquí volvía a sincronizarse y disparaba otro `starseed:sync:apply`, un
  // bucle de ~1 GET + 1 PATCH por minuto con la pestaña quieta. Solo se olvidan
  // los ficheros leídos si cambió de verdad algo de memoria/cerebros.
  syncHandler = (e: Event) => {
    try {
      const keys = (e as CustomEvent<{ keys?: string[] }>).detail?.keys ?? [];
      if (keys.some(isMemorySyncKey)) invalidateMemoryFileCache();
    } catch {
      /* */
    }
  };

  try {
    window.addEventListener(AURORA_CONVERSATION_EVENT, auroraHandler);
  } catch {
    /* */
  }
  try {
    window.addEventListener("starseed:library", libraryHandler);
  } catch {
    /* */
  }
  try {
    window.addEventListener("starseed:sync:apply", syncHandler as EventListener);
  } catch {
    /* */
  }
  // Aditivo: el motor offline (§8 del SOP) comparte ciclo de vida con Astraura.
  try {
    void import("@/lib/brains/memory-offline").then((m) => m.startOfflineSync());
  } catch {
    /* */
  }
}

/** Detiene la escucha (tests/HMR). No borra memorias ya escritas. */
export function stopMemoryIntelligenceAutoUpdate(): void {
  if (typeof window === "undefined") return;
  try {
    if (auroraHandler) window.removeEventListener(AURORA_CONVERSATION_EVENT, auroraHandler);
    if (libraryHandler) window.removeEventListener("starseed:library", libraryHandler);
    if (syncHandler) window.removeEventListener("starseed:sync:apply", syncHandler as EventListener);
  } catch {
    /* */
  }
  auroraHandler = null;
  libraryHandler = null;
  syncHandler = null;
  started = false;
  fileCache.clear();
  buffer = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    delete (window as unknown as Record<string, boolean>)[START_FLAG];
  } catch {
    /* */
  }
}
