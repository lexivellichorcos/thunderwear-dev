// Time utility functions for weather display
import { isNightTimeAtLocation, parseLocationCoordinates } from "@/services/sunTimesService";

export const isNightTime = (timeString?: string): boolean => {
  const now = timeString ? new Date(timeString) : new Date();
  const hours = now.getHours();
  
  // Fallback: Consider 6 PM to 6 AM as night time (18:00 to 06:00)
  return hours >= 18 || hours < 6;
};

export const isDayTime = (timeString?: string): boolean => {
  return !isNightTime(timeString);
};

// Enhanced function that uses actual sunrise/sunset times when coordinates are available
export const isNightTimeAtCoordinates = async (
  lat: number, 
  lon: number, 
  timeString?: string
): Promise<boolean> => {
  try {
    return await isNightTimeAtLocation(lat, lon, timeString);
  } catch (error) {
    console.error('Error getting night time for coordinates:', error);
    // Fallback to basic time check
    return isNightTime(timeString);
  }
};

// Enhanced function that extracts coordinates from location string and uses sunrise/sunset
export const isNightTimeForLocation = async (
  location: string, 
  timeString?: string
): Promise<boolean> => {
  const coordinates = parseLocationCoordinates(location);
  
  if (coordinates) {
    return await isNightTimeAtCoordinates(coordinates.lat, coordinates.lon, timeString);
  }
  
  // If we can't parse coordinates, fallback to basic time check
  return isNightTime(timeString);
};

export const getTimeBasedCondition = (condition: string, timeString?: string): string => {
  const isNight = isNightTime(timeString);
  const lowerCondition = condition.toLowerCase();
  
  // For clear conditions, add night/day indicator
  if (lowerCondition.includes('clear') || lowerCondition.includes('sunny')) {
    return isNight ? 'clear-night' : 'clear-day';
  }
  
  // For partly cloudy conditions, add night/day indicator
  if (lowerCondition.includes('partly') && lowerCondition.includes('cloud')) {
    return isNight ? 'partly-cloudy-night' : 'partly-cloudy-day';
  }
  
  // For other conditions, return as-is (rain, snow, etc. look the same day/night)
  return condition;
};