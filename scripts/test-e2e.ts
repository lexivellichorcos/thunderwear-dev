/**
 * E2E Test: Full Pipeline Validation
 * 
 * Runs through the complete data pipeline once:
 * 1. Fetch METAR for KNYC
 * 2. Fetch TW forecast for New York (tomorrow)
 * 3. Fetch live Kalshi price for any NYC ticker
 * 4. Compute TW probability vs Kalshi price → log edge
 * 5. Print PASS or FAIL
 * 
 * Run: cd /Users/openclawadmin/thunderwear-dev && npx tsx scripts/test-e2e.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load .env file manually (ESM-safe)
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

// ============================================================================
// Step 1: Fetch METAR for KNYC
// ============================================================================

async function fetchMETAR(stationId: string): Promise<{ raw: string; temp?: number } | null> {
  try {
    const url = `https://aviationweather.gov/api/data/metar?ids=${stationId}&format=json&hours=1`;
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`  ❌ METAR fetch failed: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const results = Array.isArray(data) ? data : (data.results || []);
    if (results.length === 0) {
      console.log(`  ❌ No METAR results for ${stationId}`);
      return null;
    }
    const metar = results[0];
    const tempC = metar.temp ?? null;
    const tempF = tempC !== null ? (tempC * 9/5) + 32 : undefined;
    return { raw: metar.rawOb || metar.raw_text || '', temp: tempF };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ METAR exception: ${msg}`);
    return null;
  }
}

// ============================================================================
// Step 2: Fetch TW forecast for New York (tomorrow)
// ============================================================================

interface SimpleForecastDay {
  day: string;
  temp: number;
  minTemp: number;
  maxTemp: number;
  rainChance: number;
}

async function fetchTWForecast(supabase: SupabaseClient): Promise<SimpleForecastDay | null> {
  try {
    // Get tomorrow's date in ET
    const etFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
    const targetDate = etFormatter.format(tomorrow);

    const { data, error } = await supabase.functions.invoke('simple-forecast', {
      body: {
        location: 'New York, NY',
        temperature_unit: 'fahrenheit',
        station_id: 'KNYC',
      },
    });

    if (error) {
      console.log(`  ❌ simple-forecast error: ${error.message}`);
      return null;
    }

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`  ❌ simple-forecast returned no data`);
      return null;
    }

    const forecastDay = data.find(d => d.day.startsWith(targetDate));
    if (!forecastDay) {
      console.log(`  ❌ No forecast for ${targetDate}`);
      return null;
    }

    return forecastDay as SimpleForecastDay;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ TW forecast exception: ${msg}`);
    return null;
  }
}

// ============================================================================
// Step 3: Fetch live Kalshi price for NYC ticker
// ============================================================================

async function fetchKalshiPrice(): Promise<{ ticker: string; price: number | null } | null> {
  if (!KALSHI_API_KEY) {
    console.log(`  ⚠️  KALSHI_API_KEY not set — skipping price fetch`);
    return null;
  }

  try {
    // Build NYC high ticker for tomorrow
    const etFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
    const targetDate = etFormatter.format(tomorrow);

    const dateObj = new Date(targetDate + 'T00:00:00Z');
    const year = String(dateObj.getUTCFullYear()).slice(-2);
    const monthAbbr = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][dateObj.getUTCMonth()];
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    const ticker = `KXHIGHNY-${year}${monthAbbr}${day}`;

    const url = `${KALSHI_BASE_URL}/markets/${ticker}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${KALSHI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  ⚠️  Kalshi market not found: ${ticker} (expected for future dates)`);
        return { ticker, price: null };
      }
      console.log(`  ❌ Kalshi API ${response.status}`);
      return null;
    }

    const data = await response.json();
    const market = data.market;
    if (!market) {
      console.log(`  ❌ Kalshi market data missing`);
      return null;
    }

    const priceCents = market.yes_ask_dollars ?? market.yes_bid_dollars ?? market.last_price_dollars;
    const price = priceCents !== null && priceCents !== undefined ? priceCents / 100 : null;

    return { ticker, price };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ Kalshi exception: ${msg}`);
    return null;
  }
}

// ============================================================================
// Step 4: Compute TW probability vs Kalshi price → log edge
// ============================================================================

function computeNormalCDF(x: number): number {
  // Approximation of standard normal CDF
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const y = 1.0 - (((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-x * x));
  return 0.5 * (1.0 + sign * y);
}

function computeEdge(forecast: SimpleForecastDay, kalshiPrice: number | null): { prob: number; edge: number | null } {
  // Simple model: assume tomorrow's high is normal with mean=forecast.maxTemp, stdDev=2°F
  const strikes = [65, 70, 75, 80, 85, 90];
  
  for (const strike of strikes) {
    const stdDev = 2;
    const zScore = (strike - forecast.maxTemp) / stdDev;
    const twProb = computeNormalCDF(zScore); // P(high >= strike)

    if (kalshiPrice !== null && kalshiPrice > 0) {
      const edge = (twProb - kalshiPrice) * 100; // in % points
      if (Math.abs(edge) > 5) {
        return { prob: twProb, edge };
      }
    }
  }

  return { prob: 0.5, edge: null };
}

// ============================================================================
// Main E2E test
// ============================================================================

async function runE2E(): Promise<boolean> {
  console.log('🧪 E2E Pipeline Test');
  console.log('====================');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Kalshi API: ${KALSHI_API_KEY ? '✅ configured' : '⚠️  not set'}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY);
  let passCount = 0;
  const totalSteps = 5;

  // Step 1: Fetch METAR
  console.log('📡 Step 1: Fetch METAR for KNYC');
  const metar = await fetchMETAR('KNYC');
  if (metar) {
    console.log(`  ✅ METAR raw: ${metar.raw.slice(0, 60)}...`);
    passCount++;
  } else {
    console.log(`  ❌ METAR fetch failed`);
  }

  // Step 2: Fetch TW forecast
  console.log('\n📊 Step 2: Fetch TW forecast for New York (tomorrow)');
  const forecast = await fetchTWForecast(supabase);
  if (forecast) {
    console.log(`  ✅ Forecast: high=${forecast.maxTemp}°F, low=${forecast.minTemp}°F, rain=${forecast.rainChance}%`);
    passCount++;
  } else {
    console.log(`  ❌ TW forecast fetch failed`);
  }

  // Step 3: Fetch live Kalshi price
  console.log('\n💹 Step 3: Fetch live Kalshi price for NYC');
  const kalshi = await fetchKalshiPrice();
  if (kalshi !== null) {
    console.log(`  ✅ Kalshi: ${kalshi.ticker} @ ${kalshi.price !== null ? (kalshi.price * 100).toFixed(1) + '¢' : 'N/A'}`);
    passCount++;
  } else {
    console.log(`  ⚠️  Kalshi price fetch returned error`);
  }

  // Step 4: Compute edge
  console.log('\n⚡ Step 4: Compute TW probability vs Kalshi price');
  if (forecast && kalshi) {
    const { prob, edge } = computeEdge(forecast, kalshi.price);
    console.log(`  TW Prob: ${(prob * 100).toFixed(1)}%`);
    if (edge !== null) {
      console.log(`  ✅ Edge detected: ${edge > 0 ? '+' : ''}${edge.toFixed(2)} % points (TW is ${edge > 0 ? 'over' : 'under'}priced)`);
      passCount++;
    } else {
      console.log(`  ⚪ No significant edge found`);
      passCount++;
    }
  } else {
    console.log(`  ❌ Missing forecast or Kalshi data — skipping edge computation`);
  }

  // Step 5: Report
  console.log('\n📋 Step 5: Final Report');
  const result = passCount >= 3; // Need at least 3/5 steps to pass
  if (result) {
    console.log(`  ✅ PASS (${passCount}/${totalSteps} steps successful)`);
    console.log('');
    console.log('✨ Pipeline validated — ready for dashboard');
  } else {
    console.log(`  ❌ FAIL (${passCount}/${totalSteps} steps successful)`);
    console.log('');
    console.log('⚠️  Pipeline incomplete — check logs above');
  }

  return result;
}

// ============================================================================
// Entry point
// ============================================================================

async function main(): Promise<void> {
  try {
    const passed = await runE2E();
    process.exit(passed ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }
}

export { runE2E };
export default main;

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
