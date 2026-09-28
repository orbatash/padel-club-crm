// Supabase database types for the `public` schema.
//
// Written in the exact shape `supabase gen types typescript` produces, from
// the live schema after migration 20260928120000_customers_hardening.
// Regenerate (overwrites this file) with:
//   supabase login        # once
//   npm run db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
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
