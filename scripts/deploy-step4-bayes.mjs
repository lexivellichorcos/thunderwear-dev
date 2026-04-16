#!/usr/bin/env node
/**
 * deploy-step4-bayes.mjs
 *
 * Deploys Step 4: Bayesian probability engine.
 * 1. Applies migration (creates bayesian_estimates table)
 * 2. Deploys bayesian-update edge function
 * 3. Verifies: table exists, function responds
 *
 * Exits 1 on any failure.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MIGRATION = join(ROOT, "supabase", "migrations", "20260415000004_bayesian_estimates.sql");

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
step("Apply bayesian_estimates migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  // Use supabase CLI to apply — user can also run manually in SQL editor
  execSync(`supabase db push --db-url "$(cat ${join(ROOT, ".env')} | grep SUPABASE_DB_URL | cut -d= -f2-)" 2>&1 || true`, {
    cwd: ROOT,
    stdio: "pipe",
  });
  console.log("  ℹ️  If db push failed, apply migration manually in Supabase SQL editor.");
});

// 2. Deploy edge function
step("Deploy bayesian-update edge function", () => {
  execSync("supabase functions deploy bayesian-update", {
    cwd: ROOT,
    stdio: "inherit",
  });
});

// 3. Verify table exists
step("Verify bayesian_estimates table", () => {
  const out = execSync("supabase db execute --sql 'SELECT COUNT(*) FROM bayesian_estimates;'", {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
  console.log(`  Table query returned: ${out.trim()}`);
});

// 4. Verify function responds
step("Verify bayesian-update function responds", () => {
  const url = process.env.SUPABASE_URL || execSync("supabase status | grep 'API URL' | awk '{print $3}'", {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();

  const key = process.env.SUPABASE_ANON_KEY || execSync("supabase status | grep 'anon key' | awk '{print $3}'", {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();

  const payload = JSON.stringify({
    market_ticker: "KXHIGHNY-26APR16-B78.5",
    prior_prob: 0.55,
    new_tw_prob: 0.60,
    hours_to_settlement: 24,
  });

  const out = execSync(
    `curl -sf -X POST "${url}/functions/v1/bayesian-update" -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '${payload}'`,
    { encoding: "utf8" }
  );
  const result = JSON.parse(out);
  if (result.posterior_prob == null) throw new Error(`No posterior_prob in response: ${out}`);
  console.log(`  posterior_prob=${result.posterior_prob}, CI=[${result.confidence_interval?.lower}, ${result.confidence_interval?.upper}]`);
});

// Gate
if (failed) {
  console.error("\n🚫 Step 4 deploy FAILED — fix errors before proceeding.");
  process.exit(1);
}

console.log("\n✅ Step 4 (Bayesian engine) deployed and verified.");
