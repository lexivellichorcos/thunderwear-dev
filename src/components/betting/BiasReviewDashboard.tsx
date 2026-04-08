import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Shield, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StationBias {
  stationId: string;
  cityName: string;
  bias: number | null;
  sampleSize: number;
  season: string;
  meetsMinimum: boolean;
  effectiveBias: number;
}

interface SourceVariance {
  source: string;
  variance: number;
  empiricalSd: number;
  sampleSize: number;
}

const MIN_BIAS_SAMPLE = 30;

const STATION_NAMES: Record<string, string> = {
  KNYC: 'New York', KMDW: 'Chicago', KLAX: 'Los Angeles', KAUS: 'Austin',
  KMIA: 'Miami', KDEN: 'Denver', KPHL: 'Philadelphia', KSFO: 'San Francisco',
  KSEA: 'Seattle', KDAL: 'Dallas', KPHX: 'Phoenix', KHOU: 'Houston',
  KATL: 'Atlanta', KLAS: 'Las Vegas', KBOS: 'Boston', KDCA: 'Washington DC',
  KSAT: 'San Antonio', KOKC: 'Oklahoma City', KMSP: 'Minneapolis', KNEW: 'New Orleans',
};

const ALL_STATIONS = Object.keys(STATION_NAMES);
const STATION_IDS_BY_CITY = Object.fromEntries(
  Object.entries(STATION_NAMES).map(([stationId, cityName]) => [cityName, stationId])
) as Record<string, string>;

const getCurrentSeason = () => {
  const month = new Date().getMonth() + 1;
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([6, 7, 8].includes(month)) return 'summer';
  if ([9, 10, 11].includes(month)) return 'fall';
  return 'spring';
};

export function BiasReviewDashboard() {
  const [biases, setBiases] = useState<StationBias[]>([]);
  const [variances, setVariances] = useState<SourceVariance[]>([]);
  const [featureFlag, setFeatureFlag] = useState<number>(0);
  const [ensembleSd, setEnsembleSd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const currentSeason = getCurrentSeason();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [biasResponse, varianceResponse, configResponse, verifiedResponse] = await Promise.all([
        supabase
          .from('station_biases')
          .select('station_id, bias, sample_size, season, metric')
          .eq('metric', 'temp'),
        supabase
          .from('source_variances')
          .select('source, variance, sample_size, metric')
          .eq('metric', 'temp'),
        supabase
          .from('forecast_config')
          .select('key, value')
          .in('key', ['use_dynamic_biases', 'ensemble_std_dev', 'ensemble_std_dev_spring', 'ensemble_std_dev_summer', 'ensemble_std_dev_fall', 'ensemble_std_dev_winter']),
        supabase
          .from('weather_predictions')
          .select('location')
          .eq('prediction_type', 'kalshi_temp')
          .not('verified_at', 'is', null)
          .gte('verified_at', thirtyDaysAgo.toISOString())
          .or('actual_temp.not.is.null,actual_temp_high.not.is.null'),
      ]);

      if (biasResponse.error) throw biasResponse.error;
      if (varianceResponse.error) throw varianceResponse.error;
      if (configResponse.error) throw configResponse.error;
      if (verifiedResponse.error) throw verifiedResponse.error;

      const biasData = biasResponse.data;
      const varData = varianceResponse.data;
      const configData = configResponse.data;
      const verifiedPredictionData = verifiedResponse.data;

      const verifiedCountsByStation = new Map<string, number>();
      if (verifiedPredictionData) {
        for (const row of verifiedPredictionData) {
          const stationId = STATION_IDS_BY_CITY[row.location];
          if (!stationId) continue;
          verifiedCountsByStation.set(stationId, (verifiedCountsByStation.get(stationId) || 0) + 1);
        }
      }

      const biasMap = new Map<string, StationBias>();
      if (biasData) {
        for (const row of biasData) {
          const existing = biasMap.get(row.station_id);
          const isSeasonal = row.season === currentSeason;
          if (!existing || (isSeasonal && (row.sample_size || 0) > 0)) {
            const sampleSize = row.sample_size || 0;
            const meetsMinimum = sampleSize >= MIN_BIAS_SAMPLE;
            biasMap.set(row.station_id, {
              stationId: row.station_id,
              cityName: STATION_NAMES[row.station_id] || row.station_id,
              bias: row.bias,
              sampleSize,
              season: row.season || 'all',
              meetsMinimum,
              effectiveBias: meetsMinimum ? row.bias : 0,
            });
          }
        }
      }

      const allBiases: StationBias[] = ALL_STATIONS.map((stationId) => {
        const existing = biasMap.get(stationId);
        const verifiedCount = verifiedCountsByStation.get(stationId) || 0;

        if (existing) {
          const sampleSize = Math.max(existing.sampleSize, verifiedCount);
          const meetsMinimum = sampleSize >= MIN_BIAS_SAMPLE;

          return {
            ...existing,
            sampleSize,
            meetsMinimum,
            effectiveBias: meetsMinimum ? (existing.bias ?? 0) : 0,
          };
        }

        return {
          stationId,
          cityName: STATION_NAMES[stationId] || stationId,
          bias: null,
          sampleSize: verifiedCount,
          season: verifiedCount > 0 ? currentSeason : 'none',
          meetsMinimum: verifiedCount >= MIN_BIAS_SAMPLE,
          effectiveBias: 0,
        };
      });

      setBiases(allBiases);

      if (varData) {
        setVariances(varData.map(v => ({
          source: v.source,
          variance: v.variance,
          empiricalSd: Math.sqrt(v.variance),
          sampleSize: v.sample_size || 0,
        })));
      }

      if (configData) {
        const flagRow = configData.find(c => c.key === 'use_dynamic_biases');
        setFeatureFlag(flagRow ? Number(flagRow.value) : 0);

        const sdRow = configData.find(c => c.key === `ensemble_std_dev_${currentSeason}`)
          || configData.find(c => c.key === 'ensemble_std_dev');
        setEnsembleSd(sdRow ? Number(sdRow.value) : null);
      }
    } catch (err) {
      console.error('Failed to load bias data:', err);
      toast({ title: 'Error', description: 'Failed to load bias data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const readyCount = biases.filter(b => b.meetsMinimum).length;
  const pendingCount = biases.filter(b => b.sampleSize > 0 && !b.meetsMinimum).length;
  const missingCount = biases.filter(b => b.sampleSize === 0).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              Actuarial Bias Review — All 20 Stations
            </CardTitle>
            <CardDescription className="mt-1">
              Review station biases before enabling USE_DYNAMIC_BIASES. Min {MIN_BIAS_SAMPLE} verified predictions required.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={featureFlag === 1 ? 'default' : 'secondary'}>
              {featureFlag === 1 ? '🟢 ENABLED' : '🔴 DISABLED'}
            </Badge>
            <Button variant="outline" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-green-600 dark:text-green-400">✅ {readyCount} ready (≥{MIN_BIAS_SAMPLE})</span>
          <span className="text-yellow-600 dark:text-yellow-400">⏳ {pendingCount} accumulating</span>
          <span className="text-red-600 dark:text-red-400">❌ {missingCount} no data</span>
          {ensembleSd && (
            <span className="text-muted-foreground">Empirical σ: {ensembleSd.toFixed(2)}°F (vs 2.0°F static)</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Station</TableHead>
                <TableHead>City</TableHead>
                <TableHead className="text-right">Bias (°F)</TableHead>
                <TableHead className="text-right">Effective</TableHead>
                <TableHead className="text-right">Samples</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Season</TableHead>
                <TableHead className="text-right">95% CI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {biases.map(b => {
                const approxSe = b.sampleSize > 1 && b.bias !== null ? (ensembleSd || 4.5) / Math.sqrt(b.sampleSize) : null;
                const ciLow = approxSe && b.bias !== null ? (b.bias - 1.96 * approxSe).toFixed(1) : '—';
                const ciHigh = approxSe && b.bias !== null ? (b.bias + 1.96 * approxSe).toFixed(1) : '—';

                return (
                  <TableRow key={b.stationId} className={b.sampleSize === 0 ? 'opacity-50' : ''}>
                    <TableCell className="font-mono text-xs">{b.stationId}</TableCell>
                    <TableCell className="font-medium">{b.cityName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {b.sampleSize > 0 && b.bias !== null ? (
                        <span className={b.bias > 0 ? 'text-green-600 dark:text-green-400' : b.bias < 0 ? 'text-red-600 dark:text-red-400' : ''}>
                          {b.bias > 0 ? '+' : ''}{b.bias.toFixed(2)}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {b.effectiveBias !== 0 ? (
                        <span className="font-semibold">
                          {b.effectiveBias > 0 ? '+' : ''}{b.effectiveBias.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0.00</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{b.sampleSize}</TableCell>
                    <TableCell className="text-center">
                      {b.meetsMinimum ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 inline" />
                      ) : b.sampleSize > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 inline" />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{b.season}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {ciLow} → {ciHigh}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {variances.length > 0 && (
          <div className="border-t p-4">
            <h4 className="text-sm font-medium mb-2">Source Variances (temp metric)</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {variances.map(v => (
                <div key={v.source} className="p-2 rounded border bg-muted/30 text-xs">
                  <div className="font-medium">{v.source}</div>
                  <div className="text-muted-foreground">
                    σ={v.empiricalSd.toFixed(2)}°F · n={v.sampleSize}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t p-4 text-xs text-muted-foreground space-y-1">
          <p><strong>To enable:</strong> Set <code>use_dynamic_biases = 1</code> in forecast_config after reviewing all biases.</p>
          <p><strong>Bias meaning:</strong> Positive = model under-predicts (correction raises temp). Negative = model over-predicts.</p>
          <p><strong>Effective bias:</strong> Only applied when sample size ≥ {MIN_BIAS_SAMPLE}. Below threshold → 0 (no correction).</p>
        </div>
      </CardContent>
    </Card>
  );
}
