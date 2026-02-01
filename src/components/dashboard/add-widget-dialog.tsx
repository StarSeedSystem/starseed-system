'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    FileText,
    Vote,
    GraduationCap,
    Activity,
    Heart,
    Palette,
    Network,
    Book,
    Rocket,
    Calendar,
    Plus,
    BrainCircuit
} from "lucide-react";
import { useState } from "react";
import { WidgetType } from "./dashboard-types";

interface AddWidgetDialogProps {
    onAdd: (type: WidgetType) => void;
    isEditMode: boolean;
}

const AVAILABLE_WIDGETS: { type: WidgetType; title: string; description: string; icon: React.ReactNode }[] = [
    {
        type: 'EXPLORE_NETWORK',
        title: "Explorar la Red",
        description: "Acceso rápido a Política, Educación y Cultura.",
        icon: <Network className="h-5 w-5 text-blue-500" />
    },
    {
        type: 'MY_PAGES',
        title: "Mis Páginas",
        description: "Lista de tus comunidades y entidades activas.",
        icon: <Book className="h-5 w-5 text-green-500" />
    },
    {
        type: 'POLITICAL_SUMMARY',
        title: "Resumen Político",
        description: "Propuestas urgentes y estado legislativo.",
        icon: <Rocket className="h-5 w-5 text-orange-500" />
    },
    {
        type: 'LEARNING_PATH',
        title: "Ruta de Aprendizaje",
        description: "Tu progreso en cursos y habilidades.",
        icon: <Activity className="h-5 w-5 text-purple-500" />
    },
    {
        type: 'SOCIAL_RADAR',
        title: "Radar Social",
        description: "Eventos cercanos y actividad de amigos.",
        icon: <Calendar className="h-5 w-5 text-pink-500" />
    },
    {
        type: 'WELLNESS',
        title: "Bienestar",
        description: "Estado de salud y recordatorios positivos.",
        icon: <Heart className="h-5 w-5 text-red-500" />
    },
    {
        type: 'THEME_SELECTOR',
        title: 'Selector de Temas',
        description: 'Personaliza la apariencia de tu entorno digital.',
        icon: <Palette className="h-5 w-5 text-primary" />
    },
    {
        type: 'SYSTEM_STATUS',
        title: 'Estado del Sistema',
        description: 'Monitor de recursos en tiempo real',
        icon: <Activity className="h-5 w-5 text-teal-500" />
    },
    {
        type: 'RECENT_ACTIVITY',
        title: 'Actividad Reciente',
        description: 'Historial de tus últimas acciones y notificaciones',
        icon: <FileText className="h-5 w-5 text-yellow-500" />
    },
    {
        type: 'COLLAB_PROJECTS',
        title: 'Proyectos Colaborativos',
        description: 'Gestión de equipos y seguimiento de tareas.',
        icon: <Rocket className="h-5 w-5 text-violet-500" />
    },
    {
        type: 'LIVE_DATA',
        title: 'Telemetría en Vivo',
        description: 'Métricas de red y estado de nodos en tiempo real.',
        icon: <Activity className="h-5 w-5 text-emerald-500" />
    },
    {
        type: 'NEXUS_QUICK_ACCESS',
        title: 'Nexus AI & Espacios',
        description: 'Acceso rápido a conversaciones de IA y espacios de trabajo.',
        icon: <BrainCircuit className="h-5 w-5 text-cyan-500" />
    }
];

export function AddWidgetDialog({ onAdd, isEditMode }: AddWidgetDialogProps) {
    const [open, setOpen] = useState(false);

    const handleAdd = (type: WidgetType) => {
        onAdd(type);
        setOpen(false);
    };

    if (!isEditMode) return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <div className="h-[120px] max-w-md mx-auto cursor-pointer border-2 border-dashed border-primary/20 hover:border-primary/50 hover:bg-muted/50 rounded-xl flex flex-col items-center justify-center transition-all bg-card/50 gap-3 group">
                    <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Plus className="h-6 w-6 text-primary" />
                    </div>
                    <span className="font-medium text-primary">Añadir Nuevo Widget</span>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Añadir Widget</DialogTitle>
                    <DialogDescription>
                        Selecciona un módulo para añadir a tu tablero personal.
                    </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="all" className="w-full">
                    <TabsList className="w-full justify-start overflow-x-auto mb-4 bg-muted/50">
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="social">Social</TabsTrigger>
                        <TabsTrigger value="productivity">Productividad</TabsTrigger>
                        <TabsTrigger value="system">Sistema</TabsTrigger>
                    </TabsList>

                    <div className="h-[400px] overflow-y-auto pr-2">
                        <TabsContent value="all" className="mt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {AVAILABLE_WIDGETS.map((widget) => (
                                    <WidgetStoreItem key={widget.type} widget={widget} onClick={() => handleAdd(widget.type)} />
                                ))}
                            </div>
                        </TabsContent>
                        <TabsContent value="social" className="mt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {AVAILABLE_WIDGETS.filter(w => ['EXPLORE_NETWORK', 'SOCIAL_RADAR', 'MY_PAGES'].includes(w.type)).map((widget) => (
                                    <WidgetStoreItem key={widget.type} widget={widget} onClick={() => handleAdd(widget.type)} />
                                ))}
                            </div>
                        </TabsContent>
                        <TabsContent value="productivity" className="mt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {AVAILABLE_WIDGETS.filter(w => ['COLLAB_PROJECTS', 'LEARNING_PATH', 'RECENT_ACTIVITY', 'POLITICAL_SUMMARY', 'NEXUS_QUICK_ACCESS'].includes(w.type)).map((widget) => (
                                    <WidgetStoreItem key={widget.type} widget={widget} onClick={() => handleAdd(widget.type)} />
                                ))}
                            </div>
                        </TabsContent>
                        <TabsContent value="system" className="mt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {AVAILABLE_WIDGETS.filter(w => ['SYSTEM_STATUS', 'LIVE_DATA', 'THEME_SELECTOR', 'WELLNESS'].includes(w.type)).map((widget) => (
                                    <WidgetStoreItem key={widget.type} widget={widget} onClick={() => handleAdd(widget.type)} />
                                ))}
                            </div>
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

function WidgetStoreItem({ widget, onClick }: { widget: typeof AVAILABLE_WIDGETS[0], onClick: () => void }) {
    return (
        <Button
            variant="outline"
            className="h-auto flex flex-col items-start gap-2 p-4 hover:bg-muted/80 hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 text-left group"
            onClick={onClick}
        >
            <div className="flex items-center gap-2 w-full">
                <div className="p-2 rounded-full bg-background border shadow-sm group-hover:bg-primary/10 transition-colors">
                    {widget.icon}
                </div>
                <span className="font-semibold">{widget.title}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
                {widget.description}
            </p>
        </Button>
    );
}
