#!/usr/bin/env node
/**
 * deploy-step5-atr.mjs
 *
 * Deploys Step 5: ATR-scaled exit layer.
 * 1. Applies migration (adds ATR exit columns to tail_opportunities + exit_signals)
 * 2. Deploys updated edge functions (bayesian-update, tail-scan, exit-signals)
 * 3. Verifies new columns exist on both tables
 *
 * Exits 1 on any failure.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MIGRATION = join(ROOT, "supabase", "migrations", "20260415000005_atr_exit_columns.sql");

let failed = false;

function step(label, fn) {
  console.log(`\n▶ ${label}`);
  try {
    fn();
    console.log(`  ✅ ${label} — OK`);
  } catch (e) {
    console.error(`  ❌ ${label} — FAILED: ${e.message}`);
    failed = true;
  }
}

// 1. Apply migration
step("Apply ATR exit columns migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  console.log("  ℹ️  Migration SQL ready. Apply manually in Supabase SQL editor if db push fails.");
  try {
    execSync(`supabase db push --db-url "$(cat ${join(ROOT, '.env')} | grep SUPABASE_DB_URL | cut -d= -f2-)" 2>&1 || true`, {
      cwd: ROOT,
      stdio: "pipe",
    });
  } catch {
    // Non-fatal — user can apply manually
  }
});

// 2. Deploy edge functions
for (const fn of ["bayesian-update", "tail-scan", "exit-signals"]) {
  step(`Deploy ${fn} edge function`, () => {
    execSync(`supabase functions deploy ${fn}`, {
      cwd: ROOT,
      stdio: "inherit",
    });
  });
}

// 3. Verify columns on tail_opportunities
step("Verify ATR columns on tail_opportunities", () => {
  const out = execSync(
    `supabase db execute --sql "SELECT column_name FROM information_schema.columns WHERE table_name='tail_opportunities' AND column_name IN ('prob_atr','stop_loss_price','take_profit_price','risk_reward_ratio');"`,
    { cwd: ROOT, stdio: "pipe", encoding: "utf8" }
  );
  const found = ["prob_atr", "stop_loss_price", "take_profit_price", "risk_reward_ratio"].filter(c => out.includes(c));
  console.log(`  Found ${found.length}/4 columns: ${found.join(", ")}`);
  if (found.length < 4) throw new Error(`Missing columns: expected 4, found ${found.length}`);
});

// 4. Verify columns on exit_signals
step("Verify ATR columns on exit_signals", () => {
  const out = execSync(
    `supabase db execute --sql "SELECT column_name FROM information_schema.columns WHERE table_name='exit_signals' AND column_name IN ('exit_trigger','trigger_price','prob_atr');"`,
    { cwd: ROOT, stdio: "pipe", encoding: "utf8" }
  );
  const found = ["exit_trigger", "trigger_price", "prob_atr"].filter(c => out.includes(c));
  console.log(`  Found ${found.length}/3 columns: ${found.join(", ")}`);
  if (found.length < 3) throw new Error(`Missing columns: expected 3, found ${found.length}`);
});

// Gate
if (failed) {
  console.error("\n🚫 Step 5 deploy FAILED — fix errors before proceeding.");
  process.exit(1);
}

console.log("\n✅ Step 5 (ATR exit layer) deployed and verified.");
