"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
    motion, AnimatePresence, useReducedMotion, useMotionValue, animate,
    type MotionValue,
} from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import curtain from "@/components/layout/trinity-curtains.module.css";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { ensureAuroraChatLogRecorder } from "@/lib/aurora/aurora-chat-log";
import {
    Sparkles, Brain, Globe, Users, BookOpen, Palette, Cpu, Search,
    ArrowRight, BrainCircuit, Bot, Server, Settings, Plus, ChevronDown,
    Pencil, Maximize2, Minimize2,
    Eye, Ear, FileText, Activity, Mic, HardDrive, Terminal, Wifi,
    Plug, Network, Link2, Unplug, SlidersHorizontal, ToggleLeft, ToggleRight,
    Shield, Zap, X, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useFullscreen } from "@/hooks/useFullscreen";
import { UniversalEditor } from "@/components/layout/universal-editor";
import { Switch } from "@/components/ui/switch";
import { useAppearance } from "@/context/appearance-context";
import dynamic from "next/dynamic";
const MemoryBrain3D = dynamic(() => import("@/components/exocortex/memory-brain-3d").then((mod) => mod.MemoryBrain3D), { ssr: false });
import { AuroraChatSection } from "@/components/exocortex/aurora-chat-section";

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

// ── AI Senses Types ──────────────────────────────────────────────
interface AISense {
    id: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    enabled: boolean;
}

interface AIConnection {
    id: string;
    label: string;
    type: "ai" | "mcp" | "agent" | "skill" | "connection";
    provider: string;
    enabled: boolean;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}

const DEFAULT_SENSES: AISense[] = [
    { id: "screen", label: "Percepción de Pantalla", description: "Análisis visual del contenido", icon: Eye, color: "cyan", enabled: true },
    { id: "text", label: "Percepción de Texto", description: "Lectura y comprensión contextual", icon: FileText, color: "emerald", enabled: true },
    { id: "logs", label: "Logs del Sistema", description: "Monitoreo de actividad", icon: Terminal, color: "amber", enabled: true },
    { id: "audio", label: "Procesamiento de Audio", description: "Análisis de sonido ambiental", icon: Ear, color: "purple", enabled: false },
    { id: "microphone", label: "Micrófono / Voz", description: "Entrada de voz en tiempo real", icon: Mic, color: "red", enabled: false },
    { id: "memory", label: "Memoria Cognitiva", description: "Contexto persistente local", icon: HardDrive, color: "blue", enabled: true },
    { id: "activity", label: "Monitor de Actividad", description: "Seguimiento de acciones del usuario", icon: Activity, color: "pink", enabled: true },
];

const DEFAULT_CONNECTIONS: AIConnection[] = [
    { id: "ollama", label: "Ollama (Local)", type: "ai", provider: "localhost:11434", enabled: true, icon: Cpu, color: "emerald" },
    { id: "gemini", label: "Gemini API", type: "ai", provider: "Google AI", enabled: true, icon: Sparkles, color: "cyan" },
    { id: "mcp-main", label: "MCP Principal", type: "mcp", provider: "StarSeed Core", enabled: true, icon: Server, color: "amber" },
    { id: "mcp-tools", label: "MCP Herramientas", type: "mcp", provider: "Tools Server", enabled: true, icon: Plug, color: "purple" },
    { id: "agent-architect", label: "Arquitecto", type: "agent", provider: "Sistema", enabled: true, icon: Bot, color: "blue" },
    { id: "agent-creative", label: "Musa Creativa", type: "agent", provider: "Horizon", enabled: true, icon: Palette, color: "pink" },
    { id: "agent-pilot", label: "Piloto del Sistema", type: "agent", provider: "Exocórtex", enabled: false, icon: Zap, color: "amber" },
    { id: "skill-code", label: "Código & Análisis", type: "skill", provider: "Skill Pack", enabled: true, icon: Terminal, color: "cyan" },
    { id: "conn-supabase", label: "Supabase DB", type: "connection", provider: "Cloud", enabled: true, icon: Wifi, color: "emerald" },
    { id: "conn-ipfs", label: "IPFS Network", type: "connection", provider: "P2P", enabled: false, icon: Network, color: "purple" },
];

// ── Swipe-to-close (centro de control) ──────────────────────────────
// Gesto de arrastre que sigue al dedo y cierra al superar el umbral hacia
// el borde de origen de la cortina. Devuelve el MotionValue del eje activo
// (para enlazarlo al `style` del contenedor) + handlers de pointer.
//   dir = 'up' (Zenith) | 'left' (Horizon) | 'right' (Logic)
const SWIPE_THRESHOLD = 80; // px para confirmar el cierre
type SwipeDir = "up" | "left" | "right";

function useSwipeToClose(dir: SwipeDir, onClose: () => void) {
    const reduceMotion = useReducedMotion();
    // `signed` guarda el desplazamiento VISUAL con signo (el que va al style):
    //   arriba => valores negativos en y · izquierda => negativos en x · derecha => positivos en x.
    const signed = useMotionValue(0);
    const axis: "x" | "y" = dir === "up" ? "y" : "x";
    // Signo hacia el borde de cierre: arriba(-y), izquierda(-x), derecha(+x).
    const sign = dir === "right" ? 1 : -1;

    const start = useRef<{ x: number; y: number } | null>(null);
    const dragging = useRef(false);
    // Magnitud (>=0) del avance hacia el borde de cierre; para el umbral.
    const progress = useRef(0);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        start.current = { x: e.clientX, y: e.clientY };
        dragging.current = true;
        progress.current = 0;
        try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current || !start.current) return;
        const delta = axis === "y" ? e.clientY - start.current.y : e.clientX - start.current.x;
        // Solo permitimos movimiento HACIA el borde de cierre (delta*sign > 0).
        const toward = Math.max(0, delta * sign);
        // Resistencia elástica suave para que se sienta líquido.
        const mag = reduceMotion ? toward : toward * (toward > 120 ? 0.85 : 1);
        progress.current = mag;
        signed.set(mag * sign);
    }, [axis, sign, signed, reduceMotion]);

    const finish = useCallback(() => {
        if (!dragging.current) return;
        dragging.current = false;
        start.current = null;
        if (progress.current >= SWIPE_THRESHOLD) {
            onClose();
            signed.set(0); // reset para la próxima apertura
        } else if (reduceMotion) {
            signed.set(0);
        } else {
            animate(signed, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
        progress.current = 0;
    }, [signed, onClose, reduceMotion]);

    const style: { x?: MotionValue<number>; y?: MotionValue<number> } =
        axis === "y" ? { y: signed } : { x: signed };

    return {
        motionStyle: style,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: finish,
            onPointerCancel: finish,
        },
    };
}

// Botón de cierre cristalino reutilizable (X, área táctil >= 44px).
function CurtainCloseButton({ onClose, accent }: { onClose: () => void; accent: string }) {
    return (
        <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={onClose}
            className={cn(curtain.closeBtn, curtain.closeTopRight)}
            style={{ ["--cc" as string]: accent }}
        >
            <X className={curtain.closeIcon} />
        </button>
    );
}

export function ZenithCurtain() {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const isActive = activeEdge === 'zenith';
    const closeCurtain = useCallback(() => setActiveEdge(null), [setActiveEdge]);
    const swipe = useSwipeToClose("up", closeCurtain);
    const [query, setQuery] = useState("");
    const [activeDomain, setActiveDomain] = useState<Domain>('ALL');
    const [editorOpen, setEditorOpen] = useState(false);
    const { isFullscreen, toggle: toggleFullscreen, isSupported: fsSupported } = useFullscreen();
    const { config: appearanceConfig, updateSection: updateAppearanceSection } = useAppearance();
    const aiAssistantVisible = appearanceConfig.assistant?.visible ?? true;

    // AI Senses & Connections state
    const [showSensesPanel, setShowSensesPanel] = useState(false);
    const [senses, setSenses] = useState<AISense[]>(DEFAULT_SENSES);
    const [connections, setConnections] = useState<AIConnection[]>(DEFAULT_CONNECTIONS);
    const [sensesTab, setSensesTab] = useState<"senses" | "connections" | "topology">("senses");
    // Vista principal del Exocórtex: AURORA es la principal (su sección ya lleva
    // el BUSCADOR fusionado dentro — barra Preguntar⇄Buscar). El buscador universal
    // clásico y el Cerebro 3D quedan como vistas secundarias conmutables.
    // (Petición del usuario: al abrir el Exocórtex aparece directamente Aurora,
    // no la versión anterior del buscador.)
    const [mainView, setMainView] = useState<"buscar" | "cerebro" | "aurora">("aurora");

    // Apertura remota: el orbe/widget de Aurora (o cualquier superficie del OS)
    // dispara `starseed:open-aurora-exocortex` → abrimos la cortina Zenith con
    // la sección Aurora ENFOCADA (mismo patrón de secciones de la cortina).
    // Además arrancamos aquí el registrador del historial de Aurora
    // (localStorage) porque la cortina vive SIEMPRE montada en el layout raíz:
    // así el "Registro" captura la conversación aunque la cortina esté cerrada.
    useEffect(() => {
        if (typeof window === "undefined") return;
        ensureAuroraChatLogRecorder();
        const onOpenAurora = () => {
            setMainView("aurora");
            try { setActiveEdge("zenith"); } catch { /* defensivo */ }
        };
        window.addEventListener(AURORA_EXOCORTEX_OPEN_EVENT, onOpenAurora);
        return () => window.removeEventListener(AURORA_EXOCORTEX_OPEN_EVENT, onOpenAurora);
    }, [setActiveEdge]);

    const toggleSense = (id: string) => {
        setSenses(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
    };

    const toggleConnection = (id: string) => {
        setConnections(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
    };

    const filteredResults = mockResults.filter(r =>
        (activeDomain === 'ALL' || r.domain === activeDomain) &&
        (r.title.toLowerCase().includes(query.toLowerCase()) || r.description.toLowerCase().includes(query.toLowerCase()))
    );

    const activeSenseCount = senses.filter(s => s.enabled).length;
    const activeConnectionCount = connections.filter(c => c.enabled).length;

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
                        className={cn(
                            curtain.curtainContainer,
                            "fixed left-1/2 -translate-x-1/2 z-[90] pointer-events-auto rounded-3xl overflow-hidden box-border",
                            "shadow-[0_20px_50px_rgba(6,182,212,0.3)] border border-cyan-500/30 text-cyan-50",
                            // Material StarSeed: aro neón Zenith que respira suave (azul #007FFF)
                            "ss-neon ss-neon--zenith",
                            // Anclado dentro del viewport + safe-area (nunca se sale).
                            "top-[max(0.75rem,env(safe-area-inset-top))] w-[min(98vw,1600px)] max-w-[100vw]",
                            "h-[min(92vh,calc(100dvh-1.5rem))]"
                        )}
                    >
                      {/* Capa de arrastre: sigue al dedo (swipe hacia arriba cierra). */}
                      <motion.div className="absolute inset-0" style={swipe.motionStyle}>
                        {/* Background — cristal líquido profundo teñido Zenith */}
                        <div className="absolute inset-0 rounded-3xl bg-black/85 backdrop-blur-2xl ss-crystal ss-crystal--deep ss-tone--zenith" />
                        <div className="absolute inset-0 bg-gradient-to-b from-cyan-950/50 via-transparent to-cyan-950/20 pointer-events-none" />

                        {/* Tirador de swipe (Zenith cierra hacia ARRIBA) + botón de cierre */}
                        <div
                            className={curtain.grabberTop}
                            style={{ ["--cc" as string]: "#22d3ee" }}
                            {...swipe.handlers}
                            role="presentation"
                        />
                        <CurtainCloseButton onClose={closeCurtain} accent="#22d3ee" />

                        <div className="relative z-10 w-full h-full flex flex-col text-cyan-50">

                            {/* Header (deja hueco arriba para el tirador de swipe) */}
                            <div className="flex flex-col gap-3 px-5 md:px-8 pt-8 md:pt-9 pb-3 shrink-0 border-b border-cyan-500/15 bg-black/20">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="ss-icon-3d ss-tone--zenith ss-float shrink-0">
                                            <Globe className="w-5 h-5 md:w-6 md:h-6" />
                                        </span>
                                        <div className="min-w-0">
                                            <h2 className="text-lg md:text-2xl font-light tracking-widest uppercase font-headline truncate">
                                                Exocortex
                                            </h2>
                                            <p className="text-[11px] text-cyan-300/60 font-mono hidden md:block truncate">
                                                Astraura IA
                                            </p>
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Cerebro 3D del Exocórtex (con chat IA incorporado) */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setMainView(mainView === "cerebro" ? "buscar" : "cerebro")}
                                            className={cn(
                                                "gap-2 rounded-full px-4 transition-all",
                                                mainView === "cerebro"
                                                    ? "border-purple-400/60 text-purple-100 bg-purple-500/25 shadow-[0_0_15px_rgba(168,85,247,0.35)]"
                                                    : "border-purple-500/40 text-purple-300 hover:bg-purple-500/15 hover:text-purple-100"
                                            )}
                                            title="Cerebro 3D de tu memoria y red, con chat del Exocórtex"
                                        >
                                            <BrainCircuit className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline text-xs uppercase tracking-wider">Cerebro</span>
                                        </Button>

                                        {/* Chat de Astraura IA (voz + multichat + configuraciones del widget) */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setMainView(mainView === "aurora" ? "buscar" : "aurora")}
                                            className={cn(
                                                "gap-2 rounded-full px-4 transition-all",
                                                mainView === "aurora"
                                                    ? "border-fuchsia-400/60 text-fuchsia-100 bg-fuchsia-500/25 shadow-[0_0_15px_rgba(232,121,249,0.35)]"
                                                    : "border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/15 hover:text-fuchsia-100"
                                            )}
                                            title="Chat completo de Aurora: voz, sesiones paralelas, sentidos y configuraciones"
                                        >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline text-xs uppercase tracking-wider">Astraura IA</span>
                                        </Button>

                                        {/* AI Senses Toggle */}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowSensesPanel(!showSensesPanel)}
                                            className={cn(
                                                "gap-2 rounded-full px-4 transition-all",
                                                showSensesPanel 
                                                    ? "border-cyan-400/60 text-cyan-200 bg-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.3)]" 
                                                    : "border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15 hover:text-cyan-100"
                                            )}
                                            title="Ajustar sentidos y conexiones de la IA"
                                        >
                                            <Brain className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline text-xs uppercase tracking-wider">Sentidos IA</span>
                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 rounded-full border-cyan-500/40 text-cyan-300 ml-1">
                                                {activeSenseCount}/{senses.length}
                                            </Badge>
                                        </Button>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEditorOpen(true)}
                                            className="border-violet-500/40 text-violet-300 hover:bg-violet-500/15 hover:text-violet-100 gap-2 rounded-full px-4"
                                            title="Editor Universal"
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
                                                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
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
                                            onClick={() => updateAppearanceSection('assistant', { visible: !aiAssistantVisible })}
                                            className={cn(
                                                "gap-2 rounded-full px-4 transition-all",
                                                aiAssistantVisible
                                                    ? "border-purple-400/60 text-purple-200 bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                                                    : "border-white/20 text-white/40 hover:bg-white/5 hover:text-white/60"
                                            )}
                                            title={aiAssistantVisible ? "Ocultar asistente flotante" : "Mostrar asistente flotante"}
                                        >
                                            <Bot className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline text-xs uppercase tracking-wider">Asistente</span>
                                            <span className={cn(
                                                "w-2 h-2 rounded-full transition-colors",
                                                aiAssistantVisible ? "bg-purple-400 shadow-[0_0_6px_#a855f7]" : "bg-white/20"
                                            )} />
                                        </Button>

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

                                {/* AI Resource Controls */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <AIResourceControl icon={<BrainCircuit className="w-4 h-4 text-cyan-300" />} label="Modelo IA" value="Gemini 1.5 Pro" color="cyan" />
                                    <AIResourceControl icon={<Bot className="w-4 h-4 text-emerald-300" />} label="Agente" value="Arquitecto" color="emerald" />
                                    <AIResourceControl icon={<Server className="w-4 h-4 text-amber-300" />} label="Servidores MCP" value={`${connections.filter(c => c.type === 'mcp' && c.enabled).length} Activos`} color="amber" />
                                </div>
                            </div>

                            {/* Main Content — split between search and AI senses panel */}
                            <div className="flex-1 flex min-h-0 overflow-hidden">
                                
                                {/* Left: Search + Results (always visible) */}
                                <div className={cn(
                                    "flex-1 flex flex-col min-h-0 min-w-0 transition-all duration-300",
                                    showSensesPanel && "hidden md:flex",
                                    mainView !== "buscar" && "hidden"
                                )}>
                                    {/* Search Bar + Domains */}
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

                                    {/* Results */}
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

                                {/* Cerebro 3D del Exocórtex — visor de memoria + red + chat IA */}
                                {mainView === "cerebro" && (
                                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                                        <MemoryBrain3D compact showChat className="flex-1 min-h-0" />
                                    </div>
                                )}

                                {/* Chat de Astraura IA — chat completo del widget (voz + multichat +
                                    sentidos + reactivación del orbe) integrado en el Exocórtex. */}
                                {mainView === "aurora" && (
                                    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
                                        <div className="mx-auto w-full px-4 md:px-8 lg:px-12 py-5 h-full flex flex-col">
                                            <AuroraChatSection />
                                        </div>
                                    </div>
                                )}

                                {/* Right: AI Senses & Connections Panel */}
                                <AnimatePresence>
                                    {showSensesPanel && (
                                        <motion.div
                                            initial={{ width: 0, opacity: 0 }}
                                            animate={{ width: "auto", opacity: 1 }}
                                            exit={{ width: 0, opacity: 0 }}
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            className={cn(
                                                "shrink-0 border-l border-cyan-500/15 bg-black/30 flex flex-col min-h-0 overflow-hidden",
                                                // Mobile: fullscreen overlay | Desktop: side panel
                                                "fixed inset-0 z-[95] md:static md:z-auto",
                                                "w-full md:w-[380px] lg:w-[420px]"
                                            )}
                                        >
                                            {/* Panel Header */}
                                            <div className="px-5 py-4 border-b border-cyan-500/10 shrink-0 flex items-center justify-between bg-black/20">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/20 shrink-0">
                                                        <Brain className="w-4 h-4 text-cyan-300" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="text-sm font-semibold text-white/90 truncate">Sentidos & Conexiones IA</h3>
                                                        <p className="text-[9px] font-mono text-white/30 uppercase truncate">{activeSenseCount} sentidos · {activeConnectionCount} conexiones</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setShowSensesPanel(false)}
                                                    className="w-8 h-8 rounded-xl hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-all shrink-0"
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>

                                            {/* Panel Tabs */}
                                            <div className="px-4 py-3 flex gap-1.5 shrink-0 border-b border-cyan-500/10">
                                                {([
                                                    { id: "senses", label: "Sentidos", icon: Eye },
                                                    { id: "connections", label: "Conexiones", icon: Plug },
                                                    { id: "topology", label: "Topología", icon: Network },
                                                ] as const).map(tab => (
                                                    <button
                                                        key={tab.id}
                                                        onClick={() => setSensesTab(tab.id)}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] uppercase tracking-wider font-mono transition-all flex-1 justify-center",
                                                            sensesTab === tab.id
                                                                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                                                : "text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent"
                                                        )}
                                                    >
                                                        <tab.icon className="w-3.5 h-3.5" />
                                                        <span className="hidden sm:inline">{tab.label}</span>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Panel Content */}
                                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                                
                                                {/* Senses Tab */}
                                                {sensesTab === "senses" && (
                                                    <div className="space-y-2">
                                                        <p className="text-[10px] text-white/30 font-mono uppercase tracking-wider mb-3">
                                                            Percepción del Exocórtex — {activeSenseCount} activos
                                                        </p>
                                                        {senses.map(sense => {
                                                            const Icon = sense.icon;
                                                            return (
                                                                <div
                                                                    key={sense.id}
                                                                    className={cn(
                                                                        "flex items-center gap-3 p-3 rounded-2xl border transition-all",
                                                                        sense.enabled
                                                                            ? "border-cyan-500/20 bg-cyan-500/5"
                                                                            : "border-white/5 bg-white/[0.01] opacity-60"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "p-2 rounded-xl shrink-0 transition-colors",
                                                                        sense.enabled ? "bg-cyan-500/15 text-cyan-400" : "bg-white/5 text-white/30"
                                                                    )}>
                                                                        <Icon className="w-4 h-4" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-xs font-medium truncate">{sense.label}</div>
                                                                        <div className="text-[9px] text-white/30 truncate">{sense.description}</div>
                                                                    </div>
                                                                    <Switch
                                                                        checked={sense.enabled}
                                                                        onCheckedChange={() => toggleSense(sense.id)}
                                                                        className="shrink-0"
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Connections Tab */}
                                                {sensesTab === "connections" && (
                                                    <div className="space-y-4">
                                                        {/* Group by type */}
                                                        {(["ai", "mcp", "agent", "skill", "connection"] as const).map(type => {
                                                            const items = connections.filter(c => c.type === type);
                                                            if (items.length === 0) return null;
                                                            const labels: Record<string, string> = {
                                                                ai: "Modelos IA",
                                                                mcp: "Servidores MCP",
                                                                agent: "Agentes",
                                                                skill: "Skills",
                                                                connection: "Conexiones"
                                                            };
                                                            return (
                                                                <div key={type}>
                                                                    <p className="text-[9px] text-white/30 font-mono uppercase tracking-wider mb-2 flex items-center gap-2">
                                                                        <span>{labels[type]}</span>
                                                                        <span className="text-cyan-400">{items.filter(i => i.enabled).length}/{items.length}</span>
                                                                    </p>
                                                                    <div className="space-y-1.5">
                                                                        {items.map(conn => {
                                                                            const Icon = conn.icon;
                                                                            return (
                                                                                <div
                                                                                    key={conn.id}
                                                                                    className={cn(
                                                                                        "flex items-center gap-3 p-2.5 rounded-xl border transition-all",
                                                                                        conn.enabled
                                                                                            ? "border-white/10 bg-white/[0.02]"
                                                                                            : "border-white/5 bg-transparent opacity-50"
                                                                                    )}
                                                                                >
                                                                                    <div className={cn(
                                                                                        "p-1.5 rounded-lg shrink-0",
                                                                                        conn.enabled ? `bg-${conn.color}-500/15 text-${conn.color}-400` : "bg-white/5 text-white/20"
                                                                                    )}>
                                                                                        <Icon className="w-3.5 h-3.5" />
                                                                                    </div>
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="text-[11px] font-medium truncate">{conn.label}</div>
                                                                                        <div className="text-[8px] text-white/25 font-mono truncate">{conn.provider}</div>
                                                                                    </div>
                                                                                    <Switch
                                                                                        checked={conn.enabled}
                                                                                        onCheckedChange={() => toggleConnection(conn.id)}
                                                                                        className="shrink-0 scale-90"
                                                                                    />
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Topology Tab — Interconnection Editor */}
                                                {sensesTab === "topology" && (
                                                    <div className="space-y-4">
                                                        <p className="text-[10px] text-white/30 font-mono uppercase tracking-wider">
                                                            Editor de Interconexiones — Topología Neural
                                                        </p>

                                                        {/* Global interconnection status */}
                                                        <div className="p-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <span className="text-xs font-medium">Interconexión Global</span>
                                                                <Badge variant="outline" className="text-[9px] border-cyan-500/30 text-cyan-300">MESH COMPLETO</Badge>
                                                            </div>
                                                            <p className="text-[10px] text-white/40 leading-relaxed">
                                                                Todas las IAs, memorias, contextos y logs están interconectados por defecto. 
                                                                Desactiva enlaces específicos abajo para aislar nodos.
                                                            </p>
                                                        </div>

                                                        {/* Interconnection Matrix */}
                                                        <div className="space-y-2">
                                                            <p className="text-[9px] text-white/30 font-mono uppercase tracking-wider">
                                                                Enlaces Activos
                                                            </p>
                                                            {[
                                                                { from: "Gemini API", to: "Memoria Cognitiva", type: "Contexto", enabled: true },
                                                                { from: "Ollama Local", to: "Memoria Cognitiva", type: "Contexto", enabled: true },
                                                                { from: "Gemini API", to: "Logs del Sistema", type: "Lectura", enabled: true },
                                                                { from: "Arquitecto", to: "Musa Creativa", type: "Bidirecional", enabled: true },
                                                                { from: "Arquitecto", to: "Piloto del Sistema", type: "Bidirecional", enabled: false },
                                                                { from: "MCP Principal", to: "Todos los Agentes", type: "Distribución", enabled: true },
                                                                { from: "Percepción de Pantalla", to: "Gemini API", type: "Input Visual", enabled: true },
                                                                { from: "Micrófono / Voz", to: "Ollama Local", type: "Input Audio", enabled: false },
                                                            ].map((link, i) => (
                                                                <div key={i} className={cn(
                                                                    "flex items-center gap-2 p-2.5 rounded-xl border transition-all",
                                                                    link.enabled ? "border-white/10 bg-white/[0.02]" : "border-white/5 opacity-40"
                                                                )}>
                                                                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                        <span className="text-[10px] text-cyan-300 font-medium truncate">{link.from}</span>
                                                                        <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
                                                                        <span className="text-[10px] text-white/60 truncate">{link.to}</span>
                                                                    </div>
                                                                    <Badge variant="outline" className="text-[7px] px-1.5 py-0 border-white/10 text-white/30 shrink-0 hidden sm:flex">
                                                                        {link.type}
                                                                    </Badge>
                                                                    <div className={cn(
                                                                        "w-2 h-2 rounded-full shrink-0 transition-colors",
                                                                        link.enabled ? "bg-emerald-400 shadow-[0_0_6px_#10b981]" : "bg-white/10"
                                                                    )} />
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Info note */}
                                                        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-200/60 leading-relaxed">
                                                            <strong className="text-amber-300">Nota:</strong> La topología neural define cómo fluyen los datos entre componentes del Exocórtex. 
                                                            Los nodos desactivados no reciben ni transmiten información.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Light Rays Decoration */}
                        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none mix-blend-screen">
                            <div className="absolute top-0 left-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                            <div className="absolute top-0 right-[20%] w-[1px] h-full bg-gradient-to-b from-cyan-400 to-transparent blur-[2px]" />
                            <div className="absolute top-0 left-1/2 w-[600px] h-full -translate-x-1/2 bg-gradient-to-b from-cyan-500/10 to-transparent blur-[60px]" />
                        </div>
                      </motion.div>
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
