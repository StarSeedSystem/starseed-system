import { WidgetType } from "./dashboard-types";
import { WidgetCategory, WIDGET_CATEGORIES, type WidgetCategoryDef } from "./widget-categories";
import type { LucideIcon } from "lucide-react";

// ── Widget-to-Category Mapping ───────────────────────────────────
export interface WidgetCategoryMapping {
    type: WidgetType;
    primaryCategory: WidgetCategory;
    secondaryCategories: WidgetCategory[];
    tags: string[];
    isPopular?: boolean;
}

export const WIDGET_CATEGORY_MAP: WidgetCategoryMapping[] = [
    // ── Social ──
    { type: 'EXPLORE_NETWORK', primaryCategory: 'social', secondaryCategories: ['red', 'explorador'], tags: ['comunidad', 'explorar', 'red'], isPopular: true },
    { type: 'MY_PAGES', primaryCategory: 'social', secondaryCategories: ['red', 'explorador'], tags: ['páginas', 'comunidades', 'entidades'] },
    { type: 'SOCIAL_RADAR', primaryCategory: 'social', secondaryCategories: ['ubicacion'], tags: ['eventos', 'amigos', 'calendario'] },
    { type: 'MESSAGES', primaryCategory: 'social', secondaryCategories: ['ia'], tags: ['mensajes', 'chat', 'comunicación'], isPopular: true },
    { type: 'NOTIFICATIONS', primaryCategory: 'utilidades', secondaryCategories: ['social', 'sistema'], tags: ['alertas', 'notificaciones', 'avisos'] },

    // ── Political ──
    { type: 'POLITICAL_SUMMARY', primaryCategory: 'politica', secondaryCategories: ['parlamento'], tags: ['propuestas', 'legislación', 'gobernanza'], isPopular: true },
    { type: 'RELEVANT_POSTS', primaryCategory: 'politica', secondaryCategories: ['social', 'cultura'], tags: ['publicaciones', 'trending', 'destacado'] },

    // ── Education ──
    { type: 'LEARNING_PATH', primaryCategory: 'educacion', secondaryCategories: [], tags: ['cursos', 'progreso', 'habilidades'] },

    // ── Culture / Art ──
    { type: 'CULTURAL_FEED', primaryCategory: 'cultura', secondaryCategories: ['arte'], tags: ['arte', 'expresión', 'manifiesto', 'feed'], isPopular: true },

    // ── Economy ──
    { type: 'ECONOMIC_OVERVIEW', primaryCategory: 'economia', secondaryCategories: [], tags: ['seeds', 'karma', 'finanzas', 'recursos'], isPopular: true },
    { type: 'CALCULATOR', primaryCategory: 'utilidades', secondaryCategories: ['economia'], tags: ['calculadora', 'matemáticas', 'herramienta'] },

    // ── Productivity ──
    { type: 'COLLAB_PROJECTS', primaryCategory: 'productividad', secondaryCategories: [], tags: ['proyectos', 'equipo', 'tareas'] },
    { type: 'ACTIVE_PROJECTS', primaryCategory: 'productividad', secondaryCategories: [], tags: ['proyectos', 'activo', 'sprint'] },
    { type: 'RECENT_ACTIVITY', primaryCategory: 'productividad', secondaryCategories: ['social'], tags: ['actividad', 'historial', 'reciente'] },

    // ── Climate / Weather ──
    { type: 'WEATHER_BASIC', primaryCategory: 'clima', secondaryCategories: ['ubicacion'], tags: ['clima', 'resumen', 'básico'] },
    { type: 'WEATHER_HOLISTIC', primaryCategory: 'clima', secondaryCategories: ['astronomia'], tags: ['clima', '3D', 'esfera', 'holístico'], isPopular: true },
    { type: 'WEATHER_TEMPERATURE', primaryCategory: 'clima', secondaryCategories: [], tags: ['temperatura', 'celsius', 'térmico'] },
    { type: 'WEATHER_WIND', primaryCategory: 'clima', secondaryCategories: [], tags: ['viento', 'velocidad', 'dirección'] },
    { type: 'WEATHER_HUMIDITY', primaryCategory: 'clima', secondaryCategories: [], tags: ['humedad', 'saturación'] },
    { type: 'WEATHER_UV', primaryCategory: 'clima', secondaryCategories: [], tags: ['uv', 'radiación', 'solar'] },
    { type: 'WEATHER_AIR_QUALITY', primaryCategory: 'clima', secondaryCategories: ['ubicacion'], tags: ['aire', 'aqi', 'pm2.5', 'contaminación'] },
    { type: 'WEATHER_ASTRONOMY', primaryCategory: 'astronomia', secondaryCategories: ['clima'], tags: ['luna', 'sol', 'fases', 'astronómico'] },

    // ── Space Weather ──
    { type: 'WEATHER_SPACE_SOLAR', primaryCategory: 'astronomia', secondaryCategories: ['clima'], tags: ['viento solar', 'densidad', 'velocidad'] },
    { type: 'WEATHER_SPACE_SCHUMANN', primaryCategory: 'astronomia', secondaryCategories: ['clima'], tags: ['schumann', 'frecuencia', 'resonancia'] },
    { type: 'WEATHER_SPACE_KP', primaryCategory: 'astronomia', secondaryCategories: ['clima'], tags: ['kp', 'geomagnético', 'tormenta'] },
    { type: 'WEATHER_SPACE_MAGNETOMETER', primaryCategory: 'astronomia', secondaryCategories: ['clima'], tags: ['magnetómetro', 'campo magnético'] },
    { type: 'WEATHER_SPACE_FLARE', primaryCategory: 'astronomia', secondaryCategories: ['clima'], tags: ['llamarada', 'rayos x', 'erupción solar'] },

    // ── System ──
    { type: 'SYSTEM_STATUS', primaryCategory: 'sistema', secondaryCategories: ['red'], tags: ['sistema', 'monitor', 'recursos', 'hardware'], isPopular: true },
    { type: 'LIVE_DATA', primaryCategory: 'sistema', secondaryCategories: ['red'], tags: ['telemetría', 'nodos', 'tiempo real'] },

    // ── Personalization ──
    { type: 'THEME_SELECTOR', primaryCategory: 'personalizacion', secondaryCategories: [], tags: ['tema', 'apariencia', 'selector'] },
    { type: 'THEME_MANAGER', primaryCategory: 'personalizacion', secondaryCategories: [], tags: ['tema', 'gestión', 'canvas'] },

    // ── AI ──
    { type: 'NEXUS_QUICK_ACCESS', primaryCategory: 'ia', secondaryCategories: ['productividad'], tags: ['nexus', 'exocortex', 'ia', 'agente'], isPopular: true },
    { type: 'AI_GENERATED', primaryCategory: 'ia', secondaryCategories: ['ciberdelia', 'personalizacion'], tags: ['ia', 'generado', 'forge', 'stitch', 'gemini', 'personalizado'] },

    // ── Wellness ──
    { type: 'WELLNESS', primaryCategory: 'social', secondaryCategories: ['utilidades'], tags: ['bienestar', 'salud', 'coherencia'] },
];

// ── Helper functions ─────────────────────────────────────────────
export function getWidgetsByCategory(categoryId: WidgetCategory): WidgetCategoryMapping[] {
    return WIDGET_CATEGORY_MAP.filter(
        w => w.primaryCategory === categoryId || w.secondaryCategories.includes(categoryId)
    );
}

export function getWidgetPrimaryCategory(type: WidgetType): WidgetCategory | undefined {
    return WIDGET_CATEGORY_MAP.find(w => w.type === type)?.primaryCategory;
}

export function searchWidgets(query: string): WidgetCategoryMapping[] {
    const q = query.toLowerCase().trim();
    if (!q) return WIDGET_CATEGORY_MAP;
    return WIDGET_CATEGORY_MAP.filter(w =>
        w.type.toLowerCase().includes(q) ||
        w.tags.some(t => t.includes(q)) ||
        w.primaryCategory.includes(q) ||
        w.secondaryCategories.some(c => c.includes(q))
    );
}

// ── Default Dashboard Templates ──────────────────────────────────
export interface DefaultDashboardTemplate {
    categoryId: WidgetCategory;
    name: string;
    isDefault?: boolean;  // Only one should be true (the first dashboard for new users)
    widgets: { type: WidgetType; w: number; h: number; x: number; y: number }[];
}

export const DEFAULT_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    // ─── 1. Social (DEFAULT) ─────────────────────────────────
    {
        categoryId: 'social',
        name: 'Social',
        isDefault: true,
        widgets: [
            { type: 'EXPLORE_NETWORK', w: 7, h: 4, x: 0, y: 0 },
            { type: 'MESSAGES', w: 5, h: 4, x: 7, y: 0 },
            { type: 'MY_PAGES', w: 4, h: 3, x: 0, y: 4 },
            { type: 'SOCIAL_RADAR', w: 4, h: 3, x: 4, y: 4 },
            { type: 'NOTIFICATIONS', w: 4, h: 3, x: 8, y: 4 },
        ],
    },
    // ─── 2. Política ─────────────────────────────────────────
    {
        categoryId: 'politica',
        name: 'Política',
        widgets: [
            { type: 'POLITICAL_SUMMARY', w: 8, h: 4, x: 0, y: 0 },
            { type: 'NOTIFICATIONS', w: 4, h: 4, x: 8, y: 0 },
            { type: 'RELEVANT_POSTS', w: 12, h: 3, x: 0, y: 4 },
        ],
    },
    // ─── 3. Educación ────────────────────────────────────────
    {
        categoryId: 'educacion',
        name: 'Educación',
        widgets: [
            { type: 'LEARNING_PATH', w: 8, h: 4, x: 0, y: 0 },
            { type: 'ACTIVE_PROJECTS', w: 4, h: 4, x: 8, y: 0 },
        ],
    },
    // ─── 4. Cultura ──────────────────────────────────────────
    {
        categoryId: 'cultura',
        name: 'Cultura',
        widgets: [
            { type: 'CULTURAL_FEED', w: 8, h: 5, x: 0, y: 0 },
            { type: 'RELEVANT_POSTS', w: 4, h: 5, x: 8, y: 0 },
        ],
    },
    // ─── 5. Economía ─────────────────────────────────────────
    {
        categoryId: 'economia',
        name: 'Economía',
        widgets: [
            { type: 'ECONOMIC_OVERVIEW', w: 8, h: 4, x: 0, y: 0 },
            { type: 'CALCULATOR', w: 4, h: 4, x: 8, y: 0 },
            { type: 'ACTIVE_PROJECTS', w: 12, h: 3, x: 0, y: 4 },
        ],
    },
    // ─── 6. Clima ────────────────────────────────────────────
    {
        categoryId: 'clima',
        name: 'Clima',
        widgets: [
            { type: 'WEATHER_SPACE_SOLAR', w: 4, h: 4, x: 0, y: 0 },
            { type: 'WEATHER_HOLISTIC', w: 4, h: 8, x: 4, y: 0 },
            { type: 'WEATHER_SPACE_SCHUMANN', w: 4, h: 4, x: 8, y: 0 },
            { type: 'WEATHER_ASTRONOMY', w: 4, h: 2, x: 0, y: 4 },
            { type: 'WEATHER_WIND', w: 4, h: 2, x: 8, y: 4 },
            { type: 'WEATHER_TEMPERATURE', w: 2, h: 2, x: 0, y: 6 },
            { type: 'WEATHER_HUMIDITY', w: 2, h: 2, x: 2, y: 6 },
            { type: 'WEATHER_UV', w: 4, h: 2, x: 8, y: 6 },
            { type: 'WEATHER_AIR_QUALITY', w: 12, h: 2, x: 0, y: 8 },
        ],
    },
    // ─── 7. Productividad ────────────────────────────────────
    {
        categoryId: 'productividad',
        name: 'Productividad',
        widgets: [
            { type: 'COLLAB_PROJECTS', w: 8, h: 4, x: 0, y: 0 },
            { type: 'CALCULATOR', w: 4, h: 4, x: 8, y: 0 },
            { type: 'ACTIVE_PROJECTS', w: 6, h: 3, x: 0, y: 4 },
            { type: 'RECENT_ACTIVITY', w: 6, h: 3, x: 6, y: 4 },
        ],
    },
    // ─── 8. Ubicación ────────────────────────────────────────
    {
        categoryId: 'ubicacion',
        name: 'Ubicación',
        widgets: [
            { type: 'WEATHER_BASIC', w: 6, h: 4, x: 0, y: 0 },
            { type: 'WEATHER_AIR_QUALITY', w: 6, h: 4, x: 6, y: 0 },
        ],
    },
    // ─── 9. Utilidades ───────────────────────────────────────
    {
        categoryId: 'utilidades',
        name: 'Utilidades',
        widgets: [
            { type: 'CALCULATOR', w: 4, h: 4, x: 0, y: 0 },
            { type: 'NOTIFICATIONS', w: 4, h: 4, x: 4, y: 0 },
            { type: 'SYSTEM_STATUS', w: 4, h: 4, x: 8, y: 0 },
        ],
    },
    // ─── 10. Arte ────────────────────────────────────────────
    {
        categoryId: 'arte',
        name: 'Arte',
        widgets: [
            { type: 'CULTURAL_FEED', w: 12, h: 5, x: 0, y: 0 },
        ],
    },
    // ─── 11. Astronomía ──────────────────────────────────────
    {
        categoryId: 'astronomia',
        name: 'Astronomía',
        widgets: [
            { type: 'WEATHER_HOLISTIC', w: 4, h: 6, x: 4, y: 0 },
            { type: 'WEATHER_ASTRONOMY', w: 4, h: 3, x: 0, y: 0 },
            { type: 'WEATHER_SPACE_SOLAR', w: 4, h: 3, x: 8, y: 0 },
            { type: 'WEATHER_SPACE_KP', w: 4, h: 3, x: 0, y: 3 },
            { type: 'WEATHER_SPACE_FLARE', w: 4, h: 3, x: 8, y: 3 },
            { type: 'WEATHER_SPACE_MAGNETOMETER', w: 6, h: 3, x: 0, y: 6 },
            { type: 'WEATHER_SPACE_SCHUMANN', w: 6, h: 3, x: 6, y: 6 },
        ],
    },
    // ─── 12. Sistema ─────────────────────────────────────────
    {
        categoryId: 'sistema',
        name: 'Sistema',
        widgets: [
            { type: 'SYSTEM_STATUS', w: 12, h: 4, x: 0, y: 0 },
            { type: 'LIVE_DATA', w: 8, h: 3, x: 0, y: 4 },
            { type: 'NOTIFICATIONS', w: 4, h: 3, x: 8, y: 4 },
        ],
    },
    // ─── 13. Personalización ─────────────────────────────────
    {
        categoryId: 'personalizacion',
        name: 'Personalización',
        widgets: [
            { type: 'THEME_SELECTOR', w: 6, h: 4, x: 0, y: 0 },
            { type: 'THEME_MANAGER', w: 6, h: 4, x: 6, y: 0 },
        ],
    },
    // ─── 14. IA ──────────────────────────────────────────────
    {
        categoryId: 'ia',
        name: 'IA',
        widgets: [
            { type: 'NEXUS_QUICK_ACCESS', w: 8, h: 5, x: 0, y: 0 },
            { type: 'MESSAGES', w: 4, h: 5, x: 8, y: 0 },
        ],
    },
    // ─── 15. Parlamento ──────────────────────────────────────
    {
        categoryId: 'parlamento',
        name: 'Parlamento',
        widgets: [
            { type: 'POLITICAL_SUMMARY', w: 12, h: 4, x: 0, y: 0 },
            { type: 'RELEVANT_POSTS', w: 12, h: 3, x: 0, y: 4 },
        ],
    },
    // ─── 16. Red ─────────────────────────────────────────────
    {
        categoryId: 'red',
        name: 'Red',
        widgets: [
            { type: 'EXPLORE_NETWORK', w: 8, h: 4, x: 0, y: 0 },
            { type: 'LIVE_DATA', w: 4, h: 4, x: 8, y: 0 },
            { type: 'MY_PAGES', w: 12, h: 3, x: 0, y: 4 },
        ],
    },
    // ─── 17. Explorador ──────────────────────────────────────
    {
        categoryId: 'explorador',
        name: 'Explorador',
        widgets: [
            { type: 'EXPLORE_NETWORK', w: 7, h: 5, x: 0, y: 0 },
            { type: 'MY_PAGES', w: 5, h: 5, x: 7, y: 0 },
            { type: 'SOCIAL_RADAR', w: 12, h: 3, x: 0, y: 5 },
        ],
    },
];

// Templates for categories that don't have widgets yet (shown in create dialog)
export const FUTURE_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    { categoryId: 'astrologia', name: 'Astrología', widgets: [] },
    { categoryId: 'archivos', name: 'Archivos', widgets: [] },
    { categoryId: 'entretenimiento', name: 'Entretenimiento', widgets: [] },
    { categoryId: 'ayudantia', name: 'Ayudantía', widgets: [] },
    { categoryId: 'ciberdelia', name: 'Ciberdelia', widgets: [] },
    { categoryId: 'descubrimientos', name: 'Descubrimientos', widgets: [] },
];

// All templates combined (for the create-dashboard dialog)
export const ALL_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    ...DEFAULT_DASHBOARD_TEMPLATES,
    ...FUTURE_DASHBOARD_TEMPLATES,
];

// Get template by category ID
export function getTemplateByCategory(categoryId: WidgetCategory): DefaultDashboardTemplate | undefined {
    return ALL_DASHBOARD_TEMPLATES.find(t => t.categoryId === categoryId);
}
