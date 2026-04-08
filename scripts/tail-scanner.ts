/**
 * Tail Opportunity Scanner — Kalshi Market Mispricing Detection
 * Rewired: Direct Supabase REST queries + Kalshi API for live market prices.
 *
 * Scans weather_predictions for kalshi_temp rows, computes TW probability
 * for each Kalshi strike via normal CDF, fetches live Kalshi market price,
 * flags wide std_dev as potential mispricing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { VERIFIED_KALSHI_CITIES } from './city-registry';

// Load .env file — dotenv may not be installed; fall back to manual parse
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: '.env' });
} catch {
  // dotenv not installed — manually parse .env
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
  } catch { /* silently ignore */ }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ofwgmzfdgvazflqhkhfy.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  (process.env.VITE_SUPABASE_ANON_KEY as string) ||
  '';

const KALSHI_API_KEY = process.env.KALSHI_API_KEY || null;
const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

if (!KALSHI_API_KEY) {
  console.warn('⚠️  KALSHI_API_KEY not set — market prices will be null (graceful degrade)');
}

// City registry imported from city-registry.ts — VERIFIED_KALSHI_CITIES is the single source of truth.

interface TailOpportunity {
  ticker: string;
  kalshiCode: string;
  city: string;
  marketType: 'high' | 'low';
  settlementDate: string;
  strikeTemp: number;
  twProbability: number;    // TW's estimated probability (0-100)
  twProbabilityDecimal: number; // TW prob as 0-1 for Kelly math
  marketPrice: number | null;   // Live Kalshi price (probability 0-1), null if API unavailable
  edge: number | null;          // |twProb - marketPrice| in decimal, null if no price
  kellyFraction: number;        // 1/3 Kelly fraction (0-0.05 cap, 0 = no trade)
  stdDev: number;
  predictedTemp: number;
  ciWidth: number;
  notes: string;
  scanTime: string;
}

interface TailScanReport {
  generatedAt: string;
  citiesScanned: number;
  marketsScanned: number;
  opportunitiesFound: number;
  opportunities: TailOpportunity[];
  notes: string;
}

function getSupabase(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * True Kelly criterion for binary contracts.
 * Formula: f* = (p - c) / (1 - c)
 *   p = TW probability (exceedance prob, 0-1)
 *   c = Kalshi yes_ask price (cost to buy YES, 0-1)
 * Applies 1/3 fractional Kelly for safety, capped at 5% bankroll.
 *
 * Returns 0 if:
 *   - marketPrice is null (can't size without a price)
 *   - f* <= 0 (no edge — don't trade)
 */
export function computeKelly(twProb: number, marketPrice: number | null): number {
  if (marketPrice === null || marketPrice === undefined) return 0;

  // Avoid division by zero when marketPrice == 1 (fully priced YES)
  if (marketPrice >= 1) return 0;

  // Full Kelly: f* = (p - c) / (1 - c)
  const fStar = (twProb - marketPrice) / (1 - marketPrice);

  // No edge or negative edge — don't trade
  if (fStar <= 0) return 0;

  // Fractional Kelly (1/3) for safety
  const kellyFraction = fStar / 3;

  // Hard cap: never risk more than 5% of bankroll on a single trade
  return Math.min(kellyFraction, 0.05);
}

/**
 * Standard normal CDF (Abramowitz & Stegun approximation)
 */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

/**
 * Fetch Kalshi market price for a given ticker.
 * Returns implied probability (0-1) or null if unavailable.
 * Priority: yes_ask > last_price > yes_bid
 */
async function fetchKalshiMarketPrice(ticker: string): Promise<number | null> {
  if (!KALSHI_API_KEY) {
    return null;
  }

  try {
    const url = `${KALSHI_BASE_URL}/markets/${ticker}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${KALSHI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Market doesn't exist
      }
      console.warn(`⚠️  Kalshi API error ${response.status} for ${ticker}`);
      return null;
    }

    const data = await response.json();
    const market = data.market;

    if (!market) {
      return null;
    }

    // Field names per Kalshi API v2 spec (confirmed in Mia's tracking-spec-v3.md Section 4)
    // Fields are in CENTS (integer, 0-100), NOT dollars
    // Priority: yes_ask > last_price > yes_bid
    const priceCents = market.yes_ask ?? market.last_price ?? market.yes_bid ?? null;

    if (priceCents === null || priceCents === undefined) {
      return null;
    }

    return priceCents / 100; // Convert cents to probability (0-1)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  Failed to fetch Kalshi price for ${ticker}: ${msg}`);
    return null;
  }
}

/**
 * Fetch latest kalshi_temp predictions from Supabase
 */
async function getTodayPredictions(
  client: SupabaseClient
): Promise<
  Array<{
    stationId: string;
    predictedTemp: number;
    stdDev: number;
    ciLow: number;
    ciHigh: number;
    city: string;
    predictedAt: string;
  }>
> {
  const { data, error } = await client
    .from('tw_hourly_forecasts')
    .select(
      'city, station_id, predicted_temp_high_bias_corrected, std_dev, confidence_interval_low, confidence_interval_high, target_date'
    )
    .order('target_date', { ascending: false })
    .limit(100); // generous limit, we'll dedup by station

  if (error || !data) {
    throw new Error(`Failed to fetch predictions: ${error?.message || 'no data'}`);
  }

  // Dedup: keep only the latest row per stationId
  const seen = new Set<string>();
  const results: Array<{
    stationId: string;
    predictedTemp: number;
    stdDev: number;
    ciLow: number;
    ciHigh: number;
    city: string;
    predictedAt: string;
  }> = [];

  for (const row of data) {
    const sid = row.station_id;
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);

    results.push({
      stationId: sid,
      predictedTemp: row.predicted_temp_high_bias_corrected,
      stdDev: row.std_dev,
      ciLow: row.confidence_interval_low,
      ciHigh: row.confidence_interval_high,
      city: row.city,
      predictedAt: row.target_date,
    });
  }

  return results;
}

async function scanForTailOpportunities(): Promise<TailScanReport> {
  const client = getSupabase();
  console.log('🔍 Tail Scanner — Supabase REST + Kalshi API');
  console.log('=============================================');
  console.log('   Direct Supabase queries + live Kalshi prices');
  console.log(KALSHI_API_KEY ? '   ✅ Kalshi API key configured' : '   ⚠️  No Kalshi API key — prices will be null');
  console.log('');

  const predictions = await getTodayPredictions(client);
  console.log(`   Got predictions for ${predictions.length} stations`);
  console.log('');

  const opportunities: TailOpportunity[] = [];
  let marketsScanned = 0;

  const today = new Date();
  const settlementDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  for (const pred of predictions) {
    const station = VERIFIED_KALSHI_CITIES.find(s => s.stationId === pred.stationId);
    if (!station) continue;

    const meanTemp = pred.predictedTemp;
    const stdDev = pred.stdDev;
    const ciWidth = Math.round((pred.ciHigh - pred.ciLow) * 10) / 10;

    // Scan strike prices around the mean: mean ± 10°F in 1-degree steps
    const minStrike = Math.floor(meanTemp - 10);
    const maxStrike = Math.ceil(meanTemp + 10);

    for (let strike = minStrike; strike <= maxStrike; strike++) {
      const marketType: 'high' | 'low' = 'high'; // Focus on high-temp contracts
      marketsScanned++;

      // TW probability: P(temp >= strike) for high contracts
      // Using continuity correction: P(temp > strike - 0.5) = 1 - CDF((strike - 0.5 - mean) / stdDev)
      const z = (strike - 0.5 - meanTemp) / stdDev;
      const twProb = Math.round((1 - normCdf(z)) * 100);

      // Flag wide CI as potential mispricing (stdDev > 3 means high uncertainty)
      const wideCI = stdDev > 3;

      if (twProb >= 5 && twProb <= 95) {
        // Only include non-trivial probabilities
        const today = new Date();
        const targetDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const year = String(targetDate.getUTCFullYear()).slice(-2);
        const monthAbbr = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][targetDate.getUTCMonth()];
        const day = String(targetDate.getUTCDate()).padStart(2, '0');
        const ticker = `${station.kalshiTicker}-${year}${monthAbbr}${day}-${strike}`;

        // Fetch live Kalshi market price
        const marketPrice = await fetchKalshiMarketPrice(ticker);

        // True Kelly sizing (1/3 fractional, 5% cap)
        const twProbDecimal = twProb / 100;
        const kellyFraction = computeKelly(twProbDecimal, marketPrice);
        const edge = marketPrice !== null ? Math.abs(twProbDecimal - marketPrice) : null;

        const kellyNote = kellyFraction > 0
          ? ` | Kelly=${(kellyFraction * 100).toFixed(2)}%`
          : ' | Kelly=0 (no edge)';
        const notes = (wideCI
          ? `Wide CI (stdDev=${stdDev}°F, width=${ciWidth}°F) — potential mispricing`
          : `CI width=${ciWidth}°F`) + kellyNote;

        opportunities.push({
          ticker,
          kalshiCode: station.stationId.slice(1).toLowerCase(), // derived from ICAO station id
          city: station.city,
          marketType,
          settlementDate,
          strikeTemp: strike,
          twProbability: twProb,
          twProbabilityDecimal: twProbDecimal,
          marketPrice,
          edge,
          kellyFraction,
          stdDev,
          predictedTemp: meanTemp,
          ciWidth,
          notes,
          scanTime: new Date().toISOString(),
        });
      }
    }

    await new Promise(r => setTimeout(r, 50));
  }

  const report: TailScanReport = {
    generatedAt: new Date().toISOString(),
    citiesScanned: predictions.length,
    marketsScanned,
    opportunitiesFound: opportunities.length,
    opportunities,
    notes:
      KALSHI_API_KEY
        ? 'Kalshi API wired. Market prices fetched live (null if market not found or API error).'
        : 'No Kalshi API key — market prices are null. TW probability derived from weather_predictions std_dev via normal CDF.',
  };

  return report;
}

export function saveTailOpportunities(report: TailScanReport): void {
  const dataDir = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'trading');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, 'tail-opportunities.json');
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Saved ${report.opportunitiesFound} opportunities to ${filePath}`);
}

async function main(): Promise<void> {
  console.log('🎯 Tail Opportunity Scanner — Supabase REST');
  console.log('============================================');
  console.log('');

  try {
    const report = await scanForTailOpportunities();
    saveTailOpportunities(report);

    // Summary
    console.log('\n---');
    console.log(`📊 Scan Summary:`);
    console.log(`   Cities scanned: ${report.citiesScanned}`);
    console.log(`   Markets evaluated: ${report.marketsScanned}`);
    console.log(`   Opportunities found: ${report.opportunitiesFound}`);

    // Surface any wide-CI markets
    const wideCI = report.opportunities.filter(o => o.stdDev > 3);
    if (wideCI.length > 0) {
      console.log(`\n   📡 Wide CI opportunities (stdDev > 3):`);
      for (const o of wideCI) {
        console.log(`      ${o.city}: ${o.strikeTemp}°F strike — TW ${o.twProbability}%, stdDev=${o.stdDev}°F`);
      }
    }

    if (report.opportunitiesFound === 0) {
      console.log('   ✅ No opportunities found');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Tail scan failed: ${msg}`);
    process.exit(1);
  }
}

export type { TailOpportunity, TailScanReport };
export default main;


// Auto-run
main();
