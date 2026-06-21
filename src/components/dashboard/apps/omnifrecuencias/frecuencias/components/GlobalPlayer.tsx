'use client';

import React from 'react';
import { useAudio } from '../hooks/useAudio';
import Icon from './Icon';
import Visualizer from './Visualizer';

interface Props {
  audio: ReturnType<typeof useAudio>;
}

const GlobalPlayer: React.FC<Props> = ({ audio }) => {
  const { isPlaying, toggleMasterPlay, oscillators, getMasterAnalyser } = audio;
  const activeCount = oscillators.filter((o) => o.isPlaying).length;

  // Don't show if nothing is set up
  if (oscillators.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 w-full z-50 animate-fade-in pointer-events-none">
      <div className="max-w-7xl mx-auto px-4 pb-4 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_-10px_50px_rgba(0,0,0,0.8)] p-4 md:p-5 flex items-center gap-5 md:gap-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 pointer-events-none"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

          {/* Play/Pause Button */}
          <button
            onClick={toggleMasterPlay}
            className={`relative group flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 shadow-[0_0_20px_rgba(0,0,0,0.5)] z-10 cursor-pointer ${isPlaying ? 'bg-cyan-500 text-black border-2 border-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.6)] scale-105' : 'bg-black/50 text-cyan-400 border-2 border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-950/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)]'}`}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            {isPlaying ? (
              <div className="w-5 h-5 bg-current rounded-sm shadow-[0_0_10px_currentColor]" />
            ) : (
              <Icon name="Radio" size={24} className="ml-1 drop-shadow-[0_0_8px_currentColor]" />
            )}
          </button>

          {/* Info Area */}
          <div className="flex-1 min-w-0 relative z-10">
            <div className="flex items-center gap-3 mb-1.5">
              <span className={`text-[10px] md:text-xs uppercase tracking-[0.2em] font-black ${isPlaying ? 'text-cyan-300 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]' : 'text-slate-500'}`}>
                {isPlaying ? 'Reproduciendo' : 'Pausado'}
              </span>
              <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,1)]' : 'bg-slate-700'}`}></span>
            </div>
            <div className="text-sm md:text-base text-white truncate font-display font-medium tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {activeCount === 0
                ? 'Silencio Total'
                : activeCount === 1
                  ? `${oscillators.find((o) => o.isPlaying)?.name || 'Frecuencia'}`
                  : `${activeCount} Frecuencias combinadas`}
            </div>
          </div>

          {/* Mini Visualizer */}
          <div className="hidden md:block flex-1 max-w-xs h-14 bg-black/50 rounded-2xl overflow-hidden border border-white/5 relative z-10 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
            <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/10 to-transparent pointer-events-none"></div>
            <Visualizer analyser={getMasterAnalyser()} height={56} color={isPlaying ? '#22d3ee' : '#475569'} type="fill" />
          </div>

          {/* Volume Indicator */}
          <div className="hidden md:flex flex-col gap-2 w-36 relative z-10 bg-black/40 p-2.5 rounded-xl border border-white/5 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
            <div className="text-[9px] text-cyan-200/70 uppercase font-bold tracking-widest flex items-center justify-between">
              <Icon name="Volume2" size={12} className="text-cyan-500/50" />
              <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded border border-white/5">
                <input
                  type="number"
                  step="any"
                  value={Math.round(audio.masterVolume * 100)}
                  onChange={(e) => audio.updateMasterVolume(parseFloat(e.target.value) / 100)}
                  className="w-10 bg-transparent text-right text-cyan-300 font-mono focus:outline-none"
                />
                <span className="text-cyan-500/50">%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="any"
              value={audio.masterVolume}
              onChange={(e) => audio.updateMasterVolume(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.8)]"
              style={{
                background: `linear-gradient(to right, #06b6d4 ${audio.masterVolume * 100}%, #1e293b ${audio.masterVolume * 100}%)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalPlayer;
