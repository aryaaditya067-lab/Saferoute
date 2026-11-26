import L from "leaflet";
import "./leafletGlobal";
import "leaflet.markercluster";
import "leaflet.heat";
import type { Incident, MapInsets } from "@/types";

/**
 * Reported crimes in three levels:
 *  1. zoomed out  - a heatmap: reports in and around a locality blend into orange/red zones;
 *  2. zoomed in   - one red dot per report, clustered so dots never pile up;
 *  3. tap a dot   - a card with the report's details and its news source.
 * Reports are placed at their locality's real centre (news names an area, not an address).
 * Several reports in one locality therefore share a point; their cluster fans them out
 * around that point on tap instead of inventing positions.
 */

/** From this zoom, individual reports replace the zones. */
export const POINTS_MIN_ZOOM = 13;
const STREET_ZOOM = 16;
const HALF_LIFE_DAYS = 120;
const DAY_MS = 86_400_000;
/** Nominal zone size; the heat radius follows it so zones keep a real-world scale. */
const ZONE_METERS = 1200;

const HEAT_GRADIENT = { 0.2: "#ffe2a1", 0.4: "#ffb45e", 0.6: "#ff8a3d", 0.8: "#f2542d", 1: "#c81e1e" };

const SHIELD_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.5 4.5 5.4v5.9c0 4.6 3.1 8.8 7.5 10.2 4.4-1.4 7.5-5.6 7.5-10.2V5.4L12 2.5z" fill="currentColor"/><path d="M12 7.2v6.1" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.25" fill="#fff"/></svg>';

type Level = "zones" | "points" | "street";

interface Zone {
  lat: number;
  lng: number;
  radiusMeters: number;
  locality: string;
  incidents: Incident[];
  violent: number;
  /** Recency- and category-weighted count. */
  weight: number;
}

export function hasCoordinates(i: Pick<Incident, "lat" | "lng">): boolean {
  return (
    Number.isFinite(i.lat) &&
    Number.isFinite(i.lng) &&
    Math.abs(i.lat) <= 90 &&
    Math.abs(i.lng) <= 180 &&
    !(i.lat === 0 && i.lng === 0)
  );
}

function parseDay(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

function incidentWeight(i: Incident, now: number): number {
  const day = parseDay(i.occurredOn);
  const ageDays = day == null ? 0 : Math.max(0, (now - day) / DAY_MS);
  return (i.category === "violent" ? 1 : 0.5) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function zoneKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

/** Groups reports by the locality point they were placed at. */
export function groupZones(incidents: Incident[], now = Date.now()): Zone[] {
  const zones = new Map<string, Zone>();
  for (const i of incidents) {
    const key = zoneKey(i);
    let zone = zones.get(key);
    if (!zone) {
      zone = { lat: i.lat, lng: i.lng, radiusMeters: i.radiusMeters, locality: i.locality, incidents: [], violent: 0, weight: 0 };
      zones.set(key, zone);
    }
    zone.incidents.push(i);
    zone.radiusMeters = Math.max(zone.radiusMeters, i.radiusMeters);
    if (i.category === "violent") zone.violent += 1;
    zone.weight += incidentWeight(i, now);
  }
  return [...zones.values()];
}

function formatDay(iso: string): string {
  const day = parseDay(iso);
  if (day == null) return iso;
  return new Date(day).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Today", "3 days ago", "2 weeks ago", "4 months ago". */
export function relativeDay(iso: string, now = Date.now()): string {
  const day = parseDay(iso);
  if (day == null) return iso;
  const today = new Date(now);
  const days = Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - day) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function inCity(locality: string): string {
  return /bengaluru|bangalore/i.test(locality) ? locality : `${locality}, Bengaluru`;
}

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function badge(): HTMLElement {
  const b = el("span", "sr-crime-card__badge");
  b.innerHTML = SHIELD_SVG; // static markup, no data
  return b;
}

function row(label: string, value: Node | string): HTMLElement {
  const r = el("div", "sr-crime-card__row");
  r.append(el("dt", undefined, label));
  const dd = el("dd");
  dd.append(value);
  r.append(dd);
  return r;
}

function externalLink(url: URL, text: string, className?: string): HTMLAnchorElement {
  const a = el("a", className, text);
  a.href = url.toString();
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

/** Level 3: one report. All data goes in via textContent; links are http(s) only. */
function incidentCard(incident: Incident): HTMLElement {
  const root = el("div", "sr-crime-card");

  const head = el("div", "sr-crime-card__head");
  const titles = el("div", "sr-crime-card__titles");
  titles.append(
    el("div", "sr-crime-card__title", incident.crimeLabel),
    el("div", "sr-crime-card__sub", incident.category === "violent" ? "Violent crime" : "Property crime"),
  );
  head.append(badge(), titles, el("span", "sr-crime-card__pill", relativeDay(incident.occurredOn)));

  const facts = el("dl", "sr-crime-card__facts");
  facts.append(row("Date", formatDay(incident.occurredOn)), row("Location", inCity(incident.locality)));

  const links = incident.sources
    .map((s) => ({ source: s, url: safeUrl(s.url) }))
    .filter((s): s is { source: Incident["sources"][number]; url: URL } => s.url !== null);
  const primary = links[0];
  if (primary) {
    facts.append(row("Source", externalLink(primary.url, primary.source.site || primary.url.hostname, "sr-crime-card__source")));
  }

  root.append(head, facts, el("p", "sr-crime-card__desc", incident.headline));
  // The quote is evidence of where it happened; article scraping sometimes yields page chrome instead.
  const quote = incident.evidenceQuote?.trim();
  if (quote && quote !== incident.headline.trim() && quote.toLowerCase().includes(incident.locality.toLowerCase())) {
    root.append(el("blockquote", "sr-crime-card__quote", quote.length > 220 ? `${quote.slice(0, 217)}…` : quote));
  }

  if (primary) {
    root.append(externalLink(primary.url, "View full article ↗", "sr-crime-card__cta"));
    const label = (s: (typeof links)[number]) => s.source.site || s.url.hostname;
    const seen = new Set([label(primary)]);
    const others = links.slice(1).filter((s) => !seen.has(label(s)) && seen.add(label(s)));
    if (others.length) {
      const more = el("div", "sr-crime-card__more");
      more.append(el("span", undefined, "Also reported by"));
      for (const s of others.slice(0, 3)) more.append(externalLink(s.url, label(s)));
      root.append(more);
    }
  } else {
    root.append(el("div", "sr-crime-card__note", "Source link unavailable"));
  }
  root.append(el("div", "sr-crime-card__note", "Area-level location · from news reports, not police data"));
  return root;
}

function tierOf(intensity: number): { label: string; className: string } {
  if (intensity >= 0.6) return { label: "High crime zone", className: "is-high" };
  if (intensity >= 0.3) return { label: "Moderate crime zone", className: "is-moderate" };
  return { label: "Low crime zone", className: "is-low" };
}

/** Level 1: summary of a zone, with a shortcut to zoom into its reports. */
function zoneCard(zone: Zone, intensity: number, onZoom: () => void): HTMLElement {
  const tier = tierOf(intensity);
  const root = el("div", `sr-crime-card sr-zone-card ${tier.className}`);

  const head = el("div", "sr-crime-card__head");
  const titles = el("div", "sr-crime-card__titles");
  titles.append(el("div", "sr-crime-card__title", tier.label), el("div", "sr-crime-card__sub", `${inCity(zone.locality)} area`));
  const count = zone.incidents.length;
  head.append(badge(), titles, el("span", "sr-crime-card__pill", `${count} report${count === 1 ? "" : "s"}`));

  const byType = new Map<string, number>();
  for (const i of zone.incidents) byType.set(i.crimeLabel, (byType.get(i.crimeLabel) ?? 0) + 1);
  const top = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => `${label} (${n})`)
    .join(", ");
  const latest = zone.incidents.reduce((a, b) => (a.occurredOn >= b.occurredOn ? a : b));

  const facts = el("dl", "sr-crime-card__facts");
  facts.append(
    row("Most reported", top),
    row("Violent", `${zone.violent} of ${count}`),
    row("Latest", `${relativeDay(latest.occurredOn)} · ${formatDay(latest.occurredOn)}`),
  );

  const zoom = el("button", "sr-crime-card__cta", "Zoom in to see each report →");
  zoom.type = "button";
  zoom.addEventListener("click", onZoom);

  root.append(head, facts, zoom, el("div", "sr-crime-card__note", "Shading compares areas on screen · from news reports"));
  return root;
}

const dotIcon = L.divIcon({
  className: "sr-marker",
  // 36px box: a comfortable touch target around a 14px dot.
  html: '<span class="sr-crime-dot" aria-hidden="true"></span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -10],
});

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const n = cluster.getChildCount();
  const size = n < 5 ? 34 : n < 15 ? 40 : n < 40 ? 46 : 52;
  const heat = n < 5 ? "is-low" : n < 15 ? "is-mid" : "is-high";
  return L.divIcon({
    className: "sr-marker",
    html: `<div class="sr-crime-cluster ${heat}" style="width:${size}px;height:${size}px"><span>${n}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

class LegendControl extends L.Control {
  private box: HTMLElement | null = null;

  onAdd(): HTMLElement {
    this.box = L.DomUtil.create("div", "sr-crime-legend");
    this.box.hidden = true;
    L.DomEvent.disableClickPropagation(this.box);
    return this.box;
  }

  show(level: Level | null) {
    const box = this.box;
    if (!box) return;
    box.replaceChildren();
    box.hidden = level === null;
    if (level === null) return;
    if (level === "zones") {
      box.append(el("div", "sr-crime-legend__title", "Crime heatmap"));
      const bar = el("div", "sr-crime-legend__bar");
      const scale = el("div", "sr-crime-legend__scale");
      scale.append(el("span", undefined, "Low"), el("span", undefined, "High"));
      box.append(bar, scale);
    } else {
      const title = el("div", "sr-crime-legend__title");
      title.append(el("span", "sr-crime-legend__dot"), document.createTextNode("Crime incidents"));
      box.append(title, el("div", "sr-crime-legend__hint", "Tap a dot for details"));
    }
  }
}

function heatRadius(map: L.Map): number {
  const lat = map.getCenter().lat;
  const metersPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom() + 8);
  return Math.round(Math.min(72, Math.max(28, ZONE_METERS / metersPerPixel)));
}

export class CrimeLayer {
  private readonly map: L.Map;
  private readonly getInsets: () => MapInsets;
  private readonly heat: L.HeatLayer;
  private readonly clusters: L.MarkerClusterGroup;
  private readonly zoneHits: L.LayerGroup;
  private readonly legend: LegendControl;
  private incidentCount = 0;
  private level: Level | null = null;
  private incidents = new Map<number, Incident>();
  private readonly markerById = new Map<number, L.Marker>();
  private zones = new Map<string, { zone: Zone; intensity: number }>();
  private readonly zoneHitByKey = new Map<string, L.Circle>();
  private activeMarker: L.Marker | null = null;
  private markersStale = false;

  constructor(map: L.Map, options: { getInsets: () => MapInsets }) {
    this.map = map;
    this.getInsets = options.getInsets;

    this.heat = L.heatLayer([], {
      radius: heatRadius(map),
      blur: 0.8 * heatRadius(map),
      // Intensities are normalised here, so don't let the plugin fade them by zoom.
      maxZoom: 1,
      max: 1,
      minOpacity: 0.25,
      gradient: HEAT_GRADIENT,
    }).addTo(map);
    // Keep the heat under routes and everything else in the overlay pane.
    const canvas = (this.heat as unknown as { _canvas?: HTMLCanvasElement })._canvas;
    if (canvas?.parentElement) canvas.parentElement.insertBefore(canvas, canvas.parentElement.firstChild);

    this.zoneHits = L.layerGroup();
    this.clusters = L.markerClusterGroup({
      clusterPane: "incidentMarkers",
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: false,
      spiderfyDistanceMultiplier: 1.8,
      maxClusterRadius: (zoom: number) => (zoom >= STREET_ZOOM ? 26 : 44),
      chunkedLoading: true,
      iconCreateFunction: clusterIcon,
      spiderLegPolylineOptions: { weight: 1.5, color: "#c81e1e", opacity: 0.5 },
    });
    // Reports in one locality share its centre, so zooming never separates them: fan them out
    // around that point right away. Clusters spanning several places zoom to fit instead.
    this.clusters.on("clusterclick", (event) => {
      const cluster = (event as L.LeafletEvent & { layer: L.MarkerCluster }).layer;
      const bounds = cluster.getBounds();
      const spanMeters = bounds.getNorthEast().distanceTo(bounds.getSouthWest());
      if (spanMeters < 50 || this.map.getZoom() >= this.map.getMaxZoom()) cluster.spiderfy();
      else cluster.zoomToBounds({ padding: [60, 60] });
    });
    this.clusters.on("unspiderfied", () => {
      if (this.markersStale) this.syncMarkers();
    });

    this.legend = new LegendControl({ position: "bottomleft" });
    this.legend.addTo(map);

    map.on("zoomend", this.applyZoom);
    this.applyZoom();
  }

  /**
   * Updates in place: every pan reloads the visible area, and rebuilding would close an open
   * card (its layer is removed) and collapse a fanned-out cluster.
   */
  setIncidents(incidents: Incident[]) {
    const located = incidents.filter(hasCoordinates);
    this.incidentCount = located.length;
    const zones = groupZones(located);
    const maxWeight = Math.max(0, ...zones.map((z) => z.weight));
    const intensityOf = (z: Zone) => (maxWeight > 0 ? z.weight / maxWeight : 0);

    this.heat.setLatLngs(zones.map((z) => [z.lat, z.lng, 0.5 + 0.5 * intensityOf(z)]));

    this.zones = new Map(zones.map((z) => [zoneKey(z), { zone: z, intensity: intensityOf(z) }]));
    for (const [key, hit] of this.zoneHitByKey) {
      if (!this.zones.has(key)) {
        this.zoneHits.removeLayer(hit);
        this.zoneHitByKey.delete(key);
      }
    }
    for (const [key, { zone }] of this.zones) {
      const radius = Math.max(zone.radiusMeters, 450);
      const existing = this.zoneHitByKey.get(key);
      if (existing) {
        existing.setRadius(radius);
        continue;
      }
      const hit = L.circle([zone.lat, zone.lng], {
        pane: "incidentAreas",
        radius,
        stroke: false,
        fill: true,
        fillColor: "#c81e1e",
        fillOpacity: 0,
        className: "sr-zone-hit",
      });
      hit.bindPopup(() => {
        const current = this.zones.get(key);
        if (!current) return el("div");
        return zoneCard(current.zone, current.intensity, () => {
          this.map.closePopup();
          this.map.flyTo([current.zone.lat, current.zone.lng], Math.max(15, this.map.getZoom() + 2), { duration: 0.8 });
        });
      }, this.popupOptions());
      this.zoneHitByKey.set(key, hit);
      this.zoneHits.addLayer(hit);
    }

    this.incidents = new Map(located.map((i) => [i.id, i]));
    this.syncMarkers();
    this.applyZoom();
  }

  /** Adds/removes dots for the current reports, unless a card is open or a cluster is fanned out. */
  private syncMarkers() {
    const spiderfied = (this.clusters as unknown as { _spiderfied?: unknown })._spiderfied;
    if (this.activeMarker || spiderfied) {
      this.markersStale = true;
      return;
    }
    this.markersStale = false;
    const gone: L.Marker[] = [];
    for (const [id, marker] of this.markerById) {
      if (!this.incidents.has(id)) {
        gone.push(marker);
        this.markerById.delete(id);
      }
    }
    const added: L.Marker[] = [];
    for (const [id, incident] of this.incidents) {
      if (this.markerById.has(id)) continue;
      const marker = this.marker(id, incident);
      this.markerById.set(id, marker);
      added.push(marker);
    }
    if (gone.length) this.clusters.removeLayers(gone);
    if (added.length) this.clusters.addLayers(added);
  }

  destroy() {
    this.map.off("zoomend", this.applyZoom);
    // leaflet.heat doesn't cancel its scheduled redraw on removal; it would run with no map.
    const pending = this.heat as unknown as { _frame?: number | null };
    if (pending._frame) {
      L.Util.cancelAnimFrame(pending._frame);
      pending._frame = null;
    }
    this.map.removeLayer(this.heat);
    this.map.removeLayer(this.clusters);
    this.map.removeLayer(this.zoneHits);
    this.legend.remove();
  }

  private marker(id: number, incident: Incident): L.Marker {
    const marker = L.marker([incident.lat, incident.lng], {
      pane: "incidentMarkers",
      icon: dotIcon,
      title: `${incident.crimeLabel} · ${incident.locality}`,
      alt: `${incident.crimeLabel} reported in ${incident.locality}`,
      riseOnHover: true,
    });
    // Latest copy of the report (a reload may have merged in another source).
    marker.bindPopup(() => incidentCard(this.incidents.get(id) ?? incident), this.popupOptions());
    marker.on("popupopen", () => {
      this.activeMarker = marker;
      marker.getElement()?.classList.add("is-active");
    });
    marker.on("popupclose", () => {
      marker.getElement()?.classList.remove("is-active");
      if (this.activeMarker === marker) this.activeMarker = null;
      if (this.markersStale) this.syncMarkers();
    });
    return marker;
  }

  private popupOptions(): L.PopupOptions {
    const insets = this.getInsets();
    return {
      className: "sr-crime-popup",
      maxWidth: 320,
      minWidth: 260,
      autoPanPaddingTopLeft: L.point(insets.left + 16, insets.top + 16),
      // Extra room below so the tapped dot under the card's tip stays in view.
      autoPanPaddingBottomRight: L.point(insets.right + 16, insets.bottom + 40),
    };
  }

  private readonly applyZoom = () => {
    const zoom = this.map.getZoom();
    const level: Level = zoom >= STREET_ZOOM ? "street" : zoom >= POINTS_MIN_ZOOM ? "points" : "zones";
    this.map.getContainer().dataset.crimeLevel = level;

    const r = heatRadius(this.map);
    this.heat.setOptions({ radius: r, blur: 0.8 * r });

    const showPoints = level !== "zones";
    if (showPoints) {
      if (this.map.hasLayer(this.zoneHits)) this.map.removeLayer(this.zoneHits);
      if (!this.map.hasLayer(this.clusters)) this.map.addLayer(this.clusters);
    } else {
      if (this.map.hasLayer(this.clusters)) this.map.removeLayer(this.clusters);
      if (!this.map.hasLayer(this.zoneHits)) this.map.addLayer(this.zoneHits);
    }

    const legendLevel = this.incidentCount > 0 ? level : null;
    if (legendLevel !== this.level) {
      this.level = legendLevel;
      this.legend.show(legendLevel);
    }
  };
}
