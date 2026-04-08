import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { User, Mail, Calendar, MapPin, Camera, Save, Edit, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { FavoriteLocationsManager } from '@/components/location/FavoriteLocationsManager';
import { LocationNotificationSettings } from '@/components/location/LocationNotificationSettings';

interface UserProfile {
  id: string;
  user_id: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
  social_links?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface UserAuth {
  id: string;
  email?: string;
  created_at: string;
}

export default function EnhancedUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userAuth, setUserAuth] = useState<UserAuth | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    bio: '',
    location: '',
    website: '',
    twitter: '',
    linkedin: '',
    github: ''
  });
  const { toast } = useToast();

  const handleLocationSelect = (location: string) => {
    // For now, just log the location selection
    // In a full implementation, this could redirect to the main weather page
    console.log('Location selected from profile:', location);
    toast({
      title: "Location Selected",
      description: `Selected location: ${location}`,
    });
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserAuth({
        id: user.id,
        email: user.email,
        created_at: user.created_at
      });

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (profileData) {
        setProfile(profileData as UserProfile);
        const socialLinks = profileData.social_links as Record<string, any> || {};
        setFormData({
          username: profileData.username || '',
          full_name: profileData.full_name || '',
          bio: profileData.bio || '',
          location: profileData.location || '',
          website: profileData.website || '',
          twitter: socialLinks.twitter || '',
          linkedin: socialLinks.linkedin || '',
          github: socialLinks.github || ''
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userAuth) return;
    
    setSaving(true);
    try {
      const socialLinks = {
        twitter: formData.twitter,
        linkedin: formData.linkedin,
        github: formData.github
      };

      const profileUpdate = {
        user_id: userAuth.id,
        username: formData.username,
        full_name: formData.full_name,
        bio: formData.bio,
        location: formData.location,
        website: formData.website,
        social_links: socialLinks,
        updated_at: new Date().toISOString()
      };

      if (profile) {
        const { error } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('user_id', userAuth.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert(profileUpdate);
        
        if (error) throw error;
      }

      await loadProfile();
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Profile updated successfully"
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userAuth) return;

    try {
      // For now, we'll just show a message that avatar upload would be implemented
      // In a full implementation, you'd upload to Supabase Storage
      toast({
        title: "Avatar Upload",
        description: "Avatar upload feature would be implemented with Supabase Storage",
        variant: "default"
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Error",
        description: "Failed to upload avatar",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading profile...</div>
      </Card>
    );
  }

  console.log('EnhancedUserProfile rendering with userAuth:', userAuth);
  console.log('EnhancedUserProfile rendering with profile:', profile);

  return (
    <div className="space-y-6">
      {/* Section 1: User Preferences */}
      <Card className="max-w-2xl mx-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <User className="h-6 w-6" />
              User Preferences
            </h2>
            <Button
              variant={isEditing ? "outline" : "default"}
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? "Cancel" : <><Edit className="h-4 w-4 mr-2" />Edit</>}
            </Button>
          </div>

          <div className="space-y-6">
          {/* Avatar Section */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback>
                  {profile?.full_name?.charAt(0) || userAuth?.email?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              {isEditing && (
                <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1 cursor-pointer">
                  <Camera className="h-3 w-3" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {profile?.full_name || profile?.username || 'Anonymous User'}
              </h3>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Mail className="h-4 w-4" />
                {userAuth?.email}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Joined {userAuth?.created_at && format(new Date(userAuth.created_at), 'MMMM yyyy')}
              </div>
            </div>
          </div>

          {/* Basic Information */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username">Username</Label>
                {isEditing ? (
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="Enter username"
                  />
                ) : (
                  <div className="p-2 text-sm">{profile?.username || 'Not set'}</div>
                )}
              </div>
              <div>
                <Label htmlFor="full_name">Full Name</Label>
                {isEditing ? (
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Enter full name"
                  />
                ) : (
                  <div className="p-2 text-sm">{profile?.full_name || 'Not set'}</div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="bio">Bio</Label>
              {isEditing ? (
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="Tell us about yourself"
                  rows={3}
                />
              ) : (
                <div className="p-2 text-sm">{profile?.bio || 'No bio added yet'}</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="location">Location</Label>
                {isEditing ? (
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="City, Country"
                  />
                ) : (
                  <div className="p-2 text-sm flex items-center gap-1">
                    {profile?.location && <MapPin className="h-3 w-3" />}
                    {profile?.location || 'Not set'}
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                {isEditing ? (
                  <Input
                    id="website"
                    value={formData.website}
                    onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="https://your-website.com"
                  />
                ) : (
                  <div className="p-2 text-sm">
                    {profile?.website ? (
                      <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {profile.website}
                      </a>
                    ) : 'Not set'}
                  </div>
                )}
              </div>
            </div>

            {/* Social Links */}
            <div>
              <Label>Social Links</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div>
                  <Label htmlFor="twitter" className="text-xs">Twitter</Label>
                  {isEditing ? (
                    <Input
                      id="twitter"
                      value={formData.twitter}
                      onChange={(e) => setFormData(prev => ({ ...prev, twitter: e.target.value }))}
                      placeholder="@username"
                    />
                  ) : (
                    <div className="p-2 text-sm">
                      {(profile?.social_links as Record<string, any>)?.twitter ? (
                        <Badge variant="outline">@{(profile.social_links as Record<string, any>).twitter}</Badge>
                      ) : 'Not set'}
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="linkedin" className="text-xs">LinkedIn</Label>
                  {isEditing ? (
                    <Input
                      id="linkedin"
                      value={formData.linkedin}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))}
                      placeholder="username"
                    />
                  ) : (
                    <div className="p-2 text-sm">
                      {(profile?.social_links as Record<string, any>)?.linkedin ? (
                        <Badge variant="outline">{(profile.social_links as Record<string, any>).linkedin}</Badge>
                      ) : 'Not set'}
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="github" className="text-xs">GitHub</Label>
                  {isEditing ? (
                    <Input
                      id="github"
                      value={formData.github}
                      onChange={(e) => setFormData(prev => ({ ...prev, github: e.target.value }))}
                      placeholder="username"
                    />
                  ) : (
                    <div className="p-2 text-sm">
                      {(profile?.social_links as Record<string, any>)?.github ? (
                        <Badge variant="outline">{(profile.social_links as Record<string, any>).github}</Badge>
                      ) : 'Not set'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Profile'}
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
            )}
          </div>
        </div>
      </Card>

      {/* Section 2: Favorite Locations */}
      <Card className="max-w-2xl mx-auto">
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Heart className="h-6 w-6" />
              Favorite Locations
            </h2>
            <p className="text-muted-foreground mt-2">
              Manage your favorite weather locations and notification settings
            </p>
          </div>

          <div className="space-y-6">
            <FavoriteLocationsManager onLocationSelect={handleLocationSelect} />
            
            <Separator />
            
            <LocationNotificationSettings />
          </div>
        </div>
      </Card>
    </div>
  );
}