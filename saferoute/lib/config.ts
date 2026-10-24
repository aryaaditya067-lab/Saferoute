/**
 * Runtime configuration. NEXT_PUBLIC_* values are inlined at build time, so
 * each one must be referenced literally.
 */

function trimSlash(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export const config = {
  /** Future Java Spring Boot backend. Empty = use public providers directly. */
  apiBaseUrl: trimSlash(process.env.NEXT_PUBLIC_API_BASE_URL),

  /** Photon (OpenStreetMap-based geocoder built for search-as-you-type). */
  geocoderUrl: trimSlash(process.env.NEXT_PUBLIC_GEOCODER_URL) || "https://photon.komoot.io",

  /** FOSSGIS OSRM instances (car / bike / foot profiles on OpenStreetMap data). */
  routerUrl: trimSlash(process.env.NEXT_PUBLIC_ROUTER_URL) || "https://routing.openstreetmap.de",

  /** Base map: standard OpenStreetMap tiles (free, no key). The app softens their colours with CSS. */
  tileUrl:
    process.env.NEXT_PUBLIC_TILE_URL?.trim() || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",

  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
} as const;
