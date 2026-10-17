/**
 * Reported crimes for the map, from the SafeRoute backend.
 *
 * The backend collects news reports (MiMo web search), verifies each one
 * against its article and locates it at locality level. Without a configured
 * backend there is no crime layer at all — nothing is shown rather than
 * anything made up.
 */

import { AppError } from "@/lib/errors";
import { createCache } from "@/lib/requestGate";
import type { IncidentsResponse, MapBounds } from "@/types";
import { API_ENDPOINTS, apiGet, isBackendConfigured } from "./api";

const cache = createCache<IncidentsResponse>(30);

export function isCrimeLayerAvailable(): boolean {
  return isBackendConfigured();
}

/** Rounds bounds outward so small pans reuse the same request. */
function roundBounds(b: MapBounds): MapBounds {
  const f = 50; // 0.02° steps
  return {
    south: Math.floor(b.south * f) / f,
    west: Math.floor(b.west * f) / f,
    north: Math.ceil(b.north * f) / f,
    east: Math.ceil(b.east * f) / f,
  };
}

export async function fetchIncidents(
  bounds: MapBounds,
  options: { signal?: AbortSignal } = {},
): Promise<IncidentsResponse> {
  if (!isBackendConfigured()) {
    throw new AppError("BACKEND_NOT_CONFIGURED", "NEXT_PUBLIC_API_BASE_URL is not set.");
  }
  const b = roundBounds(bounds);
  const key = `${b.south},${b.west},${b.north},${b.east}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const response = await apiGet<IncidentsResponse>(
    API_ENDPOINTS.incidents,
    {
      south: Math.max(-90, b.south),
      west: Math.max(-180, b.west),
      north: Math.min(90, b.north),
      east: Math.min(180, b.east),
    },
    { signal: options.signal, timeoutMs: 10_000 },
  );
  if (!response || !Array.isArray(response.incidents)) {
    throw new AppError("INVALID_RESPONSE", "Unexpected incidents response.");
  }
  cache.set(key, response);
  return response;
}
