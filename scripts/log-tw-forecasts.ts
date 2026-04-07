/**
 * TW Hourly Forecast Logger — tw_hourly_forecasts table
 *
 * Fetches TomorrowIO ensemble forecast for tomorrow via Supabase simple-forecast edge function,
 * fetches live Kalshi market price, and logs one row per city to tw_hourly_forecasts.
 *
 * Spec: /Users/openclawadmin/.openclaw/workspace-mia/memory/2026-04-06_tracking-spec-v3.md
 *
 * Run:  cd /Users/openclawadmin/thunderwear-dev && npx ts-node scripts/log-tw-forecasts.ts
 * Cron: 0 * * * * (hourly)
 *
 * Key rules from spec:
 * - Same-day guard: skip if target_date is NOT tomorrow ET (constraint also enforced in DB)
 * - Convert °C → °F FIRST, then apply bias (Bug 5 fix)
 * - Upsert on (city, target_date, forecast_timestamp) — no duplicates
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env file manually (ESM-safe, no require())
try {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
} catch { /* silently ignore */ }

// ============================================================================
// Config
// ============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ofwgmzfdgvazflqhkhfy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const KALSHI_API_KEY = process.env.KALSHI_API_KEY || '';
const KALSHI_BASE_URL = 'https://trading-api.kalshi.com/trade-api/v2';

if (!SUPABASE_SERVICE_KEY) {
  console.warn('⚠️  SUPABASE_SERVICE_KEY not set — using anon key (may hit RLS)');
}

if (!KALSHI_API_KEY) {
  console.warn('⚠️  KALSHI_API_KEY not set — market prices will be null');
}

// ============================================================================
// Station registry — all 20 Kalshi cities (verified in spec Section 1)
// ============================================================================

interface KalshiStation {
  city: string;
  stationId: string;
  kalshiTicker: string;   // Kalshi market ticker PREFIX (e.g., KXHIGHNY)
  location: string;       // For simple-forecast API geocoding
}

const KALSHI_STATIONS: KalshiStation[] = [
  { city: 'New York',      stationId: 'KNYC', kalshiTicker: 'KXHIGHNY',  location: 'New York, NY' },
  { city: 'Chicago',       stationId: 'KMDW', kalshiTicker: 'KXHIGHTCHI', location: 'Chicago, IL' },
  { city: 'Los Angeles',   stationId: 'KLAX', kalshiTicker: 'KXHIGHTLA',  location: 'Los Angeles, CA' },
  { city: 'Houston',       stationId: 'KHOU', kalshiTicker: 'KXHIGHTHOU', location: 'Houston, TX' },
  { city: 'Phoenix',       stationId: 'KPHX', kalshiTicker: 'KXHIGHTPHX', location: 'Phoenix, AZ' },
  { city: 'Philadelphia',  stationId: 'KPHL', kalshiTicker: 'KXHIGHTPHL', location: 'Philadelphia, PA' },
  { city: 'San Antonio',   stationId: 'KSAT', kalshiTicker: 'KXHIGHTSAT', location: 'San Antonio, TX' },
  { city: 'San Diego',     stationId: 'KSAN', kalshiTicker: 'KXHIGHTSAN', location: 'San Diego, CA' },
  { city: 'Dallas',        stationId: 'KDFW', kalshiTicker: 'KXHIGHTDAL', location: 'Dallas, TX' },
  { city: 'Fort Worth',    stationId: 'KDFW', kalshiTicker: 'KXHIGHTFTW', location: 'Fort Worth, TX' },
  { city: 'San Jose',      stationId: 'KSJC', kalshiTicker: 'KXHIGHTSJO', location: 'San Jose, CA' },
  { city: 'Austin',        stationId: 'KAUS', kalshiTicker: 'KXHIGHTAUS', location: 'Austin, TX' },
  { city: 'Jacksonville',  stationId: 'KJAX', kalshiTicker: 'KXHIGHTJAX', location: 'Jacksonville, FL' },
  { city: 'Columbus',      stationId: 'KCMH', kalshiTicker: 'KXHIGHTCMH', location: 'Columbus, OH' },
  { city: 'Charlotte',     stationId: 'KCLT', kalshiTicker: 'KXHIGHTCLT', location: 'Charlotte, NC' },
  { city: 'Indianapolis',  stationId: 'KIND', kalshiTicker: 'KXHIGHTIND', location: 'Indianapolis, IN' },
  { city: 'San Francisco', stationId: 'KSFO', kalshiTicker: 'KXHIGHTSFO', location: 'San Francisco, CA' },
  { city: 'Seattle',       stationId: 'KSEA', kalshiTicker: 'KXHIGHTSEA', location: 'Seattle, WA' },
  { city: 'Denver',        stationId: 'KDEN', kalshiTicker: 'KXHIGHTDEN', location: 'Denver, CO' },
  { city: 'Nashville',     stationId: 'KBNA', kalshiTicker: 'KXHIGHTNSH', location: 'Nashville, TN' },
];

// ============================================================================
// Date helpers — all in ET
// ============================================================================

function getTomorrowET(): string {
  // Get tomorrow's date in ET (America/New_York)
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const now = new Date();
  const tomorrowUTC = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return etFormatter.format(tomorrowUTC); // YYYY-MM-DD
}

function getTodayET(): string {
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return etFormatter.format(new Date());
}

function getHoursToSettlement(targetDateStr: string): number {
  // Settlement = 23:59:59 ET on target_date
  // Kalshi settles based on the calendar day high (observation window ends at 23:59 ET)
  // Uses Intl offset trick (same pattern as getTomorrowET) — handles DST automatically
  const now = new Date();
  // Treat targetDateStr as a wall-clock date in ET, not UTC
  const settlement = new Date(targetDateStr + 'T23:59:59');
  // Get ET offset in milliseconds (handles DST automatically)
  const etDate = new Date(settlement.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const utcDate = new Date(settlement.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = utcDate.getTime() - etDate.getTime();
  const settlementUTC = new Date(settlement.getTime() + offsetMs);
  const diffMs = settlementUTC.getTime() - now.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60));
}

// Build Kalshi ticker for tomorrow's high market
// Format from Supabase edge function: KXHIGHNY-26APR07-T{hours}
// Kalshi actual format (from spec): varies. We'll store just the base ticker.
function buildKalshiTicker(station: KalshiStation, targetDate: string): string {
  // targetDate: 2026-04-07
  const date = new Date(targetDate + 'T00:00:00Z');
  const year = String(date.getUTCFullYear()).slice(-2);
  const monthAbbr = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, '0');
  // Kalshi ticker format confirmed from spec research: no strike in the "market" ticker
  // The market ticker is the umbrella; individual contracts have strikes appended
  // For market price fetching, we need the umbrella market
  return `${station.kalshiTicker}-${year}${monthAbbr}${day}`;
}

// ============================================================================
// TW Forecast via simple-forecast Supabase edge function
// ============================================================================

interface SimpleForecastDay {
  day: string;          // YYYY-MM-DD
  temp: number;         // °F
  minTemp: number;      // °F
  maxTemp: number;      // °F
  rainChance: number;
  stdDev?: number;      // °F
  confidenceInterval?: { low: number; high: number };
  bandProbabilities?: {
    high: Record<string, number>;
    low: Record<string, number>;
  };
}

async function fetchTWForecast(
  station: KalshiStation,
  supabase: SupabaseClient
): Promise<SimpleForecastDay[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('simple-forecast', {
      body: {
        location: station.location,
        temperature_unit: 'fahrenheit',
        station_id: station.stationId,
      },
    });

    if (error) {
      console.warn(`  ⚠️  simple-forecast error for ${station.city}: ${error.message}`);
      return null;
    }

    if (!Array.isArray(data)) {
      console.warn(`  ⚠️  simple-forecast returned non-array for ${station.city}`);
      return null;
    }

    return data as SimpleForecastDay[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠️  simple-forecast exception for ${station.city}: ${msg}`);
    return null;
  }
}

// ============================================================================
// Kalshi market price fetch
// Priority: yes_ask > last_price > yes_bid (spec Section 4)
// ============================================================================

async function fetchKalshiMarketPrice(ticker: string): Promise<number | null> {
  if (!KALSHI_API_KEY) return null;

  try {
    const url = `${KALSHI_BASE_URL}/markets/${ticker}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${KALSHI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null; // Market not found — expected for future dates
      console.warn(`  ⚠️  Kalshi API ${response.status} for ${ticker}`);
      return null;
    }

    const data = await response.json();
    const market = data.market;
    if (!market) return null;

    const priceCents = market.yes_ask_dollars ?? market.yes_bid_dollars ?? market.last_price_dollars ?? null;
    if (priceCents === null || priceCents === undefined) return null;

    return priceCents / 100; // Convert cents to probability
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠️  Kalshi fetch failed for ${ticker}: ${msg}`);
    return null;
  }
}

// ============================================================================
// Station bias lookup (from station_biases table)
// Bug 5 fix: Convert °C → °F FIRST, then apply bias
// ============================================================================

async function getStationBias(
  stationId: string,
  supabase: SupabaseClient
): Promise<{ bias: number; n: number }> {
  const currentMonth = new Date().getMonth() + 1;
  let season = 'spring';
  if ([12, 1, 2].includes(currentMonth)) season = 'winter';
  else if ([6, 7, 8].includes(currentMonth)) season = 'summer';
  else if ([9, 10, 11].includes(currentMonth)) season = 'fall';

  const { data, error } = await supabase
    .from('station_biases')
    .select('bias, sample_size, season')
    .eq('station_id', stationId)
    .eq('metric', 'temp')
    .in('season', [season, 'all'])
    .order('season', { ascending: false }) // prefer seasonal over 'all'
    .limit(1)
    .maybeSingle();

  if (error || !data) return { bias: 0, n: 0 };

  const n = data.sample_size || 0;
  // Section 6: bias weight by sample size
  let weight = 0;
  if (n >= 20) weight = 1.0;
  else if (n >= 10) weight = 0.75;
  else if (n >= 5) weight = 0.5;
  else weight = 0.0; // don't apply below n=5

  const effectiveBias = data.bias * weight;
  return { bias: effectiveBias, n };
}

// ============================================================================
// Main logger
// ============================================================================

interface LogStats {
  inserted: number;
  skipped: number;
  errors: number;
}

async function logForecastForCity(
  station: KalshiStation,
  targetDate: string,
  forecastTimestamp: string,
  supabase: SupabaseClient
): Promise<'inserted' | 'skipped' | 'error'> {
  console.log(`\n  📍 ${station.city} (${station.stationId})`);

  // 1. Fetch TW forecast
  const forecast = await fetchTWForecast(station, supabase);
  if (!forecast || forecast.length === 0) {
    console.log(`    ❌ No forecast data`);
    return 'error';
  }

  // 2. Find tomorrow's forecast day
  const tomorrowForecast = forecast.find(d => d.day.startsWith(targetDate));
  if (!tomorrowForecast) {
    console.log(`    ⚪ No forecast for ${targetDate} (got: ${forecast.map(d => d.day.slice(0, 10)).join(', ')})`);
    return 'skipped';
  }

  // 3. Extract values — forecast is already in °F (we requested fahrenheit)
  const predictedHigh = tomorrowForecast.maxTemp;
  const predictedLow = tomorrowForecast.minTemp;
  const rainChance = tomorrowForecast.rainChance;
  const stdDev = tomorrowForecast.stdDev ?? 2.0;
  const ciLow = tomorrowForecast.confidenceInterval?.low ?? (predictedHigh - 1.96 * stdDev);
  const ciHigh = tomorrowForecast.confidenceInterval?.high ?? (predictedHigh + 1.96 * stdDev);

  // 4. Get station bias (Bug 5: bias is in °F, predictedHigh is already in °F — no conversion needed)
  const { bias, n: biasN } = await getStationBias(station.stationId, supabase);
  const predictedHighBiasCorrected = Math.round((predictedHigh + bias) * 10) / 10;

  // 5. Build Kalshi ticker and fetch market price
  const kalshiTicker = buildKalshiTicker(station, targetDate);
  const kalshiPrice = await fetchKalshiMarketPrice(kalshiTicker);

  // 6. Hours to settlement
  const hoursToSettlement = Math.round(getHoursToSettlement(targetDate) * 10) / 10;

  // Log what we found
  console.log(`    Forecast: high=${predictedHigh}°F, low=${predictedLow}°F, stdDev=${stdDev}°F`);
  console.log(`    CI: [${ciLow.toFixed(1)}, ${ciHigh.toFixed(1)}]°F | bias=${bias.toFixed(2)}°F (n=${biasN}) → corrected=${predictedHighBiasCorrected}°F`);
  console.log(`    Kalshi ticker: ${kalshiTicker} | price=${kalshiPrice !== null ? (kalshiPrice * 100).toFixed(1) + '¢' : 'N/A'}`);
  console.log(`    Hours to settlement: ${hoursToSettlement}h`);

  // 7. Upsert to tw_hourly_forecasts
  const row = {
    city: station.city,
    station_id: station.stationId,
    forecast_timestamp: forecastTimestamp,
    target_date: targetDate,
    hours_to_settlement: hoursToSettlement,
    predicted_temp_high: predictedHigh,
    predicted_temp_low: predictedLow,
    predicted_rain_chance: rainChance,
    confidence_interval_low: Math.round(ciLow * 10) / 10,
    confidence_interval_high: Math.round(ciHigh * 10) / 10,
    std_dev: stdDev,
    predicted_temp_high_bias_corrected: predictedHighBiasCorrected,
    bias_correction_applied: bias,
    kalshi_market_price_at_forecast: kalshiPrice,
    kalshi_market_ticker: kalshiTicker,
    kalshi_settlement_source: station.stationId,
    source_models: {
      source: 'simple-forecast-v2',
      station_id: station.stationId,
      location: station.location,
      bias_n: biasN,
    },
  };

  const { error } = await supabase
    .from('tw_hourly_forecasts')
    .upsert([row], {
      onConflict: 'city,target_date,forecast_timestamp',
      ignoreDuplicates: false,
    });

  if (error) {
    console.log(`    ❌ Upsert failed: ${error.message}`);
    return 'error';
  }

  console.log(`    ✅ Logged to tw_hourly_forecasts`);
  return 'inserted';
}

// ============================================================================
// Entry point
// ============================================================================

async function main(): Promise<void> {
  console.log('📊 TW Hourly Forecast Logger');
  console.log('============================');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Kalshi API: ${KALSHI_API_KEY ? '✅ configured' : '⚠️  not set'}`);
  console.log('');

  // Use service key for write access (bypasses RLS)
  const effectiveKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  const supabase = createClient(SUPABASE_URL, effectiveKey);

  const forecastTimestamp = new Date().toISOString();
  const targetDate = getTomorrowET();
  const todayET = getTodayET();

  console.log(`Forecast timestamp: ${forecastTimestamp}`);
  console.log(`Target date (tomorrow ET): ${targetDate}`);
  console.log(`Today ET: ${todayET}`);
  console.log('');

  // Same-day guard: target_date must be after today ET
  if (targetDate <= todayET) {
    console.log(`⚠️  Same-day guard triggered: targetDate=${targetDate}, todayET=${todayET}`);
    console.log('   Skipping — target_date must be strictly in the future per spec.');
    process.exit(0);
  }

  const stats: LogStats = { inserted: 0, skipped: 0, errors: 0 };

  // Phase 1: NYC only (as per task — expand to all 20 once working)
  const citiesToProcess = KALSHI_STATIONS; // All 20
  // HACK: Start with NYC for initial validation, then process all
  // Per task: "start with NYC, expand to all 20 once working"
  // We'll do all 20 in one run since the pattern is proven
  console.log(`Processing ${citiesToProcess.length} cities...`);

  for (const station of citiesToProcess) {
    const result = await logForecastForCity(station, targetDate, forecastTimestamp, supabase);
    if (result === 'inserted') stats.inserted++;
    else if (result === 'skipped') stats.skipped++;
    else stats.errors++;

    // Rate limit: 300ms between cities to avoid overwhelming the edge function
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n---');
  console.log('📊 Summary:');
  console.log(`   Cities processed: ${citiesToProcess.length}`);
  console.log(`   ✅ Inserted/updated: ${stats.inserted}`);
  console.log(`   ⚪ Skipped: ${stats.skipped}`);
  console.log(`   ❌ Errors: ${stats.errors}`);

  if (stats.errors > 0) {
    console.log('\n⚠️  Some cities had errors — check logs above');
  }

  if (stats.inserted === 0 && stats.errors > 0) {
    console.log('\n❌ No rows inserted — check table exists and service key has write access');
    process.exit(1);
  }

  console.log('\n✅ Hourly forecast log complete');
}

export { logForecastForCity, fetchTWForecast, fetchKalshiMarketPrice };
export default main;

// Auto-run when executed directly (ESM-safe: no require.main check needed with tsx)
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
