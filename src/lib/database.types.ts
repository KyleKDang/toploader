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
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
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
          time_zone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          time_zone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          time_zone?: string
        }
        Relationships: []
      }
      collection_entries: {
        Row: {
          card_variant_id: number
          condition: Database["public"]["Enums"]["card_condition"]
          created_at: string
          id: string
          quantity: number
          trader_id: string
        }
        Insert: {
          card_variant_id: number
          condition: Database["public"]["Enums"]["card_condition"]
          created_at?: string
          id?: string
          quantity: number
          trader_id: string
        }
        Update: {
          card_variant_id?: number
          condition?: Database["public"]["Enums"]["card_condition"]
          created_at?: string
          id?: string
          quantity?: number
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_entries_card_variant_id_fkey"
            columns: ["card_variant_id"]
            isOneToOne: false
            referencedRelation: "card_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_entries_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      founders: {
        Row: {
          created_at: string
          trader_id: string
        }
        Insert: {
          created_at?: string
          trader_id: string
        }
        Update: {
          created_at?: string
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "founders_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: true
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          id: string
          listing_id: string
          path: string
          position: number
          thumbnail_path: string
        }
        Insert: {
          id?: string
          listing_id: string
          path: string
          position: number
          thumbnail_path: string
        }
        Update: {
          id?: string
          listing_id?: string
          path?: string
          position?: number
          thumbnail_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "match_pairs"
            referencedColumns: ["listing_id"]
          },
        ]
      }
      listings: {
        Row: {
          asking_price_cents: number | null
          card_variant_id: number
          condition: Database["public"]["Enums"]["card_condition"]
          created_at: string
          id: string
          open_to_cash_offers: boolean
          status: Database["public"]["Enums"]["listing_status"]
          trader_id: string
          withdrawn_at: string | null
        }
        Insert: {
          asking_price_cents?: number | null
          card_variant_id: number
          condition: Database["public"]["Enums"]["card_condition"]
          created_at?: string
          id?: string
          open_to_cash_offers?: boolean
          status?: Database["public"]["Enums"]["listing_status"]
          trader_id: string
          withdrawn_at?: string | null
        }
        Update: {
          asking_price_cents?: number | null
          card_variant_id?: number
          condition?: Database["public"]["Enums"]["card_condition"]
          created_at?: string
          id?: string
          open_to_cash_offers?: boolean
          status?: Database["public"]["Enums"]["listing_status"]
          trader_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_card_variant_id_fkey"
            columns: ["card_variant_id"]
            isOneToOne: false
            referencedRelation: "card_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          created_at: string
          id: string
          lister_id: string
          listing_id: string
          wanter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lister_id: string
          listing_id: string
          wanter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lister_id?: string
          listing_id?: string
          wanter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_events_lister_id_fkey"
            columns: ["lister_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "match_pairs"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "match_events_wanter_id_fkey"
            columns: ["wanter_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          trade_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          trade_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          body: string
          channels: Database["public"]["Enums"]["notification_channel"][]
          claimed_at: string | null
          created_at: string
          email_sent_at: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          push_sent_at: string | null
          sent_at: string | null
          title: string
          topic: string
          trader_id: string
          url: string
        }
        Insert: {
          attempts?: number
          body: string
          channels?: Database["public"]["Enums"]["notification_channel"][]
          claimed_at?: string | null
          created_at?: string
          email_sent_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          push_sent_at?: string | null
          sent_at?: string | null
          title: string
          topic: string
          trader_id: string
          url: string
        }
        Update: {
          attempts?: number
          body?: string
          channels?: Database["public"]["Enums"]["notification_channel"][]
          claimed_at?: string | null
          created_at?: string
          email_sent_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          push_sent_at?: string | null
          sent_at?: string | null
          title?: string
          topic?: string
          trader_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          trader_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          trader_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
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
      trade_items: {
        Row: {
          listing_id: string
          trade_id: string
        }
        Insert: {
          listing_id: string
          trade_id: string
        }
        Update: {
          listing_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "match_pairs"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "trade_items_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      trades: {
        Row: {
          absent_trader_id: string | null
          accepted_at: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          id: string
          meetup_at: string | null
          meetup_reminded_at: string | null
          no_show_at: string | null
          proposer_cash_cents: number | null
          proposer_completed_at: string | null
          proposer_id: string
          recipient_cash_cents: number | null
          recipient_completed_at: string | null
          recipient_id: string
          responder_id: string | null
          safe_spot_id: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["trade_status"]
        }
        Insert: {
          absent_trader_id?: string | null
          accepted_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          meetup_at?: string | null
          meetup_reminded_at?: string | null
          no_show_at?: string | null
          proposer_cash_cents?: number | null
          proposer_completed_at?: string | null
          proposer_id: string
          recipient_cash_cents?: number | null
          recipient_completed_at?: string | null
          recipient_id: string
          responder_id?: string | null
          safe_spot_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["trade_status"]
        }
        Update: {
          absent_trader_id?: string | null
          accepted_at?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          meetup_at?: string | null
          meetup_reminded_at?: string | null
          no_show_at?: string | null
          proposer_cash_cents?: number | null
          proposer_completed_at?: string | null
          proposer_id?: string
          recipient_cash_cents?: number | null
          recipient_completed_at?: string | null
          recipient_id?: string
          responder_id?: string | null
          safe_spot_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["trade_status"]
        }
        Relationships: [
          {
            foreignKeyName: "trades_absent_trader_id_fkey"
            columns: ["absent_trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_safe_spot_id_fkey"
            columns: ["safe_spot_id"]
            isOneToOne: false
            referencedRelation: "safe_spots"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          created_at: string
          id: string
          id_document_path: string
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string
          status: Database["public"]["Enums"]["verification_status"]
          trader_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          id_document_path: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path: string
          status?: Database["public"]["Enums"]["verification_status"]
          trader_id: string
        }
        Update: {
          created_at?: string
          id?: string
          id_document_path?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string
          status?: Database["public"]["Enums"]["verification_status"]
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      wants: {
        Row: {
          card_id: number
          card_variant_id: number | null
          created_at: string
          id: string
          min_condition: Database["public"]["Enums"]["card_condition"] | null
          trader_id: string
        }
        Insert: {
          card_id: number
          card_variant_id?: number | null
          created_at?: string
          id?: string
          min_condition?: Database["public"]["Enums"]["card_condition"] | null
          trader_id: string
        }
        Update: {
          card_id?: number
          card_variant_id?: number | null
          created_at?: string
          id?: string
          min_condition?: Database["public"]["Enums"]["card_condition"] | null
          trader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wants_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wants_card_variant_id_card_id_fkey"
            columns: ["card_variant_id", "card_id"]
            isOneToOne: false
            referencedRelation: "card_variants"
            referencedColumns: ["id", "card_id"]
          },
          {
            foreignKeyName: "wants_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      collection_value: {
        Row: {
          copy_count: number | null
          total_cents: number | null
          trader_id: string | null
          unpriced_copy_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_entries_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      match_pairs: {
        Row: {
          card_id: number | null
          lister_id: string | null
          listing_id: string | null
          wanter_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_variants_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_trader_id_fkey"
            columns: ["lister_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wants_trader_id_fkey"
            columns: ["wanter_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          lister_id: string | null
          listing_id: string | null
          matched_at: string | null
          wanter_id: string | null
        }
        Insert: {
          lister_id?: string | null
          listing_id?: string | null
          matched_at?: string | null
          wanter_id?: string | null
        }
        Update: {
          lister_id?: string | null
          listing_id?: string | null
          matched_at?: string | null
          wanter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_events_lister_id_fkey"
            columns: ["lister_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "match_pairs"
            referencedColumns: ["listing_id"]
          },
          {
            foreignKeyName: "match_events_wanter_id_fkey"
            columns: ["wanter_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_trade: { Args: { trade_id: string }; Returns: undefined }
      add_to_collection: {
        Args: {
          card_variant_id: number
          condition: Database["public"]["Enums"]["card_condition"]
          quantity: number
        }
        Returns: string
      }
      add_want: {
        Args: {
          card_id: number
          card_variant_id?: number
          min_condition?: Database["public"]["Enums"]["card_condition"]
        }
        Returns: string
      }
      apply_catalog_set: {
        Args: { card_set: Json; cards: Json; prices: Json; sync_day: string }
        Returns: undefined
      }
      approve_verification: { Args: { request_id: string }; Returns: undefined }
      block_trader: { Args: { trader_id: string }; Returns: undefined }
      blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      cancel_trade: { Args: { trade_id: string }; Returns: undefined }
      claim_notifications: { Args: { batch?: number }; Returns: Json }
      compact_price_snapshots: {
        Args: { sync_day: string }
        Returns: undefined
      }
      complete_trade: { Args: { trade_id: string }; Returns: undefined }
      confirm_meetup: { Args: { trade_id: string }; Returns: undefined }
      counter_trade: {
        Args: {
          listing_ids: string[]
          offered_cash_cents?: number
          requested_cash_cents?: number
          trade_id: string
        }
        Returns: undefined
      }
      create_listing: {
        Args: {
          asking_price_cents?: number
          card_variant_id: number
          condition: Database["public"]["Enums"]["card_condition"]
          open_to_cash_offers?: boolean
          photos: Json
        }
        Returns: string
      }
      create_trade: {
        Args: {
          listing_ids: string[]
          offered_cash_cents?: number
          recipient_id: string
          requested_cash_cents?: number
        }
        Returns: string
      }
      decline_trade: { Args: { trade_id: string }; Returns: undefined }
      has_tapped_complete: {
        Args: {
          trade: Database["public"]["Tables"]["trades"]["Row"]
          trader: string
        }
        Returns: boolean
      }
      is_founder: { Args: never; Returns: boolean }
      mark_no_show: { Args: { trade_id: string }; Returns: undefined }
      mark_notification_sent: {
        Args: {
          channel: Database["public"]["Enums"]["notification_channel"]
          notification_id: string
        }
        Returns: undefined
      }
      meetup_reminder_lead: { Args: never; Returns: string }
      move_trade_listings: {
        Args: {
          status: Database["public"]["Enums"]["listing_status"]
          trade: Database["public"]["Tables"]["trades"]["Row"]
        }
        Returns: undefined
      }
      notification_channels: {
        Args: { kind: Database["public"]["Enums"]["notification_kind"] }
        Returns: Database["public"]["Enums"]["notification_channel"][]
      }
      other_trader: {
        Args: {
          trade: Database["public"]["Tables"]["trades"]["Row"]
          trader: string
        }
        Returns: string
      }
      propose_meetup: {
        Args: { meetup_at: string; safe_spot_id: string; trade_id: string }
        Returns: undefined
      }
      queue_meetup_notification: {
        Args: {
          body_format: string
          kind: Database["public"]["Enums"]["notification_kind"]
          recipient: string
          time_format: string
          title: string
          trade: Database["public"]["Tables"]["trades"]["Row"]
        }
        Returns: undefined
      }
      queue_meetup_notifications: {
        Args: {
          body_format: string
          kind: Database["public"]["Enums"]["notification_kind"]
          time_format: string
          title: string
          trade: Database["public"]["Tables"]["trades"]["Row"]
        }
        Returns: undefined
      }
      queue_meetup_reminders: { Args: never; Returns: undefined }
      refuse_deleted_trader: { Args: never; Returns: undefined }
      reject_verification: { Args: { request_id: string }; Returns: undefined }
      remove_from_collection: { Args: { entry_id: string }; Returns: undefined }
      remove_push_subscription: {
        Args: { endpoint: string }
        Returns: undefined
      }
      remove_want: { Args: { want_id: string }; Returns: undefined }
      require_deletable_account: {
        Args: { trader_id: string }
        Returns: undefined
      }
      require_trader: { Args: { verified: boolean }; Returns: string }
      require_turn: {
        Args: {
          caller: string
          trade: Database["public"]["Tables"]["trades"]["Row"]
        }
        Returns: undefined
      }
      save_push_subscription: {
        Args: { auth: string; endpoint: string; p256dh: string }
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
      send_message: {
        Args: { body: string; trade_id: string }
        Returns: string
      }
      set_collection_quantity: {
        Args: { entry_id: string; quantity: number }
        Returns: undefined
      }
      set_trade_terms: {
        Args: {
          author: string
          listing_ids: string[]
          offered_cash_cents?: number
          requested_cash_cents?: number
          trade: Database["public"]["Tables"]["trades"]["Row"]
        }
        Returns: undefined
      }
      set_trader_profile: {
        Args: { attests_adult: boolean; city_id: string; display_name: string }
        Returns: undefined
      }
      submit_verification: {
        Args: { id_document_path: string; selfie_path: string }
        Returns: string
      }
      trade_for_participant: {
        Args: { caller: string; trade_id: string }
        Returns: {
          absent_trader_id: string | null
          accepted_at: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          id: string
          meetup_at: string | null
          meetup_reminded_at: string | null
          no_show_at: string | null
          proposer_cash_cents: number | null
          proposer_completed_at: string | null
          proposer_id: string
          recipient_cash_cents: number | null
          recipient_completed_at: string | null
          recipient_id: string
          responder_id: string | null
          safe_spot_id: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["trade_status"]
        }
        SetofOptions: {
          from: "*"
          to: "trades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trade_has_ended: {
        Args: { status: Database["public"]["Enums"]["trade_status"] }
        Returns: boolean
      }
      unblock_trader: { Args: { trader_id: string }; Returns: undefined }
      unreferenced_listing_photos: {
        Args: { uploaded_before: string }
        Returns: {
          path: string
        }[]
      }
      unreferenced_verification_documents: {
        Args: { uploaded_before: string }
        Returns: {
          path: string
        }[]
      }
      verification_document_exists: { Args: { path: string }; Returns: boolean }
      verification_request_for_review: {
        Args: { request_id: string }
        Returns: {
          created_at: string
          id: string
          id_document_path: string
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string
          status: Database["public"]["Enums"]["verification_status"]
          trader_id: string
        }
        SetofOptions: {
          from: "*"
          to: "verification_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wake_notifier: { Args: never; Returns: undefined }
      withdraw_listing: { Args: { listing_id: string }; Returns: undefined }
    }
    Enums: {
      card_condition: "DMG" | "HP" | "MP" | "LP" | "NM"
      listing_status: "active" | "in_trade" | "traded" | "withdrawn"
      notification_channel: "push" | "email"
      notification_kind:
        | "new_match"
        | "new_proposal"
        | "proposal_accepted"
        | "proposal_countered"
        | "meetup_proposed"
        | "meetup_confirmed"
        | "meetup_reminder"
        | "chat_message"
        | "verification_result"
      safe_spot_kind: "police_station" | "monitored_site"
      trade_status:
        | "proposed"
        | "accepted"
        | "declined"
        | "scheduled"
        | "completed"
        | "cancelled"
        | "no_show"
      verification_status: "pending" | "approved" | "rejected"
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
      card_condition: ["DMG", "HP", "MP", "LP", "NM"],
      listing_status: ["active", "in_trade", "traded", "withdrawn"],
      notification_channel: ["push", "email"],
      notification_kind: [
        "new_match",
        "new_proposal",
        "proposal_accepted",
        "proposal_countered",
        "meetup_proposed",
        "meetup_confirmed",
        "meetup_reminder",
        "chat_message",
        "verification_result",
      ],
      safe_spot_kind: ["police_station", "monitored_site"],
      trade_status: [
        "proposed",
        "accepted",
        "declined",
        "scheduled",
        "completed",
        "cancelled",
        "no_show",
      ],
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const

