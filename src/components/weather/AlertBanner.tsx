import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";

interface WeatherAlert {
  id: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  timestamp: Date;
}

interface AlertBannerProps {
  alerts: WeatherAlert[];
  onDismiss: (alertId: string) => void;
}

const getSeverityStyles = (severity: WeatherAlert['severity']) => {
  switch (severity) {
    case 'high':
      return 'border-destructive bg-destructive/10 text-destructive-foreground';
    case 'medium':
      return 'border-warning bg-warning/10 text-warning-foreground';
    case 'low':
      return 'border-storm bg-storm/10 text-storm-foreground';
    default:
      return 'border-muted bg-muted/10';
  }
};

export const AlertBanner = ({ alerts, onDismiss }: AlertBannerProps) => {
  const [visibleAlerts, setVisibleAlerts] = useState<WeatherAlert[]>([]);

  useEffect(() => {
    setVisibleAlerts(alerts);
  }, [alerts]);

  const handleDismiss = (alertId: string) => {
    setVisibleAlerts(prev => prev.filter(alert => alert.id !== alertId));
    onDismiss(alertId);
  };

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleAlerts.map((alert) => (
        <Alert key={alert.id} className={`${getSeverityStyles(alert.severity)} animate-in slide-in-from-top-2`}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between w-full">
            <div className="flex-1">
              <div className="font-medium">{alert.title}</div>
              <div className="text-sm opacity-90">{alert.description}</div>
              <div className="text-xs opacity-70 mt-1">
                {alert.timestamp.toLocaleTimeString()}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 ml-2"
              onClick={() => handleDismiss(alert.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};