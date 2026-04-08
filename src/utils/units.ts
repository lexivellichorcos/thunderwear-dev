import { supabase } from "@/integrations/supabase/client";

export interface UnitPreferences {
  temperature_unit: 'celsius' | 'fahrenheit';
  distance_unit: 'metric' | 'imperial';
}

// Simple cache to prevent excessive database calls
const unitCache = new Map<string, { data: UnitPreferences; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

export const getUserUnitPreferences = async (userId?: string): Promise<UnitPreferences> => {
  // Default to imperial/fahrenheit if no user or error
  const defaults: UnitPreferences = {
    temperature_unit: 'fahrenheit',
    distance_unit: 'imperial'
  };

  if (!userId) {
    return defaults;
  }

  // Check cache first
  const cached = unitCache.get(userId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('temperature_unit, distance_unit')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return defaults;
    }

    const result: UnitPreferences = {
      temperature_unit: (data.temperature_unit as 'celsius' | 'fahrenheit') || 'fahrenheit',
      distance_unit: (data.distance_unit as 'metric' | 'imperial') || 'imperial'
    };

    // Cache the result
    unitCache.set(userId, { data: result, timestamp: Date.now() });
    
    return result;
  } catch (error) {
    console.error('Error loading unit preferences:', error);
    return defaults;
  }
};

export const convertTemperature = (tempC: number, unit: 'celsius' | 'fahrenheit'): number => {
  return unit === 'fahrenheit' ? Math.round((tempC * 9/5) + 32) : Math.round(tempC);
};

export const convertWindSpeed = (kmh: number, unit: 'metric' | 'imperial'): number => {
  return unit === 'imperial' ? Math.round(kmh * 0.621371) : Math.round(kmh);
};

export const convertDistance = (km: number, unit: 'metric' | 'imperial'): number => {
  return unit === 'imperial' ? Math.round(km * 0.621371) : Math.round(km);
};

export const getTemperatureUnit = (unit: 'celsius' | 'fahrenheit'): string => {
  return unit === 'fahrenheit' ? '°F' : '°C';
};

export const getSpeedUnit = (unit: 'metric' | 'imperial'): string => {
  return unit === 'imperial' ? 'mph' : 'km/h';
};

export const getDistanceUnit = (unit: 'metric' | 'imperial'): string => {
  return unit === 'imperial' ? 'mi' : 'km';
};