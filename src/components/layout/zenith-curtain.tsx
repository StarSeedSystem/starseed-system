"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import {
    Sparkles, Brain, Globe, Users, BookOpen, Palette, Cpu, Search,
    ArrowRight, BrainCircuit, Bot, Server, Settings, Plus, ChevronDown,
    Pencil, Maximize2, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useFullscreen } from "@/hooks/useFullscreen";
import { UniversalEditor } from "@/components/layout/universal-editor";

type Domain = 'ALL' | 'POLITICS' | 'EDUCATION' | 'CULTURE' | 'SYSTEM';

interface SearchResult {
    id: string;
    title: string;
    description: string;
    type: string;
    domain: Domain;
    relevance: number;
    tags: string[];
}

const mockResults: SearchResult[] = [
    {
        id: "1",
        title: "Propuesta de Holocracia Cuántica",
        description: "Un marco de gobernanza descentralizada basado en nodos fractales.",
        type: "DOC",
        domain: "POLITICS",
        relevance: 98,
        tags: ["governance", "web3", "democracy"]
    },
    {
        id: "2",
        title: "Curso: Historia del Futuro",
        description: "Módulo educativo interactivo sobre la evolución transhumanista.",
        type: "COURSE",
        domain: "EDUCATION",
        relevance: 95,
        tags: ["history", "transhumanism"]
    },
    {
        id: "3",
        title: "Pack de Texturas Biomecánicas",
        description: "Assets 3D de alta resolución para entornos virtuales.",
        type: "ASSET",
        domain: "CULTURE",
        relevance: 88,
        tags: ["3d", "art", "creative"]
    },
];

export function ZenithCurtain() {
    const { activeEdge } = usePerimeter();
    const isActive = activeEdge === 'zenith';
    const [query, setQuery] = useState("");
    const [activeDomain, setActiveDomain] = useState<Domain>('ALL');
    const [editorOpen, setEditorOpen] = useState(false);
    const { isFullscreen, toggle: toggleFullscreen, isSupported: fsSupported } = useFullscreen();

    const filteredResults = mockResults.filter(r =>
        (activeDomain === 'ALL' || r.domain === activeDomain) &&
        (r.title.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()))
    );

    return (
        <>
            <UniversalEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
            <AnimatePresence>
                {isActive && (
                    <motion.div
                        initial={{ y: "-100%", x: "-50%", opacity: 0, scale: 0.96 }}
                        animate={{ y: 0, x: "-50%", opacity: 1, scale: 1 }}
                        exit={{ y: "-100%", x: "-50%", opacity: 0, scale: 0.96 }}
                        transition={{ type: "spring", damping: 30, stiffness: 200 }}
                        style={{ left: "50%" }}
                        // MÁS ESPACIO VERTICAL Y MÁS ANCHO — antes era 70vh/max-w-4xl
                        className="fixed top-3 w-[96vw] max-w-7xl h-[92vh] z-[90] pointer-events-auto rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(6,182,212,0.3)] border border-cyan-500/30 text-cyan-50"
                    >
                        {/* Fondo cristalino */}
                        <div className="absolute inset-0 bg-black/85 backdrop-blur-2xl" />
                        <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/50 via-transparent to-cyan-950/20 pointer-events-none" />

                        {/* Contenedor — pt reducido (6 antes de 12) para no comprimir */}
                        <div className="relative z-10 w-full h-full flex flex-col text-cyan-50">

                            {/* Cabecera compacta — recursos IA + acciones rápidas */}
                            <div className="flex flex-col gap-3 px-5 md:px-8 pt-5 pb-3 shrink-0 border-b border-cyan-500/15 bg-black/20">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/30 shadow-[0_0_20px_rgba(34,211,238,0.4)] shrink-0">
                                            <Globe className="w-5 h-5 md:w-6 md:h-6 text-cyan-300" />
                                        </div>
                                        <div className="min-w-0">
                                            <h2 className="text-lg md:text-2xl font-light tracking-widest uppercase font-headline truncate">
                                                Explorador Universal & Nexus
                                            </h2>
                                            <p className="text-[11px] text-cyan-300/60 font-mono hidden md:block">
                                                Memoria Universal · IA Contextual · Editor de Sistema
                                            </p>
                                        </div>
                                    </div>

                                    {/* Acciones rápidas — Editor, Fullscreen, Workspaces */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditorOpen(true)}
                                            className="border-violet-500/40 text-violet-300 hover:bg-violet-500/15 hover:text-violet-100 gap-2 rounded-full px-4"
                                            title="Editor Universal: edita cualquier sección del programa"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline text-xs uppercase tracking-wider">Editor</span>
                                        </Button>

                                        {fsSupported && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={toggleFullscreen}
                                                className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-100 gap-2 rounded-full px-4"
                                                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa inteligente"}
                                            >
                                                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                                <span className="hidden sm:inline text-xs uppercase tracking-wider">
                                                    {isFullscreen ? "Salir" : "Pantalla"}
                                                </span>
                                            </Button>
                                        )}

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => window.location.href = '/nexus'}
                                            className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-100 gap-2 rounded-full px-4"
                                        >
                                            <span className="hidden sm:inline text-xs uppercase tracking-wider">Espacios</span>
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Controles de recursos AI — fila estrecha */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <AIResourceControl icon={<BrainCircuit className="w-4 h-4 text-cyan-300" />} label="Modelo IA" value="Gemini 1.5 Pro" color="cyan" />
                                    <AIResourceControl icon={<Bot className="w-4 h-4 text-emerald-300" />} label="Agente" value="Arquitecto" color="emerald" />
                                    <AIResourceControl icon={<Server className="w-4 h-4 text-amber-300" />} label="Servidores MCP" value="4 Activos" color="amber" />
                                </div>
                            </div>

                            {/* Buscador + dominios — compacto */}
                            <div className="px-5 md:px-8 py-4 shrink-0 border-b border-cyan-500/10 bg-black/10">
                                <div className="relative group max-w-4xl mx-auto">
                                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-indigo-500 rounded-full opacity-25 group-hover:opacity-50 blur-md transition-opacity" />
                                    <div className="relative flex items-center bg-black/40 backdrop-blur-xl rounded-full border border-cyan-500/30 p-1.5">
                                        <Search className="ml-4 w-5 h-5 text-cyan-500/70 shrink-0" />
                                        <input
                                            type="text"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder="Pregunta a la IA o busca recursos en la red..."
                                            className="w-full bg-transparent py-3 px-4 text-base text-cyan-100 placeholder:text-cyan-500/50 focus:outline-none min-w-0"
                                        />
                                        <button className="mr-1.5 p-2.5 rounded-full bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-200 transition-colors shrink-0">
                                            <Sparkles className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-center gap-1.5 flex-wrap mt-3 max-w-4xl mx-auto">
                                    {[
                                        { id: 'ALL', label: 'Todo', icon: Globe },
                                        { id: 'POLITICS', label: 'Política', icon: Users },
                                        { id: 'EDUCATION', label: 'Educación', icon: BookOpen },
                                        { id: 'CULTURE', label: 'Cultura', icon: Palette },
                                        { id: 'SYSTEM', label: 'Sistema', icon: Cpu },
                                    ].map((scope) => (
                                        <button
                                            key={scope.id}
                                            onClick={() => setActiveDomain(scope.id as Domain)}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] uppercase tracking-wider transition-all duration-300 border backdrop-blur-md cursor-pointer",
                                                activeDomain === scope.id
                                                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.3)] font-medium"
                                                    : "bg-black/20 border-white/5 text-cyan-500/60 hover:bg-white/10 hover:text-cyan-300"
                                            )}
                                        >
                                            <scope.icon className="w-3.5 h-3.5" />
                                            {scope.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Resultados — TODO el espacio vertical restante, no comprimido */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="flex-1 w-full overflow-y-auto custom-scrollbar"
                            >
                                <div className="max-w-7xl mx-auto px-5 md:px-8 py-5">
                                    {query && (
                                        <div className="flex items-center justify-between text-[11px] text-cyan-500/60 font-mono mb-4 border-b border-cyan-500/20 pb-2.5">
                                            <span>RESULTADOS DE LA RED ({filteredResults.length})</span>
                                            <span className="flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> IA INDEXING ACTIVE</span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {filteredResults.map((result) => (
                                            <div key={result.id} className="group relative bg-black/30 border border-cyan-500/10 rounded-2xl overflow-hidden hover:bg-cyan-950/30 hover:border-cyan-500/40 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-[0_10px_30px_rgba(34,211,238,0.15)] hover:-translate-y-1 flex flex-col">
                                                <div className="p-5 flex-1">
                                                    <div className="flex justify-between items-start mb-3 gap-2">
                                                        <Badge variant="outline" className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-950/40 border-cyan-500/30 text-cyan-300 shrink-0">
                                                            {result.type}
                                                        </Badge>
                                                        <span className="text-[10px] text-cyan-500/50 uppercase font-medium tracking-wider truncate">
                                                            {result.domain}
                                                        </span>
                                                    </div>
                                                    <h3 className="font-semibold text-base text-cyan-50 mb-2 group-hover:text-cyan-300 transition-colors leading-tight line-clamp-2">
                                                        {result.title}
                                                    </h3>
                                                    <p className="text-xs text-cyan-200/70 line-clamp-3 leading-relaxed">
                                                        {result.description}
                                                    </p>
                                                </div>
                                                <div className="px-5 py-3 border-t border-cyan-500/10 flex items-center justify-between bg-black/40 gap-2 min-w-0">
                                                    <div className="flex gap-1.5 flex-wrap min-w-0 flex-1">
                                                        {result.tags.slice(0, 3).map(t => (
                                                            <span key={t} className="text-[10px] text-cyan-500/60 px-2 py-0.5 rounded-full bg-cyan-950/30 truncate max-w-[80px]">
                                                                #{t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-cyan-400 hover:text-cyan-100 hover:bg-cyan-500/30 shrink-0">
                                                        <ArrowRight className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {!query && (
                                        <div className="text-center py-16 opacity-50">
                                            <BrainCircuit className="w-14 h-14 text-cyan-500/30 mx-auto mb-4" />
                                            <p className="text-cyan-200/50 text-sm max-w-md mx-auto">
                                                Inicia una búsqueda para explorar la Memoria Universal o interactuar con el Nexo.
                                            </p>
                                            <p className="text-cyan-200/30 text-xs max-w-md mx-auto mt-3">
                                                Tip: usa el botón <strong className="text-violet-300">Editor</strong> arriba para modificar cualquier sección del programa.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </div>

                        {/* Decoración: rayos de luz */}
                        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none mix-blend-screen">
                            <div className="absolute top-0 left-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                            <div className="absolute top-0 right-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                            <div className="absolute top-0 left-1/2 w-[600px] h-full -translate-x-1/2 bg-gradient-to-b from-cyan-500/10 to-transparent blur-[60px]" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function AIResourceControl({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: 'cyan' | 'emerald' | 'amber' }) {
    const colorClasses = {
        cyan: "border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/15",
        emerald: "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15",
        amber: "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15"
    };
    const btnHover = {
        cyan: "hover:bg-cyan-500/30 hover:text-cyan-200",
        emerald: "hover:bg-emerald-500/30 hover:text-emerald-200",
        amber: "hover:bg-amber-500/30 hover:text-amber-200"
    };
    return (
        <div className={cn("flex items-center justify-between p-2 pl-2.5 rounded-lg border backdrop-blur-sm transition-all group min-w-0", colorClasses[color])}>
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="opacity-80 group-hover:opacity-100 transition-opacity shrink-0">{icon}</div>
                <div className="flex flex-col min-w-0">
                    <span className="text-[9px] uppercase tracking-wider opacity-50 truncate">{label}</span>
                    <span className="text-xs font-medium text-white/90 truncate">{value}</span>
                </div>
            </div>
            <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                <button className={cn("p-1.5 rounded-md transition-colors", btnHover[color])} title="Seleccionar"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button className={cn("p-1.5 rounded-md transition-colors", btnHover[color])} title="Configurar"><Settings className="w-3.5 h-3.5" /></button>
                <button className={cn("p-1.5 rounded-md transition-colors", btnHover[color])} title="Añadir"><Plus className="w-3.5 h-3.5" /></button>
            </div>
        </div>
    );
}
