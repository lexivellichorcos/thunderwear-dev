/**
 * TW Backtesting Framework — Step 8
 * Queries settled tw_hourly_forecasts rows (actual_temp_high IS NOT NULL),
 * computes retrospective edge + Kelly sizing, simulates PnL with 1/3 Kelly,
 * groups by city / T-minus bucket / month, outputs summary to /data/backtest-results.json
 *
 * Uses SUPABASE_SERVICE_KEY for full read access.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeKelly } from './tail-scanner.js';

// ---------------------------------------------------------------------------
// Env bootstrap (same pattern as tail-scanner)
// ---------------------------------------------------------------------------
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: '.env' });
} catch {
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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY not set — cannot run backtest');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Normal CDF (Abramowitz & Stegun) — duplicated here to avoid circular import
// ---------------------------------------------------------------------------
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

/**
 * Compute TW exceedance probability for a given strike.
 * P(actual_temp_high >= strike) = 1 - CDF((strike - 0.5 - mean) / stdDev)
 * Uses continuity correction (strike - 0.5) for discrete Fahrenheit values.
 */
function computeTwProb(predictedTemp: number, stdDev: number, strikeTemp: number): number {
  if (stdDev <= 0) return predictedTemp >= strikeTemp ? 1 : 0;
  const z = (strikeTemp - 0.5 - predictedTemp) / stdDev;
  return 1 - normCdf(z);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettledRow {
  city: string;
  station_id: string;
  target_date: string;
  hours_to_settlement: number | null;
  predicted_temp_high_bias_corrected: number;
  std_dev: number;
  kalshi_market_price_at_forecast: number | null; // 0-1 decimal, YES ask price at forecast time
  actual_temp_high: number;                        // Actual settlement temperature
}

interface TradeResult {
  city: string;
  target_date: string;
  hoursToSettlement: number | null;
  month: number;
  twProb: number;          // 0-1
  marketPrice: number;     // 0-1
  edge: number;            // |twProb - marketPrice|
  direction: 'YES' | 'NO';
  kellyFraction: number;   // 1/3 Kelly, capped 0.05
  actualOutcome: boolean;  // Did the contract settle YES?
  pnl: number;             // Simulated PnL per unit bankroll
  // YES pays (1 - marketPrice) per unit staked if wins, loses marketPrice if loses
  // NO pays marketPrice per unit staked if wins, loses (1 - marketPrice) if loses
}

interface GroupKey {
  city: string;
  tMinusBucket: string;   // e.g. "0-6h", "6-12h", "12-24h", "24-48h", "48-72h", "72h+"
  month: number;          // 1-12
}

interface GroupStats {
  city: string;
  tMinusBucket: string;
  month: number;
  tradeCount: number;
  winCount: number;
  winRate: number;
  avgEdge: number;
  avgKellyFraction: number;
  totalPnl: number;
  avgPnl: number;
  expectedValuePerTrade: number;
}

interface BacktestReport {
  generatedAt: string;
  totalSettledRows: number;
  totalTradesEvaluated: number;    // Rows with market price + edge
  totalTradesSignaled: number;     // Rows where Kelly > 0 (would have traded)
  overallWinRate: number;
  overallAvgEdge: number;
  overallTotalPnl: number;
  groupStats: GroupStats[];
  notes: string;
}

// ---------------------------------------------------------------------------
// T-minus bucket helper
// ---------------------------------------------------------------------------
function tMinusBucket(hoursToSettlement: number | null): string {
  if (hoursToSettlement === null) return 'unknown';
  if (hoursToSettlement <= 6)  return '0-6h';
  if (hoursToSettlement <= 12) return '6-12h';
  if (hoursToSettlement <= 24) return '12-24h';
  if (hoursToSettlement <= 48) return '24-48h';
  if (hoursToSettlement <= 72) return '48-72h';
  return '72h+';
}

// ---------------------------------------------------------------------------
// Main backtest
// ---------------------------------------------------------------------------
async function runBacktest(): Promise<void> {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('📊 TW Backtest Framework — Step 8');
  console.log('==================================');
  console.log('Querying settled tw_hourly_forecasts rows...');

  // Fetch all settled rows (paginate in case of large dataset)
  const allRows: SettledRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('tw_hourly_forecasts')
      .select(
        'city, station_id, target_date, hours_to_settlement, ' +
        'predicted_temp_high_bias_corrected, std_dev, ' +
        'kalshi_market_price_at_forecast, actual_temp_high'
      )
      .not('actual_temp_high', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`❌ Supabase query failed: ${error.message}`);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    allRows.push(...(data as SettledRow[]));
    console.log(`   Fetched ${allRows.length} rows so far...`);

    if (data.length < PAGE_SIZE) break; // Last page
    offset += PAGE_SIZE;
  }

  console.log(`✅ Total settled rows: ${allRows.length}`);

  if (allRows.length === 0) {
    console.log('⚠️  No settled rows found. Run after markets have resolved.');
    const emptyReport: BacktestReport = {
      generatedAt: new Date().toISOString(),
      totalSettledRows: 0,
      totalTradesEvaluated: 0,
      totalTradesSignaled: 0,
      overallWinRate: 0,
      overallAvgEdge: 0,
      overallTotalPnl: 0,
      groupStats: [],
      notes: 'No settled rows found in tw_hourly_forecasts.',
    };
    saveReport(emptyReport);
    return;
  }

  // ---------------------------------------------------------------------------
  // Evaluate each row
  // ---------------------------------------------------------------------------
  console.log('\nEvaluating edge + Kelly for each settled row...');

  const tradeResults: TradeResult[] = [];

  for (const row of allRows) {
    const marketPrice = row.kalshi_market_price_at_forecast;

    // Skip rows without a recorded market price (can't evaluate edge)
    if (marketPrice === null || marketPrice === undefined) continue;
    if (row.predicted_temp_high_bias_corrected === null) continue;
    if (row.std_dev === null || row.std_dev <= 0) continue;

    const targetDate = new Date(row.target_date);
    const month = targetDate.getUTCMonth() + 1; // 1-12

    // For each row, the Kalshi market is implied at a specific strike.
    // Since we don't store the strike directly, we infer it:
    // The market price at forecast time is for the YES contract (temp >= strike).
    // We use predicted_temp_high_bias_corrected as the "expected" strike zone.
    // To evaluate edge, we compute twProb for the Kalshi-implied strike.
    //
    // ASSUMPTION: kalshi_market_price_at_forecast is the price for a contract at
    // a strike near the predicted temp. We evaluate edge as:
    //   twProb = P(actual >= predictedTemp) using our model
    //   direction = YES if twProb > marketPrice + 0.07, else NO if marketPrice > twProb + 0.07

    // Use the predicted temp itself as the "effective strike" for this evaluation
    // (This is the most direct comparison of our model vs market)
    const effectiveStrike = Math.round(row.predicted_temp_high_bias_corrected);
    const twProb = computeTwProb(
      row.predicted_temp_high_bias_corrected,
      row.std_dev,
      effectiveStrike
    );

    const edge = Math.abs(twProb - marketPrice);
    const kellyFraction = computeKelly(twProb, marketPrice);

    // Determine direction
    let direction: 'YES' | 'NO';
    if (twProb > marketPrice) {
      direction = 'YES'; // We think it's more likely to happen than market says
    } else {
      direction = 'NO';  // We think it's less likely than market says
    }

    // Actual outcome: did temp >= effectiveStrike?
    const actualOutcome = row.actual_temp_high >= effectiveStrike;

    // PnL calculation (per unit bankroll, using Kelly fraction as stake)
    // YES: win (1 - marketPrice) * kelly, lose marketPrice * kelly
    // NO:  win marketPrice * kelly, lose (1 - marketPrice) * kelly
    let pnl: number;
    if (direction === 'YES') {
      pnl = actualOutcome
        ? kellyFraction * (1 - marketPrice)   // Win: receive (1-price) per unit staked
        : -kellyFraction * marketPrice;        // Loss: lose the stake (cost was marketPrice)
    } else {
      // Buying NO: effectively betting against YES
      // Cost to buy NO = (1 - marketPrice), payout = 1 if YES fails
      const noPrice = 1 - marketPrice;
      pnl = !actualOutcome
        ? kellyFraction * (1 - noPrice)        // Win: receive (1 - noPrice) = marketPrice
        : -kellyFraction * noPrice;            // Loss: lose noPrice stake
    }

    tradeResults.push({
      city: row.city,
      target_date: row.target_date,
      hoursToSettlement: row.hours_to_settlement,
      month,
      twProb,
      marketPrice,
      edge,
      direction,
      kellyFraction,
      actualOutcome,
      pnl,
    });
  }

  const signaled = tradeResults.filter(t => t.kellyFraction > 0);
  console.log(`   Rows with market price: ${tradeResults.length}`);
  console.log(`   Rows with Kelly > 0 (would trade): ${signaled.length}`);

  // ---------------------------------------------------------------------------
  // Group stats
  // ---------------------------------------------------------------------------
  type BucketMap = Map<string, TradeResult[]>;
  const groups: BucketMap = new Map();

  for (const t of signaled) {
    const bucket = tMinusBucket(t.hoursToSettlement);
    const key = `${t.city}|${bucket}|${t.month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const groupStats: GroupStats[] = [];

  for (const [key, trades] of groups.entries()) {
    const [city, tMinusBucketVal, monthStr] = key.split('|');
    const winCount = trades.filter(t =>
      (t.direction === 'YES' && t.actualOutcome) ||
      (t.direction === 'NO' && !t.actualOutcome)
    ).length;

    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgEdge = trades.reduce((sum, t) => sum + t.edge, 0) / trades.length;
    const avgKelly = trades.reduce((sum, t) => sum + t.kellyFraction, 0) / trades.length;

    groupStats.push({
      city,
      tMinusBucket: tMinusBucketVal,
      month: parseInt(monthStr, 10),
      tradeCount: trades.length,
      winCount,
      winRate: winCount / trades.length,
      avgEdge: Math.round(avgEdge * 10000) / 10000,
      avgKellyFraction: Math.round(avgKelly * 10000) / 10000,
      totalPnl: Math.round(totalPnl * 10000) / 10000,
      avgPnl: Math.round((totalPnl / trades.length) * 10000) / 10000,
      expectedValuePerTrade: Math.round((totalPnl / trades.length) * 10000) / 10000,
    });
  }

  // Sort: city asc, tMinus asc, month asc
  groupStats.sort((a, b) => {
    if (a.city !== b.city) return a.city.localeCompare(b.city);
    if (a.tMinusBucket !== b.tMinusBucket) return a.tMinusBucket.localeCompare(b.tMinusBucket);
    return a.month - b.month;
  });

  // ---------------------------------------------------------------------------
  // Overall stats
  // ---------------------------------------------------------------------------
  const totalSignaled = signaled.length;
  const totalWins = signaled.filter(t =>
    (t.direction === 'YES' && t.actualOutcome) ||
    (t.direction === 'NO' && !t.actualOutcome)
  ).length;
  const overallPnl = signaled.reduce((sum, t) => sum + t.pnl, 0);
  const overallAvgEdge = totalSignaled > 0
    ? signaled.reduce((sum, t) => sum + t.edge, 0) / totalSignaled
    : 0;

  const report: BacktestReport = {
    generatedAt: new Date().toISOString(),
    totalSettledRows: allRows.length,
    totalTradesEvaluated: tradeResults.length,
    totalTradesSignaled: totalSignaled,
    overallWinRate: totalSignaled > 0 ? Math.round((totalWins / totalSignaled) * 10000) / 10000 : 0,
    overallAvgEdge: Math.round(overallAvgEdge * 10000) / 10000,
    overallTotalPnl: Math.round(overallPnl * 10000) / 10000,
    groupStats,
    notes: [
      'Kelly formula: f* = (p - c) / (1 - c), then kelly = f* / 3, capped at 0.05.',
      'Edge = |twProb - marketPrice| in decimal (0-1).',
      'Effective strike = round(predicted_temp_high_bias_corrected).',
      'twProb = P(actual_temp_high >= strike) via normal CDF + continuity correction.',
      'PnL assumes Kelly fraction of bankroll staked per trade.',
      'Only rows with kalshi_market_price_at_forecast != NULL are evaluated.',
      'Only rows with Kelly > 0 (positive edge) are included in group stats.',
    ].join(' | '),
  };

  saveReport(report);

  // Print summary
  console.log('\n📊 Backtest Summary:');
  console.log(`   Settled rows queried: ${report.totalSettledRows}`);
  console.log(`   Rows with market price: ${report.totalTradesEvaluated}`);
  console.log(`   Rows with Kelly > 0 (would trade): ${report.totalTradesSignaled}`);
  console.log(`   Overall win rate: ${(report.overallWinRate * 100).toFixed(1)}%`);
  console.log(`   Overall avg edge: ${(report.overallAvgEdge * 100).toFixed(2)}pp`);
  console.log(`   Overall total PnL: ${report.overallTotalPnl >= 0 ? '+' : ''}${report.overallTotalPnl.toFixed(4)} (% bankroll)`);
  console.log(`   Groups: ${report.groupStats.length}`);
  console.log('\n✅ Results saved to /data/backtest-results.json');
}

function saveReport(report: BacktestReport): void {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, 'backtest-results.json');
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  console.log(`💾 Saved backtest results to ${filePath}`);
}

export type { BacktestReport, GroupStats, TradeResult };
export default runBacktest;

// Auto-run
runBacktest();
