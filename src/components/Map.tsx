import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Location } from '../utils/geocoding';

// Fix for default marker icons in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  locations: Location[];
  routeGeometry: [number, number][] | null;
}

function MapUpdater({ locations, routeGeometry }: { locations: Location[], routeGeometry: [number, number][] | null }) {
  const map = useMap();

  useEffect(() => {
    if (routeGeometry && routeGeometry.length > 0) {
      const bounds = L.latLngBounds(routeGeometry);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lon]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [locations, routeGeometry, map]);

  return null;
}

export default function Map({ locations, routeGeometry }: MapProps) {
  const center: [number, number] = locations.length > 0 
    ? [locations[0].lat, locations[0].lon] 
    : [39.8283, -98.5795]; // Center of US

  const createCustomIcon = (loc: Location, allLocs: Location[]) => {
    let label = '';
    let bgColor = '';

    if (loc.type === 'start') {
      label = 'S';
      bgColor = 'bg-stone-800';
    } else if (loc.type === 'end') {
      label = 'E';
      bgColor = 'bg-stone-500';
    } else {
      const stops = allLocs.filter(l => l.type === 'stop');
      const stopIndex = stops.findIndex(l => l.id === loc.id) + 1;
      label = stopIndex.toString();
      bgColor = 'bg-amber-700';
    }

    const html = `<div class="${bgColor} text-white w-8 h-8 flex items-center justify-center rounded-full border-2 border-white shadow-md font-bold text-sm">${label}</div>`;

    return L.divIcon({
      html,
      className: 'custom-leaflet-marker', // Avoid default leaflet styles
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  };

  return (
    <MapContainer center={center} zoom={4} className="w-full h-full z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      {locations.map((loc, index) => (
        <Marker key={loc.id} position={[loc.lat, loc.lon]} icon={createCustomIcon(loc, locations)}>
          <Tooltip direction="top" offset={[0, -16]} opacity={1}>
            <div className="font-semibold">{loc.type.toUpperCase()}</div>
            <div>{loc.address}</div>
          </Tooltip>
          <Popup>
            <div className="font-semibold">{loc.type.toUpperCase()}</div>
            <div>{loc.address}</div>
          </Popup>
        </Marker>
      ))}

      {routeGeometry && (
        <Polyline positions={routeGeometry} color="#b45309" weight={4} opacity={0.8} />
      )}

      <MapUpdater locations={locations} routeGeometry={routeGeometry} />
    </MapContainer>
  );
}
