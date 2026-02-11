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
    | 'THEME_MANAGER';

export interface Dashboard {
    id: string;
    profile_id: string;
    name: string;
    is_default: boolean;
    created_at: string;
    updated_at: string;
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
    updated_at: string;
}
