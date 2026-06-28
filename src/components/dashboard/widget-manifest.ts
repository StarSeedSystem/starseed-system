// ════════════════════════════════════════════════════════════════
// Widget Manifest — single source of truth for sizing & metadata
// ----------------------------------------------------------------
// Each widget declares its minimum grid footprint (minW/minH in RGL
// cells) so the grid can prevent the user from shrinking it below the
// point where its internal layout stays coherent. Also declares a
// sensible default footprint, a label, the category it belongs to and
// the data domains it consumes. grid-area reads minW/minH from here.
// ════════════════════════════════════════════════════════════════

import type { WidgetType } from "./dashboard-types";
import type { WidgetDataKey } from "@/lib/widget-data/types";

export interface WidgetManifestEntry {
    label: string;
    /** category id (see widget-categories.ts) */
    category: string;
    /** default footprint when first dropped */
    w: number;
    h: number;
    /** hard minimums — grid will not allow smaller */
    minW: number;
    minH: number;
    /** optional maximums */
    maxW?: number;
    maxH?: number;
    /** data domains this widget reads (for prefetch / docs) */
    data?: WidgetDataKey[];
    /** relevance weight for default ordering (higher = more prominent) */
    relevance?: number;
}

// Fallback for legacy / un-declared widgets so the grid still has minimums.
export const DEFAULT_MANIFEST: Pick<WidgetManifestEntry, "minW" | "minH"> = { minW: 2, minH: 2 };

export const WIDGET_MANIFEST: Partial<Record<WidgetType, WidgetManifestEntry>> = {
    // ── Segunda generación ──────────────────────────────────────
    AGORA_CAUSAL: { label: "Ágora Causal", category: "ontocracia", w: 4, h: 5, minW: 3, minH: 4, data: ["politics.proposals"], relevance: 95 },
    LIQUID_DELEGATION: { label: "Delegación Líquida", category: "ontocracia", w: 3, h: 4, minW: 2, minH: 3, data: ["politics.delegations"], relevance: 80 },
    OIKOS_METABOLISM: { label: "Metabolismo Oikos", category: "economia", w: 4, h: 4, minW: 3, minH: 3, data: ["oikos.flow"], relevance: 90 },
    SKILL_TREE: { label: "Árbol de Habilidades", category: "educacion", w: 4, h: 5, minW: 3, minH: 4, data: ["education.skilltree"], relevance: 85 },
    ASTRAURA_CORTEX: { label: "Córtex Astraura", category: "ia", w: 4, h: 4, minW: 3, minH: 3, data: ["ai.astraura"], relevance: 92 },
    SOVEREIGN_NODE: { label: "Nodo Soberano", category: "sistema", w: 3, h: 4, minW: 2, minH: 3, data: ["system.node"], relevance: 70 },
    AKASHIC_CODEX: { label: "Códice Akáshico", category: "archivos", w: 4, h: 4, minW: 3, minH: 3, data: ["files.codex"], relevance: 75 },
    NATAL_CHART: { label: "Sincronía Vital", category: "astrologia", w: 3, h: 5, minW: 3, minH: 4, data: ["astro.natal"], relevance: 60 },
    MESH_RADAR: { label: "Radar Mesh", category: "sistema", w: 3, h: 4, minW: 3, minH: 3, data: ["network.mesh"], relevance: 65 },
    IMMERSION_PORTAL: { label: "Portales de Inmersión", category: "entretenimiento", w: 4, h: 4, minW: 3, minH: 3, data: ["entertainment.worlds"], relevance: 68 },

    // ── Tercera generación: oleada Política/Ontocracia ──
    CIVIC_ALCHEMY: { label: "Alquimia Cívica", category: "ontocracia", w: 4, h: 5, minW: 3, minH: 4, data: ["politics.initiatives"], relevance: 86 },
    VITAL_FLOW_AUDIT: { label: "Auditoría de Flujo Vital", category: "ontocracia", w: 4, h: 5, minW: 3, minH: 4, data: ["politics.treasury"], relevance: 84 },
    SOCIAL_RESONANCE: { label: "Resonancia Social", category: "ontocracia", w: 4, h: 4, minW: 3, minH: 3, data: ["politics.resonance"], relevance: 83 },

    // ── Oleada Economía/Ecología ──
    GIFT_AGORA: { label: "Ágora del Don", category: "economia", w: 4, h: 5, minW: 3, minH: 3, data: ["oikos.gifts"], relevance: 87 },
    COMMONS_MATRIX: { label: "Patrimonio Común", category: "economia", w: 4, h: 4, minW: 3, minH: 3, data: ["oikos.commons"], relevance: 81 },
    FOOD_ORACLE: { label: "Soberanía Alimentaria", category: "economia", w: 4, h: 5, minW: 3, minH: 4, data: ["oikos.food"], relevance: 85 },
    REGEN_TRACER: { label: "Huella Regenerativa", category: "economia", w: 4, h: 4, minW: 3, minH: 3, data: ["oikos.regen"], relevance: 79 },

    // ── Cuarta generación: cobertura final del catálogo ──
    ELDER_COUNCIL: { label: "Consejo de Sabios", category: "ontocracia", w: 4, h: 4, minW: 3, minH: 3, data: ["politics.council"], relevance: 80 },
    RESTORATIVE_COURT: { label: "Tribunal Restaurativo", category: "ontocracia", w: 4, h: 5, minW: 3, minH: 4, data: ["politics.justice"], relevance: 77 },
    BARTER_MARKET: { label: "Mercado de Trueque", category: "economia", w: 4, h: 4, minW: 3, minH: 3, data: ["oikos.barter"], relevance: 82 },
    ENERGY_GRID: { label: "Energía Comunal", category: "economia", w: 4, h: 4, minW: 3, minH: 3, data: ["oikos.energy"], relevance: 83 },
    MENTOR_MATCH: { label: "Mentoría Híbrida", category: "educacion", w: 4, h: 4, minW: 3, minH: 3, data: ["education.mentors"], relevance: 74 },
    UNIVERSAL_LIBRARY: { label: "Biblioteca Universal", category: "educacion", w: 4, h: 5, minW: 3, minH: 4, data: ["education.library"], relevance: 78 },
    MULTIVERSE_HUB: { label: "Multiverso", category: "cultura", w: 4, h: 5, minW: 3, minH: 4, data: ["culture.multiverse"], relevance: 73 },
    CREATIVE_STUDIO: { label: "Estudio Creativo", category: "cultura", w: 4, h: 4, minW: 3, minH: 3, data: ["culture.studio"], relevance: 71 },
    ORACLE_PREDICT: { label: "Oráculo Predictivo", category: "ia", w: 4, h: 4, minW: 3, minH: 3, data: ["ai.oracle"], relevance: 86 },
    IDENTITY_VAULT: { label: "Bóveda de Identidad", category: "sistema", w: 4, h: 4, minW: 3, minH: 3, data: ["system.identity"], relevance: 67 },
    ENERGY_MAP: { label: "Mapa de Energía", category: "astrologia", w: 4, h: 4, minW: 3, minH: 3, data: ["astro.energy"], relevance: 63 },

    // ── Quinta generación: cobertura ampliada del catálogo ──
    FLOW_DIRECTOR: { label: "Director de Flujo Vital", category: "productividad", w: 4, h: 5, minW: 3, minH: 4, data: ["productivity.flow"], relevance: 84 },
    PROJECT_SWARM: { label: "Enjambre de Propósitos", category: "productividad", w: 4, h: 4, minW: 3, minH: 3, data: ["productivity.swarm"], relevance: 80 },
    ABUNDANCE_RADAR: { label: "Radar de Abundancia", category: "ubicacion", w: 4, h: 4, minW: 3, minH: 3, data: ["location.resources"], relevance: 79 },
    TRANSIT_FLOW: { label: "Tránsito Orgánico", category: "ubicacion", w: 4, h: 4, minW: 3, minH: 3, data: ["location.transit"], relevance: 72 },
    MAP_LOCATION: { label: "Mapa", category: "ubicacion", w: 5, h: 6, minW: 3, minH: 4, relevance: 90 },
    CRYPTO_SHIELD: { label: "Escudo Ontológico", category: "privacidad", w: 4, h: 4, minW: 3, minH: 3, data: ["privacy.shield"], relevance: 70 },
    HABITAT_CORE: { label: "Simbiosis Habitacional", category: "dispositivos", w: 4, h: 5, minW: 3, minH: 4, data: ["devices.habitat"], relevance: 73 },
    SERENDIPITY_LENS: { label: "Lente de Serendipia", category: "descubrimientos", w: 4, h: 4, minW: 3, minH: 3, data: ["discovery.serendipity"], relevance: 71 },
    IDEA_FORGE: { label: "Incubadora de Quimeras", category: "creatividad", w: 4, h: 5, minW: 3, minH: 4, data: ["creativity.ideas"], relevance: 69 },
    MERIT_GALLERY: { label: "Cristalería de Mérito", category: "perfil", w: 4, h: 5, minW: 3, minH: 4, data: ["profile.merit"], relevance: 75 },
    SOCIETY_PULSE: { label: "Pulso del Organismo", category: "sociedad", w: 4, h: 4, minW: 3, minH: 3, data: ["society.cohesion"], relevance: 67 },

    // ── Primera generación (mínimos para que no se rompan) ───────
    ECONOMIC_OVERVIEW: { label: "Pulso Económico", category: "economia", w: 3, h: 5, minW: 2, minH: 4, data: ["common.metrics"], relevance: 88 },
    CARTERA_STARSEED: { label: "Cartera StarSeed", category: "economia", w: 3, h: 5, minW: 2, minH: 4, relevance: 87 },
    EXPLORE_NETWORK: { label: "Explorar Red", category: "descubrimientos", w: 4, h: 4, minW: 3, minH: 3, relevance: 78 },
    POLITICAL_SUMMARY: { label: "Resumen Político", category: "ontocracia", w: 3, h: 4, minW: 2, minH: 3, relevance: 82 },
    LEARNING_PATH: { label: "Ruta de Aprendizaje", category: "educacion", w: 3, h: 4, minW: 2, minH: 3, relevance: 72 },
    SOCIAL_RADAR: { label: "Radar Social", category: "descubrimientos", w: 3, h: 4, minW: 2, minH: 3, relevance: 66 },
    CULTURAL_FEED: { label: "Feed Cultural", category: "cultura", w: 4, h: 5, minW: 2, minH: 3, data: ["common.feed"], relevance: 76 },
    RECENT_ACTIVITY: { label: "Actividad Reciente", category: "descubrimientos", w: 3, h: 4, minW: 2, minH: 3, data: ["common.feed"], relevance: 64 },
    MESSAGES: { label: "Mensajes", category: "comunicacion", w: 3, h: 4, minW: 2, minH: 3, relevance: 74 },
    NOTIFICATIONS: { label: "Notificaciones", category: "comunicacion", w: 2, h: 3, minW: 2, minH: 2, relevance: 62 },
    SYSTEM_STATUS: { label: "Estado del Sistema", category: "sistema", w: 3, h: 3, minW: 2, minH: 2, data: ["system.node"], relevance: 55 },
    LIVE_DATA: { label: "Datos en Vivo", category: "sistema", w: 3, h: 3, minW: 2, minH: 2, relevance: 50 },
    CALCULATOR: { label: "Calculadora", category: "ayudantia", w: 3, h: 5, minW: 2, minH: 4, relevance: 40 },
    WELLNESS: { label: "Bienestar", category: "ayudantia", w: 3, h: 4, minW: 2, minH: 3, relevance: 58 },
    THEME_SELECTOR: { label: "Selector de Tema", category: "ciberdelia", w: 3, h: 3, minW: 2, minH: 2, relevance: 30 },
    THEME_MANAGER: { label: "Gestor de Temas", category: "ciberdelia", w: 4, h: 4, minW: 3, minH: 3, relevance: 28 },
    AI_GENERATED: { label: "Widget IA", category: "ciberdelia", w: 3, h: 4, minW: 2, minH: 2, relevance: 45 },

    // ── Launcher de apps / carpetas ──────────────────────────────
    APP_LAUNCHER: { label: "Apps StarSeed", category: "aplicaciones", w: 6, h: 3, minW: 2, minH: 2, relevance: 96 },
    UNIVERSAL_OPENER: { label: "Visor Universal", category: "aplicaciones", w: 4, h: 5, minW: 3, minH: 4, relevance: 94 },

    // ── Media center ─────────────────────────────────────────────
    MUSIC_PLAYER: { label: "Reproductor", category: "entretenimiento", w: 4, h: 4, minW: 3, minH: 3, relevance: 90 },
    OMNIFRECUENCIAS: { label: "Omnifrecuencias", category: "entretenimiento", w: 4, h: 5, minW: 3, minH: 4, relevance: 88 },
    RADIO_LIVE: { label: "Radio en vivo", category: "entretenimiento", w: 4, h: 4, minW: 3, minH: 3, relevance: 84 },
    AUDIOMORPHIC_BG: { label: "Audiomorphic", category: "entretenimiento", w: 3, h: 4, minW: 3, minH: 4, relevance: 86 },
    MEDIA_CONTROL: { label: "Control de Medios", category: "entretenimiento", w: 4, h: 6, minW: 3, minH: 4, relevance: 91 },

    // ── Datos oficiales en tiempo real ───────────────────────────
    OFFICIAL_DATA: { label: "Datos Oficiales", category: "descubrimientos", w: 4, h: 4, minW: 2, minH: 3, relevance: 89 },
    SPACE_WEATHER: { label: "Clima Espacial", category: "astronomia", w: 4, h: 4, minW: 2, minH: 3, relevance: 90 },

    // ── VR/AR ────────────────────────────────────────────────────
    IMMERSIVE: { label: "Espacio Inmersivo", category: "ciberdelia", w: 4, h: 5, minW: 3, minH: 4, relevance: 92 },

    // ── Áreas del SOSD con datos reales en vivo ──────────────────
    MY_EVENTS: { label: "Eventos", category: "social", w: 3, h: 5, minW: 2, minH: 3, relevance: 86 },
    MY_GROUPS: { label: "Mis Grupos", category: "social", w: 3, h: 5, minW: 2, minH: 3, relevance: 85 },
    COMMUNITIES: { label: "Comunidades", category: "social", w: 3, h: 5, minW: 2, minH: 3, relevance: 84 },
    FEDERATED_ENTITIES: { label: "Entidades Federativas", category: "red", w: 3, h: 5, minW: 2, minH: 3, relevance: 76 },
    MEMORIES: { label: "Memorias", category: "archivos", w: 3, h: 5, minW: 2, minH: 3, relevance: 80 },
    BRAINS: { label: "Cerebros", category: "ia", w: 3, h: 5, minW: 2, minH: 3, relevance: 82 },
    VAULTS: { label: "Baúles", category: "sistema", w: 3, h: 5, minW: 2, minH: 3, relevance: 74 },
    DOCUMENTS: { label: "Archivos", category: "archivos", w: 3, h: 5, minW: 2, minH: 3, relevance: 78 },
};

export function getManifest(type: WidgetType): WidgetManifestEntry | undefined {
    return WIDGET_MANIFEST[type];
}

/** Returns {minW,minH,maxW,maxH} for the grid, always with safe defaults. */
export function getSizeConstraints(type: WidgetType): { minW: number; minH: number; maxW?: number; maxH?: number } {
    const m = WIDGET_MANIFEST[type];
    return {
        minW: m?.minW ?? DEFAULT_MANIFEST.minW,
        minH: m?.minH ?? DEFAULT_MANIFEST.minH,
        maxW: m?.maxW,
        maxH: m?.maxH,
    };
}
