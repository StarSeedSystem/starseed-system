"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Folder,
    MessageSquare,
    Plus,
    Settings,
    Share2,
    MoreVertical,
    Search,
    Bot,
    Server,
    FileText,
    BrainCircuit,
    ChevronRight,
    ChevronDown,
    Save,
    Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// --- Types ---
type Workspace = {
    id: string;
    name: string;
    folderId?: string;
    lastActive: string;
    icon?: React.ReactNode;
};

type FolderType = {
    id: string;
    name: string;
    color: string;
};

// --- Mock Data ---
const MOCK_FOLDERS: FolderType[] = [
    { id: 'f1', name: 'Proyectos Personales', color: 'cyan' },
    { id: 'f2', name: 'Investigación Política', color: 'emerald' },
    { id: 'f3', name: 'Desarrollo Sistema', color: 'amber' },
];

const MOCK_WORKSPACES: Workspace[] = [
    { id: 'w1', name: 'Planificación Ciudadela', folderId: 'f1', lastActive: '2h ago' },
    { id: 'w2', name: 'Análisis de Constitución', folderId: 'f2', lastActive: '1d ago' },
    { id: 'w3', name: 'Refactorización Core', folderId: 'f3', lastActive: '5m ago' },
    { id: 'w4', name: 'Ideas Sueltas', folderId: undefined, lastActive: '3d ago' },
];

export default function NexusPage() {
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>('w3');
    const [showConfig, setShowConfig] = useState(true);

    // State for folders (collapsed/expanded)
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
        'f1': true, 'f2': true, 'f3': true
    });

    const toggleFolder = (id: string) => {
        setExpandedFolders(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const selectedWorkspace = MOCK_WORKSPACES.find(w => w.id === selectedWorkspaceId);

    return (
        <div className="flex h-screen bg-black text-cyan-50 font-sans selection:bg-cyan-500/30">
            {/* --- SIDEBAR --- */}
            <div className="w-80 border-r border-cyan-500/10 flex flex-col bg-background/50 backdrop-blur-md">
                {/* Header */}
                <div className="p-4 border-b border-cyan-500/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="w-6 h-6 text-cyan-400" />
                        <span className="font-bold text-lg tracking-wide uppercase font-headline">Nexus</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-500/70 hover:text-cyan-300">
                        <Plus className="w-5 h-5" />
                    </Button>
                </div>

                {/* Search */}
                <div className="p-4 pt-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/40" />
                        <Input
                            placeholder="Buscar espacios..."
                            className="pl-9 bg-cyan-950/10 border-cyan-500/20 text-cyan-100 placeholder:text-cyan-500/30 h-9"
                        />
                    </div>
                </div>

                {/* Workspaces List */}
                <ScrollArea className="flex-1 px-3">
                    <div className="space-y-4 py-2">

                        {/* Folders */}
                        {MOCK_FOLDERS.map(folder => (
                            <div key={folder.id} className="space-y-1">
                                <button
                                    onClick={() => toggleFolder(folder.id)}
                                    className="flex items-center w-full p-2 text-xs font-medium text-cyan-500/70 hover:text-cyan-300 transition-colors uppercase tracking-wider group"
                                >
                                    {expandedFolders[folder.id] ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                                    <Folder className={cn("w-3 h-3 mr-2", `text-${folder.color}-400`)} />
                                    {folder.name}
                                </button>

                                {expandedFolders[folder.id] && (
                                    <div className="ml-3 border-l border-cyan-500/10 pl-2 space-y-1">
                                        {MOCK_WORKSPACES.filter(w => w.folderId === folder.id).map(ws => (
                                            <WorkspaceItem
                                                key={ws.id}
                                                active={selectedWorkspaceId === ws.id}
                                                workspace={ws}
                                                onClick={() => setSelectedWorkspaceId(ws.id)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Uncategorized */}
                        <div className="space-y-1 pt-2">
                            <div className="px-2 text-[10px] text-cyan-500/40 uppercase tracking-widest font-semibold">Sin archivar</div>
                            {MOCK_WORKSPACES.filter(w => !w.folderId).map(ws => (
                                <WorkspaceItem
                                    key={ws.id}
                                    active={selectedWorkspaceId === ws.id}
                                    workspace={ws}
                                    onClick={() => setSelectedWorkspaceId(ws.id)}
                                />
                            ))}
                        </div>

                    </div>
                </ScrollArea>

                {/* User Footer */}
                <div className="p-4 border-t border-cyan-500/10 bg-cyan-950/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-cyan-500/20">
                            AL
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-cyan-100">Alex</span>
                            <span className="text-[10px] text-cyan-500/60">Plan Pro</span>
                        </div>
                        <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 text-cyan-500/50 hover:text-cyan-300">
                            <Settings className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <div className="flex-1 flex flex-col bg-background/80 relative overflow-hidden">
                {/* Background Grid */}
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(6,182,212,0.15) 1px, transparent 0)', backgroundSize: '40px 40px' }}
                />

                {selectedWorkspace ? (
                    <>
                        {/* Header */}
                        <header className="h-16 border-b border-cyan-500/10 flex items-center justify-between px-6 z-10 bg-background/50 backdrop-blur-sm">
                            <div className="flex items-center gap-4">
                                <h2 className="text-xl font-medium text-cyan-50">{selectedWorkspace.name}</h2>
                                <Badge variant="outline" className="text-cyan-400 border-cyan-500/20 bg-cyan-500/5 text-[10px] uppercase tracking-widest">
                                    Activo
                                </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-cyan-500/20 hover:bg-cyan-500/10 text-cyan-200 gap-2"
                                >
                                    <Share2 className="w-4 h-4" />
                                    Compartir
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowConfig(!showConfig)}
                                    className={cn("transition-colors", showConfig ? "text-cyan-400 bg-cyan-500/20" : "text-cyan-500/50 hover:text-cyan-200")}
                                >
                                    <MoreVertical className="w-5 h-5" />
                                </Button>
                            </div>
                        </header>

                        <div className="flex-1 flex overflow-hidden z-10">
                            {/* Chat Area */}
                            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4">
                                <ScrollArea className="flex-1 pr-4">
                                    <div className="space-y-8 py-4">
                                        {/* Mock Messages */}
                                        <div className="flex gap-4">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex-shrink-0" />
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm">Alex</span>
                                                    <span className="text-xs text-cyan-500/50">Hace 2 horas</span>
                                                </div>
                                                <div className="text-sm text-cyan-100/80 leading-relaxed bg-white/5 p-3 rounded-md rounded-tl-none border border-white/5">
                                                    Necesito analizar la estructura actual de los nodos de gobernanza en la Constitución.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 text-emerald-300">
                                                <Bot className="w-5 h-5" />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm text-emerald-300">Arquitecto</span>
                                                    <span className="text-xs text-cyan-500/50">Hace 2 horas</span>
                                                </div>
                                                <div className="text-sm text-cyan-100/90 leading-relaxed">
                                                    Entendido. He cargado el archivo <span className="text-cyan-300 bg-cyan-500/10 px-1 rounded">constitucion_v3.pdf</span> en el contexto.
                                                    <br /><br />
                                                    Actualmente, la estructura se basa en 3 pilares fundamentales:
                                                    <ul className="list-disc list-inside mt-2 space-y-1 text-cyan-200/80">
                                                        <li>Nodos Locales (Barrio/Comunidad)</li>
                                                        <li>Nodos Regionales (Coordinación)</li>
                                                        <li>Nodo Central (Sincronización de Recursos)</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>

                                {/* Input Area */}
                                <div className="mt-4 bg-background/50 backdrop-blur-md border border-cyan-500/20 rounded-xl p-2 relative shadow-lg shadow-cyan-900/10 focus-within:ring-1 focus-within:ring-cyan-500/50 transition-all">
                                    <Textarea
                                        placeholder="Escribe un mensaje para Arquitecto..."
                                        className="min-h-[60px] max-h-[200px] border-none bg-transparent resize-none p-3 placeholder:text-cyan-500/30 focus-visible:ring-0"
                                    />
                                    <div className="flex items-center justify-between px-2 pb-1">
                                        <div className="flex gap-2">
                                            {/* Attachments / Actions */}
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-cyan-500/50 hover:text-cyan-300">
                                                <Plus className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <Button size="icon" className="h-8 w-8 bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                                            <Send className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Configuration Panel (Right Sidebar) */}
                            <AnimatePresence>
                                {showConfig && (
                                    <motion.div
                                        initial={{ width: 0, opacity: 0 }}
                                        animate={{ width: 320, opacity: 1 }}
                                        exit={{ width: 0, opacity: 0 }}
                                        className="border-l border-cyan-500/10 bg-background/50 backdrop-blur-md overflow-hidden flex flex-col"
                                    >
                                        <div className="p-4 border-b border-cyan-500/10">
                                            <h3 className="font-semibold text-sm uppercase tracking-wider text-cyan-500">Configuración del Espacio</h3>
                                        </div>
                                        <ScrollArea className="flex-1 p-4">
                                            <div className="space-y-6">

                                                {/* AI Model */}
                                                <div className="space-y-3">
                                                    <label className="text-xs font-medium text-cyan-300 flex items-center gap-2">
                                                        <BrainCircuit className="w-3 h-3" /> Modelo IA
                                                    </label>
                                                    <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 hover:border-cyan-500/40 transition-colors cursor-pointer flex items-center justify-between group">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">Gemini 1.5 Pro</span>
                                                            <span className="text-[10px] text-cyan-500/60">Optimizado para razonamiento</span>
                                                        </div>
                                                        <ChevronDown className="w-4 h-4 text-cyan-500/50 group-hover:text-cyan-300" />
                                                    </div>
                                                </div>

                                                {/* Agent Persona */}
                                                <div className="space-y-3">
                                                    <label className="text-xs font-medium text-cyan-300 flex items-center gap-2">
                                                        <Bot className="w-3 h-3" /> Agente
                                                    </label>
                                                    <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition-colors cursor-pointer flex items-center justify-between group">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-emerald-100">Arquitecto</span>
                                                            <span className="text-[10px] text-emerald-500/60">Diseño de sistemas y estructura</span>
                                                        </div>
                                                        <ChevronDown className="w-4 h-4 text-emerald-500/50 group-hover:text-emerald-300" />
                                                    </div>
                                                </div>

                                                <Separator className="bg-cyan-500/10" />

                                                {/* Context / Instructions */}
                                                <div className="space-y-3">
                                                    <label className="text-xs font-medium text-cyan-300 flex items-center gap-2">
                                                        <FileText className="w-3 h-3" /> Instrucciones del Sistema
                                                    </label>
                                                    <Textarea
                                                        className="bg-black/20 border-cyan-500/20 text-xs min-h-[100px] resize-none focus-visible:ring-cyan-500/30"
                                                        placeholder="Define cómo debe comportarse la IA en este espacio..."
                                                        defaultValue="Actúa como un arquitecto experto en sistemas descentralizados. Analiza siempre las implicaciones de segundo orden."
                                                    />
                                                </div>

                                                {/* Files */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-xs font-medium text-cyan-300 flex items-center gap-2">
                                                            <Server className="w-3 h-3" /> Archivos de Contexto
                                                        </label>
                                                        <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-cyan-500/20 rounded-full">
                                                            <Plus className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2 p-2 rounded-md bg-white/5 border border-white/5">
                                                            <FileText className="w-4 h-4 text-cyan-500/70" />
                                                            <span className="text-xs text-cyan-100 truncate flex-1">constitucion_v3.pdf</span>
                                                            <span className="text-[10px] text-cyan-500/50">2.4MB</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 p-2 rounded-md bg-white/5 border border-white/5">
                                                            <FileText className="w-4 h-4 text-cyan-500/70" />
                                                            <span className="text-xs text-cyan-100 truncate flex-1">notas_reunion.txt</span>
                                                            <span className="text-[10px] text-cyan-500/50">12KB</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <Button className="w-full mt-4 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                                    <Save className="w-4 h-4 mr-2" />
                                                    Guardar Configuración
                                                </Button>

                                            </div>
                                        </ScrollArea>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
                        <BrainCircuit className="w-16 h-16 text-cyan-500/30 mb-6" />
                        <h2 className="text-2xl font-light font-headline uppercase tracking-widest text-cyan-100">Portal Nexus</h2>
                        <p className="max-w-md text-cyan-200/50 mt-2">Selecciona un espacio de trabajo o crea uno nuevo para comenzar a interactuar con la red.</p>
                        <Button className="mt-8 bg-cyan-500 hover:bg-cyan-400 text-black">
                            <Plus className="w-4 h-4 mr-2" />
                            Nuevo Espacio
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

function WorkspaceItem({ active, workspace, onClick }: { active: boolean, workspace: Workspace, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center justify-between p-3 rounded-lg text-left transition-all duration-200 group relative",
                active
                    ? "bg-cyan-500/20 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    : "hover:bg-white/5 border border-transparent"
            )}
        >
            {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-cyan-400 rounded-r-full" />}

            <div className="flex items-center gap-3 overflow-hidden">
                <div className={cn(
                    "w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-colors",
                    active ? "bg-cyan-500/20 text-cyan-300" : "bg-white/5 text-cyan-500/50 group-hover:text-cyan-400"
                )}>
                    <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex flex-col overflow-hidden">
                    <span className={cn(
                        "text-sm font-medium truncate transition-colors",
                        active ? "text-cyan-50" : "text-cyan-200/70 group-hover:text-cyan-100"
                    )}>
                        {workspace.name}
                    </span>
                    <span className="text-[10px] text-cyan-500/40 truncate">
                        Activo {workspace.lastActive}
                    </span>
                </div>
            </div>
        </button>
    )
}
