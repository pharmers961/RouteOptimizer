import React, { useState } from 'react';
import { X, MapPin, Plus, Check } from 'lucide-react';
import { Location } from '../utils/geocoding';

export type SavedAddress = Omit<Location, 'type'>;

interface SavedAddressesModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedAddresses: SavedAddress[];
  onAddSelected: (startAddress: SavedAddress | null, stopAddresses: SavedAddress[]) => void;
  onRemoveSaved: (id: string) => void;
}

export default function SavedAddressesModal({
  isOpen,
  onClose,
  savedAddresses,
  onAddSelected,
  onRemoveSaved
}: SavedAddressesModalProps) {
  const [selectedStartId, setSelectedStartId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleSetStartId = (id: string) => {
    setSelectedStartId(prev => (prev === id ? null : id));
    if (selectedStartId !== id) {
      const next = new Set(selectedIds);
      next.delete(id);
      setSelectedIds(next);
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleAdd = () => {
    const startAddr = savedAddresses.find(a => a.id === selectedStartId) || null;
    const stopAddrs = savedAddresses.filter(a => selectedIds.has(a.id));
    onAddSelected(startAddr, stopAddrs);
    setSelectedIds(new Set());
    setSelectedStartId(null);
    onClose();
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setSelectedStartId(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-800">Saved Addresses</h2>
          <button onClick={handleClose} className="p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {savedAddresses.length === 0 ? (
            <p className="text-center text-stone-500 py-6 text-sm">
              You haven't saved any addresses yet. Click the bookmark icon on any active location to save it here.
            </p>
          ) : (
            <div className="space-y-6">
              <section>
                <h3 className="text-xs font-bold text-stone-500 mb-3 uppercase tracking-wider">Start Location</h3>
                <ul className="space-y-2">
                  {savedAddresses.map((addr) => (
                    <li
                      key={`start-${addr.id}`}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedStartId === addr.id ? 'border-amber-600 bg-amber-50' : 'border-stone-200 hover:border-amber-300'
                      }`}
                      onClick={() => handleSetStartId(addr.id)}
                    >
                      <div className="pt-0.5">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                          selectedStartId === addr.id ? 'border-amber-600 bg-amber-600' : 'border-stone-300 bg-white'
                        }`}>
                          {selectedStartId === addr.id && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-stone-800 truncate" title={addr.displayName || addr.address}>
                          {addr.displayName || addr.address}
                        </span>
                        <span className="block text-xs text-stone-500 truncate" title={addr.address}>
                          {addr.address}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedStartId === addr.id) {
                            setSelectedStartId(null);
                          }
                          onRemoveSaved(addr.id);
                        }}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove from saved addresses"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-xs font-bold text-stone-500 mb-3 uppercase tracking-wider">Route Stops</h3>
                <ul className="space-y-2">
                  {savedAddresses.map((addr) => {
                    if (addr.id === selectedStartId) return null;
                    return (
                    <li
                      key={`stop-${addr.id}`}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedIds.has(addr.id) ? 'border-amber-600 bg-amber-50' : 'border-stone-200 hover:border-amber-300'
                      }`}
                      onClick={() => toggleSelection(addr.id)}
                    >
                      <div className="pt-0.5">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                          selectedIds.has(addr.id) ? 'bg-amber-600 border-amber-600 text-white' : 'border-stone-300 bg-white'
                        }`}>
                          {selectedIds.has(addr.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-stone-800 truncate" title={addr.displayName || addr.address}>
                          {addr.displayName || addr.address}
                        </span>
                        <span className="block text-xs text-stone-500 truncate" title={addr.address}>
                          {addr.address}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedIds.has(addr.id)) {
                            const next = new Set(selectedIds);
                            next.delete(addr.id);
                            setSelectedIds(next);
                          }
                          onRemoveSaved(addr.id);
                        }}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove from saved addresses"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
                </ul>
              </section>
            </div>
          )}
        </div>

        {savedAddresses.length > 0 && (
          <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end gap-3 rounded-b-xl">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedIds.size === 0 && !selectedStartId}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add {selectedIds.size > 0 ? selectedIds.size : ''} to Route
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
