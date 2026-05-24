"use client";

// Force rebuild

import React, { useState, useRef, useEffect } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetTrigger
} from "@/components/ui/sheet";
import { useAppearance } from "@/context/appearance-context";
import { useControlPanel } from "@/context/control-panel-context";
import { useBoardSystem } from "@/context/board-context"; // Import BoardContext
import UniversalBoardViewer from "./board/universal-board-viewer"; // Import new Viewer
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Bot,
    Layout,
    Settings2,
    Send,
    Plus,
    Share2,
    Maximize2,
    Trash2,
    Download,
    Store,
    BookOpen
} from "lucide-react";
import { MarketplaceView } from "./board/marketplace-view";

export function ControlPanel() {
    const {
        isOpen, setIsOpen,
        activeTab, setActiveTab,
    } = useControlPanel();
    const { config, updateSection } = useAppearance();
    const { menuPosition } = config.mobile.controlPanel;

    const {
        boards,
        activeBoardId,
        createBoard,
        setActiveBoard,
        deleteBoard,
        setViewMode
    } = useBoardSystem();

    const activeBoardData = boards.find(b => b.id === activeBoardId);

    const formatDate = (ts: number) => {
        return new Intl.DateTimeFormat('es-ES', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(new Date(ts));
    };

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

    // --- CHROMODYNAMIC SYSTEM ---
    // Maps tabs to the Trinity Color Spectrum
    const colorMap: Record<string, string> = {
        ai: "border-cyan-500/50 shadow-[0_0_50px_-10px_rgba(6,182,212,0.15)]", // The Guide (Blue/Cyan)
        boards: "border-emerald-500/50 shadow-[0_0_50px_-10px_rgba(16,185,129,0.15)]", // Creation (Green)
        store: "border-purple-500/50 shadow-[0_0_50px_-10px_rgba(168,85,247,0.15)]", // Library/Store (Purple - Auxiliary)
        widgets: "border-amber-500/50 shadow-[0_0_50px_-10px_rgba(245,158,11,0.15)]", // Logic (Amber)
    };

    const activeColorClass = colorMap[activeTab] || "border-primary/10";

    // Dynamic Tab Trigger Styles
    const getTabTriggerStyle = (val: string, colorClass: string) => (
        cn(
            "flex gap-2 transition-all duration-300 data-[state=active]:bg-background/80 data-[state=active]:shadow-sm",
            activeTab === val ? colorClass : "text-muted-foreground hover:text-foreground"
        )
    );

    // --- SPATIAL POSITIONING (ZERO UI) ---
    // The panel physically manifests from the direction of its intent.
    const SHEET_SIDES: Record<string, "top" | "bottom" | "left" | "right"> = {
        ai: "top",      // Zenith (North)
        boards: "left", // Horizon (West)
        widgets: "right", // Logic (East)
        store: "right"  // Auxiliary
    };

    const sheetSide = SHEET_SIDES[activeTab] || "right";

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent
                side={sheetSide}
                className={cn(
                    "flex flex-col p-0 gap-0 border-l transition-all duration-500 ease-out",
                    activeBoardId ? "w-full sm:w-[90vw] lg:w-[85vw]" : "w-[85vw] sm:w-[500px]",
                    activeColorClass // Apply the glowing border based on active tab
                )}
            >
                {activeBoardId && activeBoardData ? (
                    <div className="h-full w-full relative">
                        {/* Close/Back Button for Board Viewer */}
                        <div className="absolute top-4 left-4 z-50">
                            <Button variant="secondary" size="sm" onClick={handleCloseBoard} className="gap-2 backdrop-blur-md bg-background/50">
                                ← Volver
                            </Button>
                        </div>
                        <UniversalBoardViewer />
                    </div>
                ) : (
                    <>
                        {/* Header with Dynamic Color Background */}
                        <div className={cn("p-6 border-b bg-muted/20 transition-colors duration-500",
                            activeTab === 'ai' && "bg-cyan-950/10",
                            activeTab === 'boards' && "bg-emerald-950/10",
                            activeTab === 'widgets' && "bg-amber-950/10",
                            activeTab === 'store' && "bg-purple-950/10"
                        )}>
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2">
                                    {activeTab === 'ai' && <Bot className="h-5 w-5 text-cyan-400 animate-pulse" />}
                                    {activeTab === 'boards' && <Layout className="h-5 w-5 text-emerald-400" />}
                                    {activeTab === 'widgets' && <Settings2 className="h-5 w-5 text-amber-400" />}
                                    {activeTab === 'store' && <Store className="h-5 w-5 text-purple-400" />}
                                    <span className={cn("transition-colors",
                                        activeTab === 'ai' && "text-cyan-400",
                                        activeTab === 'boards' && "text-emerald-400",
                                        activeTab === 'widgets' && "text-amber-400",
                                        activeTab === 'store' && "text-purple-400"
                                    )}>
                                        Panel de Control
                                    </span>
                                </SheetTitle>
                                <SheetDescription>
                                    {activeTab === 'ai' ? "Inteligencia Contextual y Guía (Eje Superior)." :
                                        activeTab === 'boards' ? "Lienzo de Creación Universal (Eje Izquierdo)." :
                                            activeTab === 'widgets' ? "Lógica de Sistema y Configuración (Eje Derecho)." :
                                                "Centro de Operaciones StarSeed."}
                                </SheetDescription>
                            </SheetHeader>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-6 pt-4">
                                <TabsList className="grid w-full grid-cols-4 bg-muted/50">
                                    <TabsTrigger value="ai" className={getTabTriggerStyle("ai", "text-cyan-400 data-[state=active]:text-cyan-400")}>
                                        <Bot className="h-4 w-4" /> <span className="hidden sm:inline">IA</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="boards" className={getTabTriggerStyle("boards", "text-emerald-400 data-[state=active]:text-emerald-400")}>
                                        <Layout className="h-4 w-4" /> <span className="hidden sm:inline">Crear</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="store" className={getTabTriggerStyle("store", "text-purple-400 data-[state=active]:text-purple-400")}>
                                        <BookOpen className="h-4 w-4" /> <span className="hidden sm:inline">Biblio</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="widgets" className={getTabTriggerStyle("widgets", "text-amber-400 data-[state=active]:text-amber-400")}>
                                        <Settings2 className="h-4 w-4" /> <span className="hidden sm:inline">Lógica</span>
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            {/* AI CONTENT (CYAN) */}
                            <TabsContent value="ai" className="flex-1 flex flex-col p-6 gap-4 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:zoom-in-[0.98]">
                                <ScrollArea className="flex-1 rounded-md border p-4 bg-cyan-950/5 border-cyan-500/10">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex gap-3 items-start">
                                            <div className="h-8 w-8 rounded-full bg-cyan-500/10 flex items-center justify-center shrink-0">
                                                <Bot className="h-4 w-4 text-cyan-400" />
                                            </div>
                                            <div className="bg-muted p-3 rounded-lg rounded-tl-none text-sm text-foreground/90">
                                                Estoy conectado al Eje Superior. ¿En qué te ayudo a proyectar hoy?
                                            </div>
                                        </div>
                                        {/* Quick Commands for creating boards */}
                                        <div className="grid grid-cols-2 gap-2 mt-4">
                                            <Button variant="outline" className="h-auto py-2 flex flex-col items-center gap-1 text-xs hover:bg-cyan-500/10 hover:text-cyan-400" onClick={handleCreateBoard}>
                                                <Layout className="h-4 w-4" />
                                                Nueva Pizarra
                                            </Button>
                                            <Button variant="outline" className="h-auto py-2 flex flex-col items-center gap-1 text-xs" disabled>
                                                <Share2 className="h-4 w-4" />
                                                Importar Red
                                            </Button>
                                        </div>
                                    </div>
                                </ScrollArea>
                                <div className="flex gap-2">
                                    <Input placeholder="Consulta al Arquiteto..." className="border-cyan-500/20 focus-visible:ring-cyan-500/30" />
                                    <Button size="icon" className="bg-cyan-600 hover:bg-cyan-500"><Send className="h-4 w-4" /></Button>
                                </div>
                            </TabsContent>

                            {/* BOARDS CONTENT (EMERALD) */}
                            <TabsContent value="boards" className="flex-1 flex flex-col p-6 gap-4 data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:zoom-in-[0.98]">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-emerald-500">Mis Pizarras ({boards.length})</h3>
                                    <Button size="sm" variant="outline" className="gap-2 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400" onClick={handleCreateBoard}>
                                        <Plus className="h-4 w-4" /> Nueva
                                    </Button>
                                </div>

                                <ScrollArea className="flex-1 rounded-md border border-emerald-500/10 bg-emerald-950/5 p-2">
                                    {boards.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground p-6">
                                            <Layout className="h-8 w-8 mb-2 opacity-50 text-emerald-500" />
                                            <p className="text-sm">El lienzo está vacío.</p>
                                            <Button variant="link" className="text-emerald-400" onClick={handleCreateBoard}>Iniciar Creación</Button>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {boards.map((board) => (
                                                <div
                                                    key={board.id}
                                                    className="flex items-center justify-between p-3 rounded-lg border border-emerald-500/10 bg-card/40 hover:bg-emerald-500/10 transition-colors group cursor-pointer"
                                                    onClick={() => handleOpenBoard(board.id)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                            <Layout className="h-5 w-5 text-emerald-400" />
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <p className="font-medium text-sm truncate text-emerald-100">{board.name}</p>
                                                            <p className="text-xs text-muted-foreground">{board.widgets.length} nexos • {formatDate(board.updatedAt)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-400" onClick={(e) => { e.stopPropagation(); handleOpenBoard(board.id); }}>
                                                            <Maximize2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            {/* STORE CONTENT (PURPLE) */}
                            <TabsContent value="store" className="flex-1 overflow-hidden data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:zoom-in-[0.98]">
                                <MarketplaceView />
                            </TabsContent>

                            {/* WIDGETS CONTENT (AMBER) */}
                            <TabsContent value="widgets" className="flex-1 p-6 data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:zoom-in-[0.98]">
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center gap-2 border border-amber-500/10 rounded-md bg-amber-950/5">
                                    <Settings2 className="h-12 w-12 opacity-20 text-amber-500" />
                                    <p className="text-amber-500/60">Configuración Lógica del Sistema.</p>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </>
                )}
            </SheetContent>
        </Sheet >
    );
}
