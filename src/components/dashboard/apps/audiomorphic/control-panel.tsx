"use client";

/**
 * ControlPanel de Audiomorphic — PORT NATIVO (Adenda 68 · E)
 * ============================================================================
 * Portado de `components/ControlPanel.tsx` de la repo del propio usuario
 * (github.com/StarSeedSystem/Audiomorphic-AR-app). Es React + lucide + CSS puro:
 * se porta tal cual, sin dependencias nuevas.
 *
 * DIFERENCIAS con el original (todas hacia MÁS libertad, ninguna hacia menos):
 *  · NO hay tour de bienvenida, NI login, NI planes: todos los controles están
 *    disponibles desde el primer segundo. (En el original tampoco había ninguna
 *    función realmente bloqueada por plan — los "tiers" eran solo UI —, pero el
 *    tour SÍ salía siempre a quien no tuviera "sesión".)
 *  · La sección VR/AR no se porta (su motor 3D exige React 19 + R3F v9; el OS va
 *    con React 18 + R3F v8). En su lugar hay una tarjeta HONESTA que lo explica
 *    y enlaza a la app original y a los instaladores nativos.
 *
 * Autoría original: Audiomorphic / StarSeedSystem (Alex Bordón Garrigós).
 */

import React, { useState, useEffect } from 'react';
import { VisualizerParams, SacredGeometryMode, SacredGeometrySettings } from "@/lib/audiomorphic/types";
import { Activity, Zap, Maximize, Minimize, RotateCw, Palette, Target, Music, BrainCircuit, Wind, Droplets, Waves, Shuffle, Sprout, Glasses, Download } from 'lucide-react';

interface ControlPanelProps {
  params: VisualizerParams;
  setParams: React.Dispatch<React.SetStateAction<VisualizerParams>>;
  audioActive: boolean;
  toggleAudio: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ params, setParams, audioActive, toggleAudio }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedSgEditMode, setSelectedSgEditMode] = useState<SacredGeometryMode>('flowerOfLife');

  useEffect(() => {
    const handleFullScreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullScreenChange);

    // Electron-specific listener
    if ((window as any).electron) {
      (window as any).electron.onFullScreenChange((isFs: boolean) => {
        setIsFullscreen(isFs);
      });
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, []);

  const toggleFullScreen = () => {
    // If in Electron, use the native bridge
    if ((window as any).electron) {
      (window as any).electron.toggleFullScreen();
      return;
    }

    // Standard browser full-screen
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };
  
  const handleChange = (key: keyof VisualizerParams, value: number | boolean | string | string[]) => {
    if (typeof value === 'number' && isNaN(value)) return;
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const centerSpiral = () => setParams(prev => ({ ...prev, z0_r: 0, z0_i: 0 }));

  const renderControl = (
    label: string, 
    key: keyof VisualizerParams, 
    min: number, 
    max: number, 
    step: number,
    icon?: React.ReactNode,
    disabled: boolean = false
  ) => (
    <div className={`mb-5 transition-all duration-500 ${disabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex justify-between items-end mb-2">
        <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 font-semibold">
          {icon && <span className="text-cyan-300 drop-shadow-[0_0_5px_rgba(0,242,254,0.8)]">{icon}</span>}
          {label}
        </label>
        <input
          type="number"
          step="any"
          // `renderControl` SIEMPRE se usa con claves numéricas. El original hacía
          // `params[key] as number` sobre la unión entera (colaba por los campos VR,
          // que eran números); sin ellos, TS lo rechaza con razón. Guarda explícita.
          value={typeof params[key] === 'number' ? Number(params[key]).toFixed(3) : ''}
          onChange={(e) => handleChange(key, parseFloat(e.target.value))}
          disabled={disabled}
          className="font-mono text-xs text-cyan-200 bg-black/30 border border-white/10 rounded-lg px-2 py-1 focus:border-cyan-400 outline-none text-right w-20 hover:border-white/30 transition-all shadow-inner"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={params[key] as number}
        onChange={(e) => handleChange(key, parseFloat(e.target.value))}
        disabled={disabled}
        className="liquid-slider"
      />
    </div>
  );

  const renderSgControl = (
    label: string, 
    key: keyof SacredGeometrySettings, 
    min: number, 
    max: number, 
    step: number
  ) => {
    const value = params.sgSettings[selectedSgEditMode][key];
    return (
      <div className="mb-5 transition-all duration-500 opacity-100">
        <div className="flex justify-between items-end mb-2">
          <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 font-semibold">
            {label}
          </label>
          <input
            type="number"
            step="any"
            value={Number(value).toFixed(3)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (isNaN(val)) return;
              setParams(prev => ({
                ...prev,
                sgSettings: {
                  ...prev.sgSettings,
                  [selectedSgEditMode]: {
                    ...prev.sgSettings[selectedSgEditMode],
                    [key]: val
                  }
                }
              }));
            }}
            className="font-mono text-xs text-emerald-200 bg-black/30 border border-white/10 rounded-lg px-2 py-1 focus:border-emerald-400 outline-none text-right w-20 hover:border-white/30 transition-all shadow-inner"
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setParams(prev => ({
              ...prev,
              sgSettings: {
                ...prev.sgSettings,
                [selectedSgEditMode]: {
                  ...prev.sgSettings[selectedSgEditMode],
                  [key]: val
                }
              }
            }));
          }}
          className="liquid-slider liquid-slider-emerald"
        />
      </div>
    );
  };

  return (
    <>
      <style>{`
        .liquid-panel {
          background: rgba(15, 15, 25, 0.4);
          backdrop-filter: blur(40px) saturate(200%);
          -webkit-backdrop-filter: blur(40px) saturate(200%);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 
            0 30px 80px rgba(0, 0, 0, 0.6),
            inset 0 1px 2px rgba(255, 255, 255, 0.4),
            inset 0 -10px 30px rgba(255, 255, 255, 0.05),
            inset 0 20px 40px rgba(255, 255, 255, 0.03);
          border-radius: 40px;
          overflow: hidden;
        }

        .liquid-bubble {
          background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%);
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 
            0 8px 32px 0 rgba(0, 0, 0, 0.3),
            inset 0 2px 3px rgba(255, 255, 255, 0.3),
            inset 0 -2px 5px rgba(0, 0, 0, 0.3);
          border-radius: 9999px;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
        }

        .liquid-bubble::before {
          content: '';
          position: absolute;
          top: 2%; left: 15%; right: 15%; height: 35%;
          background: linear-gradient(to bottom, rgba(255,255,255,0.5), transparent);
          border-radius: 50%;
          pointer-events: none;
        }

        .liquid-bubble:hover {
          transform: translateY(-3px) scale(1.03);
          box-shadow: 
            0 15px 40px 0 rgba(0, 0, 0, 0.4),
            inset 0 2px 4px rgba(255, 255, 255, 0.5),
            0 0 25px rgba(0, 242, 254, 0.4);
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 100%);
        }

        .liquid-bubble:active {
          transform: translateY(1px) scale(0.97);
          box-shadow: 
            0 4px 15px 0 rgba(0, 0, 0, 0.3),
            inset 0 4px 8px rgba(0, 0, 0, 0.5);
        }

        .liquid-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 14px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.4);
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.6), 0 1px 1px rgba(255,255,255,0.15);
          outline: none;
          position: relative;
        }

        .liquid-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(100,200,255,0.8));
          box-shadow: 
            0 4px 12px rgba(0,0,0,0.5), 
            inset 0 2px 5px rgba(255,255,255,1),
            inset 0 -2px 5px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          border: 1px solid rgba(255,255,255,0.6);
        }

        .liquid-slider::-webkit-slider-thumb:hover {
          transform: scale(1.25);
          box-shadow: 
            0 8px 20px rgba(0,242,254,0.6), 
            inset 0 2px 5px rgba(255,255,255,1);
        }

        .liquid-slider-emerald::-webkit-slider-thumb {
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(16,185,129,0.8));
        }
        .liquid-slider-emerald::-webkit-slider-thumb:hover {
          box-shadow: 0 8px 20px rgba(16,185,129,0.6), inset 0 2px 5px rgba(255,255,255,1);
        }

        .neon-text {
          background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(0, 242, 254, 0.8);
        }

        .neon-text-pink {
          background: linear-gradient(135deg, #ff0844 0%, #ffb199 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(255, 8, 68, 0.8);
        }

        .neon-text-emerald {
          background: linear-gradient(135deg, #0ba360 0%, #3cba92 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 20px rgba(11, 163, 96, 0.8);
        }

        .liquid-switch {
          width: 56px;
          height: 30px;
          border-radius: 30px;
          background: rgba(0,0,0,0.5);
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.7), 0 1px 2px rgba(255,255,255,0.15);
          position: relative;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.15);
          transition: all 0.4s ease;
        }

        .liquid-switch-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,1), rgba(200,200,200,0.6));
          box-shadow: 0 2px 6px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,1);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .liquid-switch.active {
          background: rgba(0, 242, 254, 0.25);
          border-color: rgba(0, 242, 254, 0.5);
        }

        .liquid-switch.active .liquid-switch-thumb {
          left: 28px;
          background: radial-gradient(circle at 30% 30%, #fff, #00f2fe);
          box-shadow: 0 0 20px #00f2fe, inset 0 2px 3px rgba(255,255,255,1);
        }

        .liquid-switch.active-emerald {
          background: rgba(16, 185, 129, 0.25);
          border-color: rgba(16, 185, 129, 0.5);
        }
        .liquid-switch.active-emerald .liquid-switch-thumb {
          left: 28px;
          background: radial-gradient(circle at 30% 30%, #fff, #10b981);
          box-shadow: 0 0 20px #10b981, inset 0 2px 3px rgba(255,255,255,1);
        }

        .liquid-switch.active-purple {
          background: rgba(168, 85, 247, 0.25);
          border-color: rgba(168, 85, 247, 0.5);
        }
        .liquid-switch.active-purple .liquid-switch-thumb {
          left: 28px;
          background: radial-gradient(circle at 30% 30%, #fff, #a855f7);
          box-shadow: 0 0 20px #a855f7, inset 0 2px 3px rgba(255,255,255,1);
        }

        .liquid-section {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 32px;
          box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.03), 0 15px 35px rgba(0,0,0,0.3);
          position: relative;
          overflow: hidden;
          padding: 1.5rem;
        }

        .liquid-section::before {
          content: '';
          position: absolute;
          top: -50%; left: -50%; width: 200%; height: 200%;
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.08), transparent 50%);
          pointer-events: none;
        }

        .liquid-scroll::-webkit-scrollbar {
          width: 10px;
        }
        .liquid-scroll::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.3);
          border-radius: 10px;
          margin: 10px 0;
        }
        .liquid-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.25);
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.15);
        }
        .liquid-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.4);
        }
      `}</style>

      <div className="liquid-panel w-full h-full flex flex-col relative z-10">
        <div className="px-8 py-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div>
            <h1 className="text-3xl font-bold neon-text flex items-center gap-3">
              <Activity className="w-8 h-8 text-cyan-300 drop-shadow-[0_0_10px_rgba(0,242,254,0.8)]" />
              AudioMorphic
            </h1>
            <p className="text-sm text-cyan-100/70 mt-1 font-medium tracking-wide">Recurrencia Compleja Sonora</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={toggleAudio}
              className={`liquid-bubble px-6 py-3 font-bold flex items-center gap-2 ${
                audioActive ? 'text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'text-cyan-300'
              }`}
            >
              {audioActive ? 'Detener Micrófono' : 'Iniciar Micrófono'}
            </button>
            <button
              onClick={toggleFullScreen}
              className="liquid-bubble px-6 py-3 font-bold flex items-center gap-2 text-purple-300"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              {isFullscreen ? 'Salir' : 'Pantalla Completa'}
            </button>
            <a 
              href="https://github.com/StarSeedSystem/Audiomorphic-AR-app/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-bubble px-6 py-3 font-bold flex items-center gap-2 text-emerald-300"
            >
              <Download className="w-5 h-5" />
              Instalar
            </a>
          </div>
        </div>

        <div className="p-8 overflow-y-auto flex-1 liquid-scroll">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Auto Pilot Section */}
            <div className="liquid-section">
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-lg font-bold neon-text flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5" /> 
                  Piloto Automático
                </h3>
                <div 
                   onClick={() => handleChange('autoPilot', !params.autoPilot)}
                   className={`liquid-switch ${params.autoPilot ? 'active' : ''}`}
                 >
                   <div className="liquid-switch-thumb"></div>
                 </div>
               </div>
               
               {params.autoPilot && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                      
                      {/* Mode Selector */}
                      <div className="flex bg-black/40 p-1.5 rounded-2xl mb-6 border border-white/10 shadow-inner">
                        <button
                          onClick={() => handleChange('autoPilotMode', 'drift')}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs uppercase font-bold rounded-xl transition-all ${
                            params.autoPilotMode === 'drift' 
                              ? 'liquid-bubble text-cyan-300' 
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          }`}
                        >
                          <Shuffle size={14} /> Deriva
                        </button>
                        <button
                          onClick={() => handleChange('autoPilotMode', 'harmonic')}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs uppercase font-bold rounded-xl transition-all ${
                            params.autoPilotMode === 'harmonic' 
                              ? 'liquid-bubble text-cyan-300' 
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          }`}
                        >
                          <Waves size={14} /> Armónico
                        </button>
                        <button
                          onClick={() => {
                            handleChange('autoPilotMode', 'genesis');
                            handleChange('sgResonanceModes', ['goldenSpiral', 'flowerOfLife', 'quantumWave', 'torus']);
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs uppercase font-bold rounded-xl transition-all ${
                            params.autoPilotMode === 'genesis' 
                              ? 'liquid-bubble text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          }`}
                        >
                          <Sprout size={14} /> Génesis
                        </button>
                      </div>

                      {/* Genesis/Math Display Info */}
                      {(params.autoPilotMode === 'genesis' || params.autoPilotMode === 'harmonic') && params.geometryData && (
                         <div className="mb-6 text-center p-4 bg-black/30 rounded-2xl border border-white/10 shadow-inner space-y-3">
                            <div className="border-b border-white/10 pb-3">
                              <span className="text-xs text-gray-400 uppercase tracking-widest block mb-1">Geometría Activa</span>
                              <span className="text-lg font-serif text-white font-bold block drop-shadow-md">{params.geometryData.name}</span>
                              <span className={`text-xs uppercase font-bold tracking-wider px-3 py-1 rounded-full inline-block mt-2 shadow-sm ${
                                  params.geometryData.regime === 'primary' 
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                    : params.geometryData.regime === 'reciprocal'
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              }`}>
                                  Régimen {params.geometryData.regime === 'primary' ? 'Primario' : params.geometryData.regime === 'reciprocal' ? 'Recíproco' : 'Vacío'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                <div className="bg-black/40 p-2 rounded-xl border border-white/5">
                                    <div className="text-gray-400 mb-1">α (Estructura)</div>
                                    <div className="text-cyan-300 font-bold text-sm drop-shadow-[0_0_5px_rgba(0,242,254,0.5)]">{params.geometryData.alpha.toFixed(1)}</div>
                                </div>
                                <div className="bg-black/40 p-2 rounded-xl border border-white/5">
                                    <div className="text-gray-400 mb-1">β (Potencial)</div>
                                    <div className="text-pink-300 font-bold text-sm drop-shadow-[0_0_5px_rgba(255,8,68,0.5)]">{params.geometryData.beta.toFixed(2)}</div>
                                </div>
                            </div>
                         </div>
                      )}

                      {renderControl("Viscosidad", "autoViscosity", 0.01, 0.999, 0.001, <Droplets className="w-4 h-4"/>)}
                      {params.autoPilotMode === 'drift' && renderControl("Velocidad Deriva", "autoSpeed", 0.01, 1.0, 0.01, <Wind className="w-4 h-4"/>)}
                  </div>
               )}
            </div>

            {/* Sacred Geometry Section */}
            {params.autoPilot && params.autoPilotMode === 'genesis' && (
              <div className="liquid-section border-emerald-500/30 shadow-[inset_0_0_30px_rgba(16,185,129,0.05)]">
                <h3 className="text-lg font-bold neon-text-emerald mb-6 flex items-center gap-2">
                  <Sprout className="w-5 h-5" /> Geometría Sagrada
                </h3>
                
                <div className="mb-6">
                  <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 mb-3 font-semibold">
                    Estilos de Resonancia
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 shadow-inner">
                    {[
                      { id: 'goldenSpiral', label: 'Espiral Áurea' },
                      { id: 'flowerOfLife', label: 'Flor de la Vida' },
                      { id: 'quantumWave', label: 'Onda Cuántica' },
                      { id: 'torus', label: 'Toroide' }
                    ].map(mode => {
                      const isActive = params.sgResonanceModes?.includes(mode.id as any);
                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            const currentModes = params.sgResonanceModes || [];
                            let newModes;
                            if (isActive) {
                              newModes = currentModes.filter(m => m !== mode.id);
                              if (newModes.length === 0) newModes = [mode.id];
                            } else {
                              newModes = [...currentModes, mode.id];
                            }
                            handleChange('sgResonanceModes', newModes);
                          }}
                          className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                            isActive 
                              ? 'liquid-bubble text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="text-xs uppercase tracking-wider text-gray-300 flex items-center gap-2 mb-3 font-semibold">
                    Modo de Dibujo
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 shadow-inner">
                    <button
                      onClick={() => handleChange('sgDrawMode', 'layers')}
                      className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                        params.sgDrawMode === 'layers' 
                          ? 'liquid-bubble text-emerald-300' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      }`}
                    >
                      Capas Infinitas
                    </button>
                    <button
                      onClick={() => handleChange('sgDrawMode', 'nodes')}
                      className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                        params.sgDrawMode === 'nodes' 
                          ? 'liquid-bubble text-emerald-300' 
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      }`}
                    >
                      Nodos en Espiral
                    </button>
                  </div>
                </div>

                {params.sgDrawMode === 'nodes' && (
                  <div className="mb-6 flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5">
                     <label className="text-xs uppercase tracking-wider text-gray-300 font-semibold">
                        Mostrar Nodos Emanantes
                     </label>
                     <div 
                       onClick={() => handleChange('sgShowNodes', !params.sgShowNodes)}
                       className={`liquid-switch ${params.sgShowNodes ? 'active-emerald' : ''}`}
                     >
                       <div className="liquid-switch-thumb"></div>
                     </div>
                  </div>
                )}

                <div className="mb-6 flex justify-between items-center bg-emerald-900/20 p-3 rounded-2xl border border-emerald-500/30">
                   <label className="text-xs uppercase tracking-wider text-emerald-300 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">
                      Resonancia Automática
                   </label>
                   <div 
                     onClick={() => handleChange('sgAutoResonance', !params.sgAutoResonance)}
                     className={`liquid-switch ${params.sgAutoResonance ? 'active-emerald' : ''}`}
                   >
                     <div className="liquid-switch-thumb"></div>
                   </div>
                </div>

                {!params.sgAutoResonance ? (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="mb-5 mt-6">
                      <label className="text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-2 mb-3 font-semibold">
                        Ajustes Independientes
                      </label>
                      <div className="grid grid-cols-2 gap-2 bg-black/40 p-1.5 rounded-2xl border border-emerald-500/20 mb-6 shadow-inner">
                        {[
                          { id: 'goldenSpiral', label: 'Espiral Áurea' },
                          { id: 'flowerOfLife', label: 'Flor de la Vida' },
                          { id: 'quantumWave', label: 'Onda Cuántica' },
                          { id: 'torus', label: 'Toroide' }
                        ].map(mode => (
                          <button
                            key={`edit-${mode.id}`}
                            onClick={() => setSelectedSgEditMode(mode.id as SacredGeometryMode)}
                            className={`py-2.5 px-2 text-xs uppercase font-bold rounded-xl transition-all ${
                              selectedSgEditMode === mode.id 
                                ? 'liquid-bubble text-emerald-300' 
                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {renderSgControl("Complejidad (Nodos)", "complexity", 1, 100, 1)}
                    {renderSgControl("Distancia Conexión", "connectionSpan", 1, 100, 1)}
                    {renderSgControl("Escala (Tamaño)", "scale", 0.01, 5.0, 0.01)}
                    {renderSgControl("Opacidad Líneas", "lineOpacity", 0.0, 1.0, 0.01)}
                    {renderSgControl("Opacidad Fondo", "bgOpacity", 0.0, 1.0, 0.01)}
                    {renderSgControl("Grosor de Línea", "thickness", 0.01, 5.0, 0.01)}
                    {renderSgControl("Velocidad Flujo", "flowSpeed", -5.0, 5.0, 0.01)}
                    {renderSgControl("Reactividad Audio", "audioReactivity", 0.0, 10.0, 0.1)}
                  </div>
                ) : (
                  <div className="mt-6 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-2xl text-center shadow-inner">
                    <p className="text-sm text-emerald-300 italic font-medium">
                      La Resonancia Automática está controlando inteligentemente todos los parámetros geométricos en armonía con el sonido.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── VR / AR — NO PORTADO (honestidad) ─────────────────────────
                El modo VR/AR de la app original (components/VisualizerVR.tsx)
                usa @react-three/xr v6 + @react-three/postprocessing v3 + drei
                v10, que EXIGEN React 19 y @react-three/fiber v9. El OS va con
                React 18 + R3F v8: no se puede montar sin subir todo el stack.
                No se finge un botón que no funcionaría: se enlaza a la app
                original (que sí lo tiene) y a los instaladores nativos. */}
            <div className="liquid-section border-purple-500/30">
              <h3 className="text-lg font-bold neon-text text-purple-400 mb-4 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)'}}>
                <Glasses className="w-5 h-5" /> Realidad Virtual / AR
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                El visualizador 2D corre <b className="text-gray-200">nativo dentro del OS</b> (esto que ves).
                El modo <b className="text-purple-300">VR/AR</b> —estéreo, giroscopio, paso de cámara y filtros—
                todavía vive solo en la app original: su motor 3D necesita una versión de React más nueva
                que la del OS. Se dice tal cual en vez de poner un botón que no haría nada.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://audiomorphic.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liquid-bubble px-5 py-2.5 font-bold flex items-center gap-2 text-purple-300"
                >
                  <Glasses className="w-4 h-4" /> Abrir modo VR/AR
                </a>
                <a
                  href="https://github.com/StarSeedSystem/Audiomorphic-AR-app/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="liquid-bubble px-5 py-2.5 font-bold flex items-center gap-2 text-emerald-300"
                >
                  <Download className="w-4 h-4" /> App nativa (APK / DMG)
                </a>
              </div>
            </div>

            {/* Interface & Reactivity */}
            <div className="space-y-8">
              <div className="liquid-section">
                <h3 className="text-lg font-bold neon-text text-yellow-400 mb-6 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #fde047 0%, #eab308 100%)'}}>
                  <Zap className="w-5 h-5" /> Interfaz
                </h3>
                <div className="flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5">
                   <label className="text-xs uppercase tracking-wider text-gray-300 font-semibold">Mostrar Indicadores</label>
                   <div onClick={() => handleChange('showIndicators', !params.showIndicators)} className={`liquid-switch ${params.showIndicators ? 'active' : ''}`}><div className="liquid-switch-thumb"></div></div>
                </div>
              </div>

              <div className="liquid-section">
                <h3 className="text-lg font-bold neon-text text-yellow-400 mb-6 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #fde047 0%, #eab308 100%)'}}>
                  <Zap className="w-5 h-5" /> Reactividad
                </h3>
                {renderControl("Sensibilidad", "sensitivity", 0.1, 5.0, 0.1)}
                {renderControl("Espectro Freq", "freqRange", 0.1, 1.0, 0.05)}
                {renderControl("Persistencia", "trail", 0.01, 1.0, 0.01)}
              </div>
            </div>

            {/* Colors */}
            <div className="liquid-section border-pink-500/30 shadow-[inset_0_0_30px_rgba(236,72,153,0.05)]">
              <h3 className="text-lg font-bold neon-text-pink mb-6 flex items-center gap-2">
                <Palette className="w-5 h-5" /> Cromatismo
              </h3>
              
              <div className="mb-6 flex justify-between items-center bg-pink-900/20 p-3 rounded-2xl border border-pink-500/30">
                 <label className="text-xs uppercase tracking-wider text-pink-300 font-bold flex items-center gap-2 drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]">
                    <Music className="w-4 h-4" /> Color Armónico
                 </label>
                 <div onClick={() => handleChange('harmonicColor', !params.harmonicColor)} className={`liquid-switch ${params.harmonicColor ? 'active-pink' : ''}`} style={params.harmonicColor ? {background: 'rgba(236,72,153,0.25)', borderColor: 'rgba(236,72,153,0.5)'} : {}}>
                   <div className="liquid-switch-thumb" style={params.harmonicColor ? {background: 'radial-gradient(circle at 30% 30%, #fff, #ec4899)', boxShadow: '0 0 20px #ec4899, inset 0 2px 3px rgba(255,255,255,1)', left: '28px'} : {}}></div>
                 </div>
              </div>

              {params.harmonicColor ? (
                <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                  {renderControl("Sensibilidad Color", "harmonicSensitivity", 0.1, 5.0, 0.1)}
                  {renderControl("Profundidad Color", "harmonicDepth", 0, 360, 10)}
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                  {renderControl("Tono Base", "baseHue", 0, 360, 1)}
                  {renderControl("Velocidad Ciclo", "hueSpeed", 0, 5, 0.1)}
                </div>
              )}
              
              <div className="mt-6">
                {renderControl("Rango Gradiente", "hueRange", 0, 360, 1)}
                {renderControl("Saturación", "saturation", 0, 100, 1)}
                {renderControl("Brillo Base", "brightness", 0, 100, 1)}
              </div>
            </div>

            {/* Base Geometry */}
            <div className="liquid-section">
              <h3 className="text-lg font-bold neon-text text-purple-400 mb-6 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)'}}>
                <Maximize className="w-5 h-5" /> Geometría Base
              </h3>
              {renderControl("Factor K (Expansión)", "k", 0.8, 1.2, 0.001, undefined, params.autoPilot)}
              {renderControl("Detalle (Iteraciones)", "iter", 100, 2000, 10, undefined, false)}
              {renderControl("Profundidad (Zoom)", "zoom", 0.001, 3.0, 0.001, undefined, false)}
            </div>

            {/* Transformation */}
            <div className="liquid-section">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-lg font-bold neon-text text-green-400 flex items-center gap-2" style={{backgroundImage: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)'}}>
                  <RotateCw className="w-5 h-5" /> Transformación
                </h3>
                <button 
                  onClick={centerSpiral}
                  disabled={params.autoPilot}
                  className={`liquid-bubble px-3 py-2 text-xs uppercase font-bold text-cyan-300 flex items-center gap-1 ${params.autoPilot ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Target size={14} /> CENTRAR
                </button>
              </div>
              
              {renderControl("Ángulo ψ", "psi", -6.28, 6.28, 0.01, undefined, params.autoPilot)}
              {renderControl("Desplazamiento X", "z0_r", -2, 2, 0.01, undefined, params.autoPilot)}
              {renderControl("Desplazamiento Y", "z0_i", -2, 2, 0.01, undefined, params.autoPilot)}
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default ControlPanel;
