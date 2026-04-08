import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Cloud, CloudRain, Sun, Moon, CloudSnow, Zap, CloudDrizzle, Wind, Eye, Droplets, Sunrise, Sunset, TrendingUp, Snowflake } from 'lucide-react';
import { type ForecastDay } from '@/services/weatherService';
import { isNightTimeForLocation } from "@/utils/timeUtils";
import { getSunTimes } from "@/services/sunTimesService";
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { normCdf, ENSEMBLE_STD_DEV } from '@/utils/stats';

import { type HourlyForecast } from '@/services/weatherService';

interface WeatherData {
  confidence: number;
  explanation?: string;
  sources?: string[];
}

interface DailyForecastCardProps {
  forecast: ForecastDay[];
  hourlyForecast?: HourlyForecast[]; // Used to derive consistent today high/low
  weatherData?: WeatherData;
  coordinates?: { lat: number; lon: number };
  isLoading?: boolean;
  stationId?: string; // For Kalshi-aligned probability display
}

// Kalshi temperature thresholds for major cities (common market buckets)
const KALSHI_TEMP_THRESHOLDS: Record<string, number[]> = {
  'KNYC': [32, 40, 50, 60, 70, 80],
  'KMDW': [32, 40, 50, 60, 70, 80],
  'KLAX': [60, 70, 80, 90],
  'KMIA': [70, 80, 90],
  'KAUS': [50, 60, 70, 80, 90],
  'KDEN': [32, 40, 50, 60, 70, 80],
  'KPHL': [32, 40, 50, 60, 70, 80],
  'default': [40, 50, 60, 70, 80],
};

// Calculate probability of high temp being above threshold
const calcTempAboveProb = (high: number, threshold: number, stdDev: number = 1.2): number => {
  // P(high > threshold) using normal CDF
  return Math.round((1 - normCdf(threshold, high, stdDev)) * 100);
};

// Loading skeleton for daily forecast
const DailyForecastSkeleton = () => (
  <Card className="glass-effect border-primary/20 p-4 sm:p-6">
    <Skeleton className="h-6 w-32 mb-4" />
    <div className="space-y-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-2 px-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-2 w-12" />
            <Skeleton className="h-5 w-10" />
          </div>
        </div>
      ))}
    </div>
  </Card>
);

const getDayWeatherIcon = (day: ForecastDay): JSX.Element => {
  const iconClass = "h-5 w-5";
  
  // Prioritize by precipitation likelihood
  if (day.rainChance && day.rainChance >= 70) {
    return <CloudRain className={`${iconClass} text-blue-500`} />;
  }
  if (day.rainChance && day.rainChance >= 40) {
    return <CloudDrizzle className={`${iconClass} text-blue-400`} />;
  }
  if (day.rainChance && day.rainChance >= 20) {
    return <Cloud className={`${iconClass} text-gray-400`} />;
  }
  
  // Temperature-based icons for clear days
  if (day.maxTemp < 32) {
    return <CloudSnow className={`${iconClass} text-blue-200`} />;
  }
  
  // Default to sunny for clear/low precipitation days
  return <Sun className={`${iconClass} text-yellow-500`} />;
};

const formatDay = (dateString: string): string => {
  // Parse date as local date to avoid timezone offset issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

const getTemperatureBarColor = (temp: number): string => {
  if (temp < 32) return 'bg-blue-400'; // Freezing
  if (temp < 50) return 'bg-green-400'; // Cool
  if (temp < 70) return 'bg-yellow-400'; // Mild
  if (temp < 85) return 'bg-orange-400'; // Warm
  return 'bg-red-400'; // Hot
};

export const DailyForecastCard: React.FC<DailyForecastCardProps> = ({ forecast, hourlyForecast, weatherData, coordinates, isLoading, stationId }) => {
  const [isCurrentlyNight, setIsCurrentlyNight] = useState(false);
  const [sunTimes, setSunTimes] = useState<Map<string, { sunrise: string; sunset: string }>>(new Map());
  
  // Calculate Kalshi probabilities for today's forecast
  const kalshiProbs = useMemo(() => {
    if (!forecast?.length || !stationId) return null;
    
    const today = forecast[0];
    if (!today || typeof today.maxTemp !== 'number' || isNaN(today.maxTemp)) return null;
    
    const thresholds = KALSHI_TEMP_THRESHOLDS[stationId] || KALSHI_TEMP_THRESHOLDS['default'];
    
    // Find the most relevant threshold (closest to predicted high)
    const relevantThreshold = thresholds.find(t => Math.abs(today.maxTemp - t) <= 10) || thresholds[Math.floor(thresholds.length / 2)];
    const prob = calcTempAboveProb(today.maxTemp, relevantThreshold);
    
    return {
      threshold: relevantThreshold,
      probability: prob,
      stationId,
    };
  }, [forecast, stationId]);

  // Check if it's currently night time for icon display
  // MUST be before any early returns to satisfy React hook rules
  useEffect(() => {
    const hours = new Date().getHours();
    setIsCurrentlyNight(hours >= 18 || hours < 6);
  }, []);

  // Load sunrise/sunset times for each day
  // MUST be before any early returns to satisfy React hook rules
  useEffect(() => {
    const loadSunTimes = async () => {
      if (!coordinates || !forecast.length) return;
      
      const newSunTimes = new Map<string, { sunrise: string; sunset: string }>();
      
      for (const day of forecast) {
        try {
          const times = await getSunTimes(coordinates.lat, coordinates.lon, day.day);
          if (times) {
            const sunrise = new Date(times.sunrise);
            const sunset = new Date(times.sunset);
            
            newSunTimes.set(day.day, {
              sunrise: sunrise.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              }),
              sunset: sunset.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              })
            });
          }
        } catch (error) {
          console.error('Error loading sun times for', day.day, error);
        }
      }
      
      setSunTimes(newSunTimes);
    };
    
    loadSunTimes();
  }, [coordinates, forecast]);

  // Show skeleton while loading - MUST be after all hooks
  if (isLoading) {
    return <DailyForecastSkeleton />;
  }

  // Debug logging to check precipitation data
  console.log('DailyForecastCard received forecast data:', forecast.slice(0, 3));
  console.log('First day precipitation:', forecast[0]?.precipitationAmount);

  if (!forecast || forecast.length === 0) {
    return null;
  }

  // NOTE: We use the daily forecast values directly from the ensemble (which includes NWS observations)
  // Do NOT override with hourly-derived temps - hourly only covers future hours and misses actual recorded highs/lows

  // Calculate feels like temperature (heat index approximation)
  const calculateFeelsLike = (temp: number, humidity: number = 60): number => {
    if (temp < 80) {
      // For cooler temps, feels like is close to actual
      return temp + (humidity > 70 ? 2 : humidity < 30 ? -2 : 0);
    }
    // Heat index calculation for hot weather
    const heatIndex = temp + (humidity - 40) * 0.3;
    return Math.round(Math.max(temp, heatIndex));
  };

  return (
    <TooltipProvider>
    <Card className="glass-effect border-primary/20 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">7-Day Forecast</h3>
        
        {/* Kalshi Probability Badge - shows today's high prob */}
        {kalshiProbs && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge 
                variant="outline" 
                className="flex items-center gap-1.5 bg-primary/10 border-primary/30 text-primary cursor-help"
              >
                <TrendingUp className="h-3 w-3" />
                <span className="text-xs font-medium">
                  {kalshiProbs.probability}% &gt;{kalshiProbs.threshold}°
                </span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-sm">
                <strong>Kalshi Odds:</strong> {kalshiProbs.probability}% probability today's high exceeds {kalshiProbs.threshold}°F
                <br />
                <span className="text-muted-foreground text-xs">Station: {kalshiProbs.stationId}</span>
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      
      {/* Desktop Column Headers - Hidden on mobile */}
      <div className="hidden md:grid grid-cols-9 gap-4 items-center py-2 px-3 mb-2 border-b border-muted/30">
        <div className="text-xs text-muted-foreground font-bold">
          Day
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Weather
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Temp Range
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Feels Like
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Rain
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Precipitation
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Wind
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Humidity
        </div>
        <div className="text-xs text-muted-foreground font-bold text-center">
          Sun Times
        </div>
      </div>
      
      <div className="space-y-1.5">
        {forecast.map((day, index) => {
          // Safely extract temps with fallbacks
          const effectiveMaxTemp = typeof day.maxTemp === 'number' ? day.maxTemp : day.temp ?? 0;
          const effectiveMinTemp = typeof day.minTemp === 'number' ? day.minTemp : day.temp ?? 0;
          
          const feelsLikeMin = Math.round(calculateFeelsLike(effectiveMinTemp) * 10) / 10;
          const feelsLikeMax = Math.round(calculateFeelsLike(effectiveMaxTemp) * 10) / 10;
          const feelsLikeAvg = Math.round((feelsLikeMin + feelsLikeMax) / 2);
          const minTempDisplay = effectiveMinTemp.toFixed(1);
          const maxTempDisplay = effectiveMaxTemp.toFixed(1);
          
          // Actuarial CI display using ci range: (ci[1]-ci[0])/3.92
          const ciDisplay = day.ciHigh && day.ciLow 
            ? `(±${((day.ciHigh[1] - day.ciLow[0]) / 3.92).toFixed(1)}° 95% CI)` 
            : (day.ciStd ? `(±${day.ciStd.toFixed(1)}° 95% CI)` : null);
          return (
            <div key={index} className="py-2 hover:bg-muted/50 rounded-lg px-3 transition-colors border-b border-white/5 last:border-0">
              
              {/* Mobile Layout */}
              <div className="md:hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold min-w-[90px]">{formatDay(day.day)}</span>
                    {getDayWeatherIcon(day)}
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-base text-muted-foreground">{minTempDisplay}°</span>
                      <span className="text-2xl font-bold leading-none">{maxTempDisplay}°</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Feels {feelsLikeMin}°-{feelsLikeMax}°
                      {ciDisplay && <span className="ml-1 text-primary/70">{ciDisplay}</span>}
                    </div>
                  </div>
                </div>
                
                {/* Simplified mobile metrics - only show rain chance and precipitation if significant */}
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {day.rainChance && day.rainChance > 0 && (
                    <div className="flex items-center gap-1">
                      <CloudRain className="h-3 w-3 text-blue-500" />
                      <span>{day.rainChance}%</span>
                    </div>
                  )}
                  {/* Show snow accumulation if significant */}
                  {day.snowAccumulation !== undefined && day.snowAccumulation >= 0.1 && (
                    <div className="flex items-center gap-1">
                      <Snowflake className="h-3 w-3 text-frost" />
                      <span className="font-bold text-frost">{day.snowAccumulation.toFixed(1)}"</span>
                    </div>
                  )}
                  {day.precipitationAmount !== undefined && day.precipitationAmount > 0.01 && (!day.snowAccumulation || day.snowAccumulation < 0.1) && (
                    <div className="flex items-center gap-1">
                      <Droplets className="h-3 w-3 text-blue-600" />
                      <span>{day.precipitationAmount >= 0.1 ? day.precipitationAmount.toFixed(1) : day.precipitationAmount.toFixed(2)}"</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:grid grid-cols-9 gap-4 items-center">
                {/* Day */}
                <div className="text-sm text-muted-foreground font-medium">
                  {formatDay(day.day)}
                </div>
                
                {/* Weather Icon */}
                <div className="flex items-center justify-center">
                  {getDayWeatherIcon(day)}
                </div>
                
                {/* Temperature Range */}
                <div className="flex items-center gap-2 justify-center">
                  <span className="text-xs text-muted-foreground">
                    {minTempDisplay}°
                  </span>
                  <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${getTemperatureBarColor(day.temp)}`}
                      style={{
                        width: `${Math.min(100, Math.max(20, ((day.temp - effectiveMinTemp) / (effectiveMaxTemp - effectiveMinTemp)) * 100))}%`
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold">
                    {maxTempDisplay}°
                  </span>
                </div>
                
                {/* Feels Like Temperature */}
                <div className="flex items-center gap-2 justify-center">
                  <span className="text-xs text-muted-foreground">
                    {feelsLikeMin}°
                  </span>
                  <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${getTemperatureBarColor(feelsLikeAvg)} opacity-70`}
                      style={{
                        width: `${Math.min(100, Math.max(20, (feelsLikeMax - feelsLikeMin) === 0 ? 50 : ((feelsLikeAvg - feelsLikeMin) / (feelsLikeMax - feelsLikeMin)) * 100))}%`
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold">
                    {feelsLikeMax}°
                  </span>
                </div>
                
                {/* Rain Chance */}
                <div className="flex items-center gap-1 justify-center">
                  {day.rainChance && day.rainChance > 0 ? (
                    <>
                      <CloudRain className="h-3 w-3 text-blue-500" />
                      <span className="text-xs text-blue-600 font-medium">
                        {day.rainChance}%
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">0%</span>
                  )}
                </div>
                
                 {/* Precipitation Amount */}
                 <div className="flex items-center gap-1 justify-center">
                   <Droplets className="h-3 w-3 text-blue-600" />
                    {day.precipitationAmount !== undefined && day.precipitationAmount > 0 ? (
                      <span className="text-xs text-blue-600 font-medium">
                        {day.precipitationAmount >= 0.1 ? day.precipitationAmount.toFixed(1) : day.precipitationAmount.toFixed(2)}"
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                 </div>
                
                {/* Wind Speed */}
                <div className="flex items-center gap-1 justify-center">
                  <Wind className="h-3 w-3 text-gray-500" />
                  <span className="text-xs text-muted-foreground">
                    {(day as any).windSpeed != null ? Math.round((day as any).windSpeed) : '--'}
                  </span>
                </div>
                
                {/* Humidity */}
                <div className="flex items-center gap-1 justify-center">
                  <Droplets className="h-3 w-3 text-blue-400" />
                  <span className="text-xs text-muted-foreground">
                    {(day as any).humidity != null ? `${Math.round((day as any).humidity)}%` : '--'}
                  </span>
                </div>
                
                {/* Sunrise/Sunset Times */}
                <div className="flex flex-col items-center gap-1">
                  {sunTimes.has(day.day) ? (
                    <>
                      <div className="flex items-center gap-1">
                        <Sunrise className="h-3 w-3 text-orange-400" />
                        <span className="text-xs text-muted-foreground">
                          {sunTimes.get(day.day)?.sunrise}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Sunset className="h-3 w-3 text-orange-600" />
                        <span className="text-xs text-muted-foreground">
                          {sunTimes.get(day.day)?.sunset}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Weather Sources and AI Analysis Information */}
      {weatherData && (
        <div className="mt-3 pt-3 border-t border-muted/30">          
          {weatherData.sources && weatherData.sources.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {weatherData.sources.map((source, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {source}
                </Badge>
              ))}
            </div>
          )}
          
          {weatherData.explanation && (
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="text-sm text-muted-foreground">
                <strong>AI Analysis:</strong> {weatherData.explanation}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
    </TooltipProvider>
  );
};