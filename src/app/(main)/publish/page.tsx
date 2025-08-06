// src/app/(main)/publish/page.tsx
'use client'
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Scale, School, Palette, Newspaper, BookOpen, Hand, Users, Target, BrainCircuit, FileText, Vote, PlusCircle, Settings, Library, Upload, Sparkles, X, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";

type Area = "politics" | "education" | "culture";
type PoliticalCategory = "Legislativo" | "Ejecutivo" | "Judicial" | null;

const areaConfig = {
    politics: {
        icon: <Scale />,
        title: "Política",
        description: "Proponer leyes, iniciar proyectos ejecutivos o abrir casos judiciales.",
        color: "border-primary/50 bg-primary/10 text-primary",
        destinations: ["E.F. del Valle Central", "E.F. del Norte"],
        categories: ["Legislativo", "Ejecutivo", "Judicial"]
    },
    education: {
        icon: <School />,
        title: "Educación",
        description: "Compartir conocimiento creando cursos, artículos o guías.",
        color: "border-secondary/50 bg-secondary/10 text-secondary",
        destinations: ["Mi Perfil", "Comunidad de Permacultura", "Grupo de Estudio de IA"],
        categories: ["Curso", "Artículo", "Guía"]
    },
    culture: {
        icon: <Palette />,
        title: "Cultura",
        description: "Expresar ideas, arte, organizar eventos o compartir noticias.",
        color: "border-accent/50 bg-accent/10 text-accent",
        destinations: ["Mi Perfil", "Comunidad de Permacultura", "Artistas por la Singularidad"],
        categories: ["Publicación General", "Evento", "Noticia"]
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


export default function PublishPage() {
    const [selectedArea, setSelectedArea] = useState<Area | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [step, setStep] = useState(1);
    const [showVoteConfig, setShowVoteConfig] = useState(false);

    const handleSelectArea = (area: Area) => {
        setSelectedArea(area);
        setStep(2);
    }
    
    const resetFlow = () => {
        setSelectedArea(null);
        setSelectedCategory(null);
        setStep(1);
        setShowVoteConfig(false);
    }

    if (step === 1) {
        return (
            <div className="flex flex-col gap-6 items-center text-center">
                <div>
                    <h1 className="text-3xl font-bold font-headline">¿Qué te gustaría crear?</h1>
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
            </div>
        )
    }

    if (step === 2 && selectedArea) {
        const config = areaConfig[selectedArea];
        const isLegislative = selectedArea === 'politics' && selectedCategory === 'Legislativo';

        return (
            <div className="flex flex-col gap-6">
                 <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold font-headline flex items-center gap-3">
                           {config.icon}
                           Crear en: {config.title}
                        </h1>
                        <p className="text-muted-foreground">Configura el contexto y el contenido de tu publicación.</p>
                    </div>
                    <Button variant="ghost" onClick={resetFlow}><X className="mr-2"/> Cambiar de Área</Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-xl">Paso 2: Configuración de Ámbito</CardTitle>
                        <CardDescription>Selecciona dónde se publicará y cómo se categorizará tu contenido.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>Destino(s) de la Publicación</Label>
                            <p className="text-xs text-muted-foreground">Puedes seleccionar una o varias páginas y perfiles.</p>
                            <div className="p-3 border rounded-lg h-32 overflow-y-auto space-y-2">
                               {config.destinations.map(dest => (
                                   <div key={dest} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
                                       <span>{dest}</span>
                                       <Button variant="outline" size="sm" className="h-7">Seleccionar</Button>
                                   </div>
                               ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                             <Label>Categoría Principal</Label>
                             <p className="text-xs text-muted-foreground">Define el tipo de publicación.</p>
                             <Select onValueChange={setSelectedCategory} value={selectedCategory || ""}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una categoría..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {config.categories.map(cat => <SelectItem value={cat} key={cat}>{cat}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <div className="space-y-2 pt-2">
                                <Label>Etiquetado (Red de Conocimiento)</Label>
                                <Button variant="outline" className="w-full justify-start"><PlusCircle className="mr-2"/> Añadir Temas</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {(isLegislative || showVoteConfig) && <LegislativeVoteConfig />}

                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-xl">Paso 3: El Lienzo de Creación</CardTitle>
                        <CardDescription>Aquí es donde tu idea toma forma. Arrastra, suelta y compone libremente.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <h3 className="font-semibold text-muted-foreground">Contenido Principal</h3>
                            <div className="relative p-4 border-2 border-dashed rounded-lg min-h-[300px]">
                                <Textarea placeholder="Escribe, pega o arrastra contenido aquí... El editor de formato libre se implementará en esta área." className="min-h-[280px] bg-transparent border-0 focus-visible:ring-0"/>
                                <div className="absolute top-2 right-2 flex gap-2">
                                     <Button variant="outline" size="icon" className="h-8 w-8"><Library /></Button>
                                     <Button variant="outline" size="icon" className="h-8 w-8"><Sparkles /></Button>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                             <h3 className="font-semibold text-muted-foreground">Tarjeta de Previsualización</h3>
                             <div className="p-4 border-2 border-dashed rounded-lg aspect-[4/3]">
                                <p className="text-sm text-muted-foreground text-center pt-10">Diseña aquí la tarjeta que se verá en los feeds.</p>
                             </div>
                             <Input placeholder="Título de la Previsualización"/>
                        </div>
                    </CardContent>
                </Card>
                
                {!isLegislative && !showVoteConfig && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="font-headline text-xl">Paso 4: Opciones de Publicación</CardTitle>
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


                <div className="flex justify-end gap-4">
                    <Button variant="outline" size="lg">Guardar Borrador</Button>
                    <Button size="lg">Publicar</Button>
                </div>
            </div>
        )
    }

    return null;
}
