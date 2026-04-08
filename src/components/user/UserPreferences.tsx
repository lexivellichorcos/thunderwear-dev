import React, { useState, useEffect, useRef, useCallback } from 'react';
import ApiKeyManager from '@/components/api/ApiKeyManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { LocationInput } from '@/components/weather/LocationInput';
import { LocationSearchInput } from '@/components/maps/LocationSearchInput';
import { Settings, User, Clock, Thermometer, Droplets, Wind, Car, Ruler, MapPin } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface UserPreferences {
  id?: string;
  location?: string;
  preferred_clothing_style: string;
  clothing_schedule?: {
    sunday: string;
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
  };
  gender: string;
  cold_tolerance: number;
  heat_tolerance: number;
  rain_sensitivity: number;
  wind_tolerance: number;
  commute_method: string;
  commute_duration: number;
  work_schedule_start: string;
  work_schedule_end: string;
  temperature_unit?: string;
  distance_unit?: string;
  commute_enabled?: boolean;
  commute_from_address?: string;
  commute_from_lat?: number;
  commute_from_lng?: number;
  commute_to_address?: string;
  commute_to_lat?: number;
  commute_to_lng?: number;
}

interface UserPreferencesProps {
  onPreferencesUpdate?: (preferences: UserPreferences) => void;
  locationInputClassName?: string;
}

const UserPreferences: React.FC<UserPreferencesProps> = ({ onPreferencesUpdate, locationInputClassName }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    preferred_clothing_style: 'business-casual',
    clothing_schedule: {
      sunday: 'casual',
      monday: 'business-casual',
      tuesday: 'business-casual', 
      wednesday: 'business-casual',
      thursday: 'business-casual',
      friday: 'business-casual',
      saturday: 'casual'
    },
    gender: 'unspecified',
    cold_tolerance: 5,
    heat_tolerance: 5,
    rain_sensitivity: 5,
    wind_tolerance: 5,
    commute_method: 'walking',
    commute_duration: 15,
    work_schedule_start: '09:00',
    work_schedule_end: '17:00',
    temperature_unit: 'fahrenheit',
    distance_unit: 'imperial',
  });

  // Debounced handlers for location inputs to prevent excessive updates
  const debouncedFromLocationUpdate = useRef<NodeJS.Timeout>();
  const debouncedToLocationUpdate = useRef<NodeJS.Timeout>();

  const handleFromLocationChange = useCallback((location: any) => {
    // Clear existing timeout
    if (debouncedFromLocationUpdate.current) {
      clearTimeout(debouncedFromLocationUpdate.current);
    }
    
    // Only update after user stops typing for 500ms
    debouncedFromLocationUpdate.current = setTimeout(() => {
      setPreferences(prev => ({
        ...prev,
        commute_from_address: location?.address || '',
        commute_from_lat: location?.lat || null,
        commute_from_lng: location?.lng || null
      }));
    }, 500);
  }, []);

  const handleToLocationChange = useCallback((location: any) => {
    // Clear existing timeout
    if (debouncedToLocationUpdate.current) {
      clearTimeout(debouncedToLocationUpdate.current);
    }
    
    // Only update after user stops typing for 500ms
    debouncedToLocationUpdate.current = setTimeout(() => {
      setPreferences(prev => ({
        ...prev,
        commute_to_address: location?.address || '',
        commute_to_lat: location?.lat || null,
        commute_to_lng: location?.lng || null
      }));
    }, 500);
  }, []);

  useEffect(() => {
    if (user && isOpen) {
      loadPreferences();
    }
  }, [user, isOpen]);

  const loadPreferences = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setPreferences({
          ...data,
          clothing_schedule: data.clothing_schedule ? (typeof data.clothing_schedule === 'string' 
            ? JSON.parse(data.clothing_schedule) 
            : data.clothing_schedule) : {
              sunday: 'casual',
              monday: 'business-casual',
              tuesday: 'business-casual', 
              wednesday: 'business-casual',
              thursday: 'business-casual',
              friday: 'business-casual',
              saturday: 'casual'
            },
          work_schedule_start: data.work_schedule_start || '09:00',
          work_schedule_end: data.work_schedule_end || '17:00',
          temperature_unit: data.temperature_unit || 'fahrenheit',
          distance_unit: data.distance_unit || 'imperial',
        });
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const savePreferences = async () => {
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to save preferences.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          ...preferences,
        }, {
          onConflict: 'user_id'
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Preferences saved!",
        description: "ThunderWear AI will now give you personalized advice! ⚡",
      });

      // Type-safe callback with proper data structure
      const processedData = {
        ...data,
        clothing_schedule: data.clothing_schedule ? (typeof data.clothing_schedule === 'string' 
          ? JSON.parse(data.clothing_schedule) 
          : data.clothing_schedule) : {
            sunday: 'casual',
            monday: 'business-casual',
            tuesday: 'business-casual', 
            wednesday: 'business-casual',
            thursday: 'business-casual',
            friday: 'business-casual',
            saturday: 'casual'
          }
      };
      onPreferencesUpdate?.(processedData);
      
      // Trigger a custom event to notify other components
      window.dispatchEvent(new CustomEvent('preferences-updated'));
      
      setIsOpen(false);
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error saving preferences",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getToleranceLabel = (value: number, type: string) => {
    const labels = {
      cold: ['Always Cold (need 75°F+)', 'Get Cold Easily (need 70°F+)', 'Prefer Warm (need 65°F+)', 'Slightly Sensitive (need 60°F+)', 'Average (comfortable to 50°F)', 'Pretty Hardy (comfortable to 45°F)', 'Cold Tolerant (comfortable to 40°F)', 'Very Hardy (comfortable to 30°F)', 'Love Cold (comfortable to 20°F)', 'Polar Bear (comfortable below 20°F)'],
      heat: ['Always Hot (max 70°F)', 'Get Hot Easily (max 75°F)', 'Prefer Cool (max 80°F)', 'Slightly Sensitive (max 85°F)', 'Average (comfortable to 90°F)', 'Pretty Hardy (comfortable to 95°F)', 'Heat Tolerant (comfortable to 100°F)', 'Very Hardy (comfortable to 105°F)', 'Love Heat (comfortable to 110°F)', 'Desert Dweller (comfortable above 110°F)'],
      rain: ['Hate Getting Wet', 'Avoid Light Rain', 'Light Drizzle OK', 'Light Rain OK', 'Moderate Rain OK', 'Heavy Rain OK', 'Don\'t Mind Rain', 'Like Rain', 'Love Storms', 'Storm Chaser'],
      wind: ['Hate Any Breeze', 'Light Air Only (5mph)', 'Light Breeze OK (10mph)', 'Gentle Breeze OK (15mph)', 'Moderate Wind OK (20mph)', 'Fresh Breeze OK (25mph)', 'Strong Wind OK (35mph)', 'High Wind OK (45mph)', 'Gale Force OK (55mph)', 'Any Wind OK']
    };
    return labels[type as keyof typeof labels]?.[value - 1] || 'Unknown';
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="weather" size="sm" className="text-white bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Preferences
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            ThunderWear AI Preferences
          </DialogTitle>
          <DialogDescription>
            Customize your weather preferences so ThunderWear AI can give you personalized advice!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={preferences.gender}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, gender: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
                    <SelectItem value="unspecified">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="clothing-style">Preferred Clothing Style</Label>
                <Select
                  value={preferences.preferred_clothing_style}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, preferred_clothing_style: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="business-casual">Business Casual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="sporty">Sporty</SelectItem>
                    <SelectItem value="athleisure">Athleisure</SelectItem>
                    <SelectItem value="trendy">Trendy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </CardContent>
          </Card>

          {/* Daily Clothing Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Daily Clothing Schedule
              </CardTitle>
              <CardDescription>
                Set different clothing styles for each day of the week
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day) => (
                <div key={day} className="flex items-center justify-between">
                  <Label className="capitalize font-medium min-w-[80px]">{day}</Label>
                  <Select
                    value={preferences.clothing_schedule?.[day as keyof typeof preferences.clothing_schedule] || 'casual'}
                    onValueChange={(value) => setPreferences(prev => ({
                      ...prev,
                      clothing_schedule: {
                        ...prev.clothing_schedule!,
                        [day]: value
                      }
                    }))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="business-casual">Business Casual</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="sporty">Sporty</SelectItem>
                      <SelectItem value="athleisure">Athleisure</SelectItem>
                      <SelectItem value="trendy">Trendy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Unit Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="w-5 h-5" />
                Unit Preferences
              </CardTitle>
              <CardDescription>
                Choose your preferred units for temperature and measurements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="temperature-unit">Temperature Unit</Label>
                <Select
                  value={preferences.temperature_unit}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, temperature_unit: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="fahrenheit">Fahrenheit (°F)</SelectItem>
                    <SelectItem value="celsius">Celsius (°C)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="distance-unit">Distance & Speed Unit</Label>
                <Select
                  value={preferences.distance_unit}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, distance_unit: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="imperial">Imperial (mph, mi)</SelectItem>
                    <SelectItem value="metric">Metric (km/h, km)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Weather Tolerances */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="w-5 h-5" />
                Weather Tolerances
              </CardTitle>
              <CardDescription>
                Help ThunderWear AI understand your comfort levels with different weather conditions. Scale: 1 = very sensitive, 10 = very tolerant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Cold Tolerance</Label>
                  <span className="text-sm text-muted-foreground">
                    {preferences.cold_tolerance}/10 - {getToleranceLabel(preferences.cold_tolerance, 'cold')}
                  </span>
                </div>
                <Slider
                  value={[preferences.cold_tolerance]}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, cold_tolerance: value[0] }))}
                  max={10}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Heat Tolerance</Label>
                  <span className="text-sm text-muted-foreground">
                    {preferences.heat_tolerance}/10 - {getToleranceLabel(preferences.heat_tolerance, 'heat')}
                  </span>
                </div>
                <Slider
                  value={[preferences.heat_tolerance]}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, heat_tolerance: value[0] }))}
                  max={10}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="flex items-center gap-2">
                    <Droplets className="w-4 h-4" />
                    Rain Sensitivity
                  </Label>
                  <span className="text-sm text-muted-foreground">
                    {preferences.rain_sensitivity}/10 - {getToleranceLabel(preferences.rain_sensitivity, 'rain')}
                  </span>
                </div>
                <Slider
                  value={[preferences.rain_sensitivity]}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, rain_sensitivity: value[0] }))}
                  max={10}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="flex items-center gap-2">
                    <Wind className="w-4 h-4" />
                    Wind Tolerance
                  </Label>
                  <span className="text-sm text-muted-foreground">
                    {preferences.wind_tolerance}/10 - {getToleranceLabel(preferences.wind_tolerance, 'wind')}
                  </span>
                </div>
                <Slider
                  value={[preferences.wind_tolerance]}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, wind_tolerance: value[0] }))}
                  max={10}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* Commute Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="w-5 h-5" />
                Commute & Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="commute-method">Primary Commute Method</Label>
                <Select
                  value={preferences.commute_method}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, commute_method: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walking">Walking</SelectItem>
                    <SelectItem value="cycling">Cycling</SelectItem>
                    <SelectItem value="public_transport">Public Transport</SelectItem>
                    <SelectItem value="driving">Driving</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="commute-duration">
                  Commute Duration: {preferences.commute_duration} minutes
                </Label>
                <Slider
                  value={[preferences.commute_duration]}
                  onValueChange={(value) => setPreferences(prev => ({ ...prev, commute_duration: value[0] }))}
                  max={120}
                  min={5}
                  step={5}
                  className="w-full mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="work-start">Work Start Time</Label>
                  <Input
                    type="time"
                    value={preferences.work_schedule_start}
                    onChange={(e) => setPreferences(prev => ({ ...prev, work_schedule_start: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="work-end">Work End Time</Label>
                  <Input
                    type="time"
                    value={preferences.work_schedule_end}
                    onChange={(e) => setPreferences(prev => ({ ...prev, work_schedule_end: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commute Locations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Commute Tracking
              </CardTitle>
              <CardDescription>
                Enable live traffic monitoring and commute time calculations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="commute-enabled">Enable Commute Tracking</Label>
                  <div className="text-sm text-muted-foreground">
                    Get real-time traffic updates and optimal departure times
                  </div>
                </div>
                <Switch
                  id="commute-enabled"
                  checked={preferences.commute_enabled || false}
                  onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, commute_enabled: checked }))}
                />
              </div>

              {preferences.commute_enabled && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label htmlFor="commute-from">Home/Starting Location</Label>
                    <LocationSearchInput
                      value={preferences.commute_from_address || ''}
                      onChange={handleFromLocationChange}
                      placeholder="Enter your home or starting location..."
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="commute-to">Work/Destination Location</Label>
                    <LocationSearchInput
                      value={preferences.commute_to_address || ''}
                      onChange={handleToLocationChange}
                      placeholder="Enter your work or destination location..."
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <ApiKeyManager />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={savePreferences} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserPreferences;