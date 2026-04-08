import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Car, 
  Clock, 
  MapPin, 
  Navigation, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  Route
} from 'lucide-react';
import { calculateCommute, getCurrentTrafficConditions, CommuteData, CommuteLocation } from '@/services/commuteService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface CommuteCardProps {
  className?: string;
}

export const CommuteCard: React.FC<CommuteCardProps> = ({ className }) => {
  const { user } = useAuth();
  const [commuteData, setCommuteData] = useState<CommuteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [locations, setLocations] = useState<{
    from: CommuteLocation | null;
    to: CommuteLocation | null;
  }>({ from: null, to: null });
  const [commuteEnabled, setCommuteEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (user) {
      loadCommuteSettings();
    }
  }, [user]);

  useEffect(() => {
    if (commuteEnabled && locations.from && locations.to) {
      updateCommuteData();
      // Auto-refresh every 5 minutes
      const interval = setInterval(updateCommuteData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [commuteEnabled, locations]);

  const loadCommuteSettings = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('commute_enabled, commute_from_address, commute_from_lat, commute_from_lng, commute_to_address, commute_to_lat, commute_to_lng')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading commute settings:', error);
        return;
      }

      if (data) {
        setCommuteEnabled(data.commute_enabled || false);
        
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
      const data = await getCurrentTrafficConditions(locations.from, locations.to);
      setCommuteData(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error updating commute data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTrafficBadgeVariant = (condition?: string) => {
    switch (condition) {
      case 'light': return 'default';
      case 'moderate': return 'secondary';
      case 'heavy': return 'destructive';
      case 'severe': return 'destructive';
      default: return 'outline';
    }
  };

  const getTrafficIcon = (condition?: string) => {
    switch (condition) {
      case 'light': return <CheckCircle className="w-4 h-4" />;
      case 'moderate': return <Clock className="w-4 h-4" />;
      case 'heavy': 
      case 'severe': return <AlertTriangle className="w-4 h-4" />;
      default: return <Car className="w-4 h-4" />;
    }
  };

  if (!commuteEnabled || !locations.from || !locations.to) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5" />
            Commute Traffic
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
      
      <CardContent className="space-y-4">
        {/* Route Info */}
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 mt-0.5 text-green-600" />
            <div className="flex-1">
              <div className="font-medium">From</div>
              <div className="text-muted-foreground">{locations.from.address}</div>
            </div>
          </div>
          
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 mt-0.5 text-red-600" />
            <div className="flex-1">
              <div className="font-medium">To</div>
              <div className="text-muted-foreground">{locations.to.address}</div>
            </div>
          </div>
        </div>

        {/* Traffic Data */}
        {commuteData && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getTrafficIcon(commuteData.trafficCondition)}
                <span className="font-medium">Current Traffic</span>
              </div>
              <Badge variant={getTrafficBadgeVariant(commuteData.trafficCondition)}>
                {commuteData.trafficCondition?.charAt(0).toUpperCase() + commuteData.trafficCondition?.slice(1) || 'Unknown'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Duration
                </div>
                <div className="text-muted-foreground">{commuteData.durationInTraffic}</div>
              </div>
              
              <div>
                <div className="font-medium flex items-center gap-1">
                  <Navigation className="w-4 h-4" />
                  Distance
                </div>
                <div className="text-muted-foreground">{commuteData.distance}</div>
              </div>
            </div>

            {commuteData.durationInTraffic !== commuteData.duration && (
              <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded-md">
                Normal time: {commuteData.duration} (traffic adds extra time)
              </div>
            )}
          </div>
        )}

        {!commuteData && !isLoading && (
          <div className="text-center text-muted-foreground py-4">
            <Car className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div>Click refresh to load traffic data</div>
          </div>
        )}

        {isLoading && (
          <div className="text-center text-muted-foreground py-4">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div>Loading traffic conditions...</div>
          </div>
        )}

        {lastUpdated && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
};