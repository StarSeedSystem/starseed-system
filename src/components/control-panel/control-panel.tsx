"use client";

import React, { useState } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetTrigger
} from "@/components/ui/sheet";
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
    Store
} from "lucide-react";
import { MarketplaceView } from "./board/marketplace-view";

export function ControlPanel() {
    const {
        isOpen, setIsOpen,
        activeTab, setActiveTab,
    } = useControlPanel();

    const {
        boards,
        activeBoardId,
        createBoard,
        setActiveBoard,
        deleteBoard,
        setViewMode
    } = useBoardSystem();

    const activeBoardData = boards.find(b => b.id === activeBoardId);

    // Format date helper
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

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            {/* FAB Trigger - kept for accessibility/convenience */}
            <SheetTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-50 bg-background/80 backdrop-blur-md border-primary/20 hover:border-primary hover:shadow-primary/20 transition-all duration-300"
                >
                    <Bot className="h-6 w-6 text-primary animate-pulse" />
                    <span className="sr-only">Panel de Control</span>
                </Button>
            </SheetTrigger>
            <SheetContent
                side="right"
                className={cn(
                    "flex flex-col p-0 gap-0 border-l-primary/10 transition-all duration-500",
                    activeBoardId ? "w-full sm:w-[90vw] lg:w-[85vw]" : "w-[400px] sm:w-[500px]"
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
                        <div className="p-6 border-b bg-muted/20">
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2">
                                    <Bot className="h-5 w-5 text-primary" />
                                    Panel de Control StarSeed
                                </SheetTitle>
                                <SheetDescription>
                                    Centro de Operaciones: IA, Pizarras y Herramientas.
                                </SheetDescription>
                            </SheetHeader>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-6 pt-4">
                                <TabsList className="grid w-full grid-cols-4">
                                    <TabsTrigger value="ai" className="flex gap-2"><Bot className="h-4 w-4" /> IA</TabsTrigger>
                                    <TabsTrigger value="boards" className="flex gap-2"><Layout className="h-4 w-4" /> Pizarras</TabsTrigger>
                                    <TabsTrigger value="store" className="flex gap-2"><Store className="h-4 w-4" /> Bibliotecas</TabsTrigger>
                                    <TabsTrigger value="widgets" className="flex gap-2"><Settings2 className="h-4 w-4" /> Widgets</TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="ai" className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
                                <ScrollArea className="flex-1 rounded-md border p-4 bg-muted/10">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex gap-3 items-start">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <Bot className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="bg-muted p-3 rounded-lg rounded-tl-none text-sm">
                                                Hola, piloto. Soy tu asistente de arquitectura. ¿Qué deseas crear hoy?
                                            </div>
                                        </div>
                                        {/* Quick Commands for creating boards */}
                                        <div className="grid grid-cols-2 gap-2 mt-4">
                                            <Button variant="outline" className="h-auto py-2 flex flex-col items-center gap-1 text-xs" onClick={handleCreateBoard}>
                                                <Layout className="h-4 w-4 text-primary" />
                                                Nueva Pizarra
                                            </Button>
                                            <Button variant="outline" className="h-auto py-2 flex flex-col items-center gap-1 text-xs" disabled>
                                                <Share2 className="h-4 w-4 text-primary" />
                                                Importar Red
                                            </Button>
                                        </div>
                                    </div>
                                </ScrollArea>
                                <div className="flex gap-2">
                                    <Input placeholder="Describe tu idea para generar una pizarra..." />
                                    <Button size="icon"><Send className="h-4 w-4" /></Button>
                                </div>
                            </TabsContent>

                            <TabsContent value="boards" className="flex-1 flex flex-col p-6 gap-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium">Mis Pizarras ({boards.length})</h3>
                                    <Button size="sm" variant="outline" className="gap-2" onClick={handleCreateBoard}>
                                        <Plus className="h-4 w-4" /> Nueva
                                    </Button>
                                </div>

                                <ScrollArea className="flex-1">
                                    {boards.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border-2 border-dashed rounded-xl p-6">
                                            <Layout className="h-8 w-8 mb-2 opacity-50" />
                                            <p className="text-sm">No tienes pizarras activas.</p>
                                            <Button variant="link" onClick={handleCreateBoard}>Crear una ahora</Button>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {boards.map((board) => (
                                                <div
                                                    key={board.id}
                                                    className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-muted/50 transition-colors group cursor-pointer"
                                                    onClick={() => handleOpenBoard(board.id)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                                                            <Layout className="h-5 w-5 text-primary" />
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <p className="font-medium text-sm truncate">{board.name}</p>
                                                            <p className="text-xs text-muted-foreground">{board.widgets.length} widgets • {formatDate(board.updatedAt)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={(e) => { e.stopPropagation(); handleOpenBoard(board.id); }}>
                                                            <Maximize2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="store" className="flex-1 overflow-hidden">
                                <MarketplaceView />
                            </TabsContent>

                            <TabsContent value="widgets" className="flex-1 p-6">
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center gap-2">
                                    <Settings2 className="h-12 w-12 opacity-20" />
                                    <p>Configuración de Widgets en desarrollo.</p>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
