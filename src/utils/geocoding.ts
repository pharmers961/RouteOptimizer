import { v4 as uuidv4 } from 'uuid';

export interface Location {
  id: string;
  address: string;
  lat: number;
  lon: number;
  type: 'start' | 'end' | 'stop';
  displayName?: string;
}

export interface Suggestion {
  id: string;
  displayName: string;
  lat: number;
  lon: number;
}


export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data?.features?.length > 0) {
      return formatPhotonAddress(data.features[0].properties);
    }
    return null;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

function formatPhotonAddress(props: any): string {
  const parts = [];
  
  // Try to use house number + street as primary if available
  let streetPart = '';
  if (props.housenumber && props.street) {
    streetPart = `${props.housenumber} ${props.street}`;
  } else if (props.street) {
    streetPart = props.street;
  }

  // If there's a name, use it, maybe combined with street
  if (props.name) {
    parts.push(props.name);
    if (streetPart && !props.name.includes(props.street)) {
      parts.push(streetPart);
    }
  } else if (streetPart) {
    parts.push(streetPart);
  }

  const city = props.city || props.town || props.village || props.county;
  if (city) parts.push(city);
  
  if (props.state) parts.push(props.state);
  if (props.postcode) parts.push(props.postcode);
  
  return parts.join(', ') || 'Unknown location';
}

export async function autocompleteAddress(query: string, startLat?: number, startLon?: number): Promise<Suggestion[]> {
  try {
    const limit = 5;
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`;
    
    // Add location bias if available
    if (startLat !== undefined && startLon !== undefined) {
      url += `&lat=${startLat}&lon=${startLon}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data?.features?.length > 0) {
      return data.features.map((f: any) => ({
        id: (f.properties.osm_id || Math.random()).toString(),
        displayName: formatPhotonAddress(f.properties),
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0]
      }));
    }
    return [];
  } catch (error) {
    console.error("Autocomplete error:", error);
    return [];
  }
}

export async function geocode(query: string, startLat?: number, startLon?: number): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`;
    
    if (startLat !== undefined && startLon !== undefined) {
      url += `&lat=${startLat}&lon=${startLon}`;
    }

    const response = await fetch(url);
    const data = await response.json();
    
    if (data?.features?.length > 0) {
      const f = data.features[0];
      return {
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        displayName: formatPhotonAddress(f.properties)
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

