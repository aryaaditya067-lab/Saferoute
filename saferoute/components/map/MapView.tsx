"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { config } from "@/lib/config";
import { formatCoordinates, normalizeCoordinates } from "@/lib/geo";
import { readViewport, writeViewport } from "@/lib/viewport";
import { isBackendConfigured } from "@/services/api";
import { categoryEmoji } from "@/services/community";
import type {
  CommunitySpot,
  Coordinates,
  GeoPosition,
  Incident,
  Location,
  MapBounds,
  MapInsets,
  PickTarget,
  Route,
  TransitStation,
} from "@/types";
import { CrimeLayer } from "./crimeLayer";
import { communityIcon, destinationIcon, LOCATE_SVG, metroIcon, pickupIcon, routeHeadIcon, userIcon } from "./markers";

export type MapFocus =
  | { id: number; type: "point"; point: Coordinates; zoom?: number }
  | { id: number; type: "routes" };

export type PinKind = "pickup" | "destination";

export interface MapViewProps {
  pickup: Location | null;
  destination: Location | null;
  userPosition: GeoPosition | null;
  routes: Route[] | null;
  selectedRouteId: string | null;
  pickTarget: PickTarget | null;
  focus: MapFocus | null;
  insets: MapInsets;
  locating: boolean;
  /** Reported crimes to draw as red areas with a 💬 marker. */
  incidents: Incident[];
  /** Community-reported spots. */
  communitySpots: CommunitySpot[];
  communityConfirmThreshold: number;
  /** Metro stations to show (walking trips). */
  stations?: TransitStation[];
  /** Swap to NASA VIIRS night-lights satellite imagery. */
  nightMode?: boolean;
  /** Present when community reporting is available. */
  onReportAt?: (point: Coordinates) => void;
  onSelectRoute: (id: string) => void;
  onPick: (target: PickTarget, point: Coordinates) => void;
  onDropPin: (kind: PinKind, point: Coordinates) => void;
  onLocate: () => void;
  onViewChange: (view: { center: Coordinates; bounds: MapBounds; zoom: number }) => void;
}

/** First visit, before any view is remembered: central Bengaluru, the city SafeRoute covers. */
const DEFAULT_VIEW = { center: [12.9716, 77.5946] as L.LatLngTuple, zoom: 12 };
const ROUTE_COLOR = "#E87524";
const ALT_ROUTE_COLOR = "#9A9385";

function toLatLng(c: Coordinates): L.LatLngExpression {
  return [c.lat, c.lng];
}

/** Popup for a metro station (text only; names come from OpenStreetMap). */
function metroPopup(st: TransitStation): HTMLElement {
  const root = document.createElement("div");
  root.className = "sr-incident-popup";
  const title = document.createElement("div");
  title.className = "sr-incident-headline";
  title.textContent = `${st.name} metro`;
  const status = document.createElement("div");
  status.className = "sr-incident-meta";
  status.textContent =
    st.openNow === true
      ? `Open now · today ${st.hoursToday ?? ""}`
      : st.openNow === false
        ? `Closed now · today ${st.hoursToday ?? ""}`
        : "Hours not listed in OpenStreetMap";
  root.append(title, status);
  if (st.hoursSource) {
    const src = document.createElement("div");
    src.className = "sr-incident-note";
    src.textContent = `Hours from ${st.hoursSource}`;
    root.append(src);
  }
  return root;
}

/** Builds popup content with textContent only (place names come from external APIs). */
function locationPopup(title: string, location: Location): HTMLElement {
  const root = document.createElement("div");
  const label = document.createElement("div");
  label.style.cssText = "font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--color-ink-muted)";
  label.textContent = title;
  const name = document.createElement("div");
  name.style.cssText = "font-weight:600;margin-top:2px";
  name.textContent = location.name;
  root.append(label, name);
  const detail = location.address ?? formatCoordinates(location);
  if (detail) {
    const address = document.createElement("div");
    address.style.cssText = "color:var(--color-ink-soft);margin-top:2px";
    address.textContent = detail;
    root.append(address);
  }
  return root;
}

function fitRoutes(map: L.Map, routes: Route[] | null, insets: MapInsets) {
  if (!routes?.length) return;
  const bounds = L.latLngBounds([]);
  for (const route of routes) for (const p of route.geometry) bounds.extend([p.lat, p.lng]);
  if (!bounds.isValid()) return;
  map.fitBounds(bounds, {
    paddingTopLeft: [insets.left + 40, insets.top + 40],
    paddingBottomRight: [insets.right + 40, insets.bottom + 40],
    maxZoom: 17,
    animate: true,
  });
}

function communityPopup(spot: CommunitySpot, threshold: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "sr-incident-popup";
  const kind = document.createElement("div");
  kind.className = "sr-incident-kind";
  kind.style.color = "#6d28d9";
  kind.textContent = `${categoryEmoji(spot.category)} ${spot.categoryLabel}`;
  const meta = document.createElement("div");
  meta.className = "sr-incident-meta";
  const when = new Date(spot.latestAt);
  meta.textContent = `Reported by ${spot.reporters} ${spot.reporters === 1 ? "person" : "people"} · latest ${
    Number.isNaN(when.getTime()) ? spot.latestAt : when.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  }`;
  root.append(kind, meta);
  for (const n of spot.notes) {
    const q = document.createElement("blockquote");
    q.className = "sr-incident-quote";
    q.textContent = `“${n}”`;
    root.append(q);
  }
  const note = document.createElement("div");
  note.className = "sr-incident-note";
  note.textContent = spot.confirmed
    ? "Community report · confirmed by several people · not verified"
    : `Community report · affects routes after ${threshold} people report it`;
  root.append(note);
  return root;
}

class LocateControl extends L.Control {
  private readonly onClick: () => void;
  button: HTMLButtonElement | null = null;

  constructor(onClick: () => void, options?: L.ControlOptions) {
    super(options);
    this.onClick = onClick;
  }

  onAdd(): HTMLElement {
    const container = L.DomUtil.create("div", "leaflet-bar saferoute-locate");
    const button = L.DomUtil.create("button", "", container);
    button.type = "button";
    button.title = "Show my location";
    button.setAttribute("aria-label", "Show my location");
    button.innerHTML = LOCATE_SVG;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(button, "click", (event) => {
      L.DomEvent.preventDefault(event);
      this.onClick();
    });
    this.button = button;
    return container;
  }
}

export default function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const crimeLayerRef = useRef<CrimeLayer | null>(null);
  const communityLayerRef = useRef<L.LayerGroup | null>(null);
  const metroLayerRef = useRef<L.LayerGroup | null>(null);
  const routeAnimRef = useRef<number | null>(null);
  const lastRoutesRef = useRef<Route[] | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const locateControlRef = useRef<LocateControl | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);


  // Latest props for Leaflet event handlers, so handlers are bound once.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // ---- Create the map exactly once ----------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stored = readViewport();
    const map = L.map(container, {
      center: stored ? [stored.lat, stored.lng] : DEFAULT_VIEW.center,
      zoom: stored ? stored.zoom : DEFAULT_VIEW.zoom,
      minZoom: 2,
      maxZoom: 19,
      zoomControl: false,
      worldCopyJump: true,
    });

    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
    // Tile layer is created by the night-mode effect so it can swap sources.
    if (!isBackendConfigured()) {
      map.attributionControl.addAttribution(
        'Search <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> · Routing <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS OSRM</a>',
      );
    }

    // Bottom-right stack: locate button below the zoom buttons.
    const locate = new LocateControl(() => latest.current.onLocate(), { position: "bottomright" });
    locate.addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    locateControlRef.current = locate;

    // Reported-crime zones sit under the routes; crime dots sit above them.
    map.createPane("incidentAreas").style.zIndex = "350";
    map.createPane("incidentMarkers").style.zIndex = "620";
    crimeLayerRef.current = new CrimeLayer(map, { getInsets: () => latest.current.insets });
    communityLayerRef.current = L.layerGroup().addTo(map);
    metroLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      const target = latest.current.pickTarget;
      if (target) latest.current.onPick(target, normalizeCoordinates(event.latlng));
    });

    // Right-click (desktop) or long-press (touch) drops a pin with actions.
    map.on("contextmenu", (event: L.LeafletMouseEvent) => {
      const point = normalizeCoordinates(event.latlng);
      const root = document.createElement("div");
      const title = document.createElement("div");
      title.style.cssText = "font-weight:600";
      title.textContent = "Dropped pin";
      const coords = document.createElement("div");
      coords.style.cssText = "color:var(--color-ink-muted);font-size:12px;margin-top:2px;font-variant-numeric:tabular-nums";
      coords.textContent = formatCoordinates(point);
      const actions = document.createElement("div");
      actions.className = "sr-popup-actions";
      const makeButton = (kind: PinKind, text: string, color: string) => {
        const button = document.createElement("button");
        button.type = "button";
        const swatch = document.createElement("span");
        swatch.className = "sr-swatch";
        swatch.style.background = color;
        button.append(swatch, document.createTextNode(text));
        button.addEventListener("click", () => {
          map.closePopup();
          latest.current.onDropPin(kind, point);
        });
        return button;
      };
      actions.append(
        makeButton("pickup", "Set as pickup", "var(--color-ink)"),
        makeButton("destination", "Set as destination", ROUTE_COLOR),
      );
      if (latest.current.onReportAt) {
        const report = document.createElement("button");
        report.type = "button";
        const swatch = document.createElement("span");
        swatch.className = "sr-swatch";
        swatch.style.background = "#7c3aed";
        report.append(swatch, document.createTextNode("Report a safety issue here"));
        report.addEventListener("click", () => {
          map.closePopup();
          latest.current.onReportAt?.(point);
        });
        actions.append(report);
      }
      root.append(title, coords, actions);
      L.popup({ closeButton: true, autoPanPadding: [24, 24] }).setLatLng(event.latlng).setContent(root).openOn(map);
    });

    const reportView = () => {
      const center = normalizeCoordinates(map.getCenter());
      const b = map.getBounds();
      latest.current.onViewChange({
        center,
        zoom: map.getZoom(),
        bounds: {
          south: Math.max(-90, b.getSouth()),
          west: Math.max(-180, b.getWest()),
          north: Math.min(90, b.getNorth()),
          east: Math.min(180, b.getEast()),
        },
      });
    };

    map.on("moveend", () => {
      const center = normalizeCoordinates(map.getCenter());
      writeViewport({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
      reportView();
    });

    mapRef.current = map;
    reportView();

    return () => {
      crimeLayerRef.current?.destroy();
      crimeLayerRef.current = null;
      map.off();
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      communityLayerRef.current = null;
      metroLayerRef.current = null;
      if (routeAnimRef.current != null) cancelAnimationFrame(routeAnimRef.current);
      pickupMarkerRef.current = null;
      destinationMarkerRef.current = null;
      userMarkerRef.current = null;
      accuracyCircleRef.current = null;
      locateControlRef.current = null;
    };
  }, []);

  // ---- Night mode: swap tiles to NASA VIIRS night-lights imagery --------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const nasaAttribution =
      'Night imagery &copy; <a href="https://earthobservatory.nasa.gov/features/NightLights" target="_blank" rel="noreferrer">NASA Earth Observatory</a>';
    if (props.nightMode) {
      tileLayerRef.current = L.tileLayer(
        "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
        { maxNativeZoom: 8, maxZoom: 19, attribution: nasaAttribution, crossOrigin: true },
      ).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer(config.tileUrl, {
        maxZoom: 19, attribution: config.tileAttribution, crossOrigin: true,
      }).addTo(map);
    }
    // Keep tiles under everything else.
    tileLayerRef.current.setZIndex(-1);
  }, [props.nightMode]);

  // ---- Pick mode cursor ------------------------------------------------------
  const picking = props.pickTarget !== null;
  useEffect(() => {
    containerRef.current?.classList.toggle("is-picking", picking);
    if (picking) mapRef.current?.closePopup();
  }, [picking]);

  // ---- Bottom inset (keeps controls above the mobile sheet) ----------------
  useEffect(() => {
    containerRef.current?.style.setProperty("--map-inset-bottom", `${Math.round(props.insets.bottom)}px`);
  }, [props.insets.bottom]);

  // ---- Locate button state ---------------------------------------------------
  const hasUserPosition = props.userPosition !== null;
  useEffect(() => {
    const button = locateControlRef.current?.button;
    if (!button) return;
    button.setAttribute("aria-busy", String(props.locating));
    button.setAttribute("data-active", String(hasUserPosition));
  }, [props.locating, hasUserPosition]);

  // ---- Markers ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const location = props.pickup;
    if (!location) {
      pickupMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
      return;
    }
    let marker = pickupMarkerRef.current;
    if (!marker) {
      marker = L.marker(toLatLng(location), {
        icon: pickupIcon,
        draggable: true,
        title: "Pickup — drag to adjust",
        alt: "Pickup",
        zIndexOffset: 400,
        autoPan: true,
      }).addTo(map);
      const m = marker;
      m.on("dragend", () => latest.current.onDropPin("pickup", normalizeCoordinates(m.getLatLng())));
      pickupMarkerRef.current = m;
    } else {
      marker.setLatLng(toLatLng(location));
    }
    marker.bindPopup(locationPopup("Pickup", location));
  }, [props.pickup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const location = props.destination;
    if (!location) {
      destinationMarkerRef.current?.remove();
      destinationMarkerRef.current = null;
      return;
    }
    let marker = destinationMarkerRef.current;
    if (!marker) {
      marker = L.marker(toLatLng(location), {
        icon: destinationIcon,
        draggable: true,
        title: "Destination — drag to adjust",
        alt: "Destination",
        zIndexOffset: 500,
        autoPan: true,
      }).addTo(map);
      const m = marker;
      m.on("dragend", () => latest.current.onDropPin("destination", normalizeCoordinates(m.getLatLng())));
      destinationMarkerRef.current = m;
    } else {
      marker.setLatLng(toLatLng(location));
    }
    marker.bindPopup(locationPopup("Destination", location));
  }, [props.destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const position = props.userPosition;
    if (!position) {
      userMarkerRef.current?.remove();
      accuracyCircleRef.current?.remove();
      userMarkerRef.current = null;
      accuracyCircleRef.current = null;
      return;
    }
    const latLng = toLatLng(position);
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(latLng, {
        radius: position.accuracyMeters,
        color: "#2f6fed",
        weight: 1,
        opacity: 0.4,
        fillColor: "#2f6fed",
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latLng).setRadius(position.accuracyMeters);
    }
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latLng, {
        icon: userIcon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 300,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(latLng);
    }
  }, [props.userPosition]);

  // ---- Reported crimes (zones zoomed out, clustered dots zoomed in) ----------
  useEffect(() => {
    crimeLayerRef.current?.setIncidents(props.incidents);
  }, [props.incidents]);

  // ---- Community spots ---------------------------------------------------------
  const threshold = props.communityConfirmThreshold;
  useEffect(() => {
    const layer = communityLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const spot of props.communitySpots) {
      const marker = L.marker([spot.lat, spot.lng], {
        pane: "incidentMarkers",
        icon: communityIcon(categoryEmoji(spot.category), spot.confirmed),
        title: `${spot.categoryLabel} · ${spot.reporters} report${spot.reporters === 1 ? "" : "s"}`,
        alt: `Community report: ${spot.categoryLabel}`,
        riseOnHover: true,
      });
      marker.bindPopup(() => communityPopup(spot, String(threshold)), { maxWidth: 280 });
      layer.addLayer(marker);
    }
  }, [props.communitySpots, threshold]);

  // ---- Metro stations (walking) ----------------------------------------------------
  const stations = props.stations;
  useEffect(() => {
    const layer = metroLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const st of stations ?? []) {
      const marker = L.marker([st.lat, st.lng], { pane: "incidentMarkers", icon: metroIcon, title: `${st.name} metro station`, alt: `${st.name} metro station` });
      marker.bindPopup(() => metroPopup(st), { maxWidth: 260 });
      layer.addLayer(marker);
    }
  }, [stations]);

  // ---- Routes ----------------------------------------------------------------
  // The selected route draws itself from A to B with a glow and a light that runs
  // along it; alternatives fade in underneath.
  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    if (routeAnimRef.current != null) cancelAnimationFrame(routeAnimRef.current);
    layer.clearLayers();
    const routes = props.routes;
    const freshRoutes = routes !== lastRoutesRef.current;
    lastRoutesRef.current = routes;
    if (!routes?.length) return;

    const selected = routes.find((r) => r.id === props.selectedRouteId) ?? routes[0]!;
    for (const route of routes) {
      if (route.id === selected.id) continue;
      const line = L.polyline(route.geometry.map(toLatLng), {
        color: ALT_ROUTE_COLOR,
        weight: 6,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        className: "sr-route-alt",
      });
      line.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        latest.current.onSelectRoute(route.id);
      });
      line.bindTooltip("Show this route", { sticky: true, direction: "top", opacity: 0.9 });
      layer.addLayer(line);
    }

    const coords = selected.geometry.map((c) => L.latLng(c.lat, c.lng));
    const base = { interactive: false, lineCap: "round" as const, lineJoin: "round" as const };
    const lines = [
      L.polyline([], { ...base, color: ROUTE_COLOR, weight: 24, opacity: 0.14, className: "sr-route-glow" }),
      L.polyline([], { ...base, color: "#FFB066", weight: 13, opacity: 0.35, className: "sr-route-glow" }),
      L.polyline([], { ...base, color: "#FFFDF8", weight: 9, opacity: 1 }),
      L.polyline([], { ...base, color: ROUTE_COLOR, weight: 5, opacity: 1 }),
    ];
    lines.forEach((l) => layer.addLayer(l));
    const flow = L.polyline(coords, { ...base, color: "#FFF6E8", weight: 2.5, opacity: 0.95, dashArray: "1 14", className: "sr-route-flow" });

    const finish = () => {
      lines.forEach((l) => l.setLatLngs(coords));
      layer.addLayer(flow);
      // Mark the stretches that are dark at night (NASA satellite) on the selected route.
      for (const stretch of selected.safety?.nightLight?.darkStretches ?? []) {
        if (stretch.length < 2) continue;
        const dark = L.polyline(stretch, {
          color: "#1B1530",
          weight: 6,
          opacity: 0.9,
          dashArray: "1 10",
          lineCap: "round",
          className: "sr-dark-stretch",
        });
        dark.bindTooltip("Dark at night (NASA satellite)", { sticky: true, direction: "top", opacity: 0.9 });
        layer.addLayer(dark);
      }
      routeAnimRef.current = null;
    };
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || coords.length < 2) {
      finish();
      return;
    }

    // Cumulative distance along the line so the head moves at an even speed.
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1]! + coords[i - 1]!.distanceTo(coords[i]!));
    const total = cum[cum.length - 1]!;
    const duration = freshRoutes ? Math.min(2600, Math.max(1200, 900 + total / 8)) : 700;
    const head = L.marker(coords[0]!, { icon: routeHeadIcon, interactive: false, keyboard: false, pane: "incidentMarkers" });
    layer.addLayer(head);
    const started = performance.now();
    let idx = 1;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const d = total * eased;
      while (idx < coords.length - 1 && cum[idx]! < d) idx++;
      const a = coords[idx - 1]!, b = coords[idx]!;
      const seg = cum[idx]! - cum[idx - 1]! || 1;
      const k = Math.min(1, Math.max(0, (d - cum[idx - 1]!) / seg));
      const tip = L.latLng(a.lat + (b.lat - a.lat) * k, a.lng + (b.lng - a.lng) * k);
      const part = coords.slice(0, idx);
      part.push(tip);
      lines.forEach((l) => l.setLatLngs(part));
      head.setLatLng(tip);
      if (t < 1) {
        routeAnimRef.current = requestAnimationFrame(step);
      } else {
        layer.removeLayer(head);
        finish();
      }
    };
    routeAnimRef.current = requestAnimationFrame(step);
  }, [props.routes, props.selectedRouteId]);

  // ---- Camera ----------------------------------------------------------------
  const lastRoutesFitAt = useRef(0);

  const focusId = props.focus?.id;
  useEffect(() => {
    const map = mapRef.current;
    const focus = latest.current.focus;
    if (!map || !focus) return;
    const { top, right, bottom, left } = latest.current.insets;

    if (focus.type === "point") {
      lastRoutesFitAt.current = 0;
      const zoom = focus.zoom ?? Math.max(map.getZoom(), 15);
      const projected = map.project(toLatLng(focus.point), zoom);
      const offset = L.point((left - right) / 2, (top - bottom) / 2);
      map.setView(map.unproject(projected.subtract(offset), zoom), zoom, { animate: true });
      return;
    }

    lastRoutesFitAt.current = Date.now();
    fitRoutes(map, latest.current.routes, latest.current.insets);
  }, [focusId]);

  // If the panel resizes right after fitting routes (e.g. the mobile sheet
  // collapses to show the map), fit again so the route stays fully visible.
  const { top, right, bottom, left } = props.insets;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || Date.now() - lastRoutesFitAt.current > 1500) return;
    const refit = () => fitRoutes(map, latest.current.routes, { top, right, bottom, left });
    // Leaflet ignores a new view while a zoom animation runs, so wait for it to finish.
    if ((map as unknown as { _animatingZoom?: boolean })._animatingZoom) map.once("zoomend", refit);
    else refit();
  }, [top, right, bottom, left]);

  return (
    <div
      ref={containerRef}
      className="saferoute-map absolute inset-0 h-full w-full"
      role="application"
      aria-label="Map. Right-click or long-press to drop a pin."
    />
  );
}
