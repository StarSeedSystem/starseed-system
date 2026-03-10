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
    | 'ACTIVE_PROJECTS'
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
