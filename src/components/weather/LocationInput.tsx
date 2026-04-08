import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { validateLocation } from "@/utils/inputValidation";
import { useIsMobile } from "@/hooks/use-mobile";
import { LocationSearchInput } from "@/components/maps/LocationSearchInput";

interface LocationInputProps {
  onLocationSubmit: (location: string, lat?: number, lon?: number, savedName?: string) => void;
  isLoading?: boolean;
  className?: string;
}

interface LocationResult {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

export const LocationInput = ({ onLocationSubmit, isLoading, className }: LocationInputProps) => {
  const [location, setLocation] = useState("");
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleLocationSelect = (locationResult: LocationResult | null) => {
    if (locationResult) {
      console.log('Location selected:', locationResult);
      // Use the formatted address as the display name and coordinates for accuracy
      onLocationSubmit(
        `${locationResult.lat},${locationResult.lng}`, 
        locationResult.lat, 
        locationResult.lng, 
        locationResult.address
      );
      setLocation(""); // Clear input after selection
    }
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!location.trim()) {
      toast({
        title: "Location Required",
        description: "Please enter a location or use the search suggestions",
        variant: "destructive",
      });
      return;
    }

    // Enhanced validation
    const validation = validateLocation(location);
    if (!validation.isValid) {
      toast({
        title: "Invalid Location",
        description: validation.error || "Please enter a valid ZIP code or city name",
        variant: "destructive",
      });
      return;
    }
    
    onLocationSubmit(validation.sanitized);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation Unavailable", 
        description: "Your browser doesn't support location services",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Reverse geocode to get a readable location name
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`,
            { headers: { 'User-Agent': 'ThunderWear Weather App' } }
          );
          
          if (response.ok) {
            const data = await response.json();
            const locationName = data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            onLocationSubmit(`${latitude},${longitude}`, latitude, longitude, locationName);
          } else {
            // Fallback to coordinates if reverse geocoding fails
            onLocationSubmit(`${latitude},${longitude}`, latitude, longitude, `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch (error) {
          console.error('Reverse geocoding error:', error);
          onLocationSubmit(`${latitude},${longitude}`, latitude, longitude, `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
      },
      (error) => {
        toast({
          title: "Location Error",
          description: "Unable to get your current location", 
          variant: "destructive",
        });
      }
    );
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="space-y-3">
        <div className="relative">
          <LocationSearchInput
            value=""
            onChange={(locationResult) => {
              if (locationResult) {
                handleLocationSelect(locationResult);
              }
            }}
            placeholder="Search for a location or enter ZIP code..."
            className={className}
          />
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={() => {
              // Trigger submit if there's a location
              if (location) {
                const validation = validateLocation(location);
                if (validation.isValid) {
                  onLocationSubmit(validation.sanitized);
                }
              }
            }}
            variant="weather"
            className="flex-1 h-10 sm:h-12 font-medium text-sm sm:text-base bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20"
            disabled={isLoading}
          >
            {isLoading ? "Getting Forecast..." : "Get Weather"}
          </Button>
          
          <Button
            type="button"
            variant="weather"
            size="icon"
            className="h-10 w-10 sm:h-12 sm:w-12 bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20"
            onClick={getCurrentLocation}
            disabled={isLoading}
          >
            <MapPin className="h-5 w-5" />
          </Button>
        </div>
        
        <p className="text-[11px] sm:text-sm text-white/80 text-center mt-3">
          Try: "10118", "New York, NY", or use location button
        </p>
      </div>
    </div>
  );
};