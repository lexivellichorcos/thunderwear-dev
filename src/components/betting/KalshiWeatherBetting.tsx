import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Zap, MapPin, Bell, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  getWeatherMarkets,
  placeOrder,
  KalshiMarket,
} from '@/services/kalshiService';
import { fetchUnifiedForecast, clearWeatherCache, getSourceVariances, getStationBias } from '@/services/weatherService';
import { logKalshiPrediction } from '@/services/predictionTrackingService';
import { 
  ENSEMBLE_STD_DEV, 
  calculateRangeProbability, 
  calculateBelowProbability, 
  calculateAboveProbability,
  applyBiasCorrection,
  ENSEMBLE_BIAS_CORRECTION,
  calculateActuarialRainProbability,
  getSeasonalBucketSd,
  getCurrentSeason
} from '@/utils/stats';
import { getUserUnitPreferences } from '@/utils/units';

import { KalshiAccountLink } from './KalshiAccountLink';
import { OrderConfirmationModal } from './OrderConfirmationModal';
import { KalshiAutoTrade } from './KalshiAutoTrade';
import { BiasReviewDashboard } from './BiasReviewDashboard';

// Season is now imported from stats.ts for consistency

// All 20 Kalshi settlement station coordinates (2026 confirmed)
const KALSHI_SETTLEMENT_COORDS: Record<string, { lat: number; lon: number; name: string; stationId: string }> = {
  nyc:  { lat: 40.7829,  lon: -73.9654,   name: 'Central Park',    stationId: 'KNYC' },
  chi:  { lat: 41.7861,  lon: -87.7522,   name: 'Midway',          stationId: 'KMDW' },
  lax:  { lat: 33.93806, lon: -118.38889, name: 'LAX',             stationId: 'KLAX' },
  aus:  { lat: 30.18304, lon: -97.67987,  name: 'Austin-Bergstrom',stationId: 'KAUS' },
  mia:  { lat: 25.7959,  lon: -80.2870,   name: 'MIA Airport',     stationId: 'KMIA' },
  den:  { lat: 39.8561,  lon: -104.6737,  name: 'DEN Airport',     stationId: 'KDEN' },
  phl:  { lat: 39.8694,  lon: -75.2439,   name: 'PHL Airport',     stationId: 'KPHL' },
  sfo:  { lat: 37.6190,  lon: -122.3750,  name: 'SFO Airport',     stationId: 'KSFO' },
  sea:  { lat: 47.4502,  lon: -122.3088,  name: 'Sea-Tac',         stationId: 'KSEA' },
  dal:  { lat: 32.8471,  lon: -96.8518,   name: 'Love Field',      stationId: 'KDAL' },
  phx:  { lat: 33.4373,  lon: -112.0078,  name: 'Sky Harbor',      stationId: 'KPHX' },
  hou:  { lat: 29.6454,  lon: -95.2789,   name: 'Hobby',           stationId: 'KHOU' },
  atl:  { lat: 33.6407,  lon: -84.4277,   name: 'Hartsfield',      stationId: 'KATL' },
  lv:   { lat: 36.0840,  lon: -115.1537,  name: 'McCarran',        stationId: 'KLAS' },
  bos:  { lat: 42.3656,  lon: -71.0096,   name: 'Logan',           stationId: 'KBOS' },
  dc:   { lat: 38.8512,  lon: -77.0402,   name: 'Reagan Natl',     stationId: 'KDCA' },
  satx: { lat: 29.5337,  lon: -98.4698,   name: 'SAT Airport',     stationId: 'KSAT' },
  okc:  { lat: 35.3931,  lon: -97.6007,   name: 'Will Rogers',     stationId: 'KOKC' },
  msp:  { lat: 44.8848,  lon: -93.2223,   name: 'MSP Airport',     stationId: 'KMSP' },
  nola: { lat: 29.9934,  lon: -90.2580,   name: 'Armstrong',       stationId: 'KNEW' },
};

const CITY_LOCATIONS: Record<string, string> = {
  nyc: 'New York', chi: 'Chicago', mia: 'Miami', aus: 'Austin', lax: 'Los Angeles', den: 'Denver', phl: 'Philadelphia',
  sfo: 'San Francisco', sea: 'Seattle', dal: 'Dallas', phx: 'Phoenix', hou: 'Houston', atl: 'Atlanta',
  lv: 'Las Vegas', bos: 'Boston', dc: 'Washington DC', satx: 'San Antonio', okc: 'Oklahoma City', msp: 'Minneapolis', nola: 'New Orleans',
};

const CITY_TIMEZONES: Record<string, string> = {
  nyc: 'America/New_York', chi: 'America/Chicago', lax: 'America/Los_Angeles',
  aus: 'America/Chicago', mia: 'America/New_York', den: 'America/Denver',
  phl: 'America/New_York', sfo: 'America/Los_Angeles', sea: 'America/Los_Angeles',
  dal: 'America/Chicago', phx: 'America/Phoenix', hou: 'America/Chicago',
  atl: 'America/New_York', lv: 'America/Los_Angeles', bos: 'America/New_York',
  dc: 'America/New_York', satx: 'America/Chicago', okc: 'America/Chicago',
  msp: 'America/Chicago', nola: 'America/Chicago',
};

const CITIES = [
  { id: 'all', label: 'All' },
  { id: 'nyc', label: 'NYC' }, { id: 'chi', label: 'Chicago' }, { id: 'lax', label: 'LA' },
  { id: 'aus', label: 'Austin' }, { id: 'mia', label: 'Miami' }, { id: 'den', label: 'Denver' },
  { id: 'phl', label: 'Philly' }, { id: 'sfo', label: 'SF' }, { id: 'sea', label: 'Seattle' },
  { id: 'dal', label: 'Dallas' }, { id: 'phx', label: 'Phoenix' }, { id: 'hou', label: 'Houston' },
  { id: 'atl', label: 'Atlanta' }, { id: 'lv', label: 'Vegas' }, { id: 'bos', label: 'Boston' },
  { id: 'dc', label: 'DC' }, { id: 'satx', label: 'San Antonio' }, { id: 'okc', label: 'OKC' },
  { id: 'msp', label: 'Minneapolis' }, { id: 'nola', label: 'NOLA' },
];

const MARKET_TYPES = [
  { id: 'all', label: 'All' }, { id: 'high', label: 'High Temp' }, { id: 'low', label: 'Low Temp' },
  { id: 'rain', label: 'Rain' }, { id: 'snow', label: 'Snow' },
];

export const KalshiWeatherBetting = () => {
  interface CityForecastSnapshot {
    highTemp: number;
    rainChance: number;
    stdDev: number;
    serviceHighs: number[];
    lastUpdated: Date;
    biasCorrection?: { appliedF: number; sampleSize: number };
    nwsObservedHigh?: number;
    nwsObservationFresh?: boolean;
    nwsObservationAgeMinutes?: number;
    stationId: string;
  }

  const { user } = useAuth();
  const { toast } = useToast();
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedMarketType, setSelectedMarketType] = useState('all');
  const [isPlacingOrder, setIsPlacingOrder] = useState<string | null>(null);
  const [isAccountLinked, setIsAccountLinked] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [cityForecasts, setCityForecasts] = useState<Record<string, Record<string, CityForecastSnapshot>>>({});
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [marketDate, setMarketDate] = useState<string | null>(null);
  const [unitPrefs, setUnitPrefs] = useState<{ temperature_unit: 'celsius' | 'fahrenheit'; distance_unit: 'metric' | 'imperial'; }>({ temperature_unit: 'fahrenheit', distance_unit: 'imperial' });
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; market: KalshiMarket | null; side: 'yes' | 'no'; }>({ open: false, market: null, side: 'yes' });
  const [blendConfig, setBlendConfig] = useState<{ base: number; highConf: number; ciThreshold: number }>({ base: 0, highConf: 0, ciThreshold: 3.0 });

  useEffect(() => {
    const loadUnitPrefs = async () => {
      try { const prefs = await getUserUnitPreferences(user?.id); setUnitPrefs(prefs); } catch (err) { console.error('Failed to load unit preferences:', err); }
    };
    loadUnitPrefs();
  }, [user?.id]);

  useEffect(() => {
    const loadBlendConfig = async () => {
      try {
        const { data } = await supabase
          .from('forecast_config')
          .select('key, value')
          .in('key', ['blend_weight_base', 'blend_weight_high_confidence', 'blend_weight_ci_threshold']);
        if (data) {
          const cfg: Record<string, number> = {};
          data.forEach((r: { key: string; value: number }) => { cfg[r.key] = Number(r.value); });
          setBlendConfig({
            base: cfg['blend_weight_base'] ?? 0,
            highConf: cfg['blend_weight_high_confidence'] ?? 0,
            ciThreshold: cfg['blend_weight_ci_threshold'] ?? 3.0,
          });
          console.log(`[BlendConfig] base=${cfg['blend_weight_base']}, highConf=${cfg['blend_weight_high_confidence']}, ciThreshold=${cfg['blend_weight_ci_threshold']}`);
        }
      } catch (err) { console.error('Failed to load blend config:', err); }
    };
    loadBlendConfig();
  }, []);

  const extractDateFromTicker = (ticker: string): string | null => {
    const match = ticker.match(/(\d{2})([A-Z]{3})(\d{1,2})(?:-|$)/i);
    if (!match) return null;
    const [, year, monthStr, day] = match;
    const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const month = months[monthStr.toUpperCase()];
    if (!month) return null;
    return `20${year}-${month}-${day.padStart(2, '0')}`;
  };

  const getMarketDateSuffix = (ticker: string): string => {
    const marketDateFromTicker = extractDateFromTicker(ticker);
    if (!marketDateFromTicker) return ' today';
    const formatted = new Date(`${marketDateFromTicker}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return ` on ${formatted}`;
  };

  useEffect(() => {
    if (markets.length === 0) { setMarketDate(null); return; }
    for (const market of markets) {
      const dateFromTicker = extractDateFromTicker(market.ticker);
      if (dateFromTicker) { setMarketDate(dateFromTicker); return; }
    }
    const validMarkets = markets.filter((m) => m.close_time);
    if (validMarkets.length === 0) { setMarketDate(null); return; }
    const closeTimes = validMarkets.map((m) => new Date(m.close_time));
    const earliestClose = new Date(Math.min(...closeTimes.map((d) => d.getTime())));
    earliestClose.setDate(earliestClose.getDate() - 1);
    setMarketDate(earliestClose.toISOString().split('T')[0]);
  }, [markets]);

  const getTimeZoneForCity = (cityId?: string | null): string => CITY_TIMEZONES[cityId || ''] || 'America/New_York';

  const shiftDateString = (dateString: string, dayOffset: number): string => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };

  const getLocalDateString = (timeZone: string = 'America/New_York'): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const month = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
  };

  const getTomorrowDateString = (timeZone: string = 'America/New_York'): string => {
    const today = getLocalDateString(timeZone);
    return shiftDateString(today, 1);
  };

  const getHoursRemaining = (timeZone: string = 'America/New_York'): number => {
    const hourParts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = Number(hourParts.find((p) => p.type === 'hour')?.value ?? '0');
    return Math.max(0, 17 - hour);
  };

  const fetchAllCityForecasts = async (forceRefresh: boolean = false) => {
    if (forceRefresh) clearWeatherCache();
    setLoadingPrediction(true);
    try {
      const forecasts: Record<string, Record<string, CityForecastSnapshot>> = {};
      // When 'all' is selected, fetch forecasts for every city that has visible markets.
      // When a specific city is selected, only fetch that city.
      let cityIds: string[];
      if (selectedCity === 'all') {
        const visibleCityIds = new Set<string>();
        for (const market of markets) {
          const cid = getCityIdFromTicker(market.ticker || '');
          if (cid) visibleCityIds.add(cid);
        }
        cityIds = visibleCityIds.size > 0 ? Array.from(visibleCityIds) : ['nyc'];
      } else {
        cityIds = [selectedCity];
      }

      for (const cityId of cityIds) {
        try {
          const coords = KALSHI_SETTLEMENT_COORDS[cityId];
          if (!coords) continue;

          const cityTimeZone = getTimeZoneForCity(cityId);
          const today = getLocalDateString(cityTimeZone);
          const tomorrow = getTomorrowDateString(cityTimeZone);
          const relevantDates = new Set<string>([today, tomorrow]);

          for (const market of markets) {
            const parsedDate = extractDateFromTicker(market.ticker || '');
            if (parsedDate) relevantDates.add(parsedDate);
          }

          const coordString = `${coords.lat},${coords.lon}`;
          const unified = await fetchUnifiedForecast(coordString, user?.id, forceRefresh, coords.stationId);
          const dailyForecast = unified.daily;
          const hourlyForecast = unified.hourly;

          const forecastByDate: Record<string, CityForecastSnapshot> = {};

          for (const targetDate of Array.from(relevantDates).sort()) {
            const matchingDay = dailyForecast?.find((f) => f.day.split('T')[0] === targetDate);
            if (!matchingDay) continue;

            const isMarketToday = targetDate === today;
            const observedHigh = (typeof matchingDay.nwsObservedHigh === 'number' && Number.isFinite(matchingDay.nwsObservedHigh))
              ? matchingDay.nwsObservedHigh
              : null;
            const hasNwsObserved = observedHigh !== null;

            let effectiveMaxTemp = matchingDay.maxTemp;
            if (isMarketToday && observedHigh !== null) {
              effectiveMaxTemp = Math.max(observedHigh, effectiveMaxTemp);
            }

            const serviceHighs = matchingDay.serviceHighs || [effectiveMaxTemp];
            const getStdDev = (arr: number[]): number => {
              if (arr.length < 2) return 2.0;
              const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
              return Math.sqrt(arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length);
            };
            const empiricalStdDev = getStdDev(serviceHighs);

            const season = getCurrentSeason();
            const bucketStdDev = getSeasonalBucketSd(effectiveMaxTemp, season);
            const backendStdDev = (typeof matchingDay.stdDev === 'number' && Number.isFinite(matchingDay.stdDev)) ? matchingDay.stdDev : null;
            const hoursRemaining = getHoursRemaining(cityTimeZone);
            let actuarialStdDev = backendStdDev ?? bucketStdDev;
            if (hasNwsObserved && isMarketToday && hoursRemaining <= 2) {
              actuarialStdDev = 0.5;
            }

            const stdDev = Math.max(0.5, actuarialStdDev);
            let rainChance = matchingDay.rainChance;
            if (hourlyForecast?.length > 0) {
              const dayHours = hourlyForecast.filter((h) => h.time?.split('T')[0] === targetDate);
              if (dayHours.length > 0) rainChance = Math.max(...dayHours.map((h) => h.rainChance || 0));
            }

            logKalshiPrediction({ location: CITY_LOCATIONS[cityId], predictedHigh: effectiveMaxTemp, rainChance, stdDev, targetDate, season: getCurrentSeason(), stationId: coords.stationId }, user?.id).catch(() => {});

            forecastByDate[targetDate] = {
              highTemp: effectiveMaxTemp,
              rainChance,
              stdDev,
              serviceHighs,
              lastUpdated: new Date(),
              biasCorrection: matchingDay.biasCorrection,
              nwsObservedHigh: matchingDay.nwsObservedHigh,
              nwsObservationFresh: matchingDay.nwsObservationFresh,
              nwsObservationAgeMinutes: matchingDay.nwsObservationAgeMinutes,
              stationId: coords.stationId,
            };

            if (isMarketToday && !forecastByDate[today]) {
              forecastByDate[today] = forecastByDate[targetDate];
            }

            if (empiricalStdDev > 0) {
              console.log(`[Kalshi][${cityId}][${targetDate}] mean=${effectiveMaxTemp.toFixed(1)}°F bucketσ=${bucketStdDev.toFixed(2)}°F empiricalσ=${empiricalStdDev.toFixed(2)}°F finalσ=${stdDev.toFixed(2)}°F`);
            }
          }

          if (Object.keys(forecastByDate).length > 0) {
            forecasts[cityId] = forecastByDate;
            // Update state incrementally so TW probs appear as each city loads
            setCityForecasts(prev => ({ ...prev, [cityId]: forecastByDate }));
          }
        } catch (err) {
          console.error(`[Kalshi] Error fetching ${cityId}:`, err);
        }

        if (cityIds.length > 1) await new Promise((r) => setTimeout(r, 800));
      }

    } catch (err) {
      console.error('Error fetching city forecasts:', err);
    } finally {
      setLoadingPrediction(false);
    }
  };

  // Delay initial fetch to avoid overlapping with Index.tsx's edge function calls (WORKER_LIMIT fix)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Wait 2s on first load so Index.tsx's weather-ensemble-v2 + simple-forecast finish first
      const timer = setTimeout(() => fetchAllCityForecasts(false), 2000);
      return () => clearTimeout(timer);
    }
    fetchAllCityForecasts(true);
  }, [user?.id, marketDate, selectedCity]);

  useEffect(() => {
    if (!marketDate) return;
    const activeCityId = selectedCity === 'all' ? 'nyc' : selectedCity;
    const activeTimeZone = getTimeZoneForCity(activeCityId);
    const today = getLocalDateString(activeTimeZone);
    const tomorrowStr = getTomorrowDateString(activeTimeZone);
    if (marketDate !== today && marketDate !== tomorrowStr) return;
    const interval = setInterval(() => fetchAllCityForecasts(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [marketDate, user?.id, selectedCity]);

  const getCityIdFromTicker = (ticker: string): string | null => {
    const t = ticker.toUpperCase();
    if (t.includes('NYC') || t.includes('HIGHNY')) return 'nyc';
    if (t.includes('LAX') || t.includes('HIGHLA')) return 'lax';
    if (t.includes('CHI')) return 'chi';
    if (t.includes('AUS') || t.includes('HIGHAUS')) return 'aus';
    if (t.includes('MIA') || t.includes('HIGHMIA')) return 'mia';
    if (t.includes('DEN') || t.includes('HIGHDEN')) return 'den';
    if (t.includes('PHL') || t.includes('HIGHPHIL')) return 'phl';
    if (t.includes('SFO') || t.includes('HIGHSFO')) return 'sfo';
    if (t.includes('SEA') || t.includes('HIGHSEA')) return 'sea';
    if (t.includes('DAL') || t.includes('HIGHDAL')) return 'dal';
    if (t.includes('PHX') || t.includes('HIGHPHX')) return 'phx';
    if (t.includes('HOU') || t.includes('HIGHOU')) return 'hou';
    if (t.includes('ATL') || t.includes('HIGHATL')) return 'atl';
    if (t.includes('HIGHTLV') || t.includes('LV') || t.includes('LAS')) return 'lv';
    if (t.includes('BOS') || t.includes('HIGHTBOS')) return 'bos';
    if (t.includes('HIGHTDC') || t.includes('DCA')) return 'dc';
    if (t.includes('SATX') || t.includes('HIGHTSATX')) return 'satx';
    if (t.includes('OKC') || t.includes('HIGHTOKC')) return 'okc';
    if (t.includes('MIN') || t.includes('MSP') || t.includes('HIGHTMIN')) return 'msp';
    if (t.includes('NOLA') || t.includes('HIGHTNOLA')) return 'nola';
    return null;
  };

  const getForecastForMarket = (market: KalshiMarket) => {
    const cityId = getCityIdFromTicker(market.ticker || '');
    if (!cityId) return null;

    const forecastsByDate = cityForecasts[cityId];
    if (!forecastsByDate) return null;

    const marketDateFromTicker = extractDateFromTicker(market.ticker || '');
    if (marketDateFromTicker && forecastsByDate[marketDateFromTicker]) {
      const forecast = forecastsByDate[marketDateFromTicker];
      return { highTemp: forecast.highTemp, rainChance: forecast.rainChance, stdDev: forecast.stdDev, serviceHighs: forecast.serviceHighs, nwsObservedHigh: forecast.nwsObservedHigh, nwsObservationFresh: forecast.nwsObservationFresh, nwsObservationAgeMinutes: forecast.nwsObservationAgeMinutes };
    }

    const cityTimeZone = getTimeZoneForCity(cityId);
    const todayForecast = forecastsByDate[getLocalDateString(cityTimeZone)];
    const fallbackForecast = todayForecast || Object.values(forecastsByDate)[0];
    if (!fallbackForecast) return null;

    return { highTemp: fallbackForecast.highTemp, rainChance: fallbackForecast.rainChance, stdDev: fallbackForecast.stdDev, serviceHighs: fallbackForecast.serviceHighs, nwsObservedHigh: fallbackForecast.nwsObservedHigh, nwsObservationFresh: fallbackForecast.nwsObservationFresh, nwsObservationAgeMinutes: fallbackForecast.nwsObservationAgeMinutes };
  };

  useEffect(() => {
    const checkAccountStatus = async () => {
      if (!user) { setIsAccountLinked(false); setCheckingAccount(false); return; }
      try { const { data } = await supabase.from('kalshi_credentials').select('id').eq('user_id', user.id).maybeSingle(); setIsAccountLinked(!!data); }
      catch (err) { console.error('Error checking Kalshi account:', err); }
      finally { setCheckingAccount(false); }
    };
    checkAccountStatus();
  }, [user]);

  const getCityFromTicker = (ticker: string): string => {
    const t = ticker.toUpperCase();
    if (t.includes('NYC') || t.includes('HIGHNY')) return 'NYC';
    if (t.includes('LAX') || t.includes('HIGHLA')) return 'LA';
    if (t.includes('CHI')) return 'Chicago';
    if (t.includes('AUS')) return 'Austin';
    if (t.includes('MIA')) return 'Miami';
    if (t.includes('DEN')) return 'Denver';
    if (t.includes('PHL')) return 'Philly';
    if (t.includes('SFO')) return 'SF';
    if (t.includes('SEA')) return 'Seattle';
    if (t.includes('DAL')) return 'Dallas';
    if (t.includes('PHX')) return 'Phoenix';
    if (t.includes('HOU')) return 'Houston';
    if (t.includes('ATL')) return 'Atlanta';
    if (t.includes('LV') || t.includes('LAS')) return 'Vegas';
    if (t.includes('BOS')) return 'Boston';
    if (t.includes('DC') || t.includes('DCA')) return 'DC';
    if (t.includes('SATX')) return 'San Antonio';
    if (t.includes('OKC')) return 'OKC';
    if (t.includes('MIN') || t.includes('MSP')) return 'Minneapolis';
    if (t.includes('NOLA')) return 'New Orleans';
    return '';
  };

  const getMarketType = (ticker: string): string => {
    const t = ticker.toUpperCase();
    if (t.includes('SNOW')) return 'snow';
    if (t.includes('RAIN')) return 'rain';
    if (t.includes('LOW')) return 'low';
    if (t.includes('HIGH')) return 'high';
    return 'other';
  };

  // Check if a snow market is expired (month has passed)
  const isSnowMarketExpired = (ticker: string): boolean => {
    const match = ticker.match(/(\d{2})([A-Z]{3})/i);
    if (!match) return false;
    const [, yearStr, monthStr] = match;
    const months: Record<string, number> = { 
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };
    const marketMonth = months[monthStr.toUpperCase()];
    const marketYear = 2000 + parseInt(yearStr);
    const now = new Date();
    // Market is expired if the month has ended (we're past the 1st of next month)
    const marketEndDate = new Date(marketYear, marketMonth + 1, 1); // First day of NEXT month
    return now >= marketEndDate;
  };

  const filteredMarkets = markets.filter((m) => {
    const searchText = `${m.title || ''} ${m.ticker || ''} ${m.subtitle || ''}`.toLowerCase();
    const ticker = m.ticker || '';
    
    // Filter out expired snow markets
    if (getMarketType(ticker) === 'snow' && isSnowMarketExpired(ticker)) return false;
    
    if (selectedCity !== 'all') {
      const cityPatterns: Record<string, string[]> = {
        nyc: ['nyc', ' ny ', 'new york', 'kxhighnyc', 'kxlownyc', 'kxrainnyc', 'highny'],
        chi: ['chi', 'chicago', 'kxhighchi', 'kxlowchi', 'kxrainchi'],
        lax: ['lax', 'los angeles', ' la ', 'kxhighlax', 'kxlowlax', 'kxrainlax', 'highla'],
        aus: ['austin', 'kxhighaus', 'kxlowaus', 'kxrainaus'],
        mia: ['mia', 'miami', 'kxhighmia', 'kxlowmia', 'kxrainmia'],
        den: ['denver', 'kxhighden', 'kxlowden', 'kxrainden'],
        phl: ['philadelphia', 'philly', 'kxhighphl', 'kxlowphl', 'kxrainphl'],
        sfo: ['sfo', 'san francisco', 'kxhighsfo', 'kxlowsfo', 'kxrainsfo', 'hightsfo'],
        sea: ['sea', 'seattle', 'kxhighsea', 'kxlowsea', 'kxrainsea', 'hightsea'],
        dal: ['dal', 'dallas', 'kxhighdal', 'kxlowdal', 'kxraindal', 'hightdal'],
        phx: ['phx', 'phoenix', 'kxhighphx', 'kxlowphx', 'kxrainphx', 'hightphx'],
        hou: ['hou', 'houston', 'kxhighou', 'kxlowhou', 'kxrainhou', 'highthou'],
        atl: ['atl', 'atlanta', 'kxhighatl', 'kxlowatl', 'kxrainatl', 'highatl'],
        lv: ['lv', 'las vegas', 'vegas', 'kxhighlv', 'kxlowlv', 'kxrainlv', 'hightlv'],
        bos: ['bos', 'boston', 'kxhighbos', 'kxlowbos', 'kxrainbos', 'hightbos'],
        dc: ['dc', 'washington', 'kxhighdc', 'kxlowdc', 'kxraindc', 'hightdc', 'dca'],
        satx: ['satx', 'san antonio', 'kxhighsatx', 'kxlowsatx', 'kxrainsatx', 'hightsatx'],
        okc: ['okc', 'oklahoma', 'kxhighokc', 'kxlowowkc', 'kxrainokc', 'hightokc'],
        msp: ['msp', 'minneapolis', 'min ', 'kxhighmsp', 'kxlowmsp', 'kxrainmsp', 'hightmin'],
        nola: ['nola', 'new orleans', 'kxhighnola', 'kxlownola', 'kxrainnola', 'hightnola'],
      };
      if (!cityPatterns[selectedCity]?.some((p) => searchText.includes(p))) return false;
    }
    if (selectedMarketType !== 'all' && getMarketType(ticker) !== selectedMarketType) return false;
    return true;
  });

  const getSnowMonthFromTicker = (ticker: string): string => {
    // Snow tickers like KXSNOWNYC-26JAN-6 have format YYMM
    const match = ticker.match(/(\d{2})([A-Z]{3})/i);
    if (!match) return 'this month';
    const [, year, monthStr] = match;
    const monthNames: Record<string, string> = { 
      JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun',
      JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec'
    };
    const monthName = monthNames[monthStr.toUpperCase()] || monthStr;
    return `${monthName} 20${year}`;
  };

  const getEventName = (market: KalshiMarket): string => {
    const city = getCityFromTicker(market.ticker || '');
    const type = getMarketType(market.ticker || '');
    const dateSuffix = getMarketDateSuffix(market.ticker || '');
    switch (type) {
      case 'high': return `Highest temperature in ${city}${dateSuffix}?`;
      case 'low': return `Lowest temperature in ${city}${dateSuffix}?`;
      case 'rain': return `Will it rain in ${city}${dateSuffix}?`;
      case 'snow': return `Snow in ${city} in ${getSnowMonthFromTicker(market.ticker || '')}?`;
      default: return market.title?.replace(/\*\*/g, '') || 'Unknown';
    }
  };

  const isBinaryMarket = (ticker: string): boolean => getMarketType(ticker) === 'rain';

  const getOutcomeLabel = (market: KalshiMarket): string => {
    const ticker = market.ticker || '';
    const type = getMarketType(ticker);
    if (type === 'rain') return market.yes_sub_title || 'Yes';
    if (type === 'snow') { const m = ticker.match(/-(\d+\.?\d*)$/); if (m) return `${parseFloat(m[1])}+ inches`; }
    if (market.yes_sub_title) return market.yes_sub_title;
    const bm = ticker.match(/-B(\d+)\.5$/i); if (bm) return `${parseInt(bm[1])}° to ${parseInt(bm[1]) + 1}°`;
    const tm = ticker.match(/-T(\d+)$/i);
    if (tm) { const t = parseInt(tm[1]); const title = market.title?.toLowerCase() || ''; return title.includes('<') || title.includes('less') ? `${t - 1}° or below` : `${t}° or above`; }
    return market.subtitle || ticker;
  };

  const groupedMarkets = filteredMarkets.reduce((acc, market) => {
    const eventTitle = getEventName(market);
    if (!acc[eventTitle]) acc[eventTitle] = [];
    acc[eventTitle].push(market);
    return acc;
  }, {} as Record<string, KalshiMarket[]>);

  const getTempFromTicker = (ticker: string): number => {
    const bm = ticker.match(/-B(\d+\.?\d*)$/i); if (bm) return parseFloat(bm[1]);
    const tm = ticker.match(/-T(\d+)$/i); if (tm) return parseFloat(tm[1]);
    return 0;
  };

  const calculateEmpiricalStdDev = (serviceHighs: number[]): number => {
    if (!serviceHighs || serviceHighs.length < 2) return ENSEMBLE_STD_DEV;
    const mean = serviceHighs.reduce((sum, v) => sum + v, 0) / serviceHighs.length;
    return Math.sqrt(serviceHighs.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / serviceHighs.length);
  };

  const estimateMarketImpliedSd = (marketProb: number): number => (marketProb < 0.15 || marketProb > 0.85) ? 4.5 : 3.5;

  // Estimate market mean AND sd from bin prices (weighted by yes_bid probabilities)
  const estimateMarketMeanSd = (eventMarkets: KalshiMarket[]): { mean: number; sd: number } | null => {
    let weightedSum = 0, totalWeight = 0;
    const thresholds: { threshold: number; p: number }[] = [];
    eventMarkets.forEach((m) => {
      const threshold = getTempFromTicker(m.ticker);
      const p = (m.yes_bid || 0) / 100;
      if (threshold > 0 && p > 0) {
        weightedSum += threshold * p;
        totalWeight += p;
        thresholds.push({ threshold, p });
      }
    });
    if (totalWeight < 0.1) return null;
    const mean = weightedSum / totalWeight;
    // Calculate variance from weighted deviations
    let varSum = 0;
    thresholds.forEach(({ threshold, p }) => {
      varSum += p * Math.pow(threshold - mean, 2);
    });
    const sd = Math.sqrt(varSum / totalWeight) || 2.0;
    return { mean, sd };
  };

  const getActuarialStdDevSync = (baseStdDev: number, isMarketTomorrow: boolean = false, _empiricalStdDev: number = ENSEMBLE_STD_DEV, _marketProb?: number, _hoursRemaining: number = 17): number => {
    // Base SD already comes from backend calibration; keep it stable client-side.
    const sd = Math.max(0.5, baseStdDev);
    console.log(`[ActuarialSD] base=${baseStdDev.toFixed(2)}, tomorrow=${isMarketTomorrow}, final=${sd.toFixed(2)}°F`);
    return sd;
  };

  const calculateTWProbability = (market: KalshiMarket, forecast: { highTemp: number; stdDev: number; serviceHighs: number[]; nwsObservedHigh?: number; nwsObservationFresh?: boolean; nwsObservationAgeMinutes?: number; stationId?: string } | null, eventMarkets?: KalshiMarket[]): number | null => {
    if (!forecast) return null;
    const { highTemp, stdDev, serviceHighs, nwsObservedHigh, stationId } = forecast;
    const ticker = market.ticker || '';
    if (getMarketType(ticker) !== 'high') return null;
    
    const marketCityId = getCityIdFromTicker(ticker);
    const marketTimeZone = getTimeZoneForCity(marketCityId);
    const hoursRemaining = getHoursRemaining(marketTimeZone);
    const observedHigh = (typeof nwsObservedHigh === 'number' && Number.isFinite(nwsObservedHigh)) ? nwsObservedHigh : null;
    const hasNwsObserved = observedHigh !== null;
    
    // Use MAX(observed, forecast) as predicted high. Only lock to observed-only
    // after 5pm local station time (hoursRemaining < 2) when temps are truly declining.
    let predictedTemp: number;
    if (hasNwsObserved && hoursRemaining < 2) {
      predictedTemp = observedHigh;
      console.log(`[NWS Lock] hours=${hoursRemaining}, using observed high=${predictedTemp.toFixed(1)}°F (no market blend)`);
    } else if (hasNwsObserved) {
      predictedTemp = Math.max(observedHigh, highTemp);
      console.log(`[NWS MidDay] hours=${hoursRemaining}, observed=${observedHigh.toFixed(1)}°F, forecast=${highTemp.toFixed(1)}°F, using=${predictedTemp.toFixed(1)}°F`);
    } else {
      // Start with TW's bias-corrected forecast, applying city-specific seasonal bias
      predictedTemp = applyBiasCorrection(highTemp, ENSEMBLE_BIAS_CORRECTION, stationId);
      
      // Configurable market blending: when blend_weight_base > 0, blend with market-implied mean.
      // Dynamic: when ensemble sources agree tightly (low empirical SD), reduce blend toward highConf weight.
      if (blendConfig.base > 0 && eventMarkets && eventMarkets.length > 1) {
        const marketStats = estimateMarketMeanSd(eventMarkets);
        if (marketStats) {
          const sourceSpread = calculateEmpiricalStdDev(serviceHighs);
          // Interpolate: low spread → highConf weight, high spread → base weight
          const t = Math.min(1, sourceSpread / blendConfig.ciThreshold);
          const dynamicBlend = blendConfig.highConf + t * (blendConfig.base - blendConfig.highConf);
          const blendedTemp = predictedTemp * (1 - dynamicBlend) + marketStats.mean * dynamicBlend;
          console.log(`[Market Blend] TW=${predictedTemp.toFixed(1)}°F, market=${marketStats.mean.toFixed(1)}°F, spread=${sourceSpread.toFixed(2)}°F, blend=${(dynamicBlend * 100).toFixed(0)}%, result=${blendedTemp.toFixed(1)}°F`);
          predictedTemp = blendedTemp;
        } else {
          console.log(`[TW Independent] hours=${hoursRemaining}, forecast=${highTemp.toFixed(1)}°F, biasAdj=${predictedTemp.toFixed(1)}°F (no market data for blend)`);
        }
      } else {
        console.log(`[TW Independent] hours=${hoursRemaining}, forecast=${highTemp.toFixed(1)}°F, biasAdj=${predictedTemp.toFixed(1)}°F (blend disabled)`);
      }
    }
    
    const empiricalSd = calculateEmpiricalStdDev(serviceHighs);
    const today = getLocalDateString(marketTimeZone);
    const tomorrowStr = getTomorrowDateString(marketTimeZone);
    const marketDateFromTicker = extractDateFromTicker(ticker) || marketDate;
    const isMarketTomorrow = marketDateFromTicker === tomorrowStr && marketDateFromTicker !== today;
    let effectiveStdDev = getActuarialStdDevSync(stdDev, isMarketTomorrow, empiricalSd);
    
    // Very late day with NWS observation: locked tight
    if (hasNwsObserved && hoursRemaining < 2) {
      effectiveStdDev = 0.5;
      console.log(`[NWS Lock SD] Using tight σ=${effectiveStdDev.toFixed(2)}°F for observed high (late day)`);
    }

    const bm = ticker.match(/-B(\d+)\.5$/i);
    if (bm) { const low = parseInt(bm[1], 10); return Math.round(calculateRangeProbability(low, low + 1, predictedTemp, effectiveStdDev) * 100); }
    const tm = ticker.match(/-T(\d+)$/i);
    if (tm) {
      const threshold = parseInt(tm[1], 10);
      const title = (market.title || '').toLowerCase();
      const subtitle = (market.yes_sub_title || '').toLowerCase();
      if (title.includes('<') || title.includes('below') || title.includes('less') || subtitle.includes('below') || subtitle.includes('or less')) {
        return Math.round(calculateBelowProbability(threshold - 1, predictedTemp, effectiveStdDev) * 100);
      }
      return Math.round(calculateAboveProbability(threshold + 1, predictedTemp, effectiveStdDev) * 100);
    }
    return null;
  };

  const calculateTWRainProbability = (predictedRainChance: number | undefined): number | null => {
    if (predictedRainChance === undefined) return null;
    return calculateActuarialRainProbability(predictedRainChance, 20);
  };

  Object.keys(groupedMarkets).forEach((key) => {
    const marketType = groupedMarkets[key][0] ? getMarketType(groupedMarkets[key][0].ticker) : 'other';
    if (marketType === 'rain') groupedMarkets[key].sort((a, b) => new Date(a.close_time).getTime() - new Date(b.close_time).getTime());
    else groupedMarkets[key].sort((a, b) => getTempFromTicker(a.ticker) - getTempFromTicker(b.ticker));
  });

  const loadData = async () => {
    setIsLoading(true);
    try { setMarkets(await getWeatherMarkets()); }
    catch (error) { toast({ title: 'Failed to load markets', description: error instanceof Error ? error.message : 'Check your API credentials', variant: 'destructive' }); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleBetClick = (market: KalshiMarket, side: 'yes' | 'no') => {
    if (!user) { toast({ title: 'Please log in to place bets', variant: 'destructive' }); return; }
    if (!isAccountLinked) { toast({ title: 'Link your Kalshi account first', description: "Click 'Link Kalshi Account' above to connect", variant: 'destructive' }); return; }
    setConfirmModal({ open: true, market, side });
  };

  const handleConfirmOrder = async (contracts: number) => {
    if (!confirmModal.market) return;
    const { market, side } = confirmModal;
    setIsPlacingOrder(`${market.ticker}-${side}`);
    try {
      const price = side === 'yes' ? market.yes_ask : market.no_ask;
      await placeOrder({ ticker: market.ticker, action: 'buy', side, type: 'limit', count: contracts, ...(side === 'yes' ? { yes_price: price } : { no_price: price }) });
      toast({ title: 'Order placed!', description: `Bought ${contracts} ${side.toUpperCase()} at ${price}¢ each` });
      await loadData();
    } catch (error) { toast({ title: 'Order failed', description: error instanceof Error ? error.message : 'Failed to place order', variant: 'destructive' }); throw error; }
    finally { setIsPlacingOrder(null); }
  };

  if (isLoading) {
    return <Card className="p-6 bg-card"><div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Loading markets...</span></div></Card>;
  }

  const eventTitles = Object.keys(groupedMarkets).sort((a, b) => {
    const getPriority = (title: string) => { if (title.includes('Highest temperature')) return 0; if (title.includes('Lowest temperature')) return 1; if (title.includes('rain')) return 2; if (title.includes('Snow')) return 3; return 4; };
    return getPriority(a) - getPriority(b);
  });

  return (
    <>
      <Card className="bg-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Weather Prediction Markets</h2>
            {(() => {
              if (!marketDate) return null;
              const activeCityId = selectedCity === 'all' ? 'nyc' : selectedCity;
              const activeTimeZone = getTimeZoneForCity(activeCityId);
              const today = getLocalDateString(activeTimeZone);
              const tomorrowStr = getTomorrowDateString(activeTimeZone);
              if (marketDate === tomorrowStr) {
                return <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 flex items-center gap-1.5 animate-pulse"><Bell className="h-3 w-3" />{new Date(marketDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} markets now open</Badge>;
              }
              return null;
            })()}
          </div>
          {checkingAccount ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <KalshiAccountLink />}
        </div>
        {/* Auto-trade agent hidden for now */}
        {/* <div className="p-4 border-b border-border"><KalshiAutoTrade isAccountLinked={isAccountLinked} /></div> */}
        <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          {CITIES.map((city) => <button key={city.id} onClick={() => setSelectedCity(city.id)} className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedCity === city.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{city.label}</button>)}
          <button onClick={loadData} className="ml-auto p-1.5 text-muted-foreground hover:text-foreground"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
          <Zap className="h-4 w-4 text-muted-foreground" />
          {MARKET_TYPES.map((type) => <button key={type.id} onClick={() => setSelectedMarketType(type.id)} className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedMarketType === type.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{type.label}</button>)}
        </div>
        {(() => {
          const displayCityId = selectedCity !== 'all' ? selectedCity : Object.keys(cityForecasts)[0];
          const displayCityForecasts = displayCityId ? cityForecasts[displayCityId] : null;
          const displayCityLabel = CITIES.find((c) => c.id === displayCityId)?.label || '';
          if (!displayCityForecasts) return null;
          const stationInfo = displayCityId ? KALSHI_SETTLEMENT_COORDS[displayCityId] : null;
          const displayTimeZone = getTimeZoneForCity(displayCityId);
          const today = getLocalDateString(displayTimeZone);
          const targetDate = marketDate || today;
          const displayForecast = displayCityForecasts[targetDate] || displayCityForecasts[today] || Object.values(displayCityForecasts)[0];
          if (!displayForecast) return null;
          const hoursRemaining = getHoursRemaining(displayTimeZone);
          return (
            <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border-b border-border flex items-center gap-4 flex-wrap">
              <Zap className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium">ThunderWear predicts for {displayCityLabel}{marketDate && <span className="text-xs text-muted-foreground ml-1">({new Date(marketDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})</span>}:</span>
              {stationInfo && <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 text-xs">Official NWS: {stationInfo.stationId}</Badge>}
              {loadingPrediction ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
                <>
                  {(() => {
                    const hasObservedHigh = typeof displayForecast.nwsObservedHigh === 'number' && Number.isFinite(displayForecast.nwsObservedHigh);
                    const showObserved = hasObservedHigh && (displayForecast.nwsObservationFresh ?? true);
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{showObserved ? 'Observed High:' : 'Daily High:'}</span>
                        <span className="font-bold">{(showObserved ? displayForecast.nwsObservedHigh : displayForecast.highTemp).toFixed(1)}°F</span>
                        {showObserved ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">NWS</span> : <span className="text-xs text-muted-foreground">±{displayForecast.stdDev.toFixed(1)}° (95% CI)</span>}
                        {hasObservedHigh && !showObserved ? <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">NWS stale {displayForecast.nwsObservationAgeMinutes ?? '?'}m</span> : null}
                      </div>
                    );
                  })()}
                  {typeof displayForecast.nwsObservedHigh === 'number' && Number.isFinite(displayForecast.nwsObservedHigh) && (displayForecast.nwsObservationFresh ?? true) && <div className="flex items-center gap-2 text-muted-foreground"><span className="text-xs">(Forecast was {displayForecast.highTemp.toFixed(1)}°F)</span></div>}
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Rain:</span><span className="font-bold">{displayForecast.rainChance.toFixed(1)}%</span></div>
                  {(() => {
                    const hasObservedHigh = typeof displayForecast.nwsObservedHigh === 'number' && Number.isFinite(displayForecast.nwsObservedHigh);
                    const showObserved = hasObservedHigh && (displayForecast.nwsObservationFresh ?? true);
                    const temp = showObserved ? (displayForecast.nwsObservedHigh as number) : displayForecast.highTemp;
                    const baseStdDev = displayForecast.stdDev;
                    const empiricalSd = calculateEmpiricalStdDev(displayForecast.serviceHighs);
                    const today = getLocalDateString(displayTimeZone);
                    const tomorrowStr = getTomorrowDateString(displayTimeZone);
                    const isMarketTomorrow = targetDate === tomorrowStr && targetDate !== today;
                    const effectiveStdDev = getActuarialStdDevSync(baseStdDev, isMarketTomorrow, empiricalSd, undefined, hoursRemaining);
                    const dynamicBins: number[] = [];
                    const center = Math.round(temp / 5) * 5;
                    for (let t = center - 15; t <= center + 15; t += 5) if (t >= 40 && t <= 100) dynamicBins.push(t);
                    const binsWithProbs = dynamicBins.map((threshold) => ({ threshold, prob: Math.round(calculateAboveProbability(threshold, temp, effectiveStdDev) * 100) })).filter((b) => b.prob > 10 && b.prob < 90);
                    const relevantBins = binsWithProbs.sort((a, b) => Math.abs(50 - a.prob) - Math.abs(50 - b.prob)).slice(0, 4).sort((a, b) => a.threshold - b.threshold);
                    if (relevantBins.length === 0) return null;
                    const displayTemp = (t: number) => unitPrefs.temperature_unit === 'celsius' ? Math.round(((t - 32) * 5) / 9) : t;
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">TW Probs:</span>
                        {relevantBins.map((bin) => <Badge key={bin.threshold} variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-1.5 py-0">{bin.prob}% &gt;{displayTemp(bin.threshold)}°</Badge>)}
                      </div>
                    );
                  })()}
                  {displayForecast.biasCorrection && <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"><span className="text-xs font-medium">Bias: {displayForecast.biasCorrection.appliedF >= 0 ? '+' : ''}{displayForecast.biasCorrection.appliedF.toFixed(1)}°F</span><span className="text-xs opacity-70">({displayForecast.biasCorrection.sampleSize}h)</span></div>}
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"><TrendingUp className="h-3 w-3" /><span className="text-xs font-medium">Actuarial</span></div>
                </>
              )}
              <span className="text-xs text-muted-foreground ml-auto">Updated {displayForecast.lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
              <button onClick={() => fetchAllCityForecasts(true)} disabled={loadingPrediction} className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"><RefreshCw className={`h-4 w-4 text-blue-500 ${loadingPrediction ? 'animate-spin' : ''}`} /></button>
            </div>
          );
        })()}
        {eventTitles.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground"><p>No markets available</p><button onClick={() => window.open('https://kalshi.com/markets?category=weather', '_blank')} className="mt-2 text-sm text-primary hover:underline">View on Kalshi →</button></div>
        ) : eventTitles.map((eventTitle) => {
          const eventMarkets = groupedMarkets[eventTitle];
          const firstMarket = eventMarkets[0];
          const isBinary = firstMarket && isBinaryMarket(firstMarket.ticker);
          return (
            <div key={eventTitle}>
              <div className="px-4 py-3 border-b border-border"><h3 className="font-semibold text-foreground">{eventTitle}</h3></div>
              {isBinary && firstMarket ? (() => {
                const kalshiProb = firstMarket.yes_bid || firstMarket.last_price || firstMarket.yes_ask || 0;
                const marketForecast = getForecastForMarket(firstMarket);
                const twRainProb = calculateTWRainProbability(marketForecast?.rainChance);
                const probDiff = twRainProb !== null ? twRainProb - kalshiProb : null;
                return (
                  <div className="flex items-center justify-between px-4 py-4">
                    <div className="flex items-center gap-4">
                      {twRainProb !== null && <span className={`text-lg font-bold ${probDiff !== null && Math.abs(probDiff) >= 5 ? (probDiff > 0 ? 'text-green-600' : 'text-red-600') : 'text-blue-500'}`}>{twRainProb}%<span className="ml-1 text-xs font-normal text-muted-foreground">TW</span></span>}
                      <span className={`text-lg font-bold ${kalshiProb >= 10 ? 'text-foreground' : 'text-muted-foreground'}`}>{kalshiProb < 1 ? '<1%' : `${kalshiProb}%`}<span className="ml-1 text-xs font-normal text-muted-foreground">Kalshi</span></span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleBetClick(firstMarket, 'yes')} disabled={isPlacingOrder === `${firstMarket.ticker}-yes`} className="h-10 px-6 text-sm font-medium rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-950/50 dark:text-green-400">{isPlacingOrder === `${firstMarket.ticker}-yes` ? <Loader2 className="h-4 w-4 animate-spin" /> : `Yes ${firstMarket.yes_ask || 1}¢`}</button>
                      <button onClick={() => handleBetClick(firstMarket, 'no')} disabled={isPlacingOrder === `${firstMarket.ticker}-no`} className="h-10 px-6 text-sm font-medium rounded-full bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50">{isPlacingOrder === `${firstMarket.ticker}-no` ? <Loader2 className="h-4 w-4 animate-spin" /> : `No ${firstMarket.no_ask || 1}¢`}</button>
                    </div>
                  </div>
                );
              })() : (() => {
                // Only sum B-type (band) probabilities — T-type are cumulative/overlapping
                let twProbSum = 0;
                eventMarkets.forEach((market) => {
                  const ticker = (market.ticker || '').toUpperCase();
                  const isBandMarket = ticker.match(/-B\d/i);
                  if (isBandMarket) {
                    const prob = calculateTWProbability(market, getForecastForMarket(market), eventMarkets);
                    if (prob !== null) twProbSum += prob;
                  }
                });
                return (
                  <>
                    <div className="flex items-center px-4 py-3 text-sm text-muted-foreground"><span className="flex-1"></span><span className="w-16 text-center">TW</span><span className="w-16 text-center">Kalshi</span><span className="w-[168px]"></span></div>
                    {eventMarkets.map((market) => {
                      const yesProb = market.yes_bid || market.last_price || market.yes_ask || 0;
                      const isHighest = yesProb === Math.max(...eventMarkets.map((m) => m.yes_bid || m.last_price || 0));
                      const marketForecast = getForecastForMarket(market);
                      const twProb = calculateTWProbability(market, marketForecast, eventMarkets);
                      const probDiff = twProb !== null ? twProb - yesProb : null;
                      return (
                        <div key={market.ticker} className="flex items-center px-4 py-3 border-t border-border/50">
                          <span className="flex-1 text-foreground">{getOutcomeLabel(market)}</span>
                          <span className={`w-16 text-center text-sm ${twProb !== null ? (probDiff !== null && Math.abs(probDiff) >= 5 ? (probDiff > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold') : 'text-blue-500') : 'text-muted-foreground'}`}>{twProb !== null ? `${twProb}%` : '-'}</span>
                          <span className={`w-16 text-center ${yesProb >= 10 ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{yesProb < 1 ? '<1%' : `${yesProb}%`}</span>
                          <div className="flex gap-2 w-[168px]">
                            <button onClick={() => handleBetClick(market, 'yes')} disabled={isPlacingOrder === `${market.ticker}-yes`} className={`flex-1 h-10 text-sm font-medium rounded-lg border disabled:opacity-50 ${isHighest ? 'bg-green-100 border-green-200 text-green-700 hover:bg-green-200 dark:bg-green-950/50 dark:border-green-800 dark:text-green-400' : 'border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-500'}`}>{isPlacingOrder === `${market.ticker}-yes` ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Yes ${market.yes_ask || 1}¢`}</button>
                            <button onClick={() => handleBetClick(market, 'no')} disabled={isPlacingOrder === `${market.ticker}-no`} className="flex-1 h-10 text-sm font-medium rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50 dark:border-purple-800 dark:text-purple-400">{isPlacingOrder === `${market.ticker}-no` ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `No ${market.no_ask || 1}¢`}</button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center px-4 py-2 border-t border-border/50 bg-muted/30 text-xs text-muted-foreground"><span className="flex-1">TW Sum: {twProbSum}% • Missing: {100 - twProbSum}% (buckets not on Kalshi)</span></div>
                  </>
                );
              })()}
            </div>
          );
        })}
        <div className="p-3 border-t border-border text-center"><a href="https://kalshi.com/markets?category=weather" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary">View all markets on Kalshi →</a></div>
      </Card>
      <BiasReviewDashboard />
      {confirmModal.market && <OrderConfirmationModal open={confirmModal.open} onOpenChange={(open) => setConfirmModal((prev) => ({ ...prev, open }))} market={confirmModal.market} side={confirmModal.side} onConfirm={handleConfirmOrder} />}
    </>
  );
};
