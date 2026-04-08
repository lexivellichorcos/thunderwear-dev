import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, TrendingUp, Target, CheckCircle2 } from 'lucide-react';
import { getPredictionStats, verifyPredictions } from '@/services/predictionTrackingService';
import { useToast } from '@/hooks/use-toast';

interface AccuracyStats {
  count: number;
  mae: number | string | null;
  pct_within_ci: number | string | null;
  mean_error?: number | null;
}

export const PredictionAccuracyCard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [stats, setStats] = useState<{
    summary: Record<string, AccuracyStats>;
    daily: any[];
  } | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await getPredictionStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const count = await verifyPredictions();
      toast({
        title: 'Verification Complete',
        description: `Verified ${count} predictions against actuals`,
      });
      // Refresh stats after verification
      await fetchStats();
    } catch (err) {
      toast({
        title: 'Verification Failed',
        description: 'Could not verify predictions',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const getAccuracyColor = (mae: string | number | null): string => {
    if (mae == null) return 'text-muted-foreground';
    const maeNum = typeof mae === 'number' ? mae : parseFloat(mae);
    if (isNaN(maeNum)) return 'text-muted-foreground';
    if (maeNum <= 2) return 'text-green-500';
    if (maeNum <= 4) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getCIColor = (pct: string | number | null): string => {
    if (pct == null) return 'text-muted-foreground';
    const pctNum = typeof pct === 'number' ? pct : parseFloat(pct);
    if (isNaN(pctNum)) return 'text-muted-foreground';
    if (pctNum >= 90) return 'text-green-500';
    if (pctNum >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const predictionTypeLabels: Record<string, string> = {
    hourly: 'Hourly Forecast',
    daily: '7-Day Forecast',
    kalshi_temp: 'Kalshi Temperature',
    kalshi_rain: 'Kalshi Rain',
  };

  return (
    <Card className="p-4 bg-background/60 backdrop-blur-lg border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Prediction Accuracy</h3>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerify}
            disabled={verifying}
          >
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span className="ml-1">Verify</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchStats}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {loading && !stats ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stats?.summary && Object.keys(stats.summary).length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3">
            {Object.entries(stats.summary).map(([type, data]) => (
              <div
                key={type}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
              >
                <div>
                  <p className="font-medium text-sm">
                    {predictionTypeLabels[type] || type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.count} verified predictions
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">MAE</p>
                    <p className={`font-mono font-semibold ${getAccuracyColor(data.mae)}`}>
                      {data.mae ? `±${data.mae}°F` : '--'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Within CI</p>
                    <p className={`font-mono font-semibold ${getCIColor(data.pct_within_ci)}`}>
                      {data.pct_within_ci ? `${data.pct_within_ci}%` : '--'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {stats.daily && stats.daily.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Recent Daily Stats</p>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.daily.slice(0, 5).map((day, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">
                      {new Date(day.target_date).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {day.prediction_type}
                      </Badge>
                      <span className={getAccuracyColor(day.mean_absolute_error?.toFixed(1))}>
                        ±{day.mean_absolute_error?.toFixed(1) || '--'}°F
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No prediction data yet</p>
          <p className="text-xs mt-1">
            Predictions will be logged and compared to actuals over time
          </p>
        </div>
      )}
    </Card>
  );
};
