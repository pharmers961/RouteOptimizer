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

function formatAddress(item: any, query: string): string {
  const addr = item.address;
  if (!addr) {
    // Fallback if address details are missing
    let displayName = item.display_name;
    const match = query.trim().match(/^(\d+[a-zA-Z]?)\s/);
    if (match) {
      const houseNumber = match[1];
      if (!displayName.includes(houseNumber)) {
        const parts = displayName.split(', ');
        parts[0] = `${houseNumber} ${parts[0]}`;
        displayName = parts.join(', ');
      }
    }
    return displayName;
  }

  let houseNumber = addr.house_number;
  if (!houseNumber) {
    const match = query.trim().match(/^(\d+[a-zA-Z]?)\s/);
    if (match) {
      houseNumber = match[1];
    }
  }

  const streetParts = [];
  if (houseNumber) streetParts.push(houseNumber);
  if (addr.road) streetParts.push(addr.road);
  
  const street = streetParts.join(' ');
  const city = addr.city || addr.town || addr.village || addr.municipality;
  
  const finalParts = [];
  
  if (street) finalParts.push(street);
  if (city) finalParts.push(city);
  if (addr.state) finalParts.push(addr.state);
  if (addr.postcode) finalParts.push(addr.postcode);
  
  return finalParts.join(', ') || item.display_name;
}

export async function autocompleteAddress(query: string, startLat?: number, startLon?: number): Promise<Suggestion[]> {
  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&countrycodes=us`;
    if (startLat !== undefined && startLon !== undefined) {
      // Create a ~50km bounding box around the start location
      const left = startLon - 0.5;
      const right = startLon + 0.5;
      const top = startLat + 0.5;
      const bottom = startLat - 0.5;
      url += `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && data.length > 0) {
      return data.map((item: any) => {
        return {
          id: item.place_id?.toString() || Math.random().toString(),
          displayName: formatAddress(item, query),
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon)
        };
      });
    }
    return [];
  } catch (error) {
    console.error("Autocomplete error:", error);
    return [];
  }
}

export async function geocode(query: string, startLat?: number, startLon?: number): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1&countrycodes=us`;
    if (startLat !== undefined && startLon !== undefined) {
      // Create a ~50km bounding box around the start location
      const left = startLon - 0.5;
      const right = startLon + 0.5;
      const top = startLat + 0.5;
      const bottom = startLat - 0.5;
      url += `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
    }

    const response = await fetch(url);
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: formatAddress(data[0], query)
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}
