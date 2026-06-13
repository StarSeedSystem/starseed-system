import {
    Vote, GraduationCap, Palette, Users, Coins, CloudSun,
    ListChecks, MapPin, Wrench, Brush, Telescope, Sparkles,
    Cpu, SlidersHorizontal, FolderOpen, Gamepad2, BrainCircuit,
    HelpCircle, Landmark, Network, Eye, Lightbulb, Compass,
    ShieldCheck, Home, Wand2, UserCircle, Globe,
    type LucideIcon
} from "lucide-react";

// ── Category Definition ──────────────────────────────────────────
export interface WidgetCategoryDef {
    id: WidgetCategory;
    name: string;
    icon: LucideIcon;
    color: string;       // Tailwind color class (e.g. "blue-500")
    description: string;
    tags: string[];
    hasWidgets: boolean;  // Whether any widget components exist for this category
}

export type WidgetCategory =
    | 'politica'
    | 'educacion'
    | 'cultura'
    | 'social'
    | 'economia'
    | 'clima'
    | 'productividad'
    | 'ubicacion'
    | 'utilidades'
    | 'arte'
    | 'astronomia'
    | 'astrologia'
    | 'sistema'
    | 'personalizacion'
    | 'archivos'
    | 'entretenimiento'
    | 'ia'
    | 'ayudantia'
    | 'parlamento'
    | 'red'
    | 'ciberdelia'
    | 'descubrimientos'
    | 'explorador'
    | 'privacidad'
    | 'dispositivos'
    | 'creatividad'
    | 'perfil'
    | 'sociedad';

// ── Master Category Registry ─────────────────────────────────────
export const WIDGET_CATEGORIES: WidgetCategoryDef[] = [
    {
        id: 'politica',
        name: 'Política',
        icon: Vote,
        color: 'orange-500',
        description: 'Gobernanza, propuestas y estado legislativo.',
        tags: ['gobierno', 'legislación', 'propuestas', 'votación', 'ontocracia'],
        hasWidgets: true,
    },
    {
        id: 'educacion',
        name: 'Educación',
        icon: GraduationCap,
        color: 'purple-500',
        description: 'Cursos, habilidades y progreso de aprendizaje.',
        tags: ['cursos', 'aprendizaje', 'habilidades', 'universidad', 'conocimiento'],
        hasWidgets: true,
    },
    {
        id: 'cultura',
        name: 'Cultura',
        icon: Palette,
        color: 'pink-500',
        description: 'Arte, expresiones culturales y manifiestos.',
        tags: ['arte', 'música', 'expresión', 'manifiesto', 'creatividad'],
        hasWidgets: true,
    },
    {
        id: 'social',
        name: 'Social',
        icon: Users,
        color: 'blue-500',
        description: 'Comunidades, amigos, eventos y comunicación.',
        tags: ['amigos', 'comunidades', 'eventos', 'mensajes', 'red social'],
        hasWidgets: true,
    },
    {
        id: 'economia',
        name: 'Economía',
        icon: Coins,
        color: 'emerald-500',
        description: 'Recursos SEEDS, KARMA y flujo financiero.',
        tags: ['finanzas', 'seeds', 'karma', 'recursos', 'mercado'],
        hasWidgets: true,
    },
    {
        id: 'clima',
        name: 'Clima',
        icon: CloudSun,
        color: 'sky-500',
        description: 'Clima terrestre, espacial y telemetría atmosférica.',
        tags: ['clima', 'temperatura', 'viento', 'lluvia', 'atmósfera', 'espacio'],
        hasWidgets: true,
    },
    {
        id: 'productividad',
        name: 'Productividad',
        icon: ListChecks,
        color: 'violet-500',
        description: 'Proyectos, tareas y seguimiento de actividad.',
        tags: ['proyectos', 'tareas', 'colaboración', 'sprint', 'equipo'],
        hasWidgets: true,
    },
    {
        id: 'ubicacion',
        name: 'Ubicación',
        icon: MapPin,
        color: 'red-500',
        description: 'Mapas, contexto local y geolocalización.',
        tags: ['mapa', 'ubicación', 'gps', 'local', 'geografía'],
        hasWidgets: true,
    },
    {
        id: 'utilidades',
        name: 'Utilidades',
        icon: Wrench,
        color: 'amber-500',
        description: 'Herramientas, calculadoras y utilidades del sistema.',
        tags: ['herramientas', 'calculadora', 'utilidad', 'conversión'],
        hasWidgets: true,
    },
    {
        id: 'arte',
        name: 'Arte',
        icon: Brush,
        color: 'fuchsia-500',
        description: 'Galerías, herramientas creativas y expresión artística.',
        tags: ['galería', 'pintura', 'diseño', 'creativo', 'visual'],
        hasWidgets: true,
    },
    {
        id: 'astronomia',
        name: 'Astronomía',
        icon: Telescope,
        color: 'indigo-500',
        description: 'Observación celeste, clima espacial y fenómenos solares.',
        tags: ['estrellas', 'planetas', 'luna', 'sol', 'espacio', 'telescopio'],
        hasWidgets: true,
    },
    {
        id: 'astrologia',
        name: 'Astrología',
        icon: Sparkles,
        color: 'rose-400',
        description: 'Cartas natales, tránsitos y ciclos cósmicos.',
        tags: ['zodíaco', 'carta natal', 'tránsitos', 'signos', 'horóscopo'],
        hasWidgets: true,
    },
    {
        id: 'sistema',
        name: 'Sistema',
        icon: Cpu,
        color: 'teal-500',
        description: 'Monitor de recursos, nodos y estado del hardware.',
        tags: ['hardware', 'cpu', 'memoria', 'red', 'monitor', 'nodos'],
        hasWidgets: true,
    },
    {
        id: 'personalizacion',
        name: 'Personalización',
        icon: SlidersHorizontal,
        color: 'cyan-500',
        description: 'Temas, apariencia y configuración visual.',
        tags: ['tema', 'color', 'apariencia', 'estilo', 'personalizar'],
        hasWidgets: true,
    },
    {
        id: 'archivos',
        name: 'Archivos',
        icon: FolderOpen,
        color: 'yellow-600',
        description: 'Gestor de archivos, carpetas y almacenamiento.',
        tags: ['archivos', 'carpetas', 'almacenamiento', 'nube', 'ipfs'],
        hasWidgets: true,
    },
    {
        id: 'entretenimiento',
        name: 'Entretenimiento',
        icon: Gamepad2,
        color: 'lime-500',
        description: 'Media, juegos y contenido de entretenimiento.',
        tags: ['juegos', 'media', 'video', 'streaming', 'música'],
        hasWidgets: true,
    },
    {
        id: 'ia',
        name: 'IA',
        icon: BrainCircuit,
        color: 'cyan-400',
        description: 'Exocortex, conversaciones de IA y asistentes.',
        tags: ['inteligencia artificial', 'exocortex', 'nexus', 'chatbot', 'agente'],
        hasWidgets: true,
    },
    {
        id: 'ayudantia',
        name: 'Ayudantía',
        icon: HelpCircle,
        color: 'green-500',
        description: 'Tutoriales, soporte y guías del sistema.',
        tags: ['ayuda', 'tutorial', 'soporte', 'guía', 'faq'],
        hasWidgets: true,
    },
    {
        id: 'parlamento',
        name: 'Parlamento',
        icon: Landmark,
        color: 'stone-500',
        description: 'Seguimiento legislativo y asambleas.',
        tags: ['parlamento', 'legislación', 'asamblea', 'senado', 'debate'],
        hasWidgets: true,
    },
    {
        id: 'red',
        name: 'Red',
        icon: Network,
        color: 'blue-400',
        description: 'Topología de red, nodos y conectividad.',
        tags: ['red', 'nodos', 'topología', 'conexión', 'telemetría'],
        hasWidgets: true,
    },
    {
        id: 'ciberdelia',
        name: 'Ciberdelia',
        icon: Eye,
        color: 'purple-400',
        description: 'Visualizaciones psicodélicas y experiencias inmersivas.',
        tags: ['psicodelia', 'visual', 'inmersivo', 'fractal', 'conciencia'],
        hasWidgets: true,
    },
    {
        id: 'descubrimientos',
        name: 'Descubrimientos',
        icon: Lightbulb,
        color: 'yellow-500',
        description: 'Noticias científicas, hallazgos y exploración.',
        tags: ['ciencia', 'descubrimiento', 'innovación', 'investigación'],
        hasWidgets: true,
    },
    {
        id: 'explorador',
        name: 'Explorador',
        icon: Compass,
        color: 'orange-400',
        description: 'Navegar y descubrir contenido en la red.',
        tags: ['explorar', 'buscar', 'descubrir', 'navegar', 'contenido'],
        hasWidgets: true,
    },
    {
        id: 'privacidad',
        name: 'Privacidad',
        icon: ShieldCheck,
        color: 'violet-400',
        description: 'Membrana criptográfica, soberanía y control de datos.',
        tags: ['privacidad', 'criptografía', 'soberanía', 'zk', 'seguridad', 'datos'],
        hasWidgets: true,
    },
    {
        id: 'dispositivos',
        name: 'Dispositivos',
        icon: Home,
        color: 'amber-400',
        description: 'Hábitat inteligente, domótica y robótica del Oikos.',
        tags: ['domótica', 'hogar', 'robots', 'iot', 'dispositivos', 'hábitat'],
        hasWidgets: true,
    },
    {
        id: 'creatividad',
        name: 'Creatividad',
        icon: Wand2,
        color: 'pink-400',
        description: 'Ideación cruzada, lluvia de ideas y motores de invención.',
        tags: ['ideas', 'creatividad', 'invención', 'brainstorming', 'ideación'],
        hasWidgets: true,
    },
    {
        id: 'perfil',
        name: 'Perfil',
        icon: UserCircle,
        color: 'cyan-400',
        description: 'Espejo ontológico: mérito, identidad y legado visible.',
        tags: ['perfil', 'mérito', 'identidad', 'reputación', 'legado', 'avatar'],
        hasWidgets: true,
    },
    {
        id: 'sociedad',
        name: 'Sociedad',
        icon: Globe,
        color: 'emerald-400',
        description: 'El pulso del macro-organismo: cohesión y armonía global.',
        tags: ['sociedad', 'cohesión', 'armonía', 'biorregiones', 'comunidad'],
        hasWidgets: true,
    },
];

// ── Helper ───────────────────────────────────────────────────────
export function getCategoryById(id: WidgetCategory): WidgetCategoryDef | undefined {
    return WIDGET_CATEGORIES.find(c => c.id === id);
}

export function getCategoriesWithWidgets(): WidgetCategoryDef[] {
    return WIDGET_CATEGORIES.filter(c => c.hasWidgets);
}
