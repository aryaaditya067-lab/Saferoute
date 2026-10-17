"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeError, isAbortError } from "@/lib/errors";
import { MIN_INCIDENT_ZOOM } from "@/lib/useIncidents";
import { fetchCommunitySpots, isCommunityAvailable } from "@/services/community";
import type { CommunitySpot, MapBounds } from "@/types";

export interface CommunityLayerState {
  status: "idle" | "loading" | "ready" | "error" | "zoomed-out";
  spots: CommunitySpot[];
  confirmThreshold: number | null;
  note: string | null;
  error: string | null;
}

const INITIAL: CommunityLayerState = { status: "idle", spots: [], confirmThreshold: null, note: null, error: null };

/** Community-reported spots for the visible map area (debounced, cancellable). */
export function useCommunitySpots() {
  const enabled = isCommunityAvailable();
  const [state, setState] = useState<CommunityLayerState>(INITIAL);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastBounds = useRef<MapBounds | null>(null);

  const load = useCallback((bounds: MapBounds) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState((s) => ({ ...s, status: "loading", error: null }));
    fetchCommunitySpots(bounds, { signal: current.signal })
      .then((r) => {
        if (current.signal.aborted) return;
        setState({ status: "ready", spots: r.spots, confirmThreshold: r.confirmThreshold, note: r.note, error: null });
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
        setState((s) => ({ ...s, status: "zoomed-out", spots: [] }));
        return;
      }
      timer.current = setTimeout(() => load(bounds), 450);
    },
    [enabled, load],
  );

  const refresh = useCallback(() => {
    if (lastBounds.current) load(lastBounds.current);
  }, [load]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  return { enabled, ...state, onViewChange, refresh };
}
