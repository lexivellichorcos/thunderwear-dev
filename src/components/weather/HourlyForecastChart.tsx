import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Cloud, CloudRain, Sun, Moon, CloudSnow, Zap, CloudDrizzle, Snowflake } from "lucide-react";
import { HourlyForecast } from "@/services/weatherService";
import { useState, useEffect } from "react";
import { isNightTimeForLocation } from "@/utils/timeUtils";

interface HourlyForecastChartProps {
  forecast: HourlyForecast[];
  isLoading?: boolean;
  coordinates?: { lat: number; lon: number };
}

const getWeatherIcon = (condition: string, rainChance: number, isNight: boolean = false, snowAccumulation?: number) => {
  const iconProps = { size: 24, className: "drop-shadow-sm" };
  
  // Show snow icon if there's snow accumulation
  if (snowAccumulation && snowAccumulation >= 0.1) {
    return <CloudSnow {...iconProps} className="text-frost" />;
  }
  
  // Show rain icon if rain probability is 30% or higher
  if (rainChance >= 30) {
    return <CloudRain {...iconProps} className="text-storm" />;
  }
  
  switch (condition) {
    case 'clear':
      return isNight 
        ? <Moon {...iconProps} className="text-blue-200 drop-shadow-sm" />
        : <Sun {...iconProps} className="text-sun drop-shadow-sm" />;
    case 'partly-cloudy':
      return (
        <div className="relative">
          <Cloud {...iconProps} className="text-cloud" />
          {isNight 
            ? <Moon size={16} className="absolute -top-1 -right-1 text-blue-200" />
            : <Sun size={16} className="absolute -top-1 -right-1 text-sun" />
          }
        </div>
      );
    case 'cloudy':
      return <Cloud {...iconProps} className="text-cloud" />;
    case 'light-rain':
    case 'rain':
    case 'heavy-rain':
      return <CloudRain {...iconProps} className="text-storm" />;
    case 'snow':
    case 'heavy-snow':
      return <CloudSnow {...iconProps} className="text-frost" />;
    case 'thunderstorm':
      return <Zap {...iconProps} className="text-warning" />;
    case 'fog':
      return <CloudDrizzle {...iconProps} className="text-muted-foreground" />;
    default:
      return isNight 
        ? <Moon {...iconProps} className="text-blue-200" />
        : <Sun {...iconProps} className="text-sun" />;
  }
};

export const HourlyForecastChart = ({ forecast, isLoading: externalLoading, coordinates }: HourlyForecastChartProps) => {
  const [nightTimeMap, setNightTimeMap] = useState<Map<string, boolean>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const shouldShowSkeleton = externalLoading || (forecast.length === 0 && !isLoading);
  
  // Loading skeleton component
  const LoadingSkeleton = () => (
    <Card className="weather-card-hover glass-effect border-primary/20 overflow-hidden">
      <CardContent className="p-6">
        <Skeleton className="h-6 w-40 mb-4" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 min-w-[60px] py-3 px-2">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
  
  // Check night time for each hour when forecast changes
  useEffect(() => {
    if (externalLoading || forecast.length === 0 || isLoading) return;
    
    const checkNightTimes = async () => {
      setIsLoading(true);
      const newNightTimeMap = new Map<string, boolean>();
      
      const nycLat = coordinates?.lat ?? 40.7128;
      const nycLon = coordinates?.lon ?? -74.0060;
      
      // Group hours by date to reduce API calls
      const dateGroups = new Map<string, Date[]>();
      
      for (const hour of forecast) {
        const checkTime = new Date(hour.time);
        const dateKey = checkTime.toISOString().split('T')[0];
        
        if (!dateGroups.has(dateKey)) {
          dateGroups.set(dateKey, []);
        }
        dateGroups.get(dateKey)!.push(checkTime);
      }
      
      // Make one API call per unique date
      for (const [dateKey, times] of dateGroups) {
        try {
          console.log('Fetching sunrise/sunset for date:', dateKey);
          const response = await fetch(
            `https://api.sunrise-sunset.org/json?lat=${nycLat}&lng=${nycLon}&date=${dateKey}&formatted=0`
          );
          const data = await response.json();
          
          if (data.status === 'OK') {
            const sunrise = new Date(data.results.sunrise);
            const sunset = new Date(data.results.sunset);
            
            // Apply to all hours for this date
            for (const time of times) {
              const isNight = time < sunrise || time > sunset;
              const hour = forecast.find(h => new Date(h.time).getTime() === time.getTime());
              if (hour) {
                console.log(`Hour ${hour.time}: sunrise=${sunrise.toLocaleTimeString()}, sunset=${sunset.toLocaleTimeString()}, isNight=${isNight}`);
                newNightTimeMap.set(hour.time, isNight);
              }
            }
          } else {
            // Fallback to basic time check for this date
            for (const time of times) {
              const isNight = time.getHours() >= 18 || time.getHours() < 6;
              const hour = forecast.find(h => new Date(h.time).getTime() === time.getTime());
              if (hour) {
                newNightTimeMap.set(hour.time, isNight);
              }
            }
          }
        } catch (error) {
          console.error('Error checking night time for date:', dateKey, error);
          // Fallback to basic time check for this date
          for (const time of times) {
            const isNight = time.getHours() >= 18 || time.getHours() < 6;
            const hour = forecast.find(h => new Date(h.time).getTime() === time.getTime());
            if (hour) {
              newNightTimeMap.set(hour.time, isNight);
            }
          }
        }
      }
      
      setNightTimeMap(newNightTimeMap);
      setIsLoading(false);
    };
    
    checkNightTimes();
  }, [forecast, externalLoading]);

  // BUG #5 fix: removed testSunrise() call from production code

  // Show skeleton while loading - MUST be after hooks to satisfy React hook rules
  if (shouldShowSkeleton) {
    return <LoadingSkeleton />;
  }

  // Check if all 24 hours add up to the daily total
  const totalHourlyPrecip = forecast.reduce((sum, hour) => sum + (hour.precipitationAmount || 0), 0);
  console.log(`Total hourly precipitation for ${forecast.length} hours: ${totalHourlyPrecip.toFixed(3)}" | Should sum to daily total from 7-day forecast`);
  
  // Debug individual precipitation values
  forecast.forEach(hour => {
    if (hour.precipitationAmount && (hour.precipitationAmount >= 0.01 || hour.rainChance > 0)) {
      console.log(`DEBUG - ${hour.hour}: precip=${hour.precipitationAmount}, rainChance=${hour.rainChance}, showingSection=${(hour.rainChance > 0 || (hour.precipitationAmount && hour.precipitationAmount >= 0.01))}, showingPrecipAmount=${hour.precipitationAmount && hour.precipitationAmount >= 0.01}`);
    }
  });
  
  return (
    <Card className="weather-card-hover glass-effect border-primary/20 overflow-hidden">
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-4 text-foreground">24-Hour Forecast</h3>
        
        {/* Scrollable container */}
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-max">
            {forecast.map((hour, index) => (
              <div 
                key={hour.time} 
                className={`flex flex-col items-center gap-2 min-w-[60px] py-3 px-2 rounded-lg transition-all duration-200 ${
                  index === 0 
                    ? 'bg-primary/10 border border-primary/20' 
                    : 'hover:bg-muted/50'
                }`}
              >
                {/* Hour */}
                <span className={`text-sm font-medium ${
                  index === 0 ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {hour.hour}
                </span>
                {/* Weather Icon */}
                <div className="flex justify-center items-center h-8">
                  {getWeatherIcon(hour.condition, hour.rainChance, nightTimeMap.get(hour.time) || false, hour.snowAccumulation)}
                </div>
                
                {/* Temperature */}
                <span className={`text-lg font-bold ${
                  index === 0 ? 'text-primary' : 'text-foreground'
                }`}>
                  {typeof hour.temperature === 'number' ? hour.temperature.toFixed(1) : hour.temperature}°
                </span>
                
                {/* Snow Accumulation - priority display */}
                {hour.snowAccumulation && hour.snowAccumulation >= 0.1 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <Snowflake className="h-3 w-3 text-frost" />
                      <span className="text-xs text-frost font-bold">
                        {hour.snowAccumulation >= 1 
                          ? `${hour.snowAccumulation.toFixed(1)}"`
                          : `${hour.snowAccumulation.toFixed(1)}"`}
                      </span>
                    </div>
                  </div>
                ) : (hour.precipitationAmount && hour.precipitationAmount >= 0.01) ? (
                  <div className="flex flex-col items-center gap-1">
                    {hour.rainChance > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-storm/60"></div>
                        <span className="text-xs text-storm font-medium">
                          {hour.rainChance}%
                        </span>
                      </div>
                    )}
                    <span 
                      className="text-xs text-blue-600 font-medium"
                      data-testid={`precip-${hour.hour}`}
                    >
                      {hour.precipitationAmount >= 0.1 
                        ? `${hour.precipitationAmount.toFixed(1)}"` 
                        : `${hour.precipitationAmount.toFixed(2)}"`}
                    </span>
                  </div>
                ) : hour.rainChance > 0 ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-storm/60"></div>
                      <span className="text-xs text-storm font-medium">
                        {hour.rainChance}%
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Show empty space when no meaningful precipitation */
                  <div className="h-6"></div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Gradient overlay for scroll indication */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background/80 to-transparent pointer-events-none"></div>
      </CardContent>
    </Card>
  );
};