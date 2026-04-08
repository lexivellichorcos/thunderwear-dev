import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

interface ForecastDay {
  day: string;
  temp: number;
  minTemp: number;
  maxTemp: number;
  rainChance: number;
}

interface WeatherChartProps {
  forecast: ForecastDay[];
}

const chartConfig = {
  temp: {
    label: "Temperature",
    color: "hsl(var(--primary))",
  },
  minTemp: {
    label: "Min Temp",
    color: "hsl(var(--primary-glow))",
  },
  maxTemp: {
    label: "Max Temp", 
    color: "hsl(var(--warning))",
  },
  rainChance: {
    label: "Rain Chance",
    color: "hsl(var(--storm))",
  },
};

export const WeatherChart = ({ forecast }: WeatherChartProps) => {
  return (
    <Card className="weather-card-hover glass-effect border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>7-Day Temperature Forecast</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <XAxis 
                dataKey="day" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              <Tooltip content={<ChartTooltipContent />} />
               <Line 
                type="monotone" 
                dataKey="maxTemp" 
                stroke="var(--color-maxTemp)"
                strokeWidth={3}
                dot={{ fill: "var(--color-maxTemp)", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "var(--color-maxTemp)", strokeWidth: 2 }}
                name="High"
              />
              <Line 
                type="monotone" 
                dataKey="minTemp" 
                stroke="var(--color-minTemp)"
                strokeWidth={3}
                dot={{ fill: "var(--color-minTemp)", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "var(--color-minTemp)", strokeWidth: 2 }}
                name="Low"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};