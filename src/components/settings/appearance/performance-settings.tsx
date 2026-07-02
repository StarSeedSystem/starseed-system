"use client";

/**
 * PerformanceSettings — Ajustes → Apariencia → Rendimiento.
 * Modo Auto (recomendado) / Alto / Eco. En Eco los fondos son estáticos y hay
 * menos desenfoque → móviles y equipos modestos van fluidos.
 */

import { useEffect, useState } from "react";
import { Gauge, Zap, Leaf, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPerfMode,
  setPerfMode,
  detectTier,
  resolveApplied,
  type PerfMode,
  PERF_CHANGED_EVENT,
} from "@/lib/perf/device-tier";

const OPTIONS: Array<{ id: PerfMode; label: string; desc: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: "auto", label: "Automático", desc: "Recomendado. Ajusta la riqueza visual al dispositivo.", Icon: Sparkles },
  { id: "high", label: "Alto", desc: "Todos los fondos vivos (WebGL, cristal líquido). Equipos potentes.", Icon: Zap },
  { id: "eco", label: "Eco", desc: "Fondos estáticos y menos desenfoque. Más fluidez y batería.", Icon: Leaf },
];

export function PerformanceSettings() {
  const [mode, setMode] = useState<PerfMode>("auto");
  const [tier, setTier] = useState<string>("high");
  const [applied, setApplied] = useState<string>("high");

  useEffect(() => {
    setMode(getPerfMode());
    setTier(detectTier());
    setApplied(resolveApplied());
    const onChange = () => setApplied(resolveApplied());
    window.addEventListener(PERF_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PERF_CHANGED_EVENT, onChange);
  }, []);

  const choose = (m: PerfMode) => {
    setMode(m);
    setPerfMode(m);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Rendimiento
        </h3>
        <span className="text-[11px] text-muted-foreground">
          Dispositivo: <b className="text-foreground/70">{tier}</b> · aplicando: <b className="text-foreground/70">{applied}</b>
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map(({ id, label, desc, Icon }) => (
          <button
            key={id}
            onClick={() => choose(id)}
            aria-pressed={mode === id}
            className={cn(
              "text-left rounded-2xl border p-3 transition-all cursor-pointer",
              "bg-white/[0.03] hover:bg-white/[0.06]",
              mode === id ? "border-cyan-400/60 ring-1 ring-cyan-400/30" : "border-white/10",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4 text-cyan-300" />
              <span className="text-sm font-medium text-foreground">{label}</span>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default PerformanceSettings;
