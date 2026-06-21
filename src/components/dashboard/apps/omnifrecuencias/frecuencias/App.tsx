'use client';

// ════════════════════════════════════════════════════════════════
// Omni-Frecuencias — App REAL del usuario, portada nativa al StarSeed OS
// ----------------------------------------------------------------
// Raíz de la aplicación real ("omni-frecuencias-holográficas"), adaptada
// para correr DENTRO del OS (no iframe). Conserva:
//   • Biblioteca de frecuencias por categorías (search + sort + filtros).
//   • Generador multi-oscilador con paneo 3D (panX/Y/Z) + transiciones.
//   • Recetas de sinergia (binaural Phi/Pi, Schumann, Sol-Luna, etc.).
//   • Visualizador (canvas) + reproductor global.
//   • Guardado/carga de presets en la Biblioteca SOBERANA del OS.
//
// Diferencias respecto a la versión Vite/Capacitor:
//   • Se elimina la LandingPage (PWA install): el OS ya provee la entrada
//     (ventana / ruta), así que arrancamos directamente en la app.
//   • La raíz usa `h-full` + scroll interno y fondos `absolute` (no
//     `fixed`) para vivir dentro del contenedor del OS (ventana o ruta).
//   • SSR-safe: AudioContext / localStorage solo se tocan tras montar y
//     tras un gesto del usuario (el hook useAudio ya lo garantiza).
// ════════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import { frequencyData } from './data/frequencies';
import { CATEGORIES, CategoryId, SortOption, FrequencyItem } from './types';
import { getSynergyRecipe, colorForCategory, resolveFrequency } from './data/synergy-recipes';
import FrequencyCard from './components/FrequencyCard';
import Icon from './components/Icon';
import { useAudio } from './hooks/useAudio';
import Generator from './components/Generator';
import GlobalPlayer from './components/GlobalPlayer';

type ViewMode = 'library' | 'generator';

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOption['value']>('hz-asc');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('library');

  // Audio Engine Hook
  const audio = useAudio();

  // Handler to add from Library to Generator
  const handleAddToPlayer = (item: FrequencyItem) => {
    // 1. Check for Synergy Recipe
    if (item.category === 'synergy') {
      const recipe = getSynergyRecipe(item.id);
      if (recipe) {
        recipe.forEach((oscParams) => {
          audio.addOscillator(oscParams);
        });
        setViewMode('generator');
        return;
      }
    }

    // 2. Default Single Oscillator Logic (misma lógica compartida con el widget)
    audio.addOscillator({
      name: item.name,
      frequency: resolveFrequency(item),
      type: 'sine', // Default
      volume: 0.5,
      panX: 0,
      color: colorForCategory(item.category),
    });

    // Switch view to generator to show feedback
    setViewMode('generator');
  };

  // Filter and Sort Logic
  const filteredData = useMemo(() => {
    let data = [...frequencyData];

    // 1. Filter by Category
    if (activeCategory !== 'all') {
      data = data.filter((item) => item.category === activeCategory);
    }

    // 2. Filter by Search
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      data = data.filter(
        (item) =>
          item.name.toLowerCase().includes(lowerQuery) ||
          item.description.toLowerCase().includes(lowerQuery) ||
          item.hz.includes(lowerQuery) ||
          item.detailedUsage.toLowerCase().includes(lowerQuery),
      );
    }

    // 3. Sort
    data.sort((a, b) => {
      switch (sortOrder) {
        case 'hz-asc':
          return a.numericalHz - b.numericalHz;
        case 'hz-desc':
          return b.numericalHz - a.numericalHz;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'location':
          if (a.location && !b.location) return -1;
          if (!a.location && b.location) return 1;
          return (a.location || '').localeCompare(b.location || '');
        default:
          return 0;
      }
    });

    return data;
  }, [activeCategory, searchQuery, sortOrder]);

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden relative text-slate-200 bg-[#030712] selection:bg-cyan-500/30 selection:text-cyan-100 custom-scrollbar">
      {/* Animaciones/utilidades propias de la app portada (no dependen del
          globals.css del OS para mantener intactos los archivos compartidos). */}
      <style>{`
        @keyframes omnifrec-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .animate-fade-in { animation: omnifrec-fade-in 0.5s ease-out both; }
        .font-display { font-family: var(--font-display, 'Space Grotesk', ui-sans-serif, system-ui, sans-serif); }
      `}</style>

      {/* --- Ambient Background (contenido dentro del contenedor del OS) --- */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-pink-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* --- Header --- */}
        <header className="text-center mb-12 animate-fade-in flex flex-col items-center justify-center">
          <div className="inline-flex items-center gap-3 mb-8 px-6 py-2 rounded-full bg-black/40 border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.2)] backdrop-blur-md hover:shadow-[0_0_50px_rgba(34,211,238,0.4)] transition-shadow duration-500 cursor-default">
            <Icon name="Globe" size={16} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]"></span>
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-100 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
              StarSeed OS · Omni V.7
            </span>
          </div>

          <div className="relative inline-block">
            <h1
              className="font-display text-5xl md:text-7xl font-black mb-6 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-purple-300 to-pink-300 drop-shadow-[0_5px_15px_rgba(168,85,247,0.4)]"
              style={{ textShadow: '0 10px 30px rgba(168,85,247,0.3), 0 2px 10px rgba(34,211,238,0.5)' }}
            >
              Omni-Frecuencias
            </h1>
            <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 blur-2xl -z-10 rounded-full opacity-50 mix-blend-screen"></div>
          </div>

          {/* Main Navigation Tabs */}
          <div className="flex justify-center mt-10 gap-6">
            <button
              onClick={() => setViewMode('library')}
              className={`relative overflow-hidden group flex items-center gap-3 px-8 py-4 rounded-2xl font-display font-bold tracking-widest uppercase text-sm transition-all duration-500 cursor-pointer ${viewMode === 'library' ? 'bg-cyan-950/40 text-cyan-200 border-2 border-cyan-400/50 shadow-[0_0_30px_rgba(34,211,238,0.4),inset_0_0_20px_rgba(34,211,238,0.2)] scale-105' : 'bg-black/40 text-slate-400 border-2 border-white/5 hover:bg-white/5 hover:border-cyan-500/30 hover:text-cyan-100 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-400/20 to-cyan-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ${viewMode === 'library' ? 'animate-[shimmer_2s_infinite]' : ''}`}></div>
              <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent opacity-50 pointer-events-none"></div>
              <Icon name="Search" size={20} className={viewMode === 'library' ? 'drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : ''} />
              Biblioteca
            </button>
            <button
              onClick={() => setViewMode('generator')}
              className={`relative overflow-hidden group flex items-center gap-3 px-8 py-4 rounded-2xl font-display font-bold tracking-widest uppercase text-sm transition-all duration-500 cursor-pointer ${viewMode === 'generator' ? 'bg-purple-950/40 text-purple-200 border-2 border-purple-400/50 shadow-[0_0_30px_rgba(168,85,247,0.4),inset_0_0_20px_rgba(168,85,247,0.2)] scale-105' : 'bg-black/40 text-slate-400 border-2 border-white/5 hover:bg-white/5 hover:border-purple-500/30 hover:text-purple-100 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]'}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-400/20 to-purple-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ${viewMode === 'generator' ? 'animate-[shimmer_2s_infinite]' : ''}`}></div>
              <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent opacity-50 pointer-events-none"></div>
              <Icon name="Zap" size={20} className={viewMode === 'generator' ? 'drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' : ''} />
              Generador
            </button>
          </div>
        </header>

        {/* --- VIEW: LIBRARY --- */}
        {viewMode === 'library' && (
          <div className="animate-fade-in">
            {/* --- Controls Panel --- */}
            <div className="sticky top-2 z-40 mb-10">
              <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(255,255,255,0.05)] p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none"></div>
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>

                {/* Top Row: Search & Mobile Toggle */}
                <div className="flex flex-col md:flex-row gap-5 justify-between items-center mb-4 md:mb-3 relative z-10">
                  <div className="relative w-full md:w-96 group">
                    <div className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-cyan-400 transition-colors drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
                      <Icon name="Search" size={18} />
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar frecuencia, órgano, pirámide..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-cyan-400/50 focus:bg-black/80 focus:shadow-[0_0_20px_rgba(34,211,238,0.2),inset_0_0_10px_rgba(34,211,238,0.1)] transition-all duration-300 text-white placeholder-slate-600 font-light"
                    />
                  </div>

                  {/* Sort Controls (Desktop) */}
                  <div className="hidden md:flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/10 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 px-3 font-bold">Ordenar:</span>
                    {(
                      [
                        { label: 'Hz Asc', value: 'hz-asc' },
                        { label: 'Hz Desc', value: 'hz-desc' },
                        { label: 'Nombre', value: 'name-asc' },
                        { label: 'Ubicación', value: 'location' },
                      ] as { label: string; value: SortOption['value'] }[]
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSortOrder(opt.value)}
                        className={`
                          px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer
                          ${sortOrder === opt.value
                            ? 'bg-cyan-950/50 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
                            : 'text-slate-500 border border-transparent hover:text-cyan-200 hover:bg-white/5'}
                        `}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Mobile Filter Toggle */}
                  <button
                    className="md:hidden w-full py-3 bg-black/50 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/70 hover:text-cyan-300 hover:border-cyan-500/30 transition-all shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] cursor-pointer"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    {showFilters ? 'Ocultar Filtros' : 'Mostrar Categorías y Orden'}
                  </button>
                </div>

                {/* Bottom Row: Categories */}
                <div
                  className={`
                    ${showFilters ? 'flex' : 'hidden'} md:flex flex-col md:flex-row gap-5 items-start md:items-center border-t border-white/10 pt-5 md:pt-3 mt-3 md:mt-0 relative z-10
                  `}
                >
                  {/* Mobile Sort */}
                  <div className="md:hidden flex flex-wrap gap-2 w-full mb-4">
                    {(
                      [
                        { label: 'Hz Bajo-Alto', value: 'hz-asc' },
                        { label: 'Hz Alto-Bajo', value: 'hz-desc' },
                      ] as { label: string; value: SortOption['value'] }[]
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSortOrder(opt.value)}
                        className={`flex-grow px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all duration-300 cursor-pointer ${sortOrder === opt.value ? 'bg-cyan-950/50 text-cyan-300 border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'bg-black/40 text-slate-500 border-white/10 hover:bg-white/5'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 justify-center md:justify-start w-full">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`
                          flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 border cursor-pointer
                          ${activeCategory === cat.id
                            ? `bg-white/10 border-white/20 text-white shadow-[0_0_20px_rgba(255,255,255,0.15),inset_0_0_10px_rgba(255,255,255,0.05)] scale-105`
                            : 'bg-black/20 border-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300 hover:border-white/10'}
                        `}
                      >
                        <Icon name={cat.iconName} size={14} className={activeCategory === cat.id ? `${cat.color} drop-shadow-[0_0_5px_currentColor]` : ''} />
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* --- Results Grid --- */}
            {filteredData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-32">
                {filteredData.map((item, index) => (
                  <FrequencyCard key={item.id} item={item} delay={index * 50} onAddToPlayer={handleAddToPlayer} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-slate-600 animate-fade-in">
                <Icon name="Activity" size={64} className="mb-6 opacity-20" />
                <h3 className="text-xl font-light">No hay resonancia en este espectro.</h3>
                <p className="text-sm mt-2">Intenta ajustar tu búsqueda o filtros.</p>
              </div>
            )}
          </div>
        )}

        {/* --- VIEW: GENERATOR --- */}
        {viewMode === 'generator' && <Generator audio={audio} />}
      </div>

      {/* --- Global Player --- */}
      <GlobalPlayer audio={audio} />
    </div>
  );
};

export default App;
