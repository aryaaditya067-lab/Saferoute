/** Remembers the last map view in this browser so the app reopens where the user left it. */

const KEY = "saferoute.viewport.v1";

export interface StoredViewport {
  lat: number;
  lng: number;
  zoom: number;
}

export function readViewport(): StoredViewport | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredViewport;
    if (
      Number.isFinite(v.lat) &&
      Number.isFinite(v.lng) &&
      Number.isFinite(v.zoom) &&
      Math.abs(v.lat) <= 90 &&
      Math.abs(v.lng) <= 180
    ) {
      return v;
    }
  } catch {
    // Storage unavailable or corrupted: fall back to the default world view.
  }
  return null;
}

export function writeViewport(v: StoredViewport): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Ignore: remembering the viewport is a convenience only.
  }
}
