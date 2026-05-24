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
      page_members: {
        Row: {
          joined_at: string | null
          page_id: string
          profile_id: string
          role: string | null
        }
        Insert: {
          joined_at?: string | null
          page_id: string
          profile_id: string
          role?: string | null
        }
        Update: {
          joined_at?: string | null
          page_id?: string
          profile_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_members_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string | null
          governance: Json | null
          id: string
          tabs: Json | null
          title: string
          type: Database["public"]["Enums"]["page_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          governance?: Json | null
          id?: string
          tabs?: Json | null
          title: string
          type: Database["public"]["Enums"]["page_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          governance?: Json | null
          id?: string
          tabs?: Json | null
          title?: string
          type?: Database["public"]["Enums"]["page_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      posts: {
        Row: {
          author_id: string | null
          content: Json
          created_at: string | null
          id: string
          interactions: Json | null
          post_references: Json | null
          type: Database["public"]["Enums"]["post_type"]
          updated_at: string | null
          visibility: Database["public"]["Enums"]["visibility_type"]
        }
        Insert: {
          author_id?: string | null
          content?: Json
          created_at?: string | null
          id?: string
          interactions?: Json | null
          post_references?: Json | null
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_type"]
        }
        Update: {
          author_id?: string | null
          content?: Json
          created_at?: string | null
          id?: string
          interactions?: Json | null
          post_references?: Json | null
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_type"]
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          badges: Json | null
          created_at: string | null
          display_name: string | null
          handle: string
          id: string
          stats: Json | null
          type: Database["public"]["Enums"]["profile_type"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          badges?: Json | null
          created_at?: string | null
          display_name?: string | null
          handle: string
          id?: string
          stats?: Json | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          badges?: Json | null
          created_at?: string | null
          display_name?: string | null
          handle?: string
          id?: string
          stats?: Json | null
          type?: Database["public"]["Enums"]["profile_type"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      page_type: "COMMUNITY" | "ENTITY_FEDERATIVE" | "PARTY" | "PLACE" | "GROUP"
      post_type: "TEXT" | "GALLERY" | "CANVAS" | "EVENT" | "PROPOSAL"
      profile_type: "OFFICIAL" | "ARTISTIC" | "ANONYMOUS"
      visibility_type: "PUBLIC" | "PRIVATE" | "SEGMENTED"
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
