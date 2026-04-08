import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { getUserUnitPreferences, getTemperatureUnit, getSpeedUnit, getDistanceUnit } from "@/utils/units";
import { isNightTimeForLocation, isNightTimeAtCoordinates } from "@/utils/timeUtils";
import { WeatherFeedback } from "./WeatherFeedback";
import { 
  Cloud, 
  Sun, 
  Moon,
  CloudRain,
  Snowflake, 
  Thermometer, 
  Droplets, 
  Wind,
  Eye,
  Gauge
} from "lucide-react";

interface WeatherData {
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
  ci?: [number, number];
  ciStd?: number;
}

interface WeatherCardProps {
  data: WeatherData;
  coordinates?: { lat: number; lon: number };
}

const getWeatherIcon = (condition: string, rainProbability: number, isNight: boolean = false) => {
  // Show rain icon if rain probability is 30% or higher
  if (rainProbability >= 30) return CloudRain;
  
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('rain')) return CloudRain;
  if (lowerCondition.includes('snow')) return Snowflake;
  if (lowerCondition.includes('cloud')) return Cloud;
  
  // Use Moon during night time, Sun during day time
  return isNight ? Moon : Sun;
};

const getConditionColor = (condition: string) => {
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('rain')) return 'bg-blue-500';
  if (lowerCondition.includes('snow')) return 'bg-gray-400';
  if (lowerCondition.includes('cloud')) return 'bg-gray-500';
  return 'bg-yellow-500';
};

export const WeatherCard = ({ data, coordinates }: WeatherCardProps) => {
  const { user } = useAuth();
  const [unitPrefs, setUnitPrefs] = useState({
    temperature_unit: 'fahrenheit' as 'celsius' | 'fahrenheit',
    distance_unit: 'imperial' as 'metric' | 'imperial'
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [isNightTime, setIsNightTime] = useState(false);

  useEffect(() => {
    const loadUnits = async () => {
      if (user) {
        const prefs = await getUserUnitPreferences(user.id);
        setUnitPrefs(prefs);
      }
    };
    loadUnits();
  }, [user, refreshKey]);

  // Check if it's night time at this location
  useEffect(() => {
    const checkNightTime = async () => {
      try {
        if (coordinates) {
          console.log('Checking night time for coordinates:', coordinates);
          const isNight = await isNightTimeAtCoordinates(coordinates.lat, coordinates.lon);
          console.log('Is night time:', isNight);
          setIsNightTime(isNight);
        } else {
          console.log('No coordinates available, using location string:', data.location);
          const isNight = await isNightTimeForLocation(data.location);
          console.log('Is night time (from location):', isNight);
          setIsNightTime(isNight);
        }
      } catch (error) {
        console.error('Error checking night time:', error);
        // Fallback to simple time check
        const hours = new Date().getHours();
        const fallbackNight = hours >= 18 || hours < 6;
        console.log('Using fallback night time check:', fallbackNight);
        setIsNightTime(fallbackNight);
      }
    };
    
    checkNightTime();
  }, [data.location, coordinates]);

  // Listen for preference updates
  useEffect(() => {
    const handleStorageChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    
    window.addEventListener('preferences-updated', handleStorageChange);
    return () => window.removeEventListener('preferences-updated', handleStorageChange);
  }, []);

  // Use units from data if available, otherwise use user preferences
  const tempUnit = data.units?.temperature || unitPrefs.temperature_unit;
  const distanceUnit = data.units?.distance || unitPrefs.distance_unit;

  const WeatherIcon = getWeatherIcon(data.condition, data.rainProbability, isNightTime);
  const conditionColor = getConditionColor(data.condition);

  return (
    <Card className="weather-card-hover glass-effect border-primary/20">
      <CardHeader className="pb-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <WeatherIcon className="h-5 w-5 weather-icon text-primary flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">
                {data.location.split(',')[0]}
              </span>
              {data.location.includes(',') && (
                <span className="text-xs text-muted-foreground leading-tight">
                  {data.location.split(',')[1]?.trim()}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold whitespace-nowrap">
                {data.temperature.toFixed(1)}{getTemperatureUnit(tempUnit as 'celsius' | 'fahrenheit')}
              </span>
              <Badge className={`${conditionColor} text-white text-xs px-1.5 py-0.5 whitespace-nowrap`}>
                {data.condition}
              </Badge>
            </div>
            {data.ci && (
              <span className="text-[10px] text-muted-foreground">
                (±{((data.ci[1] - data.ci[0]) / 3.92).toFixed(1)}° 95% CI)
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-3 mt-1.5">
          <div className="flex items-center gap-1">
            <Droplets className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-medium">{data.rainProbability}%</span>
          </div>
          <div className="flex items-center gap-1">
            <Wind className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-medium">{data.windSpeed}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-400" />
            <span className="text-sm">Humidity: {data.humidity}%</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-purple-500" />
            <span className="text-sm">
              {data.visibility} {getDistanceUnit(distanceUnit as 'metric' | 'imperial')}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-border/20">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Gauge className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
            <span className="text-xs sm:text-sm">{data.pressure} hPa</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {data.confidence}% confidence
          </Badge>
        </div>
        
        {/* User Feedback for preference calibration */}
        {user && (
          <div className="pt-2 border-t border-border/20">
            <WeatherFeedback userId={user.id} type="clothing" />
          </div>
        )}
        
        {data.sources && data.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.sources.map((source, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {source}
              </Badge>
            ))}
          </div>
        )}
        
        {data.explanation && (
          <div className="mt-4 p-3 bg-muted/50 rounded-md">
            <p className="text-sm text-muted-foreground">
              <strong>AI Analysis:</strong> {data.explanation}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};