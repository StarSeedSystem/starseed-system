import { describe, it, expect } from "vitest";
import { WIDGET_MANIFEST, DEFAULT_MANIFEST } from "../widget-manifest";
import { MIN_SEGURO } from "../calidad-widget";
import type { WidgetType } from "../dashboard-types";

// ════════════════════════════════════════════════════════════════
// Test de completitud del manifiesto: ningún WidgetType puede
// quedarse sin entrada (huérfano). Un widget huérfano cae al
// DEFAULT_MANIFEST {minW:2,minH:2} y el usuario puede encogerlo
// hasta romperle la maquetación (Ola 305).
// ════════════════════════════════════════════════════════════════

// Lista exhaustiva de valores de WidgetType, derivada de la unión literal
// de dashboard-types.ts. Si alguien añade un tipo nuevo y lo olvida aquí,
// el test de «tipos declarados vs unión» de abajo lo destapa porque el
// array se comprueba contra el catálogo completo de add-widget-dialog.
const TODOS_LOS_TIPOS: WidgetType[] = [
    // ── Primera generación ──
    "EXPLORE_NETWORK", "MY_PAGES", "POLITICAL_SUMMARY", "LEARNING_PATH",
    "SOCIAL_RADAR", "WELLNESS", "THEME_SELECTOR", "COLLAB_PROJECTS",
    "LIVE_DATA", "SYSTEM_STATUS", "RECENT_ACTIVITY", "QUICK_ACCESS",
    "ACTIVITY_SUMMARY", "NEXUS_QUICK_ACCESS", "THEME_MANAGER",
    // ── Familia clima terrestre ──
    "WEATHER_BASIC", "WEATHER_TEMPERATURE", "WEATHER_UV", "WEATHER_WIND",
    "WEATHER_HUMIDITY", "WEATHER_AIR_QUALITY",
    // ── Familia clima espacial ──
    "WEATHER_SPACE_SOLAR", "WEATHER_SPACE_SCHUMANN", "WEATHER_SPACE_KP",
    "WEATHER_SPACE_MAGNETOMETER", "WEATHER_SPACE_FLARE", "WEATHER_SPACE",
    "WEATHER_ASTRONOMY", "WEATHER_HOLISTIC",
    // ── Social / cultura ──
    "CULTURAL_FEED", "CALCULATOR", "RELEVANT_POSTS", "MESSAGES",
    "NOTIFICATIONS", "ECONOMIC_OVERVIEW", "CARTERA_STARSEED",
    "ACTIVE_PROJECTS",
    // ── Segunda generación ──
    "AGORA_CAUSAL", "LIQUID_DELEGATION", "OIKOS_METABOLISM", "SKILL_TREE",
    "ASTRAURA_CORTEX", "SOVEREIGN_NODE", "AKASHIC_CODEX", "NATAL_CHART",
    "MESH_RADAR", "INTERNET_RADAR", "IMMERSION_PORTAL",
    // ── Tercera generación ──
    "CIVIC_ALCHEMY", "VITAL_FLOW_AUDIT", "SOCIAL_RESONANCE",
    // ── Oleada Economía/Ecología ──
    "GIFT_AGORA", "COMMONS_MATRIX", "FOOD_ORACLE", "REGEN_TRACER",
    // ── Cuarta generación ──
    "ELDER_COUNCIL", "RESTORATIVE_COURT", "BARTER_MARKET", "ENERGY_GRID",
    "MENTOR_MATCH", "UNIVERSAL_LIBRARY", "MULTIVERSE_HUB", "CREATIVE_STUDIO",
    "ORACLE_PREDICT", "IDENTITY_VAULT", "ENERGY_MAP",
    // ── Quinta generación ──
    "FLOW_DIRECTOR", "PROJECT_SWARM", "ABUNDANCE_RADAR", "TRANSIT_FLOW",
    "MAP_LOCATION", "CRYPTO_SHIELD", "HABITAT_CORE", "SERENDIPITY_LENS",
    "IDEA_FORGE", "MERIT_GALLERY", "SOCIETY_PULSE",
    // ── Launcher / media / datos / VR ──
    "APP_LAUNCHER", "UNIVERSAL_OPENER", "MUSIC_PLAYER", "OMNIFRECUENCIAS",
    "RADIO_LIVE", "AUDIOMORPHIC_BG", "MEDIA_CONTROL", "OFFICIAL_DATA",
    "SPACE_WEATHER", "IMMERSIVE",
    // ── Áreas del SOSD con datos reales ──
    "MY_EVENTS", "MY_GROUPS", "COMMUNITIES", "FEDERATED_ENTITIES",
    "MEMORIES", "BRAINS", "VAULTS", "DOCUMENTS", "RECENT_GALLERY",
    "CAMERA_QUICK", "AI_GENERATED",
    // ── Sexta oleada ──
    "CLOCK_DATE", "TASKS_QUICK", "QUICK_NOTES", "AURORA_LAST", "BADGES",
    "NETWORK_FEED_MINI",
];

describe("WIDGET_MANIFEST completitud", () => {
    it("todo WidgetType tiene entrada en el manifiesto (ningún huérfano)", () => {
        const huerfanos = TODOS_LOS_TIPOS.filter((t) => !WIDGET_MANIFEST[t]);
        expect(
            `Tipos sin entrada en WIDGET_MANIFEST: ${huerfanos.join(", ") || "ninguno"}`
        ).toBe("Tipos sin entrada en WIDGET_MANIFEST: ninguno");
    });

    it("la lista de tipos cubre la unión completa de WidgetType sin repetidos", () => {
        const unicos = new Set(TODOS_LOS_TIPOS);
        expect(unicos.size).toBe(TODOS_LOS_TIPOS.length);
        // Cobertura: cada clave declarada en el manifiesto existe como tipo.
        for (const clave of Object.keys(WIDGET_MANIFEST)) {
            expect(unicos.has(clave as WidgetType)).toBe(true);
        }
    });
});

describe("WIDGET_MANIFEST coherencia de tamaños", () => {
    it("ninguna entrada tiene minW/minH mayores que w/h", () => {
        const malas: string[] = [];
        for (const [tipo, entry] of Object.entries(WIDGET_MANIFEST)) {
            if (!entry) continue;
            if (entry.minW > entry.w || entry.minH > entry.h) malas.push(tipo);
        }
        expect(
            `Entradas con mínimos mayores que el tamaño por defecto: ${malas.join(", ") || "ninguna"}`
        ).toBe("Entradas con mínimos mayores que el tamaño por defecto: ninguna");
    });

    it("ninguna entrada tiene maxW menor que minW (ni maxH menor que minH)", () => {
        const malas: string[] = [];
        for (const [tipo, entry] of Object.entries(WIDGET_MANIFEST)) {
            if (!entry) continue;
            if (entry.maxW !== undefined && entry.maxW < entry.minW) malas.push(tipo);
            if (entry.maxH !== undefined && entry.maxH < entry.minH) malas.push(tipo);
        }
        expect(
            `Entradas con máximos menores que los mínimos: ${malas.join(", ") || "ninguna"}`
        ).toBe("Entradas con máximos menores que los mínimos: ninguna");
    });

    it("la familia WEATHER respeta MIN_SEGURO salvo los medidores de una cifra (2×2) declarados", () => {
        // Regla de la Ola 305 para las entradas nuevas: minW/minH nunca por
        // debajo de MIN_SEGURO (3×3), salvo los medidores de una sola cifra,
        // que sí funcionan en 2×2 (comentario junto a ellos en el manifiesto).
        // El legado de 1ª generación (NOTIFICATIONS, CLOCK_DATE…) queda fuera:
        // son widgets pequeños por diseño y cambiar sus mínimos rompería
        // dashboards guardados.
        const MEDIDORES_2X2 = new Set<WidgetType>([
            "WEATHER_TEMPERATURE", "WEATHER_UV", "WEATHER_HUMIDITY",
            "WEATHER_WIND", "WEATHER_SPACE_KP",
        ]);
        const malas: string[] = [];
        for (const tipo of TODOS_LOS_TIPOS) {
            if (!tipo.startsWith("WEATHER_")) continue;
            const entry = WIDGET_MANIFEST[tipo];
            if (!entry) continue;
            const respeta = entry.minW >= MIN_SEGURO.minW && entry.minH >= MIN_SEGURO.minH;
            if (!MEDIDORES_2X2.has(tipo) && !respeta) malas.push(tipo);
        }
        expect(
            `Widgets WEATHER por debajo de MIN_SEGURO sin ser medidor 2×2: ${malas.join(", ") || "ninguno"}`
        ).toBe("Widgets WEATHER por debajo de MIN_SEGURO sin ser medidor 2×2: ninguno");
    });
});
