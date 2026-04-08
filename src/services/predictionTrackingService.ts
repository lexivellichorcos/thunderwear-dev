import { supabase } from "@/integrations/supabase/client";
import { ENSEMBLE_STD_DEV, getAdjustedSd, calculateAboveProbability, precipAboveProbability } from "@/utils/stats";
import { getSourceVariances, getStationBias } from "@/services/weatherService";

// ============= INTERFACES =============

interface HourlyPrediction {
  hour: string;
  time: string;
  temperature: number;
  rainChance: number;
  precipitationAmount?: number;
}

interface DailyPrediction {
  day: string;
  maxTemp: number;
  minTemp: number;
  rainChance: number;
  precipitationAmount?: number;
}

interface KalshiPrediction {
  location: string;
  predictedHigh: number;
  rainChance: number;
  stdDev: number;
  targetDate: string;
  stationId?: string;
  season?: string;
}

export interface PredictionStats {
  daily: Array<{
    date: string;
    predicted: number;
    actual: number;
    error: number;
    withinCI: boolean;
  }>;
  summary: Record<string, {
    count: number;
    mae: number | null;
    pct_within_ci: number | null;
    mean_error: number | null;
  }>;
}

// Common Kalshi temperature thresholds for bin probability logging
const KALSHI_TEMP_BINS = [60, 65, 70, 75, 80, 85, 90];
const KALSHI_PRECIP_BINS = [0.01, 0.1, 0.25, 0.5, 1.0]; // inches

// ============= LOCATION NORMALIZATION =============

// Canonical location names — must match the edge function's normalizer
const CANONICAL_LOCATIONS: Record<string, string> = {
  'new york': 'New York', 'new york, ny': 'New York', 'new york city': 'New York', 'nyc': 'New York', 'manhattan': 'New York',
  'chicago': 'Chicago', 'chicago, il': 'Chicago',
  'philadelphia': 'Philadelphia', 'philadelphia, pa': 'Philadelphia', 'philly': 'Philadelphia',
  'miami': 'Miami', 'miami, fl': 'Miami',
  'denver': 'Denver', 'denver, co': 'Denver',
  'austin': 'Austin', 'austin, tx': 'Austin',
  'los angeles': 'Los Angeles', 'los angeles, ca': 'Los Angeles', 'la': 'Los Angeles', 'lax': 'Los Angeles',
  'seattle': 'Seattle', 'seattle, wa': 'Seattle',
  'san francisco': 'San Francisco', 'san francisco, ca': 'San Francisco', 'sf': 'San Francisco', 'sfo': 'San Francisco',
  'dallas': 'Dallas', 'dallas, tx': 'Dallas',
  'phoenix': 'Phoenix', 'phoenix, az': 'Phoenix',
  'houston': 'Houston', 'houston, tx': 'Houston',
  'atlanta': 'Atlanta', 'atlanta, ga': 'Atlanta',
  'las vegas': 'Las Vegas', 'las vegas, nv': 'Las Vegas', 'vegas': 'Las Vegas',
  'boston': 'Boston', 'boston, ma': 'Boston',
  'washington': 'Washington DC', 'washington, dc': 'Washington DC', 'washington dc': 'Washington DC', 'dc': 'Washington DC',
  'san antonio': 'San Antonio', 'san antonio, tx': 'San Antonio',
  'oklahoma city': 'Oklahoma City', 'oklahoma city, ok': 'Oklahoma City', 'okc': 'Oklahoma City',
  'minneapolis': 'Minneapolis', 'minneapolis, mn': 'Minneapolis',
  'new orleans': 'New Orleans', 'new orleans, la': 'New Orleans', 'nola': 'New Orleans',
};

const COORD_BOXES: Array<{ canonical: string; minLat: number; maxLat: number; minLon: number; maxLon: number }> = [
  { canonical: 'New York',      minLat: 40.60, maxLat: 40.90, minLon: -74.10, maxLon: -73.75 },
  { canonical: 'Chicago',       minLat: 41.65, maxLat: 42.00, minLon: -87.90, maxLon: -87.55 },
  { canonical: 'Philadelphia',  minLat: 39.80, maxLat: 40.05, minLon: -75.30, maxLon: -75.05 },
  { canonical: 'Miami',         minLat: 25.65, maxLat: 25.90, minLon: -80.40, maxLon: -80.15 },
  { canonical: 'Denver',        minLat: 39.65, maxLat: 39.95, minLon: -105.10, maxLon: -104.55 },
  { canonical: 'Austin',        minLat: 30.10, maxLat: 30.40, minLon: -97.80, maxLon: -97.55 },
  { canonical: 'Los Angeles',   minLat: 33.80, maxLat: 34.10, minLon: -118.55, maxLon: -118.25 },
  { canonical: 'Seattle',       minLat: 47.45, maxLat: 47.70, minLon: -122.45, maxLon: -122.25 },
  { canonical: 'San Francisco', minLat: 37.60, maxLat: 37.85, minLon: -122.55, maxLon: -122.30 },
  { canonical: 'Dallas',        minLat: 32.70, maxLat: 32.95, minLon: -96.95, maxLon: -96.70 },
  { canonical: 'Phoenix',       minLat: 33.35, maxLat: 33.55, minLon: -112.10, maxLon: -111.90 },
  { canonical: 'Houston',       minLat: 29.65, maxLat: 29.85, minLon: -95.45, maxLon: -95.25 },
  { canonical: 'Atlanta',       minLat: 33.60, maxLat: 33.85, minLon: -84.55, maxLon: -84.30 },
  { canonical: 'Las Vegas',     minLat: 36.00, maxLat: 36.25, minLon: -115.25, maxLon: -115.05 },
  { canonical: 'Boston',        minLat: 42.25, maxLat: 42.45, minLon: -71.15, maxLon: -70.95 },
  { canonical: 'Washington DC', minLat: 38.80, maxLat: 39.00, minLon: -77.15, maxLon: -76.90 },
  { canonical: 'San Antonio',   minLat: 29.35, maxLat: 29.55, minLon: -98.60, maxLon: -98.40 },
  { canonical: 'Oklahoma City', minLat: 35.35, maxLat: 35.55, minLon: -97.70, maxLon: -97.45 },
  { canonical: 'Minneapolis',   minLat: 44.85, maxLat: 45.05, minLon: -93.40, maxLon: -93.15 },
  { canonical: 'New Orleans',   minLat: 29.85, maxLat: 30.05, minLon: -90.15, maxLon: -89.90 },
];

export function normalizeLocation(raw: string): string {
  if (!raw) return raw;
  const lower = raw.trim().toLowerCase();
  if (CANONICAL_LOCATIONS[lower]) return CANONICAL_LOCATIONS[lower];
  
  const coordMatch = raw.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    for (const box of COORD_BOXES) {
      if (lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon) {
        return box.canonical;
      }
    }
  }
  
  return raw.trim();
}

// ============= HELPERS =============

// Get current season for granular bias tagging
function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8].includes(month)) return 'summer';
  return 'fall';
}

// Beta distribution standard deviation for rain probability
// scale=20 gives ~15% variance reduction empirically
function getBetaRainSd(rainChance: number, scale: number = 20): number {
  const p = Math.max(0.01, Math.min(0.99, rainChance / 100));
  // Beta variance = α*β / ((α+β)² * (α+β+1)) where α=p*scale, β=(1-p)*scale
  const variance = (p * (1 - p)) / (scale + 1);
  return Math.sqrt(variance);
}

// Get dynamic SD from source_variances table, fallback to ENSEMBLE_STD_DEV
async function getDynamicSd(metric: string = 'temp'): Promise<number> {
  try {
    const variances = await getSourceVariances(metric);
    if (variances && Object.keys(variances).length > 0) {
      // Average variance across sources, convert to SD
      const values = Object.values(variances);
      const avgVariance = values.reduce((sum, v) => sum + v, 0) / values.length;
      const sd = Math.sqrt(avgVariance);
      return sd > 0 ? sd : ENSEMBLE_STD_DEV;
    }
  } catch (err) {
    console.warn('Failed to fetch dynamic SD, using default:', err);
  }
  return ENSEMBLE_STD_DEV;
}

// Calculate Kalshi bin probabilities for temperature
function calculateTempBinProbs(
  predictedHigh: number,
  stdDev: number
): Record<string, number> {
  const binProbs: Record<string, number> = {};
  for (const threshold of KALSHI_TEMP_BINS) {
    // P(high >= threshold) using normCdf with discrete adjustment (-0.5)
    const prob = calculateAboveProbability(threshold - 0.5, predictedHigh, stdDev);
    binProbs[`prob_above_${threshold}`] = Math.round(prob * 10000) / 100; // Percentage with 2 decimals
  }
  return binProbs;
}

// Calculate Kalshi bin probabilities for precipitation
function calculatePrecipBinProbs(rainChance: number): Record<string, number> {
  const binProbs: Record<string, number> = {};
  for (const threshold of KALSHI_PRECIP_BINS) {
    // Use beta CDF for bounded rain probability
    const prob = precipAboveProbability(threshold, rainChance / 100);
    binProbs[`prob_precip_above_${threshold}in`] = Math.round(prob * 10000) / 100;
  }
  return binProbs;
}

// ============= LOGGING FUNCTIONS =============

// Log hourly forecast predictions with dynamic SD from actuarial tables
export async function logHourlyPredictions(
  location: string,
  hourlyData: HourlyPrediction[],
  userId?: string,
  stationId?: string
): Promise<void> {
  try {
    const normalizedLocation = normalizeLocation(location);
    const season = getCurrentSeason();
    const baseSd = await getDynamicSd('temperature');
    
    const predictions = hourlyData.map((hour, index) => {
      // Dynamic SD: use actuarial-derived SD with growth for further hours
      const hourIndex = Math.floor(index / 6); // Group by 6-hour blocks
      const stdDev = getAdjustedSd(hourIndex * 0.5, baseSd);
      
      return {
        prediction_type: 'hourly',
        location: normalizedLocation,
        target_time: hour.time,
        predicted_temp: hour.temperature,
        predicted_rain_chance: hour.rainChance,
        // Precip stored in mm for consistency (assume input is inches for US)
        predicted_precip_mm: hour.precipitationAmount ? hour.precipitationAmount * 25.4 : null,
        std_dev: Math.round(stdDev * 100) / 100,
        confidence_interval_low: Math.round((hour.temperature - (stdDev * 1.96)) * 10) / 10,
        confidence_interval_high: Math.round((hour.temperature + (stdDev * 1.96)) * 10) / 10,
        source_services: { 
          sources: ['ensemble'], 
          season, 
          stationId: stationId || null,
          hourIndex 
        },
        user_id: userId,
      };
    });

    const { error } = await supabase.functions.invoke('prediction-tracker', {
      body: { action: 'log', predictions },
    });

    if (error) {
      console.error('Error logging hourly predictions:', error);
    } else {
      console.log(`Logged ${predictions.length} hourly predictions for ${location} (SD: ${baseSd.toFixed(2)}°F)`);
    }
  } catch (err) {
    console.error('Failed to log hourly predictions:', err);
  }
}

// Log daily forecast predictions with horizon-adjusted SD and rain beta SD
export async function logDailyPredictions(
  location: string,
  dailyData: DailyPrediction[],
  userId?: string,
  stationId?: string
): Promise<void> {
  try {
    const normalizedLocation = normalizeLocation(location);
    const today = new Date();
    const season = getCurrentSeason();
    const baseSd = await getDynamicSd('temperature');
    
    // Get station-specific bias if available
    let stationBias = 0;
    if (stationId) {
      try {
        stationBias = await getStationBias(stationId, 'temperature') || 0;
      } catch (err) {
        console.warn('Failed to get station bias:', err);
      }
    }
    
    const predictions = dailyData.map((day, index) => {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + index);
      
      // Horizon-adjusted SD: grows with day index (actuarial decay)
      const stdDev = getAdjustedSd(index, baseSd);
      
      // Beta-derived rain SD for confidence interval
      const rainSd = getBetaRainSd(day.rainChance);
      const rainSdPercent = rainSd * 100;
      
      return {
        prediction_type: 'daily',
        location: normalizedLocation,
        target_time: targetDate.toISOString().split('T')[0] + 'T12:00:00Z',
        predicted_temp_high: day.maxTemp,
        predicted_temp_low: day.minTemp,
        predicted_rain_chance: day.rainChance,
        predicted_precip_mm: day.precipitationAmount ? day.precipitationAmount * 25.4 : null,
        std_dev: Math.round(stdDev * 100) / 100,
        confidence_interval_low: Math.round((day.maxTemp - (stdDev * 1.96)) * 10) / 10,
        confidence_interval_high: Math.round((day.maxTemp + (stdDev * 1.96)) * 10) / 10,
        source_services: { 
          sources: ['ensemble'], 
          season, 
          stationId: stationId || null,
          dayIndex: index,
          stationBias: stationBias !== 0 ? stationBias : undefined,
          rainSd: Math.round(rainSdPercent * 100) / 100,
          rainCiLow: Math.round(Math.max(0, day.rainChance - (rainSdPercent * 1.96)) * 10) / 10,
          rainCiHigh: Math.round(Math.min(100, day.rainChance + (rainSdPercent * 1.96)) * 10) / 10,
        },
        user_id: userId,
      };
    });

    const { error } = await supabase.functions.invoke('prediction-tracker', {
      body: { action: 'log', predictions },
    });

    if (error) {
      console.error('Error logging daily predictions:', error);
    } else {
      console.log(`Logged ${predictions.length} daily predictions for ${location} (SD: ${baseSd.toFixed(2)}°F, bias: ${stationBias.toFixed(1)}°F)`);
    }
  } catch (err) {
    console.error('Failed to log daily predictions:', err);
  }
}

// Log Kalshi/ThunderWear predictions with beta SD for rain and bin probabilities
export async function logKalshiPrediction(
  prediction: KalshiPrediction,
  userId?: string
): Promise<void> {
  try {
    const normalizedLocation = normalizeLocation(prediction.location);
    const season = getCurrentSeason();
    
    // Calculate Kalshi bin probabilities for temperature
    const tempBinProbs = calculateTempBinProbs(prediction.predictedHigh, prediction.stdDev);
    
    const predictions = [
      {
        prediction_type: 'kalshi_temp',
        location: normalizedLocation,
        target_time: prediction.targetDate + 'T05:00:00Z', // Market closes at midnight ET (05:00 UTC)
        predicted_temp_high: prediction.predictedHigh,
        predicted_rain_chance: prediction.rainChance,
        std_dev: Math.round(prediction.stdDev * 100) / 100,
        confidence_interval_low: Math.round((prediction.predictedHigh - (prediction.stdDev * 1.96)) * 10) / 10,
        confidence_interval_high: Math.round((prediction.predictedHigh + (prediction.stdDev * 1.96)) * 10) / 10,
        source_services: { 
          sources: ['thunderwear'], 
          season, 
          stationId: prediction.stationId || null,
          binProbs: tempBinProbs,
        },
        user_id: userId,
      },
    ];

    // Also log rain prediction with beta SD and bin probabilities
    if (prediction.rainChance > 0) {
      const rainSd = getBetaRainSd(prediction.rainChance);
      const rainSdPercent = rainSd * 100;
      const precipBinProbs = calculatePrecipBinProbs(prediction.rainChance);
      
      predictions.push({
        prediction_type: 'kalshi_rain',
        location: normalizedLocation,
        target_time: prediction.targetDate + 'T23:59:59Z',
        predicted_temp_high: null as any,
        predicted_rain_chance: prediction.rainChance,
        std_dev: Math.round(rainSdPercent * 100) / 100,
        confidence_interval_low: Math.round(Math.max(0, prediction.rainChance - (rainSdPercent * 1.96)) * 10) / 10,
        confidence_interval_high: Math.round(Math.min(100, prediction.rainChance + (rainSdPercent * 1.96)) * 10) / 10,
        source_services: { 
          sources: ['thunderwear'], 
          season, 
          stationId: prediction.stationId || null,
          binProbs: precipBinProbs,
        },
        user_id: userId,
      });
    }

    const { error } = await supabase.functions.invoke('prediction-tracker', {
      body: { action: 'log', predictions },
    });

    if (error) {
      console.error('Error logging Kalshi prediction:', error);
    } else {
      const topBin = Object.entries(tempBinProbs).find(([k, v]) => v > 40 && v < 60)?.[0];
      console.log(`Logged Kalshi prediction for ${prediction.location}: ${prediction.predictedHigh}°F ±${prediction.stdDev.toFixed(1)}°F${topBin ? ` (${topBin}: ${tempBinProbs[topBin]}%)` : ''}`);
    }
  } catch (err) {
    console.error('Failed to log Kalshi prediction:', err);
  }
}

// ============= STATS & VERIFICATION =============

// Get prediction accuracy stats with typed return
export async function getPredictionStats(location?: string): Promise<PredictionStats | null> {
  try {
    const { data, error } = await supabase.functions.invoke('prediction-tracker', {
      body: { action: 'stats', location },
    });

    if (error) {
      console.error('Error fetching prediction stats:', error);
      return null;
    }

    return data as PredictionStats;
  } catch (err) {
    console.error('Failed to fetch prediction stats:', err);
    return null;
  }
}

// Trigger verification of past predictions with optional metric filter
export async function verifyPredictions(
  location?: string,
  metric?: 'temp_high' | 'temp_low' | 'rain' | 'all'
): Promise<number> {
  try {
    const { data, error } = await supabase.functions.invoke('prediction-tracker', {
      body: { action: 'verify', location, metric: metric || 'all' },
    });

    if (error) {
      console.error('Error verifying predictions:', error);
      return 0;
    }

    return data?.verified || 0;
  } catch (err) {
    console.error('Failed to verify predictions:', err);
    return 0;
  }
}

// Get KNYC-specific backtest report with official 6hr max/min
export async function getKNYCBacktest(daysBack: number = 7): Promise<any | null> {
  try {
    const { data, error } = await supabase.functions.invoke('prediction-tracker', {
      body: { action: 'knyc_backtest', daysBack },
    });

    if (error) {
      console.error('Error fetching KNYC backtest:', error);
      return null;
    }

    return data?.report || null;
  } catch (err) {
    console.error('Failed to fetch KNYC backtest:', err);
    return null;
  }
}

// Get station-specific backtest (expanded Kalshi markets)
export async function getStationBacktest(
  stationId: string,
  daysBack: number = 7
): Promise<any | null> {
  try {
    const { data, error } = await supabase.functions.invoke('prediction-tracker', {
      body: { action: 'station_backtest', stationId, daysBack },
    });

    if (error) {
      console.error(`Error fetching ${stationId} backtest:`, error);
      return null;
    }

    return data?.report || null;
  } catch (err) {
    console.error(`Failed to fetch ${stationId} backtest:`, err);
    return null;
  }
}
