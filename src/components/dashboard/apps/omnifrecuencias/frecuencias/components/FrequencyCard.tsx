'use client';


import React, { useState } from 'react';
import { FrequencyItem, CATEGORIES } from '../types';
import Icon from './Icon';

interface Props {
  item: FrequencyItem;
  delay: number;
  onAddToPlayer: (item: FrequencyItem) => void;
}

const FrequencyCard: React.FC<Props> = ({ item, delay, onAddToPlayer }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const categoryInfo = CATEGORIES.find(c => c.id === item.category);
  const colorClass = categoryInfo ? categoryInfo.color : 'text-slate-400';
  
  return (
    <div 
      className={`
        relative group overflow-hidden
        bg-black/40 backdrop-blur-xl border border-white/10 hover:border-cyan-500/30
        rounded-3xl p-6 transition-all duration-500 ease-out
        hover:shadow-[0_10px_40px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] hover:-translate-y-2
        flex flex-col h-full animate-fade-in
      `}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top Accent Line */}
      <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-50 ${colorClass} group-hover:opacity-100 transition-opacity duration-500`} />
      
      {/* Background Glow */}
      <div className={`absolute -inset-20 bg-gradient-to-br from-transparent via-current to-transparent opacity-0 group-hover:opacity-10 blur-3xl transition-opacity duration-700 pointer-events-none ${colorClass}`}></div>

      {/* Header */}
      <div className="flex justify-between items-start mb-5 relative z-10">
        <div className="flex flex-col">
          <span className={`font-display font-black text-4xl tracking-tighter ${colorClass} drop-shadow-[0_0_15px_currentColor] group-hover:drop-shadow-[0_0_25px_currentColor] transition-all duration-500`}>
            {item.hz} <span className="text-sm font-medium opacity-60 tracking-normal">Hz</span>
          </span>
          <div className="flex items-center gap-2 mt-2">
             <span className={`text-[10px] uppercase font-bold tracking-[0.3em] opacity-80 ${colorClass} drop-shadow-[0_0_5px_currentColor]`}>
                {categoryInfo?.label}
             </span>
          </div>
        </div>
        <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)] group-hover:scale-110 transition-transform duration-500 ${colorClass}`}>
           <Icon name={categoryInfo?.iconName || 'Layers'} size={24} className="drop-shadow-[0_0_8px_currentColor]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow relative z-10">
        <h3 className="text-xl font-bold text-white mb-3 leading-tight group-hover:text-cyan-100 transition-colors drop-shadow-md">
          {item.name}
        </h3>
        
        {item.location && (
          <div className="flex items-center gap-1.5 text-amber-200/90 text-[10px] uppercase tracking-widest font-bold mb-4 bg-amber-900/30 border border-amber-500/20 w-fit px-2.5 py-1 rounded-lg shadow-[0_0_10px_rgba(245,158,11,0.1)]">
            <Icon name="MapPin" size={12} className="text-amber-400" />
            {item.location}
          </div>
        )}

        <p className="text-slate-300 text-sm leading-relaxed mb-5 font-light">
          {item.description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-4 pt-5 border-t border-white/10 relative z-10">
        
        <button 
            onClick={(e) => {
                e.stopPropagation();
                onAddToPlayer(item);
            }}
            className="relative overflow-hidden group/btn w-full py-3 bg-black/50 hover:bg-cyan-950/50 border border-white/10 hover:border-cyan-400/50 rounded-xl flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-cyan-200 transition-all duration-300 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] hover:shadow-[0_0_20px_rgba(34,211,238,0.2),inset_0_0_15px_rgba(34,211,238,0.1)] mb-2"
        >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-400/10 to-cyan-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
            <Icon name="Zap" size={16} className="group-hover/btn:drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            Añadir al Player
        </button>

        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-cyan-400 transition-colors"
        >
          <span>{isExpanded ? 'Menos Información' : 'Propiedades y Uso'}</span>
          <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
        </button>

        <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="bg-black/60 rounded-2xl p-5 border border-white/10 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] relative">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>
                <h4 className="text-cyan-300 text-[10px] uppercase font-black tracking-widest mb-3 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">Usos Detallados</h4>
                <p className="text-slate-300 text-sm font-light leading-relaxed mb-4">
                  {item.detailedUsage}
                </p>
                <div className="text-[9px] text-slate-500 italic uppercase tracking-wider text-right border-t border-white/5 pt-2">
                  Fuente: <span className="text-slate-400">{item.evidence}</span>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrequencyCard;
