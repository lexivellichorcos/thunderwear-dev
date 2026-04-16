-- Step 5: ATR-scaled exit columns
-- Adds prob_atr, stop_loss_price, take_profit_price, risk_reward_ratio to tail_opportunities
-- Adds exit_trigger, trigger_price, prob_atr to exit_signals

-- ATR-scaled exit prices on tail_opportunities
ALTER TABLE tail_opportunities ADD COLUMN IF NOT EXISTS prob_atr FLOAT;
ALTER TABLE tail_opportunities ADD COLUMN IF NOT EXISTS stop_loss_price FLOAT;       -- Kalshi yes_price to stop at
ALTER TABLE tail_opportunities ADD COLUMN IF NOT EXISTS take_profit_price FLOAT;     -- Kalshi yes_price to take profit at
ALTER TABLE tail_opportunities ADD COLUMN IF NOT EXISTS risk_reward_ratio FLOAT DEFAULT 2.0;

-- Exit trigger metadata on exit_signals
ALTER TABLE exit_signals ADD COLUMN IF NOT EXISTS exit_trigger TEXT;  -- 'stop_loss' | 'take_profit' | 'time_decay'
ALTER TABLE exit_signals ADD COLUMN IF NOT EXISTS trigger_price FLOAT;
ALTER TABLE exit_signals ADD COLUMN IF NOT EXISTS prob_atr FLOAT;

-- Dedup protection for exit_signals
ALTER TABLE exit_signals ADD COLUMN IF NOT EXISTS position_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exit_signals_position_trigger 
  ON exit_signals (position_id, exit_trigger)
  WHERE position_id IS NOT NULL;
