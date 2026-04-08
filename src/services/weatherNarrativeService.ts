/**
 * AI Weather Narrative Generator
 * Generates human-readable weather explanation paragraphs for each city forecast
 * Uses GPT-4o-mini (via Supabase Edge Function) to create shareable narrative cards
 * 
 * Output: 2-3 sentence explanation of what's happening and why
 */

import { supabase } from "@/integrations/supabase/client";

export interface WeatherNarrative {
  city: string;
  narrative: string;
  tone: 'standard' | 'dramatic' | 'calm' | 'technical';
  generatedAt: string;
  confidence: number; // 0-1, based on forecast stdDev
}

const NARRATIVE_PROMPT = `You are a concise, engaging weather storyteller for Thunderwear.AI.

Given weather forecast data, write a 2-3 sentence human explanation that explains WHAT is happening and WHY. Make it feel like a brilliant meteorologist friend texting you.

Rules:
- 2-3 sentences max, 40-60 words total
- Explain the "why" (atmospheric mechanism), not just the "what"
- Use plain English, no jargon unless it's "technical" tone
- Be vivid but accurate
- NO emojis, NO markdown
- End with practical implication when relevant

Tone options:
- "standard": Friendly, informative, conversational
- "dramatic": More vivid, emphasizes stakes and conditions
- "calm": Reassuring, minimalist, zen
- "technical": Data-driven, precise, uses meteorological terms

Example (standard tone):
Input: NYC, high 42°F, low 28°F, 65% rain, overcast, northerly winds 12mph
Output: A cold front is sliding southward, dragging moisture-rich air from the Atlantic into the region. Expect steady, soaking rain from mid-afternoon onward—not a storm, just persistent precipitation that'll keep temps in the low 40s.

Now generate for: {city}, high {highTemp}°F, low {lowTemp}°F, {rainChance}% rain chance, {condition}, {windSpeed}mph winds from {windDir}, feels like {feelsLike}°F

Tone: {tone}
`;

/**
 * Generate AI narrative for a city's forecast
 * @param forecast - Forecast day data
 * @param city - City name
 * @param tone - Narrative tone (default: 'standard')
 * @returns Generated narrative or null if generation fails
 */
export async function generateWeatherNarrative(
  forecast: {
    maxTemp: number;
    minTemp: number;
    rainChance: number;
    condition: string;
    windSpeed?: number;
    windDir?: string;
    feelsLike?: number;
  },
  city: string,
  tone: WeatherNarrative['tone'] = 'standard'
): Promise<WeatherNarrative | null> {
  try {
    const prompt = NARRATIVE_PROMPT
      .replace('{city}', city)
      .replace('{highTemp}', forecast.maxTemp.toFixed(0))
      .replace('{lowTemp}', forecast.minTemp.toFixed(0))
      .replace('{rainChance}', forecast.rainChance.toFixed(0))
      .replace('{condition}', forecast.condition)
      .replace('{windSpeed}', (forecast.windSpeed ?? 'calm').toString())
      .replace('{windDir}', forecast.windDir ?? 'variable')
      .replace('{feelsLike}', (forecast.feelsLike ?? forecast.maxTemp).toFixed(0))
      .replace('{tone}', tone);

    const { data, error } = await supabase.functions.invoke('weather-narrative', {
      body: {
        prompt,
        tone,
        max_tokens: 150,
        temperature: 0.7,
      },
    });

    if (error) {
      console.error('Narrative generation error:', error);
      return null;
    }

    const narrative = data?.narrative || data?.response;
    if (!narrative) return null;

    return {
      city,
      narrative: narrative.trim(),
      tone,
      generatedAt: new Date().toISOString(),
      confidence: 0.85, // Fixed confidence for LLM-generated content
    };
  } catch (error) {
    console.error(`Failed to generate narrative for ${city}:`, error);
    return null;
  }
}

/**
 * Generate narratives for multiple cities in batch
 * Rate-limited to avoid overwhelming the LLM
 */
export async function generateBatchNarratives(
  forecasts: Array<{
    city: string;
    maxTemp: number;
    minTemp: number;
    rainChance: number;
    condition: string;
    windSpeed?: number;
    windDir?: string;
    feelsLike?: number;
  }>,
  tone: WeatherNarrative['tone'] = 'standard'
): Promise<WeatherNarrative[]> {
  const narratives: WeatherNarrative[] = [];

  for (const forecast of forecasts) {
    const narrative = await generateWeatherNarrative(
      {
        maxTemp: forecast.maxTemp,
        minTemp: forecast.minTemp,
        rainChance: forecast.rainChance,
        condition: forecast.condition,
        windSpeed: forecast.windSpeed,
        windDir: forecast.windDir,
        feelsLike: forecast.feelsLike,
      },
      forecast.city,
      tone
    );

    if (narrative) {
      narratives.push(narrative);
    }

    // Rate limit: 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return narratives;
}
