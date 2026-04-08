import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Cloud, Droplets, Wind, Thermometer } from "lucide-react";
import { WeatherNarrative } from "@/services/weatherNarrativeService";

interface WeatherNarrativeCardProps {
  narrative: WeatherNarrative;
  forecast: {
    maxTemp: number;
    minTemp: number;
    rainChance: number;
    condition: string;
    windSpeed?: number;
  };
  isLoading?: boolean;
}

export const WeatherNarrativeCard = ({
  narrative,
  forecast,
  isLoading = false,
}: WeatherNarrativeCardProps) => {
  if (isLoading) {
    return (
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/50">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="h-4 bg-blue-100 dark:bg-blue-900/50 rounded animate-pulse mb-2 w-3/4" />
            <div className="h-4 bg-blue-100 dark:bg-blue-900/50 rounded animate-pulse w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  if (!narrative) {
    return null;
  }

  return (
    <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/50 transition-all hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            {narrative.narrative}
          </p>
          
          {/* Quick metrics row */}
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <Thermometer className="h-3 w-3" />
              <span>{forecast.maxTemp.toFixed(0)}° / {forecast.minTemp.toFixed(0)}°</span>
            </div>
            {forecast.rainChance > 0 && (
              <div className="flex items-center gap-1">
                <Droplets className="h-3 w-3" />
                <span>{forecast.rainChance}% rain</span>
              </div>
            )}
            {forecast.windSpeed && forecast.windSpeed > 0 && (
              <div className="flex items-center gap-1">
                <Wind className="h-3 w-3" />
                <span>{forecast.windSpeed} mph</span>
              </div>
            )}
          </div>

          {/* Tone badge */}
          <Badge 
            variant="outline" 
            className="mt-2 text-[10px] uppercase tracking-wider bg-white/50 dark:bg-slate-800/50 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
          >
            {narrative.tone}
          </Badge>
        </div>
      </div>
    </Card>
  );
};
