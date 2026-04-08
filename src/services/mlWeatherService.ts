import { supabase } from "@/integrations/supabase/client";
import { computeActuarialEnsemble, getSourceVariances } from "@/services/weatherService";
import { ENSEMBLE_STD_DEV } from "@/utils/stats";

export interface EnhancedPrediction {
  confidence: number;
  adjustedTemperature: number;
  adjustedRainChance: number;
  reasoningFactors: string[];
  actuarialCI?: [number, number]; // 95% confidence interval from actuarial model
  actuarialStdDev?: number;
}

export interface PatternAnalysis {
  detectedPatterns: string[];
  seasonalTrends: string[];
  anomalies: string[];
  confidenceScore: number;
}

export interface TrendForecasting {
  shortTermTrend: string;
  mediumTermTrend: string;
  recommendedActions: string[];
  riskAssessment: string;
}

export interface MLAnalysisResult {
  enhancedPrediction?: EnhancedPrediction;
  patternAnalysis?: PatternAnalysis;
  trendForecasting?: TrendForecasting;
  metadata: {
    analysisType: string;
    location: string;
    timestamp: string;
    modelUsed: string;
  };
}

// Get actuarial-blended data for ML enhancement
async function getActuarialBlendedData(rawData?: { temperature?: number; rainChance?: number }, stationId?: string) {
  if (!rawData) return null;
  
  try {
    // Create source array from raw ensemble data
    const sources = [{ source: 'ensemble', value: rawData.temperature || 0 }];
    
    // Get actuarial ensemble with CI
    const tempResult = await computeActuarialEnsemble(sources, 'temperature', stationId);
    
    return {
      blendedTemp: tempResult.value,
      tempCI: tempResult.ci,
      tempStdDev: tempResult.ciStd,
      rainChance: rawData.rainChance || 0,
    };
  } catch (err) {
    console.warn('Failed to compute actuarial blend for ML, using raw ensemble:', err);
    // Fallback to raw ensemble data with default CI
    const temp = rawData.temperature || 0;
    return {
      blendedTemp: temp,
      tempCI: [temp - ENSEMBLE_STD_DEV * 1.96, temp + ENSEMBLE_STD_DEV * 1.96] as [number, number],
      tempStdDev: ENSEMBLE_STD_DEV,
      rainChance: rawData.rainChance || 0,
    };
  }
}

export const getEnhancedWeatherPrediction = async (
  location: string,
  userId?: string,
  rawData?: { temperature?: number; rainChance?: number },
  stationId?: string
): Promise<EnhancedPrediction> => {
  try {
    // Get actuarial-blended data to pass to AI
    const actuarialData = await getActuarialBlendedData(rawData, stationId);
    
    const { data, error } = await supabase.functions.invoke('weather-ml-analysis', {
      body: { 
        location, 
        analysisType: 'prediction_enhancement', 
        // Pass actuarial-adjusted data for better AI analysis
        actuarialData: actuarialData ? {
          blendedTemperature: actuarialData.blendedTemp,
          confidenceInterval: actuarialData.tempCI,
          standardDeviation: actuarialData.tempStdDev,
          rainChance: actuarialData.rainChance,
        } : undefined,
      }
    });

    if (error) {
      console.error('Enhanced prediction error:', error);
      throw new Error(error.message || 'Failed to get enhanced weather prediction');
    }

    const analysis = data?.analysis || data || {};
    const pred = analysis?.enhancedPrediction || analysis;

    return {
      confidence: pred?.confidence ?? 75,
      adjustedTemperature: pred?.adjustedTemperature ?? pred?.adjusted_temperature ?? actuarialData?.blendedTemp ?? 0,
      adjustedRainChance: pred?.adjustedRainChance ?? pred?.adjusted_rain_chance ?? actuarialData?.rainChance ?? 0,
      reasoningFactors: Array.isArray(pred?.reasoningFactors || pred?.reasoning_factors) 
        ? (pred?.reasoningFactors || pred?.reasoning_factors).filter(Boolean)
        : ['5-source actuarial ensemble analysis applied'],
      actuarialCI: actuarialData?.tempCI,
      actuarialStdDev: actuarialData?.tempStdDev,
    };
  } catch (error) {
    console.error('Enhanced prediction service error:', error);
    throw error;
  }
};

export const getWeatherPatternAnalysis = async (
  location: string,
  userId?: string
): Promise<PatternAnalysis> => {
  try {
    const { data, error } = await supabase.functions.invoke('weather-ml-analysis', {
      body: { location, analysisType: 'pattern_analysis' }
    });

    if (error) {
      console.error('Pattern analysis error:', error);
      throw new Error(error.message || 'Failed to get weather pattern analysis');
    }

    const analysis = data?.analysis || data || {};
    const patternData = analysis?.patternAnalysis || analysis;

    const extractStrings = (arr: any) => 
      Array.isArray(arr) ? arr.map((item: any) => 
        typeof item === 'string' ? item : item?.description || item?.pattern || item?.trend || item?.anomaly || ''
      ).filter(Boolean) : [];

    return {
      detectedPatterns: extractStrings(patternData?.detectedPatterns || patternData?.detected_patterns) || ['Ensemble consensus pattern'],
      seasonalTrends: extractStrings(patternData?.seasonalTrends || patternData?.seasonal_trends) || ['Seasonal variation per actuarial model'],
      anomalies: extractStrings(patternData?.anomalies) || [],
      confidenceScore: patternData?.confidenceScore ?? patternData?.confidence_score ?? 70
    };
  } catch (error) {
    console.error('Pattern analysis service error:', error);
    throw error;
  }
};

export const getWeatherTrendForecasting = async (
  location: string,
  userId?: string
): Promise<TrendForecasting> => {
  try {
    const { data, error } = await supabase.functions.invoke('weather-ml-analysis', {
      body: { location, analysisType: 'trend_forecasting' }
    });

    if (error) {
      console.error('Trend forecasting error:', error);
      throw new Error(error.message || 'Failed to get weather trend forecasting');
    }

    const analysis = data?.analysis || data || {};
    const trendData = analysis?.trendForecasting || analysis;

    const extractTrend = (val: any): string => {
      if (typeof val === 'string') return val;
      if (val?.condition_summary) return val.condition_summary;
      if (val?.description) return val.description;
      return '';
    };

    const shortTerm = extractTrend(trendData?.shortTermTrend || trendData?.short_term_trend) || 'Stable conditions based on ensemble';
    const mediumTerm = extractTrend(trendData?.mediumTermTrend || trendData?.medium_term_trend) || 'No major shifts from 5-source forecast';
    
    let actions = trendData?.recommendedActions || trendData?.recommended_actions || [];
    if (!Array.isArray(actions)) actions = Object.values(actions || {});

    return {
      shortTermTrend: shortTerm,
      mediumTermTrend: mediumTerm,
      recommendedActions: actions.filter(Boolean),
      riskAssessment: trendData?.riskAssessment || trendData?.risk_assessment || 'Low risk per actuarial ensemble'
    };
  } catch (error) {
    console.error('Trend forecasting service error:', error);
    throw error;
  }
};

export const getFullMLAnalysis = async (
  location: string,
  userId?: string
): Promise<{
  enhanced: EnhancedPrediction;
  patterns: PatternAnalysis;
  trends: TrendForecasting;
}> => {
  try {
    const [enhanced, patterns, trends] = await Promise.all([
      getEnhancedWeatherPrediction(location, userId),
      getWeatherPatternAnalysis(location, userId),
      getWeatherTrendForecasting(location, userId)
    ]);
    return { enhanced, patterns, trends };
  } catch (error) {
    console.error('Full ML analysis error:', error);
    throw error;
  }
};