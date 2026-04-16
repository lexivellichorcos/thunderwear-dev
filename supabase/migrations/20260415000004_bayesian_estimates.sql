-- Step 4: Bayesian Estimates table
-- Stores sequential Bayesian posterior updates for weather market probabilities.
-- Each row = one update event (TW forecast, METAR divergence, or market signal).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS bayesian_estimates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  market_ticker TEXT NOT NULL,
  city TEXT,
  station_id TEXT,
  prior_prob FLOAT NOT NULL,
  posterior_prob FLOAT NOT NULL,
  tw_model_skill_rate FLOAT NOT NULL DEFAULT 0.72,
  update_source TEXT NOT NULL CHECK (update_source IN ('tw_forecast', 'metar', 'market')),
  evidence_value FLOAT,
  hours_to_settlement FLOAT,
  alpha FLOAT,
  beta FLOAT,
  ci_lower FLOAT,
  ci_upper FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bayesian_estimates_ticker
  ON bayesian_estimates(market_ticker, created_at DESC);

-- RLS: service role bypasses; no direct user access needed
ALTER TABLE bayesian_estimates ENABLE ROW LEVEL SECURITY;
