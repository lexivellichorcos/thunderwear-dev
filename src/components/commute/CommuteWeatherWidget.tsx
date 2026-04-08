import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Car, 
  Clock, 
  CloudRain, 
  Thermometer, 
  Wind,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Navigation2
} from 'lucide-react';
import { calculateCommute, getCommuteForTime, CommuteData, CommuteLocation } from '@/services/commuteService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface CommuteWeatherWidgetProps {
  className?: string;
  weatherData?: {
    temperature: number;
    rainProbability: number;
    windSpeed: number;
    condition: string;
  };
}

export const CommuteWeatherWidget: React.FC<CommuteWeatherWidgetProps> = ({ 
  className, 
  weatherData 
}) => {
  const { user } = useAuth();
  const [commuteData, setCommuteData] = useState<CommuteData | null>(null);
  const [workCommute, setWorkCommute] = useState<CommuteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [locations, setLocations] = useState<{
    from: CommuteLocation | null;
    to: CommuteLocation | null;
  }>({ from: null, to: null });
  const [commuteEnabled, setCommuteEnabled] = useState(false);
  const [workSchedule, setWorkSchedule] = useState<{
    start: string;
    end: string;
  }>({ start: '09:00', end: '17:00' });

  useEffect(() => {
    if (user) {
      loadCommuteSettings();
    }
  }, [user]);

  useEffect(() => {
    if (commuteEnabled && locations.from && locations.to) {
      updateCommuteData();
    }
  }, [commuteEnabled, locations, weatherData]);

  const loadCommuteSettings = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('commute_enabled, commute_from_address, commute_from_lat, commute_from_lng, commute_to_address, commute_to_lat, commute_to_lng, work_schedule_start, work_schedule_end')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading commute settings:', error);
        return;
      }

      if (data) {
        setCommuteEnabled(data.commute_enabled || false);
        setWorkSchedule({
          start: data.work_schedule_start || '09:00',
          end: data.work_schedule_end || '17:00'
        });
        
        if (data.commute_from_lat && data.commute_from_lng && data.commute_to_lat && data.commute_to_lng) {
          setLocations({
            from: {
              address: data.commute_from_address || '',
              lat: Number(data.commute_from_lat),
              lng: Number(data.commute_from_lng)
            },
            to: {
              address: data.commute_to_address || '',
              lat: Number(data.commute_to_lat),
              lng: Number(data.commute_to_lng)
            }
          });
        }
      }
    } catch (error) {
      console.error('Error loading commute settings:', error);
    }
  };

  const updateCommuteData = async () => {
    if (!locations.from || !locations.to) return;

    setIsLoading(true);
    try {
      // Get current commute time
      const currentData = await calculateCommute(locations.from, locations.to, 'DRIVING');
      setCommuteData(currentData);

      // Calculate commute time for work start
      const [hours, minutes] = workSchedule.start.split(':').map(Number);
      const workStartTime = new Date();
      workStartTime.setHours(hours, minutes, 0, 0);
      
      // If work start time has passed today, calculate for tomorrow
      if (workStartTime.getTime() < Date.now()) {
        workStartTime.setDate(workStartTime.getDate() + 1);
      }

      const workData = await getCommuteForTime(locations.from, locations.to, workStartTime, 'DRIVING');
      setWorkCommute(workData);

    } catch (error) {
      console.error('Error updating commute data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCommuteRecommendation = () => {
    if (!weatherData || !commuteData) return null;

    const recommendations = [];

    // Weather-based recommendations
    if (weatherData.rainProbability > 70) {
      recommendations.push({
        type: 'warning',
        message: 'Heavy rain expected - allow extra time and drive carefully',
        icon: <CloudRain className="w-4 h-4" />
      });
    } else if (weatherData.rainProbability > 30) {
      recommendations.push({
        type: 'info',
        message: 'Light rain possible - consider bringing an umbrella',
        icon: <CloudRain className="w-4 h-4" />
      });
    }

    if (weatherData.temperature < 32) {
      recommendations.push({
        type: 'warning',
        message: 'Freezing conditions - watch for icy roads',
        icon: <Thermometer className="w-4 h-4" />
      });
    }

    if (weatherData.windSpeed > 25) {
      recommendations.push({
        type: 'warning',
        message: 'Strong winds - use caution when driving',
        icon: <Wind className="w-4 h-4" />
      });
    }

    // Traffic-based recommendations
    if (commuteData.trafficCondition === 'heavy' || commuteData.trafficCondition === 'severe') {
      recommendations.push({
        type: 'warning',
        message: 'Heavy traffic - consider leaving earlier or alternative route',
        icon: <Car className="w-4 h-4" />
      });
    }

    return recommendations;
  };

  const getOptimalDepartureTime = () => {
    if (!workCommute || !workSchedule.start) return null;

    const [hours, minutes] = workSchedule.start.split(':').map(Number);
    const workStartTime = new Date();
    workStartTime.setHours(hours, minutes, 0, 0);

    // Parse commute duration (e.g., "25 mins" -> 25)
    const durationMatch = workCommute.durationInTraffic.match(/(\d+)/);
    const durationMinutes = durationMatch ? parseInt(durationMatch[1]) : 30;

    // Add 10 minute buffer
    const departureTime = new Date(workStartTime.getTime() - (durationMinutes + 10) * 60 * 1000);
    
    return departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!commuteEnabled || !locations.from || !locations.to) {
    return null;
  }

  const recommendations = getCommuteRecommendation();
  const optimalDeparture = getOptimalDepartureTime();

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Navigation2 className="w-5 h-5" />
            Smart Commute
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={updateCommuteData}
            disabled={isLoading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Current Traffic */}
        {commuteData && (
          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Current trip:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{commuteData.durationInTraffic}</span>
              <Badge variant={
                commuteData.trafficCondition === 'light' ? 'default' :
                commuteData.trafficCondition === 'moderate' ? 'secondary' :
                'destructive'
              } className="text-xs">
                {commuteData.trafficCondition}
              </Badge>
            </div>
          </div>
        )}

        {/* Optimal Departure Time */}
        {optimalDeparture && (
          <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Leave by:</span>
            </div>
            <span className="text-sm font-bold text-blue-600">{optimalDeparture}</span>
          </div>
        )}

        {/* Weather & Traffic Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="space-y-2">
            {recommendations.map((rec, index) => (
              <div 
                key={index}
                className={`flex items-start gap-2 p-2 rounded-md text-xs ${
                  rec.type === 'warning' 
                    ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300' 
                    : 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
                }`}
              >
                {rec.icon}
                <span className="flex-1">{rec.message}</span>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="text-center text-muted-foreground py-2">
            <RefreshCw className="w-4 h-4 mx-auto animate-spin" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};