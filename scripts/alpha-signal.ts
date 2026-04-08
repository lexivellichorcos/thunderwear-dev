/**
 * TW Alpha Signal — Step 9
 * Clean, composable evaluator for whether to trade a given forecast vs market price.
 *
 * Entry rules:
 *   - Edge (|twProb - marketPrice|) must be >= 0.07 (7pp)
 *   - Kelly fraction must be > 0 (positive sizing)
 *   - YES: twProb > marketPrice + 0.07
 *   - NO:  marketPrice > twProb + 0.07
 *
 * Confidence:
 *   - HIGH   if edge >= 0.12
 *   - MEDIUM if edge >= 0.09
 *   - LOW    if edge >= 0.07
 */

import { computeKelly } from './tail-scanner.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Input forecast from tw_hourly_forecasts or any compatible source.
 */
export interface ForecastInput {
  city?: string;
  station_id?: string;
  target_date?: string;
  hours_to_settlement?: number | null;
  predicted_temp_high_bias_corrected: number;
  std_dev: number;
  // Derived by caller before calling evaluateAlphaSignal:
  // twProb should be precomputed (exceedance probability, 0-1)
  twProb: number;
}

/**
 * Result of the alpha signal evaluation.
 */
export interface AlphaSignal {
  shouldTrade: boolean;
  direction: 'YES' | 'NO' | null;
  twProb: number;                              // TW exceedance probability (0-1)
  marketPrice: number;                         // Kalshi yes_ask (0-1)
  edge: number;                                // |twProb - marketPrice|
  kellyFraction: number;                       // 1/3 Kelly, capped 0.05
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null; // null if shouldTrade = false
  reason: string;                              // Human-readable explanation
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum required edge to enter a trade (7 percentage points) */
export const MIN_EDGE = 0.07;

/** Edge thresholds for confidence levels */
export const EDGE_HIGH   = 0.12;
export const EDGE_MEDIUM = 0.09;
export const EDGE_LOW    = 0.07; // same as MIN_EDGE

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a forecast + market price combination has tradeable alpha.
 *
 * @param forecast  Forecast object including precomputed twProb (0-1)
 * @param marketPrice  Kalshi yes_ask price (0-1), or null if unavailable
 * @returns AlphaSignal with trade decision + sizing
 */
export function evaluateAlphaSignal(
  forecast: ForecastInput,
  marketPrice: number | null
): AlphaSignal {
  // Guard: no market price → can't evaluate
  if (marketPrice === null || marketPrice === undefined) {
    return {
      shouldTrade: false,
      direction: null,
      twProb: forecast.twProb,
      marketPrice: 0,
      edge: 0,
      kellyFraction: 0,
      confidence: null,
      reason: 'No market price available — cannot evaluate edge',
    };
  }

  const twProb = forecast.twProb;
  const edge = Math.abs(twProb - marketPrice);

  // Determine direction
  const isYesTrade = twProb > marketPrice + MIN_EDGE;   // We think more likely than market
  const isNoTrade  = marketPrice > twProb + MIN_EDGE;   // Market overprices YES; we buy NO

  // Compute Kelly fraction
  const kellyFraction = computeKelly(twProb, marketPrice);

  // Edge below threshold or Kelly == 0 → no trade
  if (!isYesTrade && !isNoTrade) {
    return {
      shouldTrade: false,
      direction: null,
      twProb,
      marketPrice,
      edge,
      kellyFraction,
      confidence: null,
      reason: `Edge too small: ${(edge * 100).toFixed(1)}pp < ${MIN_EDGE * 100}pp minimum`,
    };
  }

  if (kellyFraction === 0) {
    return {
      shouldTrade: false,
      direction: null,
      twProb,
      marketPrice,
      edge,
      kellyFraction: 0,
      confidence: null,
      reason: 'Kelly fraction is 0 — no positive edge despite apparent price gap',
    };
  }

  // Confidence tier
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (edge >= EDGE_HIGH) {
    confidence = 'HIGH';
  } else if (edge >= EDGE_MEDIUM) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
  }

  const direction: 'YES' | 'NO' = isYesTrade ? 'YES' : 'NO';

  const reasonParts: string[] = [
    `${direction} trade: TW ${(twProb * 100).toFixed(1)}% vs market ${(marketPrice * 100).toFixed(1)}%`,
    `edge=${(edge * 100).toFixed(1)}pp`,
    `kelly=${(kellyFraction * 100).toFixed(2)}%`,
    `confidence=${confidence}`,
  ];

  if (direction === 'YES') {
    reasonParts.push(`Model says more likely than market (${(twProb * 100).toFixed(1)}% > ${(marketPrice * 100).toFixed(1)}%)`);
  } else {
    reasonParts.push(`Market overprices YES (${(marketPrice * 100).toFixed(1)}% > ${(twProb * 100).toFixed(1)}%); buy NO`);
  }

  return {
    shouldTrade: true,
    direction,
    twProb,
    marketPrice,
    edge: Math.round(edge * 10000) / 10000,
    kellyFraction,
    confidence,
    reason: reasonParts.join(' | '),
  };
}

// ---------------------------------------------------------------------------
// Batch evaluator — convenience wrapper for arrays of forecasts
// ---------------------------------------------------------------------------

export interface BatchAlphaResult {
  forecast: ForecastInput;
  marketPrice: number | null;
  signal: AlphaSignal;
}

/**
 * Evaluate alpha signal for a batch of (forecast, marketPrice) pairs.
 * Returns only the ones where shouldTrade = true, sorted by edge descending.
 */
export function evaluateBatchAlpha(
  pairs: Array<{ forecast: ForecastInput; marketPrice: number | null }>
): BatchAlphaResult[] {
  return pairs
    .map(({ forecast, marketPrice }) => ({
      forecast,
      marketPrice,
      signal: evaluateAlphaSignal(forecast, marketPrice),
    }))
    .filter(r => r.signal.shouldTrade)
    .sort((a, b) => b.signal.edge - a.signal.edge);
}

// ---------------------------------------------------------------------------
// Example / smoke test
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('alpha-signal.ts') || process.argv[1]?.endsWith('alpha-signal.js')) {
  console.log('🧪 Alpha Signal Smoke Test');
  console.log('==========================');

  const testCases: Array<{
    label: string;
    twProb: number;
    marketPrice: number | null;
    expected: string;
  }> = [
    { label: 'Strong YES edge',      twProb: 0.75, marketPrice: 0.55, expected: 'YES / HIGH' },
    { label: 'Medium YES edge',      twProb: 0.65, marketPrice: 0.55, expected: 'YES / MEDIUM' },
    { label: 'Low YES edge',         twProb: 0.62, marketPrice: 0.55, expected: 'YES / LOW' },
    { label: 'Edge just below min',  twProb: 0.60, marketPrice: 0.55, expected: 'no trade' },
    { label: 'Strong NO edge',       twProb: 0.30, marketPrice: 0.55, expected: 'NO / HIGH' },
    { label: 'Medium NO edge',       twProb: 0.37, marketPrice: 0.55, expected: 'NO / MEDIUM' },
    { label: 'No market price',      twProb: 0.70, marketPrice: null, expected: 'no trade (null price)' },
    { label: 'No edge (fair price)', twProb: 0.55, marketPrice: 0.55, expected: 'no trade' },
  ];

  const mockForecast = (twProb: number): ForecastInput => ({
    predicted_temp_high_bias_corrected: 85,
    std_dev: 3.5,
    twProb,
  });

  for (const tc of testCases) {
    const signal = evaluateAlphaSignal(mockForecast(tc.twProb), tc.marketPrice);
    const result = signal.shouldTrade
      ? `${signal.direction} | ${signal.confidence} | edge=${(signal.edge * 100).toFixed(1)}pp | kelly=${(signal.kellyFraction * 100).toFixed(2)}%`
      : `No trade — ${signal.reason}`;
    console.log(`\n  [${tc.label}]`);
    console.log(`    Expected: ${tc.expected}`);
    console.log(`    Got:      ${result}`);
  }

  console.log('\n✅ Smoke test complete');
}
