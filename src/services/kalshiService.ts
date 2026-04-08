import { supabase } from "@/integrations/supabase/client";

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  open_interest: number;
  close_time: string;
  status: string;
  result?: string;
}

export interface KalshiPosition {
  ticker: string;
  position: number;
  market_exposure: number;
  realized_pnl: number;
  total_traded: number;
}

export interface KalshiBalance {
  balance: number;
  payout: number;
}

export interface KalshiOrder {
  order_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: 'market' | 'limit';
  count: number;
  price: number;
  status: string;
  created_time: string;
}

async function callKalshi(action: string, params?: Record<string, any>) {
  try {
    const { data, error } = await supabase.functions.invoke('kalshi-weather', {
      body: { action, params },
    });

    if (error) {
      console.error('Kalshi API error:', error);
      throw new Error(error.message || 'Failed to call Kalshi API');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (err) {
    console.error(`Kalshi ${action} failed:`, err);
    throw err;
  }
}

export async function getWeatherMarkets(): Promise<KalshiMarket[]> {
  const data = await callKalshi('search_markets', { query: 'weather' });
  return data || [];
}

export async function searchMarkets(query: string): Promise<KalshiMarket[]> {
  const data = await callKalshi('search_markets', { query });
  return data || [];
}

export async function getMarketDetails(ticker: string): Promise<KalshiMarket> {
  const data = await callKalshi('get_market', { ticker });
  return data.market;
}

export async function getOrderbook(ticker: string) {
  const data = await callKalshi('get_orderbook', { ticker });
  return data.orderbook;
}

export async function getBalance(): Promise<KalshiBalance> {
  const data = await callKalshi('get_balance');
  return data;
}

export async function getPositions(): Promise<KalshiPosition[]> {
  const data = await callKalshi('get_positions');
  return data.market_positions || [];
}

export async function getOrders(): Promise<KalshiOrder[]> {
  const data = await callKalshi('get_orders');
  return data.orders || [];
}

export async function placeOrder(params: {
  ticker: string;
  action?: 'buy' | 'sell';
  side: 'yes' | 'no';
  type?: 'market' | 'limit';
  count: number;
  yes_price?: number;
  no_price?: number;
}): Promise<KalshiOrder> {
  const data = await callKalshi('place_order', params);
  return data.order;
}

export async function cancelOrder(orderId: string): Promise<void> {
  await callKalshi('cancel_order', { order_id: orderId });
}

// Convert Kalshi price (cents) to probability percentage
export function priceToProbability(price: number): number {
  return price; // Kalshi prices are already 0-100
}

// Convert probability to display string
export function formatProbability(prob: number): string {
  return `${prob.toFixed(0)}%`;
}

// Format Kalshi price (in cents) to dollars
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
