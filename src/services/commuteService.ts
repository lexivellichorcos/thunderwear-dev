import { supabase } from '@/integrations/supabase/client';

export interface CommuteData {
  distance: string;
  duration: string;
  durationInTraffic: string;
  status: string;
  steps?: any[];
  polylinePoints?: string;
  trafficCondition?: 'light' | 'moderate' | 'heavy' | 'severe';
}

export interface CommuteLocation {
  address: string;
  lat: number;
  lng: number;
}

// Helper to call the server-side Google Directions proxy
const callDirectionsProxy = async (
  from: CommuteLocation,
  to: CommuteLocation,
  travelMode: string
): Promise<any> => {
  const { data, error } = await supabase.functions.invoke('google-directions', {
    body: {
      origin: `${from.lat},${from.lng}`,
      destination: `${to.lat},${to.lng}`,
      mode: travelMode.toLowerCase(),
    }
  });

  if (error) {
    console.error('Directions proxy error:', error);
    return null;
  }

  return data;
};

const parseDirectionsResponse = (data: any): CommuteData | null => {
  if (data?.status !== 'OK' || !data?.routes?.length) {
    console.error('Directions API error:', data?.status, data?.error_message);
    return null;
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  // Determine traffic condition based on duration vs duration_in_traffic
  let trafficCondition: 'light' | 'moderate' | 'heavy' | 'severe' = 'light';
  if (leg.duration_in_traffic && leg.duration) {
    const trafficRatio = leg.duration_in_traffic.value / leg.duration.value;
    if (trafficRatio > 1.5) trafficCondition = 'severe';
    else if (trafficRatio > 1.3) trafficCondition = 'heavy';
    else if (trafficRatio > 1.1) trafficCondition = 'moderate';
  }

  return {
    distance: leg.distance.text,
    duration: leg.duration.text,
    durationInTraffic: leg.duration_in_traffic?.text || leg.duration.text,
    status: data.status,
    steps: leg.steps,
    polylinePoints: route.overview_polyline?.points,
    trafficCondition
  };
};

export const calculateCommute = async (
  from: CommuteLocation,
  to: CommuteLocation,
  travelMode: 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING' = 'DRIVING'
): Promise<CommuteData | null> => {
  try {
    const data = await callDirectionsProxy(from, to, travelMode);
    if (!data) return null;
    return parseDirectionsResponse(data);
  } catch (error) {
    console.error('Error calculating commute:', error);
    return null;
  }
};

export const getCurrentTrafficConditions = async (
  from: CommuteLocation,
  to: CommuteLocation
): Promise<CommuteData | null> => {
  return calculateCommute(from, to, 'DRIVING');
};

export const getCommuteForTime = async (
  from: CommuteLocation,
  to: CommuteLocation,
  departureTime: Date,
  travelMode: 'DRIVING' | 'TRANSIT' | 'WALKING' | 'BICYCLING' = 'DRIVING'
): Promise<CommuteData | null> => {
  try {
    const data = await callDirectionsProxy(from, to, travelMode);
    if (!data) return null;
    return parseDirectionsResponse(data);
  } catch (error) {
    console.error('Error getting commute for time:', error);
    return null;
  }
};
