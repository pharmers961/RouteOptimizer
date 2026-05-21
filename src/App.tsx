import React, { useState, useEffect, Suspense, lazy } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Navigation, Trash2, Route, ExternalLink, Smartphone, Bookmark, LogIn, LogOut, GripVertical, Loader2 } from 'lucide-react';
import { Location, Suggestion } from './utils/geocoding';
import { optimizeRoute, RouteResult } from './utils/routing';
import AddressFinder from './components/AddressFinder';
import { SavedAddress } from './components/SavedAddressesModal';
import { useAuth } from './components/AuthProvider';
import { supabase, signInWithGoogle, signOut, OperationType, logSupabaseError } from './utils/supabase';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Map (Leaflet ~140KB) and SavedAddressesModal load on demand to slim the
// initial bundle. Aliased to RouteMap to avoid shadowing the global Map.
const RouteMap = lazy(() => import('./components/Map'));
const SavedAddressesModal = lazy(() => import('./components/SavedAddressesModal'));

type InputMode = 'start' | 'end' | 'stop';

// Signed-out users can build a route of up to this many addresses; signing in
// removes the cap.
const FREE_ADDRESS_LIMIT = 10;

interface SortableStopProps {
  loc: Location;
  index: number;
  isSaved: boolean;
  onToggleSave: (loc: Location) => void;
  onOpen: (loc: Location) => void;
  onRemove: (id: string) => void;
}

function SortableStop({ loc, index, isSaved, onToggleSave, onOpen, onRemove }: SortableStopProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: loc.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start justify-between gap-2 text-sm text-stone-700 border-t border-stone-200 pt-2 first:border-0 first:pt-0 bg-stone-50"
    >
      <div className="flex items-start gap-1 min-w-0 flex-1">
        <button
          type="button"
          className="text-stone-400 hover:text-stone-700 cursor-grab active:cursor-grabbing touch-none p-1 -ml-1"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-stone-400 font-mono mt-1">{index + 1}.</span>
        <span className="break-words min-w-0">{loc.address}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onToggleSave(loc)} className={`transition-colors ${isSaved ? 'text-amber-600' : 'text-stone-400 hover:text-amber-600'}`} title={isSaved ? 'Remove from saved' : 'Save this address'}>
          <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
        </button>
        <button onClick={() => onOpen(loc)} className="text-stone-400 hover:text-amber-600" title="Send to phone / Open in Maps">
          <Smartphone className="w-4 h-4" />
        </button>
        <button onClick={() => onRemove(loc.id)} className="text-stone-400 hover:text-red-500" title="Remove">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

export default function App() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<Location[]>(() => {
    const saved = localStorage.getItem('routeOptimizerLocations');
    return saved ? JSON.parse(saved) : [];
  });
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>(() => {
    const saved = localStorage.getItem('routeOptimizerInputMode');
    return (saved === 'start' || saved === 'stop' || saved === 'end') ? saved : 'start';
  });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    localStorage.setItem('routeOptimizerInputMode', inputMode);
  }, [inputMode]);

  useEffect(() => {
    if (!user) {
      setSavedAddresses([]);
      return;
    }

    let cancelled = false;
    const rowToAddress = (row: any): SavedAddress => ({
      id: row.id,
      address: row.address,
      displayName: row.display_name ?? row.address,
      lat: row.lat,
      lon: row.lon,
    });

    supabase
      .from('saved_addresses')
      .select('id, address, display_name, lat, lon')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logSupabaseError(error, OperationType.LIST, 'saved_addresses');
          return;
        }
        setSavedAddresses((data ?? []).map(rowToAddress));
      });

    const channel = supabase
      .channel(`saved_addresses:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_addresses', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (cancelled) return;
          setSavedAddresses((prev) => {
            if (payload.eventType === 'INSERT') {
              const row = rowToAddress(payload.new);
              return prev.some((a) => a.id === row.id) ? prev : [row, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              const row = rowToAddress(payload.new);
              return prev.map((a) => (a.id === row.id ? row : a));
            }
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as any)?.id;
              return prev.filter((a) => a.id !== id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleStopsDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const source = routeResult ? routeResult.optimizedLocations : locations;
    const currentIds = source.filter(l => l.type === 'stop').map(l => l.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    handleReorderStops(arrayMove(currentIds, oldIndex, newIndex));
  };

  const startLoc = locations.find(l => l.type === 'start');
  const endLoc = locations.find(l => l.type === 'end');
  const stopLocs = locations.filter(l => l.type === 'stop');

  // Count user-added addresses, excluding the auto-mirrored end on round trips.
  const addressCount = locations.filter(l => !(startEqualsEnd && l.type === 'end')).length;
  const atFreeLimit = !user && addressCount >= FREE_ADDRESS_LIMIT;

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

  const handlePickSuggestion = (suggestion: Suggestion, mode: 'start' | 'end' | 'stop') => {
    if (!user && addressCount >= FREE_ADDRESS_LIMIT) {
      setError(`Sign in to add more than ${FREE_ADDRESS_LIMIT} addresses.`);
      return;
    }
    if (mode === 'start' && locations.some(l => l.type === 'start')) {
      setError("Start location already exists. Remove it first.");
      return;
    }
    if (mode === 'end' && locations.some(l => l.type === 'end')) {
      setError("End location already exists. Remove it first.");
      return;
    }

    const newLocation: Location = {
      id: uuidv4(),
      address: suggestion.displayName,
      lat: suggestion.lat,
      lon: suggestion.lon,
      type: mode,
      displayName: suggestion.displayName,
    };

    setLocations(prev => [...prev, newLocation]);
    setRouteResult(null);
    setError(null);

    if (mode === 'start') setInputMode('stop');
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
    setError(null);
    setInputMode('start');
  };

  const handleReorderStops = (orderedIds: string[]) => {
    setLocations(prev => {
      const byId = new Map(prev.map(l => [l.id, l]));
      const reorderedStops = orderedIds.map(id => byId.get(id)).filter((l): l is Location => !!l && l.type === 'stop');
      const start = prev.find(l => l.type === 'start');
      const end = prev.find(l => l.type === 'end');
      const next: Location[] = [];
      if (start) next.push(start);
      next.push(...reorderedStops);
      if (end) next.push(end);
      return next;
    });
    setRouteResult(null);
  };

  const handleToggleSaveAddress = async (loc: Location) => {
    if (!user) {
      try {
        await signInWithGoogle();
        return;
      } catch (err: any) {
        setError(err?.message || 'Failed to sign in.');
        return;
      }
    }

    const existing = savedAddresses.find(a => a.address === loc.address);
    if (existing) {
      const { error: err } = await supabase
        .from('saved_addresses')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', user.id);
      if (err) {
        logSupabaseError(err, OperationType.DELETE, 'saved_addresses');
        setError('Could not remove saved address.');
      }
      return;
    }

    const newId = uuidv4();
    const { error: err } = await supabase.from('saved_addresses').insert({
      id: newId,
      user_id: user.id,
      address: loc.address,
      display_name: loc.displayName || loc.address,
      lat: loc.lat,
      lon: loc.lon,
    });
    if (err) {
      logSupabaseError(err, OperationType.CREATE, 'saved_addresses');
      setError('Could not save address.');
    }
  };

  const isAddressSaved = (address: string) => savedAddresses.some(a => a.address === address);

  const handleAddSavedToRoute = (startAddress: SavedAddress | null, stopAddresses: SavedAddress[]) => {
    let nextLocations = [...locations];
    
    if (startAddress) {
      const existingEnd = nextLocations.find(l => l.type === 'end');
      nextLocations = nextLocations.filter(loc => loc.type !== 'start' && loc.type !== 'end');
      
      const newStart = {
        ...startAddress,
        id: uuidv4(),
        type: 'start' as const
      };
      
      // Keep stops and the existing end
      nextLocations = [newStart, ...nextLocations.filter(l => l.type === 'stop')];
      if (existingEnd) {
        nextLocations.push(existingEnd);
      }
    }
    
    if (stopAddresses.length > 0) {
      const newLocations = stopAddresses.map(addr => ({
        ...addr,
        id: uuidv4(),
        type: 'stop' as const
      }));
      
      const start = nextLocations.find(l => l.type === 'start');
      const end = nextLocations.find(l => l.type === 'end');
      const stops = nextLocations.filter(l => l.type === 'stop');
      
      nextLocations = [];
      if (start) nextLocations.push(start);
      nextLocations.push(...stops, ...newLocations);
      if (end) nextLocations.push(end);
    }
    
    setLocations(nextLocations);
    setRouteResult(null);
  };

  const handleRemoveSavedAddress = async (id: string) => {
    if (!user) return;
    const { error: err } = await supabase
      .from('saved_addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (err) {
      logSupabaseError(err, OperationType.DELETE, 'saved_addresses');
      setError('Could not remove saved address.');
    }
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
          <div className="mb-6 space-y-4">
            <AddressFinder
              mode={inputMode}
              onModeChange={setInputMode}
              showEndOption={!startEqualsEnd}
              onPick={handlePickSuggestion}
              nearLat={startLoc?.lat}
              nearLon={startLoc?.lon}
            />
            <div className="pt-2 flex justify-between items-center border-t border-stone-100">
              <button
                type="button"
                onClick={async () => {
                  if (!user) {
                    try {
                      await signInWithGoogle();
                    } catch (e: any) {
                      setError(e?.message || 'Failed to start sign-in.');
                      return;
                    }
                  }
                  setIsSavedModalOpen(true);
                }}
                className="text-sm font-medium text-amber-700 hover:text-amber-800 flex items-center gap-1 transition-colors"
              >
                <Bookmark className="w-4 h-4" /> My Saved Addresses
              </button>
              {user ? (
                <button 
                  type="button"
                  onClick={signOut}
                  className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-3 h-3" /> Sign out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await signInWithGoogle();
                    } catch (e: any) {
                      setError(e?.message || 'Failed to start sign-in.');
                    }
                  }}
                  className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1 transition-colors"
                >
                  <LogIn className="w-3 h-3" /> Sign in to save
                </button>
              )}
            </div>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>

          <div className="space-y-4">
            {!user && (
              <p className={`text-xs ${atFreeLimit ? 'text-amber-700 font-medium' : 'text-stone-400'}`}>
                {addressCount} / {FREE_ADDRESS_LIMIT} addresses
                {atFreeLimit ? ' — sign in to add more' : ' (sign in for unlimited)'}
              </p>
            )}
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
                    <button onClick={() => handleToggleSaveAddress(displayStartLoc)} className={`transition-colors ${isAddressSaved(displayStartLoc.address) ? 'text-amber-600' : 'text-stone-400 hover:text-amber-600'}`} title={isAddressSaved(displayStartLoc.address) ? "Remove from saved" : "Save this address"}>
                      <Bookmark className="w-4 h-4" fill={isAddressSaved(displayStartLoc.address) ? "currentColor" : "none"} />
                    </button>
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
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStopsDragEnd}>
                  <SortableContext items={displayStopLocs.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                      {displayStopLocs.map((loc, i) => (
                        <SortableStop
                          key={loc.id}
                          loc={loc}
                          index={i}
                          isSaved={isAddressSaved(loc.address)}
                          onToggleSave={handleToggleSaveAddress}
                          onOpen={handleOpenSingleLocation}
                          onRemove={handleRemoveLocation}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
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
                    <button onClick={() => handleToggleSaveAddress(displayEndLoc)} className={`transition-colors ${isAddressSaved(displayEndLoc.address) ? 'text-amber-600' : 'text-stone-400 hover:text-amber-600'}`} title={isAddressSaved(displayEndLoc.address) ? "Remove from saved" : "Save this address"}>
                      <Bookmark className="w-4 h-4" fill={isAddressSaved(displayEndLoc.address) ? "currentColor" : "none"} />
                    </button>
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
        <Suspense fallback={
          <div className="w-full h-full flex items-center justify-center text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        }>
          <RouteMap
            locations={routeResult ? routeResult.optimizedLocations : locations}
            routeGeometry={routeResult?.geometry || null}
          />
        </Suspense>
      </div>

      {isSavedModalOpen && (
        <Suspense fallback={null}>
          <SavedAddressesModal
            isOpen={isSavedModalOpen}
            onClose={() => setIsSavedModalOpen(false)}
            savedAddresses={savedAddresses}
            onAddSelected={handleAddSavedToRoute}
            onRemoveSaved={handleRemoveSavedAddress}
          />
        </Suspense>
      )}
    </div>
  );
}
