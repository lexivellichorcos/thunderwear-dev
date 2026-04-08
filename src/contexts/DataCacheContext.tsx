import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface UserPreferences {
  id: string;
  user_id: string;
  location: string;
  preferred_clothing_style: string;
  cold_tolerance: number;
  heat_tolerance: number;
  rain_sensitivity: number;
  wind_tolerance: number;
  commute_method: string;
  commute_duration: number;
  work_schedule_start: string;
  work_schedule_end: string;
  temperature_unit: string;
  distance_unit: string;
  gender: string;
  clothing_schedule: Record<string, string>;
  commute_from_address: string | null;
  commute_from_lat: number | null;
  commute_from_lng: number | null;
  commute_to_address: string | null;
  commute_to_lat: number | null;
  commute_to_lng: number | null;
  commute_enabled: boolean;
}

interface FavoriteLocation {
  id: string;
  user_id: string;
  name: string;
  location_string: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  notification_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface DataCacheContextValue {
  userPreferences: UserPreferences | null;
  favoriteLocations: FavoriteLocation[];
  isLoading: boolean;
  refreshUserPreferences: () => Promise<void>;
  refreshFavoriteLocations: () => Promise<void>;
  clearCache: () => void;
}

const DataCacheContext = createContext<DataCacheContextValue | null>(null);

export const useDataCache = () => {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error('useDataCache must be used within a DataCacheProvider');
  }
  return context;
};

export const DataCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [favoriteLocations, setFavoriteLocations] = useState<FavoriteLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastPrefsRefresh = React.useRef<number>(0);
  const lastLocsRefresh = React.useRef<number>(0);

  const CACHE_DURATION = 30000; // 30 seconds

  const refreshUserPreferences = useCallback(async () => {
    if (!user) {
      setUserPreferences(null);
      return;
    }

    // Skip if recently refreshed
    if (Date.now() - lastPrefsRefresh.current < CACHE_DURATION && userPreferences) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user preferences:', error);
        return;
      }

      setUserPreferences(data ? {
        ...data,
        clothing_schedule: (data.clothing_schedule as Record<string, string>) || {}
      } as UserPreferences : null);
      lastPrefsRefresh.current = Date.now();
    } catch (error) {
      console.error('Error refreshing user preferences:', error);
    }
  }, [user]);

  const refreshFavoriteLocations = useCallback(async () => {
    if (!user) {
      setFavoriteLocations([]);
      return;
    }

    // Skip if recently refreshed
    if (Date.now() - lastLocsRefresh.current < CACHE_DURATION && favoriteLocations.length > 0) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('favorite_locations')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) {
        console.error('Error loading favorite locations:', error);
        return;
      }

      setFavoriteLocations(data || []);
      lastLocsRefresh.current = Date.now();
    } catch (error) {
      console.error('Error refreshing favorite locations:', error);
    }
  }, [user]);

  const clearCache = useCallback(() => {
    setUserPreferences(null);
    setFavoriteLocations([]);
    lastPrefsRefresh.current = 0;
    lastLocsRefresh.current = 0;
  }, []);

  // Load data when user changes
  useEffect(() => {
    if (!user) {
      clearCache();
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        refreshUserPreferences(),
        refreshFavoriteLocations()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, [user, refreshUserPreferences, refreshFavoriteLocations, clearCache]);

  const value: DataCacheContextValue = {
    userPreferences,
    favoriteLocations,
    isLoading,
    refreshUserPreferences,
    refreshFavoriteLocations,
    clearCache,
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
};