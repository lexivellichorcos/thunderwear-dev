// validate-kalshi-key — Supabase Edge Function
// Author: Livvy Rose
// Date: 2026-04-14
// Spec: tw-alpha-multi-tenant-spec-2026-04-14-UPDATED.md §3 + §5 + §H4
//
// Flow:
//   1. Authenticate user (JWT required)
//   2. Validate inputs (key_id + private key PEM)
//   3. Call Kalshi /portfolio/balance (HTTPS hardcoded — HIGH-1)
//   4. Encrypt private key with per-tenant HKDF + AES-256-GCM (HIGH-4, Muz decision)
//   5. Upsert profiles row (idempotent — HIGH-3)
//   6. Return balance or error
//
// Security invariants:
//   - HTTPS only: base URL is hardcoded, never from env or request body
//   - Key is never returned to client after storage
//   - Per-tenant key derivation: tenant_key = HKDF(master_key, tenant_id)
//   - Encryption fails loud (500) — never silently stores plaintext
//   - Idempotent: re-run safe, re-encrypts and overwrites
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptCredential, decodeMasterKey } from '../_shared/crypto.ts';
// ── SECURITY: hardcoded HTTPS base. Never from env. (HIGH-1) ─────────────────
const KALSHI_BASE = 'https://api.elections.kalshi.com';
// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// Master key is fetched from Supabase Vault at request time (not env var)
// See: setup-vault-master-key.sql for one-time Vault setup
// ── Per-tenant encryption is now in _shared/crypto.ts (HIGH-4, Muz decision) ──
// encryptCredential(plaintext, tenantId, masterKey) → base64(iv + ciphertext+tag)
// decryptCredential(encrypted, tenantId, masterKey) → plaintext
// ── Kalshi RSA-PSS signature (required by Kalshi API v2) ─────────────────────
// Signs: timestamp (ms) + method + path
// Returns: base64url signature
async function signKalshiRequest(privateKeyPem, method, path) {
  const timestamp = String(Date.now());
  const message = timestamp + method.toUpperCase() + path;
  // Import RSA private key
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
  // base64url encode (Kalshi expects base64url)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  const signature = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return {
    signature,
    timestamp
  };
}
// ── Call Kalshi /portfolio/balance to verify credentials ─────────────────────
// Returns: { ok: true, balance_cents: number } | { ok: false, error: string }
async function verifyKalshiCredentials(keyId, privateKeyPem) {
  const method = 'GET';
  const path = '/trade-api/v2/portfolio/balance';
  let sig;
  try {
    sig = await signKalshiRequest(privateKeyPem, method, path);
  } catch (e) {
    console.error('Signature generation failed:', e);
    return {
      ok: false,
      error: 'signature_error'
    };
  }
  let res;
  try {
    // HIGH-1: HTTPS hardcoded above — KALSHI_BASE is never overridable
    res = await fetch(`${KALSHI_BASE}${path}`, {
      method,
      headers: {
        'KALSHI-ACCESS-KEY': keyId,
        'KALSHI-ACCESS-TIMESTAMP': sig.timestamp,
        'KALSHI-ACCESS-SIGNATURE': sig.signature,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    console.error('Kalshi fetch failed (network):', e);
    return {
      ok: false,
      error: 'network_error'
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: 'invalid_credentials'
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(()=>'');
    console.error(`Kalshi API error ${res.status}:`, body.slice(0, 200));
    return {
      ok: false,
      error: `kalshi_error_${res.status}`
    };
  }
  let data;
  try {
    data = await res.json();
  } catch  {
    return {
      ok: false,
      error: 'invalid_response'
    };
  }
  // Kalshi balance response: { balance: number } (in cents)
  const balance_cents = typeof data.balance === 'number' ? data.balance : 0;
  return {
    ok: true,
    balance_cents
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
  // ── Auth: require JWT ───────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({
      ok: false,
      error: 'unauthorized'
    }, 401);
  }
  const userJwt = authHeader.slice(7);
  // Create Supabase client with user JWT to get their auth.uid()
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
  // ── Parse body ──────────────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch  {
    return json({
      ok: false,
      error: 'invalid_json'
    }, 400);
  }
  const { kalshi_key_id, kalshi_api_key } = body;
  if (!kalshi_key_id || typeof kalshi_key_id !== 'string' || kalshi_key_id.trim() === '') {
    return json({
      ok: false,
      error: 'missing_key_id'
    }, 400);
  }
  if (!kalshi_api_key || typeof kalshi_api_key !== 'string' || !kalshi_api_key.includes('PRIVATE KEY')) {
    return json({
      ok: false,
      error: 'missing_or_invalid_private_key'
    }, 400);
  }
  // ── Fetch master key from Supabase Vault (HIGH-4, Muz decision) ────────────
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: vaultRow, error: vaultError } = await supabaseAdmin.from('vault.decrypted_secrets').select('decrypted_secret').eq('name', 'tw_master_key').single();
  if (vaultError || !vaultRow?.decrypted_secret) {
    console.error('Failed to fetch master key from Vault:', vaultError);
    return json({
      ok: false,
      error: 'encryption_not_configured'
    }, 500);
  }
  // ── Verify with Kalshi API ──────────────────────────────────────────────────
  const verification = await verifyKalshiCredentials(kalshi_key_id.trim(), kalshi_api_key.trim());
  if (!verification.ok) {
    return json({
      ok: false,
      error: verification.error
    }, 400);
  }
  // ── Encrypt key with per-tenant HKDF derivation (HIGH-4, Muz decision) ──────
  let encrypted;
  try {
    const masterKey = decodeMasterKey(vaultRow.decrypted_secret);
    encrypted = await encryptCredential(kalshi_api_key.trim(), userId, masterKey);
  } catch (e) {
    console.error('Encryption failed:', e);
    return json({
      ok: false,
      error: 'encryption_error'
    }, 500);
  }
  // ── Upsert profile (HIGH-3: idempotent — ON CONFLICT DO UPDATE) ─────────────
  // supabaseAdmin already created above for Vault query
  const { error: upsertError } = await supabaseAdmin.from('profiles').upsert({
    id: userId,
    kalshi_api_key_encrypted: encrypted,
    kalshi_connected: true,
    kalshi_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'id'
  });
  if (upsertError) {
    console.error('Profile upsert failed:', upsertError);
    return json({
      ok: false,
      error: 'db_error'
    }, 500);
  }
  // Success — return balance only, NEVER return key material
  return json({
    ok: true,
    balance_cents: verification.balance_cents
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
