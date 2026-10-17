"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCity } from "./cityBuild";
import { addRouteRibbon, arrowGeometry, headingYaw, radialGlowTexture } from "./sceneFx";

/**
 * Detailed low-poly city behind the about page (see cityBuild). A reported-crime area glows red,
 * the fastest route cuts straight through it and the safest route goes round by
 * the lit streets. The camera follows the page scroll through [data-scene] sections.
 */

/** Night sky; matches the about page background. */
const BG = 0x0b0d12;
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

/** Builds the scene on the canvas and starts rendering; returns a cleanup function. */
function mountScene(canvas: HTMLCanvasElement): (() => void) | undefined {
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
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.0045);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 700);
  const world = new THREE.Group();
  scene.add(world);

  // Night: cool moonlight from above, a little warm bounce from the street lights below.
  scene.add(new THREE.HemisphereLight(0x7f95c8, 0x2a1e14, 0.38));
  const sun = new THREE.DirectionalLight(0xaec2ff, 0.42);
  sun.position.set(-50, 90, 30);
  sun.castShadow = true;
  const shadowSize = small ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 300 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const city = buildCity(world, renderer.capabilities.getMaxAnisotropy());

  const glowTex = radialGlowTexture();
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const;

  // Reported-crime area: a soft red glow that fades out at its edge, with a pulsing ring.
  const hotspotMat = new THREE.MeshBasicMaterial({ ...additive, color: DANGER, map: glowTex, opacity: 0.7 });
  const hotspot = new THREE.Mesh(new THREE.PlaneGeometry(34, 34).rotateX(-Math.PI / 2), hotspotMat);
  hotspot.position.copy(HOTSPOT).setY(0.2);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(14.6, 15, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
  );
  ring.position.copy(HOTSPOT).setY(0.22);
  world.add(hotspot, ring);

  const fastest = addRouteRibbon(world, FASTEST, { color: 0x9a958c, core: 0.7, glow: 4, y: 0.3, glowOpacity: 0.22 });
  const safest = addRouteRibbon(world, SAFEST, { color: 0xf07a2a, core: 1.1, glow: 7.5, y: 0.36, glowOpacity: 0.6, flow: true });
  addPin(world, A, 0x242321);
  addPin(world, B, BRAND);

  // A navigation arrow drives along the safest route, with a warm glow on the road under it.
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0xfffaf2,
    emissive: 0xffd9b0,
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
  });
  const arrow = new THREE.Mesh(arrowGeometry(), arrowMat);
  arrow.castShadow = true;
  arrow.scale.setScalar(1.8);
  const arrowGlowMat = new THREE.MeshBasicMaterial({ ...additive, color: BRAND, map: glowTex, opacity: 0.9 });
  const arrowGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), arrowGlowMat);
  arrowGlow.renderOrder = 5;
  world.add(arrow, arrowGlow);
  const tangent = new THREE.Vector3();

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

  // A little mouse parallax so the city feels alive under the pointer (mouse only).
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

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
    if (!reduce) {
      const k = 1 - Math.exp(-Math.min(0.5, elapsed) * 3);
      pointer.sx += (pointer.x - pointer.sx) * k;
      pointer.sy += (pointer.y - pointer.sy) * k;
      camera.position.x += pointer.sx * 4;
      camera.position.y -= pointer.sy * 2.5;
    }
    camera.lookAt(look);
    // Thin the haze as the camera climbs so the top-down view stays crisp.
    (scene.fog as THREE.FogExp2).density = 0.0045 - Math.min(1, Math.max(0, (camera.position.y - 30) / 120)) * 0.003;

    hotspotMat.opacity = 0.6 + Math.sin(time * 2.2) * 0.12;
    ring.scale.setScalar(1 + ((time * 0.35) % 1) * 0.12);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - ((time * 0.35) % 1));
    city.update(time);
    fastest.update(time);
    safest.update(time);
    // Arrow: one trip every ~20 s, fading out at the destination and back in at the start.
    const t = (time * 0.05) % 1;
    safest.path.getPointAt(t, pt);
    safest.path.getTangentAt(t, tangent);
    arrow.position.set(pt.x, 0.55 + Math.sin(time * 3) * 0.08, pt.z);
    arrow.rotation.y = headingYaw(tangent);
    const fade = Math.min(1, t * 14, (1 - t) * 14);
    arrowMat.opacity = fade;
    arrowGlow.position.set(pt.x, 0.42, pt.z);
    arrowGlowMat.opacity = 0.9 * fade;
    renderer.render(scene, camera);
    // Fade the city in once its first frame is ready.
    if (canvas.style.opacity !== "1") canvas.style.opacity = "1";
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", onVisibility);
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const m = obj.material;
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      }
    });
    city.dispose();
    fastest.dispose();
    safest.dispose();
    glowTex.dispose();
    renderer.dispose();
  };
}


export default function CityScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Building the city takes a moment, so let the page's own intro start first.
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const begin = () => {
      if (!cancelled) dispose = mountScene(canvas);
    };
    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle ? window.requestIdleCallback(begin, { timeout: 900 }) : window.setTimeout(begin, 300);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      dispose?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 h-full w-full opacity-0 transition-opacity duration-[1400ms] ease-out"
    />
  );
}
