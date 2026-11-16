"use client";

/**
 * useTimeoutInteraction — gestor de temporizador que reinicia al detectar interacción.
 *
 * ── propósito ──
 * Mantiene un temporizador que se reinicia cada vez que el usuario
 * realiza una acción (scroll, click, movimiento del mouse, teclas).
 * Ideal para modales/guías que no deben interrumpir la navegación.
 *
 * ── uso ──
 * const onTimeout = useCallback(() => { cerrar(); }, [cerrar]);
 * useTimeoutInteraction({
 *   timeoutMs: 30000,
 *   onTimeout,
 *   enabled: open && inTour,
 * });
 *
 * ── reglas ──
 * - No lanza: el hook detecta interacciones de forma defensiva.
 * - Solo funciona en cliente (typeof window !== "undefined").
 * - El timeout tiene una duración mínima de 5 segundos.
 */

import { useCallback, useEffect, useRef } from "react";

const MIN_TIMEOUT_MS = 5000;

export interface UseTimeoutInteractionOptions {
  /** Duración del timeout en milisegundos. */
  timeoutMs: number;
  /** Callback al expirar el temporizador. */
  onTimeout: () => void;
  /** Si está deshabilitado, no actúa. */
  enabled?: boolean;
  /** Duración mínima del timeout (default: 5000ms). */
  minTimeoutMs?: number;
}

export function useTimeoutInteraction(options: UseTimeoutInteractionOptions): void {
  const { timeoutMs, onTimeout, enabled = true, minTimeoutMs = MIN_TIMEOUT_MS } = options;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actualTimeoutMs = Math.max(MIN_TIMEOUT_MS, timeoutMs);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handleInteraction = useCallback(() => {
    if (!enabledRef.current) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    timeoutRef.current = setTimeout(() => {
      if (enabledRef.current) onTimeout();
    }, actualTimeoutMs);
  }, [actualTimeoutMs, onTimeout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!enabledRef.current) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const handleScroll = () => handleInteraction();
    const handleClick = () => handleInteraction();
    const handleMouseMove = () => handleInteraction();
    const handleKeyDown = () => handleInteraction();
    const handleTouchStart = () => handleInteraction();

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("click", handleClick, { passive: true });
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });

    timeoutRef.current = setTimeout(() => {
      if (enabledRef.current) onTimeout();
    }, actualTimeoutMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
    };
  }, [actualTimeoutMs, onTimeout, handleInteraction]);
}