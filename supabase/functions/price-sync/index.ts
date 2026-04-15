// price-sync: Cron-triggered edge function (every 5 min)
// Fetches weather market prices from Kalshi and upserts into market_prices
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2/markets";
Deno.serve(async (req)=>{
  // H1: Defense-in-depth HTTPS enforcement
  const proto = req.headers.get('x-forwarded-proto');
  if (proto && proto !== 'https') {
    return new Response(JSON.stringify({ error: 'HTTPS_REQUIRED' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  }
  // Auth: service role only
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    // Also allow anonymous cron calls (pg_cron uses service role key in header)
    // If no auth header but called internally, allow for cron
    if (authHeader && authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
      });
    }
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);
  // Check for existing pending/processing price_sync job
  const { data: existing } = await supabase.from("sync_queue").select("id, status").eq("job_type", "price_sync").in("status", [
    "pending",
    "processing"
  ]).maybeSingle();
  let jobId;
  if (existing) {
    if (existing.status === "processing") {
      // Already being processed — skip
      return new Response(JSON.stringify({
        skipped: true,
        reason: "already_processing"
      }), {
        headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
      });
    }
    // pending — claim it
    jobId = existing.id;
  } else {
    // Insert a new price_sync job
    const { data: inserted, error: insertErr } = await supabase.from("sync_queue").insert({
      job_type: "price_sync", payload: {},
      status: "processing"
    }).select("id").single();
    if (insertErr && insertErr.code === "23505") {
      // Another instance already created this job — graceful skip
      return new Response(JSON.stringify({
        skipped: true,
        reason: "race_dedup"
      }), {
        status: 200,
        headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
      });
    }
    if (insertErr || !inserted) {
      return new Response(JSON.stringify({
        error: "Failed to create job",
        details: insertErr
      }), {
        status: 500,
        headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
      });
    }
    jobId = inserted.id;
  }
  // Mark as processing
  await supabase.from("sync_queue").update({
    status: "processing",
    started_at: new Date().toISOString()
  }).eq("id", jobId);
  try {
    // Fetch weather markets from Kalshi — query by series_ticker for each city
    // Public endpoint doesn't support category filter; must query per series
    const WEATHER_SERIES = [
      'KXHIGHNY','KXHIGHCHI','KXHIGHLAX','KXHIGHTHOU','KXHIGHTPHX',
      'KXHIGHPHIL','KXHIGHTSATX','KXHIGHTDAL','KXHIGHAUS','KXHIGHTSFO',
      'KXHIGHTSEA','KXHIGHDEN','KXHIGHTJAX','KXHIGHTNOLA','KXHIGHTATL',
      'KXHIGHKC','KXHIGHTMIA','KXHIGHTBOS','KXHIGHTMIN','KXHIGHTDET',
      'KXLOWNY','KXLOWCHI','KXLOWDEN','KXLOWMIA','KXLOWBOS','KXLOWMIN',
    ];
    const markets: Record<string, unknown>[] = [];
    for (const series of WEATHER_SERIES) {
      const url = `${KALSHI_API}?limit=50&status=open&series_ticker=${series}`;
      const response = await fetch(url);
      if (response.status === 429) {
        const { data: job } = await supabase.from("sync_queue").select("attempts, max_attempts").eq("id", jobId).single();
        const attempts = (job?.attempts ?? 0) + 1;
        await supabase.from("sync_queue").update({
          status: attempts >= (job?.max_attempts ?? 3) ? "failed" : "pending",
          attempts,
          last_error: "Kalshi 429 rate limit"
        }).eq("id", jobId);
        return new Response(JSON.stringify({ retried: true, attempts }), {
          status: 429,
          headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
        });
      }
      if (response.ok) {
        const data = await response.json();
        markets.push(...(data.markets ?? []));
      }
      // Small delay to avoid Kalshi rate limits (100 req/min)
      await new Promise(r => setTimeout(r, 600));
    }
    if (markets.length === 0) {
      await supabase.from("sync_queue").update({
        status: "completed",
        completed_at: new Date().toISOString()
      }).eq("id", jobId);
      return new Response(JSON.stringify({
        synced: 0,
        message: "No weather markets found"
      }), {
        headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
      });
    }
    // Upsert into market_prices
    const rows = markets.map((m)=>({
        ticker: m.ticker,
        yes_price: m.yes_bid !== undefined ? m.yes_bid : (m.yes_bid_dollars !== undefined ? Math.round(parseFloat(m.yes_bid_dollars) * 100) : (m.last_price_dollars !== undefined ? Math.round(parseFloat(m.last_price_dollars) * 100) : null)),
        no_price: m.no_bid_dollars !== undefined ? Math.round(parseFloat(m.no_bid_dollars) * 100) : null,
        volume: m.volume != null ? Math.round(parseFloat(String(m.volume))) : (m.open_interest_fp != null ? Math.round(parseFloat(String(m.open_interest_fp))) : null),
        open_interest: m.open_interest != null ? Math.round(parseFloat(String(m.open_interest))) : null,
        last_updated: new Date().toISOString()
      }));
    const { error: upsertErr } = await supabase.from("market_prices").upsert(rows, {
      onConflict: "ticker"
    });
    if (upsertErr) {
      throw new Error(`Upsert failed: ${upsertErr.message}`);
    }
    // Mark completed
    await supabase.from("sync_queue").update({
      status: "completed",
      completed_at: new Date().toISOString()
    }).eq("id", jobId);
    return new Response(JSON.stringify({
      synced: rows.length
    }), {
      headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { data: job } = await supabase.from("sync_queue").select("attempts, max_attempts").eq("id", jobId).single();
    const attempts = (job?.attempts ?? 0) + 1;
    if (attempts >= (job?.max_attempts ?? 3)) {
      await supabase.from("sync_queue").update({
        status: "failed",
        attempts,
        last_error: message
      }).eq("id", jobId);
    } else {
      await supabase.from("sync_queue").update({
        status: "pending",
        attempts,
        last_error: message
      }).eq("id", jobId);
    }
    return new Response(JSON.stringify({
      error: message,
      attempts
    }), {
      status: 500,
      headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  }
});
