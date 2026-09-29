/**
 * Huellas de las pestañas predeterminadas de la generación anterior (gen11) — DATOS PUROS.
 *
 * Las cuentas sembradas con gen11 no guardaban ninguna marca de plantilla. Para saber si una de
 * sus pestañas temáticas sigue «tal cual vino de fábrica» (y se puede renovar sin perder nada) o
 * la persona la tocó (y se conserva), se compara con lo que sembraba gen11: tipo y posición de
 * cada widget y los ajustes que traía. Volcado del código de gen11 el 2026-09-29.
 *
 * `opcional`: piezas que las cuentas más antiguas pueden no tener porque se añadieron a la
 * plantilla después (el dock de apps, los extras del tema y el radar de internet de la Adenda 99).
 * Faltar una opcional no cuenta como edición; faltar una pieza fija, sí.
 */
export interface PiezaLegado {
    t: string;
    x: number;
    y: number;
    w: number;
    h: number;
    s?: Record<string, unknown>;
    opcional?: boolean;
}

const dock = (y: number, coleccion = "starseed"): PiezaLegado => ({
    t: "APP_LAUNCHER", x: 0, y, w: 12, h: 2, opcional: true,
    s: { variant: "folder", collection: coleccion, label: "Apps StarSeed", density: "compact" },
});
const q = (t: string, x: number, y: number, w: number, h: number, opcional = false): PiezaLegado =>
    ({ t, x, y, w, h, ...(opcional ? { opcional } : {}) });

/** Por categoría: nombre de la pestaña gen11 y sus variantes de huella (la actual y las viejas). */
export const LEGADO_GEN11: Record<string, { nombre: string; variantes: PiezaLegado[][] }> = {
    social: {
        nombre: "Inicio",
        variantes: [
            [q("CLOCK_DATE", 0, 0, 6, 5), q("MY_EVENTS", 6, 0, 6, 5), q("WEATHER_BASIC", 0, 5, 4, 4), q("TASKS_QUICK", 4, 5, 4, 4), q("QUICK_ACCESS", 8, 5, 3, 3), q("INTERNET_RADAR", 0, 9, 12, 5), q("NETWORK_FEED_MINI", 0, 14, 12, 6), dock(20)],
            // Antes de la Adenda 99 (sin el radar de internet): el feed iba justo debajo.
            [q("CLOCK_DATE", 0, 0, 6, 5), q("MY_EVENTS", 6, 0, 6, 5), q("WEATHER_BASIC", 0, 5, 4, 4), q("TASKS_QUICK", 4, 5, 4, 4), q("QUICK_ACCESS", 8, 5, 3, 3), q("NETWORK_FEED_MINI", 0, 9, 12, 6), dock(15)],
        ],
    },
    politica: { nombre: "Política", variantes: [[q("AGORA_CAUSAL", 0, 0, 5, 5), q("POLITICAL_SUMMARY", 5, 0, 4, 5), q("LIQUID_DELEGATION", 9, 0, 3, 5), q("ELDER_COUNCIL", 0, 5, 4, 4), q("RESTORATIVE_COURT", 4, 5, 4, 5), q("RELEVANT_POSTS", 8, 5, 4, 5), dock(10)]] },
    educacion: { nombre: "Educación", variantes: [[q("SKILL_TREE", 0, 0, 5, 5), q("LEARNING_PATH", 5, 0, 4, 5), q("ACTIVE_PROJECTS", 9, 0, 3, 5), q("UNIVERSAL_LIBRARY", 0, 5, 5, 5), q("MENTOR_MATCH", 5, 5, 4, 4), dock(10)]] },
    cultura: { nombre: "Cultura", variantes: [[q("CULTURAL_FEED", 0, 0, 8, 5), q("IMMERSION_PORTAL", 8, 0, 4, 5), q("MULTIVERSE_HUB", 0, 5, 4, 5), q("CREATIVE_STUDIO", 4, 5, 4, 4), q("RELEVANT_POSTS", 8, 5, 4, 5), dock(10), q("MUSIC_PLAYER", 0, 12, 4, 4, true), q("RADIO_LIVE", 4, 12, 4, 4, true)]] },
    economia: { nombre: "Economía", variantes: [[q("CARTERA_STARSEED", 0, 0, 5, 7), q("ECONOMIC_OVERVIEW", 5, 0, 4, 5), q("CALCULATOR", 9, 0, 3, 5), q("OIKOS_METABOLISM", 5, 5, 5, 5), q("ENERGY_GRID", 0, 7, 3, 4), q("BARTER_MARKET", 3, 7, 4, 4), q("ACTIVE_PROJECTS", 7, 9, 4, 4), dock(13)]] },
    clima: { nombre: "Clima", variantes: [[q("WEATHER_SPACE_SOLAR", 0, 0, 4, 4), q("WEATHER_HOLISTIC", 4, 0, 4, 8), q("WEATHER_SPACE_SCHUMANN", 8, 0, 4, 4), q("WEATHER_ASTRONOMY", 0, 4, 4, 2), q("WEATHER_WIND", 8, 4, 4, 2), q("WEATHER_TEMPERATURE", 0, 6, 2, 2), q("WEATHER_HUMIDITY", 2, 6, 2, 2), q("WEATHER_UV", 8, 6, 4, 2), q("WEATHER_AIR_QUALITY", 0, 8, 12, 2), dock(10), q("SPACE_WEATHER", 0, 12, 4, 4, true), q("OFFICIAL_DATA", 4, 12, 4, 4, true)]] },
    productividad: { nombre: "Productividad", variantes: [[q("FLOW_DIRECTOR", 0, 0, 4, 5), q("PROJECT_SWARM", 4, 0, 4, 5), q("COLLAB_PROJECTS", 8, 0, 4, 5), q("ACTIVE_PROJECTS", 0, 5, 4, 4), q("RECENT_ACTIVITY", 4, 5, 4, 4), q("ACTIVITY_SUMMARY", 0, 9, 4, 4), q("CALCULATOR", 8, 5, 4, 4), dock(13)]] },
    ubicacion: { nombre: "Ubicación", variantes: [[q("MAP_LOCATION", 0, 0, 7, 6), q("ABUNDANCE_RADAR", 7, 0, 5, 6), q("TRANSIT_FLOW", 0, 6, 6, 4), q("WEATHER_BASIC", 6, 6, 6, 4), dock(10)]] },
    utilidades: { nombre: "Utilidades", variantes: [[q("QUICK_ACCESS", 0, 0, 12, 4), q("CALCULATOR", 0, 4, 4, 4), q("NOTIFICATIONS", 4, 4, 4, 4), q("SYSTEM_STATUS", 8, 4, 4, 4), dock(8)]] },
    arte: { nombre: "Arte", variantes: [[q("CULTURAL_FEED", 0, 0, 12, 5), dock(5)]] },
    astronomia: { nombre: "Astronomía", variantes: [[q("WEATHER_HOLISTIC", 4, 0, 4, 6), q("WEATHER_ASTRONOMY", 0, 0, 4, 3), q("WEATHER_SPACE_SOLAR", 8, 0, 4, 3), q("WEATHER_SPACE_KP", 0, 3, 4, 3), q("WEATHER_SPACE_FLARE", 8, 3, 4, 3), q("WEATHER_SPACE_MAGNETOMETER", 0, 6, 6, 3), q("WEATHER_SPACE_SCHUMANN", 6, 6, 6, 3), dock(9), q("SPACE_WEATHER", 0, 11, 5, 5, true), q("OFFICIAL_DATA", 5, 11, 4, 4, true)]] },
    sistema: { nombre: "Sistema", variantes: [[q("LIVE_DATA", 0, 0, 6, 5), q("BRAINS", 6, 0, 4, 4), q("SOVEREIGN_NODE", 0, 5, 4, 4), q("UNIVERSAL_LIBRARY", 4, 5, 3, 4), dock(9, "sistema"), q("OFFICIAL_DATA", 0, 11, 4, 4, true)]] },
    personalizacion: { nombre: "Personalización", variantes: [[q("THEME_SELECTOR", 0, 0, 6, 4), q("THEME_MANAGER", 6, 0, 6, 4), dock(4), q("AUDIOMORPHIC_BG", 0, 6, 3, 4, true)]] },
    ia: { nombre: "IA", variantes: [[q("ASTRAURA_CORTEX", 0, 0, 5, 5), q("NEXUS_QUICK_ACCESS", 5, 0, 4, 5), q("MESSAGES", 9, 0, 3, 5), q("ORACLE_PREDICT", 0, 5, 5, 4), dock(9), q("OFFICIAL_DATA", 0, 11, 4, 4, true)]] },
    parlamento: { nombre: "Parlamento", variantes: [[q("AGORA_CAUSAL", 0, 0, 5, 5), q("LIQUID_DELEGATION", 5, 0, 3, 5), q("POLITICAL_SUMMARY", 8, 0, 4, 5), q("RELEVANT_POSTS", 0, 5, 12, 3), dock(8)]] },
    red: { nombre: "Red", variantes: [[q("EXPLORE_NETWORK", 0, 0, 12, 6), q("NOTIFICATIONS", 0, 6, 4, 4), q("MESSAGES", 4, 6, 4, 4), q("BADGES", 8, 6, 3, 3), dock(10)]] },
    explorador: { nombre: "Explorador", variantes: [[q("EXPLORE_NETWORK", 0, 0, 7, 5), q("MY_PAGES", 7, 0, 5, 5), q("SOCIAL_RADAR", 0, 5, 12, 3), dock(8)]] },
    creatividad: { nombre: "Creativo", variantes: [[q("RECENT_GALLERY", 0, 0, 6, 5), q("CAMERA_QUICK", 6, 0, 3, 3), q("CREATIVE_STUDIO", 9, 0, 3, 3), q("QUICK_NOTES", 0, 5, 4, 4), dock(9)]] },
};
