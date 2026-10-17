/**
 * Route calculation.
 *
 * Today: OSRM running on OpenStreetMap data, via the FOSSGIS public
 * instances (routing.openstreetmap.de) which provide car, bike and foot
 * profiles. Alternatives are requested so the UI already handles several
 * routes per request.
 *
 * Tomorrow: when NEXT_PUBLIC_API_BASE_URL is set, the request goes to the
 * Java Spring Boot backend (POST /api/v1/routes), which will call routing
 * providers, run the safety engine, and return the same RouteResponse
 * shape. Nothing in the UI needs to change.
 */

import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { haversineMeters, isValidCoordinates } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { createCache, createRequestGate } from "@/lib/requestGate";
import type { Coordinates, Route, RouteRequest, RouteResponse, TravelMode } from "@/types";
import { API_ENDPOINTS, apiPost, isBackendConfigured } from "./api";

const MIN_SEPARATION_METERS = 15;
const ROUTING_TIMEOUT_MS = 20_000;
const BACKEND_ROUTING_TIMEOUT_MS = 45_000;
const RATE_LIMIT_COOLDOWN_MS = 10_000;

// FOSSGIS asks for at most one request per second.
const gate = createRequestGate(1_000);
const cache = createCache<RouteResponse>(20);

const OSRM_PROFILE_PATH: Record<TravelMode, string> = {
  driving: "routed-car",
  cycling: "routed-bike",
  walking: "routed-foot",
};

const PROVIDER_NAME = "OSRM · FOSSGIS (OpenStreetMap data)";

// ---- OSRM response types --------------------------------------------------

interface OsrmLeg {
  summary?: string;
  distance: number;
  duration: number;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  legs: OsrmLeg[];
}

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: OsrmRoute[];
}

const OSRM_ERROR_MESSAGES: Record<string, string> = {
  NoRoute: "No route found between these locations for this travel mode.",
  NoSegment: "One of the locations isn't close enough to a road or path. Try a nearby point.",
  TooBig: "These locations are too far apart to route between.",
  InvalidValue: "One of the locations isn't valid.",
  InvalidQuery: "One of the locations isn't valid.",
};

function osrmError(code: string | undefined): AppError {
  const message = (code && OSRM_ERROR_MESSAGES[code]) || "Couldn't calculate a route for these locations.";
  const errorCode = code === "InvalidValue" || code === "InvalidQuery" ? "INVALID_LOCATION" : "NO_ROUTE";
  return new AppError(errorCode, message);
}

/** Converts an OSRM response into our RouteResponse. Exported for tests. */
export function parseOsrmResponse(
  data: unknown,
  request: { pickup: Coordinates; destination: Coordinates; mode: TravelMode },
): RouteResponse {
  const body = data as OsrmResponse;
  if (!body || typeof body.code !== "string") {
    throw new AppError("INVALID_RESPONSE", "Unexpected routing response.");
  }
  if (body.code !== "Ok") throw osrmError(body.code);
  if (!Array.isArray(body.routes) || body.routes.length === 0) throw osrmError("NoRoute");

  const routes: Route[] = body.routes.map((route, index) => {
    const coords = route.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new AppError("INVALID_RESPONSE", "Route geometry is missing.");
    }
    const summary = (route.legs ?? [])
      .map((leg) => leg.summary?.trim())
      .filter(Boolean)
      .join(", ");
    return {
      id: `route-${index}`,
      index,
      geometry: coords.map(([lng, lat]) => ({ lat, lng })),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      summary,
    };
  });

  return {
    routes,
    mode: request.mode,
    pickup: { lat: request.pickup.lat, lng: request.pickup.lng },
    destination: { lat: request.destination.lat, lng: request.destination.lng },
    provider: PROVIDER_NAME,
    computedAt: new Date().toISOString(),
  };
}

function validate(request: RouteRequest) {
  if (!isValidCoordinates(request.pickup)) {
    throw new AppError("INVALID_LOCATION", "The pickup location isn't valid. Please set it again.");
  }
  if (!isValidCoordinates(request.destination)) {
    throw new AppError("INVALID_LOCATION", "The destination isn't valid. Please set it again.");
  }
  if (haversineMeters(request.pickup, request.destination) < MIN_SEPARATION_METERS) {
    throw new AppError("INVALID_LOCATION", "Pickup and destination are the same place.");
  }
}

function cacheKey({ pickup, destination, mode, alternatives }: RouteRequest): string {
  const p = (c: Coordinates) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
  return `${mode}|${p(pickup)}|${p(destination)}|${alternatives}`;
}

async function fetchFromOsrm(request: RouteRequest, signal?: AbortSignal): Promise<RouteResponse> {
  const { pickup, destination, mode, alternatives } = request;
  const coordinates = `${pickup.lng.toFixed(6)},${pickup.lat.toFixed(6)};${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}`;
  const url = new URL(`${config.routerUrl}/${OSRM_PROFILE_PATH[mode]}/route/v1/driving/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("alternatives", alternatives ? "true" : "false");
  // steps=true is required for OSRM to fill in the leg summary (main road names).
  url.searchParams.set("steps", "true");

  await gate.acquire(signal);
  let data: unknown;
  try {
    data = await fetchJson<unknown>(url.toString(), { signal, timeoutMs: ROUTING_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "RATE_LIMITED") gate.block(error.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS);
      // OSRM answers 400 with a JSON body such as { code: "NoSegment" }.
      const code = (error.body as OsrmResponse | undefined)?.code;
      if (error.code === "HTTP" && code) throw osrmError(code);
    }
    throw error;
  }
  return parseOsrmResponse(data, request);
}

export async function getRoutes(
  request: RouteRequest,
  options: { signal?: AbortSignal } = {},
): Promise<RouteResponse> {
  validate(request);

  const key = cacheKey(request);
  const cached = cache.get(key);
  if (cached) return cached;

  const response = isBackendConfigured()
    ? await apiPost<RouteResponse>(
        API_ENDPOINTS.routes,
        {
          pickup: { lat: request.pickup.lat, lng: request.pickup.lng },
          destination: { lat: request.destination.lat, lng: request.destination.lng },
          mode: request.mode,
          alternatives: request.alternatives,
        },
        // The backend asks several services in turn (routes, then OpenStreetMap context), so allow longer.
        { signal: options.signal, timeoutMs: BACKEND_ROUTING_TIMEOUT_MS },
      )
    : await fetchFromOsrm(request, options.signal);

  if (!response?.routes?.length) throw osrmError("NoRoute");
  cache.set(key, response);
  return response;
}

export const TRAVEL_MODES: Array<{ id: TravelMode; label: string }> = [
  { id: "driving", label: "Drive" },
  { id: "cycling", label: "Bike" },
  { id: "walking", label: "Walk" },
];
