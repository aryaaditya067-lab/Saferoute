/** NASA Black Marble night-time brightness (SafeRoute backend). */

import { AppError } from "@/lib/errors";
import type { NightLightsResponse } from "@/types";
import { API_ENDPOINTS, apiGet, isBackendConfigured } from "./api";

export async function fetchNightLights(options: { signal?: AbortSignal } = {}): Promise<NightLightsResponse> {
  if (!isBackendConfigured()) throw new AppError("BACKEND_NOT_CONFIGURED", "NEXT_PUBLIC_API_BASE_URL is not set.");
  const response = await apiGet<NightLightsResponse>(API_ENDPOINTS.nightLights, undefined, {
    signal: options.signal,
    timeoutMs: 20_000,
  });
  if (!response || typeof response.available !== "boolean" || !Array.isArray(response.values)) {
    throw new AppError("INVALID_RESPONSE", "Unexpected night-lights response.");
  }
  if (response.available && response.values.length !== response.rows * response.cols) {
    throw new AppError("INVALID_RESPONSE", "Night-lights grid size doesn't match.");
  }
  return response;
}

/** The year in the source note ("... year=2024 ..."), if present. */
export function nightLightsYear(source: string | null): string | null {
  return source?.match(/year=(\d{4})/)?.[1] ?? null;
}
