/**
 * tail-scan — Supabase Edge Function
 *
 * Fetches latest TW forecasts from `tw_hourly_forecasts`, computes edge vs.
 * live Kalshi market prices for all 20 verified cities, and writes results to
 * the `tail_opportunities` table.
 *
 * Triggered by pg_cron every hour.
 * Returns a JSON summary of the scan.
 *
 * Prices sourced from `market_prices` table (populated by price-sync cron every 5 min).
 * No Kalshi API calls needed — eliminates API key dependency and rate-limit issues.
 *
 * Sienna N1: Stale-clear DELETE uses `created_at`, NOT `scan_time`.
 * Sienna N4: pg_cron timeout is 120000ms (120s) — 400+ markets need it.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── City registry (20 verified Kalshi cities) ────────────────────────────────

interface KalshiCity {
  city: string;
  stationId: string;
  kalshiTicker: string;
}

const VERIFIED_KALSHI_CITIES: KalshiCity[] = [
  { city: "New York",       stationId: "KNYC",  kalshiTicker: "KXHIGHNY" },
  { city: "Chicago",        stationId: "KMDW",  kalshiTicker: "KXHIGHCHI" },
  { city: "Los Angeles",    stationId: "KLAX",  kalshiTicker: "KXHIGHLAX" },
  { city: "Houston",        stationId: "KHOU",  kalshiTicker: "KXHIGHTHOU" },
  { city: "Phoenix",        stationId: "KPHX",  kalshiTicker: "KXHIGHTPHX" },
  { city: "Philadelphia",   stationId: "KPHL",  kalshiTicker: "KXHIGHPHIL" },
  { city: "San Antonio",    stationId: "KSAT",  kalshiTicker: "KXHIGHTSATX" },
  { city: "Dallas",         stationId: "KDFW",  kalshiTicker: "KXHIGHTDAL" },
  { city: "Austin",         stationId: "KAUS",  kalshiTicker: "KXHIGHAUS" },
  { city: "San Francisco",  stationId: "KSFO",  kalshiTicker: "KXHIGHTSFO" },
  { city: "Seattle",        stationId: "KSEA",  kalshiTicker: "KXHIGHTSEA" },
  { city: "Denver",         stationId: "KDEN",  kalshiTicker: "KXHIGHDEN" },
  { city: "Miami",          stationId: "KMIA",  kalshiTicker: "KXHIGHMIA" },
  { city: "Minneapolis",    stationId: "KMSP",  kalshiTicker: "KXHIGHTMIN" },
  { city: "Atlanta",        stationId: "KATL",  kalshiTicker: "KXHIGHTTATL" },
  { city: "Boston",         stationId: "KBOS",  kalshiTicker: "KXHIGHTBOS" },
  { city: "Washington DC",  stationId: "KDCA",  kalshiTicker: "KXHIGHTDC" },
  { city: "Las Vegas",      stationId: "KLAS",  kalshiTicker: "KXHIGHTLV" },
  { city: "New Orleans",    stationId: "KMSY",  kalshiTicker: "KXHIGHTNOLA" },
  { city: "Oklahoma City",  stationId: "KOKC",  kalshiTicker: "KXHIGHTOKC" },
];

// ── Constants ─────────────────────────────────────────────────────────────────

// Kalshi API constants removed — prices now sourced from market_prices table

/** Minimum TW probability (%) to include — skip near-certain and near-zero */
const MIN_TW_PROB_PCT = 5;
const MAX_TW_PROB_PCT = 95;

/** Strike scan window around predicted mean (°F each direction) */
const STRIKE_WINDOW_F = 10;

// ── Math helpers ──────────────────────────────────────────────────────────────

/**
 * Standard normal CDF (Abramowitz & Stegun approximation — same as tail-scanner.ts)
 */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804 * Math.exp((-x * x) / 2);
  let prob =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

/**
 * True Kelly criterion for binary contracts (1/3 fractional, 5% cap).
 *
 * YES trade (twProb > marketPrice): f* = (p - c) / (1 - c)
 * NO  trade (marketPrice > twProb): f* = (c - p) / c
 *
 * Returns 0 if no price, or f* ≤ 0.
 */
function computeKelly(twProb: number, marketPrice: number | null): number {
  if (marketPrice === null || marketPrice === undefined) return 0;

  let fStar: number;
  if (twProb >= marketPrice) {
    if (marketPrice >= 1) return 0;
    fStar = (twProb - marketPrice) / (1 - marketPrice);
  } else {
    if (marketPrice <= 0) return 0;
    fStar = (marketPrice - twProb) / marketPrice;
  }

  if (fStar <= 0) return 0;
  return Math.min(fStar / 3, 0.05); // 1/3 Kelly, 5% hard cap
}

// ── Skipped market tracking ───────────────────────────────────────────────────

interface SkippedMarket {
  ticker: string;
  reason: string;
}

// Kalshi API fetch functions removed — prices now sourced from market_prices table

// ── Prob ATR helper (shared with bayesian-update) ────────────────────────────

async function computeProbAtr(supabase: ReturnType<typeof createClient>, ticker: string): Promise<number> {
  const { data } = await supabase
    .from("bayesian_estimates")
    .select("posterior_prob")
    .eq("market_ticker", ticker)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!data || data.length < 3) return 0.05;

  const probs = data.map((r: any) => r.posterior_prob);
  const mean = probs.reduce((a: number, b: number) => a + b, 0) / probs.length;
  const variance = probs.reduce((s: number, p: number) => s + Math.pow(p - mean, 2), 0) / (probs.length - 1);  // sample variance (÷n-1)
  return Math.sqrt(variance);
}

// ── TW forecast fetch ─────────────────────────────────────────────────────────

interface ForecastRow {
  stationId: string;
  city: string;
  predictedTemp: number;
  stdDev: number;
  ciLow: number;
  ciHigh: number;
  targetDate: string;
}

/**
 * Fetch latest TW forecast per station from tw_hourly_forecasts.
 * Deduplicates by station_id — keeps only the most recent row.
 */
async function fetchTWForecasts(
  supabase: ReturnType<typeof createClient>
): Promise<ForecastRow[]> {
  const { data, error } = await supabase
    .from("tw_hourly_forecasts")
    .select(
      "city, station_id, predicted_temp_high_bias_corrected, std_dev, confidence_interval_low, confidence_interval_high, target_date"
    )
    .order("target_date", { ascending: false })
    .limit(100);

  if (error || !data) {
    throw new Error(
      `Failed to fetch TW forecasts: ${error?.message ?? "no data"}`
    );
  }

  // Dedup: keep only the most-recent row per station
  const seen = new Set<string>();
  const results: ForecastRow[] = [];

  for (const row of data as any[]) {
    const sid: string = row.station_id;
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);

    results.push({
      stationId: sid,
      city: row.city,
      predictedTemp: row.predicted_temp_high_bias_corrected,
      stdDev: row.std_dev,
      ciLow: row.confidence_interval_low,
      ciHigh: row.confidence_interval_high,
      targetDate: row.target_date,
    });
  }

  return results;
}

// ── Table row shape ───────────────────────────────────────────────────────────

interface TailOpportunityRow {
  ticker: string;
  kalshi_code: string;
  city: string;
  market_type: "high" | "low";
  settlement_date: string;
  strike_temp: number;
  tw_probability: number;          // percentage 0-100
  tw_probability_decimal: number;  // 0-1
  market_price: number | null;
  edge: number | null;
  kelly_fraction: number;
  std_dev: number;
  predicted_temp: number;
  ci_width: number;
  notes: string;
  scan_time: string;
  created_at: string;              // N1: explicit created_at for stale-clear DELETE
  prob_atr: number | null;
  stop_loss_price: number | null;
  take_profit_price: number | null;
  risk_reward_ratio: number;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const scanStartedAt = new Date().toISOString();

    console.log(`[tail-scan] Starting scan at ${scanStartedAt}`);

    // ── Step 1: Fetch TW forecasts ───────────────────────────────────────────

    const forecasts = await fetchTWForecasts(supabase);
    console.log(`[tail-scan] Got forecasts for ${forecasts.length} stations`);

    // ── Step 2: Build full ticker list across all cities + strike range ───────

    const targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() + 1); // tomorrow
    const year   = String(targetDate.getUTCFullYear()).slice(-2);
    const monthAbbr = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][targetDate.getUTCMonth()];
    const day    = String(targetDate.getUTCDate()).padStart(2, "0");
    const settlementDateStr = targetDate.toISOString().split("T")[0];

    // Map stationId → city definition for city-registry lookup
    const cityMap = new Map<string, KalshiCity>(
      VERIFIED_KALSHI_CITIES.map((c) => [c.stationId, c])
    );

    // Build all (ticker, metadata) pairs
    interface TickerMeta {
      ticker: string;
      stationId: string;
      city: string;
      strikeTemp: number;
      twProbability: number;
      twProbabilityDecimal: number;
      stdDev: number;
      predictedTemp: number;
      ciWidth: number;
    }

    const tickerMetas: TickerMeta[] = [];

    for (const pred of forecasts) {
      const station = cityMap.get(pred.stationId);
      if (!station) continue;

      const meanTemp = pred.predictedTemp;
      const stdDev   = pred.stdDev;
      const ciWidth  = Math.round((pred.ciHigh - pred.ciLow) * 10) / 10;

      const minStrike = Math.floor(meanTemp - STRIKE_WINDOW_F);
      const maxStrike = Math.ceil(meanTemp + STRIKE_WINDOW_F);

      for (let strike = minStrike; strike <= maxStrike; strike++) {
        // Bracket probability: P(strike ≤ high < strike+1)
        const zLow  = (strike     - meanTemp) / stdDev;
        const zHigh = (strike + 1 - meanTemp) / stdDev;
        const bracketProb = normCdf(zHigh) - normCdf(zLow);
        const twProbPct = Math.round(bracketProb * 100);

        // Skip trivial probabilities
        if (twProbPct < MIN_TW_PROB_PCT || twProbPct > MAX_TW_PROB_PCT) continue;

        // Build Kalshi ticker: e.g. KXHIGHNY-26APR13-B78.5
        const ticker = `${station.kalshiTicker}-${year}${monthAbbr}${day}-B${strike}.5`;

        tickerMetas.push({
          ticker,
          stationId: pred.stationId,
          city: station.city,
          strikeTemp: strike,
          twProbability: twProbPct,
          twProbabilityDecimal: twProbPct / 100,
          stdDev,
          predictedTemp: meanTemp,
          ciWidth,
        });
      }
    }

    console.log(`[tail-scan] Evaluating ${tickerMetas.length} Kalshi markets across ${forecasts.length} cities`);

    // ── Step 3: Fetch prices from market_prices table ────────────────────────

    const skipped: SkippedMarket[] = [];
    const allTickers = tickerMetas.map((m) => m.ticker);

    // Fetch prices from market_prices table (populated by price-sync cron every 5 min)
    const { data: priceRows } = await supabase
      .from("market_prices")
      .select("ticker, yes_price, no_price")
      .in("ticker", allTickers);

    // Build price map — yes_price is 0-100 integer, convert to 0-1 decimal
    const kalshiPrices = new Map<string, number | null>();
    for (const row of (priceRows ?? []) as any[]) {
      if (row.ticker && row.yes_price != null) {
        kalshiPrices.set(row.ticker, row.yes_price / 100); // yes_price 0-100 → decimal 0-1
      }
    }
    // Mark tickers with no price data
    for (const t of allTickers) {
      if (!kalshiPrices.has(t)) {
        kalshiPrices.set(t, null);
      }
    }

    console.log(`[tail-scan] Prices from market_prices: ${priceRows?.length ?? 0}/${allTickers.length} found`);

    // ── Step 4: Compute edge + Kelly, build rows ──────────────────────────────

    const rows: TailOpportunityRow[] = [];
    const nowIso = new Date().toISOString();

    for (const meta of tickerMetas) {
      const marketPrice = kalshiPrices.get(meta.ticker) ?? null;
      const edge = marketPrice !== null
        ? Math.abs(meta.twProbabilityDecimal - marketPrice)
        : null;
      const kellyFraction = computeKelly(meta.twProbabilityDecimal, marketPrice);

      const wideCI = meta.stdDev > 3;
      const kellyNote = kellyFraction > 0
        ? ` | Kelly=${(kellyFraction * 100).toFixed(2)}%`
        : " | Kelly=0 (no edge)";
      const notes =
        (wideCI
          ? `Wide CI (stdDev=${meta.stdDev}°F, width=${meta.ciWidth}°F) — potential mispricing`
          : `CI width=${meta.ciWidth}°F`) + kellyNote;

      // ── Bayesian estimate lookup ────────────────────────────────────────────
      // If a recent (<2h) Bayesian posterior exists for this ticker, prefer it over raw TW.
      let finalProb = meta.twProbabilityDecimal;
      try {
        const { data: bayesRow } = await supabase
          .from("bayesian_estimates")
          .select("posterior_prob, created_at")
          .eq("market_ticker", meta.ticker)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (bayesRow && (Date.now() - new Date(bayesRow.created_at).getTime()) < 2 * 60 * 60 * 1000) {
          finalProb = bayesRow.posterior_prob;
        }
      } catch {
        // bayesian_estimates table may not exist yet — fall back to raw TW
      }

      const finalProbPct = Math.round(finalProb * 100);
      const bayesEdge = marketPrice !== null ? Math.abs(finalProb - marketPrice) : null;
      const bayesKelly = computeKelly(finalProb, marketPrice);

      // ── ATR-scaled exits ──────────────────────────────────────────────────────
      let probAtr: number | null = null;
      let stopLossPrice: number | null = null;
      let takeProfitPrice: number | null = null;

      if (marketPrice !== null && finalProb > 0) {
        try {
          probAtr = await computeProbAtr(supabase, meta.ticker);
          const slRaw = marketPrice - 1.5 * probAtr;    // market price minus 1.5σ
          const tpRaw = marketPrice + 3.0 * probAtr;    // market price plus 3.0σ
          stopLossPrice = +Math.max(0, Math.min(1, slRaw)).toFixed(4);
          takeProfitPrice = +Math.max(0, Math.min(1, tpRaw)).toFixed(4);
        } catch {
          // Non-fatal — ATR computation failure shouldn't kill the scan
        }
      }

      rows.push({
        ticker:                 meta.ticker,
        kalshi_code:            meta.stationId.slice(1).toLowerCase(),
        city:                   meta.city,
        market_type:            "high",
        settlement_date:        settlementDateStr,
        strike_temp:            meta.strikeTemp,
        tw_probability:         finalProbPct,
        tw_probability_decimal: finalProb,
        market_price:           marketPrice,
        edge:                   bayesEdge,
        kelly_fraction:         bayesKelly,
        std_dev:                meta.stdDev,
        predicted_temp:         meta.predictedTemp,
        ci_width:               meta.ciWidth,
        notes,
        scan_time:              nowIso,
        created_at:             nowIso, // N1: always set created_at explicitly
        prob_atr:               probAtr,
        stop_loss_price:        stopLossPrice,
        take_profit_price:      takeProfitPrice,
        risk_reward_ratio:      2.0,
      });
    }

    // ── Step 5: Clear stale entries (N1 — DELETE by created_at, NOT scan_time) ─

    const { error: deleteError } = await supabase
      .from("tail_opportunities")
      .delete()
      .lt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

    if (deleteError) {
      // Non-fatal — log and continue; stale data beats no data
      console.warn(`[tail-scan] Stale DELETE failed: ${deleteError.message}`);
    } else {
      console.log("[tail-scan] Cleared stale tail_opportunities (created_at > 2h ago)");
    }

    // ── Step 6: INSERT fresh opportunities ────────────────────────────────────

    let rowsInserted = 0;

    if (rows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error: insertError, count } = await supabase
          .from("tail_opportunities")
          .insert(batch, { count: "exact" });

        if (insertError) {
          console.error(
            `[tail-scan] Insert batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${insertError.message}`
          );
        } else {
          rowsInserted += count ?? batch.length;
        }
      }
      console.log(`[tail-scan] Inserted ${rowsInserted} rows`);
    } else {
      console.log("[tail-scan] No opportunities to insert");
    }

    // ── Step 7: Log skipped markets to scan_log ───────────────────────────────

    if (skipped.length > 0) {
      const logRows = skipped.map((s) => ({
        scanner: "tail-scan",
        event: "market_skipped",
        detail: s.reason,
        context: s.ticker,
        logged_at: nowIso,
      }));

      const { error: logError } = await supabase.from("scan_log").insert(logRows);
      if (logError) {
        // scan_log is best-effort — don't fail the scan for it
        console.warn(`[tail-scan] scan_log insert failed: ${logError.message}`);
      }
    }

    // ── Step 8: Return summary ─────────────────────────────────────────────────

    const wideCI = rows.filter((r) => r.std_dev > 3);
    const withEdge = rows.filter((r) => r.edge !== null && r.edge > 0.05);
    const withKelly = rows.filter((r) => r.kelly_fraction > 0);

    const summary = {
      scanned_at:          scanStartedAt,
      settlement_date:     settlementDateStr,
      cities_scanned:      forecasts.length,
      markets_evaluated:   tickerMetas.length,
      rows_inserted:       rowsInserted,
      markets_skipped:     skipped.length,
      wide_ci_count:       wideCI.length,
      edge_opportunities:  withEdge.length,
      kelly_trades:        withKelly.length,
      kalshi_api_active:   (priceRows?.length ?? 0) > 0,
      top_kelly: withKelly
        .sort((a, b) => b.kelly_fraction - a.kelly_fraction)
        .slice(0, 5)
        .map((r) => ({
          city:          r.city,
          ticker:        r.ticker,
          tw_prob:       r.tw_probability,
          market_price:  r.market_price,
          edge:          r.edge,
          kelly_pct:     +(r.kelly_fraction * 100).toFixed(2),
        })),
    };

    console.log(
      `[tail-scan] Done — ${rowsInserted} inserted, ${withKelly.length} Kelly trades, ${skipped.length} skipped`
    );

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tail-scan] Fatal error: ${msg}`);
    return new Response(
      JSON.stringify({ error: "Fatal error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
