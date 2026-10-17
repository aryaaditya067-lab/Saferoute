import type { Incident } from "@/types";

export interface HotspotCell {
  south: number;
  west: number;
  north: number;
  east: number;
  count: number;
  violent: number;
  /** Count weighted by category and age (recent violent crimes weigh most). */
  weight: number;
  /** Average position of the crimes in this cell (where the glow is centred). */
  lat: number;
  lng: number;
}

const CELL_METERS = 1000;
const HALF_LIFE_DAYS = 120;

/** Groups reported crimes into ~1 km squares so the busiest areas stand out. */
export function hotspotGrid(incidents: Incident[], today = new Date()): HotspotCell[] {
  if (incidents.length === 0) return [];
  const midLat = incidents.reduce((s, i) => s + i.lat, 0) / incidents.length;
  const dLat = CELL_METERS / 111_320;
  const dLng = CELL_METERS / (111_320 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)));
  const cells = new Map<string, HotspotCell>();
  for (const i of incidents) {
    const row = Math.floor(i.lat / dLat);
    const col = Math.floor(i.lng / dLng);
    const key = `${row}:${col}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { south: row * dLat, north: (row + 1) * dLat, west: col * dLng, east: (col + 1) * dLng, count: 0, violent: 0, weight: 0, lat: 0, lng: 0 };
      cells.set(key, cell);
    }
    const ageDays = Math.max(0, (today.getTime() - Date.parse(i.occurredOn)) / 86_400_000);
    cell.lat = (cell.lat * cell.count + i.lat) / (cell.count + 1);
    cell.lng = (cell.lng * cell.count + i.lng) / (cell.count + 1);
    cell.count += 1;
    if (i.category === "violent") cell.violent += 1;
    cell.weight += (i.category === "violent" ? 1 : 0.5) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  }
  return [...cells.values()];
}
