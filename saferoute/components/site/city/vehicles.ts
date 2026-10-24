import * as THREE from "three";
import { model, type MeshBuilder, type Rand } from "./builder";

/**
 * Vehicle models and the traffic that drives them. Models face +x and stand on y = 0;
 * parts painted white take each instance's colour. Traffic keeps to the left, follows
 * the car in front (a simple intelligent-driver model) and stops at red lights.
 */

const WHITE = 0xffffff;
const GLASS = 0x2a333c;
const TYRE = 0x1c1c1e;
const RIM = 0xc4c8cc;
const HEAD = 0xf6f3ea;
const TAIL = 0xc2362b;
const DARK = 0x2b2d30;

/** Extrudes a side profile (x along the vehicle, y up) to the given width, centred on z = 0. */
function profile(points: Array<[number, number]>, width: number, bevel = 0.035) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  return g;
}

function wheels(b: MeshBuilder, xs: number[], z: number, r: number, w = 0.16) {
  for (const x of xs) {
    for (const s of [-1, 1]) {
      b.geo(new THREE.CylinderGeometry(r, r, w, 10).rotateX(Math.PI / 2), TYRE, x, r, s * z);
      b.geo(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 7).rotateX(Math.PI / 2), RIM, x, r, s * z);
    }
  }
}

function lights(b: MeshBuilder, front: number, back: number, y: number, z: number) {
  for (const s of [-1, 1]) {
    b.box(front, y - 0.045, s * z, 0.05, 0.09, 0.2, { color: HEAD });
    b.box(back, y - 0.045, s * z, 0.05, 0.09, 0.18, { color: TAIL });
  }
}

function mirrors(b: MeshBuilder, x: number, y: number, z: number, color = WHITE) {
  for (const s of [-1, 1]) b.box(x, y, s * z, 0.1, 0.06, 0.1, { color });
}

export function sedanGeo(body = WHITE) {
  return model((b) => {
    b.geo(profile([[-1.06, 0.2], [1.02, 0.2], [1.08, 0.32], [1.05, 0.5], [0.5, 0.6], [-0.9, 0.62], [-1.07, 0.52], [-1.08, 0.3]], 0.94), body);
    b.geo(profile([[-0.78, 0.6], [0.46, 0.6], [0.14, 0.93], [-0.6, 0.93]], 0.82, 0.02), GLASS);
    b.box(-0.23, 0.93, 0, 0.76, 0.05, 0.78, { color: body });
    b.box(1.07, 0.27, 0, 0.04, 0.08, 0.42, { color: DARK });
    lights(b, 1.07, -1.09, 0.45, 0.3);
    mirrors(b, 0.42, 0.62, 0.5, body);
    wheels(b, [0.66, -0.68], 0.4, 0.21);
  });
}

export function hatchGeo(body = WHITE) {
  return model((b) => {
    b.geo(profile([[-0.88, 0.2], [0.84, 0.2], [0.9, 0.32], [0.88, 0.5], [0.4, 0.6], [-0.84, 0.64], [-0.9, 0.5], [-0.9, 0.3]], 0.9), body);
    b.geo(profile([[-0.82, 0.62], [0.38, 0.6], [0.08, 0.96], [-0.78, 0.98]], 0.8, 0.02), GLASS);
    b.box(-0.35, 0.96, 0, 0.84, 0.05, 0.76, { color: body });
    lights(b, 0.89, -0.91, 0.46, 0.29);
    mirrors(b, 0.32, 0.62, 0.48, body);
    wheels(b, [0.54, -0.56], 0.38, 0.2);
  });
}

function suvBody(b: MeshBuilder, body: number) {
  b.geo(profile([[-1.12, 0.28], [1.08, 0.28], [1.14, 0.42], [1.12, 0.66], [0.62, 0.74], [-1.1, 0.76], [-1.14, 0.6], [-1.14, 0.36]], 1.0), body);
  b.geo(profile([[-1.06, 0.74], [0.58, 0.74], [0.32, 1.14], [-1.02, 1.16]], 0.9, 0.02), GLASS);
  b.box(-0.35, 1.15, 0, 1.38, 0.06, 0.86, { color: body });
  b.box(1.13, 0.4, 0, 0.04, 0.16, 0.5, { color: DARK });
  lights(b, 1.13, -1.15, 0.6, 0.33);
  mirrors(b, 0.52, 0.78, 0.54, body);
  wheels(b, [0.7, -0.72], 0.44, 0.26, 0.18);
}

export function suvGeo(body = WHITE) {
  return model((b) => {
    suvBody(b, body);
    for (const s of [-1, 1]) b.box(-0.35, 1.21, s * 0.36, 1.2, 0.04, 0.05, { color: DARK });
  });
}

/** Karnataka police jeep: white with a blue band and a red/blue light bar. */
export function policeGeo() {
  return model((b) => {
    suvBody(b, 0xf4f4f2);
    for (const s of [-1, 1]) b.box(0, 0.48, s * 0.505, 2.1, 0.1, 0.02, { color: 0x24479a });
    b.box(-0.2, 1.21, -0.2, 0.3, 0.1, 0.36, { color: 0xd82a2a });
    b.box(-0.2, 1.21, 0.2, 0.3, 0.1, 0.36, { color: 0x2a5bd8 });
  });
}

/** Ambulance van: white, red band, light bar. */
export function ambulanceGeo() {
  return model((b) => {
    b.geo(profile([[-1.2, 0.26], [1.15, 0.26], [1.2, 0.42], [1.18, 0.7], [0.72, 0.86], [0.5, 1.5], [-1.2, 1.52]], 1.06), 0xf7f7f5);
    b.geo(profile([[0.66, 0.9], [0.86, 0.9], [0.62, 1.38], [0.52, 1.38]], 1.0, 0.02), GLASS);
    for (const s of [-1, 1]) b.box(-0.2, 0.62, s * 0.535, 2.2, 0.16, 0.02, { color: 0xd23b30 });
    b.box(0.3, 1.52, -0.2, 0.3, 0.1, 0.34, { color: 0xd82a2a });
    b.box(0.3, 1.52, 0.2, 0.3, 0.1, 0.34, { color: 0x2a5bd8 });
    lights(b, 1.19, -1.21, 0.62, 0.36);
    wheels(b, [0.74, -0.74], 0.46, 0.25, 0.18);
  });
}

/** Bengaluru auto rickshaw: green tub, yellow front, black canvas roof. */
export function autoGeo() {
  return model((b) => {
    b.geo(profile([[-0.72, 0.18], [0.5, 0.18], [0.74, 0.32], [0.76, 0.68], [0.6, 0.7], [0.48, 0.44], [-0.72, 0.44]], 0.9), 0x2f8f4e);
    b.box(0.62, 0.68, 0, 0.16, 0.08, 0.62, { color: 0xf2c12e });
    b.box(0.56, 0.7, 0, 0.04, 0.36, 0.74, { color: GLASS });
    b.box(-0.1, 0.44, 0, 1.2, 0.12, 0.9, { color: 0xf2c12e });
    b.geo(new THREE.CylinderGeometry(0.47, 0.47, 1.2, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.8, 1), 0x232425, -0.12, 0.7, 0);
    for (const s of [-1, 1]) b.box(-0.68, 0.44, s * 0.4, 0.06, 0.62, 0.06, { color: 0x232425 });
    b.box(0.78, 0.52, 0, 0.04, 0.1, 0.14, { color: HEAD });
    b.geo(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12).rotateX(Math.PI / 2), TYRE, 0.6, 0.17, 0);
    for (const s of [-1, 1]) b.geo(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12).rotateX(Math.PI / 2), TYRE, -0.45, 0.17, s * 0.47);
  });
}

/** BMTC bus: body takes the instance colour, dark window band, amber destination board. */
export function busGeo() {
  return model((b) => {
    b.geo(profile([[-2.45, 0.32], [2.4, 0.32], [2.48, 0.5], [2.48, 1.62], [2.36, 1.7], [-2.45, 1.7]], 1.3, 0.05), WHITE);
    for (const s of [-1, 1]) b.box(-0.05, 0.98, s * 0.655, 4.6, 0.5, 0.02, { color: GLASS });
    b.box(2.49, 0.86, 0, 0.03, 0.66, 1.1, { color: GLASS });
    b.box(2.49, 1.52, 0, 0.03, 0.14, 0.8, { color: 0xffb020 });
    b.box(-0.6, 1.7, 0, 1.6, 0.18, 0.9, { color: 0xdcdcdc });
    b.box(0, 0.26, 0, 4.9, 0.12, 1.32, { color: DARK });
    lights(b, 2.49, -2.46, 0.58, 0.48);
    wheels(b, [1.55, -1.5], 0.58, 0.3, 0.2);
  });
}

/** Indian goods truck: orange cab, green tarpaulin over the load. */
export function truckGeo() {
  return model((b) => {
    b.box(1.45, 0.32, 0, 0.95, 1.05, 1.12, { color: 0xe4572e });
    b.box(1.93, 0.86, 0, 0.03, 0.4, 0.96, { color: GLASS });
    b.box(-0.45, 0.42, 0, 2.7, 0.62, 1.16, { color: 0x8a5a3a });
    b.box(-0.45, 1.04, 0, 2.7, 0.5, 1.16, { color: 0x4f7a3a });
    b.geo(new THREE.CylinderGeometry(0.58, 0.58, 2.7, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.35, 1), 0x4f7a3a, -0.45, 1.54, 0);
    b.box(0.05, 0.22, 0, 3.8, 0.12, 1.0, { color: DARK });
    lights(b, 1.93, -1.81, 0.55, 0.45);
    wheels(b, [1.35, -1.0, -1.6], 0.55, 0.28, 0.2);
  });
}

/** Scooter with a rider; the rider's shirt takes the instance colour. */
export function bikeGeo() {
  return model((b) => {
    b.box(0, 0.25, 0, 0.82, 0.24, 0.22, { color: 0x3a4250 });
    b.box(-0.12, 0.49, 0, 0.4, 0.08, 0.24, { color: 0x222222 });
    b.box(0.34, 0.4, 0, 0.08, 0.46, 0.3, { color: 0x3a4250 });
    b.box(0.36, 0.84, 0, 0.04, 0.04, 0.5, { color: 0x222222 });
    b.geo(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 12).rotateX(Math.PI / 2), TYRE, 0.33, 0.17, 0);
    b.geo(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 12).rotateX(Math.PI / 2), TYRE, -0.33, 0.17, 0);
    b.box(-0.1, 0.56, 0, 0.26, 0.46, 0.34, { color: WHITE });
    b.box(-0.02, 0.5, 0, 0.36, 0.1, 0.3, { color: 0x34495e });
    b.geo(new THREE.SphereGeometry(0.13, 12, 8), 0x2b2b2b, -0.04, 1.14, 0);
  });
}

export function trainGeo() {
  return model((b) => {
    const len = 5.6;
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * (len + 0.25);
      b.box(x, 0, 0, len, 1.55, 1.34, { color: 0xf1eff4, top: 0xc9c5cf });
      for (const s of [-1, 1]) {
        b.box(x, 0.3, s * 0.675, len, 0.24, 0.02, { color: 0x6b2fa0 });
        b.box(x, 0.72, s * 0.675, len - 0.7, 0.5, 0.02, { color: GLASS });
      }
      b.box(x, 1.55, 0, len - 1.4, 0.14, 0.8, { color: 0xd4d1d8 });
    }
    for (const s of [-1, 1]) {
      const nose = s * (1.5 * len + 0.25);
      b.box(nose, 0.72, 0, 0.04, 0.5, 1.1, { color: GLASS });
    }
  });
}

// ---------------------------------------------------------------- traffic

export interface VehicleType {
  geo: THREE.BufferGeometry;
  length: number;
  width: number;
  /** Desired speed, units per second. */
  speed: number;
  colors: number[];
  weight: number;
}

export interface Intersection {
  x: number;
  z: number;
  /** Seconds into the signal cycle at time 0. */
  offset: number;
}

type Light = "green" | "amber" | "red";

/** 20 s cycle: east-west green, amber, all-red, then north-south the same. */
const CYCLE = 20;
export function signalState(ix: Intersection, axis: "x" | "z", time: number): Light {
  const t = (((time + ix.offset) % CYCLE) + CYCLE) % CYCLE;
  const local = axis === "x" ? t : (t + CYCLE / 2) % CYCLE;
  return local < 7 ? "green" : local < 8.5 ? "amber" : "red";
}

interface Lane {
  axis: "x" | "z";
  /** Road centre line. */
  c: number;
  dir: 1 | -1;
  /** Distance from the road centre to the lane centre (traffic keeps left). */
  off: number;
  /** Stop lines ahead, as progress values, with the junction each belongs to. */
  stops: Array<{ p: number; ix: Intersection }>;
  cars: Car[];
}

interface Car {
  type: number;
  slot: number;
  p: number;
  v: number;
  v0: number;
}

const S0 = 1.1; // minimum gap, units
const HEADWAY = 0.9; // seconds
const ACCEL = 2.4;
const BRAKE = 3.6;

export class Traffic {
  readonly meshes: THREE.InstancedMesh[];
  readonly blobs: THREE.InstancedMesh;
  private lanes: Lane[] = [];
  private dummy = new THREE.Object3D();
  private loop: number;
  private types: VehicleType[];

  constructor(
    types: VehicleType[],
    roads: number[],
    roadWidth: (c: number) => number,
    intersections: Map<string, Intersection>,
    opts: { loop: number; perLane: number; rand: Rand; material: THREE.Material; blobMaterial: THREE.Material },
  ) {
    const { loop, rand } = opts;
    this.loop = loop;
    const counts = types.map(() => 0);
    const active = roads.filter((c) => Math.abs(c) <= 96);
    for (const axis of ["x", "z"] as const) {
      for (const c of active) {
        const offs = roadWidth(c) > 7 ? [1.15, 3.3] : [1.5];
        for (const dir of [1, -1] as const) {
          for (const off of offs) {
            const stops = active
              .map((c2) => {
                const ix = intersections.get(axis === "x" ? `${c2},${c}` : `${c},${c2}`)!;
                // Progress p runs along the direction of travel; world position = dir * (p - loop / 2).
                const p = dir * c2 + loop / 2 - (roadWidth(c2) / 2 + 2.4);
                return { p, ix };
              })
              .sort((a, b) => a.p - b.p);
            const lane: Lane = { axis, c, dir, off, stops, cars: [] };
            const n = Math.max(2, Math.round(opts.perLane * (c === 0 ? 1.3 : 1) * (0.7 + rand() * 0.6)));
            for (let k = 0; k < n; k++) {
              let roll = rand() * types.reduce((s, t) => s + t.weight, 0);
              let type = 0;
              while (type < types.length - 1 && roll > types[type]!.weight) roll -= types[type++]!.weight;
              // Big vehicles stay in the inner lane of the avenue, two-wheelers favour the outer one.
              if (off > 3 && types[type]!.length > 3) type = 0;
              const t = types[type]!;
              const v0 = t.speed * (0.85 + rand() * 0.3);
              lane.cars.push({ type, slot: counts[type]!++, p: ((k + rand() * 0.5) * loop) / n, v: v0 * 0.7, v0 });
            }
            this.lanes.push(lane);
          }
        }
      }
    }
    this.meshes = types.map((t, i) => {
      const mesh = new THREE.InstancedMesh(t.geo, opts.material, Math.max(1, counts[i]!));
      mesh.count = counts[i]!;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      return mesh;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), opts.blobMaterial, Math.max(1, total));
    this.blobs.count = total;
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    const color = new THREE.Color();
    for (const lane of this.lanes) {
      for (const car of lane.cars) {
        const t = types[car.type]!;
        this.meshes[car.type]!.setColorAt(car.slot, color.setHex(t.colors[Math.floor(rand() * t.colors.length)]!));
      }
    }
    this.types = types;
  }

  update(time: number, dt: number) {
    const L = this.loop;
    const d = this.dummy;
    let blob = 0;
    for (const lane of this.lanes) {
      const cars = lane.cars;
      const n = cars.length;
      for (let i = 0; i < n; i++) {
        const car = cars[i]!;
        const t = this.types[car.type]!;
        const lead = cars[(i + 1) % n]!;
        const lt = this.types[lead.type]!;
        let gap = n > 1 ? ((((lead.p - car.p) % L) + L) % L) - (lt.length + t.length) / 2 : L;
        let dv = car.v - (n > 1 ? lead.v : car.v);
        const front = car.p + t.length / 2;
        // The nearest stop line ahead whose light says stop (and that we can still stop for).
        for (const stop of lane.stops) {
          const ahead = (((stop.p - front) % L) + L) % L;
          if (ahead > 45) continue;
          const light = signalState(stop.ix, lane.axis, time);
          if (light === "green") continue;
          if (light === "amber" && ahead < (car.v * car.v) / (2 * BRAKE) + 0.4) continue;
          if (ahead < 0.3 && car.v > 0.5) continue;
          if (ahead < gap) {
            gap = ahead;
            dv = car.v;
          }
          break;
        }
        const sStar = S0 + car.v * HEADWAY + (car.v * dv) / (2 * Math.sqrt(ACCEL * BRAKE));
        const acc = ACCEL * (1 - (car.v / car.v0) ** 4 - (sStar / Math.max(gap, 0.05)) ** 2);
        car.v = Math.max(0, Math.min(car.v0 * 1.05, car.v + acc * dt));
        car.p = (car.p + car.v * dt) % L;

        const s = lane.dir * (car.p - L / 2);
        if (lane.axis === "x") {
          d.position.set(s, 0.02, lane.c - lane.dir * lane.off);
          d.rotation.set(0, lane.dir > 0 ? 0 : Math.PI, 0);
        } else {
          d.position.set(lane.c + lane.dir * lane.off, 0.02, s);
          d.rotation.set(0, lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        }
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        this.meshes[car.type]!.setMatrixAt(car.slot, d.matrix);
        d.position.y = 0.045;
        d.scale.set(t.length * 1.12, 1, t.width * 1.5);
        d.updateMatrix();
        this.blobs.setMatrixAt(blob++, d.matrix);
      }
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    this.blobs.instanceMatrix.needsUpdate = true;
  }
}
