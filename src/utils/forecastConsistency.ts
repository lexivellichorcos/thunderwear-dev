import type { ForecastDay, HourlyForecast } from "@/services/weatherService";

export const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export type ForecastConsistencyResult = {
  label: string;
  date: string;
  dailyHighF?: number;
  dailyLowF?: number;
  hourlyHighF?: number;
  hourlyLowF?: number;
  deltaHighF?: number;
  deltaLowF?: number;
  ok: boolean;
  reason?: string;
};

export const checkDailyVsHourlyConsistency = (params: {
  label: string;
  date?: string; // YYYY-MM-DD (local)
  daily: ForecastDay[] | null | undefined;
  hourly: HourlyForecast[] | null | undefined;
  toleranceF?: number;
}): ForecastConsistencyResult => {
  const date = params.date ?? getLocalDateString();
  const toleranceF = params.toleranceF ?? 1.5;

  const daily = params.daily ?? [];
  const hourly = params.hourly ?? [];

  const matchingDay = daily.find((d) => (d.day || "").split("T")[0] === date);
  const matchingHours = hourly.filter((h) => (h.time || "").split("T")[0] === date);

  if (!matchingDay) {
    const result: ForecastConsistencyResult = {
      label: params.label,
      date,
      ok: false,
      reason: "No daily forecast found for date",
    };
    console.log(`[Consistency] ${result.label} ${date}: FAIL - ${result.reason}`);
    return result;
  }

  if (matchingHours.length === 0) {
    const result: ForecastConsistencyResult = {
      label: params.label,
      date,
      dailyHighF: matchingDay.maxTemp,
      dailyLowF: matchingDay.minTemp,
      ok: false,
      reason: "No hourly forecast hours found for date",
    };
    console.log(`[Consistency] ${result.label} ${date}: FAIL - ${result.reason}`);
    return result;
  }

  const hourlyHighF = Math.max(...matchingHours.map((h) => h.temperature));
  const hourlyLowF = Math.min(...matchingHours.map((h) => h.temperature));

  const dailyHighF = matchingDay.maxTemp;
  const dailyLowF = matchingDay.minTemp;

  const deltaHighF = hourlyHighF - dailyHighF;
  const deltaLowF = hourlyLowF - dailyLowF;

  const ok =
    Math.abs(deltaHighF) <= toleranceF &&
    Math.abs(deltaLowF) <= toleranceF;

  const result: ForecastConsistencyResult = {
    label: params.label,
    date,
    dailyHighF,
    dailyLowF,
    hourlyHighF,
    hourlyLowF,
    deltaHighF,
    deltaLowF,
    ok,
  };

  console.log(
    `[Consistency] ${params.label} ${date}: dailyHigh=${dailyHighF.toFixed(1)}°F vs hourlyHigh=${hourlyHighF.toFixed(1)}°F (Δ=${deltaHighF.toFixed(1)}°F) | dailyLow=${dailyLowF.toFixed(1)}°F vs hourlyLow=${hourlyLowF.toFixed(1)}°F (Δ=${deltaLowF.toFixed(1)}°F) | ok=${ok}`
  );

  return result;
};
