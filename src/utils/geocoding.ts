export interface Location {
  id: string;
  address: string;
  lat: number;
  lon: number;
  type: 'start' | 'end' | 'stop';
  displayName?: string;
  done?: boolean;
}

export interface Suggestion {
  id: string;
  displayName: string;
  lat: number;
  lon: number;
}

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

// Matches a leading house number including hyphenated (Queens-style "123-45")
// and fractional ("123 1/2") forms, with an optional single-letter suffix.
const HOUSE_NUMBER_RE = /^(\d+(?:[-\/]\d+)?[a-zA-Z]?)\s/;

function extractHouseNumber(query: string): string | null {
  const match = query.trim().match(HOUSE_NUMBER_RE);
  return match ? match[1] : null;
}

function formatAddress(item: any, query: string): string {
  const addr = item.address;
  if (!addr) {
    let displayName: string = item.display_name || '';
    const houseNumber = extractHouseNumber(query);
    if (houseNumber && !displayName.includes(houseNumber)) {
      const parts = displayName.split(', ');
      parts[0] = `${houseNumber} ${parts[0]}`;
      displayName = parts.join(', ');
    }
    return displayName;
  }

  const houseNumber = addr.house_number || extractHouseNumber(query);

  const streetParts: string[] = [];
  if (houseNumber) streetParts.push(houseNumber);
  if (addr.road) streetParts.push(addr.road);

  const street = streetParts.join(' ');
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county;

  const finalParts: string[] = [];
  if (street) finalParts.push(street);
  if (city) finalParts.push(city);
  if (addr.state) finalParts.push(addr.state);
  if (addr.postcode) finalParts.push(addr.postcode);

  return finalParts.join(', ') || item.display_name || '';
}

async function nominatimFetch(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const search = new URLSearchParams({ format: 'json', addressdetails: '1', ...params });
  const response = await fetch(`${NOMINATIM_BASE}/${path}?${search.toString()}`, {
    headers: { 'Accept-Language': navigator.language || 'en' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Nominatim ${path} failed: ${response.status}`);
  }
  return response.json();
}

function viewboxParams(lat: number, lon: number): Record<string, string> {
  // ~55km box at the equator; used as a soft bias, not a hard bound.
  const left = lon - 0.5;
  const right = lon + 0.5;
  const top = lat + 0.5;
  const bottom = lat - 0.5;
  return { viewbox: `${left},${top},${right},${bottom}` };
}

// Build a list of progressively-broader search attempts. We try the most
// specific (biased to the user's start) first, then fall back to wider
// searches so addresses outside the bias area can still be found.
function buildSearchAttempts(query: string, startLat?: number, startLon?: number): Record<string, string>[] {
  const base: Record<string, string> = { q: query, limit: '5', dedupe: '1' };
  const attempts: Record<string, string>[] = [];

  if (startLat !== undefined && startLon !== undefined) {
    attempts.push({ ...base, ...viewboxParams(startLat, startLon), countrycodes: 'us' });
  }
  attempts.push({ ...base, countrycodes: 'us' });
  attempts.push({ ...base });

  return attempts;
}

const searchCache = new Map<string, any[]>();

async function searchWithFallback(query: string, startLat?: number, startLon?: number, signal?: AbortSignal): Promise<any[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `${trimmed.toLowerCase()}|${startLat ?? ''}|${startLon ?? ''}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  for (const params of buildSearchAttempts(trimmed, startLat, startLon)) {
    try {
      const data = await nominatimFetch('search', params, signal);
      if (Array.isArray(data) && data.length > 0) {
        searchCache.set(cacheKey, data);
        return data;
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') throw err;
      // Other errors: continue to the next, wider attempt.
    }
  }

  searchCache.set(cacheKey, []);
  return [];
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const data = await nominatimFetch('reverse', { lat: String(lat), lon: String(lon) });
    if (data?.address) return formatAddress(data, '');
    return data?.display_name || null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

export async function autocompleteAddress(
  query: string,
  startLat?: number,
  startLon?: number,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  try {
    const data = await searchWithFallback(query, startLat, startLon, signal);
    return data.map((item: any) => ({
      id: item.place_id?.toString() || `${item.lat},${item.lon}`,
      displayName: formatAddress(item, query),
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }));
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return [];
    console.error('Autocomplete error:', error);
    return [];
  }
}

export async function geocode(
  query: string,
  startLat?: number,
  startLon?: number,
): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    const data = await searchWithFallback(query, startLat, startLon);
    if (data.length === 0) return null;
    const top = data[0];
    return {
      lat: parseFloat(top.lat),
      lon: parseFloat(top.lon),
      displayName: formatAddress(top, query),
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}
