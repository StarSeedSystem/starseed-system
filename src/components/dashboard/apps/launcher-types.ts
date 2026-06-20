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
};

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
