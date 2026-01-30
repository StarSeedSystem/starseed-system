export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "14.1"
    }
    public: {
        Tables: {
            dashboard_widgets: {
                Row: {
                    created_at: string | null
                    dashboard_id: string
                    id: string
                    layout: Json
                    settings: Json | null
                    updated_at: string | null
                    widget_type: Database["public"]["Enums"]["widget_type"]
                }
                Insert: {
                    created_at?: string | null
                    dashboard_id: string
                    id?: string
                    layout?: Json
                    settings?: Json | null
                    updated_at?: string | null
                    widget_type: Database["public"]["Enums"]["widget_type"]
                }
                Update: {
                    created_at?: string | null
                    dashboard_id?: string
                    id?: string
                    layout?: Json
                    settings?: Json | null
                    updated_at?: string | null
                    widget_type?: Database["public"]["Enums"]["widget_type"]
                }
                Relationships: [
                    {
                        foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
                        columns: ["dashboard_id"]
                        isOneToOne: false
                        referencedRelation: "dashboards"
                        referencedColumns: ["id"]
                    },
                ]
            }
            dashboards: {
                Row: {
                    created_at: string | null
                    id: string
                    is_default: boolean | null
                    name: string
                    profile_id: string
                    updated_at: string | null
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    is_default?: boolean | null
                    name: string
                    profile_id: string
                    updated_at?: string | null
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    is_default?: boolean | null
                    name?: string
                    profile_id?: string
                    updated_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "dashboards_profile_id_fkey"
                        columns: ["profile_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            profiles: {
                Row: {
                    avatar_url: string | null
                    bio: string | null
                    created_at: string | null
                    full_name: string | null
                    id: string
                    updated_at: string | null
                    username: string | null
                    website: string | null
                }
                Insert: {
                    avatar_url?: string | null
                    bio?: string | null
                    created_at?: string | null
                    full_name?: string | null
                    id: string
                    updated_at?: string | null
                    username?: string | null
                    website?: string | null
                }
                Update: {
                    avatar_url?: string | null
                    bio?: string | null
                    created_at?: string | null
                    full_name?: string | null
                    id?: string
                    updated_at?: string | null
                    username?: string | null
                    website?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "profiles_id_fkey"
                        columns: ["id"]
                        isOneToOne: true
                        referencedRelation: "users"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            page_type: ["COMMUNITY", "ENTITY_FEDERATIVE", "PARTY", "PLACE", "GROUP"]
            post_type: ["TEXT", "GALLERY", "CANVAS", "EVENT", "PROPOSAL"]
            profile_type: ["OFFICIAL", "ARTISTIC", "ANONYMOUS"]
            visibility_type: ["PUBLIC", "PRIVATE", "SEGMENTED"]
            widget_type: [
                "EXPLORE_NETWORK",
                "MY_PAGES",
                "POLITICAL_SUMMARY",
                "LEARNING_PATH",
                "SOCIAL_RADAR",
                "WELLNESS",
                "COLLAB_PROJECTS",
                "LIVE_DATA",
            ]
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
    TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof Database
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
    public: {
        Enums: {
            page_type: ["COMMUNITY", "ENTITY_FEDERATIVE", "PARTY", "PLACE", "GROUP"],
            post_type: ["TEXT", "GALLERY", "CANVAS", "EVENT", "PROPOSAL"],
            profile_type: ["OFFICIAL", "ARTISTIC", "ANONYMOUS"],
            visibility_type: ["PUBLIC", "PRIVATE", "SEGMENTED"],
            widget_type: [
                "EXPLORE_NETWORK",
                "MY_PAGES",
                "POLITICAL_SUMMARY",
                "LEARNING_PATH",
                "SOCIAL_RADAR",
                "WELLNESS",
                "COLLAB_PROJECTS",
                "LIVE_DATA",
            ],
        },
    },
} as const
