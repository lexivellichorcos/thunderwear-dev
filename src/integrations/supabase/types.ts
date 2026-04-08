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
      ai_conversations: {
        Row: {
          ai_response: string
          conversation_type: string
          created_at: string
          id: string
          user_feedback: number | null
          user_id: string
          weather_data: Json | null
        }
        Insert: {
          ai_response: string
          conversation_type: string
          created_at?: string
          id?: string
          user_feedback?: number | null
          user_id: string
          weather_data?: Json | null
        }
        Update: {
          ai_response?: string
          conversation_type?: string
          created_at?: string
          id?: string
          user_feedback?: number | null
          user_id?: string
          weather_data?: Json | null
        }
        Relationships: []
      }
      emergency_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_type: string
          created_at: string
          dismissed: boolean | null
          emergency_guidance: Json | null
          expires_at: string | null
          id: string
          location: string
          risk_level: string
          severity: string
          user_id: string
          weather_data: Json | null
        }
        Insert: {
          acknowledged?: boolean | null
          alert_type: string
          created_at?: string
          dismissed?: boolean | null
          emergency_guidance?: Json | null
          expires_at?: string | null
          id?: string
          location: string
          risk_level: string
          severity: string
          user_id: string
          weather_data?: Json | null
        }
        Update: {
          acknowledged?: boolean | null
          alert_type?: string
          created_at?: string
          dismissed?: boolean | null
          emergency_guidance?: Json | null
          expires_at?: string | null
          id?: string
          location?: string
          risk_level?: string
          severity?: string
          user_id?: string
          weather_data?: Json | null
        }
        Relationships: []
      }
      favorite_locations: {
        Row: {
          created_at: string
          id: string
          is_default: boolean | null
          latitude: number | null
          location_string: string
          longitude: number | null
          name: string
          notification_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          location_string: string
          longitude?: number | null
          name: string
          notification_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          location_string?: string
          longitude?: number | null
          name?: string
          notification_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      forecast_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: number
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: number
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: number
        }
        Relationships: []
      }
      kalshi_credentials: {
        Row: {
          api_key_id: string
          created_at: string
          id: string
          private_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          id?: string
          private_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          id?: string
          private_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kalshi_forecast_accuracy: {
        Row: {
          actual_settlement_result: boolean | null
          actual_temp: number | null
          city: string
          created_at: string
          edge: number | null
          forecast_timestamp: string
          id: string
          lead_time_hours: number | null
          market_price: number | null
          position_id: string | null
          predicted_probability: number | null
          predicted_temp: number | null
          side: string
          station_id: string
          target_settlement_time: string
          temp_error: number | null
          ticker: string
        }
        Insert: {
          actual_settlement_result?: boolean | null
          actual_temp?: number | null
          city: string
          created_at?: string
          edge?: number | null
          forecast_timestamp?: string
          id?: string
          lead_time_hours?: number | null
          market_price?: number | null
          position_id?: string | null
          predicted_probability?: number | null
          predicted_temp?: number | null
          side: string
          station_id: string
          target_settlement_time: string
          temp_error?: number | null
          ticker: string
        }
        Update: {
          actual_settlement_result?: boolean | null
          actual_temp?: number | null
          city?: string
          created_at?: string
          edge?: number | null
          forecast_timestamp?: string
          id?: string
          lead_time_hours?: number | null
          market_price?: number | null
          position_id?: string | null
          predicted_probability?: number | null
          predicted_temp?: number | null
          side?: string
          station_id?: string
          target_settlement_time?: string
          temp_error?: number | null
          ticker?: string
        }
        Relationships: []
      }
      kalshi_positions: {
        Row: {
          created_at: string
          entry_price: number
          entry_time: string
          exit_price: number | null
          exit_time: string | null
          id: string
          peak_pnl: number | null
          pnl: number | null
          side: string
          size: number
          status: string
          std_dev: number | null
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_price: number
          entry_time?: string
          exit_price?: number | null
          exit_time?: string | null
          id?: string
          peak_pnl?: number | null
          pnl?: number | null
          side: string
          size: number
          status?: string
          std_dev?: number | null
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_price?: number
          entry_time?: string
          exit_price?: number | null
          exit_time?: string | null
          id?: string
          peak_pnl?: number | null
          pnl?: number | null
          side?: string
          size?: number
          status?: string
          std_dev?: number | null
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nws_timestamps: {
        Row: {
          created_at: string
          id: string
          last_timestamp: string
          station_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_timestamp: string
          station_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_timestamp?: string
          station_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prob_calibration_log: {
        Row: {
          bin_label: string
          created_at: string
          date: string
          effective_sd: number
          hours_remaining: number | null
          id: string
          kalshi_prob: number
          mean_temp: number
          station_id: string
          tw_prob: number
        }
        Insert: {
          bin_label: string
          created_at?: string
          date: string
          effective_sd: number
          hours_remaining?: number | null
          id?: string
          kalshi_prob: number
          mean_temp: number
          station_id: string
          tw_prob: number
        }
        Update: {
          bin_label?: string
          created_at?: string
          date?: string
          effective_sd?: number
          hours_remaining?: number | null
          id?: string
          kalshi_prob?: number
          mean_temp?: number
          station_id?: string
          tw_prob?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          id: string
          location: string | null
          social_links: Json | null
          updated_at: string
          user_id: string
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          location?: string | null
          social_links?: Json | null
          updated_at?: string
          user_id: string
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          location?: string | null
          social_links?: Json | null
          updated_at?: string
          user_id?: string
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      source_variances: {
        Row: {
          id: string
          metric: string
          sample_size: number | null
          source: string
          updated_at: string | null
          variance: number
        }
        Insert: {
          id?: string
          metric: string
          sample_size?: number | null
          source: string
          updated_at?: string | null
          variance: number
        }
        Update: {
          id?: string
          metric?: string
          sample_size?: number | null
          source?: string
          updated_at?: string | null
          variance?: number
        }
        Relationships: []
      }
      station_biases: {
        Row: {
          bias: number
          id: string
          metric: string
          sample_size: number | null
          season: string | null
          station_id: string
          updated_at: string | null
        }
        Insert: {
          bias: number
          id?: string
          metric: string
          sample_size?: number | null
          season?: string | null
          station_id: string
          updated_at?: string | null
        }
        Update: {
          bias?: number
          id?: string
          metric?: string
          sample_size?: number | null
          season?: string | null
          station_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_agents: {
        Row: {
          auto_trade: boolean
          created_at: string
          id: string
          max_position_pct: number
          risk_level: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_trade?: boolean
          created_at?: string
          id?: string
          max_position_pct?: number
          risk_level?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_trade?: boolean
          created_at?: string
          id?: string
          max_position_pct?: number
          risk_level?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          name: string
          request_count: number
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          request_count?: number
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          name?: string
          request_count?: number
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          clothing_schedule: Json | null
          cold_tolerance: number | null
          commute_duration: number | null
          commute_enabled: boolean | null
          commute_from_address: string | null
          commute_from_lat: number | null
          commute_from_lng: number | null
          commute_method: string | null
          commute_to_address: string | null
          commute_to_lat: number | null
          commute_to_lng: number | null
          created_at: string
          distance_unit: string | null
          feedback_count: number | null
          gender: string | null
          heat_tolerance: number | null
          id: string
          location: string | null
          preferred_clothing_style: string | null
          rain_sensitivity: number | null
          temperature_unit: string | null
          updated_at: string
          user_id: string
          wind_tolerance: number | null
          work_schedule_end: string | null
          work_schedule_start: string | null
        }
        Insert: {
          clothing_schedule?: Json | null
          cold_tolerance?: number | null
          commute_duration?: number | null
          commute_enabled?: boolean | null
          commute_from_address?: string | null
          commute_from_lat?: number | null
          commute_from_lng?: number | null
          commute_method?: string | null
          commute_to_address?: string | null
          commute_to_lat?: number | null
          commute_to_lng?: number | null
          created_at?: string
          distance_unit?: string | null
          feedback_count?: number | null
          gender?: string | null
          heat_tolerance?: number | null
          id?: string
          location?: string | null
          preferred_clothing_style?: string | null
          rain_sensitivity?: number | null
          temperature_unit?: string | null
          updated_at?: string
          user_id: string
          wind_tolerance?: number | null
          work_schedule_end?: string | null
          work_schedule_start?: string | null
        }
        Update: {
          clothing_schedule?: Json | null
          cold_tolerance?: number | null
          commute_duration?: number | null
          commute_enabled?: boolean | null
          commute_from_address?: string | null
          commute_from_lat?: number | null
          commute_from_lng?: number | null
          commute_method?: string | null
          commute_to_address?: string | null
          commute_to_lat?: number | null
          commute_to_lng?: number | null
          created_at?: string
          distance_unit?: string | null
          feedback_count?: number | null
          gender?: string | null
          heat_tolerance?: number | null
          id?: string
          location?: string | null
          preferred_clothing_style?: string | null
          rain_sensitivity?: number | null
          temperature_unit?: string | null
          updated_at?: string
          user_id?: string
          wind_tolerance?: number | null
          work_schedule_end?: string | null
          work_schedule_start?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          has_seen_preferences_modal: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_seen_preferences_modal?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_seen_preferences_modal?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weather_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          location: string | null
          rating: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type: string
          id?: string
          location?: string | null
          rating: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          location?: string | null
          rating?: string
          user_id?: string
        }
        Relationships: []
      }
      weather_predictions: {
        Row: {
          actual_precip_mm: number | null
          actual_rain_occurred: boolean | null
          actual_temp: number | null
          actual_temp_high: number | null
          actual_temp_low: number | null
          confidence_interval_high: number | null
          confidence_interval_low: number | null
          created_at: string
          id: string
          location: string
          predicted_at: string
          predicted_precip_mm: number | null
          predicted_rain_chance: number | null
          predicted_temp: number | null
          predicted_temp_high: number | null
          predicted_temp_low: number | null
          prediction_type: string
          source_services: Json | null
          std_dev: number | null
          target_time: string
          temp_abs_error: number | null
          temp_error: number | null
          user_id: string | null
          verified_at: string | null
          within_confidence_interval: boolean | null
        }
        Insert: {
          actual_precip_mm?: number | null
          actual_rain_occurred?: boolean | null
          actual_temp?: number | null
          actual_temp_high?: number | null
          actual_temp_low?: number | null
          confidence_interval_high?: number | null
          confidence_interval_low?: number | null
          created_at?: string
          id?: string
          location: string
          predicted_at?: string
          predicted_precip_mm?: number | null
          predicted_rain_chance?: number | null
          predicted_temp?: number | null
          predicted_temp_high?: number | null
          predicted_temp_low?: number | null
          prediction_type: string
          source_services?: Json | null
          std_dev?: number | null
          target_time: string
          temp_abs_error?: number | null
          temp_error?: number | null
          user_id?: string | null
          verified_at?: string | null
          within_confidence_interval?: boolean | null
        }
        Update: {
          actual_precip_mm?: number | null
          actual_rain_occurred?: boolean | null
          actual_temp?: number | null
          actual_temp_high?: number | null
          actual_temp_low?: number | null
          confidence_interval_high?: number | null
          confidence_interval_low?: number | null
          created_at?: string
          id?: string
          location?: string
          predicted_at?: string
          predicted_precip_mm?: number | null
          predicted_rain_chance?: number | null
          predicted_temp?: number | null
          predicted_temp_high?: number | null
          predicted_temp_low?: number | null
          prediction_type?: string
          source_services?: Json | null
          std_dev?: number | null
          target_time?: string
          temp_abs_error?: number | null
          temp_error?: number | null
          user_id?: string | null
          verified_at?: string | null
          within_confidence_interval?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      prediction_accuracy_summary: {
        Row: {
          error_std_dev: number | null
          location: string | null
          mean_absolute_error: number | null
          mean_error: number | null
          pct_within_ci: number | null
          prediction_type: string | null
          target_date: string | null
          total_predictions: number | null
          verified_predictions: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
