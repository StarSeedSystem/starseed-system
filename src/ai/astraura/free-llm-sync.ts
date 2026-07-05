"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · SINCRONIZACIÓN INFORMATIVA CON free-llm-api-resources
 * ---------------------------------------------------------------------------
 * El proyecto comunitario `cheahjs/free-llm-api-resources` mantiene una lista
 * viva de proveedores de LLM con tier gratuito. Aurora NO delega su catálogo en
 * él (nuestro FREE_CATALOG está curado a mano, con endpoints verificados), pero
 * SÍ hace una lectura best-effort para telemetría: cuántos proveedores gratis
 * hay "ahí fuera" ahora mismo. Sirve para avisarnos cuando conviene revisar y
 * ampliar el catálogo, sin tocar nada en runtime.
 *
 * Reglas duras:
 *   · NUNCA reescribe FREE_CATALOG en runtime (solo guarda una pista/telemetría).
 *   · NUNCA lanza (todo va envuelto en try/catch; falla en silencio).
 *   · SSR-safe: sin red en el servidor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const FREELLM_SEEN_KEY = "starseed.astraura.freellm.seen.v1";
export const FREELLM_EVENT = "starseed:astraura-freellm-seen";

const SOURCE_URL =
  "https://raw.githubusercontent.com/cheahjs/free-llm-api-resources/main/README.md";

export interface FreeLlmHint {
  /** Nº aproximado de proveedores gratuitos detectados en la lista comunitaria. */
  count: number;
  /** Marca de tiempo de la última lectura (ms). */
  at: number;
}

/** Lee la última pista guardada (o null). Nunca lanza. */
export function readFreeLlmHint(): FreeLlmHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FREELLM_SEEN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && typeof p.count === "number") {
      return { count: p.count, at: typeof p.at === "number" ? p.at : 0 };
    }
  } catch {
    /* silencio */
  }
  return null;
}

/**
 * Cuenta groseramente los proveedores mencionados en el README comunitario.
 * El README lista cada proveedor como un encabezado Markdown (### Proveedor) y
 * en tablas; contamos encabezados de nivel 3 como proxy razonable. Si el formato
 * cambia, devolvemos al menos las coincidencias de enlaces de proveedor.
 */
function countProviders(md: string): number {
  try {
    const headings = (md.match(/^###\s+/gm) || []).length;
    if (headings > 0) return headings;
    // Fallback: cuenta secciones tipo "<summary>Proveedor</summary>" o filas.
    const summaries = (md.match(/<summary>/gi) || []).length;
    return summaries;
  } catch {
    return 0;
  }
}

/**
 * Lectura best-effort de la lista comunitaria de LLMs gratuitos. Guarda solo una
 * pista (count) en localStorage para telemetría y emite un evento para la UI.
 * NO modifica el catálogo. Devuelve `{ count }` (0 si no se pudo leer).
 * Nunca lanza.
 */
export async function refreshFreeCatalogHint(): Promise<{ count: number }> {
  if (typeof window === "undefined") return { count: 0 };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(SOURCE_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return { count: 0 };
    const md = await res.text();
    const count = countProviders(md);
    if (count > 0) {
      const hint: FreeLlmHint = { count, at: Date.now() };
      try {
        window.localStorage.setItem(FREELLM_SEEN_KEY, JSON.stringify(hint));
        window.dispatchEvent(new CustomEvent(FREELLM_EVENT, { detail: hint }));
      } catch {
        /* silencio */
      }
    }
    return { count };
  } catch {
    return { count: 0 };
  }
}
