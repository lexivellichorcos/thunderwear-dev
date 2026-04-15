// queue-processor: Cron-triggered edge function (every 30s)
// Claims next pending job from sync_queue atomically via claim_next_job() RPC
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BASE_URL = `${SUPABASE_URL}/functions/v1`;
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
  if (authHeader && authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Claim next pending job atomically via RPC (FOR UPDATE SKIP LOCKED)
  const { data: jobData, error: claimErr } = await supabase.rpc("claim_next_job");
  // data will be an array — take first element
  const job = Array.isArray(jobData) ? jobData[0] : null;
  if (claimErr || !job) {
    return new Response(JSON.stringify({
      idle: true,
      message: "No pending jobs"
    }), {
      headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  }
  try {
    // Route by job_type
    switch(job.job_type){
      case "price_sync":
        {
          const res = await fetch(`${BASE_URL}/price-sync`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({})
          });
          if (!res.ok) throw new Error(`price-sync returned ${res.status}`);
          break;
        }
      case "position_sync":
        {
          const res = await fetch(`${BASE_URL}/sync-positions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(job.payload)
          });
          if (!res.ok) throw new Error(`sync-positions returned ${res.status}`);
          break;
        }
      case "order_submit":
        {
          const res = await fetch(`${BASE_URL}/place-order`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(job.payload)
          });
          if (!res.ok) throw new Error(`place-order returned ${res.status}`);
          break;
        }
      default:
        throw new Error(`Unknown job_type: ${job.job_type}`);
    }
    // Success
    await supabase.from("sync_queue").update({
      status: "completed",
      completed_at: new Date().toISOString()
    }).eq("id", job.id);
    return new Response(JSON.stringify({
      completed: job.id,
      job_type: job.job_type
    }), {
      headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts; // already incremented by claim_next_job
    if (attempts < job.max_attempts) {
      // Exponential backoff via process_after timestamp (no in-process sleep)
      const processAfter = new Date(Date.now() + Math.pow(2, attempts) * 1000).toISOString();
      await supabase.from("sync_queue").update({
        status: "pending",
        process_after: processAfter,
        last_error: message,
        started_at: null
      }).eq("id", job.id);
    } else {
      await supabase.from("sync_queue").update({
        status: "failed",
        last_error: message
      }).eq("id", job.id);
    }
    return new Response(JSON.stringify({
      error: message,
      job_id: job.id,
      attempts
    }), {
      status: 500,
      headers: { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  }
});
