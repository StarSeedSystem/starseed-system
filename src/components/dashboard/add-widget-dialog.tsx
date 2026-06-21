'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    LayoutDashboard, LayoutGrid, FileText, Vote, GraduationCap, Activity,
    Heart, Palette, Network, Book, Rocket, Calendar, Plus,
    BrainCircuit, CloudLightning, CloudRain, Wind, ThermometerSun,
    Tornado, Globe, MoonStar, Sparkles, Radio, Calculator, ListChecks,
    MessageSquare, BellRing, Zap, Search, Star, ChevronRight, Wallet,
    Music, Waves, AudioWaveform, Satellite, SlidersHorizontal,
    type LucideIcon
} from "lucide-react";
import { useState, useMemo } from "react";
import { WidgetType } from "./dashboard-types";
import { WidgetCategory, WIDGET_CATEGORIES, getCategoryById } from "./widget-categories";
import { WIDGET_CATEGORY_MAP, getWidgetsByCategory, searchWidgets } from "./dashboard-defaults";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Widget Definitions ───────────────────────────────────────────
interface WidgetDefinition {
    type: WidgetType;
    title: string;
    description: string;
    icon: React.ReactNode;
    primaryCategory: WidgetCategory;
    secondaryCategories: WidgetCategory[];
    tags: string[];
    isPopular?: boolean;
}

const AVAILABLE_WIDGETS: WidgetDefinition[] = [
    // ── Aplicaciones (launcher) ──
    {
        type: 'APP_LAUNCHER', title: "Apps StarSeed",
        description: "Carpeta de apps y módulos: Nexus, Café, Audiomorphic, Omnifrecuencias y más. Iconos personalizables y modos de apertura.",
        icon: <LayoutGrid className="h-5 w-5 text-lime-400" />,
        primaryCategory: 'aplicaciones', secondaryCategories: ['sistema', 'entretenimiento'],
        tags: ['apps', 'launcher', 'carpeta', 'programas', 'inicio', 'nexus', 'café', 'audiomorphic', 'omnifrecuencias'], isPopular: true,
    },
    {
        type: 'UNIVERSAL_OPENER', title: "Visor Universal",
        description: "Abre cualquier archivo o contenido: imagen, GIF, vídeo, audio, PDF, HTML, 3D, markdown, código. Por URL, archivo local o desde tu Biblioteca.",
        icon: <FileText className="h-5 w-5 text-lime-400" />,
        primaryCategory: 'aplicaciones', secondaryCategories: ['archivos', 'sistema'],
        tags: ['abridor', 'archivos', 'visor', 'pdf', 'imagen', 'vídeo', 'audio', '3d', 'html', 'markdown', 'código', 'biblioteca'], isPopular: true,
    },
    // ── Media center ──
    {
        type: 'MUSIC_PLAYER', title: "Reproductor",
        description: "Reproductor de tu biblioteca con cola, progreso y volumen.",
        icon: <Music className="h-5 w-5 text-pink-400" />,
        primaryCategory: 'entretenimiento', secondaryCategories: ['cultura'],
        tags: ['musica', 'reproductor', 'audio', 'biblioteca', 'media', 'player', 'mp3', 'sonido'], isPopular: true,
    },
    {
        type: 'OMNIFRECUENCIAS', title: "Omnifrecuencias",
        description: "Generador de frecuencias funcionales (Solfeggio, Schumann, binaural).",
        icon: <Waves className="h-5 w-5 text-cyan-400" />,
        primaryCategory: 'entretenimiento', secondaryCategories: ['ayudantia', 'astrologia'],
        tags: ['frecuencias', '432', '528', 'solfeggio', 'schumann', 'binaural', 'tono', 'meditación', 'sonido'], isPopular: true,
    },
    {
        type: 'RADIO_LIVE', title: "Radio en vivo",
        description: "Emisoras en vivo (SomaFM): ambient, espacial, downtempo.",
        icon: <Radio className="h-5 w-5 text-orange-400" />,
        primaryCategory: 'entretenimiento', secondaryCategories: ['cultura'],
        tags: ['radio', 'stream', 'emisoras', 'somafm', 'en vivo', 'música', 'ambient', 'audio'],
    },
    {
        type: 'AUDIOMORPHIC_BG', title: "Audiomorphic",
        description: "Activa el visualizador Audiomorphic como fondo del sistema. Gratis dentro del OS.",
        icon: <AudioWaveform className="h-5 w-5 text-purple-400" />,
        primaryCategory: 'entretenimiento', secondaryCategories: ['personalizacion', 'ciberdelia'],
        tags: ['audiomorphic', 'fondo', 'visualizador', 'apariencia', 'background', 'reactivo', 'vr'], isPopular: true,
    },
    {
        type: 'MEDIA_CONTROL', title: "Control de Medios",
        description: "Mando central de audio: reproductor, volumen maestro y salida (fondo Audiomorphic + dispositivo).",
        icon: <SlidersHorizontal className="h-5 w-5 text-pink-400" />,
        primaryCategory: 'entretenimiento', secondaryCategories: ['personalizacion', 'sistema'],
        tags: ['media', 'audio', 'reproductor', 'volumen', 'radio', 'audiomorphic', 'salida', 'control'], isPopular: true,
    },
    // ── Datos oficiales en tiempo real ──
    {
        type: 'OFFICIAL_DATA', title: "Datos Oficiales",
        description: "Fuentes oficiales en tiempo real (clima, clima espacial, sismos, espacio), ajustable y con auto-refresco.",
        icon: <Satellite className="h-5 w-5 text-sky-400" />,
        primaryCategory: 'descubrimientos', secondaryCategories: ['sistema', 'clima'],
        tags: ['datos', 'tiempo real', 'oficial', 'clima', 'sismos', 'espacio', 'noaa', 'usgs', 'open-meteo', 'ajustable'], isPopular: true,
    },
    {
        type: 'SPACE_WEATHER', title: "Clima Espacial",
        description: "Telemetría solar y geomagnética en tiempo real (NOAA SWPC): viento solar, Kp, llamaradas, protones y aurora, reactivo a la severidad.",
        icon: <Satellite className="h-5 w-5 text-amber-400" />,
        primaryCategory: 'astronomia', secondaryCategories: ['clima', 'descubrimientos'],
        tags: ['clima espacial', 'noaa', 'kp', 'viento solar', 'llamaradas', 'aurora', 'schumann', 'tiempo real', 'astronomía'], isPopular: true,
    },
    // ── Social ──
    {
        type: 'EXPLORE_NETWORK', title: "Explorar la Red",
        description: "Acceso rápido a Política, Educación y Cultura.",
        icon: <Network className="h-5 w-5 text-blue-500" />,
        primaryCategory: 'social', secondaryCategories: ['red', 'explorador'],
        tags: ['comunidad', 'explorar', 'red'], isPopular: true,
    },
    {
        type: 'MY_PAGES', title: "Mis Páginas",
        description: "Lista de tus comunidades y entidades activas.",
        icon: <Book className="h-5 w-5 text-green-500" />,
        primaryCategory: 'social', secondaryCategories: ['red', 'explorador'],
        tags: ['páginas', 'comunidades', 'entidades'],
    },
    {
        type: 'SOCIAL_RADAR', title: "Radar Social",
        description: "Eventos cercanos y actividad de amigos.",
        icon: <Calendar className="h-5 w-5 text-pink-500" />,
        primaryCategory: 'social', secondaryCategories: ['ubicacion'],
        tags: ['eventos', 'amigos', 'calendario'],
    },
    {
        type: 'MESSAGES', title: 'Neural Uplink',
        description: 'Uplink neural de comunicación e inteligencia.',
        icon: <MessageSquare className="h-5 w-5 text-primary" />,
        primaryCategory: 'social', secondaryCategories: ['ia'],
        tags: ['mensajes', 'chat', 'comunicación'], isPopular: true,
    },
    {
        type: 'NOTIFICATIONS', title: 'Alertas del Sistema',
        description: 'Monitoreo sensorial y notificaciones.',
        icon: <BellRing className="h-5 w-5 text-rose-500" />,
        primaryCategory: 'utilidades', secondaryCategories: ['social', 'sistema'],
        tags: ['alertas', 'notificaciones', 'avisos'],
    },
    // ── Political ──
    {
        type: 'POLITICAL_SUMMARY', title: "Resumen Político",
        description: "Propuestas urgentes y estado legislativo.",
        icon: <Rocket className="h-5 w-5 text-orange-500" />,
        primaryCategory: 'politica', secondaryCategories: ['parlamento'],
        tags: ['propuestas', 'legislación', 'gobernanza'], isPopular: true,
    },
    {
        type: 'RELEVANT_POSTS', title: 'Publicaciones Destacadas',
        description: 'Resumen de actividad global, Ontocracia y Nexus.',
        icon: <FileText className="h-5 w-5 text-purple-400" />,
        primaryCategory: 'politica', secondaryCategories: ['social', 'cultura'],
        tags: ['publicaciones', 'trending', 'destacado'],
    },
    // ── Education ──
    {
        type: 'LEARNING_PATH', title: "Ruta de Aprendizaje",
        description: "Tu progreso en cursos y habilidades.",
        icon: <Activity className="h-5 w-5 text-purple-500" />,
        primaryCategory: 'educacion', secondaryCategories: [],
        tags: ['cursos', 'progreso', 'habilidades'],
    },
    // ── Culture / Art ──
    {
        type: 'CULTURAL_FEED', title: 'Ondas de Consciencia',
        description: 'Feed cultural de arte, expresiones y manifiestos.',
        icon: <Radio className="h-5 w-5 text-pink-400" />,
        primaryCategory: 'cultura', secondaryCategories: ['arte'],
        tags: ['arte', 'expresión', 'manifiesto', 'feed'], isPopular: true,
    },
    // ── Economy ──
    {
        type: 'ECONOMIC_OVERVIEW', title: 'Pulso Económico',
        description: 'Métricas de recursos: SEEDS, KARMA y flujo financiero.',
        icon: <Zap className="h-5 w-5 text-emerald-400" />,
        primaryCategory: 'economia', secondaryCategories: [],
        tags: ['seeds', 'karma', 'finanzas', 'recursos'], isPopular: true,
    },
    {
        type: 'CARTERA_STARSEED', title: 'Cartera StarSeed',
        description: 'Semillas, granos y bolsa beta de la cuenta soberana unificada.',
        icon: <Wallet className="h-5 w-5 text-lime-400" />,
        primaryCategory: 'economia', secondaryCategories: ['perfil'],
        tags: ['cartera', 'semillas', 'granos', 'bolsa', 'mercado', 'wallet'],
    },
    {
        type: 'CALCULATOR', title: 'Calculadora Cuántica',
        description: 'Herramienta computacional estándar.',
        icon: <Calculator className="h-5 w-5 text-amber-500" />,
        primaryCategory: 'utilidades', secondaryCategories: ['economia'],
        tags: ['calculadora', 'matemáticas', 'herramienta'],
    },
    // ── Productivity ──
    {
        type: 'COLLAB_PROJECTS', title: 'Proyectos Colaborativos',
        description: 'Gestión de equipos y seguimiento de tareas.',
        icon: <Rocket className="h-5 w-5 text-violet-500" />,
        primaryCategory: 'productividad', secondaryCategories: [],
        tags: ['proyectos', 'equipo', 'tareas'],
    },
    {
        type: 'ACTIVE_PROJECTS', title: 'Proyectos Activos',
        description: 'Vista rápida de proyectos en desarrollo.',
        icon: <ListChecks className="h-5 w-5 text-violet-400" />,
        primaryCategory: 'productividad', secondaryCategories: [],
        tags: ['proyectos', 'activo', 'sprint'],
    },
    {
        type: 'RECENT_ACTIVITY', title: 'Actividad Reciente',
        description: 'Historial de tus últimas acciones y notificaciones.',
        icon: <FileText className="h-5 w-5 text-yellow-500" />,
        primaryCategory: 'productividad', secondaryCategories: ['social'],
        tags: ['actividad', 'historial', 'reciente'],
    },
    // ── Climate ──
    {
        type: 'WEATHER_BASIC', title: 'Clima Dinámico Minimalista',
        description: 'Resumen atmosférico visual interactivo.',
        icon: <CloudLightning className="h-5 w-5 text-sky-400" />,
        primaryCategory: 'clima', secondaryCategories: ['ubicacion'],
        tags: ['clima', 'resumen', 'básico'],
    },
    {
        type: 'WEATHER_HOLISTIC', title: 'Clima Esfera 3D Holística',
        description: 'Combinación espacial y terrestre en 3D interactivo.',
        icon: <Globe className="h-5 w-5 text-indigo-400" />,
        primaryCategory: 'clima', secondaryCategories: ['astronomia'],
        tags: ['clima', '3D', 'esfera', 'holístico'], isPopular: true,
    },
    {
        type: 'WEATHER_TEMPERATURE', title: 'Temperatura',
        description: 'Sensor atmosférico principal con animaciones térmicas.',
        icon: <ThermometerSun className="h-5 w-5 text-orange-400" />,
        primaryCategory: 'clima', secondaryCategories: [],
        tags: ['temperatura', 'celsius', 'térmico'],
    },
    {
        type: 'WEATHER_WIND', title: 'Corrientes de Viento',
        description: 'Velocidad y dirección con efecto 3D aerodinámico.',
        icon: <Wind className="h-5 w-5 text-slate-400" />,
        primaryCategory: 'clima', secondaryCategories: [],
        tags: ['viento', 'velocidad', 'dirección'],
    },
    {
        type: 'WEATHER_HUMIDITY', title: 'Humedad Relativa',
        description: 'Saturación en el ambiente.',
        icon: <CloudRain className="h-5 w-5 text-blue-400" />,
        primaryCategory: 'clima', secondaryCategories: [],
        tags: ['humedad', 'saturación'],
    },
    {
        type: 'WEATHER_UV', title: 'Índice UV',
        description: 'Radiación ultravioleta solar.',
        icon: <Sparkles className="h-5 w-5 text-yellow-500" />,
        primaryCategory: 'clima', secondaryCategories: [],
        tags: ['uv', 'radiación', 'solar'],
    },
    {
        type: 'WEATHER_AIR_QUALITY', title: 'Calidad del Aire (AQI)',
        description: 'Partículas (PM2.5) y CO en tiempo real.',
        icon: <Tornado className="h-5 w-5 text-teal-400" />,
        primaryCategory: 'clima', secondaryCategories: ['ubicacion'],
        tags: ['aire', 'aqi', 'contaminación'],
    },
    // ── Space / Astronomy ──
    {
        type: 'WEATHER_SPACE_SOLAR', title: 'Viento Solar',
        description: 'Velocidad, densidad y temperatura del viento solar.',
        icon: <ThermometerSun className="h-5 w-5 text-orange-500" />,
        primaryCategory: 'astronomia', secondaryCategories: ['clima'],
        tags: ['viento solar', 'densidad', 'velocidad'],
    },
    {
        type: 'WEATHER_SPACE_FLARE', title: 'Llamaradas Solares (X-Ray)',
        description: 'Actividad de rayos X y erupciones solares.',
        icon: <ThermometerSun className="h-5 w-5 text-red-500" />,
        primaryCategory: 'astronomia', secondaryCategories: ['clima'],
        tags: ['llamarada', 'rayos x', 'erupción'],
    },
    {
        type: 'WEATHER_SPACE_KP', title: 'Índice Planetario Kp',
        description: 'Interacción magnética y tormentas geomagnéticas.',
        icon: <Activity className="h-5 w-5 text-purple-400" />,
        primaryCategory: 'astronomia', secondaryCategories: ['clima'],
        tags: ['kp', 'geomagnético', 'tormenta'],
    },
    {
        type: 'WEATHER_SPACE_MAGNETOMETER', title: 'Magnetómetro',
        description: 'Campo magnético terrestre y simulador 3D.',
        icon: <Activity className="h-5 w-5 text-blue-400" />,
        primaryCategory: 'astronomia', secondaryCategories: ['clima'],
        tags: ['magnetómetro', 'campo magnético'],
    },
    {
        type: 'WEATHER_SPACE_SCHUMANN', title: 'Espectrograma Schumann',
        description: 'Frecuencias electromagnéticas terrestres 24h.',
        icon: <Activity className="h-5 w-5 text-teal-400" />,
        primaryCategory: 'astronomia', secondaryCategories: ['clima'],
        tags: ['schumann', 'frecuencia', 'resonancia'],
    },
    {
        type: 'WEATHER_ASTRONOMY', title: 'Astronomía',
        description: 'Fases lunares e iluminación 3D.',
        icon: <MoonStar className="h-5 w-5 text-indigo-300" />,
        primaryCategory: 'astronomia', secondaryCategories: ['clima'],
        tags: ['luna', 'sol', 'fases'],
    },
    // ── System ──
    {
        type: 'SYSTEM_STATUS', title: 'Estado del Sistema',
        description: 'Monitor de recursos en tiempo real.',
        icon: <Activity className="h-5 w-5 text-teal-500" />,
        primaryCategory: 'sistema', secondaryCategories: ['red'],
        tags: ['sistema', 'monitor', 'recursos'], isPopular: true,
    },
    {
        type: 'LIVE_DATA', title: 'Telemetría en Vivo',
        description: 'Métricas de red y estado de nodos en tiempo real.',
        icon: <Activity className="h-5 w-5 text-emerald-500" />,
        primaryCategory: 'sistema', secondaryCategories: ['red'],
        tags: ['telemetría', 'nodos', 'tiempo real'],
    },
    // ── Personalization ──
    {
        type: 'THEME_SELECTOR', title: 'Selector de Temas',
        description: 'Personaliza la apariencia de tu entorno digital.',
        icon: <Palette className="h-5 w-5 text-primary" />,
        primaryCategory: 'personalizacion', secondaryCategories: [],
        tags: ['tema', 'apariencia', 'selector'],
    },
    {
        type: 'THEME_MANAGER', title: 'Gestor de Temas',
        description: 'Organiza, reordena y aplica temas guardados.',
        icon: <Palette className="h-5 w-5 text-fuchsia-500" />,
        primaryCategory: 'personalizacion', secondaryCategories: [],
        tags: ['tema', 'gestión', 'canvas'],
    },
    // ── AI ──
    {
        type: 'NEXUS_QUICK_ACCESS', title: 'Nexus AI & Espacios',
        description: 'Acceso rápido a conversaciones de IA y espacios.',
        icon: <BrainCircuit className="h-5 w-5 text-cyan-500" />,
        primaryCategory: 'ia', secondaryCategories: ['productividad'],
        tags: ['nexus', 'exocortex', 'ia', 'agente'], isPopular: true,
    },
    // ── Wellness ──
    {
        type: 'WELLNESS', title: 'Bienestar',
        description: 'Estado de salud y coherencia mental.',
        icon: <Heart className="h-5 w-5 text-red-500" />,
        primaryCategory: 'social', secondaryCategories: ['utilidades'],
        tags: ['bienestar', 'salud', 'coherencia'],
    },
];


// ── Props ────────────────────────────────────────────────────────
interface AddWidgetDialogProps {
    onAdd: (type: WidgetType) => void;
    isEditMode: boolean;
    onForgeOpen?: () => void;
}

export function AddWidgetDialog({ onAdd, isEditMode, onForgeOpen }: AddWidgetDialogProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState<WidgetCategory | 'all' | 'popular'>('all');

    const handleAdd = (type: WidgetType) => {
        onAdd(type);
        setOpen(false);
    };

    // Get categories that actually have widgets
    const categoriesWithWidgets = useMemo(() => {
        const catIds = new Set<WidgetCategory>();
        AVAILABLE_WIDGETS.forEach(w => {
            catIds.add(w.primaryCategory);
            w.secondaryCategories.forEach(c => catIds.add(c));
        });
        return WIDGET_CATEGORIES.filter(c => catIds.has(c.id));
    }, []);

    // Filter widgets based on search and category
    const filteredWidgets = useMemo(() => {
        let results = AVAILABLE_WIDGETS;

        // Filter by category
        if (activeCategory === 'popular') {
            results = results.filter(w => w.isPopular);
        } else if (activeCategory !== 'all') {
            results = results.filter(w =>
                w.primaryCategory === activeCategory ||
                w.secondaryCategories.includes(activeCategory)
            );
        }

        // Filter by search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            results = results.filter(w =>
                w.title.toLowerCase().includes(q) ||
                w.description.toLowerCase().includes(q) ||
                w.tags.some(t => t.includes(q)) ||
                w.primaryCategory.includes(q)
            );
        }

        return results;
    }, [activeCategory, searchQuery]);

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
            <DialogContent className="w-[95vw] max-w-[1100px] h-[85vh] max-h-[900px] flex flex-col p-0 gap-0 overflow-hidden">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-2xl font-bold">Biblioteca de Widgets</DialogTitle>
                        <DialogDescription>
                            Selecciona un módulo para añadir a tu tablero personal.
                        </DialogDescription>
                    </DialogHeader>
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar widgets por nombre, categoría o etiqueta..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-11 bg-muted/30"
                        />
                    </div>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Category Sidebar */}
                    <div className="w-[220px] border-r border-border/50 p-3 overflow-y-auto shrink-0 hidden md:block">
                        <div className="space-y-1">
                            {/* All */}
                            <button
                                onClick={() => setActiveCategory('all')}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all",
                                    activeCategory === 'all'
                                        ? "bg-primary/15 text-primary font-semibold"
                                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <LayoutDashboard className="h-4 w-4" />
                                Todos
                                <span className="ml-auto text-[10px] opacity-60">{AVAILABLE_WIDGETS.length}</span>
                            </button>
                            {/* Popular */}
                            <button
                                onClick={() => setActiveCategory('popular')}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all",
                                    activeCategory === 'popular'
                                        ? "bg-primary/15 text-primary font-semibold"
                                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Star className="h-4 w-4 text-yellow-500" />
                                Populares
                                <span className="ml-auto text-[10px] opacity-60">
                                    {AVAILABLE_WIDGETS.filter(w => w.isPopular).length}
                                </span>
                            </button>

                            <div className="h-px bg-border/50 my-2" />

                            {/* Categories */}
                            {categoriesWithWidgets.map(cat => {
                                const count = AVAILABLE_WIDGETS.filter(w =>
                                    w.primaryCategory === cat.id || w.secondaryCategories.includes(cat.id)
                                ).length;
                                const Icon = cat.icon;
                                return (
                                    <button
                                        key={cat.id}
                                        onClick={() => setActiveCategory(cat.id)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all",
                                            activeCategory === cat.id
                                                ? "bg-primary/15 text-primary font-semibold"
                                                : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        <Icon className={cn("h-4 w-4", `text-${cat.color}`)} />
                                        {cat.name}
                                        <span className="ml-auto text-[10px] opacity-60">{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Mobile Category Scroller */}
                    <div className="md:hidden border-b border-border/50 px-4 py-2 overflow-x-auto flex gap-2 shrink-0">
                        <Button
                            variant={activeCategory === 'all' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveCategory('all')}
                            className="shrink-0"
                        >
                            Todos
                        </Button>
                        <Button
                            variant={activeCategory === 'popular' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveCategory('popular')}
                            className="shrink-0"
                        >
                            ⭐ Populares
                        </Button>
                        {categoriesWithWidgets.map(cat => {
                            const Icon = cat.icon;
                            return (
                                <Button
                                    key={cat.id}
                                    variant={activeCategory === cat.id ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setActiveCategory(cat.id)}
                                    className="shrink-0 gap-1"
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {cat.name}
                                </Button>
                            );
                        })}
                    </div>

                    {/* Widget Grid */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6">
                        {/* Category Header */}
                        {activeCategory !== 'all' && activeCategory !== 'popular' && (() => {
                            const cat = getCategoryById(activeCategory);
                            if (!cat) return null;
                            const Icon = cat.icon;
                            return (
                                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/30">
                                    <div className={cn("p-2 rounded-lg", `bg-${cat.color}/10`)}>
                                        <Icon className={cn("h-5 w-5", `text-${cat.color}`)} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{cat.name}</h3>
                                        <p className="text-xs text-muted-foreground">{cat.description}</p>
                                    </div>
                                </div>
                            );
                        })()}

                        {filteredWidgets.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[200px] text-center">
                                <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="text-muted-foreground text-sm">No se encontraron widgets.</p>
                                <p className="text-muted-foreground/60 text-xs mt-1">Intenta con otra búsqueda o categoría.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                                {/* AI Forge CTA */}
                                {onForgeOpen && (
                                    <button
                                        onClick={() => { setOpen(false); onForgeOpen(); }}
                                        className="relative col-span-1 sm:col-span-2 lg:col-span-3 overflow-hidden rounded-2xl p-[1px] group"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-60 group-hover:opacity-100 transition-opacity animate-gradient-x" />
                                        <div className="relative bg-black/80 backdrop-blur-xl rounded-[15px] p-5 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-purple-500/25 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                                                <Sparkles className="w-6 h-6 text-indigo-300" />
                                            </div>
                                            <div className="text-left">
                                                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                                                    Crear con IA — La Fragua de Interfaces
                                                    <ChevronRight className="w-4 h-4 text-indigo-400" />
                                                </h3>
                                                <p className="text-white/40 text-xs mt-0.5">
                                                    Diseña y genera widgets personalizados con Stitch + Gemini en 3 fases.
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                )}
                                {filteredWidgets.map((widget) => (
                                    <WidgetStoreItem
                                        key={widget.type}
                                        widget={widget}
                                        onClick={() => handleAdd(widget.type)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Widget Card ──────────────────────────────────────────────────
function WidgetStoreItem({ widget, onClick }: { widget: WidgetDefinition, onClick: () => void }) {
    const cat = getCategoryById(widget.primaryCategory);

    return (
        <Button
            variant="outline"
            className="h-full min-h-[140px] flex flex-col items-center justify-center gap-3 p-5 hover:bg-muted/80 hover:border-primary/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-center group w-full relative overflow-hidden"
            onClick={onClick}
        >
            {/* Popular badge */}
            {widget.isPopular && (
                <div className="absolute top-2 right-2">
                    <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                </div>
            )}

            <div className="flex flex-col items-center gap-3 w-full">
                <div className="p-3 rounded-full bg-background border shadow-sm group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300">
                    {widget.icon}
                </div>
                <span className="font-semibold text-sm md:text-base">{widget.title}</span>
            </div>

            <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 px-1">
                {widget.description}
            </p>

            {/* Category badge */}
            {cat && (
                <div className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                    "bg-muted/80 text-muted-foreground"
                )}>
                    {cat.name}
                </div>
            )}
        </Button>
    );
}
