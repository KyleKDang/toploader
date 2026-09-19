export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      card_sets: {
        Row: {
          abbreviation: string | null
          id: number
          name: string
          released_on: string | null
          synced_as_of: string
          tcgplayer_group_id: number
        }
        Insert: {
          abbreviation?: string | null
          id?: never
          name: string
          released_on?: string | null
          synced_as_of: string
          tcgplayer_group_id: number
        }
        Update: {
          abbreviation?: string | null
          id?: never
          name?: string
          released_on?: string | null
          synced_as_of?: string
          tcgplayer_group_id?: number
        }
        Relationships: []
      }
      card_variants: {
        Row: {
          card_id: number
          id: number
          market_price_as_of: string | null
          market_price_cents: number | null
          name: string
        }
        Insert: {
          card_id: number
          id?: never
          market_price_as_of?: string | null
          market_price_cents?: number | null
          name: string
        }
        Update: {
          card_id?: number
          id?: never
          market_price_as_of?: string | null
          market_price_cents?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_variants_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          card_set_id: number
          id: number
          image_url: string | null
          name: string
          number: string
          rarity: string | null
          tcgplayer_product_id: number
        }
        Insert: {
          card_set_id: number
          id?: never
          image_url?: string | null
          name: string
          number: string
          rarity?: string | null
          tcgplayer_product_id: number
        }
        Update: {
          card_set_id?: number
          id?: never
          image_url?: string | null
          name?: string
          number?: string
          rarity?: string | null
          tcgplayer_product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cards_card_set_id_fkey"
            columns: ["card_set_id"]
            isOneToOne: false
            referencedRelation: "card_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      price_snapshots: {
        Row: {
          as_of: string
          card_variant_id: number
          market_price_cents: number
        }
        Insert: {
          as_of: string
          card_variant_id: number
          market_price_cents: number
        }
        Update: {
          as_of?: string
          card_variant_id?: number
          market_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_snapshots_card_variant_id_fkey"
            columns: ["card_variant_id"]
            isOneToOne: false
            referencedRelation: "card_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      safe_spots: {
        Row: {
          address: string
          city_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["safe_spot_kind"]
          name: string
          notes: string | null
        }
        Insert: {
          address: string
          city_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["safe_spot_kind"]
          name: string
          notes?: string | null
        }
        Update: {
          address?: string
          city_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["safe_spot_kind"]
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safe_spots_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      trader_private: {
        Row: {
          adult_attested_at: string | null
          trader_id: string
        }
        Insert: {
          adult_attested_at?: string | null
          trader_id: string
        }
        Update: {
          adult_attested_at?: string | null
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trader_private_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: true
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      traders: {
        Row: {
          banned_at: string | null
          cancellation_count: number
          city_id: string | null
          completed_trade_count: number
          created_at: string
          display_name: string | null
          feedback_down_count: number
          feedback_up_count: number
          id: string
          no_show_count: number
          verified_at: string | null
        }
        Insert: {
          banned_at?: string | null
          cancellation_count?: number
          city_id?: string | null
          completed_trade_count?: number
          created_at?: string
          display_name?: string | null
          feedback_down_count?: number
          feedback_up_count?: number
          id: string
          no_show_count?: number
          verified_at?: string | null
        }
        Update: {
          banned_at?: string | null
          cancellation_count?: number
          city_id?: string | null
          completed_trade_count?: number
          created_at?: string
          display_name?: string | null
          feedback_down_count?: number
          feedback_up_count?: number
          id?: string
          no_show_count?: number
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traders_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_catalog_set: {
        Args: { card_set: Json; cards: Json; prices: Json; sync_day: string }
        Returns: undefined
      }
      compact_price_snapshots: {
        Args: { sync_day: string }
        Returns: undefined
      }
      search_cards: {
        Args: { query: string }
        Returns: {
          card_set_id: number
          id: number
          image_url: string | null
          name: string
          number: string
          rarity: string | null
          tcgplayer_product_id: number
        }[]
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_trader_profile: {
        Args: { attests_adult: boolean; city_id: string; display_name: string }
        Returns: undefined
      }
    }
    Enums: {
      safe_spot_kind: "police_station" | "monitored_site"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      safe_spot_kind: ["police_station", "monitored_site"],
    },
  },
} as const

