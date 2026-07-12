"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
    Bot,
    Filter,
    BrainCircuit,
    Compass,
    Send,
    Settings2,
    Loader2,
    Lightbulb,
    Wand2,
    User as UserIcon,
    MessageSquare,
    Library,
    Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAurora } from "@/components/aurora/aurora-provider";
import {
    universalSearch,
    emptyResults,
    totalHits,
    SEARCH_CATEGORIES,
    type UniversalSearchResults,
    type SearchCategoryKey,
    type SearchHit,
} from "@/lib/search/universal-search";
import { UserDirectoryResults } from "@/components/hub/user-directory-results";
import {
    type ExplorerDomain,
    DOMAIN_CONTEXT,
    loadExplorerConfig,
    saveExplorerConfig,
    getContextualRecommendations,
    buildExplorerSystemPrompt,
    type ExplorerAuroraConfig,
} from "./aurora-explorer";

// --- Types ---

type Domain = ExplorerDomain;
type AgentPersona = 'RESEARCHER' | 'CREATIVE' | 'ACTIVIST' | 'SYSTEM_ARCHITECT';

// Icono lucide por categoría de la búsqueda universal (resultados reales).
const CAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    User: UserIcon,
    Globe,
    MessageSquare,
    BookOpen,
    Library,
    Cpu,
    Sparkles,
    Terminal,
};

// Color de cabecera de tarjeta según la categoría real (mantiene la estética).
const CAT_TONE: Record<SearchCategoryKey, string> = {
    perfiles: "from-orange-500/20 to-red-600/10 text-orange-400 border-orange-500/20",
    paginas: "from-blue-500/20 to-cyan-600/10 text-blue-400 border-blue-500/20",
    publicaciones: "from-sky-500/20 to-indigo-600/10 text-sky-400 border-sky-500/20",
    temas: "from-blue-500/20 to-cyan-600/10 text-blue-400 border-blue-500/20",
    memorias: "from-purple-500/20 to-pink-600/10 text-purple-400 border-purple-500/20",
    cerebros: "from-emerald-500/20 to-green-600/10 text-emerald-400 border-emerald-500/20",
    apps: "from-emerald-500/20 to-green-600/10 text-emerald-400 border-emerald-500/20",
    lienzos: "from-purple-500/20 to-pink-600/10 text-purple-400 border-purple-500/20",
};

// Qué categorías reales pertenecen a cada dominio del Explorador (filtro).
const DOMAIN_CATS: Record<Domain, SearchCategoryKey[]> = {
    ALL: ["perfiles", "paginas", "publicaciones", "temas", "memorias", "cerebros", "apps", "lienzos"],
    POLITICS: ["perfiles", "paginas", "publicaciones"],
    EDUCATION: ["temas", "publicaciones", "paginas"],
    CULTURE: ["lienzos", "publicaciones", "paginas"],
    SYSTEM: ["apps", "cerebros", "memorias"],
};

interface FlatResult extends SearchHit {
    category: SearchCategoryKey;
    catLabel: string;
}

// Aurora persona (tono) → matices del system prompt para respuestas inline.
const PERSONA_TONE: Record<AgentPersona, string> = {
    RESEARCHER: "Adopta un tono riguroso y preciso; cita y estructura.",
    CREATIVE: "Adopta un tono inspirador y creativo; abre posibilidades.",
    ACTIVIST: "Adopta un tono comprometido y movilizador; piensa en lo colectivo.",
    SYSTEM_ARCHITECT: "Adopta un tono técnico y sistémico; piensa en estructura y eficiencia.",
};

interface AuroraTurn { role: "user" | "aurora"; text: string }

export default function ExplorerPage() {
    const aurora = useAurora();

    const [query, setQuery] = useState("");
    const [activeDomain, setActiveDomain] = useState<Domain>('ALL');
    const [activeAgent, setActiveAgent] = useState<AgentPersona>('RESEARCHER');

    // Resultados reales (Supabase, vía universalSearch).
    const [results, setResults] = useState<UniversalSearchResults>(emptyResults());
    const [isSearching, setIsSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const lastRunRef = useRef("");

    // Opciones configurables (qué IA / cerebro / sentidos usa Aurora aquí).
    const [cfg, setCfg] = useState<ExplorerAuroraConfig>(loadExplorerConfig);
    useEffect(() => { saveExplorerConfig(cfg); }, [cfg]);

    // Aurora: input "Pregúntale a Aurora" + transcripción inline.
    const [auroraInput, setAuroraInput] = useState("");
    const [auroraBusy, setAuroraBusy] = useState(false);
    const [auroraTurns, setAuroraTurns] = useState<AuroraTurn[]>([]);

    // Recomendaciones contextuales por área (generadas vía chat()).
    const [recos, setRecos] = useState<string[]>([]);
    const [recosFromAI, setRecosFromAI] = useState(false);
    const [recosLoading, setRecosLoading] = useState(false);

    // ── Búsqueda real (Supabase). Mantiene la estética del Explorador. ──
    const runSearch = useCallback(async (q: string) => {
        const term = q.trim();
        lastRunRef.current = term;
        if (term.length < 2) {
            setResults(emptyResults());
            setSearched(false);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        try {
            const res = await universalSearch(term);
            if (lastRunRef.current === term) {
                setResults(res);
                setSearched(true);
            }
        } finally {
            if (lastRunRef.current === term) setIsSearching(false);
        }
    }, []);

    const handleSearch = useCallback(() => { void runSearch(query); }, [query, runSearch]);

    // Debounce de la búsqueda al teclear (búsqueda viva, como el Hub).
    useEffect(() => {
        const t = setTimeout(() => { void runSearch(query); }, 320);
        return () => clearTimeout(t);
    }, [query, runSearch]);

    // ── Recomendaciones contextuales por dominio (chat() real + fallback). ──
    useEffect(() => {
        let cancelled = false;
        const ctrl = new AbortController();
        setRecosLoading(true);
        getContextualRecommendations(activeDomain, cfg, { query, signal: ctrl.signal })
            .then((r) => {
                if (cancelled) return;
                setRecos(r.suggestions);
                setRecosFromAI(r.fromAI);
            })
            .finally(() => { if (!cancelled) setRecosLoading(false); });
        return () => { cancelled = true; ctrl.abort(); };
        // Regenera al cambiar de área o de proveedor/cerebro (no en cada tecla).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDomain, cfg.providerId, cfg.brain]);

    // Aplana los resultados reales y los filtra por el dominio activo.
    const flatResults: FlatResult[] = useMemo(() => {
        const allowed = new Set(DOMAIN_CATS[activeDomain]);
        const out: FlatResult[] = [];
        for (const cat of SEARCH_CATEGORIES) {
            if (!allowed.has(cat.key as SearchCategoryKey)) continue;
            for (const hit of results[cat.key as SearchCategoryKey] ?? []) {
                out.push({ ...hit, category: cat.key as SearchCategoryKey, catLabel: cat.label });
            }
        }
        return out;
    }, [results, activeDomain]);

    const total = totalHits(results);
    const showEmpty = searched && !isSearching && flatResults.length === 0;

    // ── "Pregúntale a Aurora": responde (chat real) + ACTÚA (directivas). ──
    const askAurora = useCallback(async (raw?: string) => {
        const text = (raw ?? auroraInput).trim();
        if (!text || auroraBusy) return;
        setAuroraInput("");
        setAuroraTurns((t) => [...t, { role: "user" as const, text }].slice(-12));
        setAuroraBusy(true);
        try {
            // Camino preferente: el motor de Aurora (responde + ejecuta acciones
            // reales del OS: navegar, abrir, organizar, buscar memoria…).
            if (aurora?.enabled && cfg.canAct) {
                await aurora.runCommand(text);
                const reply = (aurora.lastReply || "").trim() || "Hecho.";
                setAuroraTurns((t) => [...t, { role: "aurora" as const, text: reply }].slice(-12));
                return;
            }

            // Camino de texto (sin motor activo o acciones desactivadas): respuesta
            // real vía chat(), con el contexto del área. Si Aurora puede actuar,
            // ejecutamos las directivas [[ACCION: …]] que emita el modelo.
            const { chat } = await import("@/ai/client/chat");
            const { actionsSystemPromptSection } = await import("@/lib/aurora/actions");
            const system =
                buildExplorerSystemPrompt(activeDomain, cfg) +
                "\n" + PERSONA_TONE[activeAgent] +
                (cfg.canAct ? "\n\n" + actionsSystemPromptSection() : "");
            const res = await chat({
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: text },
                ],
                providerId: cfg.providerId || undefined,
                temperature: 0.5,
                maxTokens: 500,
            });
            let reply = (res?.text || "").trim();

            // Ejecuta acciones reales si Aurora puede actuar y el motor existe.
            if (cfg.canAct && aurora) {
                try {
                    const { stripDirectives } = await import("@/lib/aurora/actions");
                    await aurora.runDirectives(reply);
                    reply = stripDirectives(reply).trim() || "Hecho.";
                } catch { /* el motor degradó: mostramos el texto tal cual */ }
            }
            setAuroraTurns((t) => [...t, { role: "aurora" as const, text: reply || "…" }].slice(-12));
        } catch (e: any) {
            const msg = (e?.message ? String(e.message) : "").trim();
            const friendly = /proveedor|provider|activ/i.test(msg)
                ? "Aún no tienes un proveedor de IA activo. Configúralo en Ajustes → IA & Modelos para que pueda conversar y actuar aquí."
                : "No pude contactar con la IA ahora mismo. Revisa tu proveedor en Ajustes → IA & Modelos.";
            setAuroraTurns((t) => [...t, { role: "aurora" as const, text: friendly }].slice(-12));
        } finally {
            setAuroraBusy(false);
        }
    }, [auroraInput, auroraBusy, aurora, cfg, activeDomain, activeAgent]);

    const ctx = DOMAIN_CONTEXT[activeDomain] ?? DOMAIN_CONTEXT.ALL;

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

            {/* --- AURORA · capa inteligente per-contexto --- */}
            <div className="w-full max-w-3xl mx-auto relative z-10 -mt-2">
                <GlassCard className="p-[clamp(1rem,1.6vw,1.5rem)] border-primary/20 bg-gradient-to-br from-primary/[0.06] via-transparent to-cyan-500/[0.05]">
                    {/* Cabecera: identidad + opciones configurables */}
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/15 text-primary shrink-0">
                                <BrainCircuit className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-foreground/90 leading-tight">Pregúntale a Aurora</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                    {ctx.label} · {cfg.canAct ? "puede actuar por ti" : "solo responde"}
                                </p>
                            </div>
                        </div>

                        {/* Opciones configurables (qué IA / cerebro / sentidos aquí) */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-primary shrink-0">
                                    <Settings2 className="w-4 h-4" /> Opciones
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 bg-black/90 border-white/10 backdrop-blur-xl space-y-4">
                                <div>
                                    <p className="text-sm font-bold text-foreground/90 mb-0.5">Aurora en este área</p>
                                    <p className="text-[11px] text-muted-foreground">Configura qué IA, cerebro y sentidos usa Aurora aquí.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">IA / Proveedor</label>
                                    <Select value={cfg.providerId || "active"} onValueChange={(v) => setCfg((c) => ({ ...c, providerId: v === "active" ? "" : v }))}>
                                        <SelectTrigger className="h-9 bg-background/40 border-white/10 text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-black/90 border-white/10">
                                            <SelectItem value="active">El proveedor activo</SelectItem>
                                            <SelectItem value="starseed">StarSeed</SelectItem>
                                            <SelectItem value="ollama">Ollama (local)</SelectItem>
                                            <SelectItem value="deepseek">DeepSeek</SelectItem>
                                            <SelectItem value="groq">Groq</SelectItem>
                                            <SelectItem value="openai">OpenAI</SelectItem>
                                            <SelectItem value="anthropic">Anthropic</SelectItem>
                                            <SelectItem value="google">Google (Gemini)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">Cerebro / contexto</label>
                                    <Input
                                        value={cfg.brain}
                                        onChange={(e) => setCfg((c) => ({ ...c, brain: e.target.value }))}
                                        placeholder="Cerebro principal"
                                        className="h-9 bg-background/40 border-white/10 text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">Sentidos</label>
                                    {([
                                        ["screen", "Pantalla"],
                                        ["mic", "Micrófono"],
                                        ["camera", "Cámara"],
                                    ] as const).map(([key, label]) => (
                                        <div key={key} className="flex items-center justify-between">
                                            <span className="text-sm text-foreground/80">{label}</span>
                                            <Switch
                                                checked={cfg.senses[key]}
                                                onCheckedChange={(val) => setCfg((c) => ({ ...c, senses: { ...c.senses, [key]: val } }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                                    <span className="text-sm text-foreground/80">Permitir que actúe</span>
                                    <Switch checked={cfg.canAct} onCheckedChange={(val) => setCfg((c) => ({ ...c, canAct: val }))} />
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Transcripción inline (solo cuando hay conversación) */}
                    {auroraTurns.length > 0 && (
                        <div className="space-y-2 mb-3 max-h-56 overflow-y-auto pr-1">
                            {auroraTurns.map((t, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "text-sm rounded-xl px-3 py-2 max-w-[92%]",
                                        t.role === "user"
                                            ? "ml-auto bg-primary/15 text-foreground/90 border border-primary/20"
                                            : "mr-auto bg-white/5 text-foreground/80 border border-white/10"
                                    )}
                                >
                                    {t.text}
                                </div>
                            ))}
                            {auroraBusy && (
                                <div className="mr-auto bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aurora está pensando…
                                </div>
                            )}
                        </div>
                    )}

                    {/* Input de Aurora */}
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/70" />
                            <Input
                                value={auroraInput}
                                onChange={(e) => setAuroraInput(e.target.value)}
                                placeholder="Pídele a Aurora que busque, te lleve a un sitio u organice algo…"
                                className="pl-9 h-11 bg-background/40 border-primary/20 focus-visible:ring-1 focus-visible:ring-primary/40"
                                onKeyDown={(e) => { if (e.key === "Enter") void askAurora(); }}
                                disabled={auroraBusy}
                            />
                        </div>
                        <Button onClick={() => void askAurora()} disabled={auroraBusy || !auroraInput.trim()} className="h-11 px-4 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                            {auroraBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                    </div>

                    {/* Recomendaciones contextuales por área */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                            <Lightbulb className="w-3.5 h-3.5 text-primary/70" />
                            Sugerencias
                            {recosLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                            {!recosLoading && !recosFromAI && recos.length > 0 && (
                                <span className="text-[10px] text-muted-foreground/60 normal-case font-normal">(básicas · activa una IA)</span>
                            )}
                        </span>
                        {recos.map((s, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => void askAurora(s)}
                                className="text-xs px-3 py-1.5 rounded-full bg-white/5 text-foreground/80 border border-white/10 hover:border-primary/40 hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </GlassCard>
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
                    <span className="font-semibold text-white/80 tracking-widest uppercase">Resultados ({flatResults.length})</span>
                    <div className="flex items-center gap-2 cursor-pointer hover:text-white bg-white/5 px-4 py-1.5 rounded-full border border-white/10 transition-colors"><Filter className="w-4 h-4" /> Filtros Avanzados</div>
                </div>

                {/* Estado inicial: sin búsqueda todavía */}
                {!searched && !isSearching && query.trim().length < 2 && (
                    <div className="w-full max-w-2xl rounded-2xl border border-white/5 bg-gradient-to-br from-primary/[0.04] via-transparent to-cyan-500/[0.04] backdrop-blur p-10 text-center">
                        <Compass className="w-10 h-10 mx-auto mb-3 text-primary/70" />
                        <p className="text-sm font-semibold text-foreground/90">Explora el conocimiento colectivo</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto text-balance">
                            Escribe al menos 2 caracteres para buscar perfiles, páginas, publicaciones,
                            conocimiento, memorias, cerebros, apps y lienzos de toda la red — o pídele a Aurora arriba.
                        </p>
                    </div>
                )}

                {/* Estado vacío: buscó pero no hay resultados en este dominio */}
                {showEmpty && (
                    <div className="w-full max-w-2xl rounded-2xl border border-white/5 bg-black/20 backdrop-blur p-10 text-center">
                        <Search className="w-8 h-8 mx-auto mb-3 text-muted-foreground/60" />
                        <p className="text-sm font-semibold text-foreground/90">Sin resultados para “{query.trim()}”</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {activeDomain !== "ALL"
                                ? "Prueba en otro área (arriba) o cambia el término."
                                : "Prueba con otro término o pídele a Aurora que busque por ti."}
                        </p>
                    </div>
                )}

                {/* Cargando */}
                {isSearching && flatResults.length === 0 && (
                    <div className="w-full flex items-center justify-center py-16 text-muted-foreground gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> Buscando en la red…
                    </div>
                )}

                {/* Directorio de usuarios (os_profiles): avatar + Mensaje/Seguir — solo
                    cuando el dominio activo incluye "perfiles" (ALL/POLITICS). */}
                {DOMAIN_CATS[activeDomain].includes("perfiles") && (
                    <div className="w-full max-w-screen-3xl">
                        <UserDirectoryResults query={query} />
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-[clamp(1rem,2vw,2rem)] w-full max-w-screen-3xl overflow-hidden mt-4">
                    {flatResults.map((result) => {
                        const Icon = CAT_ICONS[SEARCH_CATEGORIES.find((c) => c.key === result.category)?.icon || "Sparkles"] || BrainCircuit;
                        return (
                        <GlassCard key={`${result.category}-${result.id}`} className="p-0 flex flex-col overflow-hidden group hover:border-primary/50 transition-colors h-full shadow-lg">
                            {/* Visual/Icon Top Area */}
                            <div className={cn(
                                "w-full h-28 relative overflow-hidden flex flex-col items-center justify-center p-4 bg-gradient-to-br border-b",
                                CAT_TONE[result.category],
                            )}>
                                {/* Inner glow/pattern */}
                                <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '12px 12px' }} />
                                <div className="relative z-10 p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 group-hover:scale-110 transition-transform duration-500">
                                    <Icon className="w-8 h-8 opacity-90" />
                                </div>
                            </div>

                            {/* Main Content (Centered) */}
                            <div className="flex-1 p-[clamp(1rem,1.5vw,1.5rem)] flex flex-col items-center text-center gap-3 w-full">
                                {/* Type & Domain */}
                                <div className="flex items-center justify-center gap-2 mb-2 w-full flex-wrap">
                                    <Badge variant="outline" className="text-[10px] md:text-sm py-0.5 h-6 border-white/10 bg-black/20 uppercase font-bold tracking-wider">{result.catLabel}</Badge>
                                </div>

                                <h3 className="font-bold text-[clamp(1.1rem,1.5vw,1.4rem)] leading-snug group-hover:text-primary transition-colors text-balance mb-2 px-2 w-full">{result.label}</h3>

                                {result.sub && (
                                    <p className="text-[clamp(0.85rem,1vw,1rem)] text-white/60 line-clamp-4 md:line-clamp-5 w-full flex-1 leading-relaxed px-2">{result.sub}</p>
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="p-[clamp(1rem,1.5vw,1.5rem)] border-t border-white/10 flex flex-row items-center justify-between gap-3 md:gap-4 bg-black/40 mt-auto w-full">
                                <Button asChild size="default" className="flex-1 gap-2 bg-primary/15 hover:bg-primary/30 text-primary border border-primary/30 transition-all font-bold tracking-wider uppercase text-xs h-10">
                                    <Link href={result.href}><ArrowRight className="w-4 h-4" /> Abrir</Link>
                                </Button>
                                <Button
                                    onClick={() => void askAurora(`Cuéntame más sobre "${result.label}"`)}
                                    size="default"
                                    variant="ghost"
                                    className="flex-1 gap-2 bg-white/5 hover:bg-white/15 text-white border border-white/20 transition-all font-bold tracking-wider uppercase text-xs h-10"
                                >
                                    <Sparkles className="w-4 h-4" /> Aurora
                                </Button>
                            </div>
                        </GlassCard>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
