import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, TrendingUp, Activity, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getFullMLAnalysis, EnhancedPrediction, PatternAnalysis, TrendForecasting } from "@/services/mlWeatherService";
import { toast } from "sonner";

interface MLAnalysisCardProps {
  location: string;
  trigger?: boolean; // State-based trigger from parent (replaces hacky dispatchEvent)
  onTriggerReset?: () => void; // Callback to reset trigger state
}

export const MLAnalysisCard = ({ location, trigger, onTriggerReset }: MLAnalysisCardProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<{
    enhanced?: EnhancedPrediction;
    patterns?: PatternAnalysis;
    trends?: TrendForecasting;
  }>({});

  // Handle state-based trigger from parent (preferred, replaces dispatchEvent)
  useEffect(() => {
    if (trigger && location) {
      runMLAnalysis();
      onTriggerReset?.(); // Reset trigger after handling
    }
  }, [trigger, location]);

  // Legacy: Listen for trigger event from Quick Actions (kept for backward compatibility)
  useEffect(() => {
    const handleTriggerAnalysis = () => {
      if (location) {
        runMLAnalysis();
      }
    };

    window.addEventListener('triggerMLAnalysis', handleTriggerAnalysis);
    return () => window.removeEventListener('triggerMLAnalysis', handleTriggerAnalysis);
  }, [location]);

  const runMLAnalysis = async () => {
    if (!location) {
      toast.error("Please enter a location first");
      return;
    }

    setLoading(true);
    try {
      console.log('Starting ML analysis for location:', location);
      const result = await getFullMLAnalysis(location, user?.id);
      console.log('Raw ML analysis result:', result);
      
      // Log the specific pattern analysis data
      if (result.patterns) {
        console.log('Pattern Analysis Raw Data:', result.patterns);
        console.log('detectedPatterns:', result.patterns.detectedPatterns);
        console.log('seasonalTrends:', result.patterns.seasonalTrends);
        console.log('anomalies:', result.patterns.anomalies);
        console.log('confidenceScore:', result.patterns.confidenceScore);
      } else {
        console.log('No pattern analysis data received');
      }
      
      // Log the specific trend data to see what's causing [object Object]
      if (result.trends) {
        console.log('Trends data:', result.trends);
        console.log('shortTermTrend type:', typeof result.trends.shortTermTrend, result.trends.shortTermTrend);
        console.log('mediumTermTrend type:', typeof result.trends.mediumTermTrend, result.trends.mediumTermTrend);
        console.log('riskAssessment type:', typeof result.trends.riskAssessment, result.trends.riskAssessment);
      }
      
      // Validate and sanitize the results
      const sanitizedAnalysis = {
        enhanced: result.enhanced ? {
          confidence: Number(result.enhanced.confidence) || 0,
          adjustedTemperature: Number(result.enhanced.adjustedTemperature) || 0,
          adjustedRainChance: Number(result.enhanced.adjustedRainChance) || 0,
          reasoningFactors: Array.isArray(result.enhanced.reasoningFactors) 
            ? result.enhanced.reasoningFactors 
            : typeof result.enhanced.reasoningFactors === 'string' 
              ? [result.enhanced.reasoningFactors] 
              : []
        } : undefined,
        patterns: result.patterns ? {
          detectedPatterns: Array.isArray(result.patterns.detectedPatterns) 
            ? result.patterns.detectedPatterns 
            : Array.isArray((result.patterns as any).analysis?.detectedPatterns)
              ? (result.patterns as any).analysis.detectedPatterns
              : typeof result.patterns.detectedPatterns === 'string'
                ? [result.patterns.detectedPatterns]
                : [],
          seasonalTrends: Array.isArray(result.patterns.seasonalTrends) 
            ? result.patterns.seasonalTrends 
            : Array.isArray((result.patterns as any).analysis?.seasonalTrends)
              ? (result.patterns as any).analysis.seasonalTrends
              : typeof result.patterns.seasonalTrends === 'string'
                ? [result.patterns.seasonalTrends]
                : [],
          anomalies: Array.isArray(result.patterns.anomalies) 
            ? result.patterns.anomalies 
            : Array.isArray((result.patterns as any).analysis?.anomalies)
              ? (result.patterns as any).analysis.anomalies
              : typeof result.patterns.anomalies === 'string'
                ? [result.patterns.anomalies]
                : [],
          confidenceScore: Number(result.patterns.confidenceScore) || Number((result.patterns as any).analysis?.confidenceScore) || 0
        } : undefined,
        trends: result.trends ? {
          shortTermTrend: (() => {
            if (typeof result.trends.shortTermTrend === 'string') {
              // If it's a string, try to parse it as JSON first
              try {
                const parsed = JSON.parse(result.trends.shortTermTrend);
                return `Period: ${parsed.period || 'N/A'}\n\nTemperature Trend: ${parsed.temperature_trend?.description || parsed.temperature_trend?.trend || 'N/A'} (Avg: ${parsed.temperature_trend?.average_temp}°F, Range: ${parsed.temperature_trend?.min_temp}°F - ${parsed.temperature_trend?.max_temp}°F)\n\nPrecipitation: ${parsed.precipitation_trend?.description || parsed.precipitation_trend?.trend || 'N/A'} (Avg chance: ${parsed.precipitation_trend?.average_rain_chance}%)\n\nWind & Humidity: ${parsed.wind_and_humidity?.description || 'N/A'}\n\nConfidence: ${parsed.confidence || 'N/A'}%`;
              } catch {
                return result.trends.shortTermTrend;
              }
            } else if (typeof result.trends.shortTermTrend === 'object' && result.trends.shortTermTrend !== null) {
              const trend = result.trends.shortTermTrend as any;
              return `Period: ${trend.period || 'N/A'}\n\nTemperature Trend: ${trend.temperature_trend?.description || trend.temperature_trend?.trend || 'N/A'} (Avg: ${trend.temperature_trend?.average_temp}°F, Range: ${trend.temperature_trend?.min_temp}°F - ${trend.temperature_trend?.max_temp}°F)\n\nPrecipitation: ${trend.precipitation_trend?.description || trend.precipitation_trend?.trend || 'N/A'} (Avg chance: ${trend.precipitation_trend?.average_rain_chance}%)\n\nWind & Humidity: ${trend.wind_and_humidity?.description || 'N/A'}\n\nConfidence: ${trend.confidence || 'N/A'}%`;
            }
            return String(result.trends.shortTermTrend || '');
          })(),
          mediumTermTrend: (() => {
            if (typeof result.trends.mediumTermTrend === 'string') {
              // If it's a string, try to parse it as JSON first
              try {
                const parsed = JSON.parse(result.trends.mediumTermTrend);
                return `Period: ${parsed.period || 'N/A'}\n\nTemperature Trend: ${parsed.temperature_trend?.description || parsed.temperature_trend?.trend || 'N/A'} (Avg: ${parsed.temperature_trend?.average_temp}°F, Range: ${parsed.temperature_trend?.min_temp}°F - ${parsed.temperature_trend?.max_temp}°F)\n\nPrecipitation: ${parsed.precipitation_trend?.description || parsed.precipitation_trend?.trend || 'N/A'} (Avg chance: ${parsed.precipitation_trend?.average_rain_chance}%, Amount: ${parsed.precipitation_trend?.precipitation_amount}" or less)\n\nWind & Humidity: ${parsed.wind_and_humidity?.description || 'N/A'}\n\nConfidence: ${parsed.confidence || 'N/A'}%`;
              } catch {
                return result.trends.mediumTermTrend;
              }
            } else if (typeof result.trends.mediumTermTrend === 'object' && result.trends.mediumTermTrend !== null) {
              const trend = result.trends.mediumTermTrend as any;
              return `Period: ${trend.period || 'N/A'}\n\nTemperature Trend: ${trend.temperature_trend?.description || trend.temperature_trend?.trend || 'N/A'} (Avg: ${trend.temperature_trend?.average_temp}°F, Range: ${trend.temperature_trend?.min_temp}°F - ${trend.temperature_trend?.max_temp}°F)\n\nPrecipitation: ${trend.precipitation_trend?.description || trend.precipitation_trend?.trend || 'N/A'} (Avg chance: ${trend.precipitation_trend?.average_rain_chance}%, Amount: ${trend.precipitation_trend?.precipitation_amount}" or less)\n\nWind & Humidity: ${trend.wind_and_humidity?.description || 'N/A'}\n\nConfidence: ${trend.confidence || 'N/A'}%`;
            }
            return String(result.trends.mediumTermTrend || '');
          })(),
          recommendedActions: Array.isArray(result.trends.recommendedActions) 
            ? result.trends.recommendedActions.map((action: any) => {
                if (typeof action === 'string') {
                  try {
                    const parsed = JSON.parse(action);
                    return parsed.recommendation || action;
                  } catch {
                    return action;
                  }
                }
                return typeof action === 'object' && action !== null 
                  ? (action as any).recommendation || Object.values(action).join(', ')
                  : String(action);
              })
            : typeof result.trends.recommendedActions === 'string'
              ? [result.trends.recommendedActions]
              : [],
          riskAssessment: typeof result.trends.riskAssessment === 'string' 
            ? (() => {
                try {
                  const parsed = JSON.parse(result.trends.riskAssessment);
                  return Object.entries(parsed).map(([key, value]) => `${key}: ${value}`).join('; ');
                } catch {
                  return result.trends.riskAssessment;
                }
              })()
            : typeof result.trends.riskAssessment === 'object' && result.trends.riskAssessment !== null
              ? ((result.trends.riskAssessment as any).weatherSensitiveActivities 
                  ? (result.trends.riskAssessment as any).weatherSensitiveActivities.map((activity: any) => {
                      console.log('Activity object:', activity);
                      const activityName = activity.activity || activity.name || 'Unknown activity';
                      const riskLevel = activity.riskLevel || activity.risk || 'Unknown risk';
                      const recommendation = activity.recommendation || activity.advice || 'No recommendation available';
                      return `${activityName}: ${riskLevel} - ${recommendation}`;
                    }).join('; ')
                  : Object.entries(result.trends.riskAssessment).map(([key, value]) => {
                      return `${key}: ${value || 'No data available'}`;
                    }).join('; '))
              : String(result.trends.riskAssessment || 'No risk assessment available')
        } : undefined
      };

      setAnalysis(sanitizedAnalysis);
      toast.success("ML analysis completed successfully");
    } catch (error) {
      console.error('ML Analysis error:', error);
      toast.error("Failed to complete ML analysis");
      setAnalysis({}); // Clear any partial data
    } finally {
      setLoading(false);
    }
  };

  const hasAnalysis = analysis.enhanced || analysis.patterns || analysis.trends;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Weather Analysis</CardTitle>
              <CardDescription className="text-sm mt-1">
                Advanced ML predictions and pattern analysis
              </CardDescription>
            </div>
          </div>
          <Button 
            onClick={runMLAnalysis} 
            disabled={loading}
            className="shrink-0"
            size="sm"
          >
            {loading ? (
              <>
                <Activity className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {hasAnalysis && (
        <CardContent className="pt-0">
          <Tabs defaultValue="trends" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="trends" className="text-sm">Trends</TabsTrigger>
              <TabsTrigger value="patterns" className="text-sm">Patterns</TabsTrigger>
              <TabsTrigger value="enhanced" className="text-sm">Enhanced</TabsTrigger>
            </TabsList>

            <TabsContent value="enhanced" className="space-y-6">
              {analysis.enhanced && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Enhanced Predictions</h3>
                    <Badge variant="secondary" className="px-3 py-1">
                      {analysis.enhanced.confidence}% Confidence
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border">
                      <div className="text-sm text-muted-foreground mb-1">Adjusted Temperature</div>
                      <div className="text-3xl font-bold text-primary">{analysis.enhanced.adjustedTemperature}°</div>
                    </div>
                    <div className="p-4 bg-gradient-to-br from-secondary/5 to-secondary/10 rounded-xl border">
                      <div className="text-sm text-muted-foreground mb-1">Rain Probability</div>
                      <div className="text-3xl font-bold text-secondary">{analysis.enhanced.adjustedRainChance}%</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Reasoning Factors</h4>
                    <div className="space-y-2">
                      {Array.isArray(analysis.enhanced.reasoningFactors) ? (
                        analysis.enhanced.reasoningFactors.map((factor, index) => (
                          <div key={index} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span>
                              {typeof factor === 'string' 
                                ? factor 
                                : typeof factor === 'object' && factor !== null
                                  ? Object.values(factor).join(', ')
                                  : String(factor)
                              }
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm p-2 bg-muted rounded">
                          <span>
                            {typeof analysis.enhanced.reasoningFactors === 'string' 
                              ? analysis.enhanced.reasoningFactors 
                              : typeof analysis.enhanced.reasoningFactors === 'object' && analysis.enhanced.reasoningFactors !== null
                                ? Object.values(analysis.enhanced.reasoningFactors).join(', ')
                                : 'No reasoning factors available'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="patterns" className="space-y-6">
              {analysis.patterns && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Pattern Analysis</h3>
                    <Badge variant="secondary" className="px-3 py-1">
                      {analysis.patterns.confidenceScore}% Confidence
                    </Badge>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Detected Patterns
                      </h4>
                      <div className="space-y-1">
                        {Array.isArray(analysis.patterns.detectedPatterns) ? (
                          analysis.patterns.detectedPatterns.map((pattern, index) => (
                            <div key={index} className="text-sm p-2 bg-muted rounded">
                              <span>
                                {typeof pattern === 'string' 
                                  ? pattern 
                                  : typeof pattern === 'object' && pattern !== null
                                    ? Object.values(pattern).join(', ')
                                    : String(pattern)
                                }
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm p-2 bg-muted rounded">
                            <span>
                              {typeof analysis.patterns.detectedPatterns === 'string' 
                                ? analysis.patterns.detectedPatterns 
                                : typeof analysis.patterns.detectedPatterns === 'object' && analysis.patterns.detectedPatterns !== null
                                  ? Object.values(analysis.patterns.detectedPatterns).join(', ')
                                  : 'No patterns detected'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Seasonal Trends
                      </h4>
                      <div className="space-y-1">
                        {Array.isArray(analysis.patterns.seasonalTrends) ? (
                          analysis.patterns.seasonalTrends.map((trend, index) => (
                            <div key={index} className="text-sm p-2 bg-muted rounded">
                              <span>
                                {typeof trend === 'string' 
                                  ? trend 
                                  : typeof trend === 'object' && trend !== null
                                    ? Object.values(trend).join(', ')
                                    : String(trend)
                                }
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm p-2 bg-muted rounded">
                            <span>
                              {typeof analysis.patterns.seasonalTrends === 'string' 
                                ? analysis.patterns.seasonalTrends 
                                : typeof analysis.patterns.seasonalTrends === 'object' && analysis.patterns.seasonalTrends !== null
                                  ? Object.values(analysis.patterns.seasonalTrends).join(', ')
                                  : 'No seasonal trends available'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {Array.isArray(analysis.patterns.anomalies) && analysis.patterns.anomalies.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          Anomalies Detected
                        </h4>
                        <div className="space-y-1">
                          {analysis.patterns.anomalies.map((anomaly, index) => (
                           <div key={index} className="text-sm p-2 bg-orange-50 border border-orange-200 rounded">
                             <span>
                               {typeof anomaly === 'string' 
                                 ? anomaly 
                                 : typeof anomaly === 'object' && anomaly !== null
                                   ? Object.values(anomaly).join(', ')
                                   : String(anomaly)
                               }
                             </span>
                           </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="trends" className="space-y-6">
              {analysis.trends && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Trend Forecasting</h3>

                  <div className="space-y-4">
                    {/* Recommended Actions - First */}
                    <div>
                      <h4 className="font-medium mb-2">Recommended Actions</h4>
                      <div className="space-y-2">
                        {Array.isArray(analysis.trends.recommendedActions) ? (
                          analysis.trends.recommendedActions.map((action, index) => (
                            <div key={index} className="flex items-start gap-2 text-sm">
                              <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <span>
                                {typeof action === 'string' 
                                  ? action 
                                  : typeof action === 'object' && action !== null
                                    ? Object.values(action).join(', ')
                                    : String(action)
                                }
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm p-2 bg-muted rounded">
                            {typeof analysis.trends.recommendedActions === 'string' 
                              ? analysis.trends.recommendedActions 
                              : 'No recommended actions available'}
                          </div>
                        )}
                      </div>
                    </div>

                     {/* Short-term Trend - Full Width */}
                     <div className="p-3 bg-muted rounded-lg w-full">
                       <h4 className="font-medium mb-2">Short-term Trend</h4>
                       <div className="text-sm whitespace-pre-line">
                         {typeof analysis.trends.shortTermTrend === 'string' 
                           ? analysis.trends.shortTermTrend 
                           : typeof analysis.trends.shortTermTrend === 'object' && analysis.trends.shortTermTrend !== null
                             ? Object.values(analysis.trends.shortTermTrend).join(', ')
                             : String(analysis.trends.shortTermTrend)
                         }
                       </div>
                     </div>

                     {/* Medium-term Trend - Full Width */}
                     <div className="p-3 bg-muted rounded-lg w-full">
                       <h4 className="font-medium mb-2">Medium-term Trend</h4>
                       <div className="text-sm whitespace-pre-line">
                         {typeof analysis.trends.mediumTermTrend === 'string' 
                           ? analysis.trends.mediumTermTrend 
                           : typeof analysis.trends.mediumTermTrend === 'object' && analysis.trends.mediumTermTrend !== null
                             ? Object.values(analysis.trends.mediumTermTrend).join(', ')
                             : String(analysis.trends.mediumTermTrend)
                         }
                       </div>
                     </div>

                    {/* Risk Assessment - Last */}
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        Risk Assessment
                      </h4>
                      <p className="text-sm">
                        {typeof analysis.trends.riskAssessment === 'string' 
                          ? analysis.trends.riskAssessment 
                          : typeof analysis.trends.riskAssessment === 'object' && analysis.trends.riskAssessment !== null
                            ? Object.values(analysis.trends.riskAssessment).join(', ')
                            : String(analysis.trends.riskAssessment)
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
};