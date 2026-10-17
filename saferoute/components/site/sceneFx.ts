import * as THREE from "three";

/**
 * Shared look-refining pieces for the about-page city: soft glow textures, smooth
 * route ribbons with rounded corners, and the arrow that travels along the route.
 */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** White in the middle fading to nothing at the edge: light pools, halos, glows. */
export function radialGlowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.65)");
    g.addColorStop(0.6, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Bright along the centre line of a ribbon, fading out to both edges (v runs across). */
function bandTexture() {
  const tex = canvasTexture(4, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** One soft-ended dash per texture repeat (u runs along the route, in world units). */
function dashTexture() {
  const tex = canvasTexture(128, 8, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.15, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 8);
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

type Pt = [number, number];

/** A path through the points on the ground plane with each corner rounded off. */
export function roundedPath(points: Pt[], radius: number) {
  const v = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const path = new THREE.CurvePath<THREE.Vector3>();
  let start = v[0]!.clone();
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1]!;
    const p = v[i]!;
    const b = v[i + 1]!;
    const r = Math.min(radius, p.distanceTo(a) / 2, p.distanceTo(b) / 2);
    const c0 = p.clone().addScaledVector(p.clone().sub(a).normalize(), -r);
    const c1 = p.clone().addScaledVector(b.clone().sub(p).normalize(), r);
    path.add(new THREE.LineCurve3(start, c0));
    path.add(new THREE.QuadraticBezierCurve3(c0, p.clone(), c1));
    start = c1;
  }
  path.add(new THREE.LineCurve3(start, v[v.length - 1]!.clone()));
  return path;
}

/** A flat strip of the given width along the path, at height y; u = distance along, v = across. */
function ribbonGeometry(path: THREE.CurvePath<THREE.Vector3>, width: number, y: number) {
  const length = path.getLength();
  const n = Math.max(2, Math.ceil(length / 0.6));
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = path.getPointAt(t);
    const tan = path.getTangentAt(t);
    const sx = -tan.z * (width / 2);
    const sz = tan.x * (width / 2);
    pos.push(p.x + sx, y, p.z + sz, p.x - sx, y, p.z - sz);
    uv.push(t * length, 0, t * length, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}

/**
 * A glowing route: a soft wide glow, a solid core line and, optionally, light dashes
 * that flow towards the destination. Returns the path and a per-frame update.
 */
export function addRouteRibbon(
  world: THREE.Group,
  points: Pt[],
  opts: { color: number; core: number; glow: number; y: number; glowOpacity: number; flow?: boolean },
) {
  const path = roundedPath(points, 4);
  const band = bandTexture();
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide } as const;

  const glow = new THREE.Mesh(
    ribbonGeometry(path, opts.glow, opts.y),
    new THREE.MeshBasicMaterial({ ...additive, color: opts.color, map: band, opacity: opts.glowOpacity }),
  );
  const core = new THREE.Mesh(
    ribbonGeometry(path, opts.core, opts.y + 0.02),
    new THREE.MeshBasicMaterial({ color: opts.color, toneMapped: false, side: THREE.DoubleSide }),
  );
  glow.renderOrder = 2;
  core.renderOrder = 3;
  world.add(glow, core);

  let dashes: THREE.Texture | null = null;
  if (opts.flow) {
    dashes = dashTexture();
    dashes.repeat.set(1 / 5, 1); // one dash every 5 units
    const flow = new THREE.Mesh(
      ribbonGeometry(path, opts.core * 0.55, opts.y + 0.04),
      new THREE.MeshBasicMaterial({ ...additive, color: 0xfff1dc, map: dashes, opacity: 0.95 }),
    );
    flow.renderOrder = 4;
    world.add(flow);
  }

  return {
    path,
    update(time: number) {
      if (dashes) dashes.offset.x = -time * 0.9;
    },
    dispose() {
      band.dispose();
      dashes?.dispose();
    },
  };
}

/** A flat, slightly bevelled navigation arrow lying on the ground, tip pointing to -z. */
export function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.5);
  s.lineTo(1.15, -1.05);
  s.lineTo(0, -0.45);
  s.lineTo(-1.15, -1.05);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.08, bevelSegments: 3 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Yaw that turns an object's -z axis to face along a ground-plane direction. */
export function headingYaw(dir: THREE.Vector3) {
  return Math.atan2(-dir.x, -dir.z);
}
