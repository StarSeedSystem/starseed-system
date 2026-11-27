/**
 * use-intersection-observer — hook para pausar renderizado cuando la página está oculta.
 * ============================================================================
 * Usa IntersectionObserver para detectar cuando la pestaña está fuera de la vista,
 * pausando así el renderizado 3D y ahorrando batería. Es el reemplazo de
 * usePestanaVisible que solo escuchaba `document.visibilityState`.
 */

import { useEffect, useState } from "react";

export function useIntersectionObserver(targetRef: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      { threshold: 0.01 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);

  return visible;
}

export function useVisibilityState(): boolean {
  const [visible, setVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });

  useEffect(() => {
    const handleChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", handleChange);
    return () => document.removeEventListener("visibilitychange", handleChange);
  }, []);

  return visible;
}