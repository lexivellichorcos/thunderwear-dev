import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { KalshiWeatherBetting } from '@/components/betting/KalshiWeatherBetting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, LogOut, RefreshCw, BarChart3, Moon, Sun, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ─────────────────────────────────────────────────────────────────
interface MetarAlert {
  station: string;
  city?: string;
  metar_temp_f?: number;
  model_temp_f?: number;
  divergence_f?: number;
  alert_level?: string;
  timestamp?: string;
  [key: string]: unknown;
}

interface TailOpportunity {
  ticker?: string;
  city?: string;
  marketType?: string;
  strikeTemp?: number;
  twProbability?: number;
  twProbabilityDecimal?: number;
  marketPrice?: number | null;
  edge?: number | null;
  kellyFraction?: number;
  kellyPercent?: number;
  stdDev?: number;
  predictedTemp?: number;
  ciWidth?: number;
  notes?: string;
  scanTime?: string;
  isMispriced?: boolean;
}

interface ExitSignal {
  ticker?: string;
  market?: string;
  city?: string;
  reason?: string;
  urgency?: string;
  pnl?: number | null;
  current_pnl?: number | null;
  current_price?: number | string | null;
  target_exit?: number | string | null;
  timestamp?: string;
  [key: string]: unknown;
}

// ─── METAR Divergence Section ───────────────────────────────────────────────
function MetarDivergenceSection({ isDark }: { isDark: boolean }) {
  const [alerts, setAlerts] = useState<MetarAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('metar-alerts');
      if (error) throw error;
      setAlerts(data.alerts ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MetarDivergenceSection] fetch error:', msg);
      setError(msg);
    } finally {
      setLastRefresh(new Date());
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const severityBadgeClass = (level?: string) => {
    const l = level?.toLowerCase() ?? '';
    if (l === 'critical' || l === 'high') return 'bg-red-900/70 text-red-300';
    if (l === 'warning' || l === 'medium') return 'bg-yellow-900/70 text-yellow-300';
    return isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700';
  };

  const severityLabel = (level?: string) => {
    const l = level?.toLowerCase() ?? 'low';
    if (l === 'critical' || l === 'high') return 'CRITICAL';
    if (l === 'warning' || l === 'medium') return 'WARNING';
    return 'LOW';
  };

  const cardClass = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const titleClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const softClass = isDark ? 'text-slate-500' : 'text-slate-500';
  const rowClass = isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-200 hover:bg-slate-50';
  const headRowClass = isDark ? 'border-slate-700 hover:bg-transparent' : 'border-slate-200 hover:bg-transparent';
  const buttonClass = isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className={`${titleClass} flex items-center gap-2`}>
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          METAR Divergence
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className={`text-xs ${softClass}`}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className={buttonClass}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className={`text-sm py-4 text-center ${mutedClass}`}>Loading METAR data…</p>
        ) : alerts.length === 0 ? (
          <p className={`text-sm py-4 text-center ${softClass}`}>No METAR divergence alerts found.</p>
        ) : error ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-red-400">⚠ {error}</p>
            <Button variant="ghost" size="sm" onClick={load} className={buttonClass}>
              Retry
            </Button>
          </div>
        ) : (
          <>
          <p className={`text-xs mb-2 ${softClass}`}>
            ⚠ Divergence shown vs TW <strong>daily high</strong> forecast — current METAR is a point-in-time observation (may be overnight/early AM). Large negative divergences at night are expected, not model errors.
          </p>
          <Table>
            <TableHeader>
              <TableRow className={headRowClass}>
                <TableHead className={mutedClass}>Station</TableHead>
                <TableHead className={mutedClass}>Obs (Now) °F</TableHead>
                <TableHead className={mutedClass}>TW Fcst High °F</TableHead>
                <TableHead className={mutedClass}>Δ (High − Obs)</TableHead>
                <TableHead className={mutedClass}>Severity</TableHead>
                <TableHead className={mutedClass}>Obs Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((a, i) => (
                <TableRow key={i} className={rowClass}>
                  <TableCell className={`font-mono ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{a.station}</TableCell>
                  <TableCell className={isDark ? 'text-slate-200' : 'text-slate-900'}>
                    {a.metar_temp_f != null ? `${a.metar_temp_f}°F` : '—'}
                  </TableCell>
                  <TableCell className={isDark ? 'text-slate-200' : 'text-slate-900'}>
                    {a.model_temp_f != null ? `${a.model_temp_f}°F` : '—'}
                  </TableCell>
                  <TableCell className="font-mono font-semibold">
                    {a.divergence_f != null ? (
                      <span className={Math.abs(a.divergence_f) >= 5 ? 'text-red-500' : Math.abs(a.divergence_f) >= 2 ? isDark ? 'text-yellow-300' : 'text-yellow-600' : isDark ? 'text-slate-300' : 'text-slate-600'}>
                        {a.divergence_f > 0 ? '+' : ''}{a.divergence_f}°F
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${severityBadgeClass(a.alert_level)}`}>
                      {severityLabel(a.alert_level)}
                    </span>
                  </TableCell>
                  <TableCell className={`text-xs ${mutedClass}`}>
                    {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Forecast Backtest Section ─────────────────────────────────────────────
// Section 1: Reference data from historical backtests
function ForecastBacktestSection({ isDark }: { isDark: boolean }) {
  const [cities, setCities] = useState<Array<{ city: string; stationId: string }>>([]);
  const [selectedCity, setSelectedCity] = useState('KNYC');
  const [backtest, setBacktest] = useState<{
    city: string;
    stationId: string;
    summary: {
      totalTrades: number;
      wins: number;
      losses: number;
      winRatePct: number;
      avgEdgePp: number;
      totalPnlCents: number;
    };
    tMinus: {
      [key: string]: {
        trades: number;
        wins: number;
        winRate: number;
        avgEdgePp: number;
      };
    };
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadCities = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('backtest');
      if (error) throw error;
      setCities(data.cities ?? []);
      if (data.cities?.length > 0 && !data.cities.find((c: any) => c.stationId === selectedCity)) {
        setSelectedCity(data.cities[0].stationId);
      }
    } catch (err) {
      console.error('[ForecastBacktestSection] Load cities error:', err);
    }
  };

  const loadBacktest = async (cityId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('backtest', { body: { city: cityId } });
      if (error) throw error;
      setBacktest(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ForecastBacktestSection] fetch error:', msg);
      setError(msg);
    } finally {
      setLastRefresh(new Date());
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCities();
  }, []);

  useEffect(() => {
    loadBacktest(selectedCity);
  }, [selectedCity]);

  const tMinusBuckets = [
    { key: '0_6h', label: '0–6h' },
    { key: '6_12h', label: '6–12h' },
    { key: '12_24h', label: '12–24h' },
    { key: '24_48h', label: '24–48h' },
    { key: '48_72h', label: '48–72h' },
    { key: '72h_plus', label: '72h+' },
  ];

  const cardClass = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const titleClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const softClass = isDark ? 'text-slate-500' : 'text-slate-500';
  const inputClass = isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900';
  const buttonClass = isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  const statBgClass = isDark ? 'bg-slate-700/50' : 'bg-slate-100';
  const headRowClass = isDark ? 'border-slate-700 hover:bg-transparent' : 'border-slate-200 hover:bg-transparent';
  const rowClass = isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-200 hover:bg-slate-50';
  const cellClass = isDark ? 'text-slate-200' : 'text-slate-900';
  const textLabelClass = isDark ? 'text-slate-300' : 'text-slate-700';

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className={`${titleClass} flex items-center gap-2`}>
          <BarChart3 className="h-5 w-5 text-blue-400" />
          Backtest Results — TW Model Historical Performance
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className={`text-xs ${softClass}`}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadBacktest(selectedCity)}
            disabled={loading}
            className={buttonClass}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* City selector */}
        <div className="flex items-center gap-3">
          <label className={`text-sm font-medium ${textLabelClass} whitespace-nowrap`}>Select city:</label>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className={`border text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${inputClass}`}
          >
            {cities.map((c) => (
              <option key={c.stationId} value={c.stationId}>
                {c.city} ({c.stationId})
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className={`text-sm py-4 text-center ${mutedClass}`}>Loading backtest data…</p>
        ) : error ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-red-400">⚠ {error}</p>
            <Button variant="ghost" size="sm" onClick={() => loadBacktest(selectedCity)} className={buttonClass}>
              Retry
            </Button>
          </div>
        ) : backtest ? (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className={`${statBgClass} rounded-lg p-3 text-center`}>
                <div className="text-2xl font-bold text-green-400">{backtest.summary?.winRatePct != null ? backtest.summary.winRatePct.toFixed(1) : '—'}%</div>
                <div className={`text-xs ${mutedClass}`}>Win Rate</div>
              </div>
              <div className={`${statBgClass} rounded-lg p-3 text-center`}>
                <div className="text-2xl font-bold text-blue-400">{backtest.summary?.avgEdgePp != null ? `${backtest.summary.avgEdgePp.toFixed(1)}pp` : '—'}</div>
                <div className={`text-xs ${mutedClass}`}>Avg Edge</div>
              </div>
              <div className={`${statBgClass} rounded-lg p-3 text-center`}>
                <div className="text-2xl font-bold text-yellow-400">{backtest.summary?.totalPnlCents != null ? `$${(backtest.summary.totalPnlCents / 100).toFixed(2)}` : '—'}</div>
                <div className={`text-xs ${mutedClass}`}>Total PnL</div>
              </div>
              <div className={`${statBgClass} rounded-lg p-3 text-center`}>
                <div className="text-2xl font-bold text-purple-400">{backtest.summary?.totalTrades ?? '—'}</div>
                <div className={`text-xs ${mutedClass}`}>Total Trades</div>
              </div>
            </div>

            {/* T-minus breakdown */}
            <div>
              <h3 className={`text-sm font-semibold mb-3 ${textLabelClass}`}>Performance by Forecast Age (T-minus)</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className={headRowClass}>
                      <TableHead className={mutedClass}>Time Bucket</TableHead>
                      <TableHead className={`${mutedClass} text-right`}>Trades</TableHead>
                      <TableHead className={`${mutedClass} text-right`}>Win Rate %</TableHead>
                      <TableHead className={`${mutedClass} text-right`}>Avg Edge pp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tMinusBuckets.map((bucket) => {
                      const data = backtest.tMinus?.[bucket.key];
                      return (
                        <TableRow key={bucket.key} className={rowClass}>
                          <TableCell className={`font-medium ${cellClass}`}>{bucket.label}</TableCell>
                          <TableCell className={`text-right ${cellClass}`}>{data?.trades ?? '—'}</TableCell>
                          <TableCell className="text-right font-mono">
                            {data?.winRate != null ? (
                              <span className={data.winRate >= 0.65 ? 'text-green-300' : data.winRate >= 0.5 ? isDark ? 'text-yellow-300' : 'text-yellow-600' : 'text-red-500'}>
                                {(data.winRate * 100).toFixed(1)}%
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-400">{data?.avgEdgePp != null ? `${data.avgEdgePp.toFixed(1)}pp` : '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : (
          <p className={`text-sm py-4 text-center ${softClass}`}>No backtest data available.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── TW vs Kalshi Market Comparison Section ────────────────────────────────
// Section 3: Live edge detection across all 20 markets
function TWvsKalshiSection({ isDark }: { isDark: boolean }) {
  const [markets, setMarkets] = useState<Array<{
    city: string;
    stationId: string;
    kalshiTicker: string;
    twProbability: number | null;
    marketPrice: number | null;
    edgePp: number | null;
    direction: 'YES' | 'NO' | null;
    twPredictedTemp: number | null;
    targetDate: string | null;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('markets-compare');
      if (error) throw error;
      setMarkets(data.markets ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[TWvsKalshiSection] fetch error:', msg);
      setError(msg);
    } finally {
      setLastRefresh(new Date());
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const edgeColor = (edge: number | null) => {
    if (edge == null) return 'text-slate-400';
    if (edge >= 5) return 'text-green-300';
    if (edge >= 2) return 'text-yellow-300';
    return 'text-slate-400';
  };

  const directionBadge = (dir: 'YES' | 'NO' | null) => {
    if (dir === 'YES') return <Badge className="bg-green-900/70 text-green-300 border-0">YES ↑</Badge>;
    if (dir === 'NO') return <Badge className="bg-blue-900/70 text-blue-300 border-0">NO ↓</Badge>;
    return <Badge className="bg-slate-700 text-slate-400 border-0">—</Badge>;
  };

  const withEdge = markets.filter(m => m.edgePp != null && m.edgePp > 0);

  const cardClass = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const titleClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const softClass = isDark ? 'text-slate-500' : 'text-slate-500';
  const buttonClass = isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  const headRowClass = isDark ? 'border-slate-700 hover:bg-transparent' : 'border-slate-200 hover:bg-transparent';
  const rowClass = isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-200 hover:bg-slate-50';
  const cellClass = isDark ? 'text-slate-200' : 'text-slate-900';

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className={`${titleClass} flex items-center gap-2`}>
          <TrendingUp className="h-5 w-5 text-emerald-400" />
          TW vs Kalshi — Live Edge Detection
          {withEdge.length > 0 && (
            <span className="text-xs text-emerald-400 font-normal ml-1">({withEdge.length} edges)</span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className={`text-xs ${softClass}`}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className={buttonClass}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className={`text-sm py-4 text-center ${mutedClass}`}>Loading market data…</p>
        ) : error ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-red-400">⚠ {error}</p>
            <Button variant="ghost" size="sm" onClick={load} className={buttonClass}>
              Retry
            </Button>
          </div>
        ) : markets.length === 0 ? (
          <div className="py-4 text-center space-y-1">
            <p className={`text-sm ${softClass}`}>No opportunities found in last scan.</p>
            <p className={`text-xs ${softClass}`}>Run <code className={mutedClass}>npm run trading:tail-scan</code> to populate.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={headRowClass}>
                  <TableHead className={mutedClass}>City</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>TW Prob %</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>Kalshi %</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>Edge pp</TableHead>
                  <TableHead className={`${mutedClass} text-center`}>Direction</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>Pred Temp °F</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markets
                  .sort((a, b) => (b.edgePp ?? 0) - (a.edgePp ?? 0))
                  .map((m, i) => (
                    <TableRow key={i} className={rowClass}>
                      <TableCell className={`font-medium ${cellClass}`}>{m.city}</TableCell>
                      <TableCell className={`text-right font-mono ${cellClass}`}>
                        {m.twProbability != null ? `${m.twProbability}%` : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${cellClass}`}>
                        {m.marketPrice != null ? `${m.marketPrice}%` : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${edgeColor(m.edgePp)}`}>
                        {m.edgePp != null ? `${m.edgePp.toFixed(1)}pp` : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {directionBadge(m.direction)}
                      </TableCell>
                      <TableCell className={`text-right text-xs ${mutedClass}`}>
                        {m.twPredictedTemp != null ? `${m.twPredictedTemp}°F` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tail Opportunities Section ────────────────────────────────────────────
function TailOpportunitiesSection({ isDark }: { isDark: boolean }) {
  const [opps, setOpps] = useState<TailOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanTime, setScanTime] = useState<string | null>(null);
  const [rowsToShow, setRowsToShow] = useState(10);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('tail-opportunities');
      if (error) throw error;
      const rawOpps: TailOpportunity[] = data.opportunities ?? [];
      const sorted = [...rawOpps].sort((a, b) => {
        const ka = a.kellyPercent ?? (a.kellyFraction != null ? a.kellyFraction * 100 : 0);
        const kb = b.kellyPercent ?? (b.kellyFraction != null ? b.kellyFraction * 100 : 0);
        return kb - ka;
      });
      setOpps(sorted);
      setScanTime(data.generatedAt ?? null);
      setLastRefresh(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[TailOpportunitiesSection] fetch error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cardClass = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const titleClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const softClass = isDark ? 'text-slate-500' : 'text-slate-500';
  const rowClass = isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-200 hover:bg-slate-50';
  const headRowClass = isDark ? 'border-slate-700 hover:bg-transparent' : 'border-slate-200 hover:bg-transparent';
  const buttonClass = isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';

  const mispricedBadge = (flagged?: boolean) => {
    if (flagged) return <Badge className="bg-red-900/70 text-red-300 border-0">⚡ Mispriced</Badge>;
    return <Badge className={isDark ? 'bg-slate-700 text-slate-400 border-0' : 'bg-slate-100 text-slate-600 border-0'}>—</Badge>;
  };

  const edgeColor = (edge?: number | null) => {
    if (edge == null) return isDark ? 'text-slate-400' : 'text-slate-500';
    if (edge >= 0.05) return isDark ? 'text-green-300' : 'text-green-600';
    if (edge >= 0.02) return isDark ? 'text-yellow-300' : 'text-yellow-600';
    return isDark ? 'text-slate-400' : 'text-slate-500';
  };

  const kellyColor = (kelly: number | null) => {
    if (kelly == null) return isDark ? 'text-slate-400' : 'text-slate-500';
    if (kelly >= 5) return isDark ? 'text-green-300' : 'text-green-600';
    if (kelly >= 2) return isDark ? 'text-yellow-300' : 'text-yellow-600';
    return isDark ? 'text-slate-400' : 'text-slate-500';
  };

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className={`${titleClass} flex items-center gap-2`}>
          <TrendingUp className="h-5 w-5 text-green-400" />
          Tail Opportunities
          {opps.length > 0 && (
            <span className={`ml-1 text-xs font-normal ${mutedClass}`}>({opps.length})</span>
          )}
        </CardTitle>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {lastRefresh && (
            <span className={`text-xs ${softClass}`}>
              {scanTime ? `Scan: ${new Date(scanTime).toLocaleString()}` : `Updated ${lastRefresh.toLocaleTimeString()}`}
            </span>
          )}
          <div className="flex items-center gap-2">
            <label className={`text-sm font-medium ${mutedClass}`}>Show:</label>
            <select
              value={rowsToShow}
              onChange={(e) => setRowsToShow(Number(e.target.value))}
              className={`rounded-md border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDark ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-300 bg-white text-slate-900'
              }`}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className={`text-sm ${mutedClass}`}>rows</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={loading}
              className={buttonClass}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className={`py-4 text-center text-sm ${mutedClass}`}>Loading tail opportunities…</p>
        ) : error ? (
          <div className="space-y-2 py-4 text-center">
            <p className="text-sm text-red-400">⚠ {error}</p>
            <Button variant="ghost" size="sm" onClick={load} className={buttonClass}>
              Retry
            </Button>
          </div>
        ) : opps.length === 0 ? (
          <p className={`py-4 text-center text-sm ${softClass}`}>
            No tail opportunities found. Run <code className={mutedClass}>npm run trading:tail-scan</code> to generate.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={headRowClass}>
                  <TableHead className={mutedClass}>Ticker</TableHead>
                  <TableHead className={`${mutedClass} text-center`}>City</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>Strike</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>Kelly %</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>Edge</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>TW Prob</TableHead>
                  <TableHead className={`${mutedClass} text-right`}>Mkt Price</TableHead>
                  <TableHead className={`${mutedClass} text-center`}>Mispriced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opps.slice(0, rowsToShow).map((o, i) => {
                  const kelly = o.kellyPercent ?? (o.kellyFraction != null ? o.kellyFraction * 100 : null);
                  return (
                    <TableRow key={i} className={rowClass}>
                      <TableCell className={`font-mono text-xs ${titleClass}`}>{o.ticker ?? '—'}</TableCell>
                      <TableCell className={`text-center ${titleClass}`}>{o.city ?? '—'}</TableCell>
                      <TableCell className={`text-right ${titleClass}`}>{o.strikeTemp != null ? `${o.strikeTemp}°F` : '—'}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {kelly != null ? <span className={kellyColor(kelly)}>{kelly.toFixed(1)}%</span> : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-medium ${edgeColor(o.edge)}`}>
                        {o.edge != null ? `${(o.edge * 100).toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${mutedClass}`}>{o.twProbability != null ? `${o.twProbability}%` : '—'}</TableCell>
                      <TableCell className={`text-right font-mono ${mutedClass}`}>{o.marketPrice != null ? `${(o.marketPrice * 100).toFixed(0)}¢` : '—'}</TableCell>
                      <TableCell className="text-center">{mispricedBadge(o.isMispriced)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Exit Signals Section ──────────────────────────────────────────────────
function ExitSignalsSection({ isDark }: { isDark: boolean }) {
  const [signals, setSignals] = useState<ExitSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('exit-signals');
      if (error) throw error;
      setSignals(data.signals ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ExitSignalsSection] fetch error:', msg);
      setError(msg);
    } finally {
      setLastRefresh(new Date());
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const urgencyLabel = (u?: string) => {
    const l = u?.toLowerCase() ?? '';
    if (l === 'immediate' || l === 'critical' || l === 'high') return 'IMMEDIATE';
    if (l === 'monitor' || l === 'medium') return 'MONITOR';
    if (l === 'low') return 'LOW';
    return u?.toUpperCase() ?? '—';
  };

  const urgencyBadge = (u?: string) => {
    const l = u?.toLowerCase() ?? '';
    if (l === 'immediate' || l === 'critical' || l === 'high')
      return <Badge className="bg-red-900/70 text-red-300 border-0">IMMEDIATE</Badge>;
    if (l === 'monitor' || l === 'medium')
      return <Badge className="bg-orange-900/70 text-orange-300 border-0">MONITOR</Badge>;
    if (!u || l === 'low')
      return <Badge className="bg-slate-700 text-slate-300 border-0">LOW</Badge>;
    return <Badge className="bg-slate-700 text-slate-300 border-0">{urgencyLabel(u)}</Badge>;
  };

  const cardClass = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const titleClass = isDark ? 'text-slate-100' : 'text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-600';
  const softClass = isDark ? 'text-slate-500' : 'text-slate-500';
  const buttonClass = isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  const headRowClass = isDark ? 'border-slate-700 hover:bg-transparent' : 'border-slate-200 hover:bg-transparent';
  const rowClass = isDark ? 'border-slate-700 hover:bg-slate-700/40' : 'border-slate-200 hover:bg-slate-50';
  const cellClass = isDark ? 'text-slate-200' : 'text-slate-900';

  const pnlDisplay = (s: ExitSignal) => {
    const val = s.pnl ?? s.current_pnl;
    if (val == null) return <span className={softClass}>—</span>;
    const isPositive = val >= 0;
    return (
      <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
        {isPositive ? '+' : ''}{typeof val === 'number' ? `$${val.toFixed(2)}` : val}
      </span>
    );
  };

  return (
    <Card className={cardClass}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className={`${titleClass} flex items-center gap-2`}>
          <LogOut className="h-5 w-5 text-red-400" />
          Exit Signals
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className={`text-xs ${softClass}`}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className={buttonClass}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className={`text-sm py-4 text-center ${mutedClass}`}>Loading exit signals…</p>
        ) : error ? (
          <div className="py-4 text-center space-y-2">
            <p className="text-sm text-red-400">⚠ {error}</p>
            <Button variant="ghost" size="sm" onClick={load} className={buttonClass}>
              Retry
            </Button>
          </div>
        ) : signals.length === 0 ? (
          <p className={`text-sm py-4 text-center ${softClass}`}>No exit signals found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={headRowClass}>
                <TableHead className={mutedClass}>Ticker</TableHead>
                <TableHead className={mutedClass}>City</TableHead>
                <TableHead className={mutedClass}>Reason</TableHead>
                <TableHead className={mutedClass}>P&L</TableHead>
                <TableHead className={mutedClass}>Urgency</TableHead>
                <TableHead className={mutedClass}>Current</TableHead>
                <TableHead className={mutedClass}>Target Exit</TableHead>
                <TableHead className={mutedClass}>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.map((s, i) => (
                <TableRow key={i} className={rowClass}>
                  <TableCell className={`font-mono text-xs ${cellClass}`}>{s.ticker ?? s.market ?? '—'}</TableCell>
                  <TableCell className={cellClass}>{s.city ?? '—'}</TableCell>
                  <TableCell className={`text-sm max-w-[180px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`} title={s.reason}>{s.reason ?? '—'}</TableCell>
                  <TableCell>{pnlDisplay(s)}</TableCell>
                  <TableCell>{urgencyBadge(s.urgency)}</TableCell>
                  <TableCell className={cellClass}>
                    {s.current_price != null
                      ? (typeof s.current_price === 'number' ? `${(s.current_price * 100).toFixed(0)}¢` : s.current_price)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-red-500 font-medium">
                    {s.target_exit != null
                      ? (typeof s.target_exit === 'number' ? `${(s.target_exit * 100).toFixed(0)}¢` : s.target_exit)
                      : '—'}
                  </TableCell>
                  <TableCell className={`text-xs ${mutedClass}`}>
                    {s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Alpha Page ────────────────────────────────────────────────────────────
export default function Alpha() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedTheme = window.localStorage.getItem('tw-alpha-theme');
    if (savedTheme) {
      setIsDark(savedTheme === 'dark');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('tw-alpha-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <div className={`${isDark ? 'dark bg-[#0f172a] text-slate-100' : 'bg-white text-slate-900'} min-h-screen`}>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">

        {/* Header */}
        <div className={`flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <img src="/tw-alpha-logo.jpg" alt="ThunderWear Alpha" className="h-16 w-16 rounded-xl" />
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                THUNDERWEAR <span className="text-cyan-400">alpha</span>
              </h1>
              <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>The edge is in the data</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/"
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors ${isDark ? 'border-slate-600 text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 hover:border-slate-500' : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-400'}`}
              title="Back to ThunderWear home"
            >
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDark((prev) => !prev)}
              className={isDark ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100'}
            >
              {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </Button>
          </div>
        </div>

        {/* Existing component: Kalshi Weather Betting */}
        <KalshiWeatherBetting />

        {/* P2 Sections: Backtest + Markets */}
        <ForecastBacktestSection isDark={isDark} />
        <TWvsKalshiSection isDark={isDark} />

        {/* Original dark sections */}
        <MetarDivergenceSection isDark={isDark} />
        <TailOpportunitiesSection isDark={isDark} />
        <ExitSignalsSection isDark={isDark} />

      </div>
    </div>
  );
}
