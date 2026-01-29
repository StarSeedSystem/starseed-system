'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
    Plus
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
                <div className="h-[60px] cursor-pointer border-2 border-dashed border-primary/20 hover:border-primary/50 hover:bg-muted/50 rounded-xl flex items-center justify-center transition-all bg-card/50">
                    <div className="flex items-center gap-2 text-primary/70">
                        <Plus className="h-5 w-5" />
                        <span className="font-medium">Añadir Widget</span>
                    </div>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Añadir Widget</DialogTitle>
                    <DialogDescription>
                        Selecciona un módulo para añadir a tu tablero personal.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                    {AVAILABLE_WIDGETS.map((widget) => (
                        <Button
                            key={widget.type}
                            variant="outline"
                            className="h-auto flex flex-col items-start gap-2 p-4 hover:bg-muted/80 hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 text-left group"
                            onClick={() => handleAdd(widget.type)}
                        >
                            <div className="flex items-center gap-2 w-full">
                                <div className="p-2 rounded-full bg-background border shadow-sm">
                                    {widget.icon}
                                </div>
                                <span className="font-semibold">{widget.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                                {widget.description}
                            </p>
                        </Button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
