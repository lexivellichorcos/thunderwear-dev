import { useState, useEffect } from 'react';
import { KalshiWeatherBetting } from '@/components/betting/KalshiWeatherBetting';
import { BiasReviewDashboard } from '@/components/betting/BiasReviewDashboard';
import { KNYCBacktestCard } from '@/components/weather/KNYCBacktestCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── City list (all 20 Kalshi settlement cities) ───────────────────────────
const CITIES = [
  { id: 'KNYC', label: 'New York (KNYC)' },
  { id: 'KMDW', label: 'Chicago (KMDW)' },
  { id: 'KLAX', label: 'Los Angeles (KLAX)' },
  { id: 'KAUS', label: 'Austin (KAUS)' },
  { id: 'KMIA', label: 'Miami (KMIA)' },
  { id: 'KDEN', label: 'Denver (KDEN)' },
  { id: 'KPHL', label: 'Philadelphia (KPHL)' },
  { id: 'KSFO', label: 'San Francisco (KSFO)' },
  { id: 'KSEA', label: 'Seattle (KSEA)' },
  { id: 'KDAL', label: 'Dallas (KDAL)' },
  { id: 'KPHX', label: 'Phoenix (KPHX)' },
  { id: 'KHOU', label: 'Houston (KHOU)' },
  { id: 'KATL', label: 'Atlanta (KATL)' },
  { id: 'KLAS', label: 'Las Vegas (KLAS)' },
  { id: 'KBOS', label: 'Boston (KBOS)' },
  { id: 'KDCA', label: 'Washington DC (KDCA)' },
  { id: 'KSAT', label: 'San Antonio (KSAT)' },
  { id: 'KOKC', label: 'Oklahoma City (KOKC)' },
  { id: 'KMSP', label: 'Minneapolis (KMSP)' },
  { id: 'KNEW', label: 'New Orleans (KNEW)' },
];

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
  market?: string;
  city?: string;
  direction?: string;
  edge?: number | string;
  confidence?: string;
  expires?: string;
  [key: string]: unknown;
}

interface ExitSignal {
  market?: string;
  city?: string;
  reason?: string;
  urgency?: string;
  current_price?: number | string;
  target_exit?: number | string;
  timestamp?: string;
  [key: string]: unknown;
}

// ─── Helper: fetch local JSON from /data/ ──────────────────────────────────
async function fetchLocalJson<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(path);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.items ?? data.alerts ?? data.signals ?? data.opportunities ?? []);
  } catch {
    return [];
  }
}

// ─── METAR Divergence Section ───────────────────────────────────────────────
function MetarDivergenceSection() {
  const [alerts, setAlerts] = useState<MetarAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await fetchLocalJson<MetarAlert>('/data/metar-alerts.json');
    setAlerts(data);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const urgencyColor = (level?: string) => {
    if (!level) return 'bg-slate-700 text-slate-300';
    if (level === 'high' || level === 'critical') return 'bg-red-900/60 text-red-300';
    if (level === 'medium') return 'bg-yellow-900/60 text-yellow-300';
    return 'bg-slate-700 text-slate-300';
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          METAR Divergence
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-slate-500">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-400 text-sm py-4 text-center">Loading METAR data…</p>
        ) : alerts.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No METAR divergence alerts found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-slate-400">Station</TableHead>
                <TableHead className="text-slate-400">METAR °F</TableHead>
                <TableHead className="text-slate-400">Model °F</TableHead>
                <TableHead className="text-slate-400">Divergence</TableHead>
                <TableHead className="text-slate-400">Alert</TableHead>
                <TableHead className="text-slate-400">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((a, i) => (
                <TableRow key={i} className="border-slate-700 hover:bg-slate-700/40">
                  <TableCell className="text-slate-200 font-mono">{a.station}</TableCell>
                  <TableCell className="text-slate-200">{a.metar_temp_f ?? '—'}</TableCell>
                  <TableCell className="text-slate-200">{a.model_temp_f ?? '—'}</TableCell>
                  <TableCell className="text-slate-200">
                    {a.divergence_f != null ? `${a.divergence_f > 0 ? '+' : ''}${a.divergence_f}°F` : '—'}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urgencyColor(a.alert_level)}`}>
                      {a.alert_level ?? 'low'}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-400 text-xs">
                    {a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '—'}
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

// ─── Tail Opportunities Section ─────────────────────────────────────────────
function TailOpportunitiesSection() {
  const [opps, setOpps] = useState<TailOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await fetchLocalJson<TailOpportunity>('/data/trading/tail-opportunities.json');
    setOpps(data);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const confidenceBadge = (c?: string) => {
    if (!c) return <Badge className="bg-slate-700 text-slate-300 border-0">—</Badge>;
    if (c === 'high') return <Badge className="bg-green-900/70 text-green-300 border-0">High</Badge>;
    if (c === 'medium') return <Badge className="bg-yellow-900/70 text-yellow-300 border-0">Medium</Badge>;
    return <Badge className="bg-slate-700 text-slate-300 border-0">{c}</Badge>;
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-400" />
          Tail Opportunities
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-slate-500">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-400 text-sm py-4 text-center">Loading opportunities…</p>
        ) : opps.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No tail opportunities found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-slate-400">Market</TableHead>
                <TableHead className="text-slate-400">City</TableHead>
                <TableHead className="text-slate-400">Direction</TableHead>
                <TableHead className="text-slate-400">Edge</TableHead>
                <TableHead className="text-slate-400">Confidence</TableHead>
                <TableHead className="text-slate-400">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opps.map((o, i) => (
                <TableRow key={i} className="border-slate-700 hover:bg-slate-700/40">
                  <TableCell className="text-slate-200 font-mono text-xs">{o.market ?? '—'}</TableCell>
                  <TableCell className="text-slate-200">{o.city ?? '—'}</TableCell>
                  <TableCell className="text-slate-200">{o.direction ?? '—'}</TableCell>
                  <TableCell className="text-green-300 font-medium">
                    {o.edge != null ? (typeof o.edge === 'number' ? `${(o.edge * 100).toFixed(1)}%` : o.edge) : '—'}
                  </TableCell>
                  <TableCell>{confidenceBadge(o.confidence)}</TableCell>
                  <TableCell className="text-slate-400 text-xs">
                    {o.expires ? new Date(o.expires).toLocaleString() : '—'}
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

// ─── Exit Signals Section ────────────────────────────────────────────────────
function ExitSignalsSection() {
  const [signals, setSignals] = useState<ExitSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await fetchLocalJson<ExitSignal>('/data/trading/exit-signals.json');
    setSignals(data);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const urgencyBadge = (u?: string) => {
    if (!u) return <Badge className="bg-slate-700 text-slate-300 border-0">—</Badge>;
    if (u === 'immediate' || u === 'high') return <Badge className="bg-red-900/70 text-red-300 border-0">{u}</Badge>;
    if (u === 'medium') return <Badge className="bg-yellow-900/70 text-yellow-300 border-0">{u}</Badge>;
    return <Badge className="bg-slate-700 text-slate-300 border-0">{u}</Badge>;
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <LogOut className="h-5 w-5 text-red-400" />
          Exit Signals
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-slate-500">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-slate-400 text-sm py-4 text-center">Loading exit signals…</p>
        ) : signals.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center">No exit signals found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-transparent">
                <TableHead className="text-slate-400">Market</TableHead>
                <TableHead className="text-slate-400">City</TableHead>
                <TableHead className="text-slate-400">Reason</TableHead>
                <TableHead className="text-slate-400">Urgency</TableHead>
                <TableHead className="text-slate-400">Current</TableHead>
                <TableHead className="text-slate-400">Target Exit</TableHead>
                <TableHead className="text-slate-400">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.map((s, i) => (
                <TableRow key={i} className="border-slate-700 hover:bg-slate-700/40">
                  <TableCell className="text-slate-200 font-mono text-xs">{s.market ?? '—'}</TableCell>
                  <TableCell className="text-slate-200">{s.city ?? '—'}</TableCell>
                  <TableCell className="text-slate-300 text-sm max-w-[200px] truncate">{s.reason ?? '—'}</TableCell>
                  <TableCell>{urgencyBadge(s.urgency)}</TableCell>
                  <TableCell className="text-slate-200">
                    {s.current_price != null ? (typeof s.current_price === 'number' ? `${(s.current_price * 100).toFixed(0)}¢` : s.current_price) : '—'}
                  </TableCell>
                  <TableCell className="text-red-300 font-medium">
                    {s.target_exit != null ? (typeof s.target_exit === 'number' ? `${(s.target_exit * 100).toFixed(0)}¢` : s.target_exit) : '—'}
                  </TableCell>
                  <TableCell className="text-slate-400 text-xs">
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

// ─── Alpha Page ──────────────────────────────────────────────────────────────
export default function Alpha() {
  const [selectedCity, setSelectedCity] = useState('KNYC');

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="border-b border-slate-700 pb-6 flex items-center gap-4">
          <img src="/tw-alpha-logo.jpg" alt="ThunderWear Alpha" className="w-16 h-16 rounded-xl" />
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">THUNDERWEAR <span className="text-cyan-400">alpha</span></h1>
            <p className="text-slate-400 text-sm mt-1">Live edge · positions · model accuracy</p>
          </div>
        </div>

        {/* Existing component: Kalshi Weather Betting (includes BiasReviewDashboard internally) */}
        <KalshiWeatherBetting />

        {/* City selector + Backtest card */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label htmlFor="alpha-city-select" className="text-sm font-medium text-slate-300 whitespace-nowrap">
              Backtest city:
            </label>
            <select
              id="alpha-city-select"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-100 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {/* KNYCBacktestCard drives its own station from internal state; city dropdown is for future wiring */}
          <KNYCBacktestCard />
        </div>

        {/* BiasReviewDashboard standalone (already rendered inside KalshiWeatherBetting but available here too) */}
        {/* Omitted to avoid double-render — KalshiWeatherBetting renders it internally */}

        {/* ── NEW dark sections ─────────────────────────────────────────── */}
        <MetarDivergenceSection />
        <TailOpportunitiesSection />
        <ExitSignalsSection />

      </div>
    </div>
  );
}
