'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Layers, Eye, Cpu, Settings2, Code, Zap, Globe, Shield, RefreshCw, X, Sliders, PlayCircle, Grid3X3, ArrowUpRight, ChevronLeft, Save, Maximize2, Move, AlertTriangle, Download } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    ForgeStep,
    WidgetOntology,
    VisualVariation,
    WidgetConfig,
    StructureConfig,
    DEFAULT_WIDGET_CONFIG,
    DEFAULT_STRUCTURE_CONFIG,
    FORGE_LAYOUTS,
    ForgeMetaTab
} from './widget-forge-types';
import { DashboardWidget } from '../dashboard-types';

const LAYOUT_ICONS: Record<string, React.ElementType> = {
    'CircleDashed': Sparkles,
    'LayoutGrid': Grid3X3,
    'AlignCenter': Layers,
    'Hexagon': Globe,
    'Radio': Zap,
    'Network': Shield,
};

interface WidgetForgeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onWidgetCreated: (widgetData: Partial<DashboardWidget>) => void;
    initialData?: Partial<DashboardWidget> | null;
}

export function WidgetForgeDialog({
    open,
    onOpenChange,
    onWidgetCreated,
    initialData
}: WidgetForgeDialogProps) {
    // ─── State Machine ──────────────────────────────────────────────
    const [step, setStep] = useState<ForgeStep>(initialData ? 'phase3_metamorphosis' : 'idle');
    const [prompt, setPrompt] = useState(initialData?.forgePrompt || '');
    const [errorMsg, setErrorMsg] = useState('');

    // Phase 1 State
    const [selectedLayout, setSelectedLayout] = useState('Fluido Radial');
    const [structureConfig, setStructureConfig] = useState<StructureConfig>({ ...DEFAULT_STRUCTURE_CONFIG });

    // Phase 2 State — visual variations
    const [visualVariations, setVisualVariations] = useState<VisualVariation[]>([]);

    // Phase 3 State
    const [ontology, setOntology] = useState<WidgetOntology | null>(
        initialData ? { ...initialData.ontology, htmlCode: initialData.customHtml } : null
    );
    const [activeTab, setActiveTab] = useState<ForgeMetaTab>('aspecto');
    const [config, setConfig] = useState<WidgetConfig>(initialData?.widgetConfig || { ...DEFAULT_WIDGET_CONFIG });

    // AI Edit State
    const [aiEditInstruction, setAiEditInstruction] = useState('');
    const [isAiEditing, setIsAiEditing] = useState(false);
    const [editFeedback, setEditFeedback] = useState('');

    const handleStartForge = useCallback(() => {
        if (!prompt.trim()) return;
        setErrorMsg('');
        setStep('phase1_structure');
    }, [prompt]);

    const handleGenerateVariations = useCallback(async () => {
        setStep('phase2_loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/widget-forge/generate-visuals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, layout: selectedLayout, structureConfig }),
            });
            const data = await res.json();
            if (data.variations && data.variations.length > 0) {
                setVisualVariations(data.variations);
                setStep('phase2_visuals');
            } else {
                // Fallback: generate code directly
                handleDirectCodeGeneration();
            }
        } catch (error) {
            console.error(error);
            handleDirectCodeGeneration();
        }
    }, [prompt, selectedLayout, structureConfig]);

    const handleDirectCodeGeneration = useCallback(async () => {
        setStep('phase3_loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/widget-forge/generate-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, layout: selectedLayout }),
            });
            const data = await res.json();
            if (data.htmlCode) {
                setOntology({
                    title: data.title || prompt.slice(0, 30),
                    description: data.description || '',
                    themeColor: data.themeColor || '#8b5cf6',
                    htmlCode: data.htmlCode,
                });
                setStep('phase3_metamorphosis');
            } else {
                setErrorMsg('No se pudo generar el widget. Intenta con otro prompt.');
                setStep('phase1_structure');
            }
        } catch {
            setErrorMsg('Error de conexión. Verifica tu red e intenta de nuevo.');
            setStep('phase1_structure');
        }
    }, [prompt, selectedLayout]);

    const generateCodeFromImage = useCallback(async (variation: VisualVariation) => {
        setStep('phase3_loading');
        setErrorMsg('');
        try {
            const res = await fetch('/api/widget-forge/generate-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt, 
                    layout: selectedLayout,
                    imageUrl: variation.imageUrl 
                }),
            });
            const data = await res.json();
            if (data.htmlCode) {
                setOntology({
                    title: data.title || variation.title,
                    description: data.description || variation.description,
                    themeColor: data.themeColor || variation.themeColor,
                    htmlCode: data.htmlCode,
                });
                setStep('phase3_metamorphosis');
            } else {
                setErrorMsg('Fallo al traducir la imagen a código. Intenta nuevamente.');
                setStep('phase2_visuals');
            }
        } catch {
            setErrorMsg('Error de conexión al hiperespacio.');
            setStep('phase2_visuals');
        }
    }, [prompt, selectedLayout]);

    const handleSelectVariation = useCallback((variation: VisualVariation) => {
        setOntology({
            title: variation.title,
            description: variation.description,
            themeColor: variation.themeColor,
            htmlCode: '', // Will be generated in Phase 3
        });
        
        // Pass the image URL to the generation queue
        generateCodeFromImage(variation);
    }, [generateCodeFromImage]);

    const handleAiEdit = useCallback(async () => {
        if (!aiEditInstruction.trim() || !ontology) return;
        setIsAiEditing(true);
        setEditFeedback('');
        try {
            const res = await fetch('/api/widget-forge/edit-with-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentHtml: ontology.htmlCode,
                    editInstruction: aiEditInstruction,
                    context: `Widget: ${ontology.title}. Prompt original: ${prompt}`,
                }),
            });
            const data = await res.json();
            if (data.htmlCode) {
                setOntology({ ...ontology, htmlCode: data.htmlCode });
                setEditFeedback(data.changeSummary || '✓ Cambios aplicados');
                setAiEditInstruction('');
            } else if (data.error) {
                setEditFeedback(`⚠ ${data.error}`);
            }
        } catch (error) {
            setEditFeedback('⚠ Error de conexión al editar');
        } finally {
            setIsAiEditing(false);
        }
    }, [aiEditInstruction, ontology, prompt]);

    const handleAddToDashboard = useCallback(() => {
        if (!ontology) return;
        onWidgetCreated({
            customHtml: ontology.htmlCode,
            ontology: {
                title: ontology.title,
                description: ontology.description,
                themeColor: ontology.themeColor,
            },
            widgetConfig: config,
            forgePrompt: prompt,
            selectedLayout,
        });
        onOpenChange(false);
        setStep('idle');
        setPrompt('');
        setOntology(null);
        setVisualVariations([]);
        setEditFeedback('');
    }, [ontology, config, prompt, selectedLayout, onWidgetCreated, onOpenChange]);

    const handleBack = () => {
        setErrorMsg('');
        setEditFeedback('');
        switch (step) {
            case 'phase1_structure': setStep('idle'); break;
            case 'phase2_visuals': setStep('phase1_structure'); break;
            case 'phase3_metamorphosis': setStep('phase2_visuals'); break;
            default: break;
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

    const renderPhaseIndicator = () => {
        const phases = [
            { key: 'idle', label: 'Prompt', icon: Sparkles },
            { key: 'phase1', label: 'Estructura', icon: Layers },
            { key: 'phase2', label: 'Variaciones', icon: Eye },
            { key: 'phase3', label: 'Metamorfosis', icon: Cpu },
        ];
        const currentPhase = step.startsWith('phase3') ? 3 : step.startsWith('phase2') ? 2 : step.startsWith('phase1') ? 1 : 0;

        return (
            <div className="flex items-center gap-1 px-4 py-2">
                {phases.map((phase, i) => {
                    const Icon = phase.icon;
                    const isActive = i === currentPhase;
                    const isPast = i < currentPhase;
                    return (
                        <div key={phase.key} className="flex items-center gap-1">
                            {i > 0 && (
                                <div className={cn(
                                    "w-8 h-px transition-all duration-500",
                                    isPast ? "bg-indigo-500" : "bg-white/10"
                                )} />
                            )}
                            <div className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all duration-500",
                                isActive && "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.2)]",
                                isPast && "text-indigo-400/60",
                                !isActive && !isPast && "text-white/20"
                            )}>
                                <Icon className="w-3 h-3" />
                                <span className="hidden sm:inline">{phase.label}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] max-w-[1200px] h-[90vh] max-h-[900px] flex flex-col p-0 gap-0 overflow-hidden bg-[#0a0a14]/95 backdrop-blur-2xl border-white/[0.06]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-white/[0.06] shrink-0">
                    <div className="flex items-center gap-3">
                        {step !== 'idle' && (
                            <Button variant="ghost" size="icon" onClick={handleBack}
                                className="h-8 w-8 rounded-full text-white/40 hover:text-white hover:bg-white/10">
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                        )}
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_16px_rgba(99,102,241,0.3)]">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <DialogTitle className="text-sm font-medium text-white/90">La Fragua de Interfaces</DialogTitle>
                                <p className="text-[10px] font-mono text-indigo-300/50 uppercase tracking-widest">Motor Gemini // StarSeed OS</p>
                            </div>
                        </div>
                    </div>
                    {renderPhaseIndicator()}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* Error Banner */}
                    {errorMsg && (
                        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 animate-in fade-in duration-300">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            <p className="text-amber-200 text-xs">{errorMsg}</p>
                            <button onClick={() => setErrorMsg('')} className="ml-auto text-amber-400/50 hover:text-amber-200">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* ═══ IDLE — Prompt Input ═══ */}
                    {step === 'idle' && (
                        <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
                            <div className="text-center mb-8">
                                <h2 className="text-3xl md:text-4xl font-light text-white mb-3 tracking-tight">
                                    ¿Qué deseas materializar?
                                </h2>
                                <p className="text-white/40 font-light">
                                    Describe la función y apariencia de tu widget. La IA forjará su estructura y código.
                                </p>
                            </div>
                            <div className="relative group w-full">
                                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000" />
                                <div className="relative bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex items-center">
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleStartForge()}
                                        placeholder="Ej: Monitor de métricas en tiempo real con gráficas..."
                                        className="w-full bg-transparent border-none outline-none text-white px-4 py-3 text-base font-light placeholder:text-white/20"
                                    />
                                    <Button
                                        onClick={handleStartForge}
                                        disabled={!prompt.trim()}
                                        className="bg-white text-black rounded-xl px-6 py-3 font-medium hover:bg-indigo-50 transition-colors flex items-center gap-2 shrink-0"
                                    >
                                        Forjar <Sparkles className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Quick suggestions */}
                            <div className="flex flex-wrap gap-2 mt-6 justify-center">
                                {[
                                    'Monitor de sistema con CPU y RAM',
                                    'Feed de noticias con categorías',
                                    'Calendario de eventos interactivo',
                                    'Panel de métricas económicas',
                                    'Widget de clima minimalista',
                                    'Rastreador de tareas con progreso',
                                    'Panel de red social con estadísticas',
                                ].map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        onClick={() => setPrompt(suggestion)}
                                        className="px-3 py-1.5 rounded-full text-xs text-white/40 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/60 transition-all"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ═══ PHASE 1 — Structure ═══ */}
                    {step === 'phase1_structure' && (
                        <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-mono mb-3 border border-indigo-500/25">
                                    <Layers className="w-3.5 h-3.5" /> Fase 1: Topología Geométrica
                                </div>
                                <h2 className="text-2xl font-light text-white">Selecciona la Estructura Base</h2>
                                <p className="text-white/40 mt-1 text-sm">Define los cimientos matemáticos de tu widget.</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {FORGE_LAYOUTS.map((layout) => {
                                        const Icon = LAYOUT_ICONS[layout.icon] || CircleDashed;
                                        return (
                                            <button
                                                key={layout.id}
                                                onClick={() => setSelectedLayout(layout.id)}
                                                className={cn(
                                                    "p-4 rounded-2xl border transition-all text-left flex flex-col gap-3",
                                                    selectedLayout === layout.id
                                                        ? "bg-indigo-500/15 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
                                                        : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]"
                                                )}
                                            >
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center",
                                                    selectedLayout === layout.id ? "bg-indigo-500/25 text-indigo-300" : "bg-white/[0.06] text-white/40"
                                                )}>
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-medium text-sm">{layout.id}</h3>
                                                    <p className="text-white/30 text-xs mt-0.5">{layout.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="bg-black/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 flex flex-col justify-between">
                                    <div>
                                        <h3 className="text-white font-medium mb-5 flex items-center gap-2 text-sm">
                                            <Sliders className="w-4 h-4 text-indigo-400" /> Ajustes Estructurales
                                        </h3>
                                        <div className="space-y-5">
                                            {[
                                                { label: 'Densidad', key: 'density' as const, value: structureConfig.density },
                                                { label: 'Simetría', key: 'symmetry' as const, value: structureConfig.symmetry },
                                                { label: 'Tensión', key: 'tension' as const, value: structureConfig.tension },
                                            ].map(({ label, key, value }) => (
                                                <div key={key}>
                                                    <label className="flex justify-between text-[10px] font-mono text-white/40 mb-1.5 uppercase tracking-wider">
                                                        <span>{label}</span>
                                                        <span>{value}%</span>
                                                    </label>
                                                    <input
                                                        type="range" min="0" max="100"
                                                        value={value}
                                                        onChange={(e) => setStructureConfig({
                                                            ...structureConfig,
                                                            [key]: parseInt(e.target.value)
                                                        })}
                                                        className="w-full accent-indigo-500 h-1"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2 mt-6">
                                        <Button
                                            onClick={handleGenerateVariations}
                                            className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-indigo-50 transition-colors gap-2"
                                        >
                                            Generar 3 Variaciones <Eye className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            onClick={handleDirectCodeGeneration}
                                            className="w-full text-white/30 hover:text-white/60 text-xs gap-1.5"
                                        >
                                            <Code className="w-3.5 h-3.5" /> Generación directa (1 resultado)
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══ LOADING ═══ */}
                    {(step === 'phase2_loading' || step === 'phase3_loading') && (
                        <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-500">
                            <div className="relative w-20 h-20 mb-6">
                                <div className="absolute inset-0 border-t-2 border-indigo-500 rounded-full animate-spin" style={{ animationDuration: '3s' }} />
                                <div className="absolute inset-2 border-l-2 border-pink-500 rounded-full animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    {step === 'phase2_loading'
                                        ? <Eye className="w-7 h-7 text-white/70" />
                                        : <Cpu className="w-7 h-7 text-white/70" />
                                    }
                                </div>
                            </div>
                            <div className={cn(
                                "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono mb-3 border",
                                step === 'phase2_loading'
                                    ? "bg-pink-500/15 text-pink-300 border-pink-500/25"
                                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                            )}>
                                {step === 'phase2_loading' ? 'Fase 2: Generando Variaciones' : 'Fase 3: Convergencia Gemini'}
                            </div>
                            <h2 className="text-xl font-light text-white">
                                {step === 'phase2_loading' ? 'Forjando 3 Prototipos de Código...' : 'Extrayendo Ontología y Código...'}
                            </h2>
                            <p className="text-white/30 mt-2 font-mono text-xs">Esto puede tomar hasta 30 segundos</p>
                        </div>
                    )}

                    {/* ═══ PHASE 2 — Code Variation Selection ═══ */}
                    {step === 'phase2_visuals' && (
                        <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/15 text-pink-300 text-xs font-mono mb-3 border border-pink-500/25">
                                    <Eye className="w-3.5 h-3.5" /> Fase 2: Selección de Variación
                                </div>
                                <h2 className="text-2xl font-light text-white">Elige tu Versión Preferida</h2>
                                <p className="text-white/40 mt-1 text-sm">Cada variación tiene un estilo y estructura distintos. Haz clic para continuar.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {visualVariations.map((variation, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSelectVariation(variation)}
                                        className="relative rounded-2xl overflow-hidden border border-white/[0.06] group hover:border-indigo-500/40 transition-all hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] text-left flex flex-col"
                                    >
                                        {/* Image Preview */}
                                        <div className="w-full aspect-video overflow-hidden bg-[#0a0a14] relative">
                                            <img src={variation.imageUrl} alt={variation.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-60" />
                                        </div>
                                        {/* Info Bar */}
                                        <div className="px-4 py-3 bg-black/60 border-t border-white/[0.06] flex items-center justify-between absolute bottom-0 w-full backdrop-blur-md">
                                            <div>
                                                <h4 className="text-white text-sm font-medium truncate drop-shadow-md">{variation.title}</h4>
                                                <p className="text-white/50 text-[10px] truncate">{variation.description}</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]" style={{ background: variation.themeColor, color: variation.themeColor }} />
                                                <ArrowUpRight className="w-4 h-4 text-white/40 group-hover:text-indigo-300 transition-colors" />
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ═══ PHASE 3 — Metamorphosis ═══ */}
                    {step === 'phase3_metamorphosis' && ontology && (
                        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-right-4 duration-500 h-full">
                            {/* Widget Preview */}
                            <div className="lg:col-span-7 flex flex-col items-center justify-center min-h-[400px] relative rounded-2xl bg-black/20 border border-white/[0.04] overflow-hidden p-6"
                                style={{ perspective: '1200px' }}
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] opacity-40 pointer-events-none" />
                                <div
                                    className={`relative z-10 w-full ${getSizeClass()} transition-all duration-500`}
                                    style={{
                                        '--widget-opacity': config.opacity,
                                        '--widget-blur': config.blur,
                                        '--widget-radius': config.borderRadius,
                                        transform: `scale(${config.scale}) rotateX(${config.rotateX}deg) rotateY(${config.rotateY}deg)`,
                                        filter: `drop-shadow(0 0 ${config.glowIntensity}px ${ontology.themeColor || 'rgba(99,102,241,0.5)'})`,
                                    } as React.CSSProperties}
                                >
                                    <div className="w-full h-full text-white" dangerouslySetInnerHTML={{ __html: ontology.htmlCode }} />
                                </div>
                            </div>

                            {/* Metamorphosis Panel */}
                            <div className="lg:col-span-5 flex flex-col gap-3">
                                <div className="bg-black/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
                                    <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sliders className="w-4 h-4 text-indigo-400" />
                                            <h3 className="text-white font-medium text-sm">Metamorfosis Absoluta</h3>
                                        </div>
                                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                                            {(['aspecto', 'espacial', 'conexiones', 'inteligencia', 'codigo'] as const).map(tab => (
                                                <button
                                                    key={tab}
                                                    onClick={() => setActiveTab(tab)}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded-full text-[10px] font-mono whitespace-nowrap transition-all",
                                                        activeTab === tab
                                                            ? "bg-white text-black"
                                                            : "bg-white/[0.04] text-white/40 hover:bg-white/[0.08]"
                                                    )}
                                                >
                                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-4 flex-1 overflow-y-auto">
                                        {activeTab === 'aspecto' && (
                                            <div className="space-y-4">
                                                {[
                                                    { label: 'Opacidad del Cristal', key: 'opacity', min: 0, max: 1, step: 0.01, display: `${Math.round(config.opacity * 100)}%`, color: 'indigo' },
                                                    { label: 'Refracción (Blur)', key: 'blur', min: 0, max: 40, step: 1, display: `${config.blur}px`, color: 'indigo' },
                                                    { label: 'Tensión Superficial', key: 'borderRadius', min: 0, max: 64, step: 1, display: `${config.borderRadius}px`, color: 'indigo' },
                                                    { label: 'Brillo (Glow)', key: 'glowIntensity', min: 0, max: 100, step: 1, display: `${config.glowIntensity}px`, color: 'indigo' },
                                                ].map(({ label, key, min, max, step: s, display }) => (
                                                    <div key={key}>
                                                        <label className="flex justify-between text-[10px] font-mono text-white/35 mb-1 uppercase tracking-wider">
                                                            <span>{label}</span><span>{display}</span>
                                                        </label>
                                                        <input type="range" min={min} max={max} step={s}
                                                            value={(config as any)[key]}
                                                            onChange={(e) => setConfig({ ...config, [key]: parseFloat(e.target.value) })}
                                                            className="w-full accent-indigo-500 h-1"
                                                        />
                                                    </div>
                                                ))}
                                                <div>
                                                    <label className="block text-[10px] font-mono text-white/35 mb-2 uppercase tracking-wider">Tamaño</label>
                                                    <div className="grid grid-cols-5 gap-1.5">
                                                        {(['sm', 'md', 'lg', 'xl', 'full'] as const).map(s => (
                                                            <button key={s} onClick={() => setConfig({ ...config, size: s })}
                                                                className={cn(
                                                                    "py-1.5 text-[10px] font-mono rounded-lg border transition-colors",
                                                                    config.size === s
                                                                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                                                                        : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06]"
                                                                )}
                                                            >{s.toUpperCase()}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'espacial' && (
                                            <div className="space-y-4">
                                                {[
                                                    { label: 'Escala', key: 'scale', min: 0.5, max: 2, step: 0.05, display: `${config.scale.toFixed(2)}x` },
                                                    { label: 'Rotación X (3D)', key: 'rotateX', min: -60, max: 60, step: 1, display: `${config.rotateX}°` },
                                                    { label: 'Rotación Y (3D)', key: 'rotateY', min: -60, max: 60, step: 1, display: `${config.rotateY}°` },
                                                    { label: 'Rigidez (Stiffness)', key: 'animationStiffness', min: 20, max: 300, step: 1, display: `${config.animationStiffness}` },
                                                    { label: 'Amortiguación', key: 'animationDamping', min: 5, max: 50, step: 1, display: `${config.animationDamping}` },
                                                ].map(({ label, key, min, max, step: s, display }) => (
                                                    <div key={key}>
                                                        <label className="flex justify-between text-[10px] font-mono text-white/35 mb-1 uppercase tracking-wider">
                                                            <span>{label}</span><span>{display}</span>
                                                        </label>
                                                        <input type="range" min={min} max={max} step={s}
                                                            value={(config as any)[key]}
                                                            onChange={(e) => setConfig({ ...config, [key]: parseFloat(e.target.value) })}
                                                            className="w-full accent-purple-500 h-1"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {activeTab === 'conexiones' && (
                                            <div className="space-y-4">
                                                <label className="block text-[10px] font-mono text-white/35 mb-2 uppercase tracking-wider">Enrutamiento Epistémico</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {(['akashic', 'ipfs', 'local', 'rest_api', 'mcp'] as const).map(src => (
                                                        <button key={src} onClick={() => setConfig({ ...config, dataSource: src })}
                                                            className={cn(
                                                                "py-2.5 text-[10px] font-mono rounded-lg border transition-colors",
                                                                config.dataSource === src
                                                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                                                                    : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06]"
                                                            )}
                                                        >{src.toUpperCase()}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'inteligencia' && (
                                            <div className="space-y-4">
                                                <label className="block text-[10px] font-mono text-white/35 mb-2 uppercase tracking-wider">Skills de IA (Astraura)</label>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {(['none', 'predictive', 'translation', 'socratic'] as const).map(skill => (
                                                        <button key={skill} onClick={() => setConfig({ ...config, aiSkill: skill })}
                                                            className={cn(
                                                                "py-2.5 px-3 text-left text-[10px] font-mono rounded-lg border transition-colors",
                                                                config.aiSkill === skill
                                                                    ? "bg-pink-500/20 border-pink-500/40 text-pink-300"
                                                                    : "bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06]"
                                                            )}
                                                        >{skill === 'none' ? 'SIN IA' : skill.toUpperCase()}</button>
                                                    ))}
                                                </div>

                                                {/* AI Edit section */}
                                                <div className="pt-3 border-t border-white/[0.06]">
                                                    <label className="block text-[10px] font-mono text-white/35 mb-2 uppercase tracking-wider">
                                                        Editar con IA
                                                    </label>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            value={aiEditInstruction}
                                                            onChange={(e) => setAiEditInstruction(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleAiEdit()}
                                                            placeholder="Ej: Agrega una gráfica de barras..."
                                                            className="bg-black/40 border-white/[0.06] text-white text-xs h-9 placeholder:text-white/20"
                                                            disabled={isAiEditing}
                                                        />
                                                        <Button
                                                            onClick={handleAiEdit}
                                                            disabled={isAiEditing || !aiEditInstruction.trim()}
                                                            size="sm"
                                                            className="bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/30 h-9 px-3 shrink-0"
                                                        >
                                                            {isAiEditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                                        </Button>
                                                    </div>
                                                    {editFeedback && (
                                                        <p className="text-[10px] mt-2 text-indigo-300/60 animate-in fade-in">{editFeedback}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'codigo' && (
                                            <div className="space-y-3 flex flex-col h-full">
                                                <label className="block text-[10px] font-mono text-white/35 uppercase tracking-wider">
                                                    Código HTML/CSS (Editable)
                                                </label>
                                                <textarea
                                                    value={ontology.htmlCode}
                                                    onChange={(e) => setOntology({ ...ontology, htmlCode: e.target.value })}
                                                    className="flex-1 w-full min-h-[250px] bg-black/50 p-3 rounded-xl border border-white/[0.06] text-[11px] text-emerald-400 font-mono focus:outline-none focus:border-indigo-500/50 resize-none scrollbar-thin"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => {
                                            setStep('idle');
                                            setOntology(null);
                                            setPrompt('');
                                            setEditFeedback('');
                                        }}
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors text-white/50 text-xs font-medium"
                                    >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        Forjar Otro
                                    </button>
                                    <button
                                        onClick={handleAddToDashboard}
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all text-indigo-100 text-xs font-medium shadow-[0_0_20px_rgba(99,102,241,0.1)] hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Añadir al Dashboard
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
