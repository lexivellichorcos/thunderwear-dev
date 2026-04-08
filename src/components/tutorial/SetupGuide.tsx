import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Code, Database, Zap, Settings } from "lucide-react";

export const SetupGuide = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Complete Setup Guide for Production
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Step 1: Supabase Setup */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-primary">Step 1</Badge>
              <h3 className="font-semibold text-lg">Set Up Supabase Backend</h3>
            </div>
            <div className="ml-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Since Lovable doesn't support traditional backend functions, use Supabase for server-side logic:
              </p>
              <ul className="text-sm space-y-1">
                <li>• Go to <a href="https://supabase.com" className="text-primary hover:underline" target="_blank">supabase.com</a> and create a project</li>
                <li>• In Lovable: Settings → Integrations → Connect Supabase</li>
                <li>• Add your Supabase project URL and anon key</li>
              </ul>
            </div>
          </div>

          <Separator />

          {/* Step 2: API Keys */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-primary">Step 2</Badge>
              <h3 className="font-semibold text-lg">Configure API Keys</h3>
            </div>
            <div className="ml-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Add these API keys to Supabase secrets (Dashboard → Settings → API):
              </p>
              <div className="grid gap-2 text-sm">
                <div className="p-2 bg-muted rounded">
                  <strong>OpenWeatherMap:</strong> api.openweathermap.org (Free tier: 60 calls/min)
                </div>
                <div className="p-2 bg-muted rounded">
                  <strong>xAI Grok:</strong> api.x.ai (For AI weather analysis)
                </div>
                <div className="p-2 bg-muted rounded">
                  <strong>Tomorrow.io:</strong> api.tomorrow.io (Weather data)
                </div>
                <div className="p-2 bg-muted rounded">
                  <strong>AccuWeather:</strong> dataservice.accuweather.com (Required logo display)
                </div>
                <div className="p-2 bg-muted rounded">
                  <strong>Open-Meteo:</strong> api.open-meteo.com (No key required)
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Step 3: Edge Functions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-primary">Step 3</Badge>
              <h3 className="font-semibold text-lg">Create Supabase Edge Functions</h3>
            </div>
            <div className="ml-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Create these functions in Supabase:
              </p>
              <ul className="text-sm space-y-1">
                <li>• <code className="bg-muted px-1 rounded">weather-ensemble</code> - Fetch from multiple APIs</li>
                <li>• <code className="bg-muted px-1 rounded">ai-analysis</code> - Send data to Grok API</li>
                <li>• <code className="bg-muted px-1 rounded">weather-alerts</code> - Real-time alert system</li>
              </ul>
            </div>
          </div>

          <Separator />

          {/* Step 4: ML Integration */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-warning">Step 4</Badge>
              <h3 className="font-semibold text-lg">Add ML Forecasting</h3>
            </div>
            <div className="ml-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                For ensemble learning and API weighting:
              </p>
              <ul className="text-sm space-y-1">
                <li>• Install TensorFlow.js in your Edge Function</li>
                <li>• Train Random Forest model on historical accuracy data</li>
                <li>• Weight API predictions based on past performance</li>
                <li>• Store training data in Supabase tables</li>
              </ul>
            </div>
          </div>

          <Separator />

          {/* Step 5: Real-time Features */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-storm">Step 5</Badge>
              <h3 className="font-semibold text-lg">Enable Real-time Updates</h3>
            </div>
            <div className="ml-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Use Supabase Real-time for live weather alerts:
              </p>
              <ul className="text-sm space-y-1">
                <li>• Create <code className="bg-muted px-1 rounded">weather_alerts</code> table</li>
                <li>• Enable Row Level Security (RLS)</li>
                <li>• Subscribe to real-time changes in your React app</li>
                <li>• Set up cron jobs for periodic alert checking</li>
              </ul>
            </div>
          </div>

          <Separator />

          {/* Step 6: Mobile PWA */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-accent">Step 6</Badge>
              <h3 className="font-semibold text-lg">Deploy as Mobile App</h3>
            </div>
            <div className="ml-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Make it installable on mobile devices:
              </p>
              <ul className="text-sm space-y-1">
                <li>• Lovable projects are PWA-ready by default</li>
                <li>• Click "Publish" to deploy your app</li>
                <li>• Users can "Add to Home Screen" on mobile</li>
                <li>• Enable push notifications for weather alerts</li>
              </ul>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Sample Code Snippets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Sample Code for Edge Functions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Edge Function Example (weather-ensemble):</h4>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { location } = await req.json()
  
  // Fetch from multiple APIs in parallel
  const [openWeather, tomorrow, accuWeather] = await Promise.all([
    fetch(\`https://api.openweathermap.org/data/2.5/forecast?q=\${location}&appid=\${API_KEY}\`),
    fetch(\`https://api.tomorrow.io/v4/timelines?location=\${location}&apikey=\${API_KEY}\`),
    fetch(\`http://dataservice.accuweather.com/forecasts/v1/daily/5day/\${locationKey}?apikey=\${API_KEY}\`)
  ])
  
  // Standardize and ensemble the data
  const ensembleData = processEnsembleData([openWeather, tomorrow, accuWeather])
  
  // Send to Grok for AI analysis
  const grokAnalysis = await analyzeWithGrok(ensembleData)
  
  return new Response(JSON.stringify(grokAnalysis))
})`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Helpful Resources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <a 
              href="https://docs.lovable.dev" 
              target="_blank"
              className="p-3 border rounded hover:bg-muted/50 transition-colors"
            >
              <h4 className="font-medium">Lovable Documentation</h4>
              <p className="text-sm text-muted-foreground">Complete guide to Lovable platform</p>
            </a>
            <a 
              href="https://supabase.com/docs/guides/functions" 
              target="_blank"
              className="p-3 border rounded hover:bg-muted/50 transition-colors"
            >
              <h4 className="font-medium">Supabase Edge Functions</h4>
              <p className="text-sm text-muted-foreground">How to create serverless functions</p>
            </a>
            <a 
              href="https://docs.x.ai/" 
              target="_blank"
              className="p-3 border rounded hover:bg-muted/50 transition-colors"
            >
              <h4 className="font-medium">xAI Grok API</h4>
              <p className="text-sm text-muted-foreground">AI model documentation</p>
            </a>
            <a 
              href="https://openweathermap.org/api" 
              target="_blank"
              className="p-3 border rounded hover:bg-muted/50 transition-colors"
            >
              <h4 className="font-medium">Weather APIs</h4>
              <p className="text-sm text-muted-foreground">Documentation for weather data sources</p>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};