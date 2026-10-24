"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCity } from "./cityBuild";
import { addRouteRibbon, arrowGeometry, headingYaw, pinGeometry, radialGlowTexture } from "./sceneFx";

/**
 * Daylit city behind the about page (see cityBuild). A reported-crime area glows red,
 * the fastest route cuts straight through it and the safest route goes round past the
 * police station and the hospital. The camera follows the page scroll through the
 * [data-scene] sections.
 *
 * Kept light on the GPU: shadows are rendered once, there is no post-processing, and
 * the resolution steps down on its own when frames get slow.
 */

/** Haze colour; matches the page background. */
const BG = 0xeef1f4;
const BRAND = 0xe87524;
const DANGER = 0xe5484d;
const SUN_DIR = new THREE.Vector3(-0.55, 0.8, 0.36).normalize();

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

/** A soft daylight sky (blue overhead, pale haze at the horizon, warm ground) for reflections and ambient light. */
function skyEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const pos = geo.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(0xa7c8e8);
  const horizon = new THREE.Color(BG);
  const below = new THREE.Color(0xb9b1a4);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 10;
    if (t >= 0) c.copy(horizon).lerp(zenith, Math.pow(t, 0.6));
    else c.copy(horizon).lerp(below, Math.min(1, -t * 3));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.9).multiplyScalar(14) }));
  sun.position.copy(SUN_DIR).multiplyScalar(9);
  scene.add(sky, sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return target;
}

/** A map pin that turns to face the camera. */
function addPin(world: THREE.Group, [x, z]: Pt, color: number, shadow: THREE.Texture) {
  const g = new THREE.Group();
  const shape = pinGeometry();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 });
  g.add(new THREE.Mesh(shape.head, mat), new THREE.Mesh(shape.point, mat));
  g.add(new THREE.Mesh(shape.dot, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, map: shadow, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  base.position.y = 0.4;
  g.add(base);
  g.position.set(x, 0, z);
  world.add(g);
  return g;
}

/** Builds the scene on the canvas and starts rendering; returns a cleanup function. */
function mountScene(canvas: HTMLCanvasElement): (() => void) | undefined {
  const small = window.innerWidth < 700;
  const deviceDpr = window.devicePixelRatio || 1;
  let renderer: THREE.WebGLRenderer;
  try {
    // Multisampling costs a lot at 2x and is barely visible there, so only use it at 1x.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: deviceDpr < 1.5, powerPreference: "high-performance" });
  } catch {
    return; // No WebGL: the page still reads fine on its plain background.
  }
  const maxDpr = Math.min(deviceDpr, small ? 1.5 : 2);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Nothing that casts a shadow moves, so the shadow map is drawn once, not every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.005);
  const env = skyEnvironment(renderer);
  scene.environment = env.texture;
  // The same sky, softened, behind the city: blue overhead fading into the haze at the horizon.
  scene.background = env.texture;
  scene.backgroundBlurriness = 0.35;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 700);
  const world = new THREE.Group();
  scene.add(world);

  scene.add(new THREE.HemisphereLight(0xe6eefa, 0xd6cbb8, 0.45));
  const sun = new THREE.DirectionalLight(0xfff3e4, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  sun.castShadow = true;
  const shadowSize = small ? 2048 : 4096;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -128, right: 128, top: 128, bottom: -128, near: 20, far: 420 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const city = buildCity(world, {
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    quality: small ? "low" : "high",
    cameraPath: KEYS.map((k) => k.p),
  });

  const glowTex = radialGlowTexture();
  const soft = { transparent: true, depthWrite: false, toneMapped: false } as const;

  // Reported-crime area: a soft red glow that fades out at its edge, with a pulsing ring.
  const hotspotMat = new THREE.MeshBasicMaterial({ ...soft, color: DANGER, map: glowTex, opacity: 0.7 });
  const hotspot = new THREE.Mesh(new THREE.PlaneGeometry(36, 36).rotateX(-Math.PI / 2), hotspotMat);
  hotspot.position.copy(HOTSPOT).setY(0.24);
  hotspot.renderOrder = 2;
  const ringMat = new THREE.MeshBasicMaterial({ ...soft, color: DANGER, opacity: 0.7 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(14.5, 15, 96).rotateX(-Math.PI / 2), ringMat);
  ring.position.copy(HOTSPOT).setY(0.26);
  ring.renderOrder = 2;
  world.add(hotspot, ring);

  const fastest = addRouteRibbon(world, FASTEST, { color: 0x8e8a84, core: 0.7, glow: 3.6, y: 0.3, glowOpacity: 0.3 });
  const safest = addRouteRibbon(world, SAFEST, { color: 0xf07a2a, core: 1.15, glow: 6.5, y: 0.36, glowOpacity: 0.42, flow: true });
  const pins = [addPin(world, A, 0x1d1d1f, glowTex), addPin(world, B, BRAND, glowTex)];

  // A navigation puck drives along the safest route: white arrow on an orange disc.
  const puck = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CircleGeometry(2.25, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.85, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: BRAND, toneMapped: false, transparent: true }));
  disc.position.y = 0.02;
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, transparent: true });
  const arrow = new THREE.Mesh(arrowGeometry(), arrowMat);
  arrow.scale.setScalar(0.85);
  arrow.position.y = 0.05;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...soft, color: BRAND, map: glowTex, opacity: 0.5 }));
  halo.position.y = -0.04;
  puck.add(halo, rim, disc, arrow);
  puck.renderOrder = 5;
  world.add(puck);
  const puckMats = [rim.material, disc.material, arrowMat, halo.material as THREE.MeshBasicMaterial];
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
  let started = false;

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(dpr);
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

  /**
   * Fractional key index: key k is reached when section k's centre is at the middle of the
   * viewport, so the camera rests on a view while its section is being read.
   */
  const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"));
  const keyIndex = () => {
    if (!sections.length) return 0;
    const mid = window.innerHeight * 0.5;
    const centres = sections.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    let f = sections.length - 1;
    if (mid <= centres[0]!) f = 0;
    else {
      for (let k = 0; k < centres.length - 1; k++) {
        if (mid < centres[k + 1]!) {
          f = k + (mid - centres[k]!) / Math.max(1, centres[k + 1]! - centres[k]!);
          break;
        }
      }
    }
    return Math.max(0, Math.min(KEYS.length - 1, (f * (KEYS.length - 1)) / Math.max(sections.length - 1, 1)));
  };

  // Adaptive resolution: average the frame time over each second and step the pixel ratio.
  let sampleTime = 0;
  let sampleFrames = 0;
  let calmFor = 0;
  let warmup = 2;
  const adapt = (elapsed: number) => {
    sampleTime += elapsed;
    sampleFrames++;
    if (sampleTime < 1) return;
    const avg = sampleTime / sampleFrames;
    sampleTime = 0;
    sampleFrames = 0;
    if (warmup > 0) {
      warmup--;
      return;
    }
    if (avg > 1 / 45 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      calmFor = 0;
      resize();
    } else if (avg < 1 / 57 && dpr < maxDpr) {
      calmFor++;
      if (calmFor >= 5) {
        dpr = Math.min(maxDpr, dpr + 0.25);
        calmFor = 0;
        resize();
      }
    } else {
      calmFor = 0;
    }
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!visible || !started) return;
    // RAF timestamps can trail performance.now(), so never let time run backwards.
    const elapsed = Math.max(0, (now - last) / 1000 || 0);
    last = now;
    const dt = Math.min(0.05, elapsed);
    time += reduce ? dt * 0.3 : dt;
    adapt(elapsed);

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
    (scene.fog as THREE.FogExp2).density = 0.005 - Math.min(1, Math.max(0, (camera.position.y - 45) / 110)) * 0.0034;

    hotspotMat.opacity = 0.62 + Math.sin(time * 2.2) * 0.1;
    const wave = (time * 0.35) % 1;
    ring.scale.setScalar(1 + wave * 0.12);
    ringMat.opacity = 0.7 * (1 - wave);
    city.update(time, reduce ? dt * 0.3 : dt);
    fastest.update(time);
    safest.update(time);
    for (const pin of pins) pin.rotation.y = Math.atan2(camera.position.x - pin.position.x, camera.position.z - pin.position.z);
    // The puck makes one trip every ~20 s, fading out at the destination and back in at the start.
    const t = (time * 0.05) % 1;
    safest.path.getPointAt(t, pt);
    safest.path.getTangentAt(t, tangent);
    puck.position.set(pt.x, 0.5, pt.z);
    arrow.rotation.y = headingYaw(tangent);
    const fade = Math.min(1, t * 14, (1 - t) * 14);
    puckMats.forEach((m, k) => {
      m.opacity = (k === 3 ? 0.5 : 1) * fade;
    });
    renderer.render(scene, camera);
    // Fade the city in once its first frame is ready.
    if (canvas.style.opacity !== "1") canvas.style.opacity = "1";
  };

  // Compile the shaders off the main path first so the first frames don't stutter.
  renderer.shadowMap.needsUpdate = true;
  let disposed = false;
  renderer
    .compileAsync(scene, camera)
    .catch(() => undefined)
    .then(() => {
      if (disposed) return;
      started = true;
      last = performance.now();
    });
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
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
    env.dispose();
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
      className="fixed inset-0 z-0 h-full w-full opacity-0 transition-opacity duration-[1200ms] ease-out"
    />
  );
}
