import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

type HourlyCompareRow = {
  local_date: string;
  local_hour: number;
  local_label: string;
  target_time_utc: string;
  predicted_temp_f: number | null;
  predicted_at: string | null;
  actual_temp_f: number | null;
  observed_at_local: string | null;
  observed_at_utc: string | null;
  variance_f: number | null;
};

function getDateStringInTimeZone(timeZone: string, date = new Date()): string {
  // en-CA yields YYYY-MM-DD format
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function CentralParkHourlyComparisonCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<HourlyCompareRow[]>([]);
  const [loading, setLoading] = useState(false);

  const timeZone = "America/New_York";
  const date = useMemo(() => getDateStringInTimeZone(timeZone), [timeZone]);

  const displayRows = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => new Date(a.target_time_utc).getTime() - new Date(b.target_time_utc).getTime(),
    );
    return sorted.slice(-6);
  }, [rows]);

  const fetchComparison = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("hourly-compare", {
        body: {
          location: "40.7829,-73.9654",
          station_id: "KNYC",
          time_zone: timeZone,
          date,
          start_local_hour: 0,
        },
      });

      if (error) throw error;
      setRows((data?.rows ?? []) as HourlyCompareRow[]);
    } catch (err: any) {
      console.error("Failed to fetch hourly comparison:", err);
      toast({
        title: "Comparison unavailable",
        description: "Couldn't load NWS actuals vs forecast. Try refresh.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <Card className="glass-effect border-primary/20 p-4 bg-white/10 backdrop-blur-md">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Central Park hourly: forecast vs NWS actuals</h2>
          <p className="text-sm text-muted-foreground">
            Station <span className="font-mono">KNYC</span> • {date} • last 6 observed hours
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchComparison}
          disabled={loading}
          className="bg-white/10 backdrop-blur-md"
        >
          <RefreshCw className={"h-4 w-4 mr-2 " + (loading ? "animate-spin" : "")} />
          Refresh
        </Button>
      </header>

      <main className="mt-4">
        {displayRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data available yet.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hour (ET)</TableHead>
                  <TableHead className="text-right">TW forecast (°F)</TableHead>
                  <TableHead className="text-right">NWS actual (°F)</TableHead>
                  <TableHead className="text-right">Variance (A−F)</TableHead>
                  <TableHead className="text-right">Observed</TableHead>
                  <TableHead className="text-right">Forecasted at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((r) => (
                  <TableRow key={r.target_time_utc}>
                    <TableCell className="font-medium">{r.local_label}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.predicted_temp_f == null ? "—" : r.predicted_temp_f.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.actual_temp_f == null ? "—" : r.actual_temp_f.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.variance_f == null ? "—" : r.variance_f.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.observed_at_local ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{r.predicted_at ? new Date(r.predicted_at).toISOString().slice(11, 16) + "Z" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </Card>
  );
}
