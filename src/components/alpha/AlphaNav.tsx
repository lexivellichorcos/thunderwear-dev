/**
 * AlphaNav — Tab navigation between Weather and Alpha
 * Matches ThunderWear existing design system (white/blue gradient)
 * Used inside the thunderwear-gradient header on both Index and Alpha pages
 */

import { Link, useLocation } from "react-router-dom";
import { Zap, Cloud } from "lucide-react";

export function AlphaNav() {
  const location = useLocation();
  const isAlpha = location.pathname === "/alpha";

  return (
    <div className="flex items-center gap-1">
      <Link
        to="/"
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
          !isAlpha
            ? "bg-white text-blue-700 shadow-sm"
            : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
        }`}
      >
        <Cloud className="h-3.5 w-3.5" />
        Weather
      </Link>
      <Link
        to="/alpha"
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
          isAlpha
            ? "bg-white text-blue-700 shadow-sm"
            : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
        }`}
      >
        <Zap className="h-3.5 w-3.5" />
        Alpha
      </Link>
    </div>
  );
}
