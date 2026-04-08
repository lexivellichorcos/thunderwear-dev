import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlertCircle, Loader2, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

interface RadarMapProps {
  latitude?: number;
  longitude?: number;
  className?: string;
}

export const RadarMap: React.FC<RadarMapProps> = ({ 
  latitude = 40.7128, 
  longitude = -74.0060, 
  className = "" 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [radarMode, setRadarMode] = useState<'current'>('current');

  const fetchMapboxToken = async () => {
    try {
      console.log('Fetching Mapbox token...');
      const { data, error } = await supabase.functions.invoke('get-mapbox-token');
      
      console.log('Token response:', { data, error });
      
      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(`Failed to fetch token: ${error.message}`);
      }
      
      if (!data?.token) {
        console.error('No token in response:', data);
        throw new Error('Mapbox token not configured. Please add MAPBOX_PUBLIC_TOKEN to your Supabase Edge Function secrets.');
      }
      
      // Token validated server-side
      
      if (!data.token.startsWith('pk.')) {
        throw new Error('Invalid token format. Expected public token (pk.*).');
      }
      
      return data.token;
    } catch (error) {
      console.error('Error fetching Mapbox token:', error);
      throw error;
    }
  };

  // Function to update radar layers
  const updateRadarLayers = () => {
    if (!map.current || !isInitialized) return;
    console.log('Current radar active');
  };

  const initializeMap = async (token: string) => {
    const container = mapContainer.current;
    if (!container) {
      throw new Error('Map container element not found');
    }

    try {
      mapboxgl.accessToken = token;
      
      map.current = new mapboxgl.Map({
        container: container,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [longitude, latitude],
        zoom: 8,
        pitch: 0,
      });

      // Add error handling for map events
      map.current.on('error', (e: any) => {
        console.error('Mapbox map error:', e);
        console.error('Error details:', e.error);
        setError(`Mapbox error: ${e.error?.message || 'Unknown error'}`);
      });

      // Add style error handling
      map.current.on('style.error', (e: any) => {
        console.error('Mapbox style error:', e);
        setError(`Map style error: ${e.error?.message || 'Style failed to load'}`);
      });

      // Add navigation controls
      map.current.addControl(
        new mapboxgl.NavigationControl({
          visualizePitch: true,
        }),
        'top-right'
      );

      // Add weather radar layers when map loads  
      map.current.on('load', async () => {
        console.log('Map loaded successfully');
        
        try {
          // Add current NOAA radar (restored to original working service)
          map.current?.addSource('current-radar', {
            type: 'raster',
            tiles: [
              'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&LAYERS=nexrad-n0r-900913&SRS=EPSG%3A900913&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}'
            ],
            tileSize: 256,
          });

          map.current?.addLayer({
            id: 'current-radar-layer',
            type: 'raster',
            source: 'current-radar',
            paint: {
              'raster-opacity': 0.7,
            },
          });

          console.log('Current radar layer added successfully');
          console.log('Weather radar layers configured');
        } catch (error) {
          console.log('Failed to load weather radar:', error);
        }

        // Add location marker
        new mapboxgl.Marker({
          color: '#3b82f6'
        })
          .setLngLat([longitude, latitude])
          .addTo(map.current!);
        
        setIsInitialized(true);
      });

    } catch (error) {
      console.error('Failed to initialize map:', error);
      throw error;
    }
  };

  // Initialize map when component mounts - with intersection observer fallback
  useEffect(() => {
    let isCancelled = false;
    let observer: IntersectionObserver | null = null;
    
    const initMap = async () => {
      try {
        console.log('RadarMap: Initializing map with container:', mapContainer.current);
        console.log('RadarMap: Container dimensions:', mapContainer.current?.offsetWidth, 'x', mapContainer.current?.offsetHeight);
        const token = await fetchMapboxToken();
        console.log('RadarMap: Token fetched successfully');
        if (!isCancelled) {
          await initializeMap(token);
          console.log('RadarMap: Map initialized successfully');
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('RadarMap: Map initialization failed:', error);
          setError(error instanceof Error ? error.message : 'Failed to initialize map');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    const setupMap = () => {
      console.log('Setting up map...');
      setIsLoading(true);
      setError('');
      
      // Check if container is immediately available
      if (mapContainer.current) {
        console.log('Container immediately available');
        initMap();
        return;
      }
      
      // Use intersection observer as fallback
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && mapContainer.current) {
            console.log('Container became visible via intersection observer');
            observer?.disconnect();
            initMap();
          }
        });
      });
      
      // Try to observe the container after a delay
      setTimeout(() => {
        if (mapContainer.current && !isCancelled) {
          observer?.observe(mapContainer.current);
        } else if (!isCancelled) {
          console.error('Container still not available for intersection observer');
          setError('Map container could not be created. Please refresh the page.');
          setIsLoading(false);
        }
      }, 500);
    };

    setupMap();
    
    return () => {
      isCancelled = true;
      observer?.disconnect();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [latitude, longitude]);

  // Update map center when coordinates change
  useEffect(() => {
    if (map.current && isInitialized) {
      map.current.setCenter([longitude, latitude]);
      
      // Update marker position - use ref-tracked marker instead of DOM query
      if ((map.current as any)._twMarker) {
        (map.current as any)._twMarker.remove();
      }
      const marker = new mapboxgl.Marker({ color: '#3b82f6' })
        .setLngLat([longitude, latitude])
        .addTo(map.current!);
      (map.current as any)._twMarker = marker;
    }
  }, [latitude, longitude, isInitialized]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Weather Radar Map
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Always render the map container */}
          <div 
            ref={mapContainer} 
            data-map-container="true"
            className="w-full h-[400px] rounded-lg overflow-hidden bg-muted"
          />
          
          {/* Overlay loading/error states on top */}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/95 rounded-lg">
              <Alert variant="destructive" className="max-w-sm">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            </div>
          ) : isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/95 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading map...
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};