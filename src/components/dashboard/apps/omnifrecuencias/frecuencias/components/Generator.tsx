'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAudio } from '../hooks/useAudio';
import { useFileSystem } from '../hooks/useFileSystem';
import { PresetContent } from '../types';
import OscillatorControls from './OscillatorControls';
import Visualizer, { VisualizerSource } from './Visualizer';
import Icon from './Icon';
import FileExplorer from './FileExplorer';

interface Props {
  audio: ReturnType<typeof useAudio>;
}

// Helper to get brainwave name
const getWaveName = (hz: number) => {
  if (hz < 0.5) return 'Epsilon';
  if (hz < 4) return 'Delta';
  if (hz < 8) return 'Theta';
  if (hz < 12) return 'Alfa';
  if (hz < 30) return 'Beta';
  if (hz < 100) return 'Gamma';
  return 'Lambda';
};

interface ResonanceResult {
  id: string;
  type: 'binaural' | 'beat';
  hz: string;
  waveName: string;
  sourceA: string;
  sourceB: string;
}

const Generator: React.FC<Props> = ({ audio }) => {
  const { oscillators, addOscillator, removeOscillator, updateOscillator, getCombinedAnalyser, getOscillatorAnalyser } =
    audio;

  // File System Integration (Biblioteca soberana del OS)
  const fs = useFileSystem();
  const [showExplorer, setShowExplorer] = useState(false);
  const [explorerMode, setExplorerMode] = useState<'save' | 'load'>('save');

  // Logic to remove all and load new or mix
  const loadPreset = (preset: PresetContent, mix: boolean = false) => {
    if (!mix) {
      // Clear existing
      oscillators.forEach((osc) => removeOscillator(osc.id));
    }
    // Add new (small timeout to ensure clean state or just add direct)
    setTimeout(
      () => {
        preset.oscillators.forEach((osc) => {
          // We strip ID to generate new ones to avoid collision or stale refs
          // But we keep properties
          const { id: _id, ...props } = osc;
          void _id;
          addOscillator(props);
        });
      },
      mix ? 0 : 50,
    );
  };

  const handleExport = () => {
    if (typeof window === 'undefined') return;
    const data = fs.exportSystem();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omni_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        const success = fs.importSystem(ev.target.result as string);
        if (success) toast.success('Backup importado correctamente. Los presets se han añadido a tu Biblioteca.');
        else toast.error('Error al importar el archivo.');
      }
    };
    reader.readAsText(file);
  };

  // Advanced Resonance Calculation (Combinatorial Analysis)
  const resonanceResults = useMemo(() => {
    // Only verify non-independent waves for resonance calculation
    const active = oscillators.filter((o) => o.isPlaying && !o.isIndependent);
    const results: ResonanceResult[] = [];

    // Compare every oscillator with every other oscillator
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const oscA = active[i];
        const oscB = active[j];

        const diff = Math.abs(oscA.frequency - oscB.frequency);

        if (diff > 0.1 && diff < 120) {
          const waveName = getWaveName(diff);
          const hzFormatted = diff.toFixed(2);

          // 1. Mono Beat Check
          results.push({
            id: `beat-${oscA.id}-${oscB.id}`,
            type: 'beat',
            hz: hzFormatted,
            waveName,
            sourceA: oscA.name || 'Freq A',
            sourceB: oscB.name || 'Freq B',
          });

          // 2. Stereo Binaural Check
          const isOpposite =
            (oscA.panX <= -0.1 && oscB.panX >= 0.1) || (oscA.panX >= 0.1 && oscB.panX <= -0.1);

          if (isOpposite) {
            results.push({
              id: `bin-${oscA.id}-${oscB.id}`,
              type: 'binaural',
              hz: hzFormatted,
              waveName,
              sourceA: oscA.name || 'Freq A',
              sourceB: oscB.name || 'Freq B',
            });
          }
        }
      }
    }

    return results;
  }, [oscillators]);

  // Construct Visualizer Sources
  const visualizerSources: VisualizerSource[] = useMemo(() => {
    const sources: VisualizerSource[] = [];

    // 1. Background: Combined Bus
    const combined = getCombinedAnalyser();
    if (combined) {
      sources.push({ analyser: combined, color: '#475569' });
    }

    // 2. Overlays: Independent Waves
    oscillators.forEach((osc) => {
      if (osc.isPlaying && osc.isIndependent) {
        const analyser = getOscillatorAnalyser(osc.id);
        if (analyser) {
          sources.push({ analyser, color: osc.color });
        }
      }
    });

    if (sources.length === 1 && sources[0].color === '#475569') {
      sources[0].color = '#22d3ee';
    }

    return sources;
  }, [oscillators, getCombinedAnalyser, getOscillatorAnalyser]);

  return (
    <div className="animate-fade-in space-y-6 pb-24">
      {/* --- Toolbar --- */}
      <div className="flex flex-col items-center justify-center gap-6 bg-black/60 border border-white/10 p-6 rounded-3xl backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none"></div>
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>

        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 sm:gap-5 relative z-10 w-full">
          <button
            onClick={audio.toggleMasterPlay}
            className={`group relative overflow-hidden flex items-center justify-center w-full sm:w-16 h-16 rounded-2xl transition-all duration-500 border-2 shadow-[0_0_20px_rgba(0,0,0,0.5),inset_0_0_10px_rgba(255,255,255,0.1)] hover:-translate-y-1 cursor-pointer ${audio.isPlaying ? 'bg-cyan-500 text-black border-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.6),inset_0_0_15px_rgba(0,0,0,0.2)] scale-105' : 'bg-black/80 text-cyan-400 border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-950/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]'}`}
            title={audio.isPlaying ? 'Pausar Todo' : 'Reproducir Todo'}
          >
            <Icon name={audio.isPlaying ? 'Pause' : 'Play'} size={32} className={audio.isPlaying ? '' : 'ml-1'} />
            <span className="sm:hidden ml-3 font-bold uppercase tracking-widest">
              {audio.isPlaying ? 'Pausar Todo' : 'Reproducir Todo'}
            </span>
          </button>

          <button
            onClick={() => {
              setExplorerMode('save');
              setShowExplorer(true);
            }}
            className="group relative overflow-hidden flex items-center justify-center gap-3 px-8 py-4 w-full sm:w-auto bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-200 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all duration-500 border-2 border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.1),inset_0_0_10px_rgba(34,211,238,0.1)] hover:shadow-[0_0_30px_rgba(34,211,238,0.3),inset_0_0_15px_rgba(34,211,238,0.2)] hover:-translate-y-1 hover:border-cyan-400/50 cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 rounded-2xl"></div>
            <Icon name="Save" size={20} className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            <span className="whitespace-nowrap">Guardar Preset</span>
          </button>
          <button
            onClick={() => {
              setExplorerMode('load');
              setShowExplorer(true);
            }}
            className="group relative overflow-hidden flex items-center justify-center gap-3 px-8 py-4 w-full sm:w-auto bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all duration-500 border-2 border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.1),inset_0_0_10px_rgba(168,85,247,0.1)] hover:shadow-[0_0_30px_rgba(168,85,247,0.3),inset_0_0_15px_rgba(168,85,247,0.2)] hover:-translate-y-1 hover:border-purple-400/50 cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-400/0 via-purple-400/10 to-purple-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 rounded-2xl"></div>
            <Icon name="Folder" size={20} className="drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
            <span className="whitespace-nowrap">Cargar Preset</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-6 pt-5 border-t border-white/10 w-full max-w-md relative z-10">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-xl transition-colors border border-transparent hover:border-cyan-500/20 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] cursor-pointer"
            title="Exportar Backup"
          >
            <Icon name="Download" size={14} className="text-cyan-500/70" /> Exportar
          </button>
          <label className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-purple-500/20 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]" title="Importar Backup">
            <Icon name="Upload" size={14} className="text-purple-500/70" /> Importar
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {/* --- File Explorer Modal --- */}
      {showExplorer && (
        <FileExplorer
          mode={explorerMode}
          fs={fs}
          onClose={() => setShowExplorer(false)}
          onFileSelect={loadPreset}
          currentConfig={{
            oscillators,
            dateCreated: Date.now(),
            description: 'Configuración generada',
          }}
        />
      )}

      {/* Master Visualizer & Info */}
      <div className="relative p-6 rounded-3xl border border-white/10 bg-black/60 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none"></div>
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>

        <div className="flex flex-col lg:flex-row items-start lg:items-stretch justify-between mb-6 gap-6 border-b border-white/10 pb-5 relative z-10">
          {/* Header Title */}
          <div className="flex flex-col gap-2 min-w-[200px]">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 shadow-[inset_0_0_15px_rgba(34,211,238,0.2),0_0_10px_rgba(34,211,238,0.1)] relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <Icon name="Activity" size={22} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] relative z-10" />
              </div>
              <h2 className="text-2xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-purple-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] tracking-wide">
                Resonancia Maestra
              </h2>
            </div>
            <div className="text-[10px] text-cyan-200/80 font-bold uppercase tracking-widest flex items-center h-8 ml-14 bg-cyan-950/30 px-3 rounded-lg border border-cyan-500/20 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] w-fit">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] mr-2 animate-pulse"></span>
              {oscillators.filter((o) => o.isPlaying && !o.isIndependent).length} Fuentes en Mezcla
            </div>
          </div>

          {/* Results Display */}
          <div className="flex-1 w-full bg-black/60 rounded-2xl border border-white/10 p-4 max-h-40 overflow-y-auto shadow-[inset_0_0_30px_rgba(0,0,0,0.8)] custom-scrollbar relative">
            {resonanceResults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 font-bold uppercase tracking-widest italic opacity-70 gap-2">
                <Icon name="Waves" size={24} className="opacity-50" />
                <span>No se detectan interacciones resonantes activas.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                {resonanceResults.map((res) => (
                  <div
                    key={res.id}
                    className={`
                      flex items-center justify-between px-4 py-3 rounded-xl border text-xs relative overflow-hidden group
                      ${res.type === 'binaural'
                        ? 'bg-purple-950/40 border-purple-500/30 shadow-[inset_0_0_15px_rgba(168,85,247,0.2)] hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:border-purple-400/50'
                        : 'bg-amber-950/40 border-amber-500/30 shadow-[inset_0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:border-amber-400/50'}
                      transition-all duration-300 hover:-translate-y-0.5
                    `}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-r ${res.type === 'binaural' ? 'from-purple-500/0 via-purple-400/10 to-purple-500/0' : 'from-amber-500/0 via-amber-400/10 to-amber-500/0'} translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700`}></div>
                    <div className="flex items-center gap-4 relative z-10">
                      <div className={`p-2 rounded-lg ${res.type === 'binaural' ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                        <Icon name={res.type === 'binaural' ? 'Brain' : 'Zap'} size={18} className={`${res.type === 'binaural' ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'}`} />
                      </div>
                      <div className="flex flex-col">
                        <span className={`font-black uppercase tracking-[0.2em] text-[10px] ${res.type === 'binaural' ? 'text-purple-300 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]' : 'text-amber-300 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]'}`}>
                          {res.type === 'binaural' ? 'Binaural' : 'Batido'}
                        </span>
                        <span className="text-[10px] text-slate-400 opacity-90 font-bold tracking-wider mt-0.5">
                          {res.sourceA} <span className="text-slate-600 mx-1">+</span> {res.sourceB}
                        </span>
                      </div>
                    </div>
                    <div className="text-right relative z-10">
                      <div className="font-display font-black text-white text-lg drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] tracking-wider">
                        {res.hz} <span className="text-xs text-slate-400 font-bold">Hz</span>
                      </div>
                      <div className={`text-[9px] font-bold uppercase tracking-[0.2em] mt-0.5 ${res.type === 'binaural' ? 'text-purple-200/90' : 'text-amber-200/90'}`}>
                        {res.waveName}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="h-80 w-full bg-black/80 rounded-2xl border border-white/10 overflow-hidden relative shadow-[inset_0_0_40px_rgba(0,0,0,0.9),0_0_20px_rgba(0,0,0,0.5)] z-10 group/viz">
          <Visualizer sources={visualizerSources} height={320} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5 opacity-0 group-hover/viz:opacity-100 transition-opacity duration-1000 pointer-events-none"></div>

          <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none z-20">
            <div className="flex items-center gap-3 px-4 py-2 bg-black/60 rounded-xl text-[10px] text-slate-300 border border-white/10 backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.8)]">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-500 shadow-[0_0_8px_rgba(100,116,139,0.8)] border border-slate-400"></div>
              <span className="font-bold uppercase tracking-widest">Onda Combinada</span>
            </div>
            {oscillators
              .filter((o) => o.isPlaying && o.isIndependent)
              .map((osc) => (
                <div key={osc.id} className="flex items-center gap-3 px-4 py-2 bg-black/60 rounded-xl text-[10px] text-white border border-white/10 backdrop-blur-md shadow-[0_0_15px_rgba(0,0,0,0.8)]">
                  <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor] border border-white/50" style={{ background: osc.color, color: osc.color }}></div>
                  <span className="font-bold uppercase tracking-widest drop-shadow-[0_0_5px_currentColor]" style={{ color: osc.color }}>
                    {osc.name}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Global Controls */}
      {oscillators.length > 0 && (
        <div className="bg-black/40 border border-white/10 p-5 rounded-2xl backdrop-blur-xl flex flex-wrap items-center justify-center gap-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none"></div>

          <div className="flex items-center gap-3 text-sm text-cyan-200 font-bold uppercase tracking-widest relative z-10">
            <Icon name="Settings" size={18} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            Ajustes Globales
          </div>

          <div className="flex items-center gap-3 relative z-10 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Volumen</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              defaultValue="0.5"
              onChange={(e) => audio.setGlobalVolume(parseFloat(e.target.value))}
              className="w-32 h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.8)]"
            />
          </div>

          <button
            onClick={() => audio.centerAllPositions()}
            className="relative group flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-2.5 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 rounded-xl text-slate-300 hover:text-cyan-100 transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.2)] hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] z-10 cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 rounded-xl"></div>
            Centrar Posiciones
          </button>

          <div className="flex items-center gap-3 relative z-10 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Onda</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  audio.setGlobalWaveType(e.target.value as 'sine' | 'square' | 'sawtooth' | 'triangle');
                  e.target.value = '';
                }
              }}
              className="bg-black/50 border border-white/10 rounded-lg text-xs text-cyan-200 font-bold uppercase tracking-wider px-3 py-1.5 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="">(Cambiar todas)</option>
              <option value="sine">Senoidal</option>
              <option value="square">Cuadrada</option>
              <option value="sawtooth">Diente de sierra</option>
              <option value="triangle">Triangular</option>
            </select>
          </div>
        </div>
      )}

      {/* Oscillator List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {oscillators.map((osc) => (
          <OscillatorControls
            key={osc.id}
            osc={osc}
            update={updateOscillator}
            remove={removeOscillator}
            analyser={getOscillatorAnalyser(osc.id)}
          />
        ))}

        <button
          onClick={() => addOscillator()}
          className="group relative min-h-[400px] rounded-2xl border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 bg-black/20 hover:bg-cyan-950/30 flex flex-col items-center justify-center gap-6 transition-all duration-500 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.3)] hover:shadow-[0_0_50px_rgba(34,211,238,0.2)] cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/0 via-cyan-500/5 to-cyan-500/0 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-1000"></div>

          <div className="relative w-24 h-24 rounded-full bg-cyan-950/50 border border-cyan-500/30 group-hover:border-cyan-400 flex items-center justify-center transition-all duration-500 group-hover:scale-110 shadow-[0_0_30px_rgba(34,211,238,0.1)] group-hover:shadow-[0_0_50px_rgba(34,211,238,0.4)]">
            <div className="absolute inset-0 rounded-full border border-cyan-400/50 animate-ping opacity-20 group-hover:opacity-100"></div>
            <Icon name="Zap" className="text-cyan-500/50 group-hover:text-cyan-300 w-10 h-10 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)] transition-colors duration-500" />
          </div>

          <div className="text-center relative z-10">
            <h3 className="text-xl font-display font-black text-cyan-500/50 group-hover:text-cyan-200 tracking-widest uppercase mb-2 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] transition-colors duration-500">
              Añadir Frecuencia
            </h3>
            <p className="text-xs text-slate-500 group-hover:text-cyan-400/70 uppercase tracking-widest font-bold transition-colors duration-500">
              Nueva capa armónica
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Generator;
