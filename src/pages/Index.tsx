/**
 * Index.tsx — Weather Tab
 * Trading modules removed; Alpha tab added.
 * Keeps ThunderWear white-card + blue-gradient design language.
 * DEV ONLY — thunderwear-dev
 */

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cloud, MapPin, MessageCircle, Clock, Zap } from "lucide-react";
import { AlphaNav } from "@/components/alpha/AlphaNav";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="thunderwear-gradient text-white">
        <div className="container mx-auto px-4 py-4 sm:py-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <img
                src="/lovable-uploads/c703a666-80cd-468e-90b5-3465d9d14dcb.png"
                alt="Thunderwear.AI"
                className="w-10 h-10"
              />
              <div>
                <h1 className="text-lg font-light tracking-wide">ThunderWear.AI</h1>
                <p className="text-xs opacity-80">AI Weather Intelligence</p>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <AlphaNav />

          {/* Prompt-style top cards kept on Weather tab */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-6xl mx-auto mt-4">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
              <h3 className="text-sm font-light mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Location
              </h3>
              <p className="text-xs text-white/80 leading-relaxed">
                Weather search and saved locations stay on this tab.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
              <h3 className="text-sm font-light mb-2 flex items-center gap-2">
                <MessageCircle className="h-4 w-4" /> ThunderWear AI
              </h3>
              <p className="text-xs text-white/80 leading-relaxed">
                Outfit, commute, and forecast Q&A remain part of the core weather experience.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
              <h3 className="text-sm font-light mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Forecast Tools
              </h3>
              <p className="text-xs text-white/80 leading-relaxed">
                Daily briefing, alerts, radar, and weather views stay here.
              </p>
            </div>

            <div
              className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-3 border border-blue-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20 cursor-pointer"
              onClick={() => navigate("/alpha")}
            >
              <h3 className="text-sm font-light mb-2 flex items-center gap-2 text-white">
                <Zap className="h-4 w-4" /> Go Alpha →
              </h3>
              <p className="text-xs text-blue-100 mb-3 leading-relaxed">
                Trading models moved out of Weather. Open Alpha for Kalshi edge, backtests, and exit signals.
              </p>
              <Button size="sm" className="w-full bg-white/20 hover:bg-white/30 text-white border border-white/30 text-xs">
                <Zap className="h-3 w-3 mr-1" /> Open Alpha
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Weather Content */}
      <div className="container mx-auto px-4 pt-6 pb-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="bg-white border border-gray-200 shadow-sm lg:col-span-2">
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-600" />
                Weather Dashboard
              </h2>
              <p className="text-xs text-blue-700 mt-1">
                Core forecast experience remains on the main Weather tab.
              </p>
            </div>
            <div className="p-6 text-sm text-gray-700 leading-relaxed space-y-3">
              <p>
                Trading components were removed from this page and moved to the new <span className="font-semibold text-blue-700">Alpha</span> tab.
              </p>
              <p>
                Keep this page focused on weather: forecasts, alerts, radar, AI explanations, and location-based planning.
              </p>
              <p>
                If you want pricing, bias review, backtests, METAR divergence, or exit guidance, use Alpha.
              </p>
            </div>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-600" />
                Alpha Modules
              </h2>
              <p className="text-xs text-blue-700 mt-1">
                Now separated from the weather experience.
              </p>
            </div>
            <div className="p-6 space-y-3 text-sm text-gray-700">
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">TW vs Kalshi Probability Table</div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">Actuarial Bias Review</div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">Forecast Backtest</div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">METAR Divergence Alerts</div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">Tail Opportunities</div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">Exit Signals</div>
              <Button onClick={() => navigate("/alpha")} className="w-full mt-2">
                <Zap className="h-4 w-4 mr-2" />
                Open Alpha Tab
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
