// src/app/(main)/publish/page.tsx
'use client'
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Scale, School, Palette, Newspaper, BookOpen, Hand, Users, Target, BrainCircuit, FileText, Vote, PlusCircle, Settings, Library, Upload, Sparkles, X, Calendar as CalendarIcon, AlertTriangle, Link as LinkIcon, Tags, Search, AppWindow, Bold, Italic, Underline, Edit, Image as ImageIcon, File as FileIcon, Type } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Area = "politics" | "education" | "culture";
type ContentType = "canvas" | "gallery" | "file";

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
        icon: <Scale />,
        title: "Política",
        description: "Proponer leyes, iniciar proyectos ejecutivos o abrir casos judiciales.",
        color: "border-primary/50 bg-primary/10 text-primary",
        allowedDestinations: ["Entidad Federativa", "Partido Político", "Perfil Oficial"],
        categories: ["Legislativo", "Ejecutivo", "Judicial"]
    },
    education: {
        icon: <School />,
        title: "Educación",
        description: "Compartir conocimiento creando cursos, artículos o guías.",
        color: "border-secondary/50 bg-secondary/10 text-secondary",
        allowedDestinations: ["Red de Conocimiento", "Comunidad", "Evento", "Grupo de Estudio", "Perfil Oficial"],
        categories: ["Curso", "Artículo", "Guía"]
    },
    culture: {
        icon: <Palette />,
        title: "Cultura",
        description: "Expresar ideas, arte, organizar eventos o compartir noticias.",
        color: "border-accent/50 bg-accent/10 text-accent",
        allowedDestinations: ["Comunidad", "Evento", "Perfil Oficial"],
        categories: ["Publicación General", "Evento", "Noticia"]
    }
};

const contentTypeConfig = {
    canvas: {
        icon: <Edit />,
        title: 'Lienzo Universal',
        description: 'Publicaciones ricas y de formato libre. Ideal para contenido complejo y visual.'
    },
    gallery: {
        icon: <ImageIcon />,
        title: 'Galería de Imágenes/Videos',
        description: 'Sube múltiples imágenes o videos que se mostrarán como un carrusel interactivo.'
    },
    file: {
        icon: <FileIcon />,
        title: 'Archivo Único',
        description: 'Comparte un solo archivo (PDF, audio, modelo 3D, etc) con previsualización.'
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

function CanvasToolbar({ onToolSelect }: { onToolSelect: (tool: string) => void }) {
    const tools = [
        { name: "Asistente IA", icon: <Sparkles />, action: "ai" },
        { name: "Biblioteca", icon: <Library />, action: "library" },
        { name: "Referencias", icon: <FileText />, action: "references" },
        { name: "Herramientas", icon: <AppWindow />, action: "tools" }
    ];

    return (
        <div className="flex items-center gap-2 p-2 rounded-lg border bg-background/80 backdrop-blur-xl">
            {tools.map(tool => (
                <Button key={tool.name} variant="ghost" className="flex items-center gap-2" onClick={() => onToolSelect(tool.action)}>
                    {tool.icon}
                    <span>{tool.name}</span>
                </Button>
            ))}
        </div>
    )
}

function TextFormatToolbar() {
    return (
        <div className="flex items-center gap-1 p-1 rounded-lg border bg-background/80 backdrop-blur-xl shadow-lg">
             <Button variant="ghost" size="icon"><Bold /></Button>
             <Button variant="ghost" size="icon"><Italic /></Button>
             <Button variant="ghost" size="icon"><Underline /></Button>
        </div>
    )
}

function FullscreenCanvasEditor({ 
    isOpen, 
    onOpenChange, 
    canvasType,
    onToolSelect
}: { 
    isOpen: boolean, 
    onOpenChange: (open: boolean) => void, 
    canvasType: 'main' | 'preview' | null,
    onToolSelect: (tool: string) => void 
}) {
    if (!canvasType) return null;

    const title = canvasType === 'main' ? 'Contenido Principal' : 'Tarjeta de Previsualización';
    const canvasClass = canvasType === 'main' 
        ? "w-full h-full min-h-[calc(100vh-200px)]"
        : "w-[400px] h-[300px] aspect-video";

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-screen h-screen max-w-full max-h-full flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b flex-row items-center justify-between">
                    <DialogTitle className="font-headline text-xl">Editando: {title}</DialogTitle>
                    <Button onClick={() => onOpenChange(false)}>Guardar y Cerrar</Button>
                </DialogHeader>
                <div className="bg-muted/40 flex-1 flex flex-col items-center justify-center p-4 relative overflow-auto">
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                         <CanvasToolbar onToolSelect={onToolSelect} />
                    </div>
                    <div className={cn("relative p-4 border-2 border-dashed rounded-lg bg-background shadow-lg", canvasClass)}>
                        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
                            <TextFormatToolbar />
                        </div>
                        <Textarea 
                            placeholder="Escribe, pega o arrastra contenido aquí... El editor de formato libre se implementará en esta área." 
                            className="min-h-full h-full bg-transparent border-0 focus-visible:ring-0 resize-none"
                        />
                    </div>
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
        if (selectedArea === 'politics' && value === 'Legislativo') {
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

    const handleToolSelection = (tool: string) => {
        let toolName = "";
        switch (tool) {
            case "ai": toolName = "Asistente de IA"; break;
            case "library": toolName = "Biblioteca"; break;
            case "references": toolName = "Referencias"; break;
            case "tools": toolName = "Herramientas"; break;
        }
        toast({
            title: "Herramienta Seleccionada",
            description: `Has abierto: ${toolName}. La funcionalidad completa se implementará pronto.`
        });
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
    }
    
    const goBack = () => {
        if (step > 1) {
            setStep(step - 1);
        }
    }

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <>
                        <div>
                            <h1 className="text-3xl font-bold font-headline">Paso 1: ¿Qué te gustaría crear?</h1>
                            <p className="text-muted-foreground mt-2">
                                Comienza seleccionando el área principal de tu publicación. Esto determinará las herramientas y opciones disponibles.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl mt-4">
                            {(Object.keys(areaConfig) as Area[]).map(key => {
                                const config = areaConfig[key];
                                return (
                                    <Card key={key} className={cn("text-center hover:shadow-lg transition-shadow cursor-pointer", config.color)} onClick={() => handleSelectArea(key)}>
                                        <CardHeader className="items-center">
                                            <div className="p-3 rounded-full bg-background/80 mb-2">
                                                {config.icon}
                                            </div>
                                            <CardTitle className="font-headline">{config.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm">{config.description}</p>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </>
                );

            case 2:
                return (
                    <>
                        <div>
                            <h1 className="text-3xl font-bold font-headline">Paso 2: Elige el formato del contenido</h1>
                            <p className="text-muted-foreground mt-2">
                                Selecciona cómo quieres estructurar tu publicación.
                            </p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl mt-4">
                            {(Object.keys(contentTypeConfig) as ContentType[]).map(key => {
                                const config = contentTypeConfig[key];
                                return (
                                    <Card key={key} className="text-center hover:shadow-lg transition-shadow cursor-pointer bg-card/80" onClick={() => handleSelectContentType(key)}>
                                        <CardHeader className="items-center">
                                            <div className="p-3 rounded-full bg-muted mb-2">
                                                {config.icon}
                                            </div>
                                            <CardTitle className="font-headline text-lg">{config.title}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-muted-foreground">{config.description}</p>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    </>
                );
            
            case 3:
                if (!selectedArea) return null;
                const config = areaConfig[selectedArea];
                const isEducation = selectedArea === 'education';
                const availableDestinations = allDestinations.filter(dest => config.allowedDestinations.includes(dest.type));

                return (
                    <Card>
                        <CardHeader>
                            <CardTitle className="font-headline text-xl">Paso 3: Configuración de Ámbito</CardTitle>
                            <CardDescription>Selecciona dónde se publicará y cómo se categorizará tu contenido.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-6">
                             <div className="space-y-2">
                                <Label>Destino(s) de la Publicación</Label>
                                <p className="text-xs text-muted-foreground">Puedes seleccionar uno o varios destinos.</p>
                                
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Buscar perfiles o páginas..." className="pl-8" />
                                </div>
                                <div className="p-1 border rounded-lg h-32 overflow-y-auto space-y-1">
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
                                 <div className="flex flex-wrap gap-2 p-2 border rounded-lg min-h-[40px] bg-muted/50">
                                    {selectedDestinations.map(d => (
                                        <Badge key={d.id} variant="secondary" className="p-1 pr-2">
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
                                    {selectedDestinations.length === 0 && <span className="text-xs text-muted-foreground p-1">Ningún destino seleccionado...</span>}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Categoría Principal</Label>
                                <p className="text-xs text-muted-foreground">Define el tipo de publicación.</p>
                                <Select onValueChange={handleCategoryChange} value={selectedCategory || ""}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona una categoría..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {config.categories.map(cat => <SelectItem value={cat} key={cat}>{cat}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                
                                {isEducation && (
                                <div className="space-y-4 pt-2">
                                    <div>
                                        <Label>Etiquetado (Red de Conocimiento)</Label>
                                        <p className="text-xs text-muted-foreground">Vincula tu publicación a la red de conocimiento para una mejor interconexión.</p>
                                        <div className="flex gap-2 mt-2">
                                            <Button variant="outline" className="w-full justify-start text-sm" onClick={() => setCategorySelectorOpen(true)}><LinkIcon className="mr-2"/> Añadir Categorías</Button>
                                            <Button variant="outline" className="w-full justify-start text-sm" onClick={() => setThemeSelectorOpen(true)}><Tags className="mr-2"/> Añadir Temas</Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap gap-1 p-2 border rounded-lg min-h-[40px] bg-muted/50">
                                            {selectedCat.map(c => <Badge key={c} variant="secondary">{categories.find(cat => cat.id === c)?.name}</Badge>)}
                                            {selectedTh.map(t => <Badge key={t}>{themes.find(th => th.id === t)?.name}</Badge>)}
                                            {selectedCat.length === 0 && selectedTh.length === 0 && <span className="text-xs text-muted-foreground p-1">Selecciona etiquetas...</span>}
                                        </div>
                                    </div>
                                </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );

            case 4:
                return (
                    <>
                        {showVoteConfig && selectedArea === 'politics' && <LegislativeVoteConfig />}

                        <Card>
                            <CardHeader>
                                <CardTitle className="font-headline text-xl">Paso 4: El Lienzo de Creación</CardTitle>
                                <CardDescription>Aquí es donde tu idea toma forma.</CardDescription>
                            </CardHeader>
                             <CardContent>
                                {selectedContentType === 'canvas' && (
                                    <div className="grid lg:grid-cols-3 gap-6">
                                        <div className="lg:col-span-2 space-y-4">
                                            <h3 className="font-semibold text-muted-foreground">Contenido Principal</h3>
                                            <div className="relative p-4 border-2 border-dashed rounded-lg min-h-[300px] flex items-center justify-center text-center">
                                                <div className="space-y-2">
                                                    <p className="text-muted-foreground">Este es tu lienzo principal de contenido ilimitado.</p>
                                                    <Button onClick={() => openEditor('main')}><Edit className="mr-2"/>Editar Lienzo</Button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-muted-foreground">Tarjeta de Previsualización</h3>
                                            <div className="relative p-4 border-2 border-dashed rounded-lg aspect-video flex items-center justify-center text-center">
                                                <div className="space-y-2">
                                                    <p className="text-sm text-muted-foreground">Diseña aquí la tarjeta que se verá en los feeds.</p>
                                                    <Button variant="outline" onClick={() => openEditor('preview')}><Edit className="mr-2"/>Editar Previsualización</Button>
                                                </div>
                                            </div>
                                            <Input placeholder="Título de la Previsualización"/>
                                        </div>
                                    </div>
                                )}
                                {(selectedContentType === 'gallery' || selectedContentType === 'file') && (
                                     <div className="space-y-4">
                                        <Input placeholder="Título (Opcional)"/>
                                        <Textarea placeholder="Descripción (Opcional)" />
                                        <div className="p-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center">
                                            <Upload className="w-10 h-10 text-muted-foreground mb-4"/>
                                            <p className="font-semibold mb-2">
                                                {selectedContentType === 'gallery' ? 'Arrastra y suelta imágenes/videos o' : 'Arrastra y suelta un archivo o'}
                                            </p>
                                            <Button variant="outline">
                                                <Library className="mr-2" />
                                                Elegir desde la Biblioteca
                                            </Button>
                                        </div>
                                     </div>
                                )}
                            </CardContent>
                        </Card>
                        
                        {!showVoteConfig && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="font-headline text-xl">Opciones de Publicación</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center space-x-2">
                                        <Vote className="w-5 h-5 text-primary"/>
                                        <div>
                                            <Label htmlFor="add-vote" className="font-semibold">Añadir Votación</Label>
                                            <p className="text-xs text-muted-foreground">Convierte esta publicación en una propuesta formal.</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" onClick={() => setShowVoteConfig(true)}><PlusCircle className="mr-2"/>Configurar Votación</Button>
                                </CardContent>
                            </Card>
                        )}
                        {showVoteConfig && selectedArea !== 'politics' && <LegislativeVoteConfig />}
                    </>
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
                onToolSelect={handleToolSelection}
            />
            
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
                           Publicar
                        </h1>
                        <p className="text-muted-foreground">
                            {selectedArea ? `Creando en: ${areaConfig[selectedArea].title}` : 'Inicia el flujo de creación de contenido.'}
                        </p>
                    </div>
                    <Button variant="ghost" onClick={resetFlow}><X className="mr-2"/> Cancelar</Button>
                </div>
                
                <div className="flex flex-col items-center text-center gap-8">
                     {renderStepContent()}
                </div>

                 <div className="flex justify-between gap-4 mt-8">
                    <Button variant="outline" size="lg" onClick={goBack} disabled={step === 1}>Atrás</Button>
                    {step < 4 ? (
                         <Button size="lg" onClick={() => setStep(step + 1)} disabled={step === 2 && !selectedContentType}>Siguiente</Button>
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

