import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Bot, TrendingUp, TrendingDown, AlertCircle, Activity, Play, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  toggleAutoTrade, 
  getAgentStatus, 
  triggerAnalysis,
  calculatePNLSummary,
  AgentStatus,
  AgentPosition 
} from '@/services/kalshiAgentService';

interface KalshiAutoTradeProps {
  isAccountLinked: boolean;
}

export const KalshiAutoTrade = ({ isAccountLinked }: KalshiAutoTradeProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [riskLevel, setRiskLevel] = useState(50); // 0-100 scale for UI
  const [maxPositionPct, setMaxPositionPct] = useState(20); // 0-100 scale for UI
  const [lastAnalysisResult, setLastAnalysisResult] = useState<string | null>(null);

  // Load agent status
  useEffect(() => {
    const loadStatus = async () => {
      if (!user || !isAccountLinked) {
        setIsLoading(false);
        return;
      }

      try {
        const agentStatus = await getAgentStatus();
        setStatus(agentStatus);
        setAutoTradeEnabled(agentStatus.agent.auto_trade);
        setRiskLevel(agentStatus.agent.risk_level * 100);
        setMaxPositionPct(agentStatus.agent.max_position_pct * 100);
      } catch (err) {
        console.error('Error loading agent status:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();
  }, [user, isAccountLinked]);

  // Toggle auto-trade
  const handleToggle = async (enabled: boolean) => {
    if (!user) return;

    setIsSaving(true);
    try {
      await toggleAutoTrade(
        enabled,
        riskLevel / 100,
        maxPositionPct / 100
      );
      setAutoTradeEnabled(enabled);
      toast({
        title: enabled ? 'Auto-Trade Enabled' : 'Auto-Trade Disabled',
        description: enabled 
          ? 'The agent will now monitor NWS updates and trade automatically'
          : 'Automatic trading has been turned off',
      });
    } catch (err) {
      console.error('Error toggling auto-trade:', err);
      toast({
        title: 'Error',
        description: 'Failed to update auto-trade settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Save risk settings
  const handleSaveSettings = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      await toggleAutoTrade(
        autoTradeEnabled,
        riskLevel / 100,
        maxPositionPct / 100
      );
      toast({
        title: 'Settings Saved',
        description: `Risk: ${riskLevel}%, Max Position: ${maxPositionPct}%`,
      });
    } catch (err) {
      console.error('Error saving settings:', err);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Manually trigger analysis
  const handleRunAnalysis = async () => {
    if (!user) return;
    
    setIsRunningAnalysis(true);
    setLastAnalysisResult(null);
    try {
      const result = await triggerAnalysis();
      console.log('[AutoTrade] Analysis result:', result);
      
      // Refresh status after analysis
      const agentStatus = await getAgentStatus();
      setStatus(agentStatus);
      
      const updatesMsg = result.updates && result.updates.length > 0 
        ? `NWS updates: ${result.updates.join(', ')}`
        : (result.forceAnalyze ? 'Analysis ran (no new NWS data)' : 'No new NWS data');
      
      setLastAnalysisResult(updatesMsg);
      toast({
        title: 'Analysis Complete',
        description: updatesMsg,
      });
    } catch (err) {
      console.error('Error running analysis:', err);
      toast({
        title: 'Error',
        description: 'Failed to run analysis',
        variant: 'destructive',
      });
    } finally {
      setIsRunningAnalysis(false);
    }
  };

  if (!isAccountLinked) {
    return (
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">Link your Kalshi account to enable auto-trading</span>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading agent status...</span>
        </div>
      </Card>
    );
  }

  const pnlSummary = status 
    ? calculatePNLSummary([...status.openPositions, ...status.recentHistory])
    : null;

  return (
    <Card className="p-4 space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${autoTradeEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
            <Bot className={`h-5 w-5 ${autoTradeEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <h3 className="font-semibold">Auto-Trade Agent</h3>
            <p className="text-xs text-muted-foreground">
              {autoTradeEnabled ? 'Monitoring NWS updates' : 'Disabled'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {autoTradeEnabled && (
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
              <Activity className="h-3 w-3 mr-1 animate-pulse" />
              Active
            </Badge>
          )}
          <Switch
            checked={autoTradeEnabled}
            onCheckedChange={handleToggle}
            disabled={isSaving}
          />
        </div>
      </div>

      {/* Settings (expanded when enabled) */}
      {autoTradeEnabled && (
        <div className="space-y-4 pt-2 border-t border-border">
          {/* Risk Level */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Risk Level</label>
              <span className="text-sm text-muted-foreground">{riskLevel}%</span>
            </div>
            <Slider
              value={[riskLevel]}
              onValueChange={([v]) => setRiskLevel(v)}
              min={10}
              max={100}
              step={10}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Higher risk = larger positions, wider stops
            </p>
          </div>

          {/* Max Position */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Max Position Size</label>
              <span className="text-sm text-muted-foreground">{maxPositionPct}% of balance</span>
            </div>
            <Slider
              value={[maxPositionPct]}
              onValueChange={([v]) => setMaxPositionPct(v)}
              min={5}
              max={50}
              step={5}
              className="w-full"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Settings
          </Button>

          {/* Run Analysis Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRunAnalysis}
            disabled={isRunningAnalysis}
            className="w-full"
          >
            {isRunningAnalysis ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Analysis Now
          </Button>
          
          {lastAnalysisResult && (
            <p className="text-xs text-muted-foreground text-center">
              {lastAnalysisResult}
            </p>
          )}
        </div>
      )}

      {/* Open Positions */}
      {status && status.openPositions.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-sm font-medium">Open Positions</h4>
          <div className="space-y-1">
            {status.openPositions.map((pos) => (
              <div key={pos.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                <div>
                  <span className="font-mono">{pos.ticker}</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {pos.side.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{pos.size}x @ {pos.entry_price}¢</span>
                  {pos.peak_pnl > 0 && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600">
                      +{pos.peak_pnl.toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* P&L Summary */}
      {pnlSummary && pnlSummary.closedCount > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <h4 className="text-sm font-medium">Performance</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-muted/50 rounded">
              <div className={`text-lg font-bold ${pnlSummary.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {pnlSummary.totalPnl >= 0 ? '+' : ''}{pnlSummary.totalPnl.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Total P&L</div>
            </div>
            <div className="p-2 bg-muted/50 rounded">
              <div className="text-lg font-bold">{pnlSummary.winRate.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
            <div className="p-2 bg-muted/50 rounded">
              <div className="text-lg font-bold">{pnlSummary.closedCount}</div>
              <div className="text-xs text-muted-foreground">Trades</div>
            </div>
          </div>
        </div>
      )}

      {/* Strategy Info */}
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        <p>
          <strong>Strategy:</strong> Enters when TW edge &gt;5% vs market. Take profit at +10%, 
          dynamic stops (-25% early, -8% near close, vol-adjusted). Rebuys if edge persists.
        </p>
      </div>
    </Card>
  );
};
