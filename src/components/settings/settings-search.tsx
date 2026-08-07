"use client";

/*
 * Buscador global de Ajustes — índice de palabras clave.
 * ----------------------------------------------------------------------
 * Vive en la parte superior de /ajustes (junto a QuickAccessTiles /
 * CategoryChipsBar). Al escribir, filtra un catálogo estático de entradas
 * {id, label, keywords, tab, description} y muestra un dropdown; al hacer
 * clic en un resultado, salta a la pestaña correcta vía la prop
 * `onNavigate` (la misma `goToSection` que ya usa SettingsPage) y hace
 * scroll suave a #settings-secciones.
 *
 * Patrón normalize() (NFD + quitar diacríticos) tomado de
 * src/components/funciones/funciones-index.tsx (no se importa ese
 * archivo — es de otra sección — solo se replica la función trivial).
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
    Search,
    X,
    Palette,
    Image as ImageIcon,
    Type,
    LayoutGrid,
    Compass,
    Mic,
    Eye,
    RefreshCw,
    ShieldCheck,
    Bell,
    Accessibility,
    Plug2,
    Download,
    Sparkles,
    Cpu,
    Monitor,
    User,
    Lock,
    Bot,
    Brain,
    CreditCard,
    Radio,
    SlidersHorizontal,
    type LucideIcon,
} from "lucide-react";
// Adenda 149 · las entradas de los 5 sistemas de Astraura no navegan a una
// pestaña: ABREN la ventana «Sistemas de Astraura en esta neurona» por su
// sección (el drawer global escucha este evento desde cualquier ruta).
import { openAstrauraConfig } from "@/lib/astraura/config-ui";

export interface SettingsSearchEntry {
    id: string;
    label: string;
    keywords: string[];
    /** Valor de pestaña de nivel superior (mismo `tab` que goToSection). */
    tab: string;
    description: string;
    icon: LucideIcon;
    /** Etiqueta legible de la categoría/pestaña, para el chip del resultado. */
    category: string;
    /**
     * `id` de una sección REAL del DOM a la que saltar tras navegar (Adenda 63
     * · P-3). Los Ajustes viven hoy en `/cuenta` (`/settings` redirige allí),
     * cuyas secciones tienen anclas: `info-personal`, `datos-privacidad`,
     * `roles`, `seguridad`, `sincronizacion`, `personalizacion`,
     * `notificaciones`, `aurora-ia`, `aurora-voz`, `aurora-sentidos`.
     * Si se omite, solo se navega a la pestaña.
     */
    anchor?: string;
    /**
     * Acción DIRECTA al seleccionar (Adenda 149). Si está presente, la entrada
     * NO navega a `tab`/`anchor`: ejecuta esto (p. ej. abrir la ventana de
     * sistemas de Astraura en la pestaña correspondiente). Las entradas sin
     * `action` conservan exactamente el comportamiento anterior.
     */
    action?: () => void;
}

/* ── Catálogo de entradas — cubre las opciones más importantes de cada
   categoría. Aditivo: se puede ampliar sin migración (es solo UI). ───── */
export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
    // Apariencia
    {
        id: "tema-apariencia",
        label: "Tema y apariencia",
        keywords: ["tema", "estilo", "cristal", "liquid glass", "colores", "galeria", "presets"],
        tab: "appearance",
        description: "Galería de temas, cristal líquido y estilos coordinados.",
        icon: Palette,
        category: "Apariencia",
    },
    {
        id: "fondo",
        label: "Fondo del sistema",
        keywords: ["fondo", "background", "spline", "webgl", "video", "imagen", "materia viva"],
        tab: "appearance",
        description: "Elige el fondo animado, imagen, video o escena 3D del sistema.",
        icon: ImageIcon,
        category: "Apariencia",
    },
    {
        id: "tipografia",
        label: "Tipografía",
        keywords: ["tipografia", "fuente", "font", "letra", "escala de texto"],
        tab: "appearance",
        description: "Fuente y escala tipográfica de todo el sistema.",
        icon: Type,
        category: "Apariencia",
    },
    {
        id: "interfaz-widgets",
        label: "Interfaz y widgets",
        keywords: ["interfaz", "widgets", "layout", "disposicion", "dashboard"],
        tab: "appearance",
        description: "Disposición general y estilo de los widgets del dashboard.",
        icon: Monitor,
        category: "Apariencia",
    },

    // Escritorios
    {
        id: "escritorios",
        label: "Escritorios",
        keywords: ["escritorio", "desktop", "escritorios", "iconos de escritorio"],
        tab: "desktops",
        description: "Tu página principal del OS: escritorios personalizables.",
        icon: LayoutGrid,
        category: "Escritorios",
    },

    // Trinity
    {
        id: "trinity-dock",
        label: "Trinity — botón flotante (dock)",
        keywords: ["trinity", "dock", "fab", "boton flotante", "cardinal", "zenith", "horizon", "logic", "anchor"],
        tab: "trinity",
        description: "Visibilidad y posición del botón Trinity en móvil.",
        icon: Compass,
        category: "Trinity",
    },
    {
        id: "trinity-bordes",
        label: "Trinity — gestos de borde",
        keywords: ["gestos", "bordes", "swipe", "deslizar", "asas", "edge access", "trinity tactil"],
        tab: "trinity",
        description: "Asas y deslizamiento desde los bordes para abrir los 4 nodos cardinales.",
        icon: Compass,
        category: "Trinity",
    },

    // Aurora e IA
    {
        id: "aurora-voz",
        label: "Aurora — voz",
        keywords: ["aurora", "voz", "kokoro", "kitten", "texto a voz", "tts", "hablar", "bark", "sovits", "omnivoice", "endpoint", "emocion", "clonar voz", "neurona"],
        tab: "ai",
        description: "Motor de voz de Aurora: navegador, Kokoro (local), Bark, GPT-SoVITS u OmniVoice (por endpoint) + estilo emocional.",
        icon: Mic,
        category: "Aurora e IA",
        anchor: "aurora-voz",
    },
    {
        id: "aurora-sentidos",
        label: "Sentidos — visión IA",
        keywords: ["sentidos", "vision", "smolvlm", "camara", "percepcion", "multimodal"],
        tab: "ai",
        description: "Percepción visual de Aurora, 100% local vía WebGPU.",
        icon: Eye,
        category: "Aurora e IA",
        anchor: "aurora-sentidos",
    },
    {
        id: "aurora-canales",
        label: "Canales de Aurora",
        keywords: ["canales", "telegram", "google chat", "api", "aurora canales"],
        tab: "ai",
        description: "Por dónde habla Aurora: interno, Telegram, Google Chat o API.",
        icon: Sparkles,
        category: "Aurora e IA",
        anchor: "aurora-ia",
    },
    {
        id: "ia-modelos",
        label: "Proveedores de IA",
        keywords: ["ia", "modelos", "proveedores", "api key", "llm", "exocortex", "astraura"],
        tab: "ai",
        description: "Proveedores de tu Exocórtex: modelos locales o API.",
        icon: Cpu,
        category: "Aurora e IA",
        anchor: "aurora-ia",
    },
    {
        id: "neuronas",
        label: "Neuronas (dispositivos)",
        keywords: ["neuronas", "dispositivos", "red personal", "cerebro", "servidor"],
        tab: "ai",
        description: "Cada uno de tus dispositivos como cerebro + servidor de Astraura.",
        icon: Cpu,
        category: "Aurora e IA",
        anchor: "seguridad",
    },

    // Aurora e IA · Sistemas de Astraura en ESTA neurona (Adenda 149).
    // Abren la ventana directamente en su pestaña, sin salir de donde estés.
    {
        id: "astraura-sistemas",
        label: "Sistemas de Astraura en esta neurona",
        keywords: ["astraura", "sistemas", "neurona", "personalidad", "llm", "voz", "cerebro", "senales", "omnivoice", "dispositivo"],
        tab: "ai",
        description: "LLM, Astraura, OpenVoice, cerebro y señales de cada personalidad en este dispositivo.",
        icon: Bot,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("llm"),
    },
    {
        id: "astraura-motor-voz",
        label: "Motor de voz por personalidad",
        keywords: ["motor de voz", "openvoice", "voz por personalidad", "tts", "sintesis", "kokoro", "bark", "clonar voz", "omnivoice"],
        tab: "ai",
        description: "Qué motor de voz usa cada personalidad en esta neurona (OpenVoice y compañía).",
        icon: Mic,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("openvoice"),
    },
    {
        id: "astraura-antena-lora",
        label: "Antena LoRa (malla P2P)",
        keywords: ["lora", "antena", "radio", "malla", "mesh", "meshtastic", "p2p", "serie", "usb"],
        tab: "ai",
        description: "Activa o cierra la radio LoRa y el resto de antenas para una personalidad.",
        icon: Radio,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("senales"),
    },
    {
        id: "astraura-senales-antena",
        label: "Señales por antena (entrada y salida)",
        keywords: ["senales", "antena", "entrada", "salida", "ruta", "wifi", "bluetooth", "daemon", "por personalidad"],
        tab: "ai",
        description: "Reglas de entrada/salida y ruta preferida de cada antena, por personalidad.",
        icon: Radio,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("senales"),
    },
    {
        id: "astraura-cerebros-permitidos",
        label: "Cerebros permitidos",
        keywords: ["cerebros permitidos", "cerebro", "memoria", "almacen", "brains", "por personalidad"],
        tab: "ai",
        description: "Qué cerebros puede leer cada personalidad en esta neurona y dónde se guarda.",
        icon: Brain,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("cerebro"),
    },
    {
        id: "astraura-memoria-personalidad",
        label: "Memoria de personalidad",
        keywords: ["memoria", "recuerdos", "nivel de contexto", "usar memorias", "cerebro", "personalidad"],
        tab: "ai",
        description: "Si una personalidad usa memorias y con cuánto contexto, en esta neurona.",
        icon: Brain,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("cerebro"),
    },
    {
        id: "astraura-permitir-pago",
        label: "Permitir fuentes de pago",
        keywords: ["pago", "de pago", "api externa", "gratis", "coste", "fuentes", "permitir pago"],
        tab: "ai",
        description: "Si una personalidad puede recurrir a fuentes de IA de pago o solo a las gratuitas.",
        icon: CreditCard,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("astraura"),
    },
    {
        id: "astraura-orden-motores",
        label: "Orden de motores de IA",
        keywords: ["orden", "prioridad", "motores", "fuentes", "local", "starseed", "openrouter", "router", "gratis primero"],
        tab: "ai",
        description: "Prioridad de las clases de motor (local, servidor StarSeed, gratis, externas).",
        icon: SlidersHorizontal,
        category: "Aurora e IA",
        action: () => openAstrauraConfig("astraura"),
    },

    // Cuenta y Sincronización
    {
        id: "perfil-identidad",
        label: "Perfil e identidad",
        keywords: ["perfil", "identidad", "avatar", "nombre", "bio", "usuario"],
        tab: "account",
        description: "Edita tu nombre, @, avatar y biografía.",
        icon: User,
        category: "Cuenta y Sincronización",
    },
    {
        id: "sincronizacion-cuenta",
        label: "Sincronización de cuenta",
        keywords: ["sincronizar", "sync", "cuenta", "subir ajustes", "recuperar ajustes", "starseed id"],
        tab: "account",
        description: "Sube o recupera tus preferencias desde tu cuenta StarSeed.",
        icon: RefreshCw,
        category: "Cuenta y Sincronización",
    },

    // Privacidad y Seguridad
    {
        id: "privacidad",
        label: "Privacidad",
        keywords: ["privacidad", "datos", "grafo publico", "actividad"],
        tab: "privacy-security",
        description: "Controla qué datos compartes y cómo aparece tu actividad.",
        icon: ShieldCheck,
        category: "Privacidad y Seguridad",
    },
    {
        id: "seguridad-llaves",
        label: "Seguridad y llaves",
        keywords: ["seguridad", "llaves", "mpc", "shamir", "fragmentacion", "respaldo"],
        tab: "privacy-security",
        description: "Llaves criptográficas, respaldo y fragmentación (MPC).",
        icon: Lock,
        category: "Privacidad y Seguridad",
    },
    {
        id: "seguridad-escaner",
        label: "Seguridad — escáner de datos sensibles",
        keywords: ["escaner", "escanear", "secretos", "pii", "antivirus", "strix", "redactar", "claves api", "tokens", "datos sensibles", "fugas"],
        tab: "privacy-security",
        description: "Escanea memorias, personalidades, biblioteca y claves locales en busca de secretos; redacta en origen.",
        icon: ShieldCheck,
        category: "Privacidad y Seguridad",
    },

    // Notificaciones
    {
        id: "notificaciones",
        label: "Notificaciones",
        keywords: ["notificaciones", "avisos", "campana", "alertas", "actualizaciones"],
        tab: "notifications",
        description: "Avisos del sistema, novedades y actualizaciones.",
        icon: Bell,
        category: "Notificaciones",
    },

    // Accesibilidad
    {
        id: "accesibilidad",
        label: "Accesibilidad",
        keywords: ["accesibilidad", "a11y", "contraste", "texto grande", "daltonismo", "reducir movimiento"],
        tab: "accessibility",
        description: "Alto contraste, tamaño de texto, daltonismo y reducción de movimiento.",
        icon: Accessibility,
        category: "Accesibilidad",
    },

    // Avanzado
    {
        id: "integraciones",
        label: "Integraciones",
        keywords: ["integraciones", "conectores", "apps externas", "automatizacion"],
        tab: "advanced",
        description: "Conecta herramientas de código abierto y automatización.",
        icon: Plug2,
        category: "Avanzado",
    },
    {
        id: "export-import",
        label: "Exportar / importar configuración",
        keywords: ["exportar", "importar", "backup", "json", "respaldo de ajustes", "restablecer"],
        tab: "advanced",
        description: "Descarga o restaura toda tu configuración en un archivo JSON.",
        icon: Download,
        category: "Avanzado",
    },
];

function normalize(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export interface SettingsSearchProps {
    /** Navega a la pestaña indicada y hace scroll a #settings-secciones. */
    onNavigate: (tab: string) => void;
    className?: string;
}

export function SettingsSearch({ onNavigate, className }: SettingsSearchProps) {
    const [query, setQuery] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const q = normalize(query.trim());

    const results = React.useMemo(() => {
        if (!q) return [];
        return SETTINGS_SEARCH_INDEX.filter((entry) => {
            if (normalize(entry.label).includes(q)) return true;
            if (normalize(entry.description).includes(q)) return true;
            if (normalize(entry.category).includes(q)) return true;
            return entry.keywords.some((k) => normalize(k).includes(q));
        });
    }, [q]);

    // Cierra el dropdown al hacer clic fuera.
    React.useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    function selectEntry(entry: SettingsSearchEntry) {
        // (Adenda 149) Entradas con acción directa: abren su ventana ahí mismo
        // (no hay pestaña de Ajustes que las contenga) y no navegan a ningún lado.
        if (entry.action) {
            try {
                entry.action();
            } catch {
                /* la apertura es best-effort: nunca rompe el buscador */
            }
            setQuery("");
            setOpen(false);
            return;
        }
        onNavigate(entry.tab);
        setQuery("");
        setOpen(false);
        // Si la entrada declara un ancla REAL (id de sección), salta a ella tras
        // dejar que la pestaña destino pinte. Respeta prefers-reduced-motion.
        if (entry.anchor && typeof window !== "undefined") {
            const anchor = entry.anchor;
            window.setTimeout(() => {
                const el = document.getElementById(anchor);
                if (!el) return;
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
            }, 120);
        }
    }

    function clearSearch() {
        setQuery("");
        setOpen(false);
    }

    return (
        <div ref={containerRef} className={cn("relative w-full", className)}>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="Buscar en Ajustes… (p. ej. voz, Trinity, privacidad, export)"
                    aria-label="Buscar en Ajustes"
                    className="ss-crystal h-11 w-full rounded-full border-0 bg-transparent pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-text"
                />
                {query && (
                    <button
                        type="button"
                        onClick={clearSearch}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors cursor-pointer"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {open && q && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                    {results.length === 0 ? (
                        <div className="p-6 text-center">
                            <p className="text-sm text-muted-foreground">
                                No se encontraron ajustes para «{query}».
                            </p>
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="mt-2 text-xs font-medium text-primary hover:underline cursor-pointer"
                            >
                                Limpiar búsqueda
                            </button>
                        </div>
                    ) : (
                        <ul className="p-1.5 space-y-0.5">
                            {results.map((entry) => {
                                const Icon = entry.icon;
                                return (
                                    <li key={entry.id}>
                                        <button
                                            type="button"
                                            onClick={() => selectEntry(entry)}
                                            className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left hover:bg-foreground/[0.06] transition-colors cursor-pointer group"
                                        >
                                            <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0 bg-primary/10 border border-primary/20 text-primary">
                                                <Icon className="w-4 h-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-medium text-foreground truncate">{entry.label}</p>
                                                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-foreground/[0.06] text-muted-foreground border border-border/40">
                                                        {entry.category}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{entry.description}</p>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="border-t border-white/10 px-3 py-1.5">
                        <p className="text-[10px] text-muted-foreground">
                            {results.length} de {SETTINGS_SEARCH_INDEX.length} ajustes
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
