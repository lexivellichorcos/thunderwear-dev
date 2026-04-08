import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, TrendingUp, TrendingDown, CheckCircle, XCircle, AlertTriangle, Brain, Sparkles, Trash2, BarChart3 } from "lucide-react";
import { clearWeatherCache } from "@/services/weatherService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DAILY_WEIGHTS } from "@/utils/stats";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

interface DailyComparison {
  date: string;
  predictedHigh: string | null;
  actualHigh: string | null;
  official6hrMax: string | null;
  computedMax: string | null;
  error: string | null;
  absError: string | null;
  withinCI: boolean | null;
  predictionType: string | null;
  // New dual-snapshot fields
  predicted7pm: string | null;
  error7pm: string | null;
  withinCI7pm: boolean | null;
  predictionTime7pm: string | null;
  predicted1159pm: string | null;
  error1159pm: string | null;
  withinCI1159pm: boolean | null;
  predictionTime1159pm: string | null;
}

interface BacktestReport {
  station: string;
  stationName: string;
  dateRange: { start: string; end: string };
  predictions: number;
  dailyComparison: DailyComparison[];
  sixHourReadings: Array<{ timestamp: string; maxF: number | null; minF: number | null }>;
  summary: {
    totalDays: number;
    avgError: number;
    avgAbsError: number;
    withinCI: number;
    official6hrMaxUsed: number;
  };
}

interface GrokAnalysis {
  rmseTemp: number;
  maeTemp: number;
  biasDirection: 'over' | 'under' | 'balanced';
  biasAmount: number;
  bias?: number; // Recommended bias correction value
  patterns: string[];
  weightSuggestions: Record<string, number>;
  calibrationAdvice: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  insights: string;
}

type SnapshotView = "both" | "7pm" | "1159pm";

type DaysBack = 7 | 14 | 30 | 60;

export function KNYCBacktestCard() {
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapshotView, setSnapshotView] = useState<SnapshotView>("both");
  const [daysBack, setDaysBack] = useState<DaysBack>(30);
  const [grokAnalysis, setGrokAnalysis] = useState<GrokAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchBacktest = async (opts?: { daysBack?: DaysBack }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-tracker", {
        body: { action: "knyc_backtest", daysBack: opts?.daysBack ?? daysBack },
      });

      if (error) throw error;
      if (data?.report) {
        setReport(data.report);
        setGrokAnalysis(null); // Reset analysis when data changes
        toast.success(`Loaded ${data.report.dailyComparison.length} days (${data.report.summary.totalDays} verified with NWS actuals)`);
      }
    } catch (err) {
      console.error("Backtest error:", err);
      toast.error("Failed to load backtest data");
    } finally {
      setLoading(false);
    }
  };

  const runGrokAnalysis = async () => {
    if (!report) return;
    
    setAnalyzing(true);
    try {
      // Transform daily comparison data for the analyzer
      const backtestData = report.dailyComparison.map(day => ({
        date: day.date,
        predictedHigh: day.predictedHigh ? parseFloat(day.predictedHigh) : null,
        actualHigh: day.actualHigh ? parseFloat(day.actualHigh) : null,
        error: day.error ? parseFloat(day.error) : null,
        absError: day.absError ? parseFloat(day.absError) : null,
        predicted7pm: day.predicted7pm ? parseFloat(day.predicted7pm) : null,
        error7pm: day.error7pm ? parseFloat(day.error7pm) : null,
        predicted1159pm: day.predicted1159pm ? parseFloat(day.predicted1159pm) : null,
        error1159pm: day.error1159pm ? parseFloat(day.error1159pm) : null,
        withinCI: day.withinCI,
      }));

      const { data, error } = await supabase.functions.invoke("backtest-analyzer", {
        body: { 
          backtestData, 
          summary: report.summary,
          currentWeights: DAILY_WEIGHTS,
        },
      });

      if (error) throw error;
      if (data?.analysis) {
        setGrokAnalysis(data.analysis);
        
        // Auto-update bias in Supabase if analysis provides a new bias value
        const newBias = data.analysis.bias ?? data.analysis.biasAmount;
        if (newBias !== undefined && data.analysis.biasDirection !== 'balanced') {
          // Convert to correction value (positive if under-predicting, negative if over-predicting)
          const correctionValue = data.analysis.biasDirection === 'under' 
            ? Math.abs(newBias) 
            : -Math.abs(newBias);
          
          try {
            await supabase
              .from('forecast_config')
              .upsert({
                key: 'bias_correction',
                value: correctionValue,
                updated_at: new Date().toISOString(),
                description: `Updated from Grok backtest analysis (${new Date().toLocaleDateString()})`,
              });
            toast.success(`Bias correction updated to ${correctionValue > 0 ? '+' : ''}${correctionValue.toFixed(1)}°F`);
          } catch (upsertErr) {
            console.error('Failed to update bias in Supabase:', upsertErr);
          }
        } else {
          toast.success("Grok ML analysis complete");
        }
      }
    } catch (err) {
      console.error("Grok analysis error:", err);
      toast.error("Failed to run Grok analysis");
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchBacktest();
  }, []);

  const getErrorColor = (error: string | null) => {
    if (!error) return "text-muted-foreground";
    const absErr = Math.abs(parseFloat(error));
    if (absErr <= 2) return "text-green-600 dark:text-green-400";
    if (absErr <= 4) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatPredictionTime = (isoStr: string | null) => {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return d.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      timeZone: 'America/New_York' 
    });
  };

  // Today's "running" 6hr max should only use 6hr max readings whose full 6-hour window
  // lies within today's local calendar date (prevents yesterday's window bleeding into today).
  const tzNY = 'America/New_York';
  const todayNY = new Date().toLocaleDateString('en-CA', { timeZone: tzNY });

  const todaySixHourMaxReadings = (report?.sixHourReadings ?? [])
    .filter((r) => typeof r.maxF === 'number' && r.maxF !== null)
    .map((r) => {
      const obsTime = new Date(r.timestamp);
      const windowStart = new Date(obsTime.getTime() - 6 * 60 * 60 * 1000);
      const localDate = obsTime.toLocaleDateString('en-CA', { timeZone: tzNY });
      const windowStartLocalDate = windowStart.toLocaleDateString('en-CA', { timeZone: tzNY });
      return { ...r, obsTime, localDate, windowStartLocalDate };
    })
    .filter((r) => r.localDate === todayNY && r.windowStartLocalDate === todayNY)
    .sort((a, b) => b.obsTime.getTime() - a.obsTime.getTime());

  const todayRunning6hrMax = todaySixHourMaxReadings.length > 0
    ? Math.max(...todaySixHourMaxReadings.map((r) => r.maxF as number))
    : null;

  const latestToday6hrReading = todaySixHourMaxReadings[0] ?? null;

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <div className="flex flex-col gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
              KNYC Forecast Backtest
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Central Park predictions vs official NWS 6-hour max readings
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={daysBack.toString()} onValueChange={(v) => {
              const next = parseInt(v, 10) as DaysBack;
              setDaysBack(next);
              fetchBacktest({ daysBack: next });
            }}>
              <SelectTrigger className="w-[90px] sm:w-[120px] h-8 text-xs">
                <SelectValue placeholder="Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
              </SelectContent>
            </Select>

            <Select value={snapshotView} onValueChange={(v) => setSnapshotView(v as SnapshotView)}>
              <SelectTrigger className="w-[80px] sm:w-[140px] h-8 text-xs">
                <SelectValue placeholder="Snapshot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="7pm">7pm</SelectItem>
                <SelectItem value="1159pm">11:59pm</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 px-2 sm:px-3"
              onClick={() => {
                clearWeatherCache('KNYC');
                toast.success('KNYC cache cleared — next fetch will be fresh');
              }}
            >
              <Trash2 className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Clear Cache</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={() => fetchBacktest()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 sm:mr-1 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-3 sm:px-6">
        {!report && !loading && (
          <p className="text-muted-foreground text-center py-4">No backtest data available</p>
        )}

        {report && (
          <>
            {/* Today's Running 6hr Max */}
            {report.sixHourReadings.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 sm:p-3 border border-blue-200 dark:border-blue-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-xs sm:text-sm font-medium">Today's Running 6hr Max</span>
                  <span className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">
                    {todayRunning6hrMax !== null ? `${todayRunning6hrMax.toFixed(1)}°F` : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  {latestToday6hrReading ? (
                    <>Latest: {new Date(latestToday6hrReading.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</>
                  ) : (
                    <>Waiting for synoptic update</>
                  )}
                </div>
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{report.summary.totalDays}</div>
                <div className="text-xs text-muted-foreground">Days Compared</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${report.summary.avgAbsError <= 3 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {report.summary.avgAbsError.toFixed(1)}°F
                </div>
                <div className="text-xs text-muted-foreground">Mean Abs Error</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className={`text-2xl font-bold ${report.summary.withinCI >= 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {report.summary.withinCI.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">Within CI</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-primary">
                  {report.summary.official6hrMaxUsed}
                </div>
                <div className="text-xs text-muted-foreground">6hr Max Used</div>
              </div>
            </div>

            {/* Error Trend Chart */}
            {report.dailyComparison.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Error Trend (°F)</span>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={report.dailyComparison.slice().reverse().map(day => ({
                        date: day.date.slice(5), // MM-DD
                        error: day.error7pm ? parseFloat(day.error7pm) : (day.error ? parseFloat(day.error) : 0),
                        withinCI: day.withinCI7pm ?? day.withinCI ?? false,
                      }))}
                      margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                    >
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }} 
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        tick={{ fontSize: 10 }} 
                        domain={[-5, 5]}
                        tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value > 0 ? '+' : ''}${value.toFixed(1)}°F`, 'Error']}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                      <Bar dataKey="error" radius={[2, 2, 0, 0]}>
                        {report.dailyComparison.slice().reverse().map((day, index) => {
                          const error = day.error7pm ? parseFloat(day.error7pm) : (day.error ? parseFloat(day.error) : 0);
                          return (
                            <Cell 
                              key={`cell-${index}`}
                              fill={Math.abs(error) <= 2 ? 'hsl(142, 76%, 36%)' : Math.abs(error) <= 4 ? 'hsl(48, 96%, 53%)' : 'hsl(0, 84%, 60%)'}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500" /> ≤2°F</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-500" /> 2-4°F</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> &gt;4°F</span>
                </div>
              </div>
            )}

            {/* Bias indicator */}
            <div className="flex items-center gap-2 text-sm">
              {report.summary.avgError > 0.5 ? (
                <>
                  <TrendingDown className="h-4 w-4 text-blue-500" />
                  <span className="text-muted-foreground">
                    Forecast bias: <span className="font-medium text-blue-600">under-predicting</span> by avg {Math.abs(report.summary.avgError).toFixed(1)}°F
                  </span>
                </>
              ) : report.summary.avgError < -0.5 ? (
                <>
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  <span className="text-muted-foreground">
                    Forecast bias: <span className="font-medium text-orange-600">over-predicting</span> by avg {Math.abs(report.summary.avgError).toFixed(1)}°F
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">
                    Forecast bias: <span className="font-medium text-green-600">well-calibrated</span>
                  </span>
                </>
              )}
            </div>

            {/* Daily Comparison Table */}
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto relative">
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-primary/10 dark:bg-primary/20">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="text-right font-semibold">Actual</TableHead>
                      {(snapshotView === "both" || snapshotView === "7pm") && (
                        <>
                          <TableHead className="text-right font-semibold">
                            <span className="whitespace-nowrap">7pm ET</span>
                            <span className="text-[10px] block text-muted-foreground font-normal">night before</span>
                          </TableHead>
                          <TableHead className="text-right font-semibold">Err</TableHead>
                        </>
                      )}
                      {(snapshotView === "both" || snapshotView === "1159pm") && (
                        <>
                          <TableHead className="text-right font-semibold">
                            <span className="whitespace-nowrap">11:59pm ET</span>
                            <span className="text-[10px] block text-muted-foreground font-normal">night before</span>
                          </TableHead>
                          <TableHead className="text-right font-semibold">Err</TableHead>
                        </>
                      )}
                      <TableHead className="text-center font-semibold">CI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.dailyComparison.map((day) => (
                      <TableRow key={day.date} className="h-8">
                        <TableCell className="font-medium py-1">
                          {formatDate(day.date)}
                          {day.official6hrMax && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">
                              6hr
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium py-1">
                          {day.actualHigh ? `${day.actualHigh}°F` : <span className="text-muted-foreground">—</span>}
                        </TableCell>

                        {/* 7pm snapshot */}
                        {(snapshotView === "both" || snapshotView === "7pm") && (
                          <>
                            <TableCell className="text-right py-1">
                              {day.predicted7pm ? (
                                <span title={formatPredictionTime(day.predictionTime7pm) || undefined}>
                                  {day.predicted7pm}°F
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-medium py-1 ${getErrorColor(day.error7pm)}`}>
                              {day.error7pm ? (
                                `${parseFloat(day.error7pm) > 0 ? "+" : ""}${day.error7pm}°`
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </>
                        )}

                        {/* 11:59pm snapshot */}
                        {(snapshotView === "both" || snapshotView === "1159pm") && (
                          <>
                            <TableCell className="text-right py-1">
                              {day.predicted1159pm ? (
                                <span title={formatPredictionTime(day.predictionTime1159pm) || undefined}>
                                  {day.predicted1159pm}°F
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-medium py-1 ${getErrorColor(day.error1159pm)}`}>
                              {day.error1159pm ? (
                                `${parseFloat(day.error1159pm) > 0 ? "+" : ""}${day.error1159pm}°`
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </>
                        )}

                        <TableCell className="text-center py-1">
                          {(() => {
                            const ciVal = snapshotView === "7pm" ? day.withinCI7pm
                              : snapshotView === "1159pm" ? day.withinCI1159pm
                              : (day.withinCI1159pm ?? day.withinCI7pm);
                            return ciVal === true ? (
                              <CheckCircle className="h-4 w-4 text-green-500 inline" />
                            ) : ciVal === false ? (
                              <XCircle className="h-4 w-4 text-red-500 inline" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-muted-foreground inline" />
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Explanation */}
            <p className="text-xs text-muted-foreground">
              <strong>7pm ET</strong>: Forecast available at bet time (night before). <strong>Midnight</strong>: Latest forecast before day starts.
              <br />
              <strong>6hr Max</strong>: Official ASOS reading at synoptic hours — what Kalshi uses for settlement.
            </p>

            {/* Grok ML Analysis Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-500" />
                  <span className="font-semibold">Grok ML Analysis</span>
                  <Badge variant="secondary" className="text-[10px]">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI-Powered
                  </Badge>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={runGrokAnalysis} 
                  disabled={analyzing || !report}
                  className="border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                >
                  {analyzing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-1" />
                      Run Analysis
                    </>
                  )}
                </Button>
              </div>

              {!grokAnalysis && !analyzing && (
                <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-lg">
                  Click "Run Analysis" to get AI-powered insights on forecast accuracy patterns and weight optimization suggestions.
                </p>
              )}

              {grokAnalysis && (
                <div className="space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {grokAnalysis.rmseTemp.toFixed(2)}°F
                      </div>
                      <div className="text-xs text-muted-foreground">RMSE</div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {grokAnalysis.maeTemp.toFixed(2)}°F
                      </div>
                      <div className="text-xs text-muted-foreground">MAE</div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                      <div className={`text-2xl font-bold ${
                        grokAnalysis.biasDirection === 'balanced' ? 'text-green-600' : 
                        grokAnalysis.biasDirection === 'under' ? 'text-blue-600' : 'text-orange-600'
                      }`}>
                        {/* Negative error = under-prediction (actual > predicted), show as negative */}
                        {/* Positive error = over-prediction (actual < predicted), show as positive */}
                        {grokAnalysis.biasDirection === 'balanced' ? '±0' : 
                         `${grokAnalysis.biasDirection === 'under' ? '-' : '+'}${grokAnalysis.biasAmount.toFixed(1)}°`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Bias {grokAnalysis.biasDirection !== 'balanced' && (
                          <span className="text-[10px]">
                            ({grokAnalysis.biasDirection === 'under' ? 'under-predicting' : 'over-predicting'})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                      <Badge 
                        variant={grokAnalysis.confidenceLevel === 'high' ? 'default' : 
                                 grokAnalysis.confidenceLevel === 'medium' ? 'secondary' : 'outline'}
                        className="text-sm"
                      >
                        {grokAnalysis.confidenceLevel.toUpperCase()}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1">Confidence</div>
                    </div>
                  </div>

                  {/* Insights */}
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">{grokAnalysis.insights}</p>
                    </div>
                  </div>

                  {/* Patterns */}
                  {grokAnalysis.patterns.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Detected Patterns</h4>
                      <ul className="space-y-1">
                        {grokAnalysis.patterns.map((pattern, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-purple-500">•</span>
                            {pattern}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weight Suggestions */}
                  {grokAnalysis.weightSuggestions && Object.keys(grokAnalysis.weightSuggestions).length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Suggested Weight Adjustments</h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(grokAnalysis.weightSuggestions).map(([source, weight]) => {
                          const currentWeight = DAILY_WEIGHTS[source as keyof typeof DAILY_WEIGHTS] || 0;
                          const diff = (weight as number) - currentWeight;
                          const diffStr = diff > 0 ? `+${(diff * 100).toFixed(0)}%` : `${(diff * 100).toFixed(0)}%`;
                          return (
                            <Badge 
                              key={source} 
                              variant="outline" 
                              className={`text-xs ${
                                Math.abs(diff) > 0.02 ? 
                                  (diff > 0 ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : 'border-red-300 bg-red-50 dark:bg-red-900/20') 
                                  : ''
                              }`}
                            >
                              {source}: {((weight as number) * 100).toFixed(0)}%
                              {Math.abs(diff) > 0.005 && (
                                <span className={`ml-1 ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  ({diffStr})
                                </span>
                              )}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Calibration Advice */}
                  {grokAnalysis.calibrationAdvice && (
                    <div className="bg-muted/50 rounded-lg p-3">
                      <h4 className="text-sm font-medium mb-1">Calibration Recommendation</h4>
                      <p className="text-sm text-muted-foreground">{grokAnalysis.calibrationAdvice}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}