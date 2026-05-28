import { useState, useMemo } from 'react';
import { useLocationStore } from '../store/locationStore';

function getStreetNumber(address: string): number {
  const match = address.match(/\d+/);
  return match ? parseInt(match[0], 10) : Infinity;
}

export function SavedLocations() {
  const { savedLocations, removeSavedLocation, addStop } = useLocationStore();
  const [search, setSearch] = useState('');

  const filteredLocations = useMemo(() => {
    let result = savedLocations;

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(
        (loc) =>
          loc.label.toLowerCase().includes(query) ||
          loc.address.toLowerCase().includes(query)
      );
    }

    return [...result].sort(
      (a, b) => getStreetNumber(a.address) - getStreetNumber(b.address)
    );
  }, [savedLocations, search]);

  return (
    <div className="saved-locations">
      <div className="saved-locations-header">
        <h2>Saved Addresses</h2>
        <div className="saved-locations-controls">
          <input
            type="text"
            placeholder="Search saved addresses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {filteredLocations.length === 0 ? (
        <p className="empty-state">No saved addresses found.</p>
      ) : (
        <ul className="saved-locations-list">
          {filteredLocations.map((location) => (
            <li key={location.id} className="saved-location-item">
              <div className="location-info">
                <span className="location-label">{location.label}</span>
                <span className="location-address">{location.address}</span>
              </div>
              <div className="location-actions">
                <button
                  onClick={() => addStop(location)}
                  className="btn-use-stop"
                >
                  Add as Stop
                </button>
                <button
                  onClick={() => removeSavedLocation(location.id)}
                  className="btn-remove"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
