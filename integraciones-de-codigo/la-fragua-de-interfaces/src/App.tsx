import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Layers, Cpu, Database, Share2, Download, Sliders, Activity, Zap, Leaf, Eye, Radio, ArrowUpRight, ArrowDownRight, Minus, Hexagon, CircleDashed, AlignCenter, Network, Code, Link, Settings, BrainCircuit, Image as ImageIcon } from 'lucide-react';
import { generateWidgetOntology, generateWidgetVisuals } from './services/geminiService';
import { WidgetOntology, WidgetConfig, StructureConfig } from './types';

const layouts = [
  { id: 'Fluido Radial', icon: CircleDashed, desc: 'Ciclos y biometría' },
  { id: 'Cuadrícula Modular', icon: Database, desc: 'Alta densidad de datos' },
  { id: 'Flujo Vertical', icon: AlignCenter, desc: 'Narrativas y feeds' },
  { id: 'Panal Hexagonal', icon: Hexagon, desc: 'Estructuras orgánicas' },
  { id: 'Órbita Concéntrica', icon: Radio, desc: 'Sistemas jerárquicos' },
  { id: 'Grafo Asimétrico', icon: Network, desc: 'Relaciones complejas' },
];

export default function App() {
  const [step, setStep] = useState<'idle' | 'phase1_structure' | 'phase2_loading' | 'phase2_visuals' | 'phase3_loading' | 'phase3_metamorphosis'>('idle');
  const [prompt, setPrompt] = useState('');
  
  // Phase 1 State
  const [selectedLayout, setSelectedLayout] = useState<string>('Fluido Radial');
  const [structureConfig, setStructureConfig] = useState<StructureConfig>({
    density: 50,
    symmetry: 80,
    tension: 30
  });

  // Phase 2 State
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Phase 3 State
  const [ontology, setOntology] = useState<WidgetOntology | null>(null);
  const [activeTab, setActiveTab] = useState<'aspecto' | 'espacial' | 'conexiones' | 'inteligencia' | 'codigo'>('aspecto');
  const [config, setConfig] = useState<WidgetConfig>({
    opacity: 0.4,
    blur: 16,
    borderRadius: 32,
    size: 'md',
    animationStiffness: 100,
    animationDamping: 20,
    dataSource: 'akashic',
    aiSkill: 'none',
    scale: 1,
    rotateX: 0,
    rotateY: 0,
    glowIntensity: 20
  });

  const handleStartForge = () => {
    if (!prompt.trim()) return;
    setStep('phase1_structure');
  };

  const handleGenerateVisuals = async () => {
    setStep('phase2_loading');
    try {
      const images = await generateWidgetVisuals(prompt, selectedLayout, structureConfig);
      if (images.length === 0) {
        alert("No se pudieron generar imágenes debido a límites de cuota (Rate Limit) de la API. Por favor, intenta de nuevo más tarde.");
        setStep('phase1_structure');
        return;
      }
      setGeneratedImages(images);
      setStep('phase2_visuals');
    } catch (error) {
      console.error(error);
      setStep('phase1_structure');
      alert("Error al generar visuales con Stitch.");
    }
  };

  const handleSelectVisual = async (img: string) => {
    setSelectedImage(img);
    setStep('phase3_loading');
    try {
      const data = await generateWidgetOntology(prompt, selectedLayout, img);
      setOntology(data);
      setStep('phase3_metamorphosis');
    } catch (error) {
      console.error(error);
      setStep('phase2_visuals');
      alert("La conexión con el Códice Akáshico ha sido interrumpida.");
    }
  };

  const renderMetamorphosisTab = () => {
    switch (activeTab) {
      case 'aspecto':
        return (
          <div className="space-y-6">
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Opacidad del Cristal</span>
                <span>{Math.round(config.opacity * 100)}%</span>
              </label>
              <input type="range" min="0" max="1" step="0.01" value={config.opacity} onChange={(e) => setConfig({...config, opacity: parseFloat(e.target.value)})} className="w-full accent-indigo-500" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Refracción (Blur)</span>
                <span>{config.blur}px</span>
              </label>
              <input type="range" min="0" max="40" step="1" value={config.blur} onChange={(e) => setConfig({...config, blur: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Tensión Superficial (Radio)</span>
                <span>{config.borderRadius}px</span>
              </label>
              <input type="range" min="0" max="64" step="1" value={config.borderRadius} onChange={(e) => setConfig({...config, borderRadius: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Intensidad de Brillo (Glow)</span>
                <span>{config.glowIntensity}px</span>
              </label>
              <input type="range" min="0" max="100" step="1" value={config.glowIntensity} onChange={(e) => setConfig({...config, glowIntensity: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-mono text-white/50 mb-3 uppercase">Tamaño del Contenedor</label>
              <div className="grid grid-cols-5 gap-2">
                {(['sm', 'md', 'lg', 'xl', 'full'] as const).map(s => (
                  <button key={s} onClick={() => setConfig({...config, size: s})} className={`py-2 text-xs font-mono rounded-lg border transition-colors ${config.size === s ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>{s.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'espacial':
        return (
          <div className="space-y-6">
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Escala General</span>
                <span>{config.scale.toFixed(2)}x</span>
              </label>
              <input type="range" min="0.5" max="2" step="0.05" value={config.scale} onChange={(e) => setConfig({...config, scale: parseFloat(e.target.value)})} className="w-full accent-purple-500" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Rotación X (3D)</span>
                <span>{config.rotateX}°</span>
              </label>
              <input type="range" min="-60" max="60" step="1" value={config.rotateX} onChange={(e) => setConfig({...config, rotateX: parseInt(e.target.value)})} className="w-full accent-purple-500" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Rotación Y (3D)</span>
                <span>{config.rotateY}°</span>
              </label>
              <input type="range" min="-60" max="60" step="1" value={config.rotateY} onChange={(e) => setConfig({...config, rotateY: parseInt(e.target.value)})} className="w-full accent-purple-500" />
            </div>
            <div className="pt-4 border-t border-white/10">
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Rigidez del Resorte (Stiffness)</span>
                <span>{config.animationStiffness}</span>
              </label>
              <input type="range" min="20" max="300" step="1" value={config.animationStiffness} onChange={(e) => setConfig({...config, animationStiffness: parseInt(e.target.value)})} className="w-full accent-purple-500" />
            </div>
            <div>
              <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase">
                <span>Amortiguación (Damping)</span>
                <span>{config.animationDamping}</span>
              </label>
              <input type="range" min="5" max="50" step="1" value={config.animationDamping} onChange={(e) => setConfig({...config, animationDamping: parseInt(e.target.value)})} className="w-full accent-purple-500" />
            </div>
          </div>
        );
      case 'conexiones':
        return (
          <div className="space-y-6">
            <label className="block text-xs font-mono text-white/50 mb-3 uppercase">Enrutamiento Epistémico</label>
            <div className="grid grid-cols-2 gap-2">
              {(['akashic', 'ipfs', 'local', 'rest_api', 'mcp'] as const).map(src => (
                <button key={src} onClick={() => setConfig({...config, dataSource: src})} className={`py-3 text-xs font-mono rounded-lg border transition-colors ${config.dataSource === src ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>{src.toUpperCase()}</button>
              ))}
            </div>
          </div>
        );
      case 'inteligencia':
        return (
          <div className="space-y-6">
            <label className="block text-xs font-mono text-white/50 mb-3 uppercase">Skills de IA (Astraura)</label>
            <div className="grid grid-cols-1 gap-2">
              {(['none', 'predictive', 'translation', 'socratic'] as const).map(skill => (
                <button key={skill} onClick={() => setConfig({...config, aiSkill: skill})} className={`py-3 px-4 text-left text-xs font-mono rounded-lg border transition-colors ${config.aiSkill === skill ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>{skill.toUpperCase()}</button>
              ))}
            </div>
          </div>
        );
      case 'codigo':
        return (
          <div className="space-y-4 flex flex-col h-full">
            <label className="block text-xs font-mono text-white/50 mb-2 uppercase">Código HTML/Tailwind (Editable)</label>
            <textarea 
              value={ontology?.htmlCode || ''}
              onChange={(e) => setOntology(ontology ? {...ontology, htmlCode: e.target.value} : null)}
              className="flex-1 w-full min-h-[300px] bg-black/50 p-4 rounded-xl border border-white/10 text-[12px] text-emerald-400 font-mono focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        );
    }
  };

  const getSizeClass = () => {
    switch (config.size) {
      case 'sm': return 'max-w-xs';
      case 'md': return 'max-w-md';
      case 'lg': return 'max-w-2xl';
      case 'xl': return 'max-w-4xl';
      case 'full': return 'max-w-full w-full';
      default: return 'max-w-md';
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 max-w-7xl mx-auto flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-light tracking-tight text-white">La Fragua de Interfaces</h1>
            <p className="text-xs font-mono text-indigo-300/70 uppercase tracking-widest">OS StarSeed // Nodo Creador</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-white/70">Red Akáshica Sincronizada</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: IDLE (Prompt) */}
          {step === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }} className="w-full max-w-2xl">
              <div className="text-center mb-8">
                <h2 className="text-4xl md:text-5xl font-light text-white mb-4 tracking-tight">¿Qué deseas materializar hoy?</h2>
                <p className="text-white/50 font-light text-lg">Describe la ontología de tu widget. El motor dual Stitch+Gemini forjará la estructura.</p>
              </div>
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[2rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
                <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-2 flex items-center shadow-2xl">
                  <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleStartForge()} placeholder="Ej: Monitor de Ecología Local, Ágora de Simulación Causal..." className="w-full bg-transparent border-none outline-none text-white px-6 py-4 text-lg font-light placeholder:text-white/20" />
                  <button onClick={handleStartForge} className="bg-white text-black px-8 py-4 rounded-full font-medium hover:bg-indigo-50 transition-colors flex items-center gap-2">Forjar <Sparkles className="w-4 h-4" /></button>
                </div>
              </div>
            </motion.div>
          )}

          {/* PHASE 1: STRUCTURE */}
          {step === 'phase1_structure' && (
            <motion.div key="phase1" initial={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-5xl">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-sm font-mono mb-4 border border-indigo-500/30">
                  <Layers className="w-4 h-4" /> Fase 1: Estructura Geométrica
                </div>
                <h2 className="text-3xl font-light text-white">Selecciona y Ajusta la Estructura</h2>
                <p className="text-white/50 mt-2">Define los cimientos matemáticos de tu widget antes de la renderización visual.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {layouts.map((layout) => {
                    const Icon = layout.icon;
                    return (
                      <button key={layout.id} onClick={() => setSelectedLayout(layout.id)} className={`p-4 rounded-2xl border transition-all text-left flex flex-col gap-3 ${selectedLayout === layout.id ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedLayout === layout.id ? 'bg-indigo-500/30 text-indigo-300' : 'bg-white/10 text-white/50'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-white font-medium text-sm">{layout.id}</h3>
                          <p className="text-white/40 text-xs mt-1">{layout.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                  <div>
                    <h3 className="text-white font-medium mb-6 flex items-center gap-2"><Sliders className="w-4 h-4 text-indigo-400" /> Ajustes Estructurales</h3>
                    <div className="space-y-6">
                      <div>
                        <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase"><span>Densidad</span><span>{structureConfig.density}%</span></label>
                        <input type="range" min="0" max="100" value={structureConfig.density} onChange={(e) => setStructureConfig({...structureConfig, density: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
                      </div>
                      <div>
                        <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase"><span>Simetría</span><span>{structureConfig.symmetry}%</span></label>
                        <input type="range" min="0" max="100" value={structureConfig.symmetry} onChange={(e) => setStructureConfig({...structureConfig, symmetry: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
                      </div>
                      <div>
                        <label className="flex justify-between text-xs font-mono text-white/50 mb-2 uppercase"><span>Tensión</span><span>{structureConfig.tension}%</span></label>
                        <input type="range" min="0" max="100" value={structureConfig.tension} onChange={(e) => setStructureConfig({...structureConfig, tension: parseInt(e.target.value)})} className="w-full accent-indigo-500" />
                      </div>
                    </div>
                  </div>
                  <button onClick={handleGenerateVisuals} className="w-full mt-8 bg-white text-black py-3 rounded-xl font-medium hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
                    Generar Variaciones Visuales <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* PHASE 2: LOADING VISUALS */}
          {step === 'phase2_loading' && (
            <motion.div key="phase2_loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center">
              <div className="relative w-24 h-24 mb-8">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-t-2 border-indigo-500 rounded-full" />
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute inset-2 border-l-2 border-pink-500 rounded-full" />
                <div className="absolute inset-0 flex items-center justify-center"><ImageIcon className="w-8 h-8 text-white/80" /></div>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 text-sm font-mono mb-4 border border-pink-500/30">Fase 2: Generación Visual (Stitch)</div>
              <h2 className="text-2xl font-light text-white">Renderizando Prototipos Ciberdélicos...</h2>
              <p className="text-white/40 mt-2 font-mono text-sm">Sintetizando imágenes basadas en tu estructura y prompt.</p>
            </motion.div>
          )}

          {/* PHASE 2: VISUALS */}
          {step === 'phase2_visuals' && (
            <motion.div key="phase2_visuals" initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-6xl">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 text-sm font-mono mb-4 border border-pink-500/30">
                  <ImageIcon className="w-4 h-4" /> Fase 2: Selección Visual
                </div>
                <h2 className="text-3xl font-light text-white">Elige tu Visión Preferida</h2>
                <p className="text-white/50 mt-2">Stitch ha renderizado estas variaciones. Selecciona una para extraer su ontología.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {generatedImages.map((img, i) => (
                  <motion.button key={i} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleSelectVisual(img)} className="relative aspect-square rounded-[2rem] overflow-hidden border border-white/10 group">
                    <img src={img} alt={`Variation ${i+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                      <span className="text-white font-medium flex items-center gap-2">Seleccionar Visión <ArrowUpRight className="w-4 h-4" /></span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* PHASE 3: LOADING ONTOLOGY */}
          {step === 'phase3_loading' && (
            <motion.div key="phase3_loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center">
              <div className="relative w-24 h-24 mb-8">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-t-2 border-emerald-500 rounded-full" />
                <motion.div animate={{ rotate: -360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute inset-2 border-l-2 border-purple-500 rounded-full" />
                <div className="absolute inset-0 flex items-center justify-center"><Cpu className="w-8 h-8 text-white/80" /></div>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-sm font-mono mb-4 border border-emerald-500/30">Fase 3: Convergencia Gemini</div>
              <h2 className="text-2xl font-light text-white">Extrayendo Ontología y Código...</h2>
              <p className="text-white/40 mt-2 font-mono text-sm">Traduciendo la visión visual a componentes funcionales y conexiones.</p>
            </motion.div>
          )}

          {/* PHASE 3: METAMORPHOSIS */}
          {step === 'phase3_metamorphosis' && ontology && (
            <motion.div key="phase3_metamorphosis" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Widget Preview Area */}
              <div className="lg:col-span-8 flex flex-col items-center justify-center min-h-[600px] relative" style={{ perspective: '1200px' }}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] opacity-50" />
                
                {/* THE GENERATED WIDGET */}
                <motion.div 
                  layout
                  animate={{
                    rotateX: config.rotateX,
                    rotateY: config.rotateY,
                    scale: config.scale
                  }}
                  transition={{ type: "spring", stiffness: config.animationStiffness, damping: config.animationDamping }}
                  style={{ 
                    '--widget-opacity': config.opacity,
                    '--widget-blur': config.blur,
                    '--widget-radius': config.borderRadius,
                    filter: `drop-shadow(0 0 ${config.glowIntensity}px ${ontology.themeColor || 'rgba(99,102,241,0.5)'})`
                  } as React.CSSProperties}
                  className={`relative z-10 w-full ${getSizeClass()}`}
                >
                  <div 
                    className="w-full h-full text-white" 
                    dangerouslySetInnerHTML={{ __html: ontology.htmlCode }} 
                  />
                </motion.div>
              </div>

              {/* Metamorphosis Panel Expanded */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] overflow-hidden flex flex-col h-[600px]">
                  <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-2 mb-4">
                      <Sliders className="w-5 h-5 text-indigo-400" />
                      <h3 className="text-white font-medium">Metamorfosis Absoluta</h3>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {(['aspecto', 'espacial', 'conexiones', 'inteligencia', 'codigo'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-colors ${activeTab === tab ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="p-6 flex-1 overflow-y-auto">
                    {renderMetamorphosisTab()}
                  </div>
                </div>

                {/* Seeding Actions */}
                <div className="grid grid-cols-2 gap-4">
                  <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white group">
                    <Download className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                    <span className="text-xs font-medium">Exportar Local</span>
                  </button>
                  <button className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors text-indigo-100 group">
                    <Share2 className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                    <span className="text-xs font-medium">Sembrar en Red</span>
                  </button>
                </div>
                
                <button onClick={() => setStep('idle')} className="text-center text-xs font-mono text-white/30 hover:text-white/70 transition-colors mt-2 uppercase tracking-widest">
                  Forjar Nuevo Widget
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
