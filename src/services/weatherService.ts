import { supabase } from "@/integrations/supabase/client";
import { getUserUnitPreferences } from "@/utils/units";
import { validateLocation, createRateLimiter } from "@/utils/inputValidation";
import { logHourlyPredictions, logDailyPredictions } from "./predictionTrackingService";
import { applyBiasCorrection, ENSEMBLE_BIAS_CORRECTION, DAILY_WEIGHTS } from "@/utils/stats";

// Simple cache to prevent duplicate API calls
const weatherCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute

// Request deduplication - prevent multiple simultaneous requests for the same data
const pendingRequests = new Map<string, Promise<any>>();

// User preferences cache (short-lived, per-session)
const userPrefsCache = new Map<string, { data: any; timestamp: number }>();
const PREFS_CACHE_DURATION = 30000; // 30 seconds

// Cached unit preferences lookup (prevents duplicate Supabase calls)
async function getCachedUnitPreferences(userId?: string) {
  const cacheKey = userId || 'anonymous';
  const cached = userPrefsCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < PREFS_CACHE_DURATION) {
    return cached.data;
  }
  const prefs = await getUserUnitPreferences(userId);
  userPrefsCache.set(cacheKey, { data: prefs, timestamp: Date.now() });
  return prefs;
}

// Dynamic bias cache (refreshes hourly, auto-updated by Grok analysis)
let dynamicBias: number | null = null;
let biasTimestamp = 0;
const BIAS_CACHE_DURATION = 3600000; // 1 hour

// Dynamic weights cache (refreshes hourly, auto-updated by cron/backtest)
let dynamicDailyWeights: Record<string, number> | null = null;
let weightsTimestamp = 0;
const WEIGHTS_CACHE_DURATION = 3600000; // 1 hour

// Actuarial variance cache (refreshes hourly)
let varianceCache: Record<string, Record<string, number>> | null = null;
let varianceCacheTimestamp = 0;

// Station bias cache (refreshes hourly)
let stationBiasCache: Record<string, Record<string, Record<string, number>>> | null = null; // stationId -> metric -> season -> bias
let stationBiasCacheTimestamp = 0;

// Fetch dynamic bias from Supabase (actuarial correction from backtest)
async function getDynamicBias(): Promise<number> {
  if (dynamicBias !== null && (Date.now() - biasTimestamp) < BIAS_CACHE_DURATION) {
    return dynamicBias;
  }
  try {
    const { data, error } = await supabase
      .from('forecast_config')
      .select('value')
      .eq('key', 'bias_correction')
      .maybeSingle();
    if (error || !data) {
      console.log('Using default bias correction:', ENSEMBLE_BIAS_CORRECTION);
      return ENSEMBLE_BIAS_CORRECTION;
    }
    dynamicBias = Number(data.value);
    biasTimestamp = Date.now();
    console.log('Loaded dynamic bias correction:', dynamicBias);
    return dynamicBias;
  } catch (error) {
    console.error('Failed to fetch dynamic bias:', error);
    return ENSEMBLE_BIAS_CORRECTION; // Fallback to hardcoded default
  }
}

// Fetch dynamic weights from Supabase (variance-minimizing from cron recalc)
export async function getDynamicDailyWeights(): Promise<Record<string, number>> {
  if (dynamicDailyWeights !== null && (Date.now() - weightsTimestamp) < WEIGHTS_CACHE_DURATION) {
    return dynamicDailyWeights;
  }
  try {
    const { data, error } = await supabase
      .from('forecast_config')
      .select('key, value')
      .like('key', 'weight_%');
    
    if (error || !data?.length) {
      console.log('Using default daily weights from stats.ts');
      return DAILY_WEIGHTS;
    }
    
    const weights: Record<string, number> = {};
    data.forEach(row => {
      // Map config keys back to source names (e.g., weight_accuweather -> AccuWeather)
      const keyMap: Record<string, string> = {
        'weight_accuweather': 'AccuWeather',
        'weight_tomorrow': 'Tomorrow.io',
        'weight_noaa': 'NOAA',
        'weight_openmeteo': 'Open-Meteo',
        'weight_openweathermap': 'OpenWeatherMap'
      };
      const sourceName = keyMap[row.key];
      if (sourceName) {
        weights[sourceName] = Number(row.value);
      }
    });
    
    dynamicDailyWeights = weights;
    weightsTimestamp = Date.now();
    console.log('Loaded dynamic daily weights:', weights);
    return weights;
  } catch (error) {
    console.error('Failed to fetch dynamic weights:', error);
    return DAILY_WEIGHTS; // Fallback to hardcoded defaults
  }
}

// Clear weights cache (for manual refresh)
export const clearWeightsCache = () => {
  dynamicDailyWeights = null;
  weightsTimestamp = 0;
  varianceCache = null;
  varianceCacheTimestamp = 0;
  stationBiasCache = null;
  stationBiasCacheTimestamp = 0;
};

// Get current season from date
function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8].includes(month)) return 'summer';
  return 'fall';
}

// Fetch source variances for inverse-variance weighting
export async function getSourceVariances(metric: string = 'temperature'): Promise<Record<string, number>> {
  // Check cache
  if (varianceCache && varianceCache[metric] && (Date.now() - varianceCacheTimestamp) < WEIGHTS_CACHE_DURATION) {
    return varianceCache[metric];
  }
  
  try {
    const { data, error } = await supabase
      .from('source_variances')
      .select('source, variance')
      .eq('metric', metric);
    
    if (error || !data?.length) {
      console.log(`Using default variances for ${metric}`);
      return {};
    }
    
    const variances: Record<string, number> = {};
    data.forEach(row => {
      variances[row.source] = row.variance;
    });
    
    // Update cache
    if (!varianceCache) varianceCache = {};
    varianceCache[metric] = variances;
    varianceCacheTimestamp = Date.now();
    
    console.log(`Loaded source variances for ${metric}:`, variances);
    return variances;
  } catch (error) {
    console.error(`Failed to fetch source variances for ${metric}:`, error);
    return {};
  }
}

// Fetch station bias for seasonal correction
export async function getStationBias(stationId: string, metric: string = 'temperature'): Promise<number> {
  const season = getCurrentSeason();
  
  // Check cache
  if (stationBiasCache && 
      stationBiasCache[stationId] && 
      stationBiasCache[stationId][metric] &&
      stationBiasCache[stationId][metric][season] !== undefined &&
      (Date.now() - stationBiasCacheTimestamp) < WEIGHTS_CACHE_DURATION) {
    return stationBiasCache[stationId][metric][season];
  }
  
  try {
    const { data, error } = await supabase
      .from('station_biases')
      .select('bias')
      .eq('station_id', stationId)
      .eq('metric', metric)
      .eq('season', season)
      .maybeSingle();
    
    if (error || !data) {
      // Try 'all' season fallback
      const { data: fallbackData } = await supabase
        .from('station_biases')
        .select('bias')
        .eq('station_id', stationId)
        .eq('metric', metric)
        .eq('season', 'all')
        .maybeSingle();
      
      const bias = fallbackData?.bias || 0;
      updateBiasCache(stationId, metric, season, bias);
      return bias;
    }
    
    updateBiasCache(stationId, metric, season, data.bias);
    console.log(`Loaded station bias for ${stationId}/${metric}/${season}: ${data.bias}°F`);
    return data.bias;
  } catch (error) {
    console.error(`Failed to fetch station bias for ${stationId}:`, error);
    return 0;
  }
}

// Helper to update bias cache
function updateBiasCache(stationId: string, metric: string, season: string, bias: number) {
  if (!stationBiasCache) stationBiasCache = {};
  if (!stationBiasCache[stationId]) stationBiasCache[stationId] = {};
  if (!stationBiasCache[stationId][metric]) stationBiasCache[stationId][metric] = {};
  stationBiasCache[stationId][metric][season] = bias;
  stationBiasCacheTimestamp = Date.now();
}

// Actuarial ensemble result with confidence interval
export interface ActuarialResult {
  value: number;
  ci: [number, number]; // 95% confidence interval [low, high]
  ciStd: number; // Standard deviation used for CI
}

// Compute actuarial ensemble with inverse-variance weighting and NWS priority boost
// Uses POOLED VARIANCE (weighted variance from source deviations) for proper SD calculation
export async function computeActuarialEnsemble(
  sources: Array<{ source: string; value: number }>,
  metric: string,
  stationId?: string
): Promise<ActuarialResult> {
  const defaultResult = (val: number): ActuarialResult => ({
    value: val,
    ci: [val - 2.5, val + 2.5], // Default ±2.5°F
    ciStd: 1.28
  });

  if (sources.length === 0) return defaultResult(0);
  if (sources.length === 1) return defaultResult(sources[0].value);
  
  // Fetch variances for weighting
  const variances = await getSourceVariances(metric);
  
  // Calculate inverse-variance weights (1/σ² normalization)
  const weights = sources.map(s => {
    const variance = variances[s.source] || 1; // Default equal weight if no variance data
    return 1 / Math.max(variance, 0.1); // Prevent division by very small numbers
  });
  
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  let blended = sources.reduce((sum, s, i) => sum + s.value * weights[i], 0) / sumWeights;
  
  // Calculate POOLED VARIANCE (weighted sum of squared deviations from blended mean)
  // This gives proper spread estimate (~2°F) vs SE of mean (~0.5°F) which was compressing probs
  let pooledVariance = 0;
  for (let i = 0; i < sources.length; i++) {
    const normalizedWeight = weights[i] / sumWeights;
    const deviation = sources[i].value - blended;
    pooledVariance += normalizedWeight * deviation * deviation;
  }
  // ciStd is now the pooled SD (empirical spread), not SE of mean
  // Apply minimum floor of 1.5°F to prevent over-concentration when sources agree
  let ciStd = Math.max(Math.sqrt(pooledVariance), 1.5);
  
  // NWS priority boost for Kalshi settlement stations (80% NWS + 20% ensemble)
  const nws = sources.find(s => s.source === 'NWS' || s.source === 'NOAA');
  if (stationId && nws) {
    blended = 0.8 * nws.value + 0.2 * blended;
    console.log(`Actuarial ensemble (NWS 80% boost for ${stationId}): ${blended.toFixed(1)}°F, pooled SD: ${ciStd.toFixed(2)}°F`);
  }
  
  // Apply station-specific seasonal bias correction
  if (stationId) {
    const bias = await getStationBias(stationId, metric);
    if (bias !== 0) {
      blended += bias;
      console.log(`Applied ${stationId} ${metric} bias: ${bias >= 0 ? '+' : ''}${bias.toFixed(2)}°F → ${blended.toFixed(1)}°F`);
    }
  }
  
  // 95% confidence interval (±1.96 std)
  const ci: [number, number] = [
    Math.round((blended - 1.96 * ciStd) * 10) / 10,
    Math.round((blended + 1.96 * ciStd) * 10) / 10
  ];
  
  return { value: blended, ci, ciStd };
}

// Export function to clear cache for specific keys (used for force refresh)
export const clearWeatherCache = (pattern?: string) => {
  if (!pattern) {
    // Clear ALL caches for full refresh
    weatherCache.clear();
    userPrefsCache.clear();
    dynamicBias = null;
    biasTimestamp = 0;
    dynamicDailyWeights = null;
    weightsTimestamp = 0;
    varianceCache = null;
    varianceCacheTimestamp = 0;
    stationBiasCache = null;
    stationBiasCacheTimestamp = 0;
    console.log('All weather caches cleared');
    return;
  }
  for (const key of weatherCache.keys()) {
    if (key.includes(pattern)) {
      weatherCache.delete(key);
    }
  }
};

export interface WeatherData {
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  visibility: number;
  pressure: number;
  rainProbability: number;
  confidence: number;
  explanation?: string;
  sources?: string[];
  units?: {
    temperature: string;
    distance: string;
  };
  // Actuarial confidence interval (95% CI)
  ci?: [number, number];
  ciStd?: number;
}

export interface ForecastDay {
  day: string;
  temp: number;
  minTemp: number;
  maxTemp: number;
  rainChance: number;
  precipitationAmount?: number; // in mm or inches
  snowAccumulation?: number; // in inches
  serviceHighs?: number[]; // Individual service predictions for empirical distribution
  nwsObservedHigh?: number; // NWS official observed high for today (if available)
  nwsObservationFresh?: boolean; // Whether latest NWS observation timestamp is fresh enough for nowcasting
  nwsObservationAgeMinutes?: number; // Age of latest NWS observation in minutes
  biasCorrection?: { // Regression-based bias correction applied to remaining forecast hours
    appliedF: number; // Bias in Fahrenheit
    appliedC: number; // Bias in Celsius
    sampleSize: number; // Number of observation hours used for calculation
  };
  // Actuarial confidence intervals (95% CI)
  ciHigh?: [number, number]; // CI for max temp
  ciLow?: [number, number];  // CI for min temp
  ciStd?: number;            // Standard deviation used
  stdDev?: number;           // Backend-calibrated SD (simple-forecast response)
}

export interface HourlyForecast {
  time: string;
  hour: string;
  temperature: number;
  condition: string;
  rainChance: number;
  windSpeed: number;
  precipitationAmount?: number; // in mm or inches
  snowAccumulation?: number; // in inches
}

export interface WeatherAlert {
  id: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  timestamp: Date;
}

// Rate limiter for weather requests
const weatherRateLimiter = createRateLimiter(20, 60000); // 20 requests per minute

export const fetchWeatherData = async (location: string, userId?: string, stationId?: string): Promise<WeatherData> => {
  console.log('DEBUG: fetchWeatherData called with:', { location, userId: !!userId, stationId });
  
  try {
    // Input validation
    const validation = validateLocation(location);
    if (!validation.isValid) {
      console.log('DEBUG: Location validation failed:', validation.error);
      throw new Error(validation.error || 'Invalid location format');
    }

    // Create cache key (include stationId)
    const cacheKey = `weather-${validation.sanitized}-${stationId || 'default'}-${userId || 'anonymous'}`;
    console.log('DEBUG: Cache key:', cacheKey);
  
  // Check cache first
  const cached = weatherCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('DEBUG: Returning cached data');
    return cached.data;
  }
  
  // Check if there's already a pending request for this data
  if (pendingRequests.has(cacheKey)) {
    console.log('DEBUG: Request already pending, waiting for existing request');
    return await pendingRequests.get(cacheKey);
  }

  // Rate limiting
  const identifier = userId || 'anonymous';
  if (!weatherRateLimiter.isAllowed(identifier)) {
    throw new Error('Too many requests. Please wait before trying again.');
  }

  // Create the request promise
  const requestPromise = (async () => {
    const unitPrefs = await getCachedUnitPreferences(userId);
  
    const { data, error } = await supabase.functions.invoke('weather-ensemble-v2', {
      body: { 
        location: validation.sanitized,
        temperature_unit: unitPrefs.temperature_unit,
        distance_unit: unitPrefs.distance_unit,
        station_id: stationId,
      }
    });

    if (error) {
      console.error('Error fetching weather data:', error);
      throw new Error(error.message || 'Failed to fetch weather data');
    }


      // NOTE: Do not apply bias correction to *current conditions*.
      // Current conditions should reflect the authoritative latest observation when available.

    // Cache the result (post-correction)
    weatherCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  })();

  // Store the promise to prevent duplicate requests
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Clean up the pending request
    pendingRequests.delete(cacheKey);
  }
  } catch (error) {
    console.error('Weather service error:', error);
    throw error;
  }
};

export const fetchForecastData = async (
  location: string,
  userId?: string,
  forceRefresh?: boolean,
  stationId?: string
): Promise<ForecastDay[]> => {
  try {
    // Input validation
    const validation = validateLocation(location);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid location format');
    }

    // Create cache key (include stationId to avoid mixing stations)
    const cacheKey = `forecast-${validation.sanitized}-${stationId || 'default'}-${userId || 'anonymous'}`;
    
    // Check cache first (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = weatherCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
      }
    }
    
    // REQUEST DEDUPLICATION: Prevent multiple simultaneous simple-forecast calls
    // This prevents WORKER_LIMIT errors when multiple components load at once
    if (pendingRequests.has(cacheKey)) {
      console.log('Forecast request already pending, waiting for existing request');
      return await pendingRequests.get(cacheKey);
    }

    const unitPrefs = await getCachedUnitPreferences(userId);
    
    // Create the request promise
    const requestPromise = (async () => {
      const { data, error } = await supabase.functions.invoke('simple-forecast', {
        body: { 
          location: validation.sanitized,
          temperature_unit: unitPrefs.temperature_unit,
          // Optional NWS station used for Kalshi settlement (e.g., KAUS, KNYC)
          station_id: stationId,
        }
      });

      if (error) {
        console.error('Error fetching forecast data:', error);
        throw new Error(error.message || 'Failed to fetch forecast data');
      }

      // Cache the result (post-correction)
      weatherCache.set(cacheKey, { data, timestamp: Date.now() });

      // Log predictions for accuracy tracking (async, don't await)
      if (data && data.length > 0) {
        logDailyPredictions(validation.sanitized, data, userId).catch(err => 
          console.error('Failed to log daily predictions:', err)
        );
      }

      return data;
    })();
    
    // Store the promise to prevent duplicate requests
    pendingRequests.set(cacheKey, requestPromise);
    
    try {
      return await requestPromise;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error('Forecast service error:', error);
    throw error;
  }
};

export const fetchHourlyForecast = async (
  location: string,
  userId?: string,
  forceRefresh?: boolean,
  stationId?: string
): Promise<HourlyForecast[]> => {
  try {
    // Input validation
    const validation = validateLocation(location);
    if (!validation.isValid) {
      console.error('Invalid location for hourly forecast:', validation.error);
      return [];
    }

    // Create cache key (include stationId)
    const cacheKey = `hourly-${validation.sanitized}-${stationId || 'default'}-${userId || 'anonymous'}`;
    
    // Check cache first (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = weatherCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
      }
    }
    
    // REQUEST DEDUPLICATION: Prevent multiple simultaneous simple-forecast calls
    // This prevents WORKER_LIMIT errors when multiple components load at once
    if (pendingRequests.has(cacheKey)) {
      console.log('Hourly request already pending, waiting for existing request');
      return await pendingRequests.get(cacheKey);
    }

    const unitPrefs = await getCachedUnitPreferences(userId);
    
    // Create the request promise
    const requestPromise = (async () => {
      const { data, error } = await supabase.functions.invoke('simple-forecast', {
        body: { 
          location: validation.sanitized,
          temperature_unit: unitPrefs.temperature_unit,
          include_hourly: true,
          station_id: stationId,
        }
      });

      if (error) {
        console.error('Error fetching hourly forecast:', error);
        return [];
      }

      // Cache the result (post-correction)
      weatherCache.set(cacheKey, { data, timestamp: Date.now() });

      // Log predictions for accuracy tracking (async, don't await)
      if (data && data.length > 0) {
        logHourlyPredictions(validation.sanitized, data, userId).catch(err => 
          console.error('Failed to log hourly predictions:', err)
        );
      }

      return data || [];
    })();
    
    // Store the promise to prevent duplicate requests
    pendingRequests.set(cacheKey, requestPromise);
    
    try {
      return await requestPromise;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error('Hourly forecast service error:', error);
    return [];
  }
};

// ============================================================================
// UNIFIED FORECAST: Single API call returns BOTH daily and hourly data,
// with daily highs derived from the SAME hourly data. This eliminates
// inconsistencies caused by separate API calls returning different results.
// ============================================================================
export const fetchUnifiedForecast = async (
  location: string,
  userId?: string,
  forceRefresh?: boolean,
  stationId?: string
): Promise<{ daily: ForecastDay[]; hourly: HourlyForecast[] }> => {
  try {
    const validation = validateLocation(location);
    if (!validation.isValid) {
      console.error('Invalid location for unified forecast:', validation.error);
      return { daily: [], hourly: [] };
    }

    const cacheKey = `unified-${validation.sanitized}-${stationId || 'default'}-${userId || 'anonymous'}`;
    
    if (!forceRefresh) {
      const cached = weatherCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
      }
    }

    if (pendingRequests.has(cacheKey)) {
      console.log('Unified request already pending, waiting for existing request');
      return await pendingRequests.get(cacheKey);
    }

    const unitPrefs = await getCachedUnitPreferences(userId);
    
    const requestPromise = (async () => {
      const { data, error } = await supabase.functions.invoke('simple-forecast', {
        body: { 
          location: validation.sanitized,
          temperature_unit: unitPrefs.temperature_unit,
          include_all: true,
          station_id: stationId,
        }
      });

      if (error) {
        console.error('Error fetching unified forecast:', error);
        throw new Error(error.message || 'Failed to fetch unified forecast');
      }

      // Response is { daily: [...], hourly: [...] }
      const result = {
        daily: data?.daily || [],
        hourly: data?.hourly || [],
      };

      weatherCache.set(cacheKey, { data: result, timestamp: Date.now() });

      // Log predictions for accuracy tracking (async, don't await)
      if (result.daily.length > 0) {
        logDailyPredictions(validation.sanitized, result.daily, userId).catch(err => 
          console.error('Failed to log daily predictions:', err)
        );
      }
      if (result.hourly.length > 0) {
        logHourlyPredictions(validation.sanitized, result.hourly, userId).catch(err => 
          console.error('Failed to log hourly predictions:', err)
        );
      }

      return result;
    })();
    
    pendingRequests.set(cacheKey, requestPromise);
    
    try {
      return await requestPromise;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error('Unified forecast service error:', error);
    return { daily: [], hourly: [] };
  }
};

export const fetchWeatherAlerts = async (location: string): Promise<WeatherAlert[]> => {
  // Simplified: return empty array for now
  return [];
};