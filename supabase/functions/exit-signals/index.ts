/**
 * exit-signals — Supabase Edge Function
 *
 * READ endpoint — queries the `exit_signals` table and returns active
 * exit signals in the format Alpha.tsx expects.
 *
 * Replaces the old stub that returned: {"signals":[],"note":"Exit engine pending re-enable"}
 *
 * Response shape:
 *   {
 *     signals: Array<{
 *       id: number,
 *       position_id: number,
 *       market_token: string,
 *       side: string,
 *       entry_price: number | null,
 *       current_price: number | null,
 *       quantity: number,
 *       pnl_dollars: number | null,
 *       pnl_pct: number | null,
 *       profit_capture_pct: number | null,
 *       trigger_rule: string,
 *       trigger_detail: string,
 *       hours_to_settlement: number | null,
 *       price_source: string,
 *       created_at: string
 *     }>,
 *     last_updated: string | null,
 *     count: number
 *   }
 *
 * ⚠️  Exit engine paused per Muz directive — the exit-scan writer is
 *     inactive, so this will typically return an empty array until trading
 *     resumes. The data shape is live-ready for when it re-enables.
 *
 * Data is written by the `exit-scan` edge function (pg_cron entry
 * commented out pending trading resumption).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

// ── CORS ──────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── POST: Generate exit signals from open positions ────────────────────────
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const dryRun = body.dry_run === true;

      // Fetch open positions
      const { data: positions, error: posError } = await supabase
        .from("positions_real")
        .select("id, user_id, market_ticker, side, entry_price, contracts")
      ;

      if (posError) {
        console.error(`[exit-signals] Positions query error: ${posError.message}`);
        return new Response(
          JSON.stringify({ error: "Positions query failed", detail: posError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const triggeredExits: any[] = [];

      for (const pos of (positions ?? []) as any[]) {
        // Look up ATR exit prices from tail_opportunities
        const { data: opp } = await supabase
          .from("tail_opportunities")
          .select("stop_loss_price, take_profit_price, prob_atr, market_price")
          .eq("ticker", pos.market_ticker)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!opp || opp.stop_loss_price == null || opp.take_profit_price == null) continue;

        // Current market price — from tail_opportunities or market_prices
        const currentPrice = opp.market_price;
        if (currentPrice == null) continue;

        let exitTrigger: string | null = null;
        let triggerPrice: number | null = null;

        // Check stop loss: if YES position and price dropped below stop_loss
        if (pos.side === "yes" && currentPrice <= opp.stop_loss_price) {
          exitTrigger = "stop_loss";
          triggerPrice = opp.stop_loss_price;
        }
        // Check take profit: if YES position and price rose above take_profit
        else if (pos.side === "yes" && currentPrice >= opp.take_profit_price) {
          exitTrigger = "take_profit";
          triggerPrice = opp.take_profit_price;
        }
        // NO side: inverse logic
        else if (pos.side === "no" && currentPrice >= (1 - opp.stop_loss_price)) {
          exitTrigger = "stop_loss";
          triggerPrice = opp.stop_loss_price;
        }
        else if (pos.side === "no" && currentPrice <= (1 - opp.take_profit_price)) {
          exitTrigger = "take_profit";
          triggerPrice = opp.take_profit_price;
        }

        if (!exitTrigger) continue;

        // Compute PnL for context
        const entryPrice = pos.entry_price ?? 0;
        const pnlDollars = pos.side === "yes"
          ? (currentPrice - entryPrice) * (pos.contracts ?? 1)
          : (entryPrice - currentPrice) * (pos.contracts ?? 1);
        const pnlPct = entryPrice > 0 ? (pnlDollars / entryPrice) * 100 : 0;

        const signalRow = {
          position_id: pos.id,
          market_token: pos.market_ticker,
          side: pos.side,
          entry_price: entryPrice,
          current_price: currentPrice,
          quantity: pos.contracts ?? 1,
          pnl_dollars: +pnlDollars.toFixed(2),
          pnl_pct: +pnlPct.toFixed(2),
          trigger_rule: exitTrigger === "stop_loss" ? "STOP_LOSS" : "PROFIT_LOCK_90",
          trigger_detail: `ATR ${exitTrigger}: price ${currentPrice.toFixed(4)} crossed ${exitTrigger === "stop_loss" ? opp.stop_loss_price.toFixed(4) : opp.take_profit_price.toFixed(4)}`,
          exit_trigger: exitTrigger,
          trigger_price: triggerPrice,
          prob_atr: opp.prob_atr,
          hours_to_settlement: null, // populated by future time-decay logic
          price_source: "tail_opportunities",
        };

        if (!dryRun) {
          const { error: insertErr } = await supabase
            .from("exit_signals")
            .upsert(signalRow, { onConflict: 'position_id,exit_trigger', ignoreDuplicates: true });
          if (insertErr) {
            console.error(`[exit-signals] Insert failed for ${pos.market_ticker}: ${insertErr.message}`);
            continue;
          }
        }

        triggeredExits.push(signalRow);
      }

      return new Response(JSON.stringify({
        triggered_exits: triggeredExits,
        count: triggeredExits.length,
        dry_run: dryRun,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET: Return existing exit signals ──────────────────────────────────────

    // Return signals from the last 24 hours — prevents stale signals showing
    // up indefinitely. Ordered by trigger priority (STOP_LOSS first), then by
    // most recent.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: signals, error: queryError } = await supabase
      .from("exit_signals")
      .select(
        "id, position_id, market_token, side, entry_price, current_price, quantity, " +
        "pnl_dollars, pnl_pct, profit_capture_pct, trigger_rule, trigger_detail, " +
        "hours_to_settlement, price_source, created_at"
      )
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(200);

    if (queryError) {
      console.error(`[exit-signals] Query error: ${queryError.message}`);
      return new Response(
        JSON.stringify({ error: "Query failed", detail: queryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rows = signals ?? [];

    // Sort: STOP_LOSS first, then profit locks by tier descending
    const ruleOrder: Record<string, number> = {
      STOP_LOSS:       0,
      PROFIT_LOCK_90:  1,
      PROFIT_LOCK_65:  2,
      PROFIT_LOCK_40:  3,
    };
    rows.sort((a: any, b: any) => {
      const ra = ruleOrder[a.trigger_rule] ?? 9;
      const rb = ruleOrder[b.trigger_rule] ?? 9;
      return ra - rb;
    });

    // last_updated = most recent created_at in the result set
    const lastUpdated = rows.length > 0
      ? (rows[0] as any).created_at ?? null
      : null;

    return new Response(
      JSON.stringify({
        signals: rows,
        last_updated: lastUpdated,
        count: rows.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[exit-signals] Fatal error: ${msg}`);
    return new Response(
      JSON.stringify({ error: "Fatal error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
