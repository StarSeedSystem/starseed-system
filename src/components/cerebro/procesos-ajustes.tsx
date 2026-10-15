"use client";

import { useId } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usarPreferenciasProcesos, limitesDeCerebro, guardarLimites } from "@/lib/cerebros/procesos-preferencias";
import type { TipoProceso } from "@/lib/cerebros/procesos";

const tiposDisponibles: { id: TipoProceso; etiqueta: string }[] = [
  { id: "genesis", etiqueta: "Genesis" },
  { id: "poligenesis", etiqueta: "PoliGenesis" },
  { id: "sueno", etiqueta: "Sueños" },
  { id: "imaginacion", etiqueta: "Imaginación" },
  { id: "descarga", etiqueta: "Descargas" },
  { id: "instalacion", etiqueta: "Instalaciones" },
  { id: "actualizacion", etiqueta: "Actualizaciones" },
  { id: "app-fondo", etiqueta: "Apps en segundo plano" },
  { id: "servicio", etiqueta: "Servicios" },
];

export function ProcesosAjustes({ brainId }: { brainId: string | null }) {
  const prefijoForm = useId();
  const { prefs, guardando, actualizarTipos, actualizarIntervalo, actualizarUmbrales, actualizarOcultos } = usarPreferenciasProcesos();
  const limites = brainId ? limitesDeCerebro(brainId) : null;

  const Toggle = ({ id, checked, onChange, label, className }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) => (
    <label className={cn("inline-flex items-center gap-2 cursor-pointer", className)}>
      <div className="relative">
        <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <div className={cn("w-11 h-6 rounded-full transition-colors", checked ? "bg-cyan-500" : "bg-white/20")}>
          <div className={cn("w-4 h-4 bg-white rounded-full transition-transform", checked ? "translate-x-5" : "translate-x-1")} />
        </div>
      </div>
      <span className="text-sm text-white/90">{label}</span>
    </label>
  );

  const Slider = ({ id, value, onChange, min, max, className }: { id: string; value: number; onChange: (v: number) => void; min: number; max: number; className?: string }) => (
    <div className={cn("w-full", className)}>
      <div className="flex justify-between items-center mb-1">
        <label htmlFor={id} className="text-sm text-white/70">
          {id === "intervalo" ? "Intervalo (segundos)" : id}
        </label>
        <span className="text-sm font-mono text-white/90">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
      />
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #22d3ee;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border: none;
          border-radius: 50%;
          background: #22d3ee;
          cursor: pointer;
        }
      `}</style>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Tipos visibles</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {tiposDisponibles.map((t) => {
            const checked = prefs.tipos.includes(t.id);
            return (
              <Toggle
                key={t.id}
                id={`${prefijoForm}-tipo-${t.id}`}
                checked={checked}
                onChange={(v) => {
                  const nuevos = v ? [...prefs.tipos, t.id] : prefs.tipos.filter((x) => x !== t.id);
                  actualizarTipos(nuevos);
                }}
                label={t.etiqueta}
              />
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Intervalo de monitoreo</h3>
        <Slider id="intervalo" value={prefs.intervaloSeg} onChange={actualizarIntervalo} min={5} max={120} />
        <p className="text-xs text-white/50 mt-1">Cada cuánto evaluar procesos (5-120 segundos, 15 por defecto)</p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Umbrales de aviso</h3>
        <div className="space-y-3">
          <Slider id="cpu" value={prefs.umbrales.cpu} onChange={(v) => actualizarUmbrales({ cpu: v })} min={1} max={100} />
          <Slider id="ram" value={prefs.umbrales.ram} onChange={(v) => actualizarUmbrales({ ram: v })} min={1} max={100} />
          <Slider id="disco" value={prefs.umbrales.disco} onChange={(v) => actualizarUmbrales({ disco: v })} min={1} max={100} />
          <Slider id="bateria" value={prefs.umbrales.bateria} onChange={(v) => actualizarUmbrales({ bateria: v })} min={1} max={100} />
        </div>
        <p className="text-xs text-white/50 mt-2">% o vacío (null) si no hay medida; CPU por debajo de esto avisa, RAM/disco/disco por encima, batería por debajo si no carga</p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Servidores ocultos</h3>
        <div className="space-y-2">
          {tiposDisponibles.map((t) => {
            const checked = prefs.ocultos.includes(t.id);
            return (
              <Toggle
                key={t.id}
                id={`${prefijoForm}-oculto-${t.id}`}
                checked={checked}
                onChange={(v) => {
                  const nuevos = v ? [...prefs.ocultos, t.id] : prefs.ocultos.filter((x) => x !== t.id);
                  actualizarOcultos(nuevos);
                }}
                label={t.etiqueta}
                className="text-white/80"
              />
            );
          })}
        </div>
      </div>

      {brainId && limites && (
        <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-lg">
          <div className="flex items-center gap-2 text-cyan-400 mb-2">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Límites de cerebro guardados</span>
          </div>
          <p className="text-xs text-white/70">
            CPU máx.: {limites.cpuMaxPct ?? "—"} % &nbsp;|&nbsp; RAM máx.: {limites.ramMaxMb ?? "—"} MB
          </p>
          <p className="text-xs text-white/50 mt-1">El orquestador los aplicará cuando estén disponibles.</p>
        </div>
      )}

      {guardando && (
        <div className="fixed bottom-4 right-4 bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 px-4 py-2 rounded-lg text-sm">
          Guardado; se aplicará el orquestador (hoy nadie lo aplica todavía)
        </div>
      )}
    </div>
  );
}