/**
 * Shared domain types.
 *
 * These are the contract between the UI and the service layer. The future
 * Java Spring Boot backend is expected to return data in these same shapes,
 * so the UI never needs to know which provider produced it.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

/** How a location was obtained. Drives icons and labels in the UI. */
export type LocationSource = "search" | "geolocation" | "map" | "saved";

export interface Location extends Coordinates {
  /** Stable id (provider id for search results, generated otherwise). */
  id: string;
  /** Primary, short label, e.g. "Cubbon Park" or "Current location". */
  name: string;
  /** Secondary address line, when known. */
  address?: string;
  source: LocationSource;
  /** Horizontal accuracy in metres (geolocation only). */
  accuracyMeters?: number;
}

export type TravelMode = "driving" | "cycling" | "walking";

export type RouteLabel = "fastest" | "balanced" | "safest";

/** Measured facts about one route, computed by the SafeRoute backend. */
export interface RouteSafety {
  crime: {
    available: boolean;
    incidentCount: number;
    violentCount: number;
    propertyCount: number;
    exposure: number;
    incidentIds: number[];
    /** Metres from the route to the closest reported incident; null when none is near. */
    nearestMeters: number | null;
  };
  /** Community-reported spots (confirmed by several people) within 150 m of the route. */
  community: { available: boolean; spotCount: number; categories: string[]; exposure: number; nearestMeters: number | null };
  lighting: { available: boolean; litFraction: number; unlitFraction: number; unknownFraction: number };
  /** Share of the route on main roads (trunk/primary/secondary/tertiary) vs smaller streets. */
  roads: { available: boolean; mainRoadFraction: number; minorRoadFraction: number };
  /** Shops, eateries, banks/ATMs… within 100 m of the route. */
  activity: { available: boolean; placeCount: number; placesPerKm: number };
  police: { available: boolean; coverageFraction: number; nearbyCount: number };
  hospital: { available: boolean; coverageFraction: number; nearbyCount: number };
  /**
   * NASA Black Marble satellite night-time brightness. darkFraction: share of the route in the
   * city's darkest third; coveredFraction: share with satellite data. Optional for older backends.
   */
  nightLight?: {
    available: boolean;
    darkFraction: number;
    coveredFraction: number;
    meanRadiance: number;
    /** 0 = as bright as the brightest parts of the city, 1 = no light. */
    meanDarkness?: number;
    /** Longest continuous stretch through the city's darkest third, metres. */
    longestDarkMeters?: number;
    /** Dark stretches (150 m+) as [lat, lng] polylines, for the map. */
    darkStretches?: Array<Array<[number, number]>>;
  };
  /**
   * Shops and amenities within 100 m whose OpenStreetMap hours say they are open at the
   * city's local time `checkedAt` ("HH:mm"). Places without readable hours aren't counted.
   */
  openNow?: { available: boolean; withHours: number; openNow: number; checkedAt: string | null };
  /** Relative ranking value across this response's routes (lower is safer). Not a score to display. */
  riskIndex: number | null;
}

export type SafetyFactor = "crime" | "community" | "nightLight" | "darkness" | "mainRoads" | "activity" | "police" | "hospital";

/** How the backend ranked the routes in a response. */
export interface SafetyMethod {
  crimeDataAvailable: boolean;
  crimeDataNote: string;
  osmDataAvailable: boolean;
  factorsUsed: SafetyFactor[];
  weights: Partial<Record<SafetyFactor, number>>;
  incidentWindowDays: number;
  serviceRadiusMeters: number;
  lastCrimeUpdateAt: string | null;
}

export interface Route {
  id: string;
  /** Order returned by the provider; 0 is the provider's recommended route. */
  index: number;
  /** Polyline in [lat, lng] order. */
  geometry: Coordinates[];
  distanceMeters: number;
  durationSeconds: number;
  /** Major roads used, e.g. "Outer Ring Road, Hosur Road". May be empty. */
  summary: string;
  /** Present when the backend ranked the routes. */
  labels?: RouteLabel[];
  safety?: RouteSafety;
}

export interface RouteRequest {
  pickup: Location;
  destination: Location;
  mode: TravelMode;
  /** Ask the provider for alternative routes when available. */
  alternatives: boolean;
}

export interface RouteResponse {
  routes: Route[];
  mode: TravelMode;
  pickup: Coordinates;
  destination: Coordinates;
  /** Human-readable provider name for attribution. */
  provider: string;
  /** ISO timestamp of when the routes were computed. */
  computedAt: string;
  /** Present when the backend ranked the routes. */
  safety?: SafetyMethod;
  /** Walking only: metro stations near the start and the end. */
  transit?: TransitInfo | null;
}

/** A metro station (OpenStreetMap). Hours fields are null when no readable hours exist. */
export interface TransitStation {
  name: string;
  lat: number;
  lng: number;
  /** Distance from the start or end point; null in the full station list. */
  distanceMeters: number | null;
  /** Today's hours, e.g. "05:00–23:00". */
  hoursToday: string | null;
  openNow: boolean | null;
  /** Where the hours came from, e.g. "OpenStreetMap". */
  hoursSource: string | null;
  network: string | null;
}

export interface TransitInfo {
  nearStart: TransitStation | null;
  nearEnd: TransitStation | null;
  stations: TransitStation[];
  /** City local time used for "open now", "HH:mm". */
  localTime: string;
  dataAvailable: boolean;
  note: string;
}

/** A crime reported in the news, located at locality level (from the backend). */
export interface Incident {
  id: number;
  crimeType: string;
  crimeLabel: string;
  category: "violent" | "property";
  headline: string;
  locality: string;
  lat: number;
  lng: number;
  /** Radius of the reported area in metres (localities are not exact addresses). */
  radiusMeters: number;
  /** YYYY-MM-DD */
  occurredOn: string;
  evidenceQuote: string;
  sources: Array<{ url: string; title: string | null; site: string | null; publishedOn: string | null }>;
}

export interface IncidentsResponse {
  incidents: Incident[];
  /** False until the backend has collected crime reports at least once. */
  dataAvailable: boolean;
  windowDays: number;
  lastUpdatedAt: string | null;
  city: string;
  sourceNote: string;
}

export type ReportCategory = "harassment" | "suspicious" | "dark_spot" | "deserted" | "poor_road";

/** Nearby reports of the same kind, grouped. Used for routing only when `confirmed`. */
export interface CommunitySpot {
  id: number;
  category: ReportCategory;
  categoryLabel: string;
  lat: number;
  lng: number;
  reportCount: number;
  /** Different people who reported it. */
  reporters: number;
  confirmed: boolean;
  latestAt: string;
  notes: string[];
}

export interface CommunitySpotsResponse {
  spots: CommunitySpot[];
  confirmThreshold: number;
  expiryDays: number;
  note: string;
}

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type SavedPlaceKey = "home" | "work" | "college";

export interface SavedPlace {
  key: SavedPlaceKey;
  location: Location;
  savedAt: string;
}

export type SavedPlaces = Partial<Record<SavedPlaceKey, SavedPlace>>;

export interface GeoPosition extends Coordinates {
  accuracyMeters: number;
  timestamp: number;
}

/** Which state a map pick / map action should update. */
export type PickTarget =
  | { kind: "pickup" }
  | { kind: "destination" }
  | { kind: "saved"; key: SavedPlaceKey }
  | { kind: "report" };

export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
