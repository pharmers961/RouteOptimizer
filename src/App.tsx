import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MapPin, Navigation, Plus, Trash2, Route, ExternalLink, Loader2, Smartphone, LocateFixed, Camera, Sparkles } from 'lucide-react';
import { Location, geocode, autocompleteAddress, Suggestion, reverseGeocode } from './utils/geocoding';
import { optimizeRoute, RouteResult } from './utils/routing';
import { extractAddressFromImage, guessCorrectAddress } from './utils/ai';
import Map from './components/Map';
import CameraModal from './components/CameraModal';

export default function App() {
  const [locations, setLocations] = useState<Location[]>(() => {
    const saved = localStorage.getItem('routeOptimizerLocations');
    return saved ? JSON.parse(saved) : [];
  });
  const [inputValue, setInputValue] = useState('');
  const [inputMode, setInputMode] = useState<'start' | 'end' | 'stop'>('start');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isExtractingAddress, setIsExtractingAddress] = useState(false);
  const [isGuessingAddress, setIsGuessingAddress] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [startEqualsEnd, setStartEqualsEnd] = useState(() => {
    const saved = localStorage.getItem('routeOptimizerStartEqualsEnd');
    return saved ? JSON.parse(saved) : true;
  });

  // Save to localStorage whenever locations or startEqualsEnd change
  useEffect(() => {
    localStorage.setItem('routeOptimizerLocations', JSON.stringify(locations));
  }, [locations]);

  useEffect(() => {
    localStorage.setItem('routeOptimizerStartEqualsEnd', JSON.stringify(startEqualsEnd));
  }, [startEqualsEnd]);

  const startLoc = locations.find(l => l.type === 'start');
  const endLoc = locations.find(l => l.type === 'end');
  const stopLocs = locations.filter(l => l.type === 'stop');

  const displayLocations = routeResult ? routeResult.optimizedLocations : locations;
  const displayStartLoc = displayLocations.find(l => l.type === 'start');
  const displayEndLoc = displayLocations.find(l => l.type === 'end');
  const displayStopLocs = displayLocations.filter(l => l.type === 'stop');

  useEffect(() => {
    if (startEqualsEnd) {
      if (startLoc) {
        if (!endLoc || endLoc.lat !== startLoc.lat || endLoc.lon !== startLoc.lon) {
          setLocations(prev => {
            const withoutEnd = prev.filter(l => l.type !== 'end');
            return [...withoutEnd, { ...startLoc, id: uuidv4(), type: 'end' }];
          });
        }
      } else if (endLoc) {
        setLocations(prev => prev.filter(l => l.type !== 'end'));
      }
    }
  }, [startEqualsEnd, startLoc, endLoc]);

  useEffect(() => {
    if (startEqualsEnd && inputMode === 'end') {
      setInputMode('stop');
    }
  }, [startEqualsEnd, inputMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (inputValue.trim().length > 2) {
        setIsAutocompleting(true);
        const results = await autocompleteAddress(inputValue, startLoc?.lat, startLoc?.lon);
        setSuggestions(results);
        setShowSuggestions(true);
        setIsAutocompleting(false);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(timeoutId);
  }, [inputValue]);

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (inputMode === 'start' && locations.some(l => l.type === 'start')) {
      setError("Start location already exists. Remove it first.");
      return;
    }
    if (inputMode === 'end' && locations.some(l => l.type === 'end')) {
      setError("End location already exists. Remove it first.");
      return;
    }

    const newLocation: Location = {
      id: uuidv4(),
      address: suggestion.displayName,
      lat: suggestion.lat,
      lon: suggestion.lon,
      type: inputMode,
      displayName: suggestion.displayName
    };
    
    setLocations(prev => [...prev, newLocation]);
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    setRouteResult(null);
    setError(null);
    
    if (inputMode === 'start') {
      setInputMode('stop');
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Check if we already have a start or end
    if (inputMode === 'start' && locations.some(l => l.type === 'start')) {
      setError("Start location already exists. Remove it first.");
      return;
    }
    if (inputMode === 'end' && locations.some(l => l.type === 'end')) {
      setError("End location already exists. Remove it first.");
      return;
    }

    setIsGeocoding(true);
    setError(null);
    let result = await geocode(inputValue, startLoc?.lat, startLoc?.lon);
    
    // If geocoding fails, try to guess the correct address with AI
    if (!result) {
      setIsGeocoding(false);
      setIsGuessingAddress(true);
      const guessedAddress = await guessCorrectAddress(inputValue);
      setIsGuessingAddress(false);
      
      if (guessedAddress) {
        setInputValue(guessedAddress); // Update input with guessed address
        setIsGeocoding(true);
        result = await geocode(guessedAddress, startLoc?.lat, startLoc?.lon);
      }
    }
    
    setIsGeocoding(false);

    if (result) {
      const newLocation: Location = {
        id: uuidv4(),
        address: result.displayName,
        lat: result.lat,
        lon: result.lon,
        type: inputMode,
        displayName: result.displayName
      };
      setLocations(prev => [...prev, newLocation]);
      setInputValue('');
      setRouteResult(null); // Reset route when locations change
      
      if (inputMode === 'start') {
        setInputMode('stop');
      }
    } else {
      setError("Could not find address. Please try checking the spelling or use the camera.");
    }
  };

  const handleCaptureAddress = async (base64Image: string, mimeType: string) => {
    setIsExtractingAddress(true);
    setError(null);
    const address = await extractAddressFromImage(base64Image, mimeType);
    setIsExtractingAddress(false);
    
    if (address) {
      setInputValue(address);
    } else {
      setError("Could not extract an address from the image. Please try again.");
    }
  };

  const handleGetCurrentLocation = () => {
    if (inputMode === 'start' && locations.some(l => l.type === 'start')) {
      setError("Start location already exists. Remove it first.");
      return;
    }
    if (inputMode === 'end' && locations.some(l => l.type === 'end')) {
      setError("End location already exists. Remove it first.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const addressName = await reverseGeocode(latitude, longitude) || "Current Location";
        
        const newLocation: Location = {
          id: uuidv4(),
          address: addressName,
          lat: latitude,
          lon: longitude,
          type: inputMode,
          displayName: addressName
        };
        
        setLocations(prev => [...prev, newLocation]);
        setInputValue('');
        setRouteResult(null);
        if (inputMode === 'start') setInputMode('stop');
        setIsLocating(false);
      },
      (err) => {
        console.error(err);
        setError("Unable to retrieve your location. Please ensure permissions are granted.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleRemoveLocation = (id: string) => {
    const locToRemove = locations.find(l => l.id === id);
    if (locToRemove?.type === 'end' && startEqualsEnd) {
      setStartEqualsEnd(false);
    }
    setLocations(prev => prev.filter(l => l.id !== id));
    setRouteResult(null);
  };

  const handleClearAll = () => {
    setLocations([]);
    setRouteResult(null);
    setInputValue('');
    setError(null);
    setInputMode('start');
  };

  const handleOptimize = async () => {
    const start = locations.find(l => l.type === 'start');
    if (!start) {
      setError("A start location is required to optimize the route.");
      return;
    }
    if (locations.length < 2) {
      setError("At least 2 locations are required.");
      return;
    }

    setIsOptimizing(true);
    setError(null);
    const result = await optimizeRoute(locations);
    setIsOptimizing(false);

    if (result) {
      setRouteResult(result);
    } else {
      setError("Failed to optimize route. Please check your locations.");
    }
  };

  const handleExportToGoogleMaps = () => {
    if (!routeResult || routeResult.optimizedLocations.length < 2) return;
    
    const locs = routeResult.optimizedLocations;
    const origin = `${locs[0].lat},${locs[0].lon}`;
    const destination = `${locs[locs.length - 1].lat},${locs[locs.length - 1].lon}`;
    
    let waypoints = '';
    if (locs.length > 2) {
      const stops = locs.slice(1, locs.length - 1);
      waypoints = '&waypoints=' + stops.map(s => `${s.lat},${s.lon}`).join('|');
    }

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}&dir_action=navigate`;
    window.open(url, '_blank');
  };

  const handleOpenSingleLocation = (loc: Location) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lon}&dir_action=navigate`;
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen w-full bg-stone-50 text-stone-900 font-sans">
      {/* Sidebar */}
      <div className="w-full md:w-96 bg-white shadow-xl z-10 flex flex-col md:h-full md:overflow-hidden shrink-0">
        <div className="p-6 border-b border-stone-100">
          <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2 font-serif">
            <Route className="w-6 h-6 text-amber-700" />
            RouteOptimizer
          </h1>
          <p className="text-sm text-stone-500 mt-1">Find the most efficient route</p>
        </div>

        <div className="p-6 md:flex-1 md:overflow-y-auto">
          <form onSubmit={handleAddLocation} className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Add Location</label>
              <div className="flex gap-2 relative" ref={dropdownRef}>
                <select 
                  value={inputMode} 
                  onChange={(e) => setInputMode(e.target.value as any)}
                  className="bg-stone-50 border border-stone-200 text-stone-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
                >
                  <option value="start">Start</option>
                  <option value="stop">Stop</option>
                  {!startEqualsEnd && <option value="end">End</option>}
                </select>
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    placeholder={isExtractingAddress ? "Scanning image..." : "Enter address..."}
                    disabled={isExtractingAddress}
                    className="w-full bg-stone-50 border border-stone-200 text-stone-900 rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50"
                  />
                  {isAutocompleting || isExtractingAddress ? (
                    <div className="absolute right-3 top-2.5 text-stone-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : (
                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="p-1 text-stone-400 hover:text-amber-600 transition-colors"
                        title="Scan address with camera"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        disabled={isLocating}
                        className="p-1 text-stone-400 hover:text-amber-600 transition-colors disabled:opacity-50"
                        title="Use current location"
                      >
                        {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => handleSelectSuggestion(suggestion)}
                          className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 hover:text-amber-700 border-b border-stone-100 last:border-0 transition-colors"
                        >
                          {suggestion.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button 
              type="submit" 
              disabled={isGeocoding || isGuessingAddress || isExtractingAddress || !inputValue.trim()}
              className="w-full bg-amber-700 hover:bg-amber-800 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGeocoding ? 'Searching...' : isGuessingAddress ? <><Sparkles className="w-4 h-4 animate-pulse text-amber-200" /> AI guessing address...</> : <><Plus className="w-4 h-4" /> Add Location</>}
            </button>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </form>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider">Locations</h3>
                {locations.length > 0 && (
                  <button 
                    onClick={handleClearAll}
                    className="text-xs text-stone-400 underline decoration-stone-200 underline-offset-2 hover:text-stone-600 transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer hover:text-stone-900 transition-colors">
                <input 
                  type="checkbox" 
                  checked={startEqualsEnd}
                  onChange={(e) => setStartEqualsEnd(e.target.checked)}
                  className="rounded border-stone-300 text-amber-700 focus:ring-amber-600 w-4 h-4"
                />
                Round trip
              </label>
            </div>
            
            {/* Start Location */}
            <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-stone-800 uppercase">Start</span>
                {displayStartLoc && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleOpenSingleLocation(displayStartLoc)} className="text-stone-400 hover:text-amber-600" title="Send to phone / Open in Maps">
                      <Smartphone className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleRemoveLocation(displayStartLoc.id)} className="text-stone-400 hover:text-red-500" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {displayStartLoc ? (
                <p className="text-sm text-stone-700">{displayStartLoc.address}</p>
              ) : (
                <p className="text-sm text-stone-400 italic">Not set</p>
              )}
            </div>

            {/* Stops */}
            <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-700 uppercase">Stops ({displayStopLocs.length})</span>
              </div>
              {displayStopLocs.length > 0 ? (
                <ul className="space-y-2">
                  {displayStopLocs.map((loc, i) => (
                    <li key={loc.id} className="flex items-start justify-between gap-2 text-sm text-stone-700 border-t border-stone-200 pt-2 first:border-0 first:pt-0">
                      <div className="flex items-start gap-2">
                        <span className="text-stone-400 font-mono">{i + 1}.</span>
                        <span>{loc.address}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleOpenSingleLocation(loc)} className="text-stone-400 hover:text-amber-600" title="Send to phone / Open in Maps">
                          <Smartphone className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRemoveLocation(loc.id)} className="text-stone-400 hover:text-red-500" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-400 italic">No stops added</p>
              )}
            </div>

            {/* End Location */}
            <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-stone-500 uppercase">End</span>
                {displayEndLoc && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleOpenSingleLocation(displayEndLoc)} className="text-stone-400 hover:text-amber-600" title="Send to phone / Open in Maps">
                      <Smartphone className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleRemoveLocation(displayEndLoc.id)} className="text-stone-400 hover:text-red-500" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {displayEndLoc ? (
                <p className="text-sm text-stone-700">{displayEndLoc.address}</p>
              ) : (
                <p className="text-sm text-stone-400 italic">Not set (optional)</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-stone-100 bg-stone-50">
          <button 
            onClick={handleOptimize}
            disabled={isOptimizing || locations.length < 2 || !startLoc}
            className="w-full bg-stone-800 hover:bg-stone-900 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
          >
            {isOptimizing ? 'Optimizing...' : <><Navigation className="w-5 h-5" /> Optimize Route</>}
          </button>

          {routeResult && (
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm text-stone-600 bg-white p-3 rounded-lg border border-stone-200">
                <span>Distance: <strong>{(routeResult.distance * 0.000621371).toFixed(1)} mi</strong></span>
                <span>Time: <strong>{Math.round(routeResult.duration / 60)} min</strong></span>
              </div>
              <button 
                onClick={handleExportToGoogleMaps}
                className="w-full bg-stone-800 hover:bg-stone-900 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <ExternalLink className="w-4 h-4" /> Open in Google Maps
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="w-full h-[300px] md:h-full md:flex-1 relative bg-stone-200">
        <Map 
          locations={routeResult ? routeResult.optimizedLocations : locations} 
          routeGeometry={routeResult?.geometry || null} 
        />
      </div>
      
      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={handleCaptureAddress} 
      />
    </div>
  );
}
