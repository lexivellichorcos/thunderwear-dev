# Dashboard Progress

## Step 2 — Sienna Audit Fixes (2026-04-15)

All 5 audit items fixed:

### CRITICAL 1 ✅ — Schema migration
- Created `supabase/migrations/20260415000001_step2_schema_fixes.sql`
- Adds `kalshi_key_id` to profiles
- Adds `contracts`, `idempotency_key`, `order_id`, `kalshi_response` to trade_log
- Unique index on `idempotency_key` (partial, WHERE NOT NULL)
- Drops old `positions_real_user_id_market_token_key`, adds `positions_real_user_id_market_ticker_key`

### CRITICAL 2 ✅ — Order payload fix
- `side` now validates `"yes"|"no"`, `action` validates `"buy"|"sell"`
- Kalshi payload sends `side`, `action` separately, with `yes_price`/`no_price` conditional, `type: 'limit'`, `expiration_ts: 0`
- KALSHI_BASE kept current with TODO comment to verify production URL

### CRITICAL 3 ✅ — Position field mapping fix
- Uses `kalshiData.market_positions` instead of `kalshiData.positions`
- Field mapping: `position_fp` → side/contracts, `realized_pnl_dollars` → pnl_cents
- `onConflict: 'user_id,market_ticker'` matches new constraint

### HIGH 2 ✅ — Deploy gate on schema pass
- `deploy-step2.mjs` now calls `process.exit(1)` if `passed < 6`

### HIGH 3 ✅ — Idempotency key from caller
- Accepts optional `idempotency_key` in request body, generates UUID if absent
- Pre-inserts to `trade_log` with `status = 'pending'` before Kalshi call
- Updates to `'filled'` or `'failed'` after response
- Duplicate key returns 409

## Status
- deploy-step2.mjs ready to run (with schema gate)
- Migration must be applied before deploy

## Step 3 — Sync Queue + Market Prices (2026-04-15)

### Files written
- `supabase/migrations/20260415000002_sync_queue_market_prices.sql` — market_prices + sync_queue tables, RLS, dedup index
- `supabase/functions/price-sync/index.ts` — Cron edge function, fetches Kalshi weather markets, upserts market_prices
- `supabase/functions/queue-processor/index.ts` — General-purpose queue processor, routes by job_type
- `scripts/setup-cron.sql` — pg_cron schedules (⚠️ replace SERVICE_ROLE_KEY before running)
- `scripts/deploy-step3.mjs` — Schema verification with dedup index test

### What Muz needs to run manually
1. Apply migration: run `20260415000002_sync_queue_market_prices.sql` in Supabase SQL editor
2. Deploy edge functions: `supabase functions deploy price-sync` and `supabase functions deploy queue-processor`
3. Replace `<SERVICE_ROLE_KEY>` in `scripts/setup-cron.sql` with actual key
4. Run `setup-cron.sql` in Supabase SQL editor
5. Run `node scripts/deploy-step3.mjs` to verify

### Sienna Step 3 Audit Fixes (2026-04-15)

**H1 ✅ — RLS on sync_queue**
- Added `ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY` to migration 20260415000002
- No policies = deny all authenticated; service role bypasses RLS by design

**H2 ✅ — Atomic job claim via FOR UPDATE SKIP LOCKED**
- Created migration `20260415000003_atomic_claim_rpc.sql`
- `claim_next_job()` RPC: SELECT+UPDATE in single statement with SKIP LOCKED
- Added `process_after TIMESTAMPTZ` column + partial index
- Queue-processor updated to call `supabase.rpc('claim_next_job')` instead of SELECT+UPDATE

**H3 ✅ — Replace sleep-based backoff with process_after**
- Removed all `setTimeout` calls from queue-processor
- On retry: sets `status='pending', process_after = NOW() + 2^attempts seconds`
- `claim_next_job()` filters `WHERE process_after IS NULL OR process_after <= NOW()`

**M1 ✅ — Handle 23505 race in price-sync**
- On unique constraint violation (code 23505), returns `{ skipped: true, reason: 'race_dedup' }` with 200

**Deploy script fixes ✅**
- `deploy-step3.mjs`: dedup test cleanup by ID (not type+status)
- `deploy-step3.mjs`: RLS check attempts real verification with fallback
- Added `process_after` to required columns check
- Added `checkClaimNextJob()` RPC verification

## Step 4 — Bayesian Probability Engine (2026-04-15)

MVP: TW-only Bayesian update path per Mia's spec.

### Files written
- `supabase/migrations/20260415000004_bayesian_estimates.sql` — `bayesian_estimates` table with RLS, index on (market_ticker, created_at DESC)
- `supabase/functions/bayesian-update/index.ts` — Edge function implementing sequential Bayesian update:
  - Accepts: market_ticker, prior_prob, new_tw_prob, hours_to_settlement, optional tw_model_skill_rate
  - Time-decay: κ_eff = κ × (1 - 0.3 × min(1, T/48)) — half-weight at 48h, full at 0h
  - Beta-binomial conjugate update with sensitivity=5 virtual observations per update
  - Settlement compression: concentration ×3 as T→0 (narrows CI)
  - Returns posterior_prob + 90% CI + alpha/beta
  - Stores full update history in bayesian_estimates
- `supabase/functions/tail-scan/index.ts` — Updated to prefer Bayesian posterior over raw TW probability:
  - Looks up latest bayesian_estimates row per ticker
  - If <2h old, uses posterior_prob instead of raw TW probability for edge + Kelly
  - Graceful fallback if table doesn't exist yet
- `scripts/deploy-step4-bayes.mjs` — Deploy + verify script (migration, function deploy, table check, smoke test)

### What Muz needs to run manually
1. Apply migration: run `20260415000004_bayesian_estimates.sql` in Supabase SQL editor
2. Deploy edge functions: `supabase functions deploy bayesian-update` and `supabase functions deploy tail-scan`
3. Run `node scripts/deploy-step4-bayes.mjs` to verify

### Bayesian math notes
- Prior: Beta(10×prior, 10×(1-prior)) with min 0.5 per param
- TW update: likelihood uses κ_eff time-weighted, pulls toward 0.5 (uninformative) as skill decreases
- CI: normal approximation of beta distribution (valid for α+β > 10)
- No METAR or market signal paths yet (week 2 per spec)

## Fix Batch — METAR Divergence Label + Kalshi Edge Detection (2026-04-15)

### FIX 1 ✅ — METAR Divergence: Clearer labels
- Column headers updated: "Obs °F" → "Obs (Now) °F", "TW High °F" → "TW Fcst High °F", "Divergence" → "Δ (High − Obs)"
- Existing disclaimer note retained: explains overnight divergence is expected, not model error
- Frontend-only change, no data/backend changes

### FIX 2 ✅ — Kalshi % column: Data path fix
- **Root cause:** `markets-compare` endpoint queried `tw_hourly_forecasts.tw_probability` which doesn't exist in that table
- **Fix:** Rewrote `markets-compare` edge function to query `tail_opportunities` table (has pre-computed `tw_probability` + `market_price` from tail-scan)
- Groups by city, picks best edge per city, joins with `market_prices` for freshest Kalshi yes_price
- Falls back to `tail_opportunities.market_price` (0-1 decimal) if `market_prices` is empty
- Added `dataSource` field: `'tail_opportunities'` or `'empty'` so frontend knows
- UI: Changed empty state from generic "No market data" to "No opportunities found in last scan" with hint to run tail-scan
- **Supabase redeploy needed:** Yes — `supabase functions deploy markets-compare` required to pick up the backend change
- Frontend change also needed (column header + empty state) — deployed with next Vite build

### Files changed
- `supabase/migrations/20260415000002_sync_queue_market_prices.sql` — RLS on sync_queue
- `supabase/migrations/20260415000003_atomic_claim_rpc.sql` — NEW: claim_next_job RPC + process_after
- `supabase/functions/queue-processor/index.ts` — atomic claim, timestamp backoff
- `supabase/functions/price-sync/index.ts` — 23505 race handling
- `scripts/deploy-step3.mjs` — dedup cleanup by id, RLS check, claim RPC check

## Step 5 — ATR-Scaled Exit Layer (2026-04-15)

Adds ATR-scaled stop-loss and take-profit prices to tail-scan output, plus exit signal generation.

### Files written
- `supabase/migrations/20260415000005_atr_exit_columns.sql` — Adds `prob_atr`, `stop_loss_price`, `take_profit_price`, `risk_reward_ratio` to `tail_opportunities`; adds `exit_trigger`, `trigger_price`, `prob_atr` to `exit_signals`
- `supabase/functions/bayesian-update/index.ts` — Added `computeProbAtr()` helper + `/atr` endpoint (action="atr") returning ATR-scaled exit prices
- `supabase/functions/tail-scan/index.ts` — Added `computeProbAtr()` helper, computes ATR-scaled stop_loss_price + take_profit_price per opportunity row
- `supabase/functions/exit-signals/index.ts` — Enhanced with POST endpoint: queries open positions from `positions_real`, checks against ATR exit prices from `tail_opportunities`, inserts triggered exit signals with `exit_trigger` (stop_loss/take_profit)
- `scripts/deploy-step5-atr.mjs` — Deploy + verify script (migration, 3 function deploys, column verification on both tables)

### ATR math
- `prob_atr` = standard deviation of last 6 `posterior_prob` values from `bayesian_estimates`
- Default 0.05 (5%) if < 3 rows exist
- `stop_loss_price = market_price × (1 − 1.5 × prob_atr / finalProb)` — clamped [0,1]
- `take_profit_price = market_price × (1 + 3.0 × prob_atr / finalProb)` — clamped [0,1]
- Risk-reward ratio fixed at 2.0 (1.5× ATR stop vs 3.0× ATR target)

### What Muz needs to run manually
1. Apply migration: run `20260415000005_atr_exit_columns.sql` in Supabase SQL editor
2. Deploy edge functions: `supabase functions deploy bayesian-update && supabase functions deploy tail-scan && supabase functions deploy exit-signals`
3. Run `node scripts/deploy-step5-atr.mjs` to verify

### Functions needing deploy
- `bayesian-update` (new `/atr` endpoint + computeProbAtr)
- `tail-scan` (ATR exit price computation)
- `exit-signals` (POST endpoint for exit signal generation)

## Sienna Audit Fixes — H1/H2/H3 (2026-04-15)

### H1 ✅ — ATR formula denominator fix
- **Files:** `supabase/functions/tail-scan/index.ts`, `supabase/functions/bayesian-update/index.ts`
- **Before:** `marketPrice * (1 - 1.5 * probAtr / finalProb)` — used `finalProb` (model estimate) as denominator
- **After:** `marketPrice - 1.5 * probAtr` — stops/targets are offset directly from market price in probability space
- Both tail-scan and bayesian-update `/atr` endpoint fixed

### H2 ✅ — Dedup protection on exit-signals INSERT
- **File:** `supabase/migrations/20260415000005_atr_exit_columns.sql` — added `position_id` column + unique index `uq_exit_signals_position_trigger` on `(position_id, exit_trigger)` WHERE position_id IS NOT NULL
- **File:** `supabase/functions/exit-signals/index.ts` — changed `.insert()` to `.upsert()` with `onConflict: 'position_id,exit_trigger', ignoreDuplicates: true`
- Same position can no longer get the same exit signal twice

### H3 ✅ — Sample variance (÷n-1) not population variance (÷n)
- **Files:** `supabase/functions/tail-scan/index.ts`, `supabase/functions/bayesian-update/index.ts`
- **Before:** `variance = sum / probs.length` (population variance)
- **After:** `variance = sum / (probs.length - 1)` (sample variance)
- Fixed in both `computeProbAtr()` implementations
