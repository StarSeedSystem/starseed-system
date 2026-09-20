"use client";

import React, { useRef, useCallback, RefObject } from "react";
import { useRouter } from "next/navigation";
import {
    motion, AnimatePresence, useReducedMotion, useMotionValue, animate,
    type MotionValue,
} from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import curtain from "@/components/layout/trinity-curtains.module.css";
import { useAppearance } from "@/context/appearance-context";
import { useBoardSystem } from "@/context/board-context"; // Import BoardContext
import UniversalBoardViewer from "@/components/control-panel/board/universal-board-viewer"; // Import new Viewer
import { MarketplaceView } from "@/components/control-panel/board/marketplace-view";
import { ControlCenter } from "./trinity/control-center";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Copy, Settings, ArrowRight, ArrowLeft,
    Plus, Library, Import,
    Sliders, Activity, Terminal,
    Bot, Layout, BookOpen, Settings2,
    Send, Maximize2, Trash2, X, Sparkles, Users, Palette, Globe, Cpu, Pencil
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRitoActivo } from "@/lib/ui/rito-activo";
import { Button } from "@/components/ui/button";
import { calculateSwipeOutcome, type SwipeDirection } from "@/lib/layout/swipe-utils";

// ── Swipe-to-close (centro de control) ──────────────────────────────
type SwipeDir = SwipeDirection;

function useSwipeToClose(dir: SwipeDir, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
    const reduceMotion = useReducedMotion();
    const signed = useMotionValue(0);
    const axis: "x" | "y" = dir === "up" ? "y" : "x";

    const start = useRef<{ x: number; y: number; time: number } | null>(null);
    const dragging = useRef(false);
    const progress = useRef(0);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== undefined && e.button !== 0) return;
        start.current = { x: e.clientX, y: e.clientY, time: performance.now() };
        dragging.current = true;
        progress.current = 0;
        try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
            /* noop */
        }
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current || !start.current || !containerRef.current) return;

        const containerSize = axis === "y" 
            ? containerRef.current.clientHeight 
            : containerRef.current.clientWidth;

        const currentPos = { x: e.clientX, y: e.clientY, time: performance.now() };
        const outcome = calculateSwipeOutcome({
            direction: dir,
            startPos: start.current,
            currentPos,
            containerSize,
        });

        progress.current = outcome.toward;
        const mag = reduceMotion ? outcome.toward : outcome.toward * (outcome.toward > 120 ? 0.85 : 1);
        
        if (dir === "up" || dir === "left") {
            signed.set(-mag);
        } else {
            signed.set(mag);
        }
    }, [axis, dir, signed, reduceMotion, containerRef]);

    const finish = useCallback((e?: React.PointerEvent) => {
        if (!dragging.current || !start.current || !containerRef.current) return;
        dragging.current = false;

        const containerSize = axis === "y" 
            ? containerRef.current.clientHeight 
            : containerRef.current.clientWidth;

        const currentPos = e 
            ? { x: e.clientX, y: e.clientY, time: performance.now() }
            : { x: start.current.x, y: start.current.y, time: performance.now() };

        const outcome = calculateSwipeOutcome({
            direction: dir,
            startPos: start.current,
            currentPos,
            containerSize,
        });

        start.current = null;

        if (outcome.shouldClose) {
            onClose();
            signed.set(0);
        } else if (reduceMotion) {
            signed.set(0);
        } else {
            animate(signed, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
        progress.current = 0;
    }, [axis, dir, signed, onClose, reduceMotion, containerRef]);

    const cancel = useCallback((e?: React.PointerEvent) => {
        if (!dragging.current) return;
        dragging.current = false;
        start.current = null;
        progress.current = 0;
        if (e && e.currentTarget) {
            try {
                if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) {
                    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
                }
            } catch {
                /* noop */
            }
        }
        if (reduceMotion) {
            signed.set(0);
        } else {
            animate(signed, 0, { type: "spring", stiffness: 500, damping: 40 });
        }
    }, [signed, reduceMotion]);

    const style: { x?: MotionValue<number>; y?: MotionValue<number> } =
        axis === "y" ? { y: signed } : { x: signed };

    return {
        motionStyle: style,
        handlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: finish,
            onPointerCancel: cancel,
        },
    };
}

// Botón de cierre cristalino reutilizable (X, área táctil >= 44px).
function CurtainCloseButton({
    onClose,
    accent,
    className,
    style,
}: {
    onClose: () => void;
    accent: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={onClose}
            className={cn("min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full cursor-pointer z-50", curtain.closeBtn, curtain.closeTopRight, className)}
            style={{ ...style, ["--cc" as string]: accent }}
        >
            <X className={curtain.closeIcon} />
        </button>
    );
}

export function SideCurtains() {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const router = useRouter();
    // Navegar cerrando la cortina primero (todas las áreas del Centro de
    // Creación deben ABRIR de verdad su destino — Adenda 63).
    const go = useCallback((href: string) => {
        setActiveEdge(null);
        router.push(href);
    }, [router, setActiveEdge]);
    const closeCurtain = useCallback(() => setActiveEdge(null), [setActiveEdge]);

    const horizonRef = useRef<HTMLDivElement | null>(null);
    const logicRef = useRef<HTMLDivElement | null>(null);

    const horizonSwipe = useSwipeToClose("left", closeCurtain, horizonRef);
    const logicSwipe = useSwipeToClose("right", closeCurtain, logicRef);

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

    // (Ola 228 · R1F) Rito de verdad en primer plano: las cortinas NO deben
    // poder salir mientras haya un rito activo. Se declara aquí (tras TODOS
    // los hooks del componente) y corta el render con `return null`.
    const rito = useRitoActivo();

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

    // Rito en primer plano → nada de cortinas (después de TODOS los hooks).
    if (rito) return null;

    return (
        <AnimatePresence>
            {/* Horizon (Left) - Creation / Green */}
            {activeEdge === "horizon" && (
                <motion.div
                    ref={horizonRef}
                    data-trinity-curtain="horizon"
                    data-testid="horizon-curtain-container"
                    initial={{ x: "-100%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "-100%", opacity: 0 }}
                    transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    className={cn(
                        // Nota: framer anima `x` en este nodo, por lo que escribe `transform`
                        // inline y sobrescribe cualquier translate de Tailwind. El centrado
                        // vertical en desktop se hace con top/bottom-0 + my-auto (sin transform),
                        // evitando la trampa del containing block (ver SOP Trinity Móvil · Bloque 3).
                        "fixed z-[90] pointer-events-auto overflow-hidden shadow-2xl border border-emerald-500/30 box-border",
                        // Móvil: ocupa casi todo el ancho, anclado a la izquierda dentro del viewport.
                        "top-0 bottom-0 left-0 h-[100dvh] w-full max-w-[100vw] rounded-none",
                        // Tablet/desktop: panel lateral cómodo, centrado por my-auto, SIEMPRE dentro del viewport.
                        "md:h-[min(46rem,92dvh)] md:my-auto md:rounded-[2rem]",
                        "md:left-[max(1rem,env(safe-area-inset-left))] md:w-[clamp(22rem,42vw,32rem)] md:max-w-[calc(100vw-2rem)]"
                    )}
                >
                  {/* Capa de arrastre: sigue al dedo (swipe hacia la izquierda cierra). */}
                  <motion.div
                    data-testid="horizon-curtain-swipe-layer"
                    className="relative w-full h-full flex flex-col"
                    style={horizonSwipe.motionStyle}
                    {...horizonSwipe.handlers}
                  >
                    {/* Glass/Color Background - Contained */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />

                    {/* Emerald Accent Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/50 to-transparent pointer-events-none" />

                    {/* Tirador de swipe (Horizon cierra hacia la IZQUIERDA) + botón de cierre */}
                    <div
                        className={curtain.grabberSideLeft}
                        style={{ ["--cc" as string]: "#10b981" }}
                        {...horizonSwipe.handlers}
                        role="presentation"
                    />
                    <CurtainCloseButton onClose={handleClose} accent="#10b981" />

                    <div className="relative z-10 w-full flex-1 flex flex-col p-6 pt-14 md:p-10 md:pt-14 text-emerald-50 overflow-y-auto custom-scrollbar">
                        {/* Header */}
                        <div className="flex flex-col items-center text-center gap-4 mb-10 flex-shrink-0">
                            <div className="p-4 rounded-full bg-emerald-500/20 border border-emerald-400/30 shadow-[0_0_25px_rgba(16,185,129,0.5)]">
                                <Copy className="w-8 h-8 text-emerald-300" />
                            </div>
                            <div>
                                <h2 className="text-2xl md:text-3xl font-light tracking-widest uppercase font-headline">
                                    Centro de Creación
                                </h2>
                                <p className="text-xs text-emerald-400/60 font-mono mt-1">UNIVERSAL CANVAS HUB</p>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="mt-2 h-11 min-h-[44px] rounded-full gap-2 text-xs text-emerald-300/80 hover:bg-emerald-500/10 hover:text-emerald-200 cursor-pointer"
                                    onClick={() => go("/crear")}
                                >
                                    <Maximize2 className="h-3.5 w-3.5" /> Abrir página completa
                                </Button>
                            </div>
                        </div>

                        {/* Universal Creation Canvas Access */}
                        <div className="mb-6 flex-shrink-0 px-2">
                            <Button
                                className="w-full h-auto min-h-[44px] py-6 rounded-3xl flex flex-col items-center gap-3 bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 hover:border-emerald-400/60 hover:from-emerald-500/30 hover:to-teal-600/30 transition-all group shadow-lg cursor-pointer"
                                onClick={() => go("/crear?area=lienzo")}
                            >
                                <div className="p-3 rounded-full bg-emerald-400/20 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                                    <Sparkles className="w-8 h-8 text-emerald-300" />
                                </div>
                                <div className="text-center">
                                    <span className="block text-xl font-light tracking-wider text-emerald-100 mb-1">Lienzo Universal</span>
                                    <span className="text-sm text-emerald-200/60 font-light px-4 whitespace-normal break-words">Creador de publicaciones específicas: bloques, archivos y widgets para cualquier sección de la red.</span>
                                </div>
                            </Button>
                        </div>

                        {/* Editor Universal */}
                        <div className="mb-6 flex-shrink-0 px-2">
                            <Button
                                className="w-full h-auto min-h-[44px] py-5 rounded-3xl flex items-center gap-4 bg-gradient-to-r from-violet-600/20 via-fuchsia-600/15 to-emerald-600/15 border border-violet-500/30 hover:border-violet-400/50 hover:from-violet-600/30 hover:via-fuchsia-600/25 hover:to-emerald-600/25 transition-all group shadow-lg cursor-pointer"
                                onClick={() => {
                                    setActiveEdge(null);
                                    window.dispatchEvent(new CustomEvent('starseed:open-editor'));
                                }}
                            >
                                <div className="p-3 rounded-full bg-violet-500/20 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                                    <Pencil className="w-7 h-7 text-violet-200" />
                                </div>
                                <div className="text-left">
                                    <span className="block text-lg font-light tracking-wider text-violet-100">Editor Universal</span>
                                    <span className="text-xs text-violet-300/50 font-mono uppercase tracking-wider">Diseño · Código · IA · Biblioteca</span>
                                </div>
                            </Button>
                        </div>

                        {/* Tools Grid / Active Boards */}
                        <div className="flex-1 space-y-10">

                            {/* Boards Section */}
                            <div>
                                <div className="flex items-center justify-between mb-4 border-b border-emerald-500/20 pb-3">
                                    <h3 className="text-sm font-semibold text-emerald-400/70 uppercase tracking-widest flex items-center gap-2">
                                        <Layout className="w-4 h-4" /> Pizarras Activas
                                    </h3>
                                    <div className="flex items-center gap-1">
                                        <Button size="sm" variant="ghost" className="h-8 rounded-full gap-2 text-xs text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300" onClick={() => go("/pizarras")}>
                                            <Library className="h-4 w-4" /> Nube
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-8 rounded-full gap-2 text-xs text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300" onClick={handleCreateBoard}>
                                            <Plus className="h-4 w-4" /> Nueva
                                        </Button>
                                    </div>
                                </div>

                                <ScrollArea className="h-[240px] rounded-2xl border border-emerald-500/10 bg-emerald-950/20 p-3 shadow-inner">
                                    {boards.map((board) => (
                                        <div
                                            key={board.id}
                                            className="flex items-center justify-between p-4 mb-3 rounded-2xl border border-emerald-500/10 bg-black/40 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all group cursor-pointer"
                                            onClick={() => handleOpenBoard(board.id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-1.5 h-10 rounded-full bg-emerald-500/50 group-hover:bg-emerald-400 transition-colors" />
                                                <div className="overflow-hidden">
                                                    <p className="font-medium text-base truncate text-emerald-100 group-hover:text-white transition-colors">{board.name}</p>
                                                    <p className="text-[11px] text-emerald-500/60 mt-0.5">{formatDate(board.updatedAt)}</p>
                                                </div>
                                            </div>
                                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/20" onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {boards.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-full text-emerald-500/40 text-sm">
                                            <Layout className="w-8 h-8 mb-3 opacity-20" />
                                            <p>No hay pizarras activas.</p>
                                            <Button variant="link" className="text-emerald-400 text-sm p-0 h-auto mt-2 hover:text-emerald-300" onClick={handleCreateBoard}>Crear una ahora</Button>
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>

                            {/* Publication Hub / Network Access */}
                            <div className="bg-emerald-950/20 rounded-3xl p-6 border border-emerald-500/20 shadow-inner">
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="p-2 rounded-full bg-emerald-500/20 mb-3">
                                        <Send className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <h3 className="text-sm font-semibold text-emerald-400/90 uppercase tracking-widest">
                                        Zona de Publicación
                                    </h3>
                                    <p className="text-xs text-emerald-200/60 mt-2 max-w-[250px] leading-relaxed mx-auto">
                                        Selecciona el contexto espacial de tu publicación actual.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                                    <PublicationButton
                                        icon={<Library className="w-5 h-5" />}
                                        label="Biblioteca"
                                        sub="Archivo & Wiki"
                                        onClick={() => go("/crear?area=publicar&dest=biblioteca")}
                                    />
                                    <PublicationButton
                                        icon={<Users className="w-5 h-5" />}
                                        label="Política"
                                        sub="Propuestas & Votos"
                                        onClick={() => go("/crear?area=publicar&dest=politica")}
                                    />
                                    <PublicationButton
                                        icon={<BookOpen className="w-5 h-5" />}
                                        label="Educación"
                                        sub="Cursos & Guías"
                                        onClick={() => go("/crear?area=publicar&dest=educacion")}
                                    />
                                    <PublicationButton
                                        icon={<Palette className="w-5 h-5" />}
                                        label="Cultura"
                                        sub="Arte & Eventos"
                                        onClick={() => go("/crear?area=publicar&dest=cultura")}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer / Close Trigger */}
                        <button
                            onClick={handleClose}
                            className="flex justify-center items-center gap-2 text-emerald-400/50 text-sm mt-10 hover:text-emerald-200 transition-colors py-4 flex-shrink-0 border-t border-emerald-500/10"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span className="uppercase tracking-wider">Deslizar para cerrar</span>
                        </button>
                    </div>
                  </motion.div>
                </motion.div>
            )}

            {/* Logic (Right) - System / Amber - NOW INTEGRATED CONTROL PANEL */}
            {activeEdge === "logic" && (
                <motion.div
                    ref={logicRef}
                    data-trinity-curtain="logic"
                    data-testid="logic-curtain-container"
                    initial={{ x: "110%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "110%", opacity: 0 }}
                    transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    className={cn(
                        "fixed z-[90] inset-y-0 right-0 flex items-center justify-end box-border pointer-events-none max-w-[100vw]",
                        "md:pt-[max(1rem,env(safe-area-inset-top,0px))] md:pb-[max(1rem,env(safe-area-inset-bottom,0px))]",
                        activeBoardId
                            ? "w-full md:right-[max(1rem,env(safe-area-inset-right))] md:w-[min(85vw,72rem)] md:max-w-[calc(100vw-2rem)]"
                            : "w-full sm:w-[min(30rem,100vw)] md:right-[max(1rem,env(safe-area-inset-right))] md:w-[clamp(28rem,40vw,34rem)] md:max-w-[calc(100vw-2rem)]"
                    )}
                >
                  {/* Capa de arrastre: sigue al dedo (swipe hacia la DERECHA cierra). */}
                  <motion.div
                    data-testid="logic-curtain-swipe-layer"
                    className={cn(
                        "relative w-full h-full flex items-center justify-center pointer-events-auto",
                        activeBoardId
                            ? "bg-black/80 backdrop-blur-xl border border-amber-500/30 rounded-none md:rounded-3xl overflow-hidden"
                            : ""
                    )}
                    style={logicSwipe.motionStyle}
                    {...logicSwipe.handlers}
                  >
                    {/* Tirador de swipe (Logic cierra hacia la DERECHA) — sobre el panel */}
                    <div
                        className={cn(curtain.grabberSideRight, "pointer-events-auto")}
                        style={{ ["--cc" as string]: "#f59e0b" }}
                        {...logicSwipe.handlers}
                        role="presentation"
                    />

                    <div className="relative z-10 w-full h-full flex flex-col text-foreground">

                        {activeBoardId && activeBoardData ? (
                            <div className="h-full w-full relative pointer-events-auto">
                                {/* Close/Back Button for Board Viewer */}
                                <div className="absolute top-4 left-4 z-50 flex items-center">
                                    <Button variant="secondary" size="lg" onClick={handleCloseBoard} className="gap-2 backdrop-blur-md bg-background/50 rounded-full h-11 min-h-[44px] cursor-pointer">
                                        <ArrowLeft className="w-4 h-4 mr-1" /> Volver
                                    </Button>
                                    <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={handleClose} className="ml-2 hover:bg-destructive/20 hover:text-destructive rounded-full w-11 h-11 min-w-[44px] min-h-[44px] cursor-pointer">
                                        <X className="w-5 h-5" />
                                    </Button>
                                </div>
                                <UniversalBoardViewer />
                            </div>
                        ) : (
                            <>
                                {/* Control Center — móvil: rellena el wrapper; md+: tamaño propio centrado. */}
                                <div className="pointer-events-none w-full h-full flex items-center justify-center relative">
                                    <ControlCenter />
                                </div>
                                {/* Botón de cierre cristalino reutilizable (X, área táctil >= 44px, aria-label="Cerrar") */}
                                <div className="pointer-events-auto absolute top-4 right-4 z-50">
                                    <CurtainCloseButton onClose={handleClose} accent="#f59e0b" />
                                </div>
                            </>
                        )}
                    </div>
                  </motion.div>
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
                "h-auto py-3 px-4 flex items-center gap-4 w-full justify-start border bg-black/20 backdrop-blur-sm transition-all duration-300 group rounded-xl",
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

function PublicationButton({ icon, label, sub, onClick }: { icon: React.ReactNode, label: string, sub: string, onClick?: () => void }) {
    return (
        <Button
            variant="ghost"
            onClick={onClick}
            className="h-auto py-4 px-4 flex flex-col items-center text-center gap-2 w-full rounded-2xl border border-emerald-500/10 bg-emerald-950/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all group"
        >
            <div className="flex flex-col items-center gap-1 w-full relative z-10">
                <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-400 group-hover:bg-emerald-500/20 group-hover:text-emerald-300 group-hover:scale-110 transition-all duration-300">
                    {icon}
                </div>
                <span className="text-sm font-medium text-emerald-100 mt-1">{label}</span>
            </div>
            <span className="text-[10px] text-emerald-500/60 font-mono tracking-wider">{sub}</span>
        </Button>
    )
}
