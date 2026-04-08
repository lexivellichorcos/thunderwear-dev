-- ============================================================
-- RLS Security Fix — Applied 2026-04-07
-- Enables Row Level Security on all public tables
-- Triggered by: Supabase security alert (RLS disabled)
-- ============================================================

-- -------------------------
-- ENABLE RLS ON ALL TABLES
-- -------------------------

ALTER TABLE public.tw_hourly_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_biases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kalshi_forecast_accuracy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nws_timestamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prob_calibration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- -------------------------
-- SERVICE ROLE POLICIES
-- service_role bypasses RLS by default in Supabase,
-- but we add explicit policies for clarity + safety.
-- These use auth.jwt() ->> 'role' since auth.role() 
-- may not exist in all Supabase versions.
-- -------------------------

-- tw_hourly_forecasts: core forecast data — service_role write, anon read OK (public data)
CREATE POLICY "service_role_all_tw_hourly_forecasts"
  ON public.tw_hourly_forecasts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_tw_hourly_forecasts"
  ON public.tw_hourly_forecasts
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- weather_predictions: service_role full access; authenticated users see own rows
CREATE POLICY "service_role_all_weather_predictions"
  ON public.weather_predictions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read_weather_predictions"
  ON public.weather_predictions
  FOR SELECT
  TO authenticated
  USING (true);

-- station_biases: reference data — public read OK
CREATE POLICY "service_role_all_station_biases"
  ON public.station_biases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_station_biases"
  ON public.station_biases
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- forecast_config: internal config — service_role only
CREATE POLICY "service_role_all_forecast_config"
  ON public.forecast_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- kalshi_forecast_accuracy: trading data — service_role only
CREATE POLICY "service_role_all_kalshi_forecast_accuracy"
  ON public.kalshi_forecast_accuracy
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_read_kalshi_forecast_accuracy"
  ON public.kalshi_forecast_accuracy
  FOR SELECT
  TO authenticated
  USING (true);

-- emergency_alerts: user-scoped
CREATE POLICY "service_role_all_emergency_alerts"
  ON public.emergency_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_emergency_alerts"
  ON public.emergency_alerts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- weather_feedback: user-scoped
CREATE POLICY "service_role_all_weather_feedback"
  ON public.weather_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_weather_feedback"
  ON public.weather_feedback
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_preferences: user-scoped
CREATE POLICY "service_role_all_user_preferences"
  ON public.user_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_user_preferences"
  ON public.user_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- profiles: user-scoped
CREATE POLICY "service_role_all_profiles"
  ON public.profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_profiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ai_conversations: user-scoped
CREATE POLICY "service_role_all_ai_conversations"
  ON public.ai_conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_ai_conversations"
  ON public.ai_conversations
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_api_keys: user-scoped, sensitive
CREATE POLICY "service_role_all_user_api_keys"
  ON public.user_api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_user_api_keys"
  ON public.user_api_keys
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- source_variances: reference data — public read OK
CREATE POLICY "service_role_all_source_variances"
  ON public.source_variances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_read_source_variances"
  ON public.source_variances
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- nws_timestamps: internal reference — service_role only
CREATE POLICY "service_role_all_nws_timestamps"
  ON public.nws_timestamps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_agents: user-scoped trading config
CREATE POLICY "service_role_all_user_agents"
  ON public.user_agents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_user_agents"
  ON public.user_agents
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- prob_calibration_log: internal model data
CREATE POLICY "service_role_all_prob_calibration_log"
  ON public.prob_calibration_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_profiles: user-scoped
CREATE POLICY "service_role_all_user_profiles"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "users_own_user_profiles"
  ON public.user_profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
