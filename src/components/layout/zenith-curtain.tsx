"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import { Sparkles, Brain, MessageSquare, Eye, Mic, Send, Globe, Users, BookOpen, Palette, Cpu, Search, Filter, Copy, ArrowRight, BrainCircuit, Bot, Server, Settings, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
    const [isSearching, setIsSearching] = useState(false);

    const filteredResults = mockResults.filter(r =>
        (activeDomain === 'ALL' || r.domain === activeDomain) &&
        (r.title.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()))
    );

    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    initial={{ y: "-100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "-100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    className="fixed top-0 left-0 w-full h-[60vh] z-[90] pointer-events-auto overflow-hidden text-cyan-50"
                >
                    {/* Ethereal Blue Background / "Curtain of Light" */}
                    <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/95 via-blue-900/90 to-black/80 backdrop-blur-xl border-b border-cyan-500/30 shadow-[0_10px_40px_rgba(6,182,212,0.3)]" />

                    {/* Content Container */}
                    <div className="relative z-10 w-full h-full flex flex-col pt-12 text-cyan-50 overflow-y-auto">

                        {/* Header Section */}
                        <div className="flex flex-col items-center justify-start flex-none px-6">
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="flex items-center gap-3 mb-8"
                            >
                                <div className="p-3 rounded-full bg-cyan-500/20 border border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.6)]">
                                    <Globe className="w-6 h-6 text-cyan-300" />
                                </div>
                                <h2 className="text-2xl font-light tracking-widest uppercase font-headline">
                                    Explorador Universal & Nexus
                                </h2>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.location.href = '/nexus'}
                                    className="ml-auto border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-100 uppercase text-xs tracking-wider"
                                >
                                    Ir a Espacios de Trabajo
                                    <ArrowRight className="w-3 h-3 ml-2" />
                                </Button>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="w-full max-w-3xl flex flex-col gap-6"
                            >
                                {/* AI nexus Controls */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-2">
                                    <AIResourceControl
                                        icon={<BrainCircuit className="w-4 h-4 text-cyan-300" />}
                                        label="Modelo IA"
                                        value="Gemini 1.5 Pro"
                                        color="cyan"
                                    />
                                    <AIResourceControl
                                        icon={<Bot className="w-4 h-4 text-emerald-300" />}
                                        label="Agente"
                                        value="Arquitecto"
                                        color="emerald"
                                    />
                                    <AIResourceControl
                                        icon={<Server className="w-4 h-4 text-amber-300" />}
                                        label="Servidores MCP"
                                        value="4 Activos"
                                        color="amber"
                                    />
                                </div>

                                {/* Search & Input Field */}
                                <div className="relative w-full group">
                                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-indigo-500 rounded-full opacity-30 group-hover:opacity-60 blur-md transition-opacity duration-500" />
                                    <div className="relative flex items-center bg-black/40 backdrop-blur-md rounded-full border border-cyan-500/30">
                                        <Search className="ml-4 w-5 h-5 text-cyan-500/70" />
                                        <input
                                            type="text"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder="Explora la red, pregunta a la IA o busca recursos..."
                                            className="w-full bg-transparent py-4 px-4 text-cyan-100 placeholder:text-cyan-500/50 focus:outline-none"
                                        />
                                        <button className="mr-2 p-2 rounded-full bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 transition-colors">
                                            <Sparkles className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Domains / Context Toggles */}
                                <div className="flex justify-center gap-2 flex-wrap">
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
                                                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs uppercase tracking-wider transition-all duration-300 border",
                                                activeDomain === scope.id
                                                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                                                    : "bg-transparent border-white/5 text-cyan-500/50 hover:bg-white/5 hover:text-cyan-300"
                                            )}
                                        >
                                            <scope.icon className="w-3 h-3" />
                                            {scope.label}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>

                        {/* Results / Discovery Area */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="flex-1 w-full max-w-5xl mx-auto px-6 mt-8 pb-10 overflow-y-auto"
                        >
                            {query && (
                                <div className="flex items-center justify-between text-xs text-cyan-500/60 font-mono mb-4 border-b border-cyan-500/20 pb-2">
                                    <span>RESULTADOS DE LA RED ({filteredResults.length})</span>
                                    <span className="flex items-center gap-1"><Brain className="w-3 h-3" /> IA INDEXING ACTIVE</span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredResults.map((result) => (
                                    <div key={result.id} className="group relative bg-black/20 border border-cyan-500/10 rounded-lg overflow-hidden hover:bg-cyan-950/20 hover:border-cyan-500/30 transition-all cursor-pointer">
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <Badge variant="outline" className="text-[10px] bg-cyan-950/30 border-cyan-500/20 text-cyan-300">{result.type}</Badge>
                                                <span className="text-[10px] text-cyan-500/50 uppercase">{result.domain}</span>
                                            </div>
                                            <h3 className="font-semibold text-cyan-50 mb-1 group-hover:text-cyan-300 transition-colors">{result.title}</h3>
                                            <p className="text-xs text-cyan-200/60 line-clamp-2">{result.description}</p>
                                        </div>
                                        <div className="px-4 py-2 border-t border-cyan-500/10 flex items-center justify-between bg-black/20">
                                            <div className="flex gap-2">
                                                {result.tags.slice(0, 2).map(t => <span key={t} className="text-[9px] text-cyan-500/40">#{t}</span>)}
                                            </div>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/20">
                                                <ArrowRight className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Empty State / Prompt */}
                            {!query && (
                                <div className="text-center py-12 opacity-50">
                                    <BrainCircuit className="w-12 h-12 text-cyan-500/30 mx-auto mb-4" />
                                    <p className="text-cyan-200/50 text-sm">Inicia una búsqueda para explorar la Memoria Universal o interactuar con Nexus.</p>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Decorative "Light Beams" */}
                    <div className="absolute inset-0 z-0 opacity-30 pointer-events-none mix-blend-screen">
                        <div className="absolute top-0 left-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[1px]" />
                        <div className="absolute top-0 right-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[1px]" />
                        <div className="absolute top-0 left-1/2 w-[400px] h-full -translate-x-1/2 bg-gradient-to-b from-cyan-500/10 to-transparent blur-[40px]" />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function ModeToggle({ icon, label, active }: { icon: React.ReactNode, label: string, active?: boolean }) {
    return (
        <button className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 ${active
            ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
            : "bg-transparent border-white/10 text-cyan-500/50 hover:bg-white/5 hover:text-cyan-300"
            }`}>
            {icon}
            <span className="text-xs uppercase tracking-wider">{label}</span>
        </button>
    )
}

function AIResourceControl({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: 'cyan' | 'emerald' | 'amber' }) {
    const colorClasses = {
        cyan: "border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20",
        emerald: "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20",
        amber: "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20"
    };

    const btnHover = {
        cyan: "hover:bg-cyan-500/30 hover:text-cyan-200",
        emerald: "hover:bg-emerald-500/30 hover:text-emerald-200",
        amber: "hover:bg-amber-500/30 hover:text-amber-200"
    };

    return (
        <div className={cn(
            "flex items-center justify-between p-2 pl-3 rounded-lg border backdrop-blur-sm transition-all group",
            colorClasses[color]
        )}>
            <div className="flex items-center gap-3">
                <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                    {icon}
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-wider opacity-50">{label}</span>
                    <span className="text-xs font-medium text-white/90">{value}</span>
                </div>
            </div>

            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                {/* Select / List */}
                <button className={cn("p-1.5 rounded-md transition-colors", btnHover[color])} title="Seleccionar">
                    <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {/* Edit */}
                <button className={cn("p-1.5 rounded-md transition-colors", btnHover[color])} title="Editar Configuración">
                    <Settings className="w-3.5 h-3.5" />
                </button>
                {/* Add */}
                <button className={cn("p-1.5 rounded-md transition-colors", btnHover[color])} title="Añadir Nuevo">
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
