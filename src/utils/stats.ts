/**
 * Actuarial-grade statistical utilities for weather probability calculations
 * Based on variance-minimizing portfolio optimization principles
 */

/**
 * Standard normal CDF (cumulative distribution function)
 * Accurate approximation using Hart algorithm
 * Used for probability calculations in Kalshi betting predictions
 * 
 * @param x - Value at which to evaluate the CDF
 * @param mu - Mean of the distribution (default: 0)
 * @param sigma - Standard deviation (default: 1)
 * @returns Probability P(X ≤ x)
 */
export function normCdf(x: number, mu: number = 0, sigma: number = 1): number {
  const z = (x - mu) / sigma;
  
  // Handle extreme values
  if (z < -8) return 0;
  if (z > 8) return 1;
  
  // Hart algorithm for normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  if (z > 0) prob = 1 - prob;
  return prob;
}

/**
 * Inverse normal CDF (quantile function)
 * Rational approximation accurate to ~1.15e-9
 * 
 * @param p - Probability value (0 < p < 1)
 * @returns z-score such that P(Z ≤ z) = p
 */
export function normPpf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  
  // Rational approximation from Abramowitz & Stegun
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];
  
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  
  let q: number, r: number;
  
  if (p < pLow) {
    // Lower tail
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    // Central region
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    // Upper tail
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Source accuracy weights for variance-minimizing ensemble
 * Updated to 2025 benchmarks (CNET, Ambee, Meteomatics, ForecastWatch reports)
 * 
 * Accuracy derivation (averaged 1-3 day high-temp % within ±3°F across NYC, Dallas, LA, etc.):
 * - AccuWeather: ~86.0% (2025 CNET/Ambee top performer)
 * - Tomorrow.io: ~85.5% (Meteomatics partnership, NOAA data claims)
 * - NOAA/NWS: ~79.0% (ForecastWatch baseline, authoritative)
 * - Open-Meteo: ~72.5% (free tier, European ECMWF model)
 * - OpenWeatherMap: ~71.0% (Visual Crossing comparison, free tier)
 * 
 * Sigmas: σ = 3 / norm.ppf((1 + p)/2) assuming normal errors for ±3°F tolerance
 * Weights: w_i = (1 / σ_i²) / Σ(1 / σ_j²) - variance minimizing
 */
export interface SourceAccuracy {
  name: string;
  accuracy: number;  // Historical accuracy within ±3°F for 1-day ahead
  stdDev: number;    // Estimated error standard deviation
  weight: number;    // Variance-minimizing weight
}

// 2025 accuracy data from CNET, Ambee, Meteomatics, ForecastWatch
// Refined for 2025 benchmarks with slight boosts to top performers
const SOURCE_ACCURACY_DATA: Record<string, number> = {
  'AccuWeather': 0.860,      // 86.0% - 2025 CNET/Ambee top
  'Tomorrow.io': 0.855,      // 85.5% - Meteomatics comp, NOAA partnership
  'NOAA': 0.790,             // 79.0% - ForecastWatch baseline, NWS authoritative
  'Open-Meteo': 0.725,       // 72.5% - free tier, ECMWF-based
  'OpenWeatherMap': 0.710,   // 71.0% - Visual Crossing comp, free tier
};

/**
 * Seasonal σ configuration for Kalshi probability calibration
 * DATA-DRIVEN: Derived from 541 verified winter predictions (Dec 2025 - Feb 2026)
 * 
 * Methodology: Residual SD after removing systematic bias from daily high predictions
 * Raw error SD: 5.65°F, Bias: +2.80°F, Residual SD: 4.91°F
 * 
 * Cold (<40°F): raw SD 5.37, residual ~4.5°F
 * Moderate (40-60°F): raw SD 5.79, residual ~5.3°F  
 * Warm (>60°F): raw SD 5.91, residual ~5.1°F
 * 
 * Spring/Summer/Fall scaled proportionally (less data — will be updated as data accumulates)
 */
export const SEASONAL_STD_DEV: Record<string, { cold: number; moderate: number; warm: number }> = {
  winter: { cold: 4.5, moderate: 5.3, warm: 5.1 },   // Empirical from 541 verified predictions
  spring: { cold: 4.0, moderate: 4.8, warm: 5.0 },   // Scaled estimate (pending spring data)
  summer: { cold: 4.0, moderate: 4.5, warm: 5.0 },   // Scaled estimate (pending summer data)
  fall:   { cold: 4.0, moderate: 4.8, warm: 5.0 },   // Scaled estimate (pending fall data)
};

/**
 * Get seasonal bucket σ for a given temperature
 * @param temp - Temperature in °F
 * @param season - 'winter' | 'spring' | 'summer' | 'fall'
 * @returns Bucket standard deviation for probability calculations
 */
export function getSeasonalBucketSd(temp: number, season: string = getCurrentSeason()): number {
  const seasonConfig = SEASONAL_STD_DEV[season] || SEASONAL_STD_DEV.fall;
  if (temp < 40) return seasonConfig.cold;
  if (temp < 60) return seasonConfig.moderate;
  return seasonConfig.warm;
}

/**
 * Get current season for bias/σ lookup
 */
export function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1;
  if ([12, 1, 2].includes(month)) return 'winter';
  if ([3, 4, 5].includes(month)) return 'spring';
  if ([6, 7, 8].includes(month)) return 'summer';
  return 'fall';
}

/**
 * Pre-computed weights for hourly forecasts (short-range)
 * Slight boost (+5% relative) to top performers for lower baseline variance
 */
export const HOURLY_WEIGHTS: Record<string, number> = {
  'AccuWeather': 0.20,
  'Tomorrow.io': 0.28,
  'NOAA': 0.20,
  'Open-Meteo': 0.18,
  'OpenWeatherMap': 0.14,
};

/**
 * Pre-computed weights for daily/7-day forecasts (mid-range)
 * Use with decay factor for days 4+: decay = 1 / (1 + day_index * 0.05)
 * 
 * Refined 2025 weights from ForecastWatch relative points % (2024 global 1-14 days):
 * - Tomorrow.io boosted for NOAA partnership & 20-30% precision claims
 * - Open-Meteo adjusted for 22% participation rate
 */
export const DAILY_WEIGHTS: Record<string, number> = {
  'AccuWeather': 0.19,
  'Tomorrow.io': 0.23,
  'NOAA': 0.21,
  'Open-Meteo': 0.24,
  'OpenWeatherMap': 0.13,
};

/**
 * Calculate variance-minimizing weights from accuracy data
 * Based on actuarial portfolio optimization principles
 */
export function calculateSourceWeights(): Record<string, SourceAccuracy> {
  const sources: Record<string, SourceAccuracy> = {};
  
  // Step 1: Calculate σ from accuracy using inverse normal
  // Accuracy p = P(error ≤ 3°F), so 3 = z * σ where z = normPpf((1 + p) / 2)
  for (const [name, accuracy] of Object.entries(SOURCE_ACCURACY_DATA)) {
    const z = normPpf((1 + accuracy) / 2);
    const stdDev = 3 / z; // Tolerance of ±3°F
    sources[name] = { name, accuracy, stdDev, weight: 0 };
  }
  
  // Step 2: Calculate variance-minimizing weights
  // w_i = (1 / σ_i²) / Σ(1 / σ_j²)
  const inverseVariances = Object.values(sources).map(s => 1 / (s.stdDev * s.stdDev));
  const totalInverseVariance = inverseVariances.reduce((a, b) => a + b, 0);
  
  let i = 0;
  for (const source of Object.values(sources)) {
    source.weight = inverseVariances[i] / totalInverseVariance;
    i++;
  }
  
  return sources;
}

// Pre-computed weights for runtime efficiency
export const SOURCE_WEIGHTS = calculateSourceWeights();

/**
 * Calculate ensemble standard deviation from individual source variances
 * Under independence: σ_ensemble = √(Σ(w_i² * σ_i²))
 * 
 * This gives us the expected ~0.97°F uncertainty vs ~2°F for any single source
 */
export function calculateEnsembleStdDev(): number {
  let sumWeightedVariance = 0;
  for (const source of Object.values(SOURCE_WEIGHTS)) {
    sumWeightedVariance += source.weight * source.weight * source.stdDev * source.stdDev;
  }
  return Math.sqrt(sumWeightedVariance);
}

export const ENSEMBLE_STD_DEV = calculateEnsembleStdDev();

/**
 * 20-City Seasonal Bias Corrections — Kalshi Settlement Stations
 * 
 * These bias values are applied to TW ensemble forecasts for Kalshi-critical cities.
 * Based on historical regression of TW forecast vs observed METAR high temperatures.
 * 
 * Source: Mia Zhao strategic analysis (2026-04-04), backtested against 2024-2026 data
 * Positive = forecast runs cold (add bias to warm up)
 * Negative = forecast runs hot (subtract bias to cool down)
 * 
 * Station mapping verified against Kalshi 2026 settlement specs.
 */
export interface CityBiasCorrection {
  stationId: string;
  kalshiCode: string;
  city: string;
  winter: number;  // Dec-Feb
  spring: number;  // Mar-May
  summer: number;  // Jun-Aug
  fall: number;    // Sep-Nov
}

/**
 * Lookup: Station ID → Seasonal Bias Correction
 */
export const KALSHI_CITY_BIASES: Record<string, CityBiasCorrection> = {
  KNYC: { stationId: 'KNYC', kalshiCode: 'nyc', city: 'New York', winter: 1.2, spring: 0.8, summer: -0.5, fall: 1.0 },
  KBOS: { stationId: 'KBOS', kalshiCode: 'bos', city: 'Boston', winter: 1.5, spring: 1.0, summer: -0.3, fall: 1.2 },
  KPHL: { stationId: 'KPHL', kalshiCode: 'phl', city: 'Philadelphia', winter: 1.0, spring: 0.7, summer: -0.4, fall: 0.9 },
  KDCA: { stationId: 'KDCA', kalshiCode: 'dc', city: 'Washington DC', winter: 0.9, spring: 0.6, summer: -0.6, fall: 0.8 },
  KMIA: { stationId: 'KMIA', kalshiCode: 'mia', city: 'Miami', winter: -0.3, spring: -0.2, summer: 0.4, fall: -0.1 },
  KORD: { stationId: 'KORD', kalshiCode: 'chi', city: 'Chicago', winter: 1.8, spring: 1.2, summer: -0.7, fall: 1.4 },
  KDFW: { stationId: 'KDFW', kalshiCode: 'dal', city: 'Dallas', winter: 0.6, spring: 0.3, summer: -0.8, fall: 0.5 },
  KHOU: { stationId: 'KHOU', kalshiCode: 'hou', city: 'Houston', winter: 0.4, spring: 0.2, summer: -0.5, fall: 0.3 },
  KLAX: { stationId: 'KLAX', kalshiCode: 'lax', city: 'Los Angeles', winter: -0.2, spring: -0.1, summer: 0.3, fall: -0.1 },
  KSFO: { stationId: 'KSFO', kalshiCode: 'sfo', city: 'San Francisco', winter: -0.4, spring: -0.3, summer: 0.5, fall: -0.2 },
  KSEA: { stationId: 'KSEA', kalshiCode: 'sea', city: 'Seattle', winter: 0.7, spring: 0.5, summer: -0.2, fall: 0.6 },
  KDEN: { stationId: 'KDEN', kalshiCode: 'den', city: 'Denver', winter: 1.4, spring: 0.9, summer: -0.6, fall: 1.1 },
  KPHX: { stationId: 'KPHX', kalshiCode: 'phx', city: 'Phoenix', winter: -0.5, spring: -0.3, summer: 0.6, fall: -0.4 },
  KMSP: { stationId: 'KMSP', kalshiCode: 'msp', city: 'Minneapolis', winter: 2.0, spring: 1.5, summer: -0.9, fall: 1.6 },
  KATL: { stationId: 'KATL', kalshiCode: 'atl', city: 'Atlanta', winter: 0.5, spring: 0.3, summer: -0.4, fall: 0.4 },
  KDTW: { stationId: 'KDTW', kalshiCode: 'det', city: 'Detroit', winter: 1.6, spring: 1.1, summer: -0.6, fall: 1.3 },
  KLAS: { stationId: 'KLAS', kalshiCode: 'lv', city: 'Las Vegas', winter: -0.3, spring: -0.2, summer: 0.5, fall: -0.2 },
  KPDX: { stationId: 'KPDX', kalshiCode: 'pdx', city: 'Portland', winter: 0.8, spring: 0.6, summer: -0.3, fall: 0.7 },
  KSAN: { stationId: 'KSAN', kalshiCode: 'san', city: 'San Diego', winter: -0.1, spring: 0.0, summer: 0.2, fall: 0.0 },
  KCLT: { stationId: 'KCLT', kalshiCode: 'clt', city: 'Charlotte', winter: 0.7, spring: 0.4, summer: -0.3, fall: 0.6 },
};

/**
 * Get bias correction for a Kalshi settlement station
 * @param stationId - ICAO station ID (e.g., 'KNYC')
 * @param season - Season key: 'winter' | 'spring' | 'summer' | 'fall'
 * @returns Bias in °F to apply to TW forecast (0 if no bias for this station)
 */
export function getKalshiStationBias(stationId: string, season?: string): number {
  const bias = KALSHI_CITY_BIASES[stationId];
  if (!bias) return 0;
  
  const seasonKey = season || getCurrentSeason();
  return bias[seasonKey as keyof typeof bias] ?? 0;
}

/**
 * Apply Kalshi station bias correction to a forecast value
 * @param forecastTemp - Current forecast temperature (°F)
 * @param stationId - ICAO station ID
 * @param season - Season key (optional, defaults to current)
 * @returns Bias-corrected temperature
 */
export function applyKalshiStationBias(forecastTemp: number, stationId: string, season?: string): number {
  const bias = getKalshiStationBias(stationId, season);
  return forecastTemp + bias;
}

/**
 * Get weight for a specific weather source
 * Falls back to equal weighting if source not found
 * 
 * @param sourceName - Name of the weather source
 * @param totalSources - Total number of sources for fallback calculation
 * @param forecastType - 'hourly' or 'daily' to use appropriate weights
 */
export function getSourceWeight(
  sourceName: string, 
  totalSources: number = 5,
  forecastType: 'hourly' | 'daily' = 'daily'
): number {
  // Use pre-computed weights for the appropriate forecast type
  const weights = forecastType === 'hourly' ? HOURLY_WEIGHTS : DAILY_WEIGHTS;
  const weight = weights[sourceName];
  if (weight != null) return weight;
  
  // Try the general source weights
  const source = SOURCE_WEIGHTS[sourceName];
  if (source) return source.weight;
  
  // Fallback to equal weighting
  return 1 / totalSources;
}

/**
 * Calculate horizon decay factor for daily forecasts
 * Increases effective σ for longer forecast horizons (actuarial principle)
 * 
 * @param dayIndex - 0 = today, 1 = tomorrow, etc.
 */
export function getHorizonDecay(dayIndex: number): number {
  return 1 / (1 + dayIndex * 0.05);
}

/**
 * Get adjusted standard deviation for a forecast horizon
 * SD increases with day index (actuarial uncertainty growth)
 * 
 * @param dayIndex - 0 = today, 1 = tomorrow, etc.
 * @param baseSd - Base standard deviation (default: ENSEMBLE_STD_DEV)
 * @returns Horizon-adjusted SD (grows for longer forecasts)
 */
export function getAdjustedSd(dayIndex: number, baseSd: number = ENSEMBLE_STD_DEV): number {
  // Effective sd grows as horizon increases (inverse of decay)
  return baseSd / getHorizonDecay(dayIndex);
}

/**
 * Confidence interval result for ensemble calculations
 */
export interface ConfidenceInterval {
  value: number;
  ci: [number, number];  // 95% CI [low, high]
  ciStd: number;         // Standard deviation used
}

/**
 * Calculate weighted ensemble with 95% confidence interval
 * For UI display (e.g., "72° ±1.2°F 95% CI")
 * 
 * @param predictions - Array of { source: string, value: number }
 * @param dayIndex - Forecast horizon (0 = today) for SD adjustment
 * @returns Ensemble value with confidence interval
 */
export function calculateWeightedEnsembleWithCI(
  predictions: Array<{ source: string; value: number }>,
  dayIndex: number = 0
): ConfidenceInterval {
  if (predictions.length === 0) {
    return { value: 0, ci: [0, 0], ciStd: 0 };
  }
  
  let weightedSum = 0;
  let totalWeight = 0;
  let weightedVarianceSum = 0;
  
  for (const pred of predictions) {
    const weight = getSourceWeight(pred.source, predictions.length);
    const source = SOURCE_WEIGHTS[pred.source];
    const variance = source ? source.stdDev * source.stdDev : 2.25; // Default 1.5°F sd
    
    weightedSum += pred.value * weight;
    totalWeight += weight;
    weightedVarianceSum += weight * weight * variance;
  }
  
  // Normalize value
  const value = weightedSum / totalWeight;
  
  // Adjusted SD for horizon
  const baseSd = Math.sqrt(weightedVarianceSum);
  const adjustedSd = getAdjustedSd(dayIndex, baseSd);
  
  // 95% CI = ±1.96 * SD
  const margin = 1.96 * adjustedSd;
  const ci: [number, number] = [
    Math.round((value - margin) * 10) / 10,
    Math.round((value + margin) * 10) / 10
  ];
  
  return { value, ci, ciStd: adjustedSd };
}

/**
 * Calculate weighted average from multiple source predictions
 * Uses variance-minimizing weights for optimal ensemble
 * 
 * @param predictions - Array of { source: string, value: number }
 * @returns Weighted ensemble value
 */
export function calculateWeightedEnsemble(
  predictions: Array<{ source: string; value: number }>
): number {
  if (predictions.length === 0) return 0;
  
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const pred of predictions) {
    const weight = getSourceWeight(pred.source, predictions.length);
    weightedSum += pred.value * weight;
    totalWeight += weight;
  }
  
  // Normalize in case not all sources are available
  return weightedSum / totalWeight;
}

/**
 * Calculate probability of temperature being in a range [low, high]
 * using normal distribution with given mean and standard deviation
 */
export function calculateRangeProbability(
  low: number,
  high: number,
  mean: number,
  stdDev: number
): number {
  return normCdf(high + 0.5, mean, stdDev) - normCdf(low - 0.5, mean, stdDev);
}

/**
 * Calculate probability of temperature being below threshold
 */
export function calculateBelowProbability(
  threshold: number,
  mean: number,
  stdDev: number
): number {
  return normCdf(threshold + 0.5, mean, stdDev);
}

/**
 * Calculate probability of temperature being above threshold
 */
export function calculateAboveProbability(
  threshold: number,
  mean: number,
  stdDev: number
): number {
  return 1 - normCdf(threshold - 0.5, mean, stdDev);
}

/**
 * Ensemble bias correction constant
 * 
 * IMPORTANT: Backend calibration (simple-forecast edge function) now handles
 * all temperature bias corrections. Frontend should NOT add additional bias
 * to avoid double-correction.
 * 
 * Backend calibration (2026-01-27):
 * - Cold (<40°F): -7.0°F (we over-predict)
 * - Moderate (40-60°F): -3.0°F (we over-predict)
 * - Warm (>60°F): -2.0°F (we over-predict)
 * 
 * Set to 0 to disable frontend bias correction.
 */
export const ENSEMBLE_BIAS_CORRECTION = 0; // °F - backend handles calibration

/**
 * Apply bias correction to a temperature forecast
 * 
 * For Kalshi settlement stations, applies station-specific seasonal bias on top of 
 * the global ensemble correction. This is the 20-city bias baked into the pipeline.
 * 
 * NOTE: With backend calibration, the global correction is typically 0. Station biases
 * are additive refinements for Kalshi-critical cities.
 * 
 * @param rawTemp - Raw temperature forecast from ensemble (°F)
 * @param bias - Global bias correction in °F (default: ENSEMBLE_BIAS_CORRECTION)
 * @param stationId - Optional Kalshi station ID (e.g., 'KNYC') for city-specific bias
 * @param season - Optional season key for seasonal bias lookup
 * @returns Bias-corrected temperature
 */
export function applyBiasCorrection(rawTemp: number, bias: number = ENSEMBLE_BIAS_CORRECTION, stationId?: string, season?: string): number {
  let corrected = rawTemp + bias;
  
  // Apply Kalshi station-specific bias if station ID is provided
  if (stationId) {
    const stationBias = getKalshiStationBias(stationId, season);
    if (stationBias !== 0) {
      corrected += stationBias;
      console.log(`[Bias] ${stationId}: global=${bias.toFixed(1)}°F, station=${stationBias.toFixed(1)}°F, total=${(rawTemp - corrected + stationBias + bias).toFixed(1)}°F`);
    }
  }
  
  return corrected;
}

/**
 * Beta CDF (cumulative distribution function)
 * Continued fraction approximation accurate to ~1e-8
 * Used for precipitation probabilities in Kalshi markets (proportions 0-1)
 *
 * @param x - Value at which to evaluate CDF (0 ≤ x ≤ 1)
 * @param alpha - Shape parameter α > 0 (mean-skew)
 * @param beta - Shape parameter β > 0 (variance-skew)
 * @returns P(X ≤ x)
 */
export function betaCdf(x: number, alpha: number, beta: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (alpha <= 0 || beta <= 0) throw new Error('Alpha and beta must be positive');

  // Regularized incomplete beta via continued fraction (Lanczos approx for gamma)
  const a = alpha;
  const b = beta;
  const bt = Math.exp(gamLn(a + b) - gamLn(a) - gamLn(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  } else {
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
}

// Helper: Log gamma function (Lanczos approximation)
function gamLn(z: number): number {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  const stp = 2.5066282746310005;
  let x = z;
  let y = x;
  let tmp = x + 5.5;
  tmp = (x + 0.5) * Math.log(tmp) - tmp;
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return tmp + Math.log(stp * ser / x);
}

// Helper: Continued fraction for incomplete beta
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 100;
  const EPS = 3e-8;
  const FPMIN = Number.MIN_VALUE / EPS;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  let m2, aa, del;
  for (let m = 1; m <= MAXIT; m++) {
    m2 = 2 * m;
    aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    del = d * c;
    h *= del;
    if (Math.abs(del - 1) <= EPS) break;
  }
  return h;
}

/**
 * Calculate probability of precipitation being above threshold
 * For Kalshi rain markets (e.g., P(>=0.1in))
 * Uses Beta distribution for bounded proportions (0-1)
 *
 * @param threshold - Rain amount threshold (0-1 normalized)
 * @param mu - Mean precip prob (0-1 from ensemble)
 * @param scale - Shape scale for variance match (~20 for tight dist matching ~15% σ reduction)
 * @returns P(precip >= threshold)
 */
export function precipAboveProbability(threshold: number, mu: number, scale: number = 20): number {
  if (mu <= 0) return 0;
  if (mu >= 1) return 1;
  // Clamp threshold to valid range
  const t = Math.max(0, Math.min(1, threshold));
  const alpha = mu * scale;
  const beta = (1 - mu) * scale;
  return 1 - betaCdf(t, alpha, beta);
}

/**
 * Calculate rain probability using Beta CDF for Kalshi markets
 * Models uncertainty in precipitation forecasts using Beta distribution
 * 
 * @param rainChance - Ensemble rain chance (0-100)
 * @param scale - Shape scale (default 20 for ~15% σ reduction match)
 * @returns Actuarial rain probability (0-100)
 */
export function calculateActuarialRainProbability(rainChance: number, scale: number = 20): number {
  const mu = Math.max(0.01, Math.min(0.99, rainChance / 100)); // Clamp to avoid edge cases
  // For "any rain" markets, use threshold of 0.01 (trace precipitation)
  const prob = precipAboveProbability(0.01, mu, scale);
  return Math.round(prob * 100);
}
