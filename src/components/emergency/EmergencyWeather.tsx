import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  AlertTriangle, 
  Shield, 
  Phone, 
  MapPin, 
  Clock, 
  X,
  Volume2,
  Siren,
  Zap,
  Wind,
  Thermometer,
  CloudRain
} from 'lucide-react';

interface EmergencyAlert {
  id: string;
  location: string;
  alert_type: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  risk_level: 'low' | 'minor' | 'moderate' | 'severe' | 'extreme';
  weather_data: any;
  emergency_guidance: any;
  acknowledged: boolean;
  dismissed: boolean;
  created_at: string;
  expires_at?: string;
}

interface EmergencyWeatherProps {
  location: string;
  displayName?: string;
  onEmergencyGuidance?: (guidance: any) => void;
}

// Utility function for proper name capitalization (same as used in header)
const capitalizeLocationName = (name: string) => {
  // Check if it's coordinates (lat,lng format) - more flexible pattern
  const coordPattern = /^[-]?\d+\.?\d*,\s*[-]?\d+\.?\d*$/;
  if (coordPattern.test(name.trim())) {
    return 'Current Location';
  }
  
  // Check if it's specifically our coordinate format
  if (name.includes('.') && name.includes(',') && name.split(',').length === 2) {
    const parts = name.split(',');
    const lat = parseFloat(parts[0].trim());
    const lng = parseFloat(parts[1].trim());
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return 'Current Location';
    }
  }
  
  const lowercaseWords = ["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "up", "but", "as", "if"];
  const stateAbbreviations = [
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
    "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
    "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc"
  ];
  return name
    .toLowerCase()
    .split(/(\s+|,)/)
    .map((part, index) => {
      if (part.match(/^\s+$/) || part === ",") return part;
      const word = part.trim();
      if (!word) return part;
      if (stateAbbreviations.includes(word)) return word.toUpperCase();
      if (index === 0 || !lowercaseWords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join("");
};

const EmergencyWeather: React.FC<EmergencyWeatherProps> = ({ 
  location, 
  displayName,
  onEmergencyGuidance 
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeAlerts, setActiveAlerts] = useState<EmergencyAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (user && location) {
      checkForEmergencyWeather();
      loadActiveAlerts();
      
      // Set up monitoring interval (every 5 minutes)
      const monitoringInterval = setInterval(() => {
        if (isMonitoring) {
          checkForEmergencyWeather();
        }
      }, 5 * 60 * 1000);

      return () => clearInterval(monitoringInterval);
    }
  }, [user, location, isMonitoring]);

  const checkForEmergencyWeather = async () => {
    setIsChecking(true);
    try {
      const { data: severeWeatherData } = await supabase.functions.invoke('severe-weather-tracker', {
        body: { location },
      });

      if (!severeWeatherData) return;

      setLastCheck(new Date());

      // Toast notification removed as per user request

      // Check if this is an emergency-level situation
      if (severeWeatherData.riskLevel === 'severe' || severeWeatherData.riskLevel === 'extreme') {
        await createEmergencyAlert(severeWeatherData);
        
        // Trigger emergency guidance
        onEmergencyGuidance?.(severeWeatherData.emergencyGuidance);
        
        // Show urgent notification
        toast({
          title: "⚠️ SEVERE WEATHER ALERT",
          description: `${severeWeatherData.riskLevel.toUpperCase()} risk detected for ${displayName ? capitalizeLocationName(displayName) : capitalizeLocationName(location)}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Emergency weather check failed:', error);
      toast({
        title: "❌ Emergency Check Failed",
        description: "Unable to check emergency weather. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const createEmergencyAlert = async (severeWeatherData: any) => {
    if (!user) return;

    try {
      // Check if we already have a recent alert for this location
      const { data: existingAlerts } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('location', location)
        .eq('dismissed', false)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()); // Last 2 hours

      if (existingAlerts && existingAlerts.length > 0) {
        return; // Don't create duplicate alerts
      }

      const { error } = await supabase.from('emergency_alerts').insert({
        user_id: user.id,
        location,
        alert_type: 'severe_weather',
        severity: severeWeatherData.alerts.length > 0 ? severeWeatherData.alerts[0].severity : 'severe',
        risk_level: severeWeatherData.riskLevel,
        weather_data: severeWeatherData,
        emergency_guidance: severeWeatherData.emergencyGuidance,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });

      if (error) throw error;

      loadActiveAlerts();
    } catch (error) {
      console.error('Failed to create emergency alert:', error);
    }
  };

  const loadActiveAlerts = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('dismissed', false)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      setActiveAlerts((data || []).map(alert => ({
        ...alert,
        severity: alert.severity as 'minor' | 'moderate' | 'severe' | 'extreme',
        risk_level: alert.risk_level as 'low' | 'minor' | 'moderate' | 'severe' | 'extreme'
      })));
    } catch (error) {
      console.error('Failed to load emergency alerts:', error);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ acknowledged: true })
        .eq('id', alertId);

      if (error) throw error;

      setActiveAlerts(prev => 
        prev.map(alert => 
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        )
      );

      toast({
        title: "Alert Acknowledged",
        description: "Emergency alert has been acknowledged.",
      });
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ dismissed: true })
        .eq('id', alertId);

      if (error) throw error;

      setActiveAlerts(prev => prev.filter(alert => alert.id !== alertId));

      toast({
        title: "Alert Dismissed",
        description: "Emergency alert has been dismissed.",
      });
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'extreme': return 'bg-red-900 text-white border-red-800';
      case 'severe': return 'bg-red-600 text-white border-red-500';
      case 'moderate': return 'bg-orange-500 text-white border-orange-400';
      default: return 'bg-yellow-500 text-black border-yellow-400';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'extreme': return <Siren className="w-5 h-5" />;
      case 'severe': return <AlertTriangle className="w-5 h-5" />;
      case 'moderate': return <Zap className="w-5 h-5" />;
      default: return <Volume2 className="w-5 h-5" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Emergency Monitoring Controls */}
      <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-600" />
            Emergency Weather Monitoring
          </CardTitle>
          <CardDescription>
            Automatic severe weather detection for {displayName ? capitalizeLocationName(displayName) : capitalizeLocationName(location)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Button
                onClick={() => setIsMonitoring(!isMonitoring)}
                variant={isMonitoring ? "default" : "outline"}
                size="sm"
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <Shield className="w-4 h-4" />
                {isMonitoring ? 'Monitoring Active' : 'Start Monitoring'}
              </Button>
              
              <Button
                onClick={checkForEmergencyWeather}
                variant="outline"
                size="sm"
                disabled={isChecking}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <AlertTriangle className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                {isChecking ? 'Checking...' : 'Check Now'}
              </Button>
            </div>
            
            {lastCheck && (
              <div className="text-sm text-muted-foreground flex items-center gap-1 justify-center sm:justify-start">
                <Clock className="w-3 h-3" />
                <span className="text-xs sm:text-sm">Last check: {formatTimeAgo(lastCheck.toISOString())}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Emergency Alerts */}
      {activeAlerts.map((alert) => (
        <Alert 
          key={alert.id} 
          className={`border-2 ${getSeverityColor(alert.severity)}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {getSeverityIcon(alert.severity)}
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <AlertTitle className="text-base sm:text-lg break-words">
                    {alert.risk_level.toUpperCase()} WEATHER RISK
                  </AlertTitle>
                </div>
                
                <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
                  {!alert.acknowledged && (
                    <Button
                      onClick={() => acknowledgeAlert(alert.id)}
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs w-full sm:w-auto"
                    >
                      Acknowledge
                    </Button>
                  )}
                  <Button
                    onClick={() => dismissAlert(alert.id)}
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs w-full sm:w-auto flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Dismiss
                  </Button>
                </div>
              </div>
              
              <AlertDescription className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 text-sm">
                   <div className="flex items-center gap-2">
                     <MapPin className="w-4 h-4 flex-shrink-0" />
                     <span className="break-words">{displayName ? capitalizeLocationName(displayName) : capitalizeLocationName(alert.location)}</span>
                   </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <span className="text-xs opacity-75">
                      {formatTimeAgo(alert.created_at)}
                    </span>
                  </div>
                </div>

                {alert.weather_data?.alerts && alert.weather_data.alerts.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-sm mb-1">Active Alerts:</p>
                    {alert.weather_data.alerts.slice(0, 2).map((weatherAlert: any, index: number) => (
                      <div key={index} className="text-xs bg-black/10 dark:bg-white/10 p-2 rounded mb-1 break-words">
                        <strong className="break-words">{weatherAlert.title}</strong>
                        <p className="mt-1 break-words">{weatherAlert.description.substring(0, 120)}...</p>
                      </div>
                    ))}
                  </div>
                )}

                {alert.weather_data?.hazards && alert.weather_data.hazards.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-sm mb-1">Identified Hazards:</p>
                    <div className="flex flex-wrap gap-1">
                      {alert.weather_data.hazards.slice(0, 4).map((hazard: any, index: number) => (
                        <Badge key={index} variant="secondary" className="text-xs break-words">
                          {hazard.type} ({hazard.severity}/10)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {alert.emergency_guidance?.immediateActions && (
                  <div className="mt-3 p-2 bg-white/20 dark:bg-black/20 rounded">
                    <p className="font-medium text-sm mb-1">⚠️ Immediate Actions:</p>
                    <ul className="text-xs space-y-1">
                      {alert.emergency_guidance.immediateActions.slice(0, 3).map((action: string, index: number) => (
                        <li key={index} className="flex items-start gap-1">
                          <span className="font-bold flex-shrink-0">•</span>
                          <span className="break-words">{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      ))}
    </div>
  );
};

export default EmergencyWeather;