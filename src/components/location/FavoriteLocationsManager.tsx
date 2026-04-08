import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Heart, MapPin, Bell, BellOff, Trash2, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface FavoriteLocation {
  id: string;
  name: string;
  location_string: string;
  latitude?: number;
  longitude?: number;
  is_default: boolean;
  notification_enabled: boolean;
}

interface FavoriteLocationsManagerProps {
  onLocationSelect: (location: string, savedName?: string) => void;
  currentLocation?: string;
  locationInputClassName?: string;
}

export const FavoriteLocationsManager: React.FC<FavoriteLocationsManagerProps> = ({
  onLocationSelect,
  currentLocation,
  locationInputClassName
}) => {
  const [locations, setLocations] = useState<FavoriteLocation[]>([]);
  const [newLocationName, setNewLocationName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
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
        .order('name');

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error loading favorite locations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load favorite locations',
        variant: 'destructive',
      });
    }
  };

  const addCurrentLocationAsFavorite = async () => {
    if (!user || !currentLocation || !newLocationName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a name for this location',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('favorite_locations')
        .insert({
          user_id: user.id,
          name: newLocationName.trim(),
          location_string: currentLocation,
          is_default: locations.length === 0,
          notification_enabled: true,
        });

      if (error) throw error;

      setNewLocationName('');
      await loadFavoriteLocations();
      toast({
        title: 'Success',
        description: 'Location added to favorites',
      });
    } catch (error) {
      console.error('Error adding favorite location:', error);
      toast({
        title: 'Error',
        description: 'Failed to add favorite location',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDefault = async (locationId: string) => {
    if (!user) return;

    try {
      // First, remove default from all locations
      await supabase
        .from('favorite_locations')
        .update({ is_default: false })
        .eq('user_id', user.id);

      // Then set the selected location as default
      const { error } = await supabase
        .from('favorite_locations')
        .update({ is_default: true })
        .eq('id', locationId);

      if (error) throw error;

      // Get the updated location and auto-load it
      const { data: location, error: fetchError } = await supabase
        .from('favorite_locations')
        .select('*')
        .eq('id', locationId)
        .single();

      if (!fetchError && location) {
        onLocationSelect(location.location_string, location.name);
      }

      await loadFavoriteLocations();
      toast({
        title: 'Success',
        description: 'Default location updated and loaded',
      });
    } catch (error) {
      console.error('Error updating default location:', error);
      toast({
        title: 'Error',
        description: 'Failed to update default location',
        variant: 'destructive',
      });
    }
  };

  const toggleNotifications = async (locationId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('favorite_locations')
        .update({ notification_enabled: enabled })
        .eq('id', locationId);

      if (error) throw error;

      await loadFavoriteLocations();
      toast({
        title: 'Success',
        description: `Notifications ${enabled ? 'enabled' : 'disabled'} for location`,
      });
    } catch (error) {
      console.error('Error updating notification settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update notification settings',
        variant: 'destructive',
      });
    }
  };

  const deleteFavoriteLocation = async (locationId: string) => {
    try {
      const { error } = await supabase
        .from('favorite_locations')
        .delete()
        .eq('id', locationId);

      if (error) throw error;

      await loadFavoriteLocations();
      toast({
        title: 'Success',
        description: 'Location removed from favorites',
      });
    } catch (error) {
      console.error('Error deleting favorite location:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove favorite location',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground text-sm">Please log in to manage favorite locations</p>
      </div>
    );
  }

  const formatLocationDisplay = (locationString: string) => {
    // If it looks like coordinates (lat,lon), show as "Current Location"
    if (locationString.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
      return "Current Location";
    }
    return locationString;
  };

  const capitalizeLocationName = (name: string) => {
    // Words that should remain lowercase (unless they're the first word)
    const lowercaseWords = ["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "up", "but", "as", "if"];
    
    // Common state abbreviations that should be uppercase
    const stateAbbreviations = [
      "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
      "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
      "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc"
    ];
    
    return name
      .toLowerCase()
      .split(/(\s|,)/) // Split on spaces and commas but keep separators
      .map((part, index) => {
        // Skip spaces and commas
        if (part.match(/^\s*$/) || part === ",") {
          return part;
        }
        
        // Remove any leading/trailing whitespace for processing
        const word = part.trim();
        
        // Check if it's a state abbreviation
        if (stateAbbreviations.includes(word)) {
          return word.toUpperCase();
        }
        
        // Always capitalize first word, or if it's not in the lowercase list
        if (index === 0 || !lowercaseWords.includes(word)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        
        return word;
      })
      .join("");
  };

  const handleLocationNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Apply capitalization as user types, but only on complete words
    const capitalizedValue = capitalizeLocationName(value);
    setNewLocationName(capitalizedValue);
  };

  return (
    <div className="space-y-4">
        {/* Add current location as favorite */}
        {currentLocation && (
          <div className="space-y-2">
            <Input
              placeholder="Enter name for current location"
              value={newLocationName}
              onChange={handleLocationNameChange}
              className={locationInputClassName || "bg-white/10 backdrop-blur-md border-white/20 text-white placeholder:text-white/70"}
            />
            <Button
              onClick={addCurrentLocationAsFavorite}
              disabled={isLoading || !newLocationName.trim()}
              variant="weather"
              size="sm"
              className="w-full text-white bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20"
            >
              <Heart className="h-3 w-3 mr-2" />
              Add Current Location
            </Button>
          </div>
        )}

        {/* Favorite locations list */}
        <div className="space-y-2">
          {locations.length === 0 ? (
            <p className="text-muted-foreground text-center py-3 text-xs">
              No favorite locations yet. Add your first one above!
            </p>
          ) : (
            locations.map((location) => (
              <div
                key={location.id}
                className="bg-white/5 backdrop-blur-md rounded-lg p-2 border border-white/10 transition-all duration-300 hover:bg-white/10 group"
              >
                {/* Location info and primary action */}
                <div 
                  className="flex items-center justify-between cursor-pointer gap-2"
                  onClick={() => onLocationSelect(location.location_string, location.name)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MapPin className="h-3 w-3 text-white/60 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-white truncate flex-1 min-w-0">
                          {capitalizeLocationName(location.name)}
                        </span>
                        {location.is_default && (
                          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded p-0.5 flex-shrink-0">
                            <Star className="h-2.5 w-2.5 text-white fill-current" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-white/60 truncate">
                        {formatLocationDisplay(location.location_string)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Action buttons - always visible for accessibility */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Set as default */}
                    <Button
                      size="sm"
                      variant="weather"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDefault(location.id);
                      }}
                      className={`h-5 w-5 p-0 text-white border-white/20 hover:bg-white/20 ${location.is_default ? 'bg-white/10 backdrop-blur-md' : 'bg-white/5'}`}
                      title="Set as default"
                    >
                      <Star className="h-2.5 w-2.5" />
                    </Button>

                    {/* Toggle notifications */}
                    <Button
                      size="sm"
                      variant="weather"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleNotifications(location.id, !location.notification_enabled);
                      }}
                      className="h-5 w-5 p-0 text-white bg-white/10 border-white/20 hover:bg-white/20"
                      title={location.notification_enabled ? "Disable notifications" : "Enable notifications"}
                    >
                      {location.notification_enabled ? (
                        <Bell className="h-2.5 w-2.5" />
                      ) : (
                        <BellOff className="h-2.5 w-2.5" />
                      )}
                    </Button>

                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="weather"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFavoriteLocation(location.id);
                      }}
                      className="h-5 w-5 p-0 text-white bg-white/10 border-white/20 hover:bg-red-500/30"
                      title="Delete location"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
    </div>
  );
};