import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, MapPin, Check, X, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface EmergencyAlert {
  id: string;
  alert_type: string;
  severity: string;
  risk_level: string;
  location: string;
  weather_data?: any;
  emergency_guidance?: any;
  acknowledged: boolean;
  dismissed: boolean;
  created_at: string;
  expires_at?: string;
}

export default function EmergencyAlertsHistory() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'acknowledged' | 'dismissed'>('all');
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    loadAlerts();
    
    // Set up real-time subscription for new alerts — filtered to this user
    const channel = supabase
      .channel('emergency-alerts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emergency_alerts',
          filter: `user_id=eq.${user?.id}`
        },
        () => {
          loadAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAlerts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlerts(data || []);
    } catch (error) {
      console.error('Error loading emergency alerts:', error);
      toast({
        title: "Error",
        description: "Failed to load emergency alerts",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const updateAlertStatus = async (id: string, updates: Partial<EmergencyAlert>) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setAlerts(prev => prev.map(alert => 
        alert.id === id ? { ...alert, ...updates } : alert
      ));
      
      toast({
        title: "Success",
        description: "Alert status updated"
      });
    } catch (error) {
      console.error('Error updating alert:', error);
      toast({
        title: "Error",
        description: "Failed to update alert status",
        variant: "destructive"
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'moderate': return 'secondary';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  const getRiskLevelIcon = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case 'extreme':
      case 'high':
        return '🔴';
      case 'moderate':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    switch (filter) {
      case 'active':
        return !alert.acknowledged && !alert.dismissed && 
               (!alert.expires_at || new Date(alert.expires_at) > new Date());
      case 'acknowledged':
        return alert.acknowledged;
      case 'dismissed':
        return alert.dismissed;
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading emergency alerts...</div>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Emergency Alerts
        </h3>
        
        <div className="flex gap-2 mt-3">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({alerts.length})
          </Button>
          <Button
            variant={filter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('active')}
          >
            Active ({alerts.filter(a => !a.acknowledged && !a.dismissed).length})
          </Button>
          <Button
            variant={filter === 'acknowledged' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('acknowledged')}
          >
            Acknowledged ({alerts.filter(a => a.acknowledged).length})
          </Button>
          <Button
            variant={filter === 'dismissed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('dismissed')}
          >
            Dismissed ({alerts.filter(a => a.dismissed).length})
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No emergency alerts</p>
              <p className="text-sm">Emergency alerts will appear here when weather conditions require attention</p>
            </div>
          ) : (
            filteredAlerts.map((alert) => (
              <Card 
                key={alert.id} 
                className={`p-4 ${
                  alert.severity === 'critical' ? 'border-red-500 bg-red-50 dark:bg-red-950/20' :
                  alert.severity === 'high' ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' :
                  'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getRiskLevelIcon(alert.risk_level)}</span>
                      <Badge variant={getSeverityColor(alert.severity) as any}>
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <Badge variant="outline">
                        {alert.alert_type.replace('_', ' ').toUpperCase()}
                      </Badge>
                      {alert.acknowledged && (
                        <Badge variant="secondary">Acknowledged</Badge>
                      )}
                      {alert.dismissed && (
                        <Badge variant="outline">Dismissed</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <MapPin className="h-3 w-3" />
                      {alert.location}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      {alert.expires_at && (
                        <span className="ml-2">
                          • Expires {formatDistanceToNow(new Date(alert.expires_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>

                    {alert.emergency_guidance && (
                      <div className="bg-background/50 rounded p-2 text-sm">
                        <strong>Guidance:</strong> {JSON.stringify(alert.emergency_guidance).substring(0, 100)}...
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    {!alert.acknowledged && !alert.dismissed && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateAlertStatus(alert.id, { acknowledged: true })}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateAlertStatus(alert.id, { dismissed: true })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}