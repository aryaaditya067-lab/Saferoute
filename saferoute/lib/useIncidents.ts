"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeError, isAbortError } from "@/lib/errors";
import { fetchIncidents, isCrimeLayerAvailable } from "@/services/incidents";
import type { Incident, MapBounds } from "@/types";

/** Below this zoom the visible area is too large to load reports for. */
export const MIN_INCIDENT_ZOOM = 9;

export interface IncidentLayerState {
  status: "idle" | "loading" | "ready" | "error" | "zoomed-out";
  incidents: Incident[];
  dataAvailable: boolean;
  windowDays: number | null;
  lastUpdatedAt: string | null;
  sourceNote: string | null;
  error: string | null;
}

const INITIAL: IncidentLayerState = {
  status: "idle",
  incidents: [],
  dataAvailable: false,
  windowDays: null,
  lastUpdatedAt: null,
  sourceNote: null,
  error: null,
};

/** Loads reported crimes for the visible map area (debounced, cancellable). */
export function useIncidents() {
  const enabled = isCrimeLayerAvailable();
  const [state, setState] = useState<IncidentLayerState>(INITIAL);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastBounds = useRef<MapBounds | null>(null);

  const load = useCallback((bounds: MapBounds) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState((s) => ({ ...s, status: "loading", error: null }));
    fetchIncidents(bounds, { signal: current.signal })
      .then((response) => {
        if (current.signal.aborted) return;
        setState({
          status: "ready",
          incidents: response.incidents,
          dataAvailable: response.dataAvailable,
          windowDays: response.windowDays,
          lastUpdatedAt: response.lastUpdatedAt,
          sourceNote: response.sourceNote,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (current.signal.aborted || isAbortError(error)) return;
        setState((s) => ({ ...s, status: "error", error: describeError(error) }));
      });
  }, []);

  const onViewChange = useCallback(
    (bounds: MapBounds, zoom: number) => {
      if (!enabled) return;
      if (timer.current) clearTimeout(timer.current);
      lastBounds.current = bounds;
      if (zoom < MIN_INCIDENT_ZOOM) {
        controller.current?.abort();
        setState((s) => ({ ...s, status: "zoomed-out", incidents: [] }));
        return;
      }
      timer.current = setTimeout(() => load(bounds), 400);
    },
    [enabled, load],
  );

  const retry = useCallback(() => {
    if (lastBounds.current) load(lastBounds.current);
  }, [load]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  return { enabled, ...state, onViewChange, retry };
}
