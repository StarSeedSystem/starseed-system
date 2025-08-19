// src/app/(app)/publish/page.tsx
'use client'
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Scale, School, Palette, Newspaper, BookOpen, Hand, Users, Target, BrainCircuit, FileText, Vote, PlusCircle, Settings, Library, Upload, Sparkles, X, Calendar as CalendarIcon, AlertTriangle, Link as LinkIcon, Tags, Search, AppWindow, Bold, Italic, Underline, Edit, Image as ImageIcon, File as FileIcon, Type, ArrowLeft, Layers, RectangleHorizontal, MousePointer, CaseUpper, PanelRight, PanelLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { KnowledgeNetworkSelector } from "@/components/publish/knowledge-network-selector";
import type { Category } from "@/lib/data";
import { themes, categories } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";


type Area = "politics" | "education" | "culture";
type ContentType = "canvas" | "gallery" | "file" | "text";
type CanvasElement = {
    id: number;
    type: 'text' | 'image' | 'shape' | 'button' | 'container' | 'code';
    name: string;
    content?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
};

const allDestinations = [
    { id: 'dest-1', name: "Mi Perfil", type: "Perfil Oficial", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-2', name: "E.F. del Valle Central", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-3', name: "E.F. del Norte", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-4', name: "Comunidad de Permacultura", type: "Comunidad", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-5', name: "Grupo de Estudio de IA", type: "Grupo de Estudio", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-6', name: "Red de Conocimiento Global", type: "Red de Conocimiento", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-7', name: "Artistas por la Singularidad", type: "Comunidad", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-8', name: "Canal de Eventos Globales", type: "Evento", avatar: "https://placehold.co/40x40.png" },
    { id: 'dest-9', name: "Partido Transhumanista", type: "Partido Político", avatar: "https://placehold.co/40x40.png" }
];

const areaConfig = {
    politics: {
        icon: <Scale className="w-8 h-8" />,
        title: "Política",
        description: "Proponer leyes, iniciar proyectos o abrir casos judiciales.",
        color: "text-primary border-primary/50 hover:bg-primary/10",
        allowedDestinations: ["Entidad Federativa", "Partido Político", "Perfil Oficial"],
        categories: ["Propuesta Legislativa", "Proyecto Ejecutivo", "Caso Judicial"]
    },
    education: {
        icon: <School className="w-8 h-8" />,
        title: "Educación",
        description: "Compartir conocimiento creando cursos, artículos o guías.",
        color: "text-secondary border-secondary/50 hover:bg-secondary/10",
        allowedDestinations: ["Red de Conocimiento", "Comunidad", "Evento", "Grupo de Estudio", "Perfil Oficial"],
        categories: ["Curso", "Artículo", "Guía"]
    },
    culture: {
        icon: <Palette className="w-8 h-8" />,
        title: "Cultura",
        description: "Expresar ideas, arte, organizar eventos o compartir noticias.",
        color: "text-accent border-accent/50 hover:bg-accent/10",
        allowedDestinations: ["Comunidad", "Evento", "Perfil Oficial", "Red de Conocimiento"],
        categories: ["Publicación General", "Evento", "Noticia"]
    }
};

const contentTypeConfig = {
    canvas: {
        icon: <Edit className="w-8 h-8" />,
        title: 'Lienzo Universal',
        description: 'Publicaciones ricas y de formato libre. Ideal para contenido complejo y visual.'
    },
    gallery: {
        icon: <ImageIcon className="w-8 h-8" />,
        title: 'Galería de Imágenes/Videos',
        description: 'Sube múltiples imágenes o videos que se mostrarán como un carrusel interactivo.'
    },
    file: {
        icon: <FileIcon className="w-8 h-8" />,
        title: 'Archivo Único',
        description: 'Comparte un solo archivo (PDF, audio, modelo 3D, etc) con previsualización.'
    },
    text: {
        icon: <Type className="w-8 h-8" />,
        title: 'Solo Texto',
        description: 'Una interfaz simple para texto plano o enriquecido. Ideal para anuncios rápidos.'
    }
}

function LegislativeVoteConfig() {
    const [date, setDate] = useState<Date | undefined>(addDays(new Date(), 5));
    const [isUrgent, setIsUrgent] = useState(false);

    const handleUrgentChange = (checked: boolean) => {
        setIsUrgent(checked);
        if (checked) {
            setDate(addDays(new Date(), 1));
        } else {
            setDate(addDays(new Date(), 5));
        }
    }

    return (
        <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
                <CardTitle className="font-headline text-xl flex items-center gap-2"><Vote /> Configuración de Votación</CardTitle>
                <CardDescription>Define los parámetros de la votación para esta propuesta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="space-y-2 flex-1">
                        <Label>Fecha Límite de Votación</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, "PPP", { locale: es }) : <span>Elige una fecha</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                mode="single"
                                selected={date}
                                onSelect={setDate}
                                disabled={(day) => isUrgent ? day <= new Date() || day > addDays(new Date(), 1) : day < addDays(new Date(), 5) }
                                initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                     <div className="flex items-center space-x-2 pt-6">
                        <Switch id="urgent-switch" onCheckedChange={handleUrgentChange} checked={isUrgent}/>
                        <Label htmlFor="urgent-switch" className="flex flex-col">
                            <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-destructive"/> Propuesta Urgente</span>
                            <span className="font-normal text-xs text-muted-foreground">Máximo 1 día para votar.</span>
                        </Label>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Opciones de Votación Iniciales</Label>
                    <p className="text-xs text-muted-foreground">Los participantes podrán proponer más opciones en los comentarios.</p>
                    <div className="space-y-2">
                        <Input defaultValue="A favor" />
                        <Input defaultValue="En contra" />
                        <Input defaultValue="Abstención" />
                        <Button variant="outline" size="sm" className="w-full"><PlusCircle/>Añadir Opción</Button>
                    </div>
                </div>

            </CardContent>
        </Card>
    )
}

function FullscreenCanvasEditor({ 
    isOpen, 
    onOpenChange, 
    canvasType
}: { 
    isOpen: boolean, 
    onOpenChange: (open: boolean) => void, 
    canvasType: 'main' | 'preview' | null
}) {
    const { toast } = useToast();
    const [elements, setElements] = useState<CanvasElement[]>([
        { id: 1, type: 'text', name: 'Título Principal', content: 'Bienvenido a mi Lienzo', x: 50, y: 50, width: 300, height: 40, color: '#FFFFFF' },
        { id: 2, type: 'shape', name: 'Fondo Decorativo', content: 'Rectángulo', x: 20, y: 20, width: 500, height: 300, color: '#1A1A1A' }
    ]);
    const [selectedElementId, setSelectedElementId] = useState<number | null>(null);
    const [showLayers, setShowLayers] = useState(true);
    const [showProperties, setShowProperties] = useState(true);

    if (!canvasType) return null;

    const title = canvasType === 'main' ? 'Contenido Principal' : 'Tarjeta de Previsualización';
    
    const handleAddElement = (type: CanvasElement['type']) => {
        const newElement: CanvasElement = {
            id: Date.now(),
            type,
            name: `Nuevo ${type}`,
            x: 10, y: 10, width: 100, height: 50,
            content: `Contenido de ${type}`,
            color: '#555555'
        };
        setElements(prev => [...prev, newElement]);
        setSelectedElementId(newElement.id);
        toast({ title: "Elemento Añadido", description: `Se ha añadido un nuevo elemento de tipo '${type}' al lienzo.` });
    };

    const selectedElement = elements.find(el => el.id === selectedElementId);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-screen h-screen max-w-full max-h-full flex flex-col p-0 gap-0">
                 <DialogHeader className="p-2 border-b flex-row items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <DialogClose asChild>
                            <Button variant="ghost" size="icon"><X/></Button>
                        </DialogClose>
                         <Separator orientation="vertical" className="h-6" />
                        <h2 className="font-headline text-lg">Editando: {title}</h2>
                    </div>

                    {/* Main Toolbar */}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setShowLayers(!showLayers)}><PanelLeft /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setShowProperties(!showProperties)}><PanelRight /></Button>
                        <Separator orientation="vertical" className="h-6" />
                        <Button variant="ghost" size="sm" onClick={() => toast({ title: "Herramienta Próximamente", description: "La herramienta de selección estará disponible pronto."})}><MousePointer/> Selección</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm"><PlusCircle/> Insertar Elemento</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={() => handleAddElement('text')}><Type/> Texto</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAddElement('shape')}><RectangleHorizontal/> Forma</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAddElement('button')}><div className="w-4 h-4 border rounded-sm flex items-center justify-center text-xs">B</div> Botón</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleAddElement('container')}><div className="w-4 h-4 border rounded-sm"></div> Contenedor</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toast({ title: "Herramienta Próximamente" })}><Library/> Desde la Biblioteca</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toast({ title: "Herramienta Próximamente" })}><AppWindow/> Código Embebido</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="ghost" size="sm" onClick={() => toast({ title: "Asistente de IA Próximamente"})}><Sparkles/> Asistente IA</Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline">Guardar Borrador</Button>
                        <Button onClick={() => onOpenChange(false)}>Guardar y Cerrar</Button>
                    </div>
                </DialogHeader>

                <DialogTitle className="sr-only">Editor de Lienzo a Pantalla Completa</DialogTitle>

                <div className="flex-1 flex overflow-hidden">
                    {/* Layers Panel */}
                    <aside className={cn("bg-background/80 border-r transition-all duration-300", showLayers ? "w-64 p-4" : "w-0 p-0 overflow-hidden")}>
                        <h3 className="font-headline text-lg flex items-center gap-2 mb-4"><Layers/> Capas</h3>
                        <ScrollArea className="h-[calc(100%-40px)]">
                            <div className="space-y-1 pr-2">
                                {elements.map(el => (
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
                                        <span className="truncate">{el.name}</span>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </aside>

                    {/* Canvas */}
                    <main className="flex-1 bg-muted/40 flex items-center justify-center p-8 overflow-auto">
                        <div className={cn("relative bg-background shadow-lg", canvasType === 'main' ? 'w-full h-full' : 'w-[400px] h-[300px] aspect-video')}>
                             <div className="p-8 text-center text-muted-foreground">
                                <p>El lienzo de formato libre se renderizará aquí.</p>
                                <p className="text-xs">Selecciona un elemento de la capa para ver sus propiedades.</p>
                             </div>
                        </div>
                    </main>

                    {/* Properties Panel */}
                     <aside className={cn("bg-background/80 border-l transition-all duration-300", showProperties ? "w-72 p-4" : "w-0 p-0 overflow-hidden")}>
                        <h3 className="font-headline text-lg flex items-center gap-2 mb-4"><Settings/> Propiedades</h3>
                        <ScrollArea className="h-[calc(100%-40px)]">
                        {selectedElement ? (
                            <div className="space-y-4 pr-2">
                                <div className="space-y-1">
                                    <Label htmlFor="el-name">Nombre de la Capa</Label>
                                    <Input id="el-name" value={selectedElement.name} onChange={(e) => setElements(elements.map(el => el.id === selectedElementId ? {...el, name: e.target.value} : el))} />
                                </div>
                                {selectedElement.type === 'text' && (
                                     <div className="space-y-1">
                                        <Label htmlFor="el-content">Contenido</Label>
                                        <Textarea id="el-content" value={selectedElement.content} onChange={(e) => setElements(elements.map(el => el.id === selectedElementId ? {...el, content: e.target.value} : el))} />
                                    </div>
                                )}
                                 <div className="space-y-1">
                                    <Label>Posición y Tamaño</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input type="number" placeholder="X" value={selectedElement.x} onChange={(e) => setElements(elements.map(el => el.id === selectedElementId ? {...el, x: parseInt(e.target.value)} : el))} />
                                        <Input type="number" placeholder="Y" value={selectedElement.y} onChange={(e) => setElements(elements.map(el => el.id === selectedElementId ? {...el, y: parseInt(e.target.value)} : el))} />
                                        <Input type="number" placeholder="Ancho" value={selectedElement.width} onChange={(e) => setElements(elements.map(el => el.id === selectedElementId ? {...el, width: parseInt(e.target.value)} : el))} />
                                        <Input type="number" placeholder="Alto" value={selectedElement.height} onChange={(e) => setElements(elements.map(el => el.id === selectedElementId ? {...el, height: parseInt(e.target.value)} : el))} />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="el-color">Color</Label>
                                    <Input id="el-color" type="color" value={selectedElement.color} onChange={(e) => setElements(elements.map(el => el.id === selectedElementId ? {...el, color: e.target.value} : el))} />
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Selecciona un elemento para editar sus propiedades.</p>
                        )}
                        </ScrollArea>
                    </aside>
                </div>
            </DialogContent>
        </Dialog>
    )
}


export default function PublishPage() {
    const { toast } = useToast();
    const [selectedArea, setSelectedArea] = useState<Area | null>(null);
    const [selectedContentType, setSelectedContentType] = useState<ContentType | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [step, setStep] = useState(1);
    const [showVoteConfig, setShowVoteConfig] = useState(false);

    const [isCategorySelectorOpen, setCategorySelectorOpen] = useState(false);
    const [isThemeSelectorOpen, setThemeSelectorOpen] = useState(false);
    const [selectedCat, setSelectedCategories] = useState<string[]>([]);
    const [selectedTh, setSelectedThemes] = useState<string[]>([]);
    const [selectedDestinations, setSelectedDestinations] = useState<any[]>([]);

    const [isEditorOpen, setEditorOpen] = useState(false);
    const [editingCanvas, setEditingCanvas] = useState<'main' | 'preview' | null>(null);

    const handleSelectArea = (area: Area) => {
        setSelectedArea(area);
        setStep(2);
    }

    const handleSelectContentType = (type: ContentType) => {
        setSelectedContentType(type);
        setStep(3);
    }
    
    const handleCategoryChange = (value: string) => {
        setSelectedCategory(value);
        if (selectedArea === 'politics' && value === 'Propuesta Legislativa') {
            setShowVoteConfig(true);
        } else {
            setShowVoteConfig(false);
        }
    }
    
    const handleSelectDestination = (dest: any) => {
        if (!selectedDestinations.find(d => d.id === dest.id)) {
            setSelectedDestinations([...selectedDestinations, dest]);
        }
    }

    const handleRemoveDestination = (destId: string) => {
        setSelectedDestinations(selectedDestinations.filter(d => d.id !== destId));
    }

    const openEditor = (canvasType: 'main' | 'preview') => {
        setEditingCanvas(canvasType);
        setEditorOpen(true);
    }

    const resetFlow = () => {
        setSelectedArea(null);
        setSelectedContentType(null);
        setSelectedCategory(null);
        setStep(1);
        setShowVoteConfig(false);
        setSelectedDestinations([]);
        setSelectedCategories([]);
        setSelectedThemes([]);
    }
    
    const goBack = () => {
        if (step > 1) {
            if(step === 3 && selectedContentType === 'canvas') {
                // Skip step 2 if canvas was chosen, as it's the only real option for now
                 setStep(1);
            } else {
                 setStep(step - 1);
            }
        }
    }

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="w-full max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 1: Selecciona el Área Principal</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
                                Comienza eligiendo el propósito de tu publicación. Esto determinará las herramientas y opciones disponibles.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6">
                            {(Object.keys(areaConfig) as Area[]).map(key => {
                                const config = areaConfig[key];
                                return (
                                    <Card key={key} className={cn("text-center hover:shadow-lg transition-all duration-300 cursor-pointer border-2", config.color)} onClick={() => handleSelectArea(key)}>
                                        <CardHeader className="items-center p-6">
                                            <div className="p-4 rounded-full bg-background/80 mb-4 border-2">
                                                {config.icon}
                                            </div>
                                            <CardTitle className="font-headline text-xl">{config.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-6 pt-0">
                                            <p className="text-sm">{config.description}</p>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                );

            case 2:
                return (
                     <div className="w-full max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 2: Elige el Formato del Contenido</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
                                Selecciona cómo quieres estructurar tu publicación. Puedes empezar simple y añadir complejidad después.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {(Object.keys(contentTypeConfig) as ContentType[]).map(key => {
                                const config = contentTypeConfig[key];
                                return (
                                    <Card key={key} className="text-center hover:shadow-lg transition-all duration-300 cursor-pointer bg-card/80 border-2 border-transparent hover:border-primary/50" onClick={() => handleSelectContentType(key)}>
                                        <CardHeader className="items-center p-6">
                                            <div className="p-4 rounded-full bg-muted mb-4 border">
                                                {config.icon}
                                            </div>
                                            <CardTitle className="font-headline text-lg">{config.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-6 pt-0">
                                            <p className="text-sm text-muted-foreground">{config.description}</p>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                );
            
            case 3:
                if (!selectedArea) return null;
                const config = areaConfig[selectedArea];
                const isEducation = selectedArea === 'education';
                const availableDestinations = allDestinations.filter(dest => config.allowedDestinations.includes(dest.type));

                return (
                    <div className="w-full max-w-4xl">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 3: Define el Ámbito y Contexto</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">Selecciona dónde se publicará y cómo se conectará tu contenido con la red de conocimiento.</p>
                        </div>
                        <Card>
                            <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-6 p-6">
                                <div className="space-y-4">
                                    <Label className="text-base font-semibold">Destino(s) de la Publicación</Label>
                                    <p className="text-sm text-muted-foreground">Puedes seleccionar uno o varios destinos permitidos para el área de '{config.title}'.</p>
                                    
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input placeholder="Buscar perfiles o páginas..." className="pl-8" />
                                    </div>
                                    <div className="p-2 border rounded-lg h-40 overflow-y-auto space-y-1 bg-muted/20">
                                    {availableDestinations.map(dest => (
                                        <div key={dest.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 text-sm">
                                            <div className="flex items-center gap-2">
                                                <Avatar className="h-6 w-6">
                                                    <AvatarImage src={dest.avatar} />
                                                    <AvatarFallback>{dest.name.charAt(0)}</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{dest.name}</span>
                                                <span className="text-xs text-muted-foreground">({dest.type})</span>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-7" onClick={() => handleSelectDestination(dest)}>Seleccionar</Button>
                                        </div>
                                    ))}
                                    </div>

                                    <Label className="pt-2 block">Destinos Seleccionados:</Label>
                                    <div className="flex flex-wrap gap-2 p-2 border rounded-lg min-h-[48px] bg-muted/50">
                                        {selectedDestinations.map(d => (
                                            <Badge key={d.id} variant="secondary" className="p-1 pr-2 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-5 w-5">
                                                        <AvatarImage src={d.avatar} />
                                                        <AvatarFallback>{d.name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <span>{d.name}</span>
                                                    <button onClick={() => handleRemoveDestination(d.id)} className="ml-1 rounded-full hover:bg-background/50 p-0.5">
                                                        <X className="h-3 w-3"/>
                                                    </button>
                                                </div>
                                            </Badge>
                                        ))}
                                        {selectedDestinations.length === 0 && <span className="text-xs text-muted-foreground p-2">Ningún destino seleccionado...</span>}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-base font-semibold">Categoría Principal</Label>
                                        <p className="text-sm text-muted-foreground">Define el tipo de publicación.</p>
                                        <Select onValueChange={handleCategoryChange} value={selectedCategory || ""}>
                                            <SelectTrigger className="mt-2">
                                                <SelectValue placeholder="Selecciona una categoría..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {config.categories.map(cat => <SelectItem value={cat} key={cat}>{cat}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {isEducation && (
                                    <div className="space-y-4 pt-2">
                                        <div>
                                            <Label className="text-base font-semibold">Etiquetado (Red de Conocimiento)</Label>
                                            <p className="text-sm text-muted-foreground">Vincula tu publicación a la red de conocimiento para una mejor interconexión.</p>
                                            <div className="flex gap-2 mt-2">
                                                <Button variant="outline" className="w-full justify-start" onClick={() => setCategorySelectorOpen(true)}><LinkIcon className="mr-2"/> Añadir Categorías</Button>
                                                <Button variant="outline" className="w-full justify-start" onClick={() => setThemeSelectorOpen(true)}><Tags className="mr-2"/> Añadir Temas</Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap gap-1 p-2 border rounded-lg min-h-[48px] bg-muted/50">
                                                {selectedCat.length === 0 && selectedTh.length === 0 && <span className="text-xs text-muted-foreground p-2">Sin etiquetas de la Red de Conocimiento...</span>}
                                                {selectedCat.map(c => <Badge key={c} variant="secondary">{categories.find(cat => cat.id === c)?.name}</Badge>)}
                                                {selectedTh.map(t => <Badge key={t} className="bg-blue-900/50 text-blue-200 border-blue-500/50">{themes.find(th => th.id === t)?.name}</Badge>)}
                                            </div>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 4:
                return (
                    <div className="w-full max-w-5xl space-y-6">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold font-headline">Paso 4: El Lienzo de Creación</h2>
                            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">Aquí es donde tu idea toma forma. Utiliza el editor para construir tu contenido.</p>
                        </div>
                        
                        {showVoteConfig && selectedArea === 'politics' && <LegislativeVoteConfig />}

                        <Card>
                             <CardContent className="p-6">
                                {selectedContentType === 'canvas' && (
                                    <div className="grid lg:grid-cols-3 gap-6">
                                        <div className="lg:col-span-2 space-y-4">
                                            <h3 className="font-semibold text-lg">Contenido Principal</h3>
                                            <div className="relative p-4 border-2 border-dashed rounded-lg min-h-[300px] flex items-center justify-center text-center bg-muted/20 hover:border-primary/80 transition-colors">
                                                <div className="space-y-2">
                                                    <p className="text-muted-foreground">Este es tu lienzo principal de contenido ilimitado.</p>
                                                    <Button onClick={() => openEditor('main')}><Edit className="mr-2"/>Editar Lienzo</Button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-lg">Tarjeta de Previsualización</h3>
                                            <div className="relative p-4 border-2 border-dashed rounded-lg aspect-video flex items-center justify-center text-center bg-muted/20 hover:border-primary/80 transition-colors">
                                                <div className="space-y-2">
                                                    <p className="text-sm text-muted-foreground">Diseña aquí la tarjeta que se verá en los feeds.</p>
                                                    <Button variant="outline" onClick={() => openEditor('preview')}><Edit className="mr-2"/>Editar Previsualización</Button>
                                                </div>
                                            </div>
                                            <Input placeholder="Título de la Previsualización"/>
                                        </div>
                                    </div>
                                )}
                                {(selectedContentType === 'gallery' || selectedContentType === 'file' || selectedContentType === 'text') && (
                                     <div className="space-y-4">
                                        <Input placeholder="Título (Opcional)"/>
                                        <Textarea placeholder={selectedContentType === 'text' ? 'Escribe tu contenido aquí...' : 'Descripción (Opcional)'} rows={selectedContentType === 'text' ? 8 : 3} />
                                        { (selectedContentType === 'gallery' || selectedContentType === 'file') &&
                                            <div className="p-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center bg-muted/20">
                                                <Upload className="w-10 h-10 text-muted-foreground mb-4"/>
                                                <p className="font-semibold mb-2">
                                                    {selectedContentType === 'gallery' ? 'Arrastra y suelta imágenes/videos o' : 'Arrastra y suelta un archivo o'}
                                                </p>
                                                <Button variant="outline">
                                                    <Library className="mr-2" />
                                                    Elegir desde la Biblioteca
                                                </Button>
                                            </div>
                                        }
                                     </div>
                                )}
                            </CardContent>
                        </Card>
                        
                        {!showVoteConfig && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="font-headline text-lg">Opciones de Publicación</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center space-x-2">
                                        <Vote className="w-5 h-5 text-primary"/>
                                        <div>
                                            <Label htmlFor="add-vote" className="font-semibold">Añadir Votación</Label>
                                            <p className="text-xs text-muted-foreground">Convierte esta publicación en una propuesta formal con opciones de voto.</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" onClick={() => setShowVoteConfig(true)}><PlusCircle className="mr-2"/>Configurar Votación</Button>
                                </CardContent>
                            </Card>
                        )}
                        {showVoteConfig && selectedArea !== 'politics' && <LegislativeVoteConfig />}
                    </div>
                );

            default:
                return null;
        }
    }


    return (
        <>
            <KnowledgeNetworkSelector 
                isOpen={isCategorySelectorOpen} 
                onOpenChange={setCategorySelectorOpen}
                title="Seleccionar Categorías"
                data={categories}
                selectedItems={selectedCat}
                onSelectedItemsChange={setSelectedCategories}
                type="category"
            />
             <KnowledgeNetworkSelector 
                isOpen={isThemeSelectorOpen} 
                onOpenChange={setThemeSelectorOpen}
                title="Seleccionar Temas"
                data={themes}
                selectedItems={selectedTh}
                onSelectedItemsChange={setSelectedThemes}
                type="theme"
            />

            <FullscreenCanvasEditor
                isOpen={isEditorOpen}
                onOpenChange={setEditorOpen}
                canvasType={editingCanvas}
            />
            
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
                           Publicar Contenido
                        </h1>
                        <p className="text-muted-foreground">
                            {selectedArea ? `Creando en el área de ${areaConfig[selectedArea].title}` : 'Inicia el flujo de creación para contribuir a la red.'}
                        </p>
                    </div>
                    {step > 1 && <Button variant="ghost" onClick={resetFlow}><X className="mr-2"/> Cancelar</Button>}
                </div>
                
                <Separator />

                <div className="flex flex-col items-center text-center gap-8 mt-4">
                     {renderStepContent()}
                </div>

                 <div className="flex justify-between gap-4 mt-8">
                    <Button variant="outline" size="lg" onClick={goBack} disabled={step === 1}>
                        <ArrowLeft className="mr-2"/>
                        Atrás
                    </Button>
                    {step < 4 ? (
                         <Button 
                            size="lg" 
                            onClick={() => setStep(step + 1)} 
                            disabled={(step === 2 && !selectedContentType) || (step === 3 && selectedDestinations.length === 0)}
                         >
                            Siguiente
                         </Button>
                    ) : (
                        <div className="flex justify-end gap-4">
                            <Button variant="outline" size="lg">Guardar Borrador</Button>
                            <Button size="lg">Publicar</Button>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
