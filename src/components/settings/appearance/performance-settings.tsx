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
import {
  CLAVE_PREFERENCIA,
  EVENTO_CAMBIO,
  PERFILES,
  leerPreferencia,
  type PreferenciaCalidadFondo,
} from "@/lib/perf/calidad-fondo";
import { guardarPreferenciaFondo, type EstadoFondoVivo } from "@/lib/perf/fondo-vivo";

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
      <CalidadFondoAjuste />
    </div>
  );
}

/**
 * (2026-09-24) Calidad del fondo animado: automática (se adapta al equipo y a la carga
 * en vivo) o fija. Enseña la calidad que está usando AHORA y por qué.
 */
const OPCIONES_FONDO: Array<{ id: PreferenciaCalidadFondo; label: string; desc: string }> = [
  { id: "auto", label: "Automática", desc: "Se adapta sola al equipo y a lo ocupado que esté el sistema." },
  { id: "alta", label: PERFILES.alta.etiqueta, desc: PERFILES.alta.descripcion },
  { id: "media", label: PERFILES.media.etiqueta, desc: PERFILES.media.descripcion },
  { id: "baja", label: PERFILES.baja.etiqueta, desc: PERFILES.baja.descripcion },
  { id: "minima", label: PERFILES.minima.etiqueta, desc: PERFILES.minima.descripcion },
];

function CalidadFondoAjuste() {
  const [pref, setPref] = useState<PreferenciaCalidadFondo>("auto");
  const [vivo, setVivo] = useState<EstadoFondoVivo | null>(null);

  useEffect(() => {
    try {
      setPref(leerPreferencia(window.localStorage.getItem(CLAVE_PREFERENCIA)));
    } catch {
      /* sin almacenamiento */
    }
    setVivo(window.__starseedFondo ?? null);
    const alCambiar = (e: Event) => setVivo((e as CustomEvent<EstadoFondoVivo>).detail ?? null);
    window.addEventListener(EVENTO_CAMBIO, alCambiar);
    return () => window.removeEventListener(EVENTO_CAMBIO, alCambiar);
  }, []);

  const elegir = (p: PreferenciaCalidadFondo) => {
    setPref(p);
    guardarPreferenciaFondo(p);
  };

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Calidad del fondo animado</h4>
        <span className="text-[11px] text-muted-foreground" aria-live="polite">
          {vivo
            ? vivo.pausado
              ? "En pausa (pestaña oculta)"
              : `Ahora: ${PERFILES[vivo.calidad].etiqueta} · ${vivo.motivo}`
            : "El fondo animado no está activo en esta vista"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Calidad del fondo animado">
        {OPCIONES_FONDO.map(({ id, label, desc }) => (
          <button
            key={id}
            role="radio"
            aria-checked={pref === id}
            onClick={() => elegir(id)}
            title={desc}
            className={cn(
              "text-left rounded-xl border p-2.5 min-h-11 transition-all cursor-pointer",
              "bg-white/[0.03] hover:bg-white/[0.06]",
              pref === id ? "border-cyan-400/60 ring-1 ring-cyan-400/30" : "border-white/10",
            )}
          >
            <span className="block text-[13px] font-medium text-foreground">{label}</span>
            <span className="block text-[10.5px] leading-snug text-muted-foreground">{desc}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Con el difuminado del fondo, Media y Baja se ven prácticamente igual que Alta y dejan la máquina libre.
        Aunque la fijes, el sistema puede bajarla un momento si lo necesita (por ejemplo, mientras habla Astraura).
      </p>
    </div>
  );
}

export default PerformanceSettings;
