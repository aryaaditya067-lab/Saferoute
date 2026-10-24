import * as THREE from "three";
import { Batches, chunkOf, MeshBuilder, model, Proto, seeded, type Rand } from "./city/builder";
import { canopyGeo, columnTreeGeo, palmGeo, trunkGeo, type Tree, type TreeKind } from "./city/flora";
import { asphaltTexture, blobTexture, FACADE_TILE, facadeTextures, grassTexture, groundAoTexture, paverTexture, signTexture } from "./city/textures";
import {
  ambulanceGeo,
  autoGeo,
  bikeGeo,
  busGeo,
  hatchGeo,
  policeGeo,
  sedanGeo,
  signalState,
  suvGeo,
  Traffic,
  trainGeo,
  truckGeo,
  type Intersection,
  type VehicleType,
} from "./city/vehicles";

/**
 * A detailed, daylit Bengaluru-style city for the about page: apartments with balconies
 * and rooftop water tanks, shop streets, glass towers, a police station and a hospital
 * on the safe route, a temple, a park, a lake, a cricket stadium, a building site with a
 * crane, an elevated metro with a station, and traffic that stops at the lights.
 *
 * Static geometry is batched by material and area; shadows are rendered once (moving
 * things get soft blob shadows instead), so a frame is cheap after the first.
 */

/** Road centres on both axes; 0 is the wide avenue. */
export const ROADS = [-120, -96, -72, -48, -24, 0, 24, 48, 72, 96, 120];
export const roadWidth = (c: number) => (c === 0 ? 9 : 6);

const SW = 0.15; // sidewalk height
const SPAN = 280; // road length
const LOOP = 264; // traffic wraps round after this distance
const METRO_Z = -72;
const METRO_Y = 8;
const F = 1 / FACADE_TILE;

type Kind = "glass" | "office" | "res" | "shop" | "plain" | "pavers" | "asphalt" | "grass" | "water";

const PAVEMENT = 0xe7e2d9;
const KERB = 0xcfc8bc;
const ROAD = 0x7a7670;
const ROOF = 0xd9d5cd;
const STONE = 0xe8dcc4;
const CONCRETE = 0xc2bdb4;
const GLASS_TONES = [0xe9eef2, 0xdde6ee, 0xf1f3f5, 0xd5dee6];
const OFFICE_TONES = [0xf4f1ea, 0xe9e4da, 0xdedad2, 0xf0ebe0];
const APT_TONES = [0xf6efe3, 0xeee3d0, 0xe9ddc9, 0xf3ece2, 0xe6e0d8, 0xefe5d8];
const HOUSE_TONES = [0xf3dcc0, 0xf6e8cc, 0xefd2c8, 0xdde7cf, 0xf4e4b0, 0xece8e1, 0xd5e4e6, 0xe9d6e6];
const AWNINGS = [0xb8604a, 0x3f7a6e, 0xc9973f, 0x4f6f9a, 0x8a5a7f, 0x6b8a5a];
const CAR_COLORS = [0xffffff, 0xf3f3f3, 0xc0c4c9, 0x8d939b, 0x2c2e33, 0xa8322b, 0x2f5a96, 0xd8cdb6, 0x4a5d4f];
const BUS_COLORS = [0x2f63b0, 0x2f63b0, 0xc7402f, 0x3a8c4e];
const CLOTHES = [0xd24d4d, 0x3d6fb0, 0xe0a030, 0x2f7d6d, 0xf2f2f2, 0x7a4fa0, 0x444a55, 0xe07a9a, 0xf0c419];
const BLOOMS = [0xd2663f, 0xa58bc9, 0xdba2bb, 0xc95a4a];
const LEAVES = [0x5b7f45, 0x4f7440, 0x66884a, 0x56794a, 0x4a6b3c, 0x6a8c4e];

export interface CityOptions {
  anisotropy: number;
  /** "low" trims small details and traffic for phones. */
  quality: "high" | "low";
  /** Camera positions the page scrolls between; buildings under the path stay low. */
  cameraPath: Array<[number, number, number]>;
}

type Parked = { type: "sedan" | "hatch" | "suv" | "auto" | "police" | "ambulance"; x: number; z: number; rot: number; color: number };
type Sign = { tex: THREE.Texture; x: number; y: number; z: number; w: number; h: number; rot: number };

/** Lowest camera height over the scroll path near (x, z), or Infinity if the path stays away. */
function clearance(path: Array<[number, number, number]>, x: number, z: number) {
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      const px = a[0] + (b[0] - a[0]) * t;
      const pz = a[2] + (b[2] - a[2]) * t;
      if (Math.hypot(px - x, pz - z) < 16) min = Math.min(min, a[1] + (b[1] - a[1]) * t);
    }
  }
  return min;
}

export function buildCity(world: THREE.Group, opts: CityOptions) {
  const high = opts.quality === "high";
  const r: Rand = seeded(7);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const sign = () => (r() < 0.5 ? -1 : 1);
  const batches = new Batches<Kind>(new Set<Kind>(["pavers", "asphalt", "grass"]));
  const at = (kind: Kind, x: number, z: number) => batches.at(kind, x, z);
  const trees: Tree[] = [];
  const aoRects: Array<[number, number, number, number, number]> = [];
  const parked: Parked[] = [];
  const signs: Sign[] = [];
  const textures: THREE.Texture[] = [];
  const u0 = () => Math.floor(r() * FACADE_TILE) * F;

  const P = {
    tank: new Proto(new THREE.CylinderGeometry(0.3, 0.3, 0.62, 10).translate(0, 0.31, 0)),
    lid: new Proto(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 8).translate(0, 0.65, 0)),
    cyl: new Proto(new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0)),
    pole: new Proto(new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0)),
    hcyl: new Proto(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2)),
    halfCyl: new Proto(new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)),
    hip: new Proto(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)),
    cone8: new Proto(new THREE.ConeGeometry(1, 1, 8, 1).translate(0, 0.5, 0)),
    dome: new Proto(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    ball: new Proto(new THREE.SphereGeometry(1, 10, 8)),
    panel: new Proto(new THREE.BoxGeometry(1, 0.05, 0.62).rotateX(-0.42)),
  };

  // ---- ground and roads --------------------------------------------------------
  const groundB = new MeshBuilder(true);
  groundB.flat(-450, -450, 450, 450, -0.02, 0xe4dfd5);

  const active = ROADS.filter((c) => Math.abs(c) <= 96);
  const edgesOf = (c: number) => [c - roadWidth(c) / 2, c + roadWidth(c) / 2] as const;
  for (const c of ROADS) {
    const [a, b] = edgesOf(c);
    // Road segments between junctions, along x (at z = c) and along z (at x = c).
    let s = -SPAN / 2;
    for (const c2 of [...ROADS, SPAN / 2 + 100]) {
      const end = c2 > SPAN / 2 ? SPAN / 2 : edgesOf(c2)[0];
      if (end > s) {
        const mid = (s + end) / 2;
        at("asphalt", mid, c).flat(s, a, end, b, 0.02, ROAD, 8);
        at("asphalt", c, mid).flat(a, s, b, end, 0.02, ROAD, 8);
      }
      if (c2 <= SPAN / 2) s = edgesOf(c2)[1];
    }
    for (const c2 of ROADS) {
      const [a2, b2] = edgesOf(c2);
      at("asphalt", c2, c).flat(a2, a, b2, b, 0.02, ROAD, 8);
    }
  }

  // ---- junctions and signals ------------------------------------------------------
  const intersections = new Map<string, Intersection>();
  for (const X of active) for (const Z of active) intersections.set(`${X},${Z}`, { x: X, z: Z, offset: r() * 20 });

  // ---- street lights -----------------------------------------------------------------
  const lamps: Array<{ x: number; z: number; rot: number }> = [];
  for (const c of active) {
    const w = roadWidth(c);
    const step = c === 0 ? 12 : 24;
    for (let s = -108; s <= 108; s += step) {
      if (ROADS.some((c2) => Math.abs(s - c2) < roadWidth(c2) / 2 + 1.5)) continue;
      for (const side of [-1, 1]) {
        if (c === 0 && (s / 12) % 2 !== 0 && side === 1) continue;
        const o = c + side * (w / 2 + 0.35);
        lamps.push({ x: s, z: o, rot: (side * Math.PI) / 2 });
        lamps.push({ x: o, z: s, rot: side > 0 ? Math.PI : 0 });
      }
    }
  }
  const nearLamp = (x: number, z: number) => lamps.some((l) => Math.abs(l.x - x) < 1.4 && Math.abs(l.z - z) < 1.4);

  // ---- building pieces --------------------------------------------------------------
  const parapet = (b: MeshBuilder, x: number, z: number, w: number, d: number, top: number, color: number, h = 0.34) => {
    const t = 0.12;
    b.box(x, top, z + d / 2 - t / 2, w, h, t, { color });
    b.box(x, top, z - d / 2 + t / 2, w, h, t, { color });
    b.box(x + w / 2 - t / 2, top, z, t, h, d - 2 * t, { color });
    b.box(x - w / 2 + t / 2, top, z, t, h, d - 2 * t, { color });
  };
  const tanks = (b: MeshBuilder, x: number, z: number, w: number, d: number, top: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const tx = x + (r() - 0.5) * Math.max(0, w - 1.4);
      const tz = z + (r() - 0.5) * Math.max(0, d - 1.4);
      b.proto(P.tank, 0x2a2b2d, tx, top, tz);
      b.proto(P.lid, 0x3b3c3e, tx, top, tz);
    }
  };
  const stairHead = (b: MeshBuilder, x: number, z: number, w: number, d: number, top: number, color: number) => {
    b.box(x + (w / 2 - 0.9) * sign(), top, z + (d / 2 - 1.0) * sign(), 1.3, 1.0, 1.5, { color, top: ROOF });
  };
  /** Solar water heater: a tilted panel with the tank behind it. */
  const solar = (b: MeshBuilder, x: number, z: number, top: number) => {
    b.proto(P.panel, 0x2b4a6f, x, top + 0.42, z);
    b.proto(P.hcyl, 0xf0f0ee, x, top + 0.7, z - 0.36, 1.0, 0.24, 0.24);
  };
  const acUnits = (b: MeshBuilder, x: number, z: number, w: number, d: number, top: number, n: number) => {
    for (let k = 0; k < n; k++) b.box(x + (r() - 0.5) * (w - 1.4), top, z + (r() - 0.5) * (d - 1.4), 0.6, 0.42, 0.5, { color: 0xc9ccce, top: 0xb5b9bc });
  };

  /**
   * Walls of a building: an optional row of shopfronts with an awning, then `floors`
   * one-unit storeys in the given facade. Returns the roof height.
   */
  const walls = (x: number, z: number, w: number, d: number, floors: number, kind: "res" | "office" | "glass", tone: number, shops: boolean, y0 = SW) => {
    let y = y0;
    let upper = floors;
    if (shops) {
      at("shop", x, z).box(x, y, z, w, 1.3, d, { color: 0xffffff, top: ROOF, facade: { su: F, sv: 1 / 1.3, u0: u0() }, noTop: floors > 1 });
      y += 1.3;
      upper -= 1;
      at("plain", x, z).box(x, y - 0.4, z, w + 0.5, 0.07, d + 0.5, { color: pick(AWNINGS) });
    }
    if (upper > 0) at(kind, x, z).box(x, y, z, w, upper, d, { color: tone, top: ROOF, facade: { su: F, sv: F, u0: u0() }, ao: !shops });
    aoRects.push([x, z, w, d, 0.6]);
    return y + Math.max(0, upper);
  };

  const compound = (x: number, z: number, w: number, d: number, color: number, gateSide = Math.floor(r() * 4)) => {
    const b = at("plain", x, z);
    const t = 0.1;
    const h = 0.55;
    const sides: Array<[number, number, number, number]> = [
      [x, z + d / 2 - t / 2, w, t],
      [x, z - d / 2 + t / 2, w, t],
      [x + w / 2 - t / 2, z, t, d],
      [x - w / 2 + t / 2, z, t, d],
    ];
    sides.forEach(([sx, sz, sw, sd], i) => {
      if (i !== gateSide) {
        b.box(sx, SW, sz, sw, h, sd, { color, top: 0xd8d2c6 });
        return;
      }
      // Two wall pieces either side of a dark gate.
      const along = sw > sd;
      const len = along ? sw : sd;
      const piece = (len - 1.3) / 2;
      for (const s of [-1, 1]) {
        const off = s * (1.3 / 2 + piece / 2);
        b.box(along ? sx + off : sx, SW, along ? sz : sz + off, along ? piece : sw, h, along ? sd : piece, { color, top: 0xd8d2c6 });
      }
      b.box(sx, SW, sz, along ? 1.3 : 0.04, 0.5, along ? 0.04 : 1.3, { color: 0x3b4a3f });
    });
  };

  const house = (x: number, z: number, w: number, d: number, floors: number, lot: number) => {
    const tone = pick(HOUSE_TONES);
    const p = at("plain", x, z);
    const top = walls(x, z, w, d, floors, "res", tone, floors > 1 && r() < 0.3);
    if (r() < 0.28) {
      p.proto(P.hip, 0xb4583a, x, top, z, w * 1.1, 0.95, d * 1.1);
    } else {
      parapet(p, x, z, w, d, top, tone);
      tanks(p, x, z, w, d, top, 1);
      if (r() < 0.5) stairHead(p, x, z, w, d, top, tone);
      if (high && r() < 0.35) solar(p, x + (r() - 0.5) * (w - 1.5), z + (r() - 0.5) * (d - 1.5), top);
    }
    if (high && lot > 3.8) {
      compound(x, z, lot - 0.25, lot - 0.25, pick([0xf1ece2, 0xe9e1d3, 0xdcd6cb]));
      if (r() < 0.5) {
        const kind: TreeKind = pick(["palm", "column", "column", "rain"]);
        trees.push({ kind, x: x + (lot / 2 - 0.55) * sign(), z: z + (lot / 2 - 0.55) * sign(), y: SW, s: 0.5 + r() * 0.2 });
      }
    }
  };

  const apartment = (x: number, z: number, w: number, d: number, floors: number, glassy: boolean) => {
    const tone = pick(glassy ? GLASS_TONES : APT_TONES);
    const shops = !glassy && r() < 0.45;
    const top = walls(x, z, w, d, floors, glassy ? "glass" : "res", tone, shops);
    const p = at("plain", x, z);
    parapet(p, x, z, w, d, top, glassy ? 0xc9d0d6 : tone);
    stairHead(p, x, z, w, d, top, glassy ? 0xdfe4e8 : tone);
    if (glassy) {
      acUnits(p, x, z, w, d, top, 3);
    } else {
      tanks(p, x, z, w, d, top, 2 + Math.floor(r() * 3));
      if (high && r() < 0.3) solar(p, x + (r() - 0.5) * (w - 1.6), z + (r() - 0.5) * (d - 1.6), top);
      if (high && r() < 0.7) {
        // Balconies with railings on the two long faces.
        const alongX = w >= d;
        const len = (alongX ? w : d) * 0.78;
        const half = (alongX ? d : w) / 2;
        const rail = pick([0x8f969c, 0xf2f0eb, 0x6f6a64]);
        const first = shops ? SW + 1.3 + 1 : SW + 1;
        for (let y = first; y < top - 0.5; y += 1) {
          for (const s of [-1, 1]) {
            if (alongX) {
              p.box(x, y, z + s * (half + 0.19), len, 0.08, 0.38, { color: 0xe4ddd2 });
              p.box(x, y + 0.08, z + s * (half + 0.36), len, 0.32, 0.04, { color: rail });
            } else {
              p.box(x + s * (half + 0.19), y, z, 0.38, 0.08, len, { color: 0xe4ddd2 });
              p.box(x + s * (half + 0.36), y + 0.08, z, 0.04, 0.32, len, { color: rail });
            }
          }
        }
      }
    }
  };

  const office = (x: number, z: number, w: number, d: number, floors: number) => {
    const tone = pick(OFFICE_TONES);
    // A recessed glass lobby under the office floors.
    at("glass", x, z).box(x, SW, z, w - 0.5, 1.4, d - 0.5, { color: 0xeef2f5, facade: { su: F, sv: F, u0: u0() }, noTop: true });
    const top = walls(x, z, w, d, floors - 1, "office", tone, false, SW + 1.4);
    const p = at("plain", x, z);
    parapet(p, x, z, w, d, top, tone);
    if (r() < 0.45) {
      at("glass", x, z).box(x, top, z, w * 0.62, 1, d * 0.62, { color: pick(GLASS_TONES), top: ROOF, facade: { su: F, sv: F, u0: u0() } });
      acUnits(p, x, z, w * 0.62, d * 0.62, top + 1, 2);
    } else if (high) {
      // Rows of solar panels.
      for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j += 2) p.proto(P.panel, 0x2b4a6f, x + k * 1.3, top + 0.35, z + j * 1.2, 1.1, 1, 1.4);
    }
    acUnits(p, x, z, w, d, top, 3);
  };

  const tower = (cx: number, cz: number, centre: number, cap: number) => {
    const pw = 12.6;
    const pTop = walls(cx, cz, pw, pw, 2, "office", pick(OFFICE_TONES), true);
    const p = at("plain", cx, cz);
    parapet(p, cx, cz, pw, pw, pTop, 0xe2ddd3);
    // Podium terrace garden.
    at("grass", cx, cz).box(cx - 4.4, pTop, cz + 4.4, 3, 0.12, 3, { color: 0xffffff, worldTop: 6 });
    trees.push({ kind: "column", x: cx - 4.4, z: cz + 4.4, y: pTop + 0.12, s: 0.45 }, { kind: "column", x: cx - 5.2, z: cz + 3.6, y: pTop + 0.12, s: 0.4 });
    const tw = 6.5 + Math.round(r() * 2);
    const td = 6.5 + Math.round(r() * 2);
    const floors = Math.max(6, Math.min(Math.round(9 + r() * 5 + centre * r() * 5), Math.floor(cap - pTop - 2)));
    const base = pTop + 0.05;
    const tone = pick(GLASS_TONES);
    const g = at("glass", cx, cz);
    let top: number;
    let topW = tw;
    let topD = td;
    const variant = r();
    if (variant < 0.45) {
      g.box(cx, base, cz, tw, floors, td, { color: tone, top: ROOF, facade: { su: F, sv: F, u0: u0() } });
      top = base + floors;
    } else if (variant < 0.8) {
      const lower = Math.round(floors * 0.6);
      g.box(cx, base, cz, tw, lower, td, { color: tone, top: ROOF, facade: { su: F, sv: F, u0: u0() } });
      parapet(p, cx, cz, tw, td, base + lower, 0xc9d0d6, 0.3);
      topW = Math.round(tw * 0.72);
      topD = Math.round(td * 0.72);
      g.box(cx, base + lower, cz, topW, floors - lower, topD, { color: tone, top: ROOF, facade: { su: F, sv: F, u0: u0() } });
      top = base + floors;
    } else {
      // Twin slabs with a gap between.
      const sw = Math.round(tw * 0.42);
      g.box(cx - tw * 0.29, base, cz, sw, floors, td, { color: tone, top: ROOF, facade: { su: F, sv: F, u0: u0() } });
      g.box(cx + tw * 0.29, base, cz, sw, floors - 2, td, { color: pick(GLASS_TONES), top: ROOF, facade: { su: F, sv: F, u0: u0() } });
      top = base + floors;
      topW = sw;
      p.box(cx, base + 3, cz, tw * 0.2, 0.4, td * 0.6, { color: 0xc9d0d6 });
    }
    const crownX = variant >= 0.8 ? cx - tw * 0.29 : cx;
    parapet(p, crownX, cz, topW, topD, top, 0xc2c9cf, 0.9);
    p.box(crownX, top, cz, topW * 0.45, 0.9, topD * 0.45, { color: 0xd7dade, top: 0xc5c9cc });
    if (floors >= 13 && topW >= 6) {
      // Helipad.
      p.proto(P.cyl, 0x5c6066, crownX, top + 0.9, cz, 3.4, 0.05, 3.4);
      p.box(crownX - 0.45, top + 0.95, cz, 0.16, 0.02, 1.2, { color: 0xffffff });
      p.box(crownX + 0.45, top + 0.95, cz, 0.16, 0.02, 1.2, { color: 0xffffff });
      p.box(crownX, top + 0.95, cz, 0.9, 0.02, 0.16, { color: 0xffffff });
    } else {
      p.proto(P.pole, 0x8a8f95, crownX + 1, top + 0.9, cz + 1, 0.08, 2.4, 0.08);
      p.proto(P.ball, 0xd8322b, crownX + 1, top + 3.35, cz + 1, 0.1, 0.1, 0.1);
    }
  };

  const garden = (x: number, z: number, size: number) => {
    at("grass", x, z).box(x, SW, z, size, 0.06, size, { color: 0xffffff, worldTop: 6 });
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) trees.push({ kind: pick(["rain", "rain", "palm"]), x: x + (r() - 0.5) * size * 0.6, z: z + (r() - 0.5) * size * 0.6, y: SW + 0.06, s: 0.7 + r() * 0.4 });
    at("plain", x, z).box(x, SW + 0.06, z + size * 0.32, 1.2, 0.22, 0.36, { color: 0x8c6b4f });
  };

  // ---- special blocks ------------------------------------------------------------------
  const park = (cx: number, cz: number) => {
    at("grass", cx, cz).box(cx, SW, cz, 16.8, 0.06, 16.8, { color: 0xffffff, worldTop: 6 });
    const pv = at("pavers", cx, cz);
    pv.box(cx, SW, cz, 16.8, 0.08, 1.3, { color: 0xefe8db, worldTop: 2 });
    pv.box(cx, SW, cz, 1.3, 0.08, 16.8, { color: 0xefe8db, worldTop: 2 });
    pv.proto(P.cyl, 0xefe8db, cx, SW, cz, 5.2, 0.085, 5.2);
    const p = at("plain", cx, cz);
    // Fountain in the middle.
    p.proto(P.cyl, STONE, cx, SW + 0.08, cz, 3, 0.35, 3);
    at("water", cx, cz).proto(P.cyl, 0xffffff, cx, SW + 0.1, cz, 2.6, 0.32, 2.6);
    p.proto(P.cyl, STONE, cx, SW + 0.4, cz, 0.5, 0.9, 0.5);
    p.proto(P.cyl, STONE, cx, SW + 1.3, cz, 1.2, 0.12, 1.2);
    // Pond with a stone edge.
    p.proto(P.cyl, 0xd9cfbd, cx + 4.3, SW, cz + 4.3, 6.4, 0.1, 4.6);
    at("water", cx, cz).proto(P.cyl, 0xffffff, cx + 4.3, SW + 0.02, cz + 4.3, 5.8, 0.07, 4.0);
    // Bandstand.
    const bx = cx - 4.3;
    const bz = cz - 4.3;
    p.proto(P.cyl, 0xe9dfcc, bx, SW, bz, 2.8, 0.28, 2.8);
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      p.proto(P.pole, 0xf4ede0, bx + Math.cos(t) * 1.15, SW + 0.28, bz + Math.sin(t) * 1.15, 0.12, 1.5, 0.12);
    }
    p.proto(P.cone8, 0xb4583a, bx, SW + 1.78, bz, 1.7, 0.9, 1.7);
    // Flower beds and benches along the paths.
    const beds = [0xd94f6b, 0xf2c14e, 0xe8743b, 0xc94f9a];
    beds.forEach((color, i) => {
      const sx = i % 2 ? 1 : -1;
      const sz = i < 2 ? 1 : -1;
      p.box(cx + sx * 2.2, SW, cz + sz * 6.6, 1.6, 0.22, 0.7, { color: 0x8a6b4e, top: color });
      p.box(cx + sx * 6.6, SW, cz + sz * 2.2, 0.7, 0.22, 1.6, { color: 0x8a6b4e, top: beds[(i + 1) % 4]! });
    });
    for (const s of [-1, 1]) {
      p.box(cx + s * 3.6, SW, cz + 1.0, 1.0, 0.24, 0.32, { color: 0x8c6b4f });
      p.box(cx + 1.0, SW, cz + s * 3.6, 0.32, 0.24, 1.0, { color: 0x8c6b4f });
    }
    let placed = 0;
    for (let tries = 0; tries < 300 && placed < 30; tries++) {
      const dx = (r() - 0.5) * 15.6;
      const dz = (r() - 0.5) * 15.6;
      if (Math.abs(dx) < 1.5 || Math.abs(dz) < 1.5 || Math.hypot(dx, dz) < 3.4) continue;
      if (Math.hypot((dx - 4.3) / 3.6, (dz - 4.3) / 2.8) < 1 || Math.hypot(dx + 4.3, dz + 4.3) < 2.2) continue;
      trees.push({ kind: r() < 0.18 ? "bloom" : "rain", x: cx + dx, z: cz + dz, y: SW + 0.06, s: 0.85 + r() * 0.6 });
      placed++;
    }
  };

  /** A nod to Vidhana Soudha: a long stone block with a portico, a central dome and corner domes. */
  const landmark = (cx: number, cz: number) => {
    const p = at("plain", cx, cz);
    const base = SW + 0.6;
    at("grass", cx, cz).box(cx, SW, cz + 6.6, 15, 0.05, 3, { color: 0xffffff, worldTop: 6 });
    p.box(cx, SW, cz - 0.5, 15, 0.6, 11, { color: 0xd9c9ab });
    at("res", cx, cz).box(cx, base, cz - 0.5, 13, 4, 8, { color: STONE, top: ROOF, facade: { su: F, sv: F, u0: 0 }, ao: true });
    aoRects.push([cx, cz - 0.5, 15, 11, 0.5]);
    p.box(cx, base + 4, cz - 0.5, 13.5, 0.3, 8.5, { color: 0xdccaa8 });
    p.box(cx, base + 4, cz + 4.5, 5.6, 0.5, 2.4, { color: 0xdccaa8 });
    for (let k = 0; k < 6; k++) p.proto(P.cyl, 0xf4ead8, cx - 2.5 + k, base, cz + 5.3, 0.38, 4, 0.38);
    p.proto(P.hip, STONE, cx, base + 4.5, cz + 4.5, 5.6, 1, 2.2);
    p.proto(P.cyl, STONE, cx, base + 4.3, cz - 0.5, 4.6, 1.4, 4.6);
    p.proto(P.dome, 0xe7d5b2, cx, base + 5.7, cz - 0.5, 2.25, 2.25, 2.25);
    p.proto(P.pole, 0xc9a64a, cx, base + 7.9, cz - 0.5, 0.12, 1.2, 0.12);
    p.proto(P.ball, 0xc9a64a, cx, base + 9.1, cz - 0.5, 0.18, 0.18, 0.18);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = cx + sx * 5.6;
        const z = cz - 0.5 + sz * 3.1;
        p.proto(P.cyl, STONE, x, base + 4.3, z, 1.7, 0.7, 1.7);
        p.proto(P.dome, 0xe7d5b2, x, base + 5, z, 0.85, 0.85, 0.85);
      }
    }
    for (const sx of [-1, 1]) trees.push({ kind: "column", x: cx + sx * 7, z: cz + 6.8, y: SW, s: 0.55 }, { kind: "column", x: cx + sx * 4.6, z: cz + 7, y: SW, s: 0.5 });
  };

  const police = (cx: number, cz: number) => {
    compound(cx, cz, 13.4, 13.4, 0xe9e1d3, 0);
    const bz = cz - 1.6;
    const top = walls(cx, bz, 10, 6, 2, "res", 0xf3ecdc, false);
    const p = at("plain", cx, cz);
    p.box(cx, SW, bz, 10.06, 0.55, 6.06, { color: 0x2d4f8f });
    parapet(p, cx, bz, 10, 6, top, 0xf3ecdc);
    tanks(p, cx, bz, 10, 6, top, 2);
    p.box(cx - 0.2, top, bz, 0.4, 0.14, 0.3, { color: 0xd82a2a });
    p.box(cx + 0.2, top, bz, 0.4, 0.14, 0.3, { color: 0x2a5bd8 });
    // Entrance porch facing the road.
    p.box(cx, SW + 1.9, bz + 3.6, 3.4, 0.16, 1.4, { color: 0xe9e1d3 });
    for (const s of [-1, 1]) p.proto(P.cyl, 0xf3ecdc, cx + s * 1.4, SW, bz + 4.1, 0.24, 1.9, 0.24);
    signs.push({ tex: signTexture("POLICE STATION", "#24479a", "#ffffff", opts.anisotropy), x: cx, y: SW + 2.38, z: bz + 3.25, w: 3.4, h: 0.6, rot: 0 });
    // Flag.
    p.proto(P.pole, 0xdedede, cx + 5, SW, cz + 4.6, 0.08, 5, 0.08);
    p.box(cx + 5.6, SW + 4.4, cz + 4.6, 1.1, 0.22, 0.03, { color: 0xff9933 });
    p.box(cx + 5.6, SW + 4.18, cz + 4.6, 1.1, 0.22, 0.03, { color: 0xffffff });
    p.box(cx + 5.6, SW + 3.96, cz + 4.6, 1.1, 0.22, 0.03, { color: 0x138808 });
    parked.push({ type: "police", x: cx - 3.4, z: cz + 4.2, rot: Math.PI / 2, color: 0xffffff }, { type: "police", x: cx - 1.6, z: cz + 4.4, rot: Math.PI / 2, color: 0xffffff });
    for (const s of [-1, 1]) trees.push({ kind: "column", x: cx + s * 6, z: cz - 5.6, y: SW, s: 0.55 });
  };

  const hospital = (cx: number, cz: number) => {
    const p = at("plain", cx, cz);
    const top = walls(cx, cz + 1, 12, 8, 4, "res", 0xf8f8f6, false);
    parapet(p, cx, cz + 1, 12, 8, top, 0xf0f0ee);
    acUnits(p, cx, cz + 1, 12, 8, top, 4);
    // Red cross on the roof.
    p.box(cx + 2, top, cz + 1, 2.6, 0.06, 0.8, { color: 0xd23b30 });
    p.box(cx + 2, top, cz + 1, 0.8, 0.06, 2.6, { color: 0xd23b30 });
    // Entrance wing with a canopy facing the road.
    const wTop = walls(cx - 3, cz - 4.4, 5, 2.6, 2, "glass", 0xeef3f6, false);
    parapet(p, cx - 3, cz - 4.4, 5, 2.6, wTop, 0xe1e6ea);
    p.box(cx - 3, SW + 1.6, cz - 6.1, 4.2, 0.14, 1.6, { color: 0xf4f4f2 });
    for (const s of [-1, 1]) p.proto(P.pole, 0xdcdcdc, cx - 3 + s * 1.9, SW, cz - 6.7, 0.12, 1.6, 0.12);
    signs.push({ tex: signTexture("HOSPITAL", "#c62f2f", "#ffffff", opts.anisotropy), x: cx + 2.6, y: SW + 2.55, z: cz - 3.03, w: 3.6, h: 0.7, rot: Math.PI });
    // A cross on the facade above the sign.
    p.box(cx + 2.6, SW + 3.34, cz - 3.06, 0.7, 0.22, 0.06, { color: 0xd23b30 });
    p.box(cx + 2.6, SW + 3.1, cz - 3.06, 0.22, 0.7, 0.06, { color: 0xd23b30 });
    parked.push({ type: "ambulance", x: cx + 1.5, z: cz - 5.4, rot: 0, color: 0xffffff }, { type: "ambulance", x: cx + 4.6, z: cz - 5.6, rot: Math.PI, color: 0xffffff });
    for (const s of [-1, 1]) trees.push({ kind: "rain", x: cx + s * 6, z: cz + 6.4, y: SW, s: 0.7 });
  };

  /** South Indian temple: a stepped gopuram over the gate, a pillared hall and the shrine. */
  const temple = (cx: number, cz: number) => {
    const p = at("plain", cx, cz);
    compound(cx, cz, 13.4, 13.4, 0xe2c9a0, 0);
    at("pavers", cx, cz).box(cx, SW, cz, 12.6, 0.05, 12.6, { color: 0xeadfca, worldTop: 2 });
    const gz = cz + 6.2;
    const tiers = [0xeadfc8, 0xd9a066, 0xeadfc8, 0xc97f52, 0xeadfc8, 0xd9a066, 0xe9c58b];
    let y = SW;
    let w = 4.4;
    let d = 2.4;
    p.box(cx, y, gz, w, 1.8, d, { color: 0xe6dac2 });
    y += 1.8;
    for (const color of tiers) {
      p.box(cx, y, gz, w, 0.62, d, { color });
      y += 0.62;
      w -= 0.42;
      d -= 0.2;
    }
    p.proto(P.halfCyl, 0xd9a066, cx, y, gz, w + 0.3, 1.1, d + 0.3);
    for (let k = -2; k <= 2; k++) p.proto(P.ball, 0xd4a72c, cx + k * (w / 5), y + 0.62, gz, 0.12, 0.18, 0.12);
    aoRects.push([cx, gz, 4.4, 2.4, 0.6]);
    // Pillared hall.
    p.box(cx, SW + 1.8, cz + 1.2, 6, 0.3, 5, { color: 0xe6dac2, top: 0xd9cdb5 });
    for (let i = -1; i <= 1; i += 2) for (let k = -2; k <= 2; k++) p.proto(P.cyl, 0xe9dfca, cx + i * 2.6, SW, cz + 1.2 + k * 1.1, 0.3, 1.8, 0.3);
    // Shrine with a domed top.
    p.box(cx, SW, cz - 3.4, 3.4, 2.2, 3.4, { color: 0xe6dac2 });
    p.box(cx, SW + 2.2, cz - 3.4, 2.6, 0.6, 2.6, { color: 0xd9a066 });
    p.box(cx, SW + 2.8, cz - 3.4, 1.9, 0.5, 1.9, { color: 0xeadfc8 });
    p.proto(P.dome, 0xd9a066, cx, SW + 3.3, cz - 3.4, 0.95, 0.9, 0.95);
    p.proto(P.ball, 0xd4a72c, cx, SW + 4.3, cz - 3.4, 0.15, 0.24, 0.15);
    aoRects.push([cx, cz - 3.4, 3.4, 3.4, 0.6]);
    p.proto(P.pole, 0xd4a72c, cx, SW, cz + 4.4, 0.12, 3.2, 0.12);
    for (const [dx, dz] of [[-5.6, -5.6], [5.6, -5.6], [-5.6, 2.2], [5.6, 2.2], [5.6, -1.8]] as const) {
      trees.push({ kind: "palm", x: cx + dx, z: cz + dz, y: SW, s: 0.75 + r() * 0.2 });
    }
  };

  /** Building site: concrete frame, blue sheet fence, sand and bricks; the crane is added later. */
  let craneAt: [number, number] | null = null;
  const construction = (cx: number, cz: number) => {
    const p = at("plain", cx, cz);
    const fence = 0x2f6fb5;
    for (const s of [-1, 1]) {
      p.box(cx, SW, cz + s * 6.6, 13.4, 1.1, 0.06, { color: fence });
      p.box(cx + s * 6.6, SW, cz, 0.06, 1.1, 13.4, { color: fence });
    }
    at("pavers", cx, cz).box(cx, SW, cz, 13, 0.04, 13, { color: 0xcbb994, worldTop: 2 });
    const fx = cx - 1.5;
    const fz = cz - 1.2;
    const floors = 6;
    for (let f = 0; f <= floors; f++) {
      if (f < floors - 1) p.box(fx, SW + f * 1.15, fz, 8.4, 0.16, 6.4, { color: CONCRETE });
      for (const ix of [-1, 0, 1]) for (const iz of [-1, 0, 1]) if (f < floors) p.box(fx + ix * 3.9, SW + f * 1.15, fz + iz * 2.9, 0.28, 1.15, 0.28, { color: 0xb3ada3 });
    }
    aoRects.push([fx, fz, 8.4, 6.4, 0.5]);
    p.proto(P.cone8, 0xd8c08a, cx + 3.4, SW, cz + 4, 1.6, 0.9, 1.4);
    p.box(cx - 4.4, SW, cz + 4.6, 1.6, 0.6, 1.0, { color: 0xa65a3a });
    p.box(cx + 4.8, SW, cz - 4.4, 0.9, 1.2, 1.2, { color: 0xbfc6cc });
    craneAt = [cx + 4.2, cz + 0.6];
    p.box(craneAt[0], SW, craneAt[1], 0.7, 21, 0.7, { color: 0xf2b91c });
    p.box(craneAt[0], SW, craneAt[1], 1.6, 0.6, 1.6, { color: 0x9a9a9a });
  };

  /** Cricket stadium: oval field with a pitch, raked stands, part roof, four floodlight masts. */
  const stadium = (cx: number, cz: number) => {
    const p = at("plain", cx, cz);
    at("grass", cx, cz).proto(P.cyl, 0xffffff, cx, SW, cz, 13.4, 0.06, 11.6);
    p.box(cx, SW + 0.06, cz, 0.9, 0.02, 3, { color: 0xcdb48a });
    const stands = (rIn: number, rOut: number, h: number, y: number, color: number, start = 0, len = Math.PI * 2) => {
      const g = new THREE.CylinderGeometry(rIn, rOut, h, 44, 1, true, start, len);
      g.scale(1, -1, 0.86);
      g.computeVertexNormals();
      p.geo(g, color, cx, y + h / 2, cz);
    };
    stands(6.9, 7.9, 1.3, SW, 0x5c7fae);
    stands(7.9, 8.6, 1.2, SW + 1.3, 0xd9d7d2);
    p.geo(new THREE.CylinderGeometry(8.7, 8.7, 2.7, 44, 1, true).scale(1, 1, 0.86), 0xe9e4da, cx, SW + 1.35, cz);
    stands(7.4, 9.1, 0.25, SW + 3.2, 0xf4f4f2, -0.9, 1.8);
    stands(7.4, 9.1, 0.25, SW + 3.2, 0xf4f4f2, Math.PI - 0.9, 1.8);
    aoRects.push([cx, cz, 17, 15, 0.45]);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = cx + sx * 7.2;
      const z = cz + sz * 6.2;
      p.proto(P.pole, 0x9aa0a6, x, SW, z, 0.22, 9.5, 0.22);
      p.box(x, SW + 9.3, z, 1.4, 0.9, 1.4, { color: 0xe8e8e6 });
    }
  };

  const lake = (cx: number, cz: number) => {
    at("pavers", cx, cz).proto(P.cyl, 0xe9e2d6, cx, SW, cz, 16.4, 0.05, 16.4);
    at("plain", cx, cz).proto(P.cyl, 0xcfc4ae, cx, SW + 0.05, cz, 14.4, 0.08, 14.4);
    at("water", cx, cz).proto(P.cyl, 0xffffff, cx, SW + 0.06, cz, 13.6, 0.1, 13.6);
    at("grass", cx, cz).proto(P.cyl, 0xffffff, cx + 2, SW + 0.06, cz - 1.5, 2.6, 0.18, 2.2);
    trees.push({ kind: "rain", x: cx + 2, z: cz - 1.5, y: SW + 0.24, s: 0.75 });
    for (let a = 0; a < 14; a++) {
      const t = (a / 14) * Math.PI * 2;
      trees.push({ kind: a % 4 === 0 ? "bloom" : a % 3 === 0 ? "palm" : "rain", x: cx + Math.cos(t) * 7.7, z: cz + Math.sin(t) * 7.7, y: SW, s: 0.7 + r() * 0.3 });
    }
  };

  const SPECIAL: Record<string, (cx: number, cz: number) => void> = {
    "36,-36": park,
    "-36,-36": landmark,
    "-36,36": police,
    "12,60": hospital,
    "-60,12": temple,
    "60,12": construction,
    "84,-36": stadium,
    "-84,-84": lake,
  };

  // ---- blocks ------------------------------------------------------------------------------
  const footpaths: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const x0 = ROADS[i]! + roadWidth(ROADS[i]!) / 2;
      const x1 = ROADS[i + 1]! - roadWidth(ROADS[i + 1]!) / 2;
      const z0 = ROADS[j]! + roadWidth(ROADS[j]!) / 2;
      const z1 = ROADS[j + 1]! - roadWidth(ROADS[j + 1]!) / 2;
      const cx = (ROADS[i]! + ROADS[i + 1]!) / 2;
      const cz = (ROADS[j]! + ROADS[j + 1]!) / 2;
      at("pavers", cx, cz).box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, SW, z1 - z0, { color: KERB, top: PAVEMENT, worldTop: 4 });
      const inner = Math.abs(cx) < 96 && Math.abs(cz) < 96;
      const inset = (road: number) => (road === 0 ? 0.45 : 1.35);
      if (inner) {
        footpaths.push({ x0: x0 + inset(ROADS[i]!), x1: x1 - inset(ROADS[i + 1]!), z0: z0 + inset(ROADS[j]!), z1: z1 - inset(ROADS[j + 1]!) });
      }

      // Street trees just inside the kerb, except along the avenue.
      const kerbs: Array<[number, number, "x" | "z"]> = [
        [ROADS[i]!, x0 + 0.6, "x"],
        [ROADS[i + 1]!, x1 - 0.6, "x"],
        [ROADS[j]!, z0 + 0.6, "z"],
        [ROADS[j + 1]!, z1 - 0.6, "z"],
      ];
      for (const [road, line, axis] of kerbs) {
        if (road === 0) continue;
        for (const o of [-6.5, -3, 3, 6.5]) {
          if (r() < 0.3) continue;
          const x = axis === "x" ? line : cx + o;
          const z = axis === "x" ? cz + o : line;
          if (nearLamp(x, z)) continue;
          trees.push({ kind: r() < 0.08 ? "bloom" : r() < 0.15 ? "column" : "rain", x, z, y: SW, s: 0.68 + r() * 0.4 });
        }
      }

      const special = SPECIAL[`${cx},${cz}`];
      if (special) {
        special(cx, cz);
        continue;
      }
      const dist = Math.hypot(cx, cz);
      const centre = Math.max(0, 1 - dist / 95);
      // Keep buildings well under the camera wherever the scroll path passes low.
      const cap = clearance(opts.cameraPath, cx, cz) - 5;
      if (dist > 20 && dist < 80 && cap > 20 && r() < 0.42) {
        tower(cx, cz, centre, cap);
        continue;
      }
      const officeFloors = Math.min(Math.round(5 + r() * 5 * centre + r() * 2), Math.floor(cap - 1));
      if (centre > 0.3 && officeFloors >= 4 && r() < 0.22) {
        for (const s of [-1, 1]) office(cx + s * 3.4, cz, 5.6, 12, officeFloors);
        continue;
      }
      const n = centre > 0.45 ? 2 : r() < 0.55 ? 3 : 2;
      const cell = 13.2 / n;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const x = cx - 6.6 + (a + 0.5) * cell;
          const z = cz - 6.6 + (b + 0.5) * cell;
          if (r() < 0.06) {
            garden(x, z, cell - 0.5);
            continue;
          }
          let floors = Math.round(1 + r() * 2 + centre * r() * 10);
          // The reported-crime blocks stay low so the red area reads from above.
          if (Math.hypot(x, z) < 16) floors = Math.min(floors, 2);
          floors = Math.max(1, Math.min(floors, Math.floor(cap - 1)));
          const w = (cell - 1.3) * (0.85 + r() * 0.15);
          const d = (cell - 1.3) * (0.85 + r() * 0.15);
          if (floors >= 4) apartment(x, z, w, d, floors, centre > 0.5 && r() < 0.3);
          else house(x, z, w, d, floors, cell);
        }
      }
    }
  }

  // ---- a plainer ring of streets and houses out into the haze, so the city never ends in view
  {
    const lines = [-192, -168, -144, ...ROADS, 144, 168, 192];
    const reach = 210;
    for (const c of lines) {
      const outer = Math.abs(c) > 120;
      // Far roads run the whole way; the city's own roads just carry on past their ends.
      for (const [s0, s1] of outer ? [[-reach, reach]] : [[-reach, -SPAN / 2], [SPAN / 2, reach]]) {
        at("asphalt", (s0! + s1!) / 2, c).flat(s0!, c - 3, s1!, c + 3, 0.02, ROAD, 8);
        at("asphalt", c, (s0! + s1!) / 2).flat(c - 3, s0!, c + 3, s1!, 0.02, ROAD, 8);
      }
    }
    for (let i = 0; i < lines.length - 1; i++) {
      for (let j = 0; j < lines.length - 1; j++) {
        const cx = (lines[i]! + lines[i + 1]!) / 2;
        const cz = (lines[j]! + lines[j + 1]!) / 2;
        if (Math.abs(cx) < 120 && Math.abs(cz) < 120) continue;
        const x0 = lines[i]! + 3;
        const x1 = lines[i + 1]! - 3;
        const z0 = lines[j]! + 3;
        const z1 = lines[j + 1]! - 3;
        at("pavers", cx, cz).box(cx, 0, cz, x1 - x0, SW, z1 - z0, { color: KERB, top: PAVEMENT, worldTop: 4 });
        const n = high && r() < 0.5 ? 3 : 2;
        const cell = 13.2 / n;
        for (let a = 0; a < n; a++) {
          for (let b = 0; b < n; b++) {
            const x = cx - 6.6 + (a + 0.5) * cell;
            const z = cz - 6.6 + (b + 0.5) * cell;
            const w = (cell - 1.3) * (0.85 + r() * 0.15);
            const d = (cell - 1.3) * (0.85 + r() * 0.15);
            const floors = 1 + Math.floor(r() * (r() < 0.2 ? 5 : 3));
            const tone = pick(floors > 3 ? APT_TONES : HOUSE_TONES);
            at("res", x, z).box(x, SW, z, w, floors, d, { color: tone, top: ROOF, facade: { su: F, sv: F, u0: u0() } });
            if (r() < 0.3) at("plain", x, z).proto(P.hip, 0xb4583a, x, SW + floors, z, w * 1.1, 0.95, d * 1.1);
          }
        }
        if (high) for (let k = 0; k < 2; k++) trees.push({ kind: "rain", x: cx + (r() - 0.5) * 16, z: cz + (r() < 0.5 ? -8.4 : 8.4), y: SW, s: 0.7 + r() * 0.3 });
      }
    }
  }

  // ---- metro viaduct and station over the z = -72 road ----------------------------------------
  {
    const p = at("plain", 0, METRO_Z);
    for (let x = -132; x <= 132; x += 24) {
      if (Math.abs(x - 12) < 1) continue;
      p.proto(P.cyl, 0xd8d2c8, x, 0, METRO_Z, 1.3, METRO_Y, 1.3);
      p.box(x, METRO_Y - 0.6, METRO_Z, 1.5, 0.6, 3.9, { color: 0xd0c9bd });
    }
    p.box(0, METRO_Y, METRO_Z, SPAN, 0.9, 3.5, { color: 0xe2dccf, top: 0xb9b4ab });
    for (const s of [-1, 1]) {
      p.box(0, METRO_Y + 0.9, METRO_Z + s * 1.66, SPAN, 0.45, 0.16, { color: 0xd6cfc2 });
      p.box(0, METRO_Y + 0.9, METRO_Z + s * 0.85, SPAN, 0.06, 0.9, { color: 0x8e8a84 });
    }
    // Station: a wide deck on columns, a curved roof, stairs down to both footpaths.
    const sx = 12;
    p.box(sx, METRO_Y - 0.2, METRO_Z, 14, 1.1, 8, { color: 0xe8e3da, top: 0xcfc9bf });
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) p.proto(P.cyl, 0xd8d2c8, sx + k * 4.5, 0, METRO_Z + s * 4.6, 1.1, METRO_Y - 0.2, 1.1);
      p.box(sx, METRO_Y + 0.9, METRO_Z + s * 3.6, 14, 0.9, 0.12, { color: 0xbfd0da });
      for (const k of [-6.6, -2.2, 2.2, 6.6]) p.proto(P.pole, 0xe0dcd4, sx + k, METRO_Y + 0.9, METRO_Z + s * 3.6, 0.2, 2.6, 0.2);
      const stair = new THREE.BoxGeometry(6.4, 0.3, 1.6).rotateZ(-0.95 * s);
      p.geo(stair, 0xd6d0c4, sx + s * 9.4, METRO_Y / 2 - 0.3, METRO_Z + s * 4.9);
      p.box(sx + s * 11.2, 0, METRO_Z + s * 4.9, 1.8, 0.6, 1.8, { color: 0xd6d0c4 });
    }
    p.proto(P.halfCyl, 0xf2f2f0, sx, METRO_Y + 3.5, METRO_Z, 14.4, 1.4, 8.2);
    p.box(sx, METRO_Y + 0.95, METRO_Z + 4.06, 14, 0.5, 0.06, { color: 0x6b2fa0 });
    signs.push({ tex: signTexture("NAMMA METRO", "#6b2fa0", "#ffffff", opts.anisotropy), x: sx, y: METRO_Y + 0.35, z: METRO_Z + 4.02, w: 4.6, h: 0.7, rot: 0 });
    aoRects.push([sx, METRO_Z + 4.6, 10, 1.4, 0.4], [sx, METRO_Z - 4.6, 10, 1.4, 0.4]);
  }

  // ---- bus shelters on the avenue ----------------------------------------------------------
  for (const x of [-60, -12, 36, 84]) {
    for (const s of [-1, 1]) {
      const z = s * 6.1;
      const p = at("plain", x, z);
      p.box(x, SW + 1.5, z, 2.8, 0.08, 1.1, { color: 0xf0f0ee });
      p.box(x, SW, z + s * 0.5, 2.8, 1.5, 0.05, { color: 0xb8c7cf });
      for (const k of [-1, 1]) p.proto(P.pole, 0x6e7378, x + k * 1.3, SW, z + s * 0.45, 0.08, 1.5, 0.08);
      p.box(x, SW + 0.4, z + s * 0.25, 2.2, 0.08, 0.36, { color: 0x8c6b4f });
    }
  }

  // ---- parked cars along the side streets ---------------------------------------------------
  for (const c of active) {
    if (c === 0) continue;
    for (const axis of ["x", "z"] as const) {
      for (let k = 0; k < active.length - 1; k++) {
        if (r() > 0.4) continue;
        const mid = (active[k]! + active[k + 1]!) / 2;
        const side = sign();
        const along = mid + (r() - 0.5) * 8;
        const off = c + side * 2.55;
        const type = pick(["sedan", "hatch", "hatch", "suv", "auto"] as const);
        const rot = (axis === "x" ? 0 : Math.PI / 2) + (r() < 0.5 ? Math.PI : 0);
        parked.push(axis === "x" ? { type, x: along, z: off, rot, color: pick(CAR_COLORS) } : { type, x: off, z: along, rot, color: pick(CAR_COLORS) });
      }
    }
  }

  // ---- materials and static meshes ----------------------------------------------------------
  const facades = facadeTextures(opts.anisotropy);
  const asphalt = asphaltTexture(opts.anisotropy);
  const pavers = paverTexture(opts.anisotropy);
  const grass = grassTexture(opts.anisotropy);
  const ao = groundAoTexture(
    aoRects,
    trees.filter((t) => t.kind !== "palm").map((t) => [t.x, t.z, 1.1 * t.s, 0.35]),
    high ? 2048 : 1024,
  );
  ao.channel = 1;
  textures.push(facades.glass, facades.office, facades.res, facades.shop, asphalt, pavers, grass, ao);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const materials: Record<Kind, THREE.Material> = {
    glass: std({ map: facades.glass, roughness: 0.2, metalness: 0.5, envMapIntensity: 1.3 }),
    office: std({ map: facades.office, roughness: 0.6, metalness: 0.05 }),
    res: std({ map: facades.res, roughness: 0.88 }),
    shop: std({ map: facades.shop, roughness: 0.7 }),
    plain: std({ roughness: 0.82 }),
    pavers: std({ map: pavers, aoMap: ao, roughness: 0.95 }),
    asphalt: std({ map: asphalt, aoMap: ao, roughness: 0.92 }),
    grass: std({ map: grass, aoMap: ao, roughness: 1 }),
    water: std({ color: 0x86b2c6, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.6 }),
  };
  const ground = new Set<Kind>(["pavers", "asphalt", "grass", "water"]);
  for (const mesh of batches.meshes(materials, (k) => ({ cast: !ground.has(k), receive: true }))) world.add(mesh);
  const groundMesh = new THREE.Mesh(groundB.build(), std({ aoMap: ao, roughness: 1 }));
  groundMesh.receiveShadow = true;
  groundMesh.matrixAutoUpdate = false;
  world.add(groundMesh);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  /** A static instanced mesh placed from a list; returns it so the caller can tweak it. */
  const instanced = <T>(geo: THREE.BufferGeometry, mat: THREE.Material, list: T[], place: (item: T, d: THREE.Object3D) => number | void) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((item, i) => {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      const tint = place(item, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (typeof tint === "number") mesh.setColorAt(i, color.setHex(tint));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    world.add(mesh);
    return mesh;
  };
  /** Like `instanced`, but one mesh per area of the city so trees out of view aren't drawn. */
  const instancedByArea = <T extends { x: number; z: number }>(geo: THREE.BufferGeometry, mat: THREE.Material, list: T[], place: (item: T, d: THREE.Object3D) => number | void) => {
    const groups = new Map<number, T[]>();
    for (const item of list) {
      const k = chunkOf(item.x, item.z);
      const g = groups.get(k);
      if (g) g.push(item);
      else groups.set(k, [item]);
    }
    for (const g of groups.values()) instanced(geo, mat, g, place);
  };
  const vertexMat = std({ roughness: 0.6, metalness: 0.1 });

  // Lane markings, stop lines and zebra crossings: one stretched quad per stripe.
  const marks: Array<{ x: number; z: number; sx: number; sz: number; yellow?: boolean }> = [];
  const nearCrossing = (v: number, pad: number) => ROADS.some((c) => Math.abs(v - c) < roadWidth(c) / 2 + pad);
  for (const c of ROADS) {
    for (let s = -SPAN / 2 + 2; s < SPAN / 2 - 2; s += 4) {
      if (nearCrossing(s, 2.8)) continue;
      for (const o of c === 0 ? [-2.2, 2.2] : [0]) marks.push({ x: s, z: c + o, sx: 1.8, sz: 0.13 }, { x: c + o, z: s, sx: 0.13, sz: 1.8 });
      if (c === 0) {
        for (const o of [-0.12, 0.12]) marks.push({ x: s, z: o, sx: 4, sz: 0.09, yellow: true }, { x: o, z: s, sx: 0.09, sz: 4, yellow: true });
      }
    }
  }
  for (const X of active) {
    for (const Z of active) {
      for (const side of [-1, 1]) {
        const ox = X + side * (roadWidth(X) / 2 + 1.2);
        for (let o = -roadWidth(Z) / 2 + 0.5; o <= roadWidth(Z) / 2 - 0.4; o += 0.75) marks.push({ x: ox, z: Z + o, sx: 1.6, sz: 0.4 });
        const oz = Z + side * (roadWidth(Z) / 2 + 1.2);
        for (let o = -roadWidth(X) / 2 + 0.5; o <= roadWidth(X) / 2 - 0.4; o += 0.75) marks.push({ x: X + o, z: oz, sx: 0.4, sz: 1.6 });
        // Stop lines across the lanes that arrive at this junction.
        const sx = X + side * (roadWidth(X) / 2 + 2.3);
        marks.push({ x: sx, z: Z + side * (roadWidth(Z) / 4), sx: 0.3, sz: roadWidth(Z) / 2 - 0.3 });
        const sz = Z + side * (roadWidth(Z) / 2 + 2.3);
        marks.push({ x: X - side * (roadWidth(X) / 4), z: sz, sx: roadWidth(X) / 2 - 0.3, sz: 0.3 });
      }
    }
  }
  const markMesh = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), marks, (m, d) => {
    d.position.set(m.x, 0.03, m.z);
    d.scale.set(m.sx, 1, m.sz);
    return m.yellow ? 0xe8b23a : 0xf4f1ea;
  });
  markMesh.castShadow = false;

  // Street lights.
  const lampGeo = model((b) => {
    b.proto(P.pole, 0x4f5459, 0, 0, 0, 0.13, 4.4, 0.13);
    b.box(0.55, 4.25, 0, 1.1, 0.07, 0.07, { color: 0x4f5459 });
    b.box(1.1, 4.12, 0, 0.55, 0.14, 0.24, { color: 0xc9cdd1, top: 0x5a5f64 });
  });
  instancedByArea(lampGeo, vertexMat, lamps, (l, d) => {
    d.position.set(l.x, SW, l.z);
    d.rotation.y = l.rot;
  });

  // Signal poles at two corners of each junction, with a lamp facing each road.
  const signalPoles: Array<{ x: number; z: number }> = [];
  const signalLamps: Array<{ x: number; y: number; z: number; ix: Intersection; axis: "x" | "z" }> = [];
  for (const ix of intersections.values()) {
    const ox = roadWidth(ix.x) / 2 + 0.5;
    const oz = roadWidth(ix.z) / 2 + 0.5;
    for (const s of [-1, 1]) {
      const x = ix.x + s * ox;
      const z = ix.z + s * oz;
      signalPoles.push({ x, z });
      signalLamps.push({ x: x - s * 0.18, y: SW + 3.35, z, ix, axis: "x" }, { x, y: SW + 3.35, z: z - s * 0.18, ix, axis: "z" });
    }
  }
  const poleGeo = model((b) => {
    b.proto(P.pole, 0x34373b, 0, 0, 0, 0.12, 3.6, 0.12);
    b.box(0, 3.0, 0, 0.32, 0.72, 0.32, { color: 0x222426 });
  });
  instanced(poleGeo, vertexMat, signalPoles, (s, d) => {
    d.position.set(s.x, SW, s.z);
  });
  const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), signalLamps.length);
  signalLamps.forEach((l, i) => {
    dummy.position.set(l.x, l.y, l.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampMesh.setMatrixAt(i, dummy.matrix);
    lampMesh.setColorAt(i, color.setHex(0xe74c3c));
  });
  lampMesh.matrixAutoUpdate = false;
  world.add(lampMesh);
  const lightColors = { green: new THREE.Color(0x2ecc71), amber: new THREE.Color(0xf5a623), red: new THREE.Color(0xe74c3c) };
  const lampState: string[] = signalLamps.map(() => "");

  // Trees: one shared trunk mesh, then a canopy mesh per kind.
  const trunked = trees.filter((t) => t.kind !== "palm");
  instancedByArea(trunkGeo(), new THREE.MeshStandardMaterial({ color: 0x6b5340, roughness: 0.9 }), trunked, (t, d) => {
    d.position.set(t.x, t.y, t.z);
    d.scale.set(t.s, t.s * (t.kind === "column" ? 0.8 : 1), t.s);
  });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const canopy = canopyGeo();
  instancedByArea(canopy, leafMat, trees.filter((t) => t.kind === "rain"), (t, d) => {
    d.position.set(t.x, t.y, t.z);
    d.rotation.y = r() * Math.PI * 2;
    d.scale.set(t.s * 1.35, t.s, t.s * 1.35);
    return pick(LEAVES);
  });
  instancedByArea(canopy, leafMat, trees.filter((t) => t.kind === "bloom"), (t, d) => {
    d.position.set(t.x, t.y, t.z);
    d.rotation.y = r() * Math.PI * 2;
    d.scale.set(t.s * 1.2, t.s, t.s * 1.2);
    return pick(BLOOMS);
  });
  instancedByArea(columnTreeGeo(), leafMat, trees.filter((t) => t.kind === "column"), (t, d) => {
    d.position.set(t.x, t.y, t.z);
    d.scale.setScalar(t.s);
    return pick([0x3f6b35, 0x4a7a3c, 0x45703a]);
  });
  instancedByArea(palmGeo(), vertexMat, trees.filter((t) => t.kind === "palm"), (t, d) => {
    d.position.set(t.x, t.y, t.z);
    d.rotation.y = r() * Math.PI * 2;
    d.scale.setScalar(t.s);
  });

  // Parked vehicles (static, so they keep their real shadows).
  const parkedGeos: Record<Parked["type"], THREE.BufferGeometry> = {
    sedan: sedanGeo(),
    hatch: hatchGeo(),
    suv: suvGeo(),
    auto: autoGeo(),
    police: policeGeo(),
    ambulance: ambulanceGeo(),
  };
  for (const type of Object.keys(parkedGeos) as Array<Parked["type"]>) {
    instanced(parkedGeos[type], vertexMat, parked.filter((v) => v.type === type), (v, d) => {
      d.position.set(v.x, v.type === "police" || v.type === "ambulance" ? SW : 0.02, v.z);
      d.rotation.y = v.rot;
      return v.type === "auto" || v.type === "police" || v.type === "ambulance" ? 0xffffff : v.color;
    });
  }

  // Sign boards.
  for (const s of signs) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshStandardMaterial({ map: s.tex, roughness: 0.6 }));
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.rot;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    world.add(mesh);
    textures.push(s.tex);
  }

  // ---- moving things -------------------------------------------------------------------------
  const blobTex = blobTexture();
  textures.push(blobTex);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTex, transparent: true, opacity: 0.32, depthWrite: false });
  const types: VehicleType[] = [
    { geo: sedanGeo(), length: 2.2, width: 0.95, speed: 7.2, colors: CAR_COLORS, weight: 0.28 },
    { geo: hatchGeo(), length: 1.85, width: 0.9, speed: 6.8, colors: CAR_COLORS, weight: 0.22 },
    { geo: suvGeo(), length: 2.3, width: 1.0, speed: 7, colors: CAR_COLORS, weight: 0.12 },
    { geo: autoGeo(), length: 1.55, width: 0.95, speed: 5.4, colors: [0xffffff], weight: 0.16 },
    { geo: bikeGeo(), length: 0.95, width: 0.35, speed: 6.6, colors: CLOTHES, weight: 0.12 },
    { geo: busGeo(), length: 5.0, width: 1.3, speed: 5.6, colors: BUS_COLORS, weight: 0.06 },
    { geo: truckGeo(), length: 3.9, width: 1.16, speed: 5.0, colors: [0xffffff, 0xf3efe6], weight: 0.04 },
  ];
  const traffic = new Traffic(types, ROADS, roadWidth, intersections, {
    loop: LOOP,
    perLane: high ? 6 : 3.5,
    rand: r,
    material: std({ roughness: 0.4, metalness: 0.25, envMapIntensity: 1.1 }),
    blobMaterial: blobMat,
  });
  for (const m of traffic.meshes) {
    m.receiveShadow = true;
    world.add(m);
  }
  world.add(traffic.blobs);

  // People walking round the blocks on the footpaths.
  const peds: Array<{ f: (typeof footpaths)[number]; t: number; speed: number; inset: number }> = [];
  for (const f of footpaths) {
    const n = high ? 3 + Math.floor(r() * 3) : 2;
    for (let k = 0; k < n; k++) peds.push({ f, t: r(), speed: (0.5 + r() * 0.4) * sign(), inset: (r() - 0.5) * 0.3 });
  }
  const pedBody = new THREE.InstancedMesh(
    model((b) => {
      b.box(0, 0, 0, 0.16, 0.36, 0.14, { color: 0x3a3f4a });
      b.proto(P.cyl, 0xffffff, 0, 0.34, 0, 0.24, 0.38, 0.2);
    }),
    std({ roughness: 0.9 }),
    peds.length,
  );
  const pedHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6).translate(0, 0.82, 0), new THREE.MeshStandardMaterial({ color: 0x9c6b4a, roughness: 0.8 }), peds.length);
  const pedBlobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), blobMat, peds.length);
  for (const m of [pedBody, pedHead, pedBlobs]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    world.add(m);
  }
  peds.forEach((_, i) => pedBody.setColorAt(i, color.setHex(pick(CLOTHES))));
  const pedAt = (p: (typeof peds)[number], out: THREE.Vector3) => {
    const x0 = p.f.x0 + p.inset;
    const x1 = p.f.x1 - p.inset;
    const z0 = p.f.z0 + p.inset;
    const z1 = p.f.z1 - p.inset;
    const w = x1 - x0;
    const d = z1 - z0;
    let s = (((p.t % 1) + 1) % 1) * 2 * (w + d);
    if (s < w) return out.set(x0 + s, SW, z0);
    s -= w;
    if (s < d) return out.set(x1, SW, z0 + s);
    s -= d;
    if (s < w) return out.set(x1 - s, SW, z1);
    return out.set(x0, SW, z1 - (s - w));
  };

  // Metro trains on the viaduct.
  const tGeo = trainGeo();
  const tMat = std({ roughness: 0.35, metalness: 0.3 });
  const trains = [1, -1].map((dir, k) => {
    const mesh = new THREE.Mesh(tGeo, tMat);
    mesh.position.set(0, METRO_Y + 0.96, METRO_Z + (dir > 0 ? -0.85 : 0.85));
    mesh.receiveShadow = true;
    world.add(mesh);
    return { mesh, dir, phase: k * 120 };
  });

  // The crane's jib turns slowly back and forth.
  let crane: THREE.Mesh | null = null;
  if (craneAt) {
    crane = new THREE.Mesh(
      model((b) => {
        b.box(4, 0, 0, 17, 0.55, 0.55, { color: 0xf2b91c });
        b.box(-3.2, -0.6, 0, 2.2, 1.2, 1.2, { color: 0xb3ada3 });
        b.box(0, 0.55, 0, 0.5, 2.4, 0.5, { color: 0xf2b91c });
        b.box(0.6, -1.4, 0.7, 1.1, 1.0, 0.9, { color: 0xf2b91c });
        b.box(9, -5.6, 0, 0.04, 5.6, 0.04, { color: 0x333333 });
        b.box(9, -5.9, 0, 0.5, 0.3, 0.5, { color: 0xd23b30 });
      }),
      vertexMat,
    );
    crane.position.set(craneAt[0], SW + 21, craneAt[1]);
    world.add(crane);
  }

  const v = new THREE.Vector3();
  return {
    update(time: number, dt: number) {
      traffic.update(time, dt);
      signalLamps.forEach((l, i) => {
        const state = signalState(l.ix, l.axis, time);
        if (state !== lampState[i]) {
          lampState[i] = state;
          lampMesh.setColorAt(i, lightColors[state]);
          lampMesh.instanceColor!.needsUpdate = true;
        }
      });
      peds.forEach((p, i) => {
        p.t += (p.speed * dt) / (2 * (p.f.x1 - p.f.x0 + p.f.z1 - p.f.z0));
        pedAt(p, v);
        dummy.position.set(v.x, v.y + Math.abs(Math.sin(time * 7 + i)) * 0.025, v.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pedBody.setMatrixAt(i, dummy.matrix);
        pedHead.setMatrixAt(i, dummy.matrix);
        dummy.position.y = SW + 0.02;
        dummy.updateMatrix();
        pedBlobs.setMatrixAt(i, dummy.matrix);
      });
      pedBody.instanceMatrix.needsUpdate = true;
      pedHead.instanceMatrix.needsUpdate = true;
      pedBlobs.instanceMatrix.needsUpdate = true;
      for (const t of trains) t.mesh.position.x = ((((t.phase + time * 8 * t.dir) % 300) + 300) % 300) - 150;
      if (crane) crane.rotation.y = Math.sin(time * 0.1) * 1.3 + 0.6;
    },
    dispose() {
      textures.forEach((t) => t.dispose());
    },
  };
}
