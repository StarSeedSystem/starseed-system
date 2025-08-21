// src/components/canvas-editor.tsx
'use client'

import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "./ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { X, Layers, Settings, PanelLeft, PanelRight, MousePointer, PlusCircle, Type, RectangleHorizontal, Library, AppWindow, Sparkles, AlignCenter, AlignLeft, AlignRight, Group, MoveUp, MoveDown, FilePlus, Copy, Trash2, Pen, Video, Music, Bot, Square, TextCursor, GitCommit, Link as LinkIcon, Code, BarChart, MessageSquare, ListChecks, ArrowUp, ArrowDown, Scale, School, Palette, CaseSensitive, GitBranch, Clapperboard, Drama, PencilRuler, WholeWord, Baseline, Pilcrow, MessageCircleHeart, SquareAsterisk, Hand, Wand, Save, FolderOpen, Image as ImageIcon, Wand2, Star, Maximize } from "lucide-react";


export type CanvasElement = {
    id: number;
    canvasId: string;
    type: 'text' | 'shape' | 'button' | 'container' | 'code' | 'image';
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    // Text specific
    content?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    // Shape specific
    fillColor?: string;
    strokeColor?: string;
    // Common
    opacity?: number;
};

export type CanvasPage = {
    id: string;
    name: string;
}

export function CanvasEditor({ 
    isOpen, 
    onOpenChange, 
    area,
    editorTitle = "Editando Lienzo"
}: { 
    isOpen: boolean, 
    onOpenChange: (open: boolean) => void, 
    area: 'politics' | 'education' | 'culture' | 'comment' | 'message' | null,
    editorTitle?: string;
}) {
    const { toast } = useToast();
    
    const [pages, setPages] = useState<CanvasPage[]>([
        { id: 'canvas-1', name: 'Inicio' },
    ]);
    const [activePageId, setActivePageId] = useState<string>('canvas-1');

    const [elements, setElements] = useState<CanvasElement[]>([
        { id: 2, canvasId: 'canvas-1', type: 'shape', name: 'Fondo Decorativo', x: 20, y: 20, width: 700, height: 400, fillColor: '#1A1A1A', strokeColor: '#333333' },
        { id: 1, canvasId: 'canvas-1', type: 'text', name: 'Título Principal', content: 'Bienvenido a mi Lienzo', x: 50, y: 50, width: 400, height: 40, fontSize: 32, fontWeight: 'bold' },
        { id: 3, canvasId: 'canvas-1', type: 'text', name: 'Párrafo de introducción', content: 'Este es un espacio para la creatividad sin límites.', x: 50, y: 100, width: 400, height: 40, fontSize: 16, fontWeight: 'normal' },
    ]);
    const [selectedElementId, setSelectedElementId] = useState<number | null>(null);

    const [showLayers, setShowLayers] = useState(true);
    const [showProperties, setShowProperties] = useState(true);

    if (!area) return null;
    
    const handleAddElement = (type: CanvasElement['type'], name?: string) => {
        const newElement: CanvasElement = {
            id: Date.now(),
            canvasId: activePageId,
            type,
            name: name || `Nuevo ${type}`,
            x: 10, y: 10, width: 150, height: 50,
            // Defaults
            content: `Contenido de ${type}`,
            fontSize: 16,
            fontWeight: 'normal',
            fillColor: '#333333',
            strokeColor: '#555555',
            opacity: 100
        };
        setElements(prev => [newElement, ...prev]);
        setSelectedElementId(newElement.id);
        toast({ title: "Elemento Añadido", description: `Se ha añadido un nuevo elemento de tipo '${type}' al lienzo.` });
    };

    const handleAddPage = () => {
        const newPage: CanvasPage = {
            id: `canvas-${Date.now()}`,
            name: `Página ${pages.length + 1}`
        };
        setPages(prev => [...prev, newPage]);
        setActivePageId(newPage.id);
    }
    
    const activePageElements = elements.filter(el => el.canvasId === activePageId);
    const selectedElement = elements.find(el => el.id === selectedElementId);
    
    const updateSelectedElement = (newProps: Partial<CanvasElement>) => {
        if (!selectedElementId) return;
        setElements(elements.map(el => el.id === selectedElementId ? {...el, ...newProps} : el));
    }

    const renderContextualTools = () => {
        if (area === 'education') {
            return (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger><School className="mr-2"/>Contextuales: Educación</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem><MessageSquare className="mr-2"/>Bloque de Cita</DropdownMenuItem>
                        <DropdownMenuItem><ListChecks className="mr-2"/>Examen Interactivo</DropdownMenuItem>
                        <DropdownMenuItem><GitCommit className="mr-2"/>Diagrama Explicativo</DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )
        }
         if (area === 'politics') {
            return (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger><Scale className="mr-2"/>Contextuales: Política</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem>Bloque de Propuesta</DropdownMenuItem>
                        <DropdownMenuItem>Sección de Votación</DropdownMenuItem>
                        <DropdownMenuItem>Análisis de Impacto</DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )
        }
        return null;
    }
    
    const renderPropertiesPanel = () => {
        if (!selectedElement) {
            return <p className="text-sm text-muted-foreground">Selecciona un elemento para editar sus propiedades.</p>
        }

        return (
            <div className="space-y-4 pr-2">
                {/* Common Properties */}
                <div className="space-y-1">
                    <Label htmlFor="el-name">Nombre de la Capa</Label>
                    <Input id="el-name" value={selectedElement.name} onChange={(e) => updateSelectedElement({ name: e.target.value })} />
                </div>
                
                <div>
                    <Label>Transformación</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <Input type="number" placeholder="X" value={selectedElement.x} onChange={(e) => updateSelectedElement({ x: parseInt(e.target.value) || 0 })} />
                        <Input type="number" placeholder="Y" value={selectedElement.y} onChange={(e) => updateSelectedElement({ y: parseInt(e.target.value) || 0 })} />
                        <Input type="number" placeholder="Ancho" value={selectedElement.width} onChange={(e) => updateSelectedElement({ width: parseInt(e.target.value) || 0 })} />
                        <Input type="number" placeholder="Alto" value={selectedElement.height} onChange={(e) => updateSelectedElement({ height: parseInt(e.target.value) || 0 })} />
                    </div>
                </div>

                <div>
                    <Label>Alineación</Label>
                     <div className="flex gap-1 mt-1">
                        <Button variant="outline" size="icon" className="h-8 w-8"><AlignLeft/></Button>
                        <Button variant="outline" size="icon" className="h-8 w-8"><AlignCenter/></Button>
                        <Button variant="outline" size="icon" className="h-8 w-8"><AlignRight/></Button>
                     </div>
                </div>

                {/* Text Properties */}
                {selectedElement.type === 'text' && (
                    <div className="space-y-4 border-t pt-4">
                        <h4 className="font-semibold text-sm">Tipografía</h4>
                        <div className="space-y-1">
                            <Label htmlFor="el-content">Contenido</Label>
                            <Textarea id="el-content" placeholder="Escribe el texto aquí..." value={selectedElement.content} onChange={(e) => updateSelectedElement({ content: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label htmlFor="el-fontsize">Tamaño</Label>
                                <Input id="el-fontsize" type="number" placeholder="16" value={selectedElement.fontSize} onChange={(e) => updateSelectedElement({ fontSize: parseInt(e.target.value) || 16 })} />
                            </div>
                             <div className="space-y-1">
                                <Label htmlFor="el-fontweight">Peso</Label>
                                <select id="el-fontweight" value={selectedElement.fontWeight} onChange={(e) => updateSelectedElement({ fontWeight: e.target.value as 'normal' | 'bold' })} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value="normal">Normal</option>
                                    <option value="bold">Bold</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Shape Properties */}
                {(selectedElement.type === 'shape' || selectedElement.type === 'container') && (
                     <div className="space-y-4 border-t pt-4">
                        <h4 className="font-semibold text-sm">Apariencia</h4>
                         <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <Label htmlFor="el-fill">Relleno</Label>
                                <Input id="el-fill" type="color" value={selectedElement.fillColor} onChange={(e) => updateSelectedElement({ fillColor: e.target.value })} className="p-1" />
                            </div>
                             <div className="space-y-1">
                                <Label htmlFor="el-stroke">Borde</Label>
                                <Input id="el-stroke" type="color" value={selectedElement.strokeColor} onChange={(e) => updateSelectedElement({ strokeColor: e.target.value })} className="p-1" />
                            </div>
                         </div>
                     </div>
                )}

            </div>
        )
    }


    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-screen h-screen max-w-full max-h-full flex flex-col p-0 gap-0">
                 <DialogHeader className="p-2 border-b flex-row items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <DialogClose asChild>
                            <Button variant="ghost" size="icon"><X/></Button>
                        </DialogClose>
                         <Separator orientation="vertical" className="h-6" />
                         <DialogTitle className="font-headline text-lg">{editorTitle}</DialogTitle>
                         
                         <Button variant="ghost" size="icon" onClick={() => setShowLayers(!showLayers)} title="Mostrar/Ocultar Capas"><PanelLeft /></Button>
                         <Button variant="ghost" size="icon" onClick={() => setShowProperties(!showProperties)} title="Mostrar/Ocultar Propiedades"><PanelRight /></Button>
                    </div>

                    {/* Main Toolbar */}
                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Insertar Elemento</Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger><Library className="mr-2"/>Media (desde Biblioteca)</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={() => handleAddElement('image', 'Nueva Imagen')}><ImageIcon className="mr-2"/>Imagen</DropdownMenuItem>
                                        <DropdownMenuItem><Video className="mr-2"/>Video</DropdownMenuItem>
                                        <DropdownMenuItem><Music className="mr-2"/>Audio</DropdownMenuItem>
                                        <DropdownMenuItem><Bot className="mr-2"/>Modelo 3D</DropdownMenuItem>
                                        <DropdownMenuItem><ImageIcon className="mr-2"/>Avatar</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger><Clapperboard className="mr-2"/>Interactivos</DropdownMenuSubTrigger>
                                     <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={() => handleAddElement('button', 'Nuevo Botón')}><div className="w-4 h-4 border rounded-sm flex items-center justify-center text-xs mr-2">B</div>Botón</DropdownMenuItem>
                                        <DropdownMenuItem>Galería de Imágenes</DropdownMenuItem>
                                        <DropdownMenuItem>Carrusel de Videos</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                 <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger><Drama className="mr-2"/>Avanzados</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem><AppWindow className="mr-2"/>App Embebida</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleAddElement('code', 'Código Personalizado')}><Code className="mr-2"/>Código Personalizado</DropdownMenuItem>
                                        <DropdownMenuItem><BarChart className="mr-2"/>Gráfica de Datos</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                {renderContextualTools()}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Herramientas de Creación</Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem><MousePointer className="mr-2"/>Selección (V)</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAddElement('text', 'Nuevo Texto')}><Type className="mr-2"/>Texto (T)</DropdownMenuItem>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger><Square className="mr-2"/>Formas (R)</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                         <DropdownMenuItem onClick={() => handleAddElement('shape', 'Rectángulo')}>Rectángulo</DropdownMenuItem>
                                         <DropdownMenuItem onClick={() => handleAddElement('shape', 'Elipse')}>Elipse</DropdownMenuItem>
                                         <DropdownMenuItem onClick={() => handleAddElement('shape', 'Polígono')}>Polígono</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuItem><Baseline className="mr-2"/>Línea / Flecha (L)</DropdownMenuItem>
                                <DropdownMenuItem><Pen className="mr-2"/>Pincel (B)</DropdownMenuItem>
                                <DropdownMenuItem><SquareAsterisk className="mr-2"/>Borrador (E)</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAddElement('container', 'Nuevo Contenedor')}><div className="w-4 h-4 border rounded-sm mr-2"></div>Contenedor</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Herramientas de Edición</Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem><Group className="mr-2"/>Agrupar / Desagrupar</DropdownMenuItem>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger><GitBranch className="mr-2"/>Interacciones</DropdownMenuSubTrigger>
                                     <DropdownMenuSubContent>
                                        <DropdownMenuItem>Al hacer click</DropdownMenuItem>
                                        <DropdownMenuItem>Al pasar el cursor</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                 <DropdownMenuSub>
                                    <DropdownMenuSubTrigger><Wand2 className="mr-2"/>Transiciones y Animaciones</DropdownMenuSubTrigger>
                                     <DropdownMenuSubContent>
                                        <DropdownMenuItem>Animación de Entrada</DropdownMenuItem>
                                        <DropdownMenuItem>Animación de Salida</DropdownMenuItem>
                                        <DropdownMenuItem>Línea de Tiempo</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuSub>
                                    <DropdownMenuSubTrigger><PencilRuler className="mr-2"/>Ajustes del Lienzo</DropdownMenuSubTrigger>
                                     <DropdownMenuSubContent>
                                        <DropdownMenuItem><Maximize className="mr-2"/>Tamaño del Lienzo</DropdownMenuItem>
                                        <DropdownMenuItem><ImageIcon className="mr-2"/>Fondo del Lienzo</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </DropdownMenuContent>
                        </DropdownMenu>
                       
                        <Button variant="ghost" size="sm" onClick={() => toast({ title: "Asistente de IA Próximamente"})}><Sparkles/> Asistente IA</Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm"><FolderOpen className="mr-2"/> Guardar/Abrir Borrador</Button>
                        <Button size="sm" onClick={() => onOpenChange(false)}><Save className="mr-2"/> Guardar y Cerrar</Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    {/* Layers & Pages Panel */}
                    <aside className={cn("bg-background/80 border-r transition-all duration-300 flex flex-col", showLayers ? "w-64" : "w-0 overflow-hidden")}>
                        <div className="p-4 border-b">
                            <h3 className="font-headline text-lg flex items-center gap-2"><FilePlus/> Lienzos</h3>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="space-y-1 px-2 py-2">
                                {pages.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setActivePageId(p.id)}
                                        className={cn(
                                            "w-full text-left p-2 rounded-md flex items-center gap-2 text-sm",
                                            activePageId === p.id ? "bg-muted font-semibold" : "hover:bg-muted/50"
                                        )}
                                    >
                                        <span className="truncate flex-1">{p.name}</span>
                                        <Copy className="h-3 w-3 opacity-50 hover:opacity-100"/>
                                        <Trash2 className="h-3 w-3 opacity-50 hover:opacity-100"/>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                        <div className="p-2 border-t">
                            <Button variant="outline" size="sm" className="w-full" onClick={handleAddPage}>
                                <PlusCircle className="mr-2"/> Añadir Lienzo
                            </Button>
                        </div>
                        <Separator />
                        <div className="p-4 border-b">
                            <h3 className="font-headline text-lg flex items-center gap-2"><Layers/> Capas</h3>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="space-y-1 pr-2 pb-4 pl-2 pt-2">
                                {activePageElements.map(el => (
                                    <button 
                                        key={el.id} 
                                        onClick={() => setSelectedElementId(el.id)}
                                        className={cn(
                                            "w-full text-left p-2 rounded-md flex items-center gap-2 text-sm",
                                            selectedElementId === el.id ? "bg-muted font-semibold" : "hover:bg-muted/50"
                                        )}
                                    >
                                        {el.type === 'text' && <Type className="w-4 h-4" />}
                                        {el.type === 'shape' && <RectangleHorizontal className="w-4 h-4" />}
                                        {el.type === 'button' && <div className="w-4 h-4 border rounded-sm flex items-center justify-center text-xs shrink-0">B</div>}
                                        {el.type === 'container' && <div className="w-4 h-4 border rounded-sm shrink-0"></div>}
                                        {el.type === 'code' && <AppWindow className="w-4 h-4" />}
                                        {el.type === 'image' && <ImageIcon className="w-4 h-4" />}
                                        <span className="truncate flex-1">{el.name}</span>
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            <ArrowUp className="h-3 w-3 opacity-50 hover:opacity-100"/>
                                            <ArrowDown className="h-3 w-3 opacity-50 hover:opacity-100"/>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </aside>

                    {/* Canvas */}
                    <main className="flex-1 bg-muted/40 flex items-center justify-center p-8 overflow-auto">
                        <div className="relative bg-background shadow-lg w-full h-full">
                             <div className="p-8 text-center text-muted-foreground flex items-center justify-center h-full">
                                <div>
                                    <p>El lienzo de formato libre se renderizará aquí.</p>
                                    <p className="text-xs">(Zoom con la rueda, Panear con barra espaciadora + arrastrar)</p>
                                </div>
                             </div>
                        </div>
                    </main>

                    {/* Properties Panel */}
                     <aside className={cn("bg-background/80 border-l transition-all duration-300", showProperties ? "w-72 p-4" : "w-0 p-0 overflow-hidden")}>
                        <h3 className="font-headline text-lg flex items-center gap-2 mb-4"><Settings/> Propiedades</h3>
                        <ScrollArea className="h-[calc(100%-40px)]">
                            {renderPropertiesPanel()}
                        </ScrollArea>
                    </aside>
                </div>
            </DialogContent>
        </Dialog>
    )
}
