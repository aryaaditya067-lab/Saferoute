"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCity } from "./cityBuild";

/**
 * Detailed low-poly city behind the about page (see cityBuild). A reported-crime area glows red,
 * the fastest route cuts straight through it and the safest route goes round by
 * the lit streets. The camera follows the page scroll through [data-scene] sections.
 */

const BG = 0xf8f4ec;
const BRAND = 0xe87524;
const DANGER = 0xe5484d;

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

    const city = buildCity(world, renderer.capabilities.getMaxAnisotropy());

    // Reported-crime area: a soft red glow on the avenue crossing.
    const hotspotMat = new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
    const hotspot = new THREE.Mesh(new THREE.CircleGeometry(15, 48).rotateX(-Math.PI / 2), hotspotMat);
    hotspot.position.copy(HOTSPOT).setY(0.2);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14.4, 15, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    );
    ring.position.copy(HOTSPOT).setY(0.22);
    world.add(hotspot, ring);

    addRoute(world, FASTEST, 0x8f8a80, 1.1, 0.3);
    const safest = addRoute(world, SAFEST, BRAND, 1.5, 0.36);
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
      // RAF timestamps can trail performance.now(), so never let time run backwards.
      const elapsed = Math.max(0, (now - last) / 1000 || 0);
      last = now;
      const dt = Math.min(0.05, elapsed);
      time += reduce ? dt * 0.3 : dt;

      target = keyIndex();
      // Time-based easing so the camera arrives in about a second even when frames are slow.
      cur += (target - cur) * (reduce ? 1 : 1 - Math.exp(-Math.min(0.5, elapsed) * 3.5));
      cur = Math.max(0, Math.min(KEYS.length - 1, cur));
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
      city.update(time);
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
      city.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 z-0 h-full w-full" />;
}
