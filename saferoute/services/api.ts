/**
 * SafeRoute backend client (future Java Spring Boot server).
 *
 * All communication with our own backend goes through this file. When
 * NEXT_PUBLIC_API_BASE_URL is set, services/geocoding.ts and
 * services/routing.ts delegate to these endpoints instead of calling public
 * providers from the browser. The UI is unaware of which path is used.
 *
 * Expected backend contract (JSON, shapes defined in types/index.ts):
 *
 *   GET  /api/v1/geocode/search?q=<text>&limit=<n>[&lat=<lat>&lng=<lng>]
 *        -> Location[]
 *   GET  /api/v1/geocode/reverse?lat=<lat>&lng=<lng>
 *        -> { place: Location | null }
 *   POST /api/v1/routes
 *        body: { pickup: Coordinates, destination: Coordinates,
 *                mode: TravelMode, alternatives: boolean }
 *        -> RouteResponse (routes carry labels + safety facts)
 *   GET  /api/v1/incidents?south=&west=&north=&east=
 *        -> IncidentsResponse
 *   GET  /api/v1/community-reports?south=&west=&north=&east=
 *        -> CommunitySpotsResponse
 *   POST /api/v1/community-reports
 *        body: { category, lat, lng, note?, deviceId } -> CommunitySpot
 *
 * The backend lives in ../saferoute-backend (Java Spring Boot).
 */

import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { fetchJson, type FetchJsonOptions } from "@/lib/http";

export const API_ENDPOINTS = {
  geocodeSearch: "/api/v1/geocode/search",
  geocodeReverse: "/api/v1/geocode/reverse",
  routes: "/api/v1/routes",
  incidents: "/api/v1/incidents",
  communityReports: "/api/v1/community-reports",
} as const;

export function isBackendConfigured(): boolean {
  return config.apiBaseUrl.length > 0;
}

type Query = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${config.apiBaseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiGet<T>(
  path: string,
  query?: Query,
  options: Pick<FetchJsonOptions, "signal" | "timeoutMs"> = {},
): Promise<T> {
  if (!isBackendConfigured()) {
    throw new AppError("BACKEND_NOT_CONFIGURED", "NEXT_PUBLIC_API_BASE_URL is not set.");
  }
  return fetchJson<T>(buildUrl(path, query), { ...options, method: "GET" });
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options: Pick<FetchJsonOptions, "signal" | "timeoutMs"> = {},
): Promise<T> {
  if (!isBackendConfigured()) {
    throw new AppError("BACKEND_NOT_CONFIGURED", "NEXT_PUBLIC_API_BASE_URL is not set.");
  }
  return fetchJson<T>(buildUrl(path), { ...options, method: "POST", body });
}
