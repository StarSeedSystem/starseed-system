// ════════════════════════════════════════════════════════════════
// Widget Function Style — el look guiado por la FUNCIÓN + tipo de dato
// ----------------------------------------------------------------
// "Que el diseño hable por sí mismo": el aspecto de cada widget (acento,
// intensidad de luz, densidad, si conviene fondo/animación) se deriva de su
// FUNCIÓN principal y del tipo de dato que porta — no de decisiones sueltas por
// widget. Esta tabla es la fuente única de esa correspondencia; el registro la
// consulta para teñir el contenedor y ajustar densidad de forma coherente.
//
// Es ADITIVO y no rompe el API del WidgetShell: los widgets que ya pasan un
// `accent` explícito lo conservan; esta capa aporta un acento/tinte por función
// como variable CSS de respaldo (--w-fn-accent) y una pista de densidad.
// ════════════════════════════════════════════════════════════════

import type { WidgetType } from "./dashboard-types";

/** Familia funcional de un widget (qué HACE / qué DATO muestra). */
export type WidgetFunctionKind =
    | "governance"   // política / ontocracia — decisión colectiva
    | "economy"      // recursos, flujo, abundancia
    | "learning"     // educación, habilidades, progreso
    | "culture"      // arte, expresión, multiverso
    | "social"       // comunidad, mensajes, eventos
    | "climate"      // clima terrestre/espacial, telemetría atmosférica
    | "cosmos"       // astronomía / astrología — cielo y ciclos
    | "system"       // nodo, red, hardware, salud del sistema
    | "ai"           // exocórtex, oráculo, agentes
    | "media"        // reproductor, radio, frecuencias, audiomorphic
    | "location"     // mapa, tránsito, proximidad
    | "files"        // archivos, memorias, códice, baúles
    | "productivity" // flujo, proyectos, tareas
    | "apps"         // lanzadera / carpetas de apps
    | "identity"     // perfil, mérito, privacidad
    | "utility";     // calculadora, notificaciones, utilidades

export interface WidgetFunctionStyle {
    kind: WidgetFunctionKind;
    /** Acento base (token CSS o hex) coherente con la Trinity/paleta StarSeed. */
    accent: string;
    /**
     * Peso visual: 'ambient' = fondo/dato al aire, poco texto; 'data' = tablas/
     * métricas densas; 'action' = controles al frente. Guía de densidad/luz.
     */
    weight: "ambient" | "data" | "action";
}

// Acentos alineados con la identidad del OS (Trinity + categorías):
// gobernanza→ámbar/crimson, economía→esmeralda, educación→violeta, cultura→rosa,
// social→azul, clima→cian cielo, cosmos→índigo, sistema→teal, IA→cian eléctrico,
// media→fucsia, ubicación→rojo, archivos→ámbar quemado, productividad→violeta,
// apps→lima neón, identidad→cian.
const FN_STYLE: Record<WidgetFunctionKind, Omit<WidgetFunctionStyle, "kind">> = {
    governance: { accent: "#FFBF00", weight: "action" },
    economy: { accent: "#10B981", weight: "data" },
    learning: { accent: "#8B5CF6", weight: "data" },
    culture: { accent: "#EC4899", weight: "ambient" },
    social: { accent: "#3B82F6", weight: "data" },
    climate: { accent: "#38BDF8", weight: "ambient" },
    cosmos: { accent: "#6366F1", weight: "ambient" },
    system: { accent: "#14B8A6", weight: "data" },
    ai: { accent: "#22D3EE", weight: "action" },
    media: { accent: "#D946EF", weight: "action" },
    location: { accent: "#EF4444", weight: "ambient" },
    files: { accent: "#D4AF37", weight: "data" },
    productivity: { accent: "#7C3AED", weight: "data" },
    apps: { accent: "#39FF14", weight: "action" },
    identity: { accent: "#06B6D4", weight: "data" },
    utility: { accent: "#F59E0B", weight: "action" },
};

// Correspondencia widget → familia funcional. Solo lo necesario para teñir; los
// tipos no listados caen en 'utility' (acento neutro ámbar) — nunca falla.
const WIDGET_FUNCTION: Partial<Record<WidgetType, WidgetFunctionKind>> = {
    // Gobernanza / ontocracia
    AGORA_CAUSAL: "governance", LIQUID_DELEGATION: "governance", POLITICAL_SUMMARY: "governance",
    CIVIC_ALCHEMY: "governance", VITAL_FLOW_AUDIT: "governance", SOCIAL_RESONANCE: "governance",
    ELDER_COUNCIL: "governance", RESTORATIVE_COURT: "governance", RELEVANT_POSTS: "governance",
    // Economía
    ECONOMIC_OVERVIEW: "economy", CARTERA_STARSEED: "economy", OIKOS_METABOLISM: "economy",
    GIFT_AGORA: "economy", COMMONS_MATRIX: "economy", FOOD_ORACLE: "economy", REGEN_TRACER: "economy",
    BARTER_MARKET: "economy", ENERGY_GRID: "economy",
    // Educación
    SKILL_TREE: "learning", LEARNING_PATH: "learning", UNIVERSAL_LIBRARY: "learning", MENTOR_MATCH: "learning",
    // Cultura
    CULTURAL_FEED: "culture", MULTIVERSE_HUB: "culture", CREATIVE_STUDIO: "culture",
    IMMERSION_PORTAL: "culture", IMMERSIVE: "culture",
    // Social
    EXPLORE_NETWORK: "social", MY_PAGES: "social", SOCIAL_RADAR: "social", MESSAGES: "social",
    MY_EVENTS: "social", MY_GROUPS: "social", COMMUNITIES: "social", FEDERATED_ENTITIES: "social",
    WELLNESS: "social",
    // Clima
    WEATHER_BASIC: "climate", WEATHER_TEMPERATURE: "climate", WEATHER_WIND: "climate",
    WEATHER_HUMIDITY: "climate", WEATHER_UV: "climate", WEATHER_AIR_QUALITY: "climate",
    WEATHER_HOLISTIC: "climate",
    // Cosmos
    WEATHER_ASTRONOMY: "cosmos", WEATHER_SPACE_SOLAR: "cosmos", WEATHER_SPACE_SCHUMANN: "cosmos",
    WEATHER_SPACE_KP: "cosmos", WEATHER_SPACE_MAGNETOMETER: "cosmos", WEATHER_SPACE_FLARE: "cosmos",
    WEATHER_SPACE: "cosmos", SPACE_WEATHER: "cosmos", NATAL_CHART: "cosmos", ENERGY_MAP: "cosmos",
    // Sistema / red
    SYSTEM_STATUS: "system", LIVE_DATA: "system", SOVEREIGN_NODE: "system", MESH_RADAR: "system",
    VAULTS: "system",
    // IA
    ASTRAURA_CORTEX: "ai", ORACLE_PREDICT: "ai", NEXUS_QUICK_ACCESS: "ai", BRAINS: "ai", AI_GENERATED: "ai",
    // Media
    MUSIC_PLAYER: "media", OMNIFRECUENCIAS: "media", RADIO_LIVE: "media",
    AUDIOMORPHIC_BG: "media", MEDIA_CONTROL: "media",
    // Ubicación
    MAP_LOCATION: "location", ABUNDANCE_RADAR: "location", TRANSIT_FLOW: "location",
    // Archivos
    AKASHIC_CODEX: "files", MEMORIES: "files", DOCUMENTS: "files", UNIVERSAL_OPENER: "files",
    // Productividad
    FLOW_DIRECTOR: "productivity", PROJECT_SWARM: "productivity", ACTIVE_PROJECTS: "productivity",
    COLLAB_PROJECTS: "productivity", RECENT_ACTIVITY: "productivity", ACTIVITY_SUMMARY: "productivity",
    // Apps / lanzadera
    APP_LAUNCHER: "apps", QUICK_ACCESS: "apps",
    // Identidad / perfil / privacidad
    MERIT_GALLERY: "identity", IDENTITY_VAULT: "identity", CRYPTO_SHIELD: "identity",
    // Utilidad
    CALCULATOR: "utility", NOTIFICATIONS: "utility", THEME_SELECTOR: "utility",
    THEME_MANAGER: "utility", OFFICIAL_DATA: "utility", SERENDIPITY_LENS: "utility",
    IDEA_FORGE: "utility", HABITAT_CORE: "system", SOCIETY_PULSE: "social",
};

/** Familia funcional de un widget (fallback 'utility'). */
export function getWidgetFunction(type: WidgetType): WidgetFunctionKind {
    return WIDGET_FUNCTION[type] ?? "utility";
}

/** Estilo derivado de la función de un widget (acento + peso visual). Nunca falla. */
export function getWidgetFunctionStyle(type: WidgetType): WidgetFunctionStyle {
    const kind = getWidgetFunction(type);
    return { kind, ...FN_STYLE[kind] };
}
