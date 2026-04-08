/**
 * Kalshi Market Auditor
 *
 * Queries live Kalshi API to:
 * 1. Discover all active KXHIGH series events/markets
 * 2. Verify ticker prefixes in city-registry.ts against real API responses
 * 3. Document exact price field names returned by the API
 * 4. Output a city-registry patch if discrepancies found
 *
 * Run: cd /Users/openclawadmin/thunderwear-dev && npx ts-node scripts/audit-kalshi-markets.ts
 *
 * Output files:
 *   - thunderwear-dev/audit-output/kalshi-market-audit-YYYY-MM-DD.json
 *   - thunderwear-dev/audit-output/price-field-sample.json
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// Load .env file manually
try {
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
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

const KALSHI_API_KEY = process.env.KALSHI_API_KEY || '1b8b8424-3816-482d-ac56-a1796dfb7f9e';
const KALSHI_BASE_URL = 'https://trading-api.kalshi.com/trade-api/v2';

const HEADERS = {
  'Authorization': `Bearer ${KALSHI_API_KEY}`,
  'Content-Type': 'application/json',
};

// Expected cities from city-registry.ts
const EXPECTED_CITIES = [
  { city: 'New York',      ticker: 'KXHIGHNY' },
  { city: 'Chicago',       ticker: 'KXHIGHCHI' },    // Spec says KXHIGHCHI
  { city: 'Los Angeles',   ticker: 'KXHIGHLA' },     // Spec says KXHIGHLA
  { city: 'Houston',       ticker: 'KXHIGHTHOU' },
  { city: 'Phoenix',       ticker: 'KXHIGHTPHX' },
  { city: 'Philadelphia',  ticker: 'KXHIGHTPHL' },
  { city: 'San Antonio',   ticker: 'KXHIGHTSAT' },
  { city: 'San Diego',     ticker: 'KXHIGHTSAN' },
  { city: 'Dallas',        ticker: 'KXHIGHTDAL' },
  { city: 'Fort Worth',    ticker: 'KXHIGHTFTW' },
  { city: 'San Jose',      ticker: 'KXHIGHTSJO' },
  { city: 'Austin',        ticker: 'KXHIGHTAUS' },
  { city: 'Jacksonville',  ticker: 'KXHIGHTJAX' },
  { city: 'Columbus',      ticker: 'KXHIGHTCMH' },
  { city: 'Charlotte',     ticker: 'KXHIGHTCLT' },
  { city: 'Indianapolis',  ticker: 'KXHIGHTIND' },
  { city: 'San Francisco', ticker: 'KXHIGHTSFO' },
  { city: 'Seattle',       ticker: 'KXHIGHTSEA' },
  { city: 'Denver',        ticker: 'KXHIGHTDEN' },
  { city: 'Nashville',     ticker: 'KXHIGHTNSH' },
];

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 429) {
        console.log('  Rate limited — waiting 2s...');
        await sleep(2000);
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(500);
    }
  }
  throw new Error('Max retries exceeded');
}

// ============================================================================
// Step 1: Fetch all KXHIGH series events
// ============================================================================

async function fetchKXHIGHEvents(): Promise<unknown[]> {
  console.log('\n📡 Fetching KXHIGH series events...');
  const url = `${KALSHI_BASE_URL}/events?series_ticker=KXHIGH&limit=100`;
  const res = await fetchWithRetry(url);
  console.log(`  HTTP ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`  Error: ${text}`);
    return [];
  }
  const data = await res.json() as { events?: unknown[] };
  const events = data.events || [];
  console.log(`  Found ${events.length} events`);
  return events;
}

// ============================================================================
// Step 2: Probe a specific market for price field names
// ============================================================================

async function probeMarketFields(ticker: string): Promise<{
  priceFields: Record<string, unknown>;
  allFields: string[];
  rawMarket: Record<string, unknown> | null;
}> {
  console.log(`\n🔍 Probing market fields for: ${ticker}`);
  const url = `${KALSHI_BASE_URL}/markets/${ticker}`;
  const res = await fetchWithRetry(url);
  console.log(`  HTTP ${res.status}`);

  if (!res.ok) {
    const text = await res.text();
    console.log(`  Not found / error: ${text.slice(0, 200)}`);
    return { priceFields: {}, allFields: [], rawMarket: null };
  }

  const data = await res.json() as { market?: Record<string, unknown> };
  const market = data.market;
  if (!market) return { priceFields: {}, allFields: [], rawMarket: null };

  // Extract all fields that look price-related
  const priceFields: Record<string, unknown> = {};
  const allFields = Object.keys(market);
  for (const key of allFields) {
    if (/ask|bid|price|yes_|no_|last/i.test(key)) {
      priceFields[key] = market[key];
    }
  }

  return { priceFields, allFields, rawMarket: market };
}

// ============================================================================
// Step 3: Try alternate ticker formats to find correct prefix for each city
// ============================================================================

function buildTestTicker(prefix: string, date: Date): string {
  // Try today's date (should exist if market is active)
  const year = String(date.getFullYear()).slice(-2);
  const monthAbbr = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  return `${prefix}-${year}${monthAbbr}${day}`;
}

async function verifyTicker(prefix: string, testDate: Date): Promise<boolean> {
  const ticker = buildTestTicker(prefix, testDate);
  const url = `${KALSHI_BASE_URL}/markets/${ticker}`;
  try {
    const res = await fetchWithRetry(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

// ============================================================================
// Main audit
// ============================================================================

async function main(): Promise<void> {
  console.log('🔬 Kalshi Market Auditor');
  console.log('========================');
  console.log(`API Key: ${KALSHI_API_KEY.slice(0, 8)}...`);
  console.log(`Base URL: ${KALSHI_BASE_URL}`);

  const outputDir = join(process.cwd(), 'audit-output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = today.toISOString().slice(0, 10);

  // ── Step 1: Get all KXHIGH events ──────────────────────────────────────────
  const events = await fetchKXHIGHEvents();

  // Extract unique ticker prefixes from events
  const tickersFromAPI = new Set<string>();
  for (const event of events) {
    const ev = event as Record<string, unknown>;
    const ticker = (ev.event_ticker || ev.series_ticker || '') as string;
    if (ticker) tickersFromAPI.add(ticker);
    // Also look at markets within events
    if (Array.isArray(ev.markets)) {
      for (const mkt of ev.markets as Array<Record<string, unknown>>) {
        const mt = (mkt.ticker || '') as string;
        if (mt) {
          // Extract prefix (before date suffix)
          const match = mt.match(/^(KXHIGH[A-Z]+)-/);
          if (match) tickersFromAPI.add(match[1]);
        }
      }
    }
  }

  console.log('\n📋 Ticker prefixes found in API:');
  for (const t of [...tickersFromAPI].sort()) {
    console.log(`  ${t}`);
  }

  // ── Step 2: Probe market price fields (use NY as canonical sample) ─────────
  const nyTicker = buildTestTicker('KXHIGHNY', tomorrow);
  const { priceFields, allFields, rawMarket } = await probeMarketFields(nyTicker);

  console.log('\n💰 Price-related fields in market response:');
  for (const [k, v] of Object.entries(priceFields)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('\n📦 All market fields:', allFields.join(', '));

  // ── Step 3: Verify each city's ticker ──────────────────────────────────────
  console.log('\n🏙️  Verifying city tickers...');
  const verificationResults: Array<{
    city: string;
    expectedTicker: string;
    found: boolean;
    altFound?: string;
  }> = [];

  for (const entry of EXPECTED_CITIES) {
    process.stdout.write(`  ${entry.city} (${entry.ticker}): `);
    const found = await verifyTicker(entry.ticker, tomorrow);
    if (found) {
      console.log('✅');
      verificationResults.push({ city: entry.city, expectedTicker: entry.ticker, found: true });
    } else {
      // Try alternate format (with T inserted)
      const altTicker = entry.ticker.replace('KXHIGH', 'KXHIGHT');
      const altFound = await verifyTicker(altTicker, tomorrow);
      if (altFound) {
        console.log(`❌ → ✅ (correct: ${altTicker})`);
        verificationResults.push({
          city: entry.city,
          expectedTicker: entry.ticker,
          found: false,
          altFound: altTicker,
        });
      } else {
        // Try inverse
        const altTicker2 = entry.ticker.replace('KXHIGHT', 'KXHIGH');
        const altFound2 = await verifyTicker(altTicker2, tomorrow);
        if (altFound2) {
          console.log(`❌ → ✅ (correct: ${altTicker2})`);
          verificationResults.push({
            city: entry.city,
            expectedTicker: entry.ticker,
            found: false,
            altFound: altTicker2,
          });
        } else {
          console.log('❌ (not found for tomorrow — may be today date)');
          verificationResults.push({ city: entry.city, expectedTicker: entry.ticker, found: false });
        }
      }
    }
    await sleep(200); // Rate limit buffer
  }

  // ── Step 4: Save audit results ─────────────────────────────────────────────
  const auditOutput = {
    auditedAt: new Date().toISOString(),
    apiBase: KALSHI_BASE_URL,
    kxhighTickersFromAPI: [...tickersFromAPI].sort(),
    priceFieldsFromMarket: priceFields,
    allMarketFields: allFields,
    sampleMarket: rawMarket,
    cityVerification: verificationResults,
  };

  const auditFile = join(outputDir, `kalshi-market-audit-${dateStr}.json`);
  writeFileSync(auditFile, JSON.stringify(auditOutput, null, 2));
  console.log(`\n✅ Audit saved to: ${auditFile}`);

  // ── Step 5: Print patch summary ───────────────────────────────────────────
  const discrepancies = verificationResults.filter(r => !r.found && r.altFound);
  const notFound = verificationResults.filter(r => !r.found && !r.altFound);
  const confirmed = verificationResults.filter(r => r.found);

  console.log('\n📊 Summary:');
  console.log(`  ✅ Confirmed: ${confirmed.length}`);
  console.log(`  ⚠️  Ticker mismatch (corrected): ${discrepancies.length}`);
  console.log(`  ❌ Not found: ${notFound.length}`);

  if (discrepancies.length > 0) {
    console.log('\n⚠️  TICKER PATCHES NEEDED in city-registry.ts:');
    for (const d of discrepancies) {
      console.log(`  ${d.city}: change ${d.expectedTicker} → ${d.altFound}`);
    }
  }

  // ── Step 6: Print confirmed price field usage ─────────────────────────────
  console.log('\n💰 CONFIRMED PRICE FIELDS (for fetchKalshiMarketPrice):');
  const pf = priceFields;
  if ('yes_ask' in pf) console.log('  Use: market.yes_ask (cents)');
  if ('yes_ask_dollars' in pf) console.log('  Use: market.yes_ask_dollars (dollars — no /100 needed)');
  if ('last_price' in pf) console.log('  Use: market.last_price (cents)');
  if ('yes_bid' in pf) console.log('  Use: market.yes_bid (cents)');
  console.log('  (Run this script to see live values and update fetchKalshiMarketPrice accordingly)');

  console.log('\n🏁 Audit complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
