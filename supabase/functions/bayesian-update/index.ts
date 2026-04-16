/**
 * bayesian-update — Supabase Edge Function
 *
 * Sequential Bayesian update for weather market probabilities.
 * MVP: TW forecast update path only (κ time-decay + hours-to-settlement).
 *
 * Accepts:  { market_ticker, prior_prob, new_tw_prob, hours_to_settlement, tw_model_skill_rate?, city?, station_id? }
 * Returns:  { posterior_prob, confidence_interval, update_source, alpha, beta, created_at }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Constants (from Mia's spec) ──────────────────────────────────────────────

const DEFAULT_TW_SKILL = 0.72;
const TIME_DECAY_RATE = 0.3; // κ degrades 30% at T=48h
const INITIAL_CONCENTRATION = 10.0;
const COMPRESSION_TAU = 24.0; // hours — start compressing within 24h
const COMPRESSION_MAX = 3.0;
const SENSITIVITY = 5.0; // virtual observations per update

// ── Beta distribution helpers ────────────────────────────────────────────────

function betaMean(a: number, b: number): number {
  return a / (a + b);
}

function betaVariance(a: number, b: number): number {
  return (a * b) / ((a + b) ** 2 * (a + b + 1));
}

function betaUpdate(alpha: number, beta: number, likelihoodYes: number, likelihoodNo: number): [number, number] {
  const bf = likelihoodYes / Math.max(likelihoodNo, 1e-10);
  const logBf = Math.log(Math.max(bf, 1e-10));

  if (logBf > 0) {
    const deltaAlpha = Math.min(SENSITIVITY * (1 - 1 / bf), SENSITIVITY);
    return [alpha + deltaAlpha, beta];
  } else {
    const deltaBeta = Math.min(SENSITIVITY * (1 - bf), SENSITIVITY);
    return [alpha, beta + deltaBeta];
  }
}

function confidenceInterval(a: number, b: number): [number, number] {
  const prob = betaMean(a, b);
  const std = Math.sqrt(betaVariance(a, b));
  return [
    Math.max(0.01, +(prob - 1.645 * std).toFixed(4)),
    Math.min(0.99, +(prob + 1.645 * std).toFixed(4)),
  ];
}

// ── Prob ATR helper ──────────────────────────────────────────────────────────

async function computeProbAtr(supabase: any, ticker: string): Promise<number> {
  const { data } = await supabase
    .from("bayesian_estimates")
    .select("posterior_prob")
    .eq("market_ticker", ticker)
    .order("created_at", { ascending: false })
    .limit(6);

  if (!data || data.length < 3) return 0.05; // default 5% volatility

  const probs = data.map((r: any) => r.posterior_prob);
  const mean = probs.reduce((a: number, b: number) => a + b, 0) / probs.length;
  const variance = probs.reduce((s: number, p: number) => s + Math.pow(p - mean, 2), 0) / (probs.length - 1);  // sample variance (÷n-1)
  return Math.sqrt(variance);
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const body = await req.json();

    // ── ATR endpoint ───────────────────────────────────────────────────────────
    // If body contains { action: "atr", market_ticker, entry_prob, market_price }
    // return ATR-scaled exit prices without doing a Bayesian update.
    if (body.action === "atr") {
      const { market_ticker, entry_prob, market_price } = body;
      if (!market_ticker || entry_prob == null || market_price == null) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: market_ticker, entry_prob, market_price" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) {
        return new Response(
          JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabase = createClient(supabaseUrl, serviceKey);
      const probAtr = await computeProbAtr(supabase, market_ticker);

      const stopLossPrice = market_price - 1.5 * probAtr;    // market price minus 1.5σ
      const takeProfitPrice = market_price + 3.0 * probAtr;    // market price plus 3.0σ

      return new Response(JSON.stringify({
        prob_atr: +probAtr.toFixed(6),
        stop_loss_price: +Math.max(0, Math.min(1, stopLossPrice)).toFixed(4),
        take_profit_price: +Math.max(0, Math.min(1, takeProfitPrice)).toFixed(4),
        risk_reward_ratio: 2.0,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Standard Bayesian update ──────────────────────────────────────────────
    const {
      market_ticker,
      prior_prob,
      new_tw_prob,
      hours_to_settlement,
      tw_model_skill_rate,
      city,
      station_id,
    } = body;

    // ── Validate ──────────────────────────────────────────────────────────────

    if (!market_ticker || prior_prob == null || new_tw_prob == null || hours_to_settlement == null) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: market_ticker, prior_prob, new_tw_prob, hours_to_settlement" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (prior_prob < 0 || prior_prob > 1 || new_tw_prob < 0 || new_tw_prob > 1) {
      return new Response(
        JSON.stringify({ error: "prior_prob and new_tw_prob must be in [0,1]" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const kappa = tw_model_skill_rate ?? DEFAULT_TW_SKILL;

    // ── Build beta prior ──────────────────────────────────────────────────────

    let alpha = Math.max(0.5, INITIAL_CONCENTRATION * prior_prob);
    let beta = Math.max(0.5, INITIAL_CONCENTRATION * (1 - prior_prob));

    // ── TW forecast update ────────────────────────────────────────────────────

    // Time-adjusted skill: κ_eff = κ × (1 - 0.3 × min(1, hours_to_settlement / 48))
    const timeFactor = 1 - TIME_DECAY_RATE * Math.min(1.0, hours_to_settlement / 48.0);
    const kappaEff = kappa * timeFactor;

    // Likelihood with reliability κ
    const pEvidenceYes = kappaEff * new_tw_prob + (1 - kappaEff) * 0.5;
    const pEvidenceNo = kappaEff * (1 - new_tw_prob) + (1 - kappaEff) * 0.5;

    [alpha, beta] = betaUpdate(alpha, beta, pEvidenceYes, pEvidenceNo);

    // ── Apply settlement compression ──────────────────────────────────────────

    let aComp = alpha;
    let bComp = beta;
    if (hours_to_settlement < COMPRESSION_TAU) {
      const factor = 1 + (COMPRESSION_MAX - 1) * Math.max(0, 1 - hours_to_settlement / COMPRESSION_TAU);
      aComp *= factor;
      bComp *= factor;
    }

    const posteriorProb = +betaMean(aComp, bComp).toFixed(4);
    const [ciLower, ciUpper] = confidenceInterval(aComp, bComp);

    // ── Store result ──────────────────────────────────────────────────────────

    const insertRow = {
      market_ticker,
      city: city ?? null,
      station_id: station_id ?? null,
      prior_prob,
      posterior_prob: posteriorProb,
      tw_model_skill_rate: kappa,
      update_source: "tw_forecast",
      evidence_value: new_tw_prob,
      hours_to_settlement,
      alpha: +alpha.toFixed(2),
      beta: +beta.toFixed(2),
      ci_lower: ciLower,
      ci_upper: ciUpper,
    };

    const { error: insertError } = await supabase
      .from("bayesian_estimates")
      .insert(insertRow);

    if (insertError) {
      console.error(`[bayesian-update] Insert failed: ${insertError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to store estimate", detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = {
      posterior_prob: posteriorProb,
      confidence_interval: { lower: ciLower, upper: ciUpper },
      update_source: "tw_forecast",
      kappa_effective: +kappaEff.toFixed(4),
      alpha: +alpha.toFixed(2),
      beta: +beta.toFixed(2),
      created_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bayesian-update] Fatal: ${msg}`);
    return new Response(
      JSON.stringify({ error: "Fatal error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
