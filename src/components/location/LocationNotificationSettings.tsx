import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, BellOff, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface FavoriteLocation {
  id: string;
  name: string;
  location_string: string;
  notification_enabled: boolean;
}

export const LocationNotificationSettings: React.FC = () => {
  const [locations, setLocations] = useState<FavoriteLocation[]>([]);
  const [globalNotifications, setGlobalNotifications] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadLocationSettings();
      checkNotificationPermission();
    }
  }, [user]);

  const loadLocationSettings = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('favorite_locations')
        .select('id, name, location_string, notification_enabled')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error loading location settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load notification settings',
        variant: 'destructive',
      });
    }
  };

  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      setGlobalNotifications(Notification.permission === 'granted');
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setGlobalNotifications(permission === 'granted');
      
      if (permission === 'granted') {
        toast({
          title: 'Notifications Enabled',
          description: 'You will now receive weather alerts for your favorite locations',
        });
      } else {
        toast({
          title: 'Notifications Denied',
          description: 'You can enable notifications in your browser settings',
          variant: 'destructive',
        });
      }
    }
  };

  const toggleLocationNotification = async (locationId: string, enabled: boolean) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('favorite_locations')
        .update({ notification_enabled: enabled })
        .eq('id', locationId);

      if (error) throw error;

      setLocations(prev => prev.map(loc => 
        loc.id === locationId ? { ...loc, notification_enabled: enabled } : loc
      ));

      toast({
        title: 'Success',
        description: `Notifications ${enabled ? 'enabled' : 'disabled'} for location`,
      });
    } catch (error) {
      console.error('Error updating notification settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update notification settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Please log in to manage notification settings</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Location Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global notification permission */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <Label className="font-medium">Browser Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Allow weather alerts to be sent to your browser
            </p>
          </div>
          <div className="flex items-center gap-2">
            {globalNotifications ? (
              <Badge variant="secondary" className="text-green-600">
                <Bell className="h-3 w-3 mr-1" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="destructive">
                <BellOff className="h-3 w-3 mr-1" />
                Disabled
              </Badge>
            )}
            {!globalNotifications && (
              <button
                onClick={requestNotificationPermission}
                className="text-xs text-primary hover:underline"
              >
                Enable
              </button>
            )}
          </div>
        </div>

        {/* Individual location settings */}
        {locations.length > 0 && (
          <div className="space-y-3">
            <Label className="font-medium">Location-Specific Notifications</Label>
            {locations.map((location) => (
              <div
                key={location.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="space-y-1">
                  <Label className="font-medium">{location.name}</Label>
                  <p className="text-sm text-muted-foreground">
                    {location.location_string}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={location.notification_enabled && globalNotifications}
                    onCheckedChange={(checked) => 
                      toggleLocationNotification(location.id, checked)
                    }
                    disabled={isLoading || !globalNotifications}
                  />
                  {!globalNotifications && (
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {locations.length === 0 && (
          <div className="text-center py-6">
            <p className="text-muted-foreground">
              No favorite locations yet. Add some locations to set up notifications.
            </p>
          </div>
        )}

        {!globalNotifications && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Notifications Disabled
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Enable browser notifications to receive weather alerts for your favorite locations.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};