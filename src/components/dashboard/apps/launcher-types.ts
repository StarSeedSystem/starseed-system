// ════════════════════════════════════════════════════════════════
// Launcher de apps — tipos y presets
// ----------------------------------------------------------------
// Modelo declarativo de apps/carpetas para el dashboard. Una "app" es
// una Entidad Única del catálogo (Lienzo Universal): las carpetas la
// REFERENCIAN por id, no la copian. La instancia del launcher guarda
// su estado en DashboardWidget.settings (jsonb existente, sin migración).
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";

/** Modos de apertura de una app. La complejidad vive en el sistema (asimetría funcional). */
export type OpenMode =
    | "embed"      // incrustada dentro de la propia tarjeta del dashboard
    | "window"     // ventana flotante del OS (AppWindow, arrastrable)
    | "popup"      // ventana nativa del navegador (window.open con features)
    | "tab"        // pestaña nueva (target=_blank, noopener)
    | "route"      // navegación interna del SOSD (módulos nativos)
    | "installed"; // intenta la PWA/app instalada; si no, cae a 'tab'

export type AppCategory = "starseed" | "sistema" | "media" | "utilidad" | "creacion";

/** 'live' = destino real · 'native' = módulo nativo del OS · 'soon' = en construcción. */
export type AppStatus = "live" | "native" | "soon";

export interface AppOpenSpec {
    /** Modo por defecto al tocar la app. */
    primary: OpenMode;
    /** Modos ofrecidos en el menú contextual de la app. */
    allowed: OpenMode[];
    /** URL externa (embed/window/popup/tab). */
    href?: string;
    /** Ruta interna del SOSD (Next router) para módulos nativos. */
    route?: string;
    /** Si es false, 'embed'/'window' caen automáticamente a 'tab'. */
    embeddable?: boolean;
}

export interface StarseedApp {
    id: string;
    name: string;
    /** Etiqueta corta para iconos pequeños. */
    short?: string;
    description: string;
    icon: LucideIcon;
    /** Icono oficial (imagen en /public). Si está, se usa en vez del Lucide. */
    iconUrl?: string;
    /** Color de acento: token CSS o hex. */
    accent: string;
    category: AppCategory;
    open: AppOpenSpec;
    status?: AppStatus;
    /** Marca apps con modo inmersivo (VR/AR — Fase 3). */
    vrCapable?: boolean;
}

// ── Presets de personalización ───────────────────────────────────
export type IconShape = "squircle" | "circle" | "rounded" | "hex";
export type IconStyle = "glass" | "solid" | "outline" | "gradient";
export type LauncherVariant = "folder" | "single";
export type LauncherDensity = "comfortable" | "compact";
export type LauncherCollection = "starseed" | "sistema" | "media" | "custom";

/**
 * Grupo de apps dentro de una carpeta (categorización). Cada grupo referencia
 * apps por id (Lienzo Universal: no copia, referencia). Permite organizar una
 * carpeta grande en secciones plegables ("Comunicación", "Media", "Sistema"…).
 */
export interface LauncherGroup {
    id: string;
    label: string;
    appIds: string[];
    /** Acento opcional del grupo (token CSS o hex). */
    accent?: string;
    /** Estado plegado del grupo (persistente). */
    collapsed?: boolean;
}

/** Estado persistido de una instancia de launcher (en DashboardWidget.settings). */
export interface AppLauncherSettings {
    variant: LauncherVariant;
    label?: string;
    /** Apps incluidas (orden = orden visual). Vacío → se resuelve por `collection`. */
    appIds: string[];
    collection?: LauncherCollection;
    /** 0 = auto según tamaño del contenedor. */
    columns?: number;
    iconShape?: IconShape;
    iconStyle?: IconStyle;
    density?: LauncherDensity;
    showLabels?: boolean;
    /** Anula open.primary de cada app (modo de apertura global de la carpeta). */
    defaultOpen?: OpenMode;
    // ── Carpeta compacta + expandible (pantalla de inicio tipo móvil/tablet) ──
    /**
     * Carpeta COMPACTA: rejilla densa de iconos (4–8 por hilera según ancho),
     * pensada para ocupar poco y agrupar apps como en un teléfono. Por defecto
     * true cuando la variante es 'folder' (una carpeta clásica del OS). Se puede
     * desactivar para volver a la rejilla amplia con etiquetas grandes.
     */
    compactFolder?: boolean;
    /** Estado expandido/plegado de la carpeta (persistente). Default: false. */
    expanded?: boolean;
    /**
     * Grupos/categorías de apps dentro de la carpeta. Si hay grupos, la carpeta
     * los muestra como secciones plegables (las apps sin grupo van a "General").
     */
    groups?: LauncherGroup[];
    /** Mostrar la carpeta agrupada por categorías (usa `groups`). Default: false. */
    grouped?: boolean;
}

export const DEFAULT_LAUNCHER_SETTINGS: AppLauncherSettings = {
    variant: "folder",
    label: "Apps StarSeed",
    appIds: [],
    collection: "starseed",
    columns: 0,
    iconShape: "squircle",
    iconStyle: "glass",
    density: "comfortable",
    showLabels: true,
    // Por defecto una carpeta es compacta y plegada (como en un teléfono): ocupa
    // poco espacio y se expande al tocarla. Aditivo — instancias existentes sin
    // estos campos heredan estos valores.
    compactFolder: true,
    expanded: false,
    grouped: false,
    groups: [],
};

/**
 * Número de columnas para una carpeta COMPACTA según el ancho disponible (px).
 * Objetivo del OS adaptativo: 4–8 iconos por hilera (móvil → escritorio), sin
 * desperdiciar espacio ni recortar. Se usa cuando `columns` es 0 (auto).
 */
export function compactFolderColumns(width: number): number {
    if (!width || width <= 0) return 4;
    if (width < 220) return 4;
    if (width < 300) return 5;
    if (width < 400) return 6;
    if (width < 520) return 7;
    return 8;
}

/** Clase Tailwind de radio por forma de icono (hex se completa con clip-path inline). */
export const ICON_SHAPE_CLASS: Record<IconShape, string> = {
    squircle: "rounded-[28%]",
    circle: "rounded-full",
    rounded: "rounded-2xl",
    hex: "rounded-[20%]",
};

/** clip-path para la forma hexagonal (se aplica inline solo cuando shape === 'hex'). */
export const HEX_CLIP_PATH =
    "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)";

/** Etiquetas legibles de cada modo (menú contextual). */
export const OPEN_MODE_LABEL: Record<OpenMode, string> = {
    embed: "Aquí mismo",
    window: "Ventana",
    popup: "Ventana emergente",
    tab: "Pestaña nueva",
    route: "Abrir módulo",
    installed: "App instalada",
};

/** Mezcla settings parciales (de la DB) con los valores por defecto. */
export function resolveLauncherSettings(
    raw: Partial<AppLauncherSettings> | undefined | null
): AppLauncherSettings {
    return { ...DEFAULT_LAUNCHER_SETTINGS, ...(raw ?? {}) };
}
