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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Update: {
          name?: string
          version?: number
          format?: string
          data_json?: Json
          schema_json?: Json
          row_count?: number
          quality_score?: number | null
        }
        Relationships: []
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
        Update: {
          user_id?: string | null
          name?: string
          key_hash?: string
          key_prefix?: string
          permissions?: Json
          last_used_at?: string | null
          expires_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      merge_generation_flush: {
        Args: {
          p_database_id: string
          p_table_name: string
          p_rows: Json
          p_row_count: number
        }
        Returns: undefined
      }
    }
    Enums: {
      database_status: 'draft' | 'generating' | 'ready' | 'error' | 'archived'
      conversation_status: 'active' | 'archived' | 'error' | 'deleted'
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
