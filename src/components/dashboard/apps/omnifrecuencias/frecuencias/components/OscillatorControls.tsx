'use client';

import React, { useRef, useState, useEffect } from 'react';
import { OscillatorState, WaveType } from '../types';
import Icon from './Icon';
import Visualizer from './Visualizer';

interface Props {
  osc: OscillatorState;
  update: (id: string, changes: Partial<OscillatorState>) => void;
  remove: (id: string) => void;
  analyser: AnalyserNode | undefined;
}

const OscillatorControls: React.FC<Props> = ({ osc, update, remove, analyser }) => {
  // History State
  const historyRef = useRef<{ list: number[]; index: number }>({ list: [osc.frequency], index: 0 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitToHistory = (freq: number) => {
    const { list, index } = historyRef.current;
    if (list[index] === freq) return;

    const newList = list.slice(0, index + 1);
    newList.push(freq);
    if (newList.length > 50) newList.shift(); // Keep last 50

    historyRef.current = { list: newList, index: newList.length - 1 };
    setCanUndo(historyRef.current.index > 0);
    setCanRedo(historyRef.current.index < historyRef.current.list.length - 1);
  };

  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      commitToHistory(osc.frequency);
    }, 500);
    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osc.frequency]);

  const undoFreq = () => {
    const { list, index } = historyRef.current;
    if (index > 0) {
      const newIndex = index - 1;
      historyRef.current.index = newIndex;
      setCanUndo(newIndex > 0);
      setCanRedo(newIndex < list.length - 1);

      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      update(osc.id, { frequency: list[newIndex] });
    }
  };

  const redoFreq = () => {
    const { list, index } = historyRef.current;
    if (index < list.length - 1) {
      const newIndex = index + 1;
      historyRef.current.index = newIndex;
      setCanUndo(newIndex > 0);
      setCanRedo(newIndex < list.length - 1);

      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      update(osc.id, { frequency: list[newIndex] });
    }
  };

  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col gap-4 hover:border-cyan-500/30 transition-all shadow-lg">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-1 min-w-[150px]">
          <button
            onClick={() => update(osc.id, { isPlaying: !osc.isPlaying })}
            className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all cursor-pointer ${osc.isPlaying ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-transparent text-slate-500 border-slate-600'}`}
            title={osc.isPlaying ? 'Silenciar' : 'Activar'}
          >
            <Icon name={osc.isPlaying ? 'Radio' : 'Shield'} size={14} />
          </button>
          <input
            type="text"
            value={osc.name}
            onChange={(e) => update(osc.id, { name: e.target.value })}
            className="bg-transparent text-white font-medium text-sm focus:outline-none border-b border-transparent focus:border-cyan-500 w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={osc.type}
            onChange={(e) => update(osc.id, { type: e.target.value as WaveType })}
            className="bg-black/40 text-[10px] text-cyan-300 border border-white/10 rounded px-2 py-1 outline-none focus:border-cyan-500 uppercase cursor-pointer"
          >
            <option value="sine">Senoidal</option>
            <option value="square">Cuadrada</option>
            <option value="sawtooth">Diente</option>
            <option value="triangle">Triangular</option>
          </select>
          <button onClick={() => remove(osc.id)} className="text-slate-500 hover:text-red-400 p-1 cursor-pointer">
            <Icon name="ChevronDown" className="rotate-45" size={16} />
          </button>
        </div>
      </div>

      {/* Visualizer Mini + Color/Layer Config */}
      <div className="relative group/vis">
        <div className="h-16 bg-black/60 rounded-xl overflow-hidden border border-white/10 relative mb-3 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
          <Visualizer analyser={analyser} height={64} color={osc.color} />
          {!osc.isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500 uppercase tracking-widest bg-black/80 backdrop-blur-md">
              Silenciado
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-2">
          <label className="flex items-center gap-3 cursor-pointer group select-none bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-500 ${osc.isIndependent ? 'bg-amber-500 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8),inset_0_0_5px_rgba(255,255,255,0.5)]' : 'border-slate-600 bg-black/80'}`}>
              {osc.isIndependent && <div className="w-2 h-2 bg-white rounded-sm shadow-[0_0_5px_white]" />}
            </div>
            <input
              type="checkbox"
              checked={osc.isIndependent}
              onChange={(e) => update(osc.id, { isIndependent: e.target.checked })}
              className="hidden"
            />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest group-hover:text-amber-300 transition-colors">
              Onda Independiente
            </span>
          </label>

          <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Color</span>
            <div
              className="relative w-6 h-6 rounded-full overflow-hidden border-2 border-white/20 shadow-[0_0_10px_currentColor] transition-all hover:scale-110"
              style={{ color: osc.color }}
            >
              <input
                type="color"
                value={osc.color}
                onChange={(e) => update(osc.id, { color: e.target.value })}
                className="absolute inset-[-50%] w-[200%] h-[200%] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent my-4"></div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {/* Frequency */}
        <div className="space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            <div className="flex items-center gap-4">
              <span>Frecuencia (Hz)</span>
              <div className="flex items-center bg-black/60 rounded-xl border border-white/10 shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] overflow-hidden">
                <button
                  onClick={undoFreq}
                  disabled={!canUndo}
                  className={`p-2 transition-all duration-300 ${canUndo ? 'hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-200 hover:shadow-[inset_0_0_10px_rgba(34,211,238,0.2)] cursor-pointer' : 'text-slate-700 bg-black/40 cursor-not-allowed'}`}
                  title="Frecuencia anterior"
                >
                  <Icon name="CornerUpLeft" size={14} />
                </button>
                <div className="w-px h-5 bg-white/10"></div>
                <button
                  onClick={redoFreq}
                  disabled={!canRedo}
                  className={`p-2 transition-all duration-300 ${canRedo ? 'hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-200 hover:shadow-[inset_0_0_10px_rgba(34,211,238,0.2)] cursor-pointer' : 'text-slate-700 bg-black/40 cursor-not-allowed'}`}
                  title="Frecuencia siguiente"
                >
                  <Icon name="CornerUpRight" size={14} />
                </button>
              </div>
            </div>
            <input
              type="number"
              step="any"
              value={osc.frequency}
              onChange={(e) => update(osc.id, { frequency: Number(e.target.value) })}
              className="w-24 bg-black/60 text-right text-cyan-300 font-mono rounded-xl px-3 py-1.5 border border-cyan-500/30 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]"
            />
          </div>
          <input
            type="range"
            min="1"
            max="1000"
            step="any"
            value={osc.frequency}
            onChange={(e) => update(osc.id, { frequency: Number(e.target.value) })}
            className="w-full h-2 bg-black/40 rounded-full appearance-none cursor-pointer border border-white/5 shadow-[inset_0_0_5px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(34,211,238,0.8),inset_0_0_5px_rgba(255,255,255,0.5)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-cyan-200"
            style={{
              background: `linear-gradient(to right, rgba(34,211,238,0.3) ${(osc.frequency / 1000) * 100}%, rgba(0,0,0,0.4) ${(osc.frequency / 1000) * 100}%)`,
            }}
          />
        </div>

        {/* Volume */}
        <div className="space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            <span>Volumen</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                value={Math.round(osc.volume * 100)}
                onChange={(e) => update(osc.id, { volume: Number(e.target.value) / 100 })}
                className="w-16 bg-black/60 text-right text-purple-300 font-mono rounded-xl px-2 py-1 border border-purple-500/30 focus:outline-none focus:border-purple-400 focus:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]"
              />
              <span className="text-purple-300 font-mono">%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="any"
            value={osc.volume}
            onChange={(e) => update(osc.id, { volume: Number(e.target.value) })}
            className="w-full h-2 bg-black/40 rounded-full appearance-none cursor-pointer border border-white/5 shadow-[inset_0_0_5px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_15px_rgba(168,85,247,0.8),inset_0_0_5px_rgba(255,255,255,0.5)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-purple-200"
            style={{
              background: `linear-gradient(to right, rgba(168,85,247,0.3) ${osc.volume * 100}%, rgba(0,0,0,0.4) ${osc.volume * 100}%)`,
            }}
          />
        </div>

        {/* 3D Spatial Audio Controls */}
        <div className="md:col-span-2 space-y-5 pt-5 bg-black/40 rounded-2xl p-5 border border-white/10 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none"></div>
          <h4 className="text-[10px] text-cyan-200/70 uppercase font-bold tracking-widest flex items-center gap-3 relative z-10">
            <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
              <Icon name="Orbit" size={14} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
            </div>
            Posicionamiento Espacial 3D
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3 gap-4 relative z-10">
            {/* L/R - PanX */}
            <div className="space-y-3 bg-black/40 p-3 rounded-xl border border-white/5 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
              <div className="flex justify-between items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                <span>L</span>
                <input
                  type="number"
                  step="any"
                  value={osc.panX}
                  onChange={(e) => update(osc.id, { panX: Number(e.target.value) })}
                  className="w-12 sm:w-14 bg-black/60 text-center text-cyan-400 font-mono rounded border border-cyan-500/30 focus:outline-none focus:border-cyan-400"
                />
                <span>R</span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="any"
                value={osc.panX}
                onChange={(e) => update(osc.id, { panX: Number(e.target.value) })}
                className="w-full h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer border border-white/5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.8)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-cyan-200"
                title="Izquierda / Derecha"
                style={{
                  background: `linear-gradient(to right, rgba(34,211,238,0.3) ${((osc.panX + 1) / 2) * 100}%, rgba(0,0,0,0.6) ${((osc.panX + 1) / 2) * 100}%)`,
                }}
              />
            </div>

            {/* Back/Front - PanZ */}
            <div className="space-y-3 bg-black/40 p-3 rounded-xl border border-white/5 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
              <div className="flex justify-between items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                <span>Atrás</span>
                <input
                  type="number"
                  step="any"
                  value={osc.panZ}
                  onChange={(e) => update(osc.id, { panZ: Number(e.target.value) })}
                  className="w-12 sm:w-14 bg-black/60 text-center text-purple-400 font-mono rounded border border-purple-500/30 focus:outline-none focus:border-purple-400"
                />
                <span>Frente</span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="any"
                value={osc.panZ}
                onChange={(e) => update(osc.id, { panZ: Number(e.target.value) })}
                className="w-full h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer border border-white/5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.8)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-purple-200"
                title="Profundidad"
                style={{
                  background: `linear-gradient(to right, rgba(168,85,247,0.3) ${((osc.panZ + 1) / 2) * 100}%, rgba(0,0,0,0.6) ${((osc.panZ + 1) / 2) * 100}%)`,
                }}
              />
            </div>

            {/* Down/Up - PanY */}
            <div className="space-y-3 bg-black/40 p-3 rounded-xl border border-white/5 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
              <div className="flex justify-between items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                <span>Abajo</span>
                <input
                  type="number"
                  step="any"
                  value={osc.panY}
                  onChange={(e) => update(osc.id, { panY: Number(e.target.value) })}
                  className="w-12 sm:w-14 bg-black/60 text-center text-pink-400 font-mono rounded border border-pink-500/30 focus:outline-none focus:border-pink-400"
                />
                <span>Arriba</span>
              </div>
              <input
                type="range"
                min="-1"
                max="1"
                step="any"
                value={osc.panY}
                onChange={(e) => update(osc.id, { panY: Number(e.target.value) })}
                className="w-full h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer border border-white/5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-pink-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(236,72,153,0.8)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-pink-200"
                title="Altura"
                style={{
                  background: `linear-gradient(to right, rgba(236,72,153,0.3) ${((osc.panY + 1) / 2) * 100}%, rgba(0,0,0,0.6) ${((osc.panY + 1) / 2) * 100}%)`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Transition Controls */}
        <div className="md:col-span-2 space-y-4 pt-4 bg-black/40 rounded-2xl p-5 border border-white/10 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 pointer-events-none"></div>

          <div className="flex items-center justify-between relative z-10">
            <h4 className="text-xs text-cyan-200 uppercase font-black tracking-widest flex items-center gap-2 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
              <Icon name="Activity" size={14} className="text-cyan-400" />
              Transición Automática
            </h4>
            <label className="flex items-center gap-3 cursor-pointer group select-none bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${osc.transition?.enabled ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'border-slate-600 bg-black/50'}`}>
                {osc.transition?.enabled && <div className="w-2 h-2 bg-white rounded-sm shadow-[0_0_5px_white]" />}
              </div>
              <input
                type="checkbox"
                checked={!!osc.transition?.enabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  if (enabled && !osc.transition) {
                    update(osc.id, {
                      transition: {
                        enabled: true,
                        start: { frequency: osc.frequency, volume: osc.volume, panX: osc.panX, panY: osc.panY, panZ: osc.panZ, type: osc.type },
                        end: { frequency: osc.frequency + 10, volume: osc.volume, panX: osc.panX, panY: osc.panY, panZ: osc.panZ, type: osc.type },
                        duration: 5,
                        loopCount: 'infinite',
                        isPlaying: false,
                        progress: 0,
                        currentLoop: 0,
                        direction: 'forward',
                      },
                    });
                  } else if (osc.transition) {
                    update(osc.id, { transition: { ...osc.transition, enabled } });
                  }
                }}
                className="hidden"
              />
              <span className="text-[10px] text-slate-300 uppercase font-bold tracking-widest group-hover:text-cyan-200 transition-colors">Activar</span>
            </label>
          </div>

          {osc.transition?.enabled && (
            <div className="space-y-5 mt-4 relative z-10">
              {/* Start / End Variants */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Start Variant */}
                <div className="space-y-4 bg-black/50 p-5 rounded-2xl border border-cyan-500/20 shadow-[inset_0_0_20px_rgba(0,0,0,0.5),0_0_15px_rgba(34,211,238,0.1)] relative overflow-hidden group/variant">
                  <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 to-transparent opacity-0 group-hover/variant:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                  <h5 className="text-[10px] text-cyan-300 uppercase font-black tracking-widest text-center border-b border-cyan-500/20 pb-3 mb-4 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
                    Variante A (Inicio)
                  </h5>

                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    <span>Freq</span>
                    <input
                      type="number"
                      value={osc.transition.start.frequency}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, start: { ...osc.transition!.start, frequency: Number(e.target.value) } } })}
                      className="w-20 bg-black/60 text-cyan-200 text-right border border-cyan-500/30 rounded-lg px-2 py-1.5 focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(34,211,238,0.4)] outline-none transition-all shadow-[inset_0_0_5px_rgba(0,0,0,0.5)]"
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider gap-4">
                    <span>Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={osc.transition.start.volume}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, start: { ...osc.transition!.start, volume: Number(e.target.value) } } })}
                      className="flex-1 h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer border border-white/5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.8)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-cyan-200"
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider gap-4">
                    <span>Pan X</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.1"
                      value={osc.transition.start.panX}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, start: { ...osc.transition!.start, panX: Number(e.target.value) } } })}
                      className="flex-1 h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer border border-white/5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.8)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-cyan-200"
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    <span>Onda</span>
                    <select
                      value={osc.transition.start.type}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, start: { ...osc.transition!.start, type: e.target.value as WaveType } } })}
                      className="bg-black/60 text-cyan-200 text-right border border-cyan-500/30 rounded-lg px-2 py-1.5 focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(34,211,238,0.4)] outline-none uppercase text-[9px] cursor-pointer shadow-[inset_0_0_5px_rgba(0,0,0,0.5)] transition-all"
                    >
                      <option value="sine">Senoidal</option>
                      <option value="square">Cuadrada</option>
                      <option value="sawtooth">Diente</option>
                      <option value="triangle">Triangular</option>
                    </select>
                  </div>
                  <button
                    onClick={() => update(osc.id, { transition: { ...osc.transition!, start: { frequency: osc.frequency, volume: osc.volume, panX: osc.panX, panY: osc.panY, panZ: osc.panZ, type: osc.type } } })}
                    className="w-full text-[9px] font-bold tracking-widest uppercase text-cyan-400 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-400 rounded-xl py-2 mt-4 transition-all shadow-[0_0_10px_rgba(34,211,238,0.1)] hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] cursor-pointer"
                  >
                    Usar Actual
                  </button>
                </div>

                {/* End Variant */}
                <div className="space-y-4 bg-black/50 p-5 rounded-2xl border border-purple-500/20 shadow-[inset_0_0_20px_rgba(0,0,0,0.5),0_0_15px_rgba(168,85,247,0.1)] relative overflow-hidden group/variant">
                  <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent opacity-0 group-hover/variant:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                  <h5 className="text-[10px] text-purple-300 uppercase font-black tracking-widest text-center border-b border-purple-500/20 pb-3 mb-4 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]">
                    Variante B (Fin)
                  </h5>

                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    <span>Freq</span>
                    <input
                      type="number"
                      value={osc.transition.end.frequency}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, end: { ...osc.transition!.end, frequency: Number(e.target.value) } } })}
                      className="w-20 bg-black/60 text-purple-200 text-right border border-purple-500/30 rounded-lg px-2 py-1.5 focus:border-purple-400 focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] outline-none transition-all shadow-[inset_0_0_5px_rgba(0,0,0,0.5)]"
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider gap-4">
                    <span>Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={osc.transition.end.volume}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, end: { ...osc.transition!.end, volume: Number(e.target.value) } } })}
                      className="flex-1 h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer border border-white/5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.8)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-purple-200"
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider gap-4">
                    <span>Pan X</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.1"
                      value={osc.transition.end.panX}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, end: { ...osc.transition!.end, panX: Number(e.target.value) } } })}
                      className="flex-1 h-1.5 bg-black/60 rounded-full appearance-none cursor-pointer border border-white/5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.8)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-purple-200"
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    <span>Onda</span>
                    <select
                      value={osc.transition.end.type}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, end: { ...osc.transition!.end, type: e.target.value as WaveType } } })}
                      className="bg-black/60 text-purple-200 text-right border border-purple-500/30 rounded-lg px-2 py-1.5 focus:border-purple-400 focus:shadow-[0_0_15px_rgba(168,85,247,0.4)] outline-none uppercase text-[9px] cursor-pointer shadow-[inset_0_0_5px_rgba(0,0,0,0.5)] transition-all"
                    >
                      <option value="sine">Senoidal</option>
                      <option value="square">Cuadrada</option>
                      <option value="sawtooth">Diente</option>
                      <option value="triangle">Triangular</option>
                    </select>
                  </div>
                  <button
                    onClick={() => update(osc.id, { transition: { ...osc.transition!, end: { frequency: osc.frequency, volume: osc.volume, panX: osc.panX, panY: osc.panY, panZ: osc.panZ, type: osc.type } } })}
                    className="w-full text-[9px] font-bold tracking-widest uppercase text-purple-400 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 hover:border-purple-400 rounded-xl py-2 mt-4 transition-all shadow-[0_0_10px_rgba(168,85,247,0.1)] hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] cursor-pointer"
                  >
                    Usar Actual
                  </button>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-black/40 p-5 rounded-2xl border border-white/10 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none"></div>

                <button
                  onClick={() => update(osc.id, { transition: { ...osc.transition!, isPlaying: !osc.transition!.isPlaying } })}
                  className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 flex-shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.3)] relative z-10 cursor-pointer ${osc.transition.isPlaying ? 'bg-cyan-500 text-black border-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.6),inset_0_0_10px_rgba(255,255,255,0.5)] scale-105' : 'bg-black/60 text-cyan-400 border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-950/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]'}`}
                >
                  <Icon name={osc.transition.isPlaying ? 'Pause' : 'Play'} size={24} className={osc.transition.isPlaying ? '' : 'ml-1'} />
                </button>

                <div className="flex-1 w-full space-y-4 relative z-10">
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    <span>Duración (s)</span>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={osc.transition.duration}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, duration: Math.max(0.1, Number(e.target.value)) } })}
                      className="w-20 bg-black/60 text-cyan-200 text-right border border-cyan-500/30 rounded-lg px-2 py-1.5 focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(34,211,238,0.4)] outline-none transition-all shadow-[inset_0_0_5px_rgba(0,0,0,0.5)]"
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    <span>Loops</span>
                    <select
                      value={osc.transition.loopCount === 'infinite' ? 'infinite' : osc.transition.loopCount}
                      onChange={(e) => update(osc.id, { transition: { ...osc.transition!, loopCount: e.target.value === 'infinite' ? 'infinite' : Number(e.target.value) } })}
                      className="w-20 bg-black/60 text-cyan-200 text-right border border-cyan-500/30 rounded-lg px-2 py-1.5 focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(34,211,238,0.4)] outline-none transition-all cursor-pointer shadow-[inset_0_0_5px_rgba(0,0,0,0.5)]"
                    >
                      <option value="infinite">Infinito</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                    </select>
                  </div>

                  <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden relative border border-white/5 shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]">
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 transition-all duration-75 shadow-[0_0_15px_rgba(168,85,247,0.8)]"
                      style={{ width: `${osc.transition.progress * 100}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                    <span className="bg-black/40 px-2 py-1 rounded border border-white/5">
                      {osc.transition.loopCount === 'infinite' ? '∞' : `Loop ${osc.transition.currentLoop} / ${osc.transition.loopCount}`}
                    </span>
                    <span className="text-cyan-400/80 bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
                      Total: {osc.transition.loopCount === 'infinite' ? '∞' : `${(osc.transition.duration * (osc.transition.loopCount as number)).toFixed(1)}s`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OscillatorControls;
