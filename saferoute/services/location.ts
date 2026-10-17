/**
 * Browser Geolocation API wrapper with clear, typed failures.
 */

import { AppError } from "@/lib/errors";
import type { GeoPosition } from "@/types";

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/**
 * Reads the permission state without prompting the user.
 * Returns "unknown" where the Permissions API isn't available (e.g. older Safari).
 */
export async function getLocationPermission(): Promise<PermissionState | "unknown"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unknown";
  }
}

export interface PositionOptions {
  timeoutMs?: number;
  highAccuracy?: boolean;
  /** Accept a cached fix up to this old (ms). */
  maximumAgeMs?: number;
}

export function getCurrentPosition(options: PositionOptions = {}): Promise<GeoPosition> {
  const { timeoutMs = 15_000, highAccuracy = true, maximumAgeMs = 30_000 } = options;

  if (!isGeolocationSupported()) {
    return Promise.reject(
      new AppError("UNSUPPORTED", "Your browser doesn't support location. Search for your pickup instead."),
    );
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return Promise.reject(
      new AppError(
        "INSECURE_CONTEXT",
        "Location needs a secure (https) connection. Search for your pickup instead.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(
              new AppError(
                "PERMISSION_DENIED",
                "Location access is blocked. Allow it in your browser settings, or search for your pickup.",
              ),
            );
            break;
          case error.TIMEOUT:
            reject(new AppError("TIMEOUT", "Finding your location took too long. Please try again."));
            break;
          case error.POSITION_UNAVAILABLE:
          default:
            reject(
              new AppError(
                "POSITION_UNAVAILABLE",
                "Your location isn't available right now. Check that location services are on.",
              ),
            );
        }
      },
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs },
    );
  });
}
