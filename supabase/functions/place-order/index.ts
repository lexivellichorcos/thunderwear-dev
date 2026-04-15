// place-order — Supabase Edge Function
// Author: Livvy Rose
// Date: 2026-04-15
// Spec: tw-alpha-multi-tenant-spec-2026-04-14-UPDATED.md §Step2
//
// Flow:
//   1. Authenticate user (JWT required)
//   2. Validate inputs (market_ticker, side, contracts, price_cents)
//   3. Fetch encrypted Kalshi key from profiles
//   4. Decrypt using per-tenant HKDF key (master from Vault)
//   5. Generate idempotency key
//   6. Call Kalshi POST /portfolio/orders
//   7. Write to trade_log (upsert ON CONFLICT idempotency_key DO NOTHING)
//   8. Return order result
//
// Error handling:
//   - 429 rate limit → { ok: false, error: 'RATE_LIMITED', retry_after } — never throws
//   - All other errors → graceful JSON responses
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptCredential, decodeMasterKey } from '../_shared/crypto.ts';
// ── SECURITY: hardcoded HTTPS base. Never from env or request body. ───────────
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
  // ── Parse + validate body ───────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch  {
    return json({
      ok: false,
      error: 'invalid_json'
    }, 400);
  }
  const { market_ticker, side, action, contracts, price_cents, idempotency_key: callerIdempotencyKey } = body;
  if (!market_ticker || typeof market_ticker !== 'string') {
    return json({
      ok: false,
      error: 'missing_market_ticker'
    }, 400);
  }
  if (side !== 'yes' && side !== 'no') {
    return json({
      ok: false,
      error: 'invalid_side_must_be_yes_or_no'
    }, 400);
  }
  if (action !== 'buy' && action !== 'sell') {
    return json({
      ok: false,
      error: 'invalid_action_must_be_buy_or_sell'
    }, 400);
  }
  if (!Number.isInteger(contracts) || contracts <= 0) {
    return json({
      ok: false,
      error: 'invalid_contracts_must_be_positive_integer'
    }, 400);
  }
  if (!Number.isInteger(price_cents) || price_cents <= 0 || price_cents > 100) {
    return json({
      ok: false,
      error: 'invalid_price_cents_must_be_1_to_100'
    }, 400);
  }
  // ── Fetch encrypted Kalshi key from profiles ────────────────────────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('kalshi_api_key_encrypted, kalshi_key_id').eq('id', userId).single();
  if (profileError || !profile?.kalshi_api_key_encrypted) {
    return json({
      ok: false,
      error: 'kalshi_not_connected'
    }, 400);
  }
  // Also need key_id — check if it's stored or we need a different approach
  // Kalshi requires key_id for auth headers. It should be stored in profiles.
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
  // ── Idempotency key: use caller-provided or generate ────────────────────────
  const idempotencyKey = callerIdempotencyKey || crypto.randomUUID();
  // ── Pre-insert to trade_log as 'pending' (idempotency guard) ────────────────
  try {
    const { error: preInsertError } = await supabaseAdmin.from('trade_log').insert({
      user_id: userId,
      market_ticker: market_ticker,
      side,
      action,
      contracts,
      price_cents: price_cents,
      idempotency_key: idempotencyKey,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    if (preInsertError) {
      // Unique violation means duplicate idempotency_key — already processed or in-flight
      if (preInsertError.code === '23505') {
        return json({
          ok: false,
          error: 'duplicate_idempotency_key',
          idempotency_key: idempotencyKey
        }, 409);
      }
      console.error('Pre-insert failed:', preInsertError);
    }
  } catch (e) {
    console.error('Pre-insert exception:', e);
  }
  // ── Call Kalshi trading API ─────────────────────────────────────────────────
  const method = 'POST';
  const path = '/trade-api/v2/portfolio/orders';
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
  const orderPayload = {
    ticker: market_ticker,
    side: side,
    action: action,
    count: contracts,
    yes_price: side === 'yes' ? price_cents : undefined,
    no_price: side === 'no' ? price_cents : undefined,
    type: 'limit',
    expiration_ts: 0,
    client_order_id: idempotencyKey
  };
  let kalshiRes;
  try {
    kalshiRes = await fetch(`${KALSHI_BASE}${path}`, {
      method,
      headers: {
        'KALSHI-ACCESS-KEY': keyId,
        'KALSHI-ACCESS-TIMESTAMP': sig.timestamp,
        'KALSHI-ACCESS-SIGNATURE': sig.signature,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });
  } catch (e) {
    console.error('Kalshi fetch failed (network):', e);
    // Update trade_log to failed
    await logTrade(supabaseAdmin, userId, market_ticker, side, action, contracts, price_cents, idempotencyKey, 'network_error', null);
    return json({
      ok: false,
      error: 'network_error'
    }, 502);
  }
  // ── Handle 409 conflict — order may already exist (N2 fix) ────────────────
  // Kalshi v2 client_order_id is REJECT-based: 409 means a prior request with
  // the same client_order_id was already received. Fetch current order state
  // instead of treating this as a hard error.
  if (kalshiRes.status === 409) {
    const kalshiHeaders = {
      'KALSHI-ACCESS-KEY': keyId,
      'KALSHI-ACCESS-TIMESTAMP': sig.timestamp,
      'KALSHI-ACCESS-SIGNATURE': sig.signature,
      'Content-Type': 'application/json'
    };
    const orderLookup = await fetch(`${KALSHI_BASE}/trade-api/v2/portfolio/orders?client_order_id=${idempotencyKey}`, {
      headers: kalshiHeaders
    });
    const existingOrder = await orderLookup.json();
    const orderStatus = existingOrder.orders?.[0]?.status === 'executed' ? 'filled' : 'pending';
    await supabaseAdmin.from('trade_log').update({
      status: orderStatus,
      kalshi_response: existingOrder
    }).eq('idempotency_key', idempotencyKey);
    return new Response(JSON.stringify({
      ok: true,
      deduplicated: true,
      order: existingOrder.orders?.[0]
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
      }
    });
  }
  // ── Handle 429 rate limit — never throw ─────────────────────────────────────
  if (kalshiRes.status === 429) {
    const retryAfter = kalshiRes.headers.get('Retry-After') ? parseInt(kalshiRes.headers.get('Retry-After'), 10) : 5;
    await logTrade(supabaseAdmin, userId, market_ticker, side, action, contracts, price_cents, idempotencyKey, 'rate_limited', null);
    return json({
      ok: false,
      error: 'RATE_LIMITED',
      retry_after: retryAfter
    }, 429);
  }
  let kalshiData;
  try {
    kalshiData = await kalshiRes.json();
  } catch  {
    kalshiData = {};
  }
  // ── Handle other Kalshi errors ──────────────────────────────────────────────
  if (!kalshiRes.ok) {
    const errMsg = typeof kalshiData === 'object' && kalshiData.message ? String(kalshiData.message) : `kalshi_error_${kalshiRes.status}`;
    await logTrade(supabaseAdmin, userId, market_ticker, side, action, contracts, price_cents, idempotencyKey, 'failed', kalshiData);
    return json({
      ok: false,
      error: errMsg,
      kalshi_status: kalshiRes.status
    }, 502);
  }
  // ── Success — log to trade_log ──────────────────────────────────────────────
  const orderId = typeof kalshiData.order_id === 'string' ? kalshiData.order_id : null;
  await logTrade(supabaseAdmin, userId, market_ticker, side, action, contracts, price_cents, idempotencyKey, 'filled', kalshiData, orderId);
  return json({
    ok: true,
    order_id: orderId,
    kalshi_response: kalshiData
  });
});
// ── Helpers ───────────────────────────────────────────────────────────────────
async function logTrade(supabase, userId, marketTicker, side, action, contracts, priceCents, idempotencyKey, status, kalshiResponse, orderId) {
  try {
    await supabase.from('trade_log').upsert({
      user_id: userId,
      market_ticker: marketTicker,
      side,
      action,
      contracts,
      price_cents: priceCents,
      idempotency_key: idempotencyKey,
      status,
      kalshi_response: kalshiResponse,
      order_id: orderId ?? undefined,
      created_at: new Date().toISOString()
    }, {
      onConflict: 'idempotency_key'
    });
  } catch (e) {
    console.error('Failed to log trade:', e);
  // Never throw — logging failure must not crash the function
  }
}
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
