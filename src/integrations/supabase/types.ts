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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      yt_api_keys: {
        Row: {
          api_key: string
          consecutive_errors: number
          created_at: string
          daily_quota: number
          error_type: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_error_at: string | null
          last_used_at: string | null
          name: string
          quota_exceeded_at: string | null
        }
        Insert: {
          api_key: string
          consecutive_errors?: number
          created_at?: string
          daily_quota?: number
          error_type?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          name: string
          quota_exceeded_at?: string | null
        }
        Update: {
          api_key?: string
          consecutive_errors?: number
          created_at?: string
          daily_quota?: number
          error_type?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          name?: string
          quota_exceeded_at?: string | null
        }
        Relationships: []
      }
      yt_channels: {
        Row: {
          brand_cluster: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          network_group: string | null
          updated_at: string
          uploads_playlist_id: string | null
          youtube_channel_id: string | null
          youtube_url: string
        }
        Insert: {
          brand_cluster?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          network_group?: string | null
          updated_at?: string
          uploads_playlist_id?: string | null
          youtube_channel_id?: string | null
          youtube_url: string
        }
        Update: {
          brand_cluster?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          network_group?: string | null
          updated_at?: string
          uploads_playlist_id?: string | null
          youtube_channel_id?: string | null
          youtube_url?: string
        }
        Relationships: []
      }
      yt_scan_channel_status: {
        Row: {
          channel_id: string
          created_at: string
          error_message: string | null
          id: string
          scan_id: string
          status: string
          streams_found: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          scan_id: string
          status?: string
          streams_found?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          scan_id?: string
          status?: string
          streams_found?: number
        }
        Relationships: []
      }
      yt_scan_channel_summary: {
        Row: {
          average_peak_per_stream: number
          channel_id: string
          created_at: string
          highest_concurrent: number
          id: string
          number_of_streams: number
          scan_id: string
          total_concurrent_views: number
        }
        Insert: {
          average_peak_per_stream?: number
          channel_id: string
          created_at?: string
          highest_concurrent?: number
          id?: string
          number_of_streams?: number
          scan_id: string
          total_concurrent_views?: number
        }
        Update: {
          average_peak_per_stream?: number
          channel_id?: string
          created_at?: string
          highest_concurrent?: number
          id?: string
          number_of_streams?: number
          scan_id?: string
          total_concurrent_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "yt_scan_channel_summary_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "yt_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yt_scan_channel_summary_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "yt_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      yt_scan_keyword_stats: {
        Row: {
          avg_concurrent_views: number
          created_at: string
          id: string
          keyword: string
          scan_id: string
          total_concurrent_views: number
          usage_count: number
        }
        Insert: {
          avg_concurrent_views?: number
          created_at?: string
          id?: string
          keyword: string
          scan_id: string
          total_concurrent_views?: number
          usage_count?: number
        }
        Update: {
          avg_concurrent_views?: number
          created_at?: string
          id?: string
          keyword?: string
          scan_id?: string
          total_concurrent_views?: number
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "yt_scan_keyword_stats_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "yt_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      yt_scan_tag_stats: {
        Row: {
          avg_concurrent_views: number
          created_at: string
          id: string
          scan_id: string
          tag: string
          total_concurrent_views: number
          usage_count: number
        }
        Insert: {
          avg_concurrent_views?: number
          created_at?: string
          id?: string
          scan_id: string
          tag: string
          total_concurrent_views?: number
          usage_count?: number
        }
        Update: {
          avg_concurrent_views?: number
          created_at?: string
          id?: string
          scan_id?: string
          tag?: string
          total_concurrent_views?: number
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "yt_scan_tag_stats_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "yt_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      yt_scans: {
        Row: {
          created_at: string
          id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      yt_stream_scan_metrics: {
        Row: {
          concurrent_viewers: number
          created_at: string
          id: string
          is_live: boolean
          like_count: number | null
          scan_id: string
          stream_id: string
          view_count: number | null
        }
        Insert: {
          concurrent_viewers?: number
          created_at?: string
          id?: string
          is_live?: boolean
          like_count?: number | null
          scan_id: string
          stream_id: string
          view_count?: number | null
        }
        Update: {
          concurrent_viewers?: number
          created_at?: string
          id?: string
          is_live?: boolean
          like_count?: number | null
          scan_id?: string
          stream_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "yt_stream_scan_metrics_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "yt_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yt_stream_scan_metrics_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "yt_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      yt_streams: {
        Row: {
          channel_id: string
          created_at: string
          description: string | null
          first_seen_scan_id: string
          id: string
          language: string | null
          tags: Json | null
          title: string
          updated_at: string
          video_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          description?: string | null
          first_seen_scan_id: string
          id?: string
          language?: string | null
          tags?: Json | null
          title: string
          updated_at?: string
          video_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          description?: string | null
          first_seen_scan_id?: string
          id?: string
          language?: string | null
          tags?: Json | null
          title?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yt_streams_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "yt_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yt_streams_first_seen_scan_id_fkey"
            columns: ["first_seen_scan_id"]
            isOneToOne: false
            referencedRelation: "yt_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      yt_vod_keyword_stats: {
        Row: {
          avg_engagement_rate: number | null
          avg_likes: number
          avg_views: number
          created_at: string
          id: string
          keyword: string
          scan_id: string
          total_likes: number
          total_views: number
          usage_count: number
        }
        Insert: {
          avg_engagement_rate?: number | null
          avg_likes?: number
          avg_views?: number
          created_at?: string
          id?: string
          keyword: string
          scan_id: string
          total_likes?: number
          total_views?: number
          usage_count?: number
        }
        Update: {
          avg_engagement_rate?: number | null
          avg_likes?: number
          avg_views?: number
          created_at?: string
          id?: string
          keyword?: string
          scan_id?: string
          total_likes?: number
          total_views?: number
          usage_count?: number
        }
        Relationships: []
      }
      yt_vod_metrics: {
        Row: {
          comment_count: number | null
          created_at: string
          favorite_count: number | null
          id: string
          like_count: number | null
          scan_id: string
          video_id: string
          view_count: number
        }
        Insert: {
          comment_count?: number | null
          created_at?: string
          favorite_count?: number | null
          id?: string
          like_count?: number | null
          scan_id: string
          video_id: string
          view_count?: number
        }
        Update: {
          comment_count?: number | null
          created_at?: string
          favorite_count?: number | null
          id?: string
          like_count?: number | null
          scan_id?: string
          video_id?: string
          view_count?: number
        }
        Relationships: []
      }
      yt_vod_scan_channel_status: {
        Row: {
          channel_id: string
          created_at: string
          error_message: string | null
          error_type: string | null
          id: string
          last_video_published_at: string | null
          scan_id: string
          status: string
          videos_fetched: number
          videos_requested: number
        }
        Insert: {
          channel_id: string
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          last_video_published_at?: string | null
          scan_id: string
          status?: string
          videos_fetched?: number
          videos_requested?: number
        }
        Update: {
          channel_id?: string
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          last_video_published_at?: string | null
          scan_id?: string
          status?: string
          videos_fetched?: number
          videos_requested?: number
        }
        Relationships: []
      }
      yt_vod_scan_video_status: {
        Row: {
          channel_id: string
          created_at: string
          error_message: string | null
          id: string
          scan_id: string
          status: string
          video_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          scan_id: string
          status?: string
          video_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          scan_id?: string
          status?: string
          video_id?: string
        }
        Relationships: []
      }
      yt_vod_scans: {
        Row: {
          api_keys_exhausted: number
          api_keys_used: number
          channels_failed: number
          channels_partial: number
          channels_succeeded: number
          completion_reason: string | null
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          id: string
          is_complete: boolean
          is_resumable: boolean | null
          last_processed_channel_index: number | null
          notes: string | null
          scan_type: string
          total_videos_fetched: number
          total_videos_requested: number
          videos_per_channel: number
        }
        Insert: {
          api_keys_exhausted?: number
          api_keys_used?: number
          channels_failed?: number
          channels_partial?: number
          channels_succeeded?: number
          completion_reason?: string | null
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          is_complete?: boolean
          is_resumable?: boolean | null
          last_processed_channel_index?: number | null
          notes?: string | null
          scan_type?: string
          total_videos_fetched?: number
          total_videos_requested?: number
          videos_per_channel?: number
        }
        Update: {
          api_keys_exhausted?: number
          api_keys_used?: number
          channels_failed?: number
          channels_partial?: number
          channels_succeeded?: number
          completion_reason?: string | null
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          is_complete?: boolean
          is_resumable?: boolean | null
          last_processed_channel_index?: number | null
          notes?: string | null
          scan_type?: string
          total_videos_fetched?: number
          total_videos_requested?: number
          videos_per_channel?: number
        }
        Relationships: []
      }
      yt_vod_tag_stats: {
        Row: {
          avg_engagement_rate: number | null
          avg_views: number
          created_at: string
          id: string
          scan_id: string
          tag: string
          total_likes: number
          total_views: number
          usage_count: number
        }
        Insert: {
          avg_engagement_rate?: number | null
          avg_views?: number
          created_at?: string
          id?: string
          scan_id: string
          tag: string
          total_likes?: number
          total_views?: number
          usage_count?: number
        }
        Update: {
          avg_engagement_rate?: number | null
          avg_views?: number
          created_at?: string
          id?: string
          scan_id?: string
          tag?: string
          total_likes?: number
          total_views?: number
          usage_count?: number
        }
        Relationships: []
      }
      yt_vod_videos: {
        Row: {
          category_id: string | null
          channel_id: string
          created_at: string
          default_audio_language: string | null
          description: string | null
          duration: string | null
          duration_seconds: number | null
          first_seen_scan_id: string
          has_captions: boolean | null
          id: string
          is_deleted: boolean
          is_licensed_content: boolean | null
          language: string | null
          last_updated_at: string
          privacy_status: string | null
          published_at: string
          tags: Json | null
          thumbnail_url: string | null
          title: string
          video_id: string
        }
        Insert: {
          category_id?: string | null
          channel_id: string
          created_at?: string
          default_audio_language?: string | null
          description?: string | null
          duration?: string | null
          duration_seconds?: number | null
          first_seen_scan_id: string
          has_captions?: boolean | null
          id?: string
          is_deleted?: boolean
          is_licensed_content?: boolean | null
          language?: string | null
          last_updated_at?: string
          privacy_status?: string | null
          published_at: string
          tags?: Json | null
          thumbnail_url?: string | null
          title: string
          video_id: string
        }
        Update: {
          category_id?: string | null
          channel_id?: string
          created_at?: string
          default_audio_language?: string | null
          description?: string | null
          duration?: string | null
          duration_seconds?: number | null
          first_seen_scan_id?: string
          has_captions?: boolean | null
          id?: string
          is_deleted?: boolean
          is_licensed_content?: boolean | null
          language?: string | null
          last_updated_at?: string
          privacy_status?: string | null
          published_at?: string
          tags?: Json | null
          thumbnail_url?: string | null
          title?: string
          video_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_first_user: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
