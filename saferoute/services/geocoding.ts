/**
 * Place search and reverse geocoding.
 *
 * Provider: Photon (https://photon.komoot.io), an OpenStreetMap-based
 * geocoder designed for search-as-you-type. We use it instead of the public
 * Nominatim server because Nominatim's usage policy forbids client-side
 * autocomplete. Usage etiquette implemented here:
 *   - debounced input (in the UI hook) + minimum query length
 *   - one in-flight request at a time (previous one is aborted)
 *   - client-side spacing between requests and cooldown after HTTP 429
 *   - in-memory caching so repeated queries don't hit the network
 *
 * When NEXT_PUBLIC_API_BASE_URL is configured, requests go to the SafeRoute
 * backend instead (see services/api.ts).
 */

import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { formatCoordinates, isValidCoordinates } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { createCache, createRequestGate } from "@/lib/requestGate";
import type { Coordinates, Location } from "@/types";
import { API_ENDPOINTS, apiGet, isBackendConfigured } from "./api";

export const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 6;
const RATE_LIMIT_COOLDOWN_MS = 10_000;

const gate = createRequestGate(350);
const searchCache = createCache<Location[]>(60);
const reverseCache = createCache<Location | null>(60);

// ---- Photon response types (GeoJSON) -------------------------------------

interface PhotonProperties {
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  type?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PhotonProperties;
}

interface PhotonResponse {
  type: "FeatureCollection";
  features: PhotonFeature[];
}

function uniqueParts(parts: Array<string | undefined>, exclude: Array<string | undefined> = []): string[] {
  const seen = new Set(exclude.filter(Boolean).map((p) => p!.toLowerCase()));
  const result: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function streetLine(p: PhotonProperties): string | undefined {
  if (!p.street) return undefined;
  return p.housenumber ? `${p.housenumber} ${p.street}` : p.street;
}

/** Converts a Photon feature into our Location type. Exported for tests. */
export function photonFeatureToLocation(feature: PhotonFeature): Location | null {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  const point = { lat, lng };
  if (!isValidCoordinates(point)) return null;

  const p = feature.properties ?? {};
  const name =
    p.name?.trim() ||
    streetLine(p) ||
    p.locality ||
    p.district ||
    p.city ||
    p.county ||
    p.state ||
    p.country ||
    formatCoordinates(point);

  const address = uniqueParts(
    [p.name ? streetLine(p) : undefined, p.locality, p.district, p.city, p.state, p.postcode, p.country],
    [name],
  ).join(", ");

  const id =
    p.osm_type && p.osm_id !== undefined
      ? `osm:${p.osm_type}${p.osm_id}`
      : `geo:${lat.toFixed(6)},${lng.toFixed(6)}`;

  return { id, name, address: address || undefined, lat, lng, source: "search" };
}

function parsePhoton(data: unknown): Location[] {
  const features = (data as PhotonResponse)?.features;
  if (!Array.isArray(features)) {
    throw new AppError("INVALID_RESPONSE", "Unexpected geocoder response.");
  }
  const seen = new Set<string>();
  const results: Location[] = [];
  for (const feature of features) {
    const location = photonFeatureToLocation(feature);
    if (!location || seen.has(location.id)) continue;
    seen.add(location.id);
    results.push(location);
  }
  return results;
}

async function photonRequest(url: URL, signal?: AbortSignal): Promise<unknown> {
  await gate.acquire(signal);
  try {
    return await fetchJson<unknown>(url.toString(), { signal, timeoutMs: 10_000 });
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") {
      gate.block(error.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS);
    }
    throw error;
  }
}

// ---- Public API -----------------------------------------------------------

export interface SearchOptions {
  signal?: AbortSignal;
  /** Prefer results near this point (e.g. the user's position or map centre). */
  near?: Coordinates;
  limit?: number;
}

export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<Location[]> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < MIN_QUERY_LENGTH) return [];
  const limit = options.limit ?? DEFAULT_LIMIT;
  const near = options.near && isValidCoordinates(options.near) ? options.near : undefined;

  // Bias is rounded so small map movements don't defeat the cache.
  const cacheKey = [
    q.toLowerCase(),
    limit,
    near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : "-",
  ].join("|");
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  let results: Location[];
  if (isBackendConfigured()) {
    results = await apiGet<Location[]>(
      API_ENDPOINTS.geocodeSearch,
      { q, limit, lat: near?.lat, lng: near?.lng },
      { signal: options.signal, timeoutMs: 10_000 },
    );
  } else {
    const url = new URL(`${config.geocoderUrl}/api/`);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("lang", "en");
    if (near) {
      url.searchParams.set("lat", near.lat.toFixed(4));
      url.searchParams.set("lon", near.lng.toFixed(4));
    }
    results = parsePhoton(await photonRequest(url, options.signal));
  }

  searchCache.set(cacheKey, results);
  return results;
}

/**
 * Returns the nearest known place/address for a point, or null when the
 * geocoder has nothing there (e.g. open sea).
 */
export async function reverseGeocode(
  point: Coordinates,
  options: { signal?: AbortSignal } = {},
): Promise<Location | null> {
  if (!isValidCoordinates(point)) {
    throw new AppError("INVALID_LOCATION", "That location isn't valid.");
  }
  const cacheKey = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: Location | null;
  if (isBackendConfigured()) {
    const response = await apiGet<{ place: Location | null }>(
      API_ENDPOINTS.geocodeReverse,
      { lat: point.lat, lng: point.lng },
      { signal: options.signal, timeoutMs: 10_000 },
    );
    result = response?.place ?? null;
  } else {
    const url = new URL(`${config.geocoderUrl}/reverse`);
    url.searchParams.set("lat", point.lat.toFixed(6));
    url.searchParams.set("lon", point.lng.toFixed(6));
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", "1");
    result = parsePhoton(await photonRequest(url, options.signal))[0] ?? null;
  }

  reverseCache.set(cacheKey, result);
  return result;
}

/** One-line description of the place nearest to a point, e.g. "Near MG Road, Bengaluru". */
export function describeNearby(place: Location | null): string | undefined {
  if (!place) return undefined;
  const firstAddressPart = place.address?.split(", ").slice(0, 2).join(", ");
  return firstAddressPart ? `Near ${place.name}, ${firstAddressPart}` : `Near ${place.name}`;
}
