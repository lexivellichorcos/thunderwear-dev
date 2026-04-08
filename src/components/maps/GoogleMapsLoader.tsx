import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GoogleMapsLoaderProps {
  children: (maps: any | null, isLoaded: boolean) => React.ReactNode;
}

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

let isLoaded = false;
let isLoading = false;
const callbacks: Array<() => void> = [];

export const GoogleMapsLoader: React.FC<GoogleMapsLoaderProps> = ({ children }) => {
  const [maps, setMaps] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setMaps(window.google?.maps || null);
      setLoaded(true);
      return;
    }

    if (isLoading) {
      callbacks.push(() => {
        setMaps(window.google?.maps || null);
        setLoaded(true);
      });
      return;
    }

    const loadGoogleMaps = async () => {
      try {
        isLoading = true;

        // Get API key from Supabase
        const { data, error } = await supabase.functions.invoke('get-google-maps-key');
        
        if (error || !data?.key) {
          console.error('Failed to get Google Maps API key:', error);
          isLoading = false;
          return;
        }

        // Create callback function
        window.initMap = () => {
          isLoaded = true;
          isLoading = false;
          setMaps(window.google?.maps || null);
          setLoaded(true);
          
          // Execute all pending callbacks
          callbacks.forEach(callback => callback());
          callbacks.length = 0;
        };

        // Load Google Maps script
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.key}&libraries=places&callback=initMap`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
          console.error('Failed to load Google Maps script');
          isLoading = false;
        };
        
        document.head.appendChild(script);
      } catch (error) {
        console.error('Error loading Google Maps:', error);
        isLoading = false;
      }
    };

    loadGoogleMaps();
  }, []);

  return <>{children(maps, loaded)}</>;
};