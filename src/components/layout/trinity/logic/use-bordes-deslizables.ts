"use client";

/**
 * Qué lados de un carril horizontal tienen más contenido por deslizar (para las sombras de las
 * pestañas). Solo repinta cuando el valor CAMBIA (regla de las Adendas 63 §15 y 66 §14: nada de
 * `setState` en cada medición del ResizeObserver).
 */
import { useCallback, useEffect, useState, type RefObject } from "react";

export interface Bordes {
  izquierda: boolean;
  derecha: boolean;
}

export function useBordesDeslizables(ref: RefObject<HTMLElement | null>, dependencias: ReadonlyArray<unknown> = []) {
  const [bordes, setBordes] = useState<Bordes>({ izquierda: false, derecha: false });
  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const izquierda = el.scrollLeft > 4;
    const derecha = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setBordes((prev) => (prev.izquierda === izquierda && prev.derecha === derecha ? prev : { izquierda, derecha }));
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", medir);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medir, ...dependencias]);

  return { bordes, medir };
}
