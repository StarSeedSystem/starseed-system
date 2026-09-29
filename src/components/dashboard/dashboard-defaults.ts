import { WidgetType } from "./dashboard-types";
import type { WidgetCategory } from "./widget-categories";
import { dimsForSize, sizeFromWH, type WidgetSize } from "./dashboard-size";

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
/**
 * Papel de un widget dentro de la composición de su pestaña (gen12, 2026-09-29):
 *  · heroe  — el protagonista: lo que abres esa pestaña para ver (uno por pestaña, arriba).
 *  · apoyo  — las piezas que acompañan al héroe.
 *  · dato   — cifras de un vistazo (se vuelven teselas micro/pequeñas en el teléfono).
 *  · franja — bandas a lo ancho (el dock de apps, un panorama).
 * El acomodo por pantalla (`src/lib/dashboard/acomodo-pantalla.ts`) deduce el papel de la huella
 * de cada widget, así que también funciona con los tableros que la persona reorganizó; aquí se
 * declara para las variantes de plantilla (Completo · Esencial · Enfoque) y para las pruebas.
 */
export type RolPlantilla = "heroe" | "apoyo" | "dato" | "franja";

export interface WidgetPlantilla {
    type: WidgetType;
    w: number;
    h: number;
    x: number;
    y: number;
    settings?: Record<string, any>;
    size?: WidgetSize;
    rol?: RolPlantilla;
}

export interface DefaultDashboardTemplate {
    categoryId: WidgetCategory;
    name: string;
    isDefault?: boolean;  // Only one should be true (the first dashboard for new users)
    /** Para qué es la pestaña, en una línea (gen12). */
    lema?: string;
    widgets: WidgetPlantilla[];
}

/** Atajo: construye una entrada de widget a partir de su talla S/M/L/XL
 *  (ver dashboard-size.ts), recortada a los mínimos del widget-manifest. El
 *  `size` viaja con la entrada para que el widget sembrado ya lo declare. */
function sz(type: WidgetType, size: WidgetSize, x: number, y: number, settings?: Record<string, any>): WidgetPlantilla {
    const { w, h } = dimsForSize(type, size);
    return { type, w, h, x, y, size, ...(settings ? { settings } : {}) };
}

/** Atajo gen12: una pieza con su huella exacta y su papel en la composición. */
function p(type: WidgetType, x: number, y: number, w: number, h: number, rol: RolPlantilla = "apoyo", settings?: Record<string, any>): WidgetPlantilla {
    return { type, x, y, w, h, rol, size: sizeFromWH(w, h), ...(settings ? { settings } : {}) };
}
void sz; // se conserva para plantillas que prefieran declarar la talla S/M/L/XL

/*
 * gen12 (2026-09-29) — «dale otra pasada de diseño a cada pestaña». Cada pestaña temática es un
 * espacio con propósito: un HÉROE arriba (lo que se viene a ver, 6–8 columnas y 6–7 filas), piezas
 * de APOYO que cuentan el resto de la historia, DATOS de un vistazo donde el tema los tiene (clima,
 * cosmos) y el dock de apps como franja final. Todas las filas quedan llenas (sin huecos) y cada
 * pestaña prefiere widgets con datos reales (eventos, grupos, tareas, notas, galería, clima de
 * Open-Meteo, cosmos de NOAA, mapa de OpenStreetMap…).
 */
const BASE_DEFAULT_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    // ─── 1. Inicio (principal) ───────────────────────────────
    {
        categoryId: 'social',
        name: 'Inicio',
        isDefault: true,
        lema: 'Tu día de un vistazo',
        widgets: [
            p('CLOCK_DATE', 0, 0, 6, 5, 'heroe'),      // hora, Sol, Luna y signos
            p('WEATHER_BASIC', 6, 0, 3, 5),
            p('MY_EVENTS', 9, 0, 3, 5),
            p('TASKS_QUICK', 0, 5, 4, 4),
            p('AURORA_LAST', 4, 5, 4, 4),
            p('QUICK_ACCESS', 8, 5, 4, 4),
            p('NETWORK_FEED_MINI', 0, 9, 7, 5),
            // Red sináptica (Adenda 99): sigue en Inicio, ahora como pieza junto al feed.
            p('INTERNET_RADAR', 7, 9, 5, 5),
        ],
    },
    // ─── 2. Política ─────────────────────────────────────────
    {
        categoryId: 'politica',
        name: 'Política',
        lema: 'Deliberar y decidir en común',
        widgets: [
            p('AGORA_CAUSAL', 0, 0, 7, 6, 'heroe'),
            p('POLITICAL_SUMMARY', 7, 0, 5, 3),
            p('LIQUID_DELEGATION', 7, 3, 5, 3),
            p('CIVIC_ALCHEMY', 0, 6, 4, 5),
            p('SOCIAL_RESONANCE', 4, 6, 4, 5),
            p('VITAL_FLOW_AUDIT', 8, 6, 4, 5),
        ],
    },
    // ─── 3. Educación ────────────────────────────────────────
    {
        categoryId: 'educacion',
        name: 'Educación',
        lema: 'Aprender con propósito',
        widgets: [
            p('SKILL_TREE', 0, 0, 7, 6, 'heroe'),
            p('LEARNING_PATH', 7, 0, 5, 3),
            p('MENTOR_MATCH', 7, 3, 5, 3),
            p('UNIVERSAL_LIBRARY', 0, 6, 6, 5),
            p('QUICK_NOTES', 6, 6, 3, 5),
            p('BADGES', 9, 6, 3, 5),
        ],
    },
    // ─── 4. Cultura ──────────────────────────────────────────
    {
        categoryId: 'cultura',
        name: 'Cultura',
        lema: 'Expresión, música y encuentros',
        widgets: [
            p('CULTURAL_FEED', 0, 0, 7, 6, 'heroe'),
            p('MY_EVENTS', 7, 0, 5, 3),
            p('MUSIC_PLAYER', 7, 3, 5, 3),
            p('MULTIVERSE_HUB', 0, 6, 4, 5),
            p('CREATIVE_STUDIO', 4, 6, 4, 5),
            p('RADIO_LIVE', 8, 6, 4, 5),
        ],
    },
    // ─── 5. Economía ─────────────────────────────────────────
    {
        categoryId: 'economia',
        name: 'Economía',
        lema: 'El flujo del procomún',
        widgets: [
            p('CARTERA_STARSEED', 0, 0, 6, 6, 'heroe'),
            p('ECONOMIC_OVERVIEW', 6, 0, 3, 6),
            p('OIKOS_METABOLISM', 9, 0, 3, 6),
            p('GIFT_AGORA', 0, 6, 4, 5),
            p('BARTER_MARKET', 4, 6, 4, 5),
            p('ENERGY_GRID', 8, 6, 4, 5),
        ],
    },
    // ─── 6. Clima ────────────────────────────────────────────
    {
        categoryId: 'clima',
        name: 'Clima',
        lema: 'El cielo de tu lugar, en vivo',
        widgets: [
            p('WEATHER_BASIC', 0, 0, 6, 6, 'heroe'),
            p('WEATHER_TEMPERATURE', 6, 0, 3, 3, 'dato'),
            p('WEATHER_HUMIDITY', 9, 0, 3, 3, 'dato'),
            p('WEATHER_WIND', 6, 3, 3, 3, 'dato'),
            p('WEATHER_UV', 9, 3, 3, 3, 'dato'),
            p('WEATHER_AIR_QUALITY', 0, 6, 6, 4),
            p('WEATHER_ASTRONOMY', 6, 6, 6, 4),
            p('OFFICIAL_DATA', 0, 10, 12, 4, 'franja'),
        ],
    },
    // ─── 7. Productividad ────────────────────────────────────
    {
        categoryId: 'productividad',
        name: 'Productividad',
        lema: 'Enfoque y avance del día',
        widgets: [
            p('TASKS_QUICK', 0, 0, 6, 6, 'heroe'),
            p('QUICK_NOTES', 6, 0, 3, 6),
            p('FLOW_DIRECTOR', 9, 0, 3, 6),
            p('ACTIVE_PROJECTS', 0, 6, 4, 5),
            p('PROJECT_SWARM', 4, 6, 4, 5),
            p('ACTIVITY_SUMMARY', 8, 6, 4, 5),
        ],
    },
    // ─── 8. Ubicación ────────────────────────────────────────
    {
        categoryId: 'ubicacion',
        name: 'Ubicación',
        lema: 'Tu lugar en el mapa',
        widgets: [
            p('MAP_LOCATION', 0, 0, 8, 7, 'heroe'),
            p('WEATHER_BASIC', 8, 0, 4, 4),
            p('ABUNDANCE_RADAR', 8, 4, 4, 3),
            p('TRANSIT_FLOW', 0, 7, 6, 4),
            p('MY_EVENTS', 6, 7, 6, 4),
        ],
    },
    // ─── 9. Utilidades ───────────────────────────────────────
    {
        categoryId: 'utilidades',
        name: 'Utilidades',
        lema: 'Herramientas a mano',
        widgets: [
            p('QUICK_ACCESS', 0, 0, 8, 5, 'heroe'),
            p('CLOCK_DATE', 8, 0, 4, 5),
            p('CALCULATOR', 0, 5, 3, 5),
            p('QUICK_NOTES', 3, 5, 3, 5),
            p('UNIVERSAL_OPENER', 6, 5, 3, 5),
            p('NOTIFICATIONS', 9, 5, 3, 5),
        ],
    },
    // ─── 10. Arte ────────────────────────────────────────────
    {
        categoryId: 'arte',
        name: 'Arte',
        lema: 'Tu galería viva',
        widgets: [
            p('RECENT_GALLERY', 0, 0, 7, 6, 'heroe'),
            p('CREATIVE_STUDIO', 7, 0, 5, 3),
            p('CAMERA_QUICK', 7, 3, 5, 3),
            p('CULTURAL_FEED', 0, 6, 6, 5),
            p('IDEA_FORGE', 6, 6, 6, 5),
        ],
    },
    // ─── 11. Astronomía ──────────────────────────────────────
    {
        categoryId: 'astronomia',
        name: 'Astronomía',
        lema: 'El cosmos en tiempo real',
        widgets: [
            p('WEATHER_ASTRONOMY', 0, 0, 6, 6, 'heroe'), // Sol, Luna y su fase
            p('SPACE_WEATHER', 6, 0, 6, 3, 'franja'),    // NOAA SWPC en vivo
            p('WEATHER_SPACE_KP', 6, 3, 3, 3, 'dato'),
            p('WEATHER_SPACE_FLARE', 9, 3, 3, 3, 'dato'),
            p('WEATHER_SPACE_SOLAR', 0, 6, 4, 4),
            p('WEATHER_SPACE_MAGNETOMETER', 4, 6, 4, 4),
            p('WEATHER_SPACE_SCHUMANN', 8, 6, 4, 4),
            p('WEATHER_HOLISTIC', 0, 10, 6, 5),
            p('OFFICIAL_DATA', 6, 10, 6, 5),
        ],
    },
    // ─── 12. Sistema ─────────────────────────────────────────
    {
        categoryId: 'sistema',
        name: 'Sistema',
        lema: 'Tu nodo, sano y sincronizado',
        widgets: [
            p('SYSTEM_STATUS', 0, 0, 6, 5, 'heroe'),
            p('BRAINS', 6, 0, 3, 5),
            p('VAULTS', 9, 0, 3, 5),
            p('SOVEREIGN_NODE', 0, 5, 4, 4),
            p('IDENTITY_VAULT', 4, 5, 4, 4),
            p('LIVE_DATA', 8, 5, 4, 4),
        ],
    },
    // ─── 13. Personalización ─────────────────────────────────
    {
        categoryId: 'personalizacion',
        name: 'Personalización',
        lema: 'Tu sistema, a tu medida',
        widgets: [
            p('THEME_MANAGER', 0, 0, 7, 6, 'heroe'),
            p('THEME_SELECTOR', 7, 0, 5, 2, 'franja'),
            p('AUDIOMORPHIC_BG', 7, 2, 5, 4),
        ],
    },
    // ─── 14. IA ──────────────────────────────────────────────
    {
        categoryId: 'ia',
        name: 'IA',
        lema: 'Tu exocórtex',
        widgets: [
            p('ASTRAURA_CORTEX', 0, 0, 6, 6, 'heroe'),
            p('AURORA_LAST', 6, 0, 3, 6),
            p('BRAINS', 9, 0, 3, 6),
            p('MEMORIES', 0, 6, 4, 5),
            p('NEXUS_QUICK_ACCESS', 4, 6, 4, 5),
            p('ORACLE_PREDICT', 8, 6, 4, 5),
        ],
    },
    // ─── 15. Parlamento ──────────────────────────────────────
    {
        categoryId: 'parlamento',
        name: 'Parlamento',
        lema: 'Asambleas, consejo y justicia restaurativa',
        widgets: [
            p('ELDER_COUNCIL', 0, 0, 7, 6, 'heroe'),
            p('LIQUID_DELEGATION', 7, 0, 5, 3),
            p('POLITICAL_SUMMARY', 7, 3, 5, 3),
            p('RESTORATIVE_COURT', 0, 6, 6, 5),
            p('MY_GROUPS', 6, 6, 6, 5),
        ],
    },
    // ─── 16. Red ─────────────────────────────────────────────
    {
        categoryId: 'red',
        name: 'Red',
        lema: 'Tu constelación de personas y nodos',
        widgets: [
            p('NETWORK_FEED_MINI', 0, 0, 7, 7, 'heroe'),
            p('MESSAGES', 7, 0, 5, 4),
            p('NOTIFICATIONS', 7, 4, 5, 3),
            p('COMMUNITIES', 0, 7, 4, 5),
            p('MESH_RADAR', 4, 7, 4, 5),
            p('FEDERATED_ENTITIES', 8, 7, 4, 5),
        ],
    },
    // ─── 17. Explorador ──────────────────────────────────────
    {
        categoryId: 'explorador',
        name: 'Explorador',
        lema: 'Descubrir lo inesperado',
        widgets: [
            p('EXPLORE_NETWORK', 0, 0, 7, 6, 'heroe'),
            p('SERENDIPITY_LENS', 7, 0, 5, 6),
            p('SOCIAL_RADAR', 0, 6, 4, 4),
            p('MY_PAGES', 4, 6, 4, 4),
            p('RECENT_ACTIVITY', 8, 6, 4, 4),
        ],
    },
    // ─── 18. Creativo ────────────────────────────────────────
    {
        categoryId: 'creatividad',
        name: 'Creativo',
        lema: 'Crear ya, sin esperar',
        widgets: [
            p('IDEA_FORGE', 0, 0, 6, 6, 'heroe'),
            p('QUICK_NOTES', 6, 0, 3, 6),
            p('CAMERA_QUICK', 9, 0, 3, 3, 'dato'),
            p('CREATIVE_STUDIO', 9, 3, 3, 3, 'dato'),
            p('RECENT_GALLERY', 0, 6, 6, 5),
            p('DOCUMENTS', 6, 6, 6, 5),
        ],
    },
];

// Temas de «crear desde plantilla» (no se siembran solos). Misma gramática: héroe + apoyo.
const BASE_FUTURE_DASHBOARD_TEMPLATES: DefaultDashboardTemplate[] = [
    {
        categoryId: 'astrologia', name: 'Astrología', lema: 'Ciclos, tránsitos y sincronías',
        widgets: [
            p('NATAL_CHART', 0, 0, 6, 6, 'heroe'),
            p('WEATHER_ASTRONOMY', 6, 0, 6, 3),
            p('ENERGY_MAP', 6, 3, 6, 3),
            p('OMNIFRECUENCIAS', 0, 6, 6, 5),
            p('WEATHER_HOLISTIC', 6, 6, 6, 5),
        ],
    },
    {
        categoryId: 'archivos', name: 'Archivos', lema: 'Tus documentos y memorias',
        widgets: [
            p('DOCUMENTS', 0, 0, 6, 6, 'heroe'),
            p('MEMORIES', 6, 0, 3, 6),
            p('VAULTS', 9, 0, 3, 6),
            p('AKASHIC_CODEX', 0, 6, 6, 5),
            p('UNIVERSAL_OPENER', 6, 6, 6, 5),
        ],
    },
    {
        categoryId: 'entretenimiento', name: 'Entretenimiento', lema: 'Música, radio y mundos',
        widgets: [
            p('MEDIA_CONTROL', 0, 0, 6, 6, 'heroe'),
            p('MUSIC_PLAYER', 6, 0, 6, 3),
            p('RADIO_LIVE', 6, 3, 6, 3),
            p('OMNIFRECUENCIAS', 0, 6, 4, 5),
            p('AUDIOMORPHIC_BG', 4, 6, 4, 5),
            p('IMMERSION_PORTAL', 8, 6, 4, 5),
        ],
    },
    {
        categoryId: 'ayudantia', name: 'Ayudantía', lema: 'Cuidarte y pedir ayuda',
        widgets: [
            p('WELLNESS', 0, 0, 6, 5, 'heroe'),
            p('TASKS_QUICK', 6, 0, 3, 5),
            p('CALCULATOR', 9, 0, 3, 5),
            p('OMNIFRECUENCIAS', 0, 5, 6, 5),
            p('NOTIFICATIONS', 6, 5, 6, 5),
        ],
    },
    {
        categoryId: 'ciberdelia', name: 'Ciberdelia', lema: 'Experiencias que expanden',
        widgets: [
            p('IMMERSIVE', 0, 0, 7, 6, 'heroe'),
            p('IMMERSION_PORTAL', 7, 0, 5, 6),
            p('AUDIOMORPHIC_BG', 0, 6, 4, 5),
            p('OMNIFRECUENCIAS', 4, 6, 4, 5),
            p('THEME_MANAGER', 8, 6, 4, 5),
        ],
    },
    {
        categoryId: 'descubrimientos', name: 'Descubrimientos', lema: 'Datos vivos del mundo',
        widgets: [
            p('OFFICIAL_DATA', 0, 0, 7, 6, 'heroe'),
            p('SERENDIPITY_LENS', 7, 0, 5, 6),
            p('EXPLORE_NETWORK', 0, 6, 6, 5),
            p('RECENT_ACTIVITY', 6, 6, 6, 5),
        ],
    },
    {
        categoryId: 'privacidad', name: 'Privacidad', lema: 'Tu membrana y tu soberanía',
        widgets: [
            p('CRYPTO_SHIELD', 0, 0, 7, 6, 'heroe'),
            p('IDENTITY_VAULT', 7, 0, 5, 6),
            p('VAULTS', 0, 6, 6, 5),
            p('SYSTEM_STATUS', 6, 6, 6, 5),
        ],
    },
    {
        categoryId: 'dispositivos', name: 'Dispositivos', lema: 'Tu hábitat conectado',
        widgets: [
            p('HABITAT_CORE', 0, 0, 7, 6, 'heroe'),
            p('ENERGY_GRID', 7, 0, 5, 6),
            p('SYSTEM_STATUS', 0, 6, 6, 5),
            p('SOVEREIGN_NODE', 6, 6, 6, 5),
        ],
    },
    {
        categoryId: 'perfil', name: 'Perfil', lema: 'Mérito, identidad y legado',
        widgets: [
            p('MERIT_GALLERY', 0, 0, 6, 6, 'heroe'),
            p('BADGES', 6, 0, 3, 6),
            p('ACTIVITY_SUMMARY', 9, 0, 3, 6),
            p('MY_PAGES', 0, 6, 6, 5),
            p('IDENTITY_VAULT', 6, 6, 6, 5),
        ],
    },
    {
        categoryId: 'sociedad', name: 'Sociedad', lema: 'El pulso del organismo común',
        widgets: [
            p('SOCIETY_PULSE', 0, 0, 7, 6, 'heroe'),
            p('ELDER_COUNCIL', 7, 0, 5, 6),
            p('RESTORATIVE_COURT', 0, 6, 6, 5),
            p('COMMUNITIES', 6, 6, 6, 5),
        ],
    },
];

// ── El dock de apps como franja final ────────────────────────────
// Cada pestaña temática termina con el folder de apps StarSeed (la colección que le toca a su
// tema), a lo ancho y tras el contenido, sin duplicarlo si la plantilla ya lo trae.
const APPS_DOCK_COLLECTION: Partial<Record<WidgetCategory, 'starseed' | 'sistema' | 'media'>> = {
    sistema: 'sistema',
    entretenimiento: 'media',
    archivos: 'sistema',
};

const SEED_GRID_COLS = 12;

function withSeededExtras(t: DefaultDashboardTemplate): DefaultDashboardTemplate {
    const widgets = t.widgets.map((w) => ({ ...w }));
    const cursorY = widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    if (!widgets.some((w) => w.type === 'APP_LAUNCHER')) {
        widgets.push({
            type: 'APP_LAUNCHER', w: SEED_GRID_COLS, h: 2, x: 0, y: cursorY, rol: 'franja', size: sizeFromWH(SEED_GRID_COLS, 2),
            settings: { variant: 'folder', collection: APPS_DOCK_COLLECTION[t.categoryId] ?? 'starseed', label: 'Apps StarSeed', density: 'compact' },
        });
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
