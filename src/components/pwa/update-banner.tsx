"use client";

/**
 * UpdateBanner — aviso DENTRO de la app de que hay una versión nueva lista.
 * ---------------------------------------------------------------------------
 * Las actualizaciones de StarSeed se aplican SIEMPRE dentro de la app, sin
 * reinstalar: el service worker red-primero ya trae solo el código nuevo. Este
 * banner aparece únicamente cuando la nueva versión está lista PERO el usuario
 * estaba ocupado (Aurora hablando, escribiendo…), para no interrumpirle: le deja
 * aplicar cuando quiera con un toque. Si está libre, la app se actualiza sola.
 *
 * Escucha el evento `starseed:update-ready` (emitido por RegisterSW) y llama a
 * `window.STARSEED_APPLY_UPDATE()` para recargar con el código fresco.
 * SSR-safe, defensivo, sin dependencias nuevas.
 */

import { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";

export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => setReady(true);
    try { window.addEventListener("starseed:update-ready", on); } catch { /* */ }
    return () => { try { window.removeEventListener("starseed:update-ready", on); } catch { /* */ } };
  }, []);

  if (!ready || dismissed) return null;

  const apply = () => {
    try { (window as any).STARSEED_APPLY_UPDATE?.(); } catch { /* */ }
  };

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-[120] mx-auto flex w-[min(92vw,420px)] items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0f16]/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
    >
      <ArrowUpCircle className="h-5 w-5 shrink-0 text-[#7fb8ff]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white/90">Nueva versión lista</p>
        <p className="text-[11px] leading-snug text-white/55">
          Se aplica dentro de la app, sin reinstalar. Solo se incorpora lo nuevo.
        </p>
      </div>
      <button
        type="button"
        onClick={apply}
        className="shrink-0 cursor-pointer rounded-full bg-[#7fb8ff] px-3 py-1.5 text-[12px] font-semibold text-[#0b0f16] transition-opacity duration-200 hover:opacity-90"
      >
        Aplicar
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Ahora no"
        title="Ahora no"
        className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-white/45 transition-colors duration-200 hover:bg-white/10 hover:text-white/80"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default UpdateBanner;
