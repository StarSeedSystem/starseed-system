import { WidgetType } from "./dashboard-types";
import { WidgetCategory, WIDGET_CATEGORIES, type WidgetCategoryDef } from "./widget-categories";
import type { LucideIcon } from "lucide-react";
import { dimsForSize, type WidgetSize } from "./dashboard-size";

// ── Widget-to-Category Mapping ───────────────────────────────────
export interface WidgetCategoryMapping {
    type: WidgetType;
    primaryCategory: WidgetCategory;
    secondaryCategories: WidgetCategory[];
    tags: string[];
    isPopular?: boolean;
}

export const WIDGET_CATEGORY_MAP: WidgetCategoryMapping[] = [
    // ── Aplicaciones (launcher) ──
    { type: 'APP_LAUNCHER', primaryCategory: 'aplicaciones', secondaryCategories: ['sistema', 'entretenimiento'], tags: ['apps', 'launcher', 'folder', 'carpeta', 'programas', 'inicio', 'nexus', 'café', 'audiomorphic', 'omnifrecuencias', 'pantalla de inicio'], isPopular: true },
    { type: 'UNIVERSAL_OPENER', primaryCategory: 'aplicaciones', secondaryCategories: ['archivos', 'sistema'], tags: ['abridor', 'archivos', 'visor', 'pdf', 'imagen', 'vídeo', 'audio', '3d', 'html', 'markdown', 'biblioteca', 'universal'], isPopular: true },

    // ── Media center ──
    { type: 'MUSIC_PLAYER', primaryCategory: 'entretenimiento', secondaryCategories: ['cultura'], tags: ['musica', 'reproductor', 'audio', 'biblioteca', 'media', 'player', 'spotify', 'sonido'], isPopular: true },
    { type: 'OMNIFRECUENCIAS', primaryCategory: 'entretenimiento', secondaryCategories: ['ayudantia', 'astrologia'], tags: ['frecuencias', '432', '528', 'solfeggio', 'schumann', 'binaural', 'meditación', 'sonido', 'omnifrecuencias'], isPopular: true },
    { type: 'RADIO_LIVE', primaryCategory: 'entretenimiento', secondaryCategories: ['cultura'], tags: ['radio', 'stream', 'emisoras', 'somafm', 'en vivo', 'ambient', 'audio'] },
    { type: 'AUDIOMORPHIC_BG', primaryCategory: 'entretenimiento', secondaryCategories: ['personalizacion', 'ciberdelia'], tags: ['audiomorphic', 'fondo', 'visualizador', 'apariencia', 'background', 'reactivo', 'vr'], isPopular: true },
    { type: 'MEDIA_CONTROL', primaryCategory: 'entretenimiento', secondaryCategories: ['personalizacion', 'sistema'], tags: ['media', 'audio', 'control', 'volumen', 'salida', 'radio', 'audiomorphic', 'reproductor'], isPopular: true },

    // ── Datos oficiales en tiempo real ──
    { type: 'OFFICIAL_DATA', primaryCategory: 'descubrimientos', secondaryCategories: ['sistema', 'clima'], tags: ['datos', 'tiempo real', 'oficial', 'clima', 'sismos', 'espacio', 'noaa', 'usgs', 'open-meteo', 'ajustable'], isPopular: true },
    { type: 'SPACE_WEATHER', primaryCategory: 'astronomia', secondaryCategories: ['clima', 'descubrimientos'], tags: ['clima espacial', 'noaa', 'kp', 'viento solar', 'llamaradas', 'aurora', 'schumann', 'tiempo real'], isPopular: true },
    { type: 'IMMERSIVE', primaryCategory: 'ciberdelia', secondaryCategories: ['entretenimiento', 'sistema'], tags: ['vr', 'ar', 'webxr', 'inmersivo', '3d', 'portales', 'multiverso', 'xr'], isPopular: true },

    // ── Segunda generación (gen2) ──
    { type: 'AGORA_CAUSAL', primaryCategory: 'politica', secondaryCategories: ['parlamento', 'social'], tags: ['ágora', 'propuestas', 'votación', 'causal', 'deliberación', 'ontocracia'], isPopular: true },
    { type: 'LIQUID_DELEGATION', primaryCategory: 'politica', secondaryCategories: ['parlamento'], tags: ['delegación', 'voto líquido', 'representación', 'confianza', 'ontocracia'] },
    { type: 'OIKOS_METABOLISM', primaryCategory: 'economia', secondaryCategories: ['sistema', 'clima'], tags: ['oikos', 'metabolismo', 'energía', 'flujo', 'recursos', 'excedente'], isPopular: true },
    { type: 'SKILL_TREE', primaryCategory: 'educacion', secondaryCategories: ['productividad'], tags: ['árbol', 'habilidades', 'progreso', 'misiones', 'maestría'], isPopular: true },
    { type: 'ASTRAURA_CORTEX', primaryCategory: 'ia', secondaryCategories: ['productividad', 'sistema'], tags: ['astraura', 'córtex', 'exocortex', 'cognición', 'agente', 'sugerencias'], isPopular: true },
    { type: 'SOVEREIGN_NODE', primaryCategory: 'sistema', secondaryCategories: ['red'], tags: ['nodo', 'soberano', 'cpu', 'ram', 'hardware', 'salud'] },
    { type: 'AKASHIC_CODEX', primaryCategory: 'archivos', secondaryCategories: ['red', 'sistema'], tags: ['códice', 'akáshico', 'archivos', 'entidades', 'ipfs', 'redundancia'], isPopular: true },
    { type: 'NATAL_CHART', primaryCategory: 'astrologia', secondaryCategories: ['astronomia'], tags: ['carta natal', 'tránsitos', 'sincronía', 'zodíaco', 'coherencia'], isPopular: true },
    { type: 'MESH_RADAR', primaryCategory: 'red', secondaryCategories: ['sistema'], tags: ['mesh', 'radar', 'topología', 'nodos', 'malla', 'conectividad'] },
    { type: 'INTERNET_RADAR', primaryCategory: 'red', secondaryCategories: ['sistema'], tags: ['internet', 'radar', 'bandas', 'antenas', 'sináptica', 'nodos', 'servidores', 'transmisión', 'conexiones', 'wifi'], isPopular: true },
    { type: 'IMMERSION_PORTAL', primaryCategory: 'entretenimiento', secondaryCategories: ['cultura', 'ciberdelia'], tags: ['portal', 'inmersión', 'multiverso', 'vr', 'ar', 'mundos'], isPopular: true },

    // ── Cuarta generación (gen4) ──
    { type: 'ELDER_COUNCIL', primaryCategory: 'politica', secondaryCategories: ['parlamento', 'social'], tags: ['consejo', 'sabios', 'meritocracia', 'insignias', 'ontocracia', 'delegación'], isPopular: true },
    { type: 'RESTORATIVE_COURT', primaryCategory: 'politica', secondaryCategories: ['social'], tags: ['justicia', 'restaurativa', 'mediación', 'círculos de paz', 'conflicto'] },
    { type: 'BARTER_MARKET', primaryCategory: 'economia', secondaryCategories: ['social', 'ubicacion'], tags: ['trueque', 'mercado', 'intercambio', 'don', 'oikos'], isPopular: true },
    { type: 'ENERGY_GRID', primaryCategory: 'economia', secondaryCategories: ['sistema', 'clima'], tags: ['energía', 'microred', 'solar', 'procomún', 'oikos'], isPopular: true },
    { type: 'MENTOR_MATCH', primaryCategory: 'educacion', secondaryCategories: ['social', 'ia'], tags: ['mentoría', 'tutor', 'híbrido', 'aprendizaje', 'maestría'] },
    { type: 'UNIVERSAL_LIBRARY', primaryCategory: 'educacion', secondaryCategories: ['archivos', 'cultura'], tags: ['biblioteca', 'conocimiento', 'cursos', 'procomún', 'lienzo universal'], isPopular: true },
    { type: 'MULTIVERSE_HUB', primaryCategory: 'cultura', secondaryCategories: ['entretenimiento', 'ciberdelia'], tags: ['multiverso', 'vr', 'ar', 'mundos', 'inmersión'], isPopular: true },
    { type: 'CREATIVE_STUDIO', primaryCategory: 'cultura', secondaryCategories: ['arte'], tags: ['estudio', 'creación', 'arte', 'música', 'colaboración'] },
    { type: 'ORACLE_PREDICT', primaryCategory: 'ia', secondaryCategories: ['descubrimientos', 'productividad'], tags: ['oráculo', 'predicción', 'escenarios', 'exocortex', 'probabilidad'], isPopular: true },
    { type: 'IDENTITY_VAULT', primaryCategory: 'sistema', secondaryCategories: ['personalizacion'], tags: ['identidad', 'soberanía', 'privacidad', 'criptografía', 'zk', 'perfiles'] },
    { type: 'ENERGY_MAP', primaryCategory: 'astrologia', secondaryCategories: ['ayudantia', 'astronomia'], tags: ['energía', 'chakras', 'biorritmo', 'coherencia', 'cósmico'] },

    // ── Quinta generación (gen5) ──
    { type: 'FLOW_DIRECTOR', primaryCategory: 'productividad', secondaryCategories: ['ayudantia', 'ia'], tags: ['flujo', 'energía', 'circadiano', 'enfoque', 'productividad', 'télico'], isPopular: true },
    { type: 'PROJECT_SWARM', primaryCategory: 'productividad', secondaryCategories: ['social'], tags: ['proyectos', 'enjambre', 'kanban', 'tareas', 'nodos', 'impacto'], isPopular: true },
    { type: 'ABUNDANCE_RADAR', primaryCategory: 'ubicacion', secondaryCategories: ['economia', 'social'], tags: ['recursos', 'abundancia', 'mapa', 'proximidad', 'oikos', 'libre'], isPopular: true },
    { type: 'TRANSIT_FLOW', primaryCategory: 'ubicacion', secondaryCategories: ['sistema'], tags: ['tránsito', 'movilidad', 'vehículos', 'drones', 'transporte'] },
    { type: 'MAP_LOCATION', primaryCategory: 'ubicacion', secondaryCategories: ['descubrimientos', 'explorador'], tags: ['mapa', 'openstreetmap', 'osm', 'ubicación', 'geolocalización', 'leaflet'], isPopular: true },
    { type: 'CRYPTO_SHIELD', primaryCategory: 'privacidad', secondaryCategories: ['sistema', 'red'], tags: ['privacidad', 'criptografía', 'rastreadores', 'cebolla', 'soberanía'], isPopular: true },
    { type: 'HABITAT_CORE', primaryCategory: 'dispositivos', secondaryCategories: ['clima', 'sistema'], tags: ['domótica', 'hogar', 'clima', 'robots', 'circadiano', 'hábitat'], isPopular: true },
    { type: 'SERENDIPITY_LENS', primaryCategory: 'descubrimientos', secondaryCategories: ['cultura', 'explorador'], tags: ['serendipia', 'descubrir', 'inesperado', 'sincronía', 'asombro'], isPopular: true },
    { type: 'IDEA_FORGE', primaryCategory: 'creatividad', secondaryCategories: ['ia', 'educacion'], tags: ['ideas', 'quimeras', 'colisión', 'creatividad', 'invención', 'brainstorming'] },
    { type: 'MERIT_GALLERY', primaryCategory: 'perfil', secondaryCategories: ['economia', 'educacion'], tags: ['mérito', 'huella', 'insignias', 'reputación', 'legado', 'confianza'], isPopular: true },
    { type: 'SOCIETY_PULSE', primaryCategory: 'sociedad', secondaryCategories: ['economia', 'clima'], tags: ['sociedad', 'cohesión', 'armonía', 'biorregiones', 'pulso'] },

    // ── Social ──
    { type: 'EXPLORE_NETWORK', primaryCategory: 'social', secondaryCategories: ['red', 'explorador'], tags: ['comunidad', 'explorar', 'red'], isPopular: true },
    { type: 'MY_PAGES', primaryCategory: 'social', secondaryCategories: ['red', 'explorador'], tags: ['páginas', 'comunidades', 'entidades'] },
    { type: 'SOCIAL_RADAR', primaryCategory: 'social', secondaryCategories: ['ubicacion'], tags: ['eventos', 'amigos', 'calendario'] },
    { type: 'MESSAGES', primaryCategory: 'social', secondaryCategories: ['ia'], tags: ['mensajes', 'chat', 'comunicación'], isPopular: true },
    { type: 'NOTIFICATIONS', primaryCategory: 'utilidades', secondaryCategories: ['social', 'sistema'], tags: ['alertas', 'notificaciones', 'avisos'] },
    { type: 'QUICK_ACCESS', primaryCategory: 'utilidades', secondaryCategories: ['sistema', 'social', 'productividad'], tags: ['accesos', 'rapidos', 'lanzadera', 'atajos', 'navegacion', 'inicio'], isPopular: true },
    { type: 'ACTIVITY_SUMMARY', primaryCategory: 'productividad', secondaryCategories: ['social', 'sistema'], tags: ['actividad', 'resumen', 'metricas', 'pulso', 'estadisticas', 'agregados'], isPopular: true },

    // ── Political ──
    { type: 'POLITICAL_SUMMARY', primaryCategory: 'politica', secondaryCategories: ['parlamento'], tags: ['propuestas', 'legislación', 'gobernanza'], isPopular: true },
    { type: 'RELEVANT_POSTS', primaryCategory: 'politica', secondaryCategories: ['social', 'cultura'], tags: ['publicaciones', 'trending', 'destacado'] },

    // ── Education ──
    { type: 'LEARNING_PATH', primaryCategory: 'educacion', secondaryCategories: [], tags: ['cursos', 'progreso', 'habilidades'] },

    // ── Culture / Art ──
    { type: 'CULTURAL_FEED', primaryCategory: 'cultura', secondaryCategories: ['arte'], tags: ['arte', 'expresión', 'manifiesto', 'feed'], isPopular: true },

    // ── Economy ──
    { type: 'ECONOMIC_OVERVIEW', primaryCategory: 'economia', secondaryCategories: [], tags: ['seeds', 'karma', 'finanzas', 'recursos'], isPopular: true },
    { type: 'CARTERA_STARSEED', primaryCategory: 'economia', secondaryCategories: ['perfil'], tags: ['cartera', 'semillas', 'granos', 'bolsa', 'mercado', 'wallet'] },
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

    // ── Áreas del SOSD con datos reales en vivo ──
    { type: 'MY_EVENTS', primaryCategory: 'social', secondaryCategories: ['explorador'], tags: ['eventos', 'agenda', 'encuentros', 'asambleas', 'talleres', 'calendario', 'real'], isPopular: true },
    { type: 'MY_GROUPS', primaryCategory: 'social', secondaryCategories: ['red'], tags: ['grupos', 'colectivos', 'círculos', 'asambleas', 'membresías', 'comunidad', 'real'], isPopular: true },
    { type: 'COMMUNITIES', primaryCategory: 'social', secondaryCategories: ['explorador', 'red'], tags: ['comunidades', 'sanghas', 'biorregiones', 'colectivos', 'red social', 'real'], isPopular: true },
    { type: 'FEDERATED_ENTITIES', primaryCategory: 'red', secondaryCategories: ['social', 'explorador'], tags: ['entidades', 'instituciones', 'federación', 'proyectos', 'red', 'real'] },
    { type: 'MEMORIES', primaryCategory: 'archivos', secondaryCategories: ['ia'], tags: ['memorias', 'exocortex', 'notas', 'conocimiento', 'personal', 'real'] },
    { type: 'BRAINS', primaryCategory: 'ia', secondaryCategories: ['sistema'], tags: ['cerebros', 'ia', 'contexto', 'exocortex', 'servidores', 'real'] },
    { type: 'VAULTS', primaryCategory: 'sistema', secondaryCategories: ['archivos', 'privacidad'], tags: ['baúles', 'almacenamiento', 'soberano', 'conexiones', 'datos', 'real'] },
    { type: 'DOCUMENTS', primaryCategory: 'archivos', secondaryCategories: ['sistema'], tags: ['archivos', 'documentos', 'almacenes', 'ficheros', 'real'] },
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
    widgets: { type: WidgetType; w: number; h: number; x: number; y: number; settings?: Record<string, any>; size?: WidgetSize }[];
}

/** Atajo: construye una entrada de widget a partir de su talla S/M/L/XL
 *  (ver dashboard-size.ts), recortada a los mínimos del widget-manifest. El
 *  `size` viaja con la entrada para que el widget sembrado ya lo declare. */
function sz(type: WidgetType, size: WidgetSize, x: number, y: number, settings?: Record<string, any>) {
    const { w, h } = dimsForSize(type, size);
    return { type, w, h, x, y, size, ...(settings ? { settings } : {}) };
}

const BASE_DEFAULT_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    // ─── 1. Dashboards / Inicio (DEFAULT) ─────────────────────
    // Rediseño (gen11 · migración de cabecera+plantillas+tamaños): composición
    // curada con jerarquía clara en 3 franjas — 1) orientación (reloj + agenda,
    // ambos L, lado a lado); 2) utilidades de un vistazo (clima/tareas/accesos,
    // M+M+S); 3) el feed de la Red como ancla de contenido al final (XL, ancho
    // completo). El dock de apps StarSeed se añade solo (withSeededExtras) —
    // no hace falta declararlo aquí.
    {
        categoryId: 'social',
        name: 'Inicio',
        isDefault: true,
        widgets: [
            // Orientación: hora/fecha + próximos eventos (12 = 6+6, fila completa).
            sz('CLOCK_DATE', 'L', 0, 0),
            sz('MY_EVENTS', 'L', 6, 0),

            // Utilidades de un vistazo: clima, tareas rápidas, accesos directos.
            sz('WEATHER_BASIC', 'M', 0, 5),
            sz('TASKS_QUICK', 'M', 4, 5),
            sz('QUICK_ACCESS', 'S', 8, 5),

            // Red sináptica (Adenda 99): radar de internet — neuronas cercanas en
            // línea, bandas/antenas en uso con configs rápidas e indicadores de
            // transmisión. Predeterminado, banda propia bajo las utilidades.
            { type: 'INTERNET_RADAR', w: 12, h: 5, x: 0, y: 9 },

            // Feed de la Red: ancla de contenido, ancho completo, al final.
            sz('NETWORK_FEED_MINI', 'XL', 0, 14),
        ],
    },
    // ─── 2. Política ─────────────────────────────────────────
    {
        categoryId: 'politica',
        name: 'Política',
        widgets: [
            { type: 'AGORA_CAUSAL', w: 5, h: 5, x: 0, y: 0 },
            { type: 'POLITICAL_SUMMARY', w: 4, h: 5, x: 5, y: 0 },
            { type: 'LIQUID_DELEGATION', w: 3, h: 5, x: 9, y: 0 },
            { type: 'ELDER_COUNCIL', w: 4, h: 4, x: 0, y: 5 },
            { type: 'RESTORATIVE_COURT', w: 4, h: 5, x: 4, y: 5 },
            { type: 'RELEVANT_POSTS', w: 4, h: 5, x: 8, y: 5 },
        ],
    },
    // ─── 3. Educación ────────────────────────────────────────
    {
        categoryId: 'educacion',
        name: 'Educación',
        widgets: [
            { type: 'SKILL_TREE', w: 5, h: 5, x: 0, y: 0 },
            { type: 'LEARNING_PATH', w: 4, h: 5, x: 5, y: 0 },
            { type: 'ACTIVE_PROJECTS', w: 3, h: 5, x: 9, y: 0 },
            { type: 'UNIVERSAL_LIBRARY', w: 5, h: 5, x: 0, y: 5 },
            { type: 'MENTOR_MATCH', w: 4, h: 4, x: 5, y: 5 },
        ],
    },
    // ─── 4. Cultura ──────────────────────────────────────────
    {
        categoryId: 'cultura',
        name: 'Cultura',
        widgets: [
            { type: 'CULTURAL_FEED', w: 8, h: 5, x: 0, y: 0 },
            { type: 'IMMERSION_PORTAL', w: 4, h: 5, x: 8, y: 0 },
            { type: 'MULTIVERSE_HUB', w: 4, h: 5, x: 0, y: 5 },
            { type: 'CREATIVE_STUDIO', w: 4, h: 4, x: 4, y: 5 },
            { type: 'RELEVANT_POSTS', w: 4, h: 5, x: 8, y: 5 },
        ],
    },
    // ─── 5. Economía ─────────────────────────────────────────
    {
        categoryId: 'economia',
        name: 'Economía',
        widgets: [
            { type: 'CARTERA_STARSEED', w: 5, h: 7, x: 0, y: 0 },
            { type: 'ECONOMIC_OVERVIEW', w: 4, h: 5, x: 5, y: 0 },
            { type: 'CALCULATOR', w: 3, h: 5, x: 9, y: 0 },
            { type: 'OIKOS_METABOLISM', w: 5, h: 5, x: 5, y: 5 },
            { type: 'ENERGY_GRID', w: 3, h: 4, x: 0, y: 7 },
            { type: 'BARTER_MARKET', w: 4, h: 4, x: 3, y: 7 },
            { type: 'ACTIVE_PROJECTS', w: 4, h: 4, x: 7, y: 9 },
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
            { type: 'FLOW_DIRECTOR', w: 4, h: 5, x: 0, y: 0 },
            { type: 'PROJECT_SWARM', w: 4, h: 5, x: 4, y: 0 },
            { type: 'COLLAB_PROJECTS', w: 4, h: 5, x: 8, y: 0 },
            { type: 'ACTIVE_PROJECTS', w: 4, h: 4, x: 0, y: 5 },
            { type: 'RECENT_ACTIVITY', w: 4, h: 4, x: 4, y: 5 },
            { type: 'ACTIVITY_SUMMARY', w: 4, h: 4, x: 0, y: 9 },
            { type: 'CALCULATOR', w: 4, h: 4, x: 8, y: 5 },
        ],
    },
    // ─── 8. Ubicación ────────────────────────────────────────
    {
        categoryId: 'ubicacion',
        name: 'Ubicación',
        widgets: [
            { type: 'MAP_LOCATION', w: 7, h: 6, x: 0, y: 0 },
            { type: 'ABUNDANCE_RADAR', w: 5, h: 6, x: 7, y: 0 },
            { type: 'TRANSIT_FLOW', w: 6, h: 4, x: 0, y: 6 },
            { type: 'WEATHER_BASIC', w: 6, h: 4, x: 6, y: 6 },
        ],
    },
    // ─── 9. Utilidades ───────────────────────────────────────
    {
        categoryId: 'utilidades',
        name: 'Utilidades',
        widgets: [
            { type: 'QUICK_ACCESS', w: 12, h: 4, x: 0, y: 0 },
            { type: 'CALCULATOR', w: 4, h: 4, x: 0, y: 4 },
            { type: 'NOTIFICATIONS', w: 4, h: 4, x: 4, y: 4 },
            { type: 'SYSTEM_STATUS', w: 4, h: 4, x: 8, y: 4 },
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
    // Rediseño (gen11): sincronización en vivo como hero, cerebros + neuronas
    // (nodos soberanos) como par de estado, acceso a la Biblioteca. Nota: no
    // existe aún un widget "Sync" ni "Neuronas" dedicados en el catálogo —
    // LIVE_DATA (telemetría de nodos en tiempo real) y SOVEREIGN_NODE (nodo/
    // hardware soberano) son los sustitutos más fieles hoy; swap directo
    // cuando el kit de widgets los incorpore.
    {
        categoryId: 'sistema',
        name: 'Sistema',
        widgets: [
            sz('LIVE_DATA', 'L', 0, 0),           // Sync (sustituto: telemetría/nodos en vivo)
            sz('BRAINS', 'M', 6, 0),               // Cerebros
            sz('SOVEREIGN_NODE', 'M', 0, 5),       // Neuronas (sustituto: nodo soberano)
            sz('UNIVERSAL_LIBRARY', 'S', 4, 5),    // Biblioteca (acceso)
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
            { type: 'ASTRAURA_CORTEX', w: 5, h: 5, x: 0, y: 0 },
            { type: 'NEXUS_QUICK_ACCESS', w: 4, h: 5, x: 5, y: 0 },
            { type: 'MESSAGES', w: 3, h: 5, x: 9, y: 0 },
            { type: 'ORACLE_PREDICT', w: 5, h: 4, x: 0, y: 5 },
        ],
    },
    // ─── 15. Parlamento ──────────────────────────────────────
    {
        categoryId: 'parlamento',
        name: 'Parlamento',
        widgets: [
            { type: 'AGORA_CAUSAL', w: 5, h: 5, x: 0, y: 0 },
            { type: 'LIQUID_DELEGATION', w: 3, h: 5, x: 5, y: 0 },
            { type: 'POLITICAL_SUMMARY', w: 4, h: 5, x: 8, y: 0 },
            { type: 'RELEVANT_POSTS', w: 12, h: 3, x: 0, y: 5 },
        ],
    },
    // ─── 16. Red ─────────────────────────────────────────────
    // Rediseño (gen11): feed de exploración como hero (ancho completo),
    // franja de contexto social (notificaciones/mensajes/insignias) debajo.
    {
        categoryId: 'red',
        name: 'Red',
        widgets: [
            sz('EXPLORE_NETWORK', 'XL', 0, 0),
            sz('NOTIFICATIONS', 'M', 0, 6),
            sz('MESSAGES', 'M', 4, 6),
            sz('BADGES', 'S', 8, 6),
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
    // ─── 18. Creativo ────────────────────────────────────────
    // Nuevo predeterminado (gen11): hub personal de creación rápida — galería
    // + cámara + estudio en la fila superior (6+3+3=12), notas debajo.
    // Promovido desde BASE_FUTURE_DASHBOARD_TEMPLATES ('Creatividad') a
    // predeterminado: pasa a sembrarse para cuentas nuevas y existentes.
    {
        categoryId: 'creatividad',
        name: 'Creativo',
        widgets: [
            sz('RECENT_GALLERY', 'L', 0, 0),
            sz('CAMERA_QUICK', 'S', 6, 0),
            sz('CREATIVE_STUDIO', 'S', 9, 0),
            sz('QUICK_NOTES', 'M', 0, 5),
        ],
    },
];

// Categorías recién habilitadas por la 2.ª generación de widgets.
const BASE_FUTURE_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    // ─── Astrología ──────────────────────────────────────────
    {
        categoryId: 'astrologia',
        name: 'Astrología',
        widgets: [
            { type: 'NATAL_CHART', w: 5, h: 5, x: 0, y: 0 },
            { type: 'WEATHER_ASTRONOMY', w: 4, h: 5, x: 5, y: 0 },
            { type: 'WEATHER_HOLISTIC', w: 3, h: 5, x: 9, y: 0 },
            { type: 'ENERGY_MAP', w: 5, h: 4, x: 0, y: 5 },
        ],
    },
    // ─── Archivos ────────────────────────────────────────────
    {
        categoryId: 'archivos',
        name: 'Archivos',
        widgets: [
            { type: 'AKASHIC_CODEX', w: 8, h: 6, x: 0, y: 0 },
            { type: 'SYSTEM_STATUS', w: 4, h: 6, x: 8, y: 0 },
        ],
    },
    // ─── Entretenimiento ─────────────────────────────────────
    {
        categoryId: 'entretenimiento',
        name: 'Entretenimiento',
        widgets: [
            { type: 'IMMERSION_PORTAL', w: 8, h: 5, x: 0, y: 0 },
            { type: 'CULTURAL_FEED', w: 4, h: 5, x: 8, y: 0 },
        ],
    },
    // ─── Ayudantía ───────────────────────────────────────────
    {
        categoryId: 'ayudantia',
        name: 'Ayudantía',
        widgets: [
            { type: 'WELLNESS', w: 5, h: 4, x: 0, y: 0 },
            { type: 'CALCULATOR', w: 3, h: 4, x: 5, y: 0 },
            { type: 'NOTIFICATIONS', w: 4, h: 4, x: 8, y: 0 },
        ],
    },
    // ─── Ciberdelia ──────────────────────────────────────────
    {
        categoryId: 'ciberdelia',
        name: 'Ciberdelia',
        widgets: [
            { type: 'IMMERSION_PORTAL', w: 5, h: 4, x: 0, y: 0 },
            { type: 'THEME_MANAGER', w: 4, h: 4, x: 5, y: 0 },
            { type: 'THEME_SELECTOR', w: 3, h: 4, x: 9, y: 0 },
        ],
    },
    // ─── Descubrimientos ─────────────────────────────────────
    {
        categoryId: 'descubrimientos',
        name: 'Descubrimientos',
        widgets: [
            { type: 'SERENDIPITY_LENS', w: 5, h: 4, x: 0, y: 0 },
            { type: 'EXPLORE_NETWORK', w: 4, h: 4, x: 5, y: 0 },
            { type: 'RECENT_ACTIVITY', w: 3, h: 4, x: 9, y: 0 },
            { type: 'SOCIAL_RADAR', w: 12, h: 3, x: 0, y: 4 },
        ],
    },
    // ─── Privacidad ──────────────────────────────────────────
    {
        categoryId: 'privacidad',
        name: 'Privacidad',
        widgets: [
            { type: 'CRYPTO_SHIELD', w: 5, h: 4, x: 0, y: 0 },
            { type: 'IDENTITY_VAULT', w: 4, h: 4, x: 5, y: 0 },
            { type: 'SYSTEM_STATUS', w: 3, h: 4, x: 9, y: 0 },
        ],
    },
    // ─── Dispositivos ────────────────────────────────────────
    {
        categoryId: 'dispositivos',
        name: 'Dispositivos',
        widgets: [
            { type: 'HABITAT_CORE', w: 5, h: 5, x: 0, y: 0 },
            { type: 'ENERGY_GRID', w: 4, h: 5, x: 5, y: 0 },
            { type: 'SYSTEM_STATUS', w: 3, h: 5, x: 9, y: 0 },
        ],
    },
    // Nota: 'creatividad' (antes "Creatividad" aquí) se promovió a
    // predeterminado — ver BASE_DEFAULT_DASHBOARD_TEMPLATES #18 "Creativo".
    // ─── Perfil ──────────────────────────────────────────────
    {
        categoryId: 'perfil',
        name: 'Perfil',
        widgets: [
            { type: 'MERIT_GALLERY', w: 5, h: 5, x: 0, y: 0 },
            { type: 'IDENTITY_VAULT', w: 4, h: 5, x: 5, y: 0 },
            { type: 'LEARNING_PATH', w: 3, h: 5, x: 9, y: 0 },
        ],
    },
    // ─── Sociedad ────────────────────────────────────────────
    {
        categoryId: 'sociedad',
        name: 'Sociedad',
        widgets: [
            { type: 'SOCIETY_PULSE', w: 5, h: 4, x: 0, y: 0 },
            { type: 'ELDER_COUNCIL', w: 4, h: 4, x: 5, y: 0 },
            { type: 'RESTORATIVE_COURT', w: 3, h: 5, x: 9, y: 0 },
        ],
    },
];

// ── Siembra automática de variaciones por tema ───────────────────
// Cada dashboard predeterminado recibe el folder de apps StarSeed (dock)
// y los elementos funcionales correspondientes a su tema; la posición Y se
// calcula tras el contenido existente (sin solapes) y no se duplica lo ya
// presente. Así "cada tema con sus variaciones de elementos correspondientes".
type SeedWidget = { type: WidgetType; w: number; h: number; settings?: Record<string, any> };

const APPS_DOCK_COLLECTION: Partial<Record<WidgetCategory, 'starseed' | 'sistema' | 'media'>> = {
    sistema: 'sistema',
    entretenimiento: 'media',
    archivos: 'sistema',
};

const THEME_EXTRA_WIDGETS: Partial<Record<WidgetCategory, SeedWidget[]>> = {
    cultura: [{ type: 'MUSIC_PLAYER', w: 4, h: 4 }, { type: 'RADIO_LIVE', w: 4, h: 4 }],
    clima: [{ type: 'SPACE_WEATHER', w: 4, h: 4 }, { type: 'OFFICIAL_DATA', w: 4, h: 4 }],
    sistema: [{ type: 'OFFICIAL_DATA', w: 4, h: 4 }],
    personalizacion: [{ type: 'AUDIOMORPHIC_BG', w: 3, h: 4 }],
    astronomia: [{ type: 'SPACE_WEATHER', w: 5, h: 5 }, { type: 'OFFICIAL_DATA', w: 4, h: 4 }],
    entretenimiento: [
        { type: 'MEDIA_CONTROL', w: 4, h: 6 },
        { type: 'MUSIC_PLAYER', w: 4, h: 4 },
        { type: 'RADIO_LIVE', w: 4, h: 4 },
        { type: 'OMNIFRECUENCIAS', w: 4, h: 5 },
        { type: 'AUDIOMORPHIC_BG', w: 4, h: 4 },
        { type: 'UNIVERSAL_OPENER', w: 4, h: 5 },
    ],
    astrologia: [{ type: 'OMNIFRECUENCIAS', w: 4, h: 5 }],
    ciberdelia: [{ type: 'IMMERSIVE', w: 5, h: 5 }, { type: 'AUDIOMORPHIC_BG', w: 4, h: 4 }, { type: 'OMNIFRECUENCIAS', w: 4, h: 5 }],
    descubrimientos: [{ type: 'OFFICIAL_DATA', w: 4, h: 4 }],
    archivos: [{ type: 'UNIVERSAL_OPENER', w: 4, h: 5 }],
    ayudantia: [{ type: 'OMNIFRECUENCIAS', w: 4, h: 5 }],
    ia: [{ type: 'OFFICIAL_DATA', w: 4, h: 4 }],
};

const SEED_GRID_COLS = 12;

function withSeededExtras(t: DefaultDashboardTemplate): DefaultDashboardTemplate {
    const widgets = t.widgets.map((w) => ({ ...w }));
    let cursorY = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);

    // Dock de apps StarSeed (si el tablero aún no tiene un launcher).
    if (!widgets.some((w) => w.type === 'APP_LAUNCHER')) {
        widgets.push({
            type: 'APP_LAUNCHER', w: SEED_GRID_COLS, h: 2, x: 0, y: cursorY,
            settings: { variant: 'folder', collection: APPS_DOCK_COLLECTION[t.categoryId] ?? 'starseed', label: 'Apps StarSeed', density: 'compact' },
        });
        cursorY += 2;
    }

    // Elementos funcionales del tema (empaquetado simple por estantes).
    const extras = THEME_EXTRA_WIDGETS[t.categoryId];
    if (extras) {
        let x = 0;
        let rowH = 0;
        for (const e of extras) {
            if (widgets.some((w) => w.type === e.type)) continue; // no duplicar lo ya presente
            const w = Math.min(e.w, SEED_GRID_COLS);
            if (x + w > SEED_GRID_COLS) { x = 0; cursorY += rowH; rowH = 0; }
            widgets.push({ type: e.type, w, h: e.h, x, y: cursorY, settings: e.settings });
            x += w;
            rowH = Math.max(rowH, e.h);
        }
    }
    return { ...t, widgets };
}

export const DEFAULT_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = BASE_DEFAULT_DASHBOARD_TEMPLATES.map(withSeededExtras);
export const FUTURE_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = BASE_FUTURE_DASHBOARD_TEMPLATES.map(withSeededExtras);

// All templates combined (for the create-dashboard dialog)
export const ALL_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    ...DEFAULT_DASHBOARD_TEMPLATES,
    ...FUTURE_DASHBOARD_TEMPLATES,
];

// Get template by category ID
export function getTemplateByCategory(categoryId: WidgetCategory): DefaultDashboardTemplate | undefined {
    return ALL_DASHBOARD_TEMPLATES.find(t => t.categoryId === categoryId);
}
