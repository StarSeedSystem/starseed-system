"use client";

/**
 * StarSeed OS — Registro local del chat de Aurora (Exocórtex)
 * ----------------------------------------------------------------------------
 * Escucha el CustomEvent `aurora:conversation` (un evento por CADA mensaje de
 * la conversación con Aurora — voz o texto, del usuario o de Aurora; lo emite
 * el AuroraProvider) y lo persiste TODO en localStorage bajo
 * `starseed.aurora.chatlog.v1` (tope ~500 mensajes), agrupado en sesiones por
 * día local.
 *
 *  · SSR-safe: todo acceso a window/localStorage está guardado.
 *  · Registrador SINGLETON e idempotente (flag en window): puede invocarse
 *    desde varias superficies (ZenithCurtain, sección Aurora) sin duplicar
 *    escuchas ni entradas. La ZenithCurtain vive montada en el layout raíz,
 *    así que el registro captura la conversación aunque la cortina esté
 *    cerrada y la sección Aurora no se haya abierto nunca.
 *  · Hook `useAuroraChatLog()` → { sessions, clear, exportJson, exportMarkdown,
 *    summaryOf } para el bloque "Registro" del Exocórtex.
 *
 * Aditivo y defensivo: no toca el motor ni el provider; solo escucha el bus.
 */

import { useCallback, useEffect, useState } from "react";
import { AURORA_CONVERSATION_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { isActiveChatLogEnabled } from "@/lib/aurora/conversations";
// Tipo SOLO (import type: se borra en compilación, sin ciclo real en runtime).
// Metadatos de proceso por mensaje (Adenda "Aurora siempre responde", jul-2026).
import type { AuroraMessageMeta } from "@/lib/aurora/engine";

// ── Constantes ───────────────────────────────────────────────────────────────
/** Clave de localStorage del registro (versionada). */
export const AURORA_CHATLOG_KEY = "starseed.aurora.chatlog.v1";
/** Evento interno (mismo tab) emitido tras cada cambio del registro. */
export const AURORA_CHATLOG_CHANGE_EVENT = "starseed:aurora-chatlog";
/** Tope de mensajes persistidos (se descartan los más antiguos). */
export const AURORA_CHATLOG_CAP = 500;
/** Flag-singleton en window para no registrar la escucha dos veces (HMR-safe). */
const RECORDER_FLAG = "__STARSEED_AURORA_CHATLOG_RECORDER__";

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface AuroraChatLogEntry {
  role: "user" | "aurora";
  text: string;
  /** Epoch ms del mensaje. */
  ts: number;
  /**
   * (Aditivo, jul-2026) Metadatos de proceso de la respuesta — proveedor,
   * modelo, intentos, duración, dificultad, herramientas invocadas. Ausente en
   * mensajes de usuario y en entradas persistidas ANTES de esta ola (se leen
   * con normalidad, sin `meta`). Ver architecture/astraura-inteligencia.md §17.3.
   */
  meta?: AuroraMessageMeta;
}

/** Sesión = todos los mensajes de un mismo día local (YYYY-MM-DD). */
export interface AuroraChatLogSession {
  day: string;
  entries: AuroraChatLogEntry[];
}

/** Resumen local de un día: nº de mensajes + primeras/últimas frases. */
export interface AuroraChatDaySummary {
  day: string;
  total: number;
  user: number;
  aurora: number;
  firstText: string;
  lastText: string;
  startTs: number;
  endTs: number;
}

// ── Utilidades internas ──────────────────────────────────────────────────────
function isEntry(v: unknown): v is AuroraChatLogEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<AuroraChatLogEntry>;
  return (
    (e.role === "user" || e.role === "aurora") &&
    typeof e.text === "string" &&
    typeof e.ts === "number" &&
    Number.isFinite(e.ts)
  );
}

/** Día local (YYYY-MM-DD) de un timestamp — agrupa las sesiones por fecha. */
export function auroraChatDayOf(ts: number): string {
  const d = new Date(Number.isFinite(ts) ? ts : Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Recorte suave para los resúmenes (primeras/últimas frases). */
function snip(text: string, max = 96): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AURORA_CHATLOG_CHANGE_EVENT));
  } catch {
    /* defensivo */
  }
}

// ── Lectura / escritura (SSR-safe) ───────────────────────────────────────────
/** Lee TODOS los mensajes persistidos (ya limitados al tope), en orden de llegada. */
export function readAuroraChatEntries(): AuroraChatLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AURORA_CHATLOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(list)) return [];
    return list.filter(isEntry).slice(-AURORA_CHATLOG_CAP);
  } catch {
    return [];
  }
}

function writeEntries(entries: AuroraChatLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AURORA_CHATLOG_KEY,
      JSON.stringify({ v: 1, entries: entries.slice(-AURORA_CHATLOG_CAP) }),
    );
  } catch {
    /* defensivo: cuota llena / storage bloqueado → no rompemos nada */
  }
}

/**
 * Añade un mensaje al registro (con dedupe defensivo) y notifica el cambio.
 *
 * (Adenda 69 · I-1) Además de la caché local, el mensaje se replica a la
 * CONVERSACIÓN UNIFICADA en la nube (`aurora_conversations` +
 * `astraura_messages`) — la MISMA que lee y escribe la sección de chats de
 * Astraura AI (`/agent`). Es el punto único por el que pasan TODOS los mensajes
 * de Aurora (orbe, mini-reproductor y Exocórtex emiten `aurora:conversation`),
 * así que basta con engancharse aquí para que las dos superficies compartan un
 * solo historial. Import DIFERIDO: `conversations.ts` importa este módulo para
 * migrar el registro legado (evita el ciclo). Best-effort: si falla la nube, el
 * registro local queda intacto y no se pierde nada.
 */
export function appendAuroraChatEntry(entry: AuroraChatLogEntry): void {
  if (typeof window === "undefined") return;
  if (!isEntry(entry) || !entry.text.trim()) return;
  const entries = readAuroraChatEntries();
  const last = entries[entries.length - 1];
  // Dedupe: el provider emite una vez por mensaje, pero ante re-montajes/HMR
  // podríamos recibir el mismo evento duplicado casi simultáneo.
  if (
    last &&
    last.role === entry.role &&
    last.text === entry.text &&
    Math.abs(entry.ts - last.ts) < 1200
  ) {
    return;
  }
  entries.push({ role: entry.role, text: entry.text, ts: entry.ts, ...(entry.meta ? { meta: entry.meta } : {}) });
  writeEntries(entries);
  emitChange();
  mirrorToCloud(entry);
}

/** Réplica del mensaje en la conversación unificada (nube). Nunca lanza.
 * (Adenda 71-bis · 2026-07-17) Unificación: el orbe espeja a la MISMA nube que
 * Astraura AI y el Exocórtex, usando la conversación ACTIVA del orbe (o la
 * crea). Antes era best-effort que tragaba errores en silencio y no fijaba
 * convId, así que los mensajes del orbe no aparecían en las otras superficies.
 * Ahora usamos ensureActiveConversation para fijar el hilo y appendMessage
 * persiste en astraura_messages/aurora_conversations. */
async function mirrorToCloud(entry: AuroraChatLogEntry): Promise<void> {
  try {
    const mod = await import("@/lib/aurora/conversations");
    const conv = await mod.ensureActiveConversation({ kind: "aurora", surface: "orb" });
    await mod.appendMessage({
      role: entry.role, // "aurora" → "assistant" (normalizeRole)
      text: entry.text,
      ts: entry.ts,
      meta: entry.meta ?? null,
      kind: "aurora",
      surface: "orb",
      convId: conv.id,
    });
  } catch {
    /* offline / sin sesión: la caché local ya lo tiene */
  }
}

/** Borra todo el registro local y notifica el cambio. */
export function clearAuroraChatLog(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AURORA_CHATLOG_KEY);
  } catch {
    /* defensivo */
  }
  emitChange();
}

// ── Sesiones y resúmenes ─────────────────────────────────────────────────────
/** Agrupa el registro en sesiones por día. Más reciente primero; mensajes en orden. */
export function readAuroraChatSessions(): AuroraChatLogSession[] {
  const entries = readAuroraChatEntries();
  const byDay = new Map<string, AuroraChatLogEntry[]>();
  for (const e of entries) {
    const day = auroraChatDayOf(e.ts);
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  }
  return Array.from(byDay.entries())
    .map(([day, list]) => ({
      day,
      entries: [...list].sort((a, b) => a.ts - b.ts),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Resumen local de un día: nº de mensajes, primeras/últimas frases y rango horario. */
export function summarizeAuroraChatDay(day: string): AuroraChatDaySummary | null {
  const session = readAuroraChatSessions().find((s) => s.day === day);
  if (!session || session.entries.length === 0) return null;
  const list = session.entries;
  const first = list[0];
  const last = list[list.length - 1];
  return {
    day,
    total: list.length,
    user: list.filter((e) => e.role === "user").length,
    aurora: list.filter((e) => e.role === "aurora").length,
    firstText: snip(first.text),
    lastText: snip(last.text),
    startTs: first.ts,
    endTs: last.ts,
  };
}

// ── Exportación (descarga local) ─────────────────────────────────────────────
function triggerDownload(filename: string, mime: string, content: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* defensivo */
      }
    }, 1000);
  } catch {
    /* defensivo: si el navegador bloquea la descarga, no rompemos la UI */
  }
}

/** Serializa el registro a JSON (y dispara la descarga). Devuelve el texto. */
export function exportAuroraChatLogJson(): string {
  const payload = JSON.stringify(
    { v: 1, exportedAt: new Date().toISOString(), entries: readAuroraChatEntries() },
    null,
    2,
  );
  triggerDownload(
    `aurora-registro-${auroraChatDayOf(Date.now())}.json`,
    "application/json",
    payload,
  );
  return payload;
}

/** Serializa el registro a Markdown (y dispara la descarga). Devuelve el texto. */
export function exportAuroraChatLogMarkdown(): string {
  const sessions = [...readAuroraChatSessions()].sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  const lines: string[] = [
    "# Registro del chat de Aurora — StarSeed OS",
    "",
    `Exportado: ${new Date().toISOString()} · ${sessions.reduce((n, s) => n + s.entries.length, 0)} mensajes`,
    "",
  ];
  for (const s of sessions) {
    const sum = summarizeAuroraChatDay(s.day);
    lines.push(
      `## ${s.day} — ${s.entries.length} mensajes` +
        (sum ? ` (${sum.user} tú · ${sum.aurora} Aurora)` : ""),
    );
    lines.push("");
    for (const e of s.entries) {
      let hhmm = "";
      try {
        hhmm = new Date(e.ts).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        /* defensivo */
      }
      lines.push(`- **${hhmm}** · ${e.role === "user" ? "Tú" : "Aurora"}: ${e.text}`);
    }
    lines.push("");
  }
  const payload = lines.join("\n");
  triggerDownload(
    `aurora-registro-${auroraChatDayOf(Date.now())}.md`,
    "text/markdown",
    payload,
  );
  return payload;
}

// ── Registrador singleton ────────────────────────────────────────────────────
/**
 * Arranca (una sola vez por pestaña) la escucha de `aurora:conversation` que
 * persiste cada mensaje. Idempotente y seguro de llamar desde cualquier
 * componente cliente; en SSR es un no-op.
 */
export function ensureAuroraChatLogRecorder(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[RECORDER_FLAG]) return;
  w[RECORDER_FLAG] = true;
  // (Adenda 69 · I-1) Arranca el motor de la conversación unificada: pull de la
  // nube, migración del registro legado y suscripción en tiempo real. Idempotente.
  try {
    void import("@/lib/aurora/conversations")
      .then(({ startAiChatSync }) => startAiChatSync())
      .catch(() => {
        /* defensivo */
      });
  } catch {
    /* defensivo */
  }
  try {
    window.addEventListener(AURORA_CONVERSATION_EVENT, (e: Event) => {
      try {
        const d = (e as CustomEvent<{ role?: string; text?: string; ts?: number; meta?: unknown }>).detail;
        if (!d || typeof d.text !== "string") return;
        const role = d.role === "user" ? "user" : d.role === "aurora" ? "aurora" : null;
        if (!role) return;
        // Respeta el flag 'Registro' por chat del menú unificado (Adenda 71-bis).
        if (!isActiveChatLogEnabled()) return;
        // `meta` viaja como `unknown` por el bus (genérico, sin acoplarse al
        // motor): lo aceptamos solo si es un objeto plano, y solo en mensajes
        // de Aurora (los de usuario nunca llevan metadatos de proceso).
        const meta = role === "aurora" && d.meta && typeof d.meta === "object" ? (d.meta as AuroraMessageMeta) : undefined;
        appendAuroraChatEntry({
          role,
          text: d.text,
          ts: typeof d.ts === "number" && Number.isFinite(d.ts) ? d.ts : Date.now(),
          ...(meta ? { meta } : {}),
        });
      } catch {
        /* defensivo: un mensaje malformado jamás rompe la escucha */
      }
    });
  } catch {
    /* defensivo */
  }
}

// ── Hook para el bloque "Registro" del Exocórtex ─────────────────────────────
export interface UseAuroraChatLog {
  /** Sesiones por día (más reciente primero), con sus mensajes en orden. */
  sessions: AuroraChatLogSession[];
  /** Nº total de mensajes registrados. */
  total: number;
  /** Borra todo el registro local. */
  clear: () => void;
  /** Descarga el registro en JSON y devuelve el texto. */
  exportJson: () => string;
  /** Descarga el registro en Markdown y devuelve el texto. */
  exportMarkdown: () => string;
  /** Resumen local de un día (nº mensajes, primeras/últimas frases), o null. */
  summaryOf: (day: string) => AuroraChatDaySummary | null;
}

export function useAuroraChatLog(): UseAuroraChatLog {
  const [sessions, setSessions] = useState<AuroraChatLogSession[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    ensureAuroraChatLogRecorder();
    const refresh = () => setSessions(readAuroraChatSessions());
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === AURORA_CHATLOG_KEY) refresh();
    };
    window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const clear = useCallback(() => clearAuroraChatLog(), []);
  const exportJson = useCallback(() => exportAuroraChatLogJson(), []);
  const exportMarkdown = useCallback(() => exportAuroraChatLogMarkdown(), []);
  const summaryOf = useCallback(
    (day: string) => summarizeAuroraChatDay(day),
    // Recalcula cuando cambian las sesiones (el propio estado invalida el memo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions],
  );

  return {
    sessions,
    total: sessions.reduce((n, s) => n + s.entries.length, 0),
    clear,
    exportJson,
    exportMarkdown,
    summaryOf,
  };
}

export default useAuroraChatLog;
