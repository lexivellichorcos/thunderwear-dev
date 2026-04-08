import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigation, Zap, AlertTriangle, Home, Building2 } from 'lucide-react';

interface TrafficMapProps {
  initialLocation?: { lat: number; lng: number };
  className?: string;
}

// Declare Google Maps types
declare global {
  interface Window {
    google: any;
    initGoogleMap: () => void;
  }
}

export const TrafficMap: React.FC<TrafficMapProps> = ({ 
  initialLocation,
  className = "h-96"
}) => {
  // Validate and set default location
  const validLocation = initialLocation && 
    !isNaN(initialLocation.lat) && 
    !isNaN(initialLocation.lng) &&
    initialLocation.lat !== 0 &&
    initialLocation.lng !== 0
    ? initialLocation 
    : { lat: 40.7589, lng: -73.9851 }; // Default to NYC

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const trafficLayer = useRef<any>(null);
  const currentLocationMarker = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [trafficVisible, setTrafficVisible] = useState(true);
  const [googleMapsKey, setGoogleMapsKey] = useState<string | null>(null);
  const [userPreferences, setUserPreferences] = useState<any>(null);
  const [currentSmartLocation, setCurrentSmartLocation] = useState<{
    lat: number;
    lng: number;
    type: 'home' | 'work' | 'weather';
    label: string;
  } | null>(null);

  // Fetch user preferences
  useEffect(() => {
    const fetchUserPreferences = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user preferences:', error);
          return;
        }

        setUserPreferences(data);
      } catch (error) {
        console.error('Error fetching user preferences:', error);
      }
    };

    fetchUserPreferences();
  }, []);

  // Calculate smart location based on time and preferences
  useEffect(() => {
    if (!userPreferences || !userPreferences.commute_enabled) {
      // Use weather location if no commute preferences
      setCurrentSmartLocation({
        lat: validLocation.lat,
        lng: validLocation.lng,
        type: 'weather',
        label: 'Current Weather Location'
      });
      return;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight
    
    const workStart = userPreferences.work_schedule_start;
    const workEnd = userPreferences.work_schedule_end;
    
    // Convert time strings to minutes
    const parseTime = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const workStartMinutes = workStart ? parseTime(workStart) : 9 * 60; // 9 AM default
    const workEndMinutes = workEnd ? parseTime(workEnd) : 17 * 60; // 5 PM default
    
    // Commute buffer (30 minutes before/after work)
    const commuteBuffer = 30;
    const morningCommuteStart = workStartMinutes - commuteBuffer;
    const morningCommuteEnd = workStartMinutes + commuteBuffer;
    const eveningCommuteStart = workEndMinutes - commuteBuffer;
    const eveningCommuteEnd = workEndMinutes + commuteBuffer;

    let smartLocation;

    if (currentTime >= morningCommuteStart && currentTime <= morningCommuteEnd) {
      // Morning commute - show home location
      smartLocation = {
        lat: Number(userPreferences.commute_from_lat) || validLocation.lat,
        lng: Number(userPreferences.commute_from_lng) || validLocation.lng,
        type: 'home' as const,
        label: userPreferences.commute_from_address || 'Home'
      };
    } else if (currentTime > morningCommuteEnd && currentTime < eveningCommuteStart) {
      // Work hours - show work location
      smartLocation = {
        lat: Number(userPreferences.commute_to_lat) || validLocation.lat,
        lng: Number(userPreferences.commute_to_lng) || validLocation.lng,
        type: 'work' as const,
        label: userPreferences.commute_to_address || 'Work'
      };
    } else if (currentTime >= eveningCommuteStart && currentTime <= eveningCommuteEnd) {
      // Evening commute - show work location (heading home)
      smartLocation = {
        lat: Number(userPreferences.commute_to_lat) || validLocation.lat,
        lng: Number(userPreferences.commute_to_lng) || validLocation.lng,
        type: 'work' as const,
        label: userPreferences.commute_to_address || 'Work'
      };
    } else {
      // Outside work hours - show home location
      smartLocation = {
        lat: Number(userPreferences.commute_from_lat) || validLocation.lat,
        lng: Number(userPreferences.commute_from_lng) || validLocation.lng,
        type: 'home' as const,
        label: userPreferences.commute_from_address || 'Home'
      };
    }

    setCurrentSmartLocation(smartLocation);
  }, [userPreferences, validLocation]);

  // Get Google Maps API key
  useEffect(() => {
    const getGoogleMapsKey = async () => {
      try {
        const { data } = await supabase.functions.invoke('get-google-maps-key');
        if (data?.key) {
          setGoogleMapsKey(data.key);
        }
      } catch (error) {
        console.error('Error getting Google Maps key:', error);
      }
    };
    getGoogleMapsKey();
  }, []);

  // Load Google Maps script and initialize map
  useEffect(() => {
    if (!googleMapsKey || !currentSmartLocation) return;

    const loadGoogleMapsScript = () => {
      // Check if script is already loaded
      if (window.google) {
        initializeMap();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=geometry,places`;
      script.async = true;
      script.defer = true;
      
      // Set up callback
      window.initGoogleMap = initializeMap;
      script.onload = initializeMap;
      
      document.head.appendChild(script);
    };

    const initializeMap = () => {
      if (!mapContainer.current || !window.google || !currentSmartLocation) return;

      // Initialize map with smart location
      map.current = new window.google.maps.Map(mapContainer.current, {
        center: { lat: currentSmartLocation.lat, lng: currentSmartLocation.lng },
        zoom: 12,
        mapTypeId: window.google.maps.MapTypeId.ROADMAP,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ]
      });

      // Create traffic layer
      trafficLayer.current = new window.google.maps.TrafficLayer();
      trafficLayer.current.setMap(map.current);

      // Add marker for current location
      updateLocationMarker();

      setIsLoading(false);
    };

    loadGoogleMapsScript();

    // Cleanup
    return () => {
      if (window.initGoogleMap) {
        delete window.initGoogleMap;
      }
    };
  }, [googleMapsKey, currentSmartLocation]);

  // Update location marker when smart location changes
  useEffect(() => {
    if (map.current && currentSmartLocation && window.google) {
      updateLocationMarker();
      // Pan to new location
      map.current.panTo({ lat: currentSmartLocation.lat, lng: currentSmartLocation.lng });
    }
  }, [currentSmartLocation]);

  const updateLocationMarker = () => {
    if (!map.current || !currentSmartLocation || !window.google) return;

    // Remove existing marker
    if (currentLocationMarker.current) {
      currentLocationMarker.current.setMap(null);
    }

    // Create new marker with appropriate icon
    const iconUrl = currentSmartLocation.type === 'work' 
      ? 'data:image/svg+xml;base64,' + btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1e40af">
            <path d="M3 21h18v-2H3v2zM5 10v7h14v-7H5zM19 8V6c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2v2H3v2h18V8h-2zM7 6h10v2H7V6zM11 11h2v4h-2v-4z"/>
          </svg>
        `)
      : 'data:image/svg+xml;base64,' + btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#059669">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
        `);

    currentLocationMarker.current = new window.google.maps.Marker({
      position: { lat: currentSmartLocation.lat, lng: currentSmartLocation.lng },
      map: map.current,
      title: currentSmartLocation.label,
      icon: {
        url: iconUrl,
        scaledSize: new window.google.maps.Size(32, 32),
        anchor: new window.google.maps.Point(16, 32)
      }
    });

    // Add info window
    const infoWindow = new window.google.maps.InfoWindow({
      content: `
        <div style="padding: 8px; font-family: system-ui;">
          <div style="font-weight: 600; margin-bottom: 4px;">${currentSmartLocation.label}</div>
          <div style="color: #666; font-size: 12px;">
            ${currentSmartLocation.type === 'work' ? '🏢 Work Location' : 
              currentSmartLocation.type === 'home' ? '🏠 Home Location' : '📍 Weather Location'}
          </div>
        </div>
      `
    });

    currentLocationMarker.current.addListener('click', () => {
      infoWindow.open(map.current, currentLocationMarker.current);
    });
  };

  const toggleTraffic = () => {
    if (!trafficLayer.current) return;
    
    const newVisibility = !trafficVisible;
    
    if (newVisibility) {
      trafficLayer.current.setMap(map.current);
    } else {
      trafficLayer.current.setMap(null);
    }
    
    setTrafficVisible(newVisibility);
  };

  const jumpToLocation = (location: { lat: number; lng: number }) => {
    if (!map.current) return;
    
    map.current.panTo(location);
    map.current.setZoom(14);
  };

  if (!googleMapsKey) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className} overflow-hidden`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Navigation className="h-5 w-5" />
              Live Traffic Map
            </CardTitle>
            {currentSmartLocation && (
              <div className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                {currentSmartLocation.type === 'work' && <Building2 className="h-3 w-3" />}
                {currentSmartLocation.type === 'home' && <Home className="h-3 w-3" />}
                {currentSmartLocation.type === 'weather' && <Navigation className="h-3 w-3" />}
                <span className="truncate max-w-24">
                  {currentSmartLocation.type === 'work' ? 'Work' : 
                   currentSmartLocation.type === 'home' ? 'Home' : 'Weather'}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant={trafficVisible ? "default" : "outline"}
              size="sm"
              onClick={toggleTraffic}
              className="text-xs"
            >
              <Zap className="h-3 w-3 mr-1" />
              Traffic
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-1 bg-green-500 rounded"></div>
            <span>Free Flow</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-1 bg-yellow-500 rounded"></div>
            <span>Slow</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-1 bg-orange-500 rounded"></div>
            <span>Heavy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-1 bg-red-500 rounded"></div>
            <span>Severe</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-red-500" />
            <span>Incidents</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative overflow-hidden">
        <div ref={mapContainer} className="w-full h-80 rounded-b-lg relative z-0" />
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-b-lg z-10">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};