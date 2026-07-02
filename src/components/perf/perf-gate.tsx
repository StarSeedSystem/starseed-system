"use client";

/**
 * perf-gate — compuertas de rendimiento para los fondos del OS.
 * ----------------------------------------------------------------------------
 * `<PerfController/>` fija `data-perf` en <html> al montar y cuando cambia el
 * modo. `<PerfHeavyOnly>` solo renderiza sus hijos (fondos WebGL/Spline/iframe)
 * cuando el dispositivo NO está en modo eco → los móviles de gama baja dejan de
 * montar 6 capas pesadas. `<PerfStaticBackdrop/>` es el fondo cristalino estático
 * (bonito, del tema StarSeed) que se muestra siempre por debajo.
 */

import { useEffect, useState } from "react";
import {
  applyPerf,
  allowHeavyFx,
  PERF_CHANGED_EVENT,
  type PerfApplied,
} from "@/lib/perf/device-tier";

/** Fija data-perf y lo re-evalúa al cambiar el modo o el tamaño de ventana. */
export function PerfController() {
  useEffect(() => {
    applyPerf();
    const onChange = () => applyPerf();
    window.addEventListener(PERF_CHANGED_EVENT, onChange);
    window.addEventListener("resize", onChange);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
    } catch {
      /* noop */
    }
    return () => {
      window.removeEventListener(PERF_CHANGED_EVENT, onChange);
      window.removeEventListener("resize", onChange);
      try { mq?.removeEventListener("change", onChange); } catch { /* */ }
    };
  }, []);
  return null;
}

/** Renderiza los fondos pesados SOLO si el dispositivo los tolera. */
export function PerfHeavyOnly({ children }: { children: React.ReactNode }) {
  const [heavy, setHeavy] = useState(false); // SSR/primer paint: nada pesado
  useEffect(() => {
    const evaluate = () => setHeavy(allowHeavyFx());
    evaluate();
    window.addEventListener(PERF_CHANGED_EVENT, evaluate);
    return () => window.removeEventListener(PERF_CHANGED_EVENT, evaluate);
  }, []);
  if (!heavy) return null;
  return <>{children}</>;
}

/**
 * Fondo cristalino estático StarSeed: gradiente vivo por CSS (sin coste de GPU
 * continuo), siempre presente. Usa variables del tema para casar con la marca.
 */
export function PerfStaticBackdrop() {
  const [applied, setApplied] = useState<PerfApplied>("high");
  useEffect(() => {
    const evaluate = () => {
      try {
        const v = document.documentElement.getAttribute("data-perf");
        setApplied((v as PerfApplied) || "high");
      } catch { /* */ }
    };
    evaluate();
    window.addEventListener(PERF_CHANGED_EVENT, evaluate);
    return () => window.removeEventListener(PERF_CHANGED_EVENT, evaluate);
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-20 pointer-events-none"
      style={{
        background:
          "radial-gradient(120% 90% at 15% 10%, color-mix(in srgb, var(--primary, #7C3AED) 22%, transparent), transparent 55%)," +
          "radial-gradient(120% 100% at 85% 20%, color-mix(in srgb, #06B6D4 18%, transparent), transparent 55%)," +
          "radial-gradient(140% 120% at 50% 100%, color-mix(in srgb, #DC143C 12%, transparent), transparent 60%)," +
          "linear-gradient(180deg, #0A0712, #070510)",
        // En eco no animamos; en mid/high un latido lento y barato (opacidad).
        animation: applied === "eco" ? "none" : "ssPerfBreathe 14s ease-in-out infinite",
      }}
    />
  );
}
