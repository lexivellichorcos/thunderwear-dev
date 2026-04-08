/**
 * METAR Divergence Scanner — Step 11
 *
 * For each verified Kalshi city, fetches the latest METAR observation from
 * aviationweather.gov and compares it against the latest TW hourly forecast.
 * Cities where the observed temp diverges significantly from the forecast are
 * flagged as potential alpha signals.
 *
 * Output: /data/metar-alerts.json
 *
 * Usage:
 *   npx tsx scripts/metar-divergence.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { VERIFIED_KALSHI_CITIES } from './city-registry.js';

// ---------------------------------------------------------------------------
// Env bootstrap
// ---------------------------------------------------------------------------
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
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
} catch { /* ignore */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ofwgmzfdgvazflqhkhfy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Divergence threshold: flag if METAR temp differs from forecast by >= this many °F
const DIVERGENCE_THRESHOLD_F = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetarReading {
  stationId: string;
  city: string;
  observationTime: string;   // ISO timestamp
  tempC: number | null;      // Celsius from METAR
  tempF: number | null;      // Converted to Fahrenheit
  rawMetar: string;
}

export interface MetarDivergenceAlert {
  city: string;
  stationId: string;
  kalshiTicker: string;
  observedTempF: number;
  forecastTempF: number;
  divergenceF: number;         // observed - forecast (positive = warmer than expected)
  divergenceDirection: 'warmer' | 'cooler';
  targetDate: string;
  forecastTimestamp: string;
  metarObservationTime: string;
  flagged: boolean;            // true if |divergence| >= threshold
  notes: string;
}

export interface MetarDivergenceReport {
  generatedAt: string;
  citiesChecked: number;
  citiesFlagged: number;
  threshold_f: number;
  alerts: MetarDivergenceAlert[];
}

// ---------------------------------------------------------------------------
// Fetch METAR from aviationweather.gov
// ---------------------------------------------------------------------------

async function fetchMetar(stationId: string): Promise<MetarReading | null> {
  const url = `https://aviationweather.gov/api/data/metar?ids=${stationId}&format=json&hours=2`;

  try {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!resp.ok) {
      console.warn(`  ⚠️  METAR API ${resp.status} for ${stationId}`);
      return null;
    }

    const data: any[] = await resp.json();
    if (!data || data.length === 0) {
      console.warn(`  ⚠️  No METAR data returned for ${stationId}`);
      return null;
    }

    // Take the most recent observation
    const obs = data[0];
    const tempC = typeof obs.temp === 'number' ? obs.temp : null;
    const tempF = tempC !== null ? Math.round(tempC * 9 / 5 + 32) : null;

    return {
      stationId,
      city: '', // filled in by caller
      observationTime: obs.obsTime || obs.reportTime || new Date().toISOString(),
      tempC,
      tempF,
      rawMetar: obs.rawOb || obs.raw || '',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠️  Failed to fetch METAR for ${stationId}: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch latest TW forecast for a city/date from Supabase
// ---------------------------------------------------------------------------

async function fetchLatestForecast(
  supabase: ReturnType<typeof createClient>,
  city: string,
  targetDate: string
): Promise<{ predictedTempF: number; forecastTimestamp: string } | null> {
  const { data, error } = await supabase
    .from('tw_hourly_forecasts')
    .select('predicted_temp_high_bias_corrected, forecast_timestamp')
    .eq('city', city)
    .eq('target_date', targetDate)
    .order('forecast_timestamp', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;

  const row = data[0] as any;
  return {
    predictedTempF: row.predicted_temp_high_bias_corrected,
    forecastTimestamp: row.forecast_timestamp,
  };
}

// ---------------------------------------------------------------------------
// Get today's date in ET (same convention as rest of TW pipeline)
// ---------------------------------------------------------------------------

function getTodayDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runMetarDivergence(): Promise<MetarDivergenceReport> {
  console.log('🌩️  METAR Divergence Scanner');
  console.log('============================');

  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY
  );

  const targetDate = getTodayDateString();
  console.log(`   Target date: ${targetDate}`);
  console.log(`   Cities: ${VERIFIED_KALSHI_CITIES.length}`);
  console.log(`   Divergence threshold: ±${DIVERGENCE_THRESHOLD_F}°F`);
  console.log('');

  const alerts: MetarDivergenceAlert[] = [];
  let citiesFlagged = 0;

  for (const cityDef of VERIFIED_KALSHI_CITIES) {
    process.stdout.write(`   ${cityDef.city} (${cityDef.stationId})... `);

    // 1. Fetch METAR
    const metar = await fetchMetar(cityDef.stationId);
    if (!metar || metar.tempF === null) {
      console.log('⚠️  no METAR');
      continue;
    }

    // 2. Fetch latest TW forecast
    const forecast = await fetchLatestForecast(supabase, cityDef.city, targetDate);
    if (!forecast) {
      console.log('⚠️  no forecast');
      continue;
    }

    // 3. Compute divergence
    const divergenceF = metar.tempF - forecast.predictedTempF;
    const flagged = Math.abs(divergenceF) >= DIVERGENCE_THRESHOLD_F;

    if (flagged) citiesFlagged++;

    const alert: MetarDivergenceAlert = {
      city: cityDef.city,
      stationId: cityDef.stationId,
      kalshiTicker: cityDef.kalshiTicker,
      observedTempF: metar.tempF,
      forecastTempF: forecast.predictedTempF,
      divergenceF: Math.round(divergenceF * 10) / 10,
      divergenceDirection: divergenceF >= 0 ? 'warmer' : 'cooler',
      targetDate,
      forecastTimestamp: forecast.forecastTimestamp,
      metarObservationTime: metar.observationTime,
      flagged,
      notes: flagged
        ? `⚠️ METAR ${divergenceF > 0 ? '+' : ''}${divergenceF.toFixed(1)}°F vs forecast — investigate`
        : 'Within normal range',
    };

    alerts.push(alert);
    console.log(
      `${flagged ? '🚨' : '✅'} obs=${metar.tempF}°F forecast=${forecast.predictedTempF.toFixed(1)}°F Δ=${divergenceF > 0 ? '+' : ''}${divergenceF.toFixed(1)}°F`
    );
  }

  const report: MetarDivergenceReport = {
    generatedAt: new Date().toISOString(),
    citiesChecked: alerts.length,
    citiesFlagged,
    threshold_f: DIVERGENCE_THRESHOLD_F,
    alerts,
  };

  // Write output
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, 'metar-alerts.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('');
  console.log(`📋 Results:`);
  console.log(`   Cities checked: ${report.citiesChecked}`);
  console.log(`   Cities flagged: ${report.citiesFlagged}`);
  console.log(`   Output: ${outPath}`);

  return report;
}

// Auto-run
runMetarDivergence().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export default runMetarDivergence;
