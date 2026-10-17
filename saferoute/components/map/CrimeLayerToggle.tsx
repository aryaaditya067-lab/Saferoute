"use client";

import type { IncidentLayerState } from "@/lib/useIncidents";
import { LayerToggle } from "./LayerToggle";

interface CrimeLayerToggleProps {
  layer: IncidentLayerState;
  visible: boolean;
  onToggle: () => void;
  onRetry: () => void;
}

/** Map chip that shows/hides reported crimes and says how many are in view. */
export function CrimeLayerToggle({ layer, visible, onToggle, onRetry }: CrimeLayerToggleProps) {
  return (
    <LayerToggle
      label="Reported crimes"
      shortLabel="Crimes"
      dotClass="bg-[#DC2626]"
      status={layer.status}
      count={layer.incidents.length}
      emptyText={layer.status === "ready" && !layer.dataAvailable ? "None collected yet" : null}
      title={[layer.sourceNote, layer.windowDays ? `Last ${layer.windowDays} days.` : null].filter(Boolean).join(" ") || "Reported crimes"}
      error={layer.error}
      visible={visible}
      onToggle={onToggle}
      onRetry={onRetry}
    />
  );
}
