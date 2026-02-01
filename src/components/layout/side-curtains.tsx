"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import { useAppearance } from "@/context/appearance-context";
import { useBoardSystem } from "@/context/board-context"; // Import BoardContext
import UniversalBoardViewer from "@/components/control-panel/board/universal-board-viewer"; // Import new Viewer
import { MarketplaceView } from "@/components/control-panel/board/marketplace-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Copy, Settings, ArrowRight, ArrowLeft,
    Plus, Library, Import,
    Sliders, Activity, Terminal,
    Bot, Layout, BookOpen, Settings2,
    Send, Maximize2, Trash2, X, Sparkles, Users, Palette, Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function SideCurtains() {
    const { activeEdge, setActiveEdge } = usePerimeter();

    // Control Panel State Integration
    const [activeTab, setActiveTab] = React.useState("ai");
    const { config } = useAppearance();

    const {
        boards,
        activeBoardId,
        createBoard,
        setActiveBoard,
        deleteBoard,
    } = useBoardSystem();

    const activeBoardData = boards.find(b => b.id === activeBoardId);

    const handleClose = () => setActiveEdge(null);

    const handleCreateBoard = () => {
        createBoard(`Nueva Pizarra ${boards.length + 1}`);
        setActiveTab("boards");
    };

    const handleOpenBoard = (id: string) => {
        setActiveBoard(id);
    };

    const handleCloseBoard = () => {
        setActiveBoard(null);
    };

    const formatDate = (ts: number) => {
        return new Intl.DateTimeFormat('es-ES', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(new Date(ts));
    };

    // Dynamic Tab Trigger Styles
    const getTabTriggerStyle = (val: string, colorClass: string) => (
        cn(
            "flex gap-2 transition-all duration-300 data-[state=active]:bg-background/80 data-[state=active]:shadow-sm",
            activeTab === val ? colorClass : "text-muted-foreground hover:text-foreground"
        )
    );

    return (
        <AnimatePresence>
            {/* Horizon (Left) - Creation / Green */}
            {activeEdge === "horizon" && (
                <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    className="fixed top-0 left-0 h-full w-[350px] md:w-[450px] z-[90] pointer-events-auto"
                >
                    {/* Glass/Color Background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/90 via-emerald-900/80 to-transparent backdrop-blur-md border-r border-emerald-500/30 shadow-[10px_0_40px_rgba(16,185,129,0.3)]" />

                    <div className="relative z-10 w-full h-full flex flex-col p-8 text-emerald-50 overflow-y-auto custom-scrollbar">
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-3 rounded-full bg-emerald-500/20 border border-emerald-400/30 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                                <Copy className="w-6 h-6 text-emerald-300" />
                            </div>
                            <div>
                                <h2 className="text-xl font-light tracking-widest uppercase font-headline">
                                    Centro de Creación
                                </h2>
                                <p className="text-[10px] text-emerald-400/60 font-mono">UNIVERSAL CANVAS HUB</p>
                            </div>
                        </div>

                        {/* Universal Creation Canvas Access */}
                        <div className="mb-8">
                            <Button
                                className="w-full h-auto py-4 flex flex-col items-center gap-2 bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 hover:border-emerald-400/60 hover:from-emerald-500/30 hover:to-teal-600/30 transition-all group"
                                onClick={() => setActiveBoard(null)} // Or route to a dedicated canvas page
                            >
                                <div className="p-2 rounded-full bg-emerald-400/20 group-hover:scale-110 transition-transform">
                                    <Sparkles className="w-6 h-6 text-emerald-300" />
                                </div>
                                <div className="text-center">
                                    <span className="block text-lg font-light tracking-wider text-emerald-100">Lienzo Universal</span>
                                    <span className="text-xs text-emerald-200/60 font-light">Espacio de creación libre para cualquier contexto</span>
                                </div>
                            </Button>
                        </div>

                        {/* Tools Grid / Active Boards */}
                        <div className="flex-1 space-y-8">

                            {/* Boards Section */}
                            <div>
                                <div className="flex items-center justify-between mb-3 border-b border-emerald-500/20 pb-2">
                                    <h3 className="text-xs font-semibold text-emerald-400/70 uppercase tracking-widest flex items-center gap-2">
                                        <Layout className="w-3 h-3" /> Pizarras Activas
                                    </h3>
                                    <Button size="sm" variant="ghost" className="h-6 gap-1 text-[10px] text-emerald-400 hover:bg-emerald-500/10" onClick={handleCreateBoard}>
                                        <Plus className="h-3 w-3" /> Nueva
                                    </Button>
                                </div>

                                <ScrollArea className="h-[200px] rounded-md border border-emerald-500/10 bg-emerald-950/20 p-2">
                                    {boards.map((board) => (
                                        <div
                                            key={board.id}
                                            className="flex items-center justify-between p-3 mb-2 rounded-lg border border-emerald-500/10 bg-black/40 hover:bg-emerald-500/10 transition-colors group cursor-pointer"
                                            onClick={() => handleOpenBoard(board.id)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-1 h-8 rounded-full bg-emerald-500/50" />
                                                <div className="overflow-hidden">
                                                    <p className="font-medium text-sm truncate text-emerald-100">{board.name}</p>
                                                    <p className="text-[10px] text-emerald-500/60">{formatDate(board.updatedAt)}</p>
                                                </div>
                                            </div>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/20" onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                    {boards.length === 0 && (
                                        <div className="text-center py-8 text-emerald-500/30 text-xs">
                                            <p>No hay pizarras activas.</p>
                                            <Button variant="link" className="text-emerald-400 text-xs p-0 h-auto mt-1" onClick={handleCreateBoard}>Crear una ahora</Button>
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>

                            {/* Publication Hub / Network Access */}
                            <div className="bg-emerald-950/10 rounded-xl p-4 border border-emerald-500/20">
                                <h3 className="text-xs font-semibold text-emerald-400/90 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Send className="w-3 h-3" /> Zona de Publicación
                                </h3>

                                <p className="text-[10px] text-emerald-200/60 mb-4 leading-relaxed">
                                    Selecciona el contexto de tu publicación para acceder a las herramientas especializadas de la red.
                                </p>

                                <div className="grid grid-cols-2 gap-2">
                                    <PublicationButton
                                        icon={<Library className="w-4 h-4" />}
                                        label="Biblioteca"
                                        sub="Archivo & Wiki"
                                    />
                                    <PublicationButton
                                        icon={<Users className="w-4 h-4" />}
                                        label="Política"
                                        sub="Propuestas & Votos"
                                    />
                                    <PublicationButton
                                        icon={<BookOpen className="w-4 h-4" />}
                                        label="Educación"
                                        sub="Cursos & Guías"
                                    />
                                    <PublicationButton
                                        icon={<Palette className="w-4 h-4" />}
                                        label="Cultura"
                                        sub="Arte & Eventos"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer / Close Trigger */}
                        <button
                            onClick={handleClose}
                            className="flex items-center gap-2 text-emerald-400/50 text-xs mt-auto hover:text-emerald-200 transition-colors pt-6"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span>Deslizar para cerrar</span>
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Logic (Right) - System / Amber - NOW INTEGRATED CONTROL PANEL */}
            {activeEdge === "logic" && (
                <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    className={cn(
                        "fixed top-0 right-0 h-full z-[90] pointer-events-auto border-l border-amber-500/30 shadow-[-10px_0_40px_rgba(245,158,11,0.3)]",
                        activeBoardId ? "w-full sm:w-[90vw] lg:w-[85vw]" : "w-[350px] md:w-[450px]"
                    )}
                >
                    {/* Glass/Color Background */}
                    <div className="absolute inset-0 bg-gradient-to-l from-amber-950/95 via-amber-900/90 to-black/80 backdrop-blur-xl" />

                    <div className="relative z-10 w-full h-full flex flex-col text-amber-50">

                        {activeBoardId && activeBoardData ? (
                            <div className="h-full w-full relative">
                                {/* Close/Back Button for Board Viewer */}
                                <div className="absolute top-4 left-4 z-50">
                                    <Button variant="secondary" size="sm" onClick={handleCloseBoard} className="gap-2 backdrop-blur-md bg-background/50">
                                        ← Volver
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={handleClose} className="ml-2 hover:bg-destructive/20 hover:text-destructive">
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                                <UniversalBoardViewer />
                            </div>
                        ) : (
                            <>
                                {/* Integrated Header */}
                                <div className="flex items-center justify-between p-6 border-b border-amber-500/20 bg-amber-950/20">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-full bg-amber-500/20 border border-amber-400/30 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                                            <Settings className="w-5 h-5 text-amber-300" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-light tracking-widest uppercase font-headline text-amber-100">
                                                Panel de Control
                                            </h2>
                                            <p className="text-[10px] text-amber-400/60 font-mono">SYSTEM CONTROL PANEL</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={handleClose} className="text-amber-400/50 hover:text-amber-200">
                                        <ArrowRight className="w-5 h-5" />
                                    </Button>
                                </div>

                                {/* Main Tabs Area */}
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                                    <div className="px-6 pt-4">
                                        <TabsList className="grid w-full grid-cols-4 bg-black/40 border border-amber-500/20">
                                            <TabsTrigger value="ai" className={getTabTriggerStyle("ai", "text-cyan-400 data-[state=active]:bg-cyan-950/30 data-[state=active]:text-cyan-300")}>
                                                <Bot className="h-4 w-4" />
                                            </TabsTrigger>
                                            {/* Boards Tab Removed from here - moved to Creation (Left) */}
                                            <TabsTrigger value="store" className={getTabTriggerStyle("store", "text-purple-400 data-[state=active]:bg-purple-950/30 data-[state=active]:text-purple-300")}>
                                                <BookOpen className="h-4 w-4" />
                                            </TabsTrigger>
                                            <TabsTrigger value="widgets" className={getTabTriggerStyle("widgets", "text-amber-400 data-[state=active]:bg-amber-950/30 data-[state=active]:text-amber-300")}>
                                                <Settings2 className="h-4 w-4" />
                                            </TabsTrigger>
                                        </TabsList>
                                    </div>

                                    {/* AI CONTENT */}
                                    <TabsContent value="ai" className="flex-1 flex flex-col p-6 gap-4 overflow-hidden data-[state=active]:animate-in data-[state=active]:slide-in-from-right-2">
                                        <ScrollArea className="flex-1 rounded-md border p-4 bg-cyan-950/5 border-cyan-500/10">
                                            <div className="flex flex-col gap-4">
                                                <div className="flex gap-3 items-start">
                                                    <div className="h-8 w-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                                                        <Bot className="h-4 w-4 text-cyan-400" />
                                                    </div>
                                                    <div className="bg-cyan-950/30 p-3 rounded-lg rounded-tl-none text-sm text-cyan-100 border border-cyan-500/20">
                                                        Nexus AI conectado. Sistemas de lógica listos.
                                                    </div>
                                                </div>
                                            </div>
                                        </ScrollArea>
                                        <div className="flex gap-2">
                                            <Input placeholder="Comando..." className="border-cyan-500/20 bg-black/40 text-cyan-100 placeholder:text-cyan-500/50 focus-visible:ring-cyan-500/30" />
                                            <Button size="icon" className="bg-cyan-600/20 hover:bg-cyan-500/40 text-cyan-300 border border-cyan-500/30"><Send className="h-4 w-4" /></Button>
                                        </div>
                                    </TabsContent>

                                    {/* BOARDS CONTENT REMOVED - Moved to Left Curtain */}

                                    {/* STORE CONTENT */}
                                    <TabsContent value="store" className="flex-1 overflow-hidden p-0 data-[state=active]:animate-in data-[state=active]:slide-in-from-right-2">
                                        <MarketplaceView />
                                    </TabsContent>

                                    {/* WIDGETS / LOGIC CONTENT */}
                                    <TabsContent value="widgets" className="flex-1 p-6 data-[state=active]:animate-in data-[state=active]:slide-in-from-right-2">
                                        <div className="grid gap-3">
                                            <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-500/20">
                                                <h4 className="text-xs font-semibold text-amber-400 uppercase mb-3">Monitor del Sistema</h4>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs text-amber-200/60">
                                                        <span>CPU Load</span>
                                                        <span>12%</span>
                                                    </div>
                                                    <div className="h-1 bg-amber-950 rounded-full overflow-hidden">
                                                        <div className="h-full bg-amber-500 w-[12%]" />
                                                    </div>
                                                </div>
                                            </div>
                                            <ToolButton
                                                icon={<Activity className="w-5 h-5" />}
                                                label="Diagnóstico"
                                                description="Checkeo completo"
                                                color="amber"
                                            />
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Helper Component for Tools
function ToolButton({ icon, label, description, color, align = "left" }: { icon: React.ReactNode, label: string, description: string, color: "emerald" | "amber", align?: "left" | "right" }) {
    const isRight = align === "right";

    const colorStyles = {
        emerald: "hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-100",
        amber: "hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40 text-amber-100"
    };

    return (
        <Button
            variant="ghost"
            className={cn(
                "h-auto py-3 px-4 flex items-center gap-4 w-full justify-start border bg-black/20 backdrop-blur-sm transition-all duration-300 group",
                colorStyles[color],
                isRight && "flex-row-reverse text-right"
            )}
        >
            <div className={cn(
                "p-2 rounded-md bg-white/5 group-hover:bg-white/10 transition-colors",
                color === "emerald" ? "text-emerald-400" : "text-amber-400"
            )}>
                {icon}
            </div>
            <div className="flex flex-col items-start">
                <span className="text-sm font-medium">{label}</span>
                <span className={cn("text-xs opacity-50 font-light", color === "emerald" ? "text-emerald-200" : "text-amber-200")}>{description}</span>
            </div>
        </Button>
    )
}

function PublicationButton({ icon, label, sub }: { icon: React.ReactNode, label: string, sub: string }) {
    return (
        <Button
            variant="ghost"
            className="h-auto py-3 px-3 flex flex-col items-start gap-2 w-full border border-emerald-500/10 bg-emerald-950/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all group"
        >
            <div className="flex items-center gap-2 w-full">
                <div className="text-emerald-400 group-hover:text-emerald-300 transition-colors">
                    {icon}
                </div>
                <span className="text-sm font-medium text-emerald-100">{label}</span>
            </div>
            <span className="text-[10px] text-emerald-500/60 font-mono pl-1">{sub}</span>
        </Button>
    )
}
