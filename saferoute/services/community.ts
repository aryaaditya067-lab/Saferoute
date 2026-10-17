/**
 * Community safety reports (SafeRoute backend). Without a configured backend
 * there are no community reports: nothing is shown or invented.
 */

import { getDeviceId } from "@/lib/deviceId";
import { AppError } from "@/lib/errors";
import type { CommunitySpot, CommunitySpotsResponse, MapBounds, ReportCategory } from "@/types";
import { API_ENDPOINTS, apiGet, apiPost, isBackendConfigured } from "./api";

export const REPORT_CATEGORIES: Array<{ id: ReportCategory; label: string; emoji: string; hint: string }> = [
  { id: "dark_spot", label: "Poorly lit", emoji: "🌑", hint: "Street lights missing or not working" },
  { id: "harassment", label: "Harassment", emoji: "🚩", hint: "Catcalling, following, unsafe behaviour" },
  { id: "suspicious", label: "Suspicious activity", emoji: "👀", hint: "Something felt wrong here" },
  { id: "deserted", label: "Deserted stretch", emoji: "🚷", hint: "Empty road, nobody around" },
  { id: "poor_road", label: "Bad road / potholes", emoji: "🕳️", hint: "Potholes, broken footpath, flooding" },
];

export function categoryEmoji(id: string): string {
  return REPORT_CATEGORIES.find((c) => c.id === id)?.emoji ?? "⚠️";
}

export function isCommunityAvailable(): boolean {
  return isBackendConfigured();
}

export async function fetchCommunitySpots(bounds: MapBounds, options: { signal?: AbortSignal } = {}): Promise<CommunitySpotsResponse> {
  if (!isBackendConfigured()) throw new AppError("BACKEND_NOT_CONFIGURED", "NEXT_PUBLIC_API_BASE_URL is not set.");
  const response = await apiGet<CommunitySpotsResponse>(
    API_ENDPOINTS.communityReports,
    { south: bounds.south, west: bounds.west, north: bounds.north, east: bounds.east },
    { signal: options.signal, timeoutMs: 10_000 },
  );
  if (!response || !Array.isArray(response.spots)) throw new AppError("INVALID_RESPONSE", "Unexpected community response.");
  return response;
}

export async function submitCommunityReport(report: {
  category: ReportCategory;
  lat: number;
  lng: number;
  note?: string;
}): Promise<CommunitySpot> {
  if (!isBackendConfigured()) throw new AppError("BACKEND_NOT_CONFIGURED", "NEXT_PUBLIC_API_BASE_URL is not set.");
  return apiPost<CommunitySpot>(
    API_ENDPOINTS.communityReports,
    { ...report, note: report.note?.trim() || undefined, deviceId: getDeviceId() },
    { timeoutMs: 15_000 },
  );
}
