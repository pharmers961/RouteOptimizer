import { Location } from './geocoding';

export interface RouteResult {
  geometry: [number, number][];
  distance: number;
  duration: number;
  optimizedLocations: Location[];
}

export async function optimizeRoute(locations: Location[]): Promise<RouteResult | null> {
  if (locations.length < 2) return null;

  const start = locations.find(l => l.type === 'start');
  const end = locations.find(l => l.type === 'end');
  const stops = locations.filter(l => l.type === 'stop');

  if (!start) throw new Error("Start location is required");

  const orderedLocations = [start, ...stops];
  if (end) {
    orderedLocations.push(end);
  }

  const coords = orderedLocations.map(l => `${l.lon},${l.lat}`).join(';');
  const destParam = end ? 'destination=last' : 'destination=any';

  const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&${destParam}&roundtrip=false&overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok') {
      throw new Error(data.message || 'Failed to optimize route');
    }

    const trip = data.trips[0];
    const waypoints = data.waypoints;

    const optimizedLocations = new Array(orderedLocations.length);
    waypoints.forEach((wp: any, index: number) => {
      // OSRM returns waypoints in the same order as the input coordinates
      // wp.waypoint_index is the new optimized position
      if (wp.waypoint_index !== undefined && orderedLocations[index]) {
        optimizedLocations[wp.waypoint_index] = orderedLocations[index];
      }
    });

    // Filter out any undefined elements that might have occurred due to identical coordinates
    const finalOptimizedLocations = optimizedLocations.filter(loc => loc !== undefined);

    // If start and end are identical, OSRM might drop the end waypoint. Re-add it if needed.
    if (end && finalOptimizedLocations.length > 0 && finalOptimizedLocations[finalOptimizedLocations.length - 1].type !== 'end') {
      finalOptimizedLocations.push(end);
    }

    const geometry: [number, number][] = trip.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);

    return {
      geometry,
      distance: trip.distance,
      duration: trip.duration,
      optimizedLocations: finalOptimizedLocations
    };
  } catch (error) {
    console.error("Routing error:", error);
    return null;
  }
}
