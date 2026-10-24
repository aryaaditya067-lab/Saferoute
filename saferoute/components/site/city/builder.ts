import * as THREE from "three";

/**
 * Geometry helpers for the about-page city. Static parts are written straight into
 * flat arrays (no intermediate BufferGeometry per box) and grouped by material and
 * by area, so the whole city is a few dozen draw calls that the camera can cull.
 */

/** Half the size of the built-up area; the ground AO map covers [-CITY_HALF, CITY_HALF]. */
export const CITY_HALF = 132;
const CHUNK = 66;

/** Which 66-unit square of the city a point falls in (0..3 on each axis). */
export function chunkOf(x: number, z: number) {
  const cx = Math.max(0, Math.min(3, Math.floor((x + CITY_HALF) / CHUNK)));
  const cz = Math.max(0, Math.min(3, Math.floor((z + CITY_HALF) / CHUNK)));
  return cx * 4 + cz;
}

export function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export type Rand = () => number;

/** Facade tiling for a wall: u = u0 + along * su, v = v0 + height * sv. */
export interface UvMap {
  su: number;
  sv: number;
  u0?: number;
  v0?: number;
}

export interface BoxOpts {
  color: number;
  /** Colour of the top face; defaults to `color`. */
  top?: number;
  /** Texture tiling for the four walls; without it walls sample the texture's plain corner. */
  facade?: UvMap;
  /** Darken the foot of the walls a little, as ambient occlusion would. */
  ao?: boolean;
  /** Tile the top face in world space, one texture repeat every `worldTop` units. */
  worldTop?: number;
  noTop?: boolean;
  bottom?: boolean;
}

/** Every texture keeps a plain wall-coloured pixel here, so roofs and plain parts sample it. */
const PLAIN = 0.003;
const PZ = [0, 0, 1];
const NZ = [0, 0, -1];
const PX = [1, 0, 0];
const NX = [-1, 0, 0];
const PY = [0, 1, 0];
const NY = [0, -1, 0];

const cA = new THREE.Color();
const cB = new THREE.Color();
const cTop = new THREE.Color();

export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  /** World-space uv (0..1 over the city) for the ground ambient-occlusion map. */
  private uv1: number[] | null;

  constructor(worldUv1 = false) {
    this.uv1 = worldUv1 ? [] : null;
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number, c: THREE.Color) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, w);
    this.col.push(c.r, c.g, c.b);
    if (this.uv1) this.uv1.push((x + CITY_HALF) / (2 * CITY_HALF), (z + CITY_HALF) / (2 * CITY_HALF));
  }

  /** Quad a-b-c-d (a, b along the bottom, c, d along the top), counter-clockwise seen from the front. */
  quad(p: number[], n: number[], uv: number[], bottom: THREE.Color, top: THREE.Color = bottom) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.v(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!, n[0]!, n[1]!, n[2]!, uv[i * 2]!, uv[i * 2 + 1]!, i < 2 ? bottom : top);
    }
  }

  /** A horizontal rectangle at height y (roads, grass, decals baked into the ground). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, hex: number, worldScale = 0) {
    cA.setHex(hex);
    const s = worldScale;
    const uv = s ? [x0 / s, -z1 / s, x1 / s, -z1 / s, x1 / s, -z0 / s, x0 / s, -z0 / s] : [PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN];
    this.quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], PY, uv, cA);
  }

  /** Axis-aligned box standing on y0; x/z is its centre. */
  box(x: number, y0: number, z: number, w: number, h: number, d: number, o: BoxOpts) {
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const y1 = y0 + h;
    cA.setHex(o.color);
    const f = o.facade;
    const su = f?.su ?? 0;
    const sv = f?.sv ?? 0;
    const u0 = f ? (f.u0 ?? 0) : PLAIN;
    const v0 = f ? (f.v0 ?? 0) : PLAIN;
    const wall = (ax: number, az: number, bx: number, bz: number, n: number[], span: number) => {
      const ua = u0;
      const ub = u0 + span * su;
      if (o.ao && h > 0.6) {
        // A darker strip at the foot of the wall, fading up to the wall colour.
        const hb = Math.min(1.1, h * 0.45);
        cB.copy(cA).multiplyScalar(0.62);
        const vm = v0 + hb * sv;
        this.quad([ax, y0, az, bx, y0, bz, bx, y0 + hb, bz, ax, y0 + hb, az], n, [ua, v0, ub, v0, ub, vm, ua, vm], cB, cA);
        this.quad([ax, y0 + hb, az, bx, y0 + hb, bz, bx, y1, bz, ax, y1, az], n, [ua, vm, ub, vm, ub, v0 + h * sv, ua, v0 + h * sv], cA);
      } else {
        this.quad([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az], n, [ua, v0, ub, v0, ub, v0 + h * sv, ua, v0 + h * sv], cA);
      }
    };
    wall(x0, z1, x1, z1, PZ, w);
    wall(x1, z0, x0, z0, NZ, w);
    wall(x1, z1, x1, z0, PX, d);
    wall(x0, z0, x0, z1, NX, d);
    if (!o.noTop) {
      cTop.setHex(o.top ?? o.color);
      const s = o.worldTop;
      const uv = s ? [x0 / s, -z1 / s, x1 / s, -z1 / s, x1 / s, -z0 / s, x0 / s, -z0 / s] : [PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN];
      this.quad([x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0], PY, uv, cTop);
    }
    if (o.bottom) {
      this.quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], NY, [PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN, PLAIN], cA);
    }
  }

  /** Copies a three.js geometry in (moved by x, y, z), painted one colour; the geometry is disposed. */
  geo(g: THREE.BufferGeometry, hex: number, x = 0, y = 0, z = 0) {
    const src = g.index ? g.toNonIndexed() : g;
    if (!src.attributes.normal) src.computeVertexNormals();
    const p = src.attributes.position!;
    const n = src.attributes.normal!;
    cA.setHex(hex);
    for (let i = 0; i < p.count; i++) {
      this.v(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z, n.getX(i), n.getY(i), n.getZ(i), PLAIN, PLAIN, cA);
    }
    if (src !== g) src.dispose();
    g.dispose();
  }

  /**
   * Stamps a prepared shape (scaled, turned about y, then moved), painted one colour.
   * Much cheaper than building a new three.js geometry for every water tank or bench.
   */
  proto(p: Proto, hex: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotY = 0) {
    cA.setHex(hex);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const { pos, nor } = p;
    for (let i = 0; i < pos.length; i += 3) {
      const px = pos[i]! * sx;
      const py = pos[i + 1]! * sy;
      const pz = pos[i + 2]! * sz;
      let nx = nor[i]! / sx;
      const ny = nor[i + 1]! / sy;
      let nz = nor[i + 2]! / sz;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      nz /= len;
      this.v(x + px * cos + pz * sin, y + py, z - px * sin + pz * cos, nx * cos + nz * sin, ny / len, -nx * sin + nz * cos, PLAIN, PLAIN, cA);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv1) g.setAttribute("uv1", new THREE.Float32BufferAttribute(this.uv1, 2));
    g.computeBoundingSphere();
    return g;
  }
}

/** A shape's triangles, unrolled once so they can be stamped many times. */
export class Proto {
  readonly pos: Float32Array;
  readonly nor: Float32Array;

  constructor(g: THREE.BufferGeometry) {
    const src = g.index ? g.toNonIndexed() : g;
    if (!src.attributes.normal) src.computeVertexNormals();
    this.pos = Float32Array.from(src.attributes.position!.array as ArrayLike<number>);
    this.nor = Float32Array.from(src.attributes.normal!.array as ArrayLike<number>);
    if (src !== g) src.dispose();
    g.dispose();
  }
}

/** One MeshBuilder per material per 66-unit square of the city. */
export class Batches<K extends string> {
  private map = new Map<string, { kind: K; b: MeshBuilder }>();

  constructor(private worldUv: ReadonlySet<K>) {}

  at(kind: K, x: number, z: number): MeshBuilder {
    const key = `${kind}|${chunkOf(x, z)}`;
    let entry = this.map.get(key);
    if (!entry) {
      entry = { kind, b: new MeshBuilder(this.worldUv.has(kind)) };
      this.map.set(key, entry);
    }
    return entry.b;
  }

  /** Builds every batch into a static mesh with its kind's material. */
  meshes(materials: Record<K, THREE.Material>, shadows: (kind: K) => { cast: boolean; receive: boolean }) {
    const out: THREE.Mesh[] = [];
    for (const { kind, b } of this.map.values()) {
      if (!b.vertexCount) continue;
      const geo = b.build();
      // Static: once the data is on the GPU, the CPU copy is only wasted memory.
      for (const attr of Object.values(geo.attributes)) {
        (attr as THREE.BufferAttribute).onUpload(function (this: THREE.BufferAttribute) {
          (this as unknown as { array: null }).array = null;
        });
      }
      const mesh = new THREE.Mesh(geo, materials[kind]);
      const s = shadows(kind);
      mesh.castShadow = s.cast;
      mesh.receiveShadow = s.receive;
      mesh.matrixAutoUpdate = false;
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

/** A builder for one small model (vehicles, trees): parts painted in place, built once. */
export function model(build: (b: MeshBuilder) => void) {
  const b = new MeshBuilder();
  build(b);
  return b.build();
}
