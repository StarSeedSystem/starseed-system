"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface TimeoutHandle {
  cancelar: () => void;
  reiniciar: () => void;
}

export interface UseTimeoutInteractionOptions {
  delay?: number;
  escucharInteracciones?: boolean;
}

const DEFAULT_DELAY = 5000;

export function useTimeoutInteraction(
  callback: () => void,
  delay: number = DEFAULT_DELAY,
  options?: UseTimeoutInteractionOptions,
): { handle: TimeoutHandle } {
  const opts = {
    delay: options?.delay ?? delay,
    escucharInteracciones: options?.escucharInteracciones ?? false,
  };
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const delayRef = useRef(opts.delay);
  const [cancelado] = useState(false);

  useEffect(() => {
    callbackRef.current = callback;
    delayRef.current = opts.delay;
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [callback, opts.delay]);

  const reiniciar = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (!cancelado) {
      timeoutRef.current = setTimeout(() => {
        callbackRef.current();
      }, delayRef.current);
    }
  }, [cancelado]);

  useEffect(() => {
    reiniciar();
  }, [reiniciar]);

  useEffect(() => {
    if (!opts.escucharInteracciones) return;

    const manejarInteraccion = () => reiniciar();

    const eventos = ["scroll", "click", "keydown", "pointermove", "touchstart"];
    eventos.forEach((evento) => {
      window.addEventListener(evento, manejarInteraccion, { passive: true });
    });

    return () => {
      eventos.forEach((evento) => {
        window.removeEventListener(evento, manejarInteraccion);
      });
    };
  }, [opts.escucharInteracciones, reiniciar]);

  const handle: TimeoutHandle = {
    cancelar: useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }, []),
    reiniciar,
  };

  return { handle };
}