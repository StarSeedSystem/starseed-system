'use client';

// ════════════════════════════════════════════════════════════════
// CompactOscillator — control de oscilador para POCO espacio (widget)
// ----------------------------------------------------------------
// Versión condensada de `OscillatorControls` (la app completa) para el
// generador del widget de dashboard. Reutiliza la MISMA forma de estado
// (`OscillatorState`) y los MISMOS callbacks del motor `useAudio`
// (update/remove), pero expone solo lo esencial en formato compacto:
//   • mute/activar, nombre, eliminar.
//   • frecuencia (slider + número), onda, volumen.
//   • toggle "Binaural" → reparte el oscilador a L/R (panX ±0.85). En la
//     app completa esto se logra con dos osciladores opuestos; aquí lo
//     simplificamos a un paneo estéreo que el detector de resonancia de
//     la app completa interpreta igual (panX opuesto = binaural).
//   • mini-visualizador (mismo componente Visualizer que la app).
// Estética cristal + acento cian #22D3EE. Accesible (labels/aria) y
// respeta reduced-motion (sin animaciones propias). 'use client'.
// ════════════════════════════════════════════════════════════════

import React from 'react';
import { Trash2, Volume2, VolumeX } from 'lucide-react';
import { OscillatorState, WaveType } from '../types';
import Visualizer from './Visualizer';

const ACCENT = '#22D3EE';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background';

const WAVES: { value: WaveType; label: string }[] = [
  { value: 'sine', label: 'Senoidal' },
  { value: 'square', label: 'Cuadrada' },
  { value: 'sawtooth', label: 'Diente' },
  { value: 'triangle', label: 'Triangular' },
];

interface Props {
  osc: OscillatorState;
  update: (id: string, changes: Partial<OscillatorState>) => void;
  remove: (id: string) => void;
  analyser: AnalyserNode | undefined;
  /** Oculta el mini-visualizador (tamaños muy pequeños). */
  showWave?: boolean;
}

const CompactOscillator: React.FC<Props> = ({ osc, update, remove, analyser, showWave = true }) => {
  // "Binaural" = el oscilador está paneado a un lado (≠ 0). Activarlo lo
  // manda a la izquierda; el detector de resonancia lo combina con otra
  // onda opuesta para producir el batido binaural.
  const binaural = Math.abs(osc.panX) >= 0.1;

  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-2.5 space-y-2">
      {/* Top row: mute · name · remove */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => update(osc.id, { isPlaying: !osc.isPlaying })}
          aria-pressed={osc.isPlaying}
          aria-label={osc.isPlaying ? `Silenciar ${osc.name}` : `Activar ${osc.name}`}
          title={osc.isPlaying ? 'Silenciar' : 'Activar'}
          className={`grid size-6 shrink-0 place-items-center rounded-lg border transition-colors cursor-pointer ${FOCUS_RING} ${
            osc.isPlaying
              ? 'border-cyan-400/50 text-cyan-200'
              : 'border-border/40 text-muted-foreground/60'
          }`}
          style={
            osc.isPlaying
              ? { background: `color-mix(in srgb, ${ACCENT} 18%, transparent)` }
              : undefined
          }
        >
          {osc.isPlaying ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
        </button>

        <input
          type="text"
          value={osc.name ?? ''}
          onChange={(e) => update(osc.id, { name: e.target.value })}
          aria-label="Nombre del oscilador"
          className={`min-w-0 flex-1 bg-transparent text-[11px] font-bold text-foreground/90 focus:outline-none ${FOCUS_RING} rounded`}
        />

        <span
          className="size-2.5 shrink-0 rounded-full border border-white/30"
          style={{ background: osc.color }}
          aria-hidden
        />

        <button
          type="button"
          onClick={() => remove(osc.id)}
          aria-label={`Eliminar ${osc.name}`}
          title="Eliminar"
          className={`grid size-6 shrink-0 place-items-center rounded-lg text-muted-foreground/60 transition-colors hover:text-red-400 cursor-pointer ${FOCUS_RING}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Mini-visualizer */}
      {showWave && (
        <div className="relative h-8 overflow-hidden rounded-lg border border-white/10 bg-black/40">
          <Visualizer analyser={analyser} height={32} color={osc.color} />
          {!osc.isPlaying && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/70">
              Silenciado
            </div>
          )}
        </div>
      )}

      {/* Frequency */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
          <span>Frecuencia</span>
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              step="any"
              value={Number.isFinite(osc.frequency) ? Math.round(osc.frequency * 100) / 100 : 0}
              onChange={(e) => update(osc.id, { frequency: Math.max(1, Number(e.target.value)) })}
              aria-label="Frecuencia en hercios"
              className={`w-16 rounded-md border border-cyan-400/30 bg-black/50 px-1.5 py-0.5 text-right font-mono text-[10px] text-cyan-200 focus:outline-none ${FOCUS_RING}`}
            />
            <span className="text-cyan-300/70">Hz</span>
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={1000}
          step="any"
          value={Math.min(1000, osc.frequency)}
          onChange={(e) => update(osc.id, { frequency: Number(e.target.value) })}
          aria-label="Ajustar frecuencia"
          className={`h-1 w-full cursor-pointer appearance-none rounded-full accent-cyan-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-300 ${FOCUS_RING}`}
          style={{
            background: `linear-gradient(90deg, ${ACCENT} ${(Math.min(1000, osc.frequency) / 1000) * 100}%, rgba(255,255,255,0.15) ${(Math.min(1000, osc.frequency) / 1000) * 100}%)`,
          }}
        />
      </div>

      {/* Wave + Binaural + Volume */}
      <div className="flex items-center gap-2">
        <select
          value={osc.type}
          onChange={(e) => update(osc.id, { type: e.target.value as WaveType })}
          aria-label="Tipo de onda"
          className={`rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider text-cyan-200 focus:outline-none cursor-pointer ${FOCUS_RING}`}
        >
          {WAVES.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => update(osc.id, { panX: binaural ? 0 : -0.85 })}
          aria-pressed={binaural}
          aria-label={binaural ? 'Desactivar paneo binaural' : 'Activar paneo binaural'}
          title="Paneo binaural (estéreo L/R)"
          className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${FOCUS_RING} ${
            binaural
              ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
              : 'border-border/40 text-muted-foreground/60 hover:text-foreground'
          }`}
        >
          Binaural
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Volume2 className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={osc.volume}
            onChange={(e) => update(osc.id, { volume: Number(e.target.value) })}
            aria-label="Volumen del oscilador"
            aria-valuetext={`${Math.round(osc.volume * 100)} por ciento`}
            className={`h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-cyan-400 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-300 ${FOCUS_RING}`}
            style={{
              background: `linear-gradient(90deg, ${ACCENT} ${osc.volume * 100}%, rgba(255,255,255,0.15) ${osc.volume * 100}%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default CompactOscillator;
