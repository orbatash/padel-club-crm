// Supabase database types for the `public` schema.
//
// Written in the exact shape `supabase gen types typescript` produces, from
// the live schema after migrations 20260928120000_customers_hardening and
// 20260929120000_lazuz_court_occupancy.
// Regenerate (overwrites this file) with:
//   supabase login        # once
//   npm run db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      court_occupancies: {
        Row: {
          court_id: string
          created_at: string
          customer_id: string | null
          ends_at: string
          id: string
          local_date: string
          occupancy_type: string
          reservation_id: string
          starts_at: string
        }
        Insert: {
          court_id: string
          created_at?: string
          customer_id?: string | null
          ends_at: string
          id?: string
          local_date: string
          occupancy_type: string
          reservation_id: string
          starts_at: string
        }
        Update: {
          court_id?: string
          created_at?: string
          customer_id?: string | null
          ends_at?: string
          id?: string
          local_date?: string
          occupancy_type?: string
          reservation_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'court_occupancies_court_id_fkey'
            columns: ['court_id']
            isOneToOne: false
            referencedRelation: 'courts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'court_occupancies_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'court_occupancies_reservation_id_fkey'
            columns: ['reservation_id']
            isOneToOne: false
            referencedRelation: 'court_reservations'
            referencedColumns: ['id']
          }
        ]
      }
      court_reservations: {
        Row: {
          booking_type: string
          canceled: boolean
          canceled_reason: string | null
          charging_type_id: number | null
          class_id: string | null
          client_external_id: string | null
          club_external_id: string | null
          court_id: string
          created_at: string
          customer_email_snapshot: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          customer_phone_e164: string | null
          end_date: string
          end_time: string
          event_description: string | null
          external_created_at: string | null
          external_id: string
          first_seen_at: string
          id: string
          is_paid: boolean | null
          is_recurring: boolean
          last_seen_at: string
          match_status: string
          matched_at: string | null
          occupancy_type: string
          parent_external_id: string | null
          price: number | null
          provider: string
          raw: Json
          recurrence_day_of_week: number | null
          start_date: string
          start_time: string
          status: string | null
          sync_state: string
          title: string | null
          updated_at: string
          user_subscription_id: string | null
        }
        Insert: {
          booking_type: string
          canceled?: boolean
          canceled_reason?: string | null
          charging_type_id?: number | null
          class_id?: string | null
          client_external_id?: string | null
          club_external_id?: string | null
          court_id: string
          created_at?: string
          customer_email_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_phone_e164?: string | null
          end_date: string
          end_time: string
          event_description?: string | null
          external_created_at?: string | null
          external_id: string
          first_seen_at?: string
          id?: string
          is_paid?: boolean | null
          is_recurring?: boolean
          last_seen_at?: string
          match_status: string
          matched_at?: string | null
          occupancy_type: string
          parent_external_id?: string | null
          price?: number | null
          provider?: string
          raw: Json
          recurrence_day_of_week?: number | null
          start_date: string
          start_time: string
          status?: string | null
          sync_state?: string
          title?: string | null
          updated_at?: string
          user_subscription_id?: string | null
        }
        Update: {
          booking_type?: string
          canceled?: boolean
          canceled_reason?: string | null
          charging_type_id?: number | null
          class_id?: string | null
          client_external_id?: string | null
          club_external_id?: string | null
          court_id?: string
          created_at?: string
          customer_email_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_phone_e164?: string | null
          end_date?: string
          end_time?: string
          event_description?: string | null
          external_created_at?: string | null
          external_id?: string
          first_seen_at?: string
          id?: string
          is_paid?: boolean | null
          is_recurring?: boolean
          last_seen_at?: string
          match_status?: string
          matched_at?: string | null
          occupancy_type?: string
          parent_external_id?: string | null
          price?: number | null
          provider?: string
          raw?: Json
          recurrence_day_of_week?: number | null
          start_date?: string
          start_time?: string
          status?: string | null
          sync_state?: string
          title?: string | null
          updated_at?: string
          user_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'court_reservations_court_id_fkey'
            columns: ['court_id']
            isOneToOne: false
            referencedRelation: 'courts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'court_reservations_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          }
        ]
      }
      courts: {
        Row: {
          club_external_id: string
          created_at: string
          external_id: string
          id: string
          indoor_outdoor: string | null
          is_active: boolean
          name: string
          provider: string
          raw: Json
          sport_type: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          club_external_id: string
          created_at?: string
          external_id: string
          id?: string
          indoor_outdoor?: string | null
          is_active?: boolean
          name: string
          provider?: string
          raw?: Json
          sport_type?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          club_external_id?: string
          created_at?: string
          external_id?: string
          id?: string
          indoor_outdoor?: string | null
          is_active?: boolean
          name?: string
          provider?: string
          raw?: Json
          sport_type?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_external_identities: {
        Row: {
          created_at: string
          customer_id: string
          external_id: string
          id: string
          matched_at: string
          matched_by: string
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          external_id: string
          id?: string
          matched_at?: string
          matched_by: string
          provider?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          external_id?: string
          id?: string
          matched_at?: string
          matched_by?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'customer_external_identities_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'customers'
            referencedColumns: ['id']
          }
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string
          instagram_username: string | null
          interests: string[]
          last_conversation_summary: string | null
          marketing_opt_in: boolean
          notes: string | null
          phone: string | null
          player_level: number | null
          source: string | null
          status: string
          tags: string[]
          updated_at: string
          updated_by: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          instagram_username?: string | null
          interests?: string[]
          last_conversation_summary?: string | null
          marketing_opt_in?: boolean
          notes?: string | null
          phone?: string | null
          player_level?: number | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          instagram_username?: string | null
          interests?: string[]
          last_conversation_summary?: string | null
          marketing_opt_in?: boolean
          notes?: string | null
          phone?: string | null
          player_level?: number | null
          source?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: []
      }
      integration_sync_runs: {
        Row: {
          created_count: number
          error: Json | null
          fetched_count: number
          finished_at: string | null
          id: string
          missing_count: number
          operation: string
          provider: string
          skipped_count: number
          started_at: string
          status: string
          updated_count: number
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          created_count?: number
          error?: Json | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          missing_count?: number
          operation: string
          provider: string
          skipped_count?: number
          started_at?: string
          status?: string
          updated_count?: number
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          created_count?: number
          error?: Json | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          missing_count?: number
          operation?: string
          provider?: string
          skipped_count?: number
          started_at?: string
          status?: string
          updated_count?: number
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_owner: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
