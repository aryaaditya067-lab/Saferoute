import * as THREE from "three";
import { model, type MeshBuilder } from "./builder";

/**
 * Trees for a garden city: wide rain trees, flowering trees (gulmohar, jacaranda,
 * tabebuia), coconut palms and tall, narrow ashoka trees. Canopies are white so each
 * instance's colour shows; trunks are a separate instanced mesh shared by all trees.
 */

export type TreeKind = "rain" | "bloom" | "palm" | "column";

export interface Tree {
  kind: TreeKind;
  x: number;
  z: number;
  /** Ground height under the tree. */
  y: number;
  /** Overall scale. */
  s: number;
}

/** Trunk standing on y = 0, 1.4 tall. */
export function trunkGeo() {
  return new THREE.CylinderGeometry(0.1, 0.15, 1.4, 7).translate(0, 0.7, 0);
}

/** A soft, wide canopy of overlapping puffs, sitting on top of a 1.4-tall trunk. */
export function canopyGeo() {
  return model((b) => {
    const puffs: Array<[number, number, number, number]> = [
      [0, 1.95, 0, 0.95],
      [0.6, 1.78, 0.32, 0.7],
      [-0.6, 1.8, -0.2, 0.72],
      [-0.05, 1.76, -0.62, 0.64],
    ];
    for (const [x, y, z, r] of puffs) b.geo(new THREE.SphereGeometry(r, 8, 5).scale(1, 0.72, 1), 0xffffff, x, y, z);
  });
}

/** Ashoka (Polyalthia): a tall, narrow cone of drooping leaves. */
export function columnTreeGeo() {
  return model((b) => {
    b.geo(new THREE.ConeGeometry(0.62, 3.4, 8, 2), 0xffffff, 0, 2.6, 0);
    b.geo(new THREE.SphereGeometry(0.6, 8, 5), 0xffffff, 0, 1.25, 0);
  });
}

/** Coconut palm: a slender, slightly leaning trunk with drooping fronds (colours baked in). */
export function palmGeo() {
  return model((b: MeshBuilder) => {
    let x = 0;
    for (let k = 0; k < 4; k++) {
      b.geo(new THREE.CylinderGeometry(0.09, 0.11, 1.0, 6), 0x8a7458, x, 0.5 + k, 0);
      x += 0.06;
    }
    const top = 4.0;
    b.geo(new THREE.SphereGeometry(0.2, 8, 6), 0x5b6e3a, x, top, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const frond = new THREE.BoxGeometry(1.5, 0.03, 0.3).translate(0.75, 0, 0).rotateZ(-0.5).rotateY(a);
      b.geo(frond, k % 2 ? 0x5f8a3e : 0x6f9a48, x, top, 0);
    }
  });
}
