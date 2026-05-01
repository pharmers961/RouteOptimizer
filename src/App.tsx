import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Navigation, Plus, Trash2, Route, ExternalLink, Loader2, Smartphone,
  LocateFixed, Camera, Sparkles, ChevronUp, ChevronDown, Check, ListPlus,
} from 'lucide-react';
import { Location, geocode, autocompleteAddress, Suggestion, reverseGeocode } from './utils/geocoding';
import { optimizeRoute, RouteResult } from './utils/routing';
import { extractAddressFromImage, guessCorrectAddress } from './utils/ai';
import Map from './components/Map';
import CameraModal from './components/CameraModal';

const STORAGE_LOCATIONS = 'routeOptimizerLocations';
const STORAGE_ROUND_TRIP = 'routeOptimizerStartEqualsEnd';
const STORAGE_ROUTE = 'routeOptimizerRouteResult';

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [locations, setLocations] = useState<Location[]>(() => loadJSON<Location[]>(STORAGE_LOCATIONS, []));
  const [startEqualsEnd, setStartEqualsEnd] = useState<boolean>(() => loadJSON<boolean>(STORAGE_ROUND_TRIP, true));
  const [routeResult, setRouteResult] = useState<RouteResult | null>(() => loadJSON<RouteResult | null>(STORAGE_ROUTE, null));

  const [inputValue, setInputValue] = useState('');
  const [inputMode, setInputMode] = useState<'start' | 'end' | 'stop'>('start');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkValue, setBulkValue] = useState('');

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isExtractingAddress, setIsExtractingAddress] = useState(false);
  const [isGuessingAddress, setIsGuessingAddress] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [isAutocompleting, setIsAutocompleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Persist
  useEffect(() => { localStorage.setItem(STORAGE_LOCATIONS, JSON.stringify(locations)); }, [locations]);
  useEffect(() => { localStorage.setItem(STORAGE_ROUND_TRIP, JSON.stringify(startEqualsEnd)); }, [startEqualsEnd]);
  useEffect(() => { localStorage.setItem(STORAGE_ROUTE, JSON.stringify(routeResult)); }, [routeResult]);

  const startLoc = useMemo(() => locations.find(l => l.type === 'start'), [locations]);
  const endLoc = useMemo(() => locations.find(l => l.type === 'end'), [locations]);
  const stopLocs = useMemo(() => locations.filter(l => l.type === 'stop'), [locations]);

  const displayLocations = routeResult ? routeResult.optimizedLocations : locations;
  const displayStartLoc = displayLocations.find(l => l.type === 'start');
  const displayEndLoc = displayLocations.find(l => l.type === 'end');
  const displayStopLocs = displayLocations.filter(l => l.type === 'stop');
  const remainingStops = displayStopLocs.filter(s => !s.done);

  // Keep end synced to start when round-trip is on. Depend on primitives, not
  // object references, so the effect doesn't fire every render.
  useEffect(() => {
    if (!startEqualsEnd) return;
    setLocations(prev => {
      const start = prev.find(l => l.type === 'start');
      const end = prev.find(l => l.type === 'end');
      if (!start) {
        return end ? prev.filter(l => l.type !== 'end') : prev;
      }
      if (end && end.lat === start.lat && end.lon === start.lon && end.address === start.address) {
        return prev;
      }
      const without = prev.filter(l => l.type !== 'end');
      return [...without, { ...start, id: uuidv4(), type: 'end', done: false }];
    });
  }, [startEqualsEnd, startLoc?.lat, startLoc?.lon, startLoc?.address]);

  useEffect(() => {
    if (startEqualsEnd && inputMode === 'end') setInputMode('stop');
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

  // Debounced autocomplete with abort + race-free updates.
  useEffect(() => {
    if (inputValue.trim().length <= 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setHighlightedIdx(-1);
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setIsAutocompleting(true);
      const results = await autocompleteAddress(inputValue, startLoc?.lat, startLoc?.lon, controller.signal);
      if (controller.signal.aborted) return;
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightedIdx(-1);
      setIsAutocompleting(false);
    }, 350);
    return () => { clearTimeout(timeoutId); controller.abort(); };
  }, [inputValue, startLoc?.lat, startLoc?.lon]);

  const slotTaken = useCallback((mode: 'start' | 'end' | 'stop') => {
    if (mode === 'start') return locations.some(l => l.type === 'start');
    if (mode === 'end') return locations.some(l => l.type === 'end');
    return false;
  }, [locations]);

  const addLocationFromCoords = useCallback((address: string, lat: number, lon: number, mode: 'start' | 'end' | 'stop') => {
    const newLocation: Location = {
      id: uuidv4(), address, lat, lon, type: mode, displayName: address, done: false,
    };
    setLocations(prev => [...prev, newLocation]);
    setRouteResult(null);
  }, []);

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (slotTaken(inputMode)) {
      setError(`${inputMode === 'start' ? 'Start' : 'End'} already exists. Remove it first.`);
      return;
    }
    addLocationFromCoords(suggestion.displayName, suggestion.lat, suggestion.lon, inputMode);
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    setError(null);
    if (inputMode === 'start') setInputMode('stop');
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputValue.trim();
    if (!query) return;
    if (slotTaken(inputMode)) {
      setError(`${inputMode === 'start' ? 'Start' : 'End'} already exists. Remove it first.`);
      return;
    }

    // If a suggestion is highlighted, prefer it (zero extra geocode call).
    if (highlightedIdx >= 0 && suggestions[highlightedIdx]) {
      handleSelectSuggestion(suggestions[highlightedIdx]);
      return;
    }

    setIsGeocoding(true);
    setError(null);
    let result = await geocode(query, startLoc?.lat, startLoc?.lon);

    if (!result) {
      setIsGeocoding(false);
      setIsGuessingAddress(true);
      const guessed = await guessCorrectAddress(query);
      setIsGuessingAddress(false);
      if (guessed && guessed !== query) {
        setInputValue(guessed);
        setIsGeocoding(true);
        result = await geocode(guessed, startLoc?.lat, startLoc?.lon);
      }
    }
    setIsGeocoding(false);

    if (result) {
      addLocationFromCoords(result.displayName, result.lat, result.lon, inputMode);
      setInputValue('');
      setShowSuggestions(false);
      if (inputMode === 'start') setInputMode('stop');
    } else {
      setError("Couldn't find that address. Try the camera or a more specific search.");
    }
  };

  const handleBulkAdd = async () => {
    const lines = bulkValue.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setIsBulkAdding(true);
    setError(null);
    setBulkProgress({ done: 0, total: lines.length });

    const failures: string[] = [];
    // Sequential to respect Nominatim 1 req/sec policy.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const result = await geocode(line, startLoc?.lat, startLoc?.lon);
      if (result) {
        addLocationFromCoords(result.displayName, result.lat, result.lon, 'stop');
      } else {
        failures.push(line);
      }
      setBulkProgress({ done: i + 1, total: lines.length });
      if (i < lines.length - 1) await new Promise(r => setTimeout(r, 1100));
    }

    setIsBulkAdding(false);
    setBulkValue('');
    setBulkOpen(false);
    if (failures.length) {
      setError(`Couldn't find ${failures.length} of ${lines.length}: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '…' : ''}`);
    }
  };

  const handleCaptureAddress = async (base64Image: string, mimeType: string) => {
    setIsExtractingAddress(true);
    setError(null);
    const address = await extractAddressFromImage(base64Image, mimeType);
    setIsExtractingAddress(false);
    if (address) setInputValue(address);
    else setError('Could not extract an address from the image. Please try again.');
  };

  const handleGetCurrentLocation = () => {
    if (slotTaken(inputMode)) {
      setError(`${inputMode === 'start' ? 'Start' : 'End'} already exists. Remove it first.`);
      return;
    }
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const addressName = (await reverseGeocode(latitude, longitude)) || 'Current Location';
        addLocationFromCoords(addressName, latitude, longitude, inputMode);
        setInputValue('');
        if (inputMode === 'start') setInputMode('stop');
        setIsLocating(false);
      },
      (err) => {
        console.error(err);
        setError('Unable to retrieve your location. Please ensure permissions are granted.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const handleRemoveLocation = (id: string) => {
    const locToRemove = locations.find(l => l.id === id);
    if (locToRemove?.type === 'end' && startEqualsEnd) setStartEqualsEnd(false);
    setLocations(prev => prev.filter(l => l.id !== id));
    setRouteResult(null);
  };

  const handleToggleDone = (id: string) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, done: !l.done } : l));
    setRouteResult(prev => prev ? {
      ...prev,
      optimizedLocations: prev.optimizedLocations.map(l => l.id === id ? { ...l, done: !l.done } : l),
    } : prev);
  };

  const handleMoveStop = (id: string, direction: -1 | 1) => {
    // When a route exists we reorder within the optimized order; otherwise
    // within the source list. Reordering invalidates the cached route.
    setLocations(prev => {
      const stops = prev.filter(l => l.type === 'stop');
      const others = prev.filter(l => l.type !== 'stop');
      const idx = stops.findIndex(l => l.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= stops.length) return prev;
      const reordered = [...stops];
      [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
      return [...others, ...reordered];
    });
    setRouteResult(null);
  };

  const handleClearAll = () => {
    setLocations([]);
    setRouteResult(null);
    setInputValue('');
    setError(null);
    setInputMode('start');
  };

  const handleClearCompleted = () => {
    setLocations(prev => prev.filter(l => !(l.type === 'stop' && l.done)));
    setRouteResult(null);
  };

  const handleOptimize = async () => {
    const start = locations.find(l => l.type === 'start');
    if (!start) { setError('A start location is required to optimize the route.'); return; }
    if (locations.length < 2) { setError('Add at least one stop before optimizing.'); return; }

    setIsOptimizing(true);
    setError(null);
    // Only re-optimize against stops that aren't done yet.
    const undoneStops = locations.filter(l => l.type === 'stop' && !l.done);
    const subject = [start, ...undoneStops, ...(endLoc ? [endLoc] : [])];
    const result = await optimizeRoute(subject);
    setIsOptimizing(false);
    if (result) setRouteResult(result);
    else setError('Failed to optimize route. Please check your locations.');
  };

  const handleSuggestionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleExportToGoogleMaps = () => {
    const locs = (routeResult?.optimizedLocations || []).filter(l => l.type !== 'stop' || !l.done);
    if (locs.length < 2) return;
    const origin = `${locs[0].lat},${locs[0].lon}`;
    const destination = `${locs[locs.length - 1].lat},${locs[locs.length - 1].lon}`;
    const waypoints = locs.length > 2
      ? '&waypoints=' + locs.slice(1, -1).map(s => `${s.lat},${s.lon}`).join('|')
      : '';
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}&dir_action=navigate`;
    window.open(url, '_blank');
  };

  const handleOpenSingleLocation = (loc: Location) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lon}&dir_action=navigate`;
    window.open(url, '_blank');
  };

  const submitDisabled = isGeocoding || isGuessingAddress || isExtractingAddress || isBulkAdding || !inputValue.trim();

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen w-full bg-stone-50 text-stone-900 font-sans">
      {/* Sidebar */}
      <div className="w-full md:w-96 bg-white shadow-xl z-10 flex flex-col md:h-full md:overflow-hidden shrink-0">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2 font-serif">
              <Route className="w-6 h-6 text-amber-700" />
              RouteOptimizer
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              {remainingStops.length > 0
                ? `${displayStopLocs.length - remainingStops.length} of ${displayStopLocs.length} stops complete`
                : 'Find the most efficient route'}
            </p>
          </div>
        </div>

        <div className="p-6 md:flex-1 md:overflow-y-auto">
          <form onSubmit={handleAddLocation} className="mb-4 space-y-3">
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
                    onKeyDown={handleSuggestionKeyDown}
                    placeholder={isExtractingAddress ? 'Scanning image…' : 'Enter address…'}
                    disabled={isExtractingAddress}
                    autoComplete="off"
                    inputMode="search"
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
                      {suggestions.map((suggestion, idx) => (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => handleSelectSuggestion(suggestion)}
                          onMouseEnter={() => setHighlightedIdx(idx)}
                          className={`w-full text-left px-4 py-2 text-sm border-b border-stone-100 last:border-0 transition-colors ${
                            idx === highlightedIdx ? 'bg-amber-50 text-amber-800' : 'text-stone-700 hover:bg-stone-50 hover:text-amber-700'
                          }`}
                        >
                          {suggestion.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitDisabled}
                className="flex-1 bg-amber-700 hover:bg-amber-800 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGeocoding ? 'Searching…'
                  : isGuessingAddress ? <><Sparkles className="w-4 h-4 animate-pulse" /> AI guessing…</>
                  : <><Plus className="w-4 h-4" /> Add</>}
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(o => !o)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium py-2 px-3 rounded-lg transition-colors flex items-center gap-1"
                title="Paste multiple addresses"
              >
                <ListPlus className="w-4 h-4" />
              </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </form>

          {bulkOpen && (
            <div className="mb-6 p-3 bg-stone-50 rounded-lg border border-stone-200">
              <label className="block text-xs font-semibold text-stone-600 uppercase mb-1">Bulk add stops</label>
              <textarea
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={'One address per line\n123 Main St, Springfield IL\n456 Oak Ave, Springfield IL'}
                rows={4}
                disabled={isBulkAdding}
                className="w-full bg-white border border-stone-200 text-stone-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleBulkAdd}
                disabled={isBulkAdding || !bulkValue.trim()}
                className="mt-2 w-full bg-stone-800 hover:bg-stone-900 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBulkAdding
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding {bulkProgress.done}/{bulkProgress.total}…</>
                  : <><Plus className="w-4 h-4" /> Add all</>}
              </button>
            </div>
          )}

          <div className="space-y-4 mt-2">
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

            {/* Start */}
            <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-stone-800 uppercase">Start</span>
                {displayStartLoc && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleOpenSingleLocation(displayStartLoc)} className="text-stone-400 hover:text-amber-600" title="Open in Maps">
                      <Smartphone className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleRemoveLocation(displayStartLoc.id)} className="text-stone-400 hover:text-red-500" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {displayStartLoc
                ? <p className="text-sm text-stone-700">{displayStartLoc.address}</p>
                : <p className="text-sm text-stone-400 italic">Not set</p>}
            </div>

            {/* Stops */}
            <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-700 uppercase">Stops ({displayStopLocs.length})</span>
                {displayStopLocs.some(s => s.done) && (
                  <button
                    onClick={handleClearCompleted}
                    className="text-xs text-stone-400 underline decoration-stone-200 underline-offset-2 hover:text-stone-600 transition-colors"
                  >
                    Remove completed
                  </button>
                )}
              </div>
              {displayStopLocs.length > 0 ? (
                <ul className="space-y-1">
                  {displayStopLocs.map((loc, i) => (
                    <li
                      key={loc.id}
                      className={`flex items-start justify-between gap-2 text-sm border-t border-stone-200 pt-2 first:border-0 first:pt-0 ${
                        loc.done ? 'text-stone-400 line-through' : 'text-stone-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleDone(loc.id)}
                        title={loc.done ? 'Mark not delivered' : 'Mark delivered'}
                        className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          loc.done
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-stone-300 hover:border-emerald-500 hover:text-emerald-600'
                        }`}
                      >
                        {loc.done && <Check className="w-3 h-3" />}
                      </button>
                      <div className="flex-1 flex items-start gap-2 min-w-0">
                        <span className="text-stone-400 font-mono shrink-0">{i + 1}.</span>
                        <span className="break-words">{loc.address}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!routeResult && (
                          <>
                            <button
                              onClick={() => handleMoveStop(loc.id, -1)}
                              disabled={i === 0}
                              className="text-stone-400 hover:text-amber-600 disabled:opacity-30 disabled:hover:text-stone-400"
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMoveStop(loc.id, 1)}
                              disabled={i === displayStopLocs.length - 1}
                              className="text-stone-400 hover:text-amber-600 disabled:opacity-30 disabled:hover:text-stone-400"
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleOpenSingleLocation(loc)} className="text-stone-400 hover:text-amber-600" title="Open in Maps">
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

            {/* End */}
            <div className="bg-stone-50 rounded-lg p-3 border border-stone-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-stone-500 uppercase">End</span>
                {displayEndLoc && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleOpenSingleLocation(displayEndLoc)} className="text-stone-400 hover:text-amber-600" title="Open in Maps">
                      <Smartphone className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleRemoveLocation(displayEndLoc.id)} className="text-stone-400 hover:text-red-500" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {displayEndLoc
                ? <p className="text-sm text-stone-700">{displayEndLoc.address}</p>
                : <p className="text-sm text-stone-400 italic">Not set (optional)</p>}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-stone-100 bg-stone-50">
          <button
            onClick={handleOptimize}
            disabled={isOptimizing || locations.length < 2 || !startLoc}
            className="w-full bg-stone-800 hover:bg-stone-900 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
          >
            {isOptimizing ? <><Loader2 className="w-5 h-5 animate-spin" /> Optimizing…</> : <><Navigation className="w-5 h-5" /> Optimize Route</>}
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

      {/* Map */}
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
