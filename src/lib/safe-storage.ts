"use client";

/**
 * StarSeed OS — CAPA DE ALMACENAMIENTO SEGURA (Agente B1 · blindaje local)
 * ============================================================================
 * CAUSA RAÍZ (observada en producción, jul-2026): tras meses de uso el
 * `localStorage` del usuario se LLENA (chatlog por días, multichat, memory
 * vault, catálogos, backups…). En ese estado, CUALQUIER `localStorage.setItem`
 * lanza `QuotaExceededError` (una `DOMException`, que en consola aparece como
 * «Object»). Como muchas escrituras locales NO estaban blindadas, esa excepción
 * subía sin control y:
 *   · reventaba la creación de chats (moría ANTES del insert en la nube),
 *   · impedía persistir los flags de migración (→ backfill en cada carga),
 *   · impedía persistir el `activeId` (→ desincronización entre superficies).
 *
 * Este módulo es la ÚNICA puerta segura al `localStorage`:
 *   · `safeGet/safeSet/safeRemove` NUNCA lanzan.
 *   · Ante `QuotaExceededError`, `safeSet`:
 *       (a) ejecuta UNA VEZ por sesión `pruneLocalStorage()` — poda de
 *           emergencia de claves legadas/pesadas CONOCIDAS y seguras,
 *       (b) reintenta el `setItem`,
 *       (c) si aún falla, guarda el valor en un `Map` en memoria (por clave),
 *           avisa UNA vez por consola y emite `starseed:storage-degraded`.
 *   · `safeGet` superpone el `Map` en memoria: si el último `set` de una clave
 *     se degradó, devuelve el valor en memoria (la intención más reciente).
 *
 * Con esto NINGUNA escritura local vuelve a lanzar: siempre se degrada.
 */

/** Evento del DOM: una escritura no cupo y quedó en memoria (la UI puede avisar). */
export const STORAGE_DEGRADED_EVENT = "starseed:storage-degraded";

const isClient = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

/** Overlay en memoria: claves cuyo último `set` no cupo en disco. */
const memory = new Map<string, string>();
/** Avisos de consola ya emitidos (una vez por clave). */
const warned = new Set<string>();
/** La poda de emergencia se intenta UNA sola vez por sesión de pestaña. */
let prunedThisSession = false;
/** Inventario de la última poda (para diagnóstico/informe). */
let lastPruneReport: PruneReport | null = null;

export interface PruneReport {
  /** Claves eliminadas por completo. */
  removed: string[];
  /** Claves recortadas (conservando parte): clave → nota. */
  trimmed: Record<string, string>;
  /** Bytes aproximados liberados (según `length` de las cadenas). */
  freedBytes: number;
}

/** ¿Es un `QuotaExceededError`? (varía el nombre/código entre navegadores). */
function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: number };
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014
  );
}

/** Lee una clave. Nunca lanza. Superpone el overlay en memoria. */
export function safeGet(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  if (!isClient()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Escribe una clave. Nunca lanza. Devuelve `true` si quedó PERSISTIDA en disco,
 * `false` si se degradó a memoria (cuota llena tras poda).
 */
export function safeSet(key: string, value: string): boolean {
  if (!isClient()) {
    memory.set(key, value);
    return false;
  }
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key); // el disco ya tiene el valor bueno → sin overlay
    return true;
  } catch (e) {
    if (!isQuotaError(e)) {
      // Storage bloqueado (modo privado / política): degradamos a memoria en silencio.
      memory.set(key, value);
      return false;
    }
  }

  // ── Cuota llena: poda de emergencia (una vez) + reintento ──────────────────
  if (!prunedThisSession) {
    prunedThisSession = true;
    try {
      lastPruneReport = pruneLocalStorage();
    } catch {
      /* la poda nunca debe impedir el reintento */
    }
  }
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
    return true;
  } catch {
    /* sigue sin caber → memoria */
  }

  // ── Degradación final: memoria + aviso (una vez por clave) + evento ────────
  memory.set(key, value);
  if (!warned.has(key)) {
    warned.add(key);
    try {
      // eslint-disable-next-line no-console
      console.warn("[storage] cuota llena", key);
    } catch {
      /* noop */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_DEGRADED_EVENT, { detail: { key } }));
  } catch {
    /* noop */
  }
  return false;
}

/** Elimina una clave (disco + overlay). Nunca lanza. */
export function safeRemove(key: string): void {
  memory.delete(key);
  if (!isClient()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

/** Reporte de la última poda ejecutada en esta sesión (o null). */
export function lastPrune(): PruneReport | null {
  return lastPruneReport;
}

// ── Poda de emergencia ───────────────────────────────────────────────────────
/** Prefijo del registro legado de Aurora (ya migrado a la nube por convId determinista). */
const CHATLOG_PREFIX = "starseed.aurora.chatlog.v1";
/** Días de registro legado que se conservan localmente al podar. */
const CHATLOG_KEEP_DAYS = 3;
/** Claves de LOG/CACHÉ puras, regenerables, seguras de eliminar bajo presión. */
const REGENERABLE_KEYS = [
  "starseed.astraura.routes.v1", // bitácora de enrutado de IA (diagnóstica; se regenera)
  "starseed.updates.available.cache.v1", // caché de actualizaciones (se vuelve a bajar)
];
/** ¿La clave parece un backup/copia de seguridad? (`.bak`, `.backup`, sufijo `~`). */
function looksLikeBackup(key: string): boolean {
  return /\.bak(\b|[._-]|\d)|\.backup(\b|[._-])|~$/i.test(key);
}
/** Extrae una fecha YYYY-MM-DD de una clave legada (o null). */
function dateInKey(key: string): string | null {
  const m = key.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

/**
 * Poda de EMERGENCIA de claves CONOCIDAS y seguras (sin perder datos no
 * migrados). Se invoca desde `safeSet` cuando la cuota está llena. Documenta y
 * devuelve todo lo podado. Cada clave se trata de forma aislada (un fallo no
 * aborta el resto). Idempotente y defensiva.
 *
 * Inventario:
 *  1. `starseed.aurora.chatlog.v1`  → recorta a los últimos 3 días (el resto ya
 *     está en la nube: `migrateLegacyChatLog` lo sube con `client_id`
 *     determinista, así que reconstruirlo es gratis e idempotente).
 *  2. `starseed.aurora.chatlog.v1-<fecha>` (variantes legadas por día) → se
 *     eliminan si su fecha es anterior a 3 días; si no llevan fecha, se eliminan
 *     (variante legada ya migrada).
 *  3. Cualquier clave que parezca backup (`*.bak*`, `*.backup*`, sufijo `~`) → se elimina.
 *  4. Logs/cachés regenerables (enrutado de IA, caché de actualizaciones) → se eliminan.
 */
export function pruneLocalStorage(): PruneReport {
  const report: PruneReport = { removed: [], trimmed: {}, freedBytes: 0 };
  if (!isClient()) return report;

  // Instantánea de claves (mutar durante la iteración es inseguro).
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    return report;
  }

  const now = Date.now();
  const cutoff = now - CHATLOG_KEEP_DAYS * 86_400_000;
  const cutoffDay = new Date(cutoff).toISOString().slice(0, 10); // YYYY-MM-DD

  const sizeOf = (k: string): number => {
    try {
      return (window.localStorage.getItem(k) ?? "").length;
    } catch {
      return 0;
    }
  };
  const remove = (k: string) => {
    const n = sizeOf(k);
    try {
      window.localStorage.removeItem(k);
      report.removed.push(k);
      report.freedBytes += n;
    } catch {
      /* noop */
    }
  };

  for (const key of keys) {
    try {
      // (1) Registro legado principal → recorta a los últimos N días.
      if (key === CHATLOG_PREFIX) {
        const before = sizeOf(key);
        const trimmed = trimChatlogToRecent(key, cutoff);
        if (trimmed != null) {
          const after = trimmed.length;
          if (after < before) {
            try {
              window.localStorage.setItem(key, trimmed);
              report.trimmed[key] = `conservados últimos ${CHATLOG_KEEP_DAYS} días`;
              report.freedBytes += before - after;
            } catch {
              // Si ni el recorte cabe, como último recurso lo eliminamos (migrado).
              remove(key);
            }
          }
        }
        continue;
      }
      // (2) Variantes legadas por día del registro.
      if (key.startsWith(CHATLOG_PREFIX) && key !== CHATLOG_PREFIX) {
        const d = dateInKey(key);
        if (!d || d < cutoffDay) remove(key);
        continue;
      }
      // (3) Backups.
      if (looksLikeBackup(key)) {
        remove(key);
        continue;
      }
      // (4) Logs/cachés regenerables.
      if (REGENERABLE_KEYS.includes(key)) {
        remove(key);
        continue;
      }
    } catch {
      /* una clave problemática nunca aborta la poda */
    }
  }

  return report;
}

/**
 * Recorta el registro legado (`{ v, entries:[{ts,…}] }`) conservando SOLO las
 * entradas con `ts >= cutoff`. Devuelve la cadena JSON recortada, o `null` si no
 * se puede interpretar (en cuyo caso el llamador decide). Nunca lanza.
 */
function trimChatlogToRecent(key: string, cutoff: number): string | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const list: unknown = Array.isArray(parsed)
      ? parsed
      : (parsed as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(list)) return null;
    const kept = list.filter(
      (e) => e && typeof e === "object" && Number((e as { ts?: number }).ts) >= cutoff,
    );
    // Conserva la forma original ({v,entries}) si la tenía.
    if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
      return JSON.stringify({ ...(parsed as object), entries: kept });
    }
    return JSON.stringify(kept);
  } catch {
    return null;
  }
}

export default { safeGet, safeSet, safeRemove, pruneLocalStorage, lastPrune };
