import { supabase } from "@/integrations/supabase/client";

export interface AgentSettings {
  auto_trade: boolean;
  risk_level: number;
  max_position_pct: number;
}

export interface AgentPosition {
  id: string;
  ticker: string;
  side: 'yes' | 'no';
  entry_price: number;
  size: number;
  entry_time: string;
  peak_pnl: number;
  std_dev: number;
  status: string;
  exit_price?: number;
  exit_time?: string;
  pnl?: number;
}

export interface AgentStatus {
  agent: AgentSettings;
  openPositions: AgentPosition[];
  recentHistory: AgentPosition[];
}

async function callAgent(action: string, params?: Record<string, any>) {
  try {
    const { data, error } = await supabase.functions.invoke('kalshi-agent', {
      body: { action, ...params },
    });

    if (error) {
      console.error('Agent API error:', error);
      throw new Error(error.message || 'Failed to call agent');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  } catch (err) {
    console.error(`Agent ${action} failed:`, err);
    throw err;
  }
}

// Toggle auto-trading on/off (userId derived from JWT server-side)
export async function toggleAutoTrade(
  enabled: boolean,
  riskLevel: number = 0.5,
  maxPositionPct: number = 0.2
): Promise<AgentSettings> {
  const data = await callAgent('toggle', { enabled, riskLevel, maxPositionPct });
  return data;
}

// Get agent status including open positions (userId derived from JWT server-side)
export async function getAgentStatus(): Promise<AgentStatus> {
  const data = await callAgent('status');
  return data;
}

// Manually trigger analysis (for testing)
export async function triggerAnalysis(): Promise<{ action: string; updates?: string[]; forceAnalyze?: boolean }> {
  const data = await callAgent('monitor_nws', { forceAnalyze: true });
  return data;
}

// Calculate P&L summary from positions
export function calculatePNLSummary(positions: AgentPosition[]): {
  totalPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  openCount: number;
  closedCount: number;
} {
  const closed = positions.filter(p => p.status !== 'open');
  const open = positions.filter(p => p.status === 'open');
  
  const wins = closed.filter(p => (p.pnl || 0) > 0);
  const losses = closed.filter(p => (p.pnl || 0) <= 0);
  
  const totalPnl = closed.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((sum, p) => sum + (p.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((sum, p) => sum + (p.pnl || 0), 0) / losses.length : 0;
  
  return {
    totalPnl,
    winRate,
    avgWin,
    avgLoss,
    openCount: open.length,
    closedCount: closed.length,
  };
}
