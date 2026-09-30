"use client";

/**
 * safe-persist.ts — Persistencia/intento SEGURO con telemetría visible.
 *
 * Sustituye a los catch vacíos que tragaban cuota llena de localStorage,
 * modo privado y errores de red en silencio (la UI mostraba éxito falso).
 * Toda operación envuelta:
 *   1. DEJA constancia en consola (`console.warn`).
 *   2. EMITE el CustomEvent `starseed:diagnostico` para que la UI pueda
 *      reaccionar (toast de «no se pudo guardar», contador, etc.).
 *   3. DEVUELVE `{ ok, reason? }` — nunca lanza.
 *
 * Módulo puro y SSR-safe: sin `window` no emite evento, solo registra.
 */

export interface SafePersistResult {
  ok: boolean;
  /** Motivo corto del fallo (mensaje de error o tipo), solo si !ok. */
  reason?: string;
}

/** Motivo corto y seguro para mostrar/registrar de un error cualquiera. */
export function razonDeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "error";
  if (typeof err === "string") return err.slice(0, 160);
  try {
    return String(err).slice(0, 160);
  } catch {
    return "error";
  }
}

/** Deja constancia del fallo y emite el evento de diagnóstico (si hay ventana). */
export function emitirFallo(clave: string, reason: string): void {
  try {
    console.warn(`[astraura] fallo en ${clave}: ${reason}`);
  } catch { /* consola no disponible */ }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("starseed:diagnostico", { detail: { clave, reason } }),
      );
    }
  } catch { /* emisión defensiva */ }
}

/**
 * Envuelve una operación SÍNCRONA (típico: `localStorage.setItem`).
 * Devuelve `{ ok: true }` o `{ ok: false, reason }` con telemetría ya emitida.
 */
export function safePersist(clave: string, fn: () => void): SafePersistResult {
  try {
    fn();
    return { ok: true };
  } catch (err) {
    const reason = razonDeError(err);
    emitirFallo(clave, reason);
    return { ok: false, reason };
  }
}
