export type WidgetType =
    | 'EXPLORE_NETWORK'
    | 'MY_PAGES'
    | 'POLITICAL_SUMMARY'
    | 'LEARNING_PATH'
    | 'SOCIAL_RADAR'
    | 'WELLNESS'
    | 'THEME_SELECTOR'
    | 'COLLAB_PROJECTS'
    | 'LIVE_DATA'
    | 'SYSTEM_STATUS'
    | 'RECENT_ACTIVITY'
    | 'NEXUS_QUICK_ACCESS'
    | 'THEME_MANAGER'
    | 'WEATHER_BASIC'         // Mixed Minimal
    | 'WEATHER_TEMPERATURE'
    | 'WEATHER_UV'
    | 'WEATHER_WIND'
    | 'WEATHER_HUMIDITY'
    | 'WEATHER_AIR_QUALITY'
    | 'WEATHER_SPACE_SOLAR'
    | 'WEATHER_SPACE_SCHUMANN'
    | 'WEATHER_SPACE_KP'
    | 'WEATHER_SPACE_MAGNETOMETER'
    | 'WEATHER_SPACE_FLARE'
    | 'WEATHER_SPACE' // Legacy type mapping
    | 'WEATHER_ASTRONOMY'
    | 'WEATHER_HOLISTIC'      // All combined 3D Sphere
    | 'CULTURAL_FEED'
    | 'CALCULATOR'
    | 'RELEVANT_POSTS'
    | 'MESSAGES'
    | 'NOTIFICATIONS'
    | 'ECONOMIC_OVERVIEW'
    | 'CARTERA_STARSEED'      // Economía — Cartera StarSeed (cuenta soberana unificada: semillas + granos + bolsa)
    | 'ACTIVE_PROJECTS'
    // ── Segunda generación: widgets adaptativos (kit + capa de datos) ──
    | 'AGORA_CAUSAL'          // Política — propuestas / votación causal
    | 'LIQUID_DELEGATION'     // Política — voto delegado líquido
    | 'OIKOS_METABOLISM'      // Economía/Ecología — metabolismo del hogar
    | 'SKILL_TREE'            // Educación — árbol de habilidades
    | 'ASTRAURA_CORTEX'       // IA — exocórtex Astraura
    | 'SOVEREIGN_NODE'        // Sistema — nodo soberano
    | 'AKASHIC_CODEX'         // Archivos — códice akáshico
    | 'NATAL_CHART'           // Astrología — sincronía vital
    | 'MESH_RADAR'            // Red — radar mesh
    | 'IMMERSION_PORTAL'      // Entretenimiento — portales inmersivos
    // ── Tercera generación: oleada Política/Ontocracia ──
    | 'CIVIC_ALCHEMY'         // Política — transmutador de quejas a iniciativas
    | 'VITAL_FLOW_AUDIT'      // Política — auditoría de flujo vital (transparencia)
    | 'SOCIAL_RESONANCE'      // Política — termómetro de resonancia social
    // ── Oleada Economía/Ecología ──
    | 'GIFT_AGORA'            // Economía — Ágora del Don (distribución libre)
    | 'COMMONS_MATRIX'        // Economía — Matriz de Patrimonio Común
    | 'FOOD_ORACLE'           // Ecología — Oráculo de Soberanía Alimentaria
    | 'REGEN_TRACER'          // Ecología — Trazador de Ciclo Vital / Huella Regenerativa
    // ── Cuarta generación: cobertura final del catálogo ──
    | 'ELDER_COUNCIL'         // Ontocracia — Consejo de Sabios (meritocracia del entendimiento)
    | 'RESTORATIVE_COURT'     // Ontocracia — Tribunal Restaurativo (Círculos de Paz)
    | 'BARTER_MARKET'         // Economía — Mercado de Trueque
    | 'ENERGY_GRID'           // Economía — Energía Comunal (microred)
    | 'MENTOR_MATCH'          // Educación — Mentoría Híbrida (humano + IA)
    | 'UNIVERSAL_LIBRARY'     // Educación — Biblioteca Universal
    | 'MULTIVERSE_HUB'        // Cultura — Multiverso (mundos inmersivos)
    | 'CREATIVE_STUDIO'       // Cultura — Estudio Creativo
    | 'ORACLE_PREDICT'        // IA — Oráculo Predictivo
    | 'IDENTITY_VAULT'        // Sistema — Bóveda de Identidad Soberana
    | 'ENERGY_MAP'            // Astrología/Bienestar — Mapa de Energía
    // ── Quinta generación: cobertura ampliada del catálogo ──
    | 'FLOW_DIRECTOR'         // Productividad — Director de Flujo Vital (energía circadiana)
    | 'PROJECT_SWARM'         // Productividad — Enjambre de Propósitos
    | 'ABUNDANCE_RADAR'       // Ubicación — Radar de Nodos de Abundancia
    | 'TRANSIT_FLOW'          // Ubicación — Topología de Tránsito Orgánico
    | 'MAP_LOCATION'          // Ubicación — Mapa real interactivo (OpenStreetMap)
    | 'CRYPTO_SHIELD'         // Privacidad — Escudo Ontológico (membrana criptográfica)
    | 'HABITAT_CORE'          // Dispositivos — Núcleo de Simbiosis Habitacional
    | 'SERENDIPITY_LENS'      // Descubrimientos — Lente de Serendipia
    | 'IDEA_FORGE'            // Creatividad — Incubadora de Quimeras
    | 'MERIT_GALLERY'         // Perfil — Cristalería de Mérito y Abundancia
    | 'SOCIETY_PULSE'         // Sociedad — Monitor de Cohesión Macro-Social
    // ── Launcher: apps, carpetas y programas en el dashboard ──
    | 'APP_LAUNCHER'          // Aplicaciones — carpeta/tile de apps StarSeed y módulos del OS
    | 'UNIVERSAL_OPENER'      // Aplicaciones — abridor universal de archivos y contenido
    // ── Media center ──
    | 'MUSIC_PLAYER'          // Entretenimiento — reproductor con biblioteca y cola
    | 'OMNIFRECUENCIAS'       // Entretenimiento — generador de frecuencias funcionales (WebAudio)
    | 'RADIO_LIVE'            // Entretenimiento — radio en vivo (streaming)
    | 'AUDIOMORPHIC_BG'       // Entretenimiento — Audiomorphic como fondo del sistema
    | 'MEDIA_CONTROL'         // Entretenimiento — centro de control de medios + salida
    // ── Datos oficiales en tiempo real ──
    | 'OFFICIAL_DATA'         // Descubrimientos — fuentes oficiales en vivo (clima, espacio, sismos)
    | 'SPACE_WEATHER'         // Astronomía — clima espacial NOAA SWPC en tiempo real (reactivo)
    | 'AI_GENERATED';         // 🔮 La Fragua de Interfaces — Custom AI-forged widgets

export interface Dashboard {
    id: string;
    profile_id: string;
    name: string;
    is_default: boolean;
    category?: string;  // Links to WidgetCategory id
    created_at: string;
    updated_at: string;
}

export interface AiWidgetSettings {
    customHtml: string;
    forgePrompt: string;
    ontology: {
        title: string;
        description: string;
        themeColor: string;
    };
    widgetConfig: {
        opacity: number;
        blur: number;
        borderRadius: number;
        glowIntensity: number;
        scale: number;
        rotateX: number;
        rotateY: number;
        animationStiffness: number;
        animationDamping: number;
    };
    selectedLayout: string;
    selectedImage?: string;
}

export interface DashboardWidget {
    id: string;
    dashboard_id: string;
    widget_type: WidgetType;
    layout: {
        x: number;
        y: number;
        w: number;
        h: number;
        i?: string;
    };
    settings: Record<string, any>;
    created_at: string;
    updated_at?: string;
    // Pinnable widget support
    isPinned?: boolean;
    pinnedPosition?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
