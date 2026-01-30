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
    BrainCircuit
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
    {
        id: "4",
        title: "Monitor de Red Neural",
        description: "Herramienta de diagnóstico para nodos StarSeed.",
        type: "APP",
        domain: "SYSTEM",
        relevance: 92,
        tags: ["dev", "network", "tool"]
    },
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
        <div className="flex flex-col min-h-screen pb-20 p-4 md:p-8 max-w-[1200px] mx-auto gap-12">

            {/* --- HERO SECTION: Neural Search --- */}
            <div className="flex flex-col items-center justify-center gap-8 mt-10 md:mt-20">

                <div className="text-center space-y-4">
                    <h1 className="text-5xl md:text-7xl font-bold font-headline text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 filter drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                        Explorador Universal
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        Accede a la inteligencia colectiva de la red. Busca conceptos, programas y recursos en cualquier dimensión.
                    </p>
                </div>

                {/* Neural Input Interface */}
                <div className="w-full max-w-3xl relative z-10">
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

                    <div className={cn(
                        "relative group transition-all duration-500",
                        isSearching ? "scale-[1.02]" : "hover:scale-[1.01]"
                    )}>
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-indigo-500 rounded-full opacity-30 group-hover:opacity-60 blur-md transition-opacity duration-500 animate-pulse" />
                        <div className="relative flex items-center bg-black/80 backdrop-blur-xl border border-white/10 rounded-full p-2 shadow-2xl">
                            <Search className="w-6 h-6 text-muted-foreground ml-4" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Busca cualquier concepto, red o archivo..."
                                className="flex-1 border-0 bg-transparent text-lg h-14 focus-visible:ring-0 placeholder:text-muted-foreground/50"
                            />
                            <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full hover:bg-white/10 text-muted-foreground hover:text-primary"><Mic className="w-5 h-5" /></Button>
                            <Button onClick={handleSearch} size="lg" className="rounded-full px-8 bg-white/10 hover:bg-white/20 text-white border border-white/5 ml-2">
                                {isSearching ? <Sparkles className="w-4 h-4 animate-spin" /> : "Explorar"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Domain Scopes */}
                <div className="flex flex-wrap justify-center gap-2 md:gap-4">
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
                                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border border-transparent",
                                activeDomain === scope.id
                                    ? "bg-white/10 text-white border-white/20 shadow-lg scale-105"
                                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                            )}
                        >
                            <scope.icon className="w-4 h-4" />
                            {scope.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- RESULTS MATRIX --- */}
            <div className="space-y-6">
                <div className="flex items-center justify-between text-sm text-muted-foreground border-b border-white/5 pb-2">
                    <span>Resultados ({filteredResults.length})</span>
                    <div className="flex items-center gap-2 cursor-pointer hover:text-white"><Filter className="w-3 h-3" /> Filtros Avanzados</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    {filteredResults.map((result) => (
                        <GlassCard key={result.id} className="p-0 flex flex-col md:flex-row overflow-hidden group hover:border-primary/50 transition-colors">
                            {/* Visual/Icon Area */}
                            <div className={cn(
                                "w-full md:w-32 bg-gradient-to-br flex items-center justify-center p-6",
                                result.domain === 'POLITICS' && "from-orange-500/20 to-red-600/10 text-orange-400",
                                result.domain === 'EDUCATION' && "from-blue-500/20 to-cyan-600/10 text-blue-400",
                                result.domain === 'CULTURE' && "from-purple-500/20 to-pink-600/10 text-purple-400",
                                result.domain === 'SYSTEM' && "from-emerald-500/20 to-green-600/10 text-emerald-400",
                            )}>
                                <BrainCircuit className="w-10 h-10 opacity-80" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-5 flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px] py-0 h-5 border-white/10">{result.type}</Badge>
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{result.domain}</span>
                                        </div>
                                        <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{result.title}</h3>
                                    </div>
                                    <span className="text-xs font-mono text-emerald-400">{result.relevance}% Match</span>
                                </div>

                                <p className="text-sm text-gray-400 line-clamp-2">{result.description}</p>

                                <div className="flex gap-2 mt-auto pt-2">
                                    {result.tags.map(tag => (
                                        <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="p-4 border-l border-white/5 flex flex-col items-center justify-center gap-2 bg-black/20">
                                <Button onClick={() => handleReplicate(result.title)} size="sm" className="w-full gap-2 bg-white/5 hover:bg-white/20 text-white border border-white/10">
                                    <Copy className="w-3 h-3" /> Replicar
                                </Button>
                                <Button size="sm" variant="ghost" className="w-full gap-2 text-muted-foreground hover:text-white">
                                    <ArrowRight className="w-3 h-3" /> Abrir
                                </Button>
                            </div>
                        </GlassCard>
                    ))}
                </div>
            </div>
        </div>
    );
}
