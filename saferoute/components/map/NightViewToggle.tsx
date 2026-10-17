"use client";

import { CircleAlert, Moon } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { Switch } from "./LayerToggle";
import type { NightLightsLayer } from "@/lib/useNightLights";
import { nightLightsYear } from "@/services/nightLights";

/** "Night view" chip: shows how bright each part of the city is at night (NASA satellite). */
export function NightViewToggle({ layer }: { layer: NightLightsLayer }) {
  const year = nightLightsYear(layer.data?.source ?? null);
  const problem = layer.status === "unavailable" || layer.status === "error";
  return (
    <>
      <button
        type="button"
        onClick={layer.toggle}
        aria-pressed={layer.visible}
        title={layer.message ?? "See how bright the city is at night (NASA satellite)"}
        className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-cream"
      >
        <Moon className="size-4 shrink-0 text-ink-soft" aria-hidden="true" />
        <span className="flex-1">Night view</span>
        {layer.status === "loading" && <Spinner className="size-3.5" />}
        {problem && <CircleAlert className="size-3.5 text-danger" aria-hidden="true" />}
        <Switch on={layer.visible} dark />
      </button>
      {problem && layer.message && (
        <p className="mx-1 mb-1 rounded-lg bg-cream px-2.5 py-2 text-xs text-ink-soft">
          {layer.message}
        </p>
      )}
      {layer.visible && (
        <div className="mx-1 mb-1 rounded-lg bg-[#151827] px-3 py-2 text-[11px] leading-snug text-[#c7c9d6]">
          <div
            className="mb-1.5 h-2 rounded-full"
            style={{ background: "linear-gradient(90deg, #1b1e2e, #ff9628 35%, #ffd84a 70%, #fff6e0)" }}
            aria-hidden="true"
          />
          <div className="flex justify-between text-[10px] text-[#8f93a8]">
            <span>Dark</span>
            <span>Bright</span>
          </div>
          <p className="mt-1">
            Night-time light from NASA Black Marble{year ? ` (${year} average)` : ""}, ~500 m squares. Dark patches have
            little light at night.
          </p>
        </div>
      )}
    </>
  );
}
