// Sunrise/Sunset service for location-based day/night detection
import { supabase } from "@/integrations/supabase/client";

export interface SunTimes {
  sunrise: string;
  sunset: string;
  lat: number;
  lon: number;
  date: string;
}

// Cache for sunrise/sunset times to avoid repeated API calls
const sunTimesCache = new Map<string, { data: SunTimes; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const getSunTimes = async (lat: number, lon: number, date?: string): Promise<SunTimes | null> => {
  const targetDate = date || new Date().toISOString().split('T')[0];
  const cacheKey = `${lat.toFixed(4)}_${lon.toFixed(4)}_${targetDate}`;
  
  // Check cache first
  const cached = sunTimesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Use the sunrise-sunset.org API (free, no API key required)
    const response = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=${targetDate}&formatted=0`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'OK') {
      const sunTimes: SunTimes = {
        sunrise: data.results.sunrise,
        sunset: data.results.sunset,
        lat,
        lon,
        date: targetDate
      };
      
      // Cache the result
      sunTimesCache.set(cacheKey, {
        data: sunTimes,
        timestamp: Date.now()
      });
      
      return sunTimes;
    } else {
      console.error('Sunrise API error:', data);
      return null;
    }
  } catch (error) {
    console.error('Error fetching sunrise/sunset times:', error);
    return null;
  }
};

export const isNightTimeAtLocation = async (
  lat: number, 
  lon: number, 
  timeString?: string
): Promise<boolean> => {
  const checkTime = timeString ? new Date(timeString) : new Date();
  const date = checkTime.toISOString().split('T')[0];
  
  const sunTimes = await getSunTimes(lat, lon, date);
  
  if (!sunTimes) {
    // Fallback to basic time check if API fails
    const hours = checkTime.getHours();
    return hours >= 18 || hours < 6;
  }
  
  const sunrise = new Date(sunTimes.sunrise);
  const sunset = new Date(sunTimes.sunset);
  const currentTime = checkTime.getTime();
  
  // It's night if current time is before sunrise or after sunset
  return currentTime < sunrise.getTime() || currentTime > sunset.getTime();
};

// Utility to extract coordinates from location string
export const parseLocationCoordinates = (location: string): { lat: number; lon: number } | null => {
  // Check if location is in "lat,lon" format
  const coordPattern = /^-?\d+\.?\d*,-?\d+\.?\d*$/;
  if (coordPattern.test(location.trim())) {
    const [lat, lon] = location.split(',').map(Number);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }
  return null;
};