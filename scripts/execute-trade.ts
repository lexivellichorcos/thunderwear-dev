/**
 * Execute Trade Pipeline — Step 10
 * Reads alpha signals from alpha-signal.ts, places real orders on Kalshi.
 *
 * SAFETY: Dry-run mode by default. Only places real orders when DRY_RUN=false.
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/execute-trade.ts     (logs what WOULD trade)
 *   DRY_RUN=false npx tsx scripts/execute-trade.ts    (places real orders)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { evaluateBatchAlpha, ForecastInput } from './alpha-signal.js';
import { VERIFIED_KALSHI_CITIES } from './city-registry.js';

// Load .env manually (ESM-safe)
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

// ============================================================================
// Config
// ============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ofwgmzfdgvazflqhkhfy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const KALSHI_API_KEY = process.env.KALSHI_API_KEY || '';
const KALSHI_BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

const DRY_RUN = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
const BANKROLL = 10000; // $10k starting account (in cents for risk calcs: 1000000)

// Risk limits (hard stops)
const MAX_POSITION_SIZE = 20;          // contracts per trade
const MAX_DAILY_EXPOSURE = 0.15;       // 15% of bankroll per day total
const MIN_MARKET_PRICE = 0.10;         // never buy below 10¢
const MAX_MARKET_PRICE = 0.90;         // never buy above 90¢

// Data directory for pending orders
const DATA_DIR = path.join(process.cwd(), 'data', 'trading');

// ============================================================================
// Interfaces
// ============================================================================

interface PendingOrder {
  timestamp: string;
  ticker: string;
  city: string;
  side: 'YES' | 'NO';
  count: number;
  yes_price: number;
  position_size_dollars: number;
  kelly_fraction: number;
  edge: number;
  tw_prob: number;
  market_price: number;
  reason: string;
  dry_run: boolean;
}

interface ExecutionReport {
  timestamp: string;
  dry_run: boolean;
  total_capital_deployed: number;
  daily_exposure: number;
  orders_placed: number;
  orders_skipped: number;
  pending_orders: PendingOrder[];
  errors: string[];
}

// ============================================================================
// Utilities
// ============================================================================

function getSupabase(): SupabaseClient {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('No Supabase credentials configured');
  }
  return createClient(SUPABASE_URL, key);
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getETDateString(): string {
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return etFormatter.format(new Date());
}

function getTomorrowDateString(): string {
  const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
  const etFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return etFormatter.format(tomorrow);
}

/**
 * Build Kalshi ticker for a city/date using the verified city registry.
 * Returns null for unknown cities — do not trade.
 * Example: New York + 2026-04-08 → KXHIGHNY-26APR08
 */
function buildKalshiTicker(cityName: string, targetDate: string): string {
  const city = VERIFIED_KALSHI_CITIES.find(c => c.city === cityName);
  if (!city) return null; // unknown city — do not trade
  const date = new Date(targetDate + 'T00:00:00Z');
  const year = String(date.getUTCFullYear()).slice(-2);
  const monthAbbr = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${city.kalshiTicker}-${year}${monthAbbr}${day}`;
}

// ============================================================================
// Fetch forecasts for tomorrow + compute alpha signals
// ============================================================================

async function fetchTomorrowForecasts(supabase: SupabaseClient): Promise<Array<{
  city: string;
  station_id: string;
  predicted_temp: number;
  std_dev: number;
  target_date: string;
}>> {
  const targetDate = getTomorrowDateString();

  const { data, error } = await supabase
    .from('tw_hourly_forecasts')
    .select('city, station_id, predicted_temp_high_bias_corrected, std_dev, target_date')
    .eq('target_date', targetDate)
    .order('forecast_timestamp', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch forecasts: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No forecasts for tomorrow found');
    return [];
  }

  // Dedup: keep latest per city
  const seen = new Set<string>();
  const results = [];
  for (const row of data as any[]) {
    if (!seen.has(row.city)) {
      seen.add(row.city);
      results.push({
        city: row.city,
        station_id: row.station_id,
        predicted_temp: row.predicted_temp_high_bias_corrected,
        std_dev: row.std_dev,
        target_date: row.target_date,
      });
    }
  }

  return results;
}

/**
 * Compute TW exceedance probability for a given strike temperature.
 * Uses standard normal CDF with mean=predicted_temp, stdDev=std_dev.
 */
function computeTWProbability(forecastTemp: number, stdDev: number, strike: number): number {
  // Z = (X - μ) / σ
  const z = (strike - forecastTemp) / stdDev;
  // P(X > strike) = 1 - Φ(z) = exceedance probability
  return 1 - normCdf(z);
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun)
 */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

/**
 * Fetch live Kalshi price for a ticker.
 */
async function fetchKalshiPrice(ticker: string): Promise<number | null> {
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
        return null; // Market doesn't exist yet
      }
      console.warn(`⚠️  Kalshi API ${response.status} for ${ticker}`);
      return null;
    }

    const data = await response.json();
    const market = data.market;
    if (!market) return null;

    // Kalshi prices are in cents (0-100), convert to probability (0-1)
    const priceCents = market.yes_ask ?? market.last_price ?? market.yes_bid ?? null;
    if (priceCents === null) return null;

    return priceCents / 100;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  Failed to fetch Kalshi price for ${ticker}: ${msg}`);
    return null;
  }
}

// ============================================================================
// Build alpha signal pairs for all cities
// ============================================================================

async function buildAlphaPairs(
  forecasts: Array<{
    city: string;
    station_id: string;
    predicted_temp: number;
    std_dev: number;
    target_date: string;
  }>
): Promise<Array<{
  forecast: ForecastInput;
  marketPrice: number | null;
  city: string;
  kalshiCode: string;
  ticker: string;
  strike: number;
}>> {
  const pairs = [];
  const commonStrikes = [75, 80, 85, 90]; // Common NYC/major city temperature strikes

  for (const forecast of forecasts) {
    const ticker = buildKalshiTicker(forecast.city, forecast.target_date);
    if (!ticker) {
      console.log(`   ⏭️  Skipping unknown city: ${forecast.city}`);
      continue;
    }

    for (const strike of commonStrikes) {
      const twProb = computeTWProbability(forecast.predicted_temp, forecast.std_dev, strike);

      const kalshiPrice = await fetchKalshiPrice(ticker);

      pairs.push({
        forecast: {
          city: forecast.city,
          station_id: forecast.station_id,
          target_date: forecast.target_date,
          hours_to_settlement: null,
          predicted_temp_high_bias_corrected: forecast.predicted_temp,
          std_dev: forecast.std_dev,
          twProb,
        },
        marketPrice: kalshiPrice,
        city: forecast.city,
        kalshiCode: ticker.split('-')[0], // derived from verified ticker prefix
        ticker,
        strike,
      });
    }
  }

  return pairs;
}

// ============================================================================
// Compute position size and apply risk limits
// ============================================================================

interface PositionRequest {
  ticker: string;
  city: string;
  kalshiCode: string;
  strike: number;
  side: 'YES' | 'NO';
  kellyFraction: number;
  marketPrice: number;
  twProb: number;
  edge: number;
  reason: string;
}

function validateRiskLimits(
  position: PositionRequest,
  alreadyDeployed: number
): { valid: boolean; positionSize: number; reason?: string } {
  // Check market price bounds
  if (position.marketPrice < MIN_MARKET_PRICE) {
    return { valid: false, positionSize: 0, reason: `Market price ${(position.marketPrice * 100).toFixed(1)}¢ below minimum ${(MIN_MARKET_PRICE * 100).toFixed(1)}¢` };
  }
  if (position.marketPrice > MAX_MARKET_PRICE) {
    return { valid: false, positionSize: 0, reason: `Market price ${(position.marketPrice * 100).toFixed(1)}¢ above maximum ${(MAX_MARKET_PRICE * 100).toFixed(1)}¢` };
  }

  // Compute contracts: floor(kelly * bankroll / marketPrice)
  const contracts = Math.floor((position.kellyFraction * BANKROLL) / position.marketPrice);

  // Enforce position size caps
  if (contracts <= 0) {
    return { valid: false, positionSize: 0, reason: 'Kelly sizing resulted in 0 contracts' };
  }
  if (contracts > MAX_POSITION_SIZE) {
    return { valid: false, positionSize: 0, reason: `Contracts ${contracts} exceeds max ${MAX_POSITION_SIZE}` };
  }

  // Check daily exposure limit
  const positionDollars = contracts * position.marketPrice * 100; // rough estimate: contracts × market price
  const totalExposure = alreadyDeployed + positionDollars;
  const dailyLimit = BANKROLL * MAX_DAILY_EXPOSURE;

  if (totalExposure > dailyLimit) {
    return { valid: false, positionSize: 0, reason: `Daily exposure ${(totalExposure / BANKROLL * 100).toFixed(1)}% would exceed ${(MAX_DAILY_EXPOSURE * 100).toFixed(1)}%` };
  }

  return { valid: true, positionSize: contracts };
}

// ============================================================================
// Place order on Kalshi (or dry-run log)
// ============================================================================

async function placeOrder(
  position: PositionRequest,
  contracts: number
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (DRY_RUN) {
    console.log(`  📋 [DRY-RUN] Would place order:`);
    console.log(`       Ticker: ${position.ticker}`);
    console.log(`       Side: ${position.side} (${contracts} contracts @ ${(position.marketPrice * 100).toFixed(1)}¢)`);
    return { success: true };
  }

  // LIVE MODE: POST to Kalshi API
  try {
    const priceInCents = Math.round(position.marketPrice * 100);

    const body = {
      ticker: position.ticker,
      action: 'buy',
      side: position.side === 'YES' ? 'yes' : 'no',
      type: 'limit',
      count: contracts,
      yes_price: priceInCents,
    };

    const url = `${KALSHI_BASE_URL}/portfolio/orders`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KALSHI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      return { success: false, error: `Kalshi API ${response.status}: ${errorData}` };
    }

    const data = await response.json();
    return { success: true, orderId: data.order_id || data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ============================================================================
// Main execution pipeline
// ============================================================================

async function executeTrading(): Promise<ExecutionReport> {
  ensureDataDir();

  const report: ExecutionReport = {
    timestamp: new Date().toISOString(),
    dry_run: DRY_RUN,
    total_capital_deployed: 0,
    daily_exposure: 0,
    orders_placed: 0,
    orders_skipped: 0,
    pending_orders: [],
    errors: [],
  };

  console.log('🚀 ThunderWear Execution Pipeline');
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`   Bankroll: $${(BANKROLL / 100).toFixed(2)}`);
  console.log('');

  try {
    const supabase = getSupabase();

    // 1. Fetch tomorrow's forecasts
    console.log('📊 Step 1: Fetch forecasts for tomorrow');
    const forecasts = await fetchTomorrowForecasts(supabase);
    if (forecasts.length === 0) {
      console.log('   ⚠️  No forecasts available');
      return report;
    }
    console.log(`   ✅ Fetched ${forecasts.length} cities`);

    // 2. Build alpha signal pairs (forecast + market price combinations)
    console.log('\n📈 Step 2: Fetch Kalshi prices & build alpha pairs');
    const pairs = await buildAlphaPairs(forecasts);
    console.log(`   ✅ Built ${pairs.length} forecast/market pairs`);

    // 3. Evaluate alpha signals
    console.log('\n⚡ Step 3: Evaluate alpha signals');
    const alphaPairs = pairs.map(p => ({
      forecast: p.forecast,
      marketPrice: p.marketPrice,
    }));
    const tradeable = evaluateBatchAlpha(alphaPairs);
    console.log(`   ✅ Identified ${tradeable.length} tradeable signals`);

    // 4. Size and validate each trade
    console.log('\n🎯 Step 4: Size & validate orders');
    let totalDeployed = 0;

    for (let i = 0; i < tradeable.length; i++) {
      const signal = tradeable[i];
      const pairData = pairs[i];

      const position: PositionRequest = {
        ticker: pairData.ticker,
        city: pairData.city,
        kalshiCode: pairData.kalshiCode,
        strike: pairData.strike,
        side: signal.signal.direction === 'YES' ? 'YES' : 'NO',
        kellyFraction: signal.signal.kellyFraction,
        marketPrice: signal.signal.marketPrice,
        twProb: signal.signal.twProb,
        edge: signal.signal.edge,
        reason: signal.signal.reason,
      };

      const riskCheck = validateRiskLimits(position, totalDeployed);

      if (!riskCheck.valid) {
        console.log(`   ⏭️  ${pairData.ticker}: SKIPPED — ${riskCheck.reason}`);
        report.orders_skipped++;
        continue;
      }

      // 5. Place order
      const orderResult = await placeOrder(position, riskCheck.positionSize);

      if (orderResult.success) {
        const positionDollars = riskCheck.positionSize * position.marketPrice * 100;
        console.log(`   ✅ ${pairData.ticker}: ${position.side} x${riskCheck.positionSize} @ ${(position.marketPrice * 100).toFixed(1)}¢`);

        const pending: PendingOrder = {
          timestamp: new Date().toISOString(),
          ticker: pairData.ticker,
          city: pairData.city,
          side: position.side,
          count: riskCheck.positionSize,
          yes_price: Math.round(position.marketPrice * 100),
          position_size_dollars: positionDollars,
          kelly_fraction: position.kellyFraction,
          edge: position.edge,
          tw_prob: position.twProb,
          market_price: position.marketPrice,
          reason: position.reason,
          dry_run: DRY_RUN,
        };

        report.pending_orders.push(pending);
        report.orders_placed++;
        totalDeployed += positionDollars;
      } else {
        console.log(`   ❌ ${pairData.ticker}: FAILED — ${orderResult.error}`);
        report.orders_skipped++;
        report.errors.push(`${pairData.ticker}: ${orderResult.error}`);
      }
    }

    report.total_capital_deployed = totalDeployed;
    report.daily_exposure = totalDeployed / BANKROLL;

    // 6. Write pending orders to data file
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
    const ordersFile = path.join(DATA_DIR, `pending-orders-${dateStr}-${timeStr}.json`);

    fs.writeFileSync(ordersFile, JSON.stringify(report.pending_orders, null, 2));

    // 7. Summary
    console.log('\n📋 Execution Summary');
    console.log(`   Orders placed: ${report.orders_placed}`);
    console.log(`   Orders skipped: ${report.orders_skipped}`);
    console.log(`   Capital deployed: $${(report.total_capital_deployed / 100).toFixed(2)}`);
    console.log(`   Daily exposure: ${(report.daily_exposure * 100).toFixed(1)}% of bankroll`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN (no real orders)' : 'LIVE'}`);
    console.log(`   Pending orders saved: ${ordersFile}`);

    return report;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ Fatal error: ${msg}`);
    report.errors.push(msg);
    return report;
  }
}

// ============================================================================
// Entry point
// ============================================================================

async function main(): Promise<void> {
  try {
    await executeTrading();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
