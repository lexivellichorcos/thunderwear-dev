// sync-positions — Supabase Edge Function
// Author: Livvy Rose
// Date: 2026-04-15
// Spec: tw-alpha-multi-tenant-spec-2026-04-14-UPDATED.md §Step2
//
// Flow:
//   1. Authenticate user (JWT required)
//   2. Fetch encrypted Kalshi key from profiles
//   3. Decrypt using per-tenant HKDF key (master from Vault)
//   4. Call Kalshi GET /portfolio/positions
//   5. Upsert results into positions_real (ON CONFLICT user_id, market_ticker DO UPDATE)
//   6. Update bankroll_state with current balance
//   7. Handle 429 gracefully — log to trade_log, return without throwing
//
// Can also be triggered via cron for all connected users (future: pass user_id=null)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptCredential, decodeMasterKey } from '../_shared/crypto.ts';
// ── SECURITY: hardcoded HTTPS base ────────────────────────────────────────────
const KALSHI_BASE = 'https://api.elections.kalshi.com';
// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// ── Kalshi RSA-PSS signature ─────────────────────────────────────────────────
async function signKalshiRequest(privateKeyPem, method, path) {
  const timestamp = String(Date.now());
  const message = timestamp + method.toUpperCase() + path;
  const pemBody = privateKeyPem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, '').replace(/-----END (?:RSA )?PRIVATE KEY-----/, '').replace(/\s/g, '');
  const keyBuffer = Uint8Array.from(atob(pemBody), (c)=>c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyBuffer, {
    name: 'RSA-PSS',
    hash: 'SHA-256'
  }, false, [
    'sign'
  ]);
  const sigBuffer = await crypto.subtle.sign({
    name: 'RSA-PSS',
    saltLength: 32
  }, cryptoKey, new TextEncoder().encode(message));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  const signature = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return {
    signature,
    timestamp
  };
}
// ── Fetch balance from Kalshi ─────────────────────────────────────────────────
async function fetchBalance(keyId, privateKeyPem) {
  const method = 'GET';
  const path = '/trade-api/v2/portfolio/balance';
  let sig;
  try {
    sig = await signKalshiRequest(privateKeyPem, method, path);
  } catch (e) {
    console.error('Balance signature failed:', e);
    return {
      ok: false,
      error: 'signature_error'
    };
  }
  try {
    const res = await fetch(`${KALSHI_BASE}${path}`, {
      method,
      headers: {
        'KALSHI-ACCESS-KEY': keyId,
        'KALSHI-ACCESS-TIMESTAMP': sig.timestamp,
        'KALSHI-ACCESS-SIGNATURE': sig.signature,
        'Content-Type': 'application/json'
      }
    });
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') ? parseInt(res.headers.get('Retry-After'), 10) : 5;
      return {
        ok: false,
        error: `RATE_LIMITED:${retryAfter}`
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `kalshi_error_${res.status}`
      };
    }
    const data = await res.json();
    return {
      ok: true,
      balance_cents: typeof data.balance === 'number' ? data.balance : 0
    };
  } catch (e) {
    console.error('Balance fetch failed:', e);
    return {
      ok: false,
      error: 'network_error'
    };
  }
}
// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req)=>{
  // H1: Defense-in-depth HTTPS enforcement
  const proto = req.headers.get('x-forwarded-proto');
  if (proto && proto !== 'https') {
    return new Response(JSON.stringify({ error: 'HTTPS_REQUIRED' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    });
  }
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
      }
    });
  }
  if (req.method !== 'POST') {
    return json({
      ok: false,
      error: 'method_not_allowed'
    }, 405);
  }
  // ── Auth: validate JWT ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({
      ok: false,
      error: 'unauthorized'
    }, 401);
  }
  const userJwt = authHeader.slice(7);
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`
      }
    }
  });
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return json({
      ok: false,
      error: 'unauthorized'
    }, 401);
  }
  const userId = user.id;
  // ── Fetch encrypted Kalshi key ──────────────────────────────────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('kalshi_api_key_encrypted, kalshi_key_id').eq('id', userId).single();
  if (profileError || !profile?.kalshi_api_key_encrypted) {
    return json({
      ok: false,
      error: 'kalshi_not_connected'
    }, 400);
  }
  const keyId = profile.kalshi_key_id;
  if (!keyId) {
    return json({
      ok: false,
      error: 'kalshi_key_id_missing'
    }, 400);
  }
  // ── Fetch master key from Vault ─────────────────────────────────────────────
  const { data: vaultRow, error: vaultError } = await supabaseAdmin.from('vault.decrypted_secrets').select('decrypted_secret').eq('name', 'tw_master_key').single();
  if (vaultError || !vaultRow?.decrypted_secret) {
    console.error('Failed to fetch master key from Vault:', vaultError);
    return json({
      ok: false,
      error: 'encryption_not_configured'
    }, 500);
  }
  // ── Decrypt Kalshi private key ──────────────────────────────────────────────
  let privateKeyPem;
  try {
    const masterKey = decodeMasterKey(vaultRow.decrypted_secret);
    privateKeyPem = await decryptCredential(profile.kalshi_api_key_encrypted, userId, masterKey);
  } catch (e) {
    console.error('Decryption failed:', e);
    return json({
      ok: false,
      error: 'decryption_error'
    }, 500);
  }
  // ── Call Kalshi GET /portfolio/positions ────────────────────────────────────
  const method = 'GET';
  const path = '/trade-api/v2/portfolio/positions';
  let sig;
  try {
    sig = await signKalshiRequest(privateKeyPem, method, path);
  } catch (e) {
    console.error('Signature generation failed:', e);
    return json({
      ok: false,
      error: 'signature_error'
    }, 500);
  }
  let kalshiRes;
  try {
    kalshiRes = await fetch(`${KALSHI_BASE}${path}`, {
      method,
      headers: {
        'KALSHI-ACCESS-KEY': keyId,
        'KALSHI-ACCESS-TIMESTAMP': sig.timestamp,
        'KALSHI-ACCESS-SIGNATURE': sig.signature,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    console.error('Kalshi positions fetch failed (network):', e);
    return json({
      ok: false,
      error: 'network_error'
    }, 502);
  }
  // ── Handle 429 — back off, log, return gracefully ───────────────────────────
  if (kalshiRes.status === 429) {
    const retryAfter = kalshiRes.headers.get('Retry-After') ? parseInt(kalshiRes.headers.get('Retry-After'), 10) : 5;
    // Log rate limit event to trade_log
    try {
      await supabaseAdmin.from('trade_log').insert({
        user_id: userId,
        market_ticker: '__sync_positions__',
        contracts: 0,
        price_cents: 0,
        idempotency_key: crypto.randomUUID(),
        status: 'rate_limited',
        kalshi_response: {
          endpoint: 'positions',
          retry_after: retryAfter
        }
      });
    } catch  {}
    return json({
      ok: false,
      error: 'RATE_LIMITED',
      retry_after: retryAfter
    }, 429);
  }
  if (!kalshiRes.ok) {
    const body = await kalshiRes.text().catch(()=>'');
    console.error(`Kalshi positions error ${kalshiRes.status}:`, body.slice(0, 200));
    return json({
      ok: false,
      error: `kalshi_error_${kalshiRes.status}`
    }, 502);
  }
  let kalshiData;
  try {
    kalshiData = await kalshiRes.json();
  } catch  {
    return json({
      ok: false,
      error: 'invalid_kalshi_response'
    }, 502);
  }
  const positions = kalshiData.market_positions ?? [];
  // ── Upsert into positions_real ──────────────────────────────────────────────
  if (positions.length > 0) {
    const rows = positions.map((p)=>({
        user_id: userId,
        market_ticker: String(p.ticker ?? ''),
        side: parseFloat(String(p.position_fp ?? '0')) >= 0 ? 'yes' : 'no',
        contracts: Math.abs(parseFloat(String(p.position_fp ?? '0'))),
        avg_price: 0,
        cur_price: 0,
        pnl_cents: Math.round(parseFloat(String(p.realized_pnl_dollars ?? '0')) * 100),
        updated_at: new Date().toISOString()
      }));
    const { error: upsertError } = await supabaseAdmin.from('positions_real').upsert(rows, {
      onConflict: 'user_id,market_ticker'
    });
    if (upsertError) {
      console.error('positions_real upsert failed:', upsertError);
    // Continue — balance update still valuable
    }
  }
  // ── Update bankroll_state with current balance ──────────────────────────────
  const balanceResult = await fetchBalance(keyId, privateKeyPem);
  if (balanceResult.ok) {
    const { error: bankrollError } = await supabaseAdmin.from('bankroll_state').upsert({
      user_id: userId,
      balance_cents: balanceResult.balance_cents,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });
    if (bankrollError) {
      console.error('bankroll_state upsert failed:', bankrollError);
    }
  }
  return json({
    ok: true,
    positions_synced: positions.length,
    balance_cents: balanceResult.ok ? balanceResult.balance_cents : null
  });
});
// ── Helpers ───────────────────────────────────────────────────────────────────
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
    }
  });
}
