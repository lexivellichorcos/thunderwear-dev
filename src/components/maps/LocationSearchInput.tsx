import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LocationResult {
  address: string;
  lat: number;
  lng: number;
  placeId: string;
}

interface LocationSearchInputProps {
  value: string;
  onChange: (location: LocationResult | null) => void;
  placeholder?: string;
  className?: string;
}

interface MapboxSuggestion {
  place_name: string;
  center: [number, number];
  id: string;
}

// Module-level token cache (BUG #33 fix)
let cachedMapboxToken: string | null = null;

export const LocationSearchInput: React.FC<LocationSearchInputProps> = ({
  value,
  onChange,
  placeholder = "Search for a location...",
  className
}) => {
  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Use uncontrolled input to avoid React re-rendering issues
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  const debouncedSearch = useMemo(() => {
    return (query: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(async () => {
        if (query.trim().length < 3) {
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        setIsLoading(true);
        try {
          // Get Mapbox token from Supabase edge function (cached)
          if (!cachedMapboxToken) {
            const { data: tokenData } = await supabase.functions.invoke('get-mapbox-token');
            if (tokenData?.token) cachedMapboxToken = tokenData.token;
          }
          
          if (cachedMapboxToken) {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${cachedMapboxToken}&limit=5`
            );
            
            if (response.ok) {
              const data = await response.json();
              setSuggestions(data.features || []);
              setShowSuggestions(true);
            } else {
              console.log('Geocoding API error:', response.status);
              setSuggestions([]);
              setShowSuggestions(false);
            }
          } else {
            console.log('No Mapbox token available');
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } catch (error) {
          console.log('Geocoding not available, using basic mode');
          setSuggestions([]);
          setShowSuggestions(false);
        }
        setIsLoading(false);
      }, 300);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Update parent component with current input value for manual entry
    if (onChange) {
      // Call onChange with null to indicate manual input (not a selected suggestion)
      onChange(null);
    }
    
    // Only search for suggestions, don't update parent on every keystroke
    if (newValue.trim().length >= 3) {
      debouncedSearch(newValue);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: MapboxSuggestion) => {
    console.log('DEBUG: Suggestion clicked:', suggestion.place_name);
    console.log('DEBUG: Before onChange call');
    
    // Clean up the location name by removing country and county
    const cleanLocationName = cleanLocationDisplay(suggestion.place_name);
    
    const location: LocationResult = {
      address: cleanLocationName,
      lat: suggestion.center[1],
      lng: suggestion.center[0],
      placeId: suggestion.id
    };
    
    if (inputRef.current) {
      inputRef.current.value = cleanLocationName;
    }
    setSuggestions([]);
    setShowSuggestions(false);
    
    console.log('DEBUG: Calling onChange with location:', location);
    onChange(location);
    console.log('DEBUG: onChange call completed');
  };

  // Function to clean up location display names
  const cleanLocationDisplay = (placeName: string): string => {
    // Remove country (usually after the last comma)
    let cleaned = placeName.replace(/, United States$/, '');
    cleaned = cleaned.replace(/, Canada$/, '');
    cleaned = cleaned.replace(/, United Kingdom$/, '');
    
    // Remove county information (typically contains "County")
    cleaned = cleaned.replace(/, [^,]*County[^,]*,/, ',');
    cleaned = cleaned.replace(/, [^,]*County[^,]*$/, '');
    
    // Clean up any double commas or trailing commas
    cleaned = cleaned.replace(/,\s*,/g, ',');
    cleaned = cleaned.replace(/,\s*$/, '');
    
    return cleaned.trim();
  };

  const clearInput = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setSuggestions([]);
    setShowSuggestions(false);
    onChange(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('Key down:', e.key, 'Code:', e.code, 'Prevented:', e.defaultPrevented);
    
    // Force space handling
    if (e.key === ' ' && inputRef.current) {
      e.preventDefault();
      e.stopPropagation();
      
      // Manually insert space character
      const input = inputRef.current;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const currentValue = input.value;
      
      const newValue = currentValue.slice(0, start) + ' ' + currentValue.slice(end);
      input.value = newValue;
      input.setSelectionRange(start + 1, start + 1);
      
      // Create a synthetic event and call handleInputChange directly
      const syntheticEvent = {
        target: { value: newValue }
      } as React.ChangeEvent<HTMLInputElement>;
      
      handleInputChange(syntheticEvent);
      
      console.log('Space manually inserted:', newValue);
      return;
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          defaultValue={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-8 ${className}`}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={(e) => {
            // Only hide suggestions if focus is moving outside the component
            setTimeout(() => {
              if (!e.currentTarget.contains(document.activeElement)) {
                setShowSuggestions(false);
              }
            }, 150);
          }}
        />
        {inputRef.current?.value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
            onClick={clearInput}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.id}-${index}`}
              type="button"
              tabIndex={0}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm cursor-pointer text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('DEBUG: Suggestion button clicked:', suggestion.place_name);
                handleSuggestionClick(suggestion);
              }}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur from happening before click
              }}
            >
              <MapPin className="h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <span className="truncate text-gray-900 dark:text-gray-100">{cleanLocationDisplay(suggestion.place_name)}</span>
            </button>
          ))}
        </div>
      )}
      
      {isLoading && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      )}
    </div>
  );
};