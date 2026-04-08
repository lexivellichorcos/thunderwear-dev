import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Star, Navigation } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface FavoriteLocation {
  id: string;
  name: string;
  location_string: string;
  is_default: boolean;
  notification_enabled: boolean;
}

interface QuickLocationSwitcherProps {
  onLocationSelect: (location: string) => void;
  currentLocation?: string;
}

export const QuickLocationSwitcher: React.FC<QuickLocationSwitcherProps> = ({
  onLocationSelect,
  currentLocation
}) => {
  const [locations, setLocations] = useState<FavoriteLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadFavoriteLocations();
    }
  }, [user]);

  const loadFavoriteLocations = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('favorite_locations')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('name')
        .limit(5); // Show max 5 recent/favorite locations

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error loading favorite locations:', error);
    }
  };

  const handleLocationSelect = async (location: string) => {
    setIsLoading(true);
    onLocationSelect(location);
    // Adding a small delay to prevent button spamming
    setTimeout(() => setIsLoading(false), 1000);
  };

  const getCurrentLocation = () => {
    setIsLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          onLocationSelect(`${latitude},${longitude}`);
          setTimeout(() => setIsLoading(false), 1000);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setIsLoading(false);
        }
      );
    } else {
      console.error('Geolocation not supported');
      setIsLoading(false);
    }
  };

  if (!user || locations.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Quick Location Access</span>
            <Button
              size="sm"
              variant="outline"
              onClick={getCurrentLocation}
              disabled={isLoading}
            >
              <Navigation className="h-4 w-4 mr-2" />
              Current Location
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Quick Location Access</span>
            <Button
              size="sm"
              variant="outline"
              onClick={getCurrentLocation}
              disabled={isLoading}
            >
              <Navigation className="h-4 w-4 mr-2" />
              Current
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {locations.map((location) => (
              <Button
                key={location.id}
                size="sm"
                variant={currentLocation === location.location_string ? "default" : "outline"}
                onClick={() => handleLocationSelect(location.location_string)}
                disabled={isLoading}
                className="text-xs"
              >
                <MapPin className="h-3 w-3 mr-1" />
                {location.name}
                {location.is_default && (
                  <Star className="h-3 w-3 ml-1 text-yellow-500" />
                )}
              </Button>
            ))}
          </div>

          {currentLocation && (
            <div className="text-xs text-muted-foreground">
              Current: {currentLocation.length > 20 ? `${currentLocation.substring(0, 20)}...` : currentLocation}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};