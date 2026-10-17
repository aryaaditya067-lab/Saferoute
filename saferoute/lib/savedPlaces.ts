/**
 * Home / Work / College, saved in this browser via localStorage.
 * Exposed as an external store for React's useSyncExternalStore.
 */

import type { Location, SavedPlace, SavedPlaceKey, SavedPlaces } from "@/types";
import { isValidCoordinates } from "./geo";

const STORAGE_KEY = "saferoute.savedPlaces.v1";
const EMPTY: SavedPlaces = Object.freeze({}) as SavedPlaces;

export const SAVED_PLACE_KEYS: SavedPlaceKey[] = ["home", "work", "college"];

export const SAVED_PLACE_LABELS: Record<SavedPlaceKey, string> = {
  home: "Home",
  work: "Work",
  college: "College",
};

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: SavedPlaces = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function sanitize(value: unknown): SavedPlaces {
  if (!value || typeof value !== "object") return EMPTY;
  const result: SavedPlaces = {};
  for (const key of SAVED_PLACE_KEYS) {
    const entry = (value as Record<string, unknown>)[key] as SavedPlace | undefined;
    if (entry && isValidCoordinates(entry.location) && typeof entry.location.name === "string") {
      result[key] = { key, location: entry.location, savedAt: String(entry.savedAt ?? "") };
    }
  }
  return result;
}

export function getSavedPlacesSnapshot(): SavedPlaces {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = raw ? sanitize(JSON.parse(raw)) : EMPTY;
    } catch {
      cachedValue = EMPTY;
    }
  }
  return cachedValue;
}

export function getSavedPlacesServerSnapshot(): SavedPlaces {
  return EMPTY;
}

export function subscribeSavedPlaces(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: SavedPlaces): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  listeners.forEach((listener) => listener());
  return true;
}

/** Returns false when the browser refused to store it (private mode, quota). */
export function savePlace(key: SavedPlaceKey, location: Location): boolean {
  const current = getSavedPlacesSnapshot();
  const stored: Location = {
    id: location.id,
    name: location.name,
    address: location.address,
    lat: location.lat,
    lng: location.lng,
    source: location.source,
  };
  return write({ ...current, [key]: { key, location: stored, savedAt: new Date().toISOString() } });
}

export function removePlace(key: SavedPlaceKey): boolean {
  const next = { ...getSavedPlacesSnapshot() };
  delete next[key];
  return write(next);
}
