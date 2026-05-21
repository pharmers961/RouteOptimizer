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

export interface SearchOptions {
  signal?: AbortSignal;
  limit?: number;
  nearLat?: number;
  nearLon?: number;
}

// --- Provider selection -----------------------------------------------------
// Mapbox is the recommended provider: real US address coverage with house-
// number interpolation and autocomplete-grade ranking. Set VITE_MAPBOX_TOKEN
// to enable it. Without a token we fall back to Nominatim (OSM), which is
// keyless but weak on US residential addresses.

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

const NOMINATIM_BASE = (import.meta.env.VITE_GEOCODER_BASE_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://nominatim.openstreetmap.org';
const NOMINATIM_KEY = import.meta.env.VITE_GEOCODER_API_KEY as string | undefined;

const useMapbox = Boolean(MAPBOX_TOKEN);

function lang(): string {
  return (typeof navigator !== 'undefined' && navigator.language) ? navigator.language.split('-')[0] : 'en';
}

// --- Mapbox (Geocoding v6) --------------------------------------------------

const MAPBOX_BASE = 'https://api.mapbox.com/search/geocode/v6';

function mapboxFeatureToSuggestion(f: any): Suggestion {
  const props = f.properties || {};
  const coords: number[] = f.geometry?.coordinates || [];
  const primaryText: string = props.name || props.name_preferred
    || (props.full_address ? String(props.full_address).split(',')[0] : 'Unknown location');
  const secondaryText: string = props.place_formatted || '';
  const displayName: string = props.full_address
    || (secondaryText ? `${primaryText}, ${secondaryText}` : primaryText);
  return {
    id: String(props.mapbox_id || f.id || `${coords[1]},${coords[0]}`),
    primaryText,
    secondaryText,
    displayName,
    lat: coords[1],
    lon: coords[0],
  };
}

async function mapboxSearch(query: string, opts: SearchOptions): Promise<Suggestion[]> {
  const url = new URL(`${MAPBOX_BASE}/forward`);
  url.searchParams.set('q', query);
  url.searchParams.set('access_token', MAPBOX_TOKEN!);
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('limit', String(opts.limit ?? 6));
  url.searchParams.set('language', lang());
  if (typeof opts.nearLat === 'number' && typeof opts.nearLon === 'number') {
    url.searchParams.set('proximity', `${opts.nearLon},${opts.nearLat}`);
  }
  const res = await fetch(url.toString(), { signal: opts.signal });
  if (!res.ok) throw new Error(`Mapbox geocoder responded ${res.status}`);
  const data = await res.json();
  const features: any[] = Array.isArray(data?.features) ? data.features : [];
  return features
    .filter((f) => f.geometry?.coordinates?.length === 2)
    .map(mapboxFeatureToSuggestion);
}

async function mapboxReverse(lat: number, lon: number, signal?: AbortSignal): Promise<Suggestion | null> {
  const url = new URL(`${MAPBOX_BASE}/reverse`);
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('access_token', MAPBOX_TOKEN!);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', lang());
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Mapbox geocoder responded ${res.status}`);
  const data = await res.json();
  const f = Array.isArray(data?.features) ? data.features[0] : null;
  return f && f.geometry?.coordinates?.length === 2 ? mapboxFeatureToSuggestion(f) : null;
}

// --- Nominatim (keyless fallback) -------------------------------------------

interface NominatimAddress {
  house_number?: string;
  road?: string; pedestrian?: string; footway?: string; cycleway?: string; path?: string;
  neighbourhood?: string; suburb?: string;
  city?: string; town?: string; village?: string; hamlet?: string; municipality?: string; county?: string;
  state?: string; state_district?: string;
  postcode?: string; country?: string; country_code?: string;
}

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NominatimAddress;
}

function pickStreet(a: NominatimAddress) {
  return a.road || a.pedestrian || a.footway || a.cycleway || a.path;
}
function pickCity(a: NominatimAddress) {
  return a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || a.neighbourhood || a.county;
}

function nominatimToSuggestion(r: NominatimResult): Suggestion {
  const addr = r.address || {};
  const street = pickStreet(addr);
  const city = pickCity(addr);
  const state = addr.state || addr.state_district;

  let primaryText: string;
  if (addr.house_number && street) {
    primaryText = `${addr.house_number} ${street}`;
  } else if (street) {
    primaryText = street;
  } else if (r.name) {
    primaryText = r.name;
  } else {
    primaryText = r.display_name.split(',')[0].trim();
  }

  const secondaryParts: string[] = [];
  if (city) secondaryParts.push(city);
  if (state && state !== city) secondaryParts.push(state);
  if (addr.postcode) secondaryParts.push(addr.postcode);
  if (addr.country) secondaryParts.push(addr.country);
  const secondaryText = secondaryParts.join(', ');
  const displayName = secondaryText ? `${primaryText}, ${secondaryText}` : primaryText;

  return {
    id: String(r.place_id),
    primaryText,
    secondaryText,
    displayName,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  };
}

async function nominatimFetch(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<any> {
  const url = new URL(`${NOMINATIM_BASE}${path}`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  if (NOMINATIM_KEY) url.searchParams.set('key', NOMINATIM_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
  return res.json();
}

async function nominatimSearch(query: string, opts: SearchOptions): Promise<Suggestion[]> {
  const params: Record<string, string> = {
    q: query,
    limit: String(opts.limit ?? 6),
    'accept-language': lang(),
    // Prefer street addresses over POIs (Nominatim 4+).
    layer: 'address,poi',
  };
  if (typeof opts.nearLat === 'number' && typeof opts.nearLon === 'number') {
    const d = 0.5;
    params.viewbox = `${opts.nearLon - d},${opts.nearLat + d},${opts.nearLon + d},${opts.nearLat - d}`;
    params.bounded = '0';
  }
  const data = (await nominatimFetch('/search', params, opts.signal)) as NominatimResult[];
  if (!Array.isArray(data)) return [];
  return data.map(nominatimToSuggestion);
}

async function nominatimReverse(lat: number, lon: number, signal?: AbortSignal): Promise<Suggestion | null> {
  const data = (await nominatimFetch('/reverse', {
    lat: String(lat),
    lon: String(lon),
    'accept-language': lang(),
  }, signal)) as NominatimResult | { error: string };
  if (!data || 'error' in data) return null;
  const result: NominatimResult = {
    ...data,
    place_id: (data as NominatimResult).place_id ?? Math.round(lat * 1e6) * 1e6 + Math.round(lon * 1e6),
  };
  return nominatimToSuggestion(result);
}

// --- Public API -------------------------------------------------------------

export async function searchAddresses(query: string, opts: SearchOptions = {}): Promise<Suggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  try {
    return useMapbox ? await mapboxSearch(trimmed, opts) : await nominatimSearch(trimmed, opts);
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    console.error('Address search error:', error);
    return [];
  }
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<Suggestion | null> {
  try {
    return useMapbox ? await mapboxReverse(lat, lon, signal) : await nominatimReverse(lat, lon, signal);
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
