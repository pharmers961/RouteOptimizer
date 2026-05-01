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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && data.address) {
      return formatAddress(data, '');
    }
    return data?.display_name || null;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

export async function autocompleteAddress(query: string, startLat?: number, startLon?: number): Promise<Suggestion[]> {
  try {
    const limit = (startLat !== undefined && startLon !== undefined) ? 15 : 5;
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1`;
    if (startLat !== undefined && startLon !== undefined) {
      // Create a ~50km bounding box around the start location to bias the search slightly, without hard binding it
      const left = startLon - 0.5;
      const right = startLon + 0.5;
      const top = startLat + 0.5;
      const bottom = startLat - 0.5;
      url += `&viewbox=${left},${top},${right},${bottom}`;
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && data.length > 0) {
      if (startLat !== undefined && startLon !== undefined) {
        data.sort((a: any, b: any) => {
          const distA = calculateDistance(startLat, startLon, parseFloat(a.lat), parseFloat(a.lon));
          const distB = calculateDistance(startLat, startLon, parseFloat(b.lat), parseFloat(b.lon));
          return distA - distB;
        });
      }
      
      return data.slice(0, 5).map((item: any) => {
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
    const limit = (startLat !== undefined && startLon !== undefined) ? 10 : 1;
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1`;
    if (startLat !== undefined && startLon !== undefined) {
      // Create a ~50km bounding box around the start location to bias the search slightly
      const left = startLon - 0.5;
      const right = startLon + 0.5;
      const top = startLat + 0.5;
      const bottom = startLat - 0.5;
      url += `&viewbox=${left},${top},${right},${bottom}`;
    }

    const response = await fetch(url);
    const data = await response.json();
    if (data && data.length > 0) {
      if (startLat !== undefined && startLon !== undefined) {
        data.sort((a: any, b: any) => {
          const distA = calculateDistance(startLat, startLon, parseFloat(a.lat), parseFloat(a.lon));
          const distB = calculateDistance(startLat, startLon, parseFloat(b.lat), parseFloat(b.lon));
          return distA - distB;
        });
      }

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
