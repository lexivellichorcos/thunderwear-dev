import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp, Thermometer, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WeatherFeedbackProps {
  userId: string;
  type: 'clothing' | 'commute';
  location?: string;
}

export function WeatherFeedback({ userId, type, location }: WeatherFeedbackProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Reset submitted state after 24 hours (or on component remount)
  useEffect(() => {
    const resetKey = `weather_feedback_${userId}_${type}`;
    const lastSubmit = localStorage.getItem(resetKey);
    if (lastSubmit) {
      const elapsed = Date.now() - parseInt(lastSubmit, 10);
      if (elapsed > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(resetKey);
        setSubmitted(false);
      } else {
        setSubmitted(true);
      }
    }
  }, [userId, type]);

  const submitFeedback = async (rating: 'too_cold' | 'too_hot' | 'accurate') => {
    if (!userId) {
      toast.error('Please log in to submit feedback');
      return;
    }

    setSubmitting(true);
    
    // Retry logic with exponential backoff
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        // Get current preferences with feedback count
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('cold_tolerance, heat_tolerance, feedback_count')
          .eq('user_id', userId)
          .maybeSingle();

        let coldTolerance = prefs?.cold_tolerance ?? 50;
        let heatTolerance = prefs?.heat_tolerance ?? 50;
        const feedbackCount = (prefs?.feedback_count as number) ?? 0;

        // Dynamic decay factor: smaller adjustments as feedback accumulates
        // decay = 1 / (1 + count * 0.1), so after 10 feedbacks, delta is halved
        const decay = 1 / (1 + feedbackCount * 0.1);
        const coldDelta = 5 * decay;
        const heatDelta = 5 * decay;
        const accurateDelta = 2 * decay;

        // Adjust tolerances based on feedback with decay
        if (rating === 'too_cold') {
          coldTolerance = Math.max(0, coldTolerance - coldDelta);
        } else if (rating === 'too_hot') {
          heatTolerance = Math.max(0, heatTolerance - heatDelta);
        } else {
          // Accurate - slightly increase tolerances
          coldTolerance = Math.min(100, coldTolerance + accurateDelta);
          heatTolerance = Math.min(100, heatTolerance + accurateDelta);
        }

        // Upsert preferences with incremented feedback count
        const { error: prefsError } = await supabase
          .from('user_preferences')
          .upsert({
            user_id: userId,
            cold_tolerance: Math.round(coldTolerance),
            heat_tolerance: Math.round(heatTolerance),
            feedback_count: feedbackCount + 1,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (prefsError) throw prefsError;

        // Log feedback for actuarial analysis
        const { error: feedbackError } = await supabase
          .from('weather_feedback')
          .insert({
            user_id: userId,
            rating,
            feedback_type: type,
            location: location || null,
          });

        if (feedbackError) {
          console.warn('Failed to log feedback for analysis:', feedbackError);
          // Non-critical - continue
        }

        // Mark as submitted and store timestamp
        setSubmitted(true);
        const resetKey = `weather_feedback_${userId}_${type}`;
        localStorage.setItem(resetKey, Date.now().toString());

        toast.success(
          rating === 'accurate' 
            ? 'Thanks! Your preferences are well calibrated.' 
            : `Adjusting your ${rating === 'too_cold' ? 'cold' : 'heat'} sensitivity for better recommendations.`
        );

        // Trigger preference refresh
        window.dispatchEvent(new Event('preferences-updated'));
        break; // Success - exit retry loop

      } catch (err) {
        attempt++;
        console.error(`Feedback attempt ${attempt} failed:`, err);
        
        if (attempt >= maxRetries) {
          toast.error('Failed to save feedback after multiple attempts');
        } else {
          // Exponential backoff: 500ms, 1000ms, 2000ms
          await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
        }
      }
    }
    
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ThumbsUp className="h-3 w-3 text-green-500" />
        <span>Feedback saved</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">How does it feel?</span>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30"
          onClick={() => submitFeedback('too_cold')}
          disabled={submitting || submitted}
        >
          {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Thermometer className="h-3 w-3 mr-1" />}
          Cold
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30"
          onClick={() => submitFeedback('accurate')}
          disabled={submitting || submitted}
        >
          {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
          Right
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-900/30"
          onClick={() => submitFeedback('too_hot')}
          disabled={submitting || submitted}
        >
          {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Thermometer className="h-3 w-3 mr-1" />}
          Hot
        </Button>
      </div>
    </div>
  );
}
