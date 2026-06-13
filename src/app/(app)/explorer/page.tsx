"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Search,
    Sparkles,
    Mic,
    Globe,
    BookOpen,
    Palette,
    Cpu,
    Users,
    ArrowRight,
    Copy,
    Download,
    Bot,
    Filter,
    BrainCircuit,
    Compass
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

// --- Types ---

type Domain = 'ALL' | 'POLITICS' | 'EDUCATION' | 'CULTURE' | 'SYSTEM';
type AgentPersona = 'RESEARCHER' | 'CREATIVE' | 'ACTIVIST' | 'SYSTEM_ARCHITECT';

interface SearchResult {
    id: string;
    title: string;
    description: string;
    type: string;
    domain: Domain;
    relevance: number;
    tags: string[];
}

// --- Mock Data ---

const mockResults: SearchResult[] = [
    { id: "1", title: "Propuesta de Holocracia Cuántica", description: "Un marco de gobernanza descentralizada basado en nodos fractales y contratos inteligentes ontocráticos.", type: "DOC", domain: "POLITICS", relevance: 98, tags: ["governance", "web3", "democracy"] },
    { id: "2", title: "Curso: Historia del Futuro", description: "Módulo educativo interactivo sobre la evolución transhumanista y paradigmas postcapitalistas.", type: "COURSE", domain: "EDUCATION", relevance: 95, tags: ["history", "transhumanism"] },
    { id: "3", title: "Pack de Texturas Biomecánicas v2", description: "Assets 3D de alta resolución con superficies orgánico-tecnológicas para entornos virtuales inmersivos.", type: "ASSET", domain: "CULTURE", relevance: 88, tags: ["3d", "art", "creative"] },
    { id: "4", title: "Monitor de Red Neural StarSeed", description: "Herramienta de diagnóstico en tiempo real para analizar la salud y sincronía de los nodos de la red.", type: "APP", domain: "SYSTEM", relevance: 92, tags: ["dev", "network", "tool"] },
    { id: "5", title: "Manifiesto Ontocrático v3.1", description: "Documento fundacional que define los principios de mérito, transparencia y gobernanza descentralizada de StarSeed.", type: "DOC", domain: "POLITICS", relevance: 97, tags: ["ontocracy", "manifesto", "governance"] },
    { id: "6", title: "Física Cuántica Aplicada: Guía Avanzada", description: "Tratado completo sobre entrelazamiento cuántico, no-localidad y sus implicaciones para sistemas conscientes.", type: "ARTICLE", domain: "EDUCATION", relevance: 91, tags: ["quantum", "physics", "consciousness"] },
    { id: "7", title: "Colección Musical: Frequencies 001", description: "Álbum de 12 pistas generadas algorítmicamente con frecuencias de resonancia binaural para estados elevados.", type: "AUDIO", domain: "CULTURE", relevance: 84, tags: ["music", "binaural", "generative"] },
    { id: "8", title: "API: Exocortex Personal v0.9", description: "Interfaz para conectar agentes IA personales con el grafo de conocimiento colectivo de StarSeed.", type: "APP", domain: "SYSTEM", relevance: 89, tags: ["api", "ai", "exocortex"] },
    { id: "9", title: "Curso: Permacultura Digital Regenerativa", description: "Aplicación de principios de permacultura al diseño de sistemas digitales sostenibles y comunidades en red.", type: "COURSE", domain: "EDUCATION", relevance: 86, tags: ["permaculture", "ecology", "systems"] },
    { id: "10", title: "Exposición: Geometría Sagrada Generativa", description: "40 obras de arte generativo basadas en patrones de la naturaleza con código fuente abierto para replicar.", type: "ASSET", domain: "CULTURE", relevance: 80, tags: ["sacred-geometry", "generative", "open-source"] },
    { id: "11", title: "Constitución de Seeds: Economía Libre", description: "Protocolo económico basado en contribución real, con mecanismos anti-acumulación y flujo libre de recursos en la red.", type: "DOC", domain: "POLITICS", relevance: 94, tags: ["economy", "seeds", "anti-monopoly"] },
];

export default function ExplorerPage() {
    const [query, setQuery] = useState("");
    const [activeDomain, setActiveDomain] = useState<Domain>('ALL');
    const [activeAgent, setActiveAgent] = useState<AgentPersona>('RESEARCHER');
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = () => {
        setIsSearching(true);
        // Simulate AI search delay
        setTimeout(() => setIsSearching(false), 1500);
    };

    const handleReplicate = (itemTitle: string) => {
        toast.success(`"${itemTitle}" replicado en tu Biblioteca.`);
    };

    const filteredResults = mockResults.filter(r =>
        (activeDomain === 'ALL' || r.domain === activeDomain) &&
        (r.title.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()))
    );

    return (
        <div className="flex flex-col min-h-screen pb-20 px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,2vw,2rem)] w-full mx-auto gap-[clamp(1.5rem,3vw,3rem)]">

            {/* --- HERO SECTION: Neural Search --- */}
            <div className="flex flex-col items-center justify-center gap-[clamp(1rem,2vw,2rem)] mt-[clamp(1.5rem,3vw,4rem)] w-full">

                <div className="text-center space-y-[clamp(0.25rem,0.75vw,1rem)] relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center">
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="p-2.5 rounded-2xl bg-primary/20 text-primary backdrop-blur-md">
                            <Compass className="w-8 h-8" />
                        </div>
                        <Badge variant="outline" className="border-primary/30 text-primary/80 tracking-widest uppercase text-[10px] font-semibold">
                            Red Global
                        </Badge>
                    </div>
                    {/* Tokenizado: from-white era ilegible en temas claros (blanco sobre crema) */}
                    <h1 className="page-title font-headline text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/40 filter drop-shadow-[0_0_20px_hsl(var(--primary-hsl)/0.25)]">
                        Explorador Universal
                    </h1>
                    <p className="page-subtitle text-muted-foreground mx-auto">
                        Navega por el conocimiento colectivo, perfiles destacados, y herramientas del ecosistema.
                    </p>
                </div>

                {/* Neural Input Interface */}
                <div className="w-full max-w-3xl relative z-10 mt-6">
                    {/* Context/Agent Ring */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md border border-primary/30 px-4 py-1.5 rounded-full flex items-center gap-2 text-xs font-medium text-primary shadow-[0_0_15px_rgba(56,189,248,0.2)]">
                        <Bot className="w-3 h-3" />
                        <span className="text-muted-foreground">Agente Activo:</span>
                        <Select value={activeAgent} onValueChange={(v) => setActiveAgent(v as AgentPersona)}>
                            <SelectTrigger className="h-6 border-0 bg-transparent text-primary p-0 text-xs w-auto gap-1 focus:ring-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-black/90 border-white/10">
                                <SelectItem value="RESEARCHER">Investigador Riguroso</SelectItem>
                                <SelectItem value="CREATIVE">Musa Creativa</SelectItem>
                                <SelectItem value="ACTIVIST">Activista Social</SelectItem>
                                <SelectItem value="SYSTEM_ARCHITECT">Arquitecto de Sistemas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Search Controls */}
                    <div className="flex flex-col md:flex-row gap-4 relative z-20">
                        <div className="flex-1 relative group">
                            <div className="absolute inset-0 bg-primary/20 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-xl pointer-events-none" />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5 group-focus-within:text-primary transition-colors" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Busca nodos, artículos, herramientas, personas o parámetros globales..."
                                className="w-full pl-12 pr-12 h-14 md:h-16 text-base md:text-lg backdrop-blur-xl bg-background/40 border-primary/20 focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/30 text-center"
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <Button
                                size="icon"
                                variant="ghost"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary btn-pill"
                            >
                                <Mic className="w-5 h-5" />
                            </Button>
                        </div>
                        <Button onClick={handleSearch} size="lg" className="h-14 px-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all duration-300">
                            {isSearching ? <Sparkles className="w-5 h-5 animate-spin" /> : "Explorar"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap justify-center gap-2 md:gap-4 px-4">
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
                            "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border",
                            activeDomain === scope.id
                                ? "bg-primary text-primary-foreground border-primary shadow-lg scale-105"
                                : "bg-background/30 text-muted-foreground border-white/10 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <scope.icon className="w-4 h-4" />
                        {scope.label}
                    </button>
                ))}
            </div>

            {/* --- RESULTS MATRIX --- */}
            <div className="space-y-6 px-[clamp(0.5rem,1vw,1rem)] w-full flex-1 flex flex-col items-center">
                <div className="flex items-center justify-between text-[clamp(0.8rem,1vw,1rem)] text-muted-foreground border-b border-white/10 pb-3 w-full max-w-screen-3xl">
                    <span className="font-semibold text-white/80 tracking-widest uppercase">Resultados ({filteredResults.length})</span>
                    <div className="flex items-center gap-2 cursor-pointer hover:text-white bg-white/5 px-4 py-1.5 rounded-full border border-white/10 transition-colors"><Filter className="w-4 h-4" /> Filtros Avanzados</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-[clamp(1rem,2vw,2rem)] w-full max-w-screen-3xl overflow-hidden mt-4">
                    {filteredResults.map((result) => (
                        <GlassCard key={result.id} className="p-0 flex flex-col overflow-hidden group hover:border-primary/50 transition-colors h-full shadow-lg">
                            {/* Visual/Icon Top Area */}
                            <div className={cn(
                                "w-full h-28 relative overflow-hidden flex flex-col items-center justify-center p-4",
                                result.domain === 'POLITICS' && "bg-gradient-to-br from-orange-500/20 to-red-600/10 text-orange-400 border-b border-orange-500/20",
                                result.domain === 'EDUCATION' && "bg-gradient-to-br from-blue-500/20 to-cyan-600/10 text-blue-400 border-b border-blue-500/20",
                                result.domain === 'CULTURE' && "bg-gradient-to-br from-purple-500/20 to-pink-600/10 text-purple-400 border-b border-purple-500/20",
                                result.domain === 'SYSTEM' && "bg-gradient-to-br from-emerald-500/20 to-green-600/10 text-emerald-400 border-b border-emerald-500/20",
                            )}>
                                {/* Inner glow/pattern */}
                                <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '12px 12px' }} />
                                <div className="relative z-10 p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 group-hover:scale-110 transition-transform duration-500">
                                    <BrainCircuit className="w-8 h-8 opacity-90" />
                                </div>
                            </div>

                            {/* Main Content (Centered) */}
                            <div className="flex-1 p-[clamp(1rem,1.5vw,1.5rem)] flex flex-col items-center text-center gap-3 w-full">
                                {/* Type & Domain */}
                                <div className="flex items-center justify-center gap-2 mb-2 w-full flex-wrap">
                                    <Badge variant="outline" className="text-[10px] md:text-sm py-0.5 h-6 border-white/10 bg-black/20 uppercase font-bold tracking-wider">{result.type}</Badge>
                                    <span className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-[0.2em] font-bold mx-2">{result.domain}</span>
                                    <span className="text-[10px] md:text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/30 shrink-0 font-bold tracking-widest">{result.relevance}% Match</span>
                                </div>

                                <h3 className="font-bold text-[clamp(1.1rem,1.5vw,1.4rem)] leading-snug group-hover:text-primary transition-colors text-balance mb-2 px-2 w-full">{result.title}</h3>

                                <p className="text-[clamp(0.85rem,1vw,1rem)] text-white/60 line-clamp-4 md:line-clamp-5 w-full flex-1 leading-relaxed px-2">{result.description}</p>

                                {/* Tags */}
                                <div className="flex flex-wrap justify-center gap-[clamp(0.25rem,0.5vw,0.5rem)] mt-auto pt-4 w-full">
                                    {result.tags.map(tag => (
                                        <span key={tag} className="text-[10px] md:text-xs px-2 py-1 rounded-md bg-white/5 text-muted-foreground border border-white/5 hover:bg-white/10 hover:text-white transition-colors truncate max-w-[120px]">#{tag}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-[clamp(1rem,1.5vw,1.5rem)] border-t border-white/10 flex flex-row items-center justify-between gap-3 md:gap-4 bg-black/40 mt-auto w-full">
                                <Button onClick={() => handleReplicate(result.title)} size="default" className="flex-1 gap-2 bg-primary/15 hover:bg-primary/30 text-primary border border-primary/30 transition-all font-bold tracking-wider uppercase text-xs h-10">
                                    <Copy className="w-4 h-4" /> Replicar Nodo
                                </Button>
                                <Button size="default" variant="ghost" className="flex-1 gap-2 bg-white/5 hover:bg-white/15 text-white border border-white/20 transition-all font-bold tracking-wider uppercase text-xs h-10">
                                    <ArrowRight className="w-4 h-4" /> Inspeccionar
                                </Button>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            </div>
        </div>
    );
}
