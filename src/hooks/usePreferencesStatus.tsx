import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const usePreferencesStatus = () => {
  const [hasPreferences, setHasPreferences] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const checkPreferences = async () => {
      if (!user) {
        setHasPreferences(false);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking preferences:', error);
        }

        setHasPreferences(!!data);
      } catch (error) {
        console.error('Error checking preferences:', error);
        setHasPreferences(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkPreferences();
  }, [user]);

  return { hasPreferences, isLoading };
};