import * as THREE from "three";
import { CITY_HALF, seeded } from "./builder";

/**
 * Procedural textures for the city, drawn once on canvases: building facades, asphalt,
 * paving, grass, a baked ambient-occlusion map for the ground and small sign boards.
 * Facades are mostly white so each building's vertex colour tints them.
 */

/** A facade texture covers 4 bays by 4 floors, one unit each. */
export const FACADE_TILE = 4;
const S = 512;
const CELL = S / FACADE_TILE;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, anisotropy: number, opts: { repeat?: boolean; srgb?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat ?? true) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (opts.srgb ?? true) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Keeps the bottom-left corner plain wall colour: roofs and untextured parts sample it. */
function plainCorner(ctx: CanvasRenderingContext2D, h: number, color = "#ffffff") {
  ctx.fillStyle = color;
  ctx.fillRect(0, h - 6, 6, 6);
}

/** Glass curtain wall: two panes per bay, light mullions, a spandrel band at each floor. */
function drawGlass(ctx: CanvasRenderingContext2D) {
  const r = seeded(3);
  ctx.fillStyle = "#e6eaee";
  ctx.fillRect(0, 0, S, S);
  for (let row = 0; row < FACADE_TILE; row++) {
    for (let col = 0; col < FACADE_TILE; col++) {
      const x = col * CELL;
      const y = row * CELL;
      ctx.fillStyle = "#a9b7c2";
      ctx.fillRect(x + 3, y + CELL - 22, CELL - 6, 18);
      for (const k of [0, 1]) {
        const pw = (CELL - 9) / 2;
        const px = x + 3 + k * (pw + 3);
        const l = 46 + r() * 16;
        const g = ctx.createLinearGradient(0, y + 3, 0, y + CELL - 24);
        g.addColorStop(0, `hsl(205, 34%, ${l + 14}%)`);
        g.addColorStop(1, `hsl(210, 30%, ${l - 4}%)`);
        ctx.fillStyle = g;
        ctx.fillRect(px, y + 3, pw, CELL - 27);
      }
    }
  }
  // A soft diagonal sky reflection across the whole tile.
  ctx.save();
  ctx.globalAlpha = 0.16;
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0.2, "rgba(255,255,255,0)");
  g.addColorStop(0.45, "rgba(255,255,255,1)");
  g.addColorStop(0.7, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
  plainCorner(ctx, S, "#e6eaee");
}

/** Office block: continuous ribbon windows between light concrete bands. */
function drawOffice(ctx: CanvasRenderingContext2D) {
  const r = seeded(11);
  ctx.fillStyle = "#f4f2ee";
  ctx.fillRect(0, 0, S, S);
  for (let row = 0; row < FACADE_TILE; row++) {
    const y = row * CELL;
    const g = ctx.createLinearGradient(0, y + 20, 0, y + 94);
    g.addColorStop(0, "#7d939c");
    g.addColorStop(1, "#4d626c");
    ctx.fillStyle = g;
    ctx.fillRect(0, y + 20, S, 74);
    // Blinds half drawn in a few bays.
    for (let col = 0; col < FACADE_TILE * 4; col++) {
      if (r() < 0.25) {
        ctx.fillStyle = "rgba(232,228,220,0.55)";
        ctx.fillRect(col * 32 + 2, y + 20, 30, 18 + r() * 30);
      }
    }
    ctx.fillStyle = "#dfe4e6";
    for (let x = 0; x < S; x += 32) ctx.fillRect(x, y + 20, 2, 74);
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(0, y + 94, S, 4);
  }
  plainCorner(ctx, S, "#f4f2ee");
}

/** Apartments: punched windows with frames, sills, grilles, curtains and the odd AC unit. */
function drawResidential(ctx: CanvasRenderingContext2D) {
  const r = seeded(5);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, S, S);
  for (let row = 0; row < FACADE_TILE; row++) {
    for (let col = 0; col < FACADE_TILE; col++) {
      const x = col * CELL;
      const y = row * CELL;
      ctx.fillStyle = "#e7e1d7";
      ctx.fillRect(x, y + CELL - 9, CELL, 9);
      const wx = x + CELL * 0.21;
      const wy = y + CELL * 0.16;
      const ww = CELL * 0.58;
      const wh = CELL * 0.52;
      ctx.fillStyle = "#f8f6f2";
      ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
      g.addColorStop(0, "#6f7d88");
      g.addColorStop(1, "#46535e");
      ctx.fillStyle = g;
      ctx.fillRect(wx, wy, ww, wh);
      const v = r();
      if (v < 0.28) {
        ctx.fillStyle = r() < 0.5 ? "#dcc7a4" : "#c9b8a6";
        ctx.fillRect(wx, wy, ww * (0.35 + r() * 0.3), wh);
      } else if (v < 0.5) {
        ctx.fillStyle = "rgba(40,40,40,0.55)";
        for (let gx = wx + 6; gx < wx + ww; gx += 9) ctx.fillRect(gx, wy, 2, wh);
      }
      ctx.fillStyle = "#f8f6f2";
      ctx.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      ctx.fillStyle = "#d4cdc2";
      ctx.fillRect(wx - 8, wy + wh + 5, ww + 16, 6);
      if (r() < 0.3) {
        ctx.fillStyle = "#e3e4e2";
        ctx.fillRect(x + CELL * 0.62, wy + wh + 14, 30, 20);
        ctx.strokeStyle = "#b5b9bc";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + CELL * 0.62 + 11, wy + wh + 24, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  plainCorner(ctx, S);
}

/** One storey of shopfronts, four bays wide: sign boards over glass fronts or shutters. */
function drawShops(ctx: CanvasRenderingContext2D, h: number) {
  const r = seeded(17);
  const signs = ["#c8553d", "#2f7d6d", "#e0a030", "#3d6fb0", "#9a4f8f", "#1f5f8b", "#d4cfc4", "#b8433a"];
  ctx.fillStyle = "#f1ede6";
  ctx.fillRect(0, 0, S, h);
  for (let col = 0; col < FACADE_TILE; col++) {
    const x = col * CELL;
    ctx.fillStyle = signs[Math.floor(r() * signs.length)]!;
    ctx.fillRect(x + 6, 8, CELL - 12, 30);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    let tx = x + 16;
    while (tx < x + CELL - 26) {
      const tw = 6 + r() * 14;
      ctx.fillRect(tx, 18, tw, 10);
      tx += tw + 4;
    }
    if (r() < 0.3) {
      ctx.fillStyle = "#b9b8b2";
      ctx.fillRect(x + 8, 46, CELL - 16, h - 46);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let sy = 50; sy < h; sy += 6) ctx.fillRect(x + 8, sy, CELL - 16, 1.5);
    } else {
      const g = ctx.createLinearGradient(0, 46, 0, h);
      g.addColorStop(0, "#3f4a52");
      g.addColorStop(1, "#6d6457");
      ctx.fillStyle = g;
      ctx.fillRect(x + 8, 46, CELL - 16, h - 46);
      ctx.fillStyle = "rgba(255,214,150,0.35)";
      ctx.fillRect(x + 20, 70, 30, h - 72);
      ctx.fillRect(x + 66, 60, 40, h - 62);
      ctx.fillStyle = "#e9e5dd";
      ctx.fillRect(x + CELL / 2 - 1.5, 46, 3, h - 46);
    }
    ctx.fillStyle = "#e6e1d8";
    ctx.fillRect(x, 0, 6, h);
    ctx.fillRect(x + CELL - 6, 0, 6, h);
  }
  plainCorner(ctx, h, "#f1ede6");
}

export type FacadeKind = "glass" | "office" | "res" | "shop";

export function facadeTextures(anisotropy: number): Record<FacadeKind, THREE.Texture> {
  const make = (draw: (ctx: CanvasRenderingContext2D) => void, h = S) => {
    const { c, ctx } = canvas(S, h);
    draw(ctx);
    return texture(c, anisotropy);
  };
  return {
    glass: make(drawGlass),
    office: make(drawOffice),
    res: make(drawResidential),
    shop: make((ctx) => drawShops(ctx, 160), 160),
  };
}

/** Light speckled asphalt with a few repair patches; the material colour sets the tone. */
export function asphaltTexture(anisotropy: number) {
  const { c, ctx } = canvas(256, 256);
  const r = seeded(23);
  ctx.fillStyle = "#ececec";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const l = 200 + Math.floor(r() * 55);
    ctx.fillStyle = `rgb(${l},${l},${l})`;
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
    ctx.fillRect(r() * 220, r() * 220, 20 + r() * 40, 12 + r() * 30);
  }
  return texture(c, anisotropy);
}

/** Square paving slabs (0.5 units) with slightly varied tones. */
export function paverTexture(anisotropy: number) {
  const { c, ctx } = canvas(256, 256);
  const r = seeded(29);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const l = 236 + Math.floor(r() * 14);
      ctx.fillStyle = `rgb(${l},${l - 2},${l - 6})`;
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  ctx.fillStyle = "#cfc9bf";
  for (let i = 0; i <= 256; i += 32) {
    ctx.fillRect(i - 1, 0, 2, 256);
    ctx.fillRect(0, i - 1, 256, 2);
  }
  return texture(c, anisotropy);
}

/** Mown grass with darker clumps. */
export function grassTexture(anisotropy: number) {
  const { c, ctx } = canvas(256, 256);
  const r = seeded(31);
  ctx.fillStyle = "#93b46c";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const h = 80 + r() * 25;
    const l = 36 + r() * 18;
    ctx.fillStyle = `hsl(${h}, 35%, ${l}%)`;
    ctx.fillRect(r() * 256, r() * 256, 2, 2 + r() * 3);
  }
  return texture(c, anisotropy);
}

/**
 * Soft contact shadows on the ground round every footprint (and under trees), baked into
 * one greyscale map that the ground materials use as their ambient-occlusion map.
 */
export function groundAoTexture(rects: Array<[number, number, number, number, number]>, circles: Array<[number, number, number, number]>, size: number) {
  const { c, ctx } = canvas(size, size);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const k = size / (2 * CITY_HALF);
  // Draw each shape far off the canvas and let only its blurred shadow land on it.
  const off = size * 4;
  ctx.shadowOffsetX = off;
  ctx.shadowColor = "rgba(0,0,0,1)";
  ctx.fillStyle = "#000000";
  ctx.shadowBlur = 2.4 * k;
  for (const [x, z, w, d, a] of rects) {
    ctx.globalAlpha = a;
    ctx.fillRect((x - w / 2 + CITY_HALF) * k - off, (z - d / 2 + CITY_HALF) * k, w * k, d * k);
  }
  ctx.shadowBlur = 1.6 * k;
  for (const [x, z, rad, a] of circles) {
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc((x + CITY_HALF) * k - off, (z + CITY_HALF) * k, rad * k, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = texture(c, 1, { repeat: false, srgb: false });
  t.flipY = false;
  return t;
}

/** Sign board text on a coloured panel. */
export function signTexture(text: string, bg: string, fg: string, anisotropy: number) {
  const { c, ctx } = canvas(512, 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.font = "700 64px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 68);
  return texture(c, anisotropy, { repeat: false });
}

/** Soft dark ellipse with alpha: the shadow under moving vehicles and people. */
export function blobTexture() {
  const { c, ctx } = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.9)");
  g.addColorStop(0.55, "rgba(0,0,0,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return texture(c, 1, { repeat: false });
}
