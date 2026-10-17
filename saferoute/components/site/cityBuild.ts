import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Detailed low-poly Bengaluru-ish city for the about page: textured buildings with
 * rooftop water tanks, street trees, a park, a domed landmark, an elevated metro,
 * and traffic (cars, autos, BMTC buses, scooters) plus pedestrians that keep moving.
 * Static geometry is merged into a handful of meshes; moving things are instanced.
 */

/** Road centres on both axes; 0 is the wide avenue. */
export const ROADS = [-120, -96, -72, -48, -24, 0, 24, 48, 72, 96, 120];
const ROAD_W = 6;
const AVENUE_W = 9;
export const roadWidth = (c: number) => (c === 0 ? AVENUE_W : ROAD_W);

const SPAN = 280; // road length
const LOOP = 264; // distance a vehicle travels before wrapping round
const SW = 0.15; // sidewalk height
const TILE = 4; // the window texture covers 4 bays x 4 floors (1 unit each)
const METRO_Z = -72;
const METRO_Y = 8;

const PAVEMENT = 0xd9d1c3;
const GRASS = 0x9dbb73;
const SHOP_TONES = [0xf1e4cf, 0xeadbc6, 0xf4ece0];
const GLASS_TONES = [0xdfe7ee, 0xcfdbe6, 0xeef1f3, 0xd6dee2];
const APT_TONES = [0xf3e9d8, 0xeadbc3, 0xe7d8c4, 0xf7efe2, 0xe9e2d6];
const HOUSE_TONES = [0xf2d7b6, 0xf5e6c8, 0xeac9c0, 0xd9e4c8, 0xf3e1a8, 0xeae6df, 0xcfe0e3];
const AWNINGS = [0xc8553d, 0x2f7d6d, 0xe0a030, 0x3d6fb0, 0x9a4f8f];
const CAR_COLORS = [0xffffff, 0xf2f2f2, 0xb8bcc2, 0x8a9099, 0x2b2d31, 0xb8322b, 0x2f5c9e, 0xd9cdb4];
const BUS_COLORS = [0x3767b5, 0xc8402f, 0x3c8f4f];
const CLOTHES = [0xd24d4d, 0x3d6fb0, 0xe0a030, 0x2f7d6d, 0xf2f2f2, 0x7a4fa0, 0x444a55, 0xe07a9a];

export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function paint(geo: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, hex: number) {
  geo.translate(x, y, z);
  return paint(geo, hex);
}

function merge(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const g = mergeGeometries(flat)!;
  parts.forEach((p) => p.dispose());
  flat.forEach((p) => p.dispose());
  return g;
}

/** A box whose walls tile the window texture one bay/floor per unit; the roof samples plain wall. */
function windowBox(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, u0: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) {
        uv.setXY(i, 0.01, 0.01);
        continue;
      }
      const span = f < 2 ? d : w;
      uv.setXY(i, u0 + (uv.getX(i) * span) / TILE, (uv.getY(i) * h) / TILE);
    }
  }
  return at(g, x, y, z, hex);
}

function windowTexture(kind: "glass" | "res", anisotropy: number) {
  const S = 256;
  const cell = S / TILE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, S, S);
  const r = seeded(kind === "glass" ? 3 : 5);
  for (let row = 0; row < TILE; row++) {
    for (let col = 0; col < TILE; col++) {
      const x = col * cell;
      const y = row * cell;
      if (kind === "glass") {
        ctx.fillStyle = `hsl(205, 24%, ${36 + r() * 20}%)`;
        ctx.fillRect(x + cell * 0.08, y + cell * 0.1, cell * 0.84, cell * 0.8);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x + cell * 0.08, y + cell * 0.1, cell * 0.84, cell * 0.18);
      } else {
        // Sill, then a window that is sometimes lit warm, sometimes curtained.
        ctx.fillStyle = "#d8d0c4";
        ctx.fillRect(x + cell * 0.2, y + cell * 0.72, cell * 0.6, cell * 0.06);
        const v = r();
        ctx.fillStyle = v < 0.15 ? "#e9c88f" : v < 0.3 ? "#9c6b55" : `hsl(210, 12%, ${24 + r() * 18}%)`;
        ctx.fillRect(x + cell * 0.25, y + cell * 0.24, cell * 0.5, cell * 0.46);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(x + cell * 0.49, y + cell * 0.24, cell * 0.02, cell * 0.46);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

type Tree = { x: number; z: number; s: number; y: number };

// ---------------------------------------------------------------- vehicles

function wheel(r: number, w: number, x: number, z: number) {
  return at(new THREE.CylinderGeometry(r, r, w, 12).rotateX(Math.PI / 2), x, r, z, 0x1d1d1f);
}

/** All models face +x. Parts painted white take the per-instance body colour. */
function carGeo() {
  return merge([
    at(new THREE.BoxGeometry(2.0, 0.42, 0.96), 0, 0.4, 0, 0xffffff),
    at(new THREE.BoxGeometry(1.1, 0.36, 0.86), -0.12, 0.79, 0, 0x2e343b),
    at(new THREE.BoxGeometry(1.0, 0.07, 0.8), -0.12, 1.0, 0, 0xffffff),
    at(new THREE.BoxGeometry(0.04, 0.1, 0.22), 1.0, 0.47, 0.3, 0xfff6d8),
    at(new THREE.BoxGeometry(0.04, 0.1, 0.22), 1.0, 0.47, -0.3, 0xfff6d8),
    at(new THREE.BoxGeometry(0.04, 0.1, 0.2), -1.0, 0.47, 0.32, 0xd23a3a),
    at(new THREE.BoxGeometry(0.04, 0.1, 0.2), -1.0, 0.47, -0.32, 0xd23a3a),
    wheel(0.2, 0.14, 0.62, 0.46),
    wheel(0.2, 0.14, 0.62, -0.46),
    wheel(0.2, 0.14, -0.62, 0.46),
    wheel(0.2, 0.14, -0.62, -0.46),
  ]);
}

/** Bengaluru auto: green body, yellow canopy. */
function autoGeo() {
  return merge([
    at(new THREE.BoxGeometry(1.25, 0.4, 0.95), -0.05, 0.4, 0, 0x2f8f4e),
    at(new THREE.BoxGeometry(1.2, 0.5, 0.98), -0.08, 0.95, 0, 0xf2c12e),
    at(new THREE.BoxGeometry(0.3, 0.55, 0.6), 0.66, 0.55, 0, 0x2f8f4e),
    at(new THREE.BoxGeometry(0.05, 0.38, 0.8), 0.53, 0.95, 0, 0x2b3036),
    at(new THREE.BoxGeometry(0.04, 0.1, 0.14), 0.82, 0.62, 0, 0xfff6d8),
    wheel(0.18, 0.1, 0.62, 0),
    wheel(0.18, 0.1, -0.45, 0.46),
    wheel(0.18, 0.1, -0.45, -0.46),
  ]);
}

function busGeo() {
  return merge([
    at(new THREE.BoxGeometry(4.8, 1.2, 1.3), 0, 0.88, 0, 0xffffff),
    at(new THREE.BoxGeometry(4.82, 0.42, 1.32), 0, 1.12, 0, 0x2b3038),
    at(new THREE.BoxGeometry(4.6, 0.1, 1.15), 0, 1.53, 0, 0xe2e2e2),
    at(new THREE.BoxGeometry(0.04, 0.7, 1.1), 2.41, 1.02, 0, 0x2b3038),
    at(new THREE.BoxGeometry(0.04, 0.22, 0.9), 2.41, 1.48, 0, 0xffc04a),
    wheel(0.28, 0.16, 1.6, 0.62),
    wheel(0.28, 0.16, 1.6, -0.62),
    wheel(0.28, 0.16, -1.5, 0.62),
    wheel(0.28, 0.16, -1.5, -0.62),
  ]);
}

function bikeGeo() {
  return merge([
    at(new THREE.BoxGeometry(0.85, 0.26, 0.22), 0, 0.38, 0, 0xffffff),
    at(new THREE.BoxGeometry(0.4, 0.08, 0.24), -0.12, 0.55, 0, 0x222222),
    at(new THREE.BoxGeometry(0.06, 0.4, 0.4), 0.36, 0.62, 0, 0x333333),
    wheel(0.17, 0.07, 0.33, 0),
    wheel(0.17, 0.07, -0.33, 0),
    at(new THREE.BoxGeometry(0.26, 0.46, 0.32), -0.1, 0.84, 0, 0x50586a),
    at(new THREE.SphereGeometry(0.13, 10, 8), -0.04, 1.17, 0, 0x2b2b2b),
  ]);
}

function trainGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const len = 5.2;
  for (let k = 0; k < 3; k++) {
    const x = (k - 1) * (len + 0.3);
    parts.push(
      at(new THREE.BoxGeometry(len, 1.5, 1.3), x, 0.75, 0, 0xeeeaf2),
      at(new THREE.BoxGeometry(len + 0.02, 0.28, 1.32), x, 0.4, 0, 0x6b2fa0),
      at(new THREE.BoxGeometry(len - 0.6, 0.45, 1.32), x, 1.0, 0, 0x2a2d35),
      at(new THREE.BoxGeometry(len - 0.3, 0.12, 1.1), x, 1.56, 0, 0xc9c5cf),
    );
  }
  return merge(parts);
}

type Lane = { axis: "x" | "z"; c: number; off: number; dir: 1 | -1; speed: number };
type Mover = { lane: Lane; phase: number; slot: number };

// ---------------------------------------------------------------- city

export function buildCity(world: THREE.Group, anisotropy: number) {
  const r = seeded(7);
  const pick = <T>(arr: T[]) => arr[Math.floor(r() * arr.length)]!;
  const glassParts: THREE.BufferGeometry[] = [];
  const resParts: THREE.BufferGeometry[] = [];
  const plain: THREE.BufferGeometry[] = [];
  const trees: Tree[] = [];
  const dummy = new THREE.Object3D();
  const textures: THREE.Texture[] = [];

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0xece3d2, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  world.add(ground);

  // Roads
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4a413a, roughness: 0.95 });
  for (const c of ROADS) {
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, roadWidth(c)), asphalt);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, c);
    alongX.receiveShadow = true;
    const alongZ = alongX.clone();
    alongZ.rotation.z = Math.PI / 2;
    alongZ.position.set(c, 0.025, 0);
    world.add(alongX, alongZ);
  }

  // Lane markings and zebra crossings: one instanced unit quad, stretched per stripe.
  const marks: Array<{ x: number; z: number; sx: number; sz: number; yellow?: boolean }> = [];
  const nearCrossing = (v: number, pad: number) => ROADS.some((c) => Math.abs(v - c) < roadWidth(c) / 2 + pad);
  for (const c of ROADS) {
    for (let s = -SPAN / 2 + 2; s < SPAN / 2 - 2; s += 4) {
      if (nearCrossing(s, 2.4)) continue;
      const lines = c === 0 ? [-2.2, 2.2] : [0];
      for (const o of lines) {
        marks.push({ x: s, z: c + o, sx: 1.8, sz: 0.14 }, { x: c + o, z: s, sx: 0.14, sz: 1.8 });
      }
      if (c === 0) {
        marks.push({ x: s, z: -0.12, sx: 4, sz: 0.1, yellow: true }, { x: s, z: 0.12, sx: 4, sz: 0.1, yellow: true });
        marks.push({ x: -0.12, z: s, sx: 0.1, sz: 4, yellow: true }, { x: 0.12, z: s, sx: 0.1, sz: 4, yellow: true });
      }
    }
  }
  for (const X of ROADS) {
    for (const Z of ROADS) {
      if (Math.abs(X) > 96 || Math.abs(Z) > 96) continue;
      for (const side of [-1, 1]) {
        // Crossing over the x-road (at z = Z), just beside the junction.
        const cxp = X + side * (roadWidth(X) / 2 + 1.2);
        for (let o = -roadWidth(Z) / 2 + 0.5; o <= roadWidth(Z) / 2 - 0.4; o += 0.75) marks.push({ x: cxp, z: Z + o, sx: 1.6, sz: 0.4 });
        const czp = Z + side * (roadWidth(Z) / 2 + 1.2);
        for (let o = -roadWidth(X) / 2 + 0.5; o <= roadWidth(X) / 2 - 0.4; o += 0.75) marks.push({ x: X + o, z: czp, sx: 0.4, sz: 1.6 });
      }
    }
  }
  const markMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    marks.length,
  );
  markMesh.receiveShadow = true;
  const white = new THREE.Color(0xf1ece2);
  const yellow = new THREE.Color(0xe8b23a);
  marks.forEach((m, i) => {
    dummy.position.set(m.x, 0.04, m.z);
    dummy.scale.set(m.sx, 1, m.sz);
    dummy.updateMatrix();
    markMesh.setMatrixAt(i, dummy.matrix);
    markMesh.setColorAt(i, m.yellow ? yellow : white);
  });
  world.add(markMesh);

  // Street lights along the safe route's streets.
  const lamps: Array<[number, number]> = [];
  for (let x = -66; x <= 66; x += 8) lamps.push([x, 48 - 4.5], [x, 48 + 4.5]);
  for (let x = -66; x <= 66; x += 24) lamps.push([x, 24 + 4.5]);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
  const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 10, 8), glowMat, lamps.length);
  const poolMesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(3.4, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffb866, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    lamps.length,
  );
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), new THREE.MeshStandardMaterial({ color: 0x5a4a3c }), lamps.length);
  lamps.forEach(([x, z], i) => {
    dummy.scale.set(1, 1, 1);
    dummy.position.set(x, 4.1, z);
    dummy.updateMatrix();
    lampMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.2, z);
    dummy.updateMatrix();
    poolMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 2, z);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
  });
  world.add(poleMesh, lampMesh, poolMesh);

  // Traffic signals at the main junctions.
  const signals: Array<{ x: number; z: number; group: number }> = [];
  for (const X of [-48, 0, 48]) {
    for (const Z of [-48, 0, 48]) {
      const ox = roadWidth(X) / 2 + 0.5;
      const oz = roadWidth(Z) / 2 + 0.5;
      signals.push({ x: X + ox, z: Z + oz, group: 0 }, { x: X - ox, z: Z - oz, group: 1 });
    }
  }
  for (const s of signals) {
    plain.push(
      at(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), s.x, SW + 1.6, s.z, 0x3a3a3c),
      at(new THREE.BoxGeometry(0.32, 0.8, 0.32), s.x, SW + 3.4, s.z, 0x2a2a2c),
    );
  }
  const signalMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.15, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    signals.length * 2,
  );
  signals.forEach((s, i) => {
    for (const k of [0, 1]) {
      // Two lamps per head, one facing each street.
      dummy.position.set(s.x + (k ? 0.17 : 0), SW + 3.45, s.z + (k ? 0 : 0.17));
      dummy.updateMatrix();
      signalMesh.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  });
  world.add(signalMesh);
  const red = new THREE.Color(0xff3b30);
  const green = new THREE.Color(0x34d27a);
  let signalPhase = -1;

  const nearLamp = (x: number, z: number) =>
    lamps.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 1.6) || signals.some((s) => Math.hypot(s.x - x, s.z - z) < 1.6);

  // ---- building kinds
  const roofTanks = (x: number, z: number, w: number, d: number, top: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const tx = x + (r() - 0.5) * (w - 1);
      const tz = z + (r() - 0.5) * (d - 1);
      plain.push(at(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 10), tx, top + 0.3, tz, 0x2c2c2e));
    }
  };

  const parapet = (x: number, z: number, w: number, d: number, top: number, hex: number) => {
    plain.push(at(new THREE.BoxGeometry(w + 0.14, 0.25, d + 0.14), x, top + 0.125, z, hex));
  };

  const awning = (x: number, z: number, w: number, d: number) => {
    const hex = pick(AWNINGS);
    const s = r() < 0.5 ? 1 : -1;
    if (r() < 0.5) plain.push(at(new THREE.BoxGeometry(w * 0.9, 0.08, 0.6), x, SW + 0.95, z + s * (d / 2 + 0.3), hex));
    else plain.push(at(new THREE.BoxGeometry(0.6, 0.08, d * 0.9), x + s * (w / 2 + 0.3), SW + 0.95, z, hex));
  };

  const house = (x: number, z: number, w: number, d: number, h: number) => {
    resParts.push(windowBox(w, h, d, x, SW + h / 2, z, pick(HOUSE_TONES), r()));
    const top = SW + h;
    if (r() < 0.28) {
      // Mangalore-tile hip roof.
      const roof = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(w * 1.08, 0.9, d * 1.08);
      plain.push(at(roof, x, top + 0.45, z, 0xb5532f));
    } else {
      parapet(x, z, w, d, top, 0xd9d0c2);
      roofTanks(x, z, w, d, top, 1);
    }
    if (r() < 0.45) awning(x, z, w, d);
  };

  const apartment = (x: number, z: number, w: number, d: number, h: number, glassy: boolean) => {
    (glassy ? glassParts : resParts).push(windowBox(w, h, d, x, SW + h / 2, z, pick(glassy ? GLASS_TONES : APT_TONES), r()));
    const top = SW + h;
    parapet(x, z, w, d, top, glassy ? 0xbfc6cc : 0xd9d0c2);
    plain.push(at(new THREE.BoxGeometry(1.1, 0.9, 1.1), x + (w / 2 - 0.9) * (r() < 0.5 ? 1 : -1), top + 0.45, z + (d / 2 - 0.9) * (r() < 0.5 ? 1 : -1), 0xe8e0d2));
    if (glassy) {
      for (let k = 0; k < 3; k++) plain.push(at(new THREE.BoxGeometry(0.55, 0.4, 0.55), x + (r() - 0.5) * (w - 1.2), top + 0.2, z + (r() - 0.5) * (d - 1.2), 0xbfc3c6));
    } else {
      roofTanks(x, z, w, d, top, 1 + Math.floor(r() * 3));
      if (r() < 0.6) {
        // Balcony slabs on the two long faces.
        for (let f = 1; f < h; f++) {
          plain.push(
            at(new THREE.BoxGeometry(w * 0.8, 0.08, 0.35), x, SW + f, z + d / 2 + 0.17, 0xe2d9cb),
            at(new THREE.BoxGeometry(w * 0.8, 0.08, 0.35), x, SW + f, z - d / 2 - 0.17, 0xe2d9cb),
          );
        }
      }
    }
  };

  const tower = (cx: number, cz: number, centre: number) => {
    const pw = 12;
    const ph = 2;
    resParts.push(windowBox(pw, ph, pw, cx, SW + ph / 2, cz, pick(SHOP_TONES), r()));
    plain.push(at(new THREE.BoxGeometry(pw + 0.6, 0.1, pw + 0.6), cx, SW + 1, cz, pick(AWNINGS)));
    parapet(cx, cz, pw, pw, SW + ph, 0xd6cdbd);
    const tw = 6 + Math.round(r() * 2.5);
    const td = 6 + Math.round(r() * 2.5);
    const th = Math.round(7 + r() * 6 + centre * r() * 6);
    const base = SW + ph + 0.25;
    glassParts.push(windowBox(tw, th, td, cx, base + th / 2, cz, pick(GLASS_TONES), r()));
    const top = base + th;
    plain.push(
      at(new THREE.BoxGeometry(tw + 0.16, 0.22, td + 0.16), cx, top + 0.11, cz, 0xb9c0c6),
      at(new THREE.BoxGeometry(tw * 0.6, 0.9, td * 0.6), cx, top + 0.45, cz, 0xcfd3d6),
    );
    for (let k = 0; k < 4; k++) plain.push(at(new THREE.BoxGeometry(0.55, 0.4, 0.55), cx + (r() - 0.5) * (tw - 1), top + 0.2, cz + (r() - 0.5) * (td - 1), 0xbfc3c6));
    if (r() < 0.6) {
      plain.push(at(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), cx, top + 0.9 + 1.3, cz, 0x6a6e73));
    }
    // Planters around the podium.
    for (const s of [-1, 1]) {
      trees.push({ x: cx + s * 4, z: cz + 6.3 * s, s: 0.55, y: SW + ph + 0.25 });
    }
  };

  const garden = (x: number, z: number, size: number) => {
    plain.push(at(new THREE.BoxGeometry(size, 0.06, size), x, SW + 0.03, z, GRASS));
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) trees.push({ x: x + (r() - 0.5) * size * 0.7, z: z + (r() - 0.5) * size * 0.7, s: 0.7 + r() * 0.5, y: SW });
  };

  const park = (cx: number, cz: number) => {
    plain.push(
      at(new THREE.BoxGeometry(16.5, 0.06, 16.5), cx, SW + 0.03, cz, GRASS),
      at(new THREE.BoxGeometry(16.5, 0.07, 1.1), cx, SW + 0.04, cz, 0xe6dcc8),
      at(new THREE.BoxGeometry(1.1, 0.07, 16.5), cx, SW + 0.04, cz, 0xe6dcc8),
      at(new THREE.CylinderGeometry(3.2, 3.2, 0.08, 32).scale(1, 1, 0.7), cx + 4, SW + 0.06, cz + 4, 0x7fb0c4),
      // Bandstand
      at(new THREE.CylinderGeometry(1.3, 1.3, 0.25, 12), cx - 4, SW + 0.12, cz - 4, 0xe9dfcc),
      at(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), cx - 4, SW + 1.05, cz - 4, 0xf4ede0),
      at(new THREE.ConeGeometry(1.6, 0.9, 8), cx - 4, SW + 2.25, cz - 4, 0xb5532f),
    );
    for (let a = 0; a < 6; a++) {
      const t = (a / 6) * Math.PI * 2;
      plain.push(at(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), cx - 4 + Math.cos(t) * 1.1, SW + 1.05, cz - 4 + Math.sin(t) * 1.1, 0xf4ede0));
    }
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < 26; tries++) {
      const dx = (r() - 0.5) * 15;
      const dz = (r() - 0.5) * 15;
      if (Math.abs(dx) < 1.4 || Math.abs(dz) < 1.4) continue;
      if (Math.hypot(dx - 4, dz - 4) < 3.8 || Math.hypot(dx + 4, dz + 4) < 2.4) continue;
      trees.push({ x: cx + dx, z: cz + dz, s: 0.8 + r() * 0.7, y: SW });
      placed++;
    }
  };

  /** A nod to Vidhana Soudha: a long stone block with a portico and a central dome. */
  const landmark = (cx: number, cz: number) => {
    const stone = 0xeadcc2;
    const base = SW + 0.6;
    plain.push(at(new THREE.BoxGeometry(15, 0.6, 11), cx, SW + 0.3, cz, 0xd9c9ab));
    resParts.push(windowBox(13, 4, 8, cx, base + 2, cz, stone, 0));
    plain.push(at(new THREE.BoxGeometry(13.5, 0.3, 8.5), cx, base + 4.15, cz, 0xdccaa8));
    // Portico on the south face.
    plain.push(at(new THREE.BoxGeometry(5.6, 0.5, 2.4), cx, base + 4.25, cz + 5, 0xdccaa8));
    for (let k = 0; k < 6; k++) plain.push(at(new THREE.CylinderGeometry(0.17, 0.2, 4, 10), cx - 2.5 + k, base + 2, cz + 5.8, 0xf4ead8));
    plain.push(at(new THREE.ConeGeometry(3.4, 1, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.4), cx, base + 5, cz + 5, stone));
    plain.push(
      at(new THREE.CylinderGeometry(2.2, 2.4, 1.4, 24), cx, base + 5, cz, stone),
      at(new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cx, base + 5.7, cz, 0xe7d5b2),
      at(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 6), cx, base + 8.4, cz, 0xc9a64a),
      at(new THREE.SphereGeometry(0.16, 10, 8), cx, base + 9.05, cz, 0xc9a64a),
    );
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = cx + sx * 5.6;
        const z = cz + sz * 3.1;
        plain.push(
          at(new THREE.CylinderGeometry(0.8, 0.85, 0.7, 16), x, base + 4.65, z, stone),
          at(new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, base + 5, z, 0xe7d5b2),
        );
      }
    }
    for (const sx of [-1, 1]) trees.push({ x: cx + sx * 7.2, z: cz + 6.6, s: 0.6, y: SW }, { x: cx + sx * 4.8, z: cz + 6.8, s: 0.5, y: SW });
  };

  // ---- blocks
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const ri = ROADS[i]!;
      const ri1 = ROADS[i + 1]!;
      const rj = ROADS[j]!;
      const rj1 = ROADS[j + 1]!;
      const cx = (ri + ri1) / 2;
      const cz = (rj + rj1) / 2;
      const x0 = ri + roadWidth(ri) / 2;
      const x1 = ri1 - roadWidth(ri1) / 2;
      const z0 = rj + roadWidth(rj) / 2;
      const z1 = rj1 - roadWidth(rj1) / 2;
      plain.push(at(new THREE.BoxGeometry(x1 - x0, SW, z1 - z0), (x0 + x1) / 2, SW / 2, (z0 + z1) / 2, PAVEMENT));

      // Street trees just inside the kerb, except along the avenue.
      const edges: Array<[number, number, "x" | "z"]> = [
        [ri, x0 + 0.6, "x"],
        [ri1, x1 - 0.6, "x"],
        [rj, z0 + 0.6, "z"],
        [rj1, z1 - 0.6, "z"],
      ];
      for (const [road, line, axis] of edges) {
        if (road === 0) continue;
        for (const o of [-6, -2, 2, 6]) {
          if (r() < 0.3) continue;
          const x = axis === "x" ? line : cx + o;
          const z = axis === "x" ? cz + o : line;
          if (nearLamp(x, z)) continue;
          trees.push({ x, z, s: 0.7 + r() * 0.45, y: SW });
        }
      }

      const dist = Math.hypot(cx, cz);
      const centre = Math.max(0, 1 - dist / 90);
      if (cx === 36 && cz === -36) {
        park(cx, cz);
        continue;
      }
      if (cx === -36 && cz === -36) {
        landmark(cx, cz);
        continue;
      }
      if (dist > 20 && dist < 75 && r() < 0.4) {
        tower(cx, cz, centre);
        continue;
      }
      const n = r() < 0.5 ? 2 : 3;
      const cell = 13 / n;
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const x = cx - 6.5 + (a + 0.5) * cell;
          const z = cz - 6.5 + (b + 0.5) * cell;
          if (r() < 0.07) {
            garden(x, z, cell - 0.6);
            continue;
          }
          const w = (cell - 1) * (0.82 + r() * 0.18);
          const d = (cell - 1) * (0.82 + r() * 0.18);
          let h = Math.round(2 + r() * 3 + centre * r() * 10);
          // The hotspot blocks stay low so the glow reads from above.
          if (Math.hypot(x, z) < 14) h = Math.min(h, 3);
          if (h >= 5) apartment(x, z, w, d, h, centre > 0.45 && r() < 0.35);
          else house(x, z, w, d, h);
        }
      }
    }
  }

  // ---- metro viaduct over the z = -72 road
  for (let x = -132; x <= 132; x += 24) {
    plain.push(
      at(new THREE.CylinderGeometry(0.55, 0.7, METRO_Y, 12), x, METRO_Y / 2, METRO_Z, 0xd8d2c8),
      at(new THREE.BoxGeometry(1.4, 0.6, 3.8), x, METRO_Y - 0.3, METRO_Z, 0xd0c9bd),
    );
  }
  plain.push(
    at(new THREE.BoxGeometry(SPAN, 0.9, 3.4), 0, METRO_Y + 0.45, METRO_Z, 0xe2dccf),
    at(new THREE.BoxGeometry(SPAN, 0.45, 0.15), 0, METRO_Y + 1.12, METRO_Z - 1.62, 0xd6cfc2),
    at(new THREE.BoxGeometry(SPAN, 0.45, 0.15), 0, METRO_Y + 1.12, METRO_Z + 1.62, 0xd6cfc2),
  );

  // ---- merge static geometry
  const glassTex = windowTexture("glass", anisotropy);
  const resTex = windowTexture("res", anisotropy);
  textures.push(glassTex, resTex);
  const addStatic = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
  };
  addStatic(merge(glassParts), new THREE.MeshStandardMaterial({ map: glassTex, vertexColors: true, roughness: 0.45, metalness: 0.2 }));
  addStatic(merge(resParts), new THREE.MeshStandardMaterial({ map: resTex, vertexColors: true, roughness: 0.85, metalness: 0.02 }));
  addStatic(merge(plain), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));

  // ---- trees: rain-tree canopies on short trunks
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x6b4f3a }), trees.length);
  const canopyMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    trees.length,
  );
  const leaf = [0x6f9a4e, 0x5f8c45, 0x7fa85a, 0x88ad5e, 0x56803f];
  const tc = new THREE.Color();
  trees.forEach((t, i) => {
    dummy.rotation.set(0, r() * Math.PI, 0);
    dummy.position.set(t.x, t.y + 0.65 * t.s, t.z);
    dummy.scale.set(t.s, t.s, t.s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, t.y + 1.55 * t.s, t.z);
    dummy.scale.set(1.5 * t.s, 0.95 * t.s, 1.5 * t.s);
    dummy.updateMatrix();
    canopyMesh.setMatrixAt(i, dummy.matrix);
    canopyMesh.setColorAt(i, tc.setHex(pick(leaf)));
  });
  dummy.rotation.set(0, 0, 0);
  trunkMesh.castShadow = canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  world.add(trunkMesh, canopyMesh);

  // ---- traffic
  const kinds = [
    { geo: carGeo(), weight: 0.46, colors: CAR_COLORS },
    { geo: autoGeo(), weight: 0.24, colors: [0xffffff] },
    { geo: bikeGeo(), weight: 0.2, colors: CLOTHES },
    { geo: busGeo(), weight: 0.1, colors: BUS_COLORS },
  ];
  const movers: Mover[][] = kinds.map(() => []);
  for (const axis of ["x", "z"] as const) {
    for (const c of ROADS) {
      if (Math.abs(c) > 96) continue;
      const offs = c === 0 ? [1.15, 3.3] : [1.5];
      for (const dir of [1, -1] as const) {
        for (const off of offs) {
          const lane: Lane = { axis, c, off, dir, speed: (off > 3 ? 2.6 : 3.4) + r() * 2 };
          const n = c === 0 ? 5 : 2 + Math.floor(r() * 2);
          for (let k = 0; k < n; k++) {
            let roll = r();
            let kind = 0;
            while (kind < kinds.length - 1 && roll > kinds[kind]!.weight) roll -= kinds[kind++]!.weight;
            const list = movers[kind]!;
            list.push({ lane, phase: ((k + r() * 0.4) * LOOP) / n, slot: list.length });
          }
        }
      }
    }
  }
  const vehicleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
  const fleets = kinds.map((k, i) => {
    const mesh = new THREE.InstancedMesh(k.geo, vehicleMat, Math.max(1, movers[i]!.length));
    mesh.count = movers[i]!.length;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    movers[i]!.forEach((m) => mesh.setColorAt(m.slot, tc.setHex(pick(k.colors))));
    world.add(mesh);
    return mesh;
  });

  // ---- pedestrians on the sidewalks
  const peds: Array<{ axis: "x" | "z"; line: number; dir: number; speed: number; phase: number }> = [];
  for (const axis of ["x", "z"] as const) {
    for (const c of ROADS) {
      if (Math.abs(c) > 96) continue;
      for (const side of [-1, 1]) {
        const line = c + side * (roadWidth(c) / 2 + (c === 0 ? 0.5 : 1.6));
        for (let k = 0; k < 5; k++) peds.push({ axis, line, dir: r() < 0.5 ? 1 : -1, speed: 0.6 + r() * 0.5, phase: r() * LOOP });
      }
    }
  }
  const bodyGeo = merge([
    at(new THREE.BoxGeometry(0.16, 0.34, 0.14), 0, 0.17, 0, 0x3a3f4a),
    at(new THREE.CylinderGeometry(0.1, 0.12, 0.36, 8), 0, 0.52, 0, 0xffffff),
  ]);
  const pedBody = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), peds.length);
  const pedHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6).translate(0, 0.79, 0), new THREE.MeshStandardMaterial({ color: 0xa8714c }), peds.length);
  for (const m of [pedBody, pedHead]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
  }
  peds.forEach((_, i) => pedBody.setColorAt(i, tc.setHex(pick(CLOTHES))));
  world.add(pedBody, pedHead);

  // ---- metro trains
  const tGeo = trainGeo();
  const tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
  const trains = [-1, 1].map((dir, k) => {
    const mesh = new THREE.Mesh(tGeo, tMat);
    mesh.castShadow = true;
    mesh.position.set(0, METRO_Y + 0.92, METRO_Z + (dir > 0 ? -0.8 : 0.8));
    world.add(mesh);
    return { mesh, dir, phase: k * 130 };
  });

  const wrap = (v: number) => ((v % LOOP) + LOOP) % LOOP - LOOP / 2;

  return {
    update(time: number) {
      kinds.forEach((_, i) => {
        const mesh = fleets[i]!;
        for (const m of movers[i]!) {
          const { axis, c, off, dir, speed } = m.lane;
          const s = wrap(m.phase + time * speed * dir);
          // Traffic keeps to the left.
          if (axis === "x") {
            dummy.position.set(s, 0.02, c - dir * off);
            dummy.rotation.set(0, dir > 0 ? 0 : Math.PI, 0);
          } else {
            dummy.position.set(c + dir * off, 0.02, s);
            dummy.rotation.set(0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
          }
          dummy.updateMatrix();
          mesh.setMatrixAt(m.slot, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      });

      peds.forEach((p, i) => {
        const s = wrap(p.phase + time * p.speed * p.dir);
        const bob = Math.abs(Math.sin(time * 7 + p.phase)) * 0.03;
        if (p.axis === "x") dummy.position.set(s, SW + bob, p.line);
        else dummy.position.set(p.line, SW + bob, s);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        pedBody.setMatrixAt(i, dummy.matrix);
        pedHead.setMatrixAt(i, dummy.matrix);
      });
      pedBody.instanceMatrix.needsUpdate = true;
      pedHead.instanceMatrix.needsUpdate = true;

      for (const t of trains) t.mesh.position.x = wrap(t.phase + time * 9 * t.dir) * 1.1;

      const phase = Math.floor(time / 6) % 2;
      if (phase !== signalPhase) {
        signalPhase = phase;
        signals.forEach((s, i) => {
          const go = (s.group === phase) as boolean;
          signalMesh.setColorAt(i * 2, go ? green : red);
          signalMesh.setColorAt(i * 2 + 1, go ? red : green);
        });
        signalMesh.instanceColor!.needsUpdate = true;
      }
    },
    dispose() {
      textures.forEach((t) => t.dispose());
    },
  };
}
