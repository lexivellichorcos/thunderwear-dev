/**
 * markets-compare — Supabase Edge Function
 *
 * READ endpoint — queries tw_hourly_forecasts to compute TW probability
 * per city using a Normal CDF exceedance calculation against the Kalshi strike.
 *
 * Data path (REVERT — 2026-04-15):
 *   - Query tw_hourly_forecasts for latest forecast per station (today or tomorrow)
 *   - Compute TW exceedance probability via Normal CDF
 *   - marketPrice / edgePp / direction are null (Kalshi API not wired here)
 *   - This restores the original behavior: TW probs visible, Kalshi column empty
 *
 * Response shape:
 *   {
 *     markets: Array<{
 *       city: string,
 *       stationId: string,
 *       kalshiTicker: string,
 *       twProbability: number | null,      // 0-100 percentage
 *       marketPrice: number | null,        // null (Kalshi not wired)
 *       edgePp: number | null,             // null
 *       direction: 'YES' | 'NO' | null,    // null
 *       twPredictedTemp: number | null,
 *       targetDate: string | null,
 *     }>,
 *     generatedAt: string,
 *     dataSource: 'tw_hourly_forecasts' | 'empty',
 *   }
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
  { city: "New York",       stationId: "KNYC",  kalshiTicker: "KXHIGHNY"    },
  { city: "Chicago",        stationId: "KMDW",  kalshiTicker: "KXHIGHCHI"   },
  { city: "Los Angeles",    stationId: "KLAX",  kalshiTicker: "KXHIGHLAX"   },
  { city: "Houston",        stationId: "KHOU",  kalshiTicker: "KXHIGHTHOU"  },
  { city: "Phoenix",        stationId: "KPHX",  kalshiTicker: "KXHIGHTPHX"  },
  { city: "Philadelphia",   stationId: "KPHL",  kalshiTicker: "KXHIGHPHIL"  },
  { city: "San Antonio",    stationId: "KSAT",  kalshiTicker: "KXHIGHTSATX" },
  { city: "Dallas",         stationId: "KDFW",  kalshiTicker: "KXHIGHTDAL"  },
  { city: "Austin",         stationId: "KAUS",  kalshiTicker: "KXHIGHAUS"   },
  { city: "San Francisco",  stationId: "KSFO",  kalshiTicker: "KXHIGHTSFO"  },
  { city: "Seattle",        stationId: "KSEA",  kalshiTicker: "KXHIGHTSEA"  },
  { city: "Denver",         stationId: "KDEN",  kalshiTicker: "KXHIGHDEN"   },
  { city: "Miami",          stationId: "KMIA",  kalshiTicker: "KXHIGHMIA"   },
  { city: "Minneapolis",    stationId: "KMSP",  kalshiTicker: "KXHIGHTMIN"  },
  { city: "Atlanta",        stationId: "KATL",  kalshiTicker: "KXHIGHTTATL" },
  { city: "Boston",         stationId: "KBOS",  kalshiTicker: "KXHIGHTBOS"  },
  { city: "Washington DC",  stationId: "KDCA",  kalshiTicker: "KXHIGHTDC"   },
  { city: "Las Vegas",      stationId: "KLAS",  kalshiTicker: "KXHIGHTLV"   },
  { city: "New Orleans",    stationId: "KMSY",  kalshiTicker: "KXHIGHTNOLA" },
  { city: "Oklahoma City",  stationId: "KOKC",  kalshiTicker: "KXHIGHTOKC"  },
];

// ── Normal CDF (Abramowitz & Stegun approximation) ───────────────────────────

function normCdf(z: number): number {
  // Protect against overflow
  if (z < -8) return 0;
  if (z > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);
  const t = 1.0 / (1.0 + p * absZ);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ / 2);

  return 0.5 * (1.0 + sign * y);
}

// Exceedance probability: P(high >= strike)
function exceedanceProb(predicted: number, stdDev: number, strike: number): number {
  if (stdDev <= 0) return predicted >= strike ? 100 : 0;
  const z = (strike - predicted) / stdDev;
  return Math.round((1 - normCdf(z)) * 1000) / 10; // 0-100 with 1 decimal
}

// ── Strike parser from Kalshi ticker ─────────────────────────────────────────

function parseStrikeFromTicker(ticker: string): number | null {
  // Ticker formats:
  //   KXHIGHNY-26APR15-B88.5  (bracket: high >= 88.5)
  //   KXHIGHNY-26APR15-T83    (threshold: high >= 83)
  //   KXHIGHNY-26APR15-82     (legacy integer)
  const parts = ticker.split("-");
  if (parts.length >= 3) {
    const raw = parts[parts.length - 1]; // e.g. "B88.5" or "T83" or "82"
    const stripped = raw.replace(/^[BT]/i, ""); // remove B or T prefix
    const strike = parseFloat(stripped);
    return isNaN(strike) ? null : strike;
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
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
    const generatedAt = new Date().toISOString();

    // ── Step 1: Fetch latest forecast per station from tw_hourly_forecasts ────
    // We want today or tomorrow's forecast, most recent per stationId

    const stationIds = VERIFIED_KALSHI_CITIES.map(c => c.stationId);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { data: forecastRows, error: forecastErr } = await supabase
      .from("tw_hourly_forecasts")
      .select("station_id, target_date, predicted_temp_high, std_dev, forecast_timestamp")
      .in("station_id", stationIds)
      .in("target_date", [today, tomorrow])
      .order("forecast_timestamp", { ascending: false });

    if (forecastErr) {
      console.warn(`[markets-compare] tw_hourly_forecasts query error: ${forecastErr.message}`);
    }

    // Dedup: keep latest forecast per station_id
    const forecastByStation = new Map<string, any>();
    for (const row of (forecastRows ?? []) as any[]) {
      const sid = row.station_id;
      if (sid && !forecastByStation.has(sid)) {
        forecastByStation.set(sid, row);
      }
    }

    const dataSource = forecastByStation.size > 0 ? "tw_hourly_forecasts" : "empty";
    if (dataSource === "empty") {
      console.warn("[markets-compare] tw_hourly_forecasts returned no rows for today/tomorrow");
    }

    // ── Step 2: Fetch Kalshi prices from market_prices ───────────────────────
    // market_prices has tickers like KXHIGHNY-26APR15-B83.5
    // We need to find the best-match ticker per city series
    const { data: priceRows } = await supabase
      .from("market_prices")
      .select("ticker, yes_price, no_price")
      .or(VERIFIED_KALSHI_CITIES.map(c => `ticker.like.${c.kalshiTicker}%`).join(","));

    // Build a map: series prefix → best price (closest to 50¢ = most liquid)
    const priceByPrefix = new Map<string, { yes_price: number; ticker: string }>();
    for (const row of (priceRows ?? []) as any[]) {
      const prefix = VERIFIED_KALSHI_CITIES.find(c => row.ticker?.startsWith(c.kalshiTicker))?.kalshiTicker;
      if (!prefix || row.yes_price == null) continue;
      const existing = priceByPrefix.get(prefix);
      // Pick the market closest to 50¢ (most liquid / most relevant)
      if (!existing || Math.abs(row.yes_price - 50) < Math.abs(existing.yes_price - 50)) {
        priceByPrefix.set(prefix, { yes_price: row.yes_price, ticker: row.ticker });
      }
    }

    // ── Step 3: Build response ───────────────────────────────────────────────

    const markets = VERIFIED_KALSHI_CITIES.map((cityDef) => {
      const forecast = forecastByStation.get(cityDef.stationId);
      const priceData = priceByPrefix.get(cityDef.kalshiTicker);

      let twProbability: number | null = null;
      let twPredictedTemp: number | null = null;
      let targetDate: string | null = null;
      const marketPrice = priceData?.yes_price ?? null;

      if (forecast) {
        twPredictedTemp = forecast.predicted_temp_high != null
          ? Math.round(forecast.predicted_temp_high * 10) / 10
          : null;
        targetDate = forecast.target_date ?? null;

        const strike = parseStrikeFromTicker(priceData?.ticker ?? cityDef.kalshiTicker);
        if (twPredictedTemp != null && forecast.std_dev != null && forecast.std_dev > 0 && strike != null) {
          twProbability = exceedanceProb(twPredictedTemp, forecast.std_dev, strike);
        }
      }

      const edgePp = twProbability != null && marketPrice != null
        ? Math.round((twProbability - marketPrice) * 10) / 10
        : null;
      const direction = edgePp != null ? (edgePp > 0 ? "YES" : "NO") : null;

      return {
        city: cityDef.city,
        stationId: cityDef.stationId,
        kalshiTicker: cityDef.kalshiTicker,
        twProbability,
        marketPrice,
        edgePp,
        direction,
        twPredictedTemp,
        targetDate,
      };
    });

    return new Response(
      JSON.stringify({ markets, generatedAt, dataSource }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[markets-compare] Fatal error: ${msg}`);
    return new Response(
      JSON.stringify({ error: "Fatal error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
