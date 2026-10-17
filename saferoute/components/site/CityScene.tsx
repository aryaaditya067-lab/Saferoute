"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Minimal low-poly city behind the about page. A reported-crime area glows red,
 * the fastest route cuts straight through it and the safest route goes round by
 * the lit streets. The camera follows the page scroll through [data-scene] sections.
 */

const BG = 0xf8f4ec;
const BRAND = 0xe87524;
const DANGER = 0xe5484d;

/** Road centres on both axes; the middle ones are wider avenues. */
const ROADS = [-72, -48, -24, 0, 24, 48, 72];
const ROAD_W = 6;
const AVENUE_W = 9;
const HOTSPOT = new THREE.Vector3(0, 0, 0);

type Pt = [number, number];
const A: Pt = [-48, 24];
const B: Pt = [48, -24];
const FASTEST: Pt[] = [A, [-48, 0], [48, 0], B];
const SAFEST: Pt[] = [A, [-24, 24], [-24, 48], [48, 48], B];

/** Camera keys, one per [data-scene] section: position and look-at. */
const KEYS: Array<{ p: [number, number, number]; l: [number, number, number] }> = [
  { p: [-58, 62, 78], l: [-26, 0, 10] },
  { p: [26, 24, 34], l: [0, 2, 0] },
  { p: [-36, 200, 52], l: [-36, 0, 12] },
  { p: [-72, 11, 48], l: [18, 2, 48] },
  { p: [66, 42, -52], l: [0, 0, 0] },
];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function roadWidth(c: number) {
  return c === 0 ? AVENUE_W : ROAD_W;
}

function buildCity(world: THREE.Group) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0xece3d2, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  world.add(ground);

  // Roads
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x4a413a, roughness: 0.95 });
  const span = 170;
  for (const c of ROADS) {
    const w = roadWidth(c);
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(span, w), asphalt);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, c);
    alongX.receiveShadow = true;
    const alongZ = alongX.clone();
    alongZ.rotation.z = Math.PI / 2;
    alongZ.position.set(c, 0.025, 0);
    world.add(alongX, alongZ);
  }

  // Buildings: a few lots per block, taller towards the middle.
  const rand = seeded(7);
  const lots: Array<{ x: number; z: number; w: number; d: number; h: number }> = [];
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const cx = (ROADS[i]! + ROADS[i + 1]!) / 2;
      const cz = (ROADS[j]! + ROADS[j + 1]!) / 2;
      const half = 24 / 2 - 5.5;
      const n = 2 + Math.floor(rand() * 2);
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const w = (half * 2) / n - 1.2;
          const x = cx - half + (a + 0.5) * ((half * 2) / n);
          const z = cz - half + (b + 0.5) * ((half * 2) / n);
          // The hotspot block stays low so the glow reads from above.
          const dist = Math.hypot(x, z);
          const centre = Math.max(0, 1 - dist / 90);
          const h = 2.5 + rand() * 4 + centre * rand() * 11;
          lots.push({ x, z, w, d: w, h: dist < 14 ? Math.min(h, 3) : h });
        }
      }
    }
  }
  const boxes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.04 }),
    lots.length,
  );
  boxes.castShadow = true;
  boxes.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tones = [0xf3e9d8, 0xeadbc3, 0xe0cdb0, 0xf7efe2];
  lots.forEach((lot, i) => {
    dummy.position.set(lot.x, lot.h / 2, lot.z);
    dummy.scale.set(lot.w, lot.h, lot.d);
    dummy.updateMatrix();
    boxes.setMatrixAt(i, dummy.matrix);
    boxes.setColorAt(i, new THREE.Color(tones[Math.floor(rand() * tones.length)]!));
  });
  world.add(boxes);

  // Street lights along the southern avenue (the safe route) and a few elsewhere.
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
    dummy.position.set(x, 0.07, z);
    dummy.updateMatrix();
    poolMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 2, z);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
  });
  world.add(poleMesh, lampMesh, poolMesh);
}

function addRoute(world: THREE.Group, points: Pt[], color: number, width: number, y: number) {
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  const segments: Array<{ a: THREE.Vector3; b: THREE.Vector3; len: number }> = [];
  for (let i = 1; i < points.length; i++) {
    const a = new THREE.Vector3(points[i - 1]![0], y, points[i - 1]![1]);
    const b = new THREE.Vector3(points[i]![0], y, points[i]![1]);
    const len = a.distanceTo(b);
    const horizontal = Math.abs(a.z - b.z) < 1e-6;
    const geo = (w: number) => new THREE.BoxGeometry(horizontal ? len + w : w, 0.12, horizontal ? w : len + w);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const line = new THREE.Mesh(geo(width), mat);
    const halo = new THREE.Mesh(geo(width * 3.2), glow);
    line.position.copy(mid);
    halo.position.copy(mid).setY(y - 0.03);
    world.add(halo, line);
    segments.push({ a, b, len });
  }
  const total = segments.reduce((s, g) => s + g.len, 0);
  return {
    total,
    at(t: number, out: THREE.Vector3) {
      let d = (t % 1) * total;
      for (const s of segments) {
        if (d <= s.len) return out.lerpVectors(s.a, s.b, d / s.len);
        d -= s.len;
      }
      return out.copy(segments[segments.length - 1]!.b);
    },
  };
}

function addPin(world: THREE.Group, [x, z]: Pt, color: number) {
  // Pickup (dark) and destination (orange) markers.
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  stem.position.y = 3.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  head.position.y = 7.4;
  g.add(stem, head);
  g.position.set(x, 0, z);
  world.add(g);
}

export default function CityScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      return; // No WebGL: the page still reads fine on its plain background.
    }
    const small = window.innerWidth < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.FogExp2(BG, 0.0045);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 700);
    const world = new THREE.Group();
    scene.add(world);

    scene.add(new THREE.HemisphereLight(0xfff1de, 0x8a6a50, 0.7));
    const sun = new THREE.DirectionalLight(0xffd2a0, 1.2);
    sun.position.set(60, 85, 40);
    sun.castShadow = true;
    const shadowSize = small ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 300 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    buildCity(world);

    // Reported-crime area: a soft red glow on the avenue crossing.
    const hotspotMat = new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
    const hotspot = new THREE.Mesh(new THREE.CircleGeometry(15, 48).rotateX(-Math.PI / 2), hotspotMat);
    hotspot.position.copy(HOTSPOT).setY(0.12);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14.4, 15, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    );
    ring.position.copy(HOTSPOT).setY(0.14);
    world.add(hotspot, ring);

    addRoute(world, FASTEST, 0x8f8a80, 1.1, 0.2);
    const safest = addRoute(world, SAFEST, BRAND, 1.5, 0.26);
    addPin(world, A, 0x242321);
    addPin(world, B, BRAND);

    const head = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfffdf8, toneMapped: false }));
    const headGlow = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: BRAND, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }),
    );
    head.position.y = 1.2;
    world.add(head, headGlow);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const pt = new THREE.Vector3();
    let cur = 0;
    let target = 0;
    let time = 0;
    let last = performance.now();
    let raf = 0;
    let visible = true;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const onVisibility = () => {
      visible = !document.hidden;
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    /** Fractional key index from how far the viewport middle is through the scene sections. */
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"));
    const keyIndex = () => {
      if (!sections.length) return 0;
      const mid = window.innerHeight * 0.5;
      let f = sections.length - 1;
      for (let k = 0; k < sections.length; k++) {
        const r = sections[k]!.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) {
          f = k + (mid - r.top) / Math.max(r.height, 1);
          break;
        }
        if (r.top > mid) {
          f = k;
          break;
        }
      }
      return Math.max(0, Math.min(KEYS.length - 1, (f * (KEYS.length - 1)) / Math.max(sections.length - 1, 1)));
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const elapsed = (now - last) / 1000 || 0;
      last = now;
      const dt = Math.min(0.05, elapsed);
      time += reduce ? dt * 0.3 : dt;

      target = keyIndex();
      // Time-based easing so the camera arrives in about a second even when frames are slow.
      cur += (target - cur) * (reduce ? 1 : 1 - Math.exp(-Math.min(0.5, elapsed) * 3.5));
      const i = Math.min(Math.floor(cur), KEYS.length - 1);
      const j = Math.min(i + 1, KEYS.length - 1);
      let u = cur - i;
      u = u * u * (3 - 2 * u);
      const a = KEYS[i]!;
      const b = KEYS[j]!;
      pos.set(a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u, a.p[2] + (b.p[2] - a.p[2]) * u);
      look.set(a.l[0] + (b.l[0] - a.l[0]) * u, a.l[1] + (b.l[1] - a.l[1]) * u, a.l[2] + (b.l[2] - a.l[2]) * u);
      // Narrow screens need the camera further back to keep the scene in frame.
      const back = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : 1;
      camera.position.copy(look).add(tmp.copy(pos).sub(look).multiplyScalar(back));
      camera.lookAt(look);
      // Thin the haze as the camera climbs so the top-down view stays crisp.
      (scene.fog as THREE.FogExp2).density = 0.0045 - Math.min(1, Math.max(0, (camera.position.y - 30) / 120)) * 0.003;

      hotspotMat.opacity = 0.24 + Math.sin(time * 2.2) * 0.07;
      ring.scale.setScalar(1 + ((time * 0.35) % 1) * 0.12);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - ((time * 0.35) % 1));
      safest.at(time * 0.06, pt);
      head.position.set(pt.x, 1.2, pt.z);
      headGlow.position.copy(head.position);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          const m = obj.material;
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 z-0 h-full w-full" />;
}
