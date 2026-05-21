export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: string
          updated_at?: string
        }
      }
      synthetic_databases: {
        Row: {
          id: string
          user_id: string | null
          name: string
          db_type: string
          schema_json: Json
          data_json: Json
          row_count: number
          quality_score: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          db_type?: string
          schema_json?: Json
          data_json?: Json
          row_count?: number
          quality_score?: number | null
          status?: string
        }
        Update: {
          name?: string
          db_type?: string
          schema_json?: Json
          data_json?: Json
          row_count?: number
          quality_score?: number | null
          status?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string | null
          database_id: string | null
          title: string
          agent_mode: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          database_id?: string | null
          title?: string
          agent_mode?: string
          status?: string
        }
        Update: {
          database_id?: string | null
          title?: string
          agent_mode?: string
          status?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string
          sql_code: string | null
          agent_name: string | null
          reasoning_steps: Json
          options: Json | null
          tables_json: Json | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content?: string
          sql_code?: string | null
          agent_name?: string | null
          reasoning_steps?: Json
          options?: Json | null
          tables_json?: Json | null
          metadata?: Json
        }
        Update: {
          content?: string
          sql_code?: string | null
          reasoning_steps?: Json
          options?: Json | null
          metadata?: Json
        }
      }
      datasets: {
        Row: {
          id: string
          database_id: string
          name: string
          version: number
          format: string
          data_json: Json
          schema_json: Json
          row_count: number
          quality_score: number | null
          created_at: string
        }
        Insert: {
          id?: string
          database_id: string
          name: string
          version?: number
          format?: string
          data_json?: Json
          schema_json?: Json
          row_count?: number
          quality_score?: number | null
        }
      }
      api_keys: {
        Row: {
          id: string
          user_id: string | null
          name: string
          key_hash: string
          key_prefix: string
          permissions: Json
          last_used_at: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          key_hash: string
          key_prefix: string
          permissions?: Json
          expires_at?: string | null
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      database_status: 'draft' | 'generating' | 'ready' | 'error'
      conversation_status: 'active' | 'archived' | 'error'
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T] extends { Row: infer R } ? R : never
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T] extends { Insert: infer I } ? I : never
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T] extends { Update: infer U } ? U : never
