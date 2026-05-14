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
  primaryText: string;
  secondaryText: string;
  lat: number;
  lon: number;
}

// Geocoder is Nominatim-compatible. Override to a paid mirror (LocationIQ,
// Geoapify, Maptiler, self-hosted Nominatim) by setting VITE_GEOCODER_BASE_URL
// and optionally VITE_GEOCODER_API_KEY at build time.
const GEOCODER_BASE = (import.meta.env.VITE_GEOCODER_BASE_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://nominatim.openstreetmap.org';
const GEOCODER_KEY = import.meta.env.VITE_GEOCODER_API_KEY as string | undefined;

interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  cycleway?: string;
  path?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  state_district?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  class?: string;
  address?: NominatimAddress;
  importance?: number;
}

function pickStreet(addr: NominatimAddress): string | undefined {
  return addr.road || addr.pedestrian || addr.footway || addr.cycleway || addr.path;
}

function pickCity(addr: NominatimAddress): string | undefined {
  return addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.suburb || addr.neighbourhood || addr.county;
}

function buildTexts(result: NominatimResult): { primaryText: string; secondaryText: string; displayName: string } {
  const addr = result.address || {};
  const street = pickStreet(addr);
  const city = pickCity(addr);
  const state = addr.state || addr.state_district;
  const country = addr.country;

  let primaryText: string;
  if (addr.house_number && street) {
    primaryText = `${addr.house_number} ${street}`;
  } else if (street) {
    primaryText = street;
  } else if (result.name) {
    primaryText = result.name;
  } else {
    primaryText = result.display_name.split(',')[0].trim();
  }

  if (result.name && street && !primaryText.includes(result.name)) {
    primaryText = `${result.name} · ${primaryText}`;
  }

  const secondaryParts: string[] = [];
  if (city) secondaryParts.push(city);
  if (state && state !== city) secondaryParts.push(state);
  if (addr.postcode) secondaryParts.push(addr.postcode);
  if (country) secondaryParts.push(country);
  const secondaryText = secondaryParts.join(', ');

  const displayName = secondaryText ? `${primaryText}, ${secondaryText}` : primaryText;
  return { primaryText, secondaryText, displayName };
}

function toSuggestion(result: NominatimResult): Suggestion {
  const { primaryText, secondaryText, displayName } = buildTexts(result);
  return {
    id: String(result.place_id),
    primaryText,
    secondaryText,
    displayName,
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
  };
}

async function geocoderFetch(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const url = new URL(`${GEOCODER_BASE}${path}`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  if (GEOCODER_KEY) url.searchParams.set('key', GEOCODER_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url.toString(), {
    signal,
    headers: { 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error(`Geocoder responded ${response.status}`);
  return response.json();
}

export interface SearchOptions {
  signal?: AbortSignal;
  limit?: number;
  nearLat?: number;
  nearLon?: number;
}

export async function searchAddresses(query: string, opts: SearchOptions = {}): Promise<Suggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  try {
    const params: Record<string, string> = {
      q: trimmed,
      limit: String(opts.limit ?? 6),
      'accept-language': navigator.language || 'en',
    };

    if (typeof opts.nearLat === 'number' && typeof opts.nearLon === 'number') {
      const d = 0.5;
      params.viewbox = `${opts.nearLon - d},${opts.nearLat + d},${opts.nearLon + d},${opts.nearLat - d}`;
      params.bounded = '0';
    }

    const data = (await geocoderFetch('/search', params, opts.signal)) as NominatimResult[];
    if (!Array.isArray(data)) return [];
    return data.map(toSuggestion);
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    console.error('Address search error:', error);
    return [];
  }
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<Suggestion | null> {
  try {
    const data = (await geocoderFetch('/reverse', {
      lat: String(lat),
      lon: String(lon),
      'accept-language': navigator.language || 'en',
    }, signal)) as NominatimResult | { error: string };

    if (!data || 'error' in data) return null;
    // Reverse responses sometimes omit place_id; synthesize a stable id from coords.
    const result: NominatimResult = {
      ...data,
      place_id: data.place_id ?? Math.round(lat * 1e6) * 1e6 + Math.round(lon * 1e6),
    };
    return toSuggestion(result);
  } catch (error: any) {
    if (error?.name === 'AbortError') return null;
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

export async function geocode(
  query: string,
  nearLat?: number,
  nearLon?: number,
  signal?: AbortSignal,
): Promise<Suggestion | null> {
  const results = await searchAddresses(query, { nearLat, nearLon, limit: 1, signal });
  return results[0] || null;
}
