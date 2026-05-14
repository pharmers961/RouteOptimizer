import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Loader2, MapPin, Search, Sparkles, AlertCircle } from 'lucide-react';
import { Suggestion, searchAddresses, reverseGeocode, geocode } from '../utils/geocoding';

// Lazy-import the Gemini SDK so it isn't bundled in the main chunk; it's only
// needed when AI assist actually fires.
async function aiGuess(input: string): Promise<string | null> {
  const { guessCorrectAddress } = await import('../utils/ai');
  return guessCorrectAddress(input);
}

type Mode = 'start' | 'end' | 'stop';

export interface AddressFinderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  showEndOption: boolean;
  onPick: (s: Suggestion, mode: Mode) => void;
  /** Bias results toward this point (typically the start location). */
  nearLat?: number;
  nearLon?: number;
  disabledModes?: Mode[];
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 3;

export default function AddressFinder({
  mode,
  onModeChange,
  showEndOption,
  onPick,
  nearLat,
  nearLon,
  disabledModes = [],
}: AddressFinderProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [aiGuessing, setAiGuessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noResults, setNoResults] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef('');

  // Close dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Debounced search with abort-on-stale
  useEffect(() => {
    const trimmed = query.trim();
    lastQueryRef.current = trimmed;

    if (trimmed.length < MIN_QUERY_LEN) {
      abortRef.current?.abort();
      setSuggestions([]);
      setSearching(false);
      setNoResults(false);
      return;
    }

    setSearching(true);
    setNoResults(false);
    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const results = await searchAddresses(trimmed, {
          signal: controller.signal,
          nearLat,
          nearLon,
        });
        // Drop stale responses
        if (lastQueryRef.current !== trimmed) return;
        setSuggestions(results);
        setHighlight(results.length > 0 ? 0 : -1);
        setNoResults(results.length === 0);
        setOpen(true);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error(err);
        }
      } finally {
        if (lastQueryRef.current === trimmed) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [query, nearLat, nearLon]);

  const pick = (s: Suggestion) => {
    onPick(s, mode);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setHighlight(-1);
    setError(null);
    setNoResults(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlight >= 0 && suggestions[highlight]) {
        pick(suggestions[highlight]);
      } else {
        void submitRawQuery();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Used when the user hits Enter without selecting from the dropdown
  const submitRawQuery = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setError(null);
    setSearching(true);
    let result = await geocode(trimmed, nearLat, nearLon);
    setSearching(false);

    if (!result) {
      setAiGuessing(true);
      const guess = await aiGuess(trimmed);
      setAiGuessing(false);
      if (guess) {
        setQuery(guess);
        setSearching(true);
        result = await geocode(guess, nearLat, nearLon);
        setSearching(false);
      }
    }

    if (result) {
      pick(result);
    } else {
      setError("Couldn't find that address. Try adding city/state.");
    }
  };

  const handleAiAssist = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setError(null);
    setAiGuessing(true);
    const guess = await aiGuess(trimmed);
    setAiGuessing(false);
    if (guess && guess !== trimmed) {
      setQuery(guess);
    } else if (!guess) {
      setError("AI couldn't improve the address. Try a different spelling.");
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const reversed = await reverseGeocode(latitude, longitude);
        pick(reversed ?? {
          id: `current-${Date.now()}`,
          displayName: 'Current Location',
          primaryText: 'Current Location',
          secondaryText: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          lat: latitude,
          lon: longitude,
        });
        setLocating(false);
      },
      (err) => {
        console.error(err);
        setError('Unable to retrieve your location. Check permissions.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const modeOptions = useMemo(() => {
    const opts: { value: Mode; label: string }[] = [
      { value: 'start', label: 'Start' },
      { value: 'stop', label: 'Stop' },
    ];
    if (showEndOption) opts.push({ value: 'end', label: 'End' });
    return opts.filter((o) => !disabledModes.includes(o.value));
  }, [showEndOption, disabledModes]);

  const showDropdown = open && (suggestions.length > 0 || noResults || aiGuessing);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-stone-700">Add Location</label>
      <div className="flex gap-2 relative" ref={wrapRef}>
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as Mode)}
          className="bg-stone-50 border border-stone-200 text-stone-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
          aria-label="Location type"
        >
          {modeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (suggestions.length > 0 || noResults) setOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Search address, city, or landmark..."
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-controls="address-finder-listbox"
            aria-activedescendant={highlight >= 0 ? `address-finder-option-${highlight}` : undefined}
            className="w-full bg-stone-50 border border-stone-200 text-stone-900 rounded-lg pl-9 pr-20 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searching && <Loader2 className="w-4 h-4 text-stone-400 animate-spin" aria-label="Searching" />}
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              className="p-1 text-stone-400 hover:text-amber-600 transition-colors disabled:opacity-50"
              title="Use current location"
              aria-label="Use current location"
            >
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
            </button>
          </div>

          {showDropdown && (
            <div
              id="address-finder-listbox"
              role="listbox"
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  type="button"
                  key={s.id}
                  id={`address-finder-option-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(s)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 border-b border-stone-100 last:border-0 transition-colors ${
                    i === highlight ? 'bg-amber-50 text-amber-900' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.primaryText}</div>
                    {s.secondaryText && (
                      <div className="text-xs text-stone-500 truncate">{s.secondaryText}</div>
                    )}
                  </div>
                </button>
              ))}

              {noResults && !aiGuessing && (
                <div className="px-3 py-3 text-sm text-stone-500">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-stone-400" />
                    <div className="flex-1">
                      <div>No matches found.</div>
                      <button
                        type="button"
                        onClick={handleAiAssist}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                      >
                        <Sparkles className="w-3 h-3" /> Try AI suggestion
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {aiGuessing && (
                <div className="px-3 py-3 text-sm text-stone-600 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-pulse text-amber-600" />
                  AI is rewriting the address...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm flex items-center gap-1">
          <AlertCircle className="w-4 h-4" /> {error}
        </p>
      )}

      <p className="text-xs text-stone-400">
        Tip: use ↑ ↓ to navigate, Enter to select. Hit Enter without a match to try AI assist.
      </p>
    </div>
  );
}
