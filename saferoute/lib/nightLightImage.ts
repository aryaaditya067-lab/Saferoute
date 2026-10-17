import type { NightLightsResponse } from "@/types";

/**
 * Paints the NASA radiance grid as a glowing image (one pixel per ~500 m cell).
 * Brightness uses a log scale up to the city's 98th percentile; empty or very
 * dark cells stay transparent so the darkened map shows through.
 */
export function nightLightImage(data: NightLightsResponse): string | null {
  if (!data.available || data.rows === 0 || data.cols === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = data.cols;
  canvas.height = data.rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(data.cols, data.rows);
  const ref = Math.log1p(Math.max(1, data.brightReference));
  for (let i = 0; i < data.values.length; i++) {
    const v = data.values[i];
    if (v == null || v <= data.darkThreshold) continue;
    const t = Math.min(1, Math.log1p(Math.max(0, v)) / ref);
    if (t < 0.12) continue;
    // amber → yellow → near-white
    const r = 255;
    const g = Math.round(150 + 105 * t);
    const b = Math.round(40 + 200 * Math.max(0, t - 0.6) / 0.4);
    const o = i * 4;
    image.data[o] = r;
    image.data[o + 1] = g;
    image.data[o + 2] = Math.min(255, b);
    image.data[o + 3] = Math.round(255 * Math.min(0.9, 0.1 + 0.85 * t * t));
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
